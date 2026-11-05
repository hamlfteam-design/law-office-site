/* =============================================================================
   صور التوكيلات مع الفريق (طلب المستخدم ١٨-١٠ — نسخة ١٫٥٦)

   الصور والملفات الممسوحة (poa_….jpg / poa_…_pN.jpg / poa_….pdf) محفوظة على كل
   جهاز لوحده جوه التطبيق (Attach). فيربيز مش مناسب للصور (حد المستند ١ ميجا
   والحصة)، فبتتنقل عن طريق جسر درايف المكتب لمجلد «صور التوكيلات»، بحساب كل
   مستخدم (الجسر بيتأكد إنه عضو في الفريق — docs/drive-bridge/Code.gs):

     • الرفع: أي صورة توكيل بتتحفظ أو تتشال على أي جهاز بتدخل طابور، والطابور
       بيترفع في الخلفية (المسح للمدير بس). أول مرة: الصور اللي على الجهاز ومش
       على الدرايف بتترفع.
     • التنزيل: كل ١٠ دقايق والبرنامج مفتوح، اللي اتغيّر بس، على دفعات صغيرة
       (عشان النت والجسر). ولو حد فتح توكيل صورته لسه ما نزلتش ← بتنزل على طول.
     • اللي اتشال من الدرايف (مسحه المدير) بيتشال من الأجهزة.
   ============================================================================= */
(function (w) {
  "use strict";

  var NAME = /^poa_[0-9A-Za-z_]{1,120}\.(jpg|pdf)$/;
  var QKEY = "proflawyer.sync.poaimg.queue";   /* {name: "put"|"del"} */
  var SEEN = "proflawyer.sync.poaimg.seen";    /* {name: updatedAt} اللي متطابق مع الدرايف */
  var REMOTE = "proflawyer.sync.poaimg.remote";/* آخر قائمة من الدرايف {name: updatedAt} */
  var AT = "proflawyer.sync.poaimg.at";
  var EVERY = 10 * 60000, BATCH = 12;

  function on() { return !!(w.Attach && w.CloudStore && w.CloudStore.bridge && !w.HAMLF_PC); }
  function getJ(k) { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch (e) { return {}; } }
  function setJ(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }

  /* ---- أي حفظ/مسح لصورة توكيل يدخل الطابور (والتنزيل من الدرايف ما يدخلش) */
  var applying = false;
  if (w.Attach) {
    var put0 = w.Attach.put, rm0 = w.Attach.remove;
    w.Attach.put = function (id, dataUrl) {
      var r = put0.apply(this, arguments);
      if (r && !applying && NAME.test(id)) queue(id, "put");
      return r;
    };
    w.Attach.remove = function (id) {
      var had = w.Attach.has(id);
      var r = rm0.apply(this, arguments);
      if (had && !applying && NAME.test(id)) queue(id, "del");
      return r;
    };
  }
  function queue(id, op) {
    var q = getJ(QKEY); q[id] = op; setJ(QKEY, q);
    clearTimeout(queue.t); queue.t = setTimeout(flush, 3000);
  }

  function b64Of(id) {
    var u = w.Attach.get(id) || "", i = u.indexOf(",");
    return i >= 0 ? u.slice(i + 1) : "";
  }
  function mimeOf(id) { return /\.pdf$/.test(id) ? "application/pdf" : "image/jpeg"; }

  /* ---- الرفع (واحد ورا التاني) */
  var flushing = false;
  function flush() {
    if (!on() || flushing || navigator.onLine === false) return;
    var q = getJ(QKEY), ids = Object.keys(q);
    if (!ids.length) return;
    flushing = true;
    var id = ids[0], op = q[id];
    function next(done) {
      if (done) { var q2 = getJ(QKEY); if (q2[id] === op) { delete q2[id]; setJ(QKEY, q2); } }
      flushing = false;
      if (done) setTimeout(flush, 300);
    }
    if (op === "put") {
      var data = b64Of(id);
      if (!data) { if (w.HAMLF_IPHONE && w.Attach.has(id)) { flushing = false; setTimeout(flush, 1500); return; } next(true); return; }            /* اتشالت قبل ما تترفع */
      w.CloudStore.bridge("portalTeamPoaPut", { name: id, data: data }, function (j) {
        if (j && j.ok) { var s = getJ(SEEN); s[id] = j.updatedAt; setJ(SEEN, s); var r = getJ(REMOTE); r[id] = j.updatedAt; setJ(REMOTE, r); }
        next(!!(j && (j.ok || j.error === "name")));
      });
    } else {
      w.CloudStore.bridge("portalTeamPoaDel", { name: id }, function (j) {
        if (j && j.ok) { var s = getJ(SEEN); delete s[id]; setJ(SEEN, s); var r = getJ(REMOTE); delete r[id]; setJ(REMOTE, r); }
        /* مش مدير: المسح بيفضل على الجهاز ده بس (والصورة بترجع مع أول تنزيل) */
        next(!!(j && (j.ok || j.error === "not_owner" || j.error === "name")));
      });
    }
  }

  /* ---- تنزيل صورة بعينها من الدرايف */
  function fetchOne(name, cb) {
    w.CloudStore.bridge("portalTeamPoaGet", { name: name }, function (j) {
      if (!j || !j.ok || !j.data) { cb(false); return; }
      applying = true;
      var ok = false;
      try { ok = w.Attach.put(name, "data:" + mimeOf(name) + ";base64," + j.data); } finally { applying = false; }
      if (ok) { var s = getJ(SEEN); s[name] = j.updatedAt; setJ(SEEN, s); }
      cb(ok);
    });
  }
  function fetchMany(names, cb) {
    var i = 0, n = 0;
    (function step() {
      if (i >= names.length) { if (n) { try { w.dispatchEvent(new CustomEvent("poaimg:synced", { detail: { n: n } })); } catch (e) { } } cb && cb(n); return; }
      fetchOne(names[i++], function (ok) { if (ok) n++; step(); });
    })();
  }

  /* ---- المزامنة الدورية */
  var pulling = false;
  function pull(force) {
    if (!on() || pulling || document.hidden || navigator.onLine === false) return;
    if (!force && Date.now() - (+localStorage.getItem(AT) || 0) < EVERY) { flush(); return; }
    pulling = true;
    w.CloudStore.bridge("portalTeamPoaList", {}, function (j) {
      pulling = false;
      if (!j || !j.ok || !Array.isArray(j.files)) return;
      try { localStorage.setItem(AT, String(Date.now())); } catch (e) { }
      var remote = {}, seen = getJ(SEEN), q = getJ(QKEY);
      j.files.forEach(function (f) { if (f && NAME.test(f.name)) remote[f.name] = f.updatedAt; });
      setJ(REMOTE, remote);
      var local = {};
      w.Attach.list().forEach(function (id) { if (NAME.test(id)) local[id] = 1; });
      /* اتمسحت من الدرايف (كانت متزامنة) ← تتشال هنا. أمان: لو كتير (قائمة ناقصة) ما نشيلش */
      var gone = Object.keys(seen).filter(function (n) { return !(n in remote) && !q[n]; });
      if (gone.length && gone.length <= Math.max(5, Math.round(Object.keys(seen).length * 0.05))) {
        applying = true;
        try { gone.forEach(function (n) { w.Attach.remove(n); delete seen[n]; }); } finally { applying = false; }
        setJ(SEEN, seen);
      }
      /* على الجهاز ومش على الدرايف ولا اتشالت منه ← تترفع (أول مرة على كل جهاز) */
      Object.keys(local).forEach(function (n) { if (!(n in remote) && !(n in seen) && !q[n]) q[n] = "put"; });
      setJ(QKEY, q);
      /* اتغيّرت أو جديدة على الدرايف ← تنزل على دفعات */
      var want = Object.keys(remote).filter(function (n) { return !q[n] && (seen[n] !== remote[n] || !local[n]); });
      fetchMany(want.slice(0, BATCH), function () {
        if (want.length > BATCH) { try { localStorage.setItem(AT, "0"); } catch (e) { } setTimeout(function () { pull(true); }, 2000); }
        flush();
      });
    });
  }

  /** فتح توكيل صورته لسه ما نزلتش: base = poa_<مفتاح> ← ينزّل صفحاته وملفه على طول. */
  function fetchFor(base, cb) {
    if (!on()) { cb && cb(0); return; }
    function go() {
      var r = getJ(REMOTE);
      var names = Object.keys(r).filter(function (n) {
        return (n === base + ".jpg" || n === base + ".pdf" || n.indexOf(base + "_p") === 0) && !w.Attach.has(n);
      });
      fetchMany(names, cb);
    }
    if (Object.keys(getJ(REMOTE)).length) go();
    else w.CloudStore.bridge("portalTeamPoaList", {}, function (j) {
      if (j && j.ok && Array.isArray(j.files)) {
        var remote = {}; j.files.forEach(function (f) { if (f && NAME.test(f.name)) remote[f.name] = f.updatedAt; });
        setJ(REMOTE, remote);
      }
      go();
    });
  }
  function hasRemote(base) {
    var r = getJ(REMOTE);
    return Object.keys(r).some(function (n) { return n === base + ".jpg" || n === base + ".pdf"; });
  }

  setTimeout(function () { pull(false); }, 20000);
  setInterval(function () { pull(false); }, 60000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) setTimeout(function () { pull(false); }, 3000); });

  w.PoaSync = { pull: pull, flush: flush, fetchFor: fetchFor, hasRemote: hasRemote,
                pending: function () { return Object.keys(getJ(QKEY)).length; } };
})(window);
