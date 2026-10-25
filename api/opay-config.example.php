<?php
/**
 * نموذج ملف إعدادات بوابة الدفع OPay — ماتعدّلش الملف ده هنا.
 *
 * انسخه على Hostinger باسم opay-config.php في الفولدر اللي «فوق» public_html
 * (جنب public_html مش جواه — نفس مكان video-config.php)، واكتب فيه القيم الحقيقية.
 * كده المفتاح السري مايدخلش الريبو (الريبو عام) ومايتفتحش من المتصفح.
 *
 * القيم من داشبورد OPay: Account Details → Business (Merchant ID)
 *                        Account Details → API Keys & Web Hook (Public / Secret Key)
 */
return [
    // 'sandbox' = وضع الاختبار (Test Mode) — 'live' بعد تفعيل الحساب واستبدال المفاتيح بمفاتيح الإنتاج
    'mode'         => 'sandbox',

    'merchant_id'  => 'PASTE_MERCHANT_ID_HERE',
    'public_key'   => 'PASTE_PUBLIC_KEY_HERE',   // يبدأ بـ OPAYPUB
    'secret_key'   => 'PASTE_SECRET_KEY_HERE',   // يبدأ بـ OPAYPRV — سري جداً

    // الإيميل اللي يوصله إشعار بكل عملية دفع ناجحة
    'notify_email' => 'info@hamlf.com',
];
