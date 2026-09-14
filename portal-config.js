// ============================================================
// بوابة الموكلين — إعدادات الربط بـ Firebase
// ============================================================
// هذا الملف هو المكان الوحيد اللي محتاج تعدّله عشان تربط البوابة
// بنفس مشروع Firebase بتاع تطبيق com.sherif.lawyer (المحامي المحترف).
//
// من فين تجيب القيم دي:
//   Firebase Console → إعدادات المشروع (Project settings) → عام (General)
//   → قسم "تطبيقاتك" (Your apps) → لو مفيش تطبيق ويب، اعمل واحد جديد
//   (أيقونة </>) واختار اسم زي "law-office-portal" — هيديك نفس الكود ده
//   جاهز تنسخه.
//
// ملحوظة أمان: مفاتيح Firebase دي (apiKey وغيرها) مش سرية بطبيعتها —
// بتظهر في أي موقع ويب شغال بـ Firebase وده طبيعي. الحماية الحقيقية
// بتبقى في "Firestore Security Rules" في الكونسول (تحدد مين يقرأ بيانات
// مين) — ده اللي هنظبطه مع بعض بعد ما تدّيني وصول للمشروع.
// ============================================================

export const firebaseConfig = {
  apiKey: "AIzaSyAtoBf8dhrDhNrXWXgnL-MdaTOfO2q_sio",
  authDomain: "profissional-lawyer-updat.firebaseapp.com",
  projectId: "profissional-lawyer-updat",
  storageBucket: "profissional-lawyer-updat.firebasestorage.app",
  messagingSenderId: "852226723772",
  appId: "1:852226723772:web:2d63b199c41ae14155e5b9",
};

// ============================================================
// مسارات الكولكشنز في Firestore — مؤكَّدة مباشرة من Firestore
// Console (اتفتحت الوثائق الحقيقية وقرينا محتواها):
//   offices/{officeId}/records/clients/items/{itemId}
//   offices/{officeId}/records/cases/items/{itemId}
//
// وثيقة الموكل فيها matchEmails (مصفوفة إيميلات مسموح لها تربط
// نفسها بالسجل ده) و clientUid (بيتسجل أول ما الموكل يفعّل حسابه
// من البوابة).
//
// وثيقة القضية فيها حقل clientUids (array من auth uid) على مستوى
// المستند نفسه — ده اللي بيحدد مين يقدر يشوف القضية دي، وبيتحدّث
// تلقائياً من تطبيق المكتب كل 6 ساعات أول ما موكل يسجّل دخول في
// البوابة لأول مرة. باقي بيانات القضية (fileNo, subject, courtName,
// status, sessions...) متخزّنة جوه حقل نصي واحد اسمه json ولازم
// JSON.parse (شايفينه في dashboard.html). مفيش كولكشن جلسات منفصل —
// الجلسات array جوه نفس وثيقة القضية.
// ============================================================
export const OFFICE_ID = "office_UDdH9ctTHcd3";

export const COLLECTIONS = {
  clients: `offices/${OFFICE_ID}/records/clients/items`,
  cases: `offices/${OFFICE_ID}/records/cases/items`,
};

// ============================================================
// رابط "الوسيط" (Google Apps Script Web App) اللي بيوصّل بوابة
// الموكلين بمستندات القضايا المخزّنة في Google Drive الخاص بالمكتب،
// من غير ما نكشف أي مفتاح سري في كود الموقع. الوسيط بيتحقق من
// idToken بتاع فايربيز قبل ما يورّي أي ملف — شرح كامل في
// README (قسم "مستندات القضايا / Google Drive").
// ============================================================
export const DRIVE_BROKER_URL =
  "https://script.google.com/macros/s/AKfycbyS9zKaFp9CXINT_KGDWwIJ9H1fb_wKXMm1uZgFBNMnqcHeh1W5V6Cak0qPMwanHIVepA/exec";
