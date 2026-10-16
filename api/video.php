<?php
/**
 * غرفة الفيديو الخاصة بالمؤسسة — واجهة برمجية صغيرة فوق Daily (daily.co)
 *
 * - مفتاح Daily وكلمة سر صفحة الإدارة في ملف إعدادات خارج public_html
 *   (مش في الريبو): video-config.php — شوف api/video-config.example.php
 * - حالة الغرف (المدة، وقت البداية والنهاية) في video-rooms.json جنب ملف الإعدادات.
 * - القطع الفعلي بيحصل من سيرفر Daily: كل غرفة exp بتاعها = نهاية الباقة،
 *   و eject_at_room_exp = true بيطرد كل اللي جوه أول ما الوقت يخلص.
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');

const PACKAGES = [15, 30, 60];      // مدد الباقات بالدقيقة
const EXTENSION_MINUTES = 15;       // مدة التمديد
const PRE_START_WINDOW = 3 * 3600;  // الغرفة مفتوحة قبل بدء العداد بحد أقصى ٣ ساعات من الميعاد

function cfg(): array {
    static $cfg = null;
    if ($cfg !== null) return $cfg;
    $path = getenv('HAMLF_VIDEO_CONFIG') ?: dirname($_SERVER['DOCUMENT_ROOT'] ?? __DIR__ . '/..') . '/video-config.php';
    if (!is_file($path)) fail(500, 'config_missing');
    $cfg = require $path;
    foreach (['daily_api_key', 'daily_domain', 'admin_password'] as $k) {
        if (empty($cfg[$k])) fail(500, 'config_incomplete');
    }
    $cfg['state_file'] = $cfg['state_file'] ?? dirname($path) . '/video-rooms.json';
    $cfg['daily_api_base'] = rtrim($cfg['daily_api_base'] ?? 'https://api.daily.co/v1', '/');
    return $cfg;
}

function out(array $data, int $code = 200): never {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(int $code, string $error): never {
    out(['ok' => false, 'error' => $error], $code);
}

function input(): array {
    $raw = file_get_contents('php://input') ?: '';
    $json = json_decode($raw, true);
    return is_array($json) ? $json : $_POST;
}

/* ---------- state (ملف JSON بقفل) ---------- */

function with_state(callable $fn) {
    $file = cfg()['state_file'];
    $fh = fopen($file, 'c+');
    if (!$fh) fail(500, 'state_unwritable');
    flock($fh, LOCK_EX);
    $raw = stream_get_contents($fh);
    $state = $raw ? (json_decode($raw, true) ?: []) : [];
    $result = $fn($state);
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, json_encode($state, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    return $result;
}

function read_state(): array {
    $file = cfg()['state_file'];
    if (!is_file($file)) return [];
    return json_decode((string) file_get_contents($file), true) ?: [];
}

/* ---------- Daily ---------- */

function daily(string $method, string $path, ?array $body = null): array {
    $ch = curl_init(cfg()['daily_api_base'] . $path);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . cfg()['daily_api_key'],
            'Content-Type: application/json',
        ],
    ]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    $res = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($res === false || $code >= 400) fail(502, 'daily_error');
    return json_decode((string) $res, true) ?: [];
}

function set_room_exp(string $name, int $exp): void {
    daily('POST', '/rooms/' . rawurlencode($name), ['properties' => ['exp' => $exp, 'eject_at_room_exp' => true]]);
}

function room_url(string $name): string {
    return 'https://' . cfg()['daily_domain'] . '.daily.co/' . $name;
}

/* ---------- auth ---------- */

function start_session(): void {
    session_name('hamlf_video');
    session_set_cookie_params(['httponly' => true, 'samesite' => 'Strict', 'secure' => !empty($_SERVER['HTTPS'])]);
    session_start();
}

function require_admin(): void {
    start_session();
    if (empty($_SESSION['video_admin'])) fail(401, 'unauthorized');
}

function public_room(array $r): array {
    $now = time();
    $status = $r['status'];
    if ($status === 'live' && $now >= $r['ends_at']) $status = 'ended';
    return [
        'status' => $status,
        'minutes' => $r['minutes'],
        'ends_at' => $r['ends_at'],
        'scheduled' => $r['scheduled'],
        'now' => $now,
    ];
}

/* ---------- actions ---------- */

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

switch ($action) {

    // صفحة الغرفة (عامة): حالة العداد + رابط Daily
    case 'info': {
        $name = (string) ($_GET['r'] ?? '');
        if (!preg_match('/^hamlf-[a-f0-9]{16}$/', $name)) fail(404, 'not_found');
        $room = read_state()[$name] ?? null;
        if (!$room) fail(404, 'not_found');
        out(['ok' => true, 'url' => room_url($name)] + public_room($room));
    }

    case 'login': {
        if ($method !== 'POST') fail(405, 'method');
        start_session();
        $pw = (string) (input()['password'] ?? '');
        if (!hash_equals((string) cfg()['admin_password'], $pw)) {
            usleep(800000);
            fail(401, 'wrong_password');
        }
        session_regenerate_id(true);
        $_SESSION['video_admin'] = true;
        out(['ok' => true]);
    }

    case 'logout': {
        start_session();
        $_SESSION = [];
        session_destroy();
        out(['ok' => true]);
    }

    case 'list': {
        require_admin();
        $rooms = [];
        foreach (read_state() as $name => $r) {
            $rooms[] = ['name' => $name, 'client' => $r['client']] + public_room($r);
        }
        usort($rooms, fn($a, $b) => $b['scheduled'] <=> $a['scheduled']);
        out(['ok' => true, 'rooms' => array_slice($rooms, 0, 50)]);
    }

    case 'create': {
        if ($method !== 'POST') fail(405, 'method');
        require_admin();
        $in = input();
        $minutes = (int) ($in['minutes'] ?? 0);
        $client = trim(mb_substr((string) ($in['client'] ?? ''), 0, 80));
        $scheduled = (int) ($in['scheduled'] ?? 0); // epoch seconds من المتصفح
        if (!in_array($minutes, PACKAGES, true) || $client === '' || $scheduled <= 0) fail(400, 'bad_input');

        $name = 'hamlf-' . bin2hex(random_bytes(8));
        daily('POST', '/rooms', [
            'name' => $name,
            'privacy' => 'public', // الاسم عشوائي ١٦ خانة؛ مايتخمنش
            'properties' => [
                'exp' => max(time(), $scheduled) + PRE_START_WINDOW,
                'eject_at_room_exp' => true,
                'enable_chat' => true,
                'enable_screenshare' => true,
                'enable_prejoin_ui' => true,
            ],
        ]);
        with_state(function (array &$s) use ($name, $client, $minutes, $scheduled) {
            $s[$name] = [
                'client' => $client,
                'minutes' => $minutes,
                'scheduled' => $scheduled,
                'status' => 'waiting',
                'ends_at' => null,
                'created' => time(),
            ];
        });
        out(['ok' => true, 'name' => $name]);
    }

    // بدء العداد: من دلوقتي + مدة الباقة
    case 'start':
    // تمديد ١٥ دقيقة بعد سداد التمديد
    case 'extend':
    // إنهاء فوري
    case 'end': {
        if ($method !== 'POST') fail(405, 'method');
        require_admin();
        $name = (string) (input()['name'] ?? '');
        $exp = with_state(function (array &$s) use ($name, $action) {
            if (!isset($s[$name])) fail(404, 'not_found');
            $r = &$s[$name];
            $now = time();
            if ($action === 'start') {
                if ($r['status'] !== 'waiting') fail(409, 'already_started');
                $r['ends_at'] = $now + $r['minutes'] * 60;
            } elseif ($action === 'extend') {
                if ($r['status'] === 'waiting') fail(409, 'not_started');
                $r['ends_at'] = max((int) $r['ends_at'], $now) + EXTENSION_MINUTES * 60;
            } else {
                $r['ends_at'] = $now + 5;
            }
            $r['status'] = 'live';
            return $r['ends_at'];
        });
        set_room_exp($name, $exp);
        out(['ok' => true, 'ends_at' => $exp]);
    }

    default:
        fail(404, 'unknown_action');
}
