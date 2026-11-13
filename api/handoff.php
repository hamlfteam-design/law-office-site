<?php
/**
 * طابور التسليم بين مساعدي المكتب (Claude) — «غرفة العمليات» في تطبيق hamlf.
 *
 * البطاقات في Firestore: offices/{office}/records/handoffs/items/{id}
 * بنفس صيغة CloudStore.collection في التطبيق (حقل json + owner + updatedAt)،
 * فشاشة 78-ops-room في التطبيق بتقراها وتعدّلها مباشرة.
 *
 * كل الطلبات بتوكن المساعدين في هيدر X-Agent-Token (أو Authorization: Bearer):
 *   GET  ?action=list[&to=…][&status=new,doing][&since=ISO]   ← البطاقات
 *   GET  ?action=get&id=…
 *   POST ?action=create  {by, to, type, title, ref?, details?, links?, due?, prio?, needsApproval?}
 *   POST ?action=update  {id, by, status?, to?, note?}
 *
 * قواعد المساعدين (الإدارة بتقرر من التطبيق بس):
 * - مفيش مسح. ومفيش تعديل على بطاقة «بانتظار موافقة الإدارة» أو «تمت».
 * - بطاقة needsApproval مايتقفلش «تمت» من مساعد — بتروح «wait» والإدارة توافق.
 * - التحويل لمساعد تاني (to) بيرجّع البطاقة «جديدة» عند المستلم.
 * - كل تعديل بشرط إن البطاقة ماتغيّرتش من وقت قرايتها (updateTime) — مفيش تعديل يمسح تعديل.
 *
 * الأسرار (مفتاح الخدمة والتوكن) في handoff-config.php خارج public_html.
 * مفيش أسماء موكلين في عنوان البطاقة — المرجع رقم ملف/قضية.
 */

declare(strict_types=1);
// متوافق مع PHP 7.4 وأحدث

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');

date_default_timezone_set('Africa/Cairo');

const AGENTS = ['coordinator', 'communications', 'content-writer', 'publishing-manager', 'admin-assistant',
    'finance-assistant', 'legal-counsel', 'tech-assistant', 'hamlf-screen-builder'];
const RECIPIENTS = ['coordinator', 'communications', 'content-writer', 'publishing-manager', 'admin-assistant',
    'finance-assistant', 'legal-counsel', 'tech-assistant', 'hamlf-screen-builder', 'management'];
const TYPES = ['consult', 'article', 'publish', 'appt', 'expense', 'report', 'doc', 'tech', 'other'];
const PRIOS = ['عاجل', 'عالي', 'عادي', 'منخفض'];
const STATUSES = ['new', 'doing', 'wait', 'done'];
const COLL = 'handoffs';

/* ---------- أدوات عامة ---------- */

function out(array $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(int $code, string $error, string $detail = ''): void {
    $o = ['ok' => false, 'error' => $error];
    if ($detail !== '') $o['detail'] = $detail;
    out($o, $code);
}

function cfg(): array {
    static $cfg = null;
    if ($cfg !== null) return $cfg;
    $path = getenv('HAMLF_HANDOFF_CONFIG') ?: dirname($_SERVER['DOCUMENT_ROOT'] ?? __DIR__ . '/..') . '/handoff-config.php';
    if (!is_file($path)) fail(500, 'config_missing');
    $cfg = require $path;
    foreach (['service_account_file', 'project_id', 'office_id', 'agent_token'] as $k) {
        if (empty($cfg[$k]) || strpos((string) $cfg[$k], 'CHANGE_ME') === 0) fail(500, 'config_incomplete');
    }
    if (strlen((string) $cfg['agent_token']) < 32) fail(500, 'config_incomplete');
    if (!is_file((string) $cfg['service_account_file'])) fail(500, 'service_account_missing');
    $cfg['token_cache'] = $cfg['token_cache'] ?? dirname($path) . '/handoff-token.json';
    $cfg['rate_file'] = $cfg['rate_file'] ?? dirname($path) . '/handoff-rate.json';
    $cfg['firestore_base'] = rtrim($cfg['firestore_base'] ?? 'https://firestore.googleapis.com/v1', '/');
    return $cfg;
}

function input(): array {
    $raw = file_get_contents('php://input') ?: '';
    $json = json_decode($raw, true);
    return is_array($json) ? $json : [];
}

function str_field(array $in, string $k, int $max, bool $required = false): string {
    $v = trim((string) ($in[$k] ?? ''));
    if ($required && $v === '') fail(422, 'missing_' . $k);
    if (function_exists('mb_strlen') ? mb_strlen($v) > $max : strlen($v) > $max) fail(422, 'too_long_' . $k);
    return $v;
}

function now_iso(): string {
    return gmdate('Y-m-d\TH:i:s\Z');
}

/* ---------- الصلاحية والحد ---------- */

function require_agent(): void {
    $token = (string) cfg()['agent_token'];
    $given = (string) ($_SERVER['HTTP_X_AGENT_TOKEN'] ?? '');
    if ($given === '') {
        $h = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
        if (substr($h, 0, 7) === 'Bearer ') $given = substr($h, 7);
    }
    if ($given === '' || !hash_equals($token, $given)) {
        usleep(500000);
        fail(401, 'unauthorized');
    }
}

/** حد بسيط: ١٢٠ طلب في الدقيقة — حماية لحصة فيربيز اليومية لو مساعد دخل في لفّة. */
function rate_limit(): void {
    $file = cfg()['rate_file'];
    $fh = @fopen($file, 'c+');
    if (!$fh) return;
    flock($fh, LOCK_EX);
    $s = json_decode((string) stream_get_contents($fh), true) ?: [];
    $min = (int) floor(time() / 60);
    if (($s['m'] ?? 0) !== $min) $s = ['m' => $min, 'n' => 0];
    $s['n']++;
    ftruncate($fh, 0); rewind($fh); fwrite($fh, json_encode($s)); fflush($fh);
    flock($fh, LOCK_UN); fclose($fh);
    if ($s['n'] > 120) fail(429, 'rate_limited');
}

/* ---------- Google OAuth (مفتاح الخدمة) ---------- */

function b64url(string $s): string {
    return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
}

function access_token(): string {
    $c = cfg();
    $cache = @json_decode((string) @file_get_contents($c['token_cache']), true);
    if (is_array($cache) && !empty($cache['token']) && ($cache['exp'] ?? 0) > time() + 120) return (string) $cache['token'];

    $sa = json_decode((string) file_get_contents($c['service_account_file']), true);
    if (!is_array($sa) || empty($sa['client_email']) || empty($sa['private_key'])) fail(500, 'service_account_invalid');
    $tokenUri = (string) ($sa['token_uri'] ?? 'https://oauth2.googleapis.com/token');
    $now = time();
    $jwt = b64url(json_encode(['alg' => 'RS256', 'typ' => 'JWT'])) . '.' . b64url(json_encode([
        'iss' => $sa['client_email'],
        'scope' => 'https://www.googleapis.com/auth/datastore',
        'aud' => $tokenUri,
        'iat' => $now,
        'exp' => $now + 3600,
    ]));
    $sig = '';
    if (!openssl_sign($jwt, $sig, (string) $sa['private_key'], 'sha256WithRSAEncryption')) fail(500, 'sign_failed');
    $jwt .= '.' . b64url($sig);

    $r = http('POST', $tokenUri, http_build_query([
        'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        'assertion' => $jwt,
    ]), ['Content-Type: application/x-www-form-urlencoded'], false);
    $tok = (string) ($r['json']['access_token'] ?? '');
    if ($tok === '') fail(502, 'google_auth_failed');
    @file_put_contents($c['token_cache'], json_encode(['token' => $tok, 'exp' => $now + (int) ($r['json']['expires_in'] ?? 3600)]), LOCK_EX);
    @chmod($c['token_cache'], 0600);
    return $tok;
}

function http(string $method, string $url, ?string $body, array $headers, bool $auth = true): array {
    if ($auth) $headers[] = 'Authorization: Bearer ' . access_token();
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_HTTPHEADER => $headers,
    ]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    $res = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['code' => $res === false ? 0 : $code, 'json' => json_decode((string) $res, true) ?: [], 'raw' => (string) $res];
}

/* ---------- Firestore ---------- */

function items_url(): string {
    $c = cfg();
    return $c['firestore_base'] . '/projects/' . rawurlencode($c['project_id']) . '/databases/(default)/documents/offices/'
        . rawurlencode($c['office_id']) . '/records/' . COLL . '/items';
}

function doc_to_card(array $doc): ?array {
    $f = $doc['fields'] ?? [];
    $card = json_decode((string) ($f['json']['stringValue'] ?? ''), true);
    if (!is_array($card) || empty($card['id'])) return null;
    $card['_updateTime'] = $doc['updateTime'] ?? null;
    return $card;
}

function card_to_fields(array $card): string {
    unset($card['_updateTime']);
    foreach (array_keys($card) as $k) if (strpos((string) $k, '__') === 0) unset($card[$k]);
    return json_encode(['fields' => [
        'json' => ['stringValue' => json_encode($card, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)],
        'owner' => ['stringValue' => ''],
        'updatedAt' => ['timestampValue' => now_iso()],
    ]], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function fs_list(?string $since): array {
    $cards = [];
    if ($since !== null) {
        // اللي اتغيّر بعد since بس — قراءة لكل بطاقة راجعة (أوفر لحصة فيربيز)
        $base = dirname(items_url());
        $q = ['structuredQuery' => ['from' => [['collectionId' => 'items']], 'where' => ['fieldFilter' => [
            'field' => ['fieldPath' => 'updatedAt'], 'op' => 'GREATER_THAN', 'value' => ['timestampValue' => $since]]]]];
        $r = http('POST', $base . ':runQuery', json_encode($q), ['Content-Type: application/json']);
        if ($r['code'] !== 200) fail(502, 'firestore_error');
        foreach ((array) $r['json'] as $row) {
            if (!empty($row['document']) && ($c = doc_to_card($row['document']))) $cards[] = $c;
        }
        return $cards;
    }
    $token = null;
    do {
        $url = items_url() . '?pageSize=300' . ($token ? '&pageToken=' . rawurlencode($token) : '');
        $r = http('GET', $url, null, []);
        if ($r['code'] !== 200) fail(502, 'firestore_error');
        foreach (($r['json']['documents'] ?? []) as $doc) if ($c = doc_to_card($doc)) $cards[] = $c;
        $token = $r['json']['nextPageToken'] ?? null;
    } while ($token);
    return $cards;
}

function fs_get(string $id): array {
    $r = http('GET', items_url() . '/' . rawurlencode($id), null, []);
    if ($r['code'] === 404) fail(404, 'not_found');
    if ($r['code'] !== 200) fail(502, 'firestore_error');
    $c = doc_to_card($r['json']);
    if (!$c) fail(404, 'not_found');
    return $c;
}

/** $updateTime = null → إنشاء (لازم مايكونش موجود)؛ غير كده → تعديل بشرط إنه ماتغيّرش */
function fs_put(array $card, ?string $updateTime): array {
    $mask = 'updateMask.fieldPaths=json&updateMask.fieldPaths=owner&updateMask.fieldPaths=updatedAt';
    $pre = $updateTime === null ? 'currentDocument.exists=false' : 'currentDocument.updateTime=' . rawurlencode($updateTime);
    $r = http('PATCH', items_url() . '/' . rawurlencode((string) $card['id']) . '?' . $mask . '&' . $pre,
        card_to_fields($card), ['Content-Type: application/json']);
    if ($r['code'] === 200) {
        $card['_updateTime'] = $r['json']['updateTime'] ?? null;
        return $card;
    }
    if (preg_match('/FAILED_PRECONDITION|ALREADY_EXISTS|NOT_FOUND/', $r['raw'])) fail(409, 'conflict', 'البطاقة اتعدّلت — اقراها تاني وجرّب');
    fail(502, 'firestore_error');
    return [];
}

/* ---------- قواعد البطاقة ---------- */

function public_card(array $c): array {
    unset($c['_updateTime']);
    return $c;
}

function log_line(string $by, string $text): array {
    return ['at' => now_iso(), 'by' => $by, 'text' => $text];
}

/* ---------- المسارات ---------- */

require_agent();
rate_limit();

$action = (string) ($_GET['action'] ?? '');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

switch ($action) {

    case 'list': {
        $since = null;
        if (!empty($_GET['since'])) {
            $t = strtotime((string) $_GET['since']);
            if ($t === false) fail(422, 'bad_since');
            $since = gmdate('Y-m-d\TH:i:s\Z', $t);
        }
        $cards = fs_list($since);
        $to = (string) ($_GET['to'] ?? '');
        $st = array_filter(explode(',', (string) ($_GET['status'] ?? '')));
        $cards = array_values(array_filter($cards, function ($c) use ($to, $st) {
            if ($to !== '' && ($c['to'] ?? '') !== $to) return false;
            if ($st && !in_array($c['status'] ?? '', $st, true)) return false;
            return true;
        }));
        usort($cards, function ($a, $b) { return strcmp((string) ($a['due'] ?? '9'), (string) ($b['due'] ?? '9')); });
        out(['ok' => true, 'count' => count($cards), 'cards' => array_map('public_card', $cards)]);
    }

    case 'get': {
        $id = (string) ($_GET['id'] ?? '');
        if (!preg_match('/^h-[a-z0-9-]{8,40}$/', $id)) fail(422, 'bad_id');
        out(['ok' => true, 'card' => public_card(fs_get($id))]);
    }

    case 'create': {
        if ($method !== 'POST') fail(405, 'method');
        $in = input();
        $by = (string) ($in['by'] ?? '');
        if (!in_array($by, AGENTS, true)) fail(422, 'bad_by');
        $to = (string) ($in['to'] ?? '');
        if (!in_array($to, RECIPIENTS, true)) fail(422, 'bad_to');
        $type = (string) ($in['type'] ?? 'other');
        if (!in_array($type, TYPES, true)) fail(422, 'bad_type');
        $prio = (string) ($in['prio'] ?? 'عادي');
        if (!in_array($prio, PRIOS, true)) fail(422, 'bad_prio');
        $due = (string) ($in['due'] ?? '');
        if ($due !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $due)) fail(422, 'bad_due');
        $links = [];
        foreach ((array) ($in['links'] ?? []) as $u) {
            $u = trim((string) $u);
            if ($u === '') continue;
            if (!preg_match('#^https://#i', $u) || strlen($u) > 500) fail(422, 'bad_link');
            $links[] = $u;
        }
        if (count($links) > 10) fail(422, 'too_many_links');
        $needs = !empty($in['needsApproval']);
        $now = now_iso();
        $card = [
            'id' => 'h-' . gmdate('Ymd') . '-' . bin2hex(random_bytes(5)),
            'from' => $by,
            'to' => $to,
            'type' => $type,
            'ref' => str_field($in, 'ref', 120),
            'title' => str_field($in, 'title', 200, true),
            'details' => str_field($in, 'details', 4000),
            'links' => $links,
            'due' => $due,
            'prio' => $prio,
            'needsApproval' => $needs,
            // للإدارة + محتاجة موافقة = «بانتظار موافقتك» على طول
            'status' => ($to === 'management' && $needs) ? 'wait' : 'new',
            'createdAt' => $now,
            'updatedAt' => $now,
            'createdBy' => $by,
            'log' => [log_line($by, 'أنشأ البطاقة')],
        ];
        out(['ok' => true, 'card' => public_card(fs_put($card, null))], 201);
    }

    case 'update': {
        if ($method !== 'POST') fail(405, 'method');
        $in = input();
        $by = (string) ($in['by'] ?? '');
        if (!in_array($by, AGENTS, true)) fail(422, 'bad_by');
        $id = (string) ($in['id'] ?? '');
        if (!preg_match('/^h-[a-z0-9-]{8,40}$/', $id)) fail(422, 'bad_id');
        $card = fs_get($id);
        $ut = (string) $card['_updateTime'];

        $cur = (string) ($card['status'] ?? 'new');
        if ($cur === 'wait') fail(409, 'awaiting_management', 'البطاقة مستنية قرار الإدارة');
        if ($cur === 'done') fail(409, 'already_done');

        $changed = false;
        $note = str_field($in, 'note', 1000);
        $to = (string) ($in['to'] ?? '');
        $status = (string) ($in['status'] ?? '');

        if ($to !== '') {
            if (!in_array($to, RECIPIENTS, true)) fail(422, 'bad_to');
            $card['from'] = $by;
            $card['to'] = $to;
            $card['status'] = ($to === 'management' && !empty($card['needsApproval'])) ? 'wait' : 'new';
            $card['log'][] = log_line($by, 'سلّمها لـ' . $to . ($note !== '' ? ': ' . $note : ''));
            $changed = true;
        } elseif ($status !== '') {
            if (!in_array($status, STATUSES, true)) fail(422, 'bad_status');
            if ($status === 'done' && !empty($card['needsApproval'])) $status = 'wait';   // الموافقة للإدارة بس
            if ($status === 'wait') {
                // بتروح للإدارة، ولو اترفضت ترجع للي عمل الشغل (مش للي فتح البطاقة)
                $card['from'] = $by;
                $card['to'] = 'management';
            }
            $card['status'] = $status;
            $labels = ['new' => 'جديدة', 'doing' => 'جاري', 'wait' => 'بانتظار موافقة الإدارة', 'done' => 'تمت'];
            $card['log'][] = log_line($by, 'غيّر الحالة: ' . $labels[$status] . ($note !== '' ? ' — ' . $note : ''));
            if ($status === 'done') $card['doneAt'] = now_iso();
            $changed = true;
        } elseif ($note !== '') {
            $card['log'][] = log_line($by, $note);
            $changed = true;
        }
        if (!$changed) fail(422, 'nothing_to_update');
        if (count($card['log']) > 200) $card['log'] = array_slice($card['log'], -200);
        $card['updatedAt'] = now_iso();
        out(['ok' => true, 'card' => public_card(fs_put($card, $ut))]);
    }

    default:
        fail(404, 'unknown_action');
}
