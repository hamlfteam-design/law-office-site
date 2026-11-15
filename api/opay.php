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

require_once __DIR__ . '/video-lib.php';

/** رقم من خارج مصر؟ (+ أو 00 بكود غير 20) — أضيفت 2026-11-15 */
function phone_is_intl(string $p): bool {
    $d = preg_replace('/[^0-9+]/', '', $p);
    if (strpos($d, '00') === 0) $d = '+' . substr($d, 2);
    if ($d === '' || $d[0] !== '+') return false;
    return strpos($d, '+20') !== 0;
}

/** الأسعار بالجنيه — لازم تطابق booking.html و en/booking.html */
const PRICES = [
    'office'   => ['amount' => 3000, 'ar' => 'استشارة بالمكتب',                       'en' => 'Office consultation'],
    'criminal' => ['amount' => 20000, 'ar' => 'فحص مستندي ورأي في جناية',              'en' => 'Felony case — document review & opinion'],
    'cassation'=> ['amount' => 20000, 'ar' => 'فحص مستندي ورأي مكتوب في نقض',          'en' => 'Cassation appeal — document review & written opinion'],
    'written'  => ['amount' => 5000, 'ar' => 'رد مكتوب في قضية مدنية + بحث مستندي',    'en' => 'Written consultation'],
    'video20'  => ['amount' => 2000, 'ar' => 'جلسة أونلاين — 20 دقيقة',                'en' => 'Online session — 20 minutes'],
    'video30'  => ['amount' => 3000, 'ar' => 'جلسة أونلاين — 30 دقيقة',                'en' => 'Online session — 30 minutes'],
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
            // جلسة فيديو مدفوعة: غرفة Daily تلقائياً للميعاد المحجوز (2026-11-15)
            if ($o['status'] === 'SUCCESS' && empty($o['room']) && strpos($o['type'], 'video') === 0
                && ($o['booking']['app'] ?? '') === 'daily' && !empty($o['booking']['start_ts'])) {
                $o['room'] = vl_create_room($o['booking']['name'], (int) substr($o['type'], 5), (int) $o['booking']['start_ts']) ?? '';
            }
            if ($o['status'] === 'SUCCESS' && empty($o['notified'])) {
                $o['notified'] = notify_office($ref, $o);
            }
            if ($o['status'] === 'SUCCESS' && empty($o['clientNotified'])) {
                $o['clientNotified'] = notify_client($ref, $o);
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
        'وسيلة الجلسة: ' . (($b['app'] ?? '') === 'daily' ? 'فيديو عبر رابط المؤسسة (Daily)' : (($b['app'] ?? '') === 'phone' ? 'مكالمة صوتية' : ($b['app'] ?? ''))),
        'رابط الجلسة: ' . (($o['room'] ?? '') !== '' ? $o['room'] : '—'),
        'لغة التواصل المفضلة: ' . ((($b['pref_lang'] ?? '') === 'en') ? 'English' : 'العربية'),
        'الجنسية: ' . ((($b['nationality'] ?? '') === 'non-egyptian') ? 'غير مصري' : 'مصري')
            . (!empty($b['phone_intl']) && ($b['nationality'] ?? '') !== 'non-egyptian' ? ' — ⚠️ رقم الهاتف من خارج مصر: راجع إثبات الجنسية' : ''),
        'الموضوع: ' . $b['details'],
        '',
        'الوضع: ' . (cfg()['mode'] === 'live' ? 'حقيقي' : 'اختبار (Test Mode) — مفيش فلوس حقيقية'),
    ];
    $subject = '=?UTF-8?B?' . base64_encode('حجز مدفوع عبر OPay — ' . $ref) . '?=';
    $headers = "MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nFrom: hamlf.com <info@hamlf.com>\r\n";
    return @mail($to, $subject, implode("\n", $lines), $headers);
}

function ar_digits(string $s): string {
    return strtr($s, ['0'=>'٠','1'=>'١','2'=>'٢','3'=>'٣','4'=>'٤','5'=>'٥','6'=>'٦','7'=>'٧','8'=>'٨','9'=>'٩']);
}

/** إيميل تأكيد للعميل نفسه — بس لو كاتب إيميل صحيح في الحجز */
function notify_client(string $ref, array $o): bool {
    $b = $o['booking'];
    $to = $b['email'] ?? '';
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) return false;
    $en = (($b['pref_lang'] ?? '') !== '') ? $b['pref_lang'] === 'en' : (($o['lang'] ?? 'ar') === 'en');
    $room = (string) ($o['room'] ?? '');
    $service = PRICES[$o['type']][$en ? 'en' : 'ar'] ?? $o['label'];
    $test = cfg()['mode'] !== 'live';
    if ($en) {
        $subject = 'Your booking is confirmed — Dr. Hassan Abdel Moneim Hassan Law Firm';
        $lines = [
            'Dear ' . $b['name'] . ',',
            '',
            'Welcome. We are glad to stand by your side, to help you and to protect your rights. We value your trust, and your rights are in safe hands with us.',
            '',
            'We have received your payment and your service is booked:',
            '• Service: ' . $service,
            '• Amount paid: EGP ' . number_format((float)$o['amount']),
            '• Requested appointment: ' . ($b['appointment'] !== '' ? $b['appointment'] : '—'),
            '• Reference: ' . $ref,
            '',
            ...($room !== '' ? ['Your video session link (opens at the appointment time; we will also email you a reminder 10 minutes before):', $room, ''] : []),
            'The office will contact you on WhatsApp to confirm your appointment. Please keep your reference number.',
            'For any enquiry: WhatsApp +20 120 855 5806 or info@hamlf.com',
            '',
            'Your opinion matters to us — you can rate the firm on Google: https://hamlf.com/review/',
            '',
            'Kind regards,',
            'Dr. Hassan Abdel Moneim Hassan — Attorneys & Counsellors',
            'https://hamlf.com',
        ];
        if ($test) array_unshift($lines, '[TEST MODE — no real payment was made]', '');
    } else {
        $subject = 'تم حجز خدمتك — مؤسسة د. حسن عبد المنعم حسن';
        $lines = [
            'الأستاذ/ة ' . $b['name'] . '،',
            '',
            'مرحباً بك. يسعدنا أن نكون إلى جانبك، وأن نساعدك ونحافظ على حقوقك. ثقتك بنا محل تقديرنا، وحقك أمانة عندنا.',
            '',
            'تم استلام سدادك وحجز خدمتك بنجاح:',
            '• الخدمة: ' . ar_digits($service),
            '• المبلغ المدفوع: ' . ar_digits(number_format((float)$o['amount'], 0, '', '٬')) . ' جنيه',
            '• الميعاد المطلوب: ' . ($b['appointment'] !== '' ? ar_digits($b['appointment']) : '—'),
            '• رقم المرجع: ' . $ref,
            '',
            ...($room !== '' ? ['رابط جلسة الفيديو (يُفتح في ميعاد الجلسة، وسيصلك تذكير على الإيميل قبلها بـ١٠ دقائق):', $room, ''] : []),
            'سيتواصل معك المكتب على واتساب لتأكيد الميعاد، ونرجو الاحتفاظ برقم المرجع.',
            'للاستفسار: واتساب ‎+20 120 855 5806‎ أو info@hamlf.com',
            '',
            'رأيك يهمنا، ويسعدنا تقييمك للمؤسسة على جوجل: https://hamlf.com/review/',
            '',
            'مع خالص التحية،',
            'مؤسسة د. حسن عبد المنعم حسن — محامون ومستشارون',
            'https://hamlf.com',
        ];
        if ($test) array_unshift($lines, '[وضع الاختبار — لم يتم سداد أي مبلغ حقيقي]', '');
    }
    $headers = "MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n"
             . "From: =?UTF-8?B?" . base64_encode($en ? 'Dr. Hassan Abdel Moneim Hassan Law Firm' : 'مؤسسة د. حسن عبد المنعم حسن') . "?= <info@hamlf.com>\r\n"
             . "Reply-To: info@hamlf.com\r\n";
    return @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', implode("\n", $lines), $headers);
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
        'pref_lang'   => (($in['pref_lang'] ?? '') === 'en') ? 'en' : 'ar',
        'nationality' => (($in['nationality'] ?? '') === 'non-egyptian') ? 'non-egyptian' : 'egyptian',
    ];
    if ($booking['name'] === '' || $booking['phone'] === '') fail(400, 'missing_name_phone');
    $booking['phone_intl'] = phone_is_intl($booking['phone']);
    // زيارة المكتب حضورية بالقاهرة: مش متاحة لرقم من خارج مصر (يختار جلسة أونلاين)
    if ($type === 'office' && $booking['phone_intl']) fail(400, 'office_requires_egypt_phone');
    // فيديو = رابط المؤسسة (Daily) أو مكالمة صوتية فقط؛ والفيديو محتاج إيميل للرابط والتذكير
    if (strpos($type, 'video') === 0) {
        if (!in_array($booking['app'], ['daily', 'phone'], true)) $booking['app'] = 'daily';
        if ($booking['app'] === 'daily' && !filter_var($booking['email'], FILTER_VALIDATE_EMAIL)) fail(400, 'email_required_for_video');
    }
    // ميعاد البداية بتوقيت القاهرة «YYYY-MM-DD HH:MM» → epoch (للغرفة والتذكير)
    $st = DateTime::createFromFormat('Y-m-d H:i', (string) ($in['start'] ?? ''), new DateTimeZone('Africa/Cairo'));
    $booking['start_ts'] = $st ? $st->getTimestamp() : 0;

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
