<?php
/**
 * ربط Claude بقاعدة بيانات المكتب (MCP connector — قراءة بس).
 *
 * Claude (custom connector على claude.ai) يقدر يدوّر فى القضايا والموكلين ويعرض الجلسات
 * وحالة بوابة الموكلين، من نفس Firestore اللى تطبيق المكتب (hamlf) والبوابة
 * بيستخدموه:
 *   offices/{officeId}/records/clients/items/{id}
 *   offices/{officeId}/records/cases/items/{id}   (البيانات جوه حقل نصى اسمه json)
 *
 * الرابط اللى بيتحط فى Claude:
 *   https://hamlf.com/api/mcp.php/<connector_key>
 * (أو https://hamlf.com/api/mcp.php?key=<connector_key> لو الاستضافة مابتدعمش PATH_INFO)
 *
 * قواعد الأمان:
 * - قراءة بس: مفيش أى كتابة على Firestore، عشان مايتعارضش مع مزامنة تطبيق المكتب.
 * - الإعدادات (المفتاح + مسار مفتاح الخدمة) فى mcp-config.php «فوق» public_html — الريبو عام.
 *   شوف api/mcp-config.example.php.
 * - الكاش فيه بيانات موكلين: متخزّن جنب ملف الإعدادات (برّه public_html) ومشفّر AES-256-GCM.
 * - مفتاح الربط غلط = 404 (مش 401، عشان claude.ai مايدوّرش على OAuth).
 *
 * حصة Firestore: أول طلب بيقرا كل الوثايق، وبعد كده بيقرا اللى updatedAt بتاعه اتغيّر بس
 * (زى tools/portal-backfill)، وقراءة كاملة احتياطى مرة فى اليوم (عشان الحذف).
 */

declare(strict_types=1);

date_default_timezone_set('Africa/Cairo');

const MCP_SERVER_VERSION   = '1.0.0';
const MCP_PROTOCOLS        = ['2025-06-18', '2025-03-26', '2024-11-05'];
const MCP_DEFAULT_OFFICE   = 'office_UDdH9ctTHcd3';
const MCP_FRESH_SECONDS    = 60;          // الكاش يعتبر جديد دقيقة — بعدها تحديث بالتغييرات بس
const MCP_FULL_EVERY       = 86400;       // قراءة كاملة مرة فى اليوم (الحذف مالوش updatedAt)
const MCP_OVERLAP_SECONDS  = 900;         // هامش فرق ساعات الأجهزة (updatedAt بساعة الجهاز)
const MCP_MAX_STRING       = 2000;        // أى نص أطول من كده بيتقص فى الرد

// ─── الإعدادات ───────────────────────────────────────────────────────────────

function mcp_cfg(): array
{
    static $cfg = null;
    if ($cfg !== null) {
        return $cfg;
    }
    $path = getenv('HAMLF_MCP_CONFIG') ?: dirname($_SERVER['DOCUMENT_ROOT'] ?? __DIR__ . '/..') . '/mcp-config.php';
    $loaded = is_file($path) ? require $path : null;
    if (! is_array($loaded)) {
        $cfg = [];
        return $cfg;
    }
    $loaded['office_id']  = $loaded['office_id'] ?? MCP_DEFAULT_OFFICE;
    $loaded['cache_file'] = $loaded['cache_file'] ?? dirname($path) . '/mcp-cache.bin';
    $loaded['token_file'] = $loaded['token_file'] ?? dirname($path) . '/mcp-token.json';
    $cfg = $loaded;
    return $cfg;
}

function mcp_key_ok(string $given): bool
{
    $key = (string) (mcp_cfg()['connector_key'] ?? '');
    // مفتاح قصير أو لسه الافتراضى = الربط مقفول
    if (strlen($key) < 32 || str_starts_with($key, 'PASTE_')) {
        return false;
    }
    return $given !== '' && hash_equals($key, $given);
}

// ─── HTTP + Google OAuth (service account) ───────────────────────────────────

/** @return array{0:int,1:string} */
function mcp_http(string $method, string $url, array $headers = [], ?string $body = null): array
{
    if (isset($GLOBALS['MCP_FAKE_HTTP']) && is_callable($GLOBALS['MCP_FAKE_HTTP'])) {
        return ($GLOBALS['MCP_FAKE_HTTP'])($method, $url, $headers, $body);
    }
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_TIMEOUT        => 25,
        CURLOPT_CONNECTTIMEOUT => 10,
    ]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }
    $out  = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    return [$code, is_string($out) ? $out : ''];
}

function mcp_b64url(string $s): string
{
    return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
}

function mcp_service_account(): array
{
    static $sa = null;
    if ($sa !== null) {
        return $sa;
    }
    $path = (string) (mcp_cfg()['service_account_file'] ?? '');
    $json = $path !== '' && is_file($path) ? json_decode((string) file_get_contents($path), true) : null;
    if (! is_array($json) || empty($json['client_email']) || empty($json['private_key']) || empty($json['project_id'])) {
        throw new RuntimeException('ملف مفتاح الخدمة (service account) مش موجود أو ناقص — راجع mcp-config.php.');
    }
    $sa = $json;
    return $sa;
}

function mcp_access_token(): string
{
    $file = mcp_cfg()['token_file'];
    if (is_file($file)) {
        $cached = json_decode((string) @file_get_contents($file), true);
        if (is_array($cached) && ($cached['exp'] ?? 0) > time() + 120 && ! empty($cached['token'])) {
            return $cached['token'];
        }
    }

    $sa  = mcp_service_account();
    $now = time();
    $jwt = mcp_b64url(json_encode(['alg' => 'RS256', 'typ' => 'JWT'])) . '.' . mcp_b64url(json_encode([
        'iss'   => $sa['client_email'],
        'scope' => 'https://www.googleapis.com/auth/datastore',
        'aud'   => 'https://oauth2.googleapis.com/token',
        'iat'   => $now,
        'exp'   => $now + 3600,
    ]));
    $sig = '';
    if (! openssl_sign($jwt, $sig, $sa['private_key'], OPENSSL_ALGO_SHA256)) {
        throw new RuntimeException('فشل توقيع طلب الدخول لـ Google (المفتاح الخاص).');
    }
    [$code, $body] = mcp_http('POST', 'https://oauth2.googleapis.com/token',
        ['Content-Type: application/x-www-form-urlencoded'],
        http_build_query(['grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'assertion' => $jwt . '.' . mcp_b64url($sig)]));
    $res = json_decode($body, true);
    if ($code !== 200 || empty($res['access_token'])) {
        throw new RuntimeException('Google رفض مفتاح الخدمة (HTTP ' . $code . ').');
    }
    @file_put_contents($file, json_encode(['token' => $res['access_token'], 'exp' => $now + (int) ($res['expires_in'] ?? 3600)]), LOCK_EX);
    @chmod($file, 0600);
    return $res['access_token'];
}

// ─── Firestore REST (قراءة بس) ───────────────────────────────────────────────

function mcp_fs_base(): string
{
    return 'https://firestore.googleapis.com/v1/projects/' . rawurlencode(mcp_service_account()['project_id'])
        . '/databases/(default)/documents';
}

function mcp_fs_request(string $method, string $path, ?array $body = null): array
{
    [$code, $raw] = mcp_http($method, mcp_fs_base() . $path, [
        'Authorization: Bearer ' . mcp_access_token(),
        'Content-Type: application/json',
    ], $body === null ? null : json_encode($body));
    $res = json_decode($raw, true);
    if ($code !== 200 || ! is_array($res)) {
        $msg = is_array($res) ? ($res['error']['status'] ?? '') : '';
        throw new RuntimeException("Firestore رجّع خطأ (HTTP {$code} {$msg}).");
    }
    return $res;
}

/** يحوّل قيمة Firestore REST ({stringValue: ...}) لقيمة PHP عادية. */
function mcp_fs_value(array $v): mixed
{
    foreach ($v as $type => $val) {
        switch ($type) {
            case 'stringValue':    return (string) $val;
            case 'integerValue':   return (int) $val;
            case 'doubleValue':    return (float) $val;
            case 'booleanValue':   return (bool) $val;
            case 'nullValue':      return null;
            case 'timestampValue': return (string) $val;
            case 'referenceValue': return (string) $val;
            case 'geoPointValue':  return $val;
            case 'bytesValue':     return '[bytes]';
            case 'arrayValue':     return array_map('mcp_fs_value', $val['values'] ?? []);
            case 'mapValue':       return array_map('mcp_fs_value', $val['fields'] ?? []);
        }
    }
    return null;
}

/** وثيقة Firestore → [id, fields] */
function mcp_fs_doc(array $doc): array
{
    $id = substr((string) $doc['name'], strrpos((string) $doc['name'], '/') + 1);
    return [$id, array_map('mcp_fs_value', $doc['fields'] ?? [])];
}

function mcp_collection_path(string $kind): string
{
    return '/offices/' . rawurlencode(mcp_cfg()['office_id']) . '/records/' . $kind . '/items';
}

/** كل وثايق الكولكشن (صفحات 300). */
function mcp_fs_list_all(string $kind): array
{
    $out   = [];
    $token = null;
    do {
        $q   = '?pageSize=300' . ($token ? '&pageToken=' . rawurlencode($token) : '');
        $res = mcp_fs_request('GET', mcp_collection_path($kind) . $q);
        foreach ($res['documents'] ?? [] as $doc) {
            [$id, $fields] = mcp_fs_doc($doc);
            $out[$id] = $fields;
        }
        $token = $res['nextPageToken'] ?? null;
    } while ($token);
    return $out;
}

/** الوثايق اللى field > value (runQuery). */
function mcp_fs_query_gt(string $kind, string $field, array $value): array
{
    $parent = '/offices/' . rawurlencode(mcp_cfg()['office_id']) . '/records/' . $kind;
    $res = mcp_fs_request('POST', $parent . ':runQuery', ['structuredQuery' => [
        'from'  => [['collectionId' => 'items']],
        'where' => ['fieldFilter' => ['field' => ['fieldPath' => $field], 'op' => 'GREATER_THAN', 'value' => $value]],
    ]]);
    $out = [];
    foreach ($res as $row) {
        if (isset($row['document'])) {
            [$id, $fields] = mcp_fs_doc($row['document']);
            $out[$id] = $fields;
        }
    }
    return $out;
}

// ─── الكاش المشفّر ───────────────────────────────────────────────────────────

function mcp_cache_key(): string
{
    return hash('sha256', 'hamlf-mcp-cache|' . (mcp_cfg()['connector_key'] ?? ''), true);
}

function mcp_cache_read(): ?array
{
    $file = mcp_cfg()['cache_file'];
    $raw  = is_file($file) ? (string) @file_get_contents($file) : '';
    if (strlen($raw) < 29) {
        return null;
    }
    $plain = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', mcp_cache_key(), OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
    $data  = $plain === false ? null : json_decode($plain, true);
    return is_array($data) && ($data['office'] ?? null) === mcp_cfg()['office_id'] ? $data : null;
}

function mcp_cache_write(array $data): void
{
    $iv     = random_bytes(12);
    $tag    = '';
    $cipher = openssl_encrypt(json_encode($data, JSON_UNESCAPED_UNICODE), 'aes-256-gcm', mcp_cache_key(), OPENSSL_RAW_DATA, $iv, $tag);
    $file   = mcp_cfg()['cache_file'];
    @file_put_contents($file, $iv . $tag . $cipher, LOCK_EX);
    @chmod($file, 0600);
}

/** يرجّع ['cases' => [id => fields], 'clients' => [...]] — من الكاش مع تحديث بالتغييرات. */
function mcp_data(): array
{
    static $data = null;
    if ($data !== null) {
        return $data;
    }
    $now   = time();
    $cache = mcp_cache_read();

    if ($cache && $now - (int) $cache['syncedAt'] < MCP_FRESH_SECONDS) {
        return $data = $cache;
    }

    if (! $cache || $now - (int) ($cache['fullAt'] ?? 0) > MCP_FULL_EVERY) {
        $data = [
            'office'   => mcp_cfg()['office_id'],
            'cases'    => mcp_fs_list_all('cases'),
            'clients'  => mcp_fs_list_all('clients'),
            'syncedAt' => $now,
            'fullAt'   => $now,
        ];
    } else {
        $since = ['timestampValue' => gmdate('Y-m-d\TH:i:s\Z', (int) $cache['syncedAt'] - MCP_OVERLAP_SECONDS)];
        $data  = $cache;
        foreach (mcp_fs_query_gt('cases', 'updatedAt', $since) as $id => $f) {
            $data['cases'][$id] = $f;
        }
        foreach (mcp_fs_query_gt('clients', 'updatedAt', $since) as $id => $f) {
            $data['clients'][$id] = $f;
        }
        // ربط البوابة (clientUid) بيتكتب من غير ما يغيّر updatedAt
        foreach (mcp_fs_query_gt('clients', 'clientUid', ['stringValue' => '']) as $id => $f) {
            $data['clients'][$id] = $f;
        }
        $data['syncedAt'] = $now;
    }
    mcp_cache_write($data);
    return $data;
}

// ─── تحويل البيانات ──────────────────────────────────────────────────────────

/** للبحث: يشيل التشكيل والهمزات ويوحّد ة/ه وى/ي والأرقام الهندى. */
function mcp_norm(mixed $s): string
{
    $s = mb_strtolower(trim((string) $s));
    $s = preg_replace('/[\x{064B}-\x{065F}\x{0670}\x{0640}]/u', '', $s) ?? $s;
    $s = strtr($s, [
        'أ' => 'ا', 'إ' => 'ا', 'آ' => 'ا', 'ٱ' => 'ا', 'ة' => 'ه', 'ى' => 'ي', 'ؤ' => 'و', 'ئ' => 'ي',
        '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4', '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
        '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4', '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
    ]);
    return preg_replace('/\s+/u', ' ', $s) ?? $s;
}

function mcp_json_field(array $fields): array
{
    $j = json_decode((string) ($fields['json'] ?? '{}'), true);
    return is_array($j) ? $j : [];
}

/** نص طويل جداً (زى مرفقات base64) بيتقص عشان الرد مايتقلش. */
function mcp_trim_deep(mixed $v): mixed
{
    if (is_string($v)) {
        return mb_strlen($v) > MCP_MAX_STRING ? mb_substr($v, 0, MCP_MAX_STRING) . '…[مقصوص]' : $v;
    }
    if (is_array($v)) {
        return array_map('mcp_trim_deep', $v);
    }
    return $v;
}

function mcp_parties(mixed $v): array
{
    if (is_array($v)) {
        return array_values(array_filter(array_map(fn ($x) => is_array($x) ? mcp_client_name($x) : trim((string) $x), $v)));
    }
    return array_values(array_filter(array_map('trim', explode('·', (string) $v))));
}

function mcp_client_name(array $j): string
{
    foreach (['name', 'fullName', 'clientName', 'full_name'] as $k) {
        if (! empty($j[$k]) && is_string($j[$k])) {
            return trim($j[$k]);
        }
    }
    return '';
}

/** جلسات القضية بتاريخ صحيح، مرتبة. */
function mcp_case_sessions(array $c): array
{
    $out = [];
    foreach (is_array($c['sessions'] ?? null) ? $c['sessions'] : [] as $s) {
        if (! is_array($s)) {
            continue;
        }
        $date = (string) ($s['date'] ?? '');
        if (! preg_match('/^\d{4}-\d{2}-\d{2}/', $date) || str_starts_with($date, '0000')) {
            continue;
        }
        $r = is_array($s['raw'] ?? null) ? $s['raw'] : [];
        $out[] = array_filter([
            'date'     => substr($date, 0, 10),
            'roll'     => $r['roll'] ?? null,
            'type'     => $r['type'] ?? null,
            'decision' => $r['result'] ?? $r['decision'] ?? $r['for'] ?? $r['reason'] ?? null,
        ], fn ($x) => $x !== null && $x !== '');
    }
    usort($out, fn ($a, $b) => strcmp($a['date'], $b['date']));
    return $out;
}

function mcp_case_summary(string $id, array $fields): array
{
    $c        = mcp_json_field($fields);
    $sessions = mcp_case_sessions($c);
    $today    = date('Y-m-d');
    $next     = null;
    $last     = null;
    foreach ($sessions as $s) {
        if ($s['date'] >= $today) {
            $next ??= $s['date'];
        } else {
            $last = $s['date'];
        }
    }
    return array_filter([
        'id'           => $id,
        'subject'      => $c['subject'] ?? null,
        'file_no'      => $c['fileNo'] ?? null,
        'case_no'      => $c['caseNo'] ?? null,
        'case_year'    => $c['caseYear'] ?? null,
        'court'        => $c['courtName'] ?? null,
        'court_level'  => $c['courtLevel'] ?? null,
        'circuit'      => $c['circuit'] ?? null,
        'case_type'    => $c['caseType'] ?? null,
        'status'       => $c['status'] ?? null,
        'lawyer'       => $c['lawyer'] ?? null,
        'clients'      => mcp_parties($c['clients'] ?? '') ?: null,
        'opponents'    => mcp_parties($c['opponents'] ?? '') ?: null,
        'next_session' => $next,
        'last_session' => $last,
    ], fn ($x) => $x !== null && $x !== '');
}

function mcp_case_haystack(array $fields): string
{
    $c = mcp_json_field($fields);
    $parts = [];
    foreach (['subject', 'fileNo', 'caseNo', 'caseYear', 'firstNo', 'firstYear', 'courtName', 'courtLevel', 'circuit', 'caseType', 'status', 'lawyer', 'dealYear'] as $k) {
        if (isset($c[$k]) && is_scalar($c[$k])) {
            $parts[] = (string) $c[$k];
        }
    }
    $parts = array_merge($parts, mcp_parties($c['clients'] ?? ''), mcp_parties($c['opponents'] ?? ''));
    return mcp_norm(implode(' | ', $parts));
}

function mcp_client_info(string $id, array $fields, bool $full = false): array
{
    $j      = mcp_json_field($fields);
    $emails = array_values(array_unique(array_filter(array_merge(
        (array) ($fields['matchEmails'] ?? []),
        (array) ($j['matchEmails'] ?? []),
        (array) ($j['emails'] ?? []),
        isset($j['email']) ? [(string) $j['email']] : []
    ), fn ($e) => is_string($e) && $e !== '')));
    $phones = [];
    foreach ($j as $k => $v) {
        if (is_scalar($v) && $v !== '' && preg_match('/phone|mobile|tel|whats/i', (string) $k)) {
            $phones[] = (string) $v;
        }
    }
    $info = array_filter([
        'id'     => $id,
        'name'   => mcp_client_name($j) ?: null,
        'phones' => $phones ?: null,
        'emails' => $emails ?: null,
        'portal' => [
            'linked'       => ! empty($fields['clientUid']),
            'login_emails' => count((array) ($fields['matchEmails'] ?? [])),
        ],
    ], fn ($x) => $x !== null);
    if ($full) {
        $info['details'] = mcp_trim_deep(array_diff_key($j, array_flip(['matchEmails'])));
    }
    return $info;
}

// ─── الأدوات ─────────────────────────────────────────────────────────────────

function mcp_tools(): array
{
    $limit = ['type' => 'integer', 'minimum' => 1, 'maximum' => 100, 'description' => 'أقصى عدد نتايج (افتراضى 20)'];

    return [
        'office_overview' => [
            'title'       => 'ملخص المكتب',
            'description' => 'أعداد القضايا (حسب الحالة) والموكلين، وجلسات النهارده والأسبوع ده، والموكلين المربوطين ببوابة hamlf.com.',
            'schema'      => ['properties' => new stdClass()],
        ],
        'search_cases' => [
            'title'       => 'بحث فى القضايا',
            'description' => 'بحث فى القضايا برقم الملف/رقم الدعوى/الموضوع/اسم الموكل أو الخصم/المحكمة/الدائرة/المحامى. البحث بيتجاهل الهمزات والتشكيل والأرقام الهندى. فاضى = كل القضايا (الأقرب جلسة الأول).',
            'schema'      => ['properties' => [
                'query'  => ['type' => 'string', 'description' => 'كلمات البحث (كلها لازم تكون موجودة)'],
                'status' => ['type' => 'string', 'description' => 'فلترة بالحالة زى ما هى مكتوبة فى التطبيق (مثلاً: متداولة)'],
                'lawyer' => ['type' => 'string', 'description' => 'فلترة باسم المحامى'],
                'limit'  => $limit,
            ]],
        ],
        'get_case' => [
            'title'       => 'تفاصيل قضية',
            'description' => 'كل بيانات القضية من التطبيق + كل الجلسات مرتبة (الرول، نوع الجلسة، القرار) + حالة ظهورها فى بوابة الموكلين.',
            'schema'      => ['properties' => ['case_id' => ['type' => 'string', 'description' => 'id القضية من search_cases']], 'required' => ['case_id']],
        ],
        'list_sessions' => [
            'title'       => 'الجلسات فى فترة',
            'description' => 'كل جلسات المكتب فى فترة (افتراضى: النهارده + 7 أيام) مرتبة بالتاريخ، مع القضية والمحكمة والدائرة والرول. لجلسات فاتت حط from قبل النهارده.',
            'schema'      => ['properties' => [
                'from'  => ['type' => 'string', 'format' => 'date', 'description' => 'من تاريخ YYYY-MM-DD (افتراضى النهارده)'],
                'to'    => ['type' => 'string', 'format' => 'date', 'description' => 'لحد تاريخ YYYY-MM-DD'],
                'days'  => ['type' => 'integer', 'minimum' => 1, 'maximum' => 366, 'description' => 'عدد الأيام من from لو مفيش to (افتراضى 7)'],
                'limit' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 500, 'description' => 'أقصى عدد (افتراضى 200)'],
            ]],
        ],
        'search_clients' => [
            'title'       => 'بحث فى الموكلين',
            'description' => 'بحث بالاسم أو الموبايل أو الإيميل. بيرجّع بيانات التواصل وهل الموكل مربوط ببوابة hamlf.com.',
            'schema'      => ['properties' => ['query' => ['type' => 'string', 'description' => 'كلمات البحث'], 'limit' => $limit], 'required' => ['query']],
        ],
        'get_client' => [
            'title'       => 'تفاصيل موكل',
            'description' => 'بيانات الموكل كاملة من التطبيق + حالة البوابة + القضايا اللى اسمه فيها أو مربوطة بحسابه.',
            'schema'      => ['properties' => ['client_id' => ['type' => 'string', 'description' => 'id الموكل من search_clients']], 'required' => ['client_id']],
        ],
    ];
}

function mcp_limit(array $args, int $default, int $max): int
{
    $n = filter_var($args['limit'] ?? $default, FILTER_VALIDATE_INT);
    return max(1, min($max, $n === false ? $default : $n));
}

function mcp_valid_date(mixed $d): ?string
{
    return is_string($d) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) && strtotime($d) !== false ? $d : null;
}

function mcp_run_tool(string $name, array $args): array
{
    $data  = mcp_data();
    $today = date('Y-m-d');

    switch ($name) {
        case 'office_overview':
            $byStatus = [];
            $todayN = 0;
            $weekN  = 0;
            $weekEnd = date('Y-m-d', strtotime('+7 days'));
            foreach ($data['cases'] as $fields) {
                $c = mcp_json_field($fields);
                $st = trim((string) ($c['status'] ?? '')) ?: 'بدون حالة';
                $byStatus[$st] = ($byStatus[$st] ?? 0) + 1;
                foreach (mcp_case_sessions($c) as $s) {
                    $todayN += $s['date'] === $today ? 1 : 0;
                    $weekN  += $s['date'] >= $today && $s['date'] <= $weekEnd ? 1 : 0;
                }
            }
            arsort($byStatus);
            $linked = count(array_filter($data['clients'], fn ($f) => ! empty($f['clientUid'])));
            return [
                'today'                  => $today,
                'cases_total'            => count($data['cases']),
                'cases_by_status'        => $byStatus,
                'clients_total'          => count($data['clients']),
                'clients_on_portal'      => $linked,
                'sessions_today'         => $todayN,
                'sessions_next_7_days'   => $weekN,
                'data_synced_at'         => date('Y-m-d H:i', (int) $data['syncedAt']),
            ];

        case 'search_cases':
            $terms  = array_filter(explode(' ', mcp_norm($args['query'] ?? '')));
            $status = mcp_norm($args['status'] ?? '');
            $lawyer = mcp_norm($args['lawyer'] ?? '');
            $hits   = [];
            foreach ($data['cases'] as $id => $fields) {
                $hay = mcp_case_haystack($fields);
                foreach ($terms as $t) {
                    if (! str_contains($hay, $t)) {
                        continue 2;
                    }
                }
                $sum = mcp_case_summary((string) $id, $fields);
                if ($status !== '' && ! str_contains(mcp_norm($sum['status'] ?? ''), $status)) {
                    continue;
                }
                if ($lawyer !== '' && ! str_contains(mcp_norm($sum['lawyer'] ?? ''), $lawyer)) {
                    continue;
                }
                $hits[] = $sum;
            }
            // الأقرب جلسة جاية الأول، وبعدها اللى مالهاش جلسة جاية
            usort($hits, fn ($a, $b) => strcmp($a['next_session'] ?? '9999', $b['next_session'] ?? '9999'));
            $limit = mcp_limit($args, 20, 100);
            return ['total' => count($hits), 'returned' => min($limit, count($hits)), 'cases' => array_slice($hits, 0, $limit)];

        case 'get_case':
            $id = (string) ($args['case_id'] ?? '');
            if (! isset($data['cases'][$id])) {
                throw new InvalidArgumentException('القضية دى مش موجودة. دوّر عليها الأول بـ search_cases.');
            }
            $fields = $data['cases'][$id];
            $c      = mcp_json_field($fields);
            return [
                'summary'  => mcp_case_summary($id, $fields),
                'sessions' => mcp_case_sessions($c),
                'portal'   => [
                    'linked_client_accounts' => count((array) ($fields['clientUids'] ?? [])),
                    'client_emails'          => count((array) ($fields['clientEmails'] ?? [])),
                ],
                'details'  => mcp_trim_deep(array_diff_key($c, array_flip(['sessions']))),
                'updated_at' => $fields['updatedAt'] ?? null,
            ];

        case 'list_sessions':
            $from = mcp_valid_date($args['from'] ?? null) ?? $today;
            $days = filter_var($args['days'] ?? 7, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 366]]) ?: 7;
            $to   = mcp_valid_date($args['to'] ?? null) ?? date('Y-m-d', strtotime($from . " +{$days} days"));
            $rows = [];
            foreach ($data['cases'] as $id => $fields) {
                $c = mcp_json_field($fields);
                foreach (mcp_case_sessions($c) as $s) {
                    if ($s['date'] < $from || $s['date'] > $to) {
                        continue;
                    }
                    $rows[] = array_filter([
                        'date'     => $s['date'],
                        'roll'     => $s['roll'] ?? null,
                        'type'     => $s['type'] ?? null,
                        'decision' => $s['decision'] ?? null,
                        'case_id'  => (string) $id,
                        'subject'  => $c['subject'] ?? null,
                        'case_no'  => implode(' لسنة ', array_filter([trim((string) ($c['caseNo'] ?? '')), trim((string) ($c['caseYear'] ?? ''))], 'strlen')) ?: null,
                        'court'    => $c['courtName'] ?? null,
                        'circuit'  => $c['circuit'] ?? null,
                        'lawyer'   => $c['lawyer'] ?? null,
                        'clients'  => mcp_parties($c['clients'] ?? '') ?: null,
                    ], fn ($x) => $x !== null && $x !== '');
                }
            }
            usort($rows, fn ($a, $b) => [$a['date'], (string) ($a['roll'] ?? '')] <=> [$b['date'], (string) ($b['roll'] ?? '')]);
            $limit = mcp_limit($args, 200, 500);
            return ['from' => $from, 'to' => $to, 'total' => count($rows), 'sessions' => array_slice($rows, 0, $limit)];

        case 'search_clients':
            $terms = array_filter(explode(' ', mcp_norm($args['query'] ?? '')));
            if (! $terms) {
                throw new InvalidArgumentException('اكتب اسم أو موبايل أو إيميل للبحث.');
            }
            $hits = [];
            foreach ($data['clients'] as $id => $fields) {
                $info = mcp_client_info((string) $id, $fields);
                $hay  = mcp_norm(implode(' | ', array_merge([$info['name'] ?? ''], $info['phones'] ?? [], $info['emails'] ?? [])));
                foreach ($terms as $t) {
                    if (! str_contains($hay, $t)) {
                        continue 2;
                    }
                }
                $hits[] = $info;
            }
            $limit = mcp_limit($args, 20, 100);
            return ['total' => count($hits), 'clients' => array_slice($hits, 0, $limit)];

        case 'get_client':
            $id = (string) ($args['client_id'] ?? '');
            if (! isset($data['clients'][$id])) {
                throw new InvalidArgumentException('الموكل ده مش موجود. دوّر عليه الأول بـ search_clients.');
            }
            $fields = $data['clients'][$id];
            $info   = mcp_client_info($id, $fields, true);
            $name   = mcp_norm($info['name'] ?? '');
            $uid    = (string) ($fields['clientUid'] ?? '');
            $cases  = [];
            foreach ($data['cases'] as $cid => $cf) {
                $c       = mcp_json_field($cf);
                $byName  = $name !== '' && in_array($name, array_map('mcp_norm', mcp_parties($c['clients'] ?? '')), true);
                $byUid   = $uid !== '' && in_array($uid, (array) ($cf['clientUids'] ?? []), true);
                if ($byName || $byUid) {
                    $cases[] = mcp_case_summary((string) $cid, $cf);
                }
            }
            $info['cases'] = $cases;
            return $info;
    }

    throw new InvalidArgumentException('Unknown tool');
}

// ─── JSON-RPC ────────────────────────────────────────────────────────────────

function mcp_result(mixed $id, mixed $result): array
{
    return ['jsonrpc' => '2.0', 'id' => $id, 'result' => $result];
}

function mcp_error(mixed $id, int $code, string $message): array
{
    return ['jsonrpc' => '2.0', 'id' => $id, 'error' => ['code' => $code, 'message' => $message]];
}

function mcp_tool_list(): array
{
    $out = [];
    foreach (mcp_tools() as $name => $t) {
        $out[] = [
            'name'        => $name,
            'title'       => $t['title'],
            'description' => $t['description'],
            'inputSchema' => ['type' => 'object'] + $t['schema'],
            'annotations' => ['title' => $t['title'], 'readOnlyHint' => true, 'destructiveHint' => false, 'idempotentHint' => true, 'openWorldHint' => false],
        ];
    }
    return $out;
}

function mcp_dispatch(array $msg): ?array
{
    $id     = $msg['id'] ?? null;
    $method = $msg['method'] ?? null;
    $params = is_array($msg['params'] ?? null) ? $msg['params'] : [];

    if (! is_string($method)) {
        return null; // رد من العميل أو رسالة مالهاش لازمة
    }
    if (! array_key_exists('id', $msg)) {
        return null; // notification
    }

    switch ($method) {
        case 'initialize':
            $v = $params['protocolVersion'] ?? null;
            return mcp_result($id, [
                'protocolVersion' => in_array($v, MCP_PROTOCOLS, true) ? $v : MCP_PROTOCOLS[0],
                'capabilities'    => ['tools' => ['listChanged' => false]],
                'serverInfo'      => ['name' => 'hamlf-office', 'title' => 'مكتب د. حسن عبد المنعم — hamlf.com', 'version' => MCP_SERVER_VERSION],
                'instructions'    => 'بيانات مكتب د. حسن عبد المنعم حسن من تطبيق المكتب (قراءة بس — مفيش إضافة ولا تعديل من هنا). '
                    . 'ابدأ بـ office_overview أو list_sessions لجدول الجلسات، و search_cases / search_clients للبحث، وبعدين get_case / get_client للتفاصيل. '
                    . 'التواريخ YYYY-MM-DD بتوقيت القاهرة. البيانات دى سرية: ماتعرضش بيانات موكل غير للى بيسأل من المكتب.',
            ]);
        case 'ping':
            return mcp_result($id, new stdClass());
        case 'tools/list':
            return mcp_result($id, ['tools' => mcp_tool_list()]);
        case 'resources/list':
            return mcp_result($id, ['resources' => []]);
        case 'resources/templates/list':
            return mcp_result($id, ['resourceTemplates' => []]);
        case 'prompts/list':
            return mcp_result($id, ['prompts' => []]);
        case 'tools/call':
            $name = $params['name'] ?? null;
            $args = is_array($params['arguments'] ?? null) ? $params['arguments'] : [];
            if (! is_string($name) || ! isset(mcp_tools()[$name])) {
                return mcp_error($id, -32602, 'Unknown tool');
            }
            try {
                $out = mcp_run_tool($name, $args);
                $text = json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT | JSON_INVALID_UTF8_SUBSTITUTE);
                return mcp_result($id, ['content' => [['type' => 'text', 'text' => $text]], 'isError' => false]);
            } catch (InvalidArgumentException $e) {
                return mcp_result($id, ['content' => [['type' => 'text', 'text' => $e->getMessage()]], 'isError' => true]);
            } catch (Throwable $e) {
                error_log('hamlf mcp: ' . $e->getMessage());
                $msg = $e instanceof RuntimeException ? $e->getMessage() : 'حصل خطأ فى السيرفر.';
                return mcp_result($id, ['content' => [['type' => 'text', 'text' => $msg]], 'isError' => true]);
            }
    }
    return mcp_error($id, -32601, 'Method not found: ' . $method);
}

function mcp_send(int $status, ?array $body = null, array $headers = []): void
{
    http_response_code($status);
    foreach ($headers as $h) {
        header($h);
    }
    if ($body !== null) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
}

function mcp_handle_request(): void
{
    header('Cache-Control: no-store');
    header('X-Robots-Tag: noindex, nofollow');

    $key = trim((string) ($_SERVER['PATH_INFO'] ?? ''), '/');
    if ($key === '') {
        $key = (string) ($_GET['key'] ?? '');
    }
    if (! mcp_key_ok($key)) {
        mcp_send(404, ['error' => 'رابط الربط غير صالح.']);
        return;
    }
    // Streamable HTTP: مفيش SSE (GET) ولا sessions (DELETE)
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        mcp_send(405, null, ['Allow: POST']);
        return;
    }

    $payload = json_decode((string) file_get_contents('php://input'), true);
    if (! is_array($payload) || $payload === []) {
        mcp_send(400, mcp_error(null, -32700, 'Parse error'));
        return;
    }
    $batch   = array_is_list($payload);
    $replies = [];
    foreach ($batch ? $payload : [$payload] as $msg) {
        $r = is_array($msg) ? mcp_dispatch($msg) : mcp_error(null, -32600, 'Invalid Request');
        if ($r !== null) {
            $replies[] = $r;
        }
    }
    if ($replies === []) {
        mcp_send(202);
        return;
    }
    mcp_send(200, $batch ? $replies : $replies[0]);
}

if (! defined('HAMLF_MCP_NO_RUN')) {
    mcp_handle_request();
}
