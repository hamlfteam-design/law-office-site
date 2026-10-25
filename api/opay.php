<?php
/**
 * بوابة الدفع الأونلاين لحجوزات hamlf.com عبر OPay Checkout (Cashier).
 *
 * المسارات:
 *   POST api/opay.php?action=create    ← صفحة الحجز: ينشئ طلب دفع ويرجّع رابط صفحة OPay
 *   POST api/opay.php?action=callback  ← إشعار OPay (Webhook) بعد الدفع
 *   GET  api/opay.php?action=status&ref=…  ← صفحة النتيجة: حالة الطلب
 *
 * قواعد الأمان:
 * - المبلغ بيتحدد هنا من جدول الأسعار (PRICES) — أبداً مش من المتصفح.
 * - المفتاح السري في opay-config.php خارج public_html (شوف opay-config.example.php).
 * - أي إشعار من OPay مابنصدّقوش لوحده: بنسأل OPay بنفسنا عن حالة الطلب
 *   (Query Payment Status موقّع بـ HMAC-SHA512) وده اللي بيتسجل.
 * - الطلبات محفوظة في opay-orders.json جنب ملف الإعدادات (برضه خارج public_html).
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');

date_default_timezone_set('Africa/Cairo');

const SITE = 'https://hamlf.com';

/** الأسعار بالجنيه — لازم تطابق booking.html و en/booking.html */
const PRICES = [
    'office'   => ['amount' => 3000, 'ar' => 'استشارة بالمكتب',                       'en' => 'Office consultation'],
    'criminal' => ['amount' => 5000, 'ar' => 'استشارة وفحص ملف قضية جنائية',           'en' => 'Criminal case consultation & file review'],
    'written'  => ['amount' => 5000, 'ar' => 'استشارة مكتوبة',                         'en' => 'Written consultation'],
    'video15'  => ['amount' => 2000, 'ar' => 'فيديو كونفرانس — 15 دقيقة',              'en' => 'Video conference — 15 minutes'],
    'video30'  => ['amount' => 3000, 'ar' => 'فيديو كونفرانس — 30 دقيقة',              'en' => 'Video conference — 30 minutes'],
    'video60'  => ['amount' => 6000, 'ar' => 'فيديو كونفرانس — 60 دقيقة',              'en' => 'Video conference — 60 minutes'],
];

const FINAL_STATUSES = ['SUCCESS', 'FAIL', 'CLOSE'];

/* ---------- أدوات ---------- */

function out(array $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function fail(int $code, string $error): void { out(['ok' => false, 'error' => $error], $code); }

function cfg(): array {
    static $cfg = null;
    if ($cfg !== null) return $cfg;
    $path = getenv('HAMLF_OPAY_CONFIG') ?: dirname($_SERVER['DOCUMENT_ROOT'] ?? __DIR__ . '/..') . '/opay-config.php';
    if (!is_file($path)) fail(500, 'config_missing');
    $cfg = require $path;
    foreach (['merchant_id', 'public_key', 'secret_key'] as $k) {
        if (empty($cfg[$k]) || strpos((string)$cfg[$k], 'PASTE_') === 0) fail(500, 'config_incomplete');
    }
    $cfg['mode'] = ($cfg['mode'] ?? 'sandbox') === 'live' ? 'live' : 'sandbox';
    $cfg['api_base'] = $cfg['api_base'] ?? ($cfg['mode'] === 'live'
        ? 'https://api.opaycheckout.com'
        : 'https://sandboxapi.opaycheckout.com');
    $cfg['orders_file'] = $cfg['orders_file'] ?? dirname($path) . '/opay-orders.json';
    return $cfg;
}

function input(): array {
    $raw = file_get_contents('php://input') ?: '';
    $json = json_decode($raw, true);
    return is_array($json) ? $json : $_POST;
}

function clean(?string $s, int $max): string {
    $s = trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', (string)$s) ?? '');
    return mb_substr($s, 0, $max);
}

/* ---------- تخزين الطلبات (ملف JSON بقفل) ---------- */

function with_orders(callable $fn) {
    $fh = fopen(cfg()['orders_file'], 'c+');
    if (!$fh) fail(500, 'orders_unwritable');
    flock($fh, LOCK_EX);
    $raw = stream_get_contents($fh);
    $orders = $raw ? (json_decode($raw, true) ?: []) : [];
    $result = $fn($orders);
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, json_encode($orders, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    return $result;
}

/* ---------- OPay ---------- */

function opay_post(string $path, string $body, string $bearer): array {
    $ch = curl_init(cfg()['api_base'] . $path);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $body,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 25,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $bearer,
            'MerchantId: ' . cfg()['merchant_id'],
        ],
    ]);
    $resp = curl_exec($ch);
    $err = curl_error($ch);
    curl_close($ch);
    if ($resp === false) return ['code' => 'net', 'message' => $err];
    $json = json_decode($resp, true);
    return is_array($json) ? $json : ['code' => 'bad_json', 'message' => mb_substr($resp, 0, 200)];
}

/** الاستعلام الرسمي عن حالة الدفع — موقّع بـ HMAC-SHA512 على نفس نص الطلب المُرسل */
function opay_status(string $ref): ?array {
    $body = json_encode(['country' => 'EG', 'reference' => $ref], JSON_UNESCAPED_SLASHES);
    $sig = hash_hmac('sha512', $body, cfg()['secret_key']);
    $r = opay_post('/api/v1/international/cashier/status', $body, $sig);
    return (($r['code'] ?? '') === '00000' && isset($r['data'])) ? $r['data'] : null;
}

/** يحدّث الطلب من رد OPay، ويبعت إشعار للمكتب مرة واحدة لو الدفع نجح */
function refresh_order(string $ref): ?array {
    $data = opay_status($ref);
    return with_orders(function (array &$orders) use ($ref, $data) {
        if (!isset($orders[$ref])) return null;
        $o = &$orders[$ref];
        if ($data) {
            $paidOk = ($data['status'] ?? '') === 'SUCCESS'
                && (int)($data['amount']['total'] ?? -1) === (int)$o['amount'] * 100
                && ($data['amount']['currency'] ?? '') === 'EGP';
            $o['status'] = ($data['status'] === 'SUCCESS' && !$paidOk) ? 'MISMATCH' : $data['status'];
            $o['orderNo'] = $data['orderNo'] ?? ($o['orderNo'] ?? '');
            $o['checkedAt'] = date('c');
            if ($o['status'] === 'SUCCESS' && empty($o['notified'])) {
                $o['notified'] = notify_office($ref, $o);
            }
        }
        return $o;
    });
}

function notify_office(string $ref, array $o): bool {
    $to = cfg()['notify_email'] ?? '';
    if (!$to) return false;
    $b = $o['booking'];
    $lines = [
        'تم سداد حجز جديد أونلاين عبر OPay',
        '',
        'رقم المرجع: ' . $ref,
        'رقم عملية OPay: ' . ($o['orderNo'] ?? ''),
        'المبلغ: ' . $o['amount'] . ' جنيه',
        'الخدمة: ' . $o['label'],
        'الميعاد: ' . $b['appointment'],
        'الاسم: ' . $b['name'],
        'الهاتف: ' . $b['phone'],
        'البريد: ' . $b['email'],
        'القطاع: ' . $b['category'],
        'تفضيل الرد: ' . $b['followup'],
        'تطبيق المكالمة: ' . $b['app'],
        'الموضوع: ' . $b['details'],
        '',
        'الوضع: ' . (cfg()['mode'] === 'live' ? 'حقيقي' : 'اختبار (Test Mode) — مفيش فلوس حقيقية'),
    ];
    $subject = '=?UTF-8?B?' . base64_encode('حجز مدفوع عبر OPay — ' . $ref) . '?=';
    $headers = "MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nFrom: hamlf.com <info@hamlf.com>\r\n";
    return @mail($to, $subject, implode("\n", $lines), $headers);
}

/* ---------- المسارات ---------- */

$action = $_GET['action'] ?? '';

if ($action === 'ping') { out(['ok' => true, 'live' => cfg()['mode'] === 'live']); }   // صفحة الحجز بتظهر زر OPay بس لو الإعدادات موجودة

if ($action === 'create') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail(405, 'method');
    $in = input();
    $type = (string)($in['type'] ?? '');
    if ($type === 'video') $type = 'video' . (int)($in['mins'] ?? 0);
    if (!isset(PRICES[$type])) fail(400, 'bad_type');
    $lang = ($in['lang'] ?? 'ar') === 'en' ? 'en' : 'ar';

    $booking = [
        'name'        => clean($in['name'] ?? '', 120),
        'phone'       => clean($in['phone'] ?? '', 40),
        'email'       => clean($in['email'] ?? '', 120),
        'category'    => clean($in['category'] ?? '', 120),
        'details'     => clean($in['details'] ?? '', 2000),
        'followup'    => clean($in['followup'] ?? '', 60),
        'app'         => clean($in['app'] ?? '', 40),
        'appointment' => clean($in['appointment'] ?? '', 120),
    ];
    if ($booking['name'] === '' || $booking['phone'] === '') fail(400, 'missing_name_phone');

    $price = PRICES[$type];
    $ref = 'HB' . date('ymdHis') . strtoupper(bin2hex(random_bytes(3)));
    $base = SITE . ($lang === 'en' ? '/en' : '');
    $payload = [
        'country'     => 'EG',
        'reference'   => $ref,
        'amount'      => ['total' => $price['amount'] * 100, 'currency' => 'EGP'],
        'returnUrl'   => $base . '/pay/result.html?ref=' . $ref,
        'cancelUrl'   => $base . '/pay/result.html?ref=' . $ref . '&cancel=1',
        'callbackUrl' => SITE . '/api/opay.php?action=callback',
        'userClientIP'=> $_SERVER['REMOTE_ADDR'] ?? '',
        'expireAt'    => 30,
        'product'     => ['name' => $price[$lang], 'description' => 'hamlf.com — ' . $price[$lang]],
        'userInfo'    => array_filter([
            'userName'   => $booking['name'],
            'userMobile' => $booking['phone'],
            'userEmail'  => filter_var($booking['email'], FILTER_VALIDATE_EMAIL) ? $booking['email'] : null,
        ]),
    ];

    with_orders(function (array &$orders) use ($ref, $type, $price, $lang, $booking) {
        $orders[$ref] = [
            'createdAt' => date('c'), 'status' => 'INITIAL', 'type' => $type,
            'amount' => $price['amount'], 'label' => $price['ar'], 'lang' => $lang,
            'mode' => cfg()['mode'], 'booking' => $booking,
        ];
    });

    $r = opay_post('/api/v1/international/cashier/create',
        json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        cfg()['public_key']);

    if (($r['code'] ?? '') !== '00000' || empty($r['data']['cashierUrl'])) {
        with_orders(function (array &$orders) use ($ref, $r) {
            $orders[$ref]['status'] = 'CREATE_FAILED';
            $orders[$ref]['error'] = ($r['code'] ?? '') . ' ' . ($r['message'] ?? '');
        });
        fail(502, 'opay_create_failed');
    }
    with_orders(function (array &$orders) use ($ref, $r) {
        $orders[$ref]['orderNo'] = $r['data']['orderNo'] ?? '';
    });
    out(['ok' => true, 'ref' => $ref, 'cashierUrl' => $r['data']['cashierUrl']]);
}

if ($action === 'callback') {
    // OPay بيبعت {payload:{reference,status,...}, sha512, type}. مابنعتمدش على محتواه —
    // بناخد رقم المرجع بس ونسأل OPay بنفسنا (refresh_order).
    $in = input();
    $ref = (string)($in['payload']['reference'] ?? '');
    if (preg_match('/^HB[0-9A-F]{18}$/', $ref)) refresh_order($ref);
    out(['ok' => true]);
}

if ($action === 'status') {
    $ref = (string)($_GET['ref'] ?? '');
    if (!preg_match('/^HB[0-9A-F]{18}$/', $ref)) fail(400, 'bad_ref');
    $o = with_orders(function (array &$orders) use ($ref) { return $orders[$ref] ?? null; });
    if (!$o) fail(404, 'not_found');
    if (!in_array($o['status'], FINAL_STATUSES, true) && $o['status'] !== 'MISMATCH') {
        $o = refresh_order($ref) ?? $o;
    }
    // مفيش بيانات شخصية في الرد — بس اللي صفحة النتيجة محتاجاه
    out([
        'ok' => true, 'ref' => $ref, 'status' => $o['status'], 'amount' => $o['amount'],
        'label' => $o['label'], 'appointment' => $o['booking']['appointment'] ?? '',
        'test' => ($o['mode'] ?? '') !== 'live',
    ]);
}

fail(404, 'unknown_action');
