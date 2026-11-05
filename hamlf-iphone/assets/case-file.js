/* =============================================================================
   ملف القضية — بحث وتعديل وحذف وإضافة وطباعة.

   القضايا المستوردة من التقويم كانت للعرض فقط: لا بحث يوصل إلى قضية بعينها،
   ولا سبيل لتصحيح بيان أو تعديل جلسة أو حذف مكرَّر. وكانت شاشة العرض لا
   تُظهر رقم الملف بالمكتب ولا رقم توكيل الموكل، وهما المفتاحان اللذان يعرف
   بهما المكتب قضاياه.

   هنا: بحث بثلاثة مفاتيح (رقم الملف بالمكتب · رقم الدعوى · اسم الموكل)،
   وملف كامل لكل قضية بأقسامه — البيانات · الجلسات · الأطراف · المرفقات —
   كلٌّ منها قابل للإضافة والتعديل والحذف، ثم الطباعة.

   المرفقات تُحفظ في التخزين الداخلي عبر Attach لا في localStorage.
   ============================================================================= */
(function (w) {
  "use strict";

  var KEY = "proflawyer.agenda.cases.v1";

  /* --------------------------------------------------------------- أدوات */

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; }
  }

  /* ------------------------------------------------- مزامنة Firestore

     كل قضية (بجلساتها وأطرافها ومهامها الإدارية) تُخزَّن كمستند JSON واحد
     كامل في مجموعة "cases" (عبر CloudStore.collection، انظر تعليقه في
     cloud-store.js) — مفتاحها c.id (يُولَّد دائماً "cfxxxxx" عند إنشاء أي
     قضية جديدة). lastSynced تحتفظ بآخر نسخة معروفة مطابقة للسحابة لكل
     قضية، لحساب الفرق (تعديل/حذف) بدل رفع كل القضايا في كل حفظة. */
  var lastSynced = {};

  /* بصمات المزامنة (راجع CloudStore.gate): تقلّل قراءات السحابة لمرة كل ١٥ دقيقة */
  var _gate = null;
  function gate() {
    return _gate || (window.CloudStore && window.CloudStore.gate ? (_gate = window.CloudStore.gate("cases", 2 * 60000)) : null);
  }
  function gTouch(id, json) { var g = gate(); if (g) g.touch(id, window.CloudStore.hash(json)); }
  function gForget(id) { var g = gate(); if (g) g.forget(id); }

  function restoreSyncedFromHashes(g) {
    var hs = g.hashes();
    lastSynced = {};
    read().forEach(function (c) {
      if (!c.id) return;
      var j = JSON.stringify(c);
      if (hs[c.id] === window.CloudStore.hash(j)) lastSynced[c.id] = j;
    });
  }

  var _snapTried = false;
  function syncFromCloud() {
    if (!window.CloudStore || !window.CloudStore.collection) return;
    var g = gate();
    var mode = g && g.mode ? g.mode() : (g && !g.due() ? null : "full");
    if (g && mode !== "full") {
      /* لا قراءة كاملة: نستعيد ما هو مطابق للسحابة من البصمات المحفوظة */
      restoreSyncedFromHashes(g);
      if (mode !== "delta" || !window.CloudStore.collection.listChanged) return;
      /* delta: بس القضايا اللي اتعدّلت من آخر مزامنة تتقري وتحلّ محل النسخة المحلية */
      window.CloudStore.collection.listChanged("cases", g.since(), false, function (remote) {
        if (remote === null) return;
        var local = read(), idx = {}, changed = {};
        var qo = window.CloudStore.queued ? window.CloudStore.queued("cases") : {};
        local.forEach(function (c, i) { if (c.id) idx[c.id] = i; });
        remote.forEach(function (r0) {
          if (!r0.id || qo[r0.id]) return;   /* حذف/تعديل محلي لسه ما اترفعش — يكسب */
          var r = withPending(r0);            /* تعديلات المحامي اللي لسه ما اتدمجتش تفضل ظاهرة عنده */
          if (idx[r.id] != null) local[idx[r.id]] = r; else { idx[r.id] = local.length; local.push(r); }
          var j = JSON.stringify(r);
          lastSynced[r.id] = j;
          changed[r.id] = window.CloudStore.hash(j);
        });
        if (Object.keys(changed).length) {
          try { localStorage.setItem(KEY, JSON.stringify(local)); } catch (e) { }
          try { w.dispatchEvent(new CustomEvent("cases:synced", { detail: { n: Object.keys(changed).length } })); } catch (e) { }
        }
        g.deltaDone(changed);
      });
      return;
    }
    /* جهاز جديد (مفيش بصمات): نجرّب لقطة البيانات من درايف المكتب الأول — بدل ~٣٨٠٠ قراءة */
    if (!_snapTried && window.CloudStore.snapshot && !localStorage.getItem("proflawyer.sync.cases.hashes")) {
      _snapTried = true;
      window.CloudStore.snapshot.ensure(function (ok) {
        if (ok && g && g.reload) g.reload();
        syncFromCloud();
      });
      return;
    }
    window.CloudStore.collection.list("cases", function (remote) {
      if (remote === null) return;   // بلا اتصال أو بلا تسجيل دخول — استمر محلياً
      var local = read();
      var byId = {};
      var qo = (window.CloudStore && window.CloudStore.queued) ? window.CloudStore.queued("cases") : {};
      /* حذف/تعديل محلي معلّق للرفع: لا نُعيد المحذوف ولا نكتب نسخة السحابة القديمة فوق التعديل */
      remote.forEach(function (r) { if (r.id && qo[r.id] !== "remove") byId[r.id] = withPending(r); });
      /* اتمسحت من جهاز تاني: الجهاز ده عارف إنها اتزامنت قبل كده (بصمتها محفوظة)
         ومش على السيرفر دلوقتي ← تتشال هنا كمان. أمان: لو المختفي كتير (تحميل
         ناقص من النت) ما نشيلش حاجة. */
      var goneC = {};
      if (g && g.hashes) {
        var hsC = g.hashes() || {}, lost = [];
        local.forEach(function (c) { if (c.id && hsC[c.id] && !byId[c.id] && qo[c.id] !== "save") lost.push(c.id); });
        if (lost.length && lost.length <= Math.max(5, Math.round(local.length * 0.04)))
          lost.forEach(function (id) { goneC[id] = 1; });
      }
      /* أي قضية محلية لم تصل للسحابة بعد (أُنشئت للتو أو فشل رفعها) تبقى */
      local.forEach(function (c) { if (c.id && !goneC[c.id] && (!byId[c.id] || qo[c.id] === "save")) byId[c.id] = c; });
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
  /** بوابة الموكلين تعتمد على حقل clientUids الظاهر على كل قضية (راجع
      [[feedback_client_portal_access]]) — لكن حفظة قضية عادية لا تُعيد
      حسابه إلا لو تغيّر نص القضية نفسه (مقارنة lastSynced على النص وحده)،
      فلو موكل طالب بحسابه (claimClientUid) بعد آخر حفظة لقضاياه، تفضل
      قضاياه بلا clientUids حتى يُعاد حفظها يدوياً. هذا التحديث الخلفي
      يُعيد حساب الربط لكل القضايا ويرفعه تلقائياً مرة كل بضع ساعات من أي
      جهاز مكتب مفتوح ومتصل — بلا أي سيرفر أو Cloud Function، فقط دورة
      مزامنة عادية إضافية صامتة. */
  var REFRESH_KEY = "proflawyer.clientlinks.refreshedAt";
  var REFRESH_EVERY = 15 * 60000;   /* كان ٦ ساعات — الموكل اللي سجّل بيستنى؛ pushed بيمنع أي كتابة مكررة */
  /* يتذكّر آخر مجموعة clientUids اتبعتت فعلاً لكل قضية — فلا يعيد رفع نفس
     القضية تاني وتاني كل دورة، ولا يرفع القضايا الـ٣٤٤ كلها كل مرة، بل
     فقط اللي رابطها اتغيّر عن آخر مرة. راجع طلب المستخدم 2026-09-10:
     "الرفع السحابي على التعديلات بس مش على كل البيانات". */
  var PUSHED_KEY = "proflawyer.clientlinks.pushed.v1";
  function readPushedMap() {
    try { return JSON.parse(localStorage.getItem(PUSHED_KEY)) || {}; } catch (e) { return {}; }
  }
  function refreshClientLinksInBackground() {
    if (!window.CloudStore || !window.CloudStore.collection) return;
    /* ١٫٥١: أجهزة المدير بس، وبتكتب خانة الربط لوحدها (setClientUids) — كانت بترفع
       القضية كاملة من كل جهاز كل ربع ساعة، فتمسح تعديلات المحامين اللي لسه ما وصلتش. */
    if (!isOwnerDev() || !window.CloudStore.collection.setClientUids) return;
    var last = parseInt(localStorage.getItem(REFRESH_KEY) || "0", 10);
    if (Date.now() - last < REFRESH_EVERY) return;
    localStorage.setItem(REFRESH_KEY, String(Date.now()));
    var pushed = readPushedMap();
    read().forEach(function (c) {
      if (!c.id) return;
      var uids = caseClientUids(c);
      /* ربط اتشال (مثلاً «المدير بصفته المحامي») ← لازم يترفع فاضي علشان يتمسح من السحابة */
      if (!uids.length && !pushed[c.id]) return;
      var key = uids.slice().sort().join(",");
      if (pushed[c.id] === key) return;   /* نفس الربط المرفوع سابقاً — تخطَّ */
      window.CloudStore.collection.setClientUids("cases", c.id, uids, function (ok) {
        if (ok) { pushed[c.id] = key; try { localStorage.setItem(PUSHED_KEY, JSON.stringify(pushed)); } catch (e) { } }
      });
    });
  }

  var _syncedOnce = false;
  function ensureSynced() {
    if (_syncedOnce) return;
    _syncedOnce = true;
    syncFromCloud();
    setTimeout(refreshClientLinksInBackground, 5000);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureSynced);
  } else { ensureSynced(); }

  /* lastSynced هنا خرائط id← نص JSON جاهز (لا كائن يُستنسَخ) — استنساخ
     ٣٤٣+ قضية بعمق (JSON.parse(JSON.stringify)) في كل حفظة، بالإضافة
     لتحويل كل قضية لنص مرّتين للمقارنة، كان يجعل كل ضغطة "حفظ" بطيئة
     محسوسة. هنا نص واحد لكل قضية يُقارَن مباشرة، ولا يُعاد حسابه إلا
     للقضية التي تغيّرت فعلاً. */
  /** لو تغيّرت قضية واحدة بعينها (٩٩٪ من الحفظات)، مرّر رقمها في onlyId
      لمقارنة/رفع نسختها فقط — لا داعي لتحويل ٣٤٣+ قضية لنص في كل حفظة
      لمجرد المقارنة. الفحص الكامل (كشف الحذف) يبقى فقط حين لا يُمرَّر
      onlyId (حذف قضية، أو مزامنة أولية). */
  /* =====================================================================
     نسخة ١٫٥١ — دمج التعديلات بدل «آخر جهاز يحفظ يكسب»
     - كل حفظة بتتحوّل لـ«تغييرات» (ops) بالمقارنة بآخر نسخة اتزامنت (lastSynced):
       خانة اتغيّرت · جلسة (بتاريخها) اتضافت/اتعدّلت/اتشالت · مهمة (بالـid).
     - جهاز المدير: يقرا نسخة السحابة، يطبّق التغييرات عليها، ويحفظ بشرط إنها ما
       اتغيّرتش في النص (updateTime) — لو اتغيّرت يعيد. فما حدش يمسح شغل حد.
     - جهاز المحامي: ما بيكتبش على القضية خالص؛ بيبعت «طلب تعديل» صغير في
       records/edits، وجهاز المدير بيدمجه تلقائياً (pollEdits) ويعلّمه appliedAt.
       لحد ما يتدمج، التعديل بيفضل ظاهر عند المحامي (withPending).
     ===================================================================== */
  var BULK_LIMIT = 15, _bulkWarned = false;
  var OPS_SKIP = { clientUids: 1, collabEmails: 1, _edits: 1, updatedAt: 1 };
  function isOwnerDev() {
    try { return !!(w.Team && Team.current && (Team.current() || {}).role === "owner" && !Team.isClean); }
    catch (e) { return false; }
  }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function sessKey(x) { return x && (x.id || x.date) || ""; }
  function keyedOps(kind, a, b, keyOf, ops) {
    var ma = {}, mb = {}, dup = false;
    (a || []).forEach(function (x) { var k = keyOf(x); if (!k || ma[k]) dup = true; ma[k] = x; });
    (b || []).forEach(function (x) { var k = keyOf(x); if (!k || mb[k]) dup = true; mb[k] = x; });
    if (dup) return false;                      /* مفيش مفتاح ثابت ← الخانة كلها */
    Object.keys(mb).forEach(function (k) {
      if (JSON.stringify(ma[k]) !== JSON.stringify(mb[k])) ops.push({ k: kind, key: k, v: mb[k] });
    });
    Object.keys(ma).forEach(function (k) { if (!(k in mb)) ops.push({ k: kind, key: k, v: null }); });
    return true;
  }
  function caseOps(base, cur) {
    if (!cur) return [];
    if (!base) return [{ k: "create", v: cur }];
    var ops = [], keys = {};
    Object.keys(base).concat(Object.keys(cur)).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (f) {
      if (OPS_SKIP[f] || f.indexOf("__") === 0) return;
      var a = base[f], b = cur[f];
      if (JSON.stringify(a) === JSON.stringify(b)) return;
      if (f === "sessions" && Array.isArray(b) && keyedOps("sess", a, b, sessKey, ops)) return;
      if (f === "adminTasks" && Array.isArray(b) && keyedOps("task", a, b, function (t) { return t && t.id; }, ops)) return;
      ops.push(b === undefined ? { k: "del", f: f } : { k: "set", f: f, v: b });
    });
    return ops;
  }
  function putKeyed(list, keyOf, key, v) {
    list = Array.isArray(list) ? list.slice() : [];
    var i = -1;
    for (var j = 0; j < list.length; j++) if (keyOf(list[j]) === key) { i = j; break; }
    if (v == null) { if (i >= 0) list.splice(i, 1); return list; }
    if (i >= 0) list[i] = v; else list.push(v);
    return list;
  }
  function sortedByDate(list) {
    for (var i = 1; i < list.length; i++) if (String(list[i - 1].date || "") > String(list[i].date || "")) return false;
    return true;
  }
  function applyOps(obj, ops) {
    var out = obj ? clone(obj) : null;
    (ops || []).forEach(function (op) {
      if (op.k === "create") {
        if (!out) { out = clone(op.v); return; }
        /* القضية موجودة على السحابة ومفيش نسخة أساس: نضيف/نعدّل بس — مفيش مسح */
        caseOps(out, op.v).forEach(function (o2) {
          if (o2.k === "del" || ((o2.k === "sess" || o2.k === "task") && o2.v == null)) return;
          out = applyOps(out, [o2]);
        });
        return;
      }
      if (!out) return;                         /* القضية مش موجودة (اتمسحت) */
      if (op.k === "set") out[op.f] = clone(op.v);
      else if (op.k === "del") delete out[op.f];
      else if (op.k === "sess") {
        var wasSorted = sortedByDate(out.sessions || []);
        out.sessions = putKeyed(out.sessions, sessKey, op.key, clone(op.v));
        if (wasSorted) out.sessions.sort(function (a, b) { return String(a.date || "") < String(b.date || "") ? -1 : String(a.date || "") > String(b.date || "") ? 1 : 0; });
      }
      else if (op.k === "task") out.adminTasks = putKeyed(out.adminTasks, function (t) { return t && t.id; }, op.key, clone(op.v));
    });
    return out;
  }
  function stripMeta(o) {
    if (!o) return o;
    var out = {}; Object.keys(o).forEach(function (k) { if (k.indexOf("__") !== 0 && k !== "clientUid") out[k] = o[k]; });
    return out;
  }
  function sessionInfo() {
    try { return JSON.parse(localStorage.getItem("proflawyer.session.v1")) || {}; } catch (e) { return {}; }
  }
  function appVer() { try { return w.AndroidUpdater && AndroidUpdater.versionCode ? String(AndroidUpdater.versionCode()) : ""; } catch (e) { return ""; } }

  /** بعد دمج ناجح: النسخة المحلية = نسخة السحابة الجديدة + أي تعديل محلي أحدث لسه ما اتبعتش. */
  function adoptMerged(id, merged, baseJson) {
    var list = read(), i = -1;
    for (var j = 0; j < list.length; j++) if (list[j].id === id) { i = j; break; }
    var mj = JSON.stringify(merged);
    var base = null; try { base = JSON.parse(baseJson || lastSynced[id] || "null"); } catch (e) { }
    var next = merged;
    if (i >= 0 && base) {
      var extra = caseOps(base, list[i]);
      if (extra.length) next = applyOps(merged, extra);
    }
    if (i >= 0) list[i] = next; else list.push(next);
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { }
    lastSynced[id] = mj; gTouch(id, mj);
    if (JSON.stringify(next) !== mj) setTimeout(function () { pushChangedToCloud(read(), id); }, 50);
  }
  /** يقرا القضية من السحابة، يطبّق التغييرات، ويحفظ بشرط (يعيد لو جهاز تاني سبقه). */
  function mergeSave(id, ops, meta, cb, tries, baseJson) {
    tries = tries || 0;
    var CS = w.CloudStore && w.CloudStore.collection;
    if (!CS || !CS.get || !CS.saveIf) { cb && cb(false, "fail"); return; }
    CS.get("cases", id, function (g) {
      if (!g.ok) { cb && cb(false, g.budget ? "budget" : "fail"); return; }
      var cloud = stripMeta(g.obj);
      if (meta && meta.editId && cloud && (cloud._edits || []).indexOf(meta.editId) >= 0) { cb && cb(true, "already"); return; }
      var merged = applyOps(cloud, ops);
      if (!merged) { cb && cb(true, "noop"); return; }
      if (meta && meta.editId) merged._edits = (merged._edits || []).concat(meta.editId).slice(-40);
      CS.saveIf("cases", id, withClientUids(merged), g.updateTime, function (r) {
        if (r.ok) { merged.__ut = r.updateTime; adoptMerged(id, merged, baseJson); cb && cb(true); return; }
        if (r.conflict && tries < 3) {
          setTimeout(function () { mergeSave(id, ops, meta, cb, tries + 1, baseJson); }, 300 + 600 * tries);
          return;
        }
        cb && cb(false, r.budget ? "budget" : "fail");
      });
    });
  }
  /* case-file.js بيتحمّل قبل cloud-store.js في الصفحات — التسجيل بيستنى لحد ما يبقى موجود */
  function registerCloudHooks() {
    if (!w.CloudStore || registerCloudHooks.done) return;
    registerCloudHooks.done = true;
    if (CloudStore.onDeleted) {
      CloudStore.onDeleted("cases", function (id) {
        var qo = CloudStore.queued ? CloudStore.queued("cases") : {};
        if (qo[id] === "save") return;
        var list = read(), n = list.length;
        list = list.filter(function (c) { return c.id !== id; });
        if (list.length !== n) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { } }
        delete lastSynced[id]; gForget(id);
      });
    }
    if (CloudStore.onMerge) {
      CloudStore.onMerge("cases", function (id, ops, meta, done) {
        mergeSave(id, ops, meta, function (ok, why) { done(ok || why === "noop" || why === "already"); });
      });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", registerCloudHooks);
  else setTimeout(registerCloudHooks, 0);

  /* ---- تعديلات المحامي اللي اتبعتت ولسه ما اتدمجتش ---- */
  var PENDING_KEY = "proflawyer.edits.pending.v1";
  function pendingRead() { try { return JSON.parse(localStorage.getItem(PENDING_KEY)) || []; } catch (e) { return []; } }
  function pendingWrite(P) { try { localStorage.setItem(PENDING_KEY, JSON.stringify(P)); } catch (e) { } }
  function withPending(r) {
    var P = pendingRead();
    if (!P.length || !r || !r.id) return r;
    var ack = r._edits || [], keep = [], mine = [];
    P.forEach(function (e) {
      if (e.caseId === r.id && ack.indexOf(e.id) >= 0) return;          /* اتدمج */
      if (Date.now() - (e.t || 0) > 5 * 86400000) return;               /* قديم جداً */
      keep.push(e);
      if (e.caseId === r.id) mine.push(e);
    });
    if (keep.length !== P.length) pendingWrite(keep);
    if (!mine.length) return r;
    var out = r;
    mine.forEach(function (e) { out = applyOps(out, e.ops); });
    return out;
  }
  function sendEdit(c, ops) {
    var u = {}; try { u = (w.Team && Team.current && Team.current()) || {}; } catch (e) { }
    var sess = sessionInfo();
    var id = "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var label = [c.fileNo && ("ملف " + c.fileNo), c.caseNo && ("دعوى " + c.caseNo + (c.caseYear ? "/" + c.caseYear : ""))]
      .filter(Boolean).join(" · ");
    var P = pendingRead(); P.push({ id: id, caseId: c.id, ops: ops, t: Date.now() }); pendingWrite(P);
    w.CloudStore.collection.save("edits", id, { id: id, caseId: c.id, ops: ops, at: new Date().toISOString(),
      by: String(sess.email || u.email || "").toLowerCase(), byName: u.name || "", label: label, appVer: appVer() });
  }
  function pushOne(c, baseJson) {
    if (!c || !c.id || !w.CloudStore || !w.CloudStore.collection) return;
    var base = null; try { base = baseJson ? JSON.parse(baseJson) : null; } catch (e) { }
    var ops = caseOps(base, c);
    if (!ops.length) return;
    if (isOwnerDev()) {
      var fallback = function () {
        mergeSave(c.id, ops, null, function (ok, why) {
          if (!ok && CloudStore.enqueueMerge) CloudStore.enqueueMerge("cases", c.id, ops, null);
        }, 0, baseJson);
      };
      /* عارفين نسخة السحابة اللي اشتغلنا عليها (__ut)؟ نرفع على طول بشرط إنها ما اتغيّرتش —
         من غير قراءة. لو جهاز تاني سبقنا ← نقرا وندمج (fallback). */
      var known = base && base.__ut;
      if (known && CloudStore.collection.saveIf) {
        var target = applyOps(stripMeta(base), ops);
        CloudStore.collection.saveIf("cases", c.id, withClientUids(target), known, function (r) {
          if (r.ok) { target.__ut = r.updateTime; adoptMerged(c.id, target, baseJson); return; }
          if (r.budget) { if (CloudStore.enqueueMerge) CloudStore.enqueueMerge("cases", c.id, ops, null); return; }
          fallback();
        });
      } else fallback();
    } else sendEdit(c, ops);
  }

  /* ---- جهاز المدير: يستلم طلبات المحامين ويدمجها تلقائياً ---- */
  var EDITS_AT = "proflawyer.edits.at", EDITS_DONE = "proflawyer.edits.done.v1", _pollBusy = false;
  function mergedToast(n) {
    try {
      var d = el("div", "position:fixed;left:12px;right:12px;bottom:84px;z-index:10050;background:#1d5c3a;color:#fff;" +
        "padding:11px 14px;border-radius:10px;font-size:14px;direction:rtl;text-align:center;box-shadow:0 4px 16px rgba(0,0,0,.2)",
        "✓ اتدمج " + ar(n) + " تعديل من المحامين — افتح القضية تاني علشان تشوفه");
      d.onclick = function () { d.remove(); };
      document.body.appendChild(d);
      setTimeout(function () { try { d.remove(); } catch (e) { } }, 7000);
    } catch (e) { }
    try { w.dispatchEvent(new CustomEvent("cases:merged", { detail: { n: n } })); } catch (e) { }
  }
  function pollEdits(force) {
    if (_pollBusy || !isOwnerDev() || !w.CloudStore || !CloudStore.collection || !CloudStore.collection.listChanged) return;
    if (document.hidden && !force) return;
    var last = parseInt(localStorage.getItem(EDITS_AT) || "0", 10) || 0;
    if (!force && Date.now() - last < 110000) return;
    _pollBusy = true;
    var started = Date.now();
    var since = new Date(Math.max(0, (last || Date.now() - 14 * 86400000) - 10 * 60000)).toISOString();
    CloudStore.collection.listChanged("edits", since, false, function (list) {
      if (list === null) { _pollBusy = false; return; }
      var doneMap = {}; try { doneMap = JSON.parse(localStorage.getItem(EDITS_DONE)) || {}; } catch (e) { }
      var todo = list.filter(function (e) {
        return e && e.id && e.caseId && Array.isArray(e.ops) && !e.appliedAt && !doneMap[e.id];
      }).sort(function (a, b) { return String(a.at) < String(b.at) ? -1 : 1; });
      var i = 0, applied = 0, failed = 0, me = String(sessionInfo().email || "").toLowerCase();
      function finish() {
        var cut = Date.now() - 30 * 86400000;
        Object.keys(doneMap).forEach(function (k) { if (doneMap[k] < cut) delete doneMap[k]; });
        try {
          localStorage.setItem(EDITS_DONE, JSON.stringify(doneMap));
          if (!failed) localStorage.setItem(EDITS_AT, String(started));   /* لو حاجة فشلت تتقري تاني المرة الجاية */
        } catch (e) { }
        _pollBusy = false;
        if (applied) mergedToast(applied);
      }
      function next() {
        if (i >= todo.length) { finish(); return; }
        var e = todo[i++];
        mergeSave(e.caseId, e.ops, { editId: e.id }, function (ok, why) {
          if (!ok) { failed++; next(); return; }
          doneMap[e.id] = Date.now();
          if (why !== "already") applied++;
          var mark = {}; Object.keys(e).forEach(function (k) { if (k.indexOf("__") !== 0) mark[k] = e[k]; });
          mark.appliedAt = new Date().toISOString(); mark.appliedBy = me;
          if (why === "noop") mark.note = "القضية مش موجودة على السحابة";
          CloudStore.collection.save("edits", e.id, mark);
          next();
        });
      }
      next();
    });
  }

  /* ---- كل جهاز بيسجّل نسخته مرة في اليوم (records/devices) — نعرف مين لسه ما حدّثش ---- */
  function deviceCheckIn() {
    try {
      var day = new Date().toISOString().slice(0, 10);
      if (localStorage.getItem("proflawyer.device.checkin") === day) return;
      var s = sessionInfo(); if (!s.uid || !w.CloudStore || !CloudStore.collection) return;
      var u = {}; try { u = (w.Team && Team.current && Team.current()) || {}; } catch (e) { }
      var dev = (navigator.userAgent.match(/;\s*([^;)]+?)\s+Build\//) || [])[1] || "web";
      var id = s.uid.slice(0, 12) + "_" + dev.replace(/[^A-Za-z0-9]+/g, "").slice(0, 24);
      CloudStore.collection.save("devices", id, { uid: s.uid, email: String(s.email || "").toLowerCase(), name: u.name || "",
        role: u.role || "", device: dev, appVer: appVer(), clean: !!(w.Team && Team.isClean), at: new Date().toISOString() },
        function (ok) { if (ok) try { localStorage.setItem("proflawyer.device.checkin", day); } catch (e) { } });
    } catch (e) { }
  }
  /* سحب الجديد كل ٥ دقايق والبرنامج مفتوح (مش بس لما شاشة تتفتح) + صندوق الطلبات كل ٢ دقيقة */
  setTimeout(function () { pollEdits(false); deviceCheckIn(); }, 6000);
  var _snapBusy = false;
  setInterval(function () {
    if (document.hidden) return;
    if (!_snapBusy && isOwnerDev() && w.CloudStore && CloudStore.snapshot && CloudStore.snapshot.due() && navigator.onLine !== false) {
      _snapBusy = true;
      CloudStore.snapshot.make(function () { _snapBusy = false; });
    }
    pollEdits(false);
    var g = gate();
    if (g && g.mode && g.mode()) syncFromCloud();
  }, 60000);

  function withClientUids(c) {
    var uids = caseClientUids(c);
    var collab = collabEmailsOf(c);
    /* نسخة قديمة من clientUids محفوظة على القضية نفسها كانت بترجع تترفع تاني حتى
       بعد ما الربط يتشال (ownerAsLawyer) — الربط دايماً من الحساب الحالي بس. */
    if (!uids.length && !collab.length && !c.clientUids) return c;
    var out = {}; for (var k in c) out[k] = c[k];
    delete out.clientUids;
    if (uids.length) out.clientUids = uids;
    if (collab.length) { out.collabEmails = collab; markCollabEmails(collab); }
    return out;
  }

  /* المحامون المتعاونون (حقل collab): إيميلات بحروف صغيرة. بتتكتب كحقل ظاهر على
     مستند القضية (collabEmails) عشان قواعد الأمان تسمح لصاحب الإيميل — بعد ما
     يأكّده — يقرا القضية دي بس على البوابة. */
  function collabEmailsOf(c) {
    var seen = {};
    return String(c.collab || "").toLowerCase().split(/[\s,،;·]+/).filter(function (e) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) || seen[e]) return false;
      seen[e] = 1; return true;
    });
  }
  /* فهرس البوابة (portalEmails) لازم يعرف الإيميل عشان البوابة تقبله وتطلب منه
     كلمة سر أول مرة. بنعلّمه مرة واحدة بس لكل إيميل (مش مع كل حفظة). */
  var COLLAB_MARKED = "proflawyer.collab.marked.v1";
  function markCollabEmails(list) {
    var CS = window.CloudStore;
    if (!CS || !CS.portalIndex || !CS.portalIndex.markCollab) return;
    var done = {}; try { done = JSON.parse(localStorage.getItem(COLLAB_MARKED)) || {}; } catch (e) { }
    list.forEach(function (email) {
      if (done[email]) return;
      CS.portalIndex.markCollab(email).then(function (r) {
        if (r && r.ok) { done[email] = 1; try { localStorage.setItem(COLLAB_MARKED, JSON.stringify(done)); } catch (e) { } }
      }).catch(function () { });
    });
  }

  function pushChangedToCloud(list, onlyId) {
    if (!window.CloudStore || !window.CloudStore.collection) return;
    if (onlyId) {
      var only = list.filter(function (c) { return c.id === onlyId; })[0];
      if (only) {
        var json1 = JSON.stringify(only);
        if (lastSynced[onlyId] !== json1) {
          pushOne(only, lastSynced[onlyId]);
          lastSynced[onlyId] = json1; gTouch(onlyId, json1);
        }
      } else if (lastSynced[onlyId]) {
        window.CloudStore.collection.remove("cases", onlyId);
        delete lastSynced[onlyId]; gForget(onlyId);
      }
      return;
    }
    var curIds = {}, dirty = [];
    list.forEach(function (c) {
      if (!c.id) return;
      curIds[c.id] = 1;
      var json = JSON.stringify(c);
      if (lastSynced[c.id] !== json) dirty.push([c, json]);
    });
    /* ١٫٥١: جهاز محامي فيه قضايا كتير متغيّرة مرة واحدة (نسخة قديمة أو ترحيل تلقائي) —
       ما تتبعتش، علشان ما يتكررش رفع ٦١٩ قضية من جهاز واحد (حادثة ٥-١٠). */
    if (!isOwnerDev() && dirty.length > BULK_LIMIT) {
      if (!_bulkWarned) {
        _bulkWarned = true;
        try { console.warn("bulk push blocked", dirty.length); } catch (e) { }
      }
      dirty = [];
    }
    dirty.forEach(function (x) {
      pushOne(x[0], lastSynced[x[0].id]);
      lastSynced[x[0].id] = x[1]; gTouch(x[0].id, x[1]);
    });
    Object.keys(lastSynced).forEach(function (id) {
      if (!curIds[id]) { window.CloudStore.collection.remove("cases", id); delete lastSynced[id]; gForget(id); }
    });
  }

  /** القضايا المختلفة عن آخر نسخة مترفوعة: مقارنة بالبصمات على الجهاز من غير أي قراءة من السحابة */
  function unsynced() {
    var g = gate();
    if (!g || !w.CloudStore) return [];
    var hs = g.hashes(), qo = CloudStore.queued("cases");
    return read().filter(function (c) {
      return c.id && !qo[c.id] && hs[c.id] !== CloudStore.hash(JSON.stringify(c));
    }).map(function (c) { return c.id; });
  }
  function pushUnsynced(id) { pushChangedToCloud(read(), id); }

  /** حفظ قائمة كاملة (أدوات التنظيف والاستيراد) مع رفع اللي اتغيّر فعلاً بس،
      بالمقارنة بالنسخة المحلية اللي قبلها — مش بـ lastSynced (ممكن يكون فاضي لو
      المزامنة لسه ما خلصتش، فكان كل القضايا بتتحط في طابور الرفع). */
  function commitAllChanged(list) {
    var prev = {}, now = {};
    read().forEach(function (c) { if (c.id) prev[c.id] = JSON.stringify(c); });
    try { localStorage.setItem(KEY, JSON.stringify(list)); }
    catch (e) { alert("تعذّر الحفظ — المساحة ممتلئة."); return false; }
    list.forEach(function (c) {
      if (!c.id) return;
      now[c.id] = 1;
      if (prev[c.id] !== JSON.stringify(c)) pushChangedToCloud(list, c.id);
    });
    Object.keys(prev).forEach(function (id) {
      if (!now[id] && w.CloudStore && CloudStore.collection) {
        CloudStore.collection.remove("cases", id); delete lastSynced[id]; gForget(id);
      }
    });
    return true;
  }
  function write(list, onlyId) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
      pushChangedToCloud(list, onlyId);
      return true;
    }
    catch (e) { alert("تعذّر الحفظ — المساحة ممتلئة."); return false; }
  }
  function ar(n) {
    return String(n == null ? "" : n)
      .replace(/[0-9]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩"[+d]; });
  }
  function la(t) {
    return String(t == null ? "" : t)
      .replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x0660; });
  }
  function norm(t) { return window.lawyerNorm(t); }
  function el(tag, css, txt) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (txt != null) e.textContent = txt;
    return e;
  }
  /* تاريخ اليوم المحلي للجهاز (لا UTC — بعد منتصف الليل بالقاهرة يختلف اليوم) */
  var today = function () {
    var d = new Date();
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  };

  var AR_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  /** "السبت ٢٠٢٦/٧/٢١" — اسم اليوم بجوار التاريخ، بالأرقام العربية دائماً —
      الاستثناء الوحيد هو عناوين البريد الإلكتروني (تبقى بالأرقام اللاتينية
      لصحة العنوان نفسه، ولا علاقة لها بهذه الدالة). */
  function dayDate(iso) {
    if (!iso) return "";
    var d = new Date(iso + "T00:00:00");
    if (isNaN(d.getTime())) return ar(String(iso).replace(/-/g, "/"));
    return AR_DAYS[d.getDay()] + " " + ar(d.getFullYear() + "/" + (d.getMonth() + 1) + "/" + d.getDate());
  }

  /* ------------------------------------------------------ رقم التوكيل بالمكتب

     الموكل في القضية اسمٌ نصّي، ورقمه بالمكتب في سجل التوكيلات. الربط
     بالاسم بعد التطبيع — كما في تطبيق الويندوز. */

  var _idx = null;
  /* مطابقة الموكل بالاسم — قاعدة المستخدم: الاسم الكامل، أو أول ٣ أسماء (الاسم/الأب/الجد) وتكملة
     الاسم افتراضية؛ ولو الثلاثي متكرر لأكتر من شخص نزوّد الرباعي فالخماسي... لحد ما التكرار يختفي.
     «عبد/أبو/أم/بن/بنت» بتتحسب مع اللي بعدها اسم واحد. */
  function nameParts(name) {
    var w = String(norm(name) || "").split(" ").filter(Boolean), out = [];
    for (var i = 0; i < w.length; i++) {
      if (/^(عبد|ابو|ام|بن|بنت)$/.test(w[i]) && i + 1 < w.length) { out.push(w[i] + " " + w[i + 1]); i++; }
      else if (w[i] === "ال") continue;
      else out.push(w[i]);
    }
    return out;
  }
  /* أسماء كاملة متعددة = نفس الشخص لو كل اسم بداية للأطول منه («اسم» و«… أطول»). */
  function sameChain(arrs) {
    var s = arrs.slice().sort(function (a, b) { return b.length - a.length; });
    for (var i = 1; i < s.length; i++)
      for (var j = 0; j < s[i].length; j++) if (s[i][j] !== s[0][j]) return false;
    return true;
  }
  var _parts = null;
  function clientParts() {
    if (_parts) return _parts;
    var idx = clientIndex();
    _parts = {};
    Object.keys(idx).forEach(function (full) {
      var p = nameParts(full);
      if (p.length < 3) return;
      (_parts[p[0]] || (_parts[p[0]] = [])).push({ p: p, uids: idx[full].uids || [] });
    });
    return _parts;
  }
  function uidsByParts(n) {
    var cp = nameParts(n);
    if (cp.length < 3) return [];
    var pool = clientParts()[cp[0]] || [];
    for (var k = 3; k <= cp.length; k++) {
      var cands = pool.filter(function (x) {
        for (var i = 0; i < Math.min(k, x.p.length); i++) if (x.p[i] !== cp[i]) return false;
        return true;
      });
      if (!cands.length) return [];
      if (sameChain(cands.map(function (x) { return x.p; }))) {
        var u = {}; cands.forEach(function (x) { x.uids.forEach(function (v) { u[v] = 1; }); });
        return Object.keys(u);
      }
      pool = cands;                       /* لسه متكرر → جرّب اسم زيادة */
    }
    return [];
  }

  function clientIndex() {
    if (_idx) return _idx;
    _parts = null;
    _idx = {};
    var list;
    try { list = JSON.parse(localStorage.getItem("proflawyer.agenda.clients.v1")) || []; }
    catch (e) { list = []; }
    list.forEach(function (c) {
      var k = norm(c.name);
      if (!k) return;
      var hasEmail = !!((c.emails && c.emails.length) || c.email);
      var hasPhone = !!((c.phones && c.phones.length) || c.phone);
      var hit = _idx[k];
      if (!hit) {
        hit = _idx[k] = { no: c.officeNo || "", poas: 0, hasEmail: false, hasPhone: false,
                          clientUid: "", uids: [] };
      }
      /* نفس الاسم في أكثر من سجل = نفس الشخص: نجمع بياناته بدل أن يفوز الأول */
      if (!hit.no && c.officeNo) hit.no = c.officeNo;
      hit.poas = Math.max(hit.poas, (c.poas || []).length);
      hit.hasEmail = hit.hasEmail || hasEmail;
      hit.hasPhone = hit.hasPhone || hasPhone;
      if (c.clientUid) {
        if (!hit.clientUid) hit.clientUid = c.clientUid;
        if (hit.uids.indexOf(c.clientUid) < 0) hit.uids.push(c.clientUid);
      }
    });
    return _idx;
  }

  /** حسابات الموكلين (Firebase uid) المرتبطة فعلاً بهذه القضية — تُرفع
      كحقل ظاهر منفصل عن نص json (راجع toFsJson في cloud-store.js) لأن
      قواعد الأمان تسمح لدور "عميل" بقراءة القضية فقط لو حسابه ضمن هذه
      القائمة. تُحسب من فهرس الموكلين المحلي (clientIndex) في كل رفعة —
      لو موكل طالب بحسابه بعد آخر رفعة، ستُضاف تلقائياً في أول رفعة تالية
      (بعد أول مزامنة لهذا الجهاز). راجع [[feedback_client_portal_access]]. */
  /* اسم مدير المكتب (من قائمة الفريق) — في القضايا المتعلّمة ownerAsLawyer
     هو المحامي مش الموكل، فاسمه ما يتربطش بحسابه على البوابة (طلب ٧-١٠-٢٠٢٦). */
  function ownerNorm() {
    try {
      var T = (window.Team && Team.data) || JSON.parse(localStorage.getItem("proflawyer.team.v1")) || {};
      var o = (T.users || []).filter(function (u) { return u.role === "owner" && u.name; })[0];
      return o ? norm(o.name) : "";
    } catch (e) { return ""; }
  }
  function isOwnerParty(n) {
    var o = ownerNorm(), x = norm(n);
    return !!o && (x === o || x.indexOf(o + " ") === 0);
  }
  w.CaseMerge = { ops: function (a, b) { return caseOps(a, b); }, apply: function (o, ops) { return applyOps(o, ops); },
    poll: function () { pollEdits(true); }, pending: function () { return pendingRead(); } };
  function caseClientUids(c) {
    var idx = clientIndex();
    var uids = {};
    clientNames(c).forEach(function (n) {
      if (c.ownerAsLawyer && isOwnerParty(n)) return;
      var hit = idx[norm(n)];
      if (hit) { (hit.uids || []).forEach(function (u) { uids[u] = 1; }); return; }
      /* مفيش تطابق كامل → الثلاثي فالرباعي… لحد ما يخص شخص واحد بس */
      uidsByParts(n).forEach(function (u) { uids[u] = 1; });
    });
    return Object.keys(uids);
  }

  /** أسماء موكلي القضية مفصولةً */
  function clientNames(c) {
    return String(c.clients || "").split("·")
      .map(function (p) { return p.replace(/\([^)]*\)/g, "").trim(); })
      .filter(Boolean);
  }

  /* يفكّ نصّ الأطراف "اسم (صفة) · اسم (صفة)" إلى [{name, cap}] */
  function parseParties(txt) {
    return String(txt || "").split("·").map(function (p) {
      p = p.trim(); if (!p) return null;
      var m = p.match(/^([\s\S]*?)\s*\(([^)]*)\)\s*$/);
      return m ? { name: m[1].trim(), cap: m[2].trim() } : { name: p, cap: "" };
    }).filter(Boolean);
  }

  /* تمديد تلقائي: يكبّر/يصغّر خط النص ليحتويه الحقل في سطرٍ واحد بلا بتر —
     يبدأ من الحجم الأكبر ثم ينزل فقط عند الحاجة حتى حدٍّ أدنى مقروء. */
  function fitText(span, max, min) {
    function run() {
      if (!span.isConnected) { return setTimeout(run, 60); }
      var s = max, guard = 0;
      span.style.fontSize = s + "px";
      while (span.scrollWidth > span.clientWidth + 1 && s > min && guard < 80) {
        s -= 0.5; span.style.fontSize = s + "px"; guard++;
      }
    }
    /* بعد استقرار التخطيط: rAF ثم مهلة احتياطية */
    if (window.requestAnimationFrame)
      requestAnimationFrame(function () { requestAnimationFrame(run); });
    setTimeout(run, 160);
  }

  /* صفٌّ لطرفٍ واحد على سطرٍ واحد: الاسم يميناً وصفته أقصى اليسار،
     والفراغ الكبير بينهما هو الكشيدة الكبيرة المطلوبة، مع تمديد تلقائي للاسم. */
  function partyRow(name, cap, badge, hasEmail, hasPhone) {
    var r = el("div", "display:flex;flex-wrap:nowrap;gap:10px;align-items:baseline;" +
                      "padding:9px 0;border-bottom:1px solid var(--line,#eee);overflow:hidden");
    if (badge) r.appendChild(badge);
    /* بلا ellipsis: التمديد التلقائي يصغّر الخط حتى يحتوي الاسم كاملاً بلا بتر */
    var nm = el("span",
      "flex:1 1 auto;min-width:0;font-size:18px;line-height:2;text-align:right;" +
      "white-space:nowrap", name);
    nm.title = name;
    r.appendChild(nm);
    if (hasEmail) {
      var at = el("span", "flex:0 0 auto;color:#1f7a4d;font-weight:700;font-size:15px", "@");
      at.title = "له بريد إلكتروني مسجَّل في بيانات الموكل.";
      r.appendChild(at);
    }
    if (hasPhone) {
      var wa = el("span", "flex:0 0 auto;color:#25d366;font-weight:700;font-size:15px", "📱");
      wa.title = "له رقم واتساب مسجَّل في بيانات الموكل.";
      r.appendChild(wa);
    }
    if (cap) {
      var cp = el("span",
        "flex:0 0 auto;font-size:15px;color:var(--brand-dark);white-space:nowrap;" +
        "font-family:var(--f-title)", cap);
      r.appendChild(cp);
    }
    fitText(nm, 18, 10);
    return r;
  }

  /** [{name, officeNo, poas}] لكل موكل في القضية */
  function clientsWithOffice(c) {
    var idx = clientIndex();
    /* الصفة (مستأنف/مدعي/…) تُستكمَل من نفس الطرف في c.clients — كانت تُشطَب هنا
       فيظهر رقم التوكيل بلا صفة، رغم أنها مكتوبة أصلاً في القضية. */
    var caps = {};
    parseParties(c.clients).forEach(function (p) {
      var k = norm(p.name.replace(/^ورثة\.\s*/, ""));
      if (p.cap) caps[k] = p.cap;
    });
    return clientNames(c).map(function (n) {
      var hit = idx[norm(n)];
      return { name: n, cap: caps[norm(n)] || "", officeNo: hit ? hit.no : "", poas: hit ? hit.poas : 0,
        hasEmail: hit ? !!hit.hasEmail : false, hasPhone: hit ? !!hit.hasPhone : false };
    });
  }

  function officeNos(c) {
    var out = [];
    clientsWithOffice(c).forEach(function (x) {
      if (x.officeNo && out.indexOf(x.officeNo) < 0) out.push(x.officeNo);
    });
    return out;
  }

  /* --------------------------------------------------------------- البحث */

  /**
   * ثلاثة مفاتيح فقط — كما طلب المكتب:
   *   رقم الملف بالمكتب · رقم الدعوى · اسم الموكل
   * الرقم يُطابَق مطابقةً تامّة حتى لا يبتلع «٤» كل ما فيه أربعة.
   */
  function search(q) {
    var list = read();
    var raw = la(q).trim();
    if (!raw) return list;

    if (/^\d+$/.test(raw)) {
      var exact = list.filter(function (c) {
        if (la(c.fileNo).trim() === raw) return true;
        if (la(c.caseNo).trim() === raw) return true;
        return officeNos(c).some(function (n) { return la(n).trim() === raw; });
      });
      if (exact.length) return exact;
      /* لا مطابقة تامّة؟ نسمح بالجزئي في رقم الدعوى */
      return list.filter(function (c) { return la(c.caseNo).indexOf(raw) >= 0; });
    }

    var words = norm(raw).split(" ").filter(Boolean);
    return list.filter(function (c) {
      var hay = norm(clientNames(c).join(" ") + " " + (c.caseNo || "") + " " +
                     (c.fileNo || "") + " " + (c.courtName || ""));
      return words.every(function (t) { return hay.indexOf(t) >= 0; });
    });
  }

  /* ------------------------------------------------------------ الجلسات */

  function sessions(c) {
    /* الدعوى الفرعية والمنضمة تُنظر مع أصلها في الجلسة نفسها،
       فجلساتها هي جلساته — لا تُدوَّن مرتين. */
    var src = (c && c.linkedTo) ? (rootOf(c) || c) : c;
    return ((src && src.sessions) || []).slice().sort(function (a, b) {
      return String(a.date).localeCompare(String(b.date));
    });
  }
  function nextSession(c) {
    var t = today();
    return sessions(c).filter(function (s) { return s.date >= t; })[0] || null;
  }
  function lastSession(c) {
    var t = today();
    var past = sessions(c).filter(function (s) { return s.date < t; });
    return past[past.length - 1] || null;
  }

  /**
   * الجلسة التي تُعرض للقضية — قاعدة أجندة المكتب:
   * الجلسة القادمة، فإن لم توجد فآخر جلسة ما دام قرارها لم يُدوَّن بعد.
   */
  function currentSession(c) {
    var up = nextSession(c);
    if (up) return up;
    var last = lastSession(c);
    if (last && !resultOf(last)) return last;
    return last;
  }

  /** الجلسات من الأحدث إلى الأقدم — ترتيب التتابع في العرض والتقرير. */
  function sessionsDesc(c) { return sessions(c).slice().reverse(); }

  /** §٢.ب التقاط تتابع الجلسات المكتوب داخل نصّ الملاحظات:
      «رول (الرقم) - يوم شهر سنة - ما تم · رول (…) - … · …»
      يُرجِع صفوفاً {roll, date:YYYY-MM-DD, result} — للعرض في جدول الجلسات. */
  function parseSessionsFromNotes(notes) {
    var out = [];
    if (!notes) return out;
    /* تطبيع الأرقام العربية-الهندية إلى لاتينية — \d لا يمسك ٠-٩. */
    var txt = String(notes).replace(/[٠-٩]/g, function (d) {
      return d.charCodeAt(0) - 0x0660;
    });
    /* الرول قد يُكتب بين قوسين «رول (٥)» أو رقماً مجرَّداً «رول ٥» أو يُغفَل. */
    var re = /رول\s*(?:\(([^)]*)\)|(\d+))?\s*[-–]\s*(\d{1,2})\s+(\d{1,2})\s+(\d{4})\s*[-–]\s*([^·]*)/g;
    var m, p2 = function (n) { return ("0" + n).slice(-2); };
    while ((m = re.exec(txt))) {
      out.push({
        roll: (m[1] || m[2] || "").trim(),
        date: m[5] + "-" + p2(m[4]) + "-" + p2(m[3]),
        result: (m[6] || "").trim()
      });
    }
    return out;
  }

  /** §٢.أ جدول جلسات موحّد (م·رول·تاريخ·نوع·ما تم·تعديل) — يُستعمل في العرض
      من أي مكان. كل صفٍّ مهيكل قابل للتعديل بالضغط. ويضمّ صفوف الجلسات
      المُلتقَطة من الملاحظات (§٢.ب) بنفس التقسيمة، بلونٍ فاتح. */
  /** تسمية "جلسات …" بحسب درجة التقاضي — تُستعمل في تقسيم جدول الجلسات. */
  function degreeCategoryLabel(level) {
    var lvl = norm(level || "");
    if (containsAny(lvl, ["نقض"])) return "تتابع جلسات النقض";
    if (containsAny(lvl, ["استئناف"])) return "تتابع جلسات الاستئناف";
    return "تتابع جلسات أول درجة";
  }

  /** بداية درجة تقاضٍ جديدة داخل نفس سجل القضية — تُكتشف من نصّ الجلسة نفسها
      («اول جلسة استئناف»، «اول جلسة طعن بالنقض») لا من حقل منفصل، لأن أغلب
      القضايا القديمة تُسجَّل جلسات درجاتها كلها في سجلٍّ واحد ورا بعض. */
  function degreeStartLabel(text) {
    var t = norm(text || "");
    if (containsAny(t, ["اول جلسة نقض", "اول جلسة طعن بالنقض", "اول جلسة الطعن بالنقض"])) {
      return "تتابع جلسات الطعن (النقض)";
    }
    if (containsAny(t, ["اول جلسة استئناف"])) return "تتابع جلسات الاستئناف";
    return null;
  }

  /** يقسِّم جلسات القضية (الأقدم أولاً) إلى مجموعات بحسب درجة التقاضي.
      لو ما فيش أي علامة بداية درجة جديدة، تُرجَع مجموعة واحدة بلا عنوان
      (قضية درجة واحدة — لا داعي لعنوان تقسيم). */
  function groupSessionsByDegree(ssAsc) {
    var groups = [{ label: null, rows: [] }];
    ssAsc.forEach(function (sn) {
      var text = (resultOf(sn) || "") + " " + (reasonOf(sn) || "") + " " +
        ((sn.raw && sn.raw.type) || "");
      var newLabel = degreeStartLabel(text);
      var last = groups[groups.length - 1];
      if (newLabel && newLabel !== last.label) groups.push(last = { label: newLabel, rows: [] });
      last.rows.push(sn);
    });
    if (groups.length > 1 && groups[0].label === null) groups[0].label = "تتابع جلسات أول درجة";
    return groups;
  }

  /** مجموعات الجلسات المعروضة: لو القضية مرتبطة بسجلات درجات أخرى عبر زر
      "ترحيل لدرجة أعلى" (سلسلة promotedFrom حقيقية) تُعرض كل درجة من سجلها،
      وإلا فتُقسَّم جلسات هذا السجل نفسه بحسب العلامات النصية بداخلها. */
  function sessionDegreeGroups(c) {
    var chain = familyChain(c);
    if (chain.length > 1) {
      return chain.map(function (node) {
        return { label: degreeCategoryLabel(node.courtLevel),
          rows: sessions(node), owner: node };
      });
    }
    var _g = groupSessionsByDegree(sessions(c));
    /* لا علامات نصية؟ قاعدة الحكم: الجلسة التي بعد جلسة «حكم» تبدأ مرحلة تقاضٍ جديدة (case-statement.js) */
    if (_g.length === 1 && w.CaseStatement) {
      var _sg = CaseStatement.stageGroups(c);
      if (_sg.length > 1) return _sg.map(function (x) { return { label: CaseStatement.T.ar.st[x.cat], rows: x.rows }; });
    }
    return _g;
  }

  var SESSION_TABLE_COLS = ["7%", "11%", "19%", "16%", "42%", "5%"];
  var SESSION_TABLE_HEAD = ["م", "رول", "تاريخ الجلسة", "نوع الجلسة", "سبب التأجيل", "✎"];

  /* الجدول بيعرض جلسات كل درجات القضية (أول درجة/استئناف/نقض) والقضية الأصل للفرعية — كل صف
     بيتعدّل في سجل القضية اللي الجلسة متسجّلة فيه فعلاً. قبل كده كان بيدوّر عليها في السجل
     المفتوح بس، فالضغط على جلسة من درجة تانية ما كانش بيعمل حاجة. */
  function sessionOwnerIndex(own, sn) {
    var ss = (own && own.sessions) || [];
    var i = ss.indexOf(sn); if (i >= 0) return i;
    var j = JSON.stringify(sn);
    for (var k = 0; k < ss.length; k++) if (ss[k].date === sn.date && JSON.stringify(ss[k]) === j) return k;
    return -1;
  }
  function buildSessionsTable(rows, startN, cur, c, refresh, owner) {
    var own = rootOf(owner || c);
    var st = document.createElement("table");
    st.style.cssText = "width:100%;min-width:520px;border-collapse:collapse;table-layout:fixed";
    var cg = document.createElement("colgroup");
    SESSION_TABLE_COLS.forEach(function (wv) {
      var col = document.createElement("col"); col.style.width = wv; cg.appendChild(col);
    });
    st.appendChild(cg);
    var hr = st.insertRow();
    SESSION_TABLE_HEAD.forEach(function (h) {
      var th = hr.insertCell(); th.textContent = h;
      th.style.cssText = "padding:6px;border:1px solid var(--line,#e5d9bf);background:#efe6d6;" +
        "font-family:var(--f-title);font-size:12.5px;text-align:center";
    });
    var n = startN;
    rows.forEach(function (sn) {
      n++;
      var idx = sessionOwnerIndex(own, sn);
      var isCur = sn === cur;
      /* سبب التأجيل هو المعروض في تتابع الجلسات، فإن غاب فالقرار/بيان ما تم. */
      var res = reasonOf(sn) || resultOf(sn) ||
        (sn.date >= today() ? "الجلسة القادمة" : "لم يُدوَّن قرارها بعد");
      var cells = [ar(n), ar((sn.raw && sn.raw.roll) || ""),
        dayDate(sn.date), (sn.raw && sn.raw.type) || "", res, "✎"];
      var tr = st.insertRow();
      if (isCur) tr.style.background = "var(--bg,#f8f2e8)";
      tr.style.cursor = "pointer";
      cells.forEach(function (v, ci) {
        var td = tr.insertCell(); td.textContent = v;
        td.style.cssText = "padding:6px;border:1px solid var(--line,#e5d9bf);font-size:13px;" +
          "vertical-align:top;" +
          (ci === 4 ? "text-align:right;white-space:pre-line;overflow-wrap:anywhere;"
                    : "text-align:center;") + (ci === 5 ? "color:var(--brand)" : "");
      });
      if (idx >= 0) tr.onclick = function () { editSession(own.id, idx, refresh); };
      else tr.onclick = function () { alert("الجلسة دي مش متسجّلة كجلسة في القضية (جاية من الملاحظات) — عدّلها من «ملاحظات القضية» أو أضفها بـ«+ إضافة جلسة»."); };
    });
    return { table: st, n: n };
  }

  function sessionsTableView(box, c, refresh) {
    var ssAsc = sessions(c);                 /* الأقدم أولاً — ترقيم متتابع */
    var noteSess = parseSessionsFromNotes(c.notes);
    if (!ssAsc.length && !noteSess.length) {
      box.appendChild(el("div", "color:var(--muted);font-size:13.5px;padding:8px 0",
                         "لا جلسات مسجَّلة."));
      return;
    }
    var cur = currentSession(c);
    var n = 0;
    sessionDegreeGroups(c).forEach(function (g) {
      if (!g.rows.length) return;
      if (g.label) {
        box.appendChild(el("div",
          "font-family:var(--f-title);color:var(--brand-dark);font-size:14px;margin:10px 0 6px",
          g.label));
      }
      var built = buildSessionsTable(g.rows, n, cur, c, refresh, g.owner);
      n = built.n;
      var wrap = el("div", "overflow-x:auto");
      wrap.appendChild(built.table);
      box.appendChild(wrap);
    });
    if (noteSess.length) {
      var wrap2 = el("div", "overflow-x:auto");
      var st2 = document.createElement("table");
      st2.style.cssText = "width:100%;min-width:520px;border-collapse:collapse;table-layout:fixed";
      var cg2 = document.createElement("colgroup");
      SESSION_TABLE_COLS.forEach(function (wv) {
        var col = document.createElement("col"); col.style.width = wv; cg2.appendChild(col);
      });
      st2.appendChild(cg2);
      noteSess.forEach(function (nsn) {
        n++;
        var cells = [ar(n), ar(nsn.roll), dayDate(nsn.date), "—", nsn.result, ""];
        var tr = st2.insertRow(); tr.style.background = "#fbf6ea";
        cells.forEach(function (v, ci) {
          var td = tr.insertCell(); td.textContent = v;
          td.style.cssText = "padding:6px;border:1px solid var(--line,#e5d9bf);font-size:13px;" +
            "vertical-align:top;color:#7a5a3a;" +
            (ci === 4 ? "text-align:right;white-space:pre-line;overflow-wrap:anywhere;"
                      : "text-align:center;");
        });
      });
      wrap2.appendChild(st2); box.appendChild(wrap2);
      box.appendChild(el("div", "font-size:12px;color:#7a5a3a;margin-top:5px;line-height:1.8",
        "الصفوف الفاتحة مُلتقَطة تلقائياً من ملاحظات القضية — تقدر تعدّلها يدوياً كجلسات."));
    }
  }

  /**
   * ترحيل القضية لجلسة جديدة، وتثبيت قرار الجلسة السابقة كاملاً معها.
   * منقولة عن syncPrev/forwardCase في أجندة المكتب.
   */
  function forward(c, from, oldNext) {
    c.sessions = c.sessions || [];

    function findByDate(d) {
      for (var i = 0; i < c.sessions.length; i++) {
        if (c.sessions[i].date === d) return i;
      }
      return -1;
    }

    /* الترحيل القديم يُزال ما دام فارغاً — لم تُدوَّن به جلسة بعد */
    if (oldNext && oldNext !== from.raw.next) {
      var j = findByDate(oldNext);
      if (j > -1) {
        var t = c.sessions[j];
        var tr = t.raw || {};
        /* بتتشال بس لو فاضية فعلاً: من غير قرار ولا ترحيل ولا رول ولا ملاحظة ولا نوع كتبه المستخدم */
        if (!resultOf(t) && !tr.next && !tr.roll && !tr.notes && !(tr.type && !tr.typeAuto)) c.sessions.splice(j, 1);
      }
    }

    var to = from.raw.next;
    if (!to) return;

    var carried = {
      prevDate:   from.date,
      prevType:   from.raw.type   || "",
      prevReason: reasonOf(from),
      prevResult: resultOf(from)
    };
    /* نوع الجلسة الجديدة من قرار الجلسة اللي قبلها: «حجز للحكم» لو اتحجزت للحكم (أو مد أجل الحكم)، وإلا «تأجيل».
       بيتكتب بس لو النوع فاضي أو كان متكتب تلقائياً قبل كده (typeAuto) — اللي المستخدم كتبه بإيده ما يتلمسش. */
    var autoType = nextTypeOf(from);

    var k = findByDate(to);
    if (k > -1) {
      var ex = c.sessions[k];
      ex.raw = ex.raw || {};
      Object.keys(carried).forEach(function (key) { ex.raw[key] = carried[key]; });
      if (!ex.raw.type || ex.raw.typeAuto) { ex.raw.type = autoType; ex.raw.typeAuto = true; }
    } else {
      var rec = { date: to, raw: { type: autoType, typeAuto: true, roll: "", result: "", next: "", "for": "" } };
      Object.keys(carried).forEach(function (key) { rec.raw[key] = carried[key]; });
      c.sessions.push(rec);
    }
  }
  var JUDGMENT_WORDS = ["حجز للحكم", "حجزت للحكم", "محجوزة للحكم", "للنطق بالحكم", "حجز الدعوى للحكم", "حجز الاستئناف للحكم",
                        "حجز الطعن للحكم", "مد اجل الحكم", "مد أجل الحكم", "مد أجل النطق", "للحكم"];
  function latDigits(t) {
    return String(t == null ? "" : t).replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x0660; })
      .replace(/[۰-۹]/g, function (d) { return d.charCodeAt(0) - 0x06F0; }).trim();
  }
  function nextTypeOf(from) {
    var T = norm(resultOf(from) + " " + reasonOf(from) + " " + ((from.raw && from.raw.decision) || ""));
    return containsAny(T, JUDGMENT_WORDS) ? "حجز للحكم" : "تأجيل";
  }

  /* ------------------------------------------------------- حقول القضية */

  var FIELDS = [
    { k: "fileNo",     label: "رقم الملف بالمكتب",
      note: "الرقم الذي يعرف به المكتب هذا الملف — هو مفتاح البحث الأول." },
    { k: "dealYear",   label: "سنة التعامل",
      note: "السنة التي دخل فيها الملف إلى المكتب، لا سنة رفع الدعوى." },
    { k: "status",     label: "الحالة",
      options: ["متداولة", "محجوزة للحكم", "خبير", "شطب", "وقف", "تنفيذ أحكام",
                "محكوم فيها", "مستأنفة", "منتهية", "محفوظة"],
      note: "موقف الدعوى اليوم — يحدّد لون شارة القضية." },
    { k: "courtLevel", label: "درجة التقاضي", cascade: "courtLevel" },
    { k: "courtName",  label: "المحكمة",       cascade: "courtName" },
    { k: "caseType",   label: "نوع الدعوى",    cascade: "caseType" },
    { k: "circuit",    label: "الدائرة",       cascade: "circuit" },
    { grp: "g_case", k: "caseNo",     label: "رقم الدعوى",
      note: "رقم قيد الدعوى في جدول المحكمة." },
    { grp: "g_case", narrow: true, k: "caseYear",   label: "سنة الدعوى",
      note: "سنة القيد. أمام الاستئناف والنقض تُكتب بالسنة القضائية — " +
            "و«ق» اختصار «قضائية»، مثل ٢٨ ق." },

    /* تظهر فقط حين تكون القضية بدرجة أعلى (استئناف/نقض) وجلساتها كلها
       مسجَّلة في هذا السجل نفسه — رقمها مختلف تماماً عن رقم الدعوى أعلاه،
       وهو رقمها الأصلي أمام محكمة أول درجة قبل الطعن. راجع
       [[feedback_session_degree_split]]. */
    { grp: "g_first", k: "firstNo",   label: "رقم الدعوى الابتدائية",
      note: "رقم قيدها الأصلي أمام محكمة أول درجة، قبل الطعن عليها." },
    { grp: "g_first", narrow: true, k: "firstYear", label: "لسنة",
      note: "سنة القيد أمام أول درجة." },

    { k: "subject",    label: "الموضوع",
      note: "موضوع الدعوى كما يُوصف في صحيفتها." },

    /* الجنائي: أرقامه ثلاثة لا رقم واحد */
    { crime: true, grp: "g_crime1", k: "crimeNo",    label: "رقم الجناية / الجنحة",
      note: "رقم قيدها في جدول النيابة أو المحكمة الجزئية." },
    { crime: true, grp: "g_crime1", narrow: true, k: "crimeYear",  label: "لسنة",
      note: "سنة قيد الجناية أو الجنحة." },
    { crime: true, grp: "g_crime2", k: "totalNo",    label: "كلي رقم",
      note: "رقم قيدها كلياً أمام المحكمة الكلية." },
    { crime: true, grp: "g_crime2", narrow: true, k: "totalYear",  label: "لسنة",
      note: "سنة القيد الكلي." },
    { crime: true, grp: "g_appeal", k: "appealKind", label: "استئناف",
      options: ["", "استئناف جنايات", "استئناف جنح"],
      note: "نوع الاستئناف إن كانت الدعوى مستأنفة." },
    { crime: true, grp: "g_appeal", k: "appealNo",   label: "رقم الاستئناف",
      note: "رقم قيد الاستئناف." },
    { crime: true, grp: "g_appeal", narrow: true, k: "appealYear", label: "لسنة",
      note: "سنة قيد الاستئناف." },

    { grp: "g_venue", k: "hall",       label: "القاعة",
      note: "رقم قاعة الانعقاد داخل المحكمة." },
    { grp: "g_venue", k: "floor",      label: "الدور",
      note: "دور القاعة في مبنى المحكمة." },
    { grp: "g_venue", k: "time",       label: "الميعاد", options: ["صباحي", "مسائي"],
      note: "وقت انعقاد الجلسة." },
    { k: "loc",        label: "مقر المحكمة", multi: true,
      note: "عنوان المبنى — يعين على الوصول يوم الجلسة." },
    { k: "lawyer",     label: "المحامي المكلَّف", suggest: true,
      note: "محامي المكتب المسؤول عن الحضور والمتابعة." },
    { k: "collab",     label: "محامون متعاونون (إيميل)", ltr: true,
      note: "محامي من خارج المكتب بينّا تعاون على القضية دي: اكتب إيميله (ولو أكتر من واحد افصل بمسافة أو فاصلة). " +
            "هيشوف القضية دي بس — للقراءة — على بوابة الموقع hamlf.com بعد ما يأكّد إيميله." },
    { k: "clients",    label: "الموكلون", multi: true,
      note: "افصل بين الأسماء بـ ·  وصفة كلٍّ بين قوسين — مثال: أحمد (مدعٍ)." },
    { k: "opponents",  label: "الخصوم", multi: true,
      note: "افصل بين الأسماء بـ ·  وصفة كلٍّ بين قوسين." },
    /* الحكم ومواعيد الطعن — لا ترحيل تلقائي للدرجة الأعلى (يدوي) */
    { k: "judgeDate",    label: "تاريخ الحكم القطعي", date: true,
      note: "يوم النطق بالحكم القطعي — منه يُحسب ميعاد الطعن (العد من اليوم التالي)." },
    { k: "judgeType",    label: "نوع الحكم",
      options: ["", "حضوري شخصي", "حضوري توكيل", "حضوري اعتباري", "غيابي"],
      note: "حضوري شخصي · حضوري توكيل · حضوري اعتباري · غيابي." },
    { k: "appealPeriod", label: "ميعاد الطعن (بالأيام — أقصاه ٦٠)",
      note: "اكتب عدد الأيام — مثال ٤٠ أو ٦٠. لو سبتها فاضية بيتحسب الميعاد القانوني." },

    /* §1أ عدّاد الشطب/الوقف — تاريخ الحالة ومدتها بالأيام */
    { k: "holdDate",   label: "تاريخ الشطب / الوقف", date: true,
      note: "يوم الشطب أو الوقف — منه يُحسب العدّاد." },
    { k: "holdDays",   label: "المدة (أيام)",
      note: "للشطب: مدة التجديد · للوقف: مدة التعجيل." }

    /* حقل «ملاحظات» النصي القديم أُزيل من هنا ومن LAYOUT معاً — استُبدل بسجل
       الملاحظات المؤرَّخ (c.noteLog، يُرحَّل تلقائياً أعلى هذه الدالة). إبقاؤه
       هنا وحده دون سطر في LAYOUT كان يعطّل الحفظ بالكامل: FIELDS.forEach في
       save() كان يقرأ inputs.notes.value رغم عدم بناء عنصر إدخال له أبداً. */
  ];

  /* حقول الجلسة — بأسماء أجندة المكتب نفسها حتى تتطابق القاعدتان */
  var SESSION_FIELDS = [
    { k: "date",   label: "تاريخ الجلسة", date: true,
      note: "يوم انعقاد الجلسة — مثال ٢٠٢٦/١٠/١٥." },
    { k: "type",   label: "نوع الجلسة", sessionKey: true,
      options: ["مرافعة", "تحضير", "تسوية أسرة", "فض منازعات", "تحكيم", "حكمين",
                "خبراء", "تحقيق قضائي", "حجز للحكم", "حكم", "وقف تنفيذ", "موضوعي",
                "تجديد حبس", "غرفة مشورة", "تأجيل", "تحقيق", "خبير"] },
    { k: "roll",   label: "رقم الرول",
      note: "تسلسل القضية في جدول جلسة ذلك اليوم." },
    { k: "result", label: "ما تم بالجلسة / القرار", multi: true, suggest: true,
      suggestAlso: ["for"],   /* يستكمل قائمة الاقتراحات القديمة لحقل "سبب التأجيل" المدموج هنا */
      note: "سبب التأجيل أو القرار أو ما تم فيها — يظهر في تتابع الجلسات، ويُنقل كاملاً للجلسة المؤجَّل إليها." },
    { k: "next",   label: "الجلسة الجديدة (تأجّلت لجلسة)", date: true,
      note: "بمجرد كتابته تُرحَّل القضية لذلك اليوم، ويُثبَّت معها قرار هذه الجلسة كاملاً." }
  ];

  /** القرار قد يكون مخزَّناً باسم result أو decision حسب مصدر البيانات. */
  function resultOf(sn) {
    var r = sn && sn.raw ? sn.raw : {};
    return r.result || r.decision || r["for"] || r.reason || "";
  }
  function reasonOf(sn) {
    var r = sn && sn.raw ? sn.raw : {};
    return r["for"] || r.reason || "";
  }


  /* ----------------------------------------------- القيم المستعملة فعلاً

     القوائم الثابتة لا تسع كل ما يمرّ بالمكتب، فتُغذَّى بما هو مستعمل في
     القضايا نفسها — ومعها دائماً خيار الكتابة اليدوية. */

  var _used = {};

  function usedValues(key, inSession) {
    if (_used[key]) return _used[key];
    var seen = {};
    read().forEach(function (c) {
      if (inSession) {
        (c.sessions || []).forEach(function (sn) {
          var v = ((sn.raw || {})[key] || "").trim();
          if (v) seen[v] = (seen[v] || 0) + 1;
        });
      } else {
        var v = String(c[key] == null ? "" : c[key]).trim();
        if (v) seen[v] = (seen[v] || 0) + 1;
      }
    });
    _used[key] = Object.keys(seen).sort(function (a, b) { return seen[b] - seen[a]; });
    return _used[key];
  }

  function forgetUsed() { _used = {}; }


  /* ------------------------------------------- الدعوى الفرعية والمنضمة

     منقولة عن أجندة المكتب (makeLinked / detectLinked): الفرعية تُرفع في
     الدعوى نفسها فتأخذ رقمها وسنتها، والمنضمة دعوى مستقلة تُضمّ للنظر
     فرقمها مختلف. وفي الحالتين الجلسات واحدة — جلسات الدعوى الأصلية —
     فلا تُدوَّن مرتين. */

  var LINK_COPY = ["fileNo", "dealYear", "lawyer", "status", "courtLevel",
                   "courtName", "caseType", "circuit", "time", "floor", "hall", "loc"];

  /* نفس مجموعة LINK_COPY تقريباً (الحقول اللي عادة تتكرر من قضية للتانية)
     بلا fileNo/dealYear (لهما اقتراح خاص أدق: تسلسلي وسنة اليوم) ولا loc
     (مقر المحكمة له اقتراح خاص عبر Courts.setAddress بالفعل). */
  var LAST_NEW_CASE_FIELDS = ["lawyer", "status", "courtLevel", "courtName",
                              "caseType", "circuit", "time", "floor", "hall"];

  /** يُسقط الصفة بين القوسين ويُبقي الاسم — الصفة تُدرَج يدوياً */
  function namesOnly(txt) {
    return String(txt || "").split("·")
      .map(function (p) { return p.replace(/\([^)]*\)/g, "").trim(); })
      .filter(Boolean).join(" · ");
  }

  /** صفة الخصم المقابلة لصفة الموكل المختارة — للأزواج الشائعة فقط؛ غير
      ذلك تُترك فارغة (الخصم بلا صفة، كالسابق) بدل تخمين غير موثوق. */
  var OPPOSITE_CAP = {
    "مستأنف": "مستأنف ضده", "طاعن": "مطعون ضده", "مدعي": "مدعى عليه",
    "مستشكل": "مستشكل ضده", "متظلم": "متظلم ضده", "شاكي": "مشكو في حقه",
    "دائن": "مدين"
  };
  function oppositeCap(cap) {
    var n = norm(cap || "");
    var hit = Object.keys(OPPOSITE_CAP).filter(function (k) { return norm(k) === n; })[0];
    return hit ? OPPOSITE_CAP[hit] : "";
  }
  function withCap(namesTxt, cap) {
    if (!cap) return namesTxt;
    return String(namesTxt || "").split("·").map(function (p) { return p.trim(); })
      .filter(Boolean).map(function (nm) { return nm + " (" + cap + ")"; }).join(" · ");
  }

  /** capacity: صفة اختارها المستخدم للطرف (الموكل) في الدعوى الجديدة —
      راجع docs/خطة-خط-السير-ودرجة-التقاضي-2026-11-02.md بند ٥. لو غابت
      (اختصار قديم بلا اختيار) يُرجَع لحساب partyDirection التلقائي كما كان. */
  function makeLinked(c, kind, capacity) {
    var dir = capacity ? (containsAny(norm(capacity), ["ضده"]) ? "ضده" : "منه") : partyDirection(c);
    var n = {
      id: "lk" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36),
      kind: kind, linkedTo: c.id, direction: dir,
      clients: capacity ? withCap(namesOnly(c.clients), capacity) : namesOnly(c.clients),
      opponents: capacity ? withCap(namesOnly(c.opponents), oppositeCap(capacity)) : namesOnly(c.opponents),
      subject: "",                       /* موضوع الفرعية يُدرَج يدوياً */
      notes: (kind === "فرعية" ? "دعوى فرعية في " : "دعوى منضمة إلى ") +
             "الدعوى " + (c.caseNo || "—") + (c.caseYear ? " لسنة " + c.caseYear : "") +
             (dir ? " — مرفوعة " + dir : ""),
      sessions: []                       /* الجلسات تُقرأ من الأصلية */
    };
    LINK_COPY.forEach(function (k) { n[k] = c[k] || ""; });

    if (kind === "فرعية") {              /* نفس رقم الدعوى والسنة */
      n.caseNo = c.caseNo || "";
      n.caseYear = c.caseYear || "";
    } else {                             /* منضمة: رقم مختلف يُدرَج يدوياً */
      n.caseNo = "";
      n.caseYear = "";
    }
    return n;
  }

  /** الدعوى الأصلية لدعوى مرتبطة، أو هي نفسها. */
  function rootOf(c) {
    if (!c || !c.linkedTo) return c;
    return read().filter(function (x) { return x.id === c.linkedTo; })[0] || c;
  }

  function linkedTo(c) {
    return read().filter(function (x) { return x.linkedTo === c.id; });
  }

  /** سلسلة درجات التقاضي الكاملة لهذه القضية (الأقدم أولاً)، عبر
      promotedFrom/promotedTo — سلسلة خطّية عادةً (جزئي←ابتدائي←استئناف←نقض). */
  function familyChain(c) {
    var list = read();
    function byId(id) { return list.filter(function (x) { return x.id === id; })[0]; }
    var root = c;
    while (root && root.promotedFrom) {
      var p = byId(root.promotedFrom);
      if (!p) break;
      root = p;
    }
    var chain = [root];
    var cur = root;
    var guard = 0;
    while (guard++ < 20) {
      var next = list.filter(function (x) { return x.promotedFrom === cur.id; })[0];
      if (!next) break;
      chain.push(next);
      cur = next;
    }
    return chain;
  }

  /** ينشئ الدعوى المرتبطة ويحفظها، ويعيدها. */
  /** capacity اختياري (نص الصفة) — دعماً للاستدعاء القديم بلا صفة (ثلاثة
      معاملات)، لو الوسيط الثالث دالة نعتبره done مباشرةً. */
  function addLinked(caseId, kind, capacity, done) {
    if (typeof capacity === "function") { done = capacity; capacity = ""; }
    var list = read();
    var c = list.filter(function (x) { return x.id === caseId; })[0];
    if (!c) return;
    var n = makeLinked(c, kind, capacity);
    list.push(n);
    if (!write(list, n.id)) return;
    forgetUsed();
    if (done) done(n);
  }

  /** اختيار صفة الطرف قبل إنشاء الدعوى الفرعية/المنضمة — يستبدل سطر
      الأزرار مؤقتاً بقائمة صفات (نفس قائمة صفات الموكل) + تأكيد/إلغاء،
      بدل الاعتماد حصرياً على partyDirection المحسوبة تلقائياً.
      راجع [[docs/خطة-خط-السير-ودرجة-التقاضي-2026-11-02.md]] بند ٥. */
  function linkedCapacityPicker(parent, rootCase, kind, onCreated) {
    var caps = w.Lists ? Lists.get("partyCapsClient") : [];
    var wrap = el("div",
      "background:var(--bg,#f4ece0);border-radius:11px;padding:11px 13px;margin-bottom:10px");
    wrap.appendChild(el("div",
      "font-family:var(--f-title);font-size:13.5px;color:var(--brand-dark);margin-bottom:7px",
      "صفة الطرف في " + (kind === "فرعية" ? "الدعوى الفرعية" : "الدعوى المنضمة") + " الجديدة"));
    var sel = document.createElement("select");
    sel.style.cssText = "width:100%;min-height:44px;font-size:14.5px;padding:7px 9px;" +
      "border:1px solid var(--line,#ddd);border-radius:9px;background:var(--card);" +
      "font-family:inherit;direction:rtl;text-align:right;margin-bottom:9px";
    var optBlank = document.createElement("option");
    optBlank.value = ""; optBlank.textContent = "(بلا صفة — كما كانت)";
    sel.appendChild(optBlank);
    caps.forEach(function (cp) {
      var o = document.createElement("option");
      o.value = cp; o.textContent = cp;
      sel.appendChild(o);
    });
    wrap.appendChild(sel);
    var ok = btn("تأكيد وإنشاء", "border:0;background:var(--brand);color:#fff");
    var cancel = btn("إلغاء", "border:1px solid var(--line,#ddd);background:transparent;color:var(--muted)");
    ok.onclick = function () {
      addLinked(rootCase.id, kind, sel.value, function (n) { onCreated(n); });
    };
    cancel.onclick = function () { wrap.remove(); };
    row(wrap, [ok, cancel]);
    parent.appendChild(wrap);
    return wrap;
  }

  /* §5 الترحيل لدرجة أعلى — نسخٌ لا نقل، بدرجة تالية حسب تسلسل ثابت. */
  function nextLevel(lvl) {
    var n = norm(lvl);
    function has(x) { return n.indexOf(norm(x)) >= 0; }
    if (has("جزئي")) return "ابتدائي";
    if (has("ابتدائي")) return "استئناف";
    if (has("اقتصادي") && has("استئناف")) return "نقض";
    if (has("اقتصادي")) return "استئناف اقتصادي";
    if (has("استئناف")) return "نقض";
    if (has("تاديبي") || (has("اداري") && !has("قضاء") && !has("عليا"))) return "قضاء إداري";
    if (has("قضاء اداري")) return "الإدارية العليا";
    return "";
  }
  /** يحاول مطابقة الكلمة بدرجة فعلية من قاعدة المحاكم، وإلا يعيدها كما هي. */
  function resolveLevel(keyword) {
    if (!keyword || !w.Courts || !Courts.levels) return keyword;
    var hit = Courts.levels().filter(function (L) {
      return norm(L).indexOf(norm(keyword)) >= 0;
    })[0];
    return hit || keyword;
  }
  function buildPromoted(c) {
    var target = resolveLevel(nextLevel(c.courtLevel));
    return {
      id: "pr" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36),
      fileNo: c.fileNo || "", dealYear: c.dealYear || "",
      lawyer: c.lawyer || "", subject: c.subject || "",
      clients: namesOnly(c.clients), opponents: namesOnly(c.opponents),
      courtLevel: target, courtName: "", caseType: "", circuit: "",
      caseNo: "", caseYear: "", status: "متداولة",
      hall: "", floor: "", time: "", loc: "",
      promotedFrom: c.id,   /* يربط سلسلة درجات التقاضي (§4 تتابع الجلسات) */
      notes: "مُرحَّلة من درجة: " + (c.courtLevel || "—") +
             (c.caseNo ? " — الدعوى " + c.caseNo + (c.caseYear ? " لسنة " + c.caseYear : "") : ""),
      sessions: []
    };
  }
  function promote(caseId, done) {
    var list = read();
    var c = list.filter(function (x) { return x.id === caseId; })[0];
    if (!c) return;
    var n = buildPromoted(c);
    list.push(n);
    if (!write(list, n.id)) return;
    forgetUsed();
    if (done) done(n);
  }

  /* ===== الحكم القطعي ← درجة التقاضي الأعلى (طلب المستخدم ٦-١٠) =====
     قرار الحكم القطعي بيبدأ بـ«حكمت المحكمة:» (وبيتعلّم raw.judgment = "قطعي")، وأي جلسة بعده
     بتبقى أمام الدرجة الأعلى: بتتنقل لسجل الدرجة الأعلى بنفس رقم الملف (بيتعمل لو مش موجود
     بـ promotedFrom)، وسجل أول درجة بيبقى «منتهية». */
  var FINAL_RE = /^\s*حكمت\s+المحكم[ةه]/;
  function isFinalJudgment(s0) {
    if (!s0) return false;
    var r = s0.raw || {};
    return r.judgment === "قطعي" || FINAL_RE.test(String(r.result || r.decision || ""));
  }
  function finalJudgmentOf(c) {
    return (c.sessions || []).filter(function (x) { return x && x.date && isFinalJudgment(x); })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }).pop() || null;
  }
  function sessionsAfterJudgment(c) {
    var J = finalJudgmentOf(c);
    if (!J) return [];
    return (c.sessions || []).filter(function (x) { return x && x.date && x.date > J.date; });
  }
  /** ينقل الجلسات اللي بعد الحكم القطعي لسجل الدرجة الأعلى — ويرجّع السجل ده */
  function moveAfterJudgment(caseId) {
    var list = read();
    var c = list.filter(function (x) { return x.id === caseId; })[0];
    if (!c) return null;
    var J = finalJudgmentOf(c);
    if (!J) return null;
    var after = c.sessions.filter(function (x) { return x && x.date && x.date > J.date; });
    if (!after.length) return null;
    var hi = list.filter(function (x) { return x.promotedFrom === c.id; })[0];
    var made = !hi;
    if (!hi) { hi = buildPromoted(c); list.push(hi); }
    hi.sessions = (hi.sessions || []);
    var have = {};
    hi.sessions.forEach(function (x) { have[x.date] = 1; });
    after.forEach(function (x) { if (!have[x.date]) hi.sessions.push(x); });
    hi.sessions.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    c.sessions = c.sessions.filter(function (x) { return after.indexOf(x) < 0; });
    if (J.raw && J.raw.next) J.raw.next = "";
    if (AUTO_STATUS[String(c.status || "").trim()] || c.statusAuto) { c.status = "منتهية"; delete c.statusAuto; }
    var d = new Date().toISOString().slice(0, 10);
    (c.noteLog = c.noteLog || []).push({ date: d, text: "الحكم القطعي " + dayDate(J.date) + " ← " + ar(after.length) +
      " جلسة بعده اتنقلت لدرجة التقاضي الأعلى (" + (hi.courtLevel || "—") + ")" + (made ? " — سجل جديد بنفس رقم الملف" : "") + "." });
    (hi.noteLog = hi.noteLog || []).push({ date: d, text: "جلسات بعد الحكم القطعي في أول درجة (" + dayDate(J.date) + ") اتنقلت هنا تلقائياً." });
    if (!write(list, c.id)) return null;
    pushChangedToCloud(list, hi.id);
    return hi;
  }

  /* القرار الذي يشير إلى فرعية أو ضمّ — نصوص أجندة المكتب نفسها */
  var RE_SUB  = /رسم\s*الدعوى\s*الفرعية|الدعوى\s*الفرعية\s*والإعلان/;
  var RE_JOIN = /لنظرها\s*مع\s*أخرى\s*للارتباط|للارتباط\s*بالدعوى|ضمها|لضمها/;

  function detectLinked(text) {
    var t = String(text || "");
    if (RE_SUB.test(t))  return "فرعية";
    if (RE_JOIN.test(t)) return "منضمة";
    return null;
  }

  /* ------------------------------------------------------ عناصر الواجهة */

  function sheet(z) {
    var back = el("div",
      "position:fixed;inset:0;background:rgba(20,14,8,.62);z-index:" + (z || 10010) + ";" +
      "display:flex;flex-direction:column;justify-content:flex-end;align-items:stretch");
    back.setAttribute("data-modal", "1");
    back.setAttribute("data-nosave", "1");
    /* الكارت يتمرّر داخلياً: min-height:0 يرفع قيد flex فيعمل overflow-y */
    var box = el("div",
      "width:100%;max-width:620px;margin:0 auto;min-height:0;max-height:92vh;" +
      "overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;" +
      "background:var(--card,#fff);border-radius:18px 18px 0 0;" +
      "padding:18px 18px 40px;direction:rtl;color:var(--text)");
    back.appendChild(box);

    /* قفل تمرير الخلفية حتى لا تتحرّك القائمة خلف الكارت */
    var ph = document.querySelector(".phone");
    var dEl = document.documentElement;
    var prevH = dEl.style.overflow, prevB = document.body.style.overflow,
        prevP = ph ? ph.style.overflow : "";
    dEl.style.overflow = "hidden"; document.body.style.overflow = "hidden";
    if (ph) ph.style.overflow = "hidden";
    function unlock() {
      dEl.style.overflow = prevH; document.body.style.overflow = prevB;
      if (ph) ph.style.overflow = prevP;
    }

    var origRemove = back.remove.bind(back);
    back.remove = function () { unlock(); origRemove(); };

    /* بلا هذا كان زر الرجوع في أندرويد (وأحياناً النقر خارج البطاقة بالغلط)
       يُغلق البطاقة فوراً بلا سؤال، فتُفقد كل البيانات المكتوبة قبل الحفظ.
       الآن يُسأل المستخدم صريحاً أولاً — نفس أسلوب wireSheet في
       clients-poa.js. mobile.js يبحث عن __lawyerDismiss في كل عنصر
       [data-modal="1"] عند ضغط زر الرجوع. */
    function confirmExit() {
      if (w.Ask && Ask.confirm) {
        Ask.confirm("الخروج بدون حفظ؟ أي بيانات كتبتها الآن ستُفقد.",
          { ok: "خروج بدون حفظ", cancel: "البقاء في الشاشة", danger: true },
          function () { if (back.__onDiscard) back.__onDiscard(); back.remove(); });
      } else if (window.confirm("الخروج بدون حفظ؟ أي بيانات كتبتها الآن ستُفقد.")) {
        if (back.__onDiscard) back.__onDiscard();
        back.remove();
      }
    }
    back.__lawyerDismiss = function () { confirmExit(); return true; };
    back.onclick = function (e) { if (e.target === back) confirmExit(); };

    document.body.appendChild(back);
    return { back: back, box: box };
  }

  function head(box, txt, css) {
    box.appendChild(el("div",
      css || "font-family:var(--f-title);font-size:18px;margin-bottom:10px", txt));
  }

  /* لوحة اقتراحات لحقل نصّي حر (بديل <input list=datalist> الأصلي) — كانت
     تفتح كنافذة كاملة تغطّي الكيبورد وتختار خطأً باللمس. نفس أسلوب
     people-suggest.js: صندوق صغير تحت الحقل، سحب = تمرير، نقرة = اختيار،
     ويُعاد بناء القائمة من مصدرها الحيّ (usedValues) في كل فتحة. */
  var _suggestOpen = null;
  /* opts (اختياري): {minWords, prefix, maxWords, meta(v)→[شارات]} — للموكلين: لا نتائج قبل كلمتين،
     مطابقة من بداية الاسم، والإدراج حتى الكلمة الثالثة فقط، وشارات التليفون/الإيميل/التوكيل. */
  function suggestPanel(inp, getValues, opts) {
    opts = opts || {};
    function norm(t) { return window.lawyerNorm(t); }
    var panel = document.createElement("div");
    panel.setAttribute("data-nosave", "1");
    panel.style.cssText =
      "position:fixed;z-index:9500;background:#fff;border:1px solid #ddd4c8;border-radius:10px;" +
      "overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;" +
      "max-height:min(40vh,280px);box-shadow:0 8px 26px rgba(60,40,20,.22);display:none";
    document.body.appendChild(panel);

    var blurTimer = null;
    panel.addEventListener("pointerdown", function () {
      if (blurTimer) { clearTimeout(blurTimer); blurTimer = null; }
    });

    function positionPanel() {
      var r = inp.getBoundingClientRect();
      var vh = window.innerHeight || document.documentElement.clientHeight;
      var maxH = Math.min(280, vh * 0.4);
      panel.style.left = r.left + "px";
      panel.style.width = r.width + "px";
      var below = vh - r.bottom;
      if (below < Math.min(maxH, 170) && r.top > below) {
        panel.style.top = "auto";
        panel.style.bottom = (vh - r.top + 4) + "px";
        panel.style.maxHeight = Math.max(120, Math.min(maxH, r.top - 10)) + "px";
      } else {
        panel.style.bottom = "auto";
        panel.style.top = (r.bottom + 4) + "px";
        panel.style.maxHeight = Math.max(120, Math.min(maxH, below - 10)) + "px";
      }
    }

    function close() {
      panel.style.display = "none";
      if (_suggestOpen === close) _suggestOpen = null;
    }

    function render(filter) {
      var q = norm(filter);
      var list = getValues() || [];
      var shown;
      if (opts.minWords && (!q || q.split(" ").length < opts.minWords)) shown = [];
      else shown = q ? list.filter(function (v) {
        var nv = norm(v);
        return opts.prefix ? nv.indexOf(q) === 0 : nv.indexOf(q) >= 0;
      }) : list;
      if (opts.maxWords) {                      /* الاسم يُدرَج حتى الكلمة N فقط، بلا تكرار */
        var cut = {}, cutList = [];
        shown.forEach(function (v) {
          var t = String(v).trim().split(/\s+/).slice(0, opts.maxWords).join(" ");
          var k = norm(t);
          if (!cut[k]) { cut[k] = 1; cutList.push({ full: v, text: t }); }
        });
        shown = cutList;
      } else shown = shown.map(function (v) { return { full: v, text: v }; });
      panel.innerHTML = "";
      shown.slice(0, 80).forEach(function (item) {
        var v = item.text;
        var row = document.createElement("button");
        row.type = "button";
        row.style.cssText =
          "display:block;width:100%;text-align:right;padding:12px 14px;border:0;" +
          "border-bottom:1px solid #f4efe6;font-family:inherit;font-size:15px;" +
          "min-height:46px;direction:rtl;background:#fff;color:#3d2614";
        row.textContent = v;
        if (opts.meta) {
          var chips = opts.meta(item.full) || [];
          if (chips.length) {
            var cs = document.createElement("span");
            cs.style.cssText = "display:block;font-size:12px;color:#7d6f60;margin-top:2px";
            cs.textContent = chips.join("  ·  ");
            row.appendChild(cs);
          }
        }
        var sy0 = 0, movd = false;
        row.addEventListener("pointerdown", function (e) { sy0 = e.clientY; movd = false; });
        row.addEventListener("pointermove", function (e) {
          if (Math.abs(e.clientY - sy0) > 8) movd = true;
        });
        row.addEventListener("pointerup", function (e) {
          if (movd) return;
          e.preventDefault();
          inp.value = v;
          inp.dispatchEvent(new Event("input", { bubbles: true }));
          close();
        });
        panel.appendChild(row);
      });
      return shown.length;
    }

    function open(filter) {
      if (_suggestOpen && _suggestOpen !== close) _suggestOpen();
      var n = render(filter || "");
      if (!n) { close(); return; }
      panel.style.display = "block";
      positionPanel();
      panel.scrollTop = 0;
      _suggestOpen = close;
      if (!panel._onScroll) {
        panel._onScroll = function () { if (panel.style.display === "block") positionPanel(); };
        window.addEventListener("scroll", panel._onScroll, true);
        window.addEventListener("resize", panel._onScroll);
      }
      if (!panel._onDocDown) {
        panel._onDocDown = function (e) {
          if (panel.style.display !== "block") return;
          if (inp.contains(e.target) || panel.contains(e.target)) return;
          close();
        };
        document.addEventListener("pointerdown", panel._onDocDown, true);
      }
    }

    inp.setAttribute("autocomplete", "off");
    inp.addEventListener("focus", function () { open(inp.value); });
    inp.addEventListener("input", function () { open(inp.value); });
    inp.addEventListener("blur", function () {
      blurTimer = setTimeout(function () { blurTimer = null; close(); }, 150);
    });
  }

  /* قفل الحقل بزر ✎ — نفس نمط قفل حقول الموكل (clients-poa.js) لمنع
     حفظ قيمة غير مقصودة لحقل لم يقصد المستخدم لمسه أثناء تعديل حقل آخر.
     لا يعتمد على readOnly/disabled الداخلية للعنصر (بل على pointer-events)
     حتى يعمل بشكل موحّد فوق أي نوع حقل (نص، textarea، select، والتبديل
     اليدوي داخل حقول القوائم) دون تعديل منطق كل نوع على حدة، ودون أن
     يتأثر قراءة .value وقت الحفظ (save.onclick يقرأ القيمة بغض النظر
     عن حالة القفل). */
  function lockToggle(target) {
    var btnEl = document.createElement("button");
    btnEl.type = "button"; btnEl.textContent = "✎";
    btnEl.title = "اضغط لتعديل هذا الحقل";
    btnEl.style.cssText = "flex:0 0 auto;min-width:40px;min-height:40px;border-radius:8px;" +
      "border:1px solid var(--brand);background:transparent;color:var(--brand);" +
      "font-size:15px;margin-inline-start:6px";
    btnEl.onclick = function () {
      target.style.pointerEvents = "";
      target.style.opacity = "";
      target.style.background = "";
      var firstInput = target.querySelector("input,textarea,select");
      if (firstInput) firstInput.focus();
      btnEl.disabled = true;
      btnEl.style.opacity = ".35";
    };
    return btnEl;
  }
  function lockWrap(g, contentEl, locked) {
    if (!locked) { g.appendChild(contentEl); return; }
    contentEl.style.pointerEvents = "none";
    contentEl.style.opacity = ".65";
    contentEl.style.background = "#f3efe6";
    var row = el("div", "display:flex;align-items:flex-start");
    contentEl.style.flex = "1 1 auto";
    row.appendChild(contentEl);
    row.appendChild(lockToggle(contentEl));
    g.appendChild(row);
  }

  function field(box, def, value, locked) {
    var g = el("div", "margin-bottom:12px");
    var l = el("label", "display:block;font-family:var(--f-title);font-size:14px;" +
                        "margin-bottom:5px;color:var(--brand-dark)", def.label);
    if (def.k) l.id = "cf_lbl_" + def.k;
    g.appendChild(l);

    var cur = String(value == null ? "" : value);
    var CSS = "width:100%;min-height:48px;font-size:16px;padding:10px 12px;" +
      "border:1px solid var(--line,#ddd);border-radius:9px;background:var(--card);" +
      "font-family:inherit;direction:rtl;text-align:right";

    var MANUAL = "__manual__";
    var input;

    function autogrow(t) {
      function fit() { t.style.height = "auto"; t.style.height = (t.scrollHeight + 2) + "px"; }
      t.addEventListener("input", fit);
      setTimeout(fit, 0);
    }
    function textInput(v) {
      var t = document.createElement(def.multi ? "textarea" : "input");
      if (def.multi) { t.rows = 2; t.value = v || ""; t.style.overflow = "hidden"; }
      else if (def.date) {
        /* تقويمٌ للاختيار — كما طلب المكتب: أي حقل تاريخ يفتح تقويماً.
           لا نضع data-date-kind هنا: datepicker.js يستخدم نفس هذه السمة
           بالذات علامةً على أنه «حوَّل الحقل بالفعل» — ووضعها هنا مسبقاً
           كان يجعله يتجاهل الحقل ظنّاً منه أنه تحوَّل، فيبقى حقل تاريخ
           أصلي غير منسَّق بلا تقويمنا المخصَّص ولا حفظ صحيح. */
        t.type = "date";
        t.value = (w.lawyerToISO ? (w.lawyerToISO(v) || "") : (v || ""));
      } else { t.type = "text"; t.value = v || ""; }
      if (def.k) t.id = "cf_" + def.k;      /* معرّف لكل حقل (لا للـselect فقط) */
      if (def.ltr) {
        /* إيميلات: data-latin يمنع تحويل الأرقام لهندي أثناء الكتابة */
        t.setAttribute("lang", "en"); t.setAttribute("dir", "ltr"); t.setAttribute("data-latin", "1");
        t.setAttribute("inputmode", "email"); t.setAttribute("autocapitalize", "off");
      } else {
        t.setAttribute("lang", "ar");
        t.setAttribute("dir", "rtl");
      }
      t.style.cssText = CSS;
      if (def.multi) autogrow(t);
      return t;
    }

    if (def.options) {
      /* قائمة تتعلَّم من الاستعمال، وفيها دائماً إضافة يدوية */
      var pool = def.options.slice();
      usedValues(def.k, !!def.sessionKey).forEach(function (v) {
        if (pool.indexOf(v) < 0) pool.push(v);
      });
      if (cur && pool.indexOf(cur) < 0) pool.unshift(cur);

      var sel = document.createElement("select");
      sel.id = "cf_" + def.k;
      sel.style.cssText = CSS;

      function fillSelect(extra) {
        sel.textContent = "";
        var list = pool.slice();
        if (extra && list.indexOf(extra) < 0) list.unshift(extra);
        var blank = document.createElement("option");
        blank.value = ""; blank.textContent = "— غير محدَّد —";
        sel.appendChild(blank);
        list.forEach(function (o) {
          var op = document.createElement("option");
          op.value = o; op.textContent = o;
          sel.appendChild(op);
        });
        var man = document.createElement("option");
        man.value = MANUAL;
        man.textContent = "✎ إضافة يدوية…";
        sel.appendChild(man);
      }
      fillSelect();
      sel.value = cur;

      var holder = el("div");
      holder.appendChild(sel);
      lockWrap(g, holder, locked);

      /* الحقل المُعاد للمُنادي: قيمته هي المختارة أو المكتوبة يدوياً */
      input = { value: cur, focus: function () { sel.focus(); } };

      function toManual(start) {
        var t = textInput(start);
        t.placeholder = "اكتب " + def.label + "…";
        var back = el("button", "margin-top:7px;padding:9px 14px;border-radius:9px;" +
          "border:1px solid var(--line,#ddd);background:transparent;color:var(--brand);" +
          "font-family:inherit;font-size:13px;min-height:40px", "↩ اختيار من القائمة");
        back.type = "button";

        holder.textContent = "";
        holder.appendChild(t);
        holder.appendChild(back);
        t.oninput = function () { input.value = t.value.trim(); };
        input.focus = function () { t.focus(); };
        input.value = (start || "").trim();
        setTimeout(function () { t.focus(); }, 60);

        back.onclick = function () {
          holder.textContent = "";
          holder.appendChild(sel);
          fillSelect(input.value);
          sel.value = pool.indexOf(input.value) >= 0 ? input.value : "";
          input.value = sel.value;
          input.focus = function () { sel.focus(); };
        };
      }

      sel.onchange = function () {
        if (sel.value === MANUAL) { sel.value = ""; toManual(""); return; }
        input.value = sel.value;
      };

    } else {
      input = textInput(cur);
      if (def.suggest) suggestPanel(input, function () {
        var vals = usedValues(def.k, !!def.sessionKey);
        (def.suggestAlso || []).forEach(function (k2) {
          usedValues(k2, !!def.sessionKey).forEach(function (v) {
            if (vals.indexOf(v) < 0) vals.push(v);
          });
        });
        return vals;
      });
      lockWrap(g, input, locked);
    }

    if (def.note) {
      g.appendChild(el("div",
        "font-size:12.5px;color:var(--muted);margin-top:4px;line-height:1.8", def.note));
    }
    box.appendChild(g);
    return input;
  }

  function btn(label, css) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.style.cssText = "flex:1;padding:14px;border-radius:11px;font-family:inherit;" +
                      "font-size:16px;min-height:52px;" + css;
    return b;
  }

  function row(box, kids, css) {
    var r = el("div", "display:flex;gap:9px;" + (css || "margin-top:14px"));
    kids.forEach(function (k) { r.appendChild(k); });
    box.appendChild(r);
    return r;
  }


  /* ------------------------------------------ تسلسل المحاكم في المحرِّر

     أربع قوائم مترابطة: كل واحدة تُملأ ممّا يقع تحت ما قبلها، وتغيير
     الأعلى يعيد بناء ما تحته. وما يُضاف يدوياً يُحفظ في موضعه من التسلسل
     (Courts.remember) فيظهر في كل مرة بعدها. */

  var CASCADE_ORDER = ["courtLevel", "courtName", "caseType", "circuit"];

  function optionsFor(field, ctx) {
    if (!w.Courts) return [];
    if (field === "courtLevel") return Courts.levels();
    if (field === "courtName")  return Courts.courtsOf(ctx.courtLevel);
    if (field === "caseType")   return Courts.typesOf(ctx.courtLevel, ctx.courtName);
    if (field === "circuit")
      return Courts.circuitsOf(ctx.courtLevel, ctx.courtName, ctx.caseType);
    return [];
  }

  function waitingText(field) {
    if (field === "courtName") return "اختر درجة التقاضي أولاً";
    if (field === "caseType")  return "اختر المحكمة أولاً";
    if (field === "circuit")   return "اختر نوع الدعوى أولاً";
    return "";
  }

  /**
   * يبني الحقول الأربعة مترابطةً داخل box، ويعيد كائن قيمها.
   * @param seed القيم الحالية للقضية
   */
  function courtCascade(box, seed, onChange, slots, locked) {
    var ctx = {
      courtLevel: seed.courtLevel || "",
      courtName:  seed.courtName  || "",
      caseType:   seed.caseType   || "",
      circuit:    seed.circuit    || ""
    };
    var ui = {};

    CASCADE_ORDER.forEach(function (f) {
      if (slots && slots[f]) { ui[f] = slots[f]; return; }
      var def = FIELDS.filter(function (x) { return x.k === f; })[0];

      var g = el("div", "margin-bottom:12px");
      g.appendChild(el("label",
        "display:block;font-family:var(--f-title);font-size:14px;" +
        "margin-bottom:5px;color:var(--brand-dark)", def.label));

      var holder = el("div");
      lockWrap(g, holder, locked);

      var note = el("div",
        "font-size:12.5px;color:var(--muted);margin-top:4px;line-height:1.8");
      g.appendChild(note);
      box.appendChild(g);

      ui[f] = { holder: holder, note: note };
    });

    var CSS = "width:100%;min-height:48px;font-size:16px;padding:10px 12px;" +
      "border:1px solid var(--line,#ddd);border-radius:9px;background:var(--card);" +
      "font-family:inherit;direction:rtl;text-align:right";
    var MANUAL = "__manual__";

    function rebuild(from) {
      var start = CASCADE_ORDER.indexOf(from);
      CASCADE_ORDER.forEach(function (f, i) {
        if (i < start) return;
        if (i > start) {
          /* القيمة الحالية قد لا تنتمي للفرع الجديد — تُمسح */
          var still = optionsFor(f, ctx).some(function (v) {
            return Courts.norm(v) === Courts.norm(ctx[f]);
          });
          if (!still) ctx[f] = "";
        }
        draw(f);
      });
      if (onChange) onChange(ctx);
    }

    function draw(f) {
      var u = ui[f];
      u.holder.textContent = "";

      var opts = optionsFor(f, ctx);
      var wait = waitingText(f);
      var ready = f === "courtLevel" ||
                  (f === "courtName" && ctx.courtLevel) ||
                  (f === "caseType"  && ctx.courtName) ||
                  (f === "circuit"   && ctx.caseType);

      if (!ready && !ctx[f]) {
        var ph = el("div",
          "min-height:48px;display:flex;align-items:center;padding:10px 12px;" +
          "border:1px dashed var(--line,#ddd);border-radius:9px;color:var(--muted);" +
          "font-size:14px", wait);
        u.holder.appendChild(ph);
        u.note.textContent = "";
        return;
      }

      var sel = document.createElement("select");
      /* البحث التوليدي مُلزَم على هذه الحقول (combo.js): يُكتب فيُضيَّق،
         ويُمرَّر ويُختار، وتُرتَّب القائمة أبجدياً. */
      sel.setAttribute("data-combo", "1");
      sel.style.cssText = CSS;

      var blank = document.createElement("option");
      blank.value = ""; blank.textContent = "— غير محدَّد —";
      sel.appendChild(blank);

      var list = opts.slice().sort(function (a, b) {
        return String(a).localeCompare(String(b), "ar");   /* ترتيب أبجدي */
      });
      if (ctx[f] && !list.some(function (v) {
        return Courts.norm(v) === Courts.norm(ctx[f]);
      })) list.unshift(ctx[f]);

      list.forEach(function (v) {
        var o = document.createElement("option");
        o.value = v; o.textContent = v;
        sel.appendChild(o);
      });

      sel.value = ctx[f];

      /* الإضافة اليدوية: تُحفظ في المرجع الرسمي للحقل فتظهر في كل مرة بعدها
         وتنساب للقوائم المتسلسلة. combo يستدعيها عند إضافة قيمة غير موجودة. */
      sel._onAdd = function (v) { Courts.remember(f, ctx, v); };

      u.holder.appendChild(sel);

      u.note.textContent = (opts.length
        ? "من " + ar(opts.length) + (f === "circuit" ? " دائرة" :
            f === "caseType" ? " نوع دعوى" : f === "courtName" ? " محكمة" : " درجة")
        : "لا قائمة محفوظة — اكتبها لتُضاف.") +
        " · اكتب للبحث أو أضف الجديد.";

      sel.onchange = function () {
        ctx[f] = sel.value;
        rebuild(f);
      };
    }

    function manual(f) {
      var u = ui[f];
      u.holder.textContent = "";

      var t = document.createElement("input");
      t.type = "text";
      t.setAttribute("lang", "ar");
      t.setAttribute("dir", "rtl");
      t.placeholder = "اكتب " + FIELDS.filter(function (x) {
        return x.k === f;
      })[0].label + "…";
      t.style.cssText = CSS;
      u.holder.appendChild(t);

      var bar = el("div", "display:flex;gap:8px;margin-top:7px");
      function small(label, css) {
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        b.style.cssText = "flex:1;padding:10px;border-radius:9px;font-family:inherit;" +
                          "font-size:13.5px;min-height:42px;" + css;
        return b;
      }
      var ok = small("حفظه في القائمة",
        "border:0;background:var(--brand);color:#fff;font-weight:600");
      var back = small("↩ رجوع للقائمة",
        "border:1px solid var(--line,#ddd);background:transparent;color:var(--muted)");
      bar.appendChild(ok); bar.appendChild(back);
      u.holder.appendChild(bar);

      u.note.textContent = "سيُحفظ تحت " +
        (f === "courtName" ? "درجة «" + ctx.courtLevel + "»" :
         f === "caseType"  ? "محكمة «" + ctx.courtName + "»" :
         f === "circuit"   ? "نوع «" + ctx.caseType + "»" : "درجات التقاضي") +
        " فيظهر في كل مرة بعدها.";

      ok.onclick = function () {
        var v = t.value.trim();
        if (!v) { t.focus(); return; }
        Courts.remember(f, ctx, v);
        ctx[f] = v;
        rebuild(f);
      };
      back.onclick = function () { draw(f); };
      setTimeout(function () { t.focus(); }, 60);
    }

    CASCADE_ORDER.forEach(draw);
    if (onChange) onChange(ctx);

    return {
      values: function () { return ctx; }
    };
  }


  /* ------------------------------------------- صفوف الموكل/الخصم (§1.3)

     صفٌّ لكل طرف: اسمٌ وصفة، مع «＋ إضافة آخر». والقيمة المحفوظة تُفكَّك
     تلقائياً إلى صفوف عند الفتح، وتُجمَّع عند الحفظ بالصيغة نفسها فلا
     يتغيّر العرض ولا البحث. */

  function splitParties(str) {
    return String(str || "").split("·").map(function (p) {
      p = String(p).trim();
      if (!p) return null;
      var cap = "", m = p.match(/\(([^)]*)\)\s*$/);
      if (m) { cap = m[1].trim(); p = p.replace(/\([^)]*\)\s*$/, "").trim(); }
      return { name: p, cap: cap };
    }).filter(Boolean);
  }
  function joinParties(rows) {
    return rows.map(function (r) {
      var n = (r.name || "").trim();
      return n ? n + (r.cap ? " (" + r.cap + ")" : "") : "";
    }).filter(Boolean).join(" · ");
  }

  /** أسماء الموكلين المسجَّلين — لاقتراحها في حقل الموكل. */
  /* بيان موكل بالاسم (مطابقة من بداية الاسم): شارات التليفون/الإيميل ورقم التوكيل */
  function clientChips(name) {
    var k = norm(name);
    if (!k) return [];
    var list;
    try { list = JSON.parse(localStorage.getItem("proflawyer.agenda.clients.v1")) || []; } catch (e) { list = []; }
    var hit = null;
    for (var i = 0; i < list.length; i++) {
      var nk = norm(list[i].name);
      if (nk === k) { hit = list[i]; break; }
      if (!hit && nk.indexOf(k) === 0) hit = list[i];
    }
    if (!hit) return [];
    var out = [];
    if ((hit.emails && hit.emails.length) || hit.email) out.push("@ إيميل");
    if ((hit.phones && hit.phones.length) || hit.phone) out.push("📱 تليفون");
    var poa = (hit.poas && hit.poas[0]) || (hit.poaNo ? hit : null);
    if (poa && poa.poaNo) {
      out.push("توكيل " + ar([poa.poaNo, poa.poaLetter, poa.poaYear].filter(Boolean).join(" ")));
    }
    return out;
  }

  /* ---- التعرّف على الموكل من اسمه الثلاثي (طلب المستخدم) ----
     يكفي كتابة أول ٣ أسماء: لو اتطابقت مع أول ٣ أسماء لموكل مسجَّل يظهر
     «هل تقصد: الاسم الكامل؟»، وبالاختيار يتكتب الاسم كامل وتظهر بياناته
     المربوطة (تليفون · إيميل · توكيل · قضاياه السابقة) كمرجع سريع. */
  function clientsDb() {
    try { return JSON.parse(localStorage.getItem("proflawyer.agenda.clients.v1")) || []; } catch (e) { return []; }
  }
  function first3(name) { return norm(name).split(" ").filter(Boolean).slice(0, 3); }
  function clientsByFirst3(name) {
    var k = first3(name);
    if (k.length < 3) return [];
    var key = k.join(" "), seen = {};
    return clientsDb().filter(function (c) {
      if (!c || !c.name || first3(c.name).join(" ") !== key) return false;
      var n = norm(c.name);
      if (seen[n]) return false;
      seen[n] = 1; return true;
    });
  }
  function clientExact(name) {
    var k = norm(name);
    if (!k) return null;
    return clientsDb().filter(function (c) { return c && norm(c.name) === k; })[0] || null;
  }
  function casesOfClient(name, exceptId) {
    var k = norm(name);
    if (!k) return [];
    return read().filter(function (c) {
      if (c.id === exceptId) return false;
      return String(c.clients || "").split("·").some(function (p) {
        return norm(String(p).replace(/\([^)]*\)/g, "").trim()) === k;
      });
    });
  }
  function clientCard(hit, exceptId) {
    var NL = String.fromCharCode(10);
    var card = el("div", "background:#f3f8f2;border:1px solid #cfe3cc;border-radius:9px;padding:8px 11px;" +
      "margin:-2px 0 8px;font-size:12.5px;line-height:1.9;color:#2b4a2b;white-space:pre-line");
    var phones = (hit.phones && hit.phones.length ? hit.phones : [hit.phone]).filter(Boolean);
    var mails = (hit.emails && hit.emails.length ? hit.emails : [hit.email]).filter(Boolean);
    var poa = (w.ClientsPOA && ClientsPOA.poaList ? ClientsPOA.poaList(hit)[0] : null) ||
      (hit.poas && hit.poas[0]) || (hit.poaNo ? hit : null);
    var lines = ["✓ مربوط بملف الموكل" + (hit.officeNo ? " — رقم التوكيل بالمكتب " + ar(hit.officeNo) : "")];
    if (phones.length) lines.push("📱 " + phones.join("، "));
    if (mails.length) lines.push("@ " + mails.join("، "));
    if (poa && poa.poaNo) lines.push("توكيل " + ar([poa.poaNo, poa.poaLetter, poa.poaYear].filter(Boolean).join(" ")) +
      (poa.notary ? " — " + poa.notary : ""));
    var prev = casesOfClient(hit.name, exceptId);
    if (prev.length) {
      lines.push("قضاياه السابقة (" + ar(prev.length) + "):");
      prev.slice(0, 6).forEach(function (c) {
        lines.push("  • " + [c.fileNo ? "ملف " + ar(c.fileNo) : "", c.caseNo ? ar(c.caseNo) + (c.caseYear ? "/" + ar(c.caseYear) : "") : "",
          c.courtName || "", c.status || ""].filter(Boolean).join(" · "));
      });
      if (prev.length > 6) lines.push("  …");
    }
    card.textContent = lines.join(NL);
    return card;
  }

  function clientNamesList() {
    var out = [];
    try {
      (JSON.parse(localStorage.getItem("proflawyer.agenda.clients.v1")) || [])
        .forEach(function (c) { if (c.name) out.push(String(c.name).trim()); });
    } catch (e) { }
    var seen = {}, uniq = [];
    out.forEach(function (n) { if (n && !seen[n]) { seen[n] = 1; uniq.push(n); } });
    return uniq;
  }

  var _capsDL = null, _cliDL = null, _oppDL = null;

  function datalistOf(id, values) {
    var dl = document.createElement("datalist");
    dl.id = id;
    values.slice(0, 600).forEach(function (v) {
      var o = document.createElement("option");
      o.value = v;
      dl.appendChild(o);
    });
    return dl;
  }

  /**
   * محرِّر أطراف قابل للتكرار.
   * @param opts { kind:"clients"|"opponents" }
   * @returns { value: function():string }
   */
  function partiesEditor(box, def, seed, opts) {
    opts = opts || {};
    var isClient = opts.kind === "clients";

    var g = el("div", "margin-bottom:12px");
    g.appendChild(el("label",
      "display:block;font-family:var(--f-title);font-size:14px;" +
      "margin-bottom:5px;color:var(--brand-dark)", def.label));

    /* مصدر أسماء الاقتراح — يُقرأ طازجاً في كل فتحة للوحة (لا قائمة ثابتة) */
    function suggestSource() {
      return isClient ? clientNamesList() : (w.Lists ? Lists.get("opponents") : []);
    }

    var capsKey = isClient ? "partyCapsClient" : "partyCapsOpponent";
    if (w.Lists && !localStorage.getItem("proflawyer._partyCapsMigrated")) {
      var oldCaps = Lists.get("partyCaps");
      oldCaps.forEach(function (v) {
        Lists.add("partyCapsClient", v);
        Lists.add("partyCapsOpponent", v);
      });
      localStorage.setItem("proflawyer._partyCapsMigrated", "1");
    }
    var caps = w.Lists ? Lists.get(capsKey) : [];

    var rows = splitParties(seed);
    if (!rows.length) rows = [{ name: "", cap: "" }];

    var listBox = el("div");
    g.appendChild(listBox);

    var CSS = "min-height:46px;font-size:15.5px;padding:9px 11px;" +
      "border:1px solid var(--line,#ddd);border-radius:9px;background:var(--card);" +
      "font-family:inherit;direction:rtl;text-align:right";

    /* سطر «ورثة. الاسم وهم :» ثابت: اسمه للقراءة فقط وبلا صفة؛ تحته زر لإضافة وريث */
    function isHeirHeading(nm) { return /^ورثة\.\s.+وهم\s*:\s*$/.test(String(nm || "").trim()); }
    /* طلب المستخدم (١-١٠): أي طرف فيه «ورثة/ورثه» أو بيبدأ بـ«و.» (موكل أو خصم) ← سطر
       «ورثة. الاسم وهم :» مقفول، وتحته خانات الورثة بأسمائهم وصفاتهم. صفة السطر
       الأصلي (زي «مستأنفين») بتنزل لخانة أول وريث. */
    function heirsLike(nm) {
      var t = String(nm || "").trim();
      return !!t && !isHeirHeading(t) && (/(^|\s)ورث[ةه](?=\s|[.:،-]|$)/.test(t) || /^و\s*\.\s*\S/.test(t));
    }
    function heirHeadingOf(nm) {
      var t = String(nm || "").replace(/\([^)]*\)/g, " ").trim();
      t = t.replace(/^و\s*\.\s*/, "").replace(/(^|\s)ورث[ةه]\s*[.:،-]?\s*/, "$1")
           .replace(/\s*وهم\s*:?\s*$/, "").replace(/[\s:،.\-]+$/, "").replace(/\s+/g, " ").trim();
      return "ورثة. " + t + " وهم :";
    }
    function normalizeHeirs() {
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (!heirsLike(r.name)) continue;
        var oldCap = r.cap || "";
        r.name = heirHeadingOf(r.name); r.cap = "";
        var nx = rows[i + 1];
        if (!nx || isHeirHeading(nx.name)) rows.splice(i + 1, 0, { name: "", cap: oldCap });
        else if (oldCap && !nx.cap) nx.cap = oldCap;
      }
    }
    normalizeHeirs();

    function makeRow(r) {
      if (isHeirHeading(r.name)) {
        var hl = el("div", "display:flex;flex-wrap:nowrap;gap:6px;margin:10px 0 7px;align-items:center");
        var hn = document.createElement("input");
        hn.type = "text"; hn.readOnly = true; hn.value = r.name;
        hn.setAttribute("dir", "rtl"); hn.setAttribute("aria-label", "سطر ثابت — ورثة");
        hn.style.cssText = "flex:1 1 auto;min-width:0;" + CSS +
          ";background:var(--bg,#f4ece0);font-weight:700;color:var(--brand-dark);border-style:dashed";
        hl.appendChild(hn);
        var ah = document.createElement("button");
        ah.type = "button"; ah.textContent = "＋ وريث";
        ah.style.cssText = "flex:0 0 auto;min-height:46px;padding:0 12px;border-radius:9px;" +
          "border:1px dashed var(--brand);background:transparent;color:var(--brand);font-family:inherit;font-size:13px";
        ah.onclick = function () { rows.splice(rows.indexOf(r) + 1, 0, { name: "", cap: "" }); draw(); };
        hl.appendChild(ah);
        var hr = document.createElement("button");
        hr.type = "button"; hr.textContent = "✕"; hr.title = "حذف سطر الورثة";
        hr.style.cssText = "flex:0 0 auto;min-width:40px;min-height:46px;border-radius:9px;" +
          "border:1px solid #e3c9c6;background:transparent;color:#b3261e;font-family:inherit";
        hr.onclick = function () {
          var i = rows.indexOf(r); if (i >= 0) rows.splice(i, 1);
          if (!rows.length) rows.push({ name: "", cap: "" });
          draw();
        };
        hl.appendChild(hr);
        return hl;
      }
      /* الاسم والصفة على سطرٍ واحد (بلا التفاف)، والاسم يأخذ المساحة الأكبر */
      var line = el("div",
        "display:flex;flex-wrap:nowrap;gap:6px;margin-bottom:7px;align-items:center");

      var name = document.createElement("input");
      name.type = "text";
      name.setAttribute("lang", "ar");
      name.setAttribute("dir", "rtl");
      name.placeholder = isClient ? "اسم الموكل" : "اسم الخصم";
      name.value = r.name || "";
      name.style.cssText = "flex:1 1 auto;min-width:0;" + CSS;
      name.oninput = function () { r.name = name.value; };
      /* الموكل: يبدأ الاقتراح بعد الاسم الثاني، ويُدرَج حتى الاسم الثالث، وتظهر شارات البيانات */
      suggestPanel(name, suggestSource, isClient
        ? { minWords: 2, prefix: true, maxWords: 3, meta: clientChips } : null);
      var note = el("div", "font-size:12px;color:#6b5a48;margin:-4px 4px 7px;min-height:0");
      function pickClient(full) {
        name.value = full; r.name = full;
        name.dispatchEvent(new Event("change", { bubbles: true }));
        annotate();
      }
      var lastNote = null;
      function annotate() {
        /* نفس الاسم = نفس الصندوق: إعادة رسمه مع blur كانت بتشيل زرار «هل تقصد» قبل ما اللمسة توصله */
        var nk = norm(name.value);
        if (nk === lastNote) return;
        lastNote = nk;
        note.textContent = "";
        note.style.display = "none";
        if (!isClient || !String(name.value || "").trim()) return;
        var exact = clientExact(name.value);
        if (exact) {
          note.appendChild(clientCard(exact, opts.caseId));
          note.style.display = "block";
          return;
        }
        var hits = clientsByFirst3(name.value);
        if (hits.length) {
          var q = el("div", "background:#fff7e6;border:1px solid #f0d59a;border-radius:9px;padding:8px 10px;margin:-2px 0 8px");
          q.appendChild(el("div", "font-size:12.5px;color:#7a5410;margin-bottom:5px", "هل تقصد:"));
          hits.slice(0, 4).forEach(function (h) {
            var b = document.createElement("button");
            b.type = "button";
            b.textContent = h.name + (h.officeNo ? "  (" + ar(h.officeNo) + ")" : "");
            b.style.cssText = "display:block;width:100%;text-align:right;margin-bottom:4px;padding:8px 10px;" +
              "border:1px solid var(--brand);border-radius:8px;background:#fff;color:var(--brand-dark);" +
              "font-family:inherit;font-size:13.5px;min-height:40px";
            b.onmousedown = function (e) { e.preventDefault(); };   /* الحقل يفضل مركَّز */
            b.onclick = function () { pickClient(h.name); };
            q.appendChild(b);
          });
          note.appendChild(q);
          note.style.display = "block";
          return;
        }
        var chips = clientChips(name.value);
        note.textContent = chips.length ? chips.join("  ·  ") : "";
        note.style.display = chips.length ? "block" : "none";
      }
      name.addEventListener("input", annotate);
      name.addEventListener("change", annotate);
      name.addEventListener("change", function () {
        if (heirsLike(name.value)) { r.name = name.value; normalizeHeirs(); draw(); }
      });
      annotate();
      line.appendChild(name);

      var cap = document.createElement("select");
      cap.style.cssText = "flex:0 0 106px;" + CSS + ";padding-left:4px;padding-right:6px";
      var blank = document.createElement("option");
      blank.value = ""; blank.textContent = "";   /* بلا كلمة «الصفة» داخل الحقل */
      cap.appendChild(blank);
      var pool = caps.slice();
      if (r.cap && pool.indexOf(r.cap) < 0) pool.unshift(r.cap);
      pool.forEach(function (v) {
        var o = document.createElement("option");
        o.value = v; o.textContent = v;
        cap.appendChild(o);
      });
      var man = document.createElement("option");
      man.value = "__manual__"; man.textContent = "✎ صفة يدوية…";
      cap.appendChild(man);
      cap.value = r.cap || "";
      cap.onchange = function () {
        if (cap.value === "__manual__") {
          var v = prompt("اكتب الصفة:");
          if (v && v.trim()) {
            v = v.trim();
            if (w.Lists) Lists.add(capsKey, v);
            var o = document.createElement("option");
            o.value = v; o.textContent = v;
            cap.insertBefore(o, man);
            cap.value = v; r.cap = v;
          } else { cap.value = r.cap || ""; }
          return;
        }
        r.cap = cap.value;
      };
      line.appendChild(cap);

      /* حذف الطرف — زرٌّ صغير على السطر نفسه: الاسم | الصفة | ✕ */
      var rm = document.createElement("button");
      rm.type = "button"; rm.textContent = "✕";
      rm.title = "حذف هذا الطرف";
      rm.style.cssText = "flex:0 0 auto;min-width:40px;min-height:46px;border-radius:9px;" +
        "border:1px solid #e3c9c6;background:transparent;color:#b3261e;font-family:inherit";
      rm.onclick = function () {
        var i = rows.indexOf(r);
        if (i >= 0) rows.splice(i, 1);
        if (!rows.length) rows.push({ name: "", cap: "" });
        draw();
      };
      line.appendChild(rm);

      var wrap = el("div");
      wrap.appendChild(line);
      wrap.appendChild(note);
      return wrap;
    }

    function draw() {
      listBox.textContent = "";
      rows.forEach(function (r) { listBox.appendChild(makeRow(r)); });
      /* زرٌّ واحد لإضافة طرفٍ جديد أسفل القائمة (كلٌّ في سطره) */
      var addAll = document.createElement("button");
      addAll.type = "button";
      addAll.textContent = "＋ إضافة " + (isClient ? "موكل" : "خصم") + " آخر";
      addAll.style.cssText = "width:100%;min-height:44px;margin-top:2px;border-radius:9px;" +
        "border:1px dashed var(--brand);background:transparent;color:var(--brand);" +
        "font-family:inherit;font-size:13.5px";
      addAll.onclick = function () { rows.push({ name: "", cap: "" }); draw(); };
      listBox.appendChild(addAll);
    }
    draw();

    g.appendChild(el("div",
      "font-size:12px;color:var(--muted);margin-top:5px;line-height:1.8",
      isClient ? "الاسم يُقترح من الموكلين المسجَّلين." :
                 "الخصم حرّ الكتابة ويُحفظ ليُقترح لاحقاً."));

    box.appendChild(g);

    return {
      value: function () {
        /* الخصوم الجدد يُحفظون في قائمة الخصوم */
        if (!isClient && w.Lists) {
          rows.forEach(function (r) {
            if (r.name && r.name.trim()) Lists.add("opponents", r.name.trim());
          });
        }
        return joinParties(rows);
      }
    };
  }

  /* ----------------------------------------------------- تعديل بيانات القضية */

  /* الجنائي: تُخفى حقوله تماماً إن لم يكن النوع جنائياً (§2.1) */
  function isCriminalType(t) { return /جناي|جنح/.test(String(t || "")); }

  /* هل هذه الدعوى "طعن أعلى" في تسلسل درجات التقاضي؟ (تُحدَّد تلقائياً،
     بلا إدخال يدوي — تُستعمل لعرض شارة فقط، رقم الاستئناف/السنة هما
     caseNo/caseYear الموجودان أصلاً في نموذج القضية):
       • درجة التقاضي "استئناف عالي" أو "نقض" مباشرة.
       • أو درجة "ابتدائي/كلية" مع نوع دعوى "مدني مستأنف" أو "جنح مستأنف"
         (استئناف أحكام الجزئية تُنظر أمام الابتدائية نفسها). */
  /** يبحث عن أيٍّ من الكلمات (مطبَّعة كذلك) داخل نص مطبَّع — norm() تُبدِّل
      حروف الهمزة (استئناف←استيناف مثلاً)، فلا تُقارَن نصوص خام بنمط خام
      أبداً بعدها، بل تُطبَّع الكلمتان معاً كما يفعل has() في nextLevel(). */
  function containsAny(normalizedText, words) {
    return words.some(function (w) { return normalizedText.indexOf(norm(w)) >= 0; });
  }

  /** كلمة/تسمية رقم الدعوى المناسبة حسب درجة التقاضي — تُستعمل في كل شاشات
      العرض والطباعة وشاشة التعديل معاً، حتى لا تتفرَّق التسميات. */
  function caseNoLabel(level) {
    var lvl = norm(level || "");
    if (containsAny(lvl, ["نقض"])) return "طعن نقض";
    if (containsAny(lvl, ["استئناف"])) return "استئناف";
    return "دعوى";
  }
  function caseYearLabel(level) {
    var lvl = norm(level || "");
    if (containsAny(lvl, ["استئناف", "نقض"])) return "السنة القضائية";
    return "سنة الدعوى";
  }

  function appealHigher(c) {
    var lvl = norm(c.courtLevel || ""), typ = norm(c.caseType || "");
    if (containsAny(lvl, ["استئناف عالي", "نقض"])) return true;
    if (containsAny(lvl, ["ابتدائ", "كلية"]) && containsAny(typ, ["مدني مستأنف", "جنح مستأنف", "مستأنف مستعجل", "مستعجل مستأنف"])) return true;
    return false;
  }

  /** الصفة الأولى المسجَّلة لأطراف الموكل — تحدد هل الدعوى مرفوعة "منه" أو "ضده". */
  function partyDirection(c) {
    var rows = splitParties(c.clients).filter(function (x) { return x.cap; });
    var cap = norm((rows[0] && rows[0].cap) || "");
    if (!cap) return "";
    if (containsAny(cap, ["ضده"])) return "ضده";
    if (containsAny(cap, ["مستأنف", "طاعن", "مدعي", "مستشكل", "معلن", "طالب"])) return "منه";
    return "";
  }

  /** «طعن أعلى» ومعاه اتجاه الطعن (طلب المستخدم ٥-١٠): أول درجة ليها رقمها، والاستئناف
      رقم تاني — فالتصنيف لازم يبيّن الطعن مرفوع من الموكل ولا ضده. */
  function higherLabel(c) {
    var d = partyDirection(c);
    return " 🔺 طعن أعلى" + (d ? " — مرفوع " + d : "");
  }

  /* المواعيد القانونية المقرَّرة (قانونا المرافعات والإجراءات وأحكام النقض):
     - النقض المدني ٦٠ يوماً (م ٢٥٢ مرافعات) · النقض الجنائي ٦٠ يوماً (ق النقض)
     - استئناف الأحكام المدنية ٤٠ يوماً (م ٢٢٧ مرافعات)
     - استئناف الجنح والمعارضة ١٠ أيام (م ٤٠٦/٣٩٨ إجراءات)
     - أمر الأداء والمستعجل ١٥ يوماً · القضاء الإداري ٦٠ يوماً
     - الشطب: التجديد خلال ٦٠ يوماً (م ٨٢ مرافعات) وإلا اعتُبرت كأن لم تكن
     - الوقف الجزائي: التعجيل خلال المدة (شهر ≈ ٣٠) · التعليقي بزوال سببه */
  function legalAppealDays(c) {
    var lvl = norm(c.courtLevel || ""), typ = norm(c.caseType || "");
    if (/دستور/.test(lvl)) return 0;
    if (/نقض/.test(lvl)) return 60;
    if (/اداري/.test(lvl) || /مجلس الدوله/.test(lvl)) return 60;
    if (/امر اداء/.test(typ)) return 15;
    if (/مستعجل/.test(lvl + " " + typ)) return 15;
    if (isCriminalType(c.caseType)) return 10;
    return 40;
  }
  function legalAppealBasis(c) {
    var lvl = norm(c.courtLevel || "");
    if (/نقض/.test(lvl)) return "النقض ٦٠ يوماً";
    if (/اداري/.test(lvl)) return "القضاء الإداري ٦٠ يوماً";
    if (isCriminalType(c.caseType)) return "الجنح/المعارضة ١٠ أيام";
    if (/امر اداء/.test(norm(c.caseType || ""))) return "أمر الأداء ١٥ يوماً";
    return "الاستئناف المدني ٤٠ يوماً";
  }
  function legalHoldDays(isShatb) { return isShatb ? 60 : 30; }

  /* ===== آخر ميعاد للطعن — منطق الأجندة (المرجع المعتمد «مواعيد-الطعون»، طلب المستخدم ٥-١٠) =====
     ١) العد من اليوم التالي للحكم (يوم الحكم ما يتحسبش) ⇒ آخر يوم = تاريخ الحكم + المدة
        (حكم ١ يناير + ٤٠ يوم ⇒ آخر ميعاد ١٠ فبراير).
     ٢) الميعاد بالأيام، وأقصاه ٦٠ يوم (قاعدة المستخدم ٦-١٠: مفيش حكم ميعاد طعنه أكتر من ٦٠ يوم) —
        لو اتكتب أكتر (أو بالشهور) بيتحسب ٦٠ ويظهر تنبيه. الشهر لو اتكتب = ٣٠ يوم.
     ٣) آخر يوم جه جمعة أو عطلة رسمية (حتى العيد: الوقفة + ٤ أيام) ← يمتد لأول يوم عمل بعد نهاية العطلة كلها (EgHolidays.extendDeadline، م ١٨ مرافعات).
     ٤) العطلات جوه الميعاد ما بتتخصمش · ٥) العطلة القضائية ملهاش أثر · ٦) ميعاد المسافة مستبعد.
     المدة: اللي كتبه المحامي في «ميعاد الطعن» (أيام، أو «شهر/شهرين/٣ شهور»)، وإلا الميعاد القانوني. */
  function appealCount(v) {
    var s0 = la(String(v || ""));
    var d = parseInt(s0.replace(/[^0-9]/g, ""), 10);
    if (d) return d;
    if (/سنتين|شهرين|يومين/.test(s0)) return 2;
    var W = { "ثلاث": 3, "أربع": 4, "اربع": 4, "خمس": 5, "ست": 6, "سبع": 7, "ثمان": 8, "تسع": 9, "عشر": 10 };
    for (var k in W) if (s0.indexOf(k) >= 0) return W[k];
    return /شهر|شهور|سنة|سنه|عام|يوم/.test(s0) ? 1 : 0;
  }
  var APPEAL_MAX_DAYS = 60;
  var AP_MONTHS = /شهر|شهور/, AP_YEARS = /سنة|سنه|سنين|سنوات|سنو|عام|اعوام|أعوام/;
  function appealUnit(v) { var t = String(v || ""); return AP_MONTHS.test(t) ? "months" : AP_YEARS.test(t) ? "years" : "days"; }
  function isoOfDate(d) {
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }
  /** { judge, n, unit, explicit, basis, raw, end, shifted, shiftDays, reason, reasons, warn, left } أو null.
      over: قيم من الفورم قبل الحفظ (judgeDate / appealPeriod). */
  function appealCalc(c, over) {
    over = over || {};
    var jd = over.judgeDate != null ? over.judgeDate : c.judgeDate;
    var per = over.appealPeriod != null ? over.appealPeriod : c.appealPeriod;
    var jIso = (w.lawyerToISO ? w.lawyerToISO(jd) : "") || jd || "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(jIso)) return null;
    var explicit = appealCount(per) > 0;
    var n = explicit ? appealCount(per) : legalAppealDays(c);
    var unit = explicit ? appealUnit(per) : "days";
    var days = unit === "years" ? n * 365 : unit === "months" ? n * 30 : n;
    var capped = days > APPEAL_MAX_DAYS;
    if (capped) days = APPEAL_MAX_DAYS;
    if (!(n > 0)) return null;
    var d = new Date(jIso + "T12:00:00");
    d.setDate(d.getDate() + days);
    var raw = isoOfDate(d);
    var ex = w.EgHolidays ? EgHolidays.extendDeadline(raw) : { iso: raw, shifted: false, reasons: [], warn: "" };
    var t = new Date(); t.setHours(12, 0, 0, 0);
    var endD = new Date(ex.iso + "T12:00:00");
    return { judge: jIso, n: n, unit: unit, days: days, capped: capped, explicit: explicit, basis: explicit ? "" : legalAppealBasis(c),
      raw: raw, end: ex.iso, shifted: !!ex.shifted, shiftDays: Math.round((endD - new Date(raw + "T12:00:00")) / 86400000),
      reason: (ex.reasons || [])[0] || "", reasons: ex.reasons || [], warn: ex.warn || "",
      left: Math.round((endD - t) / 86400000) };
  }
  function appealDmy(iso) { var p = String(iso || "").split("-"); return p.length === 3 ? ar(+p[2] + "/" + (+p[1]) + "/" + p[0]) : ""; }
  function appealPeriodText(a) {
    return ar(a.days) + " يوم" + (a.explicit ? "" : " · " + a.basis);
  }
  /** نص العدّاد زي الأجندة */
  function appealCalcText(a) {
    if (!a) return "";
    var ds = appealDmy(a.end);
    var ext = a.shifted ? " (امتدّ " + ar(a.shiftDays) + " يوم — آخر يوم صادف " + a.reasons.join(" ثم ") + ")" : "";
    if (a.left < 0) return "⛔ فات ميعاد الطعن (انتهى " + ds + ")" + ext;
    if (a.left === 0) return "⚠️ النهارده آخر يوم للطعن (" + ds + ")" + ext;
    return "⏳ باقي " + ar(a.left) + " يوم على انتهاء ميعاد الطعن — ينتهي " + ds + ext;
  }
  /** الصيغة المقترحة لإثبات الامتداد في مذكرة الطعن (نص المرجع) */
  function appealShiftPhrase(a) {
    if (!a || !a.shifted) return "";
    return "ولما كان آخر ميعاد للطعن يوافق " + appealDmy(a.raw) + " وقد صادف " + a.reason +
      "، فقد امتد الميعاد بقوة القانون إلى أول يوم عمل تالٍ وهو " + appealDmy(a.end) +
      "، ومن ثم يكون الطعن قد أقيم في الميعاد.";
  }
  /** معاينة حيّة تحت حقول الحكم (تعديل القضية / تعديل الجلسة) */
  function appealPreview(c, box, getVals) {
    var pv = el("div", "margin:2px 0 12px;padding:10px 12px;border-radius:10px;font-size:13.5px;line-height:1.9;" +
      "background:var(--bg,#f4ece0);color:var(--brand-dark)");
    box.appendChild(pv);
    function upd() {
      var a = appealCalc(c, getVals());
      pv.textContent = "";
      if (!a) { pv.appendChild(el("div", "color:var(--muted)", "اكتب تاريخ الحكم القطعي — آخر ميعاد للطعن بيتحسب لوحده.")); return; }
      pv.appendChild(el("div", "", "ميعاد الطعن: " + appealPeriodText(a)));
      if (a.capped) pv.appendChild(el("div", "color:#b3261e;font-size:12.5px",
        "⚠ أقصى ميعاد طعن ٦٠ يوم — المكتوب أكتر من كده فاتحسب على ٦٠ يوم. راجع المدة."));
      pv.appendChild(el("div", "font-family:var(--f-title)", "آخر ميعاد للطعن: " + appealDmy(a.end)));
      pv.appendChild(el("div", "color:" + (a.left < 0 ? "#7a5a3a" : a.left <= 7 ? "#b3261e" : "#8a5a12"), appealCalcText(a)));
      if (a.warn) pv.appendChild(el("div", "color:#8a5a12;font-size:12.5px", "⚠ " +
        a.warn.replace(/^(\d{4})-(\d{2})-(\d{2})/, function (m0, y, mo, d) { return appealDmy(y + "-" + mo + "-" + d); })));
    }
    upd();
    return upd;
  }

  function editCase(c, done, opts) {
    opts = opts || {};
    /* ملف جديد بلا رقم مكتب بعد؟ يُقترَح تالياً لآخر رقم مسجَّل تلقائياً
       (المستخدم يقدر يعدّله يدوياً قبل الحفظ لو احتاج). */
    if (!c.id && !c.fileNo) c.fileNo = nextCaseFileNo();
    /* سنة التعامل تُقترَح بسنة فتح الملف تلقائياً — نفس مبدأ رقم الملف،
       تعديل يدوي متاح دايماً قبل الحفظ. */
    if (!c.id && !c.dealYear) c.dealYear = String(new Date().getFullYear());
    /* باقي الحقول اللي عادة بتتكرر من قضية للتانية ورا بعض (نفس المحامي،
       نفس المحكمة والدرجة والدائرة، نفس القاعة...) تتقترح تلقائياً بآخر
       قيمة استُعملت في آخر قضية جديدة اتحفظت — تعديل يدوي متاح دايماً. */
    (function () {
      if (c.id) return;   /* الاقتراح للقضايا الجديدة فقط — لا يمس تعديل قضية موجودة */
      var last = LAST_NEW_CASE_FIELDS.map(function (k) {
        try { return [k, localStorage.getItem("proflawyer.lastNewCase." + k)]; }
        catch (e) { return [k, null]; }
      });
      last.forEach(function (p) { if (p[1] && !c[p[0]]) c[p[0]] = p[1]; });
    })();
    _cliDL = null; _oppDL = null; _capsDL = null;

    /* حفظ تلقائي لمسوَّدة أثناء الكتابة — لو خرج التطبيق فجأة (تعليق،
       إغلاق قسري، نفاد الذاكرة) قبل الضغط على "حفظ"، يُستكمل الإدخال من
       آخر نقطة بدل إعادة كتابة كل شيء من الصفر. منفصل تماماً عن حماية
       "الخروج بدون حفظ" الموجودة أصلاً في sheet() — تلك تحمي من الرجوع
       العرضي فقط، لا من انهيار حقيقي للتطبيق. راجع
       [[feedback_case_draft_autosave]]. */
    var draftKey = "proflawyer.casedraft." + (c.id || "_new");
    var _draft = null;
    try { _draft = JSON.parse(localStorage.getItem(draftKey)); } catch (e) { }
    var _resumedDraft = false;
    var orig = c;
    /* المسودة بتتحفظ مع «الأصل» (قيم الفورم لحظة فتحه)، والاسترجاع بيحط الحقول
       اللي المستخدم غيّرها بس فوق القضية بحالتها الحالية. قبل كده المسودة كلها
       كانت بتتحط فوق القضية، والفورم نفسه بيعدّل «درجة التقاضي» أول ما يتفتح،
       فكانت بتتسجّل مسودات من غير أي تعديل وترجّع قيم قديمة فوق أي تصليح
       حصل بعدها (مزامنة، تنظيف). ٤٧ مسودة زي دي اتلقت ١-١٠. */
    var _draftBase = null;
    if (_draft && _draft.data) {
      if (_draft.base) {
        var _patch = {};
        Object.keys(_draft.data).forEach(function (k) {
          if (JSON.stringify(_draft.data[k]) !== JSON.stringify(_draft.base[k])) _patch[k] = _draft.data[k];
        });
        if (Object.keys(_patch).length) {
          c = Object.assign({}, c, _patch);
          _resumedDraft = true; _draftBase = _draft.base;
        } else { try { localStorage.removeItem(draftKey); } catch (e) { } }
      } else if (!c.id) {                     /* قضية جديدة بالصيغة القديمة: زي ما كانت */
        c = Object.assign({}, c, _draft.data);
        _resumedDraft = true;
      } else {                                /* صيغة قديمة لقضية موجودة: مش موثوقة — تتشال */
        try { localStorage.removeItem(draftKey); } catch (e) { }
      }
    }
    /* ترحيل الملاحظة القديمة (حقل نصي واحد) إلى سجل الملاحظات المؤرَّخ مرةً واحدة،
       بعد حذف الحقل القديم من شاشة التعديل — لا تُفقد بيانات المستخدم. */
    if (c.notes && String(c.notes).trim()) {
      c.noteLog = c.noteLog || [];
      var already = c.noteLog.some(function (n) { return n.text === c.notes && n._migrated; });
      if (!already) {
        c.noteLog.unshift({ date: todayISO(), text: String(c.notes).trim(), _migrated: true });
      }
      c.notes = "";
    }
    var s = sheet(10012);
    var headRow = el("div", "display:flex;align-items:center;gap:8px;margin-bottom:10px");
    headRow.appendChild(el("div", "font-family:var(--f-title);font-size:18px",
      c.id ? "تعديل بيانات القضية" : "قضية جديدة"));
    if (opts.source === "cases" || opts.source === "registry") {
      var badgeBg = opts.source === "cases" ? "#2e7d32" : "var(--brand,#5b3a21)";
      var badgeTxt = opts.source === "cases" ? "صفحة القضايا" : "سجل القضايا";
      headRow.appendChild(el("span",
        "display:inline-block;padding:2px 10px;border-radius:20px;font-size:12px;" +
        "background:" + badgeBg + ";color:#fff", badgeTxt));
    }
    if (appealHigher(c)) {
      headRow.appendChild(el("span",
        "display:inline-block;padding:2px 10px;border-radius:20px;font-size:12px;" +
        "background:#8a1c1c;color:#fff", "🔺 طعن أعلى"));
      if (partyDirection(c)) {
        headRow.appendChild(el("span",
          "display:inline-block;padding:2px 10px;border-radius:20px;font-size:12px;" +
          "background:var(--bg,#f4ece0);color:var(--brand-dark);border:1px solid var(--line,#ddd)",
          "الطعن مرفوع " + partyDirection(c)));
      }
    }
    s.box.appendChild(headRow);
    if (_resumedDraft) {
      var draftBar = el("div",
        "background:#fff4e0;color:#8a5a12;border-radius:9px;padding:9px 12px;" +
        "margin-bottom:10px;font-size:12.5px;line-height:1.8;display:flex;" +
        "justify-content:space-between;align-items:center;gap:8px",
        "🔄 استُرجعت بيانات لم تُحفظ من محاولة سابقة لهذا الملف.");
      var discardBtn = document.createElement("button");
      discardBtn.type = "button"; discardBtn.textContent = "تجاهلها";
      discardBtn.style.cssText = "flex:0 0 auto;border:1px solid #8a5a12;background:transparent;" +
        "color:#8a5a12;border-radius:7px;padding:4px 10px;font-family:inherit;font-size:12px";
      discardBtn.onclick = function () {
        try { localStorage.removeItem(draftKey); } catch (e) { }
        s.back.remove();
        editCase(orig, done, opts);
      };
      draftBar.appendChild(discardBtn);
      s.box.appendChild(draftBar);
    }

    var inputs = {};
    var cascade = null;
    var crimeWrap = null;
    var firstWrap = null;
    var appealCivilWrap = null;
    var levelSuggestBox = null;
    var slots = {};

    /* حقلا رقم الدعوى الابتدائية يظهران فقط حين تكون القضية بدرجة أعلى
       (استئناف/نقض) — راجع relabelCaseNo أسفله لنفس منطق الكشف. */
    function toggleFirstDegree(level) {
      var on = caseNoLabel(level) !== "دعوى";
      if (firstWrap) firstWrap.style.display = on ? "" : "none";
    }

    /* رقم الاستئناف لغير الجنائي — يظهر فقط أمام النقض (الجنائي له نفس
       الحقل بالفعل ضمن __crime__ بصرف النظر عن الدرجة). راجع المستند
       docs/خطة-خط-السير-ودرجة-التقاضي-2026-11-02.md بند ٤. */
    function toggleAppealCivil(level, caseType) {
      var on = containsAny(norm(level), ["نقض"]) && !isCriminalType(caseType);
      if (appealCivilWrap) appealCivilWrap.style.display = on ? "" : "none";
    }

    /* اقتراح (لا فرض) درجة التقاضي من اسم المحكمة فعلياً، لا فرضها كما
       اختارها المستخدم — راجع docs/خطة-خط-السير-ودرجة-التقاضي-2026-11-02.md
       بند ٢. مستثنى عمداً: الجنائي (جنح مستأنف/جنايات مستأنفة مصنَّفة
       عمداً تحت درجة غير مكان نظرها الفعلي، راجع courts.js EXTRA_TYPES_BY_LEVEL)،
       وأي محكمة ظهرت تحت أكثر من درجة في بيانات وزارة العدل (غموض حقيقي). */
    function suggestLevelFor(ctx) {
      if (!levelSuggestBox) {
        var anchor = slots.courtName && slots.courtName.note && slots.courtName.note.parentNode;
        if (!anchor) return;
        levelSuggestBox = el("div", "margin-top:6px");
        anchor.appendChild(levelSuggestBox);
      }
      levelSuggestBox.textContent = "";
      if (!ctx.courtName || !ctx.courtLevel || isCriminalType(ctx.caseType)) return;
      if (!w.Courts || !Courts.levelsForCourt) return;
      var cands = Courts.levelsForCourt(ctx.courtName);
      if (cands.length !== 1) return;                 /* غير معروفة أو غامضة — بلا اقتراح */
      var suggested = cands[0];
      if (Courts.norm(suggested) === Courts.norm(ctx.courtLevel)) return;   /* متطابقة بالفعل */

      var msg = el("div",
        "background:#fff4e0;border:1px solid #e8cf9a;border-radius:9px;padding:8px 10px;" +
        "font-size:12.5px;color:#6a4a12;line-height:1.8",
        "⚠ «" + ctx.courtName + "» مسجَّلة عادةً تحت درجة «" + suggested +
        "» لا «" + ctx.courtLevel + "» — لو الفرق مقصود (مثل جنح مستأنف/مدني مستأنف) تجاهل الاقتراح.");
      levelSuggestBox.appendChild(msg);
      var fixBtn = btn("صحّح لـ" + suggested,
        "margin-top:6px;min-height:36px;padding:6px 12px;font-size:12.5px;" +
        "border:0;background:var(--brand);color:#fff;flex:0 0 auto;width:auto");
      fixBtn.onclick = function () {
        var sel = slots.courtLevel.holder.querySelector("select");
        if (!sel) return;
        sel.value = suggested;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      };
      levelSuggestBox.appendChild(fixBtn);
    }

    function toggleCrime(caseType) {
      var on = isCriminalType(caseType);
      if (crimeWrap) crimeWrap.style.display = on ? "" : "none";
      /* رقم الجناية/الجنحة ولسنتها هما رقم الدعوى وسنتها نفسهما في القضايا
         الجنائية — تُملأ تلقائياً بلا إعادة كتابة، ما لم يكن قد كُتب فيها
         شيء مختلف يدوياً بالفعل. */
      if (on && inputs.crimeNo && inputs.caseNo && !inputs.crimeNo.value) {
        inputs.crimeNo.value = inputs.caseNo.value;
      }
      if (on && inputs.crimeYear && inputs.caseYear && !inputs.crimeYear.value) {
        inputs.crimeYear.value = inputs.caseYear.value;
      }
    }

    /* التخطيط: حقلان أو ثلاثة في السطر بحسب طول البيان — والطويل وحده يملأ السطر.
       المحكمة اسمها طويل فتُفرد وحدها لتُقرأ كاملة. وحقول الحكم/الشطب تظهر فقط
       حين تكون حالة الدعوى مناسبةً لها (حكم / شطب أو وقف). */
    var LAYOUT = [
      ["fileNo", "dealYear"],
      ["status", "courtLevel"],
      ["courtName", "caseType"],
      ["circuit", "lawyer"],
      ["collab"],
      ["caseNo", "caseYear"],
      ["__firstDegree__"],
      ["__appealCivil__"],
      ["subject"],
      ["__crime__"],
      ["hall", "floor", "time"],
      ["loc"],
      ["__judge__"],
      ["__hold__"],
      ["clients"],
      ["opponents"]
    ];

    function defOf(k) {
      return FIELDS.filter(function (x) { return x.k === k; })[0];
    }

    /* خليةٌ لحقل داخل سطر — عرضها بحسب عدد الحقول في السطر (٢ أو ٣). */
    function cellFor(k, rowEl, single, n) {
      if (single) return rowEl;
      var cell = el("div", (n >= 3 ? "flex:1 1 0;min-width:64px" : "flex:1 1 45%;min-width:0"));
      rowEl.appendChild(cell);
      return cell;
    }

    function renderKey(k, rowEl, single, n) {
      var f = defOf(k);
      if (!f) return;
      var cell = cellFor(k, rowEl, single, n);
      if (k === "clients" || k === "opponents") {
        inputs[k] = partiesEditor(cell, f, c[k], { kind: k, caseId: c.id });
        if (k === "clients" && ownerNorm()) {
          var ol = el("label", "display:flex;gap:8px;align-items:flex-start;margin:-4px 0 12px;font-size:13px;" +
            "color:var(--muted);cursor:pointer;line-height:1.7");
          var cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = !!c.ownerAsLawyer;
          cb.style.cssText = "margin-top:4px;flex:0 0 auto";
          ol.appendChild(cb);
          ol.appendChild(el("span", "", "⚖ مدير المكتب في القضية دي بصفته المحامي (مش موكل) — ما تظهرش في بوابته كموكل"));
          cell.appendChild(ol);
          inputs._ownerLawyer = cb;
        }
        return;
      }
      if (CASCADE_ORDER.indexOf(k) >= 0) {
        /* خانةٌ جاهزة تُملؤها القائمة المتسلسلة لاحقاً — يُحفظ الترتيب */
        var g = el("div", "margin-bottom:12px");
        g.appendChild(el("label",
          "display:block;font-family:var(--f-title);font-size:14px;" +
          "margin-bottom:5px;color:var(--brand-dark)", f.label));
        var holder = el("div");
        g.appendChild(holder);
        var note = el("div",
          "font-size:12.5px;color:var(--muted);margin-top:4px;line-height:1.8");
        g.appendChild(note);
        cell.appendChild(g);
        slots[k] = { holder: holder, note: note };
        return;
      }
      inputs[k] = field(cell, f, c[k], !!c.id);
    }

    function renderRow(keys, parent) {
      var single = keys.length === 1;
      var rowEl = single ? parent
        : el("div", "display:flex;gap:9px;flex-wrap:nowrap;align-items:flex-start");
      if (!single) parent.appendChild(rowEl);
      keys.forEach(function (k) { renderKey(k, rowEl, single, keys.length); });
    }

    /* ملاحظات التقويم — كانت تختفي أثناء تعديل بيانات القضية فيصعب التعرّف
       على هوية الخصوم منها؛ تُعرض هنا للقراءة فقط، فوق حقلَي الموكلين
       والخصوم مباشرة. */
    function notesPreview() {
      var log = c.noteLog || [];
      if (!log.length) return null;
      var wrap = el("div",
        "background:var(--bg,#f4ece0);border-radius:9px;padding:9px 12px;margin-bottom:12px;" +
        "font-size:13px;color:var(--brand-dark);line-height:1.85;max-height:140px;overflow-y:auto");
      wrap.appendChild(el("div",
        "font-family:var(--f-title);margin-bottom:4px;color:var(--brand-dark)",
        "📝 ملاحظات القضية"));
      log.slice(0, 6).forEach(function (n) {
        wrap.appendChild(el("div", "margin-bottom:3px;white-space:pre-line",
          (n.date ? ar(String(n.date).replace(/-/g, "/")) + " — " : "") + n.text));
      });
      return wrap;
    }

    var judgeWrap = null, holdWrap = null;
    LAYOUT.forEach(function (row) {
      if (row[0] === "clients") {
        var np = notesPreview();
        if (np) s.box.appendChild(np);
      }
      if (row[0] === "__crime__") {
        crimeWrap = el("div");
        s.box.appendChild(crimeWrap);
        [["crimeNo", "crimeYear"], ["totalNo", "totalYear"],
         ["appealKind", "appealNo", "appealYear"]].forEach(function (cr) {
          renderRow(cr, crimeWrap);
        });
        return;
      }
      if (row[0] === "__firstDegree__") {
        firstWrap = el("div");
        s.box.appendChild(firstWrap);
        renderRow(["firstNo", "firstYear"], firstWrap);
        return;
      }
      if (row[0] === "__appealCivil__") {
        appealCivilWrap = el("div");
        s.box.appendChild(appealCivilWrap);
        renderRow(["appealNo", "appealYear"], appealCivilWrap);
        return;
      }
      if (row[0] === "__judge__") {
        /* حقول الحكم ومواعيد الطعن — تظهر فقط حين الحالة «حكم» */
        judgeWrap = el("div");
        s.box.appendChild(judgeWrap);
        judgeWrap.appendChild(el("div",
          "font-family:var(--f-title);font-size:14px;color:var(--brand-dark);margin:2px 0 6px",
          "الحكم ومواعيد الطعن"));
        renderRow(["judgeDate", "judgeType"], judgeWrap);
        renderRow(["appealPeriod"], judgeWrap);
        setTimeout(function () {
          var upd = appealPreview(c, judgeWrap, function () {
            var jd = document.getElementById("cf_judgeDate"), ap = document.getElementById("cf_appealPeriod");
            return { judgeDate: jd ? jd.value : c.judgeDate, appealPeriod: ap ? ap.value : c.appealPeriod };
          });
          ["cf_judgeDate", "cf_appealPeriod"].forEach(function (id) {
            var e2 = document.getElementById(id);
            if (e2) { e2.addEventListener("input", upd); e2.addEventListener("change", upd); }
          });
        }, 0);
        return;
      }
      if (row[0] === "__hold__") {
        /* تاريخ الشطب/الوقف ومدته — تظهر فقط حين الحالة «شطب» أو «وقف» */
        holdWrap = el("div");
        s.box.appendChild(holdWrap);
        holdWrap.appendChild(el("div",
          "font-family:var(--f-title);font-size:14px;color:var(--brand-dark);margin:2px 0 6px",
          "الشطب / الوقف"));
        renderRow(["holdDate", "holdDays"], holdWrap);
        return;
      }
      renderRow(row, s.box);
    });

    /* إظهار/إخفاء حقول الحكم والشطب بحسب حالة الدعوى — الآن وعند تغييرها */
    function syncStatusFields() {
      var stSel = document.getElementById("cf_status");
      var st = norm(stSel ? stSel.value : (c.status || ""));
      var isHukm = st === norm("حكم") || st === norm("محجوزة للحكم") ||
                   st === norm("منتهية");
      var isHold = st === norm("شطب") || st === norm("وقف");
      /* حقول الحكم بتظهر دايماً (زي الأجندة) — مش بس لما الحالة تتكتب «حكم» باليد؛
         الحالة بقت بتتحسب من آخر قرار، فكانت الخانة بتستخبى والحكم صادر (طلب المستخدم ٥-١٠). */
      if (judgeWrap) judgeWrap.style.display = "";
      if (holdWrap) holdWrap.style.display = isHold ? "" : "none";
    }
    (function () {
      var stSel = document.getElementById("cf_status");
      if (stSel) stSel.addEventListener("change", syncStatusFields);
      syncStatusFields();
    })();

    /* مقر المحكمة يُملأ تلقائياً من قاموس عناوين المحاكم بمجرد اختيار المحكمة.
       خطأ سابق مُصحَّح: لو المحكمة الجديدة لا عنوان معروف لها، كانت الدالة
       تخرج فوراً (return) تاركةً في الحقل نص العنوان القديم (لمحكمة سابقة)
       دون مسحه — وعند الحفظ، Courts.setAddress كان يتعلَّم هذا النص الخطأ
       ويربطه بالمحكمة الجديدة للأبد. الآن: أي عنوان تلقائي قديم غير مطابق
       للمحكمة الحالية يُمسح فور تغيير المحكمة، سواء وُجد عنوان جديد أم لا. */
    var _lastAutoLoc = "";
    var _lastAutoLocCourt = "";
    function autoFillLoc(ctx) {
      if (!w.Courts || !Courts.addressOf) return;
      var locInp = document.getElementById("cf_loc");
      if (!locInp || !ctx.courtName) return;
      var courtChanged = ctx.courtName !== _lastAutoLocCourt;
      var isStale = locInp.value.trim() && locInp.value.trim() === _lastAutoLoc;
      if (courtChanged && isStale) {
        locInp.value = "";
        if (locInp._syncMaps) locInp._syncMaps();
      }
      var addr = Courts.addressOf(ctx.courtName);
      if (!addr) { _lastAutoLoc = ""; _lastAutoLocCourt = ctx.courtName; return; }
      /* املأ إن كان فارغاً أو كان مملوءاً تلقائياً بعنوان محكمة سابقة (لا تُتلِف يدوياً) */
      if (!locInp.value.trim() || locInp.value.trim() === _lastAutoLoc) {
        locInp.value = addr; _lastAutoLoc = addr; _lastAutoLocCourt = ctx.courtName;
        if (locInp._syncMaps) locInp._syncMaps();
      }
    }

    /* مهمة 20: دائرة (درجة + محكمة + دائرة) سبق تسجيل قاعتها ودورها وميعاد انعقادها
       في قضية أخرى — تُدرَج بمجرد اختيار الدائرة (الأكثر تكراراً). لا تُتلِف ما كتبه
       المستخدم يدوياً؛ وتُمسح فقط لو كانت هي نفسها مُدرَجة تلقائياً ولا بيان للدائرة الجديدة. */
    var _lastAutoVenue = {};
    function autoFillVenue(ctx) {
      if (!ctx || !ctx.courtName || !ctx.circuit) return;
      var key = norm(ctx.courtLevel) + "|" + norm(ctx.courtName) + "|" + norm(ctx.circuit);
      var freq = { hall: {}, floor: {}, time: {} };
      read().forEach(function (x) {
        if (x.id === c.id) return;
        if (norm(x.courtLevel) + "|" + norm(x.courtName) + "|" + norm(x.circuit) !== key) return;
        ["hall", "floor", "time"].forEach(function (k) {
          var v = String(x[k] || "").trim();
          if (v) freq[k][v] = (freq[k][v] || 0) + 1;
        });
      });
      ["hall", "floor", "time"].forEach(function (k) {
        var elx = document.getElementById("cf_" + k);
        if (!elx) return;
        var best = "", n = 0;
        Object.keys(freq[k]).forEach(function (v) { if (freq[k][v] > n) { n = freq[k][v]; best = v; } });
        var cur = String(elx.value || "").trim();
        if (best) {
          if (cur && cur !== _lastAutoVenue[k]) return;           /* كتبه المستخدم — لا يُمَسّ */
          if (elx.tagName === "SELECT" && ![].some.call(elx.options, function (o) { return o.value === best; })) {
            var op = document.createElement("option"); op.value = best; op.textContent = best; elx.appendChild(op);
          }
          elx.value = best; _lastAutoVenue[k] = best;
        } else if (cur && cur === _lastAutoVenue[k]) {
          elx.value = ""; _lastAutoVenue[k] = "";
        }
        elx.dispatchEvent(new Event("input", { bubbles: true }));
        elx.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }

    /* رقم الدعوى/السنة يعبّران عن أرقام مختلفة تماماً حسب درجة التقاضي —
       نفس القضية ممكن يكون لها رقم دعوى أمام أول درجة، ثم رقم استئناف
       مختلف تماماً بعد الترحيل، ثم رقم طعن بالنقض مختلف كذلك. كل درجة
       سجلٌّ مستقل بالفعل (عبر promote())، فحقل caseNo/caseYear في كل
       سجل هو رقمه هو في درجته هو — لكن التسمية تتغيّر لتوضيح أي رقم هذا. */
    function relabelCaseNo(level) {
      var noLbl = "رقم " + caseNoLabel(level);
      var yrLbl = caseYearLabel(level);
      var lNo = document.getElementById("cf_lbl_caseNo");
      var lYr = document.getElementById("cf_lbl_caseYear");
      if (lNo) lNo.textContent = noLbl;
      if (lYr) lYr.textContent = yrLbl;
    }

    /* القوائم المتسلسلة تُبنى في خاناتها المرتَّبة */
    cascade = courtCascade(s.box, c, function (ctx) {
      toggleCrime(ctx.caseType); autoFillLoc(ctx); autoFillVenue(ctx); relabelCaseNo(ctx.courtLevel);
      toggleFirstDegree(ctx.courtLevel); toggleAppealCivil(ctx.courtLevel, ctx.caseType);
      suggestLevelFor(ctx);
    }, slots, !!c.id);
    toggleCrime((cascade ? cascade.values().caseType : c.caseType) || c.caseType);
    relabelCaseNo((cascade ? cascade.values().courtLevel : c.courtLevel) || c.courtLevel);
    toggleFirstDegree((cascade ? cascade.values().courtLevel : c.courtLevel) || c.courtLevel);
    toggleAppealCivil((cascade ? cascade.values().courtLevel : c.courtLevel) || c.courtLevel,
                       (cascade ? cascade.values().caseType : c.caseType) || c.caseType);
    suggestLevelFor(cascade ? cascade.values() : c);

    /* تُجمَّع كل قيم الفورم الحالية بنفس منطق قراءة save.onclick أدناه
       تماماً، لكن للحفظ التلقائي فقط — لا تُكتب أبداً في سجل القضايا
       الحقيقي إلا بالضغط الصريح على "حفظ". */
    function collectDraft() {
      var d = {};
      FIELDS.forEach(function (f) {
        if (f.cascade) return;
        var acc = inputs[f.k]; if (!acc) return;
        d[f.k] = (typeof acc.value === "function") ? acc.value()
          : String(acc.value == null ? "" : acc.value);
      });
      if (cascade) {
        var cv = cascade.values();
        CASCADE_ORDER.forEach(function (k) { d[k] = cv[k] || ""; });
      }
      if (inputs.clients) d.clients = inputs.clients.value ? inputs.clients.value()
        : (inputs.clients.get ? inputs.clients.get() : c.clients);
      if (inputs.opponents) d.opponents = inputs.opponents.value ? inputs.opponents.value()
        : (inputs.opponents.get ? inputs.opponents.get() : c.opponents);
      return d;
    }
    var _draftTimer = null;
    function writeDraft() {
      if (!_draftBase) return;              /* الفورم لسه بيتجهّز */
      var d = collectDraft();
      try {
        if (JSON.stringify(d) === JSON.stringify(_draftBase)) localStorage.removeItem(draftKey);
        else localStorage.setItem(draftKey, JSON.stringify({ at: Date.now(), base: _draftBase, data: d }));
      } catch (e) { }
    }
    function scheduleDraftSave() {
      clearTimeout(_draftTimer);
      _draftTimer = setTimeout(function () {
        if (!s.back.isConnected) return;   /* الفورم اتقفل (اتحفظ أو اتلغى) — ما ترجعش المسودة */
        writeDraft();
      }, 900);
    }
    s.box.addEventListener("input", scheduleDraftSave);
    s.box.addEventListener("change", scheduleDraftSave);
    /* الاختيار من القوايم/الاقتراحات بيتم بالضغط مش بالكتابة، فبيتسجّل كمان */
    s.box.addEventListener("click", scheduleDraftSave);
    /* التطبيق راح الخلفية (مكالمة، زرار الهوم، إعادة تشغيل): احفظ حالاً من غير انتظار */
    function flushCaseDraft() {
      if (document.visibilityState !== "hidden" || !s.back.isConnected) return;
      clearTimeout(_draftTimer);
      writeDraft();
    }
    document.addEventListener("visibilitychange", flushCaseDraft);

    /* لو رقم الدعوى/السنة اتكتب بعد ما اتحدد نوع الدعوى الجنائي، كمّل
       الجناية/الجنحة بنفس الرقم لحظياً كذلك (لا فقط عند تغيير النوع). */
    function currentCaseType() {
      return (cascade ? cascade.values().caseType : c.caseType) || c.caseType;
    }
    if (inputs.caseNo) inputs.caseNo.addEventListener("input", function () {
      toggleCrime(currentCaseType());
    });
    if (inputs.caseYear) inputs.caseYear.addEventListener("input", function () {
      toggleCrime(currentCaseType());
    });

    /* زر «فتح في خرائط جوجل» بجوار حقل مقر المحكمة */
    (function () {
      var locInp = document.getElementById("cf_loc");
      if (!locInp || !w.Courts || !Courts.mapsUrl) return;
      var bar = el("div", "display:flex;gap:8px;margin-top:6px");
      var mapBtn = btn("📍 فتح في خرائط جوجل",
        "flex:1;border:1px solid var(--line,#ddd);background:transparent;color:var(--brand);" +
        "font-size:13px;min-height:40px;border-radius:9px");
      mapBtn.onclick = function () {
        var v = locInp.value.trim(); if (!v) return;
        var u = Courts.mapsUrl(v);
        if (w.AndroidShare && AndroidShare.openUrl) AndroidShare.openUrl(u);
        else window.open(u, "_blank");
      };
      bar.appendChild(mapBtn);
      locInp.parentNode.appendChild(bar);
      locInp._syncMaps = function () { mapBtn.style.opacity = locInp.value.trim() ? "1" : ".5"; };
      locInp._syncMaps();
      /* لو المحكمة محدَّدة مسبقاً والمقر فارغ، املأه الآن */
      if (cascade) autoFillLoc(cascade.values());
    })();
    /* بعد بناء كل الحقول: دائرة محدَّدة مسبقاً ← قاعتها/دورها/ميعادها المعروفة */
    if (cascade) autoFillVenue(cascade.values());

    var save = btn("حفظ", "border:0;background:var(--brand);color:#fff;font-weight:600");
    var cancel = btn("إلغاء",
      "border:1px solid var(--line,#ddd);background:transparent;color:var(--muted)");

    save.onclick = function () {
      var list = read();
      var wasNew = !c.id;
      var target = c.id ? list.filter(function (x) { return x.id === c.id; })[0] : null;

      if (!target) {
        target = { id: "cf" + Date.now().toString(36), sessions: [] };
        list.push(target);
      }
      /* مهمة 38: قيم قبل التعديل لحقول مشتركة بين القضايا (لتعميم التصحيح) */
      var TRACK = [["courtName", "اسم المحكمة"], ["circuit", "الدائرة"], ["courtLevel", "درجة التقاضي"], ["caseType", "نوع القضية"]];
      var before = {};
      TRACK.forEach(function (t) { before[t[0]] = target[t[0]] || ""; });
      FIELDS.forEach(function (f) {
        if (f.cascade) return;
        var acc = inputs[f.k];
        var v = (typeof acc.value === "function")
          ? acc.value()
          : String(acc.value == null ? "" : acc.value).trim();
        /* حقول التاريخ (تاريخ الحكم · تاريخ الشطب/الوقف) تُحوَّل لصيغة ISO
           كما تُحفَظ حقول تاريخ الجلسة تماماً — وإلا انكسرت عدّادات الطعن
           والشطب لاحقاً لأنها تقارن نصاً عربياً بصيغة ISO. */
        if (f.date && v && w.lawyerToISO) v = w.lawyerToISO(v) || v;
        /* المستخدم غيّر الحالة بإيده ← تبقى حالته هو ومش بتمشي مع القرارات */
        if (f.k === "status" && v !== String(target.status || "").trim()) delete target.statusAuto;
        target[f.k] = v;
      });
      if (cascade) {
        var cv = cascade.values();
        CASCADE_ORDER.forEach(function (k) { target[k] = cv[k] || ""; });
      }
      if (inputs._ownerLawyer) {
        if (inputs._ownerLawyer.checked) target.ownerAsLawyer = true; else delete target.ownerAsLawyer;
      }
      /* تذكّر عنوان مقر المحكمة لهذه المحكمة — يظهر تلقائياً في المرات القادمة */
      if (w.Courts && Courts.setAddress && target.courtName && target.loc)
        Courts.setAddress(target.courtName, target.loc);
      /* تذكّر باقي الحقول المتكرّرة (المحامي/الدرجة/المحكمة/النوع/الدائرة/
         القاعة...) لاقتراحها تلقائياً في أول قضية جديدة تالية — فقط لو
         كانت هذه قضية جديدة فعلاً (لا تعديل قضية موجودة). */
      if (wasNew) {
        LAST_NEW_CASE_FIELDS.forEach(function (k) {
          try {
            if (target[k]) localStorage.setItem("proflawyer.lastNewCase." + k, target[k]);
          } catch (e) { }
        });
      }
      var finishSave = function (all) {
        if (!(all ? write(list) : write(list, target.id))) return;
        try { localStorage.removeItem(draftKey); } catch (e) { }
        _idx = null;
        forgetUsed();
        s.back.remove();
        if (done) done(target);
      };

      /* مهمة 38: تصحيح قيمة مسجَّلة ⇒ اعرض عدد القضايا الأخرى التي تحمل نفس القيمة القديمة
         (مع تجاهل الحروف المتشابهة) واسأل: طبّق على الكل / هذه القضية فقط. */
      var fixes = [];
      if (!wasNew && w.lawyerNorm) {
        TRACK.forEach(function (t) {
          var k = t[0], oldV = before[k], newV = target[k] || "";
          if (!oldV || !newV || oldV === newV || w.lawyerNorm(oldV) === w.lawyerNorm(newV)) return;
          var hits = list.filter(function (x) {
            return x !== target && x[k] && w.lawyerNorm(x[k]) === w.lawyerNorm(oldV) && x[k] !== newV;
          });
          if (hits.length) fixes.push({ k: k, label: t[1], oldV: oldV, newV: newV, hits: hits });
        });
      }
      if (!fixes.length) { finishSave(false); return; }
      Ask.confirm("تعميم التصحيح على القضايا المشابهة؟", {
        danger: false, ok: "طبّق على الكل", cancel: "هذه القضية فقط",
        detail: fixes.map(function (x) {
          return x.label + ": «" + x.oldV + "» ← «" + x.newV + "»" + String.fromCharCode(10) +
                 "يُطبَّق على " + ar(x.hits.length) + " قضية أخرى.";
        }).join(String.fromCharCode(10) + String.fromCharCode(10))
      }, function () {
        fixes.forEach(function (x) { x.hits.forEach(function (h) { h[x.k] = x.newV; }); });
        finishSave(true);
      }, function () { finishSave(false); });
    };
    cancel.onclick = function () {
      try { localStorage.removeItem(draftKey); } catch (e) { }
      s.back.remove();
    };
    row(s.box, [save, cancel]);
    s.back.__onDiscard = function () { try { localStorage.removeItem(draftKey); } catch (e) { } };
    setTimeout(function () { if (!_draftBase && s.back.isConnected) _draftBase = collectDraft(); }, 300);
  }

  /* ------------------------------------------------------------ جلسة واحدة */

  /* قرار الجلسة المؤجَّلة يدخل الأعمال الإدارية تلقائياً (يكمله المستخدم أو يحذفه): نصّ القرار = العمل المطلوب،
     وتاريخ العمل = تاني يوم من الجلسة (أقصاه ٩ أيام)، والمكلَّف وباقي التفاصيل يحدّدها المستخدم. لا يكرّر ما أُنشئ من قبل. */
  /* موعد تنفيذ العمل = تاني يوم من الجلسة، وبحدٍّ أقصى ٩ أيام من تاريخها (ولا يتجاوز يوماً قبل الجلسة الجديدة)،
     ولا يسبق اليوم. يعيد {due, max} بصيغة ISO. */
  function dueDates(sessionIso, nextIso) {
    var pad = function (n) { return ("0" + n).slice(-2); };
    function add(iso, n) {
      var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); if (!m) return iso;
      var d = new Date(+m[1], +m[2] - 1, +m[3] + n);
      return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    }
    var max = add(sessionIso, 9);
    if (nextIso && add(nextIso, -1) > sessionIso && add(nextIso, -1) < max) max = add(nextIso, -1);
    var due = add(sessionIso, 1);
    if (due > max) due = max;
    var t = today();
    if (due < t) due = t;
    if (max < due) max = due;
    return { due: due, max: max };
  }
  function isoAdd(iso, days, months) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); if (!m) return iso;
    var d = new Date(+m[1], +m[2] - 1 + (months || 0), +m[3] + (days || 0)), pad = function (n) { return ("0" + n).slice(-2); };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  /* قواعد المكتب لقرارات الجلسات → عمل إداري بميعاد (dueDate = آخر موعد، يظهر متناقصاً «متبقي N يوم»):
       • حجز للحكم: الاطلاع على الحكم بعد يوم الحكم (الجلسة الجديدة) وحتى ٨ أيام
       • الشطب: تجديد خلال ٦٠ يوماً من قرار الشطب
       • الوقف الجزائي: تعجيل خلال ٨ أيام
       • الوقف التعليقي: تعجيل خلال ٦ أشهر من زوال سبب الوقف (يحدّد المستخدم الموعد بعد زواله)
       • حكم النقض: تعجيل خلال ٦ أشهر من الحكم
       • «أول جلسة»: كتابة وتنفيذ وإعلان (إعادة الإعلان)
       • غير ذلك (قرار + جلسة جديدة): تاني يوم من الجلسة وأقصاه ٩ أيام. */
  function decisionTask(c, rec) {
    var raw = rec.raw || {}, txt = String(resultOf(rec) || "").trim(), next = raw.next || "", iso = rec.date;
    var T = norm((txt + " " + (raw.type || "")));
    var typ = norm(raw.type || ""), lvl = norm(c.courtLevel || "");
    if (next && (typ === norm("حجز للحكم") || containsAny(T, ["حجز للحكم", "حجزت للحكم", "للنطق بالحكم", "حجز الدعوى للحكم"])))
      return { kind: "read", text: "الاطلاع على الحكم" + (txt ? " — " + txt : ""), taskDate: isoAdd(next, 1), dueDate: isoAdd(next, 8),
               note: "بعد الجلسة المحدَّدة للحكم بيوم وحتى ٨ أيام" };
    if (containsAny(T, ["شطب"]) && !containsAny(T, ["تجديد"]))
      return { kind: "renew", text: "تجديد الدعوى من الشطب — " + txt, taskDate: isoAdd(iso, 1), dueDate: isoAdd(iso, 60),
               note: "ميعاد التجديد ٦٠ يوماً من قرار الشطب" };
    if (containsAny(T, ["وقف جزائي"]))
      return { kind: "stayp", text: "تعجيل من الوقف الجزائي — " + txt, taskDate: isoAdd(iso, 1), dueDate: isoAdd(iso, 8),
               note: "التعجيل خلال ٨ أيام من قرار الوقف" };
    if (containsAny(T, ["وقف تعليقي", "وقف تعليق"]))
      return { kind: "stayc", text: "تعجيل من الوقف التعليقي — " + txt, taskDate: "", dueDate: "",
               note: "خلال ٦ أشهر من زوال سبب الوقف — حدّد «التسليم» عند زوال السبب (آخر موعد = زوال السبب + ٦ أشهر)" };
    if (containsAny(lvl, ["نقض"]) && typ === norm("حكم"))
      return { kind: "cass", text: "تعجيل بعد حكم النقض — " + txt, taskDate: isoAdd(iso, 1), dueDate: isoAdd(iso, 0, 6),
               note: "خلال ٦ أشهر من تاريخ حكم النقض" };
    if (!txt || !next) return null;
    var dd = dueDates(iso, next);
    var first = containsAny(T, ["اول جلسة"]);
    return { kind: first ? "first" : "gen", text: first ? txt + " — كتابة وتنفيذ وإعلان (إعادة الإعلان)" : txt,
             taskDate: dd.due, dueDate: dd.max, note: "" };
  }
  function autoAdminTask(c, rec) {
    var spec = decisionTask(c, rec);
    if (!spec) return false;
    c.adminTasks = c.adminTasks || [];
    var iso = rec.date;
    var same = c.adminTasks.filter(function (t) { return t.fromSession === iso; })[0];
    if (same) {
      if (same.text === spec.text) return false;
      if (same.auto && (same.state || "لم يتم") === "لم يتم" && !(same.assignees || []).length) {
        same.text = spec.text; same.taskDate = spec.taskDate; same.dueDate = spec.dueDate; same.autoKind = spec.kind; return true;
      }
    }
    var keys = c.autoTaskKeys = c.autoTaskKeys || {};
    var key = iso + "|" + spec.kind + "|" + spec.text;
    if (keys[key]) return false;
    keys[key] = 1;
    c.adminTasks.push({ id: "at" + Date.now().toString(36) + Math.floor(Math.random() * 99), text: spec.text, taskDate: spec.taskDate,
      dueDate: spec.dueDate, assignees: [], prio: "", state: "لم يتم", subs: [], autoKind: spec.kind,
      notes: "من قرار جلسة " + ar(String(iso).replace(/-/g, "/")) + (spec.note ? " — " + spec.note : ""),
      auto: true, fromSession: iso });
    return true;
  }
  function notice(msg) {
    var d = el("div", "position:fixed;left:50%;transform:translateX(-50%);bottom:90px;z-index:99999;max-width:88%;" +
      "background:#1e5b33;color:#fff;padding:11px 18px;border-radius:12px;font-size:14px;line-height:1.7;box-shadow:0 4px 16px rgba(0,0,0,.3)", msg);
    d.setAttribute("data-nosave", "1"); document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 3200);
  }

  function editSession(caseId, index, done) {
    var list = read();
    var c = list.filter(function (x) { return x.id === caseId; })[0];
    if (!c) return;
    c.sessions = c.sessions || [];

    var isNew = index < 0;
    var cur = isNew ? { date: "", raw: {} } : c.sessions[index];
    var raw = cur.raw || {};

    var s = sheet(10014);
    head(s.box, isNew ? "جلسة جديدة" : "تعديل الجلسة");

    /* §2.2 — «قرار الجلسة السابقة وتاريخه»: يُسحب تلقائياً من الجلسة السابقة
       (تاريخها · سبب تأجيلها · قرارها)، ومقفولٌ للعرض فقط — لا يُعدَّل إلا من
       الجلسة السابقة نفسها. */
    /* جلسة قديمة من غير قرار سابق محمول: ناخده من الجلسة اللي قبلها بالتاريخ (عرض بس) */
    if (!isNew && !(raw.prevDate || raw.prevResult || raw.prevReason) && cur.date) {
      var before = c.sessions.filter(function (x) { return x !== cur && x.date && x.date < cur.date; })
        .sort(function (a, b) { return a.date < b.date ? -1 : 1; }).pop();
      if (before) {
        var bRes = resultOf(before), bRea = reasonOf(before);
        raw = Object.assign({}, raw, { prevDate: before.date, prevType: (before.raw && before.raw.type) || "",
          prevReason: bRea, prevResult: bRes === bRea ? "" : bRes });
        raw.__prevDerived = true;
      }
    }
    if (raw.prevDate || raw.prevResult || raw.prevReason) {
      var pv = el("div",
        "background:var(--bg,#f4ece0);border-radius:11px;padding:12px 14px;" +
        "margin-bottom:14px;font-size:13.5px;line-height:1.95;" +
        "border-inline-start:4px solid var(--brand)");
      pv.appendChild(el("div",
        "font-family:var(--f-title);color:var(--brand-dark);margin-bottom:6px",
        "قرار الجلسة السابقة وتاريخه"));
      pv.appendChild(el("div", "",
        "جلسة " + dayDate(raw.prevDate) +
        (raw.prevType ? " — " + raw.prevType : "")));
      if (raw.prevReason) pv.appendChild(el("div", "", "سبب التأجيل: " + raw.prevReason));
      if (raw.prevResult) pv.appendChild(el("div",
        "margin-top:4px;white-space:pre-line", "القرار: " + raw.prevResult));
      pv.appendChild(el("div",
        "margin-top:7px;font-size:12px;color:var(--muted)",
        "🔒 عرض فقط — يُعدَّل من الجلسة السابقة نفسها."));
      s.box.appendChild(pv);
    }

    /* كل بيانات الجلسة بتظهر في حقولها مقفولة وجنب كل حقل ✎ لتعديله لوحده.
       القرار متخزّن في جلسات كتير باسم decision، وسبب التأجيل باسم for/reason (من البرنامج القديم
       والأجندة) — بيتقروا كلهم، ومن غير كده الحقل كان بيظهر فاضي والحفظ كان بيمسحهم. */
    var oRaw = cur.raw || {};
    var shownResult = oRaw.result || oRaw.decision || "";
    var shownReason = oRaw["for"] || oRaw.reason || "";
    var resultFromReason = false;
    if (!shownResult && shownReason) { shownResult = shownReason; shownReason = ""; resultFromReason = true; }
    else if (shownReason && norm(shownReason) === norm(shownResult)) shownReason = "";
    var defs = [];
    SESSION_FIELDS.forEach(function (f) {
      defs.push(f);
      if (f.k === "result" && shownReason)
        defs.push({ k: "for", label: "سبب التأجيل", multi: true, suggest: true, sessionKey: true });
    });
    if (!isNew && oRaw.notes) defs.push({ k: "notes", label: "ملاحظات الجلسة", multi: true });
    var inputs = {}, shown = {};
    defs.forEach(function (f) {
      var v = f.k === "date" ? (cur.date || oRaw.date || "") :
              f.k === "result" ? shownResult : f.k === "for" ? shownReason : (oRaw[f.k] || "");
      shown[f.k] = String(v || "").trim();
      inputs[f.k] = field(s.box, f, v, !isNew);
      if (f.date) {
        inputs[f.k].placeholder = "٢٠٢٦/١٠/١٥";
        inputs[f.k].setAttribute("dir", "ltr");
      }
    });

    /* §الحكم القطعي (طلب المستخدم ٥-١٠ — زي الأجندة): لما قرار الجلسة يبقى حكم صادر، يظهر
       «تاريخ الحكم القطعي» ونوعه وميعاد الطعن، وآخر ميعاد بيتحسب لوحده ويتحفظ على القضية
       (judgeDate / judgeType / appealPeriod) — فالعدّاد والتنبيه واللون الأصفر يشتغلوا. */
    function pronounced(t) {
      var T = norm(t || "");
      if (!T) return false;
      /* حجز للحكم / حكم تمهيدي (ندب خبير، إحالة للتحقيق، استجواب، إعادة للمرافعة) مش حكم قطعي —
         بس «تقرير الخبير» جوه منطوق حكم صادر ما يمنعش (ملف ١٧٩٠). */
      if (containsAny(T, JUDGMENT_WORDS) || /للحكم|للنطق|مذكرات|ندب|للخبير|لمكتب الخبراء|للتحقيق|استجواب|احاله|للمرافعه/.test(T)) return false;
      return /(^|\s)(حكم|حكمت|قضت|بقبول|قبول|برفض|رفض|تاييد|بتاييد|الغاء|بالغاء|عدم|انقضاء|سقوط|بطلان|براءه|ادانه)/.test(T);
    }
    var sessIso0 = (w.lawyerToISO ? w.lawyerToISO(cur.date || "") : cur.date) || "";
    var jWrap = el("div", "border:1px solid var(--line,#ddd);border-radius:11px;padding:10px 12px;margin:4px 0 12px");
    var jToggle = el("button", "width:100%;min-height:44px;border:1px dashed var(--brand);border-radius:9px;background:transparent;" +
      "color:var(--brand);font-family:inherit;font-size:14px", "⚖ صدر حكم قطعي في الجلسة دي؟ — سجّل تاريخه وميعاد الطعن");
    jToggle.type = "button";
    var jBody = el("div", "display:none;margin-top:10px");
    jBody.appendChild(el("div", "font-family:var(--f-title);font-size:14px;color:var(--brand-dark);margin-bottom:6px",
      "الحكم ومواعيد الطعن"));
    var jHad = c.judgeDate && (!sessIso0 || String(c.judgeDate) >= sessIso0);
    var jIn = {
      d: field(jBody, { k: "judgeDate", label: "تاريخ الحكم القطعي", date: true,
        note: "يوم النطق بالحكم — العد من اليوم التالي." }, jHad ? c.judgeDate : (sessIso0 || ""), false),
      t: field(jBody, { k: "judgeType", label: "نوع الحكم",
        options: ["", "حضوري شخصي", "حضوري توكيل", "حضوري اعتباري", "غيابي"] }, jHad ? (c.judgeType || "") : "", false),
      p: field(jBody, { k: "appealPeriod", label: "ميعاد الطعن (بالأيام — أقصاه ٦٠)",
        note: "مكتوب الميعاد القانوني — عدّله لو الحكم ليه ميعاد تاني (مثال ١٠ أو ١٥ أو ٦٠)." },
        (jHad && c.appealPeriod) ? c.appealPeriod : ar(legalAppealDays(c)), false)
    };
    var jUpd = appealPreview(c, jBody, function () { return { judgeDate: jIn.d.value, appealPeriod: jIn.p.value }; });
    ["input", "change"].forEach(function (ev) { jIn.d.addEventListener(ev, jUpd); if (jIn.p.addEventListener) jIn.p.addEventListener(ev, jUpd); });
    var jOpen = false;
    function setJ(open) {
      jOpen = open; jBody.style.display = open ? "" : "none";
      jToggle.textContent = open ? "✕ مش حكم قطعي — اقفل الخانة" : "⚖ صدر حكم قطعي في الجلسة دي؟ — سجّل تاريخه وميعاد الطعن";
      if (open) jUpd();
    }
    function judgmentPrefix() {
      if (!inputs.result) return;
      var v = String(inputs.result.value || "");
      if (FINAL_RE.test(v)) return;
      inputs.result.value = "حكمت المحكمة: " + v.replace(/^\s*حكم\s*[—\-–:]*\s*/, "").replace(/^\s*حكمت\s*[—\-–:]*\s*/, "");
      try { inputs.result.dispatchEvent(new Event("input")); } catch (e) { }
    }
    jToggle.onclick = function () { setJ(!jOpen); if (jOpen) judgmentPrefix(); };
    jWrap.appendChild(jToggle); jWrap.appendChild(jBody);
    s.box.appendChild(jWrap);
    if (jHad || pronounced(shownResult) || String(oRaw.type || "").trim() === "حكم") setJ(true);
    if (inputs.result && inputs.result.addEventListener) inputs.result.addEventListener("input", function () {
      if (!jOpen && pronounced(inputs.result.value)) setJ(true);
    });

    var save = btn("حفظ الجلسة",
      "border:0;background:var(--brand);color:#fff;font-weight:600");
    var cancel = btn("إلغاء",
      "border:1px solid var(--line,#ddd);background:transparent;color:var(--muted)");

    save.onclick = function () {
      var iso = w.lawyerToISO ? w.lawyerToISO(inputs.date.value) : la(inputs.date.value);
      if (!iso) { alert("اكتب تاريخ الجلسة — مثال ٢٠٢٦/١٠/١٥."); inputs.date.focus(); return; }

      var oldNext = (cur.raw && cur.raw.next) || "";

      /* الجلسة بتتحفظ زي ما هي، ويتغيّر بس الحقل اللي اتعدّل فعلاً */
      var rec = isNew ? { date: iso, raw: {} } : JSON.parse(JSON.stringify(cur));
      var changed = {};
      rec.date = iso; rec.raw = rec.raw || {};
      if (rec.raw.date !== undefined) rec.raw.date = iso;
      defs.forEach(function (f) {
        if (f.k === "date") return;
        var v = String(inputs[f.k].value || "").trim();
        if (f.k === "next" && v) v = (w.lawyerToISO ? w.lawyerToISO(v) : v) || "";
        if (!isNew && latDigits(v) === latDigits(shown[f.k])) return;   /* ما اتغيّرش (الحقل بيعرض الأرقام عربي) ← يفضل زي ما هو */
        changed[f.k] = true;
        if (f.k === "result") {
          rec.raw.result = v;
          if (rec.raw.decision !== undefined) rec.raw.decision = v;
          if (resultFromReason) { if (rec.raw["for"] !== undefined) rec.raw["for"] = v; if (rec.raw.reason !== undefined) rec.raw.reason = v; }
        } else if (f.k === "for") {
          rec.raw["for"] = v;
          if (rec.raw.reason !== undefined) rec.raw.reason = v;
        } else {
          rec.raw[f.k] = v;
          if (f.k === "type") delete rec.raw.typeAuto;     /* المستخدم اختار النوع بنفسه */
        }
      });

      if (jOpen) {
        /* الحكم القطعي: القرار يبدأ بـ«حكمت المحكمة:» وتتعلّم الجلسة «قطعي» */
        rec.raw.judgment = "قطعي";
        if (!FINAL_RE.test(String(rec.raw.result || rec.raw.decision || ""))) {
          var jr = "حكمت المحكمة: " + String(rec.raw.result || rec.raw.decision || "").replace(/^\s*حكم\s*[—\-–:]*\s*/, "");
          rec.raw.result = jr; if (rec.raw.decision !== undefined) rec.raw.decision = jr;
        }
        var jIsoS = (w.lawyerToISO ? w.lawyerToISO(jIn.d.value) : jIn.d.value) || "";
        if (jIsoS) {
          c.judgeDate = jIsoS;
          c.judgeType = String(jIn.t.value || "").trim();
          c.appealPeriod = String(jIn.p.value || "").trim();
        }
      }
      if (isNew) c.sessions.push(rec);
      else c.sessions[index] = rec;
      /* تاريخ الجلسة اتغيّر ← الجلسة اللي كانت مأجّلة ليها تتعدّل «الجلسة الجديدة» بتاعتها */
      if (!isNew && cur.date && iso !== cur.date) {
        c.sessions.forEach(function (x) { if (x !== rec && x.raw && x.raw.next === cur.date) x.raw.next = iso; });
        (c.adminTasks || []).forEach(function (t) { if (t.fromSession === cur.date) t.fromSession = iso; });
      }

      /* تأجّلت لجلسة جديدة؟ رحّل القضية وثبّت قرار هذه الجلسة معها. */
      forward(c, rec, oldNext);
      if (AUTO_STATUS[String(c.status || "").trim()] || c.statusAuto) {
        var dst = decisionStatus(c);
        if (dst && dst !== c.status) { c.status = dst; c.statusAuto = true; }
      }
      /* العمل الإداري بيتعمل من آخر قرار في آخر جلسة بس، ولما القرار أو ميعاد التأجيل يتغيّر —
         تعديل الرول أو النوع في جلسة قديمة ما يطلّعش أعمال من قرارات فاتت. */
      var isLatest = !c.sessions.some(function (x) { return x !== rec && x.date > rec.date && resultOf(x); });
      var _madeTask = (isNew || changed.result || changed["for"] || changed.next || iso !== cur.date) && isLatest
        ? autoAdminTask(c, rec) : false;

      if (!write(list, c.id)) return;
      forgetUsed();
      s.back.remove();
      if (_madeTask) notice("✅ أُضيف قرار الجلسة إلى «الأعمال الإدارية» — حدّد المكلَّف أو احذفه.");

      /* حكم قطعي صدر الآن (jOpen) ← ترحيل فوري لدرجة أعلى بلا انتظار جلسة
         تالية مُسجَّلة (طلب المستخدم ٢-١١-٢٠٢٦) — تاريخ الجلسة الأولى في
         الدرجة الأعلى يُترك فاضياً للمستخدم يملاه بنفسه. لو فيه سجل مُرحَّل
         فعلاً لنفس القضية (ترحيل سابق)، ما يتكررش. */
      if (jOpen) {
        var _nxt = resolveLevel(nextLevel(c.courtLevel));
        var _already = list.some(function (x) { return x.promotedFrom === c.id; });
        if (_nxt && !_already) {
          var _list2 = read();
          var _c2 = _list2.filter(function (x) { return x.id === c.id; })[0];
          if (_c2) { _c2.status = "منتهية"; delete _c2.statusAuto; write(_list2, _c2.id); }
          promote(c.id, function (hi) {
            notice("↪ صدر حكم قطعي — القضية اترحّلت تلقائياً لدرجة «" + (hi.courtLevel || _nxt) +
                   "» بنفس رقم الملف (الحالة: منتهية). حدّد جلستها الأولى من سجلها الجديد.");
          });
          if (done) done();
          return;
        }
      }

      var _after = sessionsAfterJudgment(c), _J = finalJudgmentOf(c);
      if (_after.length && _J) {
        Ask.confirm("فيه " + ar(_after.length) + " جلسة بعد الحكم القطعي (" + dayDate(_J.date) + ") — أنقلها لدرجة التقاضي الأعلى (" +
          (resolveLevel(nextLevel(c.courtLevel)) || "الدرجة الأعلى") + ") بنفس رقم الملف؟", {
          danger: false, ok: "انقلها", cancel: "لأ",
          detail: "أول جلسة بعد الحكم القطعي = درجة التقاضي الأعلى. سجل أول درجة هيتعلّم «منتهية»، ولو مفيش سجل للدرجة الأعلى هيتعمل."
        }, function () {
          var hi = moveAfterJudgment(c.id);
          if (hi) notice("↪ الجلسات اتنقلت لـ" + (hi.courtLevel || "الدرجة الأعلى") + " — كمّل بيانات الطعن (رقمه والمحكمة) من سجلها.");
          if (done) done();
        }, function () { if (done) done(); });
        return;
      }

      /* القرار قد يكشف دعوى فرعية أو ضمّاً — كما في الأجندة */
      var kind = detectLinked(rec.raw.result);
      if (kind && !c.linkedTo) {
        Ask.confirm("القرار يشير إلى " +
                    (kind === "فرعية" ? "دعوى فرعية" : "قضية منضمة") +
                    " — أُنشئها الآن مرتبطةً بهذه القضية؟", {
          danger: false, ok: "إنشاؤها", cancel: "لا",
          detail: kind === "فرعية"
            ? "ستأخذ رقم الدعوى وسنتها ومحكمتها ودائرتها، ويبقى موضوعها وصفات أطرافها لك."
            : "ستأخذ المحكمة والدائرة وبيانات الانعقاد، ورقمها وسنتها تُدرجهما بنفسك."
        }, function () {
          addLinked(c.id, kind, function () { if (done) done(); });
        }, function () { if (done) done(); });
        return;
      }
      if (done) done();
    };
    cancel.onclick = function () { s.back.remove(); };
    row(s.box, [save, cancel]);

    if (!isNew) {
      var del = btn("🗑 حذف الجلسة",
        "border:1px solid #e3c9c6;background:transparent;color:#b3261e");
      del.style.flex = "1 1 100%";
      del.onclick = function () {
        Ask.confirm("حذف هذه الجلسة؟", {
          detail: ar(String(cur.date || "بدون تاريخ").replace(/-/g, "/")) +
                  (raw.decision ? String.fromCharCode(10) + raw.decision : ""),
          ok: "حذف الجلسة"
        }, function () {
          c.sessions.splice(index, 1);
          if (!write(list, c.id)) return;
          s.back.remove();
          if (done) done();
        });
      };
      row(s.box, [del], "margin-top:10px");
    }
  }

  /* ------------------------------------------------------------- المرفقات */

  function attIds(c) {
    if (!w.Attach) return [];
    var pre = "case_" + c.id + "_";
    return Attach.list().filter(function (n) { return n.indexOf(pre) === 0; });
  }

  function attachments(c, box, redraw) {
    box.textContent = "";
    var ids = attIds(c);

    if (!ids.length) {
      box.appendChild(el("div",
        "color:var(--muted);font-size:13.5px;padding:10px 0;line-height:1.9",
        "لا توجد مرفقات لهذه القضية."));
    }

    ids.forEach(function (id) {
      var card = el("div",
        "border:1px solid var(--line,#eee);border-radius:11px;padding:10px;margin-bottom:9px");

      if (!Attach.isImage(id)) {
        /* PDF وغيره لا يُعرض داخل WebView، فيُوصف ويُفتح بزر */
        var h = el("div", "display:flex;gap:9px;align-items:center");
        h.appendChild(el("span", "font-size:26px",
                         Attach.isPdf(id) ? "📄" : "📎"));
        var t = el("div", "flex:1;line-height:1.9");
        t.appendChild(el("div", "font-family:var(--f-title);font-size:14.5px",
                         Attach.kindLabel(id)));
        /* اسم الملف علشان المرفقات تتفرّق عن بعض (مش كلها «مستند PDF») */
        var fnm = id.indexOf("case_" + c.id + "_") === 0 ? id.slice(("case_" + c.id + "_").length) : id;
        t.appendChild(el("div", "font-size:12.5px;direction:ltr;text-align:right;color:var(--brand-dark);word-break:break-all", fnm));
        t.appendChild(el("div", "font-size:12.5px;color:var(--muted)",
                         Attach.isPdf(id)
                           ? "اضغط عليه يفتح هنا — تكبير بالصباعين وتنقّل بين الصفحات بالتمرير."
                           : "يُفتح بالتطبيق المناسب بعد حفظه."));
        h.appendChild(t);
        card.appendChild(h);
      } else {
        var im = document.createElement("img");
        im.src = Attach.get(id);
        im.style.cssText = "max-width:100%;border-radius:8px;display:block";
        card.appendChild(im);
      }

      var row = el("div", "display:flex;gap:8px;margin-top:9px;flex-wrap:wrap");
      function mk(label, css, on) {
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        b.style.cssText = "flex:1 1 auto;min-width:96px;min-height:42px;padding:9px 12px;" +
          "border-radius:9px;font-family:inherit;font-size:13px;" + css;
        b.onclick = on;
        row.appendChild(b);
      }
      if (Attach.isImage(id)) {
        mk("🖨 طباعة",
          "border:1px solid var(--line,#ddd);background:transparent;color:var(--brand)",
          function () { Attach.printView([id], "مرفق — دعوى " + ar(c.caseNo || "")); });
      }
      /* قارئ داخل البرنامج (طلب المستخدم ٦-١٠): PDF بصفحاته بالتمرير والتكبير، والصورة بالتكبير */
      function view() {
        function go() {
          var u = Attach.get(id);
          if (!u) { alert("تعذّر قراءة المرفق."); return; }
          var ttl = (Attach.kindLabel ? Attach.kindLabel(id) : "") || id;
          if (Attach.isImage(id)) PdfView.openImage(u, ttl); else PdfView.open(u, ttl);
        }
        if (w.PdfView) { go(); return; }
        var sc = document.createElement("script");
        sc.src = "assets/pdfview.js?v=1"; sc.onload = go;
        sc.onerror = function () { alert("القارئ مش متاح — استخدم «حفظ»."); };
        document.head.appendChild(sc);
      }
      var viewable = Attach.isImage(id) || (Attach.isPdf && Attach.isPdf(id));
      if (viewable) {
        mk("👁 فتح الملف", "border:0;background:var(--brand);color:#fff;font-weight:600", view);
        card.style.cursor = "pointer";
        card.addEventListener("click", function (e) { if (e.target.tagName !== "BUTTON") view(); });
      }
      mk("💾 حفظ", "border:1px solid var(--line,#ddd);background:transparent;color:var(--brand)",
        function () {
          var url = Attach.getUrl ? Attach.getUrl(id) : Attach.get(id);
          if (!url) { alert("تعذّر قراءة المرفق."); return; }
          var b64 = url.slice(url.indexOf(",") + 1);
          if (w.AndroidSaver && AndroidSaver.save) AndroidSaver.save(id, b64);
          else {
            var a = document.createElement("a");
            a.href = url; a.download = id; a.click();
          }
        });
      mk("🗑 حذف", "border:1px solid #e3c9c6;background:transparent;color:#b3261e",
        function () {
          Ask.confirm("حذف هذا المرفق؟", { ok: "حذف المرفق" }, function () {
            Attach.remove(id);
            redraw();
          });
        });
      card.appendChild(row);
      box.appendChild(card);
    });

    /* طباعة كل المرفقات معاً */
    var printable = ids.filter(function (x) { return Attach.isImage(x); });
    if (printable.length > 1) {
      var all = el("button", "width:100%;min-height:46px;margin-bottom:10px;" +
        "border:1px solid var(--brand);border-radius:10px;background:transparent;" +
        "color:var(--brand);font-family:inherit;font-size:14px;font-weight:600",
        "🖨 طباعة كل الصور (" + ar(printable.length) + ")");
      all.type = "button";
      all.onclick = function () {
        Attach.printView(printable, "مرفقات دعوى " + ar(c.caseNo || ""));
      };
      box.insertBefore(all, box.firstChild);
    }
  }

  /* ------------------------------------------- مستندات القضية على درايف المكتب (hamlfteam) */
  function driveDocsSection(c, host, redraw) {
    if (!w.DriveDocs || !DriveDocs.available()) return;
    var wrap = el("div", "border:1px solid #cfdcf2;background:#f5f9ff;border-radius:12px;padding:11px;margin:4px 0 14px");
    wrap.appendChild(el("div", "font-family:var(--f-title);font-size:14.5px;margin-bottom:6px;color:#1a4a8a", "☁️ مستندات القضية على درايف المكتب"));
    var list = el("div"); wrap.appendChild(list);
    var msg = el("div", "font-size:12.5px;color:var(--muted);margin-top:7px;line-height:1.9",
      "الملفات تُرفع لمجلد الموكل ← القضية على درايف المكتب (خاصة). الحد الأقصى ٢٠ ميجا للملف.");
    function openUrl(u) {
      if (w.AndroidShare && AndroidShare.openUrl) AndroidShare.openUrl(u); else location.href = u;
    }
    function draw() {
      list.textContent = "";
      var docs = c.driveDocs || [];
      if (!docs.length) list.appendChild(el("div", "color:var(--muted);font-size:13px;padding:4px 0", "لا مستندات مرفوعة بعد."));
      docs.forEach(function (d, i) {
        var row = el("div", "display:flex;gap:8px;align-items:center;padding:8px 0;border-top:" + (i ? "1px solid #e1e9f5" : "0"));
        var nm = el("div", "flex:1;min-width:0;font-size:13.5px;line-height:1.7;word-break:break-word",
          "📄 " + d.name + "  ·  " + ar(Math.max(1, Math.round((d.size || 0) / 1024))) + " ك.ب" + (d.date ? "  ·  " + ar(d.date) : ""));
        row.appendChild(nm);
        function mk(label, css, on) {
          var b = el("button", "min-height:38px;padding:6px 11px;border-radius:9px;font-family:inherit;font-size:12.5px;" + css, label);
          b.type = "button"; b.onclick = on; row.appendChild(b);
        }
        mk("فتح", "border:1px solid #9fbbe6;background:#fff;color:#1a4a8a", function () { openUrl(d.url); });
        mk("🗑", "border:1px solid #e3c9c6;background:#fff;color:#b3261e", function () {
          Ask.confirm("حذف «" + d.name + "» من الدرايف؟ (يذهب لسلة الدرايف ٣٠ يوماً)", { ok: "حذف" }, function () {
            DriveDocs.trash(d.id).then(function () {
              patchCase(c.id, function (cc) { cc.driveDocs = (cc.driveDocs || []).filter(function (x) { return x.id !== d.id; }); });
              c.driveDocs = (c.driveDocs || []).filter(function (x) { return x.id !== d.id; });
              draw();
            }).catch(function (e) { alert(e.message); });
          });
        });
        list.appendChild(row);
      });
    }
    draw();
    var inp = document.createElement("input");
    inp.type = "file"; inp.multiple = true; inp.style.display = "none";
    var up = el("button", "width:100%;min-height:46px;margin-top:8px;border:1px solid #1a4a8a;border-radius:10px;background:#1a4a8a;color:#fff;font-family:inherit;font-size:14px;font-weight:600", "⬆ رفع مستند إلى الدرايف");
    up.type = "button"; up.onclick = function () { inp.click(); };
    inp.onchange = function () {
      var files = Array.prototype.slice.call(inp.files || []); inp.value = "";
      if (!files.length) return;
      up.disabled = true;
      var i = 0, failed = 0;
      (function next() {
        if (i >= files.length) {
          up.disabled = false; up.textContent = "⬆ رفع مستند إلى الدرايف";
          msg.textContent = failed ? ("تمّ الرفع مع فشل " + ar(failed) + " ملف.") : "✅ تمّ رفع كل الملفات.";
          draw(); return;
        }
        var f = files[i++];
        up.textContent = "جارٍ رفع " + ar(i) + " من " + ar(files.length) + " — " + f.name;
        DriveDocs.upload(f, c).then(function (r) {
          c.driveDocs = (c.driveDocs || []).concat([r.doc]);
          patchCase(c.id, function (cc) { cc.driveDocs = c.driveDocs; cc.driveFolderId = r.folder.id; });
          c.driveFolderId = r.folder.id;
          next();
        }).catch(function (e) { failed++; msg.textContent = "تعذّر رفع «" + f.name + "»: " + e.message; next(); });
      })();
    };
    wrap.appendChild(up); wrap.appendChild(inp); wrap.appendChild(msg);
    host.appendChild(wrap);
  }

  /* قسمٌ قابل للطيّ («إضافات») — يخفي الحقول قليلة الاستخدام حتى يطلبها المستخدم،
     كما في نسخة الويندوز. يعود جسمه الداخلي لتُضاف إليه الأقسام. */
  function collapsible(parent, title, openByDefault) {
    var wrap = el("div", "margin:18px 0 4px");
    var hd = el("div",
      "display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;" +
      "padding:13px 15px;border-radius:12px;background:var(--brand);color:#fff;" +
      "font-family:var(--f-title);font-size:15.5px;-webkit-user-select:none;user-select:none");
    hd.appendChild(el("span", "", "➕ " + title));
    var chev = el("span", "font-size:13px;opacity:.9",
                  openByDefault ? "▴ اضغط للإغلاق" : "▾ اضغط للفتح");
    hd.appendChild(chev);
    var body = el("div", "padding:6px 2px 0;display:" + (openByDefault ? "block" : "none"));
    hd.onclick = function () {
      var open = body.style.display !== "none";
      body.style.display = open ? "none" : "block";
      chev.textContent = open ? "▾ اضغط للفتح" : "▴ اضغط للإغلاق";
    };
    wrap.appendChild(hd); wrap.appendChild(body);
    parent.appendChild(wrap);
    return body;
  }

  /* ------------------------------------------------------------ ملف القضية */

  function openCase(caseId, onChange) {
    var c = read().filter(function (x) { return x.id === caseId; })[0];
    if (!c) { alert("لم تعد هذه القضية موجودة."); return; }
    if (c.fileType === "عمل") { openLegalWork(caseId, onChange); return; }

    var s = sheet(10010);
    var box = s.box;

    function refresh() {
      s.back.remove();
      openCase(caseId, onChange);
      if (onChange) onChange();
    }

    /* ---- الترويسة: المفتاحان اللذان يعرف بهما المكتب قضاياه ---- */
    head(box, caseNoLabel(c.courtLevel) + " " + (c.caseNo ? ar(c.caseNo) : "—") +
              (c.caseYear ? " لسنة " + ar(c.caseYear) : ""));
    /* شارة اللون بقواعد تقويم الجلسات — بتقول القضية واقفة فين بنظرة */
    (function () {
      var cc = caseColor(c);
      var pill = el("span", "display:inline-flex;align-items:center;gap:6px;padding:3px 11px;border-radius:20px;" +
        "font-size:12.5px;margin:0 0 10px;margin-inline-end:6px;background:" + cc.bg + ";color:" + cc.fg +
        ";border:1px solid " + cc.hex);
      pill.appendChild(el("span", "width:9px;height:9px;border-radius:50%;background:" + cc.hex));
      pill.appendChild(document.createTextNode(cc.text));
      box.appendChild(pill);
    })();
    if (appealHigher(c)) {
      box.appendChild(el("span",
        "display:inline-block;padding:2px 10px;border-radius:20px;font-size:12px;" +
        "background:#8a1c1c;color:#fff;margin-bottom:10px", "🔺 طعن أعلى"));
      if (partyDirection(c)) {
        box.appendChild(el("span",
          "display:inline-block;padding:2px 10px;border-radius:20px;font-size:12px;" +
          "background:var(--bg,#f4ece0);color:var(--brand-dark);border:1px solid var(--line,#ddd);" +
          "margin-bottom:10px;margin-inline-start:6px",
          "الطعن مرفوع " + partyDirection(c)));
      }
    }
    if (appealHigher(c) && c.firstNo) {
      box.appendChild(el("div", "font-size:13px;color:var(--muted);margin-bottom:6px",
        "رقم الدعوى الابتدائية: " + ar(c.firstNo) + (c.firstYear ? " لسنة " + ar(c.firstYear) : "")));
    }

    var keys = el("div",
      "display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px");
    function chip(label, value, strong) {
      var d = el("div",
        "flex:1 1 auto;background:" + (strong ? "var(--brand)" : "var(--bg,#f4ece0)") +
        ";color:" + (strong ? "#fff" : "var(--text)") +
        ";border-radius:10px;padding:9px 12px;font-size:13px;line-height:1.7");
      d.appendChild(el("div", "opacity:.8;font-size:11.5px", label));
      d.appendChild(el("div", "font-family:var(--f-title);font-size:15px", value));
      keys.appendChild(d);
    }
    chip("رقم الملف بالمكتب", c.fileNo ? ar(c.fileNo) : "— غير مسجَّل —", true);
    chip("الحالة", c.status || "—");
    if (c.kind) chip("نوعها", c.kind);
    box.appendChild(keys);

    /* المحامون المتعاونون — ظاهرين على صفحة القضية عشان يبان مين مربوط بيها،
       وهل إيميله اتسجّل على البوابة (اللي منها بيشوف القضية للقراءة). */
    var collabList = collabEmailsOf(c);
    if (collabList.length) {
      var marked = {}; try { marked = JSON.parse(localStorage.getItem(COLLAB_MARKED)) || {}; } catch (e) { }
      var cbx = el("div", "background:var(--bg,#f4ece0);border-radius:11px;padding:9px 13px;margin-bottom:10px;font-size:13px;line-height:1.8");
      cbx.appendChild(el("div", "font-family:var(--f-title);color:var(--brand-dark)", "🤝 محامون متعاونون على القضية"));
      collabList.forEach(function (em) {
        cbx.appendChild(el("div", "direction:ltr;text-align:right;font-size:13.5px;font-weight:600", em));
        cbx.appendChild(el("div", "color:var(--muted);font-size:12px", marked[em]
          ? "✓ متسجّل على بوابة hamlf.com — بيدخل بإيميله ويشوف القضية دي للقراءة بس"
          : "⏳ لسه ما اتسجّلش على البوابة — بيتسجّل أول ما القضية تترفع للسحابة"));
      });
      box.appendChild(cbx);
    }

    /* §1و شارتان سريعتان: عدد الملاحظات وعدد الأعمال الإدارية المفتوحة */
    var qb = el("div", "display:flex;gap:7px;flex-wrap:wrap;margin:2px 0 10px");
    function qbadge(txt, bg) {
      return el("span", "display:inline-flex;align-items:center;gap:4px;background:" + bg +
        ";color:#fff;border-radius:20px;padding:4px 12px;font-size:12.5px;font-family:var(--f-title)", txt);
    }
    var nNotes = (c.noteLog || []).length;
    var nTasks = (c.adminTasks || []).filter(function (t) {
      return t.state !== "تم" && t.state !== "ملغي"; }).length;
    var nDocs = (c.docs || []).length;
    qb.appendChild(qbadge("📝 " + ar(nNotes) + " ملاحظة", "#7a5a3a"));
    qb.appendChild(qbadge("🗂 " + ar(nTasks) + " عمل مفتوح", "#5b3a21"));
    if (nDocs) qb.appendChild(qbadge("📜 " + ar(nDocs) + " مستند", "#17506b"));
    box.appendChild(qb);

    /* الارتباط: فرعية/منضمة إلى أصلها، أو أصل له مرتبطات */
    if (c.linkedTo) {
      var root = rootOf(c);
      var lb = el("div",
        "background:var(--bg,#f4ece0);border-radius:11px;padding:11px 13px;" +
        "margin-bottom:12px;font-size:13.5px;line-height:1.9;cursor:pointer");
      lb.appendChild(el("div", "font-family:var(--f-title);color:var(--brand-dark)",
        (c.kind === "فرعية" ? "دعوى فرعية في " : "دعوى منضمة إلى ") +
        "دعوى " + ar(root.caseNo || "—") +
        (root.caseYear ? " لسنة " + ar(root.caseYear) : "")));
      lb.appendChild(el("div", "color:var(--muted);font-size:12.5px",
        "جلساتها هي جلسات الدعوى الأصلية — اضغط لفتحها."));
      lb.onclick = function () {
        s.back.remove();
        openCase(root.id, onChange);
      };
      box.appendChild(lb);
      addMoreLinked(root);                    /* دعوى فرعية/منضمة أخرى لنفس الأصل */
    } else {
      var kids = linkedTo(c);
      var kindCount = { "فرعية": 0, "منضمة": 0 };
      kids.forEach(function (k) {
        kindCount[k.kind] = (kindCount[k.kind] || 0) + 1;
        var kb = el("div",
          "background:var(--bg,#f4ece0);border-radius:11px;padding:11px 13px;" +
          "margin-bottom:8px;font-size:13.5px;line-height:1.9;cursor:pointer");
        kb.appendChild(el("div", "font-family:var(--f-title);color:var(--brand-dark)",
          "دعوى " + k.kind + (kindCount[k.kind] > 1 || kids.filter(function (z) { return z.kind === k.kind; }).length > 1 ? " (" + ar(kindCount[k.kind]) + ")" : "") + (k.caseNo ? " — " + ar(k.caseNo) +
          (k.caseYear ? " لسنة " + ar(k.caseYear) : "") : " (بلا رقم بعد)")));
        kb.appendChild(el("div", "color:var(--muted);font-size:12.5px",
          k.subject || "الموضوع لم يُدرَج بعد — اضغط لفتحها"));
        kb.onclick = function () { s.back.remove(); openCase(k.id, onChange); };
        box.appendChild(kb);
      });
      addMoreLinked(c);                       /* أكثر من فرعية/منضمة (لكل خصم دعواه) */
    }

    /* أزرار ظاهرة (لا مطوية في «إضافات»): كل خصم قد يرفع دعوى فرعية أو منضمة مستقلة */
    function addMoreLinked(rootCase) {
      var has = linkedTo(rootCase).length > 0;
      function onCreated(n) { s.back.remove(); openCase(n.id, onChange); }
      var bSub = btn("＋ دعوى فرعية" + (has ? " أخرى" : ""),
        "border:1px dashed var(--brand);background:transparent;color:var(--brand)");
      bSub.onclick = function () { linkedCapacityPicker(box, rootCase, "فرعية", onCreated); };
      var bJoin = btn("＋ دعوى منضمة" + (has ? " أخرى" : ""),
        "border:1px dashed var(--brand);background:transparent;color:var(--brand)");
      bJoin.onclick = function () { linkedCapacityPicker(box, rootCase, "منضمة", onCreated); };
      row(box, [bSub, bJoin], "margin-bottom:10px");
    }

    function pair(k, v) {
      if (!v) return;
      var r = el("div", "display:flex;gap:9px;padding:9px 0;" +
                        "border-bottom:1px solid var(--line,#eee)");
      var kb = el("b", "flex:0 0 104px;color:var(--brand-dark);" +
                       "font-family:var(--f-title);font-weight:400", k);
      kb.className = "fkey";
      r.appendChild(kb);
      var vs = el("span", "flex:1", v);
      vs.className = "fval";
      r.appendChild(vs);
      box.appendChild(r);
    }

    pair("المحكمة", [c.courtName, c.circuit].filter(Boolean).join(" — "));
    /* مقر المحكمة على خرائط جوجل بالبحث باسمها — كما في تقويم الجلسات */
    if (c.courtName) {
      var mapRow = el("div", "padding:8px 0;border-bottom:1px solid var(--line,#eee)");
      var mapA = document.createElement("a");
      mapA.href = "https://www.google.com/maps/search/?api=1&query=" +
                  encodeURIComponent((c.loc && c.loc.trim()) ? c.loc : c.courtName);
      mapA.target = "_blank"; mapA.rel = "noopener";
      mapA.textContent = "📍 مقر المحكمة على خرائط جوجل";
      mapA.style.cssText = "color:var(--brand);text-decoration:none;font-size:13.5px;" +
                           "display:inline-flex;align-items:center;min-height:40px";
      mapRow.appendChild(mapA);
      box.appendChild(mapRow);
    }
    pair("درجة التقاضي", c.courtLevel);
    pair("نوع الدعوى", c.caseType);
    pair("الموضوع", c.subject);
    /* الدعاوى الفرعية/المنضمة لهذه القضية — موضوعها وطبيعتها، أسفل الموضوع
       الأصلي مباشرة كما طُلب، دون الحاجة لفتح كل واحدة على حدة. */
    (function () {
      var kids = (typeof linkedTo === "function" ? linkedTo(c) : []).filter(function (k) {
        return k.kind === "فرعية" || k.kind === "منضمة";
      });
      kids.forEach(function (k) {
        var label = (k.kind === "فرعية" ? "دعوى فرعية" : "دعوى منضمة") +
          (k.direction ? " — " + k.direction : "");
        pair(label, k.subject || "(بلا موضوع مدوَّن بعد)");
      });
    })();
    pair("القاعة", [c.hall && "قاعة " + ar(c.hall),
                    c.floor && "دور " + ar(c.floor), c.time].filter(Boolean).join(" · "));
    pair("سنة التعامل", c.dealYear ? ar(c.dealYear) : "");
    if (isCriminalType(c.caseType)) {
      pair("الجناية / الجنحة", c.crimeNo
        ? ar(c.crimeNo) + (c.crimeYear ? " لسنة " + ar(c.crimeYear) : "") : "");
      pair("كلي رقم", c.totalNo
        ? ar(c.totalNo) + (c.totalYear ? " لسنة " + ar(c.totalYear) : "") : "");
      pair(c.appealKind || "الاستئناف", c.appealNo
        ? ar(c.appealNo) + (c.appealYear ? " لسنة " + ar(c.appealYear) : "") : "");
    }
    pair("المحامي", c.lawyer);

    /* ---- الموكلون: أرقام التوكيلات على سطر العنوان نفسه (مربّعات ملوّنة بلا
       كلمة «ر ت م» — المساحة مفهومة)، ثم كل موكل على سطر باسمه وصفته، والاسم
       يكبر تلقائياً لاتّساع مساحته بعد نقل الرقم للعنوان — قبل الخصوم ---- */
    var cw = clientsWithOffice(c);
    var clientCaps = parseParties(c.clients);
    var mHead = el("div",
      "display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:16px 0 8px");
    mHead.appendChild(el("span",
      "font-family:var(--f-title);font-size:15px;color:var(--brand-dark)", "الموكلون"));
    cw.forEach(function (x) {
      if (!x.officeNo) return;
      var chip = el("span",
        "background:var(--brand);color:#fff;border-radius:7px;padding:3px 10px;" +
        "font-size:12.5px;font-family:var(--f-title)", ar(x.officeNo));
      chip.title = "رقم التوكيل بالمكتب (" + x.name + ")";
      mHead.appendChild(chip);
    });
    box.appendChild(mHead);
    if (!cw.length) {
      box.appendChild(el("div", "color:var(--muted);font-size:13.5px;padding:8px 0",
                         "لا موكلين مسجَّلين."));
    }
    cw.forEach(function (x, i) {
      var cap = (clientCaps[i] && clientCaps[i].cap) ? ar(clientCaps[i].cap) : "";
      box.appendChild(partyRow(x.name, cap, null, x.hasEmail, x.hasPhone));
    });

    /* ---- الخصوم: كلٌّ في سطر، وبجانب اسمه صفتُه في الدعوى ---- */
    head(box, "الخصوم",
         "font-family:var(--f-title);font-size:15px;margin:16px 0 8px");
    var ops = parseParties(c.opponents);
    if (!ops.length) {
      box.appendChild(el("div", "color:var(--muted);font-size:13.5px;padding:8px 0",
                         "لا خصوم مسجَّلين."));
    }
    ops.forEach(function (o) {
      box.appendChild(partyRow(o.name, o.cap ? ar(o.cap) : "", null));
    });

    pair("ملاحظات", c.notes);

    /* §11 الحكم ومواعيد الطعن — عرضٌ فقط، بلا ترحيل تلقائي للدرجة الأعلى.
       المستخدم يكتب ميعاد الطعن بنفسه، فيُحسب آخر يوم ويُعرض عدّاد تنازلي. */
    if (c.judgeDate || c.judgeType || c.appealPeriod) {
      head(box, "الحكم ومواعيد الطعن",
           "font-family:var(--f-title);font-size:15px;margin:16px 0 8px");
      function fmtISO(iso) {
        if (!iso) return "";
        var p = String(iso).split("-");
        return p.length >= 3 ? ar(p[0] + "/" + p[1] + "/" + p[2]) : ar(iso);
      }
      if (c.judgeDate) pair("تاريخ الحكم", fmtISO(c.judgeDate));
      pair("نوع الحكم", c.judgeType);
      var A = appealCalc(c);
      if (A) {
        pair("ميعاد الطعن" + (A.explicit ? "" : " القانوني"), appealPeriodText(A) + (A.capped ? " (المكتوب أكتر من ٦٠ — اتحسب على الحد الأقصى)" : ""));
        pair("آخر ميعاد للطعن", appealDmy(A.end) + (A.shifted
          ? " (امتد من " + appealDmy(A.raw) + " لأنه " + A.reasons.join(" ثم ") + ")" : ""));
        if (A.warn) box.appendChild(el("div",
          "margin:4px 0;padding:8px 12px;border-radius:9px;background:#fff4e0;color:#8a5a12;font-size:12.5px",
          "⚠ " + A.warn.replace(/^(\d{4})-(\d{2})-(\d{2})/, function (m0, y, mo, d) { return appealDmy(y + "-" + mo + "-" + d); })));
        var cd = el("div", "margin:8px 0 2px;padding:12px 14px;border-radius:11px;" +
          "font-family:var(--f-title);font-size:15px;text-align:center;line-height:1.8");
        cd.style.background = A.left < 0 ? "#efe7dd" : A.left <= 7 ? "#ffe0d8" : "#fff4e0";
        cd.style.color = A.left < 0 ? "#7a5a3a" : A.left <= 7 ? "#b3261e" : "#8a5a12";
        cd.textContent = appealCalcText(A);
        box.appendChild(cd);
        var ph = appealShiftPhrase(A);
        if (ph) box.appendChild(el("div",
          "margin:6px 0 2px;padding:9px 12px;border-radius:9px;border:1px dashed var(--line,#ddd);font-size:13px;line-height:1.9",
          "صيغة إثبات الامتداد في مذكرة الطعن: " + ph));
      } else if (c.appealPeriod) pair("ميعاد الطعن", ar(c.appealPeriod));
    }

    /* §1أ عدّاد الشطب/الوقف — يظهر عند الحالة المناسبة مع تاريخ ومدة */
    (function () {
      var st = norm(c.status);
      var isShatb = st === norm("شطب"), isWaqf = st === norm("وقف");
      if (!(isShatb || isWaqf) || !c.holdDate) return;
      var days = parseInt(la(c.holdDays || "").replace(/[^0-9]/g, ""), 10);
      if (!(days > 0)) days = legalHoldDays(isShatb);
      var iso = (w.lawyerToISO ? w.lawyerToISO(c.holdDate) : "") || c.holdDate || "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !(days > 0)) return;
      var dl = new Date(iso + "T00:00:00"); dl.setDate(dl.getDate() + days);
      var todayD = new Date(); todayD.setHours(0, 0, 0, 0);
      var left = Math.round((dl - todayD) / 86400000);
      var word = isShatb ? "للتجديد (القانوني ٦٠ يوماً)" : "للتعجيل";
      var cd = el("div", "margin:8px 0 2px;padding:12px 14px;border-radius:11px;" +
        "font-family:var(--f-title);font-size:16px;text-align:center");
      if (left > 0) { cd.style.background = "#fff0df"; cd.style.color = "#a15a12";
        cd.textContent = "باقٍ " + ar(left) + " يوم " + word; }
      else if (left === 0) { cd.style.background = "#ffe0d8"; cd.style.color = "#b3261e";
        cd.textContent = "اليوم آخر ميعاد " + word; }
      else { cd.style.background = "#efe7dd"; cd.style.color = "#7a5a3a";
        cd.textContent = "انتهى الميعاد منذ " + ar(-left) + " يوم"; }
      box.appendChild(cd);
    })();

    /* ---- الجلسات ---- */
    head(box, "الجلسات", "font-family:var(--f-title);font-size:15px;margin:18px 0 8px");
    sessionsTableView(box, c, refresh);

    if (c.linkedTo) {
      box.appendChild(el("div",
        "font-size:12.5px;color:var(--muted);line-height:1.9;padding:4px 2px",
        "الجلسات تُدوَّن في الدعوى الأصلية وتظهر هنا — منعاً لتكرار الإدخال."));
    } else {
      var addS = btn("＋ إضافة جلسة",
        "border:1px solid var(--line,#ddd);background:transparent;color:var(--brand)");
      addS.onclick = function () { editSession(c.id, -1, refresh); };
      row(box, [addS], "margin-top:6px");
    }

    /* كل ما يلي (مرفقات · دعاوى مرتبطة · ملاحظات · عرائض · أعمال · أتعاب · تنفيذ)
       يُطوى داخل «إضافات» — قليلة الاستخدام، تُفتح عند الطلب. */
    var mainBox = box;
    box = collapsible(mainBox, "إضافات");

    /* «إضافات» تفتح قائمة اختيارات: اضغط القسم الذي تريده فيُفتح وحده،
       وضغطةٌ ثانية على البند تُغلقه. */
    var extMenu = el("div", "display:flex;flex-wrap:wrap;gap:8px;margin:2px 0 6px");
    box.appendChild(extMenu);
    var extStage = el("div", "margin-top:4px");
    box.appendChild(extStage);

    /* المرفقات كدالّة تُرسم عند الطلب داخل حاوية القسم */
    function renderAtt(host) {
      head(host, "المرفقات والمستندات",
           "font-family:var(--f-title);font-size:15px;margin:6px 0 8px");
      driveDocsSection(c, host, refresh);
      var attBox = el("div"); host.appendChild(attBox);
      function drawAtt() { attachments(c, attBox, refresh); }
      drawAtt();
      var drop = el("div"); host.appendChild(drop);
      var note = el("div",
        "font-size:12.5px;color:var(--muted);margin-top:7px;line-height:1.9",
        "صور المستند الواحد تُدمج في ملف PDF واحد بترتيب اختيارها.");
      host.appendChild(note);
      Attach.dropZone(drop, function (files) {
        note.textContent = "جارٍ الضغط…"; note.style.color = "var(--brand-dark)";
        Attach.putBatch("case_" + c.id + "_", files, function (i, n, name) {
          note.textContent = "جارٍ ضغط الصورة " + ar(i) + " من " + ar(n) +
                             (name ? " — " + name : "");
        }).then(function (r) {
          note.style.color = "var(--muted)";
          var parts = [];
          if (r.merged) parts.push("دُمجت " + ar(r.merged) +
                     (r.merged === 1 ? " صورة" : " صور") + " في مستند واحد");
          if (r.kept) parts.push("وحُفظ " + ar(r.kept) +
                     (r.kept === 1 ? " ملف كما هو" : " ملفات كما هي"));
          note.textContent = parts.join("، ") + ".";
          drawAtt();
        }).catch(function (e) {
          note.style.color = "#b3261e";
          note.textContent = e && e.message ? e.message : "تعذّر الحفظ.";
        });
      });
    }

    function renderLinked(host) {
      head(host, "دعاوى مرتبطة",
           "font-family:var(--f-title);font-size:15px;margin:6px 0 8px");
      function onLinkedCreated(n) { s.back.remove(); openCase(n.id, onChange); }
      var mkSub = btn("＋ دعوى فرعية",
        "border:1px solid var(--line,#ddd);background:transparent;color:var(--brand)");
      mkSub.onclick = function () { linkedCapacityPicker(host, c, "فرعية", onLinkedCreated); };
      var mkJoin = btn("＋ دعوى منضمة",
        "border:1px solid var(--line,#ddd);background:transparent;color:var(--brand)");
      mkJoin.onclick = function () { linkedCapacityPicker(host, c, "منضمة", onLinkedCreated); };
      row(host, [mkSub, mkJoin], "margin-top:4px");
      if (norm(c.status) === norm("منتهية") && nextLevel(c.courtLevel)) {
        var up = btn("⤴ ترحيل لدرجة أعلى (" + resolveLevel(nextLevel(c.courtLevel)) + ")",
          "border:1px solid var(--brand);background:transparent;color:var(--brand);font-weight:600");
        up.onclick = function () {
          Ask.confirm("ترحيل القضية لدرجة أعلى؟", {
            ok: "ترحيل",
            detail: "يُنشأ ملفٌ جديد بنفس رقم الملف والموضوع وأسماء الأطراف، بدرجة «" +
              resolveLevel(nextLevel(c.courtLevel)) + "» وحالة «متداولة»." +
              String.fromCharCode(10) + "الملف الحالي يبقى كما هو للرجوع إليه."
          }, function () {
            promote(c.id, function (n) { s.back.remove(); openCase(n.id, onChange); });
          });
        };
        row(host, [up], "margin-top:8px");
      }
    }

    var EXTRAS = [
      { label: "📎 المرفقات والمستندات", fn: renderAtt },
      { label: "📝 ملاحظات القضية",      fn: function (h) { noteLogSection(c, h, refresh); } },
      { label: "📜 العرائض والمذكرات",   fn: function (h) { docsSection(c, h, refresh); } },
      { label: "📋 الأعمال والتكليفات",  fn: function (h) { adminTasksSection(c, h, refresh); } },
      { label: "💰 أتعاب ومصروفات الدعوى", fn: function (h) { feesSection(c, h, refresh); } },
      { label: "📅 مواعيد استحقاق الأتعاب", fn: function (h) { feeScheduleSection(c, h, refresh); } },
      { label: "⚖ تنفيذ الأحكام",        fn: function (h) { executionSection(c, h, refresh); } }
    ];
    if (!c.linkedTo) EXTRAS.splice(1, 0, { label: "🔗 دعاوى مرتبطة", fn: renderLinked });

    var extActive = null;
    EXTRAS.forEach(function (sec) {
      var chip = el("div",
        "cursor:pointer;border:1px solid var(--line,#ddd);background:var(--card,#fff);" +
        "color:var(--brand-dark);border-radius:10px;padding:10px 14px;font-size:14px;" +
        "font-family:var(--f-title)", sec.label);
      chip.onclick = function () {
        extStage.innerHTML = "";
        if (extActive) {
          extActive.style.background = "var(--card,#fff)";
          extActive.style.color = "var(--brand-dark)";
        }
        if (extActive === chip) { extActive = null; return; }  /* ضغطة ثانية تُغلق */
        chip.style.background = "var(--brand)"; chip.style.color = "#fff";
        extActive = chip;
        sec.fn(extStage);
      };
      extMenu.appendChild(chip);
    });

    box = mainBox;   /* الأزرار الأساسية تبقى ظاهرة خارج «إضافات» */

    var edit = btn("✎ تعديل البيانات",
      "border:0;background:var(--brand);color:#fff;font-weight:600");
    edit.onclick = function () { editCase(c, refresh, { source: "registry" }); };

    var print = btn("🖨 طباعة",
      "border:1px solid var(--line,#ddd);background:transparent;color:var(--brand)");
    print.onclick = function () { printCase(c); };
    row(box, [edit, print], "margin-top:20px");

    var smart = btn("🔍 الفحص الذكي — على نسخة الويندوز فقط",
      "border:1px dashed var(--line,#ddd);background:transparent;color:var(--muted)");
    smart.onclick = function () {
      alert("الفحص الذكي (تجهيز ملف القضية كاملاً للذكاء الاصطناعي) متاح على نسخة الويندوز فقط — وغير متاح على نسخة الموبايل.");
    };
    row(box, [smart], "margin-top:9px");

    var del = btn("🗑 حذف القضية",
      "border:1px solid #e3c9c6;background:transparent;color:#b3261e");
    del.onclick = function () {
      Ask.confirm("حذف هذه القضية نهائياً؟", {
        detail: "دعوى " + ar(c.caseNo || "—") + " — " + (c.courtName || "") +
                String.fromCharCode(10) + "سيُحذف معها " + ar((c.sessions || []).length) + " جلسة و" +
                ar(attIds(c).length) + " مرفقاً.",
        ok: "حذف القضية"
      }, function () {
        attIds(c).forEach(function (id) { Attach.remove(id); });
        if (!write(read().filter(function (x) { return x.id !== c.id; }))) return;
        s.back.remove();
        if (onChange) onChange();
      });
    };
    var close = btn("إغلاق",
      "border:1px solid var(--line,#ddd);background:transparent;color:var(--muted)");
    close.onclick = function () { s.back.remove(); };
    row(box, [close, del], "margin-top:10px");
  }


  /* ------------------------------------------- الأعمال الإدارية والتكليفات

     عملٌ إداري = مهمةٌ مرتبطة بمُكلَّفٍ أو أكثر، لها تاريخُ عملٍ وموعدُ تسليم.
     محفوظةٌ على القضية في c.adminTasks. */

  function teamMembers() {
    if (!w.Team || !Team.data || !Team.data.users) return [];
    return Team.data.users.filter(function (u) { return u.active !== false; });
  }
  function isAdmin() {
    if (!w.Team) return true;
    var u = Team.current && Team.current();
    if (u && u.role === "owner") return true;
    return !!(Team.can && (Team.can("finance") || Team.can("team")));
  }

  /** بنود جاهزة للإدراج في نص التكليف: آخر ميعاد للطعن (من بيانات القضية
      نفسها)، محاضر مرتبطة بها (Minutes.caseId)، وأوراق محضرين مرتبطة
      (مطابقة باسم الموكل — سجلات data.js بلا caseId، راجع
      [[feedback_daily_deadline_reminders]] لملاحظة الصيغة الموضعية). */
  function adminTaskInsertSources(c) {
    var out = [];

    var A = appealCalc(c);
    if (A) {
      out.push({ label: "⚖ ميعاد الطعن", text:
        "آخر ميعاد للطعن: " + appealDmy(A.end) + " (خلال " + appealPeriodText(A) + " من تاريخ الحكم " +
        appealDmy(A.judge) + ")" + (A.shifted ? " — " + appealShiftPhrase(A) : "") });
    }

    if (w.Minutes && w.Minutes.all) {
      var mine = w.Minutes.all().filter(function (m) { return m.caseId === c.id; });
      if (mine.length) {
        out.push({ label: "📄 محاضر مرتبطة (" + ar(mine.length) + ")", text:
          mine.map(function (m) {
            return "• " + w.Minutes.title(m) + (m.action ? " — " + m.action : " — قيد النظر");
          }).join("\n") });
      }
    }

    try {
      var screens = JSON.parse(localStorage.getItem("proflawyer.screens.v1")) || {};
      var names = clientNames(c).map(function (n) { return norm(n); });
      var papers = (screens["04-bailiff-papers"] || []).filter(function (rec) {
        var v = (rec && rec.v) || [];
        var client = norm((v[6] && v[6].x) || "");
        return client && names.indexOf(client) >= 0;
      });
      if (papers.length) {
        out.push({ label: "🧾 أوراق محضرين (" + ar(papers.length) + ")", text:
          papers.map(function (rec) {
            var v = rec.v || [];
            var kind = (v[4] && v[4].x) || "", subj = (v[5] && v[5].x) || "";
            var dt = (v[8] && v[8].x) || "";
            var received = v[10] && v[10].c;
            return "• " + (kind || subj || "ورقة") + (dt ? " — جلسة " + dt : "") +
              (received ? " (تم الاستلام)" : " (لم يتم الاستلام)");
          }).join("\n") });
      }
    } catch (e) { /* لا شيء أكثر يمكن عمله لو تلِفت بيانات أوراق المحضرين */ }

    return out;
  }

  /* ---- تكليفات إدارية عامة (بلا قضية) — مهمة 39 ---- */
  var GENERAL_ID = "__general__", GENERAL_KEY = "proflawyer.agenda.generaltasks.v1";
  function generalBox() {
    var b = null;
    try { b = JSON.parse(localStorage.getItem(GENERAL_KEY)); } catch (e) { }
    if (!b || typeof b !== "object") b = {};
    b.id = GENERAL_ID; b.general = true; b.adminTasks = b.adminTasks || [];
    return b;
  }
  function saveGeneral(box) {
    try { localStorage.setItem(GENERAL_KEY, JSON.stringify({ adminTasks: box.adminTasks })); }
    catch (e) { alert("تعذّر الحفظ — المساحة ممتلئة."); return false; }
    try {
      if (w.CloudStore && CloudStore.collection) CloudStore.collection.save("general-tasks", "all", { adminTasks: box.adminTasks });
    } catch (e) { }
    return true;
  }

  /* ---- قيد من السجلات (ورقة محضرين) ينزل تلقائياً في «الأعمال الإدارية» ----
     طلب المستخدم: ورقة المحضرين تنزل لوحدها في الأعمال الإدارية. بتروح لقضيتها
     برقم الملف (والقضية الشغالة لو الرقم في أكتر من درجة)، ولو مالهاش رقم ملف أو
     القضية مش موجودة تروح التكليفات العامة. القيد الواحد = مهمة واحدة (fromReg)
     بتتحدّث مع تعديل القيد، والمكلَّفين والمحادثة اللي اتضافوا عليها ما يتلمسوش. */
  function upsertRegTask(regId, fileNo, spec) {
    if (!regId || !spec) return null;
    var list = read(), fn = dupNum(fileNo), c = null;
    if (fn) {
      var hits = list.filter(function (x) { return x.fileNo && dupNum(x.fileNo) === fn; });
      c = hits.filter(function (x) { return !/منته/.test(x.status || ""); })[0] || hits[0] || null;
    }
    var gen = generalBox(), box = c || gen;
    /* رقم الملف اتغيّر؟ المهمة القديمة تتشال من مكانها القديم */
    var movedFrom = null;
    [gen].concat(list).forEach(function (x) {
      if (x === box) return;
      var n0 = (x.adminTasks || []).length;
      x.adminTasks = (x.adminTasks || []).filter(function (t) { return t.fromReg !== regId; });
      if (x.adminTasks.length !== n0) movedFrom = x;
    });
    box.adminTasks = box.adminTasks || [];
    var t = box.adminTasks.filter(function (x) { return x.fromReg === regId; })[0];
    if (!t) {
      t = { id: "at" + Date.now().toString(36) + Math.floor(Math.random() * 99), assignees: [], prio: "",
            subs: [], auto: true, fromReg: regId };
      box.adminTasks.push(t);
    }
    t.text = spec.text; t.taskDate = spec.taskDate || ""; t.dueDate = spec.dueDate || "";
    t.state = spec.state || "لم يتم"; t.notes = spec.notes || "";
    if (spec.org) t.org = spec.org;
    if (box === gen || movedFrom === gen) saveGeneral(gen);
    if (c) write(list, c.id);
    if (movedFrom && movedFrom !== gen && movedFrom !== c) write(list, movedFrom.id);
    return { caseId: c ? c.id : GENERAL_ID, fileNo: c ? c.fileNo : "" };
  }
  function removeRegTask(regId) {
    if (!regId) return;
    var list = read(), gen = generalBox();
    [gen].concat(list).forEach(function (x) {
      var n0 = (x.adminTasks || []).length;
      if (!n0) return;
      x.adminTasks = x.adminTasks.filter(function (t) { return t.fromReg !== regId; });
      if (x.adminTasks.length === n0) return;
      if (x === gen) saveGeneral(gen); else write(list, x.id);
    });
  }

  function editAdminTask(caseId, index, done) {
    /* مهمة 39: تكليف إداري عام لا يتعلق بقضية — يُحفظ في حاوية مستقلة خارج سجل القضايا */
    var GEN = caseId === GENERAL_ID;
    var list = GEN ? [generalBox()] : read();
    var c = list.filter(function (x) { return x.id === caseId; })[0];
    if (!c) return;
    c.adminTasks = c.adminTasks || [];
    var persist = function () { return GEN ? saveGeneral(c) : write(list, c.id); };
    var isNew = index < 0;
    var t = isNew ? { id: "at" + Date.now().toString(36), assignees: [] }
                  : c.adminTasks[index];

    var sh = sheet(10016);
    head(sh.box, isNew ? "عمل إداري / تكليف" : "تعديل العمل الإداري");

    /* بيانات الملف الأساسية — تُدرج تلقائياً من القضية، بلا إدخال يدوي */
    (function () {
      var bits = [];
      if (c.fileNo) bits.push("ملف " + ar(c.fileNo));
      var cl = clientNames(c);
      if (cl.length) bits.push(cl.join("، "));
      if (c.caseNo) bits.push("دعوى " + ar(c.caseNo) + (c.caseYear ? " لسنة " + ar(c.caseYear) : ""));
      if (c.subject) bits.push(String(c.subject).slice(0, 40));
      if (!bits.length) return;
      sh.box.appendChild(el("div",
        "background:var(--bg,#f4ece0);border-radius:9px;padding:9px 12px;margin-bottom:12px;" +
        "font-size:13px;color:var(--brand-dark);line-height:1.9",
        bits.join(" — ")));
    })();

    var fText = field(sh.box, { k: "text", label: "العمل المطلوب", multi: true,
      note: "وصف المهمة الإدارية أو التكليف." }, t.text);

    /* إدراج سريع من: الحكم ومواعيد الطعن، محاضر مرتبطة بالقضية، أوراق
       محضرين مرتبطة (مطابقة باسم الموكل) — بدل إعادة كتابتها يدوياً في
       التكليف. النص يُضاف لآخر ما هو مكتوب في "العمل المطلوب" بالفعل،
       ثم يُرسَل زي أي تكليف تاني عبر زر PDF/واتساب. */
    (function () {
      var sources = adminTaskInsertSources(c);
      if (!sources.length) return;
      var wrap = el("div", "margin:-6px 0 12px");
      var lbl = el("div", "font-size:12.5px;color:var(--muted);margin-bottom:6px", "📋 إدراج من:");
      wrap.appendChild(lbl);
      var row2 = el("div", "display:flex;gap:6px;flex-wrap:wrap");
      sources.forEach(function (s) {
        var b = document.createElement("button");
        b.type = "button"; b.textContent = s.label;
        b.style.cssText = "min-height:38px;padding:6px 12px;border-radius:20px;" +
          "border:1px solid var(--brand);background:transparent;color:var(--brand);" +
          "font-family:inherit;font-size:12.5px";
        b.onclick = function () {
          var cur = fText.value || "";
          fText.value = (cur ? cur.replace(/\s+$/, "") + "\n" : "") + s.text;
        };
        row2.appendChild(b);
      });
      wrap.appendChild(row2);
      sh.box.appendChild(wrap);
    })();

    /* المُكلَّفون: اختيار متعدد من أعضاء المكتب */
    sh.box.appendChild(el("label",
      "display:block;font-family:var(--f-title);font-size:14px;margin:6px 0 5px;" +
      "color:var(--brand-dark)", "المُكلَّفون"));
    var who = el("div", "display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px");
    var chosen = {};
    (t.assignees || []).forEach(function (id) { chosen[id] = 1; });
    var members = teamMembers();
    if (!members.length) {
      who.appendChild(el("div", "color:var(--muted);font-size:13px;padding:6px",
        "لا أعضاء مسجَّلون — أضِفهم من شاشة المحامين والصلاحيات."));
    }
    /* اختيار المُكلَّفين هنا قائمة شيك بوكس بحتة — لا حذف للشخص من هذه
       الشاشة إطلاقاً (كان زر "✕" هنا يحذف المحامي نهائياً من أعضاء المكتب،
       فالتبس بإلغاء اختياره لهذا التكليف فقط، وكاد يُفقد محامياً بالخطأ).
       حذف محامٍ من المكتب فعلياً صار فقط من صفحة «المحامون والصلاحيات». */
    function renderMembers() {
      who.textContent = "";
      who.style.cssText = "display:flex;flex-direction:column;gap:2px;margin-bottom:6px";
      var mem = teamMembers();
      if (!mem.length) {
        who.appendChild(el("div", "color:var(--muted);font-size:13px;padding:6px",
          "لا أعضاء — أضِفهم من صفحة المحامون والصلاحيات، أو بالزر أدناه."));
      }
      mem.forEach(function (u) {
        var row = document.createElement("label");
        row.style.cssText = "display:flex;align-items:center;gap:8px;min-height:44px;" +
          "padding:4px 6px;cursor:pointer";
        var cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = !!chosen[u.id];
        cb.style.cssText = "width:20px;height:20px";
        cb.onchange = function () {
          if (cb.checked) chosen[u.id] = 1; else delete chosen[u.id];
        };
        var nm = el("span", "font-size:14.5px", u.name);
        row.appendChild(cb); row.appendChild(nm);
        who.appendChild(row);
      });

      var addP = document.createElement("button");
      addP.type = "button"; addP.textContent = "＋ شخص جديد";
      addP.style.cssText = "min-height:40px;padding:7px 14px;border-radius:20px;" +
        "border:1px dashed var(--brand);background:transparent;color:var(--brand);" +
        "font-family:inherit;font-size:13px";
      addP.onclick = function () {
        var nm = prompt("اسم الشخص المُكلَّف:");
        if (!nm || !nm.trim()) return;
        nm = nm.trim();
        if (w.Team && Team.data) {
          var id = "m" + Date.now().toString(36);
          Team.data.users = Team.data.users || [];
          Team.data.users.push({ id: id, name: nm, role: "member", active: true });
          Team.save();
          chosen[id] = 1;
        }
        renderMembers();
      };
      who.appendChild(addP);
    }
    renderMembers();
    sh.box.appendChild(who);

    /* المحكمة اللي الشغل فيها — منها بنجيب أقرب جلسة (طلب المستخدم ٦-١٠) */
    var fCourt = field(sh.box, { k: "taskCourt", label: "المحكمة (مكان العمل)",
      note: "افتراضياً محكمة القضية. البرنامج بيدوّر في كل القضايا على أقرب جلسة فيها، علشان اللي يحضرها ياخد الشغل معاه." },
      taskCourt(c, t));
    (function () {
      var dl = document.createElement("datalist"), seen = {};
      dl.id = "cf_court_dl";
      read().forEach(function (x) {
        var n = String(x.courtName || "").trim();
        if (n && !seen[n]) { seen[n] = 1; var o = document.createElement("option"); o.value = n; dl.appendChild(o); }
      });
      sh.box.appendChild(dl);
      if (fCourt.setAttribute) fCourt.setAttribute("list", "cf_court_dl");
    })();
    var courtInfo = el("div", "margin:-4px 0 12px;padding:10px 12px;border-radius:10px;background:var(--bg,#f4ece0);font-size:13px;line-height:1.9");
    sh.box.appendChild(courtInfo);

    var fTask = field(sh.box, { k: "taskDate", label: "تاريخ العمل المطلوب", date: true,
      note: "بيتحط لوحده يوم أقرب جلسة في المحكمة — ولو الشغل مستعجل غيّره." }, t.taskDate);
    function drawCourtInfo() {
      courtInfo.textContent = "";
      var court = String(fCourt.value || "").trim();
      if (!court) { courtInfo.appendChild(el("div", "color:var(--muted)", "اكتب المحكمة علشان البرنامج يجيب أقرب جلسة فيها.")); return; }
      var nd = nextCourtDay(court, today());
      if (!nd) {
        courtInfo.appendChild(el("div", "color:var(--muted)", "مفيش جلسة جاية مسجّلة في «" + court + "» — اختار تاريخ العمل بنفسك."));
        return;
      }
      courtInfo.appendChild(el("div", "font-family:var(--f-title);color:var(--brand-dark)", courtDayText(nd)));
      var others = courtOpenTasks(court, nd.date).filter(function (x) { return x.t.id !== t.id; });
      if (others.length) {
        courtInfo.appendChild(el("div", "margin-top:4px", "أعمال إدارية مفتوحة في المحكمة دي لحد اليوم ده (" + ar(others.length) + "):"));
        others.slice(0, 8).forEach(function (x) {
          courtInfo.appendChild(el("div", "font-size:12.5px;color:var(--muted)", "• " + String(x.t.text || "(بلا وصف)").slice(0, 70) +
            (x.t.taskDate ? " — " + dayDate(x.t.taskDate) : "") + (x.c.general ? "" : " (ملف " + ar(x.c.fileNo || "—") + ")")));
        });
      }
      var useB = el("button", "margin-top:8px;width:100%;min-height:40px;border:1px solid var(--brand);border-radius:9px;" +
        "background:transparent;color:var(--brand);font-family:inherit;font-size:13.5px", "📅 خلّي العمل يوم الجلسة دي (" + dayDate(nd.date) + ")");
      useB.type = "button";
      useB.onclick = function () {
        fTask.value = nd.date;
        try { fTask.dispatchEvent(new Event("change")); } catch (e) { }
      };
      courtInfo.appendChild(useB);
      if (isNew && !fTask.value) fTask.value = nd.date;   /* عمل جديد: يوم أقرب جلسة، والمستعجل يتغيّر باليد */
    }
    drawCourtInfo();
    if (fCourt.addEventListener) { fCourt.addEventListener("change", drawCourtInfo); }
    var fPrio = field(sh.box, { k: "prio", label: "الأولوية",
      options: ["عاجل", "عالي", "عادي", "منخفض"] }, t.prio || "عادي");
    var fState = field(sh.box, { k: "state", label: "الحالة",
      options: ["لم يتم", "قيد التنفيذ", "تم", "ملغي"] }, t.state || "لم يتم");
    var fOrg  = field(sh.box, { k: "org", label: "الجهة", suggest: true },
      t.org);

    /* المهام الفرعية — نص + خانة إنجاز، مع شريط تقدّم */
    sh.box.appendChild(el("label",
      "display:block;font-family:var(--f-title);font-size:14px;margin:12px 0 5px;" +
      "color:var(--brand-dark)", "المهام الفرعية"));
    var subsWrap = el("div");
    sh.box.appendChild(subsWrap);
    var subs = (t.subs || []).map(function (s) {
      return { text: s.text || "", done: !!s.done };
    });
    function drawSubs() {
      subsWrap.textContent = "";
      subs.forEach(function (s, idx) {
        var rowEl = el("div", "display:flex;gap:6px;align-items:center;margin-bottom:6px");
        var chk = document.createElement("input");
        chk.type = "checkbox"; chk.checked = s.done;
        chk.style.cssText = "width:20px;height:20px;flex:0 0 auto";
        chk.onchange = function () { s.done = chk.checked; };
        var inp = document.createElement("input");
        inp.type = "text"; inp.value = s.text; inp.placeholder = "مهمة فرعية…";
        inp.setAttribute("dir", "rtl");
        inp.style.cssText = "flex:1;min-height:44px;font-size:15px;padding:8px 10px;" +
          "border:1px solid var(--line,#ddd);border-radius:9px;background:var(--card);" +
          "font-family:inherit;direction:rtl;text-align:right";
        inp.oninput = function () { s.text = inp.value; };
        var rm = document.createElement("button");
        rm.type = "button"; rm.textContent = "✕";
        rm.style.cssText = "flex:0 0 42px;min-height:44px;border:1px solid var(--line,#ddd);" +
          "border-radius:9px;background:transparent;color:#b3261e";
        rm.onclick = function () { subs.splice(idx, 1); drawSubs(); };
        rowEl.appendChild(chk); rowEl.appendChild(inp); rowEl.appendChild(rm);
        subsWrap.appendChild(rowEl);
      });
      var addS = document.createElement("button");
      addS.type = "button"; addS.textContent = "＋ مهمة فرعية";
      addS.style.cssText = "min-height:42px;padding:7px 14px;border:1px dashed var(--brand);" +
        "border-radius:9px;background:transparent;color:var(--brand);font-family:inherit;font-size:13px";
      addS.onclick = function () { subs.push({ text: "", done: false }); drawSubs(); };
      subsWrap.appendChild(addS);
    }
    drawSubs();

    var fNotes = field(sh.box, { k: "notes", label: "ملاحظات ما تم في العمل", multi: true,
      note: "أي تطوّرات أو ملاحظات." }, t.notes);

    /* مراسلات فريق العمل — محادثة داخل العمل + إرسال على واتساب */
    sh.box.appendChild(el("label",
      "display:block;font-family:var(--f-title);font-size:14px;margin:12px 0 5px;" +
      "color:var(--brand-dark)", "مراسلات فريق العمل"));
    var chatWrap = el("div",
      "max-height:160px;overflow-y:auto;border:1px solid var(--line,#eee);" +
      "border-radius:9px;padding:8px;margin-bottom:6px;background:var(--bg,#f4ece0)");
    sh.box.appendChild(chatWrap);
    t.chat = t.chat || [];
    function drawChat() {
      chatWrap.textContent = "";
      if (!t.chat.length) {
        chatWrap.appendChild(el("div", "color:var(--muted);font-size:12.5px;padding:4px",
          "لا رسائل بعد."));
      }
      t.chat.forEach(function (m) {
        var b = el("div", "background:var(--card);border-radius:8px;padding:6px 9px;" +
          "margin-bottom:5px;font-size:12.5px;line-height:1.7");
        b.appendChild(el("div", "color:var(--brand-dark);font-family:var(--f-title);font-size:11.5px",
          (m.from || "—") + (m.at ? " · " + ar(m.at) : "")));
        b.appendChild(el("div", "", m.text || ""));
        chatWrap.appendChild(b);
      });
    }
    drawChat();
    var chatRow = el("div", "display:flex;gap:6px");
    var chatInp = document.createElement("input");
    chatInp.type = "text"; chatInp.placeholder = "اكتب رسالة…"; chatInp.setAttribute("dir", "rtl");
    chatInp.style.cssText = "flex:1;min-height:46px;font-size:15px;padding:8px 10px;" +
      "border:1px solid var(--line,#ddd);border-radius:9px;background:var(--card);" +
      "font-family:inherit;direction:rtl;text-align:right";
    var chatSend = document.createElement("button");
    chatSend.type = "button"; chatSend.textContent = "إرسال";
    chatSend.style.cssText = "flex:0 0 auto;min-height:46px;padding:0 16px;border:0;" +
      "border-radius:9px;background:var(--brand);color:#fff;font-family:inherit;font-size:14px";
    chatSend.onclick = function () {
      var v = chatInp.value.trim(); if (!v) return;
      var me = (w.Team && Team.current && Team.current()) || {};
      t.chat.push({ from: me.name || "المكتب", text: v, at: todayISO() });
      chatInp.value = ""; drawChat();
    };
    var chatWa = document.createElement("button");
    chatWa.type = "button"; chatWa.textContent = "🟢 واتساب";
    chatWa.title = "إرسال التكليف على واتساب للمُكلَّف";
    chatWa.style.cssText = "flex:0 0 auto;min-height:46px;padding:0 12px;border:1px solid #25d366;" +
      "border-radius:9px;background:transparent;color:#128c3e;font-family:inherit;font-size:13px";
    chatWa.onclick = function () {
      var msg = (fText.value || "").trim() || "تكليف من المكتب";
      var mem = teamMembers();
      var first = Object.keys(chosen)[0];
      var phone = "";
      mem.forEach(function (u) { if (u.id === first && u.phone) phone = String(u.phone).replace(/[^0-9]/g, ""); });
      var url = "https://wa.me/" + phone + "?text=" + encodeURIComponent(msg);
      if (w.Share && Share.shareText && !phone) { Share.shareText(msg); return; }
      window.open(url, "_blank");
    };
    var chatPdf = document.createElement("button");
    chatPdf.type = "button"; chatPdf.textContent = "📤 PDF";
    chatPdf.title = "إرسال التكليف كملف PDF — عبر واتساب أو البريد الإلكتروني أو أي تطبيق آخر.";
    chatPdf.style.cssText = "flex:0 0 auto;min-height:46px;padding:0 12px;border:1px solid var(--brand);" +
      "border-radius:9px;background:transparent;color:var(--brand);font-family:inherit;font-size:13px";
    chatPdf.onclick = function () {
      if (!w.PdfDoc || !w.PdfBuild || !w.Share || !Share.sharePdf) { alert("غير متاح على هذا الجهاز."); return; }
      var mem = teamMembers();
      var names = Object.keys(chosen).map(function (id) {
        var u = mem.filter(function (x) { return x.id === id; })[0];
        return u ? u.name : "";
      }).filter(Boolean);
      var rows = [
        ["رقم الملف", ar(c.fileNo || "—")],
        ["الموكل", clientNames(c).join("، ")],
        ["رقم الدعوى", c.caseNo ? ar(c.caseNo) + (c.caseYear ? " لسنة " + ar(c.caseYear) : "") : ""],
        ["الموضوع", c.subject || ""],
        ["العمل المطلوب", (fText.value || "").trim()],
        ["المُكلَّفون", names.join("، ")],
        ["تاريخ العمل المطلوب", fTask.value || ""],
        ["الأولوية", fPrio.value || ""],
        ["الحالة", fState.value || ""]
      ].filter(function (r) { return r[1]; });
      chatPdf.disabled = true; var oldTxt = chatPdf.textContent; chatPdf.textContent = "جارٍ الإعداد…";
      PdfDoc.build([
        { center: "تكليف / عمل إداري" },
        { table: { headers: ["الحقل", "البيان"], widths: [1, 2.6], rows: rows } }
      ]).then(function (pages) {
        chatPdf.disabled = false; chatPdf.textContent = oldTxt;
        Share.sharePdf(PdfBuild.toBase64(PdfBuild.fromJpegs(pages)), "تكليف-" + (c.fileNo || "") + ".pdf");
      }).catch(function () {
        chatPdf.disabled = false; chatPdf.textContent = oldTxt;
        alert("تعذّر إنشاء الـPDF.");
      });
    };
    chatRow.appendChild(chatInp); chatRow.appendChild(chatSend); chatRow.appendChild(chatWa);
    chatRow.appendChild(chatPdf);
    sh.box.appendChild(chatRow);

    var save = btn("حفظ", "border:0;background:var(--brand);color:#fff;font-weight:600");
    var cancel = btn("إلغاء",
      "border:1px solid var(--line,#ddd);background:transparent;color:var(--muted)");
    save.onclick = function () {
      t.text = fText.value.trim();
      t.assignees = Object.keys(chosen);
      t.taskDate = w.lawyerToISO ? (w.lawyerToISO(fTask.value) || fTask.value) : fTask.value;
      var cv = String(fCourt.value || "").trim();
      if (!GEN && cv === String(c.courtName || "").trim()) delete t.court; else if (cv) t.court = cv; else delete t.court;
      t.prio = fPrio.value;
      t.state = fState.value;
      t.org = (fOrg.value || "").trim();
      t.subs = subs.filter(function (s) { return s.text.trim(); });
      t.notes = (fNotes.value || "").trim();
      if (!t.text && !t.assignees.length) { alert("اكتب العمل أو اختر مُكلَّفاً."); return; }
      if (isNew) c.adminTasks.push(t);
      if (!persist()) return;
      if (t.org && w.Lists) { try { Lists.add("adminOrg", t.org); } catch (e) {} }
      sh.back.remove();
      if (done) done();
    };
    cancel.onclick = function () { sh.back.remove(); };
    row(sh.box, [save, cancel], "margin-top:16px");

    if (!isNew) {
      var del = btn("🗑 حذف العمل",
        "border:1px solid #e3c9c6;background:transparent;color:#b3261e");
      del.style.flex = "1 1 100%";
      del.onclick = function () {
        Ask.confirm("حذف هذا العمل الإداري؟", { ok: "حذف" }, function () {
          c.adminTasks.splice(index, 1);
          if (!persist()) return;
          sh.back.remove();
          if (done) done();
        });
      };
      row(sh.box, [del], "margin-top:10px");
    }
  }

  /* ===== الأعمال الإدارية على جلسات المحكمة (طلب المستخدم ٦-١٠) =====
     العمل الإداري بيتربط بمحكمة (افتراضياً محكمة القضية)، والبرنامج بيدوّر في كل القضايا على
     أقرب جلسة في نفس المحكمة، فاللي رايح يحضر الجلسة ياخد الإداريات معاه في نفس اليوم.
     مستعجل؟ التاريخ بيتغيّر باليد. ما اتعملش؟ «↪ أقرب جلسة» بعدها في المحكمة أو تاريخ تختاره. */
  function courtKeyT(name) { return norm(name || "").replace(/^(ال)?محكمه\s+/, "").replace(/\s+/g, " ").trim(); }
  function taskCourt(c, t) { return String((t && t.court) || (c && !c.general ? c.courtName : "") || "").trim(); }
  function courtSessionsFrom(court, fromIso) {
    var k = courtKeyT(court); if (!k) return [];
    var out = [];
    read().forEach(function (c) {
      if (c.fileType === "عمل" || courtKeyT(c.courtName) !== k) return;
      (c.sessions || []).forEach(function (s0) {
        if (s0 && /^\d{4}-\d{2}-\d{2}$/.test(s0.date || "") && s0.date >= fromIso) out.push({ date: s0.date, c: c });
      });
    });
    return out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  }
  /** أقرب يوم جلسات في المحكمة من fromIso (شامل) — { date, items:[قضايا اليوم ده] } أو null */
  function nextCourtDay(court, fromIso) {
    var all = courtSessionsFrom(court, fromIso || today());
    if (!all.length) return null;
    var d = all[0].date, seen = {}, items = [];
    all.forEach(function (x) { if (x.date === d && !seen[x.c.id]) { seen[x.c.id] = 1; items.push(x.c); } });
    return { date: d, items: items };
  }
  function isOpenTask(t) { var st = t.state || "لم يتم"; return st !== "تم" && st !== "ملغي"; }
  /** الأعمال المفتوحة في المحكمة (كل القضايا + الأعمال العامة)؛ untilIso: اللي تاريخها لحد اليوم ده */
  function courtOpenTasks(court, untilIso) {
    var k = courtKeyT(court), out = [];
    if (!k) return out;
    read().concat([generalBox()]).forEach(function (c) {
      (c.adminTasks || []).forEach(function (t, i) {
        if (!isOpenTask(t) || courtKeyT(taskCourt(c, t)) !== k) return;
        if (untilIso && t.taskDate && t.taskDate > untilIso) return;
        out.push({ c: c, t: t, idx: i });
      });
    });
    return out;
  }
  function courtDayText(nd) {
    var law = {};
    nd.items.forEach(function (c) { if (c.lawyer) law[c.lawyer] = 1; });
    return "🏛 أقرب جلسة في المحكمة: " + dayDate(nd.date) + " — " + ar(nd.items.length) + " قضية (" +
      nd.items.slice(0, 4).map(function (c) { return "ملف " + ar(c.fileNo || "—"); }).join("، ") +
      (nd.items.length > 4 ? "…" : "") + ")" +
      (Object.keys(law).length ? " · المحامي: " + Object.keys(law).join("، ") : "");
  }
  /** تعديل عمل إداري من غير فتح الفورم (تم / ترحيل) */
  function updateTask(caseId, taskId, fn) {
    if (caseId === GENERAL_ID) {
      var b = generalBox(), t0 = (b.adminTasks || []).filter(function (x) { return x.id === taskId; })[0];
      if (!t0) return false;
      fn(t0, b); saveGeneral(b); return true;
    }
    var list = read(), c = list.filter(function (x) { return x.id === caseId; })[0];
    if (!c) return false;
    var t = (c.adminTasks || []).filter(function (x) { return x.id === taskId; })[0];
    if (!t) return false;
    fn(t, c); return write(list, c.id);
  }
  function isoPlus(iso, n) { var d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return isoOfDate(d); }
  /** «✓ تم» و«↪ أقرب جلسة في المحكمة» و«📅 ميعاد تاني» على كارت العمل المفتوح */
  function taskQuickActions(c, t, idx, redraw) {
    var wrap = el("div", "display:flex;gap:6px;flex-wrap:wrap;margin-top:8px");
    if (!t || !isOpenTask(t) || !t.id) return wrap;
    function mk(label, css, on) {
      var b = el("button", "flex:1 1 auto;min-height:38px;padding:6px 10px;border-radius:9px;font-family:inherit;font-size:13px;" + css, label);
      b.type = "button";
      b.onclick = function (e) { e.stopPropagation(); on(); };
      wrap.appendChild(b);
    }
    var court = taskCourt(c, t);
    mk("✓ تم", "border:0;background:#1c8a4a;color:#fff", function () {
      updateTask(c.id, t.id, function (x) { x.state = "تم"; x.doneAt = today(); });
      notice("✓ اتعلّم «تم».");
      if (redraw) redraw();
    });
    if (court) mk("↪ أقرب جلسة في المحكمة", "border:1px solid var(--brand);background:transparent;color:var(--brand)", function () {
      var from = today();
      if (t.taskDate && t.taskDate >= from) from = isoPlus(t.taskDate, 1);
      var nd = nextCourtDay(court, from);
      if (!nd) {
        alert("مفيش جلسة جاية مسجّلة في «" + court + "» من " + dayDate(from) + " — اختار تاريخ بنفسك.");
        editAdminTask(c.id, idx, redraw);
        return;
      }
      updateTask(c.id, t.id, function (x) {
        var old = x.taskDate;
        x.taskDate = nd.date;
        x.notes = (x.notes ? x.notes + "\n" : "") + "↪ اترحّل" + (old ? " من " + dayDate(old) : "") +
          " لأقرب جلسة في " + court + ": " + dayDate(nd.date);
      });
      notice("↪ اترحّل لـ" + dayDate(nd.date) + " — أقرب جلسة في " + court);
      if (redraw) redraw();
    });
    mk("📅 ميعاد تاني", "border:1px solid var(--line,#ddd);background:transparent;color:var(--muted)", function () {
      editAdminTask(c.id, idx, redraw);
    });
    return wrap;
  }

  function adminTasksSection(c, box, refresh) {
    head(box, "الأعمال الإدارية والتكليفات",
         "font-family:var(--f-title);font-size:15px;margin:18px 0 8px");

    var tasks = c.adminTasks || [];
    if (!tasks.length) {
      box.appendChild(el("div", "color:var(--muted);font-size:13.5px;padding:6px 0",
        "لا أعمال إدارية بعد."));
    }
    var names = {};
    teamMembers().forEach(function (u) { names[u.id] = u.name; });

    var PRIO_COLOR = { "عاجل": "#b3261e", "عالي": "#e07b1a", "عادي": "#3d6cc4", "منخفض": "#8a7a63" };
    var STATE_COLOR = { "تم": "#1c8a4a", "قيد التنفيذ": "#e07b1a", "ملغي": "#8a7a63", "لم يتم": "#b3792a" };
    var cnt = { "تم": 0, "قيد التنفيذ": 0, "لم يتم": 0, "عاجل": 0 };

    tasks.forEach(function (t, i) {
      var st = t.state || "لم يتم";
      if (cnt[st] != null) cnt[st]++;
      if (t.prio === "عاجل" && st !== "تم" && st !== "ملغي") cnt["عاجل"]++;

      var r = el("div",
        "border:1px solid var(--line,#eee);border-radius:11px;padding:11px;" +
        "margin-bottom:8px;cursor:pointer");

      /* شارات الأولوية والحالة */
      var badges = el("div", "display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px");
      if (t.prio) badges.appendChild(el("span",
        "font-size:11.5px;padding:2px 9px;border-radius:20px;color:#fff;background:" +
        (PRIO_COLOR[t.prio] || "#8a7a63"), t.prio));
      badges.appendChild(el("span",
        "font-size:11.5px;padding:2px 9px;border-radius:20px;color:#fff;background:" +
        (STATE_COLOR[st] || "#8a7a63"), st));
      r.appendChild(badges);

      r.appendChild(el("div", "font-size:13.5px;line-height:1.8;color:var(--text)",
        t.text || "(بلا وصف)"));
      /* ميعاد متناقص: «متبقي N يوم» حتى آخر موعد (للأعمال غير المنتهية) */
      if (t.dueDate && st !== "تم" && st !== "ملغي") {
        var _m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(t.dueDate));
        if (_m) {
          var _left = Math.round((new Date(+_m[1], +_m[2] - 1, +_m[3]) - new Date(new Date().setHours(0, 0, 0, 0))) / 86400000);
          r.appendChild(el("div", "display:inline-block;margin-top:5px;padding:3px 11px;border-radius:14px;font-size:13px;font-weight:700;color:#fff;background:" +
            (_left < 0 ? "#7a1410" : _left <= 7 ? "#b3261e" : _left <= 20 ? "#e07b1a" : "#3d6cc4"),
            _left < 0 ? "⛔ فات الموعد بـ " + ar(-_left) + " يوم" : (_left === 0 ? "⏳ آخر يوم اليوم" : "⏳ متبقي " + ar(_left) + " يوم")));
        }
      }

      /* شريط تقدّم المهام الفرعية */
      var subs = t.subs || [];
      if (subs.length) {
        var doneN = subs.filter(function (s) { return s.done; }).length;
        var pct = Math.round(doneN / subs.length * 100);
        var barWrap = el("div", "margin-top:7px");
        var bar = el("div", "height:8px;border-radius:6px;background:var(--line,#eee);overflow:hidden");
        bar.appendChild(el("div", "height:100%;width:" + pct + "%;background:var(--brand)"));
        barWrap.appendChild(bar);
        barWrap.appendChild(el("div", "font-size:11.5px;color:var(--muted);margin-top:3px",
          "المهام الفرعية: " + ar(doneN) + "/" + ar(subs.length)));
        r.appendChild(barWrap);
      }

      var meta = [];
      if ((t.assignees || []).length) {
        meta.push("المُكلَّفون: " + t.assignees.map(function (id) {
          return names[id] || "؟"; }).join("، "));
      }
      if ((t.watch || []).length) meta.push("متابعة: " + t.watch.join("، "));
      if (t.org)      meta.push("الجهة: " + t.org);
      if (t.court)    meta.push("المحكمة: " + t.court);
      if (t.taskDate) meta.push("العمل: " + ar(String(t.taskDate).replace(/-/g, "/")));
      if (t.dueDate)  meta.push("آخر موعد: " + ar(String(t.dueDate).replace(/-/g, "/")));
      if ((t.chat || []).length) meta.push("💬 " + ar((t.chat || []).length));
      if (meta.length) {
        r.appendChild(el("div",
          "font-size:12.5px;color:var(--muted);margin-top:5px;line-height:1.9",
          meta.join(" · ")));
      }
      r.appendChild(taskQuickActions(c, t, i, refresh));
      r.appendChild(el("div", "font-size:12px;color:var(--brand);margin-top:6px",
        "✎ اضغط للتعديل أو الحذف"));
      r.onclick = function () { editAdminTask(c.id, i, refresh); };
      box.appendChild(r);
    });

    if (tasks.length) {
      box.appendChild(el("div",
        "font-size:12px;color:var(--muted);margin:4px 0 8px;line-height:1.9",
        "تم: " + ar(cnt["تم"]) + " · قيد التنفيذ: " + ar(cnt["قيد التنفيذ"]) +
        " · لم يتم: " + ar(cnt["لم يتم"]) + " · عاجل: " + ar(cnt["عاجل"])));
    }

    var add = btn("＋ عمل إداري / تكليف",
      "border:1px solid var(--line,#ddd);background:transparent;color:var(--brand)");
    add.onclick = function () { editAdminTask(c.id, -1, refresh); };
    row(box, [add], "margin-top:4px");
  }

  /* ------------------------------------------- أتعاب ومصروفات الدعوى (أدمن)

     تُدرَج من قسم المصروفات نفسه وتُقيَّد في دفتره، مصفّاةً على رقم ملف
     هذه القضية. تظهر لمدير المكتب فقط. */

  function canSeeFees() {
    return (w.Team && Team.canView) ? Team.canView("fees") : isAdmin();
  }
  function feesSection(c, box, refresh) {
    if (!canSeeFees() || !w.Expenses) return;

    head(box, "أتعاب ومصروفات الدعوى",
         "font-family:var(--f-title);font-size:15px;margin:18px 0 8px");
    box.appendChild(el("div",
      "font-size:12px;color:var(--muted);margin-bottom:8px;line-height:1.9",
      "للإدارة فقط — تُقيَّد في الملف المالي نفسه على هذا الملف."));
    /* §9 عبارة ثابتة على كل تسجيل مالي للقضية */
    box.appendChild(el("div",
      "font-size:12.5px;color:var(--brand-dark);background:var(--bg,#f4ece0);" +
      "border-radius:8px;padding:8px 12px;margin-bottom:10px;font-family:var(--f-title)",
      "الأتعاب لا تشمل الرسوم ولا المصروفات"));

    /* §2 شرط الأتعاب المتفق عليها (قيمة أو نسبة) + طريقة الأداء */
    var agr = el("div", "border:1px solid var(--line,#eee);border-radius:10px;" +
      "padding:10px 12px;margin-bottom:10px;background:var(--card)");
    var aLines = [];
    if (c.feeKind === "نسبة") {
      if (c.feePct) {
        var pctFee = pctFeeOf(c);
        aLines.push("الأتعاب المتفق عليها: " + ar(c.feePct) + "% " +
          (pctFee != null ? "من " + Expenses.fmt(Expenses.money(c.disputedAmount)) + " ج = " + Expenses.fmt(pctFee) + " ج"
                          : "من نتيجة القضية (اكتب المبلغ المتنازع عليه لحساب القيمة)"));
      }
    } else if (c.feeStart) {
      aLines.push("الأتعاب المتفق عليها: " + Expenses.fmt(Expenses.money(c.feeStart)) + " ج");
    }
    if (c.payMethod) aLines.push("طريقة الأداء: " + c.payMethod);
    if (c.paySchedule) aLines.push("شكل الدفعات: " + c.paySchedule);
    if (c.payDate) aLines.push("تاريخ السداد: " + ar(String(c.payDate).replace(/-/g, "/")));
    agr.appendChild(el("div", "font-size:12.5px;color:var(--text);line-height:1.9",
      aLines.length ? aLines.join(" · ") : "لم تُسجَّل الأتعاب المتفق عليها بعد."));
    var agBtn = btn(aLines.length ? "✎ تعديل اتفاق الأتعاب" : "＋ اتفاق الأتعاب",
      "border:1px solid var(--brand);background:transparent;color:var(--brand);margin-top:8px");
    agBtn.onclick = function () { editFeeAgreement(c, refresh); };
    agr.appendChild(agBtn);
    box.appendChild(agr);

    var fileNo = String(c.fileNo || "").trim();
    if (!fileNo) {
      box.appendChild(el("div", "color:#b3261e;font-size:13px;padding:6px 0",
        "أدخِل رقم الملف بالمكتب أولاً لتُحمَّل عليه المصروفات."));
      return;
    }

    var la = function (t) {
      return String(t == null ? "" : t)
        .replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x0660; });
    };
    var moves = Expenses.all().filter(function (r) {
      return la(r.fileNo).trim() === la(fileNo).trim();
    });
    var t = { custody: 0, spent: 0 };
    moves.forEach(function (r) {
      var v = Expenses.money(r.amount);
      if (r.kind === "عهدة مستلمة") t.custody += v; else t.spent += v;
    });

    var sum = el("div", "display:flex;gap:8px;margin-bottom:10px");
    [["المقبوض", t.custody], ["المصروف", t.spent], ["الرصيد", t.custody - t.spent]]
      .forEach(function (p) {
        var d = el("div",
          "flex:1;background:var(--bg,#f4ece0);border-radius:9px;padding:9px 6px;text-align:center");
        d.appendChild(el("div", "font-size:11px;color:var(--muted)", p[0]));
        d.appendChild(el("div", "font-family:var(--f-title);font-size:15px", Expenses.fmt(p[1])));
        sum.appendChild(d);
      });
    box.appendChild(sum);

    /* §2 المتبقي من الأتعاب — للقيمة، وللنسبة لو المبلغ المتنازع عليه متسجّل */
    var agreed = c.feeKind === "نسبة" ? pctFeeOf(c) : (c.feeStart ? Expenses.money(c.feeStart) : null);
    if (agreed != null) {
      var rem = agreed - t.custody;
      box.appendChild(el("div",
        "font-size:12.5px;color:var(--brand-dark);background:var(--bg,#f4ece0);" +
        "border-radius:8px;padding:8px 12px;margin-bottom:10px;font-family:var(--f-title)",
        "المتبقي من الأتعاب المتفق عليها: " + Expenses.fmt(rem) + " ج"));
    }

    moves.slice(0, 30).forEach(function (r) {
      var isIn = r.kind === "عهدة مستلمة";
      var line = el("div",
        "display:flex;gap:8px;align-items:center;border:1px solid var(--line,#eee);" +
        "border-radius:9px;padding:8px 10px;margin-bottom:6px;font-size:12.5px");
      var a = el("span", "flex:0 0 auto;font-family:var(--f-title);color:" +
        (isIn ? "#1f7a4d" : "#b3261e"), (isIn ? "+ " : "− ") + Expenses.fmt(Expenses.money(r.amount)));
      line.appendChild(a);
      line.appendChild(el("span", "flex:1;color:var(--muted);word-break:break-word",
        (r.item || r.kind || "") + (r.date ? " · " + ar(String(r.date).replace(/-/g, "/")) : "")));
      box.appendChild(line);
    });

    var addRow = el("div", "display:flex;gap:8px;margin-top:4px");
    function mk(label, kind) {
      var b = btn(label, "border:1px solid var(--line,#ddd);background:transparent;color:var(--brand)");
      b.onclick = function () {
        var client = (clientsWithOffice(c)[0] || {}).name || "";
        Expenses.edit({ scope: "مصروفات قضية", fileNo: fileNo, client: client, kind: kind },
          function () { if (refresh) refresh(); });
      };
      return b;
    }
    addRow.appendChild(mk("＋ مصروف", "مصروف"));
    addRow.appendChild(mk("＋ عهدة", "عهدة مستلمة"));
    box.appendChild(addRow);

    var goto2 = el("a", null);
    goto2.href = "31-case-revenue.html?fileNo=" + encodeURIComponent(fileNo);
    goto2.textContent = "فتح أتعاب هذا الملف ومصروفاته بالكامل ›";
    goto2.style.cssText = "display:block;margin-top:8px;color:var(--brand);font-size:12.5px;" +
      "text-decoration:none;text-align:center;min-height:36px;line-height:2.6";
    box.appendChild(goto2);

    var goto = el("a", null);
    goto.href = "91-expenses.html?q=" + encodeURIComponent(fileNo);
    goto.textContent = "فتح دفتر المصروفات العام على هذا الملف ›";
    goto.style.cssText = "display:block;margin-top:4px;color:var(--brand);font-size:12.5px;" +
      "text-decoration:none;text-align:center;min-height:36px;line-height:2.6";
    box.appendChild(goto);
  }


  /* -------------------------------- أدوات مساعدة للتعديل على القضية المخزَّنة */

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) +
           "-" + ("0" + d.getDate()).slice(-2);
  }
  /** يعدّل القضية في المخزن مباشرةً بأمان (قراءة → تعديل بالمُعرِّف → كتابة). */
  function patchCase(caseId, fn) {
    var list = read();
    var cc = list.filter(function (x) { return x.id === caseId; })[0];
    if (!cc) return false;
    fn(cc);
    return write(list, cc.id);
  }

  /* --------------------------------------- §14أ سجلّ ملاحظات القضية المتعدد */

  function noteLogSection(c, box, refresh) {
    head(box, "📝 ملاحظات القضية",
         "font-family:var(--f-title);font-size:15px;margin:18px 0 8px");
    var log = c.noteLog || [];
    if (!log.length) {
      box.appendChild(el("div", "color:var(--muted);font-size:13px;padding:4px 0",
        "لا ملاحظات بعد — أضِف أول ملاحظة."));
    }
    log.slice().reverse().forEach(function (nt, i) {
      var idx = log.length - 1 - i;
      var r = el("div", "border:1px solid var(--line,#eee);border-radius:9px;" +
        "padding:9px 11px;margin-bottom:7px");
      var hd = el("div", "display:flex;justify-content:space-between;align-items:center;margin-bottom:4px");
      hd.appendChild(el("span", "font-size:12px;color:var(--muted)",
        nt.date ? ar(String(nt.date).replace(/-/g, "/")) : ""));
      var del = document.createElement("button");
      del.type = "button"; del.textContent = "🗑 حذف";
      del.style.cssText = "border:0;background:transparent;color:#b3261e;font-size:12.5px";
      del.onclick = function () {
        Ask.confirm("حذف هذه الملاحظة؟", { ok: "حذف" }, function () {
          patchCase(c.id, function (cc) { (cc.noteLog || []).splice(idx, 1); });
          if (c.noteLog) c.noteLog.splice(idx, 1);
          if (refresh) refresh();
        });
      };
      hd.appendChild(del);
      r.appendChild(hd);
      r.appendChild(el("div", "white-space:pre-wrap;line-height:1.9;font-size:13.5px", nt.text || ""));
      box.appendChild(r);
    });

    var ta = document.createElement("textarea");
    ta.rows = 2; ta.placeholder = "اكتب ملاحظة جديدة…";
    ta.setAttribute("dir", "rtl"); ta.setAttribute("lang", "ar");
    ta.style.cssText = "width:100%;min-height:60px;font-size:15px;padding:10px 12px;" +
      "border:1px solid var(--line,#ddd);border-radius:9px;background:var(--card);" +
      "font-family:inherit;direction:rtl;text-align:right;margin-top:4px";
    box.appendChild(ta);
    var add = btn("＋ إضافة ملاحظة",
      "border:1px solid var(--brand);background:transparent;color:var(--brand)");
    add.onclick = function () {
      var v = ta.value.trim();
      if (!v) { ta.focus(); return; }
      if (v.length > 3000) v = v.slice(0, 3000);
      var iso = todayISO();
      patchCase(c.id, function (cc) {
        cc.noteLog = cc.noteLog || []; cc.noteLog.push({ date: iso, text: v });
      });
      c.noteLog = c.noteLog || []; c.noteLog.push({ date: iso, text: v });
      ta.value = "";
      if (refresh) refresh();
    };
    row(box, [add], "margin-top:6px");
  }

  /* --------------------------------------- §14ج العرائض والمذكرات */

  function escHtml(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  var LAW_CSS = "border-right:3px solid #5b3a21;background:#f4ece0;padding:8px 12px;" +
    "margin:8px 0;border-radius:0 8px 8px 0;font-size:14px;line-height:2";
  var NAQD_CSS = "border-right:3px solid #17506b;background:#e9f0f5;padding:8px 12px;" +
    "margin:8px 0;border-radius:0 8px 8px 0;font-size:14px;line-height:2";

  function editDoc(c, index, type, refresh) {
    var isNew = index < 0;
    var doc = isNew ? { id: "dc" + Date.now().toString(36), type: type, title: "", html: "" }
                    : (c.docs || [])[index];
    var win = el("div", "position:fixed;inset:0;background:#fff;z-index:10060;overflow:auto;" +
      "padding:14px;direction:rtl;font-family:inherit;color:#000");
    win.setAttribute("data-nosave", "1");
    win.appendChild(el("div", "font-family:var(--f-title);font-size:16px;margin-bottom:8px;color:var(--brand-dark)",
      (isNew ? "" : "تعديل ") + doc.type));

    var title = document.createElement("input");
    title.type = "text"; title.value = doc.title || ""; title.placeholder = "عنوان المستند…";
    title.setAttribute("dir", "rtl");
    title.style.cssText = "width:100%;min-height:46px;font-size:16px;padding:9px 12px;" +
      "border:1px solid var(--line,#ddd);border-radius:9px;background:var(--card);" +
      "font-family:inherit;direction:rtl;text-align:right;margin-bottom:9px";
    win.appendChild(title);

    var tb = el("div", "display:flex;gap:6px;flex-wrap:wrap;margin-bottom:9px");
    function tbtn(label, on) {
      var b = el("button", "min-height:42px;padding:7px 11px;border:1px solid var(--line,#ddd);" +
        "border-radius:9px;background:var(--card);font-family:inherit;font-size:13px;color:var(--brand)", label);
      b.type = "button";
      b.onmousedown = function (e) { e.preventDefault(); };
      b.onclick = function () { ed.focus(); on(); };
      return b;
    }
    function ins(html) { document.execCommand("insertHTML", false, html); }
    tb.appendChild(tbtn("📜 نص مادة", function () {
      var t = (window.getSelection() + "") || "نص المادة القانونية…";
      ins('<div style="' + LAW_CSS + '">' + escHtml(t) + '</div><p><br></p>');
    }));
    tb.appendChild(tbtn("⚖ حكم نقض", function () {
      var t = (window.getSelection() + "") || "مبدأ حكم النقض…";
      ins('<div style="' + NAQD_CSS + '">' + escHtml(t) + '</div><p><br></p>');
    }));
    tb.appendChild(tbtn("🏷 عنوان قسم", function () {
      var t = (window.getSelection() + "") || "عنوان";
      ins('<h3 style="font-family:var(--f-title);font-size:16px;margin:10px 0 6px;color:#3a2411">' + escHtml(t) + '</h3>');
    }));
    tb.appendChild(tbtn("B", function () { document.execCommand("bold"); }));
    tb.appendChild(tbtn("U̲", function () { document.execCommand("underline"); }));
    tb.appendChild(tbtn("🧹 تنظيف", function () { document.execCommand("removeFormat"); }));
    win.appendChild(tb);

    var ed = el("div", "min-height:300px;border:1px solid var(--line,#ddd);border-radius:10px;" +
      "padding:14px;font-size:15px;line-height:2;direction:rtl;text-align:right;background:#fff");
    ed.setAttribute("contenteditable", "true");
    ed.innerHTML = doc.html || "<p><br></p>";
    win.appendChild(ed);

    var bar = el("div", "display:flex;gap:9px;flex-wrap:wrap;margin-top:12px");
    function ab(label, css, on) { var b = btn(label, css); b.style.flex = "1 1 46%"; b.onclick = on; return b; }
    bar.appendChild(ab("💾 حفظ", "border:0;background:var(--brand);color:#fff;font-weight:600", function () {
      doc.title = title.value.trim(); doc.html = ed.innerHTML; doc.updated = todayISO();
      patchCase(c.id, function (cc) {
        cc.docs = cc.docs || [];
        if (isNew) cc.docs.push(doc);
        else cc.docs[index] = doc;
      });
      c.docs = c.docs || []; if (isNew) c.docs.push(doc); else c.docs[index] = doc;
      win.remove(); if (refresh) refresh();
    }));
    bar.appendChild(ab("🖨 طباعة", "border:1px solid var(--line,#ddd);background:transparent;color:var(--brand)",
      function () { printDoc(c, { type: doc.type, title: title.value.trim(), html: ed.innerHTML }); }));
    bar.appendChild(ab("رجوع", "border:1px solid var(--line,#ddd);background:transparent;color:var(--muted)",
      function () { win.remove(); }));
    win.appendChild(bar);
    document.body.appendChild(win);
    setTimeout(function () { title.focus(); }, 60);
  }

  function printDoc(c, doc) {
    var win = el("div", "position:fixed;inset:0;background:#fff;color:#000;z-index:10061;overflow:auto;" +
      "padding:26px;direction:rtl;font-family:inherit");
    win.setAttribute("data-nosave", "1"); win.className = "print-overlay";
    (function () { var lh = w.Letterhead && Letterhead.htmlHeader && Letterhead.htmlHeader();
      if (lh) { win.appendChild(lh); return; }
      win.appendChild(el("div", "font-family:var(--f-title);font-size:15px;text-align:center;margin-bottom:4px",
        "مؤسسة المستشار حسن عبد المنعم — محامون ومستشارون قانونيون")); })();
    win.appendChild(el("div", "font-size:18px;font-family:var(--f-title);text-align:center;margin-bottom:4px",
      doc.type + (doc.title ? " — " + doc.title : "")));
    win.appendChild(el("div", "font-size:12.5px;text-align:center;color:#555;margin-bottom:16px",
      "في الدعوى رقم " + ar(c.caseNo || "—") + (c.caseYear ? " لسنة " + ar(c.caseYear) : "") +
      (c.courtName ? " — " + c.courtName : "")));
    var body = el("div", "font-size:15px;line-height:2.1"); body.innerHTML = doc.html || "";
    win.appendChild(body);
    var bar = el("div", "display:flex;gap:9px;margin-top:22px");
    bar.className = "noprint";
    var go = el("button", "flex:1;padding:14px;border:0;border-radius:11px;background:#5b3a21;color:#fff;" +
      "font-weight:600;font-family:inherit;font-size:15px;min-height:50px", "🖨 طباعة / حفظ PDF");
    go.type = "button"; go.onclick = function () {
      if (w.Share) Share.printOverlay(doc.type);
      else if (w.AndroidSaver && AndroidSaver.printPage) AndroidSaver.printPage(doc.type);
      else window.print();
    };
    var back = el("button", "flex:1;padding:14px;border:1px solid #ccc;border-radius:11px;background:transparent;" +
      "color:#333;font-family:inherit;font-size:15px;min-height:50px", "رجوع");
    back.type = "button"; back.onclick = function () { win.remove(); };
    bar.appendChild(go); bar.appendChild(back); win.appendChild(bar);
    document.body.appendChild(win);
  }

  function docsSection(c, box, refresh) {
    head(box, "📜 العرائض والمذكرات",
         "font-family:var(--f-title);font-size:15px;margin:18px 0 8px");
    var docs = c.docs || [];
    var nA = docs.filter(function (d) { return d.type === "عريضة"; }).length;
    var nM = docs.filter(function (d) { return d.type === "مذكرة"; }).length;
    box.appendChild(el("div", "font-size:12.5px;color:var(--muted);margin-bottom:8px",
      "عرائض: " + ar(nA) + " · مذكرات: " + ar(nM)));
    if (!docs.length) {
      box.appendChild(el("div", "color:var(--muted);font-size:13px;padding:4px 0", "لا مستندات بعد."));
    }
    docs.forEach(function (d, i) {
      var r = el("div", "display:flex;gap:8px;align-items:center;border:1px solid var(--line,#eee);" +
        "border-radius:9px;padding:9px 11px;margin-bottom:6px;cursor:pointer");
      var info = el("div", "flex:1;line-height:1.6");
      info.appendChild(el("div", "font-family:var(--f-title);font-size:13.5px",
        (d.type || "مستند") + (d.title ? " — " + d.title : " (بلا عنوان)")));
      if (d.updated) info.appendChild(el("div", "font-size:11.5px;color:var(--muted)",
        "آخر تعديل: " + ar(String(d.updated).replace(/-/g, "/"))));
      r.appendChild(info);
      var pr = el("button", "border:0;background:transparent;color:var(--brand);font-size:15px", "🖨");
      pr.type = "button"; pr.onclick = function (e) { e.stopPropagation(); printDoc(c, d); };
      r.appendChild(pr);
      var del = el("button", "border:0;background:transparent;color:#b3261e;font-size:14px", "🗑");
      del.type = "button"; del.onclick = function (e) {
        e.stopPropagation();
        Ask.confirm("حذف هذا المستند؟", { ok: "حذف" }, function () {
          patchCase(c.id, function (cc) { (cc.docs || []).splice(i, 1); });
          if (c.docs) c.docs.splice(i, 1);
          if (refresh) refresh();
        });
      };
      r.appendChild(del);
      r.onclick = function () { editDoc(c, i, d.type, refresh); };
      box.appendChild(r);
    });
    var addA = btn("＋ عريضة", "border:1px solid var(--brand);background:transparent;color:var(--brand)");
    addA.onclick = function () { editDoc(c, -1, "عريضة", refresh); };
    var addM = btn("＋ مذكرة", "border:1px solid var(--brand);background:transparent;color:var(--brand)");
    addM.onclick = function () { editDoc(c, -1, "مذكرة", refresh); };
    row(box, [addA, addM], "margin-top:4px");
  }


  /* --------------------------------------- §14هـ مواعيد استحقاق الأتعاب */

  function editFeeDue(c, refresh) {
    var sh = sheet(10018);
    head(sh.box, "ميعاد استحقاق أتعاب");
    var fDue  = field(sh.box, { k: "due", label: "تاريخ الاستحقاق", date: true }, "");
    var fAmt  = field(sh.box, { k: "amount", label: "المبلغ",
      note: "بالجنيه." }, "");
    var fDesc = field(sh.box, { k: "desc", label: "البيان",
      note: "مقدّم / قسط / أتعاب مرحلة…" }, "");
    var save = btn("حفظ", "border:0;background:var(--brand);color:#fff;font-weight:600");
    var cancel = btn("إلغاء",
      "border:1px solid var(--line,#ddd);background:transparent;color:var(--muted)");
    save.onclick = function () {
      var due = (fDue.value || "").trim();
      if (due && w.lawyerToISO) due = w.lawyerToISO(due) || due;
      var amount = (fAmt.value || "").trim();
      var desc = (fDesc.value || "").trim();
      if (!due && !amount && !desc) { sh.back.remove(); return; }
      patchCase(c.id, function (cc) {
        cc.feeSchedule = cc.feeSchedule || [];
        cc.feeSchedule.push({ due: due, amount: amount, desc: desc, paid: false });
      });
      c.feeSchedule = c.feeSchedule || [];
      c.feeSchedule.push({ due: due, amount: amount, desc: desc, paid: false });
      sh.back.remove();
      if (refresh) refresh();
    };
    cancel.onclick = function () { sh.back.remove(); };
    row(sh.box, [save, cancel], "margin-top:16px");
  }

  function feeScheduleSection(c, box, refresh) {
    if (!canSeeFees()) return;
    head(box, "💰 مواعيد استحقاق الأتعاب",
         "font-family:var(--f-title);font-size:15px;margin:18px 0 8px");
    var sch = c.feeSchedule || [];
    if (!sch.length) {
      box.appendChild(el("div", "color:var(--muted);font-size:13px;padding:4px 0",
        "لا مواعيد مجدولة."));
    }
    sch.forEach(function (m, idx) {
      var r = el("div", "display:flex;gap:8px;align-items:center;" +
        "border:1px solid var(--line,#eee);border-radius:9px;padding:8px 10px;margin-bottom:6px");
      var chk = document.createElement("input");
      chk.type = "checkbox"; chk.checked = !!m.paid;
      chk.style.cssText = "width:20px;height:20px;flex:0 0 auto";
      chk.onchange = function () {
        patchCase(c.id, function (cc) {
          if (cc.feeSchedule && cc.feeSchedule[idx]) cc.feeSchedule[idx].paid = chk.checked;
        });
        if (c.feeSchedule && c.feeSchedule[idx]) c.feeSchedule[idx].paid = chk.checked;
      };
      r.appendChild(chk);
      var info = el("div", "flex:1;line-height:1.6");
      info.appendChild(el("div", "font-family:var(--f-title);font-size:13.5px",
        (m.amount ? ar(m.amount) + " ج" : "") + (m.desc ? " · " + m.desc : "")));
      info.appendChild(el("div", "color:var(--muted);font-size:11.5px",
        "استحقاق: " + (m.due ? ar(String(m.due).replace(/-/g, "/")) : "—") +
        (m.paid ? " · تم السداد" : "")));
      r.appendChild(info);
      var del = document.createElement("button");
      del.type = "button"; del.textContent = "🗑";
      del.style.cssText = "border:0;background:transparent;color:#b3261e;font-size:14px";
      del.onclick = function () {
        Ask.confirm("حذف هذا الميعاد؟", { ok: "حذف" }, function () {
          patchCase(c.id, function (cc) { (cc.feeSchedule || []).splice(idx, 1); });
          if (c.feeSchedule) c.feeSchedule.splice(idx, 1);
          if (refresh) refresh();
        });
      };
      r.appendChild(del);
      box.appendChild(r);
    });
    var add = btn("＋ ميعاد استحقاق",
      "border:1px solid var(--brand);background:transparent;color:var(--brand)");
    add.onclick = function () { editFeeDue(c, refresh); };
    row(box, [add], "margin-top:4px");
  }

  /* --------------------------------------- §2 اتفاق الأتعاب (قيمة/نسبة) */

  /** أتعاب النسبة كمبلغ = النسبة × المبلغ المتنازع عليه. null لو ناقص أي منهم. */
  function pctFeeOf(c) {
    var la = function (t) { return String(t == null ? "" : t).replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x0660; }); };
    var pct = parseFloat(la(c.feePct).replace(/[^0-9.]/g, ""));
    var amt = w.Expenses ? Expenses.money(c.disputedAmount) : parseFloat(la(c.disputedAmount).replace(/[^0-9.]/g, ""));
    if (!(pct > 0) || !(amt > 0)) return null;
    return Math.round(amt * pct) / 100;
  }

  function editFeeAgreement(c, refresh) {
    var sh = sheet(10019);
    head(sh.box, "اتفاق الأتعاب");
    sh.box.appendChild(el("div",
      "font-size:12px;color:var(--muted);margin-bottom:8px;line-height:1.8",
      "الأتعاب لا تشمل الرسوم ولا المصروفات."));

    sh.box.appendChild(el("label",
      "display:block;font-family:var(--f-title);font-size:14px;margin:2px 0 5px;" +
      "color:var(--brand-dark)", "نوع الاتفاق"));
    var sel = document.createElement("select");
    sel.style.cssText = "width:100%;min-height:50px;font-size:18px;padding:11px 12px;" +
      "border:1px solid var(--line,#ddd);border-radius:9px;background:var(--card);" +
      "font-family:inherit;direction:rtl;text-align:right;margin-bottom:8px";
    ["قيمة", "نسبة"].forEach(function (v) {
      var o = document.createElement("option"); o.value = v; o.textContent = v; sel.appendChild(o);
    });
    sel.value = c.feeKind || "قيمة";
    sh.box.appendChild(sel);

    var body = el("div"); sh.box.appendChild(body);
    var inputs = {};
    function drawBody() {
      body.textContent = ""; inputs = {};
      if (sel.value === "نسبة") {
        inputs.feePct = field(body, { k: "feePct", label: "النسبة (%)" }, c.feePct);
        inputs.disputedAmount = field(body, { k: "disputedAmount",
          label: "المبلغ المتنازع عليه / المحكوم به (ج)" }, c.disputedAmount);
        var calc = el("div", "font-size:12.5px;color:var(--brand-dark);margin:2px 0 6px;line-height:1.8");
        body.appendChild(calc);
        var upd = function () {
          var f = pctFeeOf({ feePct: inputs.feePct.value, disputedAmount: inputs.disputedAmount.value });
          calc.textContent = f != null ? "الأتعاب المحسوبة: " + Expenses.fmt(f) + " ج"
            : "اكتب النسبة والمبلغ عشان تتحسب قيمة الأتعاب والمتبقي منها.";
        };
        inputs.feePct.addEventListener("input", upd);
        inputs.disputedAmount.addEventListener("input", upd);
        upd();
      } else {
        inputs.feeStart = field(body, { k: "feeStart", label: "الأتعاب المتفق عليها (ج)" }, c.feeStart);
      }
      inputs.payMethod = field(body, { k: "payMethod", label: "طريقة الأداء",
        options: ["", "نقدي", "عقد اتفاق"] }, c.payMethod);
      inputs.paySchedule = field(body, { k: "paySchedule", label: "شكل الدفعات", suggest: true },
        c.paySchedule);
      inputs.payDate = field(body, { k: "payDate", label: "تاريخ السداد", date: true }, c.payDate);
    }
    sel.onchange = drawBody;
    drawBody();

    var save = btn("حفظ", "border:0;background:var(--brand);color:#fff;font-weight:600");
    var cancel = btn("إلغاء",
      "border:1px solid var(--line,#ddd);background:transparent;color:var(--muted)");
    save.onclick = function () {
      var kind = sel.value;
      var vals = {
        feeKind: kind,
        feeStart: inputs.feeStart ? String(inputs.feeStart.value || "").trim() : (c.feeStart || ""),
        feePct: inputs.feePct ? String(inputs.feePct.value || "").trim() : (c.feePct || ""),
        disputedAmount: inputs.disputedAmount ? String(inputs.disputedAmount.value || "").trim() : (c.disputedAmount || ""),
        payMethod: String(inputs.payMethod.value || "").trim(),
        paySchedule: String(inputs.paySchedule.value || "").trim(),
        payDate: inputs.payDate.value || ""
      };
      if (vals.payDate && w.lawyerToISO) vals.payDate = w.lawyerToISO(vals.payDate) || vals.payDate;
      patchCase(c.id, function (cc) {
        cc.feeKind = vals.feeKind; cc.feeStart = vals.feeStart; cc.feePct = vals.feePct;
        cc.disputedAmount = vals.disputedAmount;
        cc.payMethod = vals.payMethod; cc.paySchedule = vals.paySchedule; cc.payDate = vals.payDate;
      });
      c.feeKind = vals.feeKind; c.feeStart = vals.feeStart; c.feePct = vals.feePct;
      c.disputedAmount = vals.disputedAmount;
      c.payMethod = vals.payMethod; c.paySchedule = vals.paySchedule; c.payDate = vals.payDate;
      sh.back.remove();
      if (refresh) refresh();
    };
    cancel.onclick = function () { sh.back.remove(); };
    row(sh.box, [save, cancel], "margin-top:16px");
  }


  /* --------------------------------------- §4 تنفيذ الأحكام (على مستوى الملف) */

  function editExecution(c, refresh) {
    var e = c.execution || {};
    var sh = sheet(10020);
    head(sh.box, "⚖ تنفيذ الأحكام");
    if (norm(c.status) !== norm("تنفيذ أحكام")) {
      sh.box.appendChild(el("div", "font-size:12.5px;color:#8a5a12;background:#fff4e0;" +
        "border:1px solid #e8cf9a;border-radius:9px;padding:9px 12px;margin-bottom:10px",
        "حالة الدعوى ليست «تنفيذ أحكام» — يمكنك الحفظ، لكن الشاشة عادةً لقضايا التنفيذ."));
    }

    sh.box.appendChild(el("label",
      "display:block;font-family:var(--f-title);font-size:14px;margin:2px 0 5px;" +
      "color:var(--brand-dark)", "طبيعة التنفيذ (تُقترح من نوع الدعوى)"));
    var sel = document.createElement("select");
    sel.style.cssText = "width:100%;min-height:50px;font-size:18px;padding:11px 12px;" +
      "border:1px solid var(--line,#ddd);border-radius:9px;background:var(--card);" +
      "font-family:inherit;direction:rtl;text-align:right;margin-bottom:8px";
    ["مدني", "جنائي"].forEach(function (v) {
      var o = document.createElement("option"); o.value = v; o.textContent = v; sel.appendChild(o);
    });
    sel.value = e.kind || (isCriminalType(c.caseType) ? "جنائي" : "مدني");
    sh.box.appendChild(sel);

    var body = el("div"); sh.box.appendChild(body);
    var inputs = {};
    function pairRow(defs) {
      var r = el("div", "display:flex;gap:9px;flex-wrap:wrap"); body.appendChild(r);
      defs.forEach(function (d) {
        var cell = el("div", d.full ? "flex:1 1 100%" : "flex:1 1 45%;min-width:150px");
        r.appendChild(cell);
        inputs[d.k] = field(cell, d, e[d.k]);
      });
    }
    function drawBody() {
      body.textContent = ""; inputs = {};
      if (sel.value === "جنائي") {
        pairRow([{ k: "accused", label: "المتهم", suggest: true },
                 { k: "accusedAddr", label: "عنوانه" }]);
        pairRow([{ k: "circuit", label: "الدائرة التي أصدرت الحكم", full: true }]);
        pairRow([{ k: "judgeDate", label: "تاريخ الحكم", date: true }]);
        pairRow([{ k: "hasrNo", label: "رقم الحصر" }, { k: "hasrYear", label: "لسنة" }]);
        pairRow([{ k: "crimKind", label: "نوعه", options: ["", "حبس", "غرامات"] }]);
        body.appendChild(el("div", "font-size:12.5px;color:var(--muted);margin:4px 0;line-height:1.9",
          "الدرجة: " + (c.courtLevel || "—") + " · الدعوى: " + (c.caseNo || "—") +
          (c.caseYear ? " لسنة " + c.caseYear : "") + " (للعرض)"));
      } else {
        pairRow([{ k: "claimant", label: "طالب التنفيذ", suggest: true },
                 { k: "debtor", label: "المنفَّذ ضده", suggest: true }]);
        pairRow([{ k: "debtorAddr", label: "عنوانه", full: true }]);
        pairRow([{ k: "dept", label: "إدارة التنفيذ", suggest: true },
                 { k: "section", label: "قسم التنفيذ", suggest: true }]);
        pairRow([{ k: "execNo", label: "رقم التنفيذ" },
                 { k: "execKind", label: "نوع التنفيذ", options: ["", "إلزام", "إخلاء", "بيوع"] }]);
        pairRow([{ k: "officer", label: "اسم محضر التنفيذ", full: true }]);
      }
      inputs.notes = field(body, { k: "notes", label: "ملاحظات التنفيذ", multi: true }, e.notes);
    }
    sel.onchange = drawBody;
    drawBody();

    var save = btn("حفظ", "border:0;background:var(--brand);color:#fff;font-weight:600");
    var cancel = btn("إلغاء",
      "border:1px solid var(--line,#ddd);background:transparent;color:var(--muted)");
    save.onclick = function () {
      var out = { kind: sel.value };
      Object.keys(inputs).forEach(function (k) {
        var v = inputs[k].value;
        out[k] = v == null ? "" : String(v).trim();
      });
      if (out.judgeDate && w.lawyerToISO) out.judgeDate = w.lawyerToISO(out.judgeDate) || out.judgeDate;
      patchCase(c.id, function (cc) { cc.execution = out; });
      c.execution = out;
      sh.back.remove();
      if (refresh) refresh();
    };
    cancel.onclick = function () { sh.back.remove(); };
    row(sh.box, [save, cancel], "margin-top:16px");
  }

  function executionSection(c, box, refresh) {
    head(box, "⚖ تنفيذ الأحكام",
         "font-family:var(--f-title);font-size:15px;margin:18px 0 8px");
    var e = c.execution;
    var has = e && (e.claimant || e.accused || e.execNo || e.hasrNo || e.notes);
    if (has) {
      var lines = ["الطبيعة: " + (e.kind || "—")];
      if (e.kind === "جنائي") {
        if (e.accused) lines.push("المتهم: " + e.accused);
        if (e.hasrNo) lines.push("حصر: " + ar(e.hasrNo) + (e.hasrYear ? "/" + ar(e.hasrYear) : ""));
        if (e.crimKind) lines.push(e.crimKind);
      } else {
        if (e.claimant) lines.push("طالب التنفيذ: " + e.claimant);
        if (e.execNo) lines.push("رقم التنفيذ: " + ar(e.execNo));
        if (e.execKind) lines.push(e.execKind);
      }
      box.appendChild(el("div", "font-size:13px;color:var(--text);line-height:1.9;margin-bottom:6px",
        lines.join(" · ")));
    } else {
      box.appendChild(el("div", "color:var(--muted);font-size:13px;padding:4px 0",
        "لا بيانات تنفيذ بعد."));
    }
    var b = btn(has ? "✎ تعديل بيانات التنفيذ" : "＋ بيانات التنفيذ",
      "border:1px solid var(--line,#ddd);background:transparent;color:var(--brand)");
    b.onclick = function () { editExecution(c, refresh); };
    row(box, [b], "margin-top:4px");
  }


  /* --------------------------------------- §1ح نموذج «عمل قانوني» المستقل */

  var WORKTYPES = ["إنذار", "محضر شرطة", "تسجيل عقاري", "تأسيس شركة", "استشارة قانونية",
    "توثيق عقد", "صحيفة على غير الخصوم", "شهر عقاري", "طلب أمر أداء", "إعلان قضائي"];

  /* عدّاد رقم الملف التلقائي: يبدأ ٢٠٧٠، وكل قيدٍ جديد يأخذ التالي لأعلى
     رقم ملف مسجَّل فعلياً — في القضايا وفي كل السجلات (فمثلاً محضر برقم
     يدويٍّ كبير يرفع بداية العدّ التالي تلقائياً). أي تعديل يدوي لرقم
     ملف بعينه يصير هو نفسه "أعلى رقم مسجَّل" فيُحسب عليه القيد التالي. */
  var FILE_NO_START = 2070;
  /* آخر رقم ملف حقيقي (المستخدم ١-١٠: «أخر رقم حقيقي مستخدم 2075»). السجلات
     المستوردة (البرنامج القديم old-/old2-، وبيان الجلسات ses-، والأجندة emt7c/emspt)
     فيها أرقام فوقه وهمية (أرقام صفوف) — ما تتحسبش في اقتراح الرقم الجديد. */
  var FILE_NO_REAL_LAST = 2075;
  var IMPORTED_ID = /^(old2?-|ses-|emt7c|emspt)/;
  function nextCaseFileNo() {
    var mx = Math.max(FILE_NO_START - 1, FILE_NO_REAL_LAST);
    function consider(v) {
      var n = parseInt(String(v || "").replace(/[٠-٩]/g, function (d) {
        return d.charCodeAt(0) - 0x0660; }).replace(/[^0-9]/g, ""), 10);
      if (isFinite(n) && n > mx) mx = n;
    }
    read().forEach(function (c) { if (!IMPORTED_ID.test(String(c.id || ""))) consider(c.fileNo); });
    try {
      var regs = JSON.parse(localStorage.getItem("proflawyer.regs.v1")) || {};
      Object.keys(regs).forEach(function (k) {
        (regs[k] || []).forEach(function (r) { if (r) consider(r.fileNo); });
      });
    } catch (e) { }
    return String(mx + 1);
  }

  function editLegalWork(caseId, refresh) {
    var list = read();
    var isNew = !caseId;
    var c = isNew ? { id: "lw" + Date.now().toString(36), fileType: "عمل",
                      fileNo: nextCaseFileNo(), dealYear: String(new Date().getFullYear()) }
                  : list.filter(function (x) { return x.id === caseId; })[0];
    if (!c) return;

    var s = sheet(10012);
    head(s.box, (isNew ? "عمل قانوني جديد" : "تعديل العمل القانوني"));

    var inputs = {};
    function pair(defs) {
      var r = el("div", "display:flex;gap:9px;flex-wrap:wrap"); s.box.appendChild(r);
      defs.forEach(function (d) {
        var cell = el("div", d.full ? "flex:1 1 100%" : "flex:1 1 45%;min-width:150px");
        r.appendChild(cell); inputs[d.k] = field(cell, d, c[d.k]);
      });
    }
    pair([{ k: "fileNo", label: "رقم الملف" }, { k: "dealYear", label: "سنة التعامل" }]);
    pair([{ k: "worktype", label: "نوع العمل القانوني", options: [""].concat(WORKTYPES) },
          { k: "entity", label: "الجهة", suggest: true }]);
    inputs.clients = partiesEditor(s.box, { k: "clients", label: "الموكلون", multi: true }, c.clients, { kind: "clients" });
    inputs.result = field(s.box, { k: "result", label: "ما تم في الملف", multi: true,
      note: "تطوّرات العمل وما أُنجز فيه." }, c.result);
    inputs.notes = field(s.box, { k: "notes", label: "ملاحظات", multi: true }, c.notes);

    var save = btn("حفظ", "border:0;background:var(--brand);color:#fff;font-weight:600");
    var cancel = btn("إلغاء", "border:1px solid var(--line,#ddd);background:transparent;color:var(--muted)");
    save.onclick = function () {
      c.fileType = "عمل";
      c.fileNo = (inputs.fileNo.value || "").trim();
      c.dealYear = (inputs.dealYear.value || "").trim();
      c.worktype = (inputs.worktype.value || "").trim();
      c.entity = (inputs.entity.value || "").trim();
      c.clients = inputs.clients.value ? inputs.clients.value() : (inputs.clients.get ? inputs.clients.get() : c.clients);
      c.result = (inputs.result.value || "").trim();
      c.notes = (inputs.notes.value || "").trim();
      if (c.entity && w.Lists) { try { Lists.add("entities", c.entity); } catch (e) {} }
      if (c.worktype && w.Lists) { try { Lists.add("worktypes", c.worktype); } catch (e) {} }
      if (isNew) list.push(c);
      if (!write(list, c.id)) return;
      forgetUsed();
      s.back.remove();
      if (refresh) refresh(c);
    };
    cancel.onclick = function () { s.back.remove(); };
    row(s.box, [save, cancel], "margin-top:16px");
  }

  function openLegalWork(caseId, onChange) {
    var c = read().filter(function (x) { return x.id === caseId; })[0];
    if (!c) return;
    var s = sheet(10011);
    var box = s.box;
    function refresh() { s.back.remove(); openLegalWork(caseId, onChange); }

    box.appendChild(el("div", "font-family:var(--f-title);font-size:18px;margin-bottom:4px",
      "عمل قانوني — " + (c.worktype || "")));

    var card = el("div", "border:1px solid var(--line,#eee);border-radius:11px;padding:11px 13px;margin-bottom:12px");
    var g = el("div", "display:flex;flex-wrap:wrap;gap:6px 18px;align-items:baseline");
    [["رقم الملف", ar(c.fileNo || "—")], ["سنة التعامل", ar(c.dealYear || "")],
     ["نوع العمل", c.worktype], ["الجهة", c.entity]].forEach(function (p) {
      if (!p[1]) return;
      var cell = el("div", "flex:0 1 auto;white-space:nowrap;font-size:13.5px;line-height:1.95");
      cell.appendChild(el("b", "font-family:var(--f-title);color:var(--brand-dark);margin-inline-end:6px", p[0]));
      cell.appendChild(document.createTextNode(String(p[1]))); g.appendChild(cell);
    });
    card.appendChild(g);
    box.appendChild(card);

    head(box, "الموكلون", "font-family:var(--f-title);font-size:15px;margin:8px 0 6px");
    clientsWithOffice(c).forEach(function (x) {
      box.appendChild(el("div", "font-size:13.5px;padding:5px 0;border-bottom:1px solid var(--line,#eee)",
        (x.officeNo ? "ر ت م " + ar(x.officeNo) + " — " : "") + x.name));
    });

    if (c.result) { head(box, "ما تم في الملف", "font-family:var(--f-title);font-size:15px;margin:12px 0 6px");
      box.appendChild(el("div", "font-size:13.5px;line-height:1.95;white-space:pre-wrap", c.result)); }
    if (c.notes) { head(box, "ملاحظات", "font-family:var(--f-title);font-size:15px;margin:12px 0 6px");
      box.appendChild(el("div", "font-size:13.5px;line-height:1.95;white-space:pre-wrap", c.notes)); }

    noteLogSection(c, box, refresh);
    docsSection(c, box, refresh);
    feesSection(c, box, refresh);

    var edit = btn("✎ تعديل", "border:0;background:var(--brand);color:#fff;font-weight:600");
    edit.onclick = function () { s.back.remove(); editLegalWork(caseId, function () { if (onChange) onChange(); openLegalWork(caseId, onChange); }); };
    var print = btn("🖨 طباعة", "border:1px solid var(--line,#ddd);background:transparent;color:var(--brand)");
    print.onclick = function () { printLegalWork(c); };
    row(box, [edit, print], "margin-top:20px");
    var del = btn("🗑 حذف", "border:1px solid #e3c9c6;background:transparent;color:#b3261e");
    del.onclick = function () {
      Ask.confirm("حذف هذا العمل القانوني نهائياً؟", { ok: "حذف" }, function () {
        if (!write(read().filter(function (x) { return x.id !== caseId; }))) return;
        s.back.remove(); if (onChange) onChange();
      });
    };
    var close = btn("إغلاق", "border:1px solid var(--line,#ddd);background:transparent;color:var(--muted)");
    close.onclick = function () { s.back.remove(); };
    row(box, [close, del], "margin-top:10px");
  }

  function printLegalWork(c) {
    var win = el("div", "position:fixed;inset:0;background:#fff;color:#000;z-index:10060;overflow:auto;" +
      "padding:24px;direction:rtl;font-family:inherit");
    win.setAttribute("data-nosave", "1"); win.className = "print-overlay";
    (function () { var lh = w.Letterhead && Letterhead.htmlHeader && Letterhead.htmlHeader();
      if (lh) { win.appendChild(lh); return; }
      win.appendChild(el("div", "font-family:var(--f-title);font-size:15px;text-align:center;margin-bottom:4px",
        "مؤسسة المستشار حسن عبد المنعم — محامون ومستشارون قانونيون")); })();
    win.appendChild(el("div", "font-size:18px;font-family:var(--f-title);text-align:center;margin-bottom:14px",
      "بيان عمل قانوني — " + (c.worktype || "")));
    var pairs = [
      ["رقم الملف", ar(c.fileNo || "—")], ["سنة التعامل", ar(c.dealYear || "")],
      ["نوع العمل القانوني", c.worktype], ["الجهة", c.entity],
      ["الموكل", clientsWithOffice(c).map(function (x) { return x.name + (x.cap ? " (" + x.cap + ")" : "") + (x.officeNo ? " — ر ت م " + ar(x.officeNo) : ""); }).join("، ")]
    ];
    var card = el("div", "border:1px solid #c9b48f;border-radius:11px;padding:12px 14px;margin-bottom:12px;" +
      "display:flex;flex-wrap:wrap;gap:6px 18px;font-size:13.5px;line-height:1.95");
    pairs.forEach(function (p) { if (!p[1]) return;
      var cell = el("div", "flex:0 1 auto;white-space:nowrap");
      cell.appendChild(el("b", "font-family:var(--f-title);margin-inline-end:6px", p[0]));
      cell.appendChild(document.createTextNode(String(p[1]))); card.appendChild(cell); });
    win.appendChild(card);
    if (c.result) { win.appendChild(el("div", "font-family:var(--f-title);font-size:14px;margin:8px 0 5px", "ما تم في الملف"));
      win.appendChild(el("div", "border:1px solid #c9b48f;border-radius:8px;padding:10px 12px;font-size:13.5px;line-height:2;white-space:pre-wrap", c.result)); }
    if (c.notes) win.appendChild(el("div", "font-size:12.5px;color:#555;margin-top:10px;white-space:pre-wrap", "ملاحظات: " + c.notes));

    var bar = el("div", "display:flex;gap:9px;margin-top:20px"); bar.className = "noprint";
    var go = el("button", "flex:1;padding:14px;border:0;border-radius:11px;background:#5b3a21;color:#fff;font-weight:600;font-family:inherit;font-size:15px;min-height:50px", "🖨 طباعة / حفظ PDF");
    go.type = "button"; go.onclick = function () { if (w.Share) Share.printOverlay("بيان عمل قانوني"); else if (w.AndroidSaver && AndroidSaver.printPage) AndroidSaver.printPage("بيان عمل قانوني"); else window.print(); };
    var pdf = el("button", "flex:1;padding:14px;border:1px solid #5b3a21;border-radius:11px;background:transparent;color:#5b3a21;font-weight:600;font-family:inherit;font-size:15px;min-height:50px", "📤 إرسال PDF");
    pdf.type = "button"; pdf.onclick = function () {
      if (!w.PdfDoc || !w.PdfBuild || !w.Share) { alert("غير متاح."); return; }
      var rows = pairs.filter(function (p) { return p[1]; }).map(function (p) { return [p[0], String(p[1])]; });
      if (c.result) rows.push(["ما تم في الملف", c.result]);
      PdfDoc.build([
        { center: "بيان عمل قانوني — " + (c.worktype || "") },
        { table: { headers: ["الحقل", "البيان"], widths: [1, 2.6], rows: rows } }]
      ).then(function (pages) {
        Share.sharePdf(PdfBuild.toBase64(PdfBuild.fromJpegs(pages)), "بيان-عمل-قانوني.pdf");
      });
    };
    var back = el("button", "flex:1;padding:14px;border:1px solid #ccc;border-radius:11px;background:transparent;color:#333;font-family:inherit;font-size:15px;min-height:50px", "رجوع");
    back.type = "button"; back.onclick = function () { win.remove(); };
    bar.appendChild(go); bar.appendChild(pdf); bar.appendChild(back); win.appendChild(bar);
    document.body.appendChild(win);
  }


  /* -------------------------------------------------------------- الطباعة */

  /* هامش صفر على مستوى صفحة الطباعة نفسها (CSS Paged Media) — هذا ما
     يتحكم فعلياً في هوامش PDF عبر محرك طباعة WebView (Chromium)، بصرف
     النظر عن PrintAttributes في MainActivity.java (تلك مجرد تلميح
     لإطار عمل الطباعة في أندرويد، ومحوّل WebView المدمج لا يلتزم بها
     دائماً). بلا @page، يضيف Chromium هوامشه الافتراضية (~1 بوصة) فوق
     أي تصميم مهما ضُبط padding العنصر نفسه. */
  var _printPageStyleAdded = false;
  function ensurePrintPageStyle() {
    if (_printPageStyleAdded) return;
    _printPageStyleAdded = true;
    var st = document.createElement("style");
    st.textContent = "@page { margin: 0; size: auto; }";
    document.head.appendChild(st);
  }

  function printCase(c) {
    ensurePrintPageStyle();
    var _old = document.getElementById("__printCase");   /* لا تُكرَّر النافذة */
    if (_old) _old.remove();
    var win = document.createElement("div");
    win.setAttribute("data-nosave", "1");
    win.id = "__printCase";
    win.className = "print-overlay";
    win.style.cssText = "position:fixed;inset:0;background:#6f685f;color:#000;z-index:10060;" +
                        "overflow:auto;padding:16px;direction:rtl;font-family:inherit";

    /* ورقة A4 للمعاينة قبل الطباعة (الجزء الذي يُطبع وحده) */
    var page = el("div", "background:#fff;max-width:800px;margin:0 auto;padding:1.5cm 26px 1.5cm;" +
      "box-shadow:0 4px 22px rgba(0,0,0,.4)");
    page.className = "print-page";
    win.appendChild(page);

    function line(t, css) { page.appendChild(el("div", css, t)); }

    var _lh = w.Letterhead && Letterhead.htmlHeader && Letterhead.htmlHeader();
    if (_lh) { _lh.style.marginBottom = "6px"; page.appendChild(_lh); }  /* مسافة صغيرة تحت الخط */
    else line("مؤسسة المستشار حسن عبد المنعم — محامون ومستشارون قانونيون",
         "font-family:var(--f-title);font-size:15px;text-align:center;margin-bottom:4px");
    line("👁 معاينة قبل الطباعة", "font-size:11px;color:#9a8a6a;text-align:center;margin-bottom:1px");
    line("ملف القضية", "font-size:19px;font-family:var(--f-title);text-align:center;" +
                       "margin-bottom:10px");

    /* بطاقات: شبكة من ٥ أعمدة — لكل حقلٍ مساحةٌ مقدَّرة، اسمه جنب بيانه،
       والبيان يتمدّد تلقائياً (يصغر خطُّه إن لزم) ليحتوي في سطرين/ثلاثة داخل
       مساحته. عنوان الحقل ١٤ والمحتوى ١٦ كحدٍّ أقصى ثم يتكيّف. الحقول الطويلة
       تأخذ أعمدةً أكثر. (p[2]: عدد الأعمدة، أو true = السطر كاملاً) */
    var _fitCells = [];
    function pcard(title, pairs) {
      var card = el("div", "border:1px solid #c9b48f;border-radius:11px;padding:12px 14px;" +
        "margin-bottom:12px;page-break-inside:avoid");
      if (title) card.appendChild(el("div", "font-family:var(--f-title);font-size:15px;" +
        "margin-bottom:8px;color:#3a2411;border-bottom:1px solid #e5d9bf;padding-bottom:5px", title));
      var g = el("div", "display:grid;grid-template-columns:repeat(5,1fr);gap:8px 12px");
      pairs.forEach(function (p) {
        if (p[1] == null || p[1] === "") return;
        var span = p[2] === true ? 5 : (typeof p[2] === "number" ? p[2] : 1);
        var cell = el("div", "grid-column:span " + span + ";min-width:0;overflow:hidden;" +
          "max-height:78px;border-bottom:1px dotted #e5d9bf;padding-bottom:2px");
        cell.appendChild(el("b",
          "font-family:var(--f-title);color:#3a2411;font-size:14px;margin-inline-end:5px", p[0] + ":"));
        var v = el("span", "font-size:16px;line-height:1.6;" +
          (p[3] === "nowrap" ? "white-space:nowrap" : "overflow-wrap:anywhere"), String(p[1]));
        cell.appendChild(v);
        g.appendChild(cell);
        _fitCells.push({ cell: cell, v: v });
      });
      card.appendChild(g);
      return card;
    }

    /* اسم كل طرفٍ مقروناً بصفته: «الاسم (الصفة)» */
    function partyList(str) {
      return splitParties(str || "").filter(function (p) { return p.name; })
        .map(function (p) { return p.name + (p.cap ? " (" + p.cap + ")" : ""); });
    }

    /* أُسرة الدعوى: الأصلية ثم المرتبطات (فرعية/منضمة) */
    var root = (typeof rootOf === "function" ? rootOf(c) : c) || c;
    var family = [root].concat(typeof linkedTo === "function" ? linkedTo(root) : []);
    var _fseen = {};
    family = family.filter(function (m) { if (!m || _fseen[m.id]) return false; _fseen[m.id] = 1; return true; });

    var dataPairs = [
      ["رقم الملف", ar(root.fileNo || "—")], ["سنة التعامل", ar(root.dealYear || "")],
      [caseNoLabel(root.courtLevel), ar(root.caseNo || "") + (root.caseYear ? " لسنة " + ar(root.caseYear) : ""), 2, "nowrap"],
      ["رقم الدعوى الابتدائية", appealHigher(root) && root.firstNo
        ? ar(root.firstNo) + (root.firstYear ? " لسنة " + ar(root.firstYear) : "") : "", 2, "nowrap"],
      ["درجة التقاضي", root.courtLevel + (appealHigher(root) ? higherLabel(root) : ""), 2],
      ["الطعن مرفوع", appealHigher(root) ? partyDirection(root) : ""],
      ["الحالة", root.status], ["نوع الدعوى", root.caseType, 2], ["المحامي", root.lawyer, 2],
      ["المحكمة", root.courtName, 3], ["الدائرة", root.circuit, 2],
      ["الموضوع", root.subject, true], ["ملاحظات", root.notes, true]
    ];
    if (isCriminalType(root.caseType)) {
      dataPairs.push(["الجناية/الجنحة", root.crimeNo ? ar(root.crimeNo) + (root.crimeYear ? " لسنة " + ar(root.crimeYear) : "") : "", 2, "nowrap"]);
      dataPairs.push([root.appealKind || "الاستئناف", root.appealNo ? ar(root.appealNo) + (root.appealYear ? " لسنة " + ar(root.appealYear) : "") : "", 2, "nowrap"]);
      dataPairs.push(["كلي رقم", root.totalNo ? ar(root.totalNo) + (root.totalYear ? " لسنة " + ar(root.totalYear) : "") : "", 2, "nowrap"]);
    }
    page.appendChild(pcard("بيانات الدعوى", dataPairs));

    /* بيانٌ مستقل لكل دعوى (الأصلية والمرتبطة) بأطرافها وصفاتهم داخل نفس الصفحة */
    var partyBlocks = [];   /* للـPDF */
    family.forEach(function (m) {
      var tag = m.linkedTo
        ? (m.kind === "منضمة" ? " (المنضم)" : m.kind === "فرعية" ? " (الفرعية)" : " (مرتبطة)")
        : (family.length > 1 ? " (الأصلية)" : "");
      var num = ar(m.caseNo || "—") + (m.caseYear ? " لسنة " + ar(m.caseYear) : "");
      var title = "في " + (m.courtLevel || "الدعوى") + " رقم " + num + tag +
        (m.subject ? " — " + m.subject : "");
      var cl = partyList(m.clients), op = partyList(m.opponents);
      if (!cl.length && !op.length) return;
      page.appendChild(pcard(title, [
        ["الموكلون", cl.join("  ·  "), true],
        ["الخصوم", op.join("  ·  "), true]
      ]));
      partyBlocks.push({ title: title, clients: cl.join("، "), opponents: op.join("، ") });
    });

    /* تتابع الجلسات: جدول — م · رول · تاريخ · نوع · ما تم بها · ملاحظة —
       مقسّم بحسب درجة التقاضي بنفس منطق شاشتَي التعديل والعرض. */
    var ss = sessions(root);
    var sessRows = [], sessGroups = [];
    if (ss.length) {
      var _multiG = sessionDegreeGroups(root).filter(function (x) { return x.rows.length; }).length > 1;
      if (!_multiG) line(degreeCategoryLabel(root.courtLevel), "font-family:var(--f-title);font-size:16px;margin:16px 0 8px");
      var noteDates = {};
      (root.noteLog || []).forEach(function (n) { if (n.date) noteDates[n.date] = 1; });
      var n = 0;
      sessionDegreeGroups(root).forEach(function (g) {
        if (!g.rows.length) return;
        if (g.label) {
          line(g.label, "font-family:var(--f-title);font-size:14px;margin:10px 0 5px;color:#5b3a21");
        }
        var _grp = { label: g.label || degreeCategoryLabel(root.courtLevel), rows: [] };
        sessGroups.push(_grp);
        var st = document.createElement("table");
        st.style.cssText = "width:100%;margin:0 auto;" +
          "border-collapse:collapse;table-layout:fixed";
        var cg = document.createElement("colgroup");
        ["5%", "8%", "16%", "17%", "46%", "8%"].forEach(function (wv) {
          var col = document.createElement("col"); col.style.width = wv; cg.appendChild(col);
        });
        st.appendChild(cg);
        var hr = st.insertRow();
        ["م", "رول", "تاريخ الجلسة", "نوع الجلسة", "ما تم بها من قرارات أو أحكام", "ملاحظة"].forEach(function (h) {
          var th = hr.insertCell(); th.textContent = h;
          th.style.cssText = "padding:7px;border:1px solid #c9b48f;background:#efe6d6;" +
            "font-family:var(--f-title);font-size:13px";
        });
        g.rows.forEach(function (sn) {
          n++;
          var raw = sn.raw || {};
          var done = resultOf(sn) || (reasonOf(sn) ? "التأجيل: " + reasonOf(sn) : "");
          var hasNote = noteDates[sn.date] ? "📝" : "";
          var cells = [ar(n), ar(raw.roll || ""), ar(String(sn.date).replace(/-/g, "/")),
            raw.type || "", done, hasNote];
          sessRows.push(cells); _grp.rows.push(cells);
          var r = st.insertRow();
          cells.forEach(function (v, ci) {
            var td = r.insertCell(); td.textContent = v;
            td.style.cssText = "padding:7px;border:1px solid #c9b48f;vertical-align:top;font-size:15px;" +
              (ci === 4 ? "text-align:right;white-space:pre-line;overflow-wrap:anywhere;"
                        : "text-align:center;") +
              "word-wrap:break-word";
          });
        });
        page.appendChild(st);
      });
    }

    var bar = el("div", "display:flex;gap:9px;margin-top:20px;flex-wrap:wrap");
    bar.className = "noprint";
    var reportName = "ملف القضية " + (ar(c.caseNo || "") || "");

    function mk(label, css, on) {
      var b = btn(label, css);
      b.style.flex = "1 1 46%";
      b.onclick = on;
      return b;
    }

    bar.appendChild(mk("🖨 طباعة", "border:0;background:#5b3a21;color:#fff;font-weight:600",
      function () {
        if (w.Share) Share.printOverlay(reportName);
        else if (w.AndroidSaver && AndroidSaver.printPage) AndroidSaver.printPage(reportName);
        else window.print();
      }));

    bar.appendChild(mk("📤 إرسال PDF",
      "border:1px solid #5b3a21;background:transparent;color:#5b3a21;font-weight:600",
      function () {
        if (!w.PdfBuild || !w.PdfDoc) { alert("بناء الـPDF غير متاح على هذا الجهاز."); return; }
        var valRows = dataPairs
          .filter(function (p) { return p[1] != null && p[1] !== ""; })
          .map(function (p) { return [p[0], String(p[1])]; });
        var blocks = [
          { center: "بيان الدعوى رقم " + ar(root.caseNo || "—") + (root.caseYear ? " لسنة " + ar(root.caseYear) : "") +
            (root.courtName ? " — " + root.courtName : "") },
          { table: { headers: ["الحقل", "البيان"], widths: [1, 2.6], rows: valRows } }
        ];
        /* بيانٌ مستقل لكل دعوى (الأصلية والمرتبطة) بأطرافها وصفاتهم */
        partyBlocks.forEach(function (pb) {
          var rows = [];
          if (pb.clients) rows.push(["الموكلون", pb.clients]);
          if (pb.opponents) rows.push(["الخصوم", pb.opponents]);
          if (rows.length) blocks.push({ h: pb.title },
            { table: { headers: ["الأطراف", "الأسماء والصفات"], widths: [1, 3.2], rows: rows } });
        });
        sessGroups.forEach(function (sg) {
          if (!sg.rows.length) return;
          blocks.push({ h: sg.label },
            { table: { headers: ["م", "رول", "تاريخ الجلسة", "نوع الجلسة", "ما تم بها من قرارات أو أحكام", "ملاحظة"],
              widths: [0.5, 0.7, 1.2, 1.3, 4, 0.6], rows: sg.rows } });
        });
        var _d = new Date(), _p2 = function (n) { return ("0" + n).slice(-2); };
        var _footer = "تاريخ الطباعة: " + ar(_d.getFullYear() + "/" + _p2(_d.getMonth() + 1) + "/" + _p2(_d.getDate()) + "  " + _p2(_d.getHours()) + ":" + _p2(_d.getMinutes())) + " — hamlf.com";
        PdfDoc.build(blocks, { footer: _footer }).then(function (pages) {
          var pdf = PdfBuild.fromJpegs(pages);
          if (!pdf) { alert("تعذّر بناء الـPDF."); return; }
          var b64 = PdfBuild.toBase64(pdf), fn = reportName + ".pdf";
          /* إرسال عبر واتساب/إيميل إن وُجد جسر المشاركة، وإلا حفظ الملف */
          if (w.Share && Share.sharePdf) Share.sharePdf(b64, fn);
          else if (w.AndroidSaver && AndroidSaver.save) AndroidSaver.save(fn, b64);
          else alert("تعذّرت المشاركة على هذا الجهاز.");
        }).catch(function (e) { alert("تعذّر بناء الـPDF: " + (e && e.message ? e.message : e)); });
      }));

    bar.appendChild(mk("📝 إرسال نصاً",
      "border:1px solid #ccc;background:transparent;color:#333",
      function () {
        if (w.Share) Share.shareText(caseReportText(c), { name: reportName, subject: reportName });
      }));

    bar.appendChild(mk("رجوع", "border:1px solid #ccc;background:transparent;color:#333",
      function () { win.remove(); }));

    win.appendChild(bar);
    document.body.appendChild(win);

    /* التمديد التلقائي: يُصغَّر خط البيان حتى يحتوي داخل مساحته المقدَّرة
       (سطران/ثلاثة) بلا تآكل، ويبقى ١٦ إن اتّسعت المساحة */
    _fitCells.forEach(function (o) {
      var size = 16, guard = 0;
      while ((o.cell.scrollHeight > o.cell.clientHeight + 1 ||
              o.cell.scrollWidth > o.cell.clientWidth + 1) && size > 9 && guard < 40) {
        size -= 0.5; o.v.style.fontSize = size + "px"; guard++;
      }
    });
  }

  /* -------------------------------------------------- تقرير الملف نصاً وصورةً

     النصّ للمشاركة عبر واتساب/الإيميل؛ والصور لبناء PDF بلا مكتبات. القضية
     المحدَّدة وحدها — لا قضايا المكتب. */

  function caseReportText(c) {
    var L = [];
    L.push("مؤسسة المستشار حسن عبد المنعم — محامون ومستشارون قانونيون");
    L.push("ملف القضية");
    L.push("");
    function add(k, v) { if (v) L.push(k + ": " + v); }
    add("رقم الملف بالمكتب", ar(c.fileNo || ""));
    add(caseNoLabel(c.courtLevel), ar(c.caseNo || "") + (c.caseYear ? " لسنة " + ar(c.caseYear) : ""));
    if (appealHigher(c) && c.firstNo) {
      add("رقم الدعوى الابتدائية", ar(c.firstNo) + (c.firstYear ? " لسنة " + ar(c.firstYear) : ""));
    }
    add("المحكمة", [c.courtName, c.circuit].filter(Boolean).join(" — "));
    add("درجة التقاضي", c.courtLevel + (appealHigher(c) ? higherLabel(c) : ""));
    if (appealHigher(c) && partyDirection(c)) add("الطعن مرفوع", partyDirection(c));
    add("نوع الدعوى", c.caseType);
    add("الموضوع", c.subject);
    add("الحالة", c.status);
    if (isCriminalType(c.caseType)) {
      add("الجناية / الجنحة", c.crimeNo
        ? ar(c.crimeNo) + (c.crimeYear ? " لسنة " + ar(c.crimeYear) : "") : "");
      add(c.appealKind || "الاستئناف", c.appealNo
        ? ar(c.appealNo) + (c.appealYear ? " لسنة " + ar(c.appealYear) : "") : "");
    }
    add("الموكلون", clientsWithOffice(c).map(function (x) {
      return x.name + (x.cap ? " (" + x.cap + ")" : "") + (x.officeNo ? " — ر ت م " + ar(x.officeNo) : "");
    }).join("  ·  "));
    add("الخصوم", c.opponents);
    add("المحامي", c.lawyer);
    add("ملاحظات", c.notes);

    var ss = sessionsDesc(c);
    if (ss.length) {
      L.push(""); L.push("— تتابع الجلسات —");
      ss.forEach(function (sn) {
        var parts = [ar(String(sn.date || "").replace(/-/g, "/"))];
        if (sn.raw && sn.raw.type) parts.push(sn.raw.type);
        if (resultOf(sn)) parts.push("القرار: " + resultOf(sn));
        if (reasonOf(sn)) parts.push("سبب التأجيل: " + reasonOf(sn));
        L.push("• " + parts.join(" — "));
      });
    }
    return L.join(String.fromCharCode(10));
  }

  /* §14د الفحص الذكي — ملف Markdown يجمع كل بيانات القضية للذكاء الاصطناعي. */
  function smartCheckText(c) {
    var NL = String.fromCharCode(10);
    var L = [caseReportText(c)];
    if ((c.noteLog || []).length) {
      L.push(""); L.push("## ملاحظات القضية");
      c.noteLog.forEach(function (n) {
        L.push("- [" + ar(String(n.date || "").replace(/-/g, "/")) + "] " + (n.text || ""));
      });
    }
    if (c.judgeDate || c.judgeType || c.appealPeriod) {
      L.push(""); L.push("## الحكم ومواعيد الطعن");
      if (c.judgeDate) L.push("- تاريخ الحكم: " + ar(String(c.judgeDate).replace(/-/g, "/")));
      if (c.judgeType) L.push("- نوع الحكم: " + c.judgeType);
      if (c.appealPeriod) L.push("- ميعاد الطعن: " + ar(c.appealPeriod) + " يوم");
    }
    var ids = [];
    try { ids = attIds(c); } catch (e) { ids = []; }
    if (ids.length) {
      L.push(""); L.push("## المرفقات المتاحة (" + ar(ids.length) + ")");
      L.push("- تُرفَق يدوياً لفحص مضمونها إن لزم.");
    }
    L.push(""); L.push("## المطلوب من الذكاء الاصطناعي");
    L.push("افحص المسار القانوني لهذه القضية، وطابقه بأحكام محكمة النقض ذات الصلة، " +
      "وبيّن هل المسار سليم أم يحتاج تعديلاً، واقترح أفضل وجه دفاع، ثم جهّز مذكرة " +
      "بأسلوب المكتب على القالب الرسمي.");
    return L.join(NL);
  }

  function smartCheckShow(c) {
    var txt = smartCheckText(c);
    var win = el("div", "position:fixed;inset:0;background:rgba(20,14,8,.62);z-index:10050;" +
      "display:flex;align-items:flex-end;justify-content:center");
    win.setAttribute("data-nosave", "1"); win.setAttribute("data-modal", "1");
    var box = el("div", "background:var(--card,#fff);border-radius:16px 16px 0 0;padding:16px 16px 24px;" +
      "width:100%;max-width:620px;direction:rtl;max-height:90vh;overflow-y:auto");
    head(box, "🔍 الفحص الذكي");
    box.appendChild(el("div", "font-size:12.5px;color:var(--muted);margin-bottom:8px;line-height:1.8",
      "ملف نصي جاهز للصقه في محادثة مع الذكاء الاصطناعي — أو أرسله."));
    var ta = document.createElement("textarea");
    ta.value = txt; ta.setAttribute("dir", "rtl");
    ta.style.cssText = "width:100%;min-height:280px;font-size:13px;padding:11px;border:1px solid var(--line,#ddd);" +
      "border-radius:10px;background:var(--bg,#f4ece0);font-family:inherit;direction:rtl;text-align:right;line-height:1.9";
    box.appendChild(ta);
    var bar = el("div", "display:flex;gap:8px;flex-wrap:wrap;margin-top:12px");
    function b(label, css, on) { var x = el("button", "flex:1 1 46%;min-height:48px;border-radius:11px;font-family:inherit;font-size:14px;" + css, label); x.type = "button"; x.onclick = on; return x; }
    bar.appendChild(b("📋 نسخ", "border:1px solid var(--brand);background:transparent;color:var(--brand)",
      function () {
        ta.select();
        try { document.execCommand("copy"); } catch (e) {}
        if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(function () {});
        alert("تم النسخ.");
      }));
    bar.appendChild(b("💾 حفظ ملف", "border:1px solid var(--line,#ddd);background:transparent;color:var(--brand)",
      function () {
        var name = "فحص-ذكي-" + (c.fileNo || "قضية") + ".md";
        if (w.Share && Share.saveFile && Share.b64Text) Share.saveFile(name, Share.b64Text(txt), "text/markdown");
        else alert("الحفظ غير متاح هنا.");
      }));
    bar.appendChild(b("📤 إرسال", "border:1px solid #25d366;background:transparent;color:#128c3e",
      function () { if (w.Share) Share.shareText(txt, { name: "فحص ذكي", subject: "فحص ذكي للقضية" }); }));
    bar.appendChild(b("رجوع", "border:1px solid var(--line,#ddd);background:transparent;color:var(--muted)",
      function () { win.remove(); }));
    box.appendChild(bar);
    win.appendChild(box);
    win.onclick = function (e) { if (e.target === win) win.remove(); };
    document.body.appendChild(win);
  }

  /** يرسم تقرير الملف على صفحات A4 (صور) لبناء PDF منها. */
  function caseReportPages(c) {
    var W = 1240, H = 1754, M = 70;         /* A4 بدقة ~١٥٠ */
    var pages = [], cv, cx, y;

    function newPage() {
      cv = document.createElement("canvas");
      cv.width = W; cv.height = H;
      cx = cv.getContext("2d");
      cx.fillStyle = "#fff"; cx.fillRect(0, 0, W, H);
      cx.direction = "rtl";
      cx.textAlign = "right";
      cx.textBaseline = "top";
      cx.fillStyle = "#1a120a";
      y = M;
    }
    function push() { pages.push(cv.toDataURL("image/jpeg", 0.9)); }
    function ensure(h) { if (y + h > H - M) { push(); newPage(); } }

    /** يكتب نصاً ملتفّاً ويعيد الارتفاع المستهلك. */
    function text(str, size, color, lh) {
      cx.font = (size || 26) + "px 'Segoe UI', Tahoma, sans-serif";
      cx.fillStyle = color || "#1a120a";
      lh = lh || (size || 26) + 12;
      var maxW = W - M * 2, words = String(str).split(/\s+/), line = "";
      words.forEach(function (wd) {
        var t = line ? line + " " + wd : wd;
        if (cx.measureText(t).width > maxW && line) {
          ensure(lh); cx.fillText(line, W - M, y); y += lh; line = wd;
        } else line = t;
      });
      if (line) { ensure(lh); cx.fillText(line, W - M, y); y += lh; }
    }
    function rule() {
      ensure(20); cx.strokeStyle = "#d9cbb6"; cx.beginPath();
      cx.moveTo(M, y + 4); cx.lineTo(W - M, y + 4); cx.stroke(); y += 20;
    }

    newPage();
    cx.textAlign = "center";
    cx.fillStyle = "#5b3a21";
    cx.font = "26px 'Segoe UI', Tahoma, sans-serif";
    cx.fillText("مؤسسة المستشار حسن عبد المنعم — محامون ومستشارون قانونيون", W / 2, y);
    y += 40;
    cx.font = "40px 'Segoe UI', Tahoma, sans-serif";
    cx.fillStyle = "#1a120a";
    cx.fillText("ملف القضية", W / 2, y);
    y += 60;
    cx.textAlign = "right";

    function pair(k, v) {
      if (!v) return;
      text(k, 22, "#8a6d3b", 30);
      text(v, 28, "#1a120a", 40);
    }
    pair("رقم الملف بالمكتب", ar(c.fileNo || ""));
    pair(caseNoLabel(c.courtLevel), ar(c.caseNo || "") + (c.caseYear ? " لسنة " + ar(c.caseYear) : ""));
    if (appealHigher(c) && c.firstNo) {
      pair("رقم الدعوى الابتدائية", ar(c.firstNo) + (c.firstYear ? " لسنة " + ar(c.firstYear) : ""));
    }
    pair("المحكمة", [c.courtName, c.circuit].filter(Boolean).join(" — "));
    pair("درجة التقاضي", c.courtLevel + (appealHigher(c) ? higherLabel(c) : ""));
    if (appealHigher(c) && partyDirection(c)) pair("الطعن مرفوع", partyDirection(c));
    pair("نوع الدعوى", c.caseType);
    pair("الموضوع", c.subject);
    pair("الحالة", c.status);
    if (isCriminalType(c.caseType)) {
      pair("الجناية / الجنحة", c.crimeNo
        ? ar(c.crimeNo) + (c.crimeYear ? " لسنة " + ar(c.crimeYear) : "") : "");
      pair(c.appealKind || "الاستئناف", c.appealNo
        ? ar(c.appealNo) + (c.appealYear ? " لسنة " + ar(c.appealYear) : "") : "");
    }
    pair("الموكلون", clientsWithOffice(c).map(function (x) {
      return x.name + (x.cap ? " (" + x.cap + ")" : "") + (x.officeNo ? " — ر ت م " + ar(x.officeNo) : "");
    }).join("  ·  "));
    pair("الخصوم", c.opponents);
    pair("المحامي", c.lawyer);
    pair("ملاحظات", c.notes);

    var ss = sessionsDesc(c);
    if (ss.length) {
      y += 14; rule();
      text("تتابع الجلسات", 32, "#5b3a21", 46);
      ss.forEach(function (sn) {
        var head = ar(String(sn.date || "").replace(/-/g, "/")) +
                   (sn.raw && sn.raw.type ? " — " + sn.raw.type : "");
        text(head, 26, "#3d2614", 36);
        text("القرار: " + (resultOf(sn) || "—"), 24, "#1a120a", 34);
        if (reasonOf(sn)) text("سبب التأجيل: " + reasonOf(sn), 22, "#8a6d3b", 30);
        y += 8;
      });
    }
    push();
    return pages;
  }

  /* ======================= منظومة ألوان القضايا — قواعد تقويم الجلسات (١٠–١٦)
     اللون محسوب لا مخزَّن: حالة الدعوى + الدرجة + ميعاد الطعن. الأولوية:
     منتهية (رمادي) تَجُبّ كل شيء ← الأصفر (حكم وميعاده سارٍ — فقط لو المحامي
     سجّل تاريخ الحكم وميعاد الطعن بنفسه، القاعدة ١٤) ← باقي الحالات؛ والبينك
     (جنايات وطعون عليا) بديل الأزرق لا حالة فوقه. نفس الألوان حرفياً. */
  var CASE_COLORS = {
    blue:   { hex: "#2563EB", bg: "#dbeafe", fg: "#1d4ed8", name: "متداولة" },
    green:  { hex: "#16A34A", bg: "#dcfce7", fg: "#15803d", name: "أمام الخبراء" },
    red:    { hex: "#DC2626", bg: "#fee2e2", fg: "#b91c1c", name: "محجوزة للحكم" },
    yellow: { hex: "#CA9A04", bg: "#fef9c3", fg: "#a16207", name: "حكم والطعن سارٍ" },
    grey:   { hex: "#6B7280", bg: "#f3f4f6", fg: "#4b5563", name: "منتهية" },
    pink:   { hex: "#DB2777", bg: "#fce7f3", fg: "#be185d", name: "جنايات وطعون عليا" },
    orange: { hex: "#EA580C", bg: "#ffedd5", fg: "#c2410c", name: "شطب" },
    purple: { hex: "#7C3AED", bg: "#ede9fe", fg: "#6d28d9", name: "وقف جزائي" },
    cyan:   { hex: "#0891B2", bg: "#cffafe", fg: "#0e7490", name: "وقف تعليقي" }
  };
  /** أيام متبقية لميعاد الطعن — من اللي سجّله المحامي بس (appealPeriod)، بلا تقدير. */
  function appealLeftExplicit(c) {
    if (!c.judgeDate || !c.appealPeriod) return null;
    var A = appealCalc(c);
    return A && A.explicit ? A.left : null;
  }
  /** وقف تعليقي ولا جزائي: من آخر قرار مسجَّل فيه كلمة «وقف». */
  /* قاعدة الألوان (تقويم الجلسات ١٠–١٦) بتتحسب من حالة الدعوى. الحالة «متداولة/جديدة/فاضية» معناها
     إن محدش حدّدها بإيده، فبتتاخد من آخر قرار في آخر جلسة: حجز للحكم ← محجوزة للحكم (أحمر)، شطب ← شطب
     (برتقالي)، وقف ← وقف (بنفسجي/سماوي)، خبير ← أمام الخبراء (أخضر)، وغير كده متداولة (أزرق).
     الحالة المكتوبة باليد (منتهية، محجوزة للحكم، تنفيذ أحكام…) ما بتتلمسش. */
  var AUTO_STATUS = { "": 1, "متداولة": 1, "جديدة": 1 };
  function sessionsByDate(c) {
    return (c.sessions || []).filter(function (s) { return s && s.date; })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  }
  function decisionStatus(c) {
    var ss = sessionsByDate(c).filter(function (s) { return resultOf(s); });
    var s = ss[ss.length - 1]; if (!s) return "";
    var T = norm(resultOf(s) + " " + reasonOf(s));
    if (containsAny(T, ["حجز للحكم", "حجزت للحكم", "محجوزة للحكم", "للنطق بالحكم", "حجز الدعوى للحكم", "حجز الاستئناف للحكم",
                        "حجز الطعن للحكم", "مد اجل الحكم", "مد اجل النطق"])) return "محجوزة للحكم";
    if (/شطب/.test(T) && !/تجديد|جدد/.test(T)) return "شطب";
    if (/وقف/.test(T) && !/وقف (ال)?تنفيذ|وقف (ال)?نفاذ|وقف السير في اجراءات التنفيذ/.test(T)) return "وقف";
    if (/خبير|الخبراء|ندب/.test(T) && !/تعقيب|مناقشه/.test(T)) return "خبير";
    return "متداولة";
  }
  function effectiveStatus(c) {
    var st = String(c.status || "").trim();
    if (AUTO_STATUS[st] || c.statusAuto) return decisionStatus(c) || st || "متداولة";
    return st;
  }
  function stayKind(c) {
    var ss = sessionsByDate(c).reverse();
    for (var i = 0; i < ss.length; i++) {
      var t = norm(resultOf(ss[i]) || "");
      if (/وقف/.test(t)) return /تعليق/.test(t) ? "تعليقي" : "جزائي";
    }
    return /تعليق/.test(norm(c.stayKind || "")) ? "تعليقي" : "جزائي";
  }
  function caseColor(c) {
    var st = effectiveStatus(c) || "متداولة";
    var k, t;
    if (c.finished || st === "منتهية" || st === "محفوظة") { k = "grey"; t = st === "محفوظة" ? "محفوظة" : "منتهية"; }
    else {
      var left = st === "مستأنفة" ? null : appealLeftExplicit(c);   /* الطعن اتاخد ← العدّاد وقف */
      if (left !== null && left >= 0) { k = "yellow"; t = "صدر الحكم — باقٍ " + ar(left) + " يوم للطعن"; }
      else if (st === "خبير") { k = "green"; t = "أمام الخبراء"; }
      else if (st === "محجوزة للحكم") { k = "red"; t = "محجوزة للحكم"; }
      else if (st === "شطب") { k = "orange"; t = "شطب"; }
      else if (st === "وقف") { var sk = stayKind(c); k = sk === "تعليقي" ? "cyan" : "purple"; t = "وقف " + sk; }
      else {
        var hi = /نقض|اداريه عليا|دستوري/.test(norm(c.courtLevel || ""));
        var jin = /جناي/.test(norm((c.caseType || "") + " " + (c.subject || "") + " " + (c.circuit || "")));
        if (hi || jin) { k = "pink"; t = hi ? "طعن أعلى" + (partyDirection(c) ? " — مرفوع " + partyDirection(c) : "") : "جنايات"; }
        else { k = "blue"; t = st; }
      }
    }
    var col = CASE_COLORS[k];
    return { k: k, hex: col.hex, bg: col.bg, fg: col.fg, text: t };
  }


  /* ======================================== دمج القضايا المكررة (طلب المستخدم ٣٠-٩)
     نفس القضية متسجّلة مرتين (غالباً مرة من البرنامج القديم ومرة من الجديد)
     فبتطلع مكررة في تقرير الشهر والتقويم. القواعد:
     - الدرجة من صفة الأطراف: مدعي/مدعى عليه = أول درجة · مستأنف/مستأنف ضده =
       استئناف · طاعن/مطعون ضده = نقض (وإلا من حقل الدرجة).
     - الهوية (قواعد تقويم الجلسات ٢٧–٢٩): رقم الدعوى الخاص بالسجل + سنته
       متطابقين، أو واحد من غير رقم دعوى ورقم الملف متطابق. رقم دعوى مختلف =
       مرحلة تانية أو طعن متقابل ← ما يتدمجش أبداً. لا دمج بالمحكمة وحدها.
     - الأطراف: موكل مشترك على الأقل (الاسم الأقصر بادئة للأطول، بحد أدنى
       كلمتين)، والخصوم ما يتعارضوش لو مكتوبين في الاتنين.
     - نفس الدرجة (أو واحد منهم مش معروفة درجته).
     الباقي: السجل صاحب آخر جلسة؛ والجلسات تتجمع بلا تكرار، والفاضي يتملي من
     التاني، والمرفقات والروابط تتنقل عليه، وملاحظة مؤرخة بالدمج. */
  function dupNum(v) { return la(norm(v)).replace(/\D/g, "").replace(/^0+/, ""); }
  function dupYr(v) { var d = dupNum(v); return d.length === 2 ? "20" + d : d; }
  function dupParties(txt) {
    return String(txt || "").split(/\s*·\s*/).map(function (p) {
      var m = /\(([^)]*)\)/.exec(p);
      /* «الاسم – الصفة» أو «الاسم - الصفة»: الصفة بعد الشَّرطة مش جزء من الاسم */
      var dash = /\s[-–]\s*(.+)$/.exec(p.replace(/\([^)]*\)/g, ""));
      var nm0 = p.replace(/\([^)]*\)/g, "").replace(/\s[-–]\s*.+$/, "").replace(/^\s*[0-9٠-٩]+\s*[.\-)]\s*/, "");
      return { name: norm(nm0), cap: norm(m ? m[1] : (dash ? dash[1] : "")) };
    }).filter(function (x) { return x.name; });
  }
  function capDegree(c) {
    /* «مدعي بالحق المدني / مدعي مدني» موجودة في الجنح أول درجة وفي الاستئناف ← ما تحددش درجة */
    var caps = dupParties(c.clients).concat(dupParties(c.opponents)).map(function (p) {
      return p.cap.replace(/مدعي?\s*(بالحق)?\s*المدني|مدعي?\s*مدني/g, "");
    }).join(" ") + " ";
    if (/طاعن|مطعون/.test(caps)) return "نقض";
    if (/مستانف/.test(caps)) return "استئناف";
    if (/مدعي|مدعى|مدع /.test(caps)) return "أول درجة";
    var lv = norm(c.courtLevel || "");
    if (/نقض/.test(lv)) return "نقض";
    if (/استئناف|استيناف|استانف/.test(lv)) return "استئناف";
    if (/ابتدا[ئي]|جز[ئي]|كليه/.test(lv)) return "أول درجة";
    return "";
  }
  function dupNamesMatch(a, b) {
    var wa = a.split(" "), wb = b.split(" "), n = Math.min(wa.length, wb.length);
    if (n < 2) return false;
    for (var i = 0; i < n; i++) if (wa[i] !== wb[i]) return false;
    return true;
  }
  function dupPartiesOk(a, b) {
    var ca = dupParties(a.clients), cb = dupParties(b.clients);
    if (!ca.some(function (x) { return cb.some(function (y) { return dupNamesMatch(x.name, y.name); }); })) return false;
    var notPros = function (x) { return !/نيابه/.test(x.name); };
    var oa = dupParties(a.opponents).filter(notPros), ob = dupParties(b.opponents).filter(notPros);
    if (oa.length && ob.length && !oa.some(function (x) { return ob.some(function (y) { return dupNamesMatch(x.name, y.name); }); })) return false;
    return true;
  }
  /** درجة المحكمة من اسمها (لو واضحة) */
  function courtDegree(c) {
    var n = norm(c.courtName || "");
    if (/نقض/.test(n)) return "نقض";
    if (/استئناف|استيناف|مامور|دار القضاء/.test(n)) return "استئناف";
    if (/جز[ئي]يه|ابتدا[ئي]يه|كليه/.test(n)) return "أول درجة";
    return "";
  }
  /* المحكمتين نفس المحكمة؟ بعد شيل الكلمات العامة لازم يشتركوا في كلمة مميزة
     (بورسعيد · حلوان · الزيتون...). لو واحدة مش مكتوبة أو كلها كلمات عامة ← مش حاكمين. */
  var COURT_GENERIC = /^(محكمه|المحكمه|محاكم|مجمع|الجزييه|جزييه|الجزئيه|جزئيه|الابتداييه|ابتداييه|الابتدائيه|ابتدائيه|الكليه|كليه|و|ج|س|ش|ق|لدوائر|دوائر|الدائره|دائره|ماموريه|استيناف|الاستيناف|استئناف|العالي|دار|القضاء|القاهره|الجيزه|الاسره|اسره|family|court|-|–)$/;
  function courtTokens(c) {
    return norm(c.courtName || "").replace(/[()\-–,،.]/g, " ").split(" ").filter(function (t) { return t && !COURT_GENERIC.test(t); })
      .map(function (t) { return t.length > 4 ? t.replace(/^ال/, "") : t; });   /* «الزنانيري» = «زنانيري» */
  }
  function courtsAgree(a, b) {
    var na = norm(a.courtName || ""), nb = norm(b.courtName || "");
    if (!na || !nb) return true;                       /* محكمة مش مكتوبة في واحد منهم */
    var ta = courtTokens(a), tb = courtTokens(b);
    if (!ta.length && !tb.length) return true;
    if (!ta.length || !tb.length) {                    /* واحد اسمه كله كلام عام ← لازم الدرجة معروفة ومتطابقة */
      var da = courtDegree(a), db = courtDegree(b);
      return !!da && da === db;
    }
    return ta.some(function (t) { return tb.indexOf(t) >= 0; });
  }
  /** الخصوم مكتوبين في الاتنين ومشتركين في اسم (غير النيابة) — للقاعدة التالتة */
  function dupOpponentsMatch(a, b) {
    var notPros = function (x) { return !/نيابه/.test(x.name); };
    var oa = dupParties(a.opponents).filter(notPros), ob = dupParties(b.opponents).filter(notPros);
    if (!oa.length || !ob.length) return false;
    return oa.some(function (x) { return ob.some(function (y) { return dupNamesMatch(x.name, y.name); }); });
  }
  function dupOwnKey(c) { var n = dupNum(c.caseNo); return n ? n + "/" + dupYr(c.caseYear) : ""; }
  function lastDateOf(c) {
    return (c.sessions || []).reduce(function (m, s) { return s && s.date > m ? s.date : m; }, "");
  }
  function dupGroups(list) {
    var parent = list.map(function (_, i) { return i; });
    function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
    var why = {}, review = {};
    function tryPair(i, j, reason) {
      var a = list[i], b = list[j];
      if (a.fileType === "عمل" || b.fileType === "عمل") return;
      var da = capDegree(a), db = capDegree(b);
      if (da && db && da !== db) return;
      if (!dupPartiesOk(a, b)) return;
      /* المحكمتين درجتين مختلفتين (استئناف قصاد جزئي مثلاً) ← ممكن مرحلتين: للمراجعة مش دمج تلقائي */
      var ca = courtDegree(a), cb = courtDegree(b);
      if ((ca && cb && ca !== cb) || !courtsAgree(a, b)) { (review[i + "|" + j] = { a: a, b: b, reason: reason }); return; }
      var ri = find(i), rj = find(j);
      if (ri !== rj) parent[rj] = ri;
      why[i] = why[i] || {}; why[i][reason] = 1; why[j] = why[j] || {}; why[j][reason] = 1;
    }
    var byOwn = {}, byFile = {};
    list.forEach(function (c, i) {
      var o = dupOwnKey(c); if (o) (byOwn[o] = byOwn[o] || []).push(i);
      var f = dupNum(c.fileNo); if (f) (byFile[f] = byFile[f] || []).push(i);
    });
    Object.keys(byOwn).forEach(function (k) {
      var ix = byOwn[k];
      for (var x = 0; x < ix.length; x++) for (var y = x + 1; y < ix.length; y++) tryPair(ix[x], ix[y], "رقم الدعوى " + k);
    });
    Object.keys(byFile).forEach(function (k) {
      var ix = byFile[k];
      for (var x = 0; x < ix.length; x++) for (var y = x + 1; y < ix.length; y++) {
        if (dupOwnKey(list[ix[x]]) && dupOwnKey(list[ix[y]])) continue;
        tryPair(ix[x], ix[y], "رقم الملف " + k);
      }
    });
    /* القاعدة التالتة (طلب المستخدم ٣٠-٩): سجل من غير رقم دعوى + يوم جلسة مشترك
       + نفس الموكل + الخصم مكتوب في الاتنين ومتطابق (+ المحكمة والدرجة من
       tryPair). أرقام الملفات ممكن تختلف — دي نفس القضية اتسجّلت مرتين. */
    var byDay = {};
    list.forEach(function (c, i) {
      if (c.fileType === "عمل") return;
      var cl = dupParties(c.clients)[0];
      if (!cl) return;
      var k2 = cl.name.split(" ").slice(0, 2).join(" ");
      (c.sessions || []).forEach(function (s0) {
        if (!s0 || !s0.date) return;
        var key = s0.date + "|" + k2;
        var arr = byDay[key] || (byDay[key] = []);
        if (arr.indexOf(i) < 0) arr.push(i);
      });
    });
    Object.keys(byDay).forEach(function (k) {
      var ix = byDay[k];
      for (var x = 0; x < ix.length; x++) for (var y = x + 1; y < ix.length; y++) {
        var a = list[ix[x]], b = list[ix[y]];
        if (!!dupOwnKey(a) === !!dupOwnKey(b)) continue;       /* واحد بس من غير رقم دعوى */
        if (!dupOpponentsMatch(a, b)) continue;
        tryPair(ix[x], ix[y], "جلسة " + k.split("|")[0] + " لنفس الموكل والخصم (سجل من غير رقم دعوى)");
      }
    });
    var groups = {};
    list.forEach(function (c, i) { var r = find(i); (groups[r] = groups[r] || []).push(i); });
    dupGroups.review = Object.keys(review).map(function (k) { return review[k]; });
    return Object.keys(groups).map(function (r) { return groups[r]; }).filter(function (g) { return g.length > 1; })
      .map(function (g) {
        var reasons = {};
        g.forEach(function (i) { Object.keys(why[i] || {}).forEach(function (k) { reasons[k] = 1; }); });
        return { idx: g, why: Object.keys(reasons) };
      });
  }
  /** السجل اللي يفضل: صاحب آخر جلسة، ثم الأكتر جلسات، ثم اللي ليه رقم ملف. */
  function dupPickKeep(recs) {
    return recs.slice().sort(function (a, b) {
      var la2 = lastDateOf(a), lb = lastDateOf(b);
      if (la2 !== lb) return la2 < lb ? 1 : -1;
      var sa = (a.sessions || []).length, sb = (b.sessions || []).length;
      if (sa !== sb) return sb - sa;
      return (String(b.fileNo || "").trim() ? 1 : 0) - (String(a.fileNo || "").trim() ? 1 : 0);
    })[0];
  }
  function dupBlank(v) { return v == null || v === "" || (Array.isArray(v) && !v.length); }
  var DEG_LEVEL = { "استئناف": "استئناف عالي", "نقض": "نقض" };
  function dupMergeInto(keep, others) {
    var notes = [];
    others.forEach(function (o) {
      /* الجلسات: اتحاد بالتاريخ؛ نفس التاريخ ← الفاضي يتملي من التاني */
      var byDate = {};
      (keep.sessions || []).forEach(function (s) { if (s && s.date) byDate[s.date] = s; });
      (o.sessions || []).forEach(function (s) {
        if (!s || !s.date) return;
        var k = byDate[s.date];
        if (!k) { (keep.sessions = keep.sessions || []).push(s); byDate[s.date] = s; return; }
        var kr = k.raw || (k.raw = {}), orw = s.raw || {};
        Object.keys(orw).forEach(function (f) { if (dupBlank(kr[f]) && !dupBlank(orw[f])) kr[f] = orw[f]; });
        Object.keys(s).forEach(function (f) { if (f !== "raw" && dupBlank(k[f]) && !dupBlank(s[f])) k[f] = s[f]; });
      });
      keep.sessions = (keep.sessions || []).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
      /* القوائم: اتحاد */
      ["clientUids", "collabEmails", "autoTaskKeys"].forEach(function (f) {
        if (!Array.isArray(o[f])) return;
        keep[f] = (keep[f] || []).concat(o[f].filter(function (x) { return (keep[f] || []).indexOf(x) < 0; }));
      });
      ["adminTasks", "noteLog"].forEach(function (f) {
        if (!Array.isArray(o[f]) || !o[f].length) return;
        var seen = {};
        (keep[f] || []).forEach(function (x) { seen[JSON.stringify(x)] = 1; });
        keep[f] = (keep[f] || []).concat(o[f].filter(function (x) { return !seen[JSON.stringify(x)]; }));
      });
      /* باقي الحقول: الفاضي يتملي */
      Object.keys(o).forEach(function (f) {
        if (f === "id" || f === "sessions" || f === "__owner" || f === "fileNo" || f === "courtLevel" || f === "status" || f === "finished") return;
        if (Array.isArray(o[f])) return;
        if (dupBlank(keep[f]) && !dupBlank(o[f])) keep[f] = o[f];
      });
      /* رقم الدعوى التاني ما يضيعش (نفس القضية متسجّلة برقم أول درجة ورقم استئناف —
         ٨ و٩ في تقرير أكتوبر، ملف ١٩٣٩): رقم أول درجة ← «رقم الدعوى الابتدائية»،
         وأي رقم تاني ← ملاحظة */
      var kn = dupNum(keep.caseNo), on = dupNum(o.caseNo);
      if (on && on !== kn) {
        var oDeg = capDegree(o), kDeg = capDegree(keep);
        if (!dupNum(keep.firstNo) && oDeg === "أول درجة" && kDeg && kDeg !== "أول درجة") {
          keep.firstNo = o.caseNo; keep.firstYear = o.caseYear || "";
          notes.push("رقم الدعوى الابتدائية من السجل المدموج: " + ar(o.caseNo) + (o.caseYear ? " لسنة " + ar(o.caseYear) : ""));
        } else {
          notes.push("رقم دعوى تاني للقضية نفسها (من السجل المدموج): " + ar(o.caseNo) + (o.caseYear ? " لسنة " + ar(o.caseYear) : "") +
            (o.courtName ? " — " + o.courtName : ""));
        }
      }
      var kf = dupNum(keep.fileNo), of = dupNum(o.fileNo);
      if (!kf && of) keep.fileNo = o.fileNo;
      else if (of && of !== kf) notes.push("رقم ملف آخر للقضية نفسها: " + ar(o.fileNo));
    });
    /* الدرجة من صفة الأطراف لو الحقل بيقول غير كده */
    var deg = capDegree(keep), lv = norm(keep.courtLevel || "");
    var lvDeg = /نقض/.test(lv) ? "نقض" : /استئناف|استيناف|استانف/.test(lv) ? "استئناف" : /ابتدا[ئي]|جز[ئي]|كليه/.test(lv) ? "أول درجة" : "";
    if (deg && deg !== lvDeg) {
      var old = keep.courtLevel || "";
      if (deg === "أول درجة") {
        var fromOther = others.map(function (o) { return o.courtLevel; }).filter(function (v) { return /ابتدا[ئي]|جز[ئي]|كليه/.test(norm(v || "")); })[0];
        keep.courtLevel = fromOther || (/جز[ئي]يه/.test(norm(keep.courtName || "")) ? "جزئي" : "ابتدائي");
      } else keep.courtLevel = DEG_LEVEL[deg];
      notes.push("درجة التقاضي اتصححت من صفة الأطراف: " + (old || "—") + " ← " + keep.courtLevel);
    }
    keep.noteLog = keep.noteLog || [];
    keep.noteLog.push({ date: todayISO(), text: "دُمجت مع " + ar(others.length) + " نسخة مكررة لنفس القضية" +
      (notes.length ? " — " + notes.join(" · ") : "") });
  }
  /** معاينة بلا أي تعديل */
  function dupPreview() {
    var list = read();
    return dupGroups(list).map(function (g) {
      var recs = g.idx.map(function (i) { return list[i]; }), keep = dupPickKeep(recs);
      return { why: g.why, keep: keep, drop: recs.filter(function (c) { return c !== keep; }), degree: capDegree(keep) };
    });
  }
  /** التنفيذ: نسخة احتياطية أولاً (بدونها ما يحصلش حاجة)، دمج، نقل المرفقات
      والروابط، حفظ ورفع، ومسح النسخ المكررة من السيرفر. */
  var NOT_DUP_KEY = "proflawyer.cases.notDup.v1";
  function notDupMap() { try { return JSON.parse(localStorage.getItem(NOT_DUP_KEY)) || {}; } catch (e) { return {}; } }
  function pairKey(a, b) { return [a, b].sort().join("|"); }
  /** «مش تكرار» — الزوج ده ما يظهرش في المراجعة تاني */
  function dupDismiss(idA, idB) {
    var m = notDupMap(); m[pairKey(idA, idB)] = Date.now();
    try { localStorage.setItem(NOT_DUP_KEY, JSON.stringify(m)); } catch (e) { }
  }
  function dupReviewList() {
    dupGroups(read());
    var m = notDupMap();
    return (dupGroups.review || []).filter(function (x) { return !m[pairKey(x.a.id, x.b.id)]; });
  }
  /** onlyGroups (اختياري): [[id, id], ...] — دمج مجموعات بعينها (من المراجعة اليدوية) */
  function dupApply(done, onlyGroups) {
    var list = read();
    var stamp = new Date().toISOString().replace(/[:.]/g, "-"), backupOk = false;
    try {
      if (w.AndroidSaver && AndroidSaver.save) {
        AndroidSaver.save("cases-backup-before-merge-" + stamp + ".json", btoa(unescape(encodeURIComponent(JSON.stringify(list)))));
        backupOk = true;
      } else { localStorage.setItem("proflawyer.cases.backupBeforeMerge", JSON.stringify(list)); backupOk = true; }
    } catch (e) { }
    if (!backupOk) { if (done) done({ error: "تعذّر حفظ النسخة الاحتياطية — أُلغي الدمج" }); return; }
    var groups = dupGroups(list), dropIds = {}, remap = {}, merged = 0, keepIds = [];
    if (onlyGroups) {
      var at = {}; list.forEach(function (c, i) { at[c.id] = i; });
      groups = onlyGroups.map(function (ids) {
        return { idx: ids.map(function (id) { return at[id]; }).filter(function (i) { return i != null; }) };
      }).filter(function (g) { return g.idx.length > 1; });
    }
    groups.forEach(function (g) {
      var recs = g.idx.map(function (i) { return list[i]; }), keep = dupPickKeep(recs);
      var others = recs.filter(function (c) { return c !== keep; });
      dupMergeInto(keep, others);
      others.forEach(function (o) { dropIds[o.id] = 1; remap[o.id] = keep.id; });
      keepIds.push(keep.id);
      merged++;
    });
    /* الروابط (دعوى فرعية/منضمة) والمرفقات تتنقل للسجل اللي فاضل */
    list.forEach(function (c) { if (c.linkedTo && remap[c.linkedTo]) c.linkedTo = remap[c.linkedTo]; });
    var moved = 0;
    if (w.Attach) Object.keys(remap).forEach(function (oldId) {
      var pre = "case_" + oldId + "_";
      Attach.list().filter(function (n) { return n.indexOf(pre) === 0; }).forEach(function (n) {
        var nn = "case_" + remap[oldId] + "_" + n.slice(pre.length), v = Attach.get(n);
        if (v && !Attach.get(nn) && Attach.put(nn, v) && Attach.get(nn) === v) { Attach.remove(n); moved++; }
      });
    });
    var out = list.filter(function (c) { return !dropIds[c.id]; });
    /* حفظ محلي + رفع السجلات المدموجة بس (مش كل القضايا): لو المزامنة لسه ما
       خلصتش أو النت قاطع، write(out) كان هيعتبر كل القضايا متغيّرة ويحطها كلها
       في طابور الرفع (بطيء جداً ويستهلك حصة الكتابة). */
    try { localStorage.setItem(KEY, JSON.stringify(out)); }
    catch (e) { if (done) done({ error: "تعذّر الحفظ — المساحة ممتلئة" }); return; }
    keepIds.forEach(function (id) { pushChangedToCloud(out, id); });
    /* الروابط اللي اتعدّلت (دعوى فرعية/منضمة) */
    out.forEach(function (c) { if (c.linkedTo && keepIds.indexOf(c.linkedTo) >= 0 && lastSynced[c.id] !== JSON.stringify(c)) pushChangedToCloud(out, c.id); });
    var ids = Object.keys(dropIds), left = ids.length;
    var finished = false;
    var fin = function () { if (finished) return; finished = true; if (done) done({ groups: merged, removed: ids.length, before: list.length, after: out.length, attachmentsMoved: moved }); };
    if (!left || !(w.CloudStore && CloudStore.collection)) { fin(); return; }
    /* المسح من السيرفر بيتسجّل في طابور لو النت قاطع — ما نستناش للأبد */
    setTimeout(fin, 20000);
    ids.forEach(function (id) {
      CloudStore.collection.remove("cases", id, function () { gForget(id); if (--left === 0) fin(); });
    });
  }

  w.CaseFile = { generalBox: generalBox, upsertRegTask: upsertRegTask, removeRegTask: removeRegTask, dupPreview: dupPreview, dupApply: dupApply, capDegree: capDegree,
    dupReview: dupReviewList, dupDismiss: dupDismiss, caseColor: caseColor, isFinalJudgment: isFinalJudgment, finalJudgmentOf: finalJudgmentOf, moveAfterJudgment: moveAfterJudgment, taskCourt: taskCourt, nextCourtDay: nextCourtDay, courtOpenTasks: courtOpenTasks, courtDayText: courtDayText, taskQuickActions: taskQuickActions, courtKeyT: courtKeyT, appealCalc: appealCalc, appealCalcText: appealCalcText, appealShiftPhrase: appealShiftPhrase, effectiveStatus: effectiveStatus, CASE_COLORS: CASE_COLORS, GENERAL_ID: GENERAL_ID, editAdminTask: editAdminTask, caseReportPages: caseReportPages, caseReportText: caseReportText,
    all: read, search: search, openCase: openCase, editCase: editCase,
    nextCaseFileNo: nextCaseFileNo, suggestPanel: suggestPanel,
    editLegalWork: editLegalWork, openLegalWork: openLegalWork,
    editSession: editSession, printCase: printCase,
    clientsWithOffice: clientsWithOffice, officeNos: officeNos,
    sessions: sessions, sessionsDesc: sessionsDesc,
    nextSession: nextSession, lastSession: lastSession,
    currentSession: currentSession, resultOf: resultOf, reasonOf: reasonOf,
    courtCascade: courtCascade,
    makeLinked: makeLinked, addLinked: addLinked, linkedTo: linkedTo,
    rootOf: rootOf, detectLinked: detectLinked,
    patchCase: patchCase, commitAll: commitAllChanged, unsynced: unsynced, pushUnsynced: pushUnsynced,
    caseClientUids: caseClientUids, withClientUids: withClientUids,
    FIELDS: FIELDS, ar: ar, norm: norm
  };
})(window);
