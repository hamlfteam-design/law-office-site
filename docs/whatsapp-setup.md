# واتساب المكتب: التشغيل والإعداد

> **مفيش في الملف ده أي توكن أو باسورد.** الأسرار كلها في `whatsapp-config.php` على Hostinger، «فوق» `public_html`.

## المكوّنات

| الملف | الدور |
|---|---|
| `api/whatsapp.php` | الـ Webhook اللي بيستقبل من Meta، وAPI صفحة الإدارة، وAPI مساعد التواصل |
| `api/whatsapp-config.example.php` | نموذج ملف الإعدادات. بيتنسخ على Hostinger باسم `whatsapp-config.php` |
| `whatsapp/admin.html` | صندوق الوارد للإدارة على hamlf.com/whatsapp/admin.html، محمي بكلمة سر |
| `whatsapp.sqlite` | قاعدة الرسايل. بتتعمل لوحدها جنب ملف الإعدادات (خارج `public_html`) |

**الحماية:**
- رسالة Meta مابتتقبلش غير بتوقيع `X-Hub-Signature-256` صحيح.
- ردود الـ API مابتتخزنش في كاش المتصفح (`sw.js`).
- الصفحة والـ API مقفولين على محركات البحث (`robots.txt`).

## خطوات التشغيل (أول مرة)

### ١. حساب Meta
1. **Meta Business Manager:** business.facebook.com باسم المؤسسة. ويُفضّل التوثيق (Business Verification) بالسجل التجاري.
2. **ربط الرقم 01208555806 بالـ API:**
   - **التشغيل المزدوج (Coexistence):** الرقم يفضل شغال على تطبيق واتساب بيزنس في الموبايل وعلى الـ API في نفس الوقت. بيتم عن طريق مزوّد معتمد (Tech Provider) بشاشة Embedded Signup. **اتأكد من المزوّد إن الميزة متاحة في مصر.**
   - **أو** نقل الرقم بالكامل للـ Cloud API (WhatsApp Manager). الرقم هيتشال من التطبيق، والرد هيبقى من صفحة الإدارة بس.
3. **تطبيق Meta:** من developers.facebook.com اعمل تطبيق نوعه **Business**، وضيف منتج **WhatsApp**، واربطه بالحساب والرقم.
4. **توكن دائم:**
   - Business Settings ← System users ← اعمل System user (Admin).
   - Generate token لتطبيقك بصلاحيتي `whatsapp_business_messaging` و`whatsapp_business_management`.
5. **Phone number ID:** من WhatsApp ← API Setup. ده رقم تعريفي، مش رقم الموبايل.
6. **App secret:** من App settings ← Basic.

### ٢. ملف الإعدادات على Hostinger
1. انسخ `api/whatsapp-config.example.php` لفولدر الموقع «فوق» `public_html`، يعني جنب `opay-config.php`، باسم `whatsapp-config.php`.
2. اكتب القيم:
   - `verify_token`: نص عشوائي طويل من اختيارك.
   - `app_secret` و`access_token` و`phone_number_id`: من الخطوة ١.
   - `admin_password`: كلمة سر طويلة لصفحة الإدارة.
   - `agent_token`: سيبه `''` لحد ما تقرر تفعّل مساعد التواصل. وقتها حط نص عشوائي 32 حرف على الأقل.
   - `notify_email`: الإيميل اللي يوصله تنبيه بكل محادثة فيها رسالة جديدة. التنبيه **من غير محتوى الرسالة**.
3. Hostinger لازم يكون مفعّل فيه `pdo_sqlite` و`curl`، وغالبًا مفعّلين افتراضيًا.

### ٣. النشر
ادمج الـ Pull Request في `main`، فـ Hostinger هينشر `api/whatsapp.php` و`whatsapp/admin.html`.

### ٤. ربط الـ Webhook في Meta
WhatsApp ← Configuration ← Webhook:
- **Callback URL:** `https://hamlf.com/api/whatsapp.php`
- **Verify token:** نفس قيمة `verify_token` اللي في ملف الإعدادات.
- اضغط **Verify and save**، وبعدين **Subscribe** على حقل **messages**.

### ٥. تجربة
1. ابعت رسالة لرقم المكتب من موبايل تاني.
2. افتح hamlf.com/whatsapp/admin.html، وادخل بكلمة السر، وهتلاقي المحادثة. ورد عليها.
3. لو مافيش حاجة ظهرت:
   - راجع إن الـ Webhook حالته Verified ومشترك في `messages`.
   - افتح `https://hamlf.com/api/whatsapp.php?action=me`. لو رجع `config_missing` أو `config_incomplete`، يبقى ملف الإعدادات مش في مكانه أو ناقص.

## قواعد Meta اللي لازم تتعرف
- **نافذة الـ 24 ساعة:** الرد الحر مسموح بس خلال 24 ساعة من آخر رسالة العميل. بعدها الصفحة بتقفل زرار الإرسال وبتوضّح السبب. الرد وقتها محتاج **قالب معتمد**، والقوالب لسه **مش مدعومة** في النسخة دي.
- **التكلفة:** الردود جوه النافذة مجانية غالبًا، ورسايل القوالب بتتحاسب بالرسالة حسب Meta.

## مساعد التواصل (Claude)
المساعد بيتعامل مع الـ API بتوكن `agent_token`، والتوكن بيتبعت في هيدر `X-Agent-Token` أو `Authorization: Bearer`.

**المساعد يقدر:**
- `GET ?action=inbox&needs_triage=1`: المحادثات اللي فيها رسايل جديدة لسه ماتصنّفتش.
- `GET ?action=thread&wa=…`: رسايل المحادثة.
- `POST ?action=triage` بالبيانات `{wa, category, route_to, summary}`:
  - `category`: `inquiry` أو `appointment` أو `consultation` أو `case_update` أو `complaint` أو `other`
  - `route_to`: `communications` أو `legal-counsel` أو `admin-assistant` أو `finance-assistant` أو `management`
- `POST ?action=draft` بالبيانات `{wa, body, drafted_by}`: مسودة رد بتظهر للإدارة بإطار ذهبي.

**المساعد مايقدرش يبعت.** الإرسال (`send`) بجلسة الإدارة بس. الإدارة بتراجع المسودة وتعدّلها وتضغط «اعتماد وإرسال».

## لسه مش موجود (مراحل جاية)
- رسايل القوالب، للرد بعد 24 ساعة وللتذكير بالجلسات.
- إرسال صور ومستندات من صفحة الإدارة. الاستقبال والفتح شغالين.
- ربط المحادثة بملف الموكل في تطبيق hamlf (Firestore). الرسايل حاليًا في `whatsapp.sqlite` على Hostinger.
- نسخة احتياطية: انسخ `whatsapp.sqlite` دوريًا مع باقي ملفات الإعدادات.
