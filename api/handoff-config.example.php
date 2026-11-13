<?php
/**
 * نموذج ملف إعدادات طابور التسليم (غرفة العمليات) — ماتعدّلش الملف ده هنا.
 *
 * انسخه على Hostinger باسم handoff-config.php في الفولدر اللي «فوق» public_html
 * (جنب whatsapp-config.php)، واكتب فيه القيم الحقيقية. ماينفعش يدخل الريبو (الريبو عام).
 *
 * خطوات التشغيل: docs/handoff-setup.md
 */
return [
    // مسار ملف مفتاح الخدمة (Service account JSON) لمشروع Firebase — برضه خارج public_html.
    // يُفضّل مفتاح جديد مخصوص للطابور (Firebase Console ← Project settings ← Service accounts ← Generate new private key).
    'service_account_file' => '/home/USER/hamlf-handoff-service-account.json',

    'project_id' => 'profissional-lawyer-updat',
    'office_id'  => 'office_UDdH9ctTHcd3',

    // توكن المساعدين (Claude): نص عشوائي طويل (٣٢ حرف على الأقل). المساعدين بيبعتوه في هيدر X-Agent-Token.
    'agent_token' => 'CHANGE_ME_LONG_RANDOM_AGENT_TOKEN',
];
