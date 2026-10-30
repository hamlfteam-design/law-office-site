# هاندأوف: بوابة الموكلين (hamlf.com) — أكتوبر 2026

> ملخص كامل لجلسة إصلاح البوابة (15–16 أكتوبر 2026) وكل اللي اتنفّذ، مع حالة كل حاجة لحد 30 أكتوبر 2026.
> **مفيش في الملف ده أي باسورد أو مفتاح.** الأسرار كلها متخزّنة في أماكنها (GitHub Secrets، Firebase، Hostinger).

---

## ١. المشكلة الأصلية

**بلاغ المكتب:**
- العملاء المسجّلين بإيميل مش Gmail مش عارفين يدخلوا حساباتهم.
- لما بنغيّر إيميل الموكل لـGmail، بيدخل بس بتظهر له «مفيش قضايا مرتبطة بحسابك»، رغم إن عنده قضايا.

**الأسباب اللي اتعرفت:**
1. **إيميلات Firebase مش بتوصل:** رابط استرجاع كلمة السر ورابط التأكيد كانوا بيتبعتوا من المرسل الافتراضي `noreply@profissional-lawyer-updat.firebaseapp.com`، ودول ماكانوش بيوصلوا. اتضح إنهم ماكانوش بيوصلوا حتى لـGmail.
2. **إيميلات الموكلين ناقصة في تطبيق المكتب:** من 1514 موكل، **131 بس** ليهم إيميل. حقل `matchEmails` موجود عند 131، وحقلا `email`/`emails` جوه بيانات الموكل فاضيين عند الباقي.
3. **ربط القضايا بالحساب بطيء:** القضية بتظهر للموكل عن طريق `clientUids` (معرّف حسابه)، وده بيتحدّث من تطبيق المكتب كل 6 ساعات، وبس لو التطبيق مفتوح. ولما إيميل الموكل يتغيّر، سجلّه بيفضل مربوط بالحساب القديم، فالحساب الجديد مايشوفش حاجة.
4. **صفحة الدخول كانت بترفض الإيميلات اللي فيها أرقام عربية (١٢٣) أو مسافات:** حقل `type="email"` في المتصفح كان بيرفضها قبل ما الكود يشتغل، وإصلاح الأرقام العربية القديم (commit `8f70964`) كان اتشال.

---

## ٢. شكل النظام (للرجوع ليه)

**المكوّنات:**
- **الموقع:** مستودع `hamlfteam-design/law-office-site`، منشور على GitHub Pages على `hamlf.com`، واتأكّدنا إن التعديلات ظهرت على الموقع.
- **صفحة الدخول:**
  - `portal/index.html` (عربي)
  - `en/portal/index.html` (إنجليزي، للأجانب: جواز سفر أو إقامة)
- **صفحة «قضاياي»:** `portal/dashboard.html` و`en/portal/dashboard.html`.
- **الإعدادات:** `portal/portal-config.js`. المشروع `profissional-lawyer-updat`، والمكتب `office_UDdH9ctTHcd3`.

**بيانات Firestore:**

| المسار | الحقول المهمة |
|---|---|
| `offices/{office}/records/clients/items/{id}` | `matchEmails`، `clientUid`، `json` (فيه `name`، `email`، `emails`، `idType`…) |
| `offices/{office}/records/cases/items/{id}` | `clientUids`، `collabEmails`، **`clientEmails` (جديد)**، `json` (فيه `clients` = أسماء الموكلين مفصولة بـ«·») |
| `portalEmails/{email}` | فهرس صفحة الدخول: `linked`، `pending`، `foreign`، `collab` |

**تطبيق المكتب** (Android `com.sherif.lawyer`) **مش موجود في أي مستودع متاح.** المستودع `nemo1113/professional-lawyer` اتفحص، وطلع نظام تاني (Laravel/MySQL) ومالوش علاقة بالبوابة.

---

## ٣. تعديلات الكود (كلها مدموجة في `main`)

| PR | التعديل |
|---|---|
| [#1](https://github.com/hamlfteam-design/law-office-site/pull/1) | **صفحة الدخول:** تطبيع الإيميل (أرقام عربية/فارسية ← إنجليزي، شيل المسافات وعلامات الاتجاه، `＠`←`@`، حروف صغيرة)، والبحث كمان بصيغة الأرقام العربية للسجلات القديمة، وحقل الإيميل بقى `type="text" inputmode="email"`. **«قضاياي»:** بتجيب كمان القضايا اللي فيها إيميل الموكل في `clientEmails`، **بشرط إن الإيميل متأكّد**. رابط تأكيد بيتبعت لكل حساب جديد، ورسالة «أكّد إيميلك» فيها زرار «أكّدت» وزرار «ابعت الرابط تاني». |
| [#2](https://github.com/hamlfteam-design/law-office-site/pull/2) | **سكريبت التكملة** `tools/portal-backfill/` (Node + firebase-admin). بيكتب `portalEmails` لكل إيميل موكل، و`clientEmails` على كل قضية. |
| [#3](https://github.com/hamlfteam-design/law-office-site/pull/3) | السكريبت بقى ياخد الإيميلات من `json.email`/`json.emails` كمان، ويكمّل `matchEmails`، ويتجاهل الصفة اللي بين قوسين في الأسماء. |
| [#4](https://github.com/hamlfteam-design/law-office-site/pull/4) | `--inspect` بيعرض شكل حقول الإيميل (أعداد بس، من غير قيم). |
| [#5](https://github.com/hamlfteam-design/law-office-site/pull/5) | **تصليح مهم في «قضاياي»:** البحث بقى `array-contains` بالإيميل بالظبط، بدل `array-contains-any` بصيغتين. قاعدة الأمان كانت هترفض البحث كله لأي إيميل فيه أرقام. |
| [#6](https://github.com/hamlfteam-design/law-office-site/pull/6) | **التشغيل التلقائي** `.github/workflows/portal-backfill.yml`: كل 3 ساعات + يدوي. المفتاح من Secret `FIREBASE_SERVICE_ACCOUNT`، و`--no-report`، و**`--max-writes=300`** (لو التعديلات أكتر، بيقف من غير ما يكتب). |
| [#7](https://github.com/hamlfteam-design/law-office-site/pull/7) | الـworkflow بقى على `actions/checkout@v5` و`setup-node@v5` وNode 22. |

**منطق ربط القضية بموكليها في السكريبت (`plan.mjs`):**
1. معرّف صريح في JSON القضية (`clientId`/`clientIds`). مش موجود في البيانات الحالية.
2. `clientUids` الموجودة في القضية.
3. **الاسم:** بعد تطبيع الهمزات والتشكيل، وة/ه، وى/ي، وشيل اللي بين قوسين. **لو الاسم متكرر لأكتر من موكل، القضية مش بتتربط** (حماية من ظهور قضية لحد غلط).

---

## ٤. التغييرات في الخدمات (اتعملت يدوي من حساب المالك)

**Firebase / Google Cloud — مشروع `profissional-lawyer-updat`:**
1. **Firestore Rules:** اتنشرت نسخة جديدة. التغيير الوحيد في `match /records/cases/items/{itemId}`، اتضاف شرط القراءة ده:
   ```
   || (signedIn() && request.auth.token.email_verified == true
       && request.auth.token.email.lower() in resource.data.get("clientEmails", []))
   ```
   باقي القواعد زي ما هي. الإصدارات القديمة محفوظة في صفحة Rules.
2. **Authentication ← Templates ← SMTP settings:** مفعّل.
   - Sender `noreply@hamlf.com`
   - Host `smtp.hostinger.com`
   - Port **587**
   - Security **STARTTLS**
   - المستخدم `noreply@hamlf.com`
   - **ملاحظة:** أول محاولة ببورت 465/SSL رجّعت `535 authentication failed` لأن الباسورد كان غلط. اتصلّح بإعادة كتابة الباسورد يدوي.
3. **Google Auth Platform ← Branding:** اتعمل الإعداد (External)، و**App name = «مؤسسة د. حسن عبد المنعم حسن»**. ده اللي Firebase بيستخدمه مكان `%APP_NAME%`، ومن ساعتها عنوان الرسايل فيه اسم المؤسسة.
4. **قوالب الإيميل مقفولة على المشروع:** الرسالة «Email template updates are currently unavailable for this project». اتبعت طلب دعم **Case 10431995**، ومستنيين الرد.
5. **مفاتيح الخدمة (Service accounts):**
   - **مفتاح قديم:** استخدمناه على جهاز المالك (`C:\portal-backfill\service-account.json`). **المفروض يتمسح.**
   - **مفتاح أحدث:** متخزّن في GitHub Secret `FIREBASE_SERVICE_ACCOUNT`. **يفضل.**

**Hostinger:**
- اتعمل صندوق `noreply@hamlf.com` (Starter Business Email). الباسورد عند المالك بس.
- اختبار SMTP من PowerShell (بورت 587) نجح.

**GitHub:**
- Secret `FIREBASE_SERVICE_ACCOUNT` في المستودع (Settings ← Secrets and variables ← Actions).

---

## ٥. الأوامر اللي اتشغّلت على جهاز المالك (Windows)

```bat
:: تجهيز السكريبت
mkdir C:\portal-backfill
cd /d C:\portal-backfill
curl -sLO https://raw.githubusercontent.com/hamlfteam-design/law-office-site/main/tools/portal-backfill/package.json
curl -sLO https://raw.githubusercontent.com/hamlfteam-design/law-office-site/main/tools/portal-backfill/package-lock.json
curl -sLO https://raw.githubusercontent.com/hamlfteam-design/law-office-site/main/tools/portal-backfill/plan.mjs
curl -sLO https://raw.githubusercontent.com/hamlfteam-design/law-office-site/main/tools/portal-backfill/backfill.mjs
npm install
:: (+ service-account.json اتحط في الفولدر)

npm run inspect      :: أسماء الحقول وشكل الإيميلات — من غير قيم
npm run dry-run      :: تجربة + تقرير محلي (فيه إيميلات — ما يتشاركش)
npm run apply        :: الكتابة الفعلية
```

```powershell
# اختبار SMTP لـHostinger
$c = Get-Credential noreply@hamlf.com
Send-MailMessage -From noreply@hamlf.com -To info@hamlf.com -Subject "SMTP test" -Body "test" -SmtpServer smtp.hostinger.com -Port 587 -UseSsl -Credential $c
```

**ملاحظة:** `raw.githubusercontent.com` بيحتفظ بنسخة قديمة من الملف كام دقيقة بعد أي تعديل. لو محتاج أحدث نسخة فوراً، استخدم رابط فيه رقم الـcommit بدل `main`.

---

## ٦. الأرقام

**ناتج `inspect` (16 أكتوبر):**
- 1514 موكل و2328 قضية.
- `matchEmails` موجود في 131 وثيقة موكل.
- `json.email`: فاضي عند 1343، ومش موجود عند 40، وفيه إيميل عند 131.
- `json.emails`: قايمة فاضية عند 1383، وفيها إيميل عند 130.

**أول `apply` (16 أكتوبر) — 913 تعديل:**
- 2 وثيقة `portalEmails` جديدة.
- 911 قضية اتكتب عليها `clientEmails`.
- 0 تعديل على `matchEmails`.

**ربط القضايا:**
- 112 بالحساب، و2089 بالاسم.
- 127 قضية من غير موكل معروف.
- اسم واحد متكرر (مااتربطش).

**التشغيل التلقائي (لحد 30 أكتوبر):**
- 59 تشغيل: **58 نجحوا، و1 فشل** (#29 يوم 22 أكتوبر الساعة 05:04 UTC، خطوة Backfill، exit code 1).
- التشغيلات اللي بعده كلها نجحت، فغالباً خطأ مؤقت في الاتصال.
- الفشل ده **مش** بسبب حد الـ300 تعديل، لأن ده بيطلع exit code 2.

---

## ٧. فاضل إيه

| # | المهمة | مين |
|---|---|---|
| 1 | **إدخال إيميلات الموكلين في تطبيق المكتب.** الـ1383 موكل اللي مالهمش إيميل مش هيقدروا يدخلوا البوابة. كل إيميل يتكتب بيتضاف للبوابة تلقائياً في خلال 3 ساعات. | المكتب |
| 2 | **مسح المفتاح القديم** من Firebase (Service accounts ← Google Cloud ← `firebase-adminsdk-…` ← Keys)، و**سيب الأحدث** بتاع GitHub. ومسح `C:\portal-backfill\service-account.json` وأي `.json` في Downloads. | المالك |
| 3 | **مسح الحساب التجريبي** من Authentication ← Users، لو اتعمل للاختبار. | المالك |
| 4 | **رد دعم Firebase** (Case 10431995). لو وافقوا: Sender name = اسم المؤسسة، وتعريب قالبي Password reset وEmail verification (النص العربي جاهز تحت). | مستني |
| 5 | **اختبار على Hotmail/Outlook/Yahoo:** الإرسال اتجرّب على Gmail وHostinger بس. | المالك |
| 6 | **(اختياري) تطوير تطبيق المكتب:** يكتب `clientEmails` و`portalEmails` بنفسه، ويفضّي `clientUid` لما إيميل الموكل يتغيّر. محتاج كود التطبيق. | لما الكود يتوفر |

**نص القالب العربي لـPassword reset** (يتحط لما الدعم يفتح التعديل):
```html
<div dir="rtl" style="text-align:right;font-family:Tahoma,Arial,sans-serif">
<p>مرحباً،</p>
<p>وصلنا طلب لإعادة ضبط كلمة المرور لحسابك في بوابة موكلي مؤسسة د. حسن عبد المنعم حسن (%EMAIL%).</p>
<p>لاختيار كلمة مرور جديدة اضغط على الرابط التالي:</p>
<p><a href='%LINK%'>%LINK%</a></p>
<p>لو ما طلبتش إعادة ضبط كلمة المرور، تجاهل هذه الرسالة وحسابك هيفضل زي ما هو.</p>
<p>مع خالص التحية،<br>مؤسسة د. حسن عبد المنعم حسن</p>
</div>
```

---

## ٨. لو حصلت مشكلة

- **موكل مش لاقي قضاياه:**
  1. اتأكد إن إيميله مكتوب في ملفه في التطبيق.
  2. اتأكد إن اسمه في القضية (حقل الموكلين) مكتوب زي اسمه في ملف الموكل بالظبط.
  3. اتأكد إنه أكّد إيميله من الرابط.
  4. استنى لحد 3 ساعات بعد أي تعديل.
- **إيميل من GitHub إن «Portal backfill» فشل:**
  - افتح التشغيل من تبويب Actions، وشوف خطوة Backfill.
  - **exit 2:** معناه التعديلات المطلوبة أكتر من 300. شغّل `npm run dry-run` على الجهاز وراجع التقرير قبل أي حاجة.
  - **غير كده:** جرّب **Run workflow**.
- **الرسايل مش بتوصل:**
  - في `noreply@hamlf.com` (Webmail)، دوّر على «Delivery Status Notification». سطر الخطأ فيها هو السبب.
  - لو `535`، يبقى الباسورد في Firebase SMTP غلط.
- **إيقاف التشغيل التلقائي:** Actions ← Portal backfill ← ⋯ ← Disable workflow، أو امسح الـSecret.

## ٩. استكمال الشغل في جلسة جديدة
- افتح جلسة على المستودع `hamlfteam-design/law-office-site`، وقول: «اقرا `docs/HANDOFF-portal-2026-10.md` وكمّل».
- شرح السكريبت بالتفصيل في `tools/portal-backfill/README.md`.
