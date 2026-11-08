/* =============================================================================
   المحامي المحترف — عميل Firebase عبر REST (بلا مكتبة JS SDK)

   على هذا الجهاز (وربما غيره) يوجد خلل حقيقي في محرك شبكة WebView نفسه:
   أي fetch/XHR/سكربت خارجي من صفحاتنا يفشل بخطأ net::ERR_CACHE_MISS، بينما
   نفس الجهاز يتصل بالإنترنت طبيعياً من متصفح Chrome العادي. تأكّدنا أن هذا
   لا علاقة له بالمضيف (جربنا لعدة أسماء مضيفين مختلفة) ولا بحالة الكاش ولا
   بتفعيل التصحيح البعيد — خلل في محرك الشبكة داخل WebView تحديداً.

   الحل: بدل تحميل مكتبة Firebase JS SDK كاملة (اللي بتحتاج fetch/XHR شغالين)
   نتواصل مباشرة مع Firebase عبر REST API (Auth REST + Firestore REST)
   باستخدام جسر جافا حقيقي (AndroidNet، مُعرَّف في MainActivity.java) بيعمل
   طلبات HTTPS عن طريق HttpsURLConnection القياسية — بيتجاوز محرك شبكة
   WebView المعطوب تماماً.

   الواجهة المعروضة (FirebaseREST) تُستعمل من auth.js و cloud-store.js.
   ============================================================================= */
(function (w) {
  "use strict";

  var firebaseConfig = {
    apiKey: "AIzaSyAtoBf8dhrDhNrXWXgnL-MdaTOfO2q_sio",
    authDomain: "profissional-lawyer-updat.firebaseapp.com",
    projectId: "profissional-lawyer-updat",
    storageBucket: "profissional-lawyer-updat.firebasestorage.app",
    messagingSenderId: "852226723772",
    appId: "1:852226723772:web:b858477aee90319155e5b9",
    measurementId: "G-6KRL57QSYV"
  };

  var pending = {};
  var seq = 0;

  /** ينادَى من الجافا (AndroidNet.request) بنتيجة كل طلب. */
  w.__netCallback = function (id, ok, status, bodyText) {
    var cb = pending[id];
    if (!cb) return;
    delete pending[id];
    var data = null;
    try { data = JSON.parse(bodyText); } catch (e) { data = bodyText; }
    cb(ok, status, data);
  };

  function native() { return typeof AndroidNet !== "undefined" && !!AndroidNet.request; }
  function available() { return native() || typeof fetch === "function"; }   /* ويندوز/متصفح: fetch (CORS مسموح لواجهات Google) */

  function fetchRequest(method, url, body, headers) {
    var h = {}; if (headers) Object.keys(headers).forEach(function (k) { h[k] = headers[k]; });
    var bodyStr = body == null ? undefined : (typeof body === "string" ? body : JSON.stringify(body));
    if (bodyStr !== undefined && !h["Content-Type"]) h["Content-Type"] = "application/json";
    return fetch(url, { method: method, headers: h, body: bodyStr }).then(function (r) {
      return r.text().then(function (t) {
        var data; try { data = JSON.parse(t); } catch (e) { data = t; }
        return { ok: r.ok, status: r.status, data: data };
      });
    });
  }

  /** طلب HTTP عبر الجسر الأصلي. يُعيد Promise يحل بـ {ok, status, data}. */
  function nativeRequest(method, url, body, headers) {
    return new Promise(function (resolve, reject) {
      if (!native()) { fetchRequest(method, url, body, headers).then(resolve, reject); return; }
      var id = "n" + (++seq) + "_" + Date.now();
      pending[id] = function (ok, status, data) {
        resolve({ ok: ok, status: status, data: data });
      };
      try {
        var bodyStr = body == null ? null : (typeof body === "string" ? body : JSON.stringify(body));
        AndroidNet.request(id, method, url, bodyStr,
          headers ? JSON.stringify(headers) : null);
      } catch (e) { delete pending[id]; reject(e); }
    });
  }

  w.FirebaseREST = { config: firebaseConfig, request: nativeRequest, available: available };

  /* توافق قديم بسيط: FIREBASE_READY تُستعمل في شاشات أخرى للتحقق من وجود
     إعداد Firebase (بدون الاعتماد على SDK فعلي). */
  w.FIREBASE_CONFIG = firebaseConfig;
  w.FIREBASE_READY = true;
})(window);
