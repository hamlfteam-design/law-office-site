<?php
/**
 * نموذج ملف إعدادات واتساب المكتب (WhatsApp Business Cloud API) — ماتعدّلش الملف ده هنا.
 *
 * انسخه على Hostinger باسم whatsapp-config.php في الفولدر اللي «فوق» public_html
 * (جنب public_html مش جواه — نفس مكان opay-config.php و video-config.php)، واكتب فيه القيم الحقيقية.
 * كده التوكن والأسرار مايدخلوش الريبو (الريبو عام) ومايتفتحوش من المتصفح.
 * قاعدة الرسايل (whatsapp.sqlite) بتتعمل تلقائياً جنب الملف ده.
 *
 * خطوات الحصول على القيم: docs/whatsapp-setup.md
 */
return [
    // كلمة بتختارها إنت (أي نص طويل عشوائي) وتكتبها بنفسها في Meta → WhatsApp → Configuration → Verify token
    'verify_token'    => 'CHANGE_ME_RANDOM_VERIFY_TOKEN',

    // Meta for Developers → تطبيقك → App settings → Basic → App secret (للتأكد إن الرسايل جاية من Meta فعلاً)
    'app_secret'      => 'PASTE_APP_SECRET_HERE',

    // توكن دائم من System User في Business Manager بصلاحية whatsapp_business_messaging
    'access_token'    => 'PASTE_PERMANENT_ACCESS_TOKEN_HERE',

    // WhatsApp → API Setup → Phone number ID (رقم، مش رقم الموبايل نفسه)
    'phone_number_id' => 'PASTE_PHONE_NUMBER_ID_HERE',

    'graph_version'   => 'v21.0',

    // كلمة سر صفحة الإدارة hamlf.com/whatsapp/admin.html — خليها طويلة
    'admin_password'  => 'CHANGE_ME_TO_A_LONG_PASSWORD',

    // توكن مساعد التواصل (Claude): بيقرا الرسايل ويكتب مسودات وتصنيف بس — مابيبعتش.
    // سيبه فاضي '' لو مش عايز تفعّل وصول المساعد.
    'agent_token'     => '',

    // إيميل يوصله تنبيه (من غير محتوى الرسالة) لما محادثة يوصل فيها رسالة جديدة — '' لإيقافه
    'notify_email'    => 'info@hamlf.com',
];
