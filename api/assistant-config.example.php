<?php
/**
 * نموذج إعدادات «مساعد المكتب» (الإيميل) — ماتعدّلش الملف ده هنا.
 *
 * انسخه على Hostinger باسم assistant-config.php فى الفولدر اللى «فوق» public_html
 * (جنب whatsapp-config.php و handoff-config.php)، واكتب القيم الحقيقية.
 * الريبو عام: الملف ده بقيمه الحقيقية عمره ما يدخل الريبو.
 * الخطوات بالتفصيل: docs/assistant-setup.md
 */
return [
    // console.anthropic.com ← API Keys ← Create key
    'anthropic_api_key' => 'PASTE_ANTHROPIC_API_KEY_HERE',
    'model'  => 'claude-opus-5-5',   // ممكن تغيّره لـ claude-sonnet-5-5 أو claude-haiku-5-5 لو عايز تكلفة أقل
    'effort' => 'low',               // low يكفى للتصنيف والمسودات

    // بريد المكتب على Hostinger
    'mail_user'     => 'info@hamlf.com',
    'mail_password' => 'PASTE_MAILBOX_PASSWORD_HERE',
    'imap_host' => 'imap.hostinger.com', 'imap_port' => 993, 'imap_ssl' => true,
    'smtp_host' => 'smtp.hostinger.com', 'smtp_port' => 465, 'smtp_secure' => 'ssl',
    'from_name' => 'مؤسسة د. حسن عبد المنعم حسن',

    // مسار autoload للمكتبات اللى رفعتها خارج public_html (فك assistant-vendor.zip هناك)
    'vendor_autoload' => '/home/USER/assistant-lib/vendor/autoload.php',

    // كلمة سر صفحة المراجعة hamlf.com/assistant/inbox.html — خليها طويلة
    'admin_password' => 'CHANGE_ME_TO_A_LONG_PASSWORD',

    // للتشغيل الدورى عن طريق رابط (لو مش هتستخدم php من Cron): نص عشوائى ٢٤ حرف أو أكتر، أو سيبه ''
    'cron_token' => '',

    // ربط «غرفة العمليات»: نفس agent_token اللى فى handoff-config.php — أو سيبهم '' لو لسه مش متشغّلة
    'handoff_url'   => 'https://hamlf.com/api/handoff.php',
    'handoff_token' => '',

    // عناوين مايتردش عليها (جزء من الإيميل يكفى)، مثلاً: ['opay', 'formsubmit.co']
    'skip_senders' => [],

    // معلومات المكتب اللى المساعد مسموح له يستخدمها فى الردود — أى حاجة مش هنا هيقول «المكتب هيأكد»
    'office_profile' => <<<TXT
- العنوان: ٤٨ شارع قصر النيل، ميدان مصطفى كامل، عابدين، وسط البلد، القاهرة — الدور السادس، مكتب ٢٥.
- واتساب/تليفون: ‎+20 120 855 5806 — إيميل: info@hamlf.com
- حجز استشارة (عربى): https://hamlf.com/booking.html
- Booking (English): https://hamlf.com/en/booking.html
- مواعيد المكتب: (اكتبها هنا)
- أسعار الاستشارات: زى صفحة الحجز بالظبط (اكتبها هنا لو عايز المساعد يذكرها)
TXT,
];
