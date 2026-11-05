/* =============================================================================
   تهنئة الموكلين بعيد الميلاد — الإرسال يدوي دايماً، مفيش إرسال تلقائي.

   · تاريخ الميلاد في سجل الموكل (c.birth = YYYY-MM-DD): من الرقم القومي أو بالإيد.
   · إشعار أندرويد ٩ الصبح بتوقيت القاهرة: الصفحة بتحسب مواعيد الـ٦٠ يوم الجايين
     وتبعتها لـReminderReceiver، فالإشعار بيطلع والتطبيق مقفول.
   · مركز التنبيهات (07-alerts) فيه أزرار واتساب/إيميل/تخطي لكل موكل.
   · المحاولة بتتسجل في c.birthGreets[السنة] = {at, via} فالموكل ما يتكررش في نفس
     السنة، والسجل بيتزامن مع باقي بيانات الموكل.

   ممنوع مراسلتهم (قاعدة المستخدم): اللي توكيله «منتهي — وفاة الموكل»، والمعرّفات
   اللي في NO_MESSAGE. المعرّفات بس هنا — ممنوع أسامي موكلين في الكود.
   ============================================================================= */
(function (w) {
  "use strict";

  var CLIENTS = "proflawyer.agenda.clients.v1";
  var TPL_KEY = "proflawyer.birthday.templates.v1";
  var SIG_KEY = "proflawyer.birthday.sig.v1";
  var SEEN_KEY = "proflawyer.birthday.seen.v1";
  var COLL = "app-settings", DOC = "birthday-message";   /* مفتاح غير معروف = المدير بس (firestore.rules) */
  var TZ = "Africa/Cairo", HOUR = 9, HORIZON = 60, NID = 7700;
  var DEATH = "وفاة الموكل";
  var NO_MESSAGE = { "cl_mujlrmqzhcbqk": 1, "cl_mujlrmqzgnzx7": 1 };

  var DEFAULTS = {
    ar: "الأستاذ/ة {الاسم}، كل عام وحضرتك بخير بمناسبة عيد ميلادك 🎉 نتمنى لك عامًا مليئًا بالصحة والسعادة والنجاح. يسعدنا أن نكون إلى جانبك دائمًا، وثقتك بنا محل تقديرنا، وحقك أمانة عندنا. مع خالص التحيات، المستشار د. حسن عبد المنعم حسن وفريق المكتب",
    en: "Dear {Name}, Happy Birthday! Wishing you a year full of health, happiness and success. We're always glad to stand by your side. Your trust means a lot to us. Warm regards, Counselor Dr. Hassan Abdel Moneim Hassan & the office team"
  };

  function latin(t) {
    return String(t == null ? "" : t).replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x660; });
  }
  function pad(n) { return ("0" + n).slice(-2); }
  function isoOf(y, m, d) { return y + "-" + pad(m) + "-" + pad(d); }
  function readJson(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function clients() { return readJson(CLIENTS, []); }

  /* ------------------------------------------------- توقيت القاهرة (مش توقيت الجهاز) */
  var _fmt = null;
  function cairoParts(ms) {
    var dt = new Date(ms);
    try {
      _fmt = _fmt || new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric",
        month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" });
      var p = {};
      _fmt.formatToParts(dt).forEach(function (x) { p[x.type] = +x.value; });
      return { y: p.year, m: p.month, d: p.day, h: p.hour, i: p.minute };
    } catch (e) {
      return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate(), h: dt.getHours(), i: dt.getMinutes() };
    }
  }
  /** الساعة h يوم y-m-d بتوقيت القاهرة ← لحظة زمنية (بالتوقيت الصيفي والشتوي) */
  function cairoEpoch(y, m, d, h) {
    var guess = Date.UTC(y, m - 1, d, h), p = cairoParts(guess);
    return guess - (Date.UTC(p.y, p.m - 1, p.d, p.h, p.i) - guess);
  }
  function today() { var p = cairoParts(Date.now()); return isoOf(p.y, p.m, p.d); }

  /* ------------------------------------------------- التاريخ والرقم القومي */
  function validDate(y, m, d) {
    var t = new Date(Date.UTC(y, m - 1, d));
    if (y < 1900 || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return "";
    var iso = isoOf(y, m, d);
    return iso <= today() ? iso : "";
  }
  /** الرقم القومي (١٤ رقم): الأول القرن (2=1900، 3=2000) وبعده YYMMDD. التاريخ الغلط ← "" */
  function fromNationalId(raw) {
    var id = latin(raw).replace(/\D/g, "");
    if (id.length !== 14) return "";
    var cen = id[0] === "2" ? 1900 : id[0] === "3" ? 2000 : 0;
    if (!cen) return "";
    return validDate(cen + (+id.slice(1, 3)), +id.slice(3, 5), +id.slice(5, 7));
  }
  /** الرقم القومي بتاع السجل ← تاريخ؛ جواز السفر والإقامة أرقامهم مش بنفس التركيب */
  function birthFromRecord(c) {
    return c && !/جواز|إقامة|اقامة|سجل|ضريب/.test(String(c.idType || "")) ? fromNationalId(c.idNo) : "";
  }
  /** تاريخ مكتوب بإيد (ISO أو سنة/شهر/يوم أو يوم/شهر/سنة، بأي أرقام) ← YYYY-MM-DD أو "" */
  function iso(v) {
    var t = latin(v).trim();
    if (!t) return "";
    var r = w.lawyerToISO ? w.lawyerToISO(t) : "";
    if (r) t = r;
    var p = t.split(/[-\/.\s]+/).map(function (x) { return parseInt(x, 10); });
    if (p.length !== 3 || p.some(isNaN)) return "";
    return p[0] > 31 ? validDate(p[0], p[1], p[2]) : validDate(p[2], p[1], p[0]);
  }
  /** يوم عيد الميلاد في سنة معيّنة (٢٩ فبراير ← ٢٨ في السنة البسيطة) */
  function occurrence(birth, year) {
    var m = +birth.slice(5, 7), d = +birth.slice(8, 10);
    if (m === 2 && d === 29 && new Date(Date.UTC(year, 1, 29)).getUTCMonth() !== 1) d = 28;
    return isoOf(year, m, d);
  }

  /* ------------------------------------------------- مين يتبعتله */
  function deceased(c) {
    var dead = function (r) { return r && r.poaReason === DEATH; };
    return dead(c) || (c.poas || []).some(dead);
  }
  function canMessage(c) { return !!(c && c.id && !NO_MESSAGE[c.id] && !deceased(c)); }
  function greetOf(c, year) { return ((c && c.birthGreets) || {})[year] || null; }

  /** الموكلين اللي عيد ميلادهم في يوم dayIso. نفس الشخص المتسجل مرتين (نفس الرقم) يظهر مرة */
  function onDay(dayIso, list) {
    var year = +dayIso.slice(0, 4), seen = {};
    return (list || clients()).filter(function (c) {
      if (!canMessage(c) || !/^\d{4}-\d{2}-\d{2}$/.test(String(c.birth || ""))) return false;
      if (occurrence(c.birth, year) !== dayIso) return false;
      var k = latin(c.idNo).replace(/\D/g, "");
      if (k) { if (seen[k]) return false; seen[k] = 1; }
      return true;
    });
  }
  function todayList() {
    var d = today(), y = d.slice(0, 4);
    return onDay(d).map(function (c) { return { c: c, greet: greetOf(c, y) }; });
  }

  /* ------------------------------------------------- الرسالة */
  function templates() {
    var t = readJson(TPL_KEY, {});
    return { ar: t.ar || DEFAULTS.ar, en: t.en || DEFAULTS.en, at: t.at || 0 };
  }
  function saveTemplates(ar, en) {
    var t = { ar: String(ar || "").trim() || DEFAULTS.ar, en: String(en || "").trim() || DEFAULTS.en, at: Date.now() };
    try { localStorage.setItem(TPL_KEY, JSON.stringify(t)); } catch (e) { return false; }
    if (w.CloudStore && CloudStore.collection) CloudStore.collection.save(COLL, DOC, t);
    return true;
  }
  /** النص المعدَّل من جهاز تاني — الأحدث هو اللي يفضل */
  function pullTemplates(done) {
    if (!w.CloudStore || !CloudStore.collection || !CloudStore.collection.get) { if (done) done(false); return; }
    CloudStore.collection.get(COLL, DOC, function (r) {
      var changed = false;
      if (r && r.ok && r.obj && (r.obj.at || 0) > templates().at) {
        try { localStorage.setItem(TPL_KEY, JSON.stringify(r.obj)); changed = true; } catch (e) { }
      }
      if (done) done(changed);
    });
  }
  function isForeign(c) {
    if (/جواز|إقامة|اقامة/.test(String(c.idType || ""))) return true;
    if (c.name && !/[؀-ۿ]/.test(c.name)) return true;
    return !!(c.country && !/مصر/.test(c.country) && !fromNationalId(c.idNo));
  }
  function text(c, lang) {
    var name = String(c.name || "").trim();
    return templates()[lang === "en" ? "en" : "ar"].replace(/\{(?:الاسم|Name)\}/g, name);
  }
  function subject(lang) { return lang === "en" ? "Happy Birthday" : "كل عام وحضرتك بخير"; }

  /** رقم واتساب: صيغة 20 من غير الصفر (بنفضّل الموبايل المصري لو فيه كذا رقم) */
  function waNumber(raw) {
    var d = latin(raw).replace(/\D/g, "");
    if (d.indexOf("00") === 0) d = d.slice(2);
    if (/^0\d{9,10}$/.test(d)) d = "20" + d.slice(1);
    else if (/^1[0125]\d{8}$/.test(d)) d = "20" + d;
    else if (/^200\d{9,10}$/.test(d)) d = "20" + d.slice(3);
    return d;
  }
  function phoneOf(c) {
    var nums = [].concat(c.phones || [], c.phone ? [c.phone] : []).map(waNumber).filter(Boolean);
    return nums.filter(function (n) { return /^201[0125]\d{8}$/.test(n); })[0] || nums[0] || "";
  }
  function emailOf(c) {
    return [].concat(c.emails || [], c.email ? [c.email] : []).map(function (x) { return String(x).trim(); })
      .filter(function (x) { return x.indexOf("@") > 0; })[0] || "";
  }
  function whatsappUrl(c, lang) { return "https://wa.me/" + phoneOf(c) + "?text=" + encodeURIComponent(text(c, lang)); }
  function mailUrl(c, lang) {
    return "mailto:" + encodeURIComponent(emailOf(c)) + "?subject=" + encodeURIComponent(subject(lang)) +
      "&body=" + encodeURIComponent(text(c, lang));
  }

  /* ------------------------------------------------- التسجيل */
  /** via: whatsapp | email | skip */
  function mark(id, via) {
    var d = today(), y = d.slice(0, 4);
    if (!w.ClientsPOA || !ClientsPOA.patchClient) return false;
    var ok = ClientsPOA.patchClient(id, function (c) {
      c.birthGreets = c.birthGreets || {};
      c.birthGreets[y] = { at: d, via: via };
    });
    if (ok) syncNative();
    return ok;
  }
  function unmark(id) {
    var y = today().slice(0, 4);
    if (!w.ClientsPOA || !ClientsPOA.patchClient) return false;
    var ok = ClientsPOA.patchClient(id, function (c) {
      if (!c.birthGreets) return;
      delete c.birthGreets[y];
      if (!Object.keys(c.birthGreets).length) delete c.birthGreets;
    });
    if (ok) syncNative();
    return ok;
  }

  /* ------------------------------------------------- التذكير */
  function isOwner() {
    try { return !!(w.Team && Team.current && (Team.current() || {}).role === "owner"); } catch (e) { return false; }
  }
  function namesLine(names) { return "النهارده عيد ميلاد: " + names.join("، "); }

  /** مواعيد الإشعارات: يوم فيه أعياد ميلاد ← إشعار واحد الساعة ٩ بتوقيت القاهرة */
  function schedule() {
    var list = clients(), now = Date.now(), p = cairoParts(now), out = [], i;
    for (i = 0; i < HORIZON; i++) {
      var t = new Date(Date.UTC(p.y, p.m - 1, p.d + i)), y = t.getUTCFullYear(), m = t.getUTCMonth() + 1, d = t.getUTCDate();
      var at = cairoEpoch(y, m, d, HOUR);
      if (at <= now) continue;
      var names = onDay(isoOf(y, m, d), list).filter(function (c) { return !greetOf(c, y); })
        .map(function (c) { return String(c.name || "").trim(); });
      if (names.length) out.push({ at: at, until: cairoEpoch(y, m, d, 23), title: "تهنئة عيد ميلاد", body: namesLine(names), nid: NID });
    }
    return out;
  }
  function hash(s) {
    var h = 5381, i;
    for (i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return s.length + "." + h;
  }
  function syncNative() {
    if (!w.AndroidNotify || !AndroidNotify.scheduleBirthdays || !isOwner()) return;
    var json = JSON.stringify(schedule()), sig = today() + "|" + hash(json);
    try { if (localStorage.getItem(SIG_KEY) === sig) return; } catch (e) { }
    AndroidNotify.scheduleBirthdays(json);
    try { localStorage.setItem(SIG_KEY, sig); } catch (e) { }
  }
  /** جوه التطبيق: مرة في اليوم بعد ٩ — للكمبيوتر، وللي فتح بعد ما الإشعار فات */
  function tick() {
    if (!isOwner()) return;
    syncNative();
    var d = today();
    if (cairoParts(Date.now()).h < HOUR) return;
    try { if (localStorage.getItem(SEEN_KEY) === d) return; } catch (e) { }
    var y = d.slice(0, 4);
    var names = onDay(d).filter(function (c) { return !greetOf(c, y); }).map(function (c) { return String(c.name || "").trim(); });
    if (!names.length || !w.PL || !PL.toast) return;
    PL.toast("تهنئة عيد ميلاد", namesLine(names) + " — افتح مركز التنبيهات", "");
    try { localStorage.setItem(SEEN_KEY, d); } catch (e) { }
  }

  w.Birthdays = {
    fromNationalId: fromNationalId, birthFromRecord: birthFromRecord, iso: iso, occurrence: occurrence,
    today: today, cairoEpoch: cairoEpoch, onDay: onDay, todayList: todayList, canMessage: canMessage, isOwner: isOwner,
    DEFAULTS: DEFAULTS, templates: templates, saveTemplates: saveTemplates, pullTemplates: pullTemplates,
    isForeign: isForeign, text: text, waNumber: waNumber, phoneOf: phoneOf, emailOf: emailOf,
    whatsappUrl: whatsappUrl, mailUrl: mailUrl, mark: mark, unmark: unmark, schedule: schedule, syncNative: syncNative
  };

  setTimeout(tick, 5000);
  setInterval(tick, 10 * 60000);
})(window);
