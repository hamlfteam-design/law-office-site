<?php
/**
 * نموذج ملف إعدادات ربط Claude (api/mcp.php) — ماتعدّلش الملف ده هنا.
 *
 * انسخه على Hostinger باسم mcp-config.php فى الفولدر اللى «فوق» public_html
 * (جنب opay-config.php و video-config.php)، واكتب فيه القيم الحقيقية.
 * الريبو عام، فالقيم دى ماتدخلش الريبو أبداً.
 *
 * رابط الربط اللى بيتحط فى claude.ai (Settings ← Connectors ← Add custom connector):
 *   https://hamlf.com/api/mcp.php/<connector_key>
 */
return [
    // مفتاح عشوائى طويل (40 حرف على الأقل) — هو كلمة سر الربط، وأى حد معاه الرابط يقرا بيانات المكتب.
    // لتغييره: اكتب مفتاح جديد هنا وحدّث الرابط فى Claude؛ الرابط القديم بيقف فوراً.
    'connector_key' => 'PASTE_LONG_RANDOM_KEY_HERE',

    // مسار ملف مفتاح الخدمة (Firebase Console ← Project settings ← Service accounts ← Generate new private key)
    // حطه برّه public_html. الأفضل تعمل service account منفصل بدور «Cloud Datastore Viewer» (قراءة بس)
    // من Google Cloud Console ← IAM ← Service accounts، بدل مفتاح firebase-adminsdk اللى بيقدر يكتب.
    'service_account_file' => __DIR__ . '/hamlf-mcp-service-account.json',

    // مكتب Firestore (نفس OFFICE_ID فى portal/portal-config.js)
    'office_id' => 'office_UDdH9ctTHcd3',
];
