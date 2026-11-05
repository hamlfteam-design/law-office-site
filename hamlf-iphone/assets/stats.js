/* =============================================================================
   إحصاءات حقيقية.

   الأرقام في الشاشة الرئيسية والأقسام كانت **ثابتة في الصفحة** (٤٨ ملف،
   ١٢٨ ورقة محضرين، ٣١ توكيل) لا علاقة لها بما أدخله المستخدم، والضغط
   عليها لا يعرض شيئاً. هذا الملف يستبدلها بأرقام مقروءة من البيانات
   الفعلية، ويجعلها تفتح مركز السجلات على ما تعدّه.

   يُحمَّل بعد store.js.
   ============================================================================= */
(function (w) {
  "use strict";

  function ar(n) {
    return String(n).replace(/[0-9]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩"[+d]; });
  }
  function read(k, d) {
    try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; }
  }

  var DECISION_HOLD  = /حكم|حجز|للحكم|للنطق/;
  var DECISION_EXP   = /خبير|تقرير|مفوض|مفردات/;
  var DECISION_FIRST = /أول جلسة|اول جلسة|أول جلسه/;

  /** إحصاء شامل عبر كل المخازن */
  function compute() {
    var agenda = read("proflawyer.agenda.cases.v1", []);
    var screens = read("proflawyer.screens.v1", {});
    var appts = read("proflawyer.appointments.v1", []);
    var team = read("proflawyer.team.v1", {});

    var today = new Date();
    var iso = function (d) { return d.toISOString().slice(0, 10); };
    var todayIso = iso(today);
    var monthPre = todayIso.slice(0, 7);

    var s = {
      cases: agenda.length,
      screenCases: (screens["01-cases"] || []).length,
      bailiff: (screens["04-bailiff-papers"] || []).length,
      poa: (screens["05-powers-of-attorney"] || []).length,
      minutes: (screens["82-minutes"] || []).length,
      experts: (screens["83-experts"] || []).length,
      forgery: (screens["84-forgery"] || []).length,
      clients: read("proflawyer.agenda.clients.v1", []).length,
      assignments: (team.assignments || []).length,
      appointments: appts.length,

      sessionsTotal: 0, sessionsMonth: 0, sessionsToday: 0, sessionsUpcoming: 0,
      heldForJudgment: 0, withExpert: 0, firstSession: 0,
      casesThisMonth: 0
    };

    var seenMonth = {};
    agenda.forEach(function (c) {
      var inMonth = false, hold = false, exp = false, first = false;
      (c.sessions || []).forEach(function (ss) {
        var d = ss.date;
        if (!d) return;
        s.sessionsTotal++;
        if (d.indexOf(monthPre) === 0) { s.sessionsMonth++; inMonth = true; }
        if (d === todayIso) s.sessionsToday++;
        if (d >= todayIso) s.sessionsUpcoming++;

        var _r = ss.raw || {};
        var dec = [_r.result, _r.decision, _r["for"], _r.reason, ss.decision].filter(Boolean).join(" ");
        if (DECISION_HOLD.test(dec))  hold = true;
        if (DECISION_EXP.test(dec))   exp = true;
        if (DECISION_FIRST.test(dec)) first = true;
      });
      if (inMonth && !seenMonth[c.id]) { s.casesThisMonth++; seenMonth[c.id] = 1; }
      if (hold)  s.heldForJudgment++;
      if (exp)   s.withExpert++;
      if (first) s.firstSession++;
    });

    /* المواعيد القادمة */
    s.apptsUpcoming = appts.filter(function (a) {
      var d = w.lawyerToISO ? w.lawyerToISO(a.date) : a.date;
      return !a.done && d && d >= todayIso;
    }).length;

    s.apptsToday = appts.filter(function (a) {
      var d = w.lawyerToISO ? w.lawyerToISO(a.date) : a.date;
      return !a.done && d === todayIso;
    }).length;

    var asg = team.assignments || [];
    s.tasksOpen = asg.filter(function (a) { return a.state !== "تم"; }).length;
    s.tasksLate = asg.filter(function (a) {
      var d = w.lawyerToISO ? w.lawyerToISO(a.due) : a.due;
      return a.state !== "تم" && d && d < todayIso;
    }).length;

    s.totalRecords = w.LawyerStore ? w.LawyerStore.all().length : 0;
    return s;
  }

  /**
   * يستبدل الأرقام الثابتة في بطاقات الإحصاء.
   * كل بطاقة تُعرف من نص وصفها، فنضع الرقم الحقيقي مكانه ونجعلها قابلة للضغط.
   */
  var LABELS = [
    [/ملف نشط|ملف قضية|ملفات/, function (s) { return s.cases + s.screenCases; }, "88-records.html"],
    [/ورقة محضرين|أوراق المحضرين/, function (s) { return s.bailiff; }, "04-bailiff-papers.html"],
    [/توكيل/,                      function (s) { return s.poa; },     "05-powers-of-attorney.html"],
    [/جلسات اليوم/,                function (s) { return s.sessionsToday; }, "87-calendar.html"],
    [/تنبيهات/,                    function (s) { return s.apptsUpcoming; }, "85-appointments.html"],
    [/موظف/,                       function (s) { return (read("proflawyer.team.v1", {}).users || []).length; }, "80-team.html"],
    [/عقد ينتهي|عقد/,              function (s) { return (read("proflawyer.screens.v1", {})["41-contract"] || []).length; }, "41-contract.html"],
    [/إقامة تنتهي|إقامة/,          function (s) { return (read("proflawyer.screens.v1", {})["45-residency"] || []).length; }, "45-residency.html"],
    [/موكل/,                       function (s) { return s.clients; }, "88-records.html"],
    [/مواعيد اليوم/,               function (s) { return s.apptsToday; },    "85-appointments.html"],
    [/مواعيد|موعد/,                function (s) { return s.apptsUpcoming; }, "85-appointments.html"],
    [/مهام مفتوحة|مهمة مفتوحة/,    function (s) { return s.tasksOpen; },     "81-assignments.html"],
    [/متأخرة|متأخر/,               function (s) { return s.tasksLate; },     "81-assignments.html"],
    [/تكليف/,                      function (s) { return s.assignments; },   "81-assignments.html"],
    [/محضر/,                       function (s) { return s.minutes; },       "82-minutes.html"],
    [/خبير|خبراء/,                 function (s) { return s.experts; },       "83-experts.html"],
    [/طعن|تزوير/,                  function (s) { return s.forgery; },       "84-forgery.html"],
    [/جلسة|جلسات/,                 function (s) { return s.sessionsToday; }, "87-calendar.html"]
  ];

  function apply() {
    var s = compute();

    document.querySelectorAll(".stat").forEach(function (box) {
      var lab = box.querySelector(".l");
      var num = box.querySelector(".n");
      if (!lab || !num) return;
      var text = lab.textContent.trim();
      for (var i = 0; i < LABELS.length; i++) {
        if (LABELS[i][0].test(text)) {
          var v = LABELS[i][1](s);
          num.textContent = ar(v);
          if (!v) { box.style.opacity = ".55"; }
          var href = LABELS[i][2];
          if (!box.dataset.linked) {
            box.dataset.linked = "1";
            box.style.cursor = "pointer";
            box.addEventListener("click", function () { location.href = href; });
          }
          return;
        }
      }

      /* لم نتعرّف على هذه البطاقة: الرقم المكتوب فيها ثابت لا يعبّر عن شيء،
         فنُخفيه بدل أن يوهم المستخدم بعدد ليس له أصل. */
      if (!box.dataset.unknownCleared) {
        box.dataset.unknownCleared = "1";
        num.textContent = "—";
        box.style.opacity = ".45";
        box.title = "غير محسوب من بياناتك";
      }
    });
  }


  /* ---------------------------------------------------- أوصاف البطاقات
     نصوص مثل «٤ جلسات — شمال القاهرة» و«آخر نسخة منذ ١٤ يوماً» كانت مكتوبة
     في الصفحة ولا تتغيّر. نستبدلها بالواقع، أو نُخفيها إن لم يكن هناك ما يُقال. */

  var DESCS = [
    { match: /جلسات اليوم/, sel: '[href="06-today.html"]',
      text: function (s) {
        return s.sessionsToday ? ar(s.sessionsToday) + " جلسة اليوم"
                               : "لا جلسات اليوم";
      } },
    { match: /مركز التنبيهات/, sel: '[href="07-alerts.html"]',
      text: function (s) {
        return s.apptsUpcoming ? ar(s.apptsUpcoming) + " موعد قادم"
                               : "لا تنبيهات";
      } },
    { match: /^بحث شامل$/, sel: '[href="93-find.html"]',
      text: function (s) { return "ابحث في " + ar(s.totalRecords) + " سجلاً"; } },
    { match: /النسخ الاحتياطي/, sel: '[href="09-backup.html"]',
      text: function () {
        var t;
        try { t = localStorage.getItem("proflawyer.lastBackup"); } catch (e) { t = null; }
        if (!t) return "لم تُؤخذ نسخة بعد";
        var days = Math.floor((Date.now() - new Date(t)) / 86400000);
        return days <= 0 ? "آخر نسخة اليوم" : "آخر نسخة منذ " + ar(days) + " يوماً";
      } }
  ];

  function applyDescs() {
    var s = compute();
    DESCS.forEach(function (d) {
      document.querySelectorAll(d.sel).forEach(function (a) {
        var t = a.querySelector(".t, .nm");
        var sub = a.querySelector(".d");
        if (!sub) return;
        if (t && !d.match.test(t.textContent.trim())) return;
        sub.textContent = d.text(s);
      });
    });
  }

  w.LawyerStats = { compute: compute, apply: apply,
                    applyDescs: applyDescs, ar: ar };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(function () { apply(); applyDescs(); }, 250);
    });
  } else { setTimeout(function () { apply(); applyDescs(); }, 250); }
})(window);
