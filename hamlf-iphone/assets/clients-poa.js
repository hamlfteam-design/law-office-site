/* =============================================================================
   الموكلون والتوكيلات المستوردون من أجندة المكتب.

   في ملف الأجندة يأتي الموكل ومعه بيانات توكيله في السجل نفسه:
     { name, agent, poaNo, poaLetter, poaYear, poaType, notary,
       email, phone, emails[], phones[] }

   نحفظهم كما هم في مخزن واحد، ونعرضهم بوجهين: «الموكلون» و«التوكيلات»،
   فيظهر لكل موكل رقم توكيله وسنته وجهة التوثيق دون تكرار البيانات.
   ============================================================================= */
(function (w) {
  "use strict";

  var KEY = "proflawyer.agenda.clients.v1";

  /* السكانر المثبَّت يقدر يمسح ويرجّع الصفحات للتطبيق؟ لو آه، زر الكاميرا
     نفسه بيصوّر من خلاله (قص الحواف وتعديل الميل تلقائياً). */
  function scannerReady() {
    try {
      return typeof AndroidScanner !== "undefined" && !!AndroidScanner.supportsResult &&
        AndroidScanner.supportsResult();
    } catch (e) { return false; }
  }
  function prepCapture(mode, title) {
    try {
      if (typeof AndroidScanner !== "undefined" && AndroidScanner.prepareCapture) {
        AndroidScanner.prepareCapture(mode, title || "");
      }
    } catch (e) { }
  }
  function camLabel() { return scannerReady() ? "📷 تصوير بالسكانر (قص تلقائي)" : "📷 تصوير الآن"; }

  /* ============================================== نوافذ التعديل (bottom-sheet)

     كانت مشكلتان في كل نوافذ هذا الملف (موكل جديد/تعديل موكل/تعديل توكيل):
     ١) تمرير الخلفية يبقى شغّالاً خلف النافذة — فتتحرّك الصفحة اللي وراها
        بالغلط بدل محتوى النافذة نفسها عند الوصول لآخرها.
     ٢) زر الرجوع في أندرويد كان يقفل النافذة فوراً بلا أي سؤال — فيضيع كل
        ما كُتب فيها بلا رجعة.
     الدالتان هنا تصلحان الاثنين معاً، بنفس أسلوب القفل والتأكيد المستخدَم
     في sheet() بملف القضايا. */

  function lockScroll() {
    var ph = document.querySelector(".phone");
    var dEl = document.documentElement;
    var prevH = dEl.style.overflow, prevB = document.body.style.overflow,
        prevP = ph ? ph.style.overflow : "";
    dEl.style.overflow = "hidden"; document.body.style.overflow = "hidden";
    if (ph) ph.style.overflow = "hidden";
    return function unlock() {
      dEl.style.overflow = prevH; document.body.style.overflow = prevB;
      if (ph) ph.style.overflow = prevP;
    };
  }

  /**
   * يجهّز نافذة (wrap) بقفل التمرير + تأكيد الخروج بزر الرجوع.
   * @param {HTMLElement} wrap    عنصر الخلفية (data-modal="1")
   * @param {function}    isDirty ترجع true لو فيه إدخال يستحق التأكيد
   * @param {HTMLElement} [saveBtn] زر الحفظ — يُعرض "حفظ ثم الخروج" لو وُجد
   */
  function wireSheet(wrap, isDirty, saveBtn) {
    var unlock = lockScroll();
    var origRemove = wrap.remove.bind(wrap);
    wrap.remove = function () { unlock(); origRemove(); };

    wrap.__lawyerDismiss = function () {
      if (!isDirty()) { wrap.remove(); return true; }

      var back = document.createElement("div");
      back.setAttribute("data-modal", "1");
      back.style.cssText = "position:fixed;inset:0;background:rgba(28,18,8,.55);z-index:10050;" +
        "display:flex;align-items:center;justify-content:center;padding:22px";
      var box = document.createElement("div");
      box.style.cssText = "background:#fffdf8;border-radius:14px;padding:20px;width:100%;" +
        "max-width:380px;direction:rtl;box-shadow:0 10px 40px rgba(0,0,0,.35)";

      var t = document.createElement("div");
      t.style.cssText = "font-weight:600;font-size:16px;color:#3d2614;margin-bottom:8px";
      t.textContent = "يوجد إدخال لم يُحفظ";
      box.appendChild(t);
      var d = document.createElement("div");
      d.style.cssText = "font-size:13.5px;color:#7d7166;line-height:1.9;margin-bottom:16px";
      d.textContent = "لو خرجت الآن ستفقد ما كتبته في هذه الشاشة.";
      box.appendChild(d);

      function opt(label, css, fn) {
        var b = document.createElement("button");
        b.type = "button";
        b.style.cssText = "display:block;width:100%;padding:13px;margin-bottom:9px;" +
          "border-radius:10px;font-family:inherit;font-size:15px;min-height:48px;" + css;
        b.textContent = label;
        b.onclick = function () { back.remove(); fn(); };
        box.appendChild(b);
      }
      if (saveBtn) {
        opt("حفظ ثم الخروج", "border:0;background:#5b3a21;color:#fff;font-weight:600",
          function () { saveBtn.click(); });
      }
      opt("الخروج بدون حفظ", "border:1px solid #e3c9c6;background:#fff;color:#b3261e",
        function () { wrap.remove(); });
      opt("البقاء في الشاشة", "border:1px solid #ddd4c8;background:#fff;color:#5b3a21",
        function () {});

      back.appendChild(box);
      back.onclick = function (e) { if (e.target === back) back.remove(); };
      back.__lawyerDismiss = function () { back.remove(); return true; };
      document.body.appendChild(raise(back));
      return true;
    };
  }

  /* طبقة علوية مضمونة لأي نافذة (المهمة ٣): «تعديل» كانت تُفتح خلف نافذة
     أخرى مفتوحة بطبقة أعلى (مثل ورقة القضية z=10012) فتبدو كأنها لا تعمل.
     نحسب أعلى طبقة موجودة فعلاً لحظة الفتح ونعلو عليها بدل أرقام ثابتة. */
  function topZ() {
    if (w.UiLayer) return UiLayer.topZ();       /* ask.js: النوافذ بس، من غير الميكروفون والمؤشر */
    var m = 10000;
    Array.prototype.forEach.call(document.body.children, function (e) {
      var z = parseInt(getComputedStyle(e).zIndex, 10);
      if (z > m && z < 2000000000) m = z;
    });
    return m + 1;
  }
  function raise(wrap) { wrap.style.zIndex = String(topZ()); return wrap; }

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; }
  }

  /* ------------------------------------------------- مزامنة Firestore

     كل موكل (بتوكيلاته كلها) مستند JSON واحد في مجموعة "clients" (عبر
     CloudStore.collection). السجلات القديمة (١٠٦٦ موكل حقيقي) ليس لها
     معرّف id ثابت أصلاً — تُعرَّف تاريخياً بـ officeNo (رقم المكتب، فريد
     لكل موكل بحسب منطق هذا الملف بالكامل). backfillId يضمن لكل موكل id
     ثابتاً مرة واحدة فقط (من officeNo إن وُجد، وإلا معرّف عشوائي جديد)،
     فيبقى كما هو حتى لو تغيّر officeNo لاحقاً — بلا ازدواج مستندات على
     السحابة عند كل تعديل. */
  function backfillId(c) {
    if (c.id) return c.id;
    var off = String(c.officeNo || "").trim();
    c.id = off ? "cl_off_" + off.replace(/[^0-9A-Za-z]+/g, "_")
               : "cl_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    return c.id;
  }

  var lastSynced = {};

  var _gate = null;
  function gate() {
    return _gate || (window.CloudStore && window.CloudStore.gate ? (_gate = window.CloudStore.gate("clients", 2 * 60000)) : null);
  }
  function gTouch(id, json) { var g = gate(); if (g) g.touch(id, window.CloudStore.hash(json)); }
  function gForget(id) { var g = gate(); if (g) g.forget(id); }
  /* ١٫٥١: موكل اتمسح من جهاز تاني (علامة حذف في records/deleted) */
  function regClientDel() {
    if (!window.CloudStore || !window.CloudStore.onDeleted || regClientDel.done) return;
    regClientDel.done = true;
    window.CloudStore.onDeleted("clients", function (id) {
      var list = read(), n = list.length;
      list = list.filter(function (c) { return c.id !== id; });
      if (list.length !== n) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { } }
      delete lastSynced[id]; gForget(id);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", regClientDel);
  else setTimeout(regClientDel, 0);

  var _snapTried = false;
  function syncFromCloud() {
    if (!window.CloudStore || !window.CloudStore.collection) return;
    var g = gate();
    /* جهاز جديد: لقطة البيانات الأول (نفس اللي في case-file.js) */
    if (!_snapTried && window.CloudStore.snapshot && !localStorage.getItem("proflawyer.sync.clients.hashes")) {
      _snapTried = true;
      window.CloudStore.snapshot.ensure(function (ok) {
        if (ok && g && g.reload) g.reload();
        syncFromCloud();
      });
      return;
    }
    var mode = g && g.mode ? g.mode() : (g && !g.due() ? null : "full");
    if (g && mode !== "full") {
      var hs = g.hashes();
      lastSynced = {};
      read().forEach(function (c) {
        if (!c.id) return;
        var j = JSON.stringify(c);
        if (hs[c.id] === window.CloudStore.hash(j)) lastSynced[c.id] = j;
      });
      if (mode !== "delta" || !window.CloudStore.collection.listChanged) return;
      /* delta: الموكلين اللي اتعدّلوا من آخر مزامنة + اللي ربطوا حسابهم على
         البوابة (الربط بيتكتب من البوابة من غير ما يغيّر updatedAt) */
      /* ربط حسابات البوابة بيهم جهاز المدير بس — على أجهزة المحامين كان استعلام زيادة كل مزامنة */
      var ownerDev = false;
      try { ownerDev = !!(w.Team && Team.current && (Team.current() || {}).role === "owner"); } catch (e) { }
      window.CloudStore.collection.listChanged("clients", g.since(), ownerDev, function (remote) {
        if (remote === null) return;
        var local = read(), idx = {}, changed = {};
        local.forEach(backfillId);
        var qo = window.CloudStore.queued ? window.CloudStore.queued("clients") : {};
        local.forEach(function (c, i) { if (c.id) idx[c.id] = i; });
        remote.forEach(function (r) {
          if (!r.id || qo[r.id]) return;
          var j = JSON.stringify(r);
          if (lastSynced[r.id] === j) return;   /* نفس النسخة — ما نكتبش تاني */
          if (idx[r.id] != null) local[idx[r.id]] = r; else { idx[r.id] = local.length; local.push(r); }
          lastSynced[r.id] = j;
          changed[r.id] = window.CloudStore.hash(j);
        });
        if (Object.keys(changed).length) {
          try { localStorage.setItem(KEY, JSON.stringify(local)); } catch (e) { }
          /* شاشة الموكلين مفتوحة؟ تعديل المدير يبان على طول */
          if (w.ClientsPOA && ClientsPOA.onChange) { try { ClientsPOA.onChange(); } catch (e) { } }
        }
        g.deltaDone(changed);
      });
      return;
    }
    window.CloudStore.collection.list("clients", function (remote) {
      if (remote === null) return;
      var local = read();
      local.forEach(backfillId);
      var byId = {}, byKey = {};
      function dk(c) {
        var off = String(c.officeNo || "").trim();
        if (!c.name) return "";
        if (off) return off + "|" + norm(c.name);
        /* موكل من غير توكيل (مالوش رقم مكتب): الرقم القومي، وإلا التليفون */
        var nid = latinDigits(c.idNo).replace(/\D/g, "");
        if (nid.length === 14) return "nid:" + nid + "|" + norm(c.name);
        var tel = String(c.phone || "").replace(/\D/g, "").slice(-10);
        return tel.length === 10 ? "tel:" + tel + "|" + norm(c.name) : "";
      }
      var qo = (window.CloudStore && window.CloudStore.queued) ? window.CloudStore.queued("clients") : {};
      remote.forEach(function (r) {
        if (r.id && qo[r.id] !== "remove") { byId[r.id] = r; if (dk(r) && !byKey[dk(r)]) byKey[dk(r)] = r; }
      });
      /* اتمسح من جهاز تاني: سجل الجهاز ده عارف إنه اتزامن قبل كده (بصمته
         محفوظة) ومش موجود على السيرفر دلوقتي ← يتشال هنا كمان. من غيره كان
         المسح بيفضل على باقي الأجهزة. أمان: لو المختفي كتير (تحميل ناقص من
         النت)، ما نشيلش حاجة خالص. */
      var goneIds = {};
      if (g && g.hashes) {
        var hsF = g.hashes() || {}, gone = [];
        local.forEach(function (c) {
          if (c.id && hsF[c.id] && !byId[c.id] && qo[c.id] !== "save") gone.push(c.id);
        });
        if (gone.length && gone.length <= Math.max(5, Math.round(local.length * 0.02)))
          gone.forEach(function (id) { goneIds[id] = 1; });
      }
      /* منع التكرار من الجذر: سجل محلي بمعرّف مختلف لكن نفس (رقم المكتب +
         الاسم) موجود بالفعل على السحابة يُعتبر هو نفسه — لا يُضاف نسخة
         ثانية (كان هذا سبب تضاعف الموكلين بعد كل مزامنة بين جهازين). */
      local.forEach(function (c) {
        if (qo[c.id] === "save") { byId[c.id] = c; if (dk(c)) byKey[dk(c)] = c; return; }   /* تعديل محلي لم يُرفع بعد */
        if (byId[c.id]) return;
        if (goneIds[c.id]) return;   /* اتمسح من جهاز تاني */
        var twin = dk(c) && byKey[dk(c)];
        if (twin) {
          Object.keys(c).forEach(function (k) {
            if (k === "id" || k === "poas" || k === "phones" || k === "emails") return;
            if (isBlank(twin[k]) && !isBlank(c[k])) twin[k] = c[k];
          });
          twin.phones = uniqBy((twin.phones || []).concat(c.phones || []), function (x) { return String(x).replace(/\D/g, ""); });
          twin.emails = uniqBy((twin.emails || []).concat(c.emails || []), function (x) { return String(x).toLowerCase().trim(); });
          twin.poas = uniqPoas((twin.poas || []).concat(c.poas || []));
          return;
        }
        byId[c.id] = c;
        if (dk(c)) byKey[dk(c)] = c;
      });
      var merged = Object.keys(byId).map(function (k) { return byId[k]; });
      lastSynced = {};
      merged.forEach(function (c) { if (c.id) lastSynced[c.id] = JSON.stringify(c); });
      try { localStorage.setItem(KEY, JSON.stringify(merged)); } catch (e) { }
      if (g) {
        var hm = {};
        Object.keys(lastSynced).forEach(function (id) { hm[id] = window.CloudStore.hash(lastSynced[id]); });
        g.done(hm);
      }
    });
  }
  var _syncedOnce = false;
  function ensureSynced() {
    if (_syncedOnce) return;
    _syncedOnce = true;
    syncFromCloud();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureSynced);
  } else { ensureSynced(); }
  /* والبرنامج مفتوح: اللي اتغيّر عند باقي الفريق كل دقيقتين (كان عند فتح الشاشة بس) */
  setInterval(function () {
    if (document.hidden) return;
    var g = gate();
    if (g && g.mode && g.mode() === "delta") syncFromCloud();
  }, 60000);

  /* lastSynced: id ← نص JSON جاهز، لا كائن يُستنسَخ بعمق. استنساخ ١٠٦٦+
     موكل (JSON.parse(JSON.stringify)) في كل حفظة كان يجعل زر "حفظ" بطيئاً
     محسوساً — راجع [[feedback-apply-fixes-app-wide]] والإصلاح المطابق في
     case-file.js. */
  /** لو تغيّر موكل واحد بعينه (الغالبية العظمى من الحفظات)، مرّر سجله في
      onlyRec لمقارنة/رفع نسخته فقط — لا داعي لتحويل ١٠٦٦+ موكل لنص في كل
      حفظة لمجرد المقارنة. الفحص الكامل يبقى فقط للعمليات الجماعية. */
  /** بريده/بريده الاحتياطي — الحقل الذي يُطابَق ببريد حساب الموكل عند أول
      دخوله لبوابته (بوابة الموكل)، ليربط حسابه بسجله دون تدخّل المكتب.
      يُرفع كحقل ظاهر منفصل عن نص json نفسه — راجع toFsJson في
      cloud-store.js. */
  function matchEmailsOf(c) {
    return [].concat(c.emails || [], c.email ? [c.email] : [])
      .map(function (x) { return String(x || "").toLowerCase().trim(); })
      .filter(Boolean);
  }
  function withLinkFields(c) {
    var mails = matchEmailsOf(c);
    if (!mails.length) return c;
    var out = {}; for (var k in c) out[k] = c[k];
    out.matchEmails = mails;
    return out;
  }

  /* ---- فهرس بريد البوابة (portalEmails) — يُبنى من سجلات الموكلين ويُرفع بالفروق فقط ---- */
  var PI_KEY = "proflawyer.portalindex.v1", _piTimer = 0, _piBusy = false;
  function isForeignRec(c) { return /جواز|إقامة|اقامة/.test(String(c.idType || "")); }
  function buildPortalIndex(list) {
    var m = {};
    list.forEach(function (c) {
      if (!c || !c.id) return;
      matchEmailsOf(c).forEach(function (e) {
        if (e.indexOf("@") < 1 || e.indexOf("/") >= 0 || e.length > 200) return;
        var x = m[e] || (m[e] = { ids: [], pending: [], linked: false, foreign: false });
        /* نفس الإيميل بيرجع مرتين لو مكتوب في email وemails مع بعض — من غير
           الشرط ده الـ id كان بيتكرر في ids/pending، والبوابة كانت بتبعت نداءين
           ربط على نفس المستند والتاني يترفض فيفشل الربط كله. */
        if (x.ids.indexOf(c.id) >= 0) return;
        x.ids.push(c.id); if (c.clientUid) x.linked = true; else x.pending.push(c.id);
        if (isForeignRec(c)) x.foreign = true;
      });
    });
    return m;
  }
  function syncPortalIndex(force) {
    if (_piBusy || !window.CloudStore || !CloudStore.portalIndex) return Promise.resolve(0);
    _piBusy = true;
    var idx = buildPortalIndex(read()), prev = {}, next = {}, jobs = [];
    try { prev = JSON.parse(localStorage.getItem(PI_KEY) || "{}"); } catch (e) { }
    Object.keys(idx).forEach(function (e) { var h = JSON.stringify(idx[e]); next[e] = h; if (force || prev[e] !== h) jobs.push({ e: e, put: idx[e] }); });
    Object.keys(prev).forEach(function (e) { if (!(e in next)) jobs.push({ e: e, del: 1 }); });
    var done = 0, i = 0, saved = Object.assign({}, prev);
    function worker() {
      if (i >= jobs.length) return Promise.resolve();
      var j = jobs[i++];
      return (j.del ? CloudStore.portalIndex.del(j.e) : CloudStore.portalIndex.put(j.e, j.put)).then(function (r) {
        if (r && r.ok) { done++; if (j.del) delete saved[j.e]; else saved[j.e] = next[j.e]; }
      }).catch(function () { }).then(worker);
    }
    return Promise.all([worker(), worker(), worker()]).then(function () {
      try { localStorage.setItem(PI_KEY, JSON.stringify(saved)); } catch (e) { }
      _piBusy = false; return done;
    });
  }
  function schedulePortalIndex() { clearTimeout(_piTimer); _piTimer = setTimeout(function () { syncPortalIndex(false); }, 5000); }
  window.PortalIndex = { sync: syncPortalIndex, build: function () { return buildPortalIndex(read()); } };

  function pushChangedToCloud(list, onlyRec) {
    if (!window.CloudStore || !window.CloudStore.collection) return;
    schedulePortalIndex();
    if (onlyRec) {
      var id = backfillId(onlyRec);
      var json1 = JSON.stringify(onlyRec);
      if (lastSynced[id] !== json1) {
        window.CloudStore.collection.save("clients", id, withLinkFields(onlyRec));
        lastSynced[id] = json1; gTouch(id, json1);
      }
      return;
    }
    var curIds = {};
    list.forEach(function (c) {
      var id = backfillId(c);
      curIds[id] = 1;
      var json = JSON.stringify(c);
      if (lastSynced[id] !== json) {
        window.CloudStore.collection.save("clients", id, withLinkFields(c));
        lastSynced[id] = json; gTouch(id, json);
      }
    });
    Object.keys(lastSynced).forEach(function (id) {
      if (!curIds[id]) { window.CloudStore.collection.remove("clients", id); delete lastSynced[id]; gForget(id); }
    });
  }

  function latinDigits(x) {
    return String(x == null ? "" : x).trim().replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x660; });
  }
  function ar(n) {
    return String(n == null ? "" : n)
      .replace(/[0-9]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩"[+d]; });
  }

  /** الإيميلات وحدها استثناء من قاعدة "الأرقام العربية في كل مكان" —
      عنوان بريد بأرقام عربية-هندية عنوان غير صالح. لوحة مفاتيح عربية
      بتكتب ١٢٣ مباشرة بدل 123 أحياناً بلا تدخّل من كود التطبيق، فلازم
      تصحيح صريح هنا عند الحفظ — راجع
      [[feedback_arabic_numerals_email_exception]]. */
  /** «البطاقة سارية حتى» → yyyy-mm-dd (يقبل ٢٠٣١/١٢/٠١ أو 1/12/2031)، وفاضي لو مش تاريخ */
  function idExpiryIso(v) {
    /* التاريخ ممكن يكون وسط كلام («سارية حتى ٢٠٢٧/٨/٣») أو سنة/شهر بس (← آخر يوم في الشهر) */
    var t = laDigits(String(v || "").trim()).replace(/\s*([-\/.])\s*/g, "$1"), m, y, mo, d;
    if ((m = t.match(/(?:^|\D)(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?!\d)/))) { y = m[1]; mo = m[2]; d = m[3]; }
    else if ((m = t.match(/(?:^|\D)(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})(?!\d)/))) { y = m[3]; mo = m[2]; d = m[1]; }
    else if ((m = t.match(/(?:^|\D)(\d{4})[-\/.](\d{1,2})(?![-\/.]?\d)/))) { y = m[1]; mo = m[2]; d = new Date(+y, +mo, 0).getDate(); }
    else if ((m = t.match(/(?:^|\D)(\d{1,2})[-\/.](\d{4})(?!\d)/))) { y = m[2]; mo = m[1]; d = new Date(+y, +mo, 0).getDate(); }
    else return "";
    if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31 || +y < 1990 || +y > 2100) return "";
    return y + "-" + ("0" + mo).slice(-2) + "-" + ("0" + d).slice(-2);
  }
  /** حالة البطاقة: { iso, days } — days = الأيام الباقية (سالبة لو انتهت)، أو null */
  function idExpiryState(c) {
    /* أي صيغة متسجّلة (يوم/شهر/سنة، أرقام عربي، شهر رقم واحد) — مش ISO بس، علشان الزرار ما يختفيش */
    var iso = idExpiryIso((c && c.idExpiry) || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    var d = new Date(iso + "T00:00:00"), t = new Date(); t.setHours(0, 0, 0, 0);
    return { iso: iso, days: Math.round((d - t) / 864e5) };
  }
  function laDigits(t) {
    var fa = "۰۱۲۳۴۵۶۷۸۹";
    return String(t == null ? "" : t)
      .replace(/[٠-٩۰-۹]/g, function (d) {
        var code = d.charCodeAt(0);
        if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
        var fi = fa.indexOf(d);
        return fi >= 0 ? String(fi) : d;
      });
  }

  /** يصحّح الأرقام أثناء الكتابة نفسها في حقل الإيميل، لا عند الحفظ فقط —
      المستخدم كان شايف أرقاماً عربية على الشاشة وهو بيكتب (وإن كانت
      تتصحّح عند الحفظ)، فيفقد الثقة في الحقل. تصحيح فوري بلا نقل المؤشر
      لآخر السطر (الاستبدال حرف بحرف فمكان المؤشر لا يتغيّر). */
  function wireLiveDigitFix(inp) {
    if (!inp) return;
    inp.addEventListener("input", function () {
      var v = inp.value;
      if (!/[٠-٩۰-۹]/.test(v)) return;
      var pos = inp.selectionStart;
      inp.value = laDigits(v);
      try { inp.setSelectionRange(pos, pos); } catch (e) { }
    });
  }

  /** رقم التوكيل الكامل: ٤٦٦٤ هـ لسنة ١٩٩٥ */
  function poaFull(c) {
    if (!c.poaNo) return "";
    return ar(c.poaNo) +
           (c.poaLetter ? " " + c.poaLetter : "") +
           (c.poaYear ? " لسنة " + ar(c.poaYear) : "");
  }

  /** كل وسائل الاتصال بلا تكرار */
  function contacts(c) {
    var mails = [].concat(c.emails || [], c.email ? [c.email] : [])
      .map(function (x) { return String(x).trim(); }).filter(Boolean);
    var tels = [].concat(c.phones || [], c.phone ? [c.phone] : [])
      .map(function (x) { return String(x).trim(); }).filter(Boolean);
    var uniq = function (a) {
      var seen = {}, out = [];
      a.forEach(function (x) { if (!seen[x]) { seen[x] = 1; out.push(x); } });
      return out;
    };
    return { emails: uniq(mails), phones: uniq(tels) };
  }

  function all() { return read(); }

  function withPoa() {
    return read().filter(function (c) { return c.poaNo; });
  }

  function stats() {
    var list = read();
    var poa = list.filter(function (c) { return c.poaNo; });
    var mail = list.filter(function (c) { return contacts(c).emails.length; });
    var tel = list.filter(function (c) { return contacts(c).phones.length; });
    var notaries = {};
    poa.forEach(function (c) {
      var n = (c.notary || "").trim();
      if (n) notaries[n] = (notaries[n] || 0) + 1;
    });
    return {
      clients: list.length, poa: poa.length,
      withEmail: mail.length, withPhone: tel.length,
      notaries: notaries
    };
  }

  /* بحث موحّد يتجاهل الهمزات والتشكيل — يستعمل تطبيع المخزن إن وُجد */
  function norm(t) {
    if (w.lawyerNorm) return w.lawyerNorm(t);
    return String(t || "").trim().toLowerCase();
  }

  /* حذف «وآخرين/أخر…» من أسماء الموكلين وحقول الوكيل (مهمة 14) */
  var OTHERS_STRIP = /\s*(?:و\s*[آأا]خر(?:ين|ون)?|[آأا]خر(?:ين|ون))(?=\s|$|[(\-،,])/g;
  function stripOthersText(v) {
    var x = String(v == null ? "" : v);
    OTHERS_STRIP.lastIndex = 0;
    if (!OTHERS_STRIP.test(x)) return x.trim();          /* لا تغيّر شيئاً بلا عبارة «أخر» */
    OTHERS_STRIP.lastIndex = 0;
    return x.replace(OTHERS_STRIP, "").replace(/\s{2,}/g, " ").trim();
  }
  function stripOthersCount() {
    var n = 0;
    read().forEach(function (c) {
      var hit = stripOthersText(c.name) !== String(c.name || "").trim() || stripOthersText(c.agent) !== String(c.agent || "").trim();
      (c.poas || []).forEach(function (p) { if (stripOthersText(p.agent) !== String(p.agent || "").trim()) hit = true; });
      if (hit) n++;
    });
    return n;
  }
  function stripOthersApply() {
    var list = read(), n = 0;
    list.forEach(function (c) {
      var ch = false;
      var nn = stripOthersText(c.name); if (nn !== String(c.name || "").trim()) { c.name = nn; ch = true; }
      var na = stripOthersText(c.agent); if (c.agent && na !== String(c.agent).trim()) { c.agent = na; ch = true; }
      (c.poas || []).forEach(function (p) {
        if (p.agent) { var pa = stripOthersText(p.agent); if (pa !== String(p.agent).trim()) { p.agent = pa; ch = true; } }
      });
      if (ch) n++;
    });
    if (n) commit(list);
    return n;
  }

  /* الاسم الثابت للوكيل — مكان واحد. أي «حسن عبد المنعم حسن» بلا «السيد» يُكمَّل
     (داخل حقل الوكيل حتى لو معه أسماء أخرى). */
  var FIXED_AGENT = "حسن عبد المنعم حسن السيد";
  var FIXED_AGENT_ID = ""; /* الرقم القومي للوكيل الثابت */
  /* للعرض/الطباعة: يُلحق الرقم القومي بعد الاسم الثابت تلقائياً */
  function agentShow(a) {
    a = String(a == null ? "" : a);
    var i = a.indexOf(FIXED_AGENT);
    if (i < 0 || (a.indexOf(FIXED_AGENT_ID) >= 0 || a.indexOf(ar(FIXED_AGENT_ID)) >= 0)) return a;
    var e = i + FIXED_AGENT.length;
    return a.slice(0, e) + " (الرقم القومي: " + ar(FIXED_AGENT_ID) + ")" + a.slice(e);
  }
  var FIXED_AGENT_RE = /حسن\s+عبد\s*المنعم(?:\s+حسن)?(?=\s*(?:[-·،,\/]|$))/g;
  function fixAgentName(s) {
    return String(s == null ? "" : s).replace(FIXED_AGENT_RE, FIXED_AGENT);
  }
  function agentFixPreview() {
    var recs = 0, poas = 0;
    read().forEach(function (c) {
      var hit = false;
      poaList(c).forEach(function (p) {
        if (p.agent && fixAgentName(p.agent) !== p.agent) { poas++; hit = true; }
      });
      if (c.agent && fixAgentName(c.agent) !== c.agent) hit = true;
      if (hit) recs++;
    });
    return { clients: recs, poas: poas };
  }
  /** ينفّذ التوحيد بعد نسخة احتياطية إلزامية في التنزيلات. */
  function agentFixApply(done) {
    var list = read();
    try {
      var b64 = btoa(unescape(encodeURIComponent(JSON.stringify(list))));
      if (!(w.AndroidSaver && AndroidSaver.save)) throw 0;
      AndroidSaver.save("clients-backup-before-agentfix-" +
        new Date().toISOString().replace(/[:.]/g, "-") + ".json", b64);
    } catch (e) { alert("تعذّر حفظ النسخة الاحتياطية — أُلغي التوحيد."); if (done) done(null); return; }
    var n = 0;
    list.forEach(function (c) {
      var ch = false;
      (c.poas || []).forEach(function (p) {
        var f = fixAgentName(p.agent);
        if (f !== p.agent) { p.agent = f; ch = true; n++; }
      });
      var fa = fixAgentName(c.agent);
      if (fa !== c.agent) { c.agent = fa; ch = true; }
    });
    commit(list);
    if (done) done({ poas: n, total: list.length });
  }

  /* عتبة تصنيف VIP: أكثر من هذا العدد من القضايا (مكان واحد للتعديل) */
  var VIP_THRESHOLD = 10;

  /* عدد قضايا كل موكل بالاسم المطبَّع — يُعاد بناؤه عند تغيّر نص القضايا */
  var _cnt = null, _cntSig = null;
  function caseCounts() {
    var raw = "";
    try { raw = localStorage.getItem("proflawyer.agenda.cases.v1") || ""; } catch (e) {}
    var sig = raw.length + ":" + raw.slice(-64);
    if (_cnt && _cntSig === sig) return _cnt;
    var cases = [];
    try { cases = JSON.parse(raw) || []; } catch (e) {}
    var m = {};
    cases.forEach(function (c) {
      var seen = {};
      String(c.clients || "").split("·").forEach(function (p) {
        var k = norm(p.replace(/\([^)]*\)/g, "").trim());
        if (k && !seen[k]) { seen[k] = 1; m[k] = (m[k] || 0) + 1; }
      });
    });
    _cnt = m; _cntSig = sig;
    return m;
  }
  function caseCount(c) { return caseCounts()[norm(c && c.name)] || 0; }
  function isVip(c) { return caseCount(c) > VIP_THRESHOLD || c.tier === "VIP"; }

  /** يبحث عن موكل/وكيل مسجَّل بنفس الاسم (تطابق تام بعد التطبيع) — يُستعمل
      لملء بياناته تلقائياً بدل إعادة كتابتها من الصفر عند التكرار. */
  function findClientByName(name) {
    var n = norm(String(name || "").trim());
    if (!n) return null;
    var list = read();
    for (var i = 0; i < list.length; i++) {
      if (norm(list[i].name) === n) return list[i];
    }
    return null;
  }

  /**
   * قاعدة ثابتة: يُكمَل الاسم تلقائياً لأطول صيغة معروفة لنفس الشخص —
   * فقط عند دليل مؤكَّد: نفس الرقم القومي بالضبط. مطابقة الاسم بالتشابه أو
   * كبادئة أُزيلت عمداً — جُرِّبت على البيانات الحقيقية ودمجت أشخاصاً
   * مختلفين فعلاً يشتركون في جزء من الاسم (إخوة/أقارب)، فكانت خطأً جسيماً.
   * بلا رقم قومي، لا يوجد إكمال — الاسم يبقى كما كُتب بالضبط.
   */
  function fullestNameMatch(name, idNo) {
    if (!idNo) return null;
    var list = read();
    var best = null;
    list.forEach(function (c) {
      if (!c.idNo || latinDigits(c.idNo) !== latinDigits(idNo)) return;
      if (!best || String(c.name).length > best.length) best = c.name;
    });
    return best;
  }

  /**
   * اسم مشابه (لا مطابق) لاسم آخر أطول مسجَّل قبل كده — يُقترَح على المستخدم
   * ليقرّر هو: نفس الشخص أم تشابه أسماء؟ لا يُطبَّق أبداً تلقائياً بلا
   * تأكيد صريح — التشابه وحده غير كافٍ (إخوة/أقارب كتير بأسماء متشابهة).
   */
  function similarNameCandidate(name) {
    var n = norm(String(name || "").trim());
    if (!n || n.length < 6) return null;
    var list = read();
    var best = null;
    list.forEach(function (c) {
      var cn = norm(c.name);
      if (!cn || cn === n) return;
      if (cn.indexOf(n + " ") === 0 && String(c.name).length > name.trim().length) {
        if (!best || String(c.name).length > best.name.length) best = c;
      }
    });
    return best;
  }

  /** يضمن وجود سجل موكل لكل وكيل كتب رقمه القومي — بلا تكرار لو موجود بالفعل،
      ويكمل رقمه القومي لو كان مسجَّلاً قبل كده بلا رقم. مشتركة بين كل شاشات
      إدخال/تعديل الوكلاء. */
  function ensureAgentRecords(rows) {
    var list = read();
    var changedRecs = [];
    rows.forEach(function (r) {
      var name = (r.name.value || "").trim(), idNo = (r.idNo.value || "").trim();
      if (!name) return;
      var key = norm(name);
      /* بالرقم القومي لو مكتوب؛ والاسم بس لسجل مالوش رقم قومي — ما نربطش وكيل
         بسجل شخص تاني بنفس الاسم ورقمه القومي مختلف (F-CLI-1) */
      var existing = list.filter(function (c) { return idNo && c.idNo === idNo; })[0] ||
        list.filter(function (c) { return norm(c.name) === key && (!idNo || !c.idNo); })[0];
      if (existing) {
        if (idNo && !existing.idNo) { existing.idNo = idNo; changedRecs.push(existing); }
        return;
      }
      if (!idNo) return;
      var natInfo = parseNat(idNo);
      /* وكيل/موكل من غير توكيل مسجّل ← من غير رقم توكيل بالمكتب (قاعدة المستخدم ٧-١٠) */
      var rec = {
        name: name, officeNo: "", idType: "رقم قومي", idNo: idNo,
        gov: natInfo ? natInfo.gov : "", norm: key,
        phones: [], emails: [], poas: []
      };
      list.push(rec);
      changedRecs.push(rec);
    });
    /* دفع السجلات المتغيّرة فقط للسحابة (لا commit(list) الكامل الذي كان
       يفحص القائمة كلها بشكل متزامن على كل حفظ توكيل — راجع نفس الإصلاح
       في saveStatus أعلاه لنفس السبب بالضبط). */
    if (changedRecs.length) {
      try { localStorage.setItem(KEY, JSON.stringify(list)); }
      catch (e) { alert("تعذّر الحفظ — المساحة ممتلئة."); return; }
      changedRecs.forEach(function (c) { pushChangedToCloud(list, c); });
    }
  }

  /**
   * محرِّر أسماء الوكلاء المشترك: اسم + رقم قومي لكل وكيل، مع "+ إضافة آخر"،
   * وإكمال الاسم تلقائياً لأطول صيغة معروفة لنفس الشخص. تُستعمل في "موكل
   * جديد" و"تعديل توكيل" معاً — نفس السلوك في الشاشتين.
   * @param {HTMLElement} container
   * @param {string} seedStr  أسماء موجودة مفصولة بـ " · " (لتعديل توكيل قائم)
   */
  /* دليل الوكلاء/المحامين للإكمال الفوري: الاسم الثابت أولاً، ثم محامو المكتب
     (صفحة المحامون والصلاحيات — الحقل idNo لو مسجَّل)، ثم الوكلاء المستعملون
     في التوكيلات (الأكثر تكراراً أولاً) برقمهم القومي من سجلهم إن وُجد. */
  function agentDirectory() {
    var out = [{ name: FIXED_AGENT, idNo: FIXED_AGENT_ID }];
    try {
      var t = JSON.parse(localStorage.getItem("proflawyer.team.v1")) || {};
      (t.users || []).forEach(function (u) {
        if (u && u.name && u.role !== "client" && u.role !== "owner")
          out.push({ name: String(u.name).trim(), idNo: String(u.idNo || u.nationalId || "").trim() });
      });
    } catch (e) { }
    knownAgents().forEach(function (a) {
      a.split(/\s+[-·]\s+/).forEach(function (n) {
        n = n.trim(); if (!n) return;
        var rec = findClientByName(n);
        out.push({ name: fixAgentName(n), idNo: (rec && rec.idNo) || "" });
      });
    });
    return out;
  }
  /* أول اسم في الدليل يبدأ بما كُتب (كلمتان فأكثر) ويكون أطول منه */
  function completeAgent(typed) {
    var t = norm(String(typed || "").trim()).split(/\s+/).filter(Boolean);
    if (t.length < 2) return null;
    var dir = agentDirectory(), tj = t.join(" ");
    for (var i = 0; i < dir.length; i++) {
      var nj = norm(dir[i].name).split(/\s+/).filter(Boolean).join(" ");
      if (nj === tj || nj.indexOf(tj + " ") === 0) return dir[i];
    }
    return null;
  }

  function buildAgentEditor(container, seedStr) {
    var rows = [];
    function addRow(seedName) {
      var r = document.createElement("div");
      r.style.cssText = "display:flex;gap:8px;margin-bottom:8px;align-items:flex-start";
      var nm = document.createElement("input");
      nm.type = "text"; nm.setAttribute("lang", "ar"); nm.setAttribute("dir", "rtl");
      nm.placeholder = "اسم الوكيل"; nm.value = seedName || "";
      nm.style.cssText = "flex:2 1 55%;min-height:48px;font-size:16px;padding:10px 12px;" +
        "border:1px solid var(--line,#ddd);border-radius:9px;background:var(--card);font-family:inherit";
      if (w.CaseFile && w.CaseFile.suggestPanel) w.CaseFile.suggestPanel(nm, knownAgents);

      var idn = document.createElement("input");
      idn.type = "text"; idn.setAttribute("dir", "ltr");
      idn.placeholder = "رقمه القومي (اختياري)";
      idn.style.cssText = "flex:2 1 35%;min-height:48px;font-size:16px;padding:10px 12px;" +
        "border:1px solid var(--line,#ddd);border-radius:9px;background:var(--card);font-family:inherit;" +
        "direction:ltr;text-align:left";
      /* لو الاسم معروف بالفعل، اعرض رقمه القومي المسجَّل تلقائياً */
      var known = findClientByName(seedName);
      if (known && known.idNo) idn.value = known.idNo;

      var lastAsked = "";
      function resolveName() {
        /* دليل مؤكَّد (رقم قومي مطابق) — يُطبَّق تلقائياً بلا سؤال */
        var full = fullestNameMatch(nm.value, idn.value.trim());
        if (full && full !== nm.value.trim()) { nm.value = full; return; }
        if (!idn.value.trim()) {
          var m = findClientByName(nm.value);
          if (m && m.idNo) { idn.value = m.idNo; return; }
        }
        /* تشابه بلا دليل — يُسأل المستخدم، ولا يُطبَّق إلا بتأكيده هو */
        var typed = nm.value.trim();
        if (!typed || typed === lastAsked) return;
        var cand = similarNameCandidate(typed);
        if (!cand) return;
        lastAsked = typed;
        if (!w.Ask || !w.Ask.confirm) return;
        Ask.confirm("وجدنا اسماً أطول مسجَّلاً يبدأ بنفس الكلمات", {
          danger: false, ok: "نعم، هو نفسه", cancel: "لا، شخص مختلف",
          detail: "المكتوب: «" + typed + "»" + String.fromCharCode(10) +
            "المسجَّل: «" + cand.name + "»" +
            (cand.idNo ? String.fromCharCode(10) + "رقمه القومي: " + cand.idNo : "") +
            String.fromCharCode(10) + String.fromCharCode(10) +
            "لو هو فعلاً نفس الشخص، هيُستبدَل الاسم ببيانه الكامل ورقمه القومي."
        }, function () {
          nm.value = cand.name;
          if (cand.idNo) idn.value = cand.idNo;
        });
      }
      var typeTimer = null;
      nm.addEventListener("input", function () {
        clearTimeout(typeTimer);
        typeTimer = setTimeout(function () {
          var hit = completeAgent(nm.value);
          if (!hit) return;
          if (nm.value.trim() !== hit.name) nm.value = hit.name;
          if (hit.idNo && !idn.value.trim()) idn.value = ar(hit.idNo);
          try { nm.setSelectionRange(nm.value.length, nm.value.length); } catch (e) { }
        }, 350);
      });
      nm.addEventListener("blur", function () { setTimeout(resolveName, 120); });
      idn.addEventListener("blur", resolveName);

      var rm = document.createElement("button");
      rm.type = "button"; rm.textContent = "✕";
      rm.style.cssText = "flex:0 0 auto;min-width:40px;min-height:48px;border-radius:9px;" +
        "border:1px solid #e3c9c6;background:transparent;color:#b3261e;font-family:inherit";
      rm.onclick = function () {
        var i = rows.indexOf(row);
        if (i >= 0) rows.splice(i, 1);
        r.remove();
        if (!rows.length) addRow();
      };
      r.appendChild(nm); r.appendChild(idn); r.appendChild(rm);
      container.appendChild(r);
      var row = { name: nm, idNo: idn };
      rows.push(row);
      return row;
    }

    var seedNames = String(seedStr || "").split(" · ").map(function (s) { return s.trim(); }).filter(Boolean);
    if (seedNames.length) seedNames.forEach(function (n) { addRow(n); });
    else addRow();

    var addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.textContent = "+ إضافة وكيل آخر";
    addBtn.style.cssText = "width:100%;padding:11px;margin-bottom:14px;border-radius:9px;" +
      "border:1px dashed var(--brand);background:transparent;color:var(--brand);" +
      "font-family:inherit;font-size:13.5px;min-height:44px";
    addBtn.onclick = function () { addRow(); };
    container.parentNode.insertBefore(addBtn, container.nextSibling);

    return {
      rows: rows,
      getString: function () {
        return rows.map(function (r) { return r.name.value.trim(); }).filter(Boolean).join(" · ");
      },
      sync: function () { ensureAgentRecords(rows); },
      isDirty: function (originalStr) {
        return this.getString() !== String(originalStr || "") ||
          rows.some(function (r) { return r.idNo.value.trim(); });
      }
    };
  }

  /* استخراج بيانات الرقم القومي المصري — مشتركة بين "موكل جديد" و"تعديل
     الموكل" (كانت مُعرَّفة محلياً داخل editClient وحدها فيفشل استدعاؤها
     من addClient بخطأ "parseNat is not defined" في كل ضغطة مفتاح، ويتوقف
     معه الاستخراج التلقائي للمحافظة والميلاد والنوع). تحوّل الأرقام
     العربية-الهندية (٠-٩) للاتينية أولاً، فتعمل أياً كانت لغة الكتابة. */
  var GOVS = { "01": "القاهرة", "02": "الإسكندرية", "03": "بورسعيد", "04": "السويس",
    "11": "دمياط", "12": "الدقهلية", "13": "الشرقية", "14": "القليوبية", "15": "كفر الشيخ",
    "16": "الغربية", "17": "المنوفية", "18": "البحيرة", "19": "الإسماعيلية", "21": "الجيزة",
    "22": "بني سويف", "23": "الفيوم", "24": "المنيا", "25": "أسيوط", "26": "سوهاج",
    "27": "قنا", "28": "أسوان", "29": "الأقصر", "31": "البحر الأحمر", "32": "الوادي الجديد",
    "33": "مطروح", "34": "شمال سيناء", "35": "جنوب سيناء", "88": "خارج الجمهورية" };
  function parseNat(idRaw) {
    var id = String(idRaw || "").replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); }).replace(/\D/g, "");
    if (id.length !== 14) return null;
    var cen = id[0] === "2" ? 1900 : id[0] === "3" ? 2000 : null;
    if (!cen) return null;
    var yy = +id.slice(1, 3), mm = +id.slice(3, 5), dd = +id.slice(5, 7);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    var birth = (cen + yy) + "/" + ("0" + mm).slice(-2) + "/" + ("0" + dd).slice(-2);
    var gov = GOVS[id.slice(7, 9)] || "";
    var gender = (+id[12] % 2) ? "ذكر" : "أنثى";
    return { birth: birth, gov: gov, gender: gender, nationality: "مصري" };
  }

  /* تاريخ الميلاد من الرقم القومي أثناء الكتابة. st.auto = آخر قيمة اتملت تلقائياً:
     الرقم لو اتصحّح التاريخ يتصحّح معاه، واللي اتكتب بالإيد ما يتغيّرش. */
  function birthFromId(fId, fB, st) {
    if (!w.Birthdays) return;
    var cur = fB.value.trim();
    if (cur && cur !== st.auto) return;
    var iso = Birthdays.fromNationalId(fId.value);
    st.auto = iso ? ar(iso.replace(/-/g, "/")) : "";
    fB.value = st.auto;
  }
  function setBirth(c, fB, idType, idNo) {
    if (!w.Birthdays) return;
    var iso = Birthdays.iso(fB.value) || Birthdays.birthFromRecord({ idType: idType, idNo: idNo });
    if (iso) c.birth = iso; else delete c.birth;
  }

  /**
   * البحث: **بالاسم أو برقم الملف بالمكتب فقط** — لا بأي حقل آخر.
   * الرقم يُطابَق تطابقاً تاماً مع أي من أرقام مكاتب الموكل، فلا يختلط
   * رقم ٢١ برقم ٢١٥. أما الاسم فيُطابَق جزئياً بعد التطبيع.
   */
  function search(q) {
    var raw = String(q || "").trim();
    if (!raw) return read();

    var digits = w.PoaMerge ? String(raw).replace(/[٠-٩]/g,
      function (d) { return d.charCodeAt(0) - 0x0660; }) : raw;
    var asNumber = /^\d+$/.test(digits.trim()) ? String(parseInt(digits, 10)) : null;

    if (asNumber) {
      return read().filter(function (c) {
        return officeNumbers(c).indexOf(asNumber) >= 0;
      });
    }

    var words = norm(raw).split(" ").filter(Boolean);
    return read().filter(function (c) {
      var hay = norm(c.name);
      return words.every(function (word) { return hay.indexOf(word) >= 0; });
    });
  }

  /** كل أرقام المكتب لهذا الموكل (قد تكون له عدة توكيلات) */
  function officeNumbers(c) {
    var out = [];
    var add = function (v) {
      var n = String(v || "").replace(/[٠-٩]/g,
        function (d) { return d.charCodeAt(0) - 0x0660; }).trim();
      n = n && /^\d+$/.test(n) ? String(parseInt(n, 10)) : "";
      if (n && out.indexOf(n) < 0) out.push(n);
    };
    add(c.officeNo);
    (c.poas || []).forEach(function (p) { add(p.officeNo); });
    return out;
  }

  /* ------------------------------------------------------------- الفرز */

  var SORTS = {
    name:   { label: "الاسم",        fn: function (a, b) {
                return norm(a.name).localeCompare(norm(b.name), "ar"); } },
    office: { label: "رقم المكتب",   fn: function (a, b) {
                var x = num(officeNumbers(a)[0]), y = num(officeNumbers(b)[0]);
                if (!x && !y) return 0;
                if (!x) return 1;
                if (!y) return -1;
                return x - y; } },
    year:   { label: "سنة التوكيل (الأحدث)", fn: function (a, b) {
                var x = yearOf(a), y = yearOf(b);
                if (!x && !y) return 0;
                if (!x) return 1;
                if (!y) return -1;
                return y - x; } },
    notary: { label: "مكتب التوثيق", fn: function (a, b) {
                /* الفارغ يذهب آخر القائمة لا أولها */
                var x = notaryOf(a), y = notaryOf(b);
                if (!x && !y) return 0;
                if (!x) return 1;
                if (!y) return -1;
                return String(x).localeCompare(String(y), "ar"); } },
    count:  { label: "عدد التوكيلات", fn: function (a, b) {
                return poaList(b).length - poaList(a).length; } }
  };

  function num(v) {
    var n = parseInt(String(v || "").replace(/[٠-٩]/g,
      function (d) { return d.charCodeAt(0) - 0x0660; }), 10);
    return isNaN(n) ? 0 : n;
  }
  function poaList(c) {
    var ps = (c.poas && c.poas.length) ? c.poas : (c.poaNo ? [c] : []);
    /* الأحدث أولاً حتى يوافق ما يُفرَز عليه */
    return ps.slice().sort(function (a, b) { return num(b.poaYear) - num(a.poaYear); });
  }
  function yearOf(c) {
    var ys = poaList(c).map(function (p) { return num(p.poaYear); });
    return ys.length ? Math.max.apply(null, ys) : 0;
  }
  function notaryOf(c) {
    var p = poaList(c)[0];
    return (p && p.notary) || "";
  }

  function sortBy(list, key) {
    var s = SORTS[key];
    return s ? list.slice().sort(s.fn) : list;
  }


  /* ------------------------------------------------- تعبئة قوائم القضايا
     قوائم مثل «القضية» في ملف الموكل كانت تحمل قضايا مكتوبة في الصفحة،
     فتظهر لكل موكل مهما كان. الآن تُبنى من القضايا المحفوظة فعلاً. */

  function caseOptions(sel) {
    if (!sel || sel.dataset.casesFilled) return;
    sel.dataset.casesFilled = "1";

    var cases;
    try { cases = JSON.parse(localStorage.getItem("proflawyer.agenda.cases.v1")) || []; }
    catch (e) { cases = []; }

    if (!cases.length) {
      var none = document.createElement("option");
      none.value = "";
      none.textContent = "لا توجد قضايا محفوظة";
      none.disabled = true;
      sel.appendChild(none);
      return;
    }

    cases.slice(0, 400).forEach(function (c) {
      var o = document.createElement("option");
      o.value = c.id;
      o.textContent = (c.caseNo ? "دعوى " + c.caseNo +
                       (c.caseYear ? "/" + c.caseYear : "") : "قضية") +
                      (c.courtName ? " — " + c.courtName : "");
      sel.appendChild(o);
    });
  }

  function fillCaseSelects() {
    ["stmtCase", "caseRef", "relatedCase", "xCase", "fCase"].forEach(function (id) {
      caseOptions(document.getElementById(id));
    });
    fillClientEmails();
  }

  /* قائمة «يُرسل إلى» تُبنى من بريد الموكل المُدخل في هذه الشاشة */
  function fillClientEmails() {
    var sel = document.getElementById("stmtTo");
    if (!sel) return;

    function refresh() {
      var mails = [];
      document.querySelectorAll('#mEmails input, input[type="email"]')
        .forEach(function (f) {
          var v = String(f.value || "").trim();
          if (v && v.indexOf("@") > 0 && mails.indexOf(v) < 0) mails.push(v);
        });

      var cur = sel.value;
      sel.textContent = "";
      var head = document.createElement("option");
      head.value = "";
      head.textContent = mails.length ? "— اختر بريد الموكل —"
                                      : "أضف بريد الموكل أولاً";
      if (!mails.length) head.disabled = true;
      sel.appendChild(head);

      mails.forEach(function (m) {
        var o = document.createElement("option");
        o.value = m; o.textContent = m;
        sel.appendChild(o);
      });
      if (cur && mails.indexOf(cur) >= 0) sel.value = cur;
    }

    refresh();
    document.addEventListener("input", function (e) {
      if (e.target && /email/i.test(e.target.type + " " + (e.target.id || ""))) refresh();
    }, true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(fillCaseSelects, 200);
    });
  } else { setTimeout(fillCaseSelects, 200); }


  /* ------------------------------------------------- حالة التوكيل
     ساري · منتهي مع سبب الانتهاء. القيم القديمة (نص حرّ في عمود
     «حالة التوكيل») صُنِّفت عند الاستيراد، وما لم يُعرَف يبقى ملاحظة. */

  var REASONS = ["إلغاء", "وفاة الموكل", "تنحٍّ عن الوكالة", "انتهاء العمل", "عدم سريان مفعوله"];

  function statusOf(c) {
    var st = c.poaStatus || (c.poaState ? "منتهي" : "ساري");
    return { status: st, reason: c.poaReason || "", note: c.poaNote || "" };
  }

  function statusText(c) {
    var s = statusOf(c);
    if (s.status !== "منتهي") return "ساري";
    return "منتهي" + (s.reason ? " — " + s.reason : "");
  }

  /* كانت تنادي commit(list) بلا onlyRec — يخلي pushChangedToCloud يفحص
     JSON.stringify لكل موكل بالقائمة كلها (مئات السجلات) بشكل متزامن على
     كل ضغطة حفظ، وهو ما كان يُحسّ كتجمّد فعلي للواجهة عند تغيير حالة
     التوكيل. الإصلاح: نحفظ القائمة كاملة محلياً (رخيص) لكن ندفع للسحابة
     السجلات المتغيّرة فقط (عادة سجل واحد، أو أكثر لو نفس الاسم مكرر). */
  /* الحالة بتتعرض من كل توكيل في c.poas، فكانت الكتابة على c نفسه بس
     بتسيب التوكيل متعلّم «ساري» بعد الحفظ. دلوقتي بتتكتب على التوكيل
     المطلوب (poa) أو على كل توكيلات الموكل لو مفيش توكيل محدد، والحالة
     العامة للموكل تاخد حالة أحدث توكيل. */
  function saveStatus(name, status, reason, poa) {
    var list = read();
    var key = w.PoaMerge ? PoaMerge.norm(name) : name;
    var pk = poa ? imgKeyOf(poa) : null;
    var changed = [];
    function setOn(x) { x.poaStatus = status; x.poaReason = status === "منتهي" ? reason : ""; }
    list.forEach(function (c) {
      var k = w.PoaMerge ? PoaMerge.norm(c.name) : c.name;
      if (k !== key) return;
      var hit = false;
      if (c.poas && c.poas.length) {
        c.poas.forEach(function (p) { if (!pk || imgKeyOf(p) === pk) { setOn(p); hit = true; } });
        if (!hit) return;
        var top = poaList(c)[0];
        c.poaStatus = top.poaStatus || "ساري"; c.poaReason = top.poaReason || "";
      } else {
        if (pk && imgKeyOf(c) !== pk) return;
        setOn(c);
      }
      changed.push(c);
    });
    if (!changed.length) return 0;
    try { localStorage.setItem(KEY, JSON.stringify(list)); }
    catch (e) { alert("تعذّر الحفظ — المساحة ممتلئة."); return 0; }
    changed.forEach(function (c) { pushChangedToCloud(list, c); });
    return changed.length;
  }

  /* ------------------------------------------------ المتوفى وورثته
     المتوفى = توكيله «منتهي» بسبب «وفاة الموكل». الورثة يُحفظون في سجله
     (heirs: [{name, cap}]) ويُطبَّقون على قضاياه المتداولة (Cleanup.deceasedApply). */
  var DEATH_REASON = "وفاة الموكل";
  function isDeceased(c) {
    var s = statusOf(c);
    return s.status === "منتهي" && s.reason === DEATH_REASON;
  }
  function deceasedList() {
    var out = [];
    read().forEach(function (c) {
      if (isDeceased(c) && c.heirs && c.heirs.length) out.push({ name: c.name, heirs: c.heirs });
    });
    return out;
  }
  /** يسجّل التوكيلات «منتهي — وفاة الموكل» ويحفظ الورثة؛ يعيد عدد السجلات المتغيّرة. */
  function markDeceased(name, heirNames) {
    var list = read(), key = norm(name), changed = [];
    list.forEach(function (c) {
      if (norm(c.name) !== key) return;
      var s = statusOf(c);
      if (!(s.status === "منتهي" && s.reason === DEATH_REASON)) { c.poaStatus = "منتهي"; c.poaReason = DEATH_REASON; }
      (c.poas || []).forEach(function (p) { p.poaStatus = "منتهي"; p.poaReason = DEATH_REASON; });
      var have = {}; (c.heirs || []).forEach(function (h) { have[norm(h.name)] = 1; });
      var heirs = (c.heirs || []).slice();
      (heirNames || []).forEach(function (h) { var nm = h.name || h; if (!have[norm(nm)]) heirs.push({ name: nm, cap: h.cap || "" }); });
      c.heirs = heirs;
      changed.push(c);
    });
    if (!changed.length) return 0;
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { return 0; }
    changed.forEach(function (c) { pushChangedToCloud(list, c); });
    return changed.length;
  }

  /** نافذة الورثة: اسم + صفة لكل وريث، «+ إضافة آخر»، ثم تطبيق على القضايا المتداولة. */
  function heirsFlow(client, done) {
    var dec = { name: client.name };
    var cases = (w.Cleanup && w.Cleanup.deceasedCases) ? w.Cleanup.deceasedCases(dec) : [];
    var wrap = document.createElement("div");
    wrap.setAttribute("data-modal", "1"); wrap.setAttribute("data-nosave", "1");
    wrap.style.cssText = "position:fixed;inset:0;background:rgba(20,14,8,.55);z-index:10030;display:flex;align-items:flex-end;justify-content:center";
    var box = document.createElement("div");
    box.style.cssText = "background:var(--card,#fff);border-radius:16px 16px 0 0;padding:18px 18px 26px;width:100%;max-width:520px;direction:rtl;color:var(--text);max-height:88vh;overflow-y:auto";
    function line(css, txt) { var d = document.createElement("div"); d.style.cssText = css; d.textContent = txt; return d; }
    box.appendChild(line("font-family:var(--f-title);font-size:17px;margin-bottom:4px", "ورثة المتوفى"));
    box.appendChild(line("font-size:14px;color:var(--brand-dark);margin-bottom:6px", "ورثة. " + client.name + " وهم :"));
    box.appendChild(line("font-size:12.5px;color:var(--muted);margin-bottom:12px;line-height:1.8",
      cases.length ? ("سيتحوّل المتوفى في " + ar(cases.length) + " قضية متداولة من طرف حقيقي إلى هذا السطر الثابت (بلا صفة)، ويُضاف تحته وريث لكل حقل.")
                   : "لا توجد قضايا متداولة باسم المتوفى الآن — تُحفظ الورثة في سجله وتُطبَّق تلقائياً حين تُضاف."));
    var caps = (w.Lists && w.Lists.get) ? (w.Lists.get("partyCapsClient") || []) : [];
    var rows = [], rowsHost = document.createElement("div");
    function addRow(nm, cap) {
      var r = document.createElement("div"); r.style.cssText = "display:flex;gap:8px;margin-bottom:8px";
      var n = document.createElement("input"); n.type = "text"; n.value = nm || ""; n.placeholder = "اسم الوريث";
      n.setAttribute("dir", "rtl"); n.setAttribute("lang", "ar");
      n.style.cssText = "flex:2 1 60%;min-height:48px;font-size:16px;padding:10px 12px;border:1px solid var(--line,#ddd);border-radius:9px;background:var(--card);font-family:inherit";
      if (w.CaseFile && w.CaseFile.suggestPanel) w.CaseFile.suggestPanel(n, function () { return read().map(function (c) { return c.name; }); });
      var sel = document.createElement("select"); sel.setAttribute("data-no-combo", "1");
      sel.style.cssText = "flex:1 1 34%;min-height:48px;font-size:14px;border:1px solid var(--line,#ddd);border-radius:9px;background:var(--card);font-family:inherit";
      var o0 = document.createElement("option"); o0.value = ""; o0.textContent = "صفة الطرف الأصلي"; sel.appendChild(o0);
      caps.forEach(function (x) { var o = document.createElement("option"); o.value = x; o.textContent = x; sel.appendChild(o); });
      sel.value = cap || "";
      var rm = document.createElement("button"); rm.type = "button"; rm.textContent = "✕";
      rm.style.cssText = "min-width:40px;min-height:48px;border-radius:9px;border:1px solid #e3c9c6;background:transparent;color:#b3261e";
      var row = { n: n, sel: sel };
      rm.onclick = function () { rows.splice(rows.indexOf(row), 1); r.remove(); };
      r.appendChild(n); r.appendChild(sel); r.appendChild(rm); rowsHost.appendChild(r); rows.push(row);
    }
    (client.heirs && client.heirs.length ? client.heirs : [{}]).forEach(function (h) { addRow(h.name, h.cap); });
    box.appendChild(rowsHost);
    var add = document.createElement("button"); add.type = "button"; add.textContent = "+ إضافة وريث آخر";
    add.style.cssText = "width:100%;padding:11px;margin-bottom:14px;border-radius:9px;border:1px dashed var(--brand);background:transparent;color:var(--brand);font-family:inherit;font-size:13.5px;min-height:44px";
    add.onclick = function () { addRow(); };
    box.appendChild(add);

    var ok = document.createElement("button"); ok.type = "button";
    ok.textContent = cases.length ? "حفظ وتطبيق على القضايا المتداولة" : "حفظ الورثة";
    ok.style.cssText = "width:100%;padding:14px;border:0;border-radius:11px;background:var(--brand);color:#fff;font-family:inherit;font-size:16px;font-weight:600;min-height:50px";
    ok.onclick = function () {
      var heirs = rows.map(function (r) { return { name: r.n.value.trim(), cap: r.sel.value }; }).filter(function (h) { return h.name; });
      if (!heirs.length) { alert("اكتب وريثاً واحداً على الأقل."); return; }
      ok.disabled = true; ok.textContent = "جارٍ الحفظ…";
      setTimeout(function () {
        markDeceased(client.name, heirs);
        var finish = function (n) {
          wrap.remove();
          if (w.PL && PL.toast) PL.toast("تم", n == null ? "حُفظت الورثة." : "طُبِّقت الورثة على " + ar(n) + " قضية.", "");
          if (done) done(n);
        };
        if (cases.length && w.Cleanup && w.Cleanup.deceasedApply) w.Cleanup.deceasedApply({ name: client.name, heirs: heirs }, finish);
        else finish(null);
      }, 0);
    };
    box.appendChild(ok);
    var cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "لاحقاً";
    cancel.style.cssText = "width:100%;padding:12px;margin-top:8px;border:0;background:transparent;color:var(--muted);font-family:inherit;font-size:14px;min-height:44px";
    cancel.onclick = function () { wrap.remove(); if (done) done(null); };
    box.appendChild(cancel);
    wrap.appendChild(box); document.body.appendChild(wrap);
  }

  /** لوحة تغيير حالة التوكيل */
  function editStatus(client, done, poa) {
    var cur = statusOf(poa || client);

    var wrap = document.createElement("div");
    wrap.setAttribute("data-modal", "1");
    wrap.setAttribute("data-nosave", "1");
    wrap.style.cssText =
      "position:fixed;inset:0;background:rgba(20,14,8,.55);z-index:10002;" +
      "display:flex;align-items:flex-end;justify-content:center";

    var box = document.createElement("div");
    box.style.cssText =
      "background:var(--card,#fff);border-radius:16px 16px 0 0;padding:18px 18px 26px;" +
      "width:100%;max-width:520px;direction:rtl;color:var(--text);max-height:84vh;" +
      "overflow-y:auto";

    function line(css, txt) {
      var d = document.createElement("div");
      d.style.cssText = css;
      d.textContent = txt;
      return d;
    }
    box.appendChild(line("font-family:var(--f-title);font-size:17px;margin-bottom:3px",
                         "حالة التوكيل"));
    box.appendChild(line("font-size:13px;color:var(--muted);margin-bottom:14px;line-height:1.8",
                         client.name + (poa && poaFull(poa) ? " — توكيل " + poaFull(poa) : "")));

    var chosen = cur.status;
    var reason = cur.reason || REASONS[0];
    var reasonBox = document.createElement("div");

    function mkBtn(label, on) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = label + (on ? "  ✓" : "");
      b.style.cssText =
        "flex:1;padding:13px;border-radius:11px;font-family:inherit;font-size:15px;" +
        "min-height:50px;color:var(--text);" +
        "border:2px solid " + (on ? "var(--brand)" : "var(--line,#ddd)") + ";" +
        "background:" + (on ? "rgba(0,0,0,.04)" : "transparent") + ";" +
        "font-weight:" + (on ? "600" : "400");
      return b;
    }

    function drawReasons() {
      reasonBox.textContent = "";
      if (chosen !== "منتهي") return;
      reasonBox.appendChild(line(
        "font-family:var(--f-title);font-size:14.5px;margin:16px 0 9px", "سبب الانتهاء"));
      REASONS.forEach(function (r) {
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = r + (r === reason ? "  ✓" : "");
        b.style.cssText =
          "display:block;width:100%;padding:13px;margin-bottom:8px;border-radius:10px;" +
          "font-family:inherit;font-size:14.5px;min-height:48px;text-align:right;" +
          "color:var(--text);" +
          "border:1px solid " + (r === reason ? "var(--brand)" : "var(--line,#ddd)") + ";" +
          "background:" + (r === reason ? "rgba(0,0,0,.04)" : "transparent");
        b.onclick = function () { reason = r; drawReasons(); };
        reasonBox.appendChild(b);
      });
    }

    /* كان كل زر يُعاد إنشاؤه بمعالج الزر الأول (b2.onclick = b.onclick) فيحمل
       قيمة st الخاصة بذلك الزر وحده — فبعد أول ضغطة يصبح الزران يضبطان نفس
       الحالة ولا يمكن الرجوع من «منتهي» إلى «ساري» (المهمة ٥). الآن كل زر
       يُبنى من جديد بقيمته هو. */
    var row = document.createElement("div");
    row.style.cssText = "display:flex;gap:10px";
    function drawStatusButtons() {
      row.textContent = "";
      ["ساري", "منتهي"].forEach(function (st) {
        var b = mkBtn(st, chosen === st);
        b.onclick = function () { chosen = st; drawStatusButtons(); drawReasons(); };
        row.appendChild(b);
      });
    }
    drawStatusButtons();
    box.appendChild(row);
    box.appendChild(reasonBox);
    drawReasons();

    var save = document.createElement("button");
    save.type = "button";
    save.textContent = "حفظ";
    save.style.cssText =
      "width:100%;padding:14px;margin-top:18px;border:0;border-radius:11px;" +
      "background:var(--brand);color:#fff;font-family:inherit;font-size:16px;" +
      "font-weight:600;min-height:50px";
    save.onclick = function () {
      save.disabled = true; save.textContent = "جارٍ الحفظ…";
      /* setTimeout(…,0) يضمن رسم حالة "جارٍ الحفظ" فعلياً قبل ما تبدأ
         saveStatus عمليتها (حتى لو أصبحت خفيفة الآن بعد إصلاح التجمّد) —
         تجربة مستخدم أوضح، مش مجرد سرعة. */
      setTimeout(function () {
        var n = saveStatus(client.name, chosen, reason, poa);
        wrap.remove();
        if (w.PL && PL.toast) PL.toast("تم الحفظ", "اتغيّرت حالة التوكيل بنجاح.", "ok");
        if (done) done(n);
        /* منتهي بسبب الوفاة: افتح إضافة الورثة وتحويل القضايا المتداولة */
        if (chosen === "منتهي" && reason === DEATH_REASON) {
          var rec = read().filter(function (c) { return norm(c.name) === norm(client.name); })[0] || client;
          setTimeout(function () { heirsFlow(rec, function () { if (done) done(n); }); }, 250);
        }
      }, 0);
    };
    box.appendChild(save);

    var cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "إلغاء";
    cancel.style.cssText =
      "width:100%;padding:13px;margin-top:9px;border:0;border-radius:11px;" +
      "background:var(--line,#eee);color:var(--text);font-family:inherit;" +
      "font-size:15px;min-height:46px";
    cancel.onclick = function () { wrap.remove(); };
    box.appendChild(cancel);

    wrap.appendChild(box);
    /* لمسة على الخلفية بالغلط ما تقفلش الفورم من غير سؤال (كانت بتضيّع المكتوب) */
    wrap.onclick = function (e) { if (e.target === wrap) { if (wrap.__lawyerDismiss) wrap.__lawyerDismiss(); else wrap.remove(); } };
    document.body.appendChild(raise(wrap));
  }


  /* --------------------------------------------- استعراض توكيل بعينه
     يعرض بياناته كاملة وصورته إن كانت محفوظة. الصور تُخزَّن مفصولة عن
     سجل الموكل حتى لا تُثقل قاعدة البيانات عند كل قراءة. */

  var IMG_KEY = "proflawyer.poaImages.v1";   /* المخزن القديم — للترحيل فقط */

  /* مفتاح التوكيل (للمطابقة ولاسم ملف الصورة): الأرقام العربي بتتحوّل لإنجليزي — قبل كده
     كانت بتتشال من اسم الملف، فتوكيل رقمه «١٥٩٨» لسنة «٢٠١٥» كان ملفه poa_1342_.pdf
     (من غير رقم ولا سنة) وممكن يتلخبط مع توكيل تاني على نفس رقم الملف. */
  function latD(v) {
    return String(v == null ? "" : v).replace(/[٠-٩]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".indexOf(d); });
  }
  function imgKeyOf(p) {
    return [latD(p.officeNo), latD(p.poaNo), p.poaLetter || "", latD(p.poaYear)].join("|");
  }
  /** المفتاح القديم (الأرقام العربي بتتشال) — للصور المحفوظة قبل التصليح */
  function legacyKeyOf(p) {
    return [p.officeNo || "", p.poaNo || "", p.poaLetter || "", p.poaYear || ""].join("|");
  }
  function keyBase(k) { return "poa_" + k.replace(/[^0-9A-Za-z]+/g, "_"); }

  /* الصور تُحفظ الآن ملفات في التخزين الداخلي للتطبيق عبر Attach، لا في
     localStorage — فسعته نحو خمسة ميجابايت للتطبيق كله وتمتلئ بعد صور قليلة.
     تُضغط عند الحفظ فقط، وتُعرض وتُطبع بأبعادها الكاملة. */

  function imgId(p) { return keyBase(imgKeyOf(p)) + ".jpg"; }
  function legacyImgId(p) { return keyBase(legacyKeyOf(p)) + ".jpg"; }

  /** يرحّل صورة من المخزن القديم إلى التخزين الداخلي مرة واحدة. */
  function migrate(p) {
    var old;
    try { old = JSON.parse(localStorage.getItem(IMG_KEY)) || {}; } catch (e) { return; }
    var src = old[imgKeyOf(p)];
    if (!src) return;
    if (w.Attach && Attach.put(imgId(p), src)) {
      delete old[imgKeyOf(p)];
      try { localStorage.setItem(IMG_KEY, JSON.stringify(old)); } catch (e) { }
    }
  }

  function imageOf(p) {
    if (!w.Attach) return "";
    var src = Attach.get(imgId(p));
    if (!src && legacyImgId(p) !== imgId(p)) src = Attach.get(legacyImgId(p));
    if (!src) { migrate(p); src = Attach.get(imgId(p)); }
    return src;
  }

  /** للتوافق مع نداءات قديمة: خريطة المفتاح ← الصورة للتوكيل المطلوب. */
  function images(p) {
    var out = {};
    if (p) out[imgKeyOf(p)] = imageOf(p);
    return out;
  }

  function saveImage(p, dataUrl) {
    return w.Attach ? Attach.put(imgId(p), dataUrl) : false;
  }

  /* التوكيل وش وضهر (أو أكتر): الصفحة الأولى بنفس مفتاحها القديم (imgId)
     عشان الصور المحفوظة قبل كده تفضل شغالة، والصفحات بعدها _p2, _p3...
     قبل كده كان للتوكيل مكان صورة واحد، فتصوير الضهر كان بيمسح الوش. */
  function pageId(p, n) {
    return n <= 1 ? imgId(p) : imgId(p).replace(/\.jpg$/, "_p" + n + ".jpg");
  }
  function legacyPageId(p, n) {
    return n <= 1 ? legacyImgId(p) : legacyImgId(p).replace(/\.jpg$/, "_p" + n + ".jpg");
  }
  function pagesOf(p) {
    var out = [], first = imageOf(p);
    if (!first) return out;
    out.push(first);
    for (var n = 2; n < 50; n++) {
      var s = w.Attach ? (Attach.get(pageId(p, n)) ||
        (legacyPageId(p, n) !== pageId(p, n) ? Attach.get(legacyPageId(p, n)) : "")) : "";
      if (!s) break;
      out.push(s);
    }
    return out;
  }
  function savePage(p, n, dataUrl) {
    return w.Attach ? Attach.put(pageId(p, n), dataUrl) : false;
  }
  /** يضيف صفحة بعد آخر صفحة — اللقطة التانية للتوكيل ضهره، مش بديلة لوشه. */
  function addPage(p, dataUrl) {
    return savePage(p, pagesOf(p).length + 1, dataUrl);
  }
  /** يحذف صفحة ويقدّم اللي بعدها مكانها، عشان الترقيم يفضل متصل. */
  function removePage(p, n) {
    if (!w.Attach) return;
    var all = pagesOf(p);
    for (var i = n; i < all.length; i++) Attach.put(pageId(p, i), all[i]);
    Attach.remove(pageId(p, Math.max(all.length, 1)));
  }

  /** يحذف كل صفحات التوكيل. */
  function removeImage(p) {
    if (!w.Attach) return;
    for (var n = Math.max(pagesOf(p).length, 1); n >= 1; n--) {
      Attach.remove(pageId(p, n));
      if (legacyPageId(p, n) !== pageId(p, n)) Attach.remove(legacyPageId(p, n));
    }
  }

  /* ---- ملف التوكيل الممسوح ضوئياً (PDF) ----
     التوكيل صفحة أو أكثر، فبدل صورة واحدة (image/jpg) يُخزَّن الناتج
     ملف PDF واحد خفيف — أنسب للرفع على منصات التقاضي الإلكتروني لاحقاً
     (راجع pdfbuild.js: PdfBuild.fromJpegs). */
  function poaDocId(p) { return keyBase(imgKeyOf(p)) + ".pdf"; }
  function legacyDocId(p) { return keyBase(legacyKeyOf(p)) + ".pdf"; }
  function poaDocOf(p) {
    if (!w.Attach) return "";
    return Attach.get(poaDocId(p)) || (legacyDocId(p) !== poaDocId(p) ? Attach.get(legacyDocId(p)) : "");
  }
  /* عرض PDF جوه التطبيق بالقارئ اللي في ملف القضية (pdfview.js — pdf.js من غير نت).
     window.open(data:…) على الموبايل كان بيروح لأندرويد يدوّر على برنامج PDF،
     ولو مفيش ← «لا يوجد تطبيق يفتح هذا الرابط». */
  function viewPdf(dataUrl, title) {
    function go() { PdfView.open(dataUrl, title || "ملف PDF"); }
    if (w.PdfView) { go(); return; }
    var sc = document.createElement("script");
    sc.src = (w.PDFVIEW_BASE || "assets/") + "pdfview.js?v=1"; sc.onload = go;
    sc.onerror = function () { alert("القارئ مش متاح — استخدم «📤 إرسال الملف» وافتحه من برنامج تاني."); };
    document.head.appendChild(sc);
  }
  function savePoaDoc(p, dataUrlPdf) { return w.Attach ? Attach.put(poaDocId(p), dataUrlPdf) : false; }
  function removePoaDoc(p) {
    if (!w.Attach) return;
    Attach.remove(poaDocId(p));
    if (legacyDocId(p) !== poaDocId(p)) Attach.remove(legacyDocId(p));
  }

  /* ---------------------------------- صورة إثبات الشخصية (الرقم القومي)
     مفصولة عن صور التوكيلات، ومفهرسة برقم الموكل بالمكتب فقط. */
  /* رقم المكتب ممكن يبقى مشترك بين أكتر من موكل (توكيل واحد لإخوات أو ورثة) —
     كل موكل لازم يبقى له صورة بطاقته هو. فالمفتاح برقم المكتب لصاحب السجل
     الأصلي بس (cl_off_<رقم>) أو لو الرقم مش مشترك؛ والباقيين مفتاح بمعرّف السجل.
     لو مفيش سجل cl_off_<رقم> خالص، أول سجل بالرقم ده (بترتيب القائمة) هو صاحبه. */
  var _sharedNo = null, _sharedAt = 0;
  function sharedNos() {
    if (_sharedNo && Date.now() - _sharedAt < 3000) return _sharedNo;
    var cnt = {}, owner = {};
    read().forEach(function (x) {
      if (!x || !x.officeNo) return;
      cnt[x.officeNo] = (cnt[x.officeNo] || 0) + 1;
      if (!owner[x.officeNo] || x.id === "cl_off_" + x.officeNo) owner[x.officeNo] = x.id;
    });
    _sharedNo = { cnt: cnt, owner: owner }; _sharedAt = Date.now();
    return _sharedNo;
  }
  function idKeyOf(c) {
    var no = String(c.officeNo || ""), s = no ? sharedNos() : null;
    if (no && ((s.cnt[no] || 0) < 2 || s.owner[no] === c.id))
      return no.replace(/[^0-9A-Za-z]+/g, "_");
    return String(c.id || no).replace(/[^0-9A-Za-z]+/g, "_");   /* نفس مفتاح الموكل اللي من غير رقم مكتب */
  }
  function idImgId(c) { return "clientid_" + idKeyOf(c) + ".jpg"; }
  /* وجه البطاقة (idImgId) وظهرها — مفتاحان منفصلان لأن بطاقة الرقم القومي
     وجواز السفر والإقامة كلها بها بيانات على الوجهين. */
  function idImgIdBack(c) { return "clientid_" + idKeyOf(c) + "_back.jpg"; }
  function idImageOf(c) { return w.Attach ? Attach.get(idImgId(c)) : ""; }
  function saveIdImage(c, dataUrl) { return w.Attach ? Attach.put(idImgId(c), dataUrl) : false; }
  function removeIdImage(c) { if (w.Attach) Attach.remove(idImgId(c)); }
  function idImageBackOf(c) { return w.Attach ? Attach.get(idImgIdBack(c)) : ""; }

  /** الوشّين فوق بعض على ورقة A4 (المساحة المطبوعة بعد هوامش pdfbuild.js ١٨pt)،
      كل وش بمقاس البطاقة الحقيقي ٨٥٫٦×٥٤ مم بدقة ١٥٠ نقطة/بوصة، وتحته اسمه.
      done(dataUrl JPEG | null). الوش الفاضي بيتساب. */
  /** قص البطاقة من الصورة وتعديل اتجاهها (idcrop.js). أي فشل ← الصورة زي ما هي. */
  function autoCrop(dataUrl, side, enhance) {
    if (!w.IdCrop || !dataUrl) return Promise.resolve(dataUrl);
    return IdCrop.process(dataUrl, { side: side, enhance: enhance })
      .then(function (r) { return r.dataUrl; })
      .catch(function () { return dataUrl; });
  }

  function idSheetJpeg(srcs, labels, done) {
    var PX_MM = 150 / 25.4;
    var W = Math.round((595.28 - 36) / 72 * 25.4 * PX_MM);   /* ≈١١٦٥ */
    var H = Math.round((841.89 - 36) / 72 * 25.4 * PX_MM);   /* ≈١٦٧٩ */
    var CW = Math.round(85.6 * PX_MM), CH = Math.round(54 * PX_MM);
    var items = [];
    srcs.forEach(function (s, i) { if (s) items.push({ src: s, label: labels[i] || "" }); });
    if (!items.length) { done(null); return; }
    var left = items.length;
    items.forEach(function (it) {
      var im = new Image();
      im.onload = function () { it.img = im; if (--left === 0) draw(); };
      im.onerror = function () { if (--left === 0) draw(); };
      im.src = it.src;
    });
    function draw() {
      var cv = document.createElement("canvas");
      cv.width = W; cv.height = H;
      var g = cv.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
      var y = Math.round(25 * PX_MM);
      items.forEach(function (it) {
        if (!it.img) return;
        /* تحفظ النسبة جوه مقاس البطاقة (صورة ملتقطة يدوياً ممكن نسبتها تختلف) */
        var k = Math.min(CW / it.img.width, CH / it.img.height);
        var dw = Math.round(it.img.width * k), dh = Math.round(it.img.height * k);
        var x = Math.round((W - dw) / 2);
        g.drawImage(it.img, x, y + Math.round((CH - dh) / 2), dw, dh);
        g.fillStyle = "#777"; g.font = Math.round(3.2 * PX_MM) + "px sans-serif";
        g.textAlign = "center"; g.direction = "rtl";
        g.fillText(it.label, W / 2, y + CH + Math.round(6 * PX_MM));
        y += CH + Math.round(22 * PX_MM);
      });
      try { done(cv.toDataURL("image/jpeg", 0.9)); } catch (e) { done(null); }
    }
  }
  function saveIdImageBack(c, dataUrl) { return w.Attach ? Attach.put(idImgIdBack(c), dataUrl) : false; }

  /* تعميم قاعدة صورة البطاقة على كل الموكلين (طلب المستخدم ١-١٠، زي خالد ١١٦٦):
     الصور اللي اترفعت قبل القص التلقائي بتتعدّى على IdCrop.process (قص + تعديل
     الاتجاه) وتتحفظ مكانها. الصورة اللي نسبتها نسبة البطاقة (٨٥٫٦×٥٤) تعتبر
     متقصوصة وتتساب، واللي القص التلقائي ما يعرفهاش ترجع في قايمة «محتاجة قص يدوي»
     (من شاشة الموكل ← ✂). */
  function idImgSize(url) {
    return new Promise(function (res) {
      var im = new Image();
      im.onload = function () { res({ w: im.naturalWidth, h: im.naturalHeight }); };
      im.onerror = function () { res(null); };
      im.src = url;
    });
  }
  function idLooksCropped(sz) {
    if (!sz || !sz.w || !sz.h) return false;
    var r = Math.max(sz.w, sz.h) / Math.min(sz.w, sz.h);
    return Math.abs(r - 85.6 / 54) < 0.07;
  }
  function idBatchProcess(onStep) {
    if (!w.IdCrop || !IdCrop.process || !w.Attach) return Promise.resolve({ error: "القص التلقائي مش متاح في الشاشة دي." });
    var jobs = [];
    read().forEach(function (c) {
      [["front", idImgId(c)], ["back", idImgIdBack(c)]].forEach(function (x) {
        var src = Attach.get(x[1]);
        if (src) jobs.push({ c: c, side: x[0], key: x[1], src: src });
      });
    });
    var out = { total: jobs.length, cropped: [], already: [], turned: [], manual: [] };
    var seq = Promise.resolve();
    jobs.forEach(function (j, i) {
      seq = seq.then(function () {
        if (onStep) onStep(i + 1, jobs.length);
        return idImgSize(j.src).then(function (sz) {
          if (idLooksCropped(sz)) {
            /* متقصوصة قبل كده: الاتجاه بس (التدوير التلقائي لكل الصور، زي ١١١٨) */
            if (!IdCrop.fixOrientation) { out.already.push(j); return; }
            return IdCrop.fixOrientation(j.src, j.side).then(function (r) {
              if (r && r.rotated && Attach.put(j.key, r.dataUrl)) out.turned.push(j); else out.already.push(j);
            }).catch(function () { out.already.push(j); });
          }
          return IdCrop.process(j.src, { side: j.side }).then(function (r) {
            if (r && r.cropped && r.dataUrl && Attach.put(j.key, r.dataUrl)) out.cropped.push(j);
            else out.manual.push(j);
          }).catch(function () { out.manual.push(j); });
        });
      });
    });
    return seq.then(function () { return out; });
  }
  function removeIdImageBack(c) { if (w.Attach) Attach.remove(idImgIdBack(c)); }

  /* موكلين ليهم صورة ضهر البطاقة ومالهمش تاريخ «سارية حتى» مقروء (اتصوّروا قبل
     قراءة التاريخ، أو القراءة ما نجحتش) ← الزرار ما كانش بيظهر لهم خالص. */
  function idExpiryMissing() {
    if (!w.Attach) return [];
    return read().filter(function (c) { return !idExpiryIso(c.idExpiry) && Attach.has(idImgIdBack(c)); });
  }
  /** يقرا التاريخ من صورة الضهر لكل اللي فوق ويحفظه. ← {total, read:[c], failed:[c]} */
  function idExpiryBatch(onStep) {
    if (!w.IdOcr || !IdOcr._exp) return Promise.resolve({ error: "قراءة البطاقة مش متاحة في الشاشة دي." });
    var miss = idExpiryMissing(), out = { total: miss.length, read: [], failed: [] }, found = {};
    var seq = Promise.resolve();
    miss.forEach(function (c, i) {
      seq = seq.then(function () {
        if (onStep) onStep(i + 1, miss.length);
        return IdOcr._exp(Attach.get(idImgIdBack(c))).then(function (r) {
          var iso = idExpiryIso(r && r.idExpiry);
          if (iso) { found[idImgIdBack(c)] = iso; out.read.push(c); } else out.failed.push(c);
        }).catch(function () { out.failed.push(c); });
      });
    });
    return seq.then(function () {
      if (!out.read.length) return out;
      var list = read();
      list.forEach(function (c) { var iso = found[idImgIdBack(c)]; if (iso && !idExpiryIso(c.idExpiry)) c.idExpiry = iso; });
      if (!commit(list)) out.error = "ما اتحفظش — المساحة مليانة؟";
      return out;
    });
  }

  /* §7 طباعة بيان/صورة التوكيل — كارت A4 بشكل الشاشة */
  function printPoa(client, p) {
    function hEl(txt, css) {
      var d = document.createElement("div"); d.style.cssText = css || ""; d.textContent = txt; return d;
    }
    var win = document.createElement("div");
    win.setAttribute("data-nosave", "1");
    win.className = "print-overlay";
    win.style.cssText = "position:fixed;inset:0;background:#fff;color:#000;z-index:10060;" +
      "overflow:auto;padding:22px;direction:rtl;font-family:inherit";
    win.appendChild(hEl("مؤسسة المستشار حسن عبد المنعم — محامون ومستشارون قانونيون",
      "font-family:var(--f-title);font-size:15px;text-align:center;margin-bottom:4px"));
    win.appendChild(hEl("بيان توكيل",
      "font-size:19px;font-family:var(--f-title);text-align:center;margin-bottom:14px"));

    var card = document.createElement("div");
    card.style.cssText = "border:1px solid #c9b48f;border-radius:10px;padding:14px 16px;" +
      "max-width:720px;margin:0 auto 14px";
    card.appendChild(hEl(client.name,
      "font-family:var(--f-title);font-size:16px;margin-bottom:8px;" +
      "border-bottom:1px solid #e5d9bf;padding-bottom:6px"));
    var grid = document.createElement("div");
    grid.style.cssText = "display:flex;flex-wrap:wrap;gap:6px 18px";
    [["رقم المكتب", p.officeNo ? ar(p.officeNo) : ""], ["رقم التوكيل", poaFull(p)],
     ["نوعه", p.poaType], ["جهة التوثيق", p.notary], ["تاريخه", p.poaDate],
     ["الوكيل", agentShow(p.agent)], ["صفة الموكل", p.role], ["الحالة", statusText(p)],
     ["ملاحظة", p.poaNote]].forEach(function (kv) {
      if (!kv[1]) return;
      var cell = document.createElement("div");
      cell.style.cssText = "flex:1 1 45%;min-width:180px;font-size:13px;line-height:1.9;display:flex;gap:6px";
      var b = document.createElement("b");
      b.style.cssText = "color:#5b3a21;font-family:var(--f-title);font-weight:400;flex:0 0 auto";
      b.textContent = kv[0] + ":";
      var sp = document.createElement("span"); sp.textContent = kv[1]; sp.style.flex = "1";
      cell.appendChild(b); cell.appendChild(sp); grid.appendChild(cell);
    });
    card.appendChild(grid);
    pagesOf(p).forEach(function (src) {
      var im = document.createElement("img");
      im.src = src; im.style.cssText = "max-width:100%;margin-top:12px;border-radius:8px;display:block";
      card.appendChild(im);
    });
    win.appendChild(card);

    var bar = document.createElement("div");
    bar.style.cssText = "display:flex;gap:9px;max-width:720px;margin:16px auto 0";
    function pb(label, css, on) {
      var b = document.createElement("button"); b.type = "button"; b.textContent = label;
      b.style.cssText = "flex:1;padding:14px;border-radius:11px;font-family:inherit;" +
        "font-size:15px;min-height:50px;" + css;
      b.onclick = on; return b;
    }
    bar.appendChild(pb("🖨 طباعة / حفظ PDF", "border:0;background:#5b3a21;color:#fff;font-weight:600",
      function () {
        if (w.AndroidSaver && AndroidSaver.printPage) AndroidSaver.printPage("توكيل " + client.name);
        else window.print();
      }));
    bar.appendChild(pb("رجوع", "border:1px solid #ccc;background:transparent;color:#333",
      function () { win.remove(); }));
    win.appendChild(bar);
    document.body.appendChild(raise(win));
  }

  function showPoa(client, p) {
    var wrap = document.createElement("div");
    wrap.setAttribute("data-modal", "1");
    wrap.setAttribute("data-nosave", "1");
    wrap.style.cssText =
      "position:fixed;inset:0;background:rgba(20,14,8,.6);z-index:10003;" +
      "display:flex;align-items:flex-end;justify-content:center";

    var box = document.createElement("div");
    box.style.cssText =
      "background:var(--card,#fff);border-radius:16px 16px 0 0;padding:18px 18px 26px;" +
      "width:100%;max-width:560px;direction:rtl;color:var(--text);" +
      "max-height:88vh;overflow-y:auto";

    function line(css, txt) {
      var d = document.createElement("div");
      d.style.cssText = css;
      d.textContent = txt;
      return d;
    }
    function pair(k, v) {
      if (!v) return;
      var r = document.createElement("div");
      r.style.cssText = "display:flex;gap:9px;padding:9px 0;font-size:13.5px;" +
                        "border-bottom:1px solid var(--line,#eee);line-height:1.9";
      var b = document.createElement("b");
      b.style.cssText = "flex:0 0 96px;color:var(--brand-dark);font-family:var(--f-title);" +
                        "font-weight:400";
      b.textContent = k;
      var sp = document.createElement("span");
      sp.style.cssText = "flex:1;word-break:break-word";
      sp.textContent = v;
      r.appendChild(b); r.appendChild(sp);
      box.appendChild(r);
    }

    box.appendChild(line("font-family:var(--f-title);font-size:17px;margin-bottom:3px",
                         "بيانات التوكيل"));
    box.appendChild(line("font-size:13.5px;color:var(--muted);margin-bottom:14px;line-height:1.8",
                         client.name));

    pair("رقم المكتب",   p.officeNo ? ar(p.officeNo) : "");
    pair("رقم التوكيل",  poaFull(p));
    pair("نوعه",         p.poaType);
    pair("جهة التوثيق",  p.notary);
    pair("تاريخه",       p.poaDate);
    pair("الوكيل",       agentShow(p.agent));
    pair("صفة الموكل",   p.role);
    pair("الحالة",       statusText(p));
    pair("ملاحظة",       p.poaNote);
    if (p.sharedWith) pair("مشترك مع", ar(p.sharedWith) + " آخرين في التوكيل نفسه");

    /* ---- الصورة ---- */
    box.appendChild(line("font-family:var(--f-title);font-size:15px;margin:16px 0 9px",
                         "صورة التوكيل"));

    var shot = document.createElement("div");
    shot.style.cssText = "border:1px dashed var(--line,#ddd);border-radius:11px;" +
                         "padding:14px;text-align:center;min-height:90px";
    box.appendChild(shot);

    function drawImage() {
      shot.textContent = "";
      var pdf = poaDocOf(p);
      if (pdf) {
        shot.appendChild(line("color:var(--text);font-size:13.5px;line-height:1.9;padding:8px 0",
                              "📄 ملف التوكيل الممسوح (PDF)"));
        var openBtn = document.createElement("button");
        openBtn.type = "button";
        openBtn.textContent = "فتح الملف";
        openBtn.style.cssText =
          "margin-top:6px;margin-inline-end:8px;padding:10px 18px;border:1px solid var(--brand);" +
          "border-radius:9px;background:transparent;color:var(--brand);font-family:inherit;" +
          "font-size:13px;min-height:42px";
        openBtn.onclick = function () { viewPdf(pdf, "توكيل " + poaFull(p)); };
        shot.appendChild(openBtn);

        var sendPdf = document.createElement("button");
        sendPdf.type = "button";
        sendPdf.textContent = "📤 إرسال الملف";
        sendPdf.style.cssText = openBtn.style.cssText;
        sendPdf.onclick = function () {
          if (!w.Share || !Share.shareFile) { alert("الإرسال غير متاح على هذا الجهاز."); return; }
          var m = /^data:([^;]+);base64,(.*)$/.exec(pdf);
          if (!m) { alert("تعذّر قراءة الملف."); return; }
          Share.shareFile(m[2], "توكيل-" + (p.poaNo || "") + ".pdf", m[1]);
        };
        shot.appendChild(sendPdf);

        var delPdf = document.createElement("button");
        delPdf.type = "button";
        delPdf.textContent = "حذف الملف";
        delPdf.style.cssText =
          "margin-top:6px;padding:10px 18px;border:1px solid #e3c9c6;border-radius:9px;" +
          "background:transparent;color:#b3261e;font-family:inherit;font-size:13px;min-height:42px";
        delPdf.onclick = function () {
          Ask.confirm("حذف ملف التوكيل الممسوح؟",
                      { detail: poaFull(p), ok: "حذف الملف" },
                      function () { removePoaDoc(p); drawImage(); });
        };
        shot.appendChild(delPdf);
        return;
      }
      var pages = pagesOf(p);
      if (!pages.length) {
        /* صور التوكيلات مع الفريق (poa-sync.js): لو الصورة على درايف المكتب ولسه ما نزلتش ← تنزل دلوقتي */
        if (w.PoaSync && !drawImage.tried) {
          drawImage.tried = true;
          shot.appendChild(line("color:var(--muted);font-size:13.5px;line-height:1.9;padding:12px 0",
              "⏳ بندوّر على صورة التوكيل على درايف المكتب…"));
          var base = keyBase(imgKeyOf(p));
          PoaSync.fetchFor(base, function (n) {
            if (n || legacyKeyOf(p) === imgKeyOf(p)) { drawImage(); return; }
            PoaSync.fetchFor(keyBase(legacyKeyOf(p)), function () { drawImage(); });
          });
          return;
        }
        shot.appendChild(line("color:var(--muted);font-size:13.5px;line-height:1.9;padding:12px 0",
            "لا توجد صورة أو ملف محفوظ لهذا التوكيل."));
        return;
      }
      var btnCss = "padding:10px 16px;border:1px solid var(--brand);border-radius:9px;background:transparent;" +
        "color:var(--brand);font-family:inherit;font-size:13px;min-height:42px";
      var delCss = "padding:10px 16px;border:1px solid #e3c9c6;border-radius:9px;" +
        "background:transparent;color:#b3261e;font-family:inherit;font-size:13px;min-height:42px";
      function mkBtn(label, css, on) {
        var b = document.createElement("button");
        b.type = "button"; b.textContent = label; b.style.cssText = css;
        b.onclick = function () { on(b); };
        return b;
      }
      pages.forEach(function (src, i) {
        var n = i + 1;
        if (pages.length > 1) {
          shot.appendChild(line("color:var(--text);font-size:13.5px;font-weight:600;line-height:1.9;margin-top:" + (i ? "16px" : "4px"),
              n === 1 ? "الوجه (صفحة 1)" : n === 2 ? "الظهر (صفحة 2)" : "صفحة " + n));
        }
        var im = document.createElement("img");
        im.src = src;
        im.alt = "صورة التوكيل — صفحة " + n;
        im.style.cssText = "max-width:100%;border-radius:9px;display:block;margin:0 auto";
        function openCropper() {
          if (!w.IdCrop || !IdCrop.openEditor) { window.open(src, "_blank"); return; }
          IdCrop.openEditor(src, "doc", function (url) {
            if (!savePage(p, n, url)) { alert("تعذّر حفظ الصورة."); return false; }
            drawImage();
            return true;
          });
        }
        im.onclick = openCropper;
        shot.appendChild(im);
        var row = document.createElement("div");
        row.style.cssText = "display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:9px";
        if (w.IdCrop) {
          row.appendChild(mkBtn("✂ قص وتعديل", btnCss, openCropper));
          row.appendChild(mkBtn("↻ تدوير", btnCss, function (b) {
            var old = b.textContent; b.disabled = true; b.textContent = "جارٍ…";
            IdCrop.rotateRight(src).then(function (url) {
              b.disabled = false; b.textContent = old;
              if (!savePage(p, n, url)) { alert("تعذّر حفظ الصورة."); return; }
              drawImage();
            }).catch(function () { b.disabled = false; b.textContent = old; });
          }));
        }
        row.appendChild(mkBtn(pages.length > 1 ? "حذف الصفحة" : "حذف الصورة", delCss, function () {
          Ask.confirm(pages.length > 1 ? "حذف صفحة " + n + " من التوكيل؟" : "حذف صورة هذا التوكيل؟",
              { detail: poaFull(p), ok: "حذف" },
              function () { removePage(p, n); drawImage(); });
        }));
        shot.appendChild(row);
      });

      shot.appendChild(line("color:var(--muted);font-size:12.5px;line-height:1.8;margin-top:10px",
          "لإضافة ظهر التوكيل أو صفحة تانية: صوّرها بزرار التصوير — بتتضاف بعد آخر صفحة."));

      /* الموكل لو طلب صورة توكيله، تُرسَل له مباشرة عبر واتساب/الإيميل.
         أكتر من صفحة (وش وضهر) ← ملف PDF واحد بكل الصفحات بالترتيب. */
      shot.appendChild(mkBtn(pages.length > 1 ? "📤 إرسال التوكيل (PDF)" : "📤 إرسال الصورة",
          btnCss + ";margin-top:11px", function () {
        if (!w.Share || !Share.shareFile) { alert("الإرسال غير متاح على هذا الجهاز."); return; }
        if (pages.length > 1) {
          if (!w.PdfBuild || !PdfBuild.fromJpegs) { alert("تحويل PDF غير متاح على هذا الجهاز."); return; }
          var bytes = PdfBuild.fromJpegs(pages);
          if (!bytes) { alert("تعذّر بناء ملف PDF من الصور."); return; }
          Share.shareFile(PdfBuild.toBase64(bytes), "توكيل-" + (p.poaNo || "") + ".pdf", "application/pdf");
          return;
        }
        var m = /^data:([^;]+);base64,(.*)$/.exec(pages[0]);
        if (!m) { alert("تعذّر قراءة الصورة."); return; }
        var ext = m[1].indexOf("png") >= 0 ? "png" : "jpg";
        Share.shareFile(m[2], "صورة-توكيل-" + (p.poaNo || "") + "." + ext, m[1]);
      }));
    }
    drawImage();

    /* زران منفصلان (تصوير مباشر / اختيار من الجهاز) بدل input واحد بلا
       capture — كان بيفتح صندوق اختيار عام يعتمد آخر تطبيق مستعمَل على
       الجهاز (درايف هنا) بدل ما يعرض الكاميرا فوراً. نفس الأسلوب المستعمل
       فعلاً وبنجاح في تصوير بطاقة الرقم القومي أدناه. */
    /* ملاحظة المحامين التالتة: صورة التوكيل بتمشي بنفس قاعدة السكانر —
       كشف حواف الورقة + المغناطيس (IdCrop بوضع «doc») ثم التحسين (ScanFx).
       لو الحواف مش واضحة، شاشة القص بتفتح على طول بالأركان الأربعة. */
    function onPicked(f, btn, oldTxt) {
      if (!f) return;
      if (!w.Attach) { alert("التخزين غير متاح."); return; }
      btn.disabled = true; btn.textContent = "جارٍ القص والتحسين…";
      f.__noCrop = true; f.__noEnhance = true;
      var original = null;
      Attach.compress(f).then(function (r) {
        original = r.dataUrl;
        if (!w.IdCrop) return { dataUrl: r.dataUrl, cropped: true };
        /* قص + تحسين + اتجاه القراءة (زي الاسكانر) */
      return (IdCrop.autoFix ? IdCrop.autoFix(r.dataUrl, "doc") : IdCrop.process(r.dataUrl, { side: "doc" }))
        .catch(function () { return { dataUrl: r.dataUrl, cropped: false }; });
      }).then(function (res) {
        btn.disabled = false; btn.textContent = oldTxt;
        if (!res.cropped && w.IdCrop && IdCrop.openEditor) {
          IdCrop.openEditor(original, "doc", function (url) {
            if (!addPage(p, url)) { alert("تعذّر حفظ الصورة."); return false; }
            drawImage();
            return true;
          });
          return;
        }
        if (!addPage(p, res.dataUrl)) { alert("تعذّر حفظ الصورة."); return; }
        drawImage();
      }).catch(function (e) {
        btn.disabled = false; btn.textContent = oldTxt;
        alert(e && e.message ? e.message : "تعذّر قراءة الصورة.");
      });
    }
    var camFile = document.createElement("input");
    camFile.type = "file"; camFile.accept = "image/*";
    camFile.setAttribute("capture", "environment");
    camFile.style.display = "none";
    /* السكانر بيرجّع كل الصفحات اللي اتصوّرت (الوش والضهر) مرة واحدة — من غير
       multiple كان التطبيق بياخد أول صفحة بس، فالتوكيل كان بيتحفظ بوش واحد. */
    camFile.multiple = true;
    camFile.onchange = function () {
      var files = camFile.files ? Array.prototype.slice.call(camFile.files) : [];
      camFile.value = "";
      if (!files.length) return;
      if (files.length === 1 && !scannerReady()) { onPicked(files[0], add, camLabel()); return; }
      /* صفحات جاية من السكانر: اتقصّت واتحسّنت واتعدّل اتجاهها هناك، فتتحفظ زي
         ما هي بالترتيب — قص تاني هنا ممكن يقص من الصفحة نفسها. */
      addFiles(files, add, camLabel(), false);
    };
    box.appendChild(camFile);

    var file = document.createElement("input");
    file.type = "file";
    file.accept = "image/*";
    file.style.display = "none";
    file.multiple = true;
    file.onchange = function () {
      var files = file.files ? Array.prototype.slice.call(file.files) : [];
      file.value = "";
      if (!files.length) return;
      if (files.length === 1) { onPicked(files[0], addFromDevice, "🖼 اختيار من الجهاز"); return; }
      /* أكتر من صورة من المعرض: كل واحدة بتتقص وتتحسّن تلقائي وتتضاف صفحة بالترتيب. */
      addFiles(files, addFromDevice, "🖼 اختيار من الجهاز", true);
    };

    /* يضيف كذا صورة كصفحات للتوكيل واحدة ورا التانية. crop: يقص ويحسّن كل صورة
       (صور المعرض)؛ من غيره تتحفظ زي ما هي (صفحات السكانر الجاهزة). */
    function addFiles(files, btn, label, crop) {
      if (!w.Attach) { alert("التخزين غير متاح."); return; }
      btn.disabled = true; btn.textContent = "جارٍ حفظ الصفحات…";
      var i = 0, failed = 0;
      (function next() {
        if (i >= files.length) {
          btn.disabled = false; btn.textContent = label;
          drawImage();
          if (failed) alert("تعذّر حفظ " + failed + " من الصفحات.");
          return;
        }
        var f = files[i++];
        f.__noCrop = true; f.__noEnhance = true;
        Attach.compress(f).then(function (r) {
          if (!crop || !w.IdCrop) return r;
          return (IdCrop.autoFix ? IdCrop.autoFix(r.dataUrl, "doc") : IdCrop.process(r.dataUrl, { side: "doc" }))
            .catch(function () { return r; });
        }).then(function (res) {
          if (!addPage(p, res.dataUrl)) failed++;
          next();
        }).catch(function () { failed++; next(); });
      })();
    }
    box.appendChild(file);

    var add = document.createElement("button");
    add.type = "button";
    add.textContent = camLabel();
    add.style.cssText =
      "width:100%;padding:13px;margin-top:12px;border:1px solid var(--line,#ddd);" +
      "border-radius:11px;background:transparent;color:var(--brand);" +
      "font-family:inherit;font-size:15px;min-height:48px";
    add.onclick = function () {
      prepCapture("document", "توكيل: " + (client.name || ""));
      camFile.click();
    };
    box.appendChild(add);

    var addFromDevice = document.createElement("button");
    addFromDevice.type = "button";
    addFromDevice.textContent = "🖼 اختيار من الجهاز";
    addFromDevice.style.cssText = add.style.cssText;
    addFromDevice.onclick = function () { file.click(); };
    box.appendChild(addFromDevice);

    /* مسح التوكيل كله (صفحة أو أكتر) بالسكانر ← ملف PDF واحد خفيف عبر
       pdfbuild.js. الزر ده بيظهر بس لما السكانر المثبَّت يقدر يرجّع الصفحات
       للتطبيق فعلاً — قبل كده كان ظاهر دايماً ويفشل بصمت. */
    var scanPoaBtn = document.createElement("button");
    scanPoaBtn.type = "button";
    scanPoaBtn.textContent = "📄 مسح التوكيل كله بالسكانر ← ملف PDF";
    scanPoaBtn.style.cssText = add.style.cssText;
    scanPoaBtn.onclick = function () { scanPoaWithApp(scanPoaBtn); };
    if (scannerReady()) {
      box.appendChild(scanPoaBtn);
      var scanHint = document.createElement("div");
      scanHint.textContent = "لتوكيل من أكتر من صفحة: صوّر الصفحات ورا بعض، وهتتحفظ كلها في ملف PDF واحد.";
      scanHint.style.cssText = "font-size:12px;color:var(--muted,#888);margin-top:6px;line-height:1.7";
      box.appendChild(scanHint);
    }

    function scanPoaWithApp(btn) {
      if (!scannerReady()) {
        prepCapture("document", "توكيل: " + (client.name || ""));
        camFile.click();
        return;
      }
      var oldTxt = btn.textContent;
      btn.disabled = true; btn.textContent = "جارٍ فتح السكانر…";
      w.onDocScanResult = function (kind, payload) {
        btn.disabled = false; btn.textContent = oldTxt;
        w.onDocScanResult = null;
        if (!kind || !payload) return;
        var images = [];
        if (kind === "images") {
          images = payload.split("\n").filter(Boolean).map(function (b64) {
            return "data:image/jpeg;base64," + b64;
          });
        } else if (kind === "pdf") {
          if (typeof AndroidFiles === "undefined" || !AndroidFiles.splitPdfPages) {
            alert("تقسيم PDF غير متاح على هذا الجهاز.");
            return;
          }
          var pagesRaw = AndroidFiles.splitPdfPages(payload);
          if (!pagesRaw) { alert("تعذّر قراءة صفحات هذا الملف."); return; }
          images = pagesRaw.split("\n").filter(Boolean).map(function (b64) {
            return "data:image/jpeg;base64," + b64;
          });
        }
        if (!images.length) { alert("لم يتم التقاط أي صفحة."); return; }
        if (!w.PdfBuild || !PdfBuild.fromJpegs) {
          alert("تحويل PDF غير متاح على هذا الجهاز.");
          return;
        }
        try {
          var bytes = PdfBuild.fromJpegs(images);
          if (!bytes) { alert("تعذّر بناء ملف PDF من الصور."); return; }
          var b64pdf = PdfBuild.toBase64(bytes);
          if (!savePoaDoc(p, "data:application/pdf;base64," + b64pdf)) {
            alert("تعذّر حفظ الملف."); return;
          }
          removeImage(p);   /* الملف الجديد PDF يحل محل أي صورة قديمة منفصلة */
          drawImage();
        } catch (e) {
          alert("تعذّر إنشاء ملف PDF: " + (e && e.message ? e.message : ""));
        }
      };
      AndroidScanner.scanDocument("توكيل: " + (client.name || ""));
    }

    /* تعديل / حذف — كان الاستعراض للقراءة فقط */
    var tools = document.createElement("div");
    tools.style.cssText = "display:flex;gap:9px;margin-top:12px";

    function toolBtn(label, css, on) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.style.cssText = "flex:1;padding:13px;border-radius:11px;font-family:inherit;" +
                        "font-size:15px;min-height:48px;" + css;
      b.onclick = on;
      return b;
    }

    tools.appendChild(toolBtn("✎ تعديل البيانات",
      "border:0;background:var(--brand);color:#fff;font-weight:600",
      function () {
        editPoa(client, p, function (updated) {
          wrap.remove();
          if (w.ClientsPOA && ClientsPOA.onChange) ClientsPOA.onChange();
          showPoa(client, updated);
        });
      }));

    tools.appendChild(toolBtn("🗑 حذف التوكيل",
      "border:1px solid #e3c9c6;background:transparent;color:#b3261e",
      function () {
        deletePoa(client, p, function () {
          wrap.remove();
          if (w.ClientsPOA && ClientsPOA.onChange) ClientsPOA.onChange();
        });
      }));

    box.appendChild(tools);

    /* §7 أدوات إضافية: تكرار لموكل آخر + طباعة */
    var tools2 = document.createElement("div");
    tools2.style.cssText = "display:flex;gap:9px;margin-top:9px";
    tools2.appendChild(toolBtn("⧉ تكرار لموكل آخر",
      "border:1px solid var(--brand);background:transparent;color:var(--brand)",
      function () {
        var nm = prompt("اسم الموكل الآخر بنفس بيانات التوكيل والتوثيق:", "");
        if (nm == null) return;
        nm = nm.trim();
        var list = read();
        var clone = JSON.parse(JSON.stringify(p));
        var nc = {
          id: "cl" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36),
          name: nm || (client.name + " (نسخة)"), poas: [clone]
        };
        try { mirror(nc); } catch (e) {}
        list.push(nc);
        if (!commit(list, nc)) return;
        alert("تم إنشاء موكل جديد «" + nc.name + "» بنفس بيانات التوكيل.");
        wrap.remove();
        if (w.ClientsPOA && ClientsPOA.onChange) ClientsPOA.onChange();
      }));
    tools2.appendChild(toolBtn("🖨 طباعة",
      "border:1px solid var(--line,#ddd);background:transparent;color:var(--brand)",
      function () { printPoa(client, p); }));
    box.appendChild(tools2);

    var close = document.createElement("button");
    close.type = "button";
    close.textContent = "إغلاق";
    close.style.cssText =
      "width:100%;padding:13px;margin-top:9px;border:0;border-radius:11px;" +
      "background:var(--line,#eee);color:var(--text);font-family:inherit;" +
      "font-size:15px;min-height:46px";
    close.onclick = function () { wrap.remove(); };
    box.appendChild(close);

    wrap.appendChild(box);
    /* لمسة على الخلفية بالغلط ما تقفلش الفورم من غير سؤال (كانت بتضيّع المكتوب) */
    wrap.onclick = function (e) { if (e.target === wrap) { if (wrap.__lawyerDismiss) wrap.__lawyerDismiss(); else wrap.remove(); } };
    document.body.appendChild(raise(wrap));
  }



  /* ------------------------------------------- تعديل التوكيل وحذفه
     استعراض التوكيل كان للقراءة فقط، فأي خطأ في البيان — كسنة موثَّقة
     خطأ — لم يكن له علاج داخل التطبيق. */

  /* حقول صغيرة (رقم/حرف/سنة) أو مترابطة تُجمَع سطراً واحداً بدل ما كل حقل
     ياخد سطراً كاملاً — نفس الحقول والبيانات، ترتيب أوفر بس. */
  /* نوع التوكيل — مكان واحد للخيارين (القيم القديمة تبقى تظهر عند التعديل) */
  var POA_TYPES = ["عام قضايا", "خاص قضايا"];
  var POA_FIELDS = [
    /* رقم الملف بالمكتب — يتعدّل باليد (التوكيلات اللي اتضافت من الأرشيف بأرقام مؤقتة
       لحد ما يتراجع رقمها الحقيقي في سجل المكتب). الصورة/الـPDF بيتنقلوا مع الرقم. */
    { k: "officeNo",  label: "رقم الملف بالمكتب", ltr: true },
    { k: "poaNo",     label: "رقم التوكيل", group: "no", flex: "2 1 45%" },
    { k: "poaLetter", label: "الحرف",       group: "no", flex: "1 1 20%" },
    { k: "poaYear",   label: "السنة",       group: "no", flex: "1 1 30%" },
    { k: "poaType",   label: "نوعه", options: POA_TYPES, group: "info" },
    { k: "notary",    label: "مكتب التوثيق", notaries: true, group: "info" },
    { k: "poaDate",   label: "تاريخ التوكيل", group: "info", date: true },
    { k: "agent",     label: "الوكيل", agentEditor: true },
    { k: "role",      label: "صفة الموكل" },
    { k: "poaNote",   label: "ملاحظة" }
  ];

  /** يجد سجل الموكل وتوكيله داخل المخزن. */
  function locate(client, p) {
    var list = read();
    var key = w.PoaMerge ? PoaMerge.norm(client.name) : client.name;
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      var k = w.PoaMerge ? PoaMerge.norm(c.name) : c.name;
      if (k !== key) continue;
      if (String(c.officeNo || "") !== String(client.officeNo || "")) continue;
      var ps = c.poas || [];
      for (var j = 0; j < ps.length; j++) {
        if (imgKeyOf(ps[j]) === imgKeyOf(p)) return { list: list, c: c, ci: i, pi: j };
      }
      /* توكيل مكتوب في جسد السجل لا في المصفوفة */
      if (imgKeyOf(c) === imgKeyOf(p)) return { list: list, c: c, ci: i, pi: -1 };
    }
    return null;
  }

  function commit(list, onlyRec) {
    try {
      /* المعرّف يتثبّت في السجل قبل الحفظ: كان بيتولّد عشوائي وقت الرفع بس
         (backfillId في pushChangedToCloud) من غير ما يتحفظ محلياً، فكل رفعة
         كاملة بعدها كانت بتدّي نفس الموكل معرّف جديد ونسخة جديدة على السيرفر. */
      if (onlyRec) backfillId(onlyRec);
      list.forEach(backfillId);
      localStorage.setItem(KEY, JSON.stringify(list));
      pushChangedToCloud(list, onlyRec);
      return true;
    }
    catch (e) { alert("تعذّر الحفظ — المساحة ممتلئة."); return false; }
  }

  /** ينسخ حقول التوكيل الأول إلى جسد سجل الموكل ليبقى العرض المختصر صحيحاً. */
  function mirror(c) {
    var first = (c.poas || [])[0];
    if (!first) return;
    POA_FIELDS.forEach(function (f) { c[f.k] = first[f.k] || ""; });
    c.poaStatus = first.poaStatus || "ساري";
    c.poaReason = first.poaReason || "";
  }

  function editPoa(client, p, done) {
    var at = locate(client, p);
    if (!at) { alert("تعذّر الوصول إلى سجل هذا التوكيل."); return; }
    var rec = at.pi >= 0 ? at.c.poas[at.pi] : at.c;

    var wrap = document.createElement("div");
    wrap.setAttribute("data-modal", "1");
    wrap.setAttribute("data-nosave", "1");
    wrap.style.cssText =
      "position:fixed;inset:0;background:rgba(20,14,8,.62);z-index:10005;" +
      "display:flex;align-items:flex-end;justify-content:center";

    var box = document.createElement("div");
    box.style.cssText =
      "background:var(--card,#fff);border-radius:16px 16px 0 0;padding:18px 18px 26px;" +
      "width:100%;max-width:560px;direction:rtl;color:var(--text);" +
      "max-height:90vh;overflow-y:auto";

    function head(txt, css) {
      var d = document.createElement("div");
      d.style.cssText = css || "font-family:var(--f-title);font-size:17px;margin-bottom:4px";
      d.textContent = txt;
      box.appendChild(d);
    }

    head("تعديل بيانات التوكيل");
    head(client.name, "font-size:13.5px;color:var(--muted);margin-bottom:4px;line-height:1.8");

    /* لو اسم الموكل نفسه أسماء متعددة مجمَّعة (زي «أحمد و محمد»)، زرار
       فصل سريع لهذا السجل بعينه. راجع splitOneButton. */
    (function () {
      var b = splitOneButton(client, function () { wrap.remove(); }, done);
      if (b) box.appendChild(b);
    })();

    var inputs = {};
    var agentEditorObj = null;
    var curRowGroup = null, curRowEl = null;
    POA_FIELDS.forEach(function (f) {
      var g = document.createElement("div");
      g.style.cssText = "margin-bottom:12px;flex:" + (f.flex || "1 1 auto") + ";min-width:0";

      var l = document.createElement("label");
      l.style.cssText = "display:block;font-family:var(--f-title);font-size:14px;" +
                        "margin-bottom:5px;color:var(--brand-dark)";
      l.textContent = f.label;
      l.setAttribute("for", "ep_" + f.k);
      g.appendChild(l);

      var cur = String(rec[f.k] == null ? "" : rec[f.k]);

      if (f.agentEditor) {
        l.removeAttribute("for");
        var agentsHost = document.createElement("div");
        g.appendChild(agentsHost);
        agentEditorObj = buildAgentEditor(agentsHost, cur);
        inputs[f.k] = {};
        Object.defineProperty(inputs[f.k], "value", {
          get: function () { return agentEditorObj.getString(); }
        });
        curRowGroup = null;
        box.appendChild(g);
        return;
      }

      var el;
      if (f.options) {
        el = document.createElement("select");
        var opts = f.options.slice();
        if (cur && opts.indexOf(cur) < 0) opts.unshift(cur);
        opts.forEach(function (o) {
          var op = document.createElement("option");
          op.value = o; op.textContent = o;
          el.appendChild(op);
        });
        el.value = cur;
      } else if (f.date) {
        el = document.createElement("input");
        el.type = "date";
        el.value = w.lawyerToISO ? (w.lawyerToISO(cur) || "") : cur;
      } else {
        el = document.createElement("input");
        el.type = "text";
        el.setAttribute("lang", f.ltr ? "en" : "ar");
        el.setAttribute("dir", f.ltr ? "ltr" : "rtl");
        if (f.ltr) el.setAttribute("data-latin", "1");
        el.value = cur;
        if (f.notaries && w.CaseFile && w.CaseFile.suggestPanel) {
          w.CaseFile.suggestPanel(el, knownNotaries);
        }
      }
      el.id = "ep_" + f.k;
      el.style.cssText = "width:100%;min-height:48px;font-size:16px;padding:10px 12px;" +
        "border:1px solid var(--line,#ddd);border-radius:9px;background:var(--card);" +
        "font-family:inherit;direction:rtl;text-align:right";
      g.appendChild(el);

      if (f.group) {
        if (f.group !== curRowGroup) {
          curRowEl = document.createElement("div");
          curRowEl.style.cssText = "display:flex;gap:9px";
          box.appendChild(curRowEl);
          curRowGroup = f.group;
        }
        curRowEl.appendChild(g);
      } else {
        curRowGroup = null;
        box.appendChild(g);
      }
      inputs[f.k] = el;
    });

    var shared = null;
    if (p.sharedWith) {
      var sw = document.createElement("label");
      sw.style.cssText = "display:flex;gap:9px;align-items:flex-start;font-size:13.5px;" +
        "line-height:1.9;background:var(--bg);padding:11px 12px;border-radius:9px;margin:4px 0 6px";
      shared = document.createElement("input");
      shared.type = "checkbox";
      shared.checked = true;
      shared.style.cssText = "width:20px;height:20px;margin-top:2px;flex:0 0 auto";
      sw.appendChild(shared);
      var st = document.createElement("span");
      st.textContent = "طبّق التعديل على " + ar(p.sharedWith) +
                       " من شركاء التوكيل نفسه";
      sw.appendChild(st);
      box.appendChild(sw);
    }

    function btn(label, css) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.style.cssText = "flex:1;padding:14px;border-radius:11px;font-family:inherit;" +
                        "font-size:16px;min-height:52px;" + css;
      return b;
    }

    var row = document.createElement("div");
    row.style.cssText = "display:flex;gap:9px;margin-top:16px";

    var save = btn("حفظ", "border:0;background:var(--brand);color:#fff;font-weight:600");
    var cancel = btn("إلغاء",
      "border:1px solid var(--line,#ddd);background:transparent;color:var(--muted)");

    save.onclick = function () {
      var newOff = inputs.officeNo ? inputs.officeNo.value.trim() : "";
      var oldOff = String(rec.officeNo == null ? "" : rec.officeNo);
      if (newOff && newOff !== oldOff) {
        /* الرقم الجديد مستخدم لتوكيل تاني؟ (التوكيل المشترك بيتشارك نفس الرقم عادي) */
        var lat = function (v) { return String(v || "").replace(/[٠-٩]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".indexOf(d); }); };
        var used = [];
        at.list.forEach(function (c) {
          (c.poas && c.poas.length ? c.poas : [c]).forEach(function (q) {
            if (q !== rec && lat(q.officeNo) === lat(newOff) && imgKeyOf(q) !== imgKeyOf(rec)) used.push(c.name);
          });
        });
        if (used.length && w.Ask) {
          Ask.confirm("رقم الملف " + ar(newOff) + " مستخدم قبل كده", {
            detail: "مسجّل على: " + used.slice(0, 4).join("، ") + (used.length > 4 ? " …" : "") + ". تحفظه برضه؟",
            ok: "احفظ الرقم", cancel: "رجوع", danger: false
          }, doSave);
          return;
        }
      }
      doSave();
    };
    function doSave() {
      var before = imgKeyOf(rec);
      var oldImg = imageOf(rec), oldDoc = poaDocOf(rec);
      var oldIds = [imgId(rec), legacyImgId(rec), poaDocId(rec), legacyDocId(rec)];
      var oldPages = pagesOf(rec), oldPageIds = [];
      for (var q = 2; q <= oldPages.length; q++) oldPageIds.push([pageId(rec, q), legacyPageId(rec, q)]);
      var vals = {};
      POA_FIELDS.forEach(function (f) { vals[f.k] = inputs[f.k].value.trim(); });
      vals.agent = fixAgentName(vals.agent);

      function applyTo(target) {
        POA_FIELDS.forEach(function (f) { target[f.k] = vals[f.k]; });
      }

      applyTo(rec);

      /* شركاء التوكيل نفسه: موكلون آخرون بنفس رقم التوكيل وسنته */
      if (shared && shared.checked) {
        at.list.forEach(function (c) {
          if (c === at.c) return;
          (c.poas || []).forEach(function (q) {
            if (imgKeyOf(q) === before) applyTo(q);
          });
          if (imgKeyOf(c) === before && !(c.poas || []).length) applyTo(c);
          mirror(c);
        });
      }

      mirror(at.c);
      if (!commit(at.list)) return;

      /* الصورة والـPDF مرتبطين بمفتاح مركَّب من الأرقام (ومنها رقم الملف) — يتنقلوا لو اتغيّر */
      var after = imgKeyOf(rec);
      var newIds = [imgId(rec), poaDocId(rec)];
      if (w.Attach && (after !== before || oldIds[1] !== newIds[0] || oldIds[3] !== newIds[1])) {
        var okI = !oldImg || Attach.put(newIds[0], oldImg);
        var okD = !oldDoc || Attach.put(newIds[1], oldDoc);
        /* القديم يتمسح بس لو هو نفس الملف اللي اتنقل (مفتاح قديم ممكن يكون متشارك مع توكيل تاني) */
        if (okI && okD) oldIds.forEach(function (id) {
          if (newIds.indexOf(id) >= 0) return;
          var v = Attach.get(id);
          if (v && (v === oldImg || v === oldDoc)) Attach.remove(id);
        });
        /* صفحات التوكيل بعد الأولى (الضهر...) */
        oldPageIds.forEach(function (ids, i) {
          var data = oldPages[i + 1], to = pageId(rec, i + 2);
          if (!data || !Attach.put(to, data)) return;
          ids.forEach(function (id) { if (id !== to && Attach.get(id) === data) Attach.remove(id); });
        });
      }

      if (agentEditorObj) agentEditorObj.sync();
      NOTARIES_CACHE = null;
      wrap.remove();
      if (done) done(rec);
    };

    cancel.onclick = function () { wrap.remove(); };
    row.appendChild(save); row.appendChild(cancel);
    box.appendChild(row);

    wrap.appendChild(box);
    /* لمسة على الخلفية بالغلط ما تقفلش الفورم من غير سؤال (كانت بتضيّع المكتوب) */
    wrap.onclick = function (e) { if (e.target === wrap) { if (wrap.__lawyerDismiss) wrap.__lawyerDismiss(); else wrap.remove(); } };
    wireSheet(wrap, function () {
      return POA_FIELDS.some(function (f) {
        return inputs[f.k].value.trim() !== String(rec[f.k] == null ? "" : rec[f.k]).trim();
      });
    }, save);
    document.body.appendChild(raise(wrap));
  }

  /** يحذف التوكيل من سجل هذا الموكل وحده — لا من شركائه. */
  function deletePoa(client, p, done) {
    var at = locate(client, p);
    if (!at) { alert("تعذّر الوصول إلى سجل هذا التوكيل."); return; }

    var many = (at.c.poas || []).length > 1;
    var detail = client.name + String.fromCharCode(10) + "توكيل " + poaFull(p);
    if (!many) {
      detail += String.fromCharCode(10) +
                "هذا آخر توكيل للموكل — سيبقى الموكل مسجَّلاً بلا توكيل.";
    }
    Ask.confirm("حذف هذا التوكيل؟", { detail: detail, ok: "حذف التوكيل" },
                function () { doDeletePoa(at, p, done); });
  }

  function doDeletePoa(at, p, done) {
    /* آخر توكيل اتمسح ← الموكل بيبقى من غير رقم توكيل (القاعدة)، فصور بطاقته بتتنقل
       من مفتاح الرقم لمفتاح السجل علشان ما تضيعش. */
    var _idF = idImageOf(at.c), _idB = idImageBackOf(at.c), _kF = idImgId(at.c), _kB = idImgIdBack(at.c);
    if (at.pi >= 0) at.c.poas.splice(at.pi, 1);
    else at.c.poas = [];
    if ((at.c.poas || []).length) mirror(at.c);
    else {
      POA_FIELDS.forEach(function (f) { at.c[f.k] = ""; });
      at.c.poaStatus = ""; at.c.poaReason = "";
    }

    if (!commit(at.list, at.c)) return;
    _sharedNo = null;
    if (w.Attach && _kF !== idImgId(at.c)) {
      if (_idF && Attach.put(idImgId(at.c), _idF)) Attach.remove(_kF);
      if (_idB && Attach.put(idImgIdBack(at.c), _idB)) Attach.remove(_kB);
    }
    removeImage(p);
    if (done) done();
  }


  /* ------------------------------------------- تعديل بيانات الموكل
     الاسم يأتي مقسوماً من ملف الإكسل، فبعضه وصل ناقصاً أو بخطأ إملائي،
     ولم يكن له سبيل إصلاح داخل التطبيق. */

  /** يجد سجل الموكل نفسه (لا توكيلاً بعينه). */
  function locateClient(client) {
    var list = read();
    var key = w.PoaMerge ? PoaMerge.norm(client.name) : client.name;
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      var k = w.PoaMerge ? PoaMerge.norm(c.name) : c.name;
      if (k === key && String(c.officeNo || "") === String(client.officeNo || "")) {
        return { list: list, c: c, i: i };
      }
    }
    return null;
  }

  function splitList(v) {
    return String(v || "").split(/[,،\n]+/)
      .map(function (x) { return x.trim(); })
      .filter(Boolean);
  }

  function editClient(client, done) {
    var at = locateClient(client);
    if (!at) { alert("تعذّر الوصول إلى سجل هذا الموكل."); return; }
    var c = at.c;
    var ct = contacts(c);

    var wrap = document.createElement("div");
    wrap.setAttribute("data-modal", "1");
    wrap.setAttribute("data-nosave", "1");
    wrap.style.cssText =
      "position:fixed;inset:0;background:rgba(20,14,8,.62);z-index:10006;" +
      "display:flex;align-items:flex-end;justify-content:center";

    var box = document.createElement("div");
    box.style.cssText =
      "background:var(--card,#fff);border-radius:16px 16px 0 0;padding:18px 18px 26px;" +
      "width:100%;max-width:560px;direction:rtl;color:var(--text);" +
      "max-height:90vh;overflow-y:auto";

    function head(txt, css) {
      var d = document.createElement("div");
      d.style.cssText = css || "font-family:var(--f-title);font-size:17px;margin-bottom:4px";
      d.textContent = txt;
      box.appendChild(d);
    }

    /* كل حقول تعديل الموكل تُفتح مقفولة (readOnly) بالقيمة المسجَّلة، ولا
       تُتاح للكتابة إلا بالضغط الصريح على "✎" جنبها — طلب المستخدم صراحة
       بعد بلاغ فقد بيانات (تليفون/إيميل...) عند تعديل حقل واحد فقط. القفل
       يمنع أي تغيير غير مقصود (لمسة عرضية، تصحيح تلقائي، إلخ) من الوصول
       لحفظ القيمة أصلاً — لا حل جزئي، بل يمنع المشكلة من مصدرها. */
    function lockToggle(el) {
      var btn = document.createElement("button");
      btn.type = "button"; btn.textContent = "✎";
      btn.title = "اضغط لتعديل هذا الحقل";
      btn.style.cssText = "flex:0 0 auto;min-width:40px;min-height:40px;border-radius:8px;" +
        "border:1px solid var(--brand);background:transparent;color:var(--brand);" +
        "font-size:15px;margin-inline-start:6px";
      btn.onclick = function () {
        el.readOnly = false;
        el.style.background = "#fff";
        el.style.borderColor = "var(--brand)";
        el.focus();
        btn.disabled = true;
        btn.style.opacity = ".35";
      };
      return btn;
    }

    function field(label, value, opts) {
      opts = opts || {};
      var g = document.createElement("div");
      g.style.cssText = "margin-bottom:12px";

      var l = document.createElement("label");
      l.style.cssText = "display:block;font-family:var(--f-title);font-size:14px;" +
                        "margin-bottom:5px;color:var(--brand-dark)";
      l.textContent = label;
      g.appendChild(l);

      var el = document.createElement(opts.multi ? "textarea" : "input");
      if (!opts.multi) el.type = "text";
      el.value = value || "";
      /* lang="ar" على حقل لاتيني (إيميل/تليفون) كان بيخلي لوحة المفاتيح
         تكتب أرقاماً عربية-هندية حتى لو تخطيطها "English" — الـlang هو
         اللي بيوجّه شكل الأرقام عند بعض لوحات المفاتيح (Gboard)، مش
         التخطيط النشط. راجع [[feedback_arabic_numerals_email_exception]]. */
      el.setAttribute("lang", opts.ltr ? "en" : "ar");
      el.setAttribute("dir", opts.ltr ? "ltr" : "rtl");
      /* mobile.js's arabize()/digitsOn() تعمل على كل textarea/input نصي
         تلقائياً وتفرض lang="ar" — تُستثنى الحقول ذات data-latin فقط
         (راجع skipDigits في mobile.js). بلا هذه السمة كانت arabize()
         تُبطل الـlang="en" أعلاه بعد إنشاء العنصر مباشرة، خصوصاً لحقول
         الإيميل المبنية كـtextarea (لدعم أكثر من بريد). */
      if (opts.ltr) el.setAttribute("data-latin", "1");
      if (opts.multi) el.rows = 2;
      if (opts.placeholder) el.placeholder = opts.placeholder;
      el.style.cssText = "width:100%;min-height:48px;font-size:16px;padding:10px 12px;" +
        "border:1px solid var(--line,#ddd);border-radius:9px;background:var(--card);" +
        "font-family:inherit;" +
        (opts.ltr ? "direction:ltr;text-align:left" : "direction:rtl;text-align:right");
      if (opts.lock !== false) {
        el.readOnly = true;
        el.style.background = "#f3efe6";
        var row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:flex-start";
        row.appendChild(el);
        row.appendChild(lockToggle(el));
        g.appendChild(row);
      } else {
        g.appendChild(el);
      }

      if (opts.note) {
        var n = document.createElement("div");
        n.style.cssText = "font-size:12.5px;color:var(--muted);margin-top:4px;line-height:1.8";
        n.textContent = opts.note;
        g.appendChild(n);
      }
      g.style.flex = opts.flex || "1 1 auto";
      g.style.minWidth = "0";
      (opts.into || box).appendChild(g);
      return el;
    }

    function row2() {
      var r = document.createElement("div");
      r.style.cssText = "display:flex;gap:9px";
      box.appendChild(r);
      return r;
    }

    function selectField(label, value, options, into, flex) {
      var g = document.createElement("div"); g.style.cssText = "margin-bottom:12px;flex:" + (flex || "1 1 auto") + ";min-width:0";
      var l = document.createElement("label");
      l.style.cssText = "display:block;font-family:var(--f-title);font-size:14px;margin-bottom:5px;color:var(--brand-dark)";
      l.textContent = label; g.appendChild(l);
      var sel = document.createElement("select");
      sel.style.cssText = "width:100%;min-height:48px;font-size:16px;padding:10px 12px;" +
        "border:1px solid var(--line,#ddd);border-radius:9px;background:var(--card);" +
        "font-family:inherit;direction:rtl;text-align:right";
      options.forEach(function (o) { var op = document.createElement("option"); op.value = o; op.textContent = o || "— غير محدَّد —"; sel.appendChild(op); });
      sel.value = value || "";
      /* نفس قفل field() أعلاه — راجع تعليقه. select لا يدعم readOnly
         فنستعمل disabled بدلاً منه؛ قيمته تبقى مقروءة عبر .value برمجياً
         رغم التعطيل. */
      sel.disabled = true;
      sel.style.opacity = ".75";
      var row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:flex-start";
      row.appendChild(sel);
      var btn = document.createElement("button");
      btn.type = "button"; btn.textContent = "✎";
      btn.title = "اضغط لتعديل هذا الحقل";
      btn.style.cssText = "flex:0 0 auto;min-width:40px;min-height:40px;border-radius:8px;" +
        "border:1px solid var(--brand);background:transparent;color:var(--brand);" +
        "font-size:15px;margin-inline-start:6px";
      btn.onclick = function () {
        sel.disabled = false; sel.style.opacity = "1"; sel.focus();
        btn.disabled = true; btn.style.opacity = ".35";
      };
      row.appendChild(btn);
      g.appendChild(row);
      (into || box).appendChild(g); return sel;
    }

    head("تعديل بيانات الموكل");
    head("رقم التوكيل بالمكتب " + ar(c.officeNo || "— (من غير توكيل)"),
         "font-size:13.5px;color:var(--muted);margin-bottom:15px;line-height:1.8");
    /* زرار «فصل الأسماء» كان في تعديل التوكيل فقط فاختفى من هنا — يرجع لكل
       موكل اسمه أكتر من اسم (نفس منطق splitMultiNames، لهذا السجل فقط). */
    (function () {
      var b = splitOneButton(c, function () { wrap.remove(); }, done);
      if (b) box.appendChild(b);
    })();

    var fName  = field("اسم الموكل *", c.name, { placeholder: "الاسم الرباعي" });
    var fRole  = field("صفته", c.role, { placeholder: "مثال: بصفته وريثاً" });
    var fNo    = field("رقم التوكيل بالمكتب", c.officeNo, { ltr: true,
                       note: "فاضي للموكل اللي مالوش توكيل (بيتلاقى بالاسم). تقدر تكتبه أو تغيّره بإيدك — تغييره ينقل توكيلاته وصورها معه." });
    var rContact = row2();
    var fPhone = field("التليفون", ct.phones.join("، "), { ltr: true, multi: true,
                       note: "أكثر من رقم؟ افصل بينها بفاصلة.", into: rContact });
    var fMail  = field("البريد الإلكتروني", ct.emails.join("، "), { ltr: true, multi: true,
                       note: "أكثر من بريد؟ افصل بينها بفاصلة.", into: rContact });
    wireLiveDigitFix(fMail);

    /* لو الموكل غيّر بريده أو نسي كلمة سره وملوش بريد بديل يسترجعها عليه
       (Firebase بيبعت رابط الاسترجاع للبريد المسجَّل بالحساب فقط، مفيش
       طريقة نوجّهه لقناة تانية بلا سيرفر خاص — راجع مذكرة الذاكرة). الحل
       العملي: المكتب يحدّث البريد أعلاه لبريده الجديد، ثم يمسح ربط حساب
       البوابة القديم (clientUid) هنا، فيقدر الموكل يعمل "أول مرة" من
       جديد ببريده الجديد — بلا أي تأثير على بيانات قضاياه أو توكيلاته. */
    if (c.id) {
      var resetPortalBtn = document.createElement("button");
      resetPortalBtn.type = "button";
      resetPortalBtn.textContent = "🔄 إعادة تعيين حساب بوابة الموكل";
      resetPortalBtn.style.cssText = "width:100%;margin:-4px 0 14px;padding:10px 14px;" +
        "border:1px solid var(--brand);border-radius:9px;background:transparent;" +
        "color:var(--brand);font-family:inherit;font-size:13px;min-height:42px";
      resetPortalBtn.onclick = function () {
        Ask.confirm("إعادة تعيين حساب بوابة هذا الموكل؟", {
          detail: "استخدمها بعد ما تحدّث بريده أعلاه لبريده الجديد (لو نسي كلمة " +
            "سره وملوش بريد بديل يسترجعها عليه) — هيقدر يعمل \"أول مرة\" من جديد " +
            "ببريده الجديد. بيانات قضاياه وتوكيلاته مش بتتأثر خالص.",
          ok: "إعادة التعيين"
        }, function () {
          if (!w.CloudStore || !CloudStore.collection || !CloudStore.collection.resetClientUid) {
            alert("الاتصال بالسحابة غير متاح."); return;
          }
          var oldTxt = resetPortalBtn.textContent;
          resetPortalBtn.disabled = true; resetPortalBtn.textContent = "جارٍ إعادة التعيين…";
          /* يتمسح محلياً كمان — وإلا فهرس البوابة يفضل يقول «مربوط» والحفظة الجاية ترجّعه */
          (function () {
            var lst = read(), rec = lst.filter(function (x) { return x.id === c.id; })[0];
            if (rec && rec.clientUid) { delete rec.clientUid; delete c.clientUid; commit(lst, rec); }
          })();
          CloudStore.collection.resetClientUid("clients", c.id, function (ok) {
            resetPortalBtn.disabled = false; resetPortalBtn.textContent = oldTxt;
            alert(ok ? "تم — الموكل يقدر يدخل البوابة \"أول مرة\" ببريده الجديد."
                     : "تعذّر الاتصال بالسحابة، حاول تاني.");
          });
        });
      };
      box.appendChild(resetPortalBtn);
    }

    var rTier = row2();
    var fTier   = selectField("الفئة", c.tier, ["", "VIP", "A", "B", "C"], rTier, "1 1 30%");
    var fIdNo   = field("رقم الإثبات (الرقم القومي)", c.idNo, { ltr: true,
      note: "١٤ رقماً — يُستخرج منه تلقائياً: المحافظة وتاريخ الميلاد والنوع.",
      into: rTier, flex: "2 1 70%" });
    var fIdType = selectField("إثبات الشخصية", c.idType,
      ["", "رقم قومي", "بطاقة هوية", "جواز سفر", "بطاقة إقامة"]);
    var natBox  = document.createElement("div");
    natBox.style.cssText = "font-size:12.5px;color:var(--brand-dark);background:var(--bg,#f4ece0);" +
      "border-radius:8px;padding:8px 12px;margin:-6px 0 12px;line-height:1.9;display:none";
    box.appendChild(natBox);
    /* تاريخ انتهاء البطاقة (من ضهرها: «البطاقة سارية حتى») — قبل انتهائها بشهر
       بيطلع تنبيه في التنبيهات وزرار في كارت الموكل لطلب البطاقة المحدّثة. */
    var fIdExp = field("البطاقة سارية حتى", c.idExpiry ? ar(String(c.idExpiry).replace(/-/g, "/")) : "",
      { ltr: true, placeholder: "سنة/شهر/يوم — مثلاً 2031/12/01",
        note: "من ضهر البطاقة. قبل انتهائها بشهر بيظهر تنبيه لطلب البطاقة المحدّثة من الموكل." });
    var fBirth = field("تاريخ الميلاد", c.birth ? ar(String(c.birth).replace(/-/g, "/")) : "",
      { ltr: true, placeholder: "سنة/شهر/يوم — بيتملى من الرقم القومي",
        note: "لو مكتوب هنا تاريخ، الرقم القومي ما يغيّروش." });
    var birthSt = { auto: "" };
    /* البطاقة منتهية أو باقي عليها ٣٠ يوم أو أقل ← زرار إرسال للموكل يبعت البطاقة الجديدة */
    (function () {
      var st = idExpiryState(c);
      if (!st || st.days > 30 || !w.ClientReport || !ClientReport.sendIdRenewal) return;
      var bar = document.createElement("div");
      bar.style.cssText = "background:" + (st.days < 0 ? "#fdecea" : "#fff4e0") + ";border-radius:9px;padding:9px 12px;" +
        "margin:-4px 0 12px;font-size:13px;line-height:1.8;color:" + (st.days < 0 ? "#8c1d18" : "#8a5a12");
      bar.appendChild(document.createTextNode(st.days < 0 ? "البطاقة منتهية من " + ar(-st.days) + " يوم." :
        st.days === 0 ? "البطاقة بتنتهي النهارده." : "البطاقة بتنتهي بعد " + ar(st.days) + " يوم."));
      var row = document.createElement("div");
      row.style.cssText = "display:flex;gap:8px;margin-top:6px;flex-wrap:wrap";
      [["whatsapp", "🪪 اطلب البطاقة الجديدة واتساب"], ["email", "🪪 بريد"]].forEach(function (o) {
        var b = document.createElement("button");
        b.type = "button"; b.textContent = o[1];
        b.style.cssText = "flex:" + (o[0] === "whatsapp" ? "2" : "1") + ";min-height:42px;border-radius:9px;border:1px solid currentColor;" +
          "background:#fff;color:inherit;font-family:inherit;font-size:13px;font-weight:600";
        b.onclick = function () {
          /* بالتليفون/الإيميل اللي في الفورم دلوقتي (لو اتعدّلوا قبل الحفظ) */
          var tmp = {}; Object.keys(c).forEach(function (k) { tmp[k] = c[k]; });
          tmp.phones = splitList(fPhone.value); tmp.phone = tmp.phones[0] || "";
          tmp.emails = splitList(fMail.value); tmp.email = tmp.emails[0] || "";
          ClientReport.sendIdRenewal(tmp, o[0]);
        };
        row.appendChild(b);
      });
      bar.appendChild(row);
      box.appendChild(bar);
    })();
    function refreshNat() {
      birthFromId(fIdNo, fBirth, birthSt);
      var r = parseNat(fIdNo.value);
      if (r) { natBox.style.display = ""; natBox.textContent =
        "الجنسية: " + r.nationality + " · المحافظة: " + (r.gov || "—") +
        " · تاريخ الميلاد: " + ar(r.birth) + " · النوع: " + r.gender;
        if (!fGov.value && r.gov) fGov.value = r.gov;
      } else natBox.style.display = "none";
    }
    fIdNo.oninput = refreshNat;

    /* صورة إثبات الشخصية — وجهاً وظهراً. لكل صورة زرّان منفصلان: تصوير
       بالكاميرا مباشرة (capture="environment") أو رفع ملف موجود من الجهاز
       (بلا capture، فيفتح مربّع الاختيار العام). لو الملف المرفوع PDF،
       تُقسَّم صفحاته تلقائياً (عبر AndroidFiles.splitPdfPages — لا مكتبة
       خارجية) وتوزَّع صفحة١=الوجه صفحة٢=الظهر تلقائياً على الحقلين معاً. */
    function idPhotoSlot(label, getSrc, doSave, doRemove) {
      var side = label.indexOf("وجه") === 0 ? "front" : "back";
      var wrap = document.createElement("div");
      wrap.style.cssText = "margin:-4px 0 14px";
      var api = { draw: null, save: doSave, setBusy: null };
      function draw() {
        wrap.textContent = "";
        wrap.appendChild((function () {
          var l = document.createElement("div");
          l.style.cssText = "font-size:12.5px;color:var(--brand-dark);margin-bottom:5px;" +
            "font-family:var(--f-title)";
          l.textContent = label;
          return l;
        })());
        var src = getSrc();
        if (!src) {
          wrap.appendChild((function () {
            var d = document.createElement("div");
            d.style.cssText = "font-size:12.5px;color:var(--muted);margin-bottom:6px";
            d.textContent = "لا صورة بعد.";
            return d;
          })());
        } else {
          var openCropper = function () {
            if (!w.IdCrop || !IdCrop.openEditor) { alert("شاشة القص مش متاحة."); return; }
            IdCrop.openEditor(src, side, function (url) {
              if (!doSave(url)) return false;
              draw();
              return true;
            });
          };
          var im = document.createElement("img");
          im.src = src; im.alt = label;
          im.style.cssText = "max-width:220px;max-height:150px;border-radius:9px;display:block;" +
            "margin-bottom:8px;border:1px solid var(--line,#ddd)";
          /* الضغط على الصورة يفتح شاشة القص (window.open ما بيشتغلش جوه التطبيق) */
          im.style.cursor = "pointer";
          im.onclick = function () { openCropper(); };
          wrap.appendChild(im);

          var sendId = document.createElement("button");
          sendId.type = "button"; sendId.textContent = "📤 إرسال";
          sendId.style.cssText = "margin:-2px 0 8px;padding:7px 14px;border:1px solid var(--brand);" +
            "border-radius:9px;background:transparent;color:var(--brand);font-family:inherit;" +
            "font-size:12.5px;min-height:36px";
          sendId.onclick = function () {
            if (!w.Share || !Share.shareFile) { alert("الإرسال غير متاح على هذا الجهاز."); return; }
            var m = /^data:([^;]+);base64,(.*)$/.exec(src);
            if (!m) { alert("تعذّر قراءة الصورة."); return; }
            var ext = m[1].indexOf("png") >= 0 ? "png" : "jpg";
            Share.shareFile(m[2], label.replace(/\s+/g, "-") + "." + ext, m[1]);
          };
          wrap.appendChild(sendId);

          /* قص وتدوير للصور المحفوظة قبل كده (أو لو القص التلقائي غلط) */
          var fixRow = document.createElement("div");
          fixRow.style.cssText = "display:flex;gap:8px;margin:-2px 0 8px";
          [["✂ قص وتعديل", null],
           ["↻ تدوير", function () { return w.IdCrop ? IdCrop.rotateRight(src) : Promise.resolve(src); }]
          ].forEach(function (a) {
            var b = document.createElement("button");
            b.type = "button"; b.textContent = a[0];
            b.style.cssText = sendId.style.cssText + ";margin:0";
            b.onclick = function () {
              if (!a[1]) { openCropper(); return; }
              var old = b.textContent; b.disabled = true; b.textContent = "جارٍ…";
              a[1]().then(function (url) {
                b.disabled = false; b.textContent = old;
                if (url && url !== src && !doSave(url)) { alert("تعذّر حفظ الصورة."); return; }
                draw();
              }).catch(function () { b.disabled = false; b.textContent = old; alert("تعذّر تعديل الصورة."); });
            };
            fixRow.appendChild(b);
          });
          wrap.appendChild(fixRow);
        }

        var camFile = document.createElement("input");
        camFile.type = "file"; camFile.accept = "image/*";
        camFile.setAttribute("capture", "environment");
        camFile.style.display = "none";
        var upFile = document.createElement("input");
        upFile.type = "file"; upFile.accept = "image/*";
        upFile.style.display = "none";

        /* لو القص التلقائي ما لقاش البطاقة بثقة (صورة مهزوزة، ضل، خلفية مزخرفة —
           موكل ١١٣٠): شاشة القص بتفتح على طول بالأركان الأربعة، بدل ما تتحفظ
           الصورة زي ما هي أو تتقص غلط من غير ما حد ياخد باله. */
        function handleImageFile(f, btn) {
          if (!f || !w.Attach) return;
          var oldTxt = btn.textContent, original = null;
          btn.disabled = true; btn.textContent = "جارٍ القص والحفظ…";
          /* قص المستندات العادية (autoCropDocument في attach.js) ما ينفعش للبطاقة:
             في ضهر البطاقة كان بيمسك الباركود كأوضح مستطيل ويقصّه لوحده، والباقي
             يضيع قبل ما IdCrop يشوف الصورة (٢-١٠-٢٠٢٦). القص هنا لـ IdCrop بس. */
          f.__noCrop = true;
          f.__noEnhance = true;      /* التحسين بتاع السكانر بيتعمل بعد القص (IdCrop ← ScanFx) */
          Attach.compress(f).then(function (r) {
            original = r.dataUrl;
            if (!w.IdCrop) return { dataUrl: r.dataUrl, cropped: true };
            return IdCrop.process(r.dataUrl, { side: side }).catch(function () { return { dataUrl: r.dataUrl, cropped: false }; });
          }).then(function (res) {
            btn.disabled = false; btn.textContent = oldTxt;
            if (!res.cropped && w.IdCrop && IdCrop.openEditor) {
              IdCrop.openEditor(original, side, function (url) {
                if (!doSave(url)) { alert("تعذّر حفظ الصورة."); return; }
                draw();
              });
              return;
            }
            if (!doSave(res.dataUrl)) { alert("تعذّر حفظ الصورة."); return; }
            draw();
          }).catch(function (e) {
            btn.disabled = false; btn.textContent = oldTxt;
            alert(e && e.message ? e.message : "تعذّر قراءة الصورة.");
          });
        }
        camFile.onchange = function () {
          var f = camFile.files && camFile.files[0];
          camFile.value = "";
          handleImageFile(f, camBtn);
        };
        upFile.onchange = function () {
          var f = upFile.files && upFile.files[0];
          upFile.value = "";
          if (!f) return;
          if (/pdf$/i.test(f.type) || /\.pdf$/i.test(f.name || "")) {
            handlePdfUpload(f, upBtn);
            return;
          }
          handleImageFile(f, upBtn);
        };
        wrap.appendChild(camFile);
        wrap.appendChild(upFile);

        var bar = document.createElement("div");
        bar.style.cssText = "display:flex;gap:8px;flex-wrap:wrap";
        var camBtn = document.createElement("button");
        camBtn.type = "button";
        camBtn.textContent = scannerReady() ? "📷 تصوير بالسكانر" : "📷 تصوير";
        camBtn.style.cssText = "flex:1 1 auto;min-width:110px;min-height:44px;padding:9px 12px;" +
          "border:1px solid var(--brand);border-radius:9px;background:transparent;" +
          "color:var(--brand);font-family:inherit;font-size:13px";
        camBtn.onclick = function () {
          prepCapture("card", label + ": " + (c.name || ""));
          camFile.click();
        };
        bar.appendChild(camBtn);
        var upBtn = document.createElement("button");
        upBtn.type = "button";
        upBtn.textContent = "📁 رفع ملف";
        upBtn.style.cssText = camBtn.style.cssText;
        upBtn.onclick = function () { upFile.click(); };
        bar.appendChild(upBtn);
        /* مسح الوجه والظهر في خطوة واحدة — بيظهر في خانة الوجه بس، ولما
           السكانر المثبَّت يقدر يرجّع النتيجة فعلاً (قبل كده كان ظاهر دايماً
           تحت اسم «سكانر تلقائي» ويفشل بصمت). */
        if (scannerReady() && label.indexOf("وجه") === 0) {
          var scanBtn = document.createElement("button");
          scanBtn.type = "button";
          scanBtn.textContent = "🪪 مسح الوجه والظهر معاً";
          scanBtn.style.cssText = camBtn.style.cssText;
          scanBtn.onclick = function () { scanWithApp(scanBtn); };
          bar.appendChild(scanBtn);
        }
        if (src) {
          var del = document.createElement("button");
          del.type = "button";
          del.textContent = "حذف الصورة";
          del.style.cssText = "min-height:44px;padding:9px 14px;border:1px solid #e3c9c6;" +
            "border-radius:9px;background:transparent;color:#b3261e;font-family:inherit;font-size:13px";
          del.onclick = function () {
            Ask.confirm("حذف " + label + "؟", { ok: "حذف الصورة" },
              function () { doRemove(); draw(); });
          };
          bar.appendChild(del);
        }
        wrap.appendChild(bar);
      }
      api.draw = draw;
      draw();
      api.el = wrap;
      return api;
    }

    /** يقرأ ملف File كـ base64 خام (بلا بادئة data:). */
    function fileToBase64(f, done) {
      var fr = new FileReader();
      fr.onload = function () {
        var s = String(fr.result || "");
        done(s.substring(s.indexOf(",") + 1));
      };
      fr.onerror = function () { done(null); };
      fr.readAsDataURL(f);
    }

    /** رفع PDF على أي من حقلَي الوجه/الظهر: يقسم صفحاته ويوزّعها تلقائياً
        (صفحة١ على الحقل الذي رُفع منه، وصفحة٢ على الحقل الآخر لو فاضٍ). */
    var idFront, idBack;   /* تُملأ بعد إنشاء الحقلين أدناه */
    /** يوزّع صفحات (data: URLs جاهزة) على حقلَي وجه/ظهر البطاقة — مصدر
        مشترك بين نتيجة PDF المقسَّمة ونتيجة صور السكانر الجاهزة أصلاً. */
    function applyIdPages(pages, fromScanner) {
      if (!pages.length) return "الملف بلا صفحات قابلة للقراءة.";
      /* نفس القص وتعديل الاتجاه على صفحات السكانر/الـPDF — بيتحفظ بعد ما يخلص.
         صفحات السكانر متحسّنة عنده أصلاً، فمش بنحسّنها تاني. */
      var enh = fromScanner ? false : undefined;
      Promise.all([autoCrop(pages[0], "front", enh), pages[1] ? autoCrop(pages[1], "back", enh) : null])
        .then(function (r) {
          if (!saveIdImage(c, r[0])) { alert("تعذّر حفظ الصورة."); return; }
          if (r[1]) saveIdImageBack(c, r[1]);
          idFront.draw(); idBack.draw();
          cardOcr("front", r[0]);
          if (r[1]) cardOcr("back", r[1]);
        });
      return null;
    }
    /** يقسّم PDF (base64 خام بلا بادئة data:) عبر AndroidFiles.splitPdfPages
        ثم يوزّع صفحاته — يُستخدم فقط لو السكانر رجَّع PDF مجمَّعاً بدل صور
        منفصلة (انظر applyIdPages أعلاه للحالة المباشرة). */
    function applyScannedPdf(b64) {
      if (typeof AndroidFiles === "undefined" || !AndroidFiles.splitPdfPages) {
        return "تقسيم PDF غير متاح على هذا الجهاز.";
      }
      var pagesRaw = AndroidFiles.splitPdfPages(b64);
      if (!pagesRaw) return "تعذّر تقسيم صفحات هذا الملف.";
      var pages = pagesRaw.split("\n").filter(Boolean)
        .map(function (p) { return "data:image/jpeg;base64," + p; });
      return applyIdPages(pages);
    }
    function handlePdfUpload(f, btn) {
      if (typeof AndroidFiles === "undefined" || !AndroidFiles.splitPdfPages) {
        alert("تقسيم PDF غير متاح على هذا الجهاز.");
        return;
      }
      var oldTxt = btn.textContent;
      btn.disabled = true; btn.textContent = "جارٍ تقسيم الملف…";
      fileToBase64(f, function (b64) {
        btn.disabled = false; btn.textContent = oldTxt;
        if (!b64) { alert("تعذّر قراءة الملف."); return; }
        var err = applyScannedPdf(b64);
        if (err) alert(err);
      });
    }

    /** مسح بطاقة الموكل مباشرة عبر تطبيق السكانر الخارجي المثبَّت على
        الجهاز (AndroidScanner، انظر MainActivity.java) — بديل أسرع للتصوير
        اليدوي وضغطه. السكانر يرجِّع إما صوراً جاهزة مقسَّمة صفحة صفحة
        (kind="images"، الحالة المعتادة) أو PDF مجمَّعاً (kind="pdf") فقط
        كبديل احتياطي — راجع brmja_scanner_integration.md لعقد النتيجة. */
    function scanWithApp(btn) {
      if (typeof AndroidScanner === "undefined" || !AndroidScanner.scanIdCard) {
        alert("سكانر المستندات غير متاح على هذا الجهاز.");
        return;
      }
      var oldTxt = btn.textContent;
      btn.disabled = true; btn.textContent = "جارٍ فتح السكانر…";
      w.onDocScanResult = function (kind, payload) {
        btn.disabled = false; btn.textContent = oldTxt;
        w.onDocScanResult = null;
        if (!kind || !payload) return;   /* المستخدم ألغى المسح، أو التطبيق غير مثبَّت */
        var err;
        if (kind === "images") {
          var pages = payload.split("\n").filter(Boolean)
            .map(function (p) { return "data:image/jpeg;base64," + p; });
          err = applyIdPages(pages, true);
        } else {
          err = applyScannedPdf(payload);
        }
        if (err) alert(err);
      };
      AndroidScanner.scanIdCard("بطاقة الموكل: " + (c.name || ""));
    }

    /* ---- قراءة بيانات البطاقة من صورتها (idocr.js) — ملاحظة المحامين التالتة:
       بعد رفع/تصوير الوش أو الضهر، البيانات بتتقري وتتكتب في الحقول الفاضية
       لوحدها (والحقل اللي اتملى بيتعلّم بلون). الحقل اللي فيه بيانات مختلفة
       عن البطاقة ما بيتغيّرش إلا بعد سؤال. ولا حاجة بتتحفظ غير بزرار «حفظ». */
    var ocrNote = document.createElement("div");
    ocrNote.style.cssText = "display:none;font-size:12.5px;line-height:1.9;border-radius:9px;padding:8px 12px;" +
      "margin:-4px 0 12px;background:#eef6ee;color:#1f5130;border:1px solid #cfe5d2";
    var ocrLines = { front: document.createElement("div"), back: document.createElement("div") };
    ocrNote.appendChild(ocrLines.front); ocrNote.appendChild(ocrLines.back);
    function ocrNorm(v) {
      return String(v || "").replace(/[٠-٩]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".indexOf(d); })
        .replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[\s،,\-\/]+/g, "");
    }
    /* قراءة البطاقة ناقصة عن المسجّل (رقم بيت ضاع، كلمة ناقصة) = مش اختلاف يستاهل سؤال */
    function ocrCovered(cur, v) {
      var have = {};
      String(cur).split(/[\s،,\-\/]+/).forEach(function (t) { if (t) have[ocrNorm(t)] = 1; });
      var toks = String(v).split(/[\s،,\-\/]+/).filter(function (t) { return t && !/^\d+$/.test(ocrNorm(t)); });
      return toks.length > 0 && toks.every(function (t) { return have[ocrNorm(t)]; });
    }
    function cardOcr(side, dataUrl) {
      if (!w.IdOcr || !dataUrl) return;
      var line = ocrLines[side], who = side === "front" ? "الوش" : "الضهر";
      ocrNote.style.display = "";
      line.textContent = "🔎 بيقرا بيانات " + who + "…";
      (side === "front" ? IdOcr.readFront(dataUrl) : IdOcr.readBack(dataUrl)).then(function (r) {
        /* [اسم الحقل، الحقل، القيمة، طريقة الكتابة، يتكتب لو فاضي بس] */
        var items = side === "front" ? [
          ["الرقم القومي", fIdNo, r.idNo, function (v) { fIdNo.value = v; if (fIdNo.oninput) fIdNo.oninput(); if (!fIdType.value) fIdType.value = "رقم قومي"; }],
          ["الاسم", fName, r.name, null, true],
          ["العنوان", fAddr, r.addressFull],
          ["المحافظة", fGov, r.gov],
          ["المنطقة", fArea, r.area]
        ] : [
          ["البطاقة سارية حتى", fIdExp, r.idExpiry ? ar(r.idExpiry.replace(/-/g, "/")) : ""],
          ["المهنة", fJob, r.job]
        ];
        var filled = [], diff = [];
        items.forEach(function (it) {
          var el = it[1], v = it[2];
          if (!v || !el) return;
          var cur = String(el.value || "").trim();
          if (!cur) {
            if (it[3]) it[3](v); else el.value = v;
            el.style.boxShadow = "0 0 0 2px #7cc48b";
            filled.push(it[0]);
          } else if (!it[4] && ocrNorm(cur) !== ocrNorm(v) && !ocrCovered(cur, v)) diff.push(it);
        });
        var msg = filled.length ? "✓ " + who + ": اتكتب " + filled.join("، ") + " — راجعهم ودوس «حفظ»." : "";
        if (!filled.length && diff.length) msg = who + ": فيه بيانات مختلفة عن المسجّل — اختار من الرسالة.";
        if (!filled.length && !diff.length) msg = items.some(function (it) { return it[2]; })
          ? who + ": البيانات مطابقة للمسجّل."
          : who + ": ما قدرتش أقرا بيانات واضحة — اكتبها بإيدك، أو صوّرها تاني بإضاءة أحسن.";
        line.textContent = msg;
        if (diff.length && w.Ask) {
          Ask.confirm("البطاقة فيها بيانات مختلفة عن المسجّل", {
            detail: diff.map(function (it) { return it[0] + ": المسجّل «" + String(it[1].value).trim() + "» ← البطاقة «" + it[2] + "»"; }).join(" ؛ "),
            ok: "استبدل باللي في البطاقة", cancel: "سيب المسجّل", danger: false
          }, function () {
            diff.forEach(function (it) {
              if (it[3]) it[3](it[2]); else it[1].value = it[2];
              it[1].style.boxShadow = "0 0 0 2px #7cc48b";
            });
            line.textContent = (msg ? msg + " " : "") + "✓ اتبدّل: " + diff.map(function (it) { return it[0]; }).join("، ") + " — دوس «حفظ».";
          });
        }
      }).catch(function () {
        line.textContent = who + ": تعذّر القراءة على الجهاز ده.";
      });
    }

    idFront = idPhotoSlot("وجه إثبات الشخصية",
      function () { return idImageOf(c); },
      function (dataUrl) { var ok = saveIdImage(c, dataUrl); if (ok) cardOcr("front", dataUrl); return ok; },
      function () { removeIdImage(c); });
    idBack = idPhotoSlot("ظهر إثبات الشخصية",
      function () { return idImageBackOf(c); },
      function (dataUrl) { var ok = saveIdImageBack(c, dataUrl); if (ok) cardOcr("back", dataUrl); return ok; },
      function () { removeIdImageBack(c); });
    box.appendChild(idFront.el);
    box.appendChild(idBack.el);
    box.appendChild(ocrNote);
    if (w.IdOcr && IdOcr.warm) setTimeout(IdOcr.warm, 1500);
    if (w.IdOcr) {
      var ocrBtn = document.createElement("button");
      ocrBtn.type = "button";
      ocrBtn.textContent = "🔎 قراءة البيانات من صورة البطاقة";
      ocrBtn.style.cssText = "width:100%;min-height:46px;margin:0 0 8px;padding:9px 12px;" +
        "border:1px solid var(--brand);border-radius:10px;background:transparent;" +
        "color:var(--brand);font-family:inherit;font-size:13.5px";
      ocrBtn.onclick = function () {
        var fr = idImageOf(c), bk = idImageBackOf(c);
        if (!fr && !bk) { alert("صوّر وش البطاقة أو ضهرها الأول."); return; }
        if (fr) cardOcr("front", fr);
        if (bk) setTimeout(function () { cardOcr("back", bk); }, fr ? 50 : 0);
      };
      box.appendChild(ocrBtn);
    }

    /* الوشّين في ورقة واحدة — نفس فكرة «ورقة واحدة» في تصدير السكانر: كل وش
       محفوظ صفحة لوحده، والدمج اختيار وقت الطباعة/الإرسال. البطاقة بمقاسها
       الحقيقي (٨٥٫٦×٥٤ مم) زي تصوير البطاقة المعتاد في المكاتب. */
    var sheetBtn = document.createElement("button");
    sheetBtn.type = "button";
    sheetBtn.textContent = "🪪 الوشّين في ورقة واحدة (PDF) — للطباعة أو الإرسال";
    sheetBtn.style.cssText = "width:100%;min-height:46px;margin:4px 0 14px;padding:9px 12px;" +
      "border:1px solid var(--brand);border-radius:10px;background:transparent;" +
      "color:var(--brand);font-family:inherit;font-size:13.5px";
    sheetBtn.onclick = function () {
      var front = idImageOf(c), back = idImageBackOf(c);
      if (!front && !back) { alert("صوّر وش البطاقة أو ضهرها الأول."); return; }
      if (!w.PdfBuild || !PdfBuild.fromJpegs || !w.Share || !Share.shareFile) {
        alert("إنشاء PDF أو المشاركة غير متاح على هذا الجهاز."); return;
      }
      sheetBtn.disabled = true;
      idSheetJpeg([front, back], ["وجه إثبات الشخصية", "ظهر إثبات الشخصية"], function (jpeg) {
        sheetBtn.disabled = false;
        if (!jpeg) { alert("تعذّر تجهيز الصورة."); return; }
        var bytes = PdfBuild.fromJpegs([jpeg]);
        if (!bytes) { alert("تعذّر إنشاء ملف PDF."); return; }
        var nm = "إثبات-شخصية-" + String(c.name || "موكل").trim().replace(/\s+/g, "-") + ".pdf";
        Share.shareFile(PdfBuild.toBase64(bytes), nm, "application/pdf");
      });
    };
    box.appendChild(sheetBtn);

    var fJob     = field("المهنة", c.job);
    var fEntity  = field("الجهة", c.entity, { note: "جهة العمل." });
    var fCountry = field("الدولة", c.country || "مصر");
    var rLoc = row2();
    var fGov     = field("المحافظة", c.gov, { into: rLoc });
    var fArea    = field("المنطقة", c.area, { into: rLoc });
    var fAddr    = field("العنوان التفصيلي", c.addressFull, { multi: true });
    refreshNat();

    var poas = poaList(c);
    head("بيانات التوكيلات" + (poas.length ? " (" + ar(poas.length) + ")" : ""),
         "font-family:var(--f-title);font-size:15.5px;margin:18px 0 8px;color:var(--brand-dark)");
    if (!poas.length) {
      box.appendChild((function () {
        var d = document.createElement("div");
        d.style.cssText = "font-size:13px;color:var(--muted);margin-bottom:10px";
        d.textContent = "لا توكيلات مسجَّلة لهذا الموكل بعد.";
        return d;
      })());
    }
    poas.forEach(function (p) {
      var pc = document.createElement("div");
      pc.style.cssText = "border:1px solid var(--line,#ddd);border-radius:11px;" +
        "padding:11px 13px;margin-bottom:9px;background:var(--bg,#f4ece0)";

      function row(k, v) {
        if (!v) return;
        var r = document.createElement("div");
        r.style.cssText = "display:flex;gap:6px;font-size:13px;margin-bottom:3px;line-height:1.8";
        var kk = document.createElement("b");
        kk.style.cssText = "color:var(--brand-dark);flex:0 0 auto";
        kk.textContent = k + ":";
        r.appendChild(kk);
        var vv = document.createElement("span");
        vv.textContent = v;
        r.appendChild(vv);
        pc.appendChild(r);
      }
      row("رقم التوكيل", poaFull(p) || "—");
      row("مكتب التوثيق", p.notary);
      row("بتاريخ", p.poaDate ? ar(String(p.poaDate).replace(/-/g, "/")) : "");
      row("تاريخ الانتهاء", p.poaExpiry ? ar(String(p.poaExpiry).replace(/-/g, "/")) : "");
      row("النوع", p.poaType);
      row("الحالة", statusText(p));
      row("الوكيل", agentShow(p.agent));
      if (p.role) row("صفة الموكل", p.role);

      var ep = document.createElement("button");
      ep.type = "button";
      ep.textContent = "✎ تعديل هذا التوكيل";
      ep.style.cssText = "margin-top:6px;padding:9px 14px;border-radius:9px;" +
        "border:1px solid var(--brand);background:transparent;color:var(--brand);" +
        "font-family:inherit;font-size:13px;min-height:40px";
      ep.onclick = function () { editPoa(c, p, function () { wrap.remove(); editClient(c, done); }); };
      pc.appendChild(ep);

      box.appendChild(pc);
    });

    var addPoaBtn = document.createElement("button");
    addPoaBtn.type = "button";
    addPoaBtn.textContent = "＋ إضافة توكيل جديد لهذا الموكل";
    addPoaBtn.style.cssText = "width:100%;padding:12px;margin-bottom:16px;border-radius:10px;" +
      "border:1px dashed var(--brand);background:transparent;color:var(--brand);" +
      "font-family:inherit;font-size:14px;min-height:46px";
    addPoaBtn.onclick = function () {
      wrap.remove();
      if (w.ClientsPOA && ClientsPOA.addPoaTo) ClientsPOA.addPoaTo(c, function () { editClient(c, done); });
    };
    box.appendChild(addPoaBtn);

    head("القضايا والإجراءات",
         "font-family:var(--f-title);font-size:15.5px;margin:6px 0 8px;color:var(--brand-dark)");
    var actRow = document.createElement("div");
    actRow.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px";
    function actBtn(label, onClick) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.style.cssText = "flex:1 1 auto;min-width:140px;padding:11px 10px;border-radius:9px;" +
        "border:1px solid var(--line,#ddd);background:var(--card);color:var(--text);" +
        "font-family:inherit;font-size:13px;min-height:44px";
      b.onclick = onClick;
      actRow.appendChild(b);
    }
    actBtn("🔍 استعراض قضاياه", function () {
      location.href = "93-find.html?q=" + encodeURIComponent(c.name || "");
    });
    actBtn("💼 حسابات العميل", function () {
      location.href = "97-client-accounts.html?name=" + encodeURIComponent(c.name || "");
    });
    box.appendChild(actRow);

    function btn(label, css) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.style.cssText = "flex:1;padding:14px;border-radius:11px;font-family:inherit;" +
                        "font-size:16px;min-height:52px;" + css;
      return b;
    }

    var row = document.createElement("div");
    row.style.cssText = "display:flex;gap:9px;margin-top:16px";
    var save   = btn("حفظ", "border:0;background:var(--brand);color:#fff;font-weight:600");
    var cancel = btn("إلغاء",
      "border:1px solid var(--line,#ddd);background:transparent;color:var(--muted)");

    save.onclick = function () {
      var name = fName.value.trim();
      if (!name) { alert("اكتب اسم الموكل."); fName.focus(); return; }

      var oldNo = String(c.officeNo || "");
      var newNo = fNo.value.trim()
        .replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x0660; });

      /* الصور مفهرسة برقم المكتب — تُنقل قبل تغييره */
      var moves = [];
      var idMove = null, idMoveBack = null;
      if (newNo !== oldNo && w.Attach) {
        poaList(c).forEach(function (p) {
          if (latD(p.officeNo) !== latD(oldNo)) return;   /* توكيل ليه رقم ملف تاني — ما يتغيّرش */
          var pg = pagesOf(p);
          moves.push({ from: [imgId(p), legacyImgId(p), poaDocId(p), legacyDocId(p)],
                       img: pg[0] || "", doc: poaDocOf(p), p: p, pages: pg.slice(1),
                       pageFrom: pg.slice(1).map(function (x, i) { return [pageId(p, i + 2), legacyPageId(p, i + 2)]; }) });
        });
        var idSrc = idImageOf(c);
        if (idSrc) idMove = { from: idImgId(c), data: idSrc };
        var idSrcBack = idImageBackOf(c);
        if (idSrcBack) idMoveBack = { from: idImgIdBack(c), data: idSrcBack };
      }

      c.name  = name;
      c.role  = fRole.value.trim();
      c.norm  = w.PoaMerge ? PoaMerge.norm(name) : name;
      c.phones = splitList(fPhone.value);
      var _oldMails = matchEmailsOf(c);
      c.emails = splitList(fMail.value).map(laDigits);
      /* الموكل مربوط بحساب على البوابة، والإيميل القديم كله اتشال ← الربط القديم
         يتفك (هنا وعلى السحابة)، فيقدر يدخل بالإيميل الجديد من «أول مرة».
         من غيرها البوابة كانت بتقول «مربوط» وتطلب كلمة سر لحساب مش موجود (٧-١٠-٢٠٢٦). */
      var _unlink = false;
      if (c.clientUid && _oldMails.length) {
        var _newMails = c.emails.map(function (x) { return String(x || "").toLowerCase().trim(); });
        _unlink = !_oldMails.some(function (m) { return _newMails.indexOf(m) >= 0; });
        if (_unlink) delete c.clientUid;
      }
      c.phone = c.phones[0] || "";
      c.email = c.emails[0] || "";
      c.tier = fTier.value;
      c.idType = fIdType.value;
      c.idNo = fIdNo.value.trim();
      c.idExpiry = idExpiryIso(fIdExp.value);
      setBirth(c, fBirth, c.idType, c.idNo);
      c.job = fJob.value.trim();
      c.entity = fEntity.value.trim();
      c.country = fCountry.value.trim();
      c.gov = fGov.value.trim();
      c.area = fArea.value.trim();
      c.addressFull = fAddr.value.trim();

      if (newNo !== oldNo) {
        c.officeNo = newNo;
        /* بس التوكيلات اللي كانت على الرقم القديم — الموكل ممكن يكون ليه توكيلات بأرقام ملفات تانية */
        (c.poas || []).forEach(function (p) { if (latD(p.officeNo) === latD(oldNo)) p.officeNo = newNo; });
      }

      if (!commit(at.list, c)) return;
      if (_unlink && w.CloudStore && CloudStore.collection && CloudStore.collection.resetClientUid) {
        CloudStore.collection.resetClientUid("clients", c.id, function () { });
      }

      moves.forEach(function (m) {            /* imgId/poaDocId/pageId بيقروا الرقم الجديد */
        var to = [imgId(m.p), poaDocId(m.p)];
        var ok = (!m.img || Attach.put(to[0], m.img)) && (!m.doc || Attach.put(to[1], m.doc));
        if (ok) m.from.forEach(function (id) {
          if (to.indexOf(id) >= 0) return;
          var v = Attach.get(id);
          if (v && (v === m.img || v === m.doc)) Attach.remove(id);
        });
        m.pages.forEach(function (data, i) {
          var t = pageId(m.p, i + 2);
          if (!Attach.put(t, data)) return;
          m.pageFrom[i].forEach(function (id) { if (id !== t && Attach.get(id) === data) Attach.remove(id); });
        });
      });
      if (idMove) {
        Attach.put(idImgId(c), idMove.data);
        if (idImgId(c) !== idMove.from) Attach.remove(idMove.from);
      }
      if (idMoveBack) {
        Attach.put(idImgIdBack(c), idMoveBack.data);
        if (idImgIdBack(c) !== idMoveBack.from) Attach.remove(idMoveBack.from);
      }

      /* مزامنة جهة اتصال — لا تعطّل الحفظ لو تعذّرت */
      if (w.ContactsSync) {
        try { ContactsSync.syncClient(c.name, c.phones && c.phones[0], c.emails && c.emails[0]); }
        catch (e) { }
      }

      wrap.remove();
      if (done) done(c);
    };

    cancel.onclick = function () { wrap.remove(); };
    row.appendChild(save); row.appendChild(cancel);
    box.appendChild(row);

    /* حذف الموكل بالكامل */
    var del = document.createElement("button");
    del.type = "button";
    del.textContent = "حذف الموكل وكل توكيلاته";
    del.style.cssText =
      "width:100%;padding:13px;margin-top:10px;border:1px solid #e3c9c6;" +
      "border-radius:11px;background:transparent;color:#b3261e;" +
      "font-family:inherit;font-size:15px;min-height:48px";
    del.onclick = function () {
      var n = poaList(c).length;
      Ask.confirm("حذف هذا الموكل نهائياً؟", {
        detail: c.name + " — رقمه بالمكتب " + ar(c.officeNo || "—") +
                (n ? String.fromCharCode(10) + "سيُحذف معه " + ar(n) +
                     (n === 1 ? " توكيل وصورته" : " توكيلات وصورها") : ""),
        ok: "حذف الموكل"
      }, function () {
        poaList(c).forEach(function (p) { removeImage(p); });
        at.list.splice(at.i, 1);
        if (!commit(at.list)) return;
        wrap.remove();
        if (done) done(null);
      });
    };
    box.appendChild(del);

    wrap.appendChild(box);
    /* لمسة على الخلفية بالغلط ما تقفلش الفورم من غير سؤال (كانت بتضيّع المكتوب) */
    wrap.onclick = function (e) { if (e.target === wrap) { if (wrap.__lawyerDismiss) wrap.__lawyerDismiss(); else wrap.remove(); } };
    wireSheet(wrap, function () {
      return fName.value.trim() !== String(c.name || "") ||
        fRole.value.trim() !== String(c.role || "") ||
        fNo.value.trim() !== String(c.officeNo || "") ||
        fPhone.value.trim() !== ct.phones.join("، ") ||
        fMail.value.trim() !== ct.emails.join("، ") ||
        fTier.value !== String(c.tier || "") ||
        fIdType.value !== String(c.idType || "") ||
        fIdNo.value.trim() !== String(c.idNo || "") ||
        idExpiryIso(fIdExp.value) !== String(c.idExpiry || "") ||
        (!!w.Birthdays && fBirth.value.trim() !== birthSt.auto && Birthdays.iso(fBirth.value) !== String(c.birth || "")) ||
        fJob.value.trim() !== String(c.job || "") ||
        fEntity.value.trim() !== String(c.entity || "") ||
        fGov.value.trim() !== String(c.gov || "") ||
        fArea.value.trim() !== String(c.area || "") ||
        fAddr.value.trim() !== String(c.addressFull || "");
    }, save);
    document.body.appendChild(raise(wrap));
  }

  /* ------------------------------------------- إضافة موكل جديد
     فورم داخل الصفحة لا prompt() — الأخيرة غير مدعومة في WebView
     فتموت في صمت ويبدو الزر معطَّلاً. */

  var NOTARIES_CACHE = null;

  function knownNotaries() {
    if (NOTARIES_CACHE) return NOTARIES_CACHE;
    var seen = {};
    read().forEach(function (c) {
      poaList(c).forEach(function (p) {
        var n = (p.notary || "").trim();
        if (n) seen[n] = (seen[n] || 0) + 1;
      });
    });
    NOTARIES_CACHE = Object.keys(seen).sort(function (a, b) { return seen[b] - seen[a]; });
    return NOTARIES_CACHE;
  }

  /** الوكلاء المستعملون فعلاً في التوكيلات — لاقتراحهم عند الإضافة. */
  function knownAgents() {
    var seen = {};
    read().forEach(function (c) {
      poaList(c).forEach(function (p) {
        var a = (p.agent || "").trim();
        if (a) seen[a] = (seen[a] || 0) + 1;
      });
    });
    return Object.keys(seen).sort(function (a, b) { return seen[b] - seen[a]; });
  }

  /** يضيف توكيلاً فارغاً لموكل موجود، ثم يفتح نموذج تعديله الكامل مباشرةً —
      يعيد استخدام editPoa() بدل تكرار نموذج جديد. */
  function addPoaTo(client, done) {
    var at = locateClient(client);
    if (!at) { alert("تعذّر الوصول إلى سجل هذا الموكل."); return; }
    var c = at.c;
    /* توكيل قديم مكتوب في جسد السجل (بلا مصفوفة poas) يُنقَل للمصفوفة أولاً
       كي لا يُفقَد أو يُستبدَل بالجديد. */
    if (!(c.poas && c.poas.length) && c.poaNo) {
      c.poas = [{
        officeNo: c.officeNo || "",
        poaNo: c.poaNo, poaLetter: c.poaLetter, poaYear: c.poaYear, poaType: c.poaType,
        notary: c.notary, poaDate: c.poaDate, poaExpiry: c.poaExpiry, agent: c.agent,
        role: c.role, poaStatus: c.poaStatus || "ساري", poaReason: c.poaReason || "",
        poaNote: c.poaNote || "", sharedWith: 0
      }];
    }
    c.poas = c.poas || [];
    /* أول توكيل يحتفظ برقم المكتب كما هو؛ أي توكيل إضافي يميَّز برقم جديد —
       فيسهل تمييزه في العرض ولا يختلط برقم الأول. */
    /* موكل بلا توكيل (يحضر بشخصه) لا رقم مكتب له بعد؛ يأخذ التتابع الطبيعي عند تسجيل أول توكيل. */
    var newOfficeNo = (c.poas.length || !c.officeNo) ? String(w.PoaMerge ? PoaMerge.takeOfficeNo() : (c.poas.length + 1)) : c.officeNo;
    if (!c.officeNo) c.officeNo = newOfficeNo;
    var p = { officeNo: newOfficeNo, poaStatus: "ساري", poaReason: "", poaNote: "", sharedWith: 0 };
    c.poas.push(p);
    mirror(c);
    if (!commit(at.list, c)) return;
    editPoa(c, p, done);
  }

  var CLIENT_DRAFT = "proflawyer.clientdraft._new";
  function addClient(done) {
    var no = w.PoaMerge ? PoaMerge.nextOfficeNo() : 1;

    var wrap = document.createElement("div");
    wrap.setAttribute("data-modal", "1");
    wrap.setAttribute("data-nosave", "1");
    wrap.style.cssText =
      "position:fixed;inset:0;background:rgba(20,14,8,.6);z-index:10004;" +
      "display:flex;align-items:flex-end;justify-content:center";

    var box = document.createElement("div");
    box.style.cssText =
      "background:var(--card,#fff);border-radius:16px 16px 0 0;padding:18px 18px 26px;" +
      "width:100%;max-width:560px;direction:rtl;color:var(--text);" +
      "max-height:90vh;overflow-y:auto";

    function head(txt, css) {
      var d = document.createElement("div");
      d.style.cssText = css || "font-family:var(--f-title);font-size:17px;margin-bottom:12px";
      d.textContent = txt;
      box.appendChild(d);
      return d;
    }

    function field(label, id, opts) {
      opts = opts || {};
      var f = document.createElement("div");
      f.style.cssText = "margin-bottom:12px";

      var l = document.createElement("label");
      l.setAttribute("for", id);
      l.style.cssText = "display:block;font-family:var(--f-title);font-size:14px;" +
                        "margin-bottom:5px;color:var(--brand-dark)";
      l.textContent = label;
      f.appendChild(l);

      var el;
      if (opts.options) {
        el = document.createElement("select");
        opts.options.forEach(function (o) {
          var op = document.createElement("option");
          op.value = o;
          op.textContent = o;
          el.appendChild(op);
        });
      } else {
        el = document.createElement("input");
        el.type = opts.type || "text";
        /* راجع نفس تعليق field() في editClient أعلاه — lang="ar" كان
           بيفرض أرقاماً عربية-هندية على لوحة المفاتيح حتى في حقول لاتينية. */
        el.setAttribute("lang", opts.ltr ? "en" : "ar");
        el.setAttribute("dir", opts.ltr ? "ltr" : "rtl");
        if (opts.ltr) el.setAttribute("data-latin", "1");
        if (opts.list && w.CaseFile && w.CaseFile.suggestPanel) {
          w.CaseFile.suggestPanel(el, function () { return opts.list; });
        }
        if (opts.placeholder) el.placeholder = opts.placeholder;
      }
      el.id = id;
      el.style.cssText = "width:100%;min-height:48px;font-size:16px;padding:10px 12px;" +
        "border:1px solid var(--line,#ddd);border-radius:9px;background:var(--card);" +
        "font-family:inherit;" +
        (opts.ltr ? "direction:ltr;text-align:left" : "direction:rtl;text-align:right");
      f.appendChild(el);

      if (opts.note) {
        var n = document.createElement("div");
        n.style.cssText = "font-size:12.5px;color:var(--muted);margin-top:4px;line-height:1.8";
        n.textContent = opts.note;
        f.appendChild(n);
      }
      f.style.flex = opts.flex || "1 1 auto";
      f.style.minWidth = opts.minWidth || "0";
      (opts.into || box).appendChild(f);
      return el;
    }

    /* سطر يجمع حقولاً مترابطة جنب بعض بدل كل حقل في سطر مستقل —
       الحقول الصغيرة (رقم/حرف/سنة) لا تحتاج عرض الشاشة كاملاً. */
    function row2() {
      var r = document.createElement("div");
      r.style.cssText = "display:flex;gap:9px";
      box.appendChild(r);
      return r;
    }

    head("موكل جديد");
    head("رقم التوكيل بالمكتب: " + ar(no) + " — بيتحط بس لو سجّلت بيانات توكيل. الموكل من غير توكيل بيفضل من غير رقم وبيتلاقى بالاسم.",
         "font-size:14px;color:var(--muted);margin-bottom:16px;" +
         "background:var(--bg);padding:10px 12px;border-radius:9px");

    var fName  = field("اسم الموكل *", "ncName", { placeholder: "الاسم الرباعي" });
    var fRole  = field("صفته", "ncRole", { placeholder: "مثال: بصفته وريثاً",
                       note: "صفة الموكل إن كان يوكّل بصفة لا بشخصه." });
    var rContact = row2();
    var fPhone = field("التليفون", "ncPhone", { type: "tel", ltr: true,
                       placeholder: "201001234567", into: rContact });
    var fMail  = field("البريد الإلكتروني", "ncMail", { type: "email", ltr: true,
                       placeholder: "name@example.com", into: rContact });
    wireLiveDigitFix(fMail);
    /* بمجرد كتابة اسم مكرَّر — موكل أو وكيل مسجَّل قبل كده بنفس الاسم — تُملأ
       كل بياناته المعروفة تلقائياً (تليفون/بريد/فئة/رقم قومي/محافظة/منطقة)
       بدل إعادة كتابتها من الصفر. الأولوية لقاعدة بيانات التطبيق نفسها،
       وإلا جهات اتصال الجهاز. */
    var offered = false;
    function fillFromExisting(rec) {
      if (rec.phones && rec.phones[0] && !fPhone.value.trim()) fPhone.value = rec.phones[0];
      else if (rec.phone && !fPhone.value.trim()) fPhone.value = rec.phone;
      if (rec.emails && rec.emails[0] && !fMail.value.trim()) fMail.value = rec.emails[0];
      else if (rec.email && !fMail.value.trim()) fMail.value = rec.email;
      if (rec.tier && !fTier.value) fTier.value = rec.tier;
      if (rec.idNo && !fIdNo.value.trim()) { fIdNo.value = rec.idNo; fIdNo.oninput(); }
      if (rec.gov && !fGov.value.trim()) fGov.value = rec.gov;
      if (rec.area && !fArea.value.trim()) fArea.value = rec.area;
    }
    function tryOffer() {
      if (offered) return;
      var nm = fName.value.trim(), ph = fPhone.value.trim();
      if (nm.length < 3 && ph.length < 6) return;

      var existing = findClientByName(nm);
      if (existing) {
        offered = true;
        Ask.confirm("هذا الاسم مسجَّل بالفعل — تعبئة بياناته المعروفة؟", {
          danger: false, ok: "تعبئة البيانات", cancel: "لا، شخص آخر",
          detail: "«" + existing.name + "» موجود برقم " + ar(existing.officeNo || "?") + " بالمكتب."
        }, function () { fillFromExisting(existing); offered = false; },
           function () { offered = false; });
        return;
      }

      if (!w.ContactsSync) return;
      offered = true;
      /* اقتراح مش استبدال: الخانة الفاضية تتملي، والمليانة يتضاف لها الجديد بس */
      function addTo(inp, vals) {
        var cur = inp.value.split(/[،,]/).map(function (x) { return x.trim(); }).filter(Boolean);
        var key = function (x) { return String(x).replace(/[^0-9a-z@.]/gi, "").toLowerCase(); };
        vals.forEach(function (v) {
          v = String(v || "").trim();
          if (v && !cur.some(function (x) { return key(x) === key(v); })) cur.push(v);
        });
        inp.value = cur.join("، ");
      }
      (ContactsSync.offerImportByName || ContactsSync.offerImport)(nm, ph, function (data) {
        if (data.name && !fName.value.trim()) fName.value = data.name;
        addTo(fPhone, data.phones || [data.phone]);
        addTo(fMail, data.emails || [data.email]);
        if (w.PL && PL.toast) PL.toast("اتملت من جهات الاتصال", "راجع التليفون والإيميل قبل «حفظ».", "ok");
      }, function () { offered = false; });
    }
    fName.addEventListener("blur", tryOffer);
    fPhone.addEventListener("blur", tryOffer);

    var rId = row2();
    var fTier   = field("الفئة", "ncTier", { options: ["", "VIP", "A", "B", "C"], into: rId, flex: "1 1 30%" });
    var fIdNo   = field("الرقم القومي", "ncIdNo", { ltr: true, placeholder: "١٤ رقماً",
                        note: "يُستخرج منه تلقائياً: المحافظة وتاريخ الميلاد والنوع.", into: rId, flex: "2 1 60%" });
    var natBox2 = document.createElement("div");
    natBox2.style.cssText = "font-size:12.5px;color:var(--brand-dark);background:var(--bg,#f4ece0);" +
      "border-radius:8px;padding:8px 12px;margin:-6px 0 12px;line-height:1.9;display:none";
    box.appendChild(natBox2);
    var fBirth = field("تاريخ الميلاد", "ncBirth", { ltr: true, placeholder: "سنة/شهر/يوم — بيتملى من الرقم القومي" });
    var birthSt = { auto: "" };
    var rLoc = row2();
    var fGov = field("المحافظة", "ncGov", { placeholder: "تلقائي من الرقم القومي أو يدوياً", into: rLoc });
    var fArea = field("المنطقة", "ncArea", { into: rLoc });
    fIdNo.oninput = function () {
      birthFromId(fIdNo, fBirth, birthSt);
      var r = parseNat(fIdNo.value);
      if (r) {
        natBox2.style.display = "";
        natBox2.textContent = "الجنسية: " + r.nationality + " · تاريخ الميلاد: " + ar(r.birth) +
          " · النوع: " + r.gender;
        if (!fGov.value && r.gov) fGov.value = r.gov;
      } else natBox2.style.display = "none";
    };

    head("بيانات التوكيل (اختيارية)",
         "font-family:var(--f-title);font-size:15px;margin:18px 0 12px;" +
         "padding-top:14px;border-top:1px solid var(--line,#eee)");

    var rPoaNo = row2();
    var fPoaNo  = field("رقم التوكيل", "ncPoaNo", { placeholder: "مثال ١٤٤٨", into: rPoaNo, flex: "2 1 50%" });
    var fLetter = field("الحرف", "ncLetter", { placeholder: "مثال أ", into: rPoaNo, flex: "1 1 20%" });
    var fYear   = field("السنة", "ncYear", { placeholder: "٢٠٢٦", into: rPoaNo, flex: "1 1 30%" });

    var rPoaInfo = row2();
    var fType   = field("نوعه", "ncType",
                        { options: POA_TYPES, into: rPoaInfo });
    var fNotary = field("مكتب التوثيق", "ncNotary", { list: knownNotaries(), into: rPoaInfo });
    var fDate   = field("تاريخ التوكيل", "ncDate", { type: "date", into: rPoaInfo });

    /* الوكيل: أكثر من وكيل ممكن، وكلٌّ باسمه ورقمه القومي — عند الحفظ يُنشأ
       له سجل موكل جديد بالرقم القومي كاملاً لو لم يكن مسجَّلاً بالفعل، فلا
       يبقى الوكيل اسماً معلَّقاً بلا بيانات في النظام. */
    head("الوكيل (من صدر له التوكيل)",
         "font-family:var(--f-title);font-size:14px;margin:4px 0 6px;color:var(--brand-dark)");
    var agentsBox = document.createElement("div");
    box.appendChild(agentsBox);
    var agentEditor = buildAgentEditor(agentsBox, "");

    var row = document.createElement("div");
    row.style.cssText = "display:flex;gap:9px;margin-top:18px";

    function btn(label, css) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.style.cssText = "flex:1;padding:14px;border-radius:11px;font-family:inherit;" +
                        "font-size:16px;min-height:52px;" + css;
      return b;
    }

    var save   = btn("حفظ", "border:0;background:var(--brand);color:#fff;font-weight:600");
    var cancel = btn("إلغاء",
      "border:1px solid var(--line,#ddd);background:transparent;color:var(--muted)");

    save.onclick = function () {
      var name = fName.value.trim();
      if (!name) { alert("اكتب اسم الموكل."); fName.focus(); return; }

      var key = w.PoaMerge ? PoaMerge.norm(name) : name;
      var list = read();
      var dup = list.filter(function (c) {
        return (w.PoaMerge ? PoaMerge.norm(c.name) : c.name) === key;
      })[0];
      /* قاعدة المكتب: الموكل سجل واحد، وتوكيلاته بتتعدد. نفس الشخص لو جه
         بتوكيل جديد، التوكيل ياخد رقم ملف جديد (زي أي موكل جديد) لكن
         يتحط في صفحته هو بنفس بياناته — مش سجل تاني بنفس الاسم. */
      if (dup) {
        Ask.confirm("«" + dup.name + "» موجود — أضيف التوكيل الجديد في صفحته برقم ملف جديد؟", {
          danger: false, ok: "أضِفه في صفحته", cancel: "لا، شخص تاني",
          detail: "مسجَّل برقم " + ar(dup.officeNo || "?") + " بالمكتب. التوكيل الجديد هياخد الرقم اللي عليه الدور، " +
                  "وهيبان في صفحته جنب توكيلاته القديمة وقصاده رقمه."
        }, function () { addToExisting(dup); }, function () {
          Ask.confirm("تسجيله موكل جديد منفصل بنفس الاسم؟", {
            danger: false, ok: "أيوه، شخص مختلف", cancel: "تراجع",
            detail: "اعمل كده بس لو هما شخصين مختلفين فعلاً."
          }, finish);
        });
        return;
      }
      finish();
    };

    /** التوكيل الجديد في صفحة الموكل الموجود: رقم ملف جديد، والبيانات
        الناقصة في سجله (تليفون/إيميل/رقم قومي…) تتكمّل من الفورم. */
    function addToExisting(dup) {
      if (finished) return;
      finished = true;
      save.disabled = true;
      var list = read();
      var c = list.filter(function (x) { return x.id && x.id === dup.id; })[0] ||
              list.filter(function (x) { return (w.PoaMerge ? PoaMerge.norm(x.name) : x.name) === (w.PoaMerge ? PoaMerge.norm(dup.name) : dup.name); })[0];
      if (!c) { finished = false; save.disabled = false; finish(); return; }
      if (!(c.poas && c.poas.length) && c.poaNo) {
        c.poas = [{
          officeNo: c.officeNo, poaNo: c.poaNo, poaLetter: c.poaLetter, poaYear: c.poaYear, poaType: c.poaType,
          notary: c.notary, poaDate: c.poaDate, poaExpiry: c.poaExpiry, agent: c.agent,
          role: c.role, poaStatus: c.poaStatus || "ساري", poaReason: c.poaReason || "",
          poaNote: c.poaNote || "", sharedWith: 0
        }];
      }
      c.poas = c.poas || [];
      var role = fRole.value.trim();
      var p = {
        officeNo: "",
        poaNo: fPoaNo.value.trim(), poaLetter: fLetter.value.trim(), poaYear: fYear.value.trim(),
        poaType: fType.value, notary: fNotary.value.trim(), poaDate: fDate.value.trim(),
        agent: fixAgentName(agentEditor.getString()), role: role,
        poaStatus: "ساري", poaReason: "", poaNote: "", sharedWith: 0
      };
      var filled = ["poaNo", "poaLetter", "poaYear", "notary", "poaDate"]
        .some(function (k) { return String(p[k] || "").trim(); });
      if (filled) {
        p.officeNo = String(w.PoaMerge ? PoaMerge.takeOfficeNo() : (c.poas.length + 1));
        if (!c.officeNo) c.officeNo = p.officeNo;
        c.poas.push(p);
      }
      var mail = laDigits(fMail.value.trim()), tel = fPhone.value.trim();
      splitList(tel).forEach(function (t1) {
        c.phones = c.phones || [];
        if (c.phones.map(function (x) { return String(x).replace(/\D/g, ""); }).indexOf(t1.replace(/\D/g, "")) < 0) c.phones.push(t1);
        c.phone = c.phones[0];
      });
      splitList(mail).forEach(function (m1) {
        c.emails = c.emails || [];
        if (c.emails.map(function (x) { return String(x).toLowerCase(); }).indexOf(m1.toLowerCase()) < 0) c.emails.push(m1);
        c.email = c.emails[0];
      });
      if (!c.idNo && fIdNo.value.trim()) c.idNo = fIdNo.value.trim();
      if (!c.birth) setBirth(c, fBirth, c.idType, c.idNo);
      if (!c.gov && fGov.value.trim()) c.gov = fGov.value.trim();
      if (!c.area && fArea.value.trim()) c.area = fArea.value.trim();
      if (!c.tier && fTier.value) c.tier = fTier.value;
      mirror(c);
      if (!commit(list, c)) { finished = false; save.disabled = false; alert("المساحة ممتلئة — لم يُحفَظ."); return; }
      try { localStorage.removeItem(CLIENT_DRAFT); } catch (e) { }
      agentEditor.sync();
      NOTARIES_CACHE = null;
      wrap.remove();
      if (w.PL && PL.toast) PL.toast("اتضاف التوكيل", "في صفحة «" + c.name + "»" + (filled ? " برقم " + ar(p.officeNo) : "") + ".", "");
      if (done) done(c);
    }

    /* تُنادى مباشرةً، أو بعد تأكيد التكرار — فتقرأ المخزن بنفسها
       لأنها لم تعد داخل نطاق زر الحفظ. */
    var finished = false;
    function finish() {
      /* ضغطتين ورا بعض (الشاشة بطيئة أو الاتصال من الكمبيوتر بيقطّع) كانت
         بتحفظ الموكل مرتين وتلاتة */
      if (finished) return;
      finished = true;
      save.disabled = true;
      var list = read();
      var name = fName.value.trim();
      var officeNo = "";   /* يُعيَّن عند وجود توكيل فقط (بعد حساب filled أدناه) */
      var mail = laDigits(fMail.value.trim()), tel = fPhone.value.trim();

      var role = fRole.value.trim();

      var rec = {
        name: name, officeNo: officeNo,
        role: role,
        /* الصورة المطبَّعة للاسم: بها يجده البحث ويُطابَق مع القضايا */
        norm: w.PoaMerge ? PoaMerge.norm(name) : name,
        /* أكتر من رقم/إيميل (مثلاً من جهات الاتصال) مفصولين بفاصلة */
        email: splitList(mail)[0] || "", phone: splitList(tel)[0] || "",
        emails: splitList(mail), phones: splitList(tel),
        tier: fTier.value, idNo: fIdNo.value.trim(),
        gov: fGov.value.trim(), area: fArea.value.trim(),
        poas: []
      };
      setBirth(rec, fBirth, "", rec.idNo);

      /* التوكيل يُحفظ إن مُلئ أي حقل من حقوله — لا رقمه وحده.
         كان من يملأ النوع وجهة التوثيق والتاريخ ويترك الرقم يفقد ما كتبه. */
      var agentNames = agentEditor.getString();
      var p = {
        officeNo: officeNo,
        poaNo: fPoaNo.value.trim(),
        poaLetter: fLetter.value.trim(),
        poaYear: fYear.value.trim(),
        poaType: fType.value,
        notary: fNotary.value.trim(),
        poaDate: fDate.value.trim(),
        agent: fixAgentName(agentNames),
        role: role,
        poaStatus: "ساري", poaReason: "", poaNote: "", sharedWith: 0
      };
      var filled = ["poaNo", "poaLetter", "poaYear", "notary", "poaDate"]
        .some(function (k) { return String(p[k] || "").trim(); });

      if (filled) {
        officeNo = String(w.PoaMerge ? PoaMerge.takeOfficeNo() : no);
        rec.officeNo = officeNo; p.officeNo = officeNo;
        rec.poas.push(p);
        ["poaNo", "poaLetter", "poaYear", "poaType", "notary", "poaDate",
         "agent", "poaStatus"].forEach(function (k) { rec[k] = p[k]; });
      }

      list.push(rec);
      if (!commit(list, rec)) { finished = false; save.disabled = false; alert("المساحة ممتلئة — لم يُحفَظ."); return; }
      try { localStorage.removeItem(CLIENT_DRAFT); } catch (e) { }

      agentEditor.sync();
      NOTARIES_CACHE = null;

      if (w.ContactsSync) {
        try { ContactsSync.syncClient(rec.name, rec.phone, rec.email); }
        catch (e) { }
      }

      wrap.remove();
      if (done) done(rec);
    };

    cancel.onclick = function () {
      try { localStorage.removeItem(CLIENT_DRAFT); } catch (e) { }
      wrap.remove();
    };

    row.appendChild(save);
    row.appendChild(cancel);
    box.appendChild(row);

    /* ---- مسوّدة تلقائية: لو الشاشة اتقفلت قبل «حفظ» (التطبيق اتعاد تشغيله،
       اتقفل غصب، لمسة بالغلط) ترجع البيانات أول ما الفورم يتفتح تاني. */
    function draftCtrls() {
      return Array.prototype.slice.call(box.querySelectorAll("input[id],select[id],textarea[id]"))
        .filter(function (e) { return e.type !== "file"; });
    }
    function saveClientDraft() {
      if (finished || !wrap.isConnected) return;
      var d = {}, any = false;
      draftCtrls().forEach(function (e) {
        d[e.id] = e.value;
        if (e.tagName !== "SELECT" && String(e.value || "").trim()) any = true;
      });
      try {
        if (any) localStorage.setItem(CLIENT_DRAFT, JSON.stringify({ at: Date.now(), data: d }));
      } catch (e) { }
    }
    var draftT = null;
    function scheduleClientDraft() { clearTimeout(draftT); draftT = setTimeout(saveClientDraft, 700); }
    box.addEventListener("input", scheduleClientDraft);
    box.addEventListener("change", scheduleClientDraft);
    box.addEventListener("click", scheduleClientDraft);
    function flushClientDraft() { if (document.visibilityState === "hidden") saveClientDraft(); }
    document.addEventListener("visibilitychange", flushClientDraft);
    w.addEventListener("pagehide", saveClientDraft);

    var oldDraft = null;
    try { oldDraft = JSON.parse(localStorage.getItem(CLIENT_DRAFT)); } catch (e) { }
    if (oldDraft && oldDraft.data) {
      draftCtrls().forEach(function (e) {
        if (oldDraft.data[e.id] != null && oldDraft.data[e.id] !== "") e.value = oldDraft.data[e.id];
      });
      var when = new Date(oldDraft.at || Date.now());
      var bar = document.createElement("div");
      bar.style.cssText = "background:#fff4e0;color:#8a5a12;border-radius:9px;padding:9px 12px;" +
        "margin-bottom:12px;font-size:12.5px;line-height:1.8;display:flex;" +
        "justify-content:space-between;align-items:center;gap:8px";
      bar.appendChild(document.createTextNode("🔄 رجّعنا بيانات موكل ما اتحفظش (" +
        ar(when.getHours() + ":" + ("0" + when.getMinutes()).slice(-2)) + ")."));
      var ign = document.createElement("button");
      ign.type = "button"; ign.textContent = "تجاهلها";
      ign.style.cssText = "flex:0 0 auto;border:1px solid #8a5a12;background:transparent;" +
        "color:#8a5a12;border-radius:7px;padding:4px 10px;font-family:inherit;font-size:12px";
      ign.onclick = function () {
        try { localStorage.removeItem(CLIENT_DRAFT); } catch (e) { }
        wrap.remove();
        addClient(done);
      };
      bar.appendChild(ign);
      box.insertBefore(bar, box.children[1] || null);
    }

    wrap.appendChild(box);
    /* لمسة على الخلفية بالغلط ما تقفلش الفورم من غير سؤال (كانت بتضيّع المكتوب) */
    wrap.onclick = function (e) { if (e.target === wrap) { if (wrap.__lawyerDismiss) wrap.__lawyerDismiss(); else wrap.remove(); } };
    wireSheet(wrap, function () {
      return !!(fName.value.trim() || fRole.value.trim() || fPhone.value.trim() ||
        fMail.value.trim() || fTier.value || fIdNo.value.trim() || fBirth.value.trim() || fGov.value.trim() ||
        fArea.value.trim() || fPoaNo.value.trim() || fLetter.value.trim() ||
        fYear.value.trim() || fNotary.value.trim() || fDate.value.trim() ||
        agentEditor.rows.some(function (r) { return r.name.value.trim() || r.idNo.value.trim(); }));
    }, save);
    document.body.appendChild(raise(wrap));
    setTimeout(function () { fName.focus(); }, 80);
  }

  /* §7 فصل الأسماء المتعددة — بمعاينة وتأكيد قبل أي تغيير. */
  /* أسماء أولى تبدأ بحرف الواو أصلاً — ما تتفصلش عندها («محمد وليد…») */
  var WAW_NAMES = /^و(ليد|ائل|فاء|جدي|حيد|حيده|حيدة|رده|ردة|سام|سيم|صفي|صال|فيق|فيقه|فيقة|هبه|هبة|هيب|داد|ديع|ديعه|ديعة|جيه|جيهه|جيهة|لاء|عد|سيله|سيلة|هدان|اصف|ضاح|حش|نيس|نيسه|نيسة|نس|هدي|هدى|اكد)$/;
  /* loose: يفصل كمان عند الواو اللازقة — للزرار الفردي بس (المستخدم شايف الفصل قبل التأكيد)،
     مش للأداة الجماعية، علشان اسم زي «ونيس» ما يتفصلش في مئات السجلات مرة واحدة. */
  function detectMultiName(name, loose) {
    var raw = String(name || "").replace(/\s*وآخر(ين|ون)\s*$/, "");
    var parts = raw.split(/\s+و\s+|،|,|\/|؛|;|\+|&|\n|\s+-\s+/)
      .map(function (s) { return s.trim(); }).filter(Boolean);
    /* «أحمد محمد علي ومحمود محمد علي»: الواو لازقة في أول الاسم التاني.
       تتفصل بس لو كل جزء اسمين على الأقل والكلمة مش اسم بيبدأ بالواو. */
    var out = [];
    if (!loose) out = parts;
    else parts.forEach(function (p) {
      var words = p.split(/\s+/), cur = [];
      words.forEach(function (wd, i) {
        if (i > 0 && cur.length >= 2 && /^و\S{2,}/.test(wd) && !WAW_NAMES.test(wd) &&
            words.length - i >= 2) {
          out.push(cur.join(" ")); cur = [wd.slice(1)];
        } else cur.push(wd);
      });
      out.push(cur.join(" "));
    });
    parts = out;
    if (parts.length < 2) return null;
    if (parts.some(function (p) { return p.length < 3; })) return null;
    return parts;
  }
  /** زرار فصل اسم موكل واحد (لو اسمه أكتر من اسم)، أو null. */
  function splitOneButton(client, closeFn, done) {
    var parts = detectMultiName(client.name, true);
    if (!parts) return null;
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = "⧉ فصل الأسماء: " + parts.length + " سجلات منفصلة";
    b.style.cssText = "display:block;width:100%;margin-bottom:14px;padding:9px 12px;" +
      "border:1px solid var(--brand);border-radius:8px;background:transparent;" +
      "color:var(--brand);font-family:inherit;font-size:13.5px;min-height:42px";
    b.onclick = function () {
      Ask.confirm("فصل «" + client.name + "» إلى " + parts.length + " سجلات؟", {
        ok: "فصل (" + parts.length + ")",
        detail: "كل سجل جديد بنفس بيانات التوكيل والتوثيق، باسم موكل واحد فقط:" +
          String.fromCharCode(10) + parts.join(" | ")
      }, function () {
        var list = read();
        var idx = list.indexOf(client);
        if (idx < 0) idx = list.findIndex(function (c) { return c.id === client.id; });
        if (idx < 0) idx = list.findIndex(function (c) { return c.name === client.name && String(c.officeNo || "") === String(client.officeNo || ""); });
        if (idx < 0) { alert("تعذّر العثور على السجل."); return; }
        var src = list[idx];
        var out = list.slice();
        var added = parts.map(function (nm, i) {
          var nc = JSON.parse(JSON.stringify(src));
          nc.id = "cl" + Date.now().toString(36) + i + Math.floor(Math.random() * 1e5).toString(36);
          nc.name = nm;
          nc.norm = norm(nm);
          return nc;
        });
        out.splice.apply(out, [idx, 1].concat(added));
        if (!commit(out)) return;
        if (closeFn) closeFn();
        if (w.PL && PL.toast) PL.toast("تم الفصل", "أصبح " + ar(parts.length) + " سجلات منفصلة.", "ok");
        if (done) done();
      });
    };
    return b;
  }
  function splitMultiNames(done) {
    var affected = [];
    read().forEach(function (c) {
      var parts = detectMultiName(c.name);
      if (parts) affected.push({ name: c.name, parts: parts });
    });
    if (!affected.length) { alert("لا توجد أسماء متعددة قابلة للفصل."); return; }
    var newCount = affected.reduce(function (s, a) { return s + a.parts.length; }, 0);
    var NL = String.fromCharCode(10);
    var examples = affected.slice(0, 6).map(function (a) {
      return "• " + a.name + " ← " + a.parts.join(" | ");
    }).join(NL);
    Ask.confirm("فصل الأسماء المتعددة في التوكيلات؟", {
      ok: "فصل (" + affected.length + ")",
      detail: "توكيلات متأثرة: " + affected.length + " · ستصبح " + newCount + " سجلاً." + NL +
              "كل سجل بنفس بيانات التوثيق واسم موكل واحد فقط." + NL + NL +
              examples + (affected.length > 6 ? NL + "…" : "")
    }, function () {
      var out = [];
      read().forEach(function (c) {
        var parts = detectMultiName(c.name);
        if (parts) {
          parts.forEach(function (nm, i) {
            var nc = JSON.parse(JSON.stringify(c));
            nc.id = "cl" + Date.now().toString(36) + i + Math.floor(Math.random() * 1e5).toString(36);
            nc.name = nm;
            out.push(nc);
          });
        } else out.push(c);
      });
      if (!commit(out)) return;
      alert("تم الفصل — أصبح " + newCount + " سجلاً.");
      if (done) done();
    });
  }

  /* ------------------------------------------ دمج الموكلين المكررين (المهمة ١)

     الأصل: نفس الموكل (نفس رقم المكتب ونفس الاسم) موجود مرتين بمعرّفين
     مختلفين — «cl_off_N» (المعرّف الثابت المُشتق من رقم المكتب) و«clmtn…»
     (معرّف عشوائي من استيراد/جهاز آخر). syncFromCloud كان يدمج بالمعرّف
     فقط فيبقى الاثنان، وفي بيانات هذا الجهاز نحو نصف الموكلين مكرَّرين.
     المفتاح الصارم للتكرار: (رقم المكتب + الاسم بعد التطبيع). الحالات
     الأخرى (نفس الاسم برقمين مختلفين) تُعرض للمراجعة فقط ولا تُدمج تلقائياً.

     الفائز في كل مجموعة: من له clientUid (حسابه مربوط ببوابة الموكل) ثم
     الأكثر اكتمالاً — الفرضية: بلا حقل updatedAt في السجل، فالاكتمال هو
     أقرب مؤشر لـ«آخر تعديل فعلي». تُدمج حقول الآخرين في الفائز (الفارغ
     فقط يُملأ، التليفونات/الإيميلات/التوكيلات اتحاد بلا تكرار). */
  function isBlank(v) {
    return v == null || v === "" || (Array.isArray(v) && !v.length);
  }
  function uniqBy(arr, keyFn) {
    var seen = {}, out = [];
    (arr || []).forEach(function (x) {
      var k = keyFn(x);
      if (seen[k]) return;
      seen[k] = 1; out.push(x);
    });
    return out;
  }
  /* أرقام عربية/فارسية → لاتينية، وإزالة الفراغات — ليتطابق «١٨٧٠» مع «1870» */
  function dgt(x) {
    return norm(String(x == null ? "" : x)
      .replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x660; })
      .replace(/[۰-۹]/g, function (d) { return d.charCodeAt(0) - 0x6F0; })
      .replace(/\s+/g, ""));
  }
  /* هوية التوكيل = رقم + حرف + سنة (التاريخ/الجهة قد تكون فارغة في إحدى النسختين) */
  function poaKey(p) {
    return [p.poaNo, p.poaLetter, p.poaYear].map(dgt).join("|");
  }
  function poaScore(p) {
    var n = 0;
    Object.keys(p).forEach(function (k) { if (!isBlank(p[k])) n++; });
    return n;
  }
  /* يدمج التوكيلات المتطابقة الهوية: الأكمل يفوز ويُملأ فارغه من الباقي،
     والوكيل الأطول اسماً يُفضَّل؛ لو الجهتان مختلفتان صراحةً تبقى الاثنتان. */
  function uniqPoas(arr) {
    var out = [], byKey = {};
    (arr || []).slice().sort(function (a, b) { return poaScore(b) - poaScore(a); })
      .forEach(function (p) {
        var k = poaKey(p);
        if (k === "||") { out.push(p); return; }
        var hit = (byKey[k] || []).filter(function (q) {
          return !q.notary || !p.notary || dgt(q.notary) === dgt(p.notary);
        })[0];
        if (!hit) { (byKey[k] = byKey[k] || []).push(p); out.push(p); return; }
        Object.keys(p).forEach(function (f) {
          if (isBlank(hit[f]) && !isBlank(p[f])) hit[f] = p[f];
        });
        if (String(p.agent || "").length > String(hit.agent || "").length) hit.agent = p.agent;
      });
    return out;
  }
  function completeness(c) {
    var n = 0;
    Object.keys(c).forEach(function (k) { if (!isBlank(c[k])) n++; });
    return n + (c.poas || []).length * 3 + (c.clientUid ? 1000 : 0) +
      (String(c.id || "").indexOf("cl_off_") === 0 ? 1 : 0);
  }
  /* نفس الشخص = نفس الاسم المطبَّع (بغضّ النظر عن رقم المكتب). لو للسجلين
     رقمان قوميان مختلفان صراحةً فهما شخصان مختلفان ويبقيان منفصلين. السجل
     بلا رقم قومي يُضَمّ لمجموعة الرقم القومي الوحيدة إن وُجدت. */
  function dedupeGroups(list) {
    var byName = {};
    list.forEach(function (c) {
      if (!c.name) return;
      var k = norm(c.name);
      if (k) (byName[k] = byName[k] || []).push(c);
    });
    var out = [];
    Object.keys(byName).forEach(function (k) {
      var recs = byName[k];
      if (recs.length < 2) return;
      var byId = {}, blank = [];
      recs.forEach(function (c) {
        var id = latinDigits(c.idNo).replace(/\D/g, "");
        if (id) (byId[id] = byId[id] || []).push(c); else blank.push(c);
      });
      var ids = Object.keys(byId);
      if (!ids.length) { out.push(recs); return; }
      if (ids.length === 1) { out.push(byId[ids[0]].concat(blank)); return; }
      ids.forEach(function (id) { out.push(byId[id]); });     /* أشخاص مختلفون */
    });
    return out.filter(function (g) { return g.length > 1; });
  }
  function mergeGroup(g) {
    g = g.slice().sort(function (a, b) { return completeness(b) - completeness(a); });
    var keep = g[0];
    g.slice(1).forEach(function (o) {
      Object.keys(o).forEach(function (k) {
        if (k === "id" || k === "poas" || k === "phones" || k === "emails") return;
        if (isBlank(keep[k]) && !isBlank(o[k])) keep[k] = o[k];
      });
      keep.phones = uniqBy((keep.phones || []).concat(o.phones || []), function (x) {
        return String(x).replace(/\D/g, "");
      });
      keep.emails = uniqBy((keep.emails || []).concat(o.emails || []), function (x) {
        return String(x).toLowerCase().trim();
      });
      keep.poas = (keep.poas || []).concat(o.poas || []);
    });
    keep.poas = uniqPoas(keep.poas || []);
    return keep;
  }

  /** معاينة بلا أي تغيير: {groups, drop, poaDupes, sample[]}. */
  function dedupePreview() {
    var list = read(); list.forEach(backfillId);
    var groups = dedupeGroups(list);
    var drop = groups.reduce(function (s, g) { return s + g.length - 1; }, 0);
    var poaDupes = 0;
    list.forEach(function (c) {
      poaDupes += (c.poas || []).length - uniqPoas(c.poas || []).length;
    });
    return {
      total: list.length, groups: groups.length, drop: drop, poaDupes: poaDupes,
      sample: groups.slice(0, 5).map(function (g) { return g[0].name + " (رقم " + g[0].officeNo + ")"; })
    };
  }

  /** ينفّذ الدمج فعلياً: يحفظ نسخة احتياطية أولاً (ملف في التنزيلات)، يدمج
      محلياً، ثم يحذف المكرَّر من السحابة ويرفع الفائز. done(result). */
  function dedupeApply(done) {
    var list = read(); list.forEach(backfillId);
    var groups = dedupeGroups(list);

    /* ١) نسخة احتياطية كاملة قبل أي حذف — لا تتم العملية بدونها */
    var stamp = new Date().toISOString().replace(/[:.]/g, "-");
    var backupOk = false;
    try {
      var json = JSON.stringify(list);
      var b64 = btoa(unescape(encodeURIComponent(json)));
      if (w.AndroidSaver && AndroidSaver.save) {
        AndroidSaver.save("clients-backup-before-dedupe-" + stamp + ".json", b64);
        backupOk = true;
      }
    } catch (e) { }
    if (!backupOk) { alert("تعذّر حفظ النسخة الاحتياطية — أُلغي الدمج حمايةً لبياناتك."); if (done) done(null); return; }

    /* ٢) الدمج المحلي */
    var dropIds = {}, dropped = [];
    groups.forEach(function (g) {
      var keep = mergeGroup(g);
      g.forEach(function (c) {
        if (c !== keep) { dropIds[c.id] = 1; dropped.push(c.id); }
      });
    });
    list.forEach(function (c) { if (c.poas) c.poas = uniqPoas(c.poas); });
    var merged = list.filter(function (c) { return !dropIds[c.id]; });
    try { localStorage.setItem(KEY, JSON.stringify(merged)); }
    catch (e) { alert("تعذّر الحفظ — المساحة ممتلئة."); if (done) done(null); return; }

    /* ٣) السحابة: حذف المكرَّر ثم رفع المتغيّر فقط (دفعات صغيرة) */
    var cloud = window.CloudStore && window.CloudStore.collection;
    var idx = 0;
    function next() {
      if (!cloud || idx >= dropped.length) {
        pushChangedToCloud(merged);
        if (done) done({ merged: groups.length, dropped: dropped.length, total: merged.length });
        return;
      }
      var batch = dropped.slice(idx, idx + 8); idx += 8;
      var left = batch.length;
      batch.forEach(function (id) {
        cloud.remove("clients", id, function () { if (--left === 0) next(); });
      });
    }
    next();
  }

  /* ---------------------------------- انتهاء التوكيل بعد ٧ سنوات (المهمة ٧)
     أي توكيل مضى على تاريخ تحريره ٧ سنوات وما زال «ساري» يتحوّل تلقائياً
     إلى «منتهي — عدم سريان مفعوله» عند فتح التطبيق ثم مرة كل يوم، ويبقى في
     ترتيبه الرقمي (لا يُعاد ترتيب أو حذف شيء). التوكيل بلا تاريخ كامل
     (يوم/شهر/سنة) لا يُمسّ. التحويل يُرفع للسحابة للسجل المتغيّر فقط. */
  var EXPIRY_YEARS = 7;
  var EXPIRY_KEY = "proflawyer.poaExpiry.lastRun";
  function parsePoaDate(v) {
    var t = String(v == null ? "" : v).replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x0660; });
    var m = t.match(/(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = t.match(/(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    return null;
  }
  function olderThanYears(dateStr, years) {
    var d = parsePoaDate(dateStr);
    if (!d || isNaN(d.getTime())) return false;
    var limit = new Date(d.getFullYear() + years, d.getMonth(), d.getDate());
    return limit.getTime() <= Date.now();
  }
  function expireOldPoas(force) {
    var day = new Date().toISOString().slice(0, 10);
    try { if (!force && localStorage.getItem(EXPIRY_KEY) === day) return 0; } catch (e) { }
    var list = read();
    var changedRecs = [];
    list.forEach(function (c) {
      var changed = false;
      /* سجل قديم توكيله على الموكل نفسه (من غير c.poas) بيتفحص هو كمان */
      (c.poas && c.poas.length ? c.poas : (c.poaNo ? [c] : [])).forEach(function (p) {
        if (statusOf(p).status === "منتهي") return;
        if (!olderThanYears(p.poaDate, EXPIRY_YEARS)) return;
        p.poaStatus = "منتهي"; p.poaReason = "عدم سريان مفعوله";
        changed = true;
      });
      if (changed) { if (c.poas && c.poas.length) mirror(c); changedRecs.push(c); }
    });
    if (changedRecs.length) {
      try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { return 0; }
      changedRecs.forEach(function (c) { pushChangedToCloud(list, c); });
      /* شاشة الموكلين مفتوحة؟ تبان الحالة الجديدة على طول */
      if (w.ClientsPOA && ClientsPOA.onChange) { try { ClientsPOA.onChange(); } catch (e) { } }
    }
    try { localStorage.setItem(EXPIRY_KEY, day); } catch (e) { }
    return changedRecs.length;
  }
  /* بعد اكتمال المزامنة الأولى بثوانٍ، وتُعاد يومياً لو ظل التطبيق مفتوحاً */
  setTimeout(function () { expireOldPoas(false); }, 6000);
  setInterval(function () { expireOldPoas(false); }, 6 * 3600000);

  /** الموكلين المختلفين عن آخر نسخة مترفوعة: مقارنة بالبصمات على الجهاز من غير أي قراءة من السحابة */
  function unsynced() {
    var g = gate();
    if (!g || !window.CloudStore) return [];
    var hs = g.hashes(), qo = CloudStore.queued("clients");
    return read().filter(function (c) {
      return c.id && !qo[c.id] && hs[c.id] !== CloudStore.hash(JSON.stringify(c));
    }).map(function (c) { return c.id; });
  }
  function pushUnsynced(id) {
    var list = read(), c = list.filter(function (x) { return x.id === id; })[0];
    if (c) pushChangedToCloud(list, c);
  }
  /** تعديل سجل موكل واحد بمعرّفه ورفعه هو بس */
  function patchClient(id, fn) {
    var list = read(), c = list.filter(function (x) { return x.id === id; })[0];
    if (!c) return false;
    fn(c);
    return commit(list, c);
  }

  /* «استخراج تواريخ الميلاد»: بيملا الخانة الفاضية بس، وما بيلمسش تاريخ مكتوب. */
  function birthNeeds(c) { return !c.birth && !!w.Birthdays && !!Birthdays.birthFromRecord(c); }
  function birthMissing() { return read().filter(birthNeeds); }
  /* في تخزين التطبيق الخاص: AndroidSaver بيستنى البصمة ويرجع قبل ما يحفظ، فمش هنعرف
     النسخة اتحفظت ولا لأ. AndroidFiles.put بيرجّع النتيجة فوراً، ولو فشل مفيش تعديل. */
  function birthBackup() {
    var name = "clients-before-birthdays-" + Birthdays.today() + ".json", raw = localStorage.getItem(KEY) || "[]";
    if (w.AndroidFiles && AndroidFiles.put) {
      if (!AndroidFiles.put(name, btoa(unescape(encodeURIComponent(raw))))) throw new Error("backup");
      return name;
    }
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    return name;
  }
  /* نسخة احتياطية الأول، وبعدها دفعات ٨ بمهلة بينهم — قاعدة التعديل الجماعي (١٢١ تعديل
     مرة واحدة قفلوا التطبيق على التابلت). المخزن بيتقرا مع كل دفعة علشان مزامنة شغالة
     في النص ما تضيعش، ولو العملية وقفت الضغطة الجاية بتكمّل من مكانها. */
  function birthFill(onStep) {
    return new Promise(function (res) {
      var total = birthMissing().length, done = 0, backup;
      try { backup = birthBackup(); }
      catch (e) { res({ error: "تعذّرت النسخة الاحتياطية — ما اتغيّرش حاجة." }); return; }
      (function step() {
        var list = read(), batch = list.filter(birthNeeds).slice(0, 8);
        if (!batch.length) {
          Birthdays.syncNative();
          res({ total: total, filled: done, backup: backup });
          return;
        }
        batch.forEach(function (c) { c.birth = Birthdays.birthFromRecord(c); backfillId(c); });
        try { localStorage.setItem(KEY, JSON.stringify(list)); }
        catch (e) { res({ error: "المساحة ممتلئة — وقف بعد " + ar(done) + " موكل.", filled: done, backup: backup }); return; }
        batch.forEach(function (c) { pushChangedToCloud(list, c); });
        done += batch.length;
        if (onStep) onStep(done, total);
        setTimeout(step, 1200);
      })();
    });
  }

  /** موكلون حاضرون بشخوصهم بلا توكيل: يُسجَّلون بلا رقم مكتب (يأخذونه عند أول توكيل). */
  function registerNoPoa(names) {
    var list = read(), have = {};
    list.forEach(function (c) { have[norm(c.name)] = 1; });
    var added = 0;
    names.forEach(function (nm) {
      nm = String(nm || "").trim();
      var k = norm(nm);
      if (!nm || have[k]) return;
      have[k] = 1;
      list.push({ name: nm, officeNo: "", role: "", norm: k, email: "", phone: "", emails: [], phones: [], tier: "", idNo: "", gov: "", area: "", poas: [] });
      added++;
    });
    if (added && !commit(list)) return 0;
    return added;
  }

  w.ClientsPOA = { commitAll: function (list) { return commit(list); }, patchClient: patchClient, unsynced: unsynced, pushUnsynced: pushUnsynced, birthMissing: birthMissing, birthFill: birthFill, registerNoPoa: registerNoPoa, isDeceased: isDeceased, deceasedList: deceasedList, markDeceased: markDeceased, heirsFlow: heirsFlow, stripOthersCount: stripOthersCount, stripOthersApply: stripOthersApply, completeAgent: completeAgent, agentShow: agentShow, FIXED_AGENT_ID: FIXED_AGENT_ID, FIXED_AGENT: FIXED_AGENT, fixAgentName: fixAgentName, agentFixPreview: agentFixPreview, agentFixApply: agentFixApply, caseCount: caseCount, isVip: isVip, VIP_THRESHOLD: VIP_THRESHOLD, expireOldPoas: expireOldPoas, dedupePreview: dedupePreview, dedupeApply: dedupeApply, knownAgents: knownAgents, editClient: editClient, editPoa: editPoa, deletePoa: deletePoa, imageOf: imageOf,
                   onChange: null, addClient: addClient, addPoaTo: addPoaTo, knownNotaries: knownNotaries, showPoa: showPoa, images: images, SORTS: SORTS, sortBy: sortBy,
                   officeNumbers: officeNumbers, poaList: poaList, statusOf: statusOf, statusText: statusText,
                   editStatus: editStatus, REASONS: REASONS, caseOptions: caseOptions, all: all, withPoa: withPoa, stats: stats,
                   search: search, poaFull: poaFull, contacts: contacts, ar: ar,
                   printPoa: printPoa, splitMultiNames: splitMultiNames, idBatchProcess: idBatchProcess,
                   idExpiryIso: idExpiryIso, idExpiryState: idExpiryState,
                   idExpiryMissing: idExpiryMissing, idExpiryBatch: idExpiryBatch };
})(window);
