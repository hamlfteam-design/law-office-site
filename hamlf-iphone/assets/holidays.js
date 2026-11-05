/* =============================================================================
   العطلات الرسمية المصرية — مصدر واحد للحضور (attendance.js) ولمواعيد الطعن.

   EgHolidays.isHoliday(iso)       عطلة رسمية مؤكدة أو عطلة أضافها المكتب
   EgHolidays.extendDeadline(iso)  آخر ميعاد إجرائي: لو وافق جمعة أو عطلة رسمية
                                   يمتد لأول يوم عمل بعد نهاية العطلة كلها (م ١٨ مرافعات).
     الأعياد اللي تاريخها تقديري (est) بتمدّ كمان (قاعدة المستخدم ٦-١٠) ومعاها تنبيه
     بمراجعة القرار الرسمي. السبت مش عطلة (أقلام الكتاب شغالة).
   ============================================================================= */
(function (w) {
  "use strict";
  var HOL_KEY = "proflawyer.holidays.v1";
  var DATA = {
    2025: [
      { date: "2025-01-07", name: "عيد الميلاد المجيد" },
      { date: "2025-01-25", name: "ثورة 25 يناير وعيد الشرطة" },
      { date: "2025-03-30", name: "عيد الفطر المبارك (1)", est: true },
      { date: "2025-03-31", name: "عيد الفطر المبارك (2)", est: true },
      { date: "2025-04-01", name: "عيد الفطر المبارك (3)", est: true },
      { date: "2025-04-21", name: "عيد شم النسيم" },
      { date: "2025-04-25", name: "عيد تحرير سيناء" },
      { date: "2025-05-01", name: "عيد العمال" },
      { date: "2025-06-06", name: "عيد الأضحى المبارك (1)", est: true },
      { date: "2025-06-07", name: "عيد الأضحى المبارك (2)", est: true },
      { date: "2025-06-08", name: "عيد الأضحى المبارك (3)", est: true },
      { date: "2025-06-26", name: "رأس السنة الهجرية", est: true },
      { date: "2025-06-30", name: "ثورة 30 يونيو" },
      { date: "2025-07-23", name: "ثورة 23 يوليو" },
      { date: "2025-09-04", name: "المولد النبوي الشريف", est: true },
      { date: "2025-10-06", name: "عيد القوات المسلحة" }
    ],
    2026: [
      { date: "2026-01-07", name: "عيد الميلاد المجيد" },
      { date: "2026-01-25", name: "ثورة 25 يناير وعيد الشرطة" },
      { date: "2026-03-19", name: "عيد الفطر المبارك (1)", est: true },
      { date: "2026-03-20", name: "عيد الفطر المبارك (2)", est: true },
      { date: "2026-03-21", name: "عيد الفطر المبارك (3)", est: true },
      { date: "2026-04-13", name: "عيد شم النسيم" },
      { date: "2026-04-25", name: "عيد تحرير سيناء" },
      { date: "2026-05-07", name: "عيد العمال (منقول بقرار مجلس الوزراء)" },
      { date: "2026-05-26", name: "وقفة عرفات", est: true },
      { date: "2026-05-27", name: "عيد الأضحى المبارك (1)", est: true },
      { date: "2026-05-28", name: "عيد الأضحى المبارك (2)", est: true },
      { date: "2026-05-29", name: "عيد الأضحى المبارك (3)", est: true },
      { date: "2026-05-30", name: "عيد الأضحى المبارك (4)", est: true },
      { date: "2026-06-16", name: "رأس السنة الهجرية", est: true },
      { date: "2026-06-30", name: "ثورة 30 يونيو" },
      { date: "2026-07-23", name: "ثورة 23 يوليو" },
      { date: "2026-08-26", name: "المولد النبوي الشريف", est: true },
      { date: "2026-10-06", name: "عيد القوات المسلحة" }
    ],
    2027: [
      { date: "2027-01-07", name: "عيد الميلاد المجيد" },
      { date: "2027-01-25", name: "ثورة 25 يناير وعيد الشرطة" },
      { date: "2027-03-10", name: "عيد الفطر المبارك (1)", est: true },
      { date: "2027-03-11", name: "عيد الفطر المبارك (2)", est: true },
      { date: "2027-03-12", name: "عيد الفطر المبارك (3)", est: true },
      { date: "2027-04-13", name: "عيد شم النسيم" },
      { date: "2027-04-25", name: "عيد تحرير سيناء" },
      { date: "2027-05-01", name: "عيد العمال" },
      { date: "2027-05-16", name: "وقفة عرفات", est: true },
      { date: "2027-05-17", name: "عيد الأضحى المبارك (1)", est: true },
      { date: "2027-05-18", name: "عيد الأضحى المبارك (2)", est: true },
      { date: "2027-05-19", name: "عيد الأضحى المبارك (3)", est: true },
      { date: "2027-05-20", name: "عيد الأضحى المبارك (4)", est: true },
      { date: "2027-06-07", name: "رأس السنة الهجرية", est: true },
      { date: "2027-06-30", name: "ثورة 30 يونيو" },
      { date: "2027-07-23", name: "ثورة 23 يوليو" },
      { date: "2027-08-15", name: "المولد النبوي الشريف", est: true },
      { date: "2027-10-06", name: "عيد القوات المسلحة" }
    ]
  };

  function iso(d) {
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }
  function official(y) { return DATA[y] || []; }
  function officialOn(ds) {
    return official(+String(ds).slice(0, 4)).filter(function (h) { return h.date === ds; })[0] || null;
  }
  function custom() {
    try { return JSON.parse(localStorage.getItem(HOL_KEY)) || []; } catch (e) { return []; }
  }
  function customOn(ds) { return custom().filter(function (h) { return h.date === ds; })[0] || null; }
  function isFriday(ds) { return new Date(ds + "T12:00:00").getDay() === 5; }
  function isHoliday(ds) { return !!officialOn(ds) || !!customOn(ds); }

  /** { iso, shifted, from, reasons:[..], warn } — iso = آخر ميعاد بعد المد. */
  function extendDeadline(ds) {
    var out = { iso: ds, shifted: false, from: ds, reasons: [], warn: "" };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) return out;
    var d = new Date(ds + "T12:00:00");
    for (var guard = 0; guard < 20; guard++) {
      var cur = iso(d), off = officialOn(cur), cu = customOn(cur);
      /* قاعدة المستخدم (٦-١٠): لو آخر يوم صادف عطلة رسمية (حتى العيد — الوقفة + ٤ أيام) الميعاد
         يمتد لأول يوم عمل بعد ما العطلة كلها تخلص. العطلة التقديرية بتمدّ كمان، مع تنبيه بمراجعة القرار الرسمي. */
      var sure = off || cu || isFriday(cur);
      if (!sure) break;
      if (off && off.est) out.warn = "الامتداد محسوب على " + off.name + " (" + cur + ") وتاريخها تقديري — راجع قرار الإجازة الرسمي";
      out.reasons.push(off ? off.name : (cu ? cu.name : "الجمعة"));
      d.setDate(d.getDate() + 1);
      out.shifted = true;
    }
    out.iso = iso(d);
    return out;
  }

  w.EgHolidays = { DATA: DATA, official: official, officialOn: officialOn, custom: custom,
                   isHoliday: isHoliday, isFriday: isFriday, extendDeadline: extendDeadline };
})(window);
