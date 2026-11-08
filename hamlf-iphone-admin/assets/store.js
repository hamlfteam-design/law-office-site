/* =============================================================================
   طبقة قراءة موحّدة لكل ما يُدخله المستخدم.

   البيانات موزّعة على عدة مخازن، وكل شاشة كانت تعرض مخزنها فقط، فلم يكن
   هناك مكان واحد يجمعها. هذه الطبقة تقرأها جميعاً وتُعيدها بشكل موحّد،
   فتُبنى عليها: البحث · التقويم · مركز السجلات.

   لا تكتب شيئاً — القراءة فقط، عدا حذف سجل بعينه.
   ============================================================================= */
(function (w) {
  "use strict";

  var SCREENS_KEY = "proflawyer.screens.v1";
  var APPTS_KEY   = "proflawyer.appointments.v1";
  var IMPORTED_KEY= "proflawyer.sessions.imported.v1";
  var TEAM_KEY    = "proflawyer.team.v1";
  var AGENDA_KEY  = "proflawyer.agenda.cases.v1";

  var NAMES = {
    "01-cases": "صفحة القضايا", "02-admin-works": "الأعمال الإدارية",
    "03-execution": "تنفيذ الأحكام", "04-bailiff-papers": "أوراق المحضرين",
    "05-powers-of-attorney": "التوكيلات", "31-case-revenue": "أتعاب القضايا ومصروفاتها",
    "33-office-expenses": "مصروفات المكتب",
    "41-contract": "عقود العمل", "42-wage": "تحديد الأجر",
    "43-payroll": "المرتبات", "44-evaluation": "تقييم الموظفين",
    "45-residency": "الإقامات", "46-work-permit": "تصاريح العمل",
    "47-visa": "الفيزات", "48-end-service": "إنهاء الخدمة",
    "49-staff": "الموظفون", "50-secretariat": "السكرتارية",
    "61-report-builder": "منشئ التقارير", "71-client-profile": "ملفات الموكلين",
    "82-minutes": "المحاضر", "83-experts": "الخبراء",
    "84-forgery": "طعون التزوير", "85-appointments": "المواعيد",
    "__imported": "جلسات مستوردة", "__assignments": "التكليفات",
    "__agenda": "قضايا التقويم"
  };

  function read(key, dflt) {
    try { return JSON.parse(localStorage.getItem(key)) || dflt; }
    catch (e) { return dflt; }
  }

  function la(t) {
    return String(t == null ? "" : t)
      .replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x0660; });
  }

  /** ٢٠٢٦/١٠/١٥ أو 2026-10-15 → 2026-10-15 */
  function toISO(v) {
    var s = la(v).trim().replace(/\//g, "-");
    var m = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
    if (!m) return "";
    var p = function (x) { x = String(parseInt(x, 10) || 1); return x.length < 2 ? "0" + x : x; };
    return m[1] + "-" + p(m[2]) + "-" + p(m[3] || 1);
  }
  w.lawyerToISO = toISO;

  function looksLikeDate(v) { return !!toISO(v); }

  /* --------------------------------------------- رقم الموكل بالمكتب
     يُعرض مع قضايا الموكل ليربط القضية بملفه في المكتب. */

  var _clientIndex = null;

  function clientIndex() {
    if (_clientIndex) return _clientIndex;
    _clientIndex = {};
    read("proflawyer.agenda.clients.v1", []).forEach(function (c) {
      if (!c.officeNo) return;
      var k = norm(c.name);
      if (k) _clientIndex[k] = c.officeNo;
    });
    return _clientIndex;
  }

  /** يستخرج أرقام مكاتب الموكلين المذكورين في نصّ الأطراف */
  function officeNoOf(clientsText) {
    if (!clientsText) return [];
    var idx = clientIndex();
    var out = [];
    String(clientsText).split("·").forEach(function (part) {
      var name = part.replace(/\([^)]*\)/g, "").trim();
      var no = idx[norm(name)];
      if (no && out.indexOf(no) < 0) out.push(no);
    });
    return out;
  }
  w.lawyerOfficeNo = officeNoOf;

  /* ------------------------------------------------------------- التجميع */

  /**
   * كل السجلات من كل المخازن.
   * كل عنصر: {store, screen, name, id, at, values[], dates[], text}
   */
  function all() {
    var out = [];

    /* ١) سجلات الشاشات (data.js) */
    var db = read(SCREENS_KEY, {});
    Object.keys(db).forEach(function (scr) {
      (db[scr] || []).forEach(function (r) {
        var vals = (r.v || [])
          .map(function (c) { return c && c.x != null ? String(c.x).trim() : ""; })
          .filter(function (x) { return x !== ""; });
        out.push({
          store: "screens", screen: scr,
          name: NAMES[scr] || scr,
          id: r._id, at: r._at || "",
          values: vals,
          dates: vals.filter(looksLikeDate).map(toISO),
          text: vals.join(" ")
        });
      });
    });

    /* ٢) المواعيد */
    read(APPTS_KEY, []).forEach(function (a) {
      var vals = [a.title, a.with, a.kind, a.date, a.time, a.notes]
        .filter(function (x) { return x; }).map(String);
      out.push({
        store: "appointments", screen: "85-appointments",
        name: NAMES["85-appointments"], id: a.id, at: "",
        values: vals,
        dates: a.date ? [toISO(a.date)] : [],
        time: a.time || "", done: !!a.done,
        title: a.title, text: vals.join(" ")
      });
    });

    /* ٣) الجلسات المستوردة من التقويم */
    read(IMPORTED_KEY, []).forEach(function (s) {
      var vals = [s.no, s.year, s.court, s.circle, s.client, s.opp,
                  s.subject, s.result, s.notes]
        .filter(function (x) { return x; }).map(String);
      out.push({
        store: "imported", screen: "__imported",
        name: NAMES.__imported, id: s.key, at: "",
        values: vals,
        dates: s.date ? [toISO(s.date)] : [],
        title: (s.court || "جلسة") + (s.no ? " — " + s.no : ""),
        text: vals.join(" ")
      });
    });

    /* ٤) التكليفات */
    var team = read(TEAM_KEY, {});
    (team.assignments || []).forEach(function (a) {
      var who = (team.users || []).filter(function (u) { return u.id === a.to; })[0];
      var vals = [a.subject, a.file, a.prio, a.state, a.due,
                  who ? who.name : "", a.body]
        .filter(function (x) { return x; }).map(String);
      out.push({
        store: "assignments", screen: "__assignments",
        name: NAMES.__assignments, id: a.id, at: a.at || "",
        values: vals,
        dates: a.due ? [toISO(a.due)] : [],
        title: a.subject, text: vals.join(" ")
      });
    });

    /* ٥) قضايا مستوردة من تقويم الجلسات */
    read(AGENDA_KEY, []).forEach(function (c) {
      var vals = [c.caseNo, c.caseYear, c.courtName, c.courtLevel, c.caseType,
                  c.circuit, c.subject, c.clients, c.opponents, c.fileNo,
                  c.hall, c.floor, c.lawyer, c.notes]
        .filter(function (x) { return x; }).map(String);
      var dates = (c.sessions || []).map(function (s) { return s.date; })
        .filter(Boolean);
      var offices = officeNoOf(c.clients);
      if (offices.length) vals.unshift("ملف موكل " + offices.join(" · "));
      out.push({
        store: "agenda", screen: "__agenda", officeNos: offices,
        name: NAMES.__agenda, id: c.id, at: "",
        values: vals, dates: dates,
        title: (c.caseNo ? "دعوى " + c.caseNo + (c.caseYear ? " لسنة " + c.caseYear : "") : "قضية") +
               (c.courtName ? " — " + c.courtName : ""),
        text: vals.join(" ")
      });
    });

    return out;
  }

  /* --------------------------------------------------------------- البحث */

  function norm(t) { return window.lawyerNorm(t); }

  /** بحث بكل الكلمات — يتجاهل الهمزات والتشكيل وصورة الأرقام */
  function search(q, opts) {
    opts = opts || {};
    var words = norm(q).split(" ").filter(Boolean);
    if (!words.length) return [];
    return all().filter(function (r) {
      if (opts.screen && r.screen !== opts.screen) return false;
      var hay = norm(r.text);
      return words.every(function (word) { return hay.indexOf(word) >= 0; });
    });
  }

  /** كل السجلات التي لها تاريخ في يوم بعينه (YYYY-MM-DD) */
  function onDate(iso) {
    return all().filter(function (r) { return r.dates.indexOf(iso) >= 0; });
  }

  /** عدّاد لكل يوم في شهر: { "2026-08-15": 3, … } */
  function monthCounts(year, month0) {
    var pre = year + "-" + (month0 + 1 < 10 ? "0" : "") + (month0 + 1);
    var m = {};
    all().forEach(function (r) {
      r.dates.forEach(function (d) {
        if (d.indexOf(pre) === 0) m[d] = (m[d] || 0) + 1;
      });
    });
    return m;
  }

  function counts() {
    var c = {};
    all().forEach(function (r) { c[r.name] = (c[r.name] || 0) + 1; });
    return c;
  }

  function removeRecord(rec) {
    if (rec.store === "screens") {
      var db = read(SCREENS_KEY, {});
      db[rec.screen] = (db[rec.screen] || []).filter(function (x) { return x._id !== rec.id; });
      localStorage.setItem(SCREENS_KEY, JSON.stringify(db));
      return true;
    }
    if (rec.store === "appointments") {
      localStorage.setItem(APPTS_KEY, JSON.stringify(
        read(APPTS_KEY, []).filter(function (x) { return x.id !== rec.id; })));
      return true;
    }
    if (rec.store === "imported") {
      localStorage.setItem(IMPORTED_KEY, JSON.stringify(
        read(IMPORTED_KEY, []).filter(function (x) { return x.key !== rec.id; })));
      return true;
    }
    if (rec.store === "agenda") {
      localStorage.setItem(AGENDA_KEY, JSON.stringify(
        read(AGENDA_KEY, []).filter(function (x) { return x.id !== rec.id; })));
      return true;
    }
    if (rec.store === "assignments") {
      var t = read(TEAM_KEY, {});
      t.assignments = (t.assignments || []).filter(function (x) { return x.id !== rec.id; });
      localStorage.setItem(TEAM_KEY, JSON.stringify(t));
      return true;
    }
    return false;
  }

  w.LawyerStore = {
    all: all, search: search, onDate: onDate,
    monthCounts: monthCounts, counts: counts,
    remove: removeRecord, names: NAMES, toISO: toISO, norm: norm
  };
})(window);
