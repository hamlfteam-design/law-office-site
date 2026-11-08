/* =============================================================================
   التذكير — للجلسات والمواعيد معاً، وعلى كل الشاشات.

   كان التذكير مكتوباً داخل شاشة المواعيد وحدها، فلا يعمل إلا وهي مفتوحة،
   ولا يعرف بالجلسات شيئاً. ولمّا حُذفت المواعيد المكرَّرة للجلسات كان
   التذكير سيضيع معها — فنُقل إلى الجلسة نفسها.

   هنا محرّك واحد يقرأ الجلسات والمواعيد جميعاً، ويعمل في أي شاشة ما دام
   التطبيق مفتوحاً. مهلة التذكير للجلسة: ما حُفظ عليها (remindBefore)، وإلا
   المهلة العامة — يوم كامل افتراضاً، ويغيّرها المستخدم.

   ملاحظة صريحة: هذا تذكير داخل التطبيق. تنبيه الهاتف والتطبيق مغلق يحتاج
   خدمة إشعارات من نظام أندرويد — ليست في هذه النسخة.
   ============================================================================= */
(function (w) {
  "use strict";

  var CASES   = "proflawyer.agenda.cases.v1";
  var APPTS   = "proflawyer.appointments.v1";
  var SCREENS = "proflawyer.screens.v1";
  var BAILIFF = "04-bailiff-papers";
  var PREF    = "proflawyer.remind.v1";
  var FIRED   = "proflawyer.remind.fired.v1";
  var CLIENTS = "proflawyer.agenda.clients.v1";

  var DAY = 1440;

  /* نسخة مصغَّرة من legalAppealDays/isCriminalType (case-file.js) — لحساب
     آخر ميعاد للطعن هنا بلا الاعتماد على تحميل case-file.js في كل شاشة
     يعمل فيها هذا المحرّك. راجع [[feedback_daily_deadline_reminders]]. */
  function normLite(t) { return window.lawyerNorm(t); }
  function isCriminalTypeLite(t) { return /جناي|جنح/.test(String(t || "")); }
  function legalAppealDaysLite(c) {
    var lvl = normLite(c.courtLevel || ""), typ = normLite(c.caseType || "");
    if (/دستور/.test(lvl)) return 0;
    if (/نقض/.test(lvl)) return 60;
    if (/اداري/.test(lvl) || /مجلس الدوله/.test(lvl)) return 60;
    if (/امر اداء/.test(typ)) return 15;
    if (/مستعجل/.test(lvl + " " + typ)) return 15;
    if (isCriminalTypeLite(c.caseType)) return 10;
    return 40;
  }
  /** yyyy-mm-dd من نص تاريخ عربي/إنجليزي بأي فاصل — reminders.js يعمل في
      كل شاشة (حتى التي لا تحمّل dateinput.js)، فلا يُعتمَد على
      window.lawyerToISO وحده. يقبل "٢٠٢٦/٧/٢١" أو "2026-07-21" أو
      "21/7/2026" (يوم/شهر/سنة الأكثر شيوعاً في إدخال المكتب). */
  function toISO(raw) {
    if (w.lawyerToISO) { var r = w.lawyerToISO(raw); if (r) return r; }
    var t = la(String(raw || "").trim()).replace(/[.\\]/g, "/").replace(/-/g, "/");
    var p = t.split("/").map(function (x) { return parseInt(x, 10); }).filter(function (n) { return !isNaN(n); });
    if (p.length < 3) return "";
    var y, m, d;
    if (p[0] > 31) { y = p[0]; m = p[1]; d = p[2]; }        /* yyyy/mm/dd */
    else { d = p[0]; m = p[1]; y = p[2]; }                  /* dd/mm/yyyy */
    if (!y || !m || !d) return "";
    return y + "-" + ("0" + m).slice(-2) + "-" + ("0" + d).slice(-2);
  }

  /** يوم اليوم كنص محلي (لا UTC) — مفتاح تكرار التنبيه يومياً. */
  function todayLocal() {
    var d = new Date();
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }

  function read(k, d) {
    try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; }
  }
  function write(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { }
  }
  function ar(n) {
    return String(n == null ? "" : n)
      .replace(/[0-9]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩"[+d]; });
  }
  function la(t) {
    return String(t == null ? "" : t)
      .replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x0660; });
  }

  function prefs() {
    var p = read(PREF, {});
    return {
      on: p.on !== false,                       /* مفعَّل ما لم يُطفأ */
      sessionBefore: p.sessionBefore || DAY,    /* الجلسة: قبل يوم */
      hour: p.hour == null ? 9 : p.hour         /* الجلسة بلا ساعة — تُحسب من ٩ صباحاً */
    };
  }
  function setPrefs(p) { write(PREF, p); }

  /** لحظة استحقاق الجلسة: يومها في الساعة المحدَّدة. */
  function sessionAt(dateISO, hour) {
    var p = String(dateISO).split("-");
    if (p.length < 3) return 0;
    return new Date(+p[0], +p[1] - 1, +p[2], hour, 0, 0).getTime();
  }

  function apptAt(a) {
    var d = la(a.date).replace(/\//g, "-");
    var t = la(a.time || "09:00");
    var p = d.split("-"), q = t.split(":");
    if (p.length < 3) return 0;
    return new Date(+p[0], +p[1] - 1, +p[2],
                    parseInt(q[0], 10) || 9, parseInt(q[1], 10) || 0).getTime();
  }

  /**
   * كل ما يُذكَّر به: جلسات القضايا + المواعيد.
   * @returns [{id, kind, title, detail, at, before}]
   */
  function items() {
    var P = prefs();
    var out = [];

    read(CASES, []).forEach(function (c) {
      if (c.linkedTo) return;                   /* المرتبطة جلساتها جلسات أصلها */
      (c.sessions || []).forEach(function (s, i) {
        if (!s.date) return;
        out.push({
          id: "s_" + c.id + "_" + i,
          kind: "جلسة",
          caseId: c.id,
          title: "جلسة — دعوى " + ar(c.caseNo || "—") +
                 (c.caseYear ? "/" + ar(c.caseYear) : ""),
          detail: [c.courtName, c.circuit,
                   c.hall ? "قاعة " + ar(c.hall) : "",
                   c.clients].filter(Boolean).join(" · "),
          at: sessionAt(s.date, P.hour),
          date: s.date,
          before: s.remindBefore || P.sessionBefore
        });
      });
    });

    read(APPTS, []).forEach(function (a) {
      if (a.done) return;
      out.push({
        id: "a_" + a.id,
        kind: a.kind || "موعد",
        title: a.title || "موعد",
        detail: [a.with, a.notes].filter(Boolean).join(" · "),
        at: apptAt(a),
        date: la(a.date).replace(/\//g, "-"),
        before: a.before || 30
      });
    });

    /* أوراق المحضرين: تنبيه يومي يبدأ ٥ أيام قبل تاريخ الجلسة ويستمر حتى
       تمام الاستلام — هذا هو النص المكتوب فعلاً في شاشة ٠٤-أوراق-المحضرين
       نفسها، ولم يكن منفَّذاً هنا إطلاقاً قبل هذا الإصلاح.

       سجلات data.js مخزَّنة بلا أسماء حقول — مصفوفة v[] بترتيب موضعي
       يطابق ترتيب عناصر الفورم في الصفحة نفسها بالضبط (تحقَّق حياً عبر
       DevTools على الجهاز الحقيقي، لا افتراضاً):
       0 مسلسل · 1 رقم الورقة · 2 قلم محضري · 3 محكمة · 4 نوع الورقة ·
       5 موضوع الورقة · 6 العميل · 7 تاريخ التسليم · 8 تاريخ الجلسة ·
       9 ملاحظات · 10 راديو «تم الاستلام» · 11 راديو «لم يتم». */
    var screens = read(SCREENS, {});
    (screens[BAILIFF] || []).forEach(function (rec, i) {
      var v = (rec && rec.v) || [];
      var received = v[10] && v[10].c;                 /* راديو "تم الاستلام" */
      var iso = toISO((v[8] && v[8].x) || "");
      if (received || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
      var kind = (v[4] && v[4].x) || "", subject = (v[5] && v[5].x) || "",
        client = (v[6] && v[6].x) || "", office = (v[2] && v[2].x) || "",
        court = (v[3] && v[3].x) || "", notes = (v[9] && v[9].x) || "";
      out.push({
        id: "bp_" + (rec._id || i),
        kind: "ورقة محضرين",
        title: "ورقة محضرين — " + (kind || subject || "ورقة") + (client ? " — " + client : ""),
        detail: [office, court, notes].filter(Boolean).join(" · "),
        at: sessionAt(iso, P.hour),
        date: iso,
        before: 5 * DAY
      });
    });

    /* الطعون: تنبيه يومي يبدأ قبل آخر ميعاد للطعن بأسبوع، ويستمر حتى يوم
       الميعاد نفسه — يُحسب من تاريخ الحكم + مدة الطعن (المكتوبة يدوياً أو
       القانونية الافتراضية)، بنفس حساب شاشة "الحكم ومواعيد الطعن". */
    read(CASES, []).forEach(function (c) {
      if (c.linkedTo || !c.judgeDate) return;
      var apDays = parseInt(la(c.appealPeriod || "").replace(/[^0-9]/g, ""), 10);
      if (!(apDays > 0)) apDays = legalAppealDaysLite(c);
      if (!(apDays > 0)) return;
      var jIso = String(c.judgeDate || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(jIso)) return;
      var dl = new Date(jIso + "T00:00:00");
      dl.setDate(dl.getDate() + apDays);
      var dlIso = dl.getFullYear() + "-" + ("0" + (dl.getMonth() + 1)).slice(-2) +
        "-" + ("0" + dl.getDate()).slice(-2);
      /* آخر الميعاد في جمعة أو عطلة رسمية مؤكدة ← أول يوم عمل بعدها (م ١٨ مرافعات) */
      if (w.EgHolidays) dlIso = EgHolidays.extendDeadline(dlIso).iso;
      out.push({
        id: "ap_" + c.id,
        kind: "ميعاد طعن",
        caseId: c.id,
        title: "آخر ميعاد للطعن — دعوى " + ar(c.caseNo || "—") +
               (c.caseYear ? "/" + ar(c.caseYear) : ""),
        detail: [c.courtName, c.clients].filter(Boolean).join(" · "),
        at: sessionAt(dlIso, P.hour),
        date: dlIso,
        before: 7 * DAY
      });
    });

    /* بطاقة الموكل (idExpiry = «البطاقة سارية حتى»): تنبيه يومي قبل انتهائها
       بشهر لحد يوم الانتهاء، علشان نطلب من الموكل البطاقة المحدّثة. */
    read(CLIENTS, []).forEach(function (c) {
      var iso = idIso((c && c.idExpiry) || "");
      if (!c || !c.id || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
      out.push({
        id: "idx_" + c.id,
        kind: "تجديد بطاقة",
        clientId: c.id,
        clientQ: c.officeNo || c.name || "",
        title: "بطاقة الموكل " + (c.name || "") + (c.officeNo ? " (" + ar(c.officeNo) + ")" : "") +
               " بتنتهي — اطلب منه البطاقة المحدّثة",
        detail: "البطاقة سارية حتى " + ar(iso.replace(/-/g, "/")),
        at: sessionAt(iso, P.hour),
        date: iso,
        before: 30 * DAY
      });
    });

    return out.filter(function (x) { return x.at > 0; })
              .sort(function (x, y) { return x.at - y.at; });
  }

  /* «البطاقة سارية حتى» بأي صيغة (ISO أو يوم/شهر/سنة، أرقام عربي) ← YYYY-MM-DD */
  function idIso(v) {
    /* نفس قراءة شاشة الموكلين (ClientsPOA.idExpiryIso): التاريخ وسط كلام، يوم/شهر/سنة،
       أو سنة/شهر بس (← آخر يوم في الشهر). الشاشة دي ممكن ما تحمّلش clients-poa.js */
    if (window.ClientsPOA && ClientsPOA.idExpiryIso) return ClientsPOA.idExpiryIso(v);
    var t = String(v == null ? "" : v).trim().replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x660; })
      .replace(/\s*([-\/.])\s*/g, "$1"), m, y, mo, d;
    if ((m = t.match(/(?:^|\D)(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?!\d)/))) { y = m[1]; mo = m[2]; d = m[3]; }
    else if ((m = t.match(/(?:^|\D)(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})(?!\d)/))) { y = m[3]; mo = m[2]; d = m[1]; }
    else if ((m = t.match(/(?:^|\D)(\d{4})[-\/.](\d{1,2})(?![-\/.]?\d)/))) { y = m[1]; mo = m[2]; d = new Date(+y, +mo, 0).getDate(); }
    else if ((m = t.match(/(?:^|\D)(\d{1,2})[-\/.](\d{4})(?!\d)/))) { y = m[2]; mo = m[1]; d = new Date(+y, +mo, 0).getDate(); }
    else return "";
    if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31 || +y < 1990 || +y > 2100) return "";
    return y + "-" + ("0" + mo).slice(-2) + "-" + ("0" + d).slice(-2);
  }
  /** آخر يوم لسه بنفكّر فيه ببطاقة منتهية: النهارده ناقص ٦٠ يوم */
  function idGrace() {
    var d = new Date(); d.setDate(d.getDate() - 60);
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }

  /** ما استحقّ تذكيره الآن، مرّة واحدة كل يوم — لا مرّة واحدة أبداً كسابقاً.
      أوراق المحضرين ومواعيد الطعن والجلسات الثلاثة تُذكَّر يومياً بمجرد
      دخول مهلتها، وتتوقف بمجرد مضي تاريخها (أو استلام الورقة). راجع
      [[feedback_daily_deadline_reminders]]. */
  function due(now) {
    now = now || Date.now();
    var fired = read(FIRED, {});
    var today = todayLocal();
    return items().filter(function (x) {
      if (fired[x.id + "@" + today]) return false;
      /* انتهى تاريخه — توقّف. إلا البطاقة المنتهية: التذكير بيكمّل لحد ما تتسجّل
         البطاقة الجديدة (أقصاه ٦٠ يوم بعد الانتهاء) علشان الموكل يتطلب منه */
      if (x.date && x.date < today && !(x.kind === "تجديد بطاقة" && x.date >= idGrace())) return false;
      var m = (x.at - now) / 60000;
      return m <= x.before;
    });
  }

  /** القادم خلال مهلته — للعرض لا للتنبيه. */
  function upcoming(now) {
    now = now || Date.now();
    return items().filter(function (x) {
      var m = (x.at - now) / 60000;
      return m > 0 && m <= x.before;
    });
  }

  /** المفتاح يحمل تاريخ اليوم (id@yyyy-mm-dd) فيُعاد التذكير تلقائياً غداً
      طالما العنصر لم يُحذف من due() (انتهى تاريخه أو تم استلامه). */
  function markFired(dailyKey) {
    var f = read(FIRED, {});
    f[dailyKey] = Date.now();
    /* تنظيف ما مضى عليه شهر حتى لا ينتفخ المخزن — لا أسبوع فقط، لأن
       بعض المواعيد (كالطعن) تتكرر التذكرة بها يومياً لأسابيع. */
    var month = Date.now() - 31 * 86400000;
    Object.keys(f).forEach(function (k) { if (f[k] < month) delete f[k]; });
    write(FIRED, f);
  }

  var beeped = false;
  function beep() {
    try {
      var C = w.AudioContext || w.webkitAudioContext;
      if (!C) return;
      var ctx = new C();
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = 880;
      g.gain.value = 0.0001;
      o.connect(g); g.connect(ctx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
      o.stop(ctx.currentTime + 1);
      beeped = true;
    } catch (e) { }
  }

  /** صوت مميّز لمواعيد أوراق المحضرين والطعون والجلسات — ثلاث نغمات
      صاعدة متتالية، يُميَّز فوراً عن صوت beep() العادي (نغمة واحدة) عند
      الطباعة/التنبيهات الأخرى في التطبيق. */
  function beepDeadline() {
    try {
      var C = w.AudioContext || w.webkitAudioContext;
      if (!C) return;
      var ctx = new C();
      [660, 880, 1100].forEach(function (freq, i) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "square"; o.frequency.value = freq;
        g.gain.value = 0.0001;
        o.connect(g); g.connect(ctx.destination);
        var t0 = ctx.currentTime + i * 0.18;
        o.start(t0);
        g.gain.exponentialRampToValueAtTime(0.2, t0 + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
        o.stop(t0 + 0.18);
      });
      beeped = true;
    } catch (e) { }
  }

  var KIND_LABEL = { "جلسة": "جلسة قادمة", "ورقة محضرين": "ورقة محضرين مستحقّة", "ميعاد طعن": "ميعاد طعن يقترب",
                     "تجديد بطاقة": "بطاقة موكل بتنتهي" };

  function tick() {
    if (!prefs().on) return;
    var today = todayLocal();
    due().forEach(function (x) {
      markFired(x.id + "@" + today);
      if (w.PL && w.PL.toast) {
        w.PL.toast(KIND_LABEL[x.kind] || (x.kind + " قادم"),
                   x.title + " — " + ar(String(x.date).replace(/-/g, "/")), "urgent");
      }
      /* الثلاثة اللي طلب المكتب تمييزها صراحة: الجلسات وأوراق المحضرين
         ومواعيد الطعن — بصوت واحد مميّز يفرّقها عن صوت المواعيد العادية. */
      if (x.kind === "جلسة" || x.kind === "ورقة محضرين" || x.kind === "ميعاد طعن") beepDeadline();
      else beep();
    });
  }

  w.Reminders = {
    items: items, due: due, upcoming: upcoming,
    prefs: prefs, setPrefs: setPrefs, tick: tick, beep: beep
  };

  /* يعمل في أي شاشة ما دام التطبيق مفتوحاً */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(tick, 1500); });
  } else { setTimeout(tick, 1500); }
  setInterval(tick, 60000);
})(window);
