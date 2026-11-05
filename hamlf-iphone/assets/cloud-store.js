/* =============================================================================
   المحامي المحترف — طبقة مزامنة Firestore (عبر REST، بلا SDK — انظر تعليق
   firebase-config.js لسبب استعمال REST بدل مكتبة JS SDK)

   نموذج البيانات (يطابق brief-تنفيذ-الثلاث-تطبيقات-Firebase):
     /offices/{officeId}                                  بيانات المكتب والباقة
     /offices/{officeId}/users/{uid}                       المستخدمون والأدوار
     /offices/{officeId}/records/{screenId}/items/{id}     سجلات كل شاشة (data.js)

   كل شاشة تستمر تتعامل مع data.js بالضبط كالمعتاد (سجل جديد/حفظ/فتح/حذف) —
   data.js نفسه هو اللي يستدعي CloudStore.records(...) عند load()/persist()
   فتتزامن كل الشاشات المبنية على data.js تلقائياً بلا أي تعديل فيها.

   بلا تسجيل دخول: كل شيء يعمل محلياً بـ localStorage تماماً كالسابق — هذا
   الملف لا يغيّر شيئاً في تلك الحالة.
   ============================================================================= */
(function (w) {
  "use strict";

  var officeId = null;         // يُحدَّد بعد تسجيل الدخول (resolveOffice)
  var ready = false;
  var readyWaiters = [];

  /* ------------------------------------------- سقف يومي لكل جهاز (نسخة ١٫٥١)
     حصة فيربيز المجانية ٥٠ ألف قراءة و٢٠ ألف كتابة في اليوم للمكتب كله، وبتتجدد
     نص الليل بتوقيت كاليفورنيا (١٠ الصبح القاهرة). كل جهاز بيعدّ قراءاته وكتاباته:
     كل مستند راجع من السحابة = قراءة (واستعلام فاضي = قراءة)، وكل حفظ/مسح = كتابة.
     جهاز المحامي ليه سقف صغير، فمستحيل جهاز واحد يخلّص حصة المكتب (حادثة ٥ و٧-١٠). */
  var BUDGET_KEY = "proflawyer.budget.v1", _bWarned = false;
  function quotaDay() {
    try { return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }); }
    catch (e) { return new Date(Date.now() - 7 * 3600000).toISOString().slice(0, 10); }
  }
  function budgetCaps() {
    var role = "";
    try { role = ((w.Team && w.Team.current && w.Team.current()) || {}).role || ""; } catch (e) { }
    /* أسوأ حالة: ٤ محامين × ٥٠٠٠ + جهازين مدير × ١٢٠٠٠ = ٤٤ ألف < ٥٠ ألف (حصة Spark).
       ٥٠٠٠ للمحامي تكفي أول تحميل كامل لجهاز جديد (~٣٨٠٠: القضايا + الموكلين). */
    return role === "owner" ? { r: 12000, w: 6000 } : { r: 5000, w: 400 };
  }
  function budgetRead() {
    var b = null;
    try { b = JSON.parse(localStorage.getItem(BUDGET_KEY)); } catch (e) { }
    if (!b || b.day !== quotaDay()) b = { day: quotaDay(), r: 0, w: 0 };
    return b;
  }
  function budgetSave(b) { try { localStorage.setItem(BUDGET_KEY, JSON.stringify(b)); } catch (e) { } }
  /* الدخول والدور والدعوة لازم يفضلوا شغّالين حتى بعد السقف */
  function budgetExempt(url) { return /\/memberships\/|\/invites\/|\/offices\/[^\/]+(\/users\/[^\/?]+)?(\?|$)/.test(url); }
  function isWrite(method, url) { return method !== "GET" && !/:runQuery/.test(url); }
  function budgetWarn() {
    if (_bWarned) return; _bWarned = true;
    try {
      var d = document.createElement("div");
      d.textContent = "⏸ الجهاز ده وصل للحد اليومي للمزامنة مع السحابة — شغلك محفوظ عليه، وهيترفع ويتحدّث لوحده بكرة الساعة ١٠ الصبح.";
      d.style.cssText = "position:fixed;left:12px;right:12px;bottom:84px;z-index:10050;background:#8c1d18;color:#fff;" +
        "padding:12px 14px;border-radius:10px;font-size:14px;line-height:1.7;direction:rtl;text-align:center;box-shadow:0 4px 16px rgba(0,0,0,.25)";
      d.onclick = function () { d.remove(); };
      (document.body || document.documentElement).appendChild(d);
      setTimeout(function () { try { d.remove(); } catch (e) { } }, 12000);
    } catch (e) { }
  }
  function budgetCount(method, url, r) {
    var b = budgetRead();
    /* العدّ لكل مجموعة: علشان لو الحد اتعدّى نعرف راح فين (CloudStore.budget().by) */
    var coll = (String(url).match(/\/records\/([^\/?]+)/) || [])[1] || "other";
    b.by = b.by || {};
    if (isWrite(method, url)) { b.w += 1; b.by[coll + ".w"] = (b.by[coll + ".w"] || 0) + 1; }
    else {
      var n = 1, d = r && r.data;
      if (Array.isArray(d)) n = Math.max(1, d.filter(function (x) { return x && x.document; }).length);
      else if (typeof d === "string" && /:runQuery/.test(url)) n = Math.max(1, (d.match(/"document"/g) || []).length);
      else if (d && d.documents) n = Math.max(1, d.documents.length);
      b.r += n;
      b.by[coll + ".r"] = (b.by[coll + ".r"] || 0) + n;
    }
    budgetSave(b);
  }
  function rawAuthedRequest(method, url, body) {
    return new Promise(function (resolve, reject) {
      w.Auth.idToken(function (tok) {
        if (!tok) { reject(new Error("لا يوجد تسجيل دخول")); return; }
        w.FirebaseREST.request(method, url, body, { "Authorization": "Bearer " + tok })
          .then(resolve).catch(reject);
      });
    });
  }
  function authedRequest(method, url, body) {
    if (!budgetExempt(url)) {
      var b = budgetRead(), cap = budgetCaps();
      if (isWrite(method, url) ? b.w >= cap.w : b.r >= cap.r) {
        budgetWarn();
        return Promise.resolve({ ok: false, status: 0, budget: true, data: null });
      }
    }
    return rawAuthedRequest(method, url, body).then(function (r) {
      if (!budgetExempt(url)) budgetCount(method, url, r);
      return r;
    });
  }

  function projectUrl() {
    return "https://firestore.googleapis.com/v1/projects/" +
      w.FirebaseREST.config.projectId + "/databases/(default)/documents";
  }
  function officeUrl() { return projectUrl() + "/offices/" + encodeURIComponent(officeId); }
  function recordsUrl(screenId) {
    return officeUrl() + "/records/" + encodeURIComponent(screenId) + "/items";
  }
  function recordDocUrl(screenId, itemId) {
    return recordsUrl(screenId) + "/" + encodeURIComponent(itemId);
  }

  /* -------------------------------------------------------- تحديد المكتب */

  /**
   * كل مستخدم مسجَّل له مستند /memberships/{uid} => {officeId}. هذا يسمح
   * بمعرفة مكتب المستخدم دون الحاجة لصلاحيات Admin SDK (custom claims) —
   * القراءة مسموحة فقط لصاحب الـ uid نفسه (انظر firestore.rules).
   * أول تسجيل دخول لمستخدم بلا membership: يُنشأ له مكتب جديد تلقائياً
   * ويُعيَّن owner (سيناريو "أول استخدام" لصاحب المشروع نفسه).
   */
  function resolveOffice(uid, done) {
    var url = projectUrl() + "/memberships/" + encodeURIComponent(uid);
    authedRequest("GET", url, null).then(function (r) {
      if (r.ok && r.data && r.data.fields && r.data.fields.officeId) {
        var mine = r.data.fields.officeId.stringValue;
        /* محامي فتح التطبيق قبل ما تتكتب دعوته، فاتعمله «مكتب فاضي» باسمه
           (office_<uid>) ومن ساعتها بيدخل عليه وما بيشوفش مكتب الفريق. لو
           دلوقتي فيه دعوة بإيميله لمكتب تاني: ننقله لمكتب الدعوة. */
        if (mine === "office_" + uid.slice(0, 12)) { switchToInvitedOffice(uid, mine, done); return; }
        officeId = mine;
        done(officeId);
        return;
      }
      joinFromInviteOrBootstrap(uid, done);
    }).catch(function () { done(null); });
  }

  function switchToInvitedOffice(uid, own, done) {
    w.Auth.whenKnown(function (user) {
      var email = user && user.email && String(user.email).toLowerCase();
      if (!email) { officeId = own; done(own); return; }
      authedRequest("GET", projectUrl() + "/invites/" + encodeURIComponent(email), null)
        .then(function (r) {
          var f = r && r.ok && r.data && r.data.fields;
          var inv = f && f.officeId && f.officeId.stringValue;
          if (!inv || inv === own) { officeId = own; done(own); return; }
          joinOffice(uid, inv, inviteInfo(f), email, function (oid) {
            if (oid) { done(oid); return; }
            officeId = own; done(own);
          });
        })
        .catch(function () { officeId = own; done(own); });
    });
  }

  /** لا عضوية بعد: يبحث عن دعوة بريده (كتبها owner مسبقاً)، وإلا ينشئ
      مكتباً جديداً له (أول استخدام مطلق لصاحب المشروع). */
  /* نسخة المحامين ما بتعملش مكتب جديد أبداً: المحامي لازم يدخل بدعوة من
     المدير. وفي أي نسخة، المكتب الجديد بيتعمل بس لما Firestore يقول صراحةً
     «مفيش دعوة» (404) — أي خطأ شبكة عابر كان بيعمل للمحامي مكتب لوحده
     ويخليه مديره (حادثة 2026-10). */
  function isClean() {
    if (w.HAMLF_CLEAN) return true;
    try { return !!(w.AndroidUpdater && w.AndroidUpdater.isClean && w.AndroidUpdater.isClean()); }
    catch (e) { return false; }
  }
  /* مكتب جديد بيتعمل بس لإيميل صاحب المكتب. أي حد تاني من غير دعوة ما يبقاش «مدير» لمكتب
     فاضي باسمه (حادثة 2026-10-05: محامين على نسخة المكتب بقوا مديرين). */
  var OWNER_EMAILS = ["hamlfteam@gmail.com"];
  function mayBootstrap(email) {
    return !isClean() && OWNER_EMAILS.indexOf(String(email || "").toLowerCase().trim()) >= 0;
  }
  function joinFromInviteOrBootstrap(uid, done) {
    w.Auth.whenKnown(function (user) {
      var email = user && user.email;
      if (!email) { done(null); return; }
      authedRequest("GET", projectUrl() + "/invites/" + encodeURIComponent(email), null)
        .then(function (r) {
          var f = r.ok && r.data && r.data.fields;
          var inviteOffice = f && f.officeId && f.officeId.stringValue;
          if (inviteOffice) {
            joinOffice(uid, inviteOffice, inviteInfo(f), email, done);
            return;
          }
          if (r.status === 404 && mayBootstrap(email)) { bootstrapOwnerOffice(uid, done); return; }
          done(null);
        })
        .catch(function () { done(null); });
    });
  }

  /* الدور يؤخذ من الدعوة حصراً — لا دور افتراضي: دعوة بلا دور (أو بدور owner/client) مرفوضة. */
  function inviteInfo(f) {
    var role = (f.role && f.role.stringValue) || "";
    if (!role || role === "owner" || role === "client" || role === "none") role = "";
    return { role: role, name: (f.name && f.name.stringValue) || "" };
  }
  /* مفتاح التليفون (آخر ٩ أرقام) اللي كتبه العضو في شاشة «أول مرة» — بيتحفظ مؤقتاً لو حسابه كان موجود قبل
     كده وربطه بالمكتب اتأجّل لحد أول دخول. السيرفر يقارنه بسرّ الدعوة (inviteSecrets) قبل ما يقبل العضوية. */
  var CLAIM_KEY = "proflawyer.claim.v1";
  function claimPhoneKey(email) {
    try {
      var c = JSON.parse(localStorage.getItem(CLAIM_KEY));
      return c && c.email === String(email || "").toLowerCase() ? String(c.phoneKey || "") : "";
    } catch (e) { return ""; }
  }

  function joinOffice(uid, oid, inv, email, done) {
    if (!inv || !inv.role) { done(null); return; }   /* fail-closed: لا انضمام بدور غير محدَّد في الدعوة */
    var phoneKey = claimPhoneKey(email);
    if (!phoneKey) { done(null); return; }
    var userDoc = { fields: {
      role: { stringValue: inv.role }, active: { booleanValue: true },
      email: { stringValue: String(email || "").toLowerCase() }, name: { stringValue: inv.name || "" },
      phoneKey: { stringValue: phoneKey }
    } };
    authedRequest("PATCH",
      projectUrl() + "/offices/" + encodeURIComponent(oid) + "/users/" + encodeURIComponent(uid), userDoc)
      .then(function (r0) {
        if (!r0.ok) throw new Error("join-denied");
        var membership = { fields: { officeId: { stringValue: oid } } };
        return authedRequest("PATCH", projectUrl() + "/memberships/" + encodeURIComponent(uid), membership);
      })
      .then(function () {
        /* تنظيف الدعوة بعد استهلاكها — لا يمنع الفشل هنا نجاح الانضمام */
        authedRequest("DELETE", projectUrl() + "/invites/" + encodeURIComponent(String(email).toLowerCase()), null).catch(function () { });
        try { localStorage.removeItem(CLAIM_KEY); } catch (e) { }
        officeId = oid;
        done(oid);
      })
      .catch(function () { done(null); });
  }

  /** أول تشغيل مطلق: ينشئ مكتب صاحب المشروع (بلا قيود باقة) ويسجّله owner. */
  function bootstrapOwnerOffice(uid, done) {
    var newOfficeId = "office_" + uid.slice(0, 12);
    var office = { fields: {
      name: { stringValue: "مكتبي" },
      ownerId: { stringValue: uid },
      plan: { stringValue: "owner_unlimited" }
    } };
    authedRequest("PATCH", projectUrl() + "/offices/" + encodeURIComponent(newOfficeId), office)
      .then(function () {
        var userDoc = { fields: {
          role: { stringValue: "owner" }, active: { booleanValue: true }
        } };
        return authedRequest("PATCH",
          projectUrl() + "/offices/" + encodeURIComponent(newOfficeId) + "/users/" + encodeURIComponent(uid),
          userDoc);
      })
      .then(function () {
        var membership = { fields: { officeId: { stringValue: newOfficeId } } };
        return authedRequest("PATCH", projectUrl() + "/memberships/" + encodeURIComponent(uid), membership);
      })
      .then(function () { officeId = newOfficeId; done(officeId); })
      .catch(function () { done(null); });
  }

  /* فهرس بريد البوابة: portalEmails/{email} — مستند صغير عام القراءة (get فقط) يقول لبوابة الموكلين قبل تسجيل الدخول:
     هل هذا البريد موكل عندنا؟ (ids/pending = معرّفات سجلاته، linked = ربط حسابه، foreign = أجنبي). لا أسماء ولا بيانات — فتُقفل قراءة سجلات الموكلين نفسها. */
  function piUrl(email) { return projectUrl() + "/portalEmails/" + encodeURIComponent(email); }
  /* updateMask: بيكتب حقول الموكل بس، فما يمسحش علامة «محامي متعاون» (collab)
     لو نفس الإيميل متسجّل كموكل وكمتعاون، والعكس في markCollab. */
  var PI_MASK = "?updateMask.fieldPaths=ids&updateMask.fieldPaths=pending&updateMask.fieldPaths=linked" +
    "&updateMask.fieldPaths=foreign&updateMask.fieldPaths=updatedAt";
  function piMarkCollab(email) {
    return authedRequest("PATCH", piUrl(email) + "?updateMask.fieldPaths=collab&updateMask.fieldPaths=updatedAt",
      { fields: { collab: { booleanValue: true }, updatedAt: { timestampValue: new Date().toISOString() } } });
  }
  function piPut(email, o) {
    var arr = function (a) { return { arrayValue: { values: (a || []).map(function (x) { return { stringValue: String(x) }; }) } }; };
    return authedRequest("PATCH", piUrl(email) + PI_MASK, { fields: {
      ids: arr(o.ids), pending: arr(o.pending), linked: { booleanValue: !!o.linked }, foreign: { booleanValue: !!o.foreign },
      updatedAt: { timestampValue: new Date().toISOString() } } });
  }
  function piDel(email) { return authedRequest("DELETE", piUrl(email), null); }

  function whenReady(cb) {
    if (ready) { cb(!!officeId); return; }
    readyWaiters.push(cb);
  }

  /* باگ حقيقي كان هنا: لو أول طلب شبكة (memberships/{uid}) فشل لأي سبب عابر
     (تقطيعة إنترنت لحظة فتح الصفحة)، كان officeId يفضل null و`ready=true`
     إلى الأبد — فكل مزامنة سحابية في هذه الصفحة (بما فيها "إرسال التطبيق"
     ودعوات المحامين) تفشل بصمت بلا أي إعادة محاولة، حتى لو رجع الإنترنت
     فوراً. الحل: عند الفشل، نعيد المحاولة بضع مرات (تأخير متزايد) قبل ما
     نستسلم فعلاً ونُعلِم كل من ينتظر. */
  var initAttempts = 0;
  function init() {
    if (!w.FirebaseREST || !w.FirebaseREST.available() || !w.Auth) return;
    w.Auth.whenKnown(function (user) {
      if (!user) { ready = true; readyWaiters.forEach(function (cb) { cb(false); }); readyWaiters = []; return; }
      resolveOffice(user.uid, function (oid) {
        if (!oid && initAttempts < 5) {
          initAttempts++;
          setTimeout(init, Math.min(2000 * initAttempts, 8000));
          return;
        }
        ready = true;
        readyWaiters.forEach(function (cb) { cb(!!oid); });
        readyWaiters = [];
        if (oid) scheduleRetry(3000);   // فرصة تصريف أي عنصر معلَّق من جلسة سابقة
      });
    });
  }

  /* --------------------------------------------------- تحويل قيم Firestore */

  function toFsValue(js) {
    if (js == null) return { nullValue: null };
    if (typeof js === "boolean") return { booleanValue: js };
    if (typeof js === "number") return { doubleValue: js };
    return { stringValue: typeof js === "string" ? js : JSON.stringify(js) };
  }

  function recToFirestore(rec, ownerUid) {
    return { fields: {
      v: { stringValue: JSON.stringify(rec.v || []) },
      rep: { stringValue: JSON.stringify(rec.rep || {}) },
      _id: { stringValue: rec._id },
      _at: { stringValue: rec._at || new Date().toISOString() },
      owner: { stringValue: ownerUid || "" },
      scope: { stringValue: rec.scope || "office" }
    } };
  }

  function recFromFirestore(doc) {
    var f = doc.fields || {};
    function s(k) { return f[k] && f[k].stringValue; }
    var v = []; try { v = JSON.parse(s("v") || "[]"); } catch (e) { }
    var rep = {}; try { rep = JSON.parse(s("rep") || "{}"); } catch (e) { }
    return { _id: s("_id"), _at: s("_at"), v: v, rep: rep, owner: s("owner"), scope: s("scope") };
  }

  /* --------------------------------------------------- قائمة انتظار الإعادة

     أي حفظ/حذف يفشل بسبب الشبكة (لا خطأ صلاحيات — ذاك لا فائدة من إعادته)
     يُحفظ هنا محلياً (يبقى حتى لو أُغلق التطبيق) ويُعاد تلقائياً كل بضع
     ثوانٍ وعند كل نجاح اتصال جديد، بدل أن يبقى معلَّقاً حتى تعديل آخر يدوي
     على نفس السجل. مفتاح كل عنصر (kind:collection:id) يضمن الاحتفاظ بآخر
     نسخة فقط لو تكرّر فشل نفس السجل أكثر من مرة (لا نعيد نُسخاً قديمة). */
  var QUEUE_KEY = "proflawyer.cloudqueue.v1";

  /* الطابور بيتقري مرة ويتحفظ مرة في آخر الدفعة: قبل كده كل إضافة كانت بتقرا
     وتكتب الطابور كله، فتعديل جماعي (تنظيف ١٦٠٠ قضية) والنت مقطوع كان بيكتب
     جيجات ويهنّج الجهاز. */
  var qCache = null, qTimer = null;
  function loadQueue() {
    if (qCache) return qCache;
    try { qCache = JSON.parse(localStorage.getItem(QUEUE_KEY)) || {}; }
    catch (e) { qCache = {}; }
    return qCache;
  }
  function persistQueue() {
    if (qTimer) { clearTimeout(qTimer); qTimer = null; }
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(qCache || {})); } catch (e) { }
  }
  function saveQueueMap(q) {
    qCache = q;
    if (!qTimer) qTimer = setTimeout(persistQueue, 0);
  }
  w.addEventListener("pagehide", function () { if (qTimer) persistQueue(); });
  w.addEventListener("visibilitychange", function () { if (document.hidden && qTimer) persistQueue(); });
  function enqueue(entry) {
    /* نسخة الكمبيوتر مالهاش سحابة: من غيرها الطابور كان هيكبر بنسخة من كل سجل يتعدّل */
    if (w.HAMLF_PC) return;
    var q = loadQueue();
    q[entry.key] = entry;
    saveQueueMap(q);
    scheduleRetry(4000);
  }
  function dequeue(key) {
    var q = loadQueue();
    if (q[key]) { delete q[key]; saveQueueMap(q); }
  }

  /* إعادة الرفع: كان الطابور كله بيتعاد كل ٢٠ ثانية حتى لو الحد اليومي خلص أو السيرفر
     بيرفض، فكل محاولة فاشلة كانت بتتحسب من الرصيد. دلوقتي ٢٥ سجل في المرة، والفشل
     بيضاعف الانتظار لحد ١٠ دقايق، ولما الحد يخلص الطابور بيستنى. */
  var QUEUE_BATCH = 25, RETRY_MIN = 20000, RETRY_MAX = 10 * 60000, retryGap = RETRY_MIN;
  function overBudget() {
    var b = budgetRead(), c = budgetCaps();
    return b.w >= c.w || b.r >= c.r;
  }
  var retryTimer = null, flushing = false;
  function scheduleRetry(delay) {
    if (retryTimer) return;
    retryTimer = setTimeout(function () { retryTimer = null; flushQueue(); }, delay || 20000);
  }

  /* دمج معلّق (نسخة ١٫٥١): بدل ما الطابور يعيد رفع القضية كاملة، بيعيد «التغييرات» بس
     عن طريق الدالة اللي سجّلتها شاشة القضايا (CloudStore.onMerge). */
  var mergeHandlers = {};
  function performQueued(e, done) {
    if (e.kind === "merge") {
      var h = mergeHandlers[e.collection];
      if (!h) { done(false); return; }
      h(e.id, e.ops, e.meta || null, done);
      return;
    }
    if (e.kind === "record") {
      if (e.op === "save") rawSaveRecord(e.collection, e.payload, done);
      else rawDeleteRecord(e.collection, e.id, done);
    } else {
      if (e.op === "save") rawSaveJson(e.collection, e.id, e.payload, done);
      else rawRemoveJson(e.collection, e.id, done);
    }
  }

  function flushQueue() {
    if (flushing) return;
    var q = loadQueue();
    var keys = Object.keys(q);
    if (!keys.length) return;
    if (overBudget()) { scheduleRetry(RETRY_MAX); return; }
    flushing = true;
    keys = keys.slice(0, QUEUE_BATCH);
    var left = keys.length, failed = 0;
    keys.forEach(function (key) {
      performQueued(q[key], function (ok, status) {
        if (ok || status === 403) dequeue(key);   /* 403 = السيرفر رفض الصلاحية: لا نعيد المحاولة للأبد */
        else failed++;
        left--;
        if (left <= 0) {
          flushing = false;
          retryGap = failed ? Math.min(retryGap * 2, RETRY_MAX) : RETRY_MIN;
          if (Object.keys(loadQueue()).length) scheduleRetry(failed ? retryGap : 1500);
        }
      });
    });
  }
  /* شبكة أو تسجيل دخول عادا فجأة (مثلاً بعد فتح التطبيق) — حاول فوراً بدل
     انتظار المؤقّت الدوري. */
  w.addEventListener("online", function () { scheduleRetry(1000); });

  /* -------------------------------------------------------- واجهة السجلات */

  /** Firestore REST يفرض سقفاً على عدد المستندات في كل صفحة (٣٠٠ ظهر عملياً
      مهما كان pageSize المطلوب أعلى)، ويعيد nextPageToken لو تبقّى المزيد.
      كل نداءات القراءة الجماعية (records/collection) كانت تأخذ الصفحة
      الأولى فقط وتتجاهل الباقي بصمت — فأي مجموعة (قضايا/موكلين) أكبر من
      ٣٠٠ سجل كانت تصل جزئياً فقط لأي قارئ سحابي (بوابة الموقع تحديداً،
      وأي جهاز مكتب يعيد المزامنة من الصفر). هذه الدالة تجمع كل الصفحات. */
  function fetchAllPages(baseUrl, done) {
    var all = [];
    function next(pageToken) {
      var url = baseUrl + "?pageSize=1000" + (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "");
      authedRequest("GET", url, null).then(function (r) {
        if (!r.ok) { done(r.ok && all.length ? { ok: true, docs: all } : { ok: false }); return; }
        var docs = (r.data && r.data.documents) || [];
        all = all.concat(docs);
        if (r.data && r.data.nextPageToken) next(r.data.nextPageToken);
        else done({ ok: true, docs: all });
      }).catch(function () { done({ ok: all.length > 0, docs: all }); });
    }
    next(null);
  }

  /** يعيد كل سجلات شاشة معيّنة، أو null لو تعذّر الاتصال (استخدم النسخة المحلية). */
  function listRecords(screenId, done) {
    whenReady(function (ok) {
      if (!ok) { done(null); return; }
      fetchAllPages(recordsUrl(screenId), function (r) {
        if (!r.ok) { done(null); return; }
        scheduleRetry(1000);   // نجح الاتصال — فرصة جيدة لتصريف أي عنصر معلَّق
        done(r.docs.map(recFromFirestore));
      });
    });
  }

  function rawSaveRecord(screenId, rec, done) {
    whenReady(function (ok) {
      if (!ok) { done && done(false); return; }
      w.Auth.whenKnown(function (user) {
        authedRequest("PATCH", recordDocUrl(screenId, rec._id), recToFirestore(rec, user && user.uid))
          .then(function (r) { done && done(r.ok, r.status); })
          .catch(function () { done && done(false); });
      });
    });
  }
  /** فحص الصلاحية قبل الكتابة (تسهيل للمستخدم — السيرفر هو اللي يفرض فعلياً في firestore.rules). */
  function writeAllowed(coll) {
    return !!(w.Team && Team.canWriteCollection && Team.canWriteCollection(coll));
  }
  function saveRecord(screenId, rec, done) {
    if (!writeAllowed(screenId)) { done && done(false); return; }
    auditBefore("record", screenId, rec._id, rec);
    rawSaveRecord(screenId, rec, function (ok, status) {
      if (!ok && status !== 403) enqueue({ key: "rec:" + screenId + ":" + rec._id, kind: "record", op: "save",
        collection: screenId, id: rec._id, payload: rec });
      done && done(ok);
    });
  }

  function rawDeleteRecord(screenId, itemId, done) {
    whenReady(function (ok) {
      if (!ok) { done && done(false); return; }
      authedRequest("DELETE", recordDocUrl(screenId, itemId), null)
        .then(function (r) { done && done(r.ok, r.status); })
        .catch(function () { done && done(false); });
    });
  }
  function deleteRecord(screenId, itemId, done) {
    if (deleteBlocked("record", screenId, itemId)) { done && done(false); return; }
    rawDeleteRecord(screenId, itemId, function (ok) {
      if (!ok) enqueue({ key: "rec:" + screenId + ":" + itemId, kind: "record", op: "remove",
        collection: screenId, id: itemId });
      done && done(ok);
    });
  }

  /* ------------------------------------------------- مجموعات JSON عامة

     records.* أعلاه تفترض شكل data.js تحديداً ({v, rep}). لمخازن أخرى
     بشكلها الخاص (مثل قضايا case-file.js — كل قضية كائن كامل بجلساته
     وأطرافه ومهامها الإدارية) نحتاج تخزين الكائن كاملاً كـJSON مرن، بنفس
     مسار Firestore (records/{collectionId}/items/{id}) — فتبقى قواعد
     الأمان (firestore.rules) سارية بلا تعديل، لأنها تفحص فقط حقل owner
     الظاهر على مستوى المستند، بصرف النظر عن شكل الحقول الأخرى داخله. */

  /* حقول وصول العميل (clientUid/clientUids/matchEmails) تُرفَع لمستوى
     المستند نفسه (لا تبقى مدفونة داخل نص json) لأن قواعد الأمان
     (firestore.rules) لا تقدر تقرأ داخل نص JSON — لازم تكون حقولاً ظاهرة
     على مستند Firestore نفسه لتُستعمل في allow read/update. راجع
     [[feedback_client_portal_access]]. */
  function toFsJson(obj, ownerUid) {
    var fields = {
      json: { stringValue: JSON.stringify(obj) },
      owner: { stringValue: ownerUid || "" },
      updatedAt: { timestampValue: new Date().toISOString() }
    };
    if (typeof obj.clientUid === "string" && obj.clientUid) {
      fields.clientUid = { stringValue: obj.clientUid };
    }
    if (Array.isArray(obj.clientUids) && obj.clientUids.length) {
      fields.clientUids = { arrayValue: { values: obj.clientUids.map(function (u) {
        return { stringValue: String(u) };
      }) } };
    }
    /* محامون متعاونون على قضية بعينها — قواعد الأمان بتسمح لهم يقروها بس */
    if (Array.isArray(obj.collabEmails) && obj.collabEmails.length) {
      fields.collabEmails = { arrayValue: { values: obj.collabEmails.map(function (e) {
        return { stringValue: String(e).toLowerCase().trim() };
      }) } };
    }
    if (Array.isArray(obj.matchEmails) && obj.matchEmails.length) {
      fields.matchEmails = { arrayValue: { values: obj.matchEmails.map(function (e) {
        return { stringValue: String(e).toLowerCase().trim() };
      }) } };
    }
    return { fields: fields };
  }
  function fromFsJson(doc) {
    var f = doc.fields || {};
    var obj = {};
    try { obj = JSON.parse((f.json && f.json.stringValue) || "{}"); } catch (e) { }
    obj.__owner = f.owner && f.owner.stringValue;
    /* وقت آخر تعديل على السحابة — الحفظ الجاي بيشترطه، فلو محدش عدّل في النص
       الرفع بيتم من غير ما نقرا القضية تاني (اقتراح المستخدم ٧-١٠: «اشتغل محلي
       وارفع التعديلات بس»). */
    if (doc.updateTime) obj.__ut = doc.updateTime;
    /* حقول الربط (clientUid/clientUids) تُدمَج هنا من مستوى المستند —
       عميل يطالب بحسابه (claimClientUid) يكتبها كحقل ظاهر بلا لمس نص
       json، فلازم تُقرأ من هنا لترجع لنسخة الموكل المحلية، وإلا فقدها
       أول push تالٍ من جهاز المكتب (الذي لا يعرف عنها شيئاً محلياً). */
    if (f.clientUid && f.clientUid.stringValue) obj.clientUid = f.clientUid.stringValue;
    if (f.clientUids && f.clientUids.arrayValue && f.clientUids.arrayValue.values) {
      obj.clientUids = f.clientUids.arrayValue.values.map(function (v) { return v.stringValue; });
    }
    return obj;
  }

  function listJson(collectionId, done) {
    whenReady(function (ok) {
      if (!ok) { done(null); return; }
      fetchAllPages(recordsUrl(collectionId), function (r) {
        if (!r.ok) { done(null); return; }
        scheduleRetry(1000);
        done(r.docs.map(fromFsJson));
      });
    });
  }

  /** السجلات اللي اتعدّلت بعد sinceIso بس (حقل updatedAt) — كل مستند راجع =
      قراءة واحدة، فبدل ~٤٣٠٠ قراءة في كل مزامنة كاملة بتبقى عشرات. withLinked:
      يضيف كمان الموكلين اللي ربطوا حسابهم على البوابة (clientUid)، لأن الربط
      بيتكتب لوحده من البوابة من غير ما يغيّر updatedAt. */
  function runQuery(collectionId, where, done) {
    var url = officeUrl() + "/records/" + encodeURIComponent(collectionId) + ":runQuery";
    authedRequest("POST", url, { structuredQuery: { from: [{ collectionId: "items" }], where: where } })
      .then(function (r) {
        if (!r.ok) { done(null); return; }
        var rows = r.data;
        if (typeof rows === "string") { try { rows = JSON.parse(rows); } catch (e) { rows = []; } }
        done((Array.isArray(rows) ? rows : []).filter(function (x) { return x && x.document; })
          .map(function (x) { return x.document; }));
      }).catch(function () { done(null); });
  }
  function listJsonChanged(collectionId, sinceIso, withLinked, done) {
    whenReady(function (ok) {
      if (!ok) { done(null); return; }
      runQuery(collectionId, { fieldFilter: { field: { fieldPath: "updatedAt" }, op: "GREATER_THAN",
        value: { timestampValue: sinceIso } } }, function (changed) {
        if (changed === null) { done(null); return; }
        if (!withLinked) { scheduleRetry(1000); done(changed.map(fromFsJson)); return; }
        runQuery(collectionId, { fieldFilter: { field: { fieldPath: "clientUid" }, op: "GREATER_THAN",
          value: { stringValue: "" } } }, function (linked) {
          if (linked === null) { done(null); return; }
          var seen = {}, all = [];
          changed.concat(linked).forEach(function (d) { if (!seen[d.name]) { seen[d.name] = 1; all.push(d); } });
          scheduleRetry(1000);
          done(all.map(fromFsJson));
        });
      });
    });
  }

  /* updateMask بالحقول اللي الجهاز بيكتبها فعلاً: من غيره الـPATCH كان بيستبدل
     المستند كله، فلو الموكل ربط حسابه على البوابة (clientUid) والجهاز لسه
     ما عرفش، أول حفظة من المكتب كانت بتمسح الربط. clientUid بيدخل في القناع
     بس لو الجهاز عارفه؛ مسحه المقصود عن طريق resetClientUid. */
  function jsonSaveUrl(collectionId, id, obj) {
    var paths = ["json", "owner", "updatedAt", "clientUids", "matchEmails", "collabEmails"];
    if (typeof obj.clientUid === "string" && obj.clientUid) paths.push("clientUid");
    return recordDocUrl(collectionId, id) + "?" +
      paths.map(function (p) { return "updateMask.fieldPaths=" + p; }).join("&");
  }

  function rawSaveJson(collectionId, id, obj, done) {
    whenReady(function (ok) {
      if (!ok) { done && done(false); return; }
      w.Auth.whenKnown(function (user) {
        authedRequest("PATCH", jsonSaveUrl(collectionId, id, obj), toFsJson(obj, user && user.uid))
          .then(function (r) { done && done(r.ok, r.status); })
          .catch(function () { done && done(false); });
      });
    });
  }
  /** مستند واحد بنسخته على السحابة + وقت آخر تعديل (للحفظ المشروط). obj=null لو مش موجود. */
  function getJson(collectionId, id, done) {
    whenReady(function (ok) {
      if (!ok) { done({ ok: false }); return; }
      authedRequest("GET", recordDocUrl(collectionId, id), null).then(function (r) {
        if (r.status === 404) { done({ ok: true, obj: null, updateTime: null }); return; }
        if (!r.ok || !r.data || !r.data.fields) { done({ ok: false, status: r.status, budget: !!r.budget }); return; }
        done({ ok: true, obj: fromFsJson(r.data), updateTime: r.data.updateTime });
      }).catch(function () { done({ ok: false }); });
    });
  }
  /** حفظ مشروط: بينجح بس لو المستند ما اتغيّرش من وقت ما اتقرا (updateTime)، أو مش
      موجود أصلاً (updateTime=null). لو جهاز تاني حفظ في النص ← conflict ونعيد الدمج. */
  function saveJsonIf(collectionId, id, obj, updateTime, done) {
    whenReady(function (ok) {
      if (!ok) { done({ ok: false }); return; }
      w.Auth.whenKnown(function (user) {
        var url = jsonSaveUrl(collectionId, id, obj) + (updateTime
          ? "&currentDocument.updateTime=" + encodeURIComponent(updateTime)
          : "&currentDocument.exists=false");
        authedRequest("PATCH", url, toFsJson(obj, user && user.uid)).then(function (r) {
          var txt = ""; try { txt = JSON.stringify(r.data || ""); } catch (e) { }
          done({ ok: !!r.ok, status: r.status, budget: !!r.budget, updateTime: r.ok && r.data && r.data.updateTime,
                 conflict: !r.ok && /PRECONDITION|ALREADY_EXISTS|NOT_FOUND/i.test(txt) });
        }).catch(function () { done({ ok: false }); });
      });
    });
  }
  /** يكتب خانة clientUids بس (ربط البوابة) — من غير ما يلمس نص القضية ولا updatedAt،
      فما يمسحش تعديلات حد ولا يخلّي باقي الأجهزة تقرا القضية تاني. */
  function setClientUids(collectionId, id, uids, done) {
    whenReady(function (ok) {
      if (!ok) { done && done(false); return; }
      var body = { fields: {} };
      if (uids && uids.length) body.fields.clientUids = { arrayValue: { values: uids.map(function (u) { return { stringValue: String(u) }; }) } };
      authedRequest("PATCH", recordDocUrl(collectionId, id) + "?updateMask.fieldPaths=clientUids&currentDocument.exists=true", body)
        .then(function (r) { done && done(!!r.ok); }).catch(function () { done && done(false); });
    });
  }
  function saveJson(collectionId, id, obj, done) {
    if (!writeAllowed(collectionId)) { done && done(false); return; }
    auditBefore("json", collectionId, id, obj);
    rawSaveJson(collectionId, id, obj, function (ok, status) {
      if (!ok && status !== 403) enqueue({ key: "json:" + collectionId + ":" + id, kind: "json", op: "save",
        collection: collectionId, id: id, payload: obj });
      done && done(ok);
    });
  }

  /* --------------------------------------------- الرواتب والحوافز (خاص)
     مسار منفصل عن records عمداً: قواعد الأمان بتفتح records/* لكل الفريق،
     لكن /offices/{id}/payroll/* للمالك والمحاسب بس (راجع firestore.rules). */
  function payrollUrl(id) {
    return officeUrl() + "/payroll" + (id ? "/" + encodeURIComponent(id) : "");
  }
  function payrollList(done) {
    whenReady(function (ok) {
      if (!ok) { done(null); return; }
      fetchAllPages(payrollUrl(), function (r) {
        done(r.ok ? r.docs.map(fromFsJson) : null);
      });
    });
  }
  function payrollSave(id, obj, done) {
    whenReady(function (ok) {
      if (!ok) { done && done(false); return; }
      authedRequest("PATCH", payrollUrl(id), { fields: {
        json: { stringValue: JSON.stringify(obj) },
        updatedAt: { timestampValue: new Date().toISOString() }
      } }).then(function (r) { done && done(r.ok); })
        .catch(function () { done && done(false); });
    });
  }

  function rawRemoveJson(collectionId, id, done) {
    whenReady(function (ok) {
      if (!ok) { done && done(false); return; }
      authedRequest("DELETE", recordDocUrl(collectionId, id), null)
        .then(function (r) { done && done(r.ok, r.status); })
        .catch(function () { done && done(false); });
    });
  }
  /* ١٫٥١: الحذف بيسيب «علامة حذف» صغيرة في records/deleted — باقي الأجهزة بتعرف
     إن القضية/الموكل اتمسح من غير ما تقرا كل القضايا (المزامنة الكاملة بقت كل ٣٠ يوم). */
  var TOMB = { cases: 1, clients: 1, regs: 1 };
  function removeJson(collectionId, id, done) {
    if (deleteBlocked("json", collectionId, id)) { done && done(false); return; }
    if (TOMB[collectionId]) saveJson("deleted", collectionId + "_" + id, { coll: collectionId, id: id, at: new Date().toISOString() });
    rawRemoveJson(collectionId, id, function (ok) {
      if (!ok) enqueue({ key: "json:" + collectionId + ":" + id, kind: "json", op: "remove",
        collection: collectionId, id: id });
      done && done(ok);
    });
  }

  /** يكتب حقل clientUid فقط (updateMask) على مستند موكل — أول مرة يفتح
      فيها موكل بوابته بحساب فعلاً مطابق بريده لبيانات هذا الموكل، فيربط
      حسابه بسجله من جهازه هو، بلا حاجة لموظف المكتب. قواعد الأمان تتحقق
      بنفسها من تطابق البريد ومن أن الحقل غير مربوط بأحد قبله — راجع
      firestore.rules. لا يلمس أي حقل آخر بالمستند. */
  function claimClientUid(collectionId, id, uid, done) {
    whenReady(function (ok) {
      if (!ok) { done && done(false); return; }
      var url = recordDocUrl(collectionId, id) + "?updateMask.fieldPaths=clientUid";
      authedRequest("PATCH", url, { fields: { clientUid: { stringValue: uid } } })
        .then(function (r) { done && done(r.ok); })
        .catch(function () { done && done(false); });
    });
  }

  /** يمسح ربط حساب البوابة (clientUid) عن مستند موكل — يستخدمه المكتب لو
      الموكل غيّر بريده أو ضاع دخوله على حسابه القديم، فيقدر يعمل "أول
      مرة" تاني ببريده الجديد. نفس أسلوب claimClientUid بالضبط لكن بحقل
      فارغ (updateMask بلا fields يمسح الحقل من المستند). لا يلمس أي حقل
      آخر — بيانات القضايا/التوكيلات وغيرها تبقى كما هي. */
  function resetClientUid(collectionId, id, done) {
    whenReady(function (ok) {
      if (!ok) { done && done(false); return; }
      var url = recordDocUrl(collectionId, id) + "?updateMask.fieldPaths=clientUid";
      authedRequest("PATCH", url, { fields: {} })
        .then(function (r) { done && done(r.ok); })
        .catch(function () { done && done(false); });
    });
  }

  /* ------------------------------------------- سجل التعديلات + منع الحذف
     طلب المدير (٢-١٠-٢٠٢٦): أي تعديل من غير المدير يتسجّل في records/audit
     (مين، إمتى، الخانة، كانت إيه وبقت إيه)، والحذف ممنوع على غير المدير —
     ما بيوصلش للسحابة وبيتسجّل كمحاولة حذف. المدير نفسه ما بيتسجّلش. */
  var AUDIT = "audit";
  var AUDIT_SKIP = { updatedAt: 1, noteLog: 1, autoTaskKeys: 1, clientUids: 1, matchEmails: 1,
    collabEmails: 1, __owner: 1, _at: 1 };
  function actor() {
    try { return (w.Team && w.Team.current && w.Team.current()) || {}; } catch (e) { return {}; }
  }
  /* fail-closed: أي هوية غير المدير المؤكَّد (دور مجهول/فارغ/none) = مقيَّدة (لا حذف). */
  function isRestricted() { return actor().role !== "owner"; }
  function auditShort(v) {
    var s = v == null ? "" : (typeof v === "string" ? v : JSON.stringify(v));
    return s.length > 400 ? s.slice(0, 400) + "…" : s;
  }
  function auditDiff(a, b) {
    a = a || {}; b = b || {};
    var out = [], keys = {};
    Object.keys(a).concat(Object.keys(b)).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (k) {
      if (AUDIT_SKIP[k]) return;
      var x = a[k], y = b[k];
      if (JSON.stringify(x) === JSON.stringify(y)) return;
      if (k === "sessions" && Array.isArray(x) && Array.isArray(y)) {
        var mx = {}, my = {}, ds = {};
        x.forEach(function (s) { if (s && s.date) { mx[s.date] = s; ds[s.date] = 1; } });
        y.forEach(function (s) { if (s && s.date) { my[s.date] = s; ds[s.date] = 1; } });
        Object.keys(ds).sort().forEach(function (d) {
          if (JSON.stringify(mx[d]) === JSON.stringify(my[d])) return;
          out.push({ field: "جلسة " + d,
            before: mx[d] ? auditShort(mx[d].raw || mx[d]) : "— (جديدة)",
            after: my[d] ? auditShort(my[d].raw || my[d]) : "— (اتشالت)" });
        });
        return;
      }
      out.push({ field: k, before: auditShort(x), after: auditShort(y) });
    });
    return out;
  }
  function auditLabel(o) {
    o = o || {};
    return [o.fileNo && ("ملف " + o.fileNo),
      o.caseNo && ("دعوى " + o.caseNo + (o.caseYear ? "/" + o.caseYear : "")),
      o.name].filter(Boolean).join(" · ");
  }
  function writeAudit(entry) {
    var u = actor();
    entry.at = new Date().toISOString();
    entry.by = u.name || ""; entry.email = u.email || ""; entry.role = u.role || "";
    w.Auth.whenKnown(function (user) {
      entry.uid = (user && user.uid) || "";
      if (!entry.email && user && user.email) entry.email = user.email;
      var aid = "a" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
      rawSaveJson(AUDIT, aid, entry, function () { });
    });
  }
  /** قبل الحفظ: يقرا النسخة اللي على السحابة ويسجّل الفرق (لغير المدير بس). */
  function auditBefore(kind, coll, id, obj) {
    if (coll === AUDIT || coll === "edits" || coll === "devices" || coll === "deleted" || !isRestricted() || !id) return;
    whenReady(function (ok) {
      if (!ok) return;
      authedRequest("GET", recordDocUrl(coll, id), null).then(function (r) {
        var prev = (r && r.ok && r.data && r.data.fields)
          ? (kind === "record" ? recFromFirestore(r.data) : fromFsJson(r.data)) : null;
        var changes = kind === "record"
          ? (JSON.stringify(prev && prev.v) === JSON.stringify(obj && obj.v) ? []
              : [{ field: "بيانات الشاشة", before: auditShort(prev && prev.v), after: auditShort(obj && obj.v) }])
          : auditDiff(prev, obj);
        if (!changes.length) return;
        writeAudit({ op: prev ? "تعديل" : "إضافة", collection: coll, id: id,
          label: auditLabel(obj) || auditLabel(prev), changes: changes });
      }).catch(function () { });
    });
  }
  var _delWarned = 0;
  /** غير المدير ما يقدرش يحذف: نوقف الحذف ونسجّل المحاولة. */
  function deleteBlocked(kind, coll, id) {
    if (coll === AUDIT || !isRestricted()) return false;
    writeAudit({ op: "محاولة حذف (اتمنعت)", collection: coll, id: id, label: "", changes: [] });
    if (Date.now() - _delWarned > 5000) {
      _delWarned = Date.now();
      try { alert("الحذف مسموح لمدير المكتب بس — البيان فضل محفوظ عند المكتب، واتسجّلت المحاولة."); } catch (e) { }
    }
    return true;
  }

  /* وقت السيرفر الحقيقي (للحضور): بيكتب علامة صغيرة ويرجّع updateTime اللي السيرفر
     حطّها — مش ساعة الموبايل اللي ممكن تتقدّم أو تتأخر. null لو مفيش نت/دخول (مهلة ٨ ث). */
  function serverNow(done) {
    var fired = false;
    function fin(v) { if (fired) return; fired = true; done(v); }
    setTimeout(function () { fin(null); }, 8000);
    whenReady(function (ok) {
      if (!ok) { fin(null); return; }
      var uid = "";
      try { uid = (JSON.parse(localStorage.getItem("proflawyer.session.v1")) || {}).uid || ""; } catch (e) { }
      authedRequest("PATCH", recordDocUrl("attendance-stamps", uid || "anon"),
        { fields: { at: { timestampValue: new Date().toISOString() } } })
        .then(function (r) { fin(r.ok && r.data && r.data.updateTime ? r.data.updateTime : null); })
        .catch(function () { fin(null); });
    });
  }

  w.CloudStore = {
    init: init, serverNow: serverNow,
    whenReady: whenReady,
    officeId: function () { return officeId; },
    portalIndex: { put: piPut, del: piDel, markCollab: piMarkCollab },
    payroll: { list: payrollList, save: payrollSave },
    records: { list: listRecords, save: saveRecord, remove: deleteRecord },
    collection: { list: listJson, listChanged: listJsonChanged, save: saveJson, remove: removeJson,
      get: getJson, saveIf: saveJsonIf, setClientUids: setClientUids,
      claimClientUid: claimClientUid, resetClientUid: resetClientUid },
    /* بوّابة المزامنة الجماعية: قراءة كل السجلات من السحابة تُستهلك من حد القراءات
       اليومي (٥٠ ألف في الباقة المجانية). المزامنة الكاملة (~٤٣٠٠ قراءة) كانت كل
       ١٥ دقيقة لكل جهاز — ٤ ساعات شغل على جهاز واحد كانت بتخلّص الحد لوحدها.
       دلوقتي: كل ١٥ دقيقة بس اللي اتغيّر (mode "delta")، والكاملة مرة كل ٢٤ ساعة
       (mode "full") احتياطي لأي تعديل فات (ساعة جهاز متأخرة، استيراد من غير
       updatedAt). وتُحفظ بصمة كل سجل مُزامَن كي تعرف الكتابة ما تغيّر فعلاً بلا
       قراءة جديدة. name: "cases" | "clients". */
    gate: function (name, everyMs) {
      var AT = "proflawyer.sync." + name + ".at", HS = "proflawyer.sync." + name + ".hashes";
      var FULL_AT = "proflawyer.sync." + name + ".fullAt";
      /* ١٫٥١: كل ٥ دقايق اللي اتغيّر بس، والكاملة (اللي بتقرا كل القضايا/الموكلين) كل ٣ أيام
         على أجهزة المدير وكل ٧ على أجهزة المحامين — كانت كل ٢٤ ساعة على كل جهاز
         (~٣٨٠٠ قراءة للجهاز في اليوم، أكبر مستهلك للحصة). */
      /* ١٫٥٤: الفريق يشوف تعديلات المدير أول بأول — القضايا والموكلين كل دقيقتين،
         والسجلات (أوراق المحضرين) كل دقيقة. استعلام «اللي اتغيّر» الفاضي = قراءة واحدة. */
      var EVERY = everyMs || 5 * 60000, cache = null, timer = null;
      function fullEvery() {
        var role = "";
        try { role = ((w.Team && w.Team.current && w.Team.current()) || {}).role || ""; } catch (e) { }
        return 30 * 24 * 3600000;
      }
      /* updatedAt بيتكتب بساعة الجهاز اللي حفظ — هامش نص ساعة يغطّي فرق
         الساعات بين الأجهزة ومدة المزامنة نفسها، والتكرار بيتقري مرتين بس. */
      var OVERLAP = 10 * 60000;
      function num(k) { return parseInt(localStorage.getItem(k) || "0", 10) || 0; }
      function load() {
        if (cache) return cache;
        try { cache = JSON.parse(localStorage.getItem(HS)) || {}; } catch (e) { cache = {}; }
        return cache;
      }
      function persist() {
        timer = null;
        try { localStorage.setItem(HS, JSON.stringify(cache || {})); } catch (e) { }
      }
      return {
        due: function () {
          return !localStorage.getItem(HS) || Date.now() - num(AT) > EVERY;
        },
        /** "full" | "delta" | null (مفيش مزامنة مطلوبة دلوقتي). */
        mode: function () {
          if (!localStorage.getItem(HS) || Date.now() - num(FULL_AT) > fullEvery()) return "full";
          return Date.now() - num(AT) > EVERY ? "delta" : null;
        },
        since: function () { return new Date(Math.max(0, num(AT) - OVERLAP)).toISOString(); },
        done: function (map) {
          cache = map || {};
          var now = String(Date.now());
          try { localStorage.setItem(AT, now); localStorage.setItem(FULL_AT, now); } catch (e) { }
          persist();
        },
        /** بعد مزامنة delta: changed = {id: بصمة} للسجلات اللي اتحدّثت بس. */
        deltaDone: function (changed) {
          var m = load();
          Object.keys(changed || {}).forEach(function (id) { m[id] = changed[id]; });
          try { localStorage.setItem(AT, String(Date.now())); } catch (e) { }
          persist();
        },
        hashes: function () { return load(); },
        touch: function (id, hh) { load()[id] = hh; if (!timer) timer = setTimeout(persist, 800); },
        forget: function (id) { delete load()[id]; if (!timer) timer = setTimeout(persist, 800); },
        /** بعد تنزيل لقطة البيانات: البصمات اتكتبت في التخزين من بره — نقراها تاني */
        reload: function () { cache = null; },
        force: function () { try { localStorage.removeItem(AT); localStorage.removeItem(FULL_AT); } catch (e) { } }
      };
    },
    hash: function (str) {
      var x = 5381, i = str.length;
      while (i) x = (x * 33) ^ str.charCodeAt(--i);
      return (x >>> 0).toString(36) + "." + str.length.toString(36);
    },
    pendingCount: function () { return Object.keys(loadQueue()).length; },
    /* عمليات معلّقة لمجموعة: {id: "save"|"remove"} — تحترمها المزامنة كي لا تعيد
       سجلاً محذوفاً محلياً ولا تكتب نسخة السحابة القديمة فوق تعديل محلي لم يُرفع بعد */
    queued: function (collectionId) {
      var q = loadQueue(), o = {};
      Object.keys(q).forEach(function (k) {
        var e = q[k];
        if (e && e.kind === "json" && e.collection === collectionId) o[e.id] = e.op;
      });
      return o;
    },
    flushPending: function () { scheduleRetry(200); },
    /* دمج معلّق: شاشة القضايا بتسجّل دالة الدمج، والطابور بيستدعيها لو الرفع فشل */
    onMerge: function (collectionId, fn) { mergeHandlers[collectionId] = fn; },
    enqueueMerge: function (collectionId, id, ops, meta) {
      enqueue({ key: "merge:" + collectionId + ":" + id + ":" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        kind: "merge", collection: collectionId, id: id, ops: ops, meta: meta || null });
    },
    budget: function () { var b = budgetRead(), c = budgetCaps(); return { day: b.day, reads: b.r, writes: b.w, capReads: c.r, capWrites: c.w, by: b.by || {} }; },
    _internal: { toFsValue: toFsValue, projectUrl: projectUrl, officeUrl: officeUrl, authedRequest: authedRequest }
  };

  /* ---------------------------------------------- لقطة البيانات (نسخة ١٫٥١)
     جهاز المدير بيعمل كل يوم ملف واحد مضغوط من نسخته المحلية (القضايا + الموكلين) ويرفعه
     لدرايف المكتب على نفس الملف — من غير ولا قراءة من فيربيز. أي جهاز جديد (مفيش عنده
     بصمات مزامنة) بينزّل اللقطة من الجسر بدل ~٣٨٠٠ قراءة، وبعدين بيسحب اللي اتغيّر من
     وقت اللقطة بس. لو اللقطة مش متاحة ← المزامنة الكاملة العادية. */
  var SNAP_NAME = "HAMLF-لقطة-البيانات.txt", SNAP_MADE = "proflawyer.snap.madeAt";
  var BRIDGE_URL = "https://script.google.com/macros/s/AKfycbx0ANOvPHxfLNAfESo4YUEot1C9skLyn4cxUpJyMIa3S3efbM07KjybE0DuExVJWQKyvQ/exec";
  var SNAP_COLLS = [["cases", "proflawyer.agenda.cases.v1"], ["clients", "proflawyer.agenda.clients.v1"]];
  function bytesToB64(u8) {
    var out = "", CH = 0x8000;
    for (var i = 0; i < u8.length; i += CH) out += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    return btoa(out);
  }
  function gzipB64(text) {
    var s = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
    return new Response(s).arrayBuffer().then(function (buf) { return bytesToB64(new Uint8Array(buf)); });
  }
  function gunzipB64(b64) {
    var bin = atob(b64), u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function seedCollection(name, key, list, at) {
    var local = []; try { local = JSON.parse(lsGet(key)) || []; } catch (e) { }
    var ids = {}; list.forEach(function (c) { if (c && c.id) ids[c.id] = 1; });
    var merged = list.concat(local.filter(function (c) { return c && c.id && !ids[c.id]; }));   /* المحلي اللي مش في اللقطة يفضل */
    var hs = {}; list.forEach(function (c) { if (c && c.id) hs[c.id] = w.CloudStore.hash(JSON.stringify(c)); });
    localStorage.setItem(key, JSON.stringify(merged));
    localStorage.setItem("proflawyer.sync." + name + ".hashes", JSON.stringify(hs));
    localStorage.setItem("proflawyer.sync." + name + ".at", String(at));
    localStorage.setItem("proflawyer.sync." + name + ".fullAt", String(Date.now()));
  }
  var _snapP = null;
  /** جهاز جديد: ينزّل اللقطة مرة واحدة (cb(true) لو اتزرعت البيانات) */
  function snapEnsure(cb) {
    if (!_snapP) _snapP = new Promise(function (resolve) {
      if (!w.DecompressionStream || !w.fetch) { resolve(false); return; }
      whenReady(function (ok) {
        if (!ok) { resolve(false); return; }
        w.Auth.idToken(function (tok) {
          if (!tok) { resolve(false); return; }
          var url = (w.DRIVE_BRIDGE && w.DRIVE_BRIDGE.url) || BRIDGE_URL;
          fetch(url, { method: "POST", headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({ action: "portalTeamSnapshot", idToken: tok, officeId: officeId }) })
            .then(function (r) { return r.json(); })
            .then(function (j) {
              if (!j || !j.ok || !j.data) { resolve(false); return null; }
              return gunzipB64(j.data).then(function (txt) {
                var snap = JSON.parse(txt);
                if (!snap || !Array.isArray(snap.cases) || !Array.isArray(snap.clients) || !snap.at) { resolve(false); return; }
                SNAP_COLLS.forEach(function (x) {
                  if (!lsGet("proflawyer.sync." + x[0] + ".hashes")) seedCollection(x[0], x[1], snap[x[0]], snap.at);
                });
                resolve(true);
              });
            }).catch(function () { resolve(false); });
        });
      });
    });
    _snapP.then(cb);
  }
  /** طلب لجسر درايف بحساب المستخدم نفسه (idToken + المكتب) — للعمليات المتاحة لكل الفريق
      (portalTeam…). cb(json|null). */
  function bridgeCall(action, body, cb) {
    if (w.HAMLF_PC || !w.fetch) { cb(null); return; }
    whenReady(function (ok) {
      if (!ok) { cb(null); return; }
      w.Auth.idToken(function (tok) {
        if (!tok) { cb(null); return; }
        var req = { action: action, idToken: tok, officeId: officeId };
        Object.keys(body || {}).forEach(function (k) { req[k] = body[k]; });
        fetch((w.DRIVE_BRIDGE && w.DRIVE_BRIDGE.url) || BRIDGE_URL,
              { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(req) })
          .then(function (r) { return r.json(); })
          .then(function (j) { cb(j || null); })
          .catch(function () { cb(null); });
      });
    });
  }
  /** جهاز المدير: يعمل اللقطة من نسخته المحلية ويرفعها (نفس الملف بيتحدّث) — صفر قراءات */
  function snapMake(cb) {
    var B = w.DRIVE_BRIDGE;
    if (!B || !B.token || !w.CompressionStream || !w.fetch) { cb && cb(false); return; }
    var at = Math.min(+lsGet("proflawyer.sync.cases.at") || 0, +lsGet("proflawyer.sync.clients.at") || 0);
    if (!at) { cb && cb(false); return; }
    var snap = { v: 1, at: at, made: Date.now() };
    try { SNAP_COLLS.forEach(function (x) { snap[x[0]] = JSON.parse(lsGet(x[1])) || []; }); } catch (e) { cb && cb(false); return; }
    if (!snap.cases.length) { cb && cb(false); return; }
    gzipB64(JSON.stringify(snap)).then(function (b64) {
      return fetch(B.url, { method: "POST", headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "syncUpload", token: B.token, name: SNAP_NAME, data: btoa(b64) }) })
        .then(function (r) { return r.json(); });
    }).then(function (j) {
      if (j && j.ok) { try { localStorage.setItem(SNAP_MADE, String(Date.now())); } catch (e) { } }
      cb && cb(!!(j && j.ok), j && j.file && j.file.size);
    }).catch(function () { cb && cb(false); });
  }
  w.CloudStore.bridge = bridgeCall;
  w.CloudStore.snapshot = {
    ensure: snapEnsure, make: snapMake,
    /** مرة في اليوم على جهاز المدير */
    due: function () { return Date.now() - (+lsGet(SNAP_MADE) || 0) > 24 * 3600000; }
  };

  /* علامات الحذف: مرة كل ساعة (استعلام واحد = قراءة لو مفيش جديد) */
  var delHandlers = {}, DEL_AT = "proflawyer.deleted.at";
  w.CloudStore.onDeleted = function (coll, fn) { delHandlers[coll] = fn; };
  function pollDeleted() {
    if (document.hidden || !Object.keys(delHandlers).length) return;
    var last = parseInt(localStorage.getItem(DEL_AT) || "0", 10) || 0;
    if (Date.now() - last < 3600000) return;
    var started = Date.now();
    var since = new Date(Math.max(0, (last || Date.now() - 30 * 86400000) - 10 * 60000)).toISOString();
    listJsonChanged("deleted", since, false, function (list) {
      if (list === null) return;
      list.forEach(function (d) {
        var h = d && delHandlers[d.coll];
        if (h && d.id) { try { h(d.id); } catch (e) { } }
      });
      try { localStorage.setItem(DEL_AT, String(started)); } catch (e) { }
    });
  }
  setTimeout(pollDeleted, 8000);
  setInterval(pollDeleted, 60000);

  /* ------------------------------------- القوائم والمحاكم من جهاز المدير (١٫٥٥)
     طلب المستخدم: «زامن المحاكم والقوائم مع الفريق من غير ما يقدروا يلعبوا فيها».
     الأربع مفاتيح دول مستند واحد records/shared/items/refdata:
       • جهاز المدير: بيرفع لما حاجة تتغيّر عنده، وبياخد تعديلات جهاز المدير التاني
         (لو الاتنين اتعدّلوا: اتحاد القيم، ولو التاني بس اتعدّل: نسخته زي ما هي).
       • باقي الفريق: نسخة المدير بالظبط، وأي تعديل محلي بيرجع لها (والإضافة نفسها
         مقفولة في lists.js وcourts.js وregisters.js). مابيرفعوش أبداً.
     كل دقيقتين والبرنامج مفتوح: استعلام «اللي اتغيّر» = قراءة واحدة لو مفيش جديد. */
  var REF_KEYS = ["proflawyer.lists.v1", "proflawyer.courts.custom.v1", "proflawyer.courtAddr.v1", "proflawyer.reglists.v1"];
  var REF_COLL = "shared", REF_ID = "refdata";
  var REF_HASH = "proflawyer.sync.ref.hash", REF_AT = "proflawyer.sync.ref.at", REF_COPY = "proflawyer.sync.ref.copy";
  function refRole() {
    try { return ((w.Team && w.Team.current && w.Team.current()) || {}).role || ""; } catch (e) { return ""; }
  }
  function refBundle() {
    var o = {};
    REF_KEYS.forEach(function (k) { var v = lsGet(k); if (v != null) o[k] = v; });
    return o;
  }
  function refHash(b) { return w.CloudStore.hash(JSON.stringify(b)); }
  function refApply(b) {
    var n = 0;
    REF_KEYS.forEach(function (k) {
      var v = b[k];
      try {
        if (v == null) { if (lsGet(k) != null) { localStorage.removeItem(k); n++; } }
        else if (lsGet(k) !== v) { localStorage.setItem(k, v); n++; }
      } catch (e) { }
    });
    if (n) { try { w.dispatchEvent(new CustomEvent("ref:synced")); } catch (e) { } }
    return n;
  }
  /* اتحاد قيمتين (للمديرين لو الاتنين عدّلوا): كائنات بالمفتاح، ومصفوفات بلا تكرار، والباقي المحلي */
  function refUnion(a, b) {
    if (Array.isArray(a) && Array.isArray(b)) {
      var seen = {}, out = [];
      a.concat(b).forEach(function (x) {
        var k = typeof x === "string" ? (w.lawyerNorm ? w.lawyerNorm(x) : x) : JSON.stringify(x);
        if (!seen[k]) { seen[k] = 1; out.push(x); }
      });
      return out;
    }
    if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
      var o = {};
      Object.keys(b).forEach(function (k) { o[k] = b[k]; });
      Object.keys(a).forEach(function (k) { o[k] = k in b ? refUnion(a[k], b[k]) : a[k]; });
      return o;
    }
    return a === undefined ? b : a;
  }
  function refMerge(local, remote) {
    var o = {};
    REF_KEYS.forEach(function (k) {
      var l = local[k], r = remote[k];
      if (l == null || r == null) { if (l != null || r != null) o[k] = l != null ? l : r; return; }
      try { o[k] = JSON.stringify(refUnion(JSON.parse(l), JSON.parse(r))); } catch (e) { o[k] = l; }
    });
    return o;
  }
  var _refBusy = false;
  function refTick() {
    if (_refBusy || w.HAMLF_PC || document.hidden || !lsGet("proflawyer.session.v1")) return;
    var role = refRole();
    if (!role || role === "none" || role === "client") return;
    var owner = role === "owner";
    /* محامي: أي تعديل محلي يرجع لنسخة المدير المحفوظة على طول (من غير قراءة) */
    if (!owner) {
      var copy = null;
      try { copy = JSON.parse(lsGet(REF_COPY)); } catch (e) { }
      if (copy && refHash(refBundle()) !== refHash(copy)) refApply(copy);
    }
    var last = +lsGet(REF_AT) || 0;
    if (last && Date.now() - last < 2 * 60000) {
      if (owner && refHash(refBundle()) !== lsGet(REF_HASH)) refPush(refBundle());
      return;
    }
    _refBusy = true;
    var started = Date.now();
    listJsonChanged(REF_COLL, new Date(last ? last - 10 * 60000 : 0).toISOString(), false, function (list) {
      _refBusy = false;
      if (list === null) return;
      try { localStorage.setItem(REF_AT, String(started)); } catch (e) { }
      var doc = (list || []).filter(function (d) { return d && d.data && typeof d.data === "object"; })[0];
      var remote = doc ? doc.data : null;
      if (!owner) {
        if (!remote) return;
        try { localStorage.setItem(REF_COPY, JSON.stringify(remote)); } catch (e) { }
        refApply(remote);
        return;
      }
      var local = refBundle(), lh = refHash(local), pushed = lsGet(REF_HASH);
      if (remote && refHash(remote) !== pushed) {
        /* جهاز مدير تاني رفع: لو الجهاز ده ما اتعدّلش من آخر رفع ← ياخد نسخته؛ غير كده اتحاد */
        var merged = lh === pushed || !pushed && !Object.keys(local).length ? remote : refMerge(local, remote);
        refApply(merged);
        if (refHash(merged) !== refHash(remote)) refPush(merged);
        else { try { localStorage.setItem(REF_HASH, refHash(remote)); } catch (e) { } }
        return;
      }
      if (lh !== pushed) refPush(local);
    });
  }
  function refPush(b) {
    var h = refHash(b);
    try { localStorage.setItem(REF_HASH, h); } catch (e) { }
    saveJson(REF_COLL, REF_ID, { data: b, at: new Date().toISOString() });
  }
  w.CloudStore.refSync = refTick;
  setTimeout(refTick, 5000);
  setInterval(refTick, 30000);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else { init(); }

})(window);
