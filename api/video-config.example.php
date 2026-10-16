<?php
/**
 * نموذج ملف إعدادات غرفة الفيديو — ماتعدّلش الملف ده هنا.
 *
 * انسخه على Hostinger باسم video-config.php في الفولدر اللي «فوق» public_html
 * (يعني جنب public_html مش جواه)، واكتب فيه القيم الحقيقية.
 * كده المفتاح وكلمة السر مايدخلوش الريبو ومايتفتحوش من المتصفح.
 */
return [
    // Daily → Developers → API key
    'daily_api_key'  => 'PASTE_DAILY_API_KEY_HERE',

    // الجزء الأول من دومين Daily: لو الدومين hamlf.daily.co اكتب hamlf
    'daily_domain'   => 'PASTE_DAILY_SUBDOMAIN_HERE',

    // كلمة سر صفحة الإدارة hamlf.com/video/admin.html — خليها طويلة
    'admin_password' => 'CHANGE_ME_TO_A_LONG_PASSWORD',
];
