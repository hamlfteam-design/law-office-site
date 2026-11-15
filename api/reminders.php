<?php
/**
 * تذكير الجلسات الأونلاين قبل الميعاد بـ١٠ دقائق — أضيف 2026-11-15.
 *
 * بيشتغل من Cron Job على Hostinger كل دقيقة (hPanel → Advanced → Cron Jobs):
 *   php /home/<USER>/public_html/api/reminders.php
 * من سطر الأوامر بس — لو اتفتح من المتصفح بيرجّع 403.
 *
 * لكل حجز فيديو مدفوع (OPay) فاضل على ميعاده ١٠ دقائق أو أقل ولسه ماتبعتلوش تذكير:
 *   - إيميل للعميل (بلغته المفضلة) فيه رابط الجلسة.
 *   - إيميل للمكتب (notify_email) بنفس الرابط واسم العميل.
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
date_default_timezone_set('Africa/Cairo');

const REMIND_BEFORE = 10 * 60;

$path = getenv('HAMLF_OPAY_CONFIG') ?: dirname(__DIR__, 2) . '/opay-config.php';
if (!is_file($path)) { fwrite(STDERR, "opay-config.php not found: $path\n"); exit(1); }
$cfg = require $path;
$ordersFile = $cfg['orders_file'] ?? dirname($path) . '/opay-orders.json';
$office = $cfg['notify_email'] ?? 'info@hamlf.com';
if (!is_file($ordersFile)) exit(0);

function send_mail(string $to, string $subject, array $lines, string $fromName): bool {
    $h = "MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n"
       . 'From: =?UTF-8?B?' . base64_encode($fromName) . "?= <info@hamlf.com>\r\nReply-To: info@hamlf.com\r\n";
    return @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', implode("\n", $lines), $h);
}

$fh = fopen($ordersFile, 'c+');
flock($fh, LOCK_EX);
$raw = stream_get_contents($fh);
$orders = $raw ? (json_decode($raw, true) ?: []) : [];
$now = time();
$changed = false;

foreach ($orders as $ref => &$o) {
    if (($o['status'] ?? '') !== 'SUCCESS' || !empty($o['reminded']) || (empty($o['room']) && ($o['booking']['app'] ?? '') !== 'facetime')) continue;
    $ts = (int) ($o['booking']['start_ts'] ?? 0);
    if ($ts <= 0 || $now < $ts - REMIND_BEFORE || $now > $ts + 15 * 60) continue;

    $b = $o['booking'];
    $time = date('g:i', $ts) . (date('G', $ts) < 12 ? ' AM' : ' PM');
    $en = ($b['pref_lang'] ?? 'ar') === 'en';
    $ft = empty($o['room']);
    $how = $ft ? ($en ? 'Please FaceTime us at the appointment time on: +201067772512' : 'في الميعاد اتصل بنا فيس تايم على الرقم: ‎+201067772512‎') : $o['room'];
    $howOffice = $ft ? 'FaceTime — العميل هيتصل على +201067772512' : $o['room'];
    if (filter_var($b['email'] ?? '', FILTER_VALIDATE_EMAIL)) {
        if ($en) {
            send_mail($b['email'], 'Reminder: your online session starts in 10 minutes', [
                'Dear ' . $b['name'] . ',', '',
                'This is a reminder that your online session with Dr. Hassan Abdel Moneim Hassan starts at ' . $time . ' Cairo time.',
                ($ft ? 'Please get ready:' : 'Please get ready and join through this link:'), $how, '',
                'Tel / WhatsApp: +201208555806', 'Kind regards,', 'Dr. Hassan Abdel Moneim Hassan — Attorneys & Counsellors',
            ], 'Dr. Hassan Abdel Moneim Hassan Law Firm');
        } else {
            send_mail($b['email'], 'تذكير: جلستك الأونلاين تبدأ بعد ١٠ دقائق', [
                'الأستاذ/ة ' . $b['name'] . '،', '',
                'نذكّرك بأن جلستك الأونلاين مع المستشار د. حسن عبد المنعم حسن تبدأ الساعة ' . $time . ' بتوقيت القاهرة.',
                ($ft ? 'من فضلك استعد:' : 'من فضلك استعد وادخل من الرابط التالي:'), $how, '',
                'Tel / WhatsApp: +201208555806', 'مع خالص التحية،', 'مؤسسة د. حسن عبد المنعم حسن — محامون ومستشارون',
            ], 'مؤسسة د. حسن عبد المنعم حسن');
        }
    }
    send_mail($office, 'تذكير: جلسة أونلاين بعد ١٠ دقائق — ' . $b['name'], [
        'جلسة أونلاين الساعة ' . $time . ' بتوقيت القاهرة.',
        'العميل: ' . $b['name'] . ' — ' . $b['phone'],
        'الخدمة: ' . ($o['label'] ?? ''),
        'لغة التواصل: ' . ($en ? 'English' : 'العربية'),
        'وسيلة الجلسة: ' . $howOffice,
        'إدارة العداد: https://hamlf.com/video/admin.html',
        'المرجع: ' . $ref,
    ], 'hamlf.com');
    $o['reminded'] = date('c');
    $changed = true;
}
unset($o);

if ($changed) {
    ftruncate($fh, 0); rewind($fh);
    fwrite($fh, json_encode($orders, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    fflush($fh);
}
flock($fh, LOCK_UN);
fclose($fh);
