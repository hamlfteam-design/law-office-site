<?php
/**
 * بلد الزائر (تقريبي) لاختيار الإجابة المبدئية لسؤال الجنسية في صفحة الحجز.
 *
 * GET api/geo.php  →  {"country":"EG"}  أو  {"country":""} لو مش معروف
 *
 * - بيرجّع كود البلد بس (حرفين). مابيحفظش الـ IP ولا أي بيانات عن الزائر.
 * - بيقرأ البلد من هيدرات شبكة التوزيع/السيرفر لو موجودة.
 * - لو في ملف قاعدة بيانات بلاد (GeoLite2-Country.mmdb) جنب ملف الإعدادات
 *   ومكتبة maxmind/geoip2 متركبة، بيستخدمها. غير كده بيرجّع "" والصفحة
 *   بتعتمد على توقيت الجهاز.
 * - الإجابة دي مبدئية بس: العميل بيختار جنسيته بنفسه، ورقم الهاتف بيأكدها.
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: private, no-store');
header('X-Robots-Tag: noindex, nofollow');

function clean_cc($v): string {
    $v = strtoupper(trim((string)$v));
    return preg_match('/^[A-Z]{2}$/', $v) && $v !== 'XX' && $v !== 'T1' ? $v : '';
}

$cc = '';
foreach ([
    'HTTP_CF_IPCOUNTRY',          // Cloudflare
    'HTTP_X_COUNTRY_CODE',
    'HTTP_X_COUNTRY',
    'HTTP_X_GEO_COUNTRY',
    'HTTP_X_HCDN_COUNTRY',
    'HTTP_X_HCDN_COUNTRY_CODE',
    'HTTP_GEOIP_COUNTRY_CODE',
    'GEOIP_COUNTRY_CODE',          // mod_geoip
    'MM_COUNTRY_CODE',             // mod_maxminddb
] as $k) {
    if (!empty($_SERVER[$k])) { $cc = clean_cc($_SERVER[$k]); if ($cc) break; }
}

if (!$cc) {
    $base = dirname($_SERVER['DOCUMENT_ROOT'] ?? __DIR__ . '/..');   // نفس مكان opay-config.php (خارج public_html)
    $db = $base . '/GeoLite2-Country.mmdb';
    $autoload = $base . '/vendor/autoload.php';
    if (is_file($db) && is_file($autoload)) {
        try {
            require_once $autoload;
            $ip = $_SERVER['REMOTE_ADDR'] ?? '';
            if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
                $ip = trim(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'])[0]);
            }
            if (filter_var($ip, FILTER_VALIDATE_IP)) {
                $reader = new \GeoIp2\Database\Reader($db);
                $cc = clean_cc($reader->country($ip)->country->isoCode ?? '');
            }
        } catch (\Throwable $e) { $cc = ''; }
    }
}

echo json_encode(['country' => $cc]);
