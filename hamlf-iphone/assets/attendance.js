/* =============================================================================
   الحضور والانصراف وحساب الأجر — موديول داخل التطبيق (تخزين محلي، بلا سيرفر).

   يعيد استخدام قائمة الموظفين الموجودة أصلاً (Team.T.users من team.js) بدل
   قائمة منفصلة مكررة — إضافة موظف هنا تعني إضافته في «المحامون والصلاحيات».
   الراتب الأساسي لكل موظف يُخزَّن هنا (proflawyer.att.salaries.v1) حتى لا
   يُلمَس ملف الفريق المقفول.

   القواعد الحسابية منقولة بحذافيرها من البريف المعتمد (attendance-project):
     - صباحية بالمحكمة ٣٫٥ ساعة (٩–١٢:٣٠) + مسائية بالمكتب ٥ ساعات (١–٦).
     - الخميس ٥ ساعات دوام مختصر بلا تقسيم فترتين. الجمعة والعطلات الرسمية صفر.
     - كل فترة لا تُحتسب أبداً إلا بإثبات تواجد (وقت إرسال رسالة الموقع).
     - غياب بلا إثبات لفترة بعينها = خصم ضعف ساعات تلك الفترة فقط.
     - تأخير المكتب ١–٢ ساعة رغم الإثبات = خصم نصف ساعات فترة المكتب.
     - تأخير أكثر من ساعتين = معاملة عدم الإثبات كاملة لفترة المكتب.
     - غياب بلا إذن مسبق لليوم كله = خصم ضعف الساعات المتوقعة لليوم.
     - غياب بإذن مسبق = بلا خصم، الساعات تُحتسب كاملة.
     - يوم عمل فات بلا أي تسجيل = غياب بلا إذن تلقائياً (ضعف الساعات)، بدءاً من
       «تاريخ بدء التطبيق» (افتراضياً ١ أكتوبر ٢٠٢٦) أو من اليوم التالي لإضافة
       الموظف للفريق لو اتضاف بعده. قبل البدء = اليوم محسوب كامل بلا خصم. اليوم
       الجاري واللي لسه ما جاش = "لم يُستحق" محسوب كامل لحد ما يعدّي.
       المالك والموكل خارج الغياب التلقائي. الإذن المسبق يحطّه المدير/المحاسب بس.
     - الراتب بسجلّ تاريخي: كل قيمة «تسري من شهر»، فتعديله ما يغيّرش الشهور اللي فاتت.
     - الحوافز والمكافآت لكل موظف/شهر بتتضاف على الأجر بعد الخصم (مش بتدخل في نسبة الخصم).
   ============================================================================= */
(function (w) {
  "use strict";

  var ATT_KEY  = "proflawyer.attendance.v1";
  var HOL_KEY  = "proflawyer.holidays.v1";
  var SAL_KEY  = "proflawyer.att.salaries.v1";
  var ALERT_KEY = "proflawyer.att.alerts.v1";   /* تاريخ التنبيهات التأديبية السابقة لكل موظف/شهر */
  var POLICY_KEY = "proflawyer.att.policy.v1";  /* { start: "YYYY-MM-DD" } بدء تطبيق الغياب التلقائي */
  var BONUS_KEY  = "proflawyer.att.bonuses.v1"; /* { empId: [{id, ym, kind, amount, note, at}] } */
  var DEFAULT_POLICY_START = "2026-10-01";
  var PAYSYNC_KEY = "proflawyer.att.paysync.v1"; /* { docId: {at, dirty} } آخر نسخة معروفة من السحابة */

  var WORK = {
    courtHours: 3.5, officeHours: 5, thursdayHours: 5, fullDayHours: 8.5,
    officeStart: "13:00"
  };

  function read(key, def) {
    try { return JSON.parse(localStorage.getItem(key)) || def; } catch (e) { return def; }
  }
  function write(key, v) {
    try { localStorage.setItem(key, JSON.stringify(v)); return true; }
    catch (e) { alert("تعذّر الحفظ — المساحة ممتلئة."); return false; }
  }

  /* ------------------------------------------------------------ الموظفون */

  /* على جهاز المحامي (نسخة المحامين) قائمة الفريق المحلية فاضية — قائمة الفريق بتيجي
     من السحابة مع الصلاحيات (officeJson.team اللي بيرفعها المدير، team.js pushRoles)،
     والمستخدم الحالي بيتعرّف ببريده مش برقم حسابه السحابي («cloud:…»). من غير ده
     المحامي كان بيفتح الحضور يلاقي «لا يوجد موظفون» ومايقدرش يبعت موقعه. */
  function lc(v) { return String(v || "").trim().toLowerCase(); }
  function officeTeam() {
    try {
      var rc = JSON.parse(localStorage.getItem("proflawyer.cloudrole.v1")) || {};
      return (rc.office && rc.office.team) || [];
    } catch (e) { return []; }
  }
  function employees() {
    var T = (w.Team && w.Team.data) ? w.Team.data : read("proflawyer.team.v1", { users: [] });
    var list = (T.users || []).filter(function (u) { return u.active !== false; });
    var have = {};
    list.forEach(function (u) { if (u.email) have[lc(u.email)] = 1; });
    officeTeam().forEach(function (t) {
      var em = lc(t.email);
      if (!em || have[em]) return;
      have[em] = 1;
      list.push({ id: t.id, name: t.name || em, email: em, role: "lawyer", active: true, fromOffice: true });
    });
    var me = (w.Team && Team.current) ? Team.current() : null;
    if (me && me.email && !have[lc(me.email)] && me.role && me.role !== "none") {
      list.push({ id: me.id, name: me.name || me.email, email: lc(me.email), role: me.role, active: true });
    }
    return list;
  }
  /** الموظف اللي ماسك الجهاز دلوقتي — بالبريد الأول، وبعدين بالرقم */
  function meEmp() {
    var me = (w.Team && Team.current) ? Team.current() : null;
    if (!me) return null;
    var es = employees(), em = lc(me.email);
    return (em && es.filter(function (e) { return lc(e.email) === em; })[0]) ||
           es.filter(function (e) { return e.id === me.id; })[0] || null;
  }
  function salaries() { return read(SAL_KEY, {}); }
  function ymOf(d) { return String(d || "").slice(0, 7); }
  /* سجل الراتب: [{from:"YYYY-MM", amount}] مرتّب. الرقم القديم المفرد = ساري من الأول. */
  function salaryHistory(empId) {
    var v = salaries()[empId];
    if (v == null) return [];
    if (typeof v === "number") return v ? [{ from: "0000-00", amount: v }] : [];
    return (v || []).slice().sort(function (a, b) { return a.from < b.from ? -1 : 1; });
  }
  function setSalary(empId, val, fromYm) {
    fromYm = fromYm || ymOf(todayStr());
    var s = salaries();
    var h = salaryHistory(empId).filter(function (x) { return x.from !== fromYm; });
    h.push({ from: fromYm, amount: +val || 0 });
    h.sort(function (a, b) { return a.from < b.from ? -1 : 1; });
    s[empId] = h; write(SAL_KEY, s);
    pushEmpPayroll(empId);
  }
  function removeSalaryStep(empId, fromYm) {
    var s = salaries();
    s[empId] = salaryHistory(empId).filter(function (x) { return x.from !== fromYm; });
    write(SAL_KEY, s);
    pushEmpPayroll(empId);
  }
  function salaryOf(empId, ym) {
    ym = ym || ymOf(todayStr());
    var amt = 0;
    salaryHistory(empId).forEach(function (x) { if (x.from <= ym) amt = x.amount; });
    return amt;
  }

  /* ------------------------------------------------ الحوافز والمكافآت */
  function bonusesFor(empId, ym) {
    var b = read(BONUS_KEY, {});
    return (b[empId] || []).filter(function (x) { return x.ym === ym; });
  }
  function addBonus(empId, ym, kind, amount, note) {
    var b = read(BONUS_KEY, {});
    (b[empId] = b[empId] || []).push({
      id: "b" + Date.now().toString(36), ym: ym, kind: kind || "حافز",
      amount: +amount || 0, note: note || "", at: Date.now()
    });
    write(BONUS_KEY, b);
    pushEmpPayroll(empId);
  }
  function removeBonus(empId, id) {
    var b = read(BONUS_KEY, {});
    b[empId] = (b[empId] || []).filter(function (x) { return x.id !== id; });
    write(BONUS_KEY, b);
    pushEmpPayroll(empId);
  }

  /* -------------------------------------------- بدء تطبيق الغياب التلقائي */
  function policyStart() { return read(POLICY_KEY, {}).start || DEFAULT_POLICY_START; }
  function setPolicyStart(d) {
    var p = read(POLICY_KEY, {}); p.start = d || DEFAULT_POLICY_START; write(POLICY_KEY, p);
    pushPayrollDoc("policy", { start: p.start });
  }

  /* ---------------------------------------- مزامنة الرواتب مع السحابة
     مستند لكل موظف (بمفتاح إيميله — نفس ربط سجلات الحضور بين الأجهزة، لأن
     قائمة الفريق محلية وأرقامها مختلفة من جهاز لجهاز) + مستند «policy».
     الأحدث يكسب (at). التعديل اللي ما اترفعش (dirty) بيترفع أول ما النت يرجع
     وقبل أي سحب، فما يتمسحش بنسخة أقدم. */
  function empById(empId) { return employees().filter(function (e) { return e.id === empId; })[0]; }
  function payDocId(email) { return "emp_" + String(email).toLowerCase().replace(/[^a-z0-9]/g, "_"); }
  function empPayrollObj(empId) {
    var u = empById(empId);
    if (!u || !u.email) return null;
    return { email: String(u.email).toLowerCase(), salaries: salaryHistory(empId),
             bonuses: read(BONUS_KEY, {})[empId] || [] };
  }
  function pushPayrollDoc(docId, obj) {
    var meta = read(PAYSYNC_KEY, {});
    obj.at = Date.now();
    meta[docId] = { at: obj.at, dirty: true, obj: obj };
    write(PAYSYNC_KEY, meta);
    if (!(w.CloudStore && CloudStore.payroll)) return;
    CloudStore.payroll.save(docId, obj, function (ok) {
      if (!ok) return;
      var m = read(PAYSYNC_KEY, {});
      if (m[docId] && m[docId].at === obj.at) { m[docId] = { at: obj.at }; write(PAYSYNC_KEY, m); }
    });
  }
  function pushEmpPayroll(empId) {
    var obj = empPayrollObj(empId);
    if (obj) pushPayrollDoc(payDocId(obj.email), obj);
  }
  /* done(changed) — changed = عدد المستندات اللي اتحدّثت محلياً، أو null لو مفيش اتصال/صلاحية */
  function pullPayroll(done) {
    if (!(w.CloudStore && CloudStore.payroll)) { if (done) done(null); return; }
    var meta = read(PAYSYNC_KEY, {});
    /* رواتب/حوافز محلية اتسجّلت قبل المزامنة (ملهاش meta) → اعتبرها لسه ما اترفعتش */
    employees().forEach(function (e) {
      var o = empPayrollObj(e.id);
      if (!o) return;
      var id = payDocId(o.email);
      if (!meta[id] && (o.salaries.length || o.bonuses.length)) pushPayrollDoc(id, o);
    });
    meta = read(PAYSYNC_KEY, {});
    Object.keys(meta).forEach(function (id) {
      if (meta[id].dirty && meta[id].obj) CloudStore.payroll.save(id, meta[id].obj, function (ok) {
        if (!ok) return;
        var m = read(PAYSYNC_KEY, {});
        if (m[id] && m[id].at === meta[id].at) { m[id] = { at: meta[id].at }; write(PAYSYNC_KEY, m); }
      });
    });
    CloudStore.payroll.list(function (docs) {
      if (!docs) { if (done) done(null); return; }
      var m = read(PAYSYNC_KEY, {}), n = 0;
      var sal = salaries(), bon = read(BONUS_KEY, {}), emps = employees();
      docs.forEach(function (d) {
        var id = d.email ? payDocId(d.email) : (d.start ? "policy" : "");
        if (!id) return;
        var loc = m[id];
        if (loc && (loc.dirty || (loc.at || 0) >= (d.at || 0))) return;
        if (id === "policy") {
          var p = read(POLICY_KEY, {}); p.start = d.start; write(POLICY_KEY, p);
        } else {
          var emp = emps.filter(function (u) { return String(u.email || "").toLowerCase() === d.email; })[0];
          if (!emp) return;
          sal[emp.id] = d.salaries || [];
          bon[emp.id] = d.bonuses || [];
        }
        m[id] = { at: d.at || 0 }; n++;
      });
      if (n) { write(SAL_KEY, sal); write(BONUS_KEY, bon); write(PAYSYNC_KEY, m); }
      if (done) done(n);
    });
  }
  function addDays(d, n) {
    var x = new Date(d + "T12:00:00"); x.setDate(x.getDate() + n);
    return localDateStr(x);
  }
  /* أول يوم تنطبق فيه القاعدة على الموظف؛ "" = لا تنطبق (المالك والموكل). */
  function ruleStartFor(empId) {
    var u = employees().filter(function (e) { return e.id === empId; })[0];
    if (u && (u.role === "owner" || u.role === "client")) return "";
    var start = policyStart();
    var m = /^u(\d{12,})$/.exec(empId);          /* id = "u" + وقت الإضافة للفريق */
    if (m) {
      var joined = addDays(localDateStr(new Date(+m[1])), 1);
      if (joined > start) start = joined;
    }
    return start;
  }

  /* ------------------------------------------------------------ العطلات */

  /* البيانات في holidays.js (مصدر واحد مع مواعيد الطعن) — النسخة هنا احتياطي لو مش متحمّل */
  var OFFICIAL_HOLIDAYS = (w.EgHolidays && w.EgHolidays.DATA) || {
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
      { date: "2026-05-26", name: "عيد الأضحى المبارك (1)", est: true },
      { date: "2026-05-27", name: "عيد الأضحى المبارك (2)", est: true },
      { date: "2026-05-28", name: "عيد الأضحى المبارك (3)", est: true },
      { date: "2026-06-16", name: "رأس السنة الهجرية", est: true },
      { date: "2026-06-30", name: "ثورة 30 يونيو" },
      { date: "2026-07-23", name: "ثورة 23 يوليو" },
      { date: "2026-08-26", name: "المولد النبوي الشريف", est: true },
      { date: "2026-10-06", name: "عيد القوات المسلحة" }
    ],
    2027: [
      { date: "2027-01-07", name: "عيد الميلاد المجيد" },
      { date: "2027-01-25", name: "ثورة 25 يناير وعيد الشرطة" },
      { date: "2027-04-13", name: "عيد شم النسيم" },
      { date: "2027-04-25", name: "عيد تحرير سيناء" },
      { date: "2027-05-01", name: "عيد العمال" },
      { date: "2027-06-30", name: "ثورة 30 يونيو" },
      { date: "2027-07-23", name: "ثورة 23 يوليو" },
      { date: "2027-10-06", name: "عيد القوات المسلحة" }
    ]
  };
  function officialHolidaysForYear(y) { return OFFICIAL_HOLIDAYS[y] || []; }
  function officialHolidayOn(dateStr) {
    var y = +String(dateStr).slice(0, 4);
    return officialHolidaysForYear(y).filter(function (h) { return h.date === dateStr; })[0];
  }
  function customHolidays() { return read(HOL_KEY, []); }
  function addHoliday(date, name) {
    var h = customHolidays(); h.push({ id: "h" + Date.now().toString(36), date: date, name: name || "عطلة إدارية" });
    write(HOL_KEY, h);
    syncNotifications();
  }
  function removeHoliday(id) {
    write(HOL_KEY, customHolidays().filter(function (h) { return h.id !== id; }));
    syncNotifications();
  }
  function isHoliday(dateStr) {
    return !!officialHolidayOn(dateStr) || customHolidays().some(function (h) { return h.date === dateStr; });
  }
  function holidayNameOn(dateStr) {
    var off = officialHolidayOn(dateStr);
    if (off) return off.name;
    var c = customHolidays().filter(function (h) { return h.date === dateStr; })[0];
    return c ? c.name : "";
  }

  function isFriday(dateStr) { return new Date(dateStr + "T12:00:00").getDay() === 5; }
  function isThursday(dateStr) { return new Date(dateStr + "T12:00:00").getDay() === 4; }

  /* --------------------------------------------------------- جدول الأسبوع
     كل مكتب له نظامه: بعضها يعمل الخميس ويعطّل الجمعة، وبعضها العكس، وبعضها
     الخميس محكمة فقط لا مكتب (أو العكس) — كله قابل للتخصيص من الإعدادات،
     لا يوم مثبَّت في الكود. الأنواع:
       full   — يومٌ كامل بفترتين (محكمة ٣٫٥س + مكتب ٥س) كالأحد–الأربعاء المعتاد.
       court  — فترة واحدة بالمحكمة فقط، مدتها dayHours.
       office — فترة واحدة بالمكتب فقط، مدتها dayHours.
       off    — عطلة أسبوعية، صفر ساعات. */
  var SCHEDULE_KEY = "proflawyer.att.schedule.v1";
  var DOW_NAMES = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

  function defaultSchedule() {
    /* الافتراضي لهذا المكتب: الأحد–الأربعاء دوام كامل، الخميس محكمة فقط
       (٥ ساعات، بلا فترة مكتب)، الجمعة عطلة أسبوعية، السبت دوام كامل. */
    return {
      0: { type: "full" }, 1: { type: "full" }, 2: { type: "full" }, 3: { type: "full" },
      4: { type: "court", hours: 5 }, 5: { type: "off" }, 6: { type: "off" }
    };
  }
  function getSchedule() {
    var s = read(SCHEDULE_KEY, null);
    if (!s) { s = defaultSchedule(); write(SCHEDULE_KEY, s); }
    return s;
  }
  function setDaySchedule(dow, cfg) {
    var s = getSchedule(); s[dow] = cfg; write(SCHEDULE_KEY, s);
    syncNotifications();
  }
  function dayConfig(dateStr) {
    var dow = new Date(dateStr + "T12:00:00").getDay();
    return getSchedule()[dow] || { type: "off" };
  }

  function expectedHoursFor(dateStr) {
    if (isHoliday(dateStr)) return 0;
    var c = dayConfig(dateStr);
    if (c.type === "off") return 0;
    if (c.type === "full") return WORK.courtHours + WORK.officeHours;
    return +c.hours || 0;
  }
  function daysInMonth(ym) {
    var p = ym.split("-"); return new Date(+p[0], +p[1], 0).getDate();
  }
  function monthDates(ym) {
    var n = daysInMonth(ym), out = [];
    for (var d = 1; d <= n; d++) out.push(ym + "-" + (d < 10 ? "0" + d : d));
    return out;
  }
  function timeToMin(t) {
    if (!t) return null;
    var p = t.split(":"); return (+p[0]) * 60 + (+p[1]);
  }
  function localDateStr(x) {
    var mo = x.getMonth() + 1, da = x.getDate();
    return x.getFullYear() + "-" + (mo < 10 ? "0" : "") + mo + "-" + (da < 10 ? "0" : "") + da;
  }
  /* تاريخ اليوم بتوقيت الجهاز (مصر) — toISOString كان بيدّي تاريخ امبارح من ١٢ لـ٣ الفجر. */
  function todayStr() { return localDateStr(new Date()); }

  /* ------------------------------------------------------------- السجلات */

  function attKey(empId, date) { return empId + "__" + date; }
  function blankRecord() { return { status: "present", courtEntries: [], officeIn: "", officeOut: "", tasks: [], note: "" }; }
  function allRecords() { return read(ATT_KEY, {}); }
  function getRecord(empId, date) {
    var all = allRecords();
    var r = all[attKey(empId, date)];
    return r ? JSON.parse(JSON.stringify(r)) : blankRecord();
  }
  /* إثبات الحضور: رسالة موقع حية من البرنامج، أو إدخال يدوي اعتمده المدير.
     الإدخال اليدوي من غير اعتماد = مفيش إثبات (غياب بخصم مضاعف). */
  function entryLive(c) { return !!(c && c.live && c.lat != null); }
  function entryCounts(c) { return !!(c && c.time && (entryLive(c) || c.confirmed)); }
  function officeLive(rec) {
    var L = rec && rec.officeInLoc;
    return !!(rec && rec.officeIn && L && L.live && L.lat != null && (!L.time || L.time === rec.officeIn));
  }
  function officeCounts(rec) { return !!(rec && rec.officeIn && (officeLive(rec) || rec.officeConfirmed)); }

  function myEmail() {
    var u = (w.Team && Team.current) ? Team.current() : null;
    var e = (u && u.email) || "";
    if (!e && w.Auth && Auth.session) { var se = Auth.session(); e = (se && se.email) || ""; }
    return String(e).toLowerCase();
  }
  function saveRecord(empId, date, rec) {
    var all = allRecords();
    rec.updatedAt = Date.now();
    all[attKey(empId, date)] = rec;
    var ok = write(ATT_KEY, all);
    /* مزامنة سحابية باسم المحامي (بريده) ليراها المدير — لا تُرفع الرواتب إطلاقاً */
    try {
      var emp = employees().filter(function (u) { return u.id === empId; })[0];
      var em = String((emp && emp.email) || myEmail()).toLowerCase();
      if (em && w.CloudStore && CloudStore.collection) {
        var copy = JSON.parse(JSON.stringify(rec)); copy.empEmail = em; copy.date = date;
        CloudStore.collection.save("attendance", em.replace(/[^a-z0-9]/g, "_") + "__" + date, copy);
      }
    } catch (e) { }
    syncNotifications();   /* الفترة اللي اتسجّلت ما يجيلهاش «آخر فرصة» */
    return ok;
  }

  /** يجلب سجلات حضور الآخرين + مقرّات المكتب/المحاكم المعتمدة من السحابة (المدير يرى موقع كل محامٍ) */
  function pullFromCloud(done) {
    if (!(w.CloudStore && CloudStore.collection)) { if (done) done(false); return; }
    CloudStore.collection.list("attendance-places", function (pl) {
      if (pl && pl.length && pl[0]) {
        var remote = pl[0]; delete remote.id;
        var loc = places();
        if (remote.office && (!loc.office || (remote.office.at || "") > (loc.office.at || ""))) loc.office = remote.office;
        loc.courts = Object.assign({}, remote.courts || {}, loc.courts || {});
        write(PLACES_KEY, loc);
      }
    });
    CloudStore.collection.list("attendance", function (list) {
      if (!list) { if (done) done(false); return; }
      var all = allRecords(), emps = employees(), n = 0;
      list.forEach(function (r) {
        if (!r.empEmail || !r.date) return;
        var emp = emps.filter(function (u) { return String(u.email || "").toLowerCase() === r.empEmail; })[0];
        if (!emp) return;
        var k = attKey(emp.id, r.date), cur = all[k];
        if (!cur || (r.updatedAt || 0) > (cur.updatedAt || 0)) { delete r.id; all[k] = r; n++; }
      });
      if (n) write(ATT_KEY, all);
      if (done) done(true, n);
    });
  }

  /* ------------------------------------------- تنبيه المدير برسائل الموقع
     جهاز المدير بيسأل السحابة كل ٣ دقايق (والبرنامج مفتوح) عن سجلات الحضور اللي
     اتعدّلت بس (listChanged — قراءات قليلة جداً). كل رسالة موقع جديدة من محامي
     بتتسجّل في «مركز التنبيهات» وتطلع إشعار على الموبايل — بالأحمر لو إدخال يدوي
     أو الوقت ما اتراجعش على السيرفر أو ساعة الموبايل مختلفة. */
  var FEED_KEY = "proflawyer.att.feed.v1", FEED_SEEN = "proflawyer.att.feed.seen.v1", FEED_AT = "proflawyer.att.feed.at";
  var FEED_EVERY = 3 * 60000, feedTimer = null, feedBusy = false;
  function isManager() {
    var T = w.Team, me = (T && T.current) ? T.current() : null;
    if (!me) return false;
    if (me.role === "owner") return true;
    return !!(T.canEdit && T.PERMKEYS && T.PERMKEYS.payroll && T.canEdit("payroll"));
  }
  function feed() { return read(FEED_KEY, []); }
  function feedUnread() { return feed().filter(function (x) { return !x.read; }).length; }
  function feedMarkRead() { var f = feed(); f.forEach(function (x) { x.read = true; }); write(FEED_KEY, f); updateBell(); }
  function entryEvents(r) {
    var ev = [], em = String(r.empEmail || "").toLowerCase(), d = r.date;
    (r.courtEntries || []).forEach(function (c) {
      if (!c.time) return;
      var live = entryLive(c);
      ev.push({ key: em + "|" + d + "|c|" + (c.serverAt || (c.time + "|" + (c.loc || "") + "|" + (c.task || ""))),
        kind: "court", time: c.time, loc: c.loc || "", task: c.task || "", live: live, confirmed: !!c.confirmed,
        verified: live ? c.verified : null, skew: live ? c.skew : null, deviceTime: c.deviceTime || "",
        far: live && !!c.far, dist: c.dist, refName: c.refName || "",
        place: live && c.place ? placeLabel(c.place) : "" });
    });
    if (r.officeIn) {
      var L = r.officeInLoc || {}, liveO = officeLive(r);
      ev.push({ key: em + "|" + d + "|o|" + (liveO && L.serverAt ? L.serverAt : r.officeIn),
        kind: "office", time: r.officeIn, loc: "المكتب", task: "", live: liveO, confirmed: !!r.officeConfirmed,
        verified: liveO ? L.verified : null, skew: liveO ? L.skew : null, deviceTime: L.deviceTime || "",
        far: liveO && !!L.far, dist: L.dist, refName: "مقر المكتب",
        place: liveO && L.place ? placeLabel(L.place) : "" });
    }
    return ev;
  }
  function eventRed(e) {
    return !e.live || e.far || e.verified === false || (e.verified && Math.abs(e.skew || 0) > SKEW_WARN);
  }
  function eventFlag(e) {
    if (!e.live) return "⚠ الموقع ليس من البرنامج - إدخال يدوي";
    if (e.far) return "⚠ على بعد " + e.dist + " م من " + (e.refName || "المقر") + " حسب خرائط جوجل";
    if (e.verified === false) return "⚠ الوقت من ساعة الموبايل — ما اتراجعش على السيرفر";
    if (e.verified && Math.abs(e.skew || 0) > SKEW_WARN) return "⚠ ساعة الموبايل مختلفة بـ " + Math.abs(e.skew) + " دقيقة";
    return "📍 موقع مباشر حي — من البرنامج";
  }
  function notifyNow(title, body, nid) {
    var N = w.AndroidNotify;
    if (!N) return;
    try { if (N.now) N.now(title, body, nid); else if (N.test) N.test(title, body); } catch (e) { }
  }
  function updateBell() {
    try {
      var b = document.querySelector(".bell b"); if (!b) return;
      var u = feedUnread();
      if (u) { b.textContent = String(u).replace(/[0-9]/g, function (x) { return "٠١٢٣٤٥٦٧٨٩"[+x]; }); b.style.background = "#b3261e"; }
    } catch (e) { }
  }
  function pollFeed(force, done) {
    if (feedBusy || !isManager() || !(w.CloudStore && CloudStore.collection && CloudStore.collection.listChanged)) { if (done) done(0); return; }
    var last = parseInt(localStorage.getItem(FEED_AT) || "0", 10) || 0;
    if (!force && Date.now() - last < FEED_EVERY - 5000) { if (done) done(0); return; }
    /* أول مرة: آخر ١٢ ساعة بس؛ بعد كده من آخر سؤال بهامش نص ساعة (فرق ساعات الأجهزة) */
    var since = new Date((last || (Date.now() - 12 * 3600000)) - 30 * 60000).toISOString();
    feedBusy = true;
    CloudStore.collection.listChanged("attendance", since, false, function (list) {
      feedBusy = false;
      if (!list) { if (done) done(0); return; }
      try { localStorage.setItem(FEED_AT, String(Date.now())); } catch (e) { }
      var mine = myEmail(), seen = read(FEED_SEEN, {}), fd = feed(), emps = employees(), fresh = [];
      var all = allRecords(), n = 0;
      list.forEach(function (r) {
        if (!r.empEmail || !r.date) return;
        var em = String(r.empEmail).toLowerCase();
        var emp = emps.filter(function (u) { return String(u.email || "").toLowerCase() === em; })[0];
        if (emp) {   /* نفس دمج pullFromCloud — الأحدث يكسب */
          var k = attKey(emp.id, r.date), cur = all[k];
          if (!cur || (r.updatedAt || 0) > (cur.updatedAt || 0)) { var cp = JSON.parse(JSON.stringify(r)); delete cp.id; all[k] = cp; n++; }
        }
        if (em === mine) return;
        entryEvents(r).forEach(function (e) {
          if (seen[e.key]) return;
          seen[e.key] = Date.now();
          e.email = em; e.name = (emp && emp.name) || em; e.date = r.date; e.at = Date.now();
          e.red = eventRed(e); e.flag = eventFlag(e); e.read = false;
          fresh.push(e);
        });
      });
      if (n) write(ATT_KEY, all);
      var cut = Date.now() - 60 * 864e5;
      Object.keys(seen).forEach(function (k) { if (seen[k] < cut) delete seen[k]; });
      write(FEED_SEEN, seen);
      if (fresh.length) {
        write(FEED_KEY, fresh.concat(fd).slice(0, 200));
        updateBell();
        if (fresh.length > 3) {
          var reds = fresh.filter(function (e) { return e.red; }).length;
          notifyNow((reds ? "🔴 " : "📍 ") + fresh.length + " رسائل موقع جديدة من المحامين",
            reds ? reds + " منهم إدخال يدوي أو وقت مشكوك فيه — افتح مركز التنبيهات" : "افتح مركز التنبيهات للتفاصيل", 2999);
        } else {
          fresh.forEach(function (e, i) {
            notifyNow((e.red ? "🔴 " : "📍 ") + e.name + " — " + (e.kind === "court" ? "المحكمة" : "المكتب") + " الساعة " + e.time,
              e.flag + "\n" + e.date.split("-").reverse().join("/") +
              (e.kind === "court" ? " · " + (e.loc || "—") + (e.task ? " · المهمة: " + e.task : "") : "") +
              (e.place ? "\n" + e.place : ""), 2000 + (Date.now() + i) % 900);
          });
        }
        try { w.dispatchEvent(new CustomEvent("att-feed", { detail: fresh.length })); } catch (e) { }
      }
      if (done) done(fresh.length, n);
    });
  }
  function startFeedWatch() {
    if (feedTimer) return;
    updateBell();
    setTimeout(function () { pollFeed(false); }, 4000);
    feedTimer = setInterval(function () { if (!document.hidden) pollFeed(false); }, FEED_EVERY);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) pollFeed(false); });
  }

  /* --------------------------------------------------------- موقع الحضور
     رسالة الموقع الفعلية بديلة عن كتابة الوقت يدوياً — تلتقط الإحداثيات
     والوقت الحاليين فعلياً، وتُثبت بهما الفترة (محكمة/مكتب) تلقائياً. */
  function nowHM() {
    var d = new Date();
    return (d.getHours() < 10 ? "0" : "") + d.getHours() + ":" +
           (d.getMinutes() < 10 ? "0" : "") + d.getMinutes();
  }

  /* الموقع الحي (مهمة 48): يُلتقط لحظة الإرسال (بلا نسخة مخزَّنة قديمة)، ويُقبل فقط لو
     دقة GPS ≤ ٥٠ متراً، ولو كان مقر المكتب/المحكمة معتمداً فلا يزيد البُعد عنه على ٥٠ متراً. */
  var MAX_ACC = 50, MAX_DIST = 50;
  var PLACES_KEY = "proflawyer.att.places.v1";

  function places() { return read(PLACES_KEY, { office: null, courts: {} }); }
  function savePlaces(p) {
    write(PLACES_KEY, p);
    try { if (w.CloudStore && CloudStore.collection) CloudStore.collection.save("attendance-places", "all", p); } catch (e) { }
  }
  function courtKey(name) { return w.lawyerNorm ? w.lawyerNorm(name) : String(name || "").trim(); }

  /** المسافة بالمتر بين نقطتين (Haversine) */
  function distM(a1, o1, a2, o2) {
    var R = 6371000, r = Math.PI / 180, dA = (a2 - a1) * r, dO = (o2 - o1) * r;
    var x = Math.sin(dA / 2) * Math.sin(dA / 2) + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin(dO / 2) * Math.sin(dO / 2);
    return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  /** يلتقط موقعاً حياً ودقته ≤ ٥٠ م (يستمر حتى ٢٠ ثانية بحثاً عن دقة أفضل) */
  function captureLocation(cb) {
    if (!navigator.geolocation) { cb({ error: "الموقع غير مدعوم على هذا الجهاز." }); return; }
    var best = null, done = false, wid = null, timer = null;
    function finish(r) {
      if (done) return; done = true;
      try { if (wid != null) navigator.geolocation.clearWatch(wid); } catch (e) { }
      clearTimeout(timer); cb(r);
    }
    function fail(err) {
      var msg = err.code === 1 ? "الصلاحية مرفوضة — فعّلها من إعدادات التطبيق."
              : err.code === 2 ? "تعذّر تحديد الموقع — تأكد من تفعيل GPS."
              : "انتهت مهلة تحديد الموقع — حاول في مكان مفتوح.";
      finish({ error: msg });
    }
    timer = setTimeout(function () {
      if (best && best.acc <= MAX_ACC) return;
      finish({ error: "دقة الموقع " + (best ? Math.round(best.acc) + " متر" : "غير متاحة") +
        " — المطلوب ٥٠ متراً أو أقل. اخرج لمكان مفتوح وأعد المحاولة." });
    }, 20000);
    wid = navigator.geolocation.watchPosition(function (pos) {
      var c = pos.coords;
      if (!best || c.accuracy < best.acc) best = { lat: c.latitude, lng: c.longitude, acc: c.accuracy };
      if (c.accuracy <= MAX_ACC) finish({ lat: best.lat, lng: best.lng, acc: best.acc, time: nowHM(), live: true });
    }, fail, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  }

  /** يتحقق من قرب الموقع الملتقَط من مكان معتمد: {ok, dist} أو {error} */
  /* مقر اتعتمد في الموقع نفسه (زرار «اعتماد موقعي الآن») = حد ٥٠ م ويمنع الإرسال لو أبعد.
     مقر جاي من خرائط جوجل (src:"google") = دبوس تقريبي للمبنى، فحدّه place.radius
     ولو أبعد ما بيمنعش — بيتسجّل «بعيد عن المقر» بالأحمر للمدير. */
  function verifyNear(place, r, label) {
    if (!place) return { ok: true, noRef: true };
    var d = distM(r.lat, r.lng, place.lat, place.lng);
    var lim = place.radius || MAX_DIST;
    if (d > lim) {
      if (place.src === "google") return { ok: true, dist: Math.round(d), far: true, lim: lim };
      return { error: "أنت على بعد " + Math.round(d) + " متراً من " + label + " (الحد الأقصى " + lim + " متراً)." };
    }
    return { ok: true, dist: Math.round(d) };
  }
  /* مقر المحكمة من اسمها زي ما المحامي كتبه: تطابق كامل، وإلا تطابق «لب» الاسم
     (من غير محكمة/الجزئية/الابتدائية…) — «محكمة شمال القاهرة» = «محكمة شمال القاهرة الابتدائية». */
  var COURT_GEN = /^(محكمه|المحكمه|الجزئيه|الجزييه|جزئي|جزيي|الابتدائيه|الابتداييه|ابتدائي|ابتدايي|الكليه|كلي|الاقتصاديه|مجمع|محاكم)$/;
  function courtCore(name) {
    var n = courtKey(name).replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[^\u0600-\u06FF0-9 ]/g, " ");
    return n.split(/\s+/).filter(function (w) { return w && !COURT_GEN.test(w); }).join(" ");
  }
  function findCourtPlace(loc) {
    if (!loc) return null;
    var courts = places().courts || {};
    if (courts[courtKey(loc)]) return courts[courtKey(loc)];
    var c = courtCore(loc); if (c.length < 3) return null;
    var hits = Object.keys(courts).filter(function (k) { return courtCore(courts[k].name || k) === c; });
    return hits.length === 1 ? courts[hits[0]] : null;
  }

  /** اعتماد موقعي الحي كمقر للمكتب / لمحكمة (للمدير) */
  function setOfficeHere(cb) {
    captureLocation(function (r) {
      if (r.error) { cb(r); return; }
      var p = places(); p.office = { lat: r.lat, lng: r.lng, at: new Date().toISOString(), src: "site" };
      savePlaces(p); cb({ ok: true, acc: Math.round(r.acc) });
    });
  }
  function setCourtHere(name, cb) {
    if (!String(name || "").trim()) { cb({ error: "اكتب اسم المحكمة أولاً." }); return; }
    captureLocation(function (r) {
      if (r.error) { cb(r); return; }
      var p = places(); p.courts = p.courts || {};
      p.courts[courtKey(name)] = { name: String(name).trim(), lat: r.lat, lng: r.lng, at: new Date().toISOString(), src: "site" };
      savePlaces(p); cb({ ok: true, acc: Math.round(r.acc) });
    });
  }

  function mapsUrl(lat, lng) { return "https://maps.google.com/?q=" + lat + "," + lng; }

  /* صورة خريطة للموقع (زي رسالة الموقع في واتساب) — من بلاطات OpenStreetMap المجانية
     (من غير مفتاح؛ لازم نت وقت العرض)، عليها علامة المكان ودايرة الدقة والوقت.
     بتتعمل وقت العرض من الإحداثيات المحفوظة في السجل، فمش بتكبّر حجم السجل على السحابة.
     mapImage(lat, lng, {time, acc}) → Promise<dataUrl | "">  */
  var MAP_CACHE = {};
  function mapImage(lat, lng, opts) {
    opts = opts || {};
    lat = +lat; lng = +lng;
    if (!isFinite(lat) || !isFinite(lng)) return Promise.resolve("");
    var key = lat.toFixed(5) + "," + lng.toFixed(5) + "|" + (opts.time || "") + "|" + (opts.acc || "") + "|" + (opts.date || "");
    if (MAP_CACHE[key]) return MAP_CACHE[key];
    var Z = 17, TS = 256, W = 560, H = 300, n = Math.pow(2, Z);
    var px = (lng + 180) / 360 * n * TS;
    var rad = lat * Math.PI / 180;
    var py = (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * n * TS;
    var x0 = px - W / 2, y0 = py - H / 2;
    var tx0 = Math.floor(x0 / TS), ty0 = Math.floor(y0 / TS), tx1 = Math.floor((x0 + W) / TS), ty1 = Math.floor((y0 + H) / TS);
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var g = cv.getContext("2d");
    g.fillStyle = "#e8e4dc"; g.fillRect(0, 0, W, H);
    var jobs = [];
    for (var tx = tx0; tx <= tx1; tx++) for (var ty = ty0; ty <= ty1; ty++) (function (tx, ty) {
      jobs.push(new Promise(function (res) {
        var im = new Image(); im.crossOrigin = "anonymous";
        im.onload = function () { g.drawImage(im, tx * TS - x0, ty * TS - y0); res(true); };
        im.onerror = function () { res(false); };
        im.src = "https://tile.openstreetmap.org/" + Z + "/" + ((tx % n) + n) % n + "/" + ty + ".png";
      }));
    })(tx, ty);
    var pr = Promise.all(jobs).then(function (ok) {
      if (!ok.some(Boolean)) return "";
      var cx = W / 2, cy = H / 2;
      var mpp = 156543.03392 * Math.cos(rad) / n;
      if (opts.acc) {
        g.beginPath(); g.arc(cx, cy, Math.max(6, opts.acc / mpp), 0, 2 * Math.PI);
        g.fillStyle = "rgba(37,99,235,.15)"; g.fill(); g.strokeStyle = "rgba(37,99,235,.6)"; g.lineWidth = 1.5; g.stroke();
      }
      /* الدبوس */
      g.beginPath(); g.moveTo(cx, cy); g.bezierCurveTo(cx - 13, cy - 18, cx - 13, cy - 34, cx, cy - 36);
      g.bezierCurveTo(cx + 13, cy - 34, cx + 13, cy - 18, cx, cy);
      g.fillStyle = "#d93025"; g.fill(); g.lineWidth = 2; g.strokeStyle = "#fff"; g.stroke();
      g.beginPath(); g.arc(cx, cy - 25, 4.5, 0, 2 * Math.PI); g.fillStyle = "#fff"; g.fill();
      /* لافتة: موقع مباشر حي من البرنامج (اتلقط من GPS لحظة الإرسال، مش صورة متخزّنة) */
      g.font = "bold 15px sans-serif"; g.direction = "rtl"; g.textAlign = "right";
      var top = "📍 موقع مباشر حي — من البرنامج";
      var tw0 = g.measureText(top).width + 20;
      g.fillStyle = "rgba(28,107,74,.92)"; g.fillRect(W - tw0 - 8, 8, tw0, 28);
      g.fillStyle = "#fff"; g.fillText(top, W - 18, 28);
      /* تاريخ ووقت الإرسال والدقة */
      var cap = (opts.date ? opts.date + "  " : "") + (opts.time ? "🕒 " + opts.time : "") + (opts.acc ? "   دقة " + Math.round(opts.acc) + " م" : "");
      if (cap) {
        g.font = "bold 15px sans-serif"; g.direction = "rtl"; g.textAlign = "right";
        var tw = g.measureText(cap).width + 18;
        g.fillStyle = "rgba(255,255,255,.9)"; g.fillRect(W - tw - 8, H - 34, tw, 26);
        g.fillStyle = "#1f1f1f"; g.fillText(cap, W - 17, H - 15);
      }
      g.font = "11px sans-serif"; g.direction = "ltr"; g.textAlign = "left";
      g.fillStyle = "rgba(255,255,255,.85)"; g.fillRect(4, H - 18, 128, 14);
      g.fillStyle = "#333"; g.fillText("© OpenStreetMap", 8, H - 7);
      try { return cv.toDataURL("image/jpeg", 0.85); } catch (e) { return ""; }
    }).catch(function () { return ""; });
    MAP_CACHE[key] = pr;
    pr.then(function (u) { if (!u) delete MAP_CACHE[key]; });
    return pr;
  }

  /* وصف مكان الإرسال (طلب المستخدم): المنطقة والشارع + أقرب علامة مميزة. المحاكم ليها
     الأولوية دايماً (محكمة معتمدة في البرنامج ≤ ٣٠٠ م، أو أي محكمة على الخريطة ≤ ٦٠٠ م)،
     وبعدها أقرب مكان عام مشهور ≤ ٢٥٠ م (قسم، مستشفى، جامعة، محطة، جامع/كنيسة، بنك…)،
     ولو المكان نفسه عام أو مشهور اسمه هو اللي يظهر. من خرائط OpenStreetMap المجانية
     (Nominatim للعنوان وOverpass للأماكن) — بيتسجّل وقت الإرسال، ولو مفيش نت بيتساب فاضي.
     describePlace(lat, lng) → Promise<{area, road, landmark:{name, dist, kind}|null} | null> */
  function withTimeout(pr, ms) {
    return Promise.race([pr, new Promise(function (res) { setTimeout(function () { res(null); }, ms); })]);
  }
  function getJson(url) {
    return fetch(url, { headers: { "Accept": "application/json" } }).then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }
  var KIND_AR = { courthouse: "محكمة", police: "قسم شرطة", hospital: "مستشفى", university: "جامعة", college: "كلية",
    school: "مدرسة", townhall: "مبنى حكومي", bank: "بنك", post_office: "مكتب بريد", place_of_worship: "دار عبادة",
    fire_station: "مطافي", station: "محطة", subway: "محطة مترو", government: "جهة حكومية", public: "مبنى عام" };
  function describePlace(lat, lng) {
    lat = +lat; lng = +lng;
    if (!isFinite(lat) || !isFinite(lng) || typeof fetch !== "function") return Promise.resolve(null);
    /* ١) محكمة معتمدة في البرنامج قريبة */
    var appCourt = null;
    var cs = (places().courts) || {};
    Object.keys(cs).forEach(function (k) {
      var c = cs[k]; if (!c || c.lat == null) return;
      var d = distM(lat, lng, c.lat, c.lng);
      if (d <= 300 && (!appCourt || d < appCourt.dist)) appCourt = { name: c.name, dist: Math.round(d), kind: "محكمة" };
    });
    var q = "[out:json][timeout:10];(" +
      'nwr(around:600,' + lat + "," + lng + ')["amenity"="courthouse"];' +
      'nwr(around:250,' + lat + "," + lng + ')["name"]["amenity"~"^(police|hospital|university|college|school|townhall|bank|post_office|place_of_worship|fire_station)$"];' +
      'nwr(around:250,' + lat + "," + lng + ')["name"]["railway"="station"];' +
      'nwr(around:250,' + lat + "," + lng + ')["name"]["station"="subway"];' +
      'nwr(around:250,' + lat + "," + lng + ')["name"]["office"="government"];' +
      'nwr(around:250,' + lat + "," + lng + ')["name"]["tourism"~"^(attraction|museum)$"];' +
      ");out center tags 40;";
    var pOver = withTimeout(getJson("https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(q)), 9000);
    var pNom = withTimeout(getJson("https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&accept-language=ar&lat=" +
      lat + "&lon=" + lng), 9000);
    return Promise.all([pOver, pNom]).then(function (res) {
      var ov = res[0], nm = res[1];
      if (!ov && !nm && !appCourt) return null;
      var court = appCourt, near = null;
      ((ov && ov.elements) || []).forEach(function (e) {
        var t = e.tags || {}, name = t["name:ar"] || t.name;
        var la = e.lat != null ? e.lat : (e.center && e.center.lat), lo = e.lon != null ? e.lon : (e.center && e.center.lon);
        if (!name || la == null) return;
        var d = Math.round(distM(lat, lng, la, lo));
        var isCourt = t.amenity === "courthouse" || /محكم/.test(name);
        var kind = KIND_AR[t.amenity] || KIND_AR[t.station] || KIND_AR[t.railway] || KIND_AR[t.office] || "";
        if (isCourt) { if (!court || d < court.dist) court = { name: name, dist: d, kind: "محكمة" }; }
        else if (d <= 250 && (!near || d < near.dist)) near = { name: name, dist: d, kind: kind };
      });
      var a = (nm && nm.address) || {};
      var areaParts = [a.neighbourhood || a.quarter || a.suburb, a.city_district || a.suburb, a.city || a.town || a.village || a.state]
        .filter(function (x, i, arr) { return x && arr.indexOf(x) === i; });
      /* المكان نفسه عام/مشهور (مبنى حكومي، محكمة، محطة…) */
      var self = null;
      if (nm && nm.name && /^(amenity|office|railway|tourism|building|public_transport)$/.test(nm.category || "")) {
        self = { name: nm.name, dist: 0, kind: KIND_AR[nm.type] || "", self: true };
        if (nm.type === "courthouse" || /محكم/.test(nm.name)) self.kind = "محكمة";
      }
      var landmark = court || (self && self.kind === "محكمة" ? self : null) || self || near || null;
      return { area: areaParts.join(" - "), road: a.road || a.pedestrian || "", landmark: landmark };
    }).catch(function () { return appCourt ? { area: "", road: "", landmark: appCourt } : null; });
  }
  /** سطر عربي للعرض: «المنطقة … · شارع … · أقرب علامة: …» */
  function placeLabel(pl) {
    if (!pl) return "";
    var bits = [];
    if (pl.area) bits.push("المنطقة: " + pl.area);
    if (pl.road) bits.push("الشارع: " + pl.road);
    if (pl.landmark) bits.push((pl.landmark.self ? "المكان: " : "أقرب علامة: ") + pl.landmark.name +
      (pl.landmark.dist ? " (على بعد " + pl.landmark.dist + " م)" : ""));
    return bits.join(" · ");
  }

  /* الوقت المعتمد للحضور: وقت السيرفر (بتوقيت القاهرة) لحظة الإرسال — منه بيتحسب
     التأخير والخصم. ساعة الموبايل بتتسجّل جنبه، ولو الفرق أكتر من ٥ دقايق بيظهر للمدير.
     من غير نت: الوقت من الموبايل ومتعلَّم إنه «ما اتراجعش على السيرفر». */
  var SKEW_WARN = 5;
  function cairoParts(iso) {
    var d = new Date(iso), o = {};
    try {
      new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d).forEach(function (p) { o[p.type] = p.value; });
    } catch (e) { return null; }
    var hh = o.hour === "24" ? "00" : o.hour;
    return { date: o.year + "-" + o.month + "-" + o.day, time: hh + ":" + o.minute };
  }
  function officialTime(r, cb) {
    var dev = { date: todayStr(), time: r.time };
    if (!(w.CloudStore && CloudStore.serverNow)) { cb({ date: dev.date, time: dev.time, deviceTime: dev.time, verified: false }); return; }
    CloudStore.serverNow(function (iso) {
      var p = iso ? cairoParts(iso) : null;
      if (!p) { cb({ date: dev.date, time: dev.time, deviceTime: dev.time, verified: false }); return; }
      var skew = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
      cb({ date: p.date, time: p.time, deviceTime: dev.time, serverAt: iso, skew: skew, verified: true });
    });
  }

  /** يسجّل رسالة موقع حية لفترة المحكمة (دقة ≤ ٥٠ م، وقرب ≤ ٥٠ م من مقر المحكمة إن كان معتمداً). */
  function checkInCourt(empId, date, loc, task, cb) {
    captureLocation(function (r) {
      if (r.error) { cb(r); return; }
      var place = findCourtPlace(loc);
      var v = verifyNear(place, r, "مقر المحكمة «" + loc + "»");
      if (v.error) { cb(v); return; }
      var pPlace = describePlace(r.lat, r.lng);
      officialTime(r, function (t) { pPlace.then(function (where) {
        var day = t.verified ? t.date : date;          /* اليوم الحقيقي من السيرفر */
        var rec = getRecord(empId, day);
        rec.courtEntries = rec.courtEntries || [];
        rec.courtEntries.push({
          loc: loc || "", task: task || "", time: t.time, live: true, acc: Math.round(r.acc),
          dist: v.dist == null ? null : v.dist, refChecked: !v.noRef, far: !!v.far, refName: place ? place.name || "" : "",
          refSrc: place ? place.src || "site" : "",
          lat: r.lat, lng: r.lng, mapsUrl: mapsUrl(r.lat, r.lng),
          deviceTime: t.deviceTime, serverAt: t.serverAt || null, skew: t.skew == null ? null : t.skew, verified: !!t.verified,
          place: where || null
        });
        saveRecord(empId, day, rec);
        cb({ ok: true, time: t.time, date: day, mapsUrl: mapsUrl(r.lat, r.lng), refChecked: !v.noRef,
             lat: r.lat, lng: r.lng, acc: Math.round(r.acc), verified: !!t.verified, skew: t.skew, deviceTime: t.deviceTime, place: where || null,
             dist: v.dist, far: !!v.far, refName: place ? place.name || "" : "" });
      }); });
    });
  }

  /** يسجّل رسالة موقع حية لحضور فترة المكتب (قرب ≤ ٥٠ م من مقر المكتب إن كان معتمداً). */
  function checkInOffice(empId, date, cb) {
    captureLocation(function (r) {
      if (r.error) { cb(r); return; }
      var v = verifyNear(places().office, r, "مقر المكتب");
      if (v.error) { cb(v); return; }
      var pPlace = describePlace(r.lat, r.lng);
      officialTime(r, function (t) { pPlace.then(function (where) {
        var day = t.verified ? t.date : date;
        var rec = getRecord(empId, day);
        rec.officeIn = t.time;
        rec.officeConfirmed = false;
        rec.officeInLoc = { time: t.time, lat: r.lat, lng: r.lng, mapsUrl: mapsUrl(r.lat, r.lng), acc: Math.round(r.acc),
          dist: v.dist == null ? null : v.dist, refChecked: !v.noRef, live: true, far: !!v.far, refName: "مقر المكتب",
          refSrc: places().office ? places().office.src || "site" : "",
          deviceTime: t.deviceTime, serverAt: t.serverAt || null, skew: t.skew == null ? null : t.skew, verified: !!t.verified,
          place: where || null };
        saveRecord(empId, day, rec);
        cb({ ok: true, time: t.time, date: day, mapsUrl: mapsUrl(r.lat, r.lng), refChecked: !v.noRef,
             lat: r.lat, lng: r.lng, acc: Math.round(r.acc), verified: !!t.verified, skew: t.skew, deviceTime: t.deviceTime, place: where || null,
             dist: v.dist, far: !!v.far, refName: "مقر المكتب" });
      }); });
    });
  }

  /** هل حان وقت تذكير إرسال الموقع، ولسه ما اتبعتش؟ نافذتا التذكير: ٩–٩:٣٠
      (المحكمة) و١–١:٣٠ (المكتب) — بعدهما التأخير يبدأ يُخصَم فعلياً. */
  function checkInReminder(empId) {
    var date = todayStr();
    var cfg = dayConfig(date);
    if (expectedHoursFor(date) === 0) return null;
    var now = nowHM();
    var rec = getRecord(empId, date);
    if (rec.status !== "present") return null;
    var isFull = cfg.type === "full";

    if ((isFull || cfg.type === "court") && now >= "09:00" && now <= "09:45") {
      var courtDone = rec.courtEntries && rec.courtEntries.some(function (c) { return c.time; });
      if (!courtDone) return { period: "court", label: "فترة المحكمة" };
    }
    if (isFull || cfg.type === "office") {
      var start = isFull ? WORK.officeStart : (cfg.start || "09:00");
      var endWin = addMin(start, 45);
      if (now >= start && now <= endWin && !rec.officeIn) {
        return { period: "office", label: "فترة المكتب" };
      }
    }
    return null;
  }
  /* ---------------------------------------- إشعارات التذكير على الموبايل
     نفس نوافذ checkInReminder، بس محسوبة مقدَّماً للأسبوعين الجايين وبتتسلّم
     لأندرويد (AndroidNotify → ReminderReceiver) فيظهر إشعار نظام في ميعاده
     حتى والتطبيق مقفول. تذكير أول ما الفترة تبدأ + «آخر فرصة» بعد ٣٠ دقيقة؛
     الفترة اللي اتبعت موقعها خلاص أو الإجازة/الغياب المسجَّل ما يتذكّرش. */
  var REMIND_DAYS = 14, WINDOW_MIN = 45, LAST_CALL_MIN = 30;
  function dateAt(dateStr, hm) {
    var p = dateStr.split("-"), t = hm.split(":");
    return new Date(+p[0], +p[1] - 1, +p[2], +t[0], +t[1], 0, 0).getTime();
  }
  function reminderPlan(empId, days) {
    var out = [], now = Date.now();
    var base = new Date();
    for (var i = 0; i < (days || REMIND_DAYS); i++) {
      var d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      var ds = d.getFullYear() + "-" + (d.getMonth() < 9 ? "0" : "") + (d.getMonth() + 1) + "-" +
        (d.getDate() < 10 ? "0" : "") + d.getDate();
      if (expectedHoursFor(ds) === 0) continue;
      var rec = getRecord(empId, ds);
      if (rec.status !== "present") continue;
      var cfg = dayConfig(ds), isFull = cfg.type === "full";
      var periods = [];
      if ((isFull || cfg.type === "court") && !(rec.courtEntries || []).some(function (c) { return c.time; })) {
        periods.push({ start: "09:00", label: "فترة المحكمة", nid: 11 });
      }
      if ((isFull || cfg.type === "office") && !rec.officeIn) {
        periods.push({ start: isFull ? WORK.officeStart : (cfg.start || "09:00"), label: "فترة المكتب", nid: 12 });
      }
      periods.forEach(function (p) {
        var at = dateAt(ds, p.start), until = at + WINDOW_MIN * 60000;
        var body = "ابعت موقعك من صفحة الحضور خلال " + WINDOW_MIN + " دقيقة من بداية الفترة — " +
          "عدم إرسال الموقع يعني إنك غير مثبت الحضور، وتتطبّق قواعد الغياب والخصم على الفترة دي.";
        if (at > now) out.push({ at: at, until: until, nid: p.nid, title: "📍 ابعت موقعك — " + p.label, body: body });
        var last = at + LAST_CALL_MIN * 60000;
        if (last > now) out.push({ at: last, until: until, nid: p.nid,
          title: "⏰ آخر فرصة — " + p.label, body: "فاضل " + (WINDOW_MIN - LAST_CALL_MIN) + " دقيقة. " + body });
      });
    }
    return out;
  }
  /** يبعت مواعيد التذكير لأندرويد للمستخدم الحالي — آمن يتنادى كتير (بيستبدل القديم).
      مدير المكتب ما بيسجّلش حضور، فما بيتذكّرش. */
  function syncNotifications() {
    var N = w.AndroidNotify;
    if (!N || !N.schedule) return 0;
    var me = (w.Team && Team.current) ? Team.current() : null;
    var emp = meEmp();
    var plan = (me && emp && me.role !== "owner" && me.role !== "none" && emp.role !== "owner" && emp.active !== false)
      ? reminderPlan(emp.id) : [];
    try { N.schedule(JSON.stringify(plan)); } catch (e) { return 0; }
    return plan.length;
  }
  function addMin(hm, m) {
    var t = timeToMin(hm) + m;
    var h = Math.floor(t / 60), mi = t % 60;
    return (h < 10 ? "0" + h : h) + ":" + (mi < 10 ? "0" + mi : mi);
  }

  /* أيام عمل فاتت بلا إثبات حضور — بتتحسب غياب بلا إذن؛ المدير يقدر يحوّلها «بإذن». */
  function unrecordedDatesFor(empId, refDate) {
    var today = todayStr();
    var all = allRecords();
    var first = ruleStartFor(empId);
    if (!first) return [];
    return monthDates(refDate.slice(0, 7)).filter(function (d) {
      if (d >= today || d > refDate || d < first) return false;
      if (expectedHoursFor(d) === 0) return false;
      var rec = all[attKey(empId, d)];
      if (!rec) return true;
      if (rec.status === "present" && !rec.officeIn &&
          (!rec.courtEntries || !rec.courtEntries.length) &&
          (!rec.tasks || !rec.tasks.length)) return true;
      return false;
    });
  }

  /* ------------------------------------------------------------- الحساب */

  function computeDay(empId, date) {
    var all = allRecords();
    var rec = all[attKey(empId, date)];
    var exp = expectedHoursFor(date);
    if (exp === 0) return { expected: 0, actual: 0, deduction: 0, status: "off", lateMin: 0 };
    var start = ruleStartFor(empId);
    /* قبل بدء التطبيق (أو المالك/الموكل): اليوم محسوب كامل بلا خصم */
    if (!start || date < start) {
      if (rec && rec.status === "excused") return { expected: exp, actual: exp, deduction: 0, status: "excused", lateMin: 0 };
      return { expected: exp, actual: exp, deduction: 0, status: "pre", lateMin: 0 };
    }
    /* اليوم الجاري واللي لسه ما جاش: محسوب كامل لحد ما يعدّي (إلا لو المدير حسمه) */
    if (date >= todayStr() && !(rec && (rec.status === "excused" || rec.status === "absent")))
      return { expected: exp, actual: exp, deduction: 0, status: "pending", lateMin: 0 };
    if (!rec) return { expected: exp, actual: 0, deduction: exp * 2, status: "absent", lateMin: 0, auto: true };
    if (rec.status === "excused") return { expected: exp, actual: exp, deduction: 0, status: "excused", lateMin: 0 };
    if (rec.status === "absent") return { expected: exp, actual: 0, deduction: exp * 2, status: "absent", lateMin: 0 };

    var cfg = dayConfig(date);
    var isFull = cfg.type === "full";
    var courtExp = isFull ? WORK.courtHours : (cfg.type === "court" ? exp : 0);
    var officeExp = isFull ? WORK.officeHours : (cfg.type === "office" ? exp : 0);

    var courtProved = courtExp > 0 && rec.courtEntries && rec.courtEntries.some(entryCounts);
    var manualPending = (rec.courtEntries || []).some(function (c) { return c.time && !entryCounts(c); }) ||
      (!!rec.officeIn && !officeCounts(rec));
    var courtActual = 0, courtDeduction = 0;
    if (courtExp > 0) {
      if (courtProved) courtActual = courtExp;
      else courtDeduction = courtExp * 2;
    }

    var inMin = officeCounts(rec) ? timeToMin(rec.officeIn) : null, outMin = timeToMin(rec.officeOut);
    var officeStartMin = timeToMin(isFull ? WORK.officeStart : (cfg.start || "09:00"));
    var officeActual = 0, officeDeduction = 0, lateMin = 0;
    if (officeExp > 0) {
      if (inMin == null) {
        officeDeduction = officeExp * 2;
      } else {
        lateMin = Math.max(0, inMin - officeStartMin);
        officeActual = (outMin != null && outMin > inMin) ? Math.min(officeExp, (outMin - inMin) / 60) : officeExp;
        if (lateMin > 120) { officeDeduction = officeExp * 2; officeActual = 0; }
        else if (lateMin > 60) { officeDeduction = officeExp / 2; }
      }
    }

    var actual = courtActual + officeActual;
    var deduction = courtDeduction + officeDeduction;
    var noProof = (courtExp > 0 && !courtProved) || (officeExp > 0 && inMin == null);
    var status = noProof ? "absent" : (lateMin > 60 ? "late" : "ok");

    return { expected: exp, actual: actual, deduction: deduction, status: status, lateMin: lateMin,
             manualPending: noProof && manualPending };
  }

  function computeMonth(empId, ym) {
    var dates = monthDates(ym);
    var expected = 0, actual = 0, deduction = 0, workDays = 0, absentDays = 0, lateDays = 0, tasksDone = 0;
    var all = allRecords();
    dates.forEach(function (date) {
      var d = computeDay(empId, date);
      if (d.expected > 0) workDays++;
      expected += d.expected; actual += d.actual; deduction += d.deduction;
      if (d.status === "absent") absentDays++;
      if (d.status === "late") lateDays++;
      var rec = all[attKey(empId, date)];
      if (rec && rec.tasks) tasksDone += rec.tasks.length;
    });
    var netHours = Math.max(0, actual - deduction);
    var salary = salaryOf(empId, ym);
    var hourlyRate = expected > 0 ? salary / expected : 0;
    var payable = hourlyRate * netHours;
    var deductionValue = salary - payable;
    var deductionPct = salary > 0 ? (deductionValue / salary * 100) : 0;
    var efficiency = expected > 0 ? (netHours / expected * 100) : 0;
    var bonuses = bonusesFor(empId, ym);
    var bonusTotal = bonuses.reduce(function (a, x) { return a + (+x.amount || 0); }, 0);

    /* تنبيه/فصل: ٣٠٪+ تنبيه (فصل لو تكرر بعد تنبيه سابق) · ٥٠٪+ فصل فوراً */
    var alerts = read(ALERT_KEY, {});
    var prevWarn = !!(alerts[empId] && alerts[empId][prevMonth(ym)]);
    var alert = "none";
    if (deductionPct >= 50) alert = "terminate";
    else if (deductionPct >= 30) alert = prevWarn ? "terminate" : "warn";
    /* بيتسجّل كسابقة بس بعد ما الشهر يخلص — الشهر الجاري لسه ما اتقفلش */
    if ((alert === "warn" || alert === "terminate") && ym < ymOf(todayStr())) {
      alerts[empId] = alerts[empId] || {};
      alerts[empId][ym] = alert;
      write(ALERT_KEY, alerts);
    }

    return {
      expected: expected, actual: actual, deduction: deduction, netHours: netHours,
      workDays: workDays, absentDays: absentDays, lateDays: lateDays, tasksDone: tasksDone,
      salary: salary, hourlyRate: hourlyRate, payable: payable, deductionValue: deductionValue,
      deductionPct: deductionPct, efficiency: efficiency, alert: alert,
      bonuses: bonuses, bonusTotal: bonusTotal, net: payable + bonusTotal
    };
  }

  function prevMonth(ym) {
    var p = ym.split("-"); var y = +p[0], m = +p[1] - 1;
    if (m < 1) { m = 12; y--; }
    return y + "-" + (m < 10 ? "0" + m : m);
  }

  w.Attendance = {
    places: places, savePlaces: savePlaces, findCourtPlace: findCourtPlace, setOfficeHere: setOfficeHere, setCourtHere: setCourtHere, pullFromCloud: pullFromCloud,
    MAX_ACC: MAX_ACC, MAX_DIST: MAX_DIST,
    employees: employees, meEmp: meEmp, mapImage: mapImage, SKEW_WARN: SKEW_WARN, myEmail: myEmail,
    entryLive: entryLive, entryCounts: entryCounts, officeLive: officeLive, officeCounts: officeCounts,
    describePlace: describePlace, placeLabel: placeLabel, mapsUrl: mapsUrl, salaryOf: salaryOf, setSalary: setSalary,
    salaryHistory: salaryHistory, removeSalaryStep: removeSalaryStep,
    bonusesFor: bonusesFor, addBonus: addBonus, removeBonus: removeBonus,
    policyStart: policyStart, setPolicyStart: setPolicyStart, ruleStartFor: ruleStartFor,
    pullPayroll: pullPayroll,
    officialHolidaysForYear: officialHolidaysForYear, customHolidays: customHolidays,
    addHoliday: addHoliday, removeHoliday: removeHoliday, isHoliday: isHoliday,
    holidayNameOn: holidayNameOn, isFriday: isFriday, isThursday: isThursday,
    expectedHoursFor: expectedHoursFor, monthDates: monthDates, daysInMonth: daysInMonth,
    todayStr: todayStr, getRecord: getRecord, saveRecord: saveRecord,
    unrecordedDatesFor: unrecordedDatesFor, computeDay: computeDay, computeMonth: computeMonth,
    checkInCourt: checkInCourt, checkInOffice: checkInOffice, checkInReminder: checkInReminder,
    reminderPlan: reminderPlan, syncNotifications: syncNotifications,
    pollFeed: pollFeed, feed: feed, feedUnread: feedUnread, feedMarkRead: feedMarkRead, isManager: isManager,
    getSchedule: getSchedule, setDaySchedule: setDaySchedule, dayConfig: dayConfig,
    DOW_NAMES: DOW_NAMES, WORK: WORK
  };
  try { startFeedWatch(); } catch (e) { }
})(window);
