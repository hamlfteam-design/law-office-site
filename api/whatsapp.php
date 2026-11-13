<?php
/**
 * واتساب المكتب — WhatsApp Business Cloud API (Meta).
 *
 * المسارات:
 *   GET  api/whatsapp.php?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…  ← تأكيد الـWebhook من Meta
 *   POST api/whatsapp.php                         ← Webhook: رسايل واردة + حالات التسليم (موقّع X-Hub-Signature-256)
 *
 *   صفحة الإدارة (whatsapp/admin.html) — جلسة بكلمة سر:
 *   POST ?action=login | logout     GET ?action=me
 *   GET  ?action=inbox[&status=…][&needs_triage=1]
 *   GET  ?action=thread&wa=2010…
 *   POST ?action=send      {wa, body, draft_id?}   ← الإرسال الفعلى — الإدارة بس
 *   POST ?action=discard   {draft_id}
 *   POST ?action=status    {wa, status}           ← open | closed
 *   GET  ?action=media&id=…                        ← تحميل صورة/مستند من Meta
 *
 *   مساعد التواصل (Claude) — Authorization: Bearer <agent_token>:
 *   inbox / thread (قراءة)، triage {wa, category, route_to, summary}، draft {wa, body, drafted_by}
 *   المساعد «مابيبعتش» أبداً: بيكتب مسودة، والإدارة بتراجع وتبعت من صفحة الإدارة.
 *
 * قواعد الأمان:
 * - كل الأسرار في whatsapp-config.php خارج public_html (شوف whatsapp-config.example.php).
 * - الـWebhook مابيتقبلش غير بتوقيع Meta الصحيح (HMAC-SHA256 بالـApp secret).
 * - الرسايل في whatsapp.sqlite جنب ملف الإعدادات (برضه خارج public_html).
 * - الرد الحر مسموح بس خلال ٢٤ ساعة من آخر رسالة العميل (قاعدة Meta)؛ بعدها قوالب معتمدة.
 */

declare(strict_types=1);
// متوافق مع PHP 7.4 وأحدث

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');

date_default_timezone_set('Africa/Cairo');

const FREE_REPLY_WINDOW = 24 * 3600;
const MAX_BODY = 4096;                       // حد Meta لنص الرسالة
const CATEGORIES = ['inquiry', 'appointment', 'consultation', 'case_update', 'complaint', 'other'];
const ROUTES = ['communications', 'legal-counsel', 'admin-assistant', 'finance-assistant', 'management'];
const DELIVERY_RANK = ['sent' => 1, 'delivered' => 2, 'read' => 3];

/* ---------- أدوات عامة ---------- */

function cfg(): array {
    static $cfg = null;
    if ($cfg !== null) return $cfg;
    $path = getenv('HAMLF_WHATSAPP_CONFIG') ?: dirname($_SERVER['DOCUMENT_ROOT'] ?? __DIR__ . '/..') . '/whatsapp-config.php';
    if (!is_file($path)) fail(500, 'config_missing');
    $cfg = require $path;
    foreach (['verify_token', 'app_secret', 'access_token', 'phone_number_id', 'admin_password'] as $k) {
        if (empty($cfg[$k]) || strpos((string) $cfg[$k], 'PASTE_') === 0 || strpos((string) $cfg[$k], 'CHANGE_ME') === 0) {
            fail(500, 'config_incomplete');
        }
    }
    $cfg['db_file'] = $cfg['db_file'] ?? dirname($path) . '/whatsapp.sqlite';
    $cfg['graph_version'] = $cfg['graph_version'] ?? 'v21.0';
    return $cfg;
}

function out(array $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(int $code, string $error): void {
    out(['ok' => false, 'error' => $error], $code);
}

function input(): array {
    $raw = file_get_contents('php://input') ?: '';
    $json = json_decode($raw, true);
    return is_array($json) ? $json : $_POST;
}

function starts_with(string $s, string $prefix): bool {
    return substr($s, 0, strlen($prefix)) === $prefix;
}

function clean_wa(string $wa): string {
    $digits = preg_replace('/\D/', '', $wa) ?? '';
    if (strlen($digits) < 8 || strlen($digits) > 15) fail(422, 'bad_wa');
    return $digits;
}

function clean_text($s, int $max): string {
    $s = trim((string) $s);
    if (function_exists('mb_substr')) return mb_substr($s, 0, $max);
    return substr($s, 0, $max);
}

/* ---------- قاعدة البيانات (SQLite) ---------- */

function db(): PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;
    $pdo = new PDO('sqlite:' . cfg()['db_file'], null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec('PRAGMA busy_timeout = 5000');
    $pdo->exec('PRAGMA journal_mode = WAL');
    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->exec('CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wa_id TEXT NOT NULL UNIQUE,
        contact_name TEXT,
        status TEXT NOT NULL DEFAULT \'open\',
        category TEXT,
        route_to TEXT,
        summary TEXT,
        unread INTEGER NOT NULL DEFAULT 0,
        last_message_at INTEGER,
        last_inbound_at INTEGER,
        triaged_at INTEGER,
        created_at INTEGER NOT NULL
    )');
    $pdo->exec('CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        wa_message_id TEXT UNIQUE,
        direction TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT \'text\',
        body TEXT,
        media_id TEXT,
        media_mime TEXT,
        filename TEXT,
        status TEXT NOT NULL,
        error TEXT,
        drafted_by TEXT,
        sent_by TEXT,
        created_at INTEGER NOT NULL,
        sent_at INTEGER
    )');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_conv_last ON conversations(last_message_at)');
    return $pdo;
}

function conversation(string $wa): ?array {
    $st = db()->prepare('SELECT * FROM conversations WHERE wa_id = ?');
    $st->execute([$wa]);
    $row = $st->fetch();
    return $row ?: null;
}

function conversation_or_404(string $wa): array {
    $c = conversation($wa);
    if (!$c) fail(404, 'not_found');
    return $c;
}

function window_open(array $c): bool {
    return !empty($c['last_inbound_at']) && (time() - (int) $c['last_inbound_at']) < FREE_REPLY_WINDOW;
}

function public_conversation(array $c): array {
    $st = db()->prepare('SELECT COUNT(*) FROM messages WHERE conversation_id = ? AND status = \'draft\'');
    $st->execute([$c['id']]);
    $last = db()->prepare('SELECT direction, type, body, status, created_at FROM messages
                           WHERE conversation_id = ? AND status != \'discarded\' ORDER BY id DESC LIMIT 1');
    $last->execute([$c['id']]);
    return [
        'wa' => $c['wa_id'],
        'name' => $c['contact_name'],
        'status' => $c['status'],
        'category' => $c['category'],
        'route_to' => $c['route_to'],
        'summary' => $c['summary'],
        'unread' => (int) $c['unread'],
        'drafts' => (int) $st->fetchColumn(),
        'last_message_at' => $c['last_message_at'] ? (int) $c['last_message_at'] : null,
        'last_inbound_at' => $c['last_inbound_at'] ? (int) $c['last_inbound_at'] : null,
        'triaged_at' => $c['triaged_at'] ? (int) $c['triaged_at'] : null,
        'window_open' => window_open($c),
        'last' => $last->fetch() ?: null,
    ];
}

/** بعد أى إرسال/إلغاء: لو مفيش مسودات تانية المحادثة ترجع «مفتوحة» */
function refresh_draft_status(int $convId): void {
    $st = db()->prepare('SELECT COUNT(*) FROM messages WHERE conversation_id = ? AND status = \'draft\'');
    $st->execute([$convId]);
    if ((int) $st->fetchColumn() === 0) {
        db()->prepare('UPDATE conversations SET status = \'open\' WHERE id = ? AND status = \'awaiting_approval\'')->execute([$convId]);
    }
}

/* ---------- Meta Graph API ---------- */

function graph(string $method, string $url, ?array $body = null, bool $raw = false) {
    $ch = curl_init($url);
    $headers = ['Authorization: Bearer ' . cfg()['access_token']];
    if ($body !== null) $headers[] = 'Content-Type: application/json';
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_HTTPHEADER => $headers,
    ]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE));
    $res = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $ctype = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($raw) return ['code' => $code, 'body' => $res === false ? '' : $res, 'type' => $ctype];
    $json = json_decode((string) $res, true) ?: [];
    return ['code' => $res === false ? 0 : $code, 'json' => $json, 'curl_error' => $err];
}

/** يبعت نص ويرجّع [wamid, null] أو [null, رسالة الخطأ] */
function send_text(string $to, string $body): array {
    $url = 'https://graph.facebook.com/' . cfg()['graph_version'] . '/' . cfg()['phone_number_id'] . '/messages';
    $r = graph('POST', $url, [
        'messaging_product' => 'whatsapp',
        'recipient_type' => 'individual',
        'to' => $to,
        'type' => 'text',
        'text' => ['preview_url' => false, 'body' => $body],
    ]);
    $id = $r['json']['messages'][0]['id'] ?? null;
    if ($r['code'] >= 200 && $r['code'] < 300 && $id) return [$id, null];
    $error = $r['json']['error']['error_data']['details']
        ?? $r['json']['error']['message']
        ?? ($r['curl_error'] ?: ('HTTP ' . $r['code']));
    return [null, (string) $error];
}

/* ---------- الصلاحيات ---------- */

function start_session(): void {
    session_name('hamlf_wa');
    session_set_cookie_params(['httponly' => true, 'samesite' => 'Strict', 'secure' => !empty($_SERVER['HTTPS'])]);
    session_start();
}

function is_admin(): bool {
    start_session();
    return !empty($_SESSION['wa_admin']);
}

function is_agent(): bool {
    $token = (string) (cfg()['agent_token'] ?? '');
    if ($token === '' || strlen($token) < 24) return false;   // توكن قصير = مش مفعّل
    // بعض استضافات Apache/LiteSpeed بتشيل هيدر Authorization، فبنقبل X-Agent-Token كمان
    $alt = (string) ($_SERVER['HTTP_X_AGENT_TOKEN'] ?? '');
    if ($alt !== '') return hash_equals($token, $alt);
    $h = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    return starts_with($h, 'Bearer ') && hash_equals($token, substr($h, 7));
}

/** يرجّع 'admin' أو 'agent' أو يرفض */
function require_role(bool $agentAllowed): string {
    if ($agentAllowed && is_agent()) return 'agent';
    if (is_admin()) return 'admin';
    fail(401, 'unauthorized');
    return '';
}

function require_post(): void {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') fail(405, 'method');
}

/* ---------- الـWebhook ---------- */

function verify_webhook(): void {
    // PHP بيحوّل النقط فى أسماء الـquery لشرطة سفلية: hub.mode ← hub_mode
    $mode = $_GET['hub_mode'] ?? '';
    $token = (string) ($_GET['hub_verify_token'] ?? '');
    $challenge = (string) ($_GET['hub_challenge'] ?? '');
    if ($mode === 'subscribe' && hash_equals((string) cfg()['verify_token'], $token)) {
        header('Content-Type: text/plain; charset=utf-8');
        http_response_code(200);
        echo $challenge;
        exit;
    }
    fail(403, 'verify_failed');
}

/** نص الرسالة الواردة حسب نوعها: [type, body, media_id, mime, filename] */
function parse_message(array $m): array {
    $type = (string) ($m['type'] ?? 'unknown');
    switch ($type) {
        case 'text':
            return ['text', (string) ($m['text']['body'] ?? ''), null, null, null];
        case 'image': case 'video': case 'audio': case 'document': case 'sticker':
            $media = $m[$type] ?? [];
            return [$type, (string) ($media['caption'] ?? ''), $media['id'] ?? null, $media['mime_type'] ?? null, $media['filename'] ?? null];
        case 'location':
            $l = $m['location'] ?? [];
            $parts = array_filter([$l['name'] ?? '', $l['address'] ?? '', (isset($l['latitude'], $l['longitude']) ? $l['latitude'] . ',' . $l['longitude'] : '')]);
            return ['location', implode(' — ', $parts), null, null, null];
        case 'contacts':
            $names = [];
            foreach (($m['contacts'] ?? []) as $c) {
                $phone = $c['phones'][0]['phone'] ?? '';
                $names[] = trim(($c['name']['formatted_name'] ?? '') . ' ' . $phone);
            }
            return ['contacts', implode("\n", $names), null, null, null];
        case 'button':
            return ['text', (string) ($m['button']['text'] ?? ''), null, null, null];
        case 'interactive':
            $i = $m['interactive'] ?? [];
            $title = $i['button_reply']['title'] ?? $i['list_reply']['title'] ?? '';
            return ['text', (string) $title, null, null, null];
        case 'reaction':
            return ['reaction', (string) ($m['reaction']['emoji'] ?? ''), null, null, null];
        default:
            return [$type, '', null, null, null];
    }
}

function notify_new_message(string $wa, ?string $name): void {
    $to = (string) (cfg()['notify_email'] ?? '');
    if ($to === '') return;
    // من غير محتوى الرسالة: الإيميل مش مكان بيانات الموكلين
    $lines = [
        'رسالة واتساب جديدة على رقم المكتب.',
        'من: ' . ($name ?: 'بدون اسم') . ' (+' . $wa . ')',
        '',
        'افتح صندوق الوارد: https://hamlf.com/whatsapp/admin.html',
    ];
    $subject = '=?UTF-8?B?' . base64_encode('واتساب: رسالة جديدة') . '?=';
    $headers = "MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nFrom: hamlf.com <info@hamlf.com>\r\n";
    @mail($to, $subject, implode("\n", $lines), $headers);
}

function handle_webhook(): void {
    $raw = file_get_contents('php://input') ?: '';
    $sig = (string) ($_SERVER['HTTP_X_HUB_SIGNATURE_256'] ?? '');
    $expected = 'sha256=' . hash_hmac('sha256', $raw, (string) cfg()['app_secret']);
    if ($sig === '' || !hash_equals($expected, $sig)) fail(403, 'bad_signature');

    $payload = json_decode($raw, true);
    if (!is_array($payload) || ($payload['object'] ?? '') !== 'whatsapp_business_account') {
        out(['ok' => true, 'ignored' => true]);
    }

    $pdo = db();
    $notify = [];

    foreach (($payload['entry'] ?? []) as $entry) {
        foreach (($entry['changes'] ?? []) as $change) {
            if (($change['field'] ?? '') !== 'messages') continue;
            $value = $change['value'] ?? [];
            // رقم تانى على نفس الحساب؟ مش بتاعنا
            if ((string) ($value['metadata']['phone_number_id'] ?? '') !== (string) cfg()['phone_number_id']) continue;

            $names = [];
            foreach (($value['contacts'] ?? []) as $c) {
                if (!empty($c['wa_id'])) $names[(string) $c['wa_id']] = (string) ($c['profile']['name'] ?? '');
            }

            foreach (($value['messages'] ?? []) as $m) {
                $wa = preg_replace('/\D/', '', (string) ($m['from'] ?? '')) ?? '';
                $wamid = (string) ($m['id'] ?? '');
                if ($wa === '' || $wamid === '') continue;
                $ts = (int) ($m['timestamp'] ?? time()) ?: time();
                [$type, $body, $mediaId, $mime, $filename] = parse_message($m);
                $name = $names[$wa] ?? null;

                $pdo->beginTransaction();
                try {
                    $c = conversation($wa);
                    if (!$c) {
                        $pdo->prepare('INSERT INTO conversations (wa_id, contact_name, status, unread, created_at) VALUES (?, ?, \'open\', 0, ?)')
                            ->execute([$wa, $name, time()]);
                        $c = conversation($wa);
                    }
                    $ins = $pdo->prepare('INSERT OR IGNORE INTO messages
                        (conversation_id, wa_message_id, direction, type, body, media_id, media_mime, filename, status, created_at)
                        VALUES (?, ?, \'in\', ?, ?, ?, ?, ?, \'received\', ?)');
                    $ins->execute([$c['id'], $wamid, $type, $body, $mediaId, $mime, $filename, $ts]);
                    if ($ins->rowCount() > 0) {   // مش رسالة مكررة من Meta
                        if ((int) $c['unread'] === 0) $notify[$wa] = $name ?: $c['contact_name'];
                        $pdo->prepare('UPDATE conversations SET
                                contact_name = COALESCE(?, contact_name),
                                unread = unread + 1,
                                last_message_at = MAX(COALESCE(last_message_at, 0), ?),
                                last_inbound_at = MAX(COALESCE(last_inbound_at, 0), ?),
                                status = CASE WHEN status = \'closed\' THEN \'open\' ELSE status END
                            WHERE id = ?')
                            ->execute([$name ?: null, $ts, $ts, $c['id']]);
                    }
                    $pdo->commit();
                } catch (Throwable $e) {
                    $pdo->rollBack();
                    throw $e;
                }
            }

            foreach (($value['statuses'] ?? []) as $s) {
                $wamid = (string) ($s['id'] ?? '');
                $status = (string) ($s['status'] ?? '');
                if ($wamid === '') continue;
                $st = $pdo->prepare('SELECT id, status FROM messages WHERE wa_message_id = ? AND direction = \'out\'');
                $st->execute([$wamid]);
                $msg = $st->fetch();
                if (!$msg) continue;
                if ($status === 'failed') {
                    $err = $s['errors'][0]['error_data']['details'] ?? $s['errors'][0]['title'] ?? 'failed';
                    $pdo->prepare('UPDATE messages SET status = \'failed\', error = ? WHERE id = ?')->execute([(string) $err, $msg['id']]);
                } elseif (isset(DELIVERY_RANK[$status]) && DELIVERY_RANK[$status] > (DELIVERY_RANK[$msg['status']] ?? 0)) {
                    // مانرجعش من «اتقرت» لـ«اتسلمت» لو الإشعارات وصلت بترتيب مختلف
                    $pdo->prepare('UPDATE messages SET status = ? WHERE id = ?')->execute([$status, $msg['id']]);
                }
            }
        }
    }

    foreach ($notify as $wa => $name) notify_new_message((string) $wa, $name);
    out(['ok' => true]);
}

/* ---------- المسارات ---------- */

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($action === '') {
    if ($method === 'GET') verify_webhook();
    if ($method === 'POST') handle_webhook();
    fail(405, 'method');
}

switch ($action) {

    case 'login': {
        require_post();
        start_session();
        $pw = (string) (input()['password'] ?? '');
        if (!hash_equals((string) cfg()['admin_password'], $pw)) {
            usleep(800000);
            fail(401, 'wrong_password');
        }
        session_regenerate_id(true);
        $_SESSION['wa_admin'] = true;
        out(['ok' => true]);
    }

    case 'logout': {
        start_session();
        $_SESSION = [];
        session_destroy();
        out(['ok' => true]);
    }

    case 'me': {
        cfg();   // بيرجّع config_missing / config_incomplete لو ملف الإعدادات مش جاهز
        out(['ok' => true, 'admin' => is_admin()]);
    }

    case 'inbox': {
        require_role(true);
        $where = [];
        $args = [];
        $status = (string) ($_GET['status'] ?? '');
        if (in_array($status, ['open', 'awaiting_approval', 'closed'], true)) {
            $where[] = 'status = ?';
            $args[] = $status;
        }
        if (!empty($_GET['needs_triage'])) {
            // فيها رسالة واردة بعد آخر تصنيف (أو عمرها ما اتصنّفت)
            $where[] = 'last_inbound_at IS NOT NULL AND (triaged_at IS NULL OR triaged_at < last_inbound_at)';
        }
        $sql = 'SELECT * FROM conversations' . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
             . ' ORDER BY COALESCE(last_message_at, created_at) DESC LIMIT 200';
        $st = db()->prepare($sql);
        $st->execute($args);
        out(['ok' => true, 'conversations' => array_map('public_conversation', $st->fetchAll())]);
    }

    case 'thread': {
        $role = require_role(true);
        $c = conversation_or_404(clean_wa((string) ($_GET['wa'] ?? '')));
        $st = db()->prepare('SELECT id, direction, type, body, media_id, media_mime, filename, status, error, drafted_by, sent_by, created_at, sent_at
                             FROM (SELECT * FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 300) ORDER BY id ASC');
        $st->execute([$c['id']]);
        $messages = $st->fetchAll();
        if ($role === 'admin' && (int) $c['unread'] > 0) {
            db()->prepare('UPDATE conversations SET unread = 0 WHERE id = ?')->execute([$c['id']]);
            $c['unread'] = 0;
        }
        out(['ok' => true, 'conversation' => public_conversation($c), 'messages' => $messages]);
    }

    case 'triage': {
        require_post();
        require_role(true);
        $in = input();
        $c = conversation_or_404(clean_wa((string) ($in['wa'] ?? '')));
        $category = (string) ($in['category'] ?? '');
        $route = (string) ($in['route_to'] ?? '');
        if ($category !== '' && !in_array($category, CATEGORIES, true)) fail(422, 'bad_category');
        if ($route !== '' && !in_array($route, ROUTES, true)) fail(422, 'bad_route');
        db()->prepare('UPDATE conversations SET category = ?, route_to = ?, summary = ?, triaged_at = ? WHERE id = ?')
            ->execute([$category ?: null, $route ?: null, clean_text($in['summary'] ?? '', 1000) ?: null, time(), $c['id']]);
        out(['ok' => true, 'conversation' => public_conversation(conversation_or_404($c['wa_id']))]);
    }

    case 'draft': {
        require_post();
        $role = require_role(true);
        $in = input();
        $c = conversation_or_404(clean_wa((string) ($in['wa'] ?? '')));
        $body = clean_text($in['body'] ?? '', MAX_BODY);
        if ($body === '') fail(422, 'empty_body');
        $by = $role === 'agent' ? (clean_text($in['drafted_by'] ?? 'communications', 50) ?: 'communications') : 'admin';
        db()->prepare('INSERT INTO messages (conversation_id, direction, type, body, status, drafted_by, created_at)
                       VALUES (?, \'out\', \'text\', ?, \'draft\', ?, ?)')
            ->execute([$c['id'], $body, $by, time()]);
        $id = (int) db()->lastInsertId();
        db()->prepare('UPDATE conversations SET status = \'awaiting_approval\' WHERE id = ?')->execute([$c['id']]);
        out(['ok' => true, 'draft_id' => $id]);
    }

    case 'send': {
        require_post();
        require_role(false);   // الإرسال الفعلى للإدارة بس — المساعد مابيبعتش
        $in = input();
        $c = conversation_or_404(clean_wa((string) ($in['wa'] ?? '')));
        $body = clean_text($in['body'] ?? '', MAX_BODY);
        if ($body === '') fail(422, 'empty_body');
        if (!window_open($c)) fail(409, 'window_closed');

        $draftId = (int) ($in['draft_id'] ?? 0);
        if ($draftId > 0) {
            $st = db()->prepare('SELECT id FROM messages WHERE id = ? AND conversation_id = ? AND status = \'draft\'');
            $st->execute([$draftId, $c['id']]);
            if (!$st->fetch()) fail(404, 'draft_not_found');
        }

        [$wamid, $error] = send_text($c['wa_id'], $body);
        $now = time();
        if ($draftId > 0) {
            db()->prepare('UPDATE messages SET body = ?, status = ?, wa_message_id = ?, error = ?, sent_by = \'admin\', sent_at = ? WHERE id = ?')
                ->execute([$body, $wamid ? 'sent' : 'failed', $wamid, $error, $wamid ? $now : null, $draftId]);
            $msgId = $draftId;
        } else {
            db()->prepare('INSERT INTO messages (conversation_id, wa_message_id, direction, type, body, status, error, sent_by, created_at, sent_at)
                           VALUES (?, ?, \'out\', \'text\', ?, ?, ?, \'admin\', ?, ?)')
                ->execute([$c['id'], $wamid, $body, $wamid ? 'sent' : 'failed', $error, $now, $wamid ? $now : null]);
            $msgId = (int) db()->lastInsertId();
        }
        refresh_draft_status((int) $c['id']);
        if ($wamid) {
            db()->prepare('UPDATE conversations SET last_message_at = ? WHERE id = ?')->execute([$now, $c['id']]);
            out(['ok' => true, 'message_id' => $msgId]);
        }
        out(['ok' => false, 'error' => 'send_failed', 'detail' => $error, 'message_id' => $msgId], 502);
    }

    case 'discard': {
        require_post();
        require_role(false);
        $id = (int) (input()['draft_id'] ?? 0);
        $st = db()->prepare('SELECT conversation_id FROM messages WHERE id = ? AND status = \'draft\'');
        $st->execute([$id]);
        $row = $st->fetch();
        if (!$row) fail(404, 'draft_not_found');
        db()->prepare('UPDATE messages SET status = \'discarded\' WHERE id = ?')->execute([$id]);
        refresh_draft_status((int) $row['conversation_id']);
        out(['ok' => true]);
    }

    case 'status': {
        require_post();
        require_role(false);
        $in = input();
        $c = conversation_or_404(clean_wa((string) ($in['wa'] ?? '')));
        $status = (string) ($in['status'] ?? '');
        if (!in_array($status, ['open', 'closed'], true)) fail(422, 'bad_status');
        db()->prepare('UPDATE conversations SET status = ? WHERE id = ?')->execute([$status, $c['id']]);
        out(['ok' => true]);
    }

    case 'media': {
        require_role(false);
        $id = (string) ($_GET['id'] ?? '');
        if (!preg_match('/^\d{5,30}$/', $id)) fail(422, 'bad_media_id');
        $st = db()->prepare('SELECT media_mime, filename FROM messages WHERE media_id = ? LIMIT 1');
        $st->execute([$id]);
        $msg = $st->fetch();
        if (!$msg) fail(404, 'not_found');
        $meta = graph('GET', 'https://graph.facebook.com/' . cfg()['graph_version'] . '/' . $id);
        $url = (string) ($meta['json']['url'] ?? '');
        if ($url === '' || !starts_with($url, 'https://')) fail(502, 'media_unavailable');
        $file = graph('GET', $url, null, true);
        if ($file['code'] !== 200) fail(502, 'media_unavailable');
        $name = preg_replace('/[^\p{L}\p{N}._ -]/u', '_', (string) ($msg['filename'] ?: ('whatsapp-' . $id))) ?: 'file';
        header('Content-Type: ' . ($msg['media_mime'] ?: 'application/octet-stream'));
        header("Content-Disposition: inline; filename*=UTF-8''" . rawurlencode($name));
        header('X-Content-Type-Options: nosniff');
        echo $file['body'];
        exit;
    }

    default:
        fail(404, 'unknown_action');
}
