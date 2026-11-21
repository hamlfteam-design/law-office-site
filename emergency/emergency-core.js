/* =============================================================================
   «تقرير الطوارئ الميداني» — المنطق المشترك (تطبيق Hamlf + بوابة محامي الطوارئ).
   نفس الملف منسوخ في law-office-site/emergency/emergency-core.js — أي تعديل يتعمل في الاتنين.

   مرحلة البناء (طلب المستخدم ٢١-١١-٢٠٢٦: «نبني الأول وبعدين نربط»):
   - التخزين: localStorage عن طريق EM.store. نقطة الربط بـFirebase = EM.store.adapter.
   - إعادة الصياغة بالفصحى وتوزيع الكلام على البنود: EM.ai.rewrite / EM.ai.split — دلوقتي بترجّع
     النص زي ما هو. نقطة الربط بـClaude.
   - الإشعارات وGPS: GPS شغال من المتصفح؛ الإشعارات بتظهر جوه الصفحة بس لحد الربط.
   - التخزين بالأرقام اللاتيني، والعرض بالعربي الهندي (EM.ar).
   ============================================================================= */
(function (w) {
  "use strict";
  var KEY = "hamlf.emergency.v1";

  /* ------------------------------------------------------------ أرقام وتواريخ */
  function ar(x) { return String(x == null ? "" : x).replace(/[0-9]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩"[d]; }); }
  function la(x) { return String(x == null ? "" : x).replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x0660; }); }
  function p2(n) { return (n < 10 ? "0" : "") + n; }
  /* العرض: يوم/شهر/سنة بالأرقام العربية (المواصفات ٧) */
  function fmtDate(ms) { if (!ms) return ""; var d = new Date(ms); return ar(p2(d.getDate()) + "/" + p2(d.getMonth() + 1) + "/" + d.getFullYear()); }
  function fmtTime(ms) { if (!ms) return ""; var d = new Date(ms); return ar(p2(d.getHours()) + ":" + p2(d.getMinutes())); }
  function fmtDT(ms) { return ms ? fmtDate(ms) + " — " + fmtTime(ms) : "—"; }
  function mins(a, b) { return Math.floor(((b || Date.now()) - a) / 60000); }
  function fmtDur(m) { var h = Math.floor(m / 60), r = m % 60; return h ? ar(h) + " س " + ar(r) + " د" : ar(r) + " دقيقة"; }
  function uid(p) { return (p || "em") + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* ------------------------------------------------------------ التخزين */
  var local = {
    load: function () { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } },
    save: function (db) { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { } }
  };
  var store = {
    adapter: local,            /* ← الربط: adapter بنفس الشكل { load, save } يقرا ويكتب من Firestore */
    db: null,
    get: function () {
      if (!store.db) store.db = store.adapter.load() || { reports: [], lawyers: [], requests: [], fees: defaultFees(), payouts: [] };
      if (!store.db.fees) store.db.fees = defaultFees();
      ["reports", "lawyers", "requests", "payouts"].forEach(function (k) { store.db[k] = store.db[k] || []; });
      return store.db;
    },
    save: function () { store.adapter.save(store.get()); store.emit(); },
    _l: [], on: function (f) { store._l.push(f); }, emit: function () { store._l.forEach(function (f) { try { f(); } catch (e) { } }); }
  };

  /* ------------------------------------------------------------ ثوابت */
  var STAGES = { station: "قسم الشرطة", prosecution: "النيابة", renewal: "تجديد حبس", session: "جلسة غير مرافعة" };
  var STATUS = { new: "جديد", ack: "تم الاستلام", initial: "أرسل التقرير الأولي", detailed: "أرسل التقرير التفصيلي",
    approved: "معتمد", reassigned: "أعيد تكليفه", closed: "مغلق" };
  var GRADES = { normal: "عادي", distinct: "مميز", senior: "أول" };

  function defaultFees() {
    return {
      stage: { station: 1500, prosecution: 2000, renewal: 1000, session: 1000 },   /* أتعاب كل مرحلة (أون كول) */
      officeShare: 30,          /* بدل مهمة محامي المكتب = نسبة ٪ من أتعاب المرحلة */
      travel: { "القاهرة": 200, "الجيزة": 250, "أخرى": 400 },
      nightMult: 1.5,           /* من ١٢ بالليل لـ٧ الصبح، والجمعة، والعطلات */
      speedBonus: 10,           /* ٪ لو التواصل أقل من ٣٠ دقيقة */
      successBonus: 0,          /* مبلغ ثابت يضيفه المدير عند النجاح */
      transferPct: 0, referralPct: 0,
      gradeMult: { normal: 1, distinct: 1.15, senior: 1.3 },
      standby: 1000,            /* بدل استعداد شهري للأون كول */
      greenMin: 30, redMin: 45, detailedMin: 60
    };
  }

  /* بنود التقرير التفصيلي بالترتيب (المواصفات ٣). t: text | area | choice | datetime | list | people */
  var SECTIONS = [
    { k: "charge", t: "التهمة", req: true, f: [
      { k: "text", l: "التهمة كما في المحضر", t: "area", req: true },
      { k: "articles", l: "مواد القانون", t: "text" },
      { k: "multi", l: "أكتر من تهمة؟", t: "choice", o: ["لا", "نعم"] } ] },
    { k: "detention", t: "بيانات الاحتجاز", f: [
      { k: "place", l: "مكان الاحتجاز", t: "text" }, { k: "recordNo", l: "رقم المحضر", t: "text" },
      { k: "authority", l: "الجهة القائمة بالقبض", t: "text" },
      { k: "presented", l: "اتعرض على النيابة؟", t: "choice", o: ["لا", "نعم", "غير معلوم"] } ] },
    { k: "arrest", t: "ميعاد القبض ومكانه", f: [
      { k: "at", l: "التاريخ والساعة", t: "datetime" },
      { k: "placeType", l: "نوع المكان", t: "choice", o: ["بيت", "شارع", "شغل", "كمين", "أخرى"] },
      { k: "placeText", l: "تفاصيل المكان", t: "text" } ] },
    { k: "warrant", t: "سند القبض", f: [
      { k: "type", l: "السند", t: "choice", o: ["إذن نيابة", "تلبس", "بدون سند"] },
      { k: "officer", l: "اسم القائم بالقبض", t: "text" } ] },
    { k: "search", t: "التفتيش والمضبوطات", f: [
      { k: "done", l: "حصل تفتيش؟", t: "choice", o: ["لا", "نعم"] }, { k: "where", l: "فين؟", t: "text" },
      { k: "items", l: "المضبوطات", t: "area" } ] },
    { k: "witnesses", t: "الشهود والكاميرات", f: [
      { k: "who", l: "مين كان موجود", t: "area" }, { k: "cameras", l: "في كاميرات؟", t: "choice", o: ["لا", "نعم", "غير معلوم"] } ] },
    { k: "others", t: "متهمين آخرين", f: [
      { k: "any", l: "في متهمين آخرين؟", t: "choice", o: ["لا", "نعم"] }, { k: "names", l: "الأسماء", t: "area" } ] },
    { k: "statements", t: "أقوال المحتجز", f: [
      { k: "asked", l: "اتسأل؟", t: "choice", o: ["لا", "نعم"] }, { k: "signed", l: "وقّع على أقوال؟", t: "choice", o: ["لا", "نعم"] },
      { k: "notes", l: "ملاحظات", t: "area" } ] },
    { k: "health", t: "الحالة الصحية", f: [
      { k: "injuries", l: "إصابات / آثار تعدي", t: "area" }, { k: "needs", l: "محتاج علاج أو دوا", t: "area" } ] },
    { k: "duration", t: "مدة الاحتجاز", auto: true, f: [] },
    { k: "prosecution", t: "العرض على النيابة", f: [
      { k: "office", l: "النيابة المختصة", t: "text" }, { k: "expected", l: "الميعاد المتوقع", t: "datetime" } ] },
    { k: "family", t: "تواصل الأهل", f: [
      { k: "know", l: "الأهل عارفين؟", t: "choice", o: ["لا", "نعم"] }, { k: "contact", l: "مين نتواصل معاه", t: "text" } ] },
    { k: "actions", t: "تصرفات المحامي", f: [
      { k: "done", l: "اللي عمله مع جهة الاحتجاز", t: "area" },
      { k: "met", l: "قابل مين (الاسم + الرتبة/الوظيفة)", t: "people" },
      { k: "dialog", l: "الحوار اللي دار", t: "area" }, { k: "obstruction", l: "أي منع أو تعطيل", t: "area" } ] },
    { k: "foreign", t: "محتجز أجنبي", foreignOnly: true, f: [
      { k: "nationality", l: "الجنسية", t: "text" }, { k: "passport", l: "رقم الجواز", t: "text" },
      { k: "consulNotified", l: "القنصلية اتبلغت؟", t: "choice", o: ["لا", "نعم", "غير معلوم"] },
      { k: "consulAt", l: "إمتى؟", t: "datetime" }, { k: "consulBy", l: "مين بلّغ؟", t: "text" },
      { k: "rightsInformed", l: "اتعرّف بحقه في إبلاغ قنصليته؟", t: "choice", o: ["لا", "نعم"] },
      { k: "consulContacted", l: "القنصلية تواصلت؟", t: "choice", o: ["لا", "نعم"] },
      { k: "interpreter", l: "محتاج مترجم؟", t: "choice", o: ["لا", "نعم"] },
      { k: "signedForeign", l: "وقّع على أقوال بلغة مش فاهمها؟", t: "choice", o: ["لا", "نعم", "غير معلوم"] } ] }
  ];

  /* ------------------------------------------------------------ العدّاد والحالة */
  function contactMin(r) { return r.initial && r.initial.at ? mins(r.createdAt, r.initial.at) : null; }
  function clock(r) {
    var fees = store.get().fees, m = contactMin(r), live = m == null, v = live ? mins(r.createdAt) : m;
    var color = v < fees.greenMin ? "green" : v < fees.redMin ? "yellow" : "red";
    return { min: v, live: live, color: color,
      label: color === "green" ? "مكافأة سرعة" : color === "yellow" ? "في الوقت الطبيعي" : "تأخير" };
  }
  function detentionHours(r) {
    var at = r.detailed && r.detailed.arrest && r.detailed.arrest.at;
    if (!at) return null;
    var t = new Date(la(at)).getTime(); if (isNaN(t)) return null;
    return Math.floor((Date.now() - t) / 3600000);
  }
  function detentionAlarm(r) {
    var h = detentionHours(r), pres = r.detailed && r.detailed.detention && r.detailed.detention.presented;
    return h != null && h >= 24 && pres !== "نعم";
  }
  function detailedOverdue(r) {
    return r.initial && !r.detailed && mins(r.initial.at) >= store.get().fees.detailedMin;
  }

  /* ------------------------------------------------------------ الحسابات (المواصفات ٥) */
  function isNight(ms) {
    var d = new Date(ms), h = d.getHours(), iso = d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()),
        holidays = (w.EgHolidays && w.EgHolidays.officialOn) ? !!w.EgHolidays.officialOn(iso) : false;
    return h < 7 || d.getDay() === 5 || holidays;
  }
  function calc(r) {
    var db = store.get(), F = db.fees, L = lawyer(r.assignedLawyerId) || {};
    var base = Number(F.stage[r.stage] || 0);
    if (L.kind === "office") base = base * Number(F.officeShare || 0) / 100;
    var travel = Number((F.travel || {})[r.region || "القاهرة"] || 0);
    var grade = Number((F.gradeMult || {})[L.grade || "normal"] || 1);
    var night = isNight(r.createdAt) ? Number(F.nightMult || 1) : 1;
    var sub = base * grade * night;
    var c = clock(r), speed = (c.color === "green" && !c.live) ? sub * Number(F.speedBonus || 0) / 100 : 0;
    var success = r.success ? Number(F.successBonus || 0) : 0;
    var total = Math.round(sub + speed + travel + success);
    return { base: Math.round(base), grade: grade, night: night, speed: Math.round(speed), travel: travel,
      success: success, total: total, late: c.color === "red" && !c.live };
  }
  function lawyer(id) { return store.get().lawyers.filter(function (l) { return l.id === id; })[0]; }
  function monthKey(ms) { var d = new Date(ms); return d.getFullYear() + "-" + p2(d.getMonth() + 1); }
  function statement(lawyerId, month) {
    var db = store.get(), L = lawyer(lawyerId) || {}, rows = [], sum = 0, standbyLost = false;
    db.reports.forEach(function (r) {
      var mine = r.assignedLawyerId === lawyerId || (r.history || []).some(function (h) { return h.from === lawyerId; });
      if (!mine || monthKey(r.createdAt) !== month) return;
      if (r.assignedLawyerId !== lawyerId) { standbyLost = true; return; }     /* اتسحب منه = تأخير أو رفض */
      if (r.declinedBy && r.declinedBy.indexOf(lawyerId) >= 0) standbyLost = true;
      if (r.status !== "approved" && r.status !== "closed") return;
      var c = r.pay || calc(r); if (c.late) standbyLost = true;
      rows.push({ r: r, c: c }); sum += c.total;
    });
    var standby = L.kind === "oncall" && L.active ? (standbyLost ? 0 : Number(db.fees.standby || 0)) : 0;
    var paid = db.payouts.filter(function (p) { return p.lawyerId === lawyerId && p.month === month; })
      .reduce(function (a, p) { return a + Number(p.amount || 0); }, 0);
    return { rows: rows, sum: sum, standby: standby, standbyLost: standbyLost, total: sum + standby, paid: paid, due: sum + standby - paid };
  }

  /* ------------------------------------------------------------ دورة البلاغ */
  function log(r, txt, by) { (r.timeline = r.timeline || []).push({ at: Date.now(), txt: txt, by: by || "", public: false }); }
  function create(o, by) {
    var r = { id: uid("em"), ref: new Date().getFullYear() + "/" + String(Date.now()).slice(-5),
      createdAt: Date.now(), status: "new", detainee: o.detainee || "", place: o.place || "", familyPhone: o.familyPhone || "",
      stage: o.stage || "station", region: o.region || "القاهرة", foreign: !!o.foreign,
      assignedLawyerId: o.assignedLawyerId || "", assignedLawyerUid: (lawyer(o.assignedLawyerId) || {}).uid || "",
      requestId: o.requestId || "", clientUids: o.clientUids || [], history: [], timeline: [] };
    log(r, "إنشاء البلاغ وتكليف " + ((lawyer(r.assignedLawyerId) || {}).name || "—"), by);
    notify(r.assignedLawyerId, "بلاغ طوارئ جديد " + r.ref + " — " + r.detainee);
    store.get().reports.unshift(r); store.save(); return r;
  }
  function ack(r, by) { r.ackAt = Date.now(); if (r.status === "new" || r.status === "reassigned") r.status = "ack"; log(r, "المحامي استلم البلاغ", by); store.save(); }
  function sendInitial(r, data, gps, by) {
    r.initial = { at: Date.now(), charge: data.charge, text: data.text || "", gps: gps || null, audio: data.audio || null };
    r.status = "initial"; log(r, "التقرير الأولي — التهمة: " + data.charge, by); store.save();
  }
  function sendDetailed(r, data, by) {
    r.detailed = data; r.detailedAt = Date.now(); r.status = "detailed"; log(r, "التقرير التفصيلي", by); store.save();
  }
  function approve(r, by) { r.status = "approved"; r.approvedAt = Date.now(); r.pay = calc(r); log(r, "اعتماد المدير — المستحق " + r.pay.total, by); store.save(); }
  function reassign(r, newId, reason, by) {
    r.history.push({ from: r.assignedLawyerId, to: newId, at: Date.now(), reason: reason || "تأخير" });
    r.assignedLawyerId = newId; r.assignedLawyerUid = (lawyer(newId) || {}).uid || "";
    r.createdAt = Date.now(); r.ackAt = null; r.initial = null; r.status = "reassigned";
    log(r, "إعادة تكليف إلى " + ((lawyer(newId) || {}).name || "—") + " (" + (reason || "تأخير") + ")", by);
    notify(newId, "بلاغ طوارئ مكلّف بيه " + r.ref); store.save();
  }
  function decline(r, lawyerId, by) { (r.declinedBy = r.declinedBy || []).push(lawyerId); log(r, "المحامي اعتذر عن التكليف", by); store.save(); }
  function addPublic(r, txt, by) { (r.timeline = r.timeline || []).push({ at: Date.now(), txt: txt, by: by || "", public: true }); store.save(); }
  function setPublic(r, i, v) { r.timeline[i].public = !!v; store.save(); }

  /* ------------------------------------------------------------ نقاط الربط */
  var notices = [];
  function notify(lawyerId, txt) { notices.push({ to: lawyerId, txt: txt, at: Date.now() }); /* ← الربط: FCM / واتساب */ }
  var ai = {
    /* ← الربط: Claude — صياغة بعربي فصيح قانوني من غير إضافة أي معلومة. دلوقتي بيرجّع النص زي ما هو. */
    rewrite: function (text) { return Promise.resolve({ text: text, linked: false }); },
    /* ← الربط: Claude — توزيع الحكاية على مفاتيح البنود. دلوقتي بيحط الكلام كله في «تصرفات المحامي». */
    split: function (text) { return Promise.resolve({ actions: { done: text }, linked: false }); }
  };

  /* ------------------------------------------------------------ الميكروفون (Speech-to-Text من المتصفح) */
  function mic(btn, target, onDone) {
    var R = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!R) { alert("الإدخال الصوتي مش مدعوم في المتصفح ده — جرّب Chrome."); return; }
    if (btn._rec) { btn._rec.stop(); return; }
    var r = new R(); r.lang = "ar-EG"; r.continuous = true; r.interimResults = false;
    btn._rec = r; btn.classList.add("rec");
    var chunks = [];
    r.onresult = function (e) { for (var i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) chunks.push(e.results[i][0].transcript); };
    r.onend = function () {
      btn._rec = null; btn.classList.remove("rec");
      var said = chunks.join(" ").trim(); if (!said) return;
      ai.rewrite(said).then(function (o) {
        if (target) target.value = (target.value ? target.value + " " : "") + o.text;
        onDone && onDone(o.text, said);
      });
    };
    r.onerror = function () { btn._rec = null; btn.classList.remove("rec"); };
    try { r.start(); } catch (x) { btn._rec = null; btn.classList.remove("rec"); }
    /* التسجيل الصوتي الأصلي (المواصفات ٤): بيتسجل بـMediaRecorder ويتحفظ عند الربط بـStorage/Drive */
  }
  function recordAudio(onStop) {
    if (!navigator.mediaDevices || !w.MediaRecorder) return null;
    var rec = null, parts = [];
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
      rec = new MediaRecorder(s); rec.ondataavailable = function (e) { parts.push(e.data); };
      rec.onstop = function () { s.getTracks().forEach(function (t) { t.stop(); });
        var b = new Blob(parts, { type: rec.mimeType }), fr = new FileReader();
        fr.onload = function () { onStop({ at: Date.now(), type: rec.mimeType, dataUrl: fr.result, uploaded: false }); }; fr.readAsDataURL(b); };
      rec.start();
    }).catch(function () { });
    return { stop: function () { if (rec && rec.state !== "inactive") rec.stop(); } };
  }
  function gps(done) {
    if (!navigator.geolocation) { done(null); return; }
    navigator.geolocation.getCurrentPosition(function (p) { done({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy), at: Date.now() }); },
      function () { done(null); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }

  w.EM = { ar: ar, la: la, fmtDate: fmtDate, fmtTime: fmtTime, fmtDT: fmtDT, fmtDur: fmtDur, mins: mins, uid: uid,
    store: store, STAGES: STAGES, STATUS: STATUS, GRADES: GRADES, SECTIONS: SECTIONS, defaultFees: defaultFees,
    clock: clock, contactMin: contactMin, detentionHours: detentionHours, detentionAlarm: detentionAlarm, detailedOverdue: detailedOverdue,
    calc: calc, statement: statement, lawyer: lawyer, monthKey: monthKey,
    create: create, ack: ack, sendInitial: sendInitial, sendDetailed: sendDetailed, approve: approve, reassign: reassign,
    decline: decline, addPublic: addPublic, setPublic: setPublic, notices: notices, ai: ai, mic: mic, recordAudio: recordAudio, gps: gps };
})(window);
