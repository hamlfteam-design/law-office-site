/* =============================================================================
   المحامي المحترف — تسجيل الدخول عبر Firebase Auth REST API

   يستعمل FirebaseREST (في firebase-config.js) للتواصل مباشرة مع Identity
   Toolkit REST API بدل مكتبة firebase/auth JS SDK (انظر التعليق في أعلى
   firebase-config.js لسبب ذلك). الجلسة الحالية (idToken/refreshToken/uid)
   تُحفظ محلياً في proflawyer.session.v1، وتُجدَّد تلقائياً عند الحاجة.
   ============================================================================= */
(function (w) {
  "use strict";

  var LOGIN_PAGE = "98-login.html";
  var SCREEN = (location.pathname.split("/").pop() || "");
  var SESSION_KEY = "proflawyer.session.v1";
  var API_KEY = (w.FIREBASE_CONFIG || {}).apiKey;

  function saveSession(s) {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) { }
    /* دخول/تجديد جلسة جديدة: مزامنة كاملة طازجة في أول صفحة (تخطّي مهلة الـ١٥ دقيقة) */
    try {
      var prev = localStorage.getItem("proflawyer.sync.uid");
      if (prev !== s.uid) {
        localStorage.setItem("proflawyer.sync.uid", s.uid || "");
        localStorage.removeItem("proflawyer.sync.cases.at");
        localStorage.removeItem("proflawyer.sync.clients.at");
        localStorage.removeItem("proflawyer.sync.cases.fullAt");
        localStorage.removeItem("proflawyer.sync.clients.fullAt");
      }
    } catch (e) { }
  }
  function loadSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) { return null; }
  }
  function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) { }
  }

  function rest(path, body) {
    var url = "https://identitytoolkit.googleapis.com/v1/accounts:" + path +
      "?key=" + encodeURIComponent(API_KEY);
    return w.FirebaseREST.request("POST", url, body, null);
  }

  /** يحفظ جلسة من استجابة signUp/signInWithPassword جاهزة (بلا نداء REST
      إضافي) — يُستخدم في مسار "أول دخول لعضو الفريق" بعد إنشاء حسابه
      مباشرة، فيدخل تلقائياً بلا حاجة لكتابة كلمة السر مرة ثانية. */
  function adoptSession(data) {
    var s = {
      idToken: data.idToken, refreshToken: data.refreshToken,
      uid: data.localId, email: data.email,
      expiresAt: Date.now() + (parseInt(data.expiresIn, 10) || 3600) * 1000
    };
    saveSession(s);
    return { uid: s.uid, email: s.email };
  }

  function login(email, password, done) {
    rest("signInWithPassword", { email: email, password: password, returnSecureToken: true })
      .then(function (r) {
        if (!r.ok) {
          var code = (r.data && r.data.error && r.data.error.message) || "unknown";
          done(mapErrToCode(code));
          return;
        }
        var s = {
          idToken: r.data.idToken, refreshToken: r.data.refreshToken,
          uid: r.data.localId, email: r.data.email,
          expiresAt: Date.now() + (parseInt(r.data.expiresIn, 10) || 3600) * 1000
        };
        saveSession(s);
        done(null, { uid: s.uid, email: s.email });
      })
      .catch(function (e) { done(e); });
  }

  function mapErrToCode(msg) {
    var m = String(msg || "");
    var code = "auth/unknown";
    if (m.indexOf("EMAIL_NOT_FOUND") >= 0 || m.indexOf("INVALID_PASSWORD") >= 0 ||
        m.indexOf("INVALID_LOGIN_CREDENTIALS") >= 0) code = "auth/invalid-credential";
    else if (m.indexOf("INVALID_EMAIL") >= 0) code = "auth/invalid-email";
    else if (m.indexOf("TOO_MANY_ATTEMPTS") >= 0) code = "auth/too-many-requests";
    else if (m.indexOf("USER_DISABLED") >= 0) code = "auth/user-disabled";
    var err = new Error(m); err.code = code; return err;
  }

  function logout(done) {
    clearSession();
    if (done) done(null);
  }

  /* باگ حقيقي كان هنا: أي فشل واحد (حتى تقطيعة شبكة عابرة لحظة تجديد
     الـidToken، اللي بيحصل كل ساعة تلقائيًا) كان يمسح الجلسة بالكامل
     فورًا (clearSession) — فالجهاز يفضل "غير مسجَّل دخول" لحد ما حد يدخل
     يدويًا تاني، حتى لو الإنترنت رجع بعد ثانية. الحل: لا نمسح الجلسة إلا
     لو فيربيز فعليًا رفض الـrefreshToken (خطأ 400 صريح)؛ أي فشل شبكة/سيرفر
     تاني (status 0 أو 5xx) نعيد المحاولة بضع مرات قبل ما نستسلم، وبدون
     مسح الجلسة المحلية عشان تنفع تحاول تاني بعدها. */
  var refreshAttempts = 0;
  function refresh(done) {
    var s = loadSession();
    if (!s || !s.refreshToken) { done(new Error("لا توجد جلسة")); return; }
    var url = "https://securetoken.googleapis.com/v1/token?key=" + encodeURIComponent(API_KEY);
    var body = "grant_type=refresh_token&refresh_token=" + encodeURIComponent(s.refreshToken);
    w.FirebaseREST.request("POST", url, body, { "Content-Type": "application/x-www-form-urlencoded" })
      .then(function (r) {
        if (!r.ok) {
          var rejected = r.status >= 400 && r.status < 500;   /* رفض حقيقي من فيربيز، مش عطل شبكة */
          if (rejected) { refreshAttempts = 0; clearSession(); done(new Error("انتهت الجلسة")); return; }
          if (refreshAttempts < 4) {
            refreshAttempts++;
            setTimeout(function () { refresh(done); }, Math.min(2000 * refreshAttempts, 8000));
            return;
          }
          refreshAttempts = 0;
          done(new Error("تعذّر تجديد الجلسة — تحقّق من الاتصال."));
          return;
        }
        refreshAttempts = 0;
        s.idToken = r.data.id_token; s.refreshToken = r.data.refresh_token;
        s.expiresAt = Date.now() + (parseInt(r.data.expires_in, 10) || 3600) * 1000;
        saveSession(s);
        done(null, s.idToken);
      })
      .catch(function (e) { done(e); });
  }

  /** يعيد idToken صالحاً (يجدده تلقائياً لو قارب على الانتهاء)، أو null. */
  function idToken(done) {
    var s = loadSession();
    if (!s) { done(null); return; }
    if (s.expiresAt - Date.now() > 60000) { done(s.idToken); return; }
    refresh(function (err, tok) { done(err ? null : tok); });
  }

  function whenKnown(cb) {
    var s = loadSession();
    if (!s) { cb(null); return; }
    cb({ uid: s.uid, email: s.email });
  }

  function guard() {
    if (SCREEN.indexOf(LOGIN_PAGE) === 0) return;
    if (w.HAMLF_PC) return;   /* نسخة الكمبيوتر بتشتغل من غير تسجيل دخول (راجع login-gate.js) */
    if (!loadSession()) location.replace(LOGIN_PAGE);
  }

  w.Auth = {
    login: login, logout: logout, whenKnown: whenKnown, guard: guard,
    idToken: idToken, session: loadSession, adoptSession: adoptSession
  };
})(window);
