/* =============================================================================
   «بيان الدعوى» — الصورة المطبوعة التي تُرسَل للموكل (تطبيق المكتب + بوابة الموكلين، عربي/إنجليزي).
   مصدر واحد للتنسيق: عنوان ← جدول (الحقل/البيان) ← جدول الأطراف ← تتابع الجلسات مقسَّماً بحسب مرحلة التقاضي،
   وعنوان كل مرحلة خارج الجدول («تتابع جلسات أول درجة» / «تتابع جلسات الاستئناف» / «تتابع جلسات النقض»).

   تقسيم المراحل (بترتيب الأولوية):
     ١) سلسلة سجلات مُرحَّلة (promotedFrom) — كل درجة من سجلها.
     ٢) علامات نصية داخل الجلسات («أول جلسة استئناف»…).
     ٣) قاعدة الحكم: الجلسة التي بعد جلسةٍ نوعها «حكم» تبدأ مرحلة جديدة؛ ودرجة آخر مرحلة = درجة القضية الحالية،
        وما قبلها يتدرّج للخلف (نقض ← استئناف ← أول درجة).
   الاستعمال: CaseStatement.build(c, {lang:"ar"|"en", chain:[سجلات أقدم], tv:fn}) ثم toBlocks(model) للـPDF أو toHtml(model).
   ============================================================================= */
(function (w) {
  "use strict";

  var T = {
    ar: {
      dir: "rtl", head: ["الحقل", "البيان"], pHead: ["الأطراف", "الأسماء والصفات"], sHead: ["م", "رول", "تاريخ الجلسة", "نوع الجلسة", "ما تم بها من قرارات أو أحكام", "ملاحظة"],
      title: function (no, yr, court) { return "بيان الدعوى رقم " + no + (yr ? " لسنة " + yr : "") + (court ? " — " + court : ""); },
      seq: "تتابع الجلسات", st: ["تتابع جلسات أول درجة", "تتابع جلسات الاستئناف", "تتابع جلسات النقض"],
      f: { file: "رقم الملف", deal: "سنة التعامل", firstNo: "رقم الدعوى الابتدائية", level: "درجة التقاضي", higher: " ▲ طعن أعلى", dir: "الطعن مرفوع",
        status: "الحالة", type: "نوع الدعوى", lawyer: "المحامي", court: "المحكمة", circuit: "الدائرة", subject: "الموضوع", notes: "ملاحظات",
        crime: "الجناية/الجنحة", total: "كلي رقم", of: " لسنة " },
      no: { civil: "دعوى", appeal: "استئناف", cass: "طعن نقض" }, appeal: "الاستئناف",
      clients: "الموكلون", opponents: "الخصوم", partyTitle: function (lvl, no, subj) { return "في " + (lvl || "الدعوى") + " رقم " + no + (subj ? " — " + subj : ""); },
      byHim: "منه", againstHim: "ضده", delay: "التأجيل: "
    },
    en: {
      dir: "ltr", head: ["Field", "Details"], pHead: ["Parties", "Names & Capacities"], sHead: ["#", "Roll", "Hearing Date", "Type", "Decisions / Judgments", "Note"],
      title: function (no, yr, court) { return "Case Statement No. " + no + (yr ? " of " + yr : "") + (court ? " — " + court : ""); },
      seq: "Hearing Sequence", st: ["Hearings — First Instance", "Hearings — Appeal", "Hearings — Cassation"],
      f: { file: "File No.", deal: "Year of Engagement", firstNo: "First-instance Case No.", level: "Litigation Stage", higher: " ▲ Higher appeal", dir: "Filed",
        status: "Status", type: "Case Type", lawyer: "Lawyer", court: "Court", circuit: "Circuit", subject: "Subject", notes: "Notes",
        crime: "Felony / Misdemeanor No.", total: "Total No.", of: " of " },
      no: { civil: "Case No.", appeal: "Appeal No.", cass: "Cassation Appeal No." }, appeal: "Appeal No.",
      clients: "Clients", opponents: "Opponents", partyTitle: function (lvl, no, subj) { return "In " + (lvl || "the case") + " No. " + no + (subj ? " — " + subj : ""); },
      byHim: "by the client", againstHim: "against the client", delay: "Adjourned: "
    }
  };

  /* ---------- أدوات ---------- */
  function norm(t) {
    return String(t == null ? "" : t)
      .replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x0660; })
      .replace(/[ً-ْٰـ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
      .replace(/ء/g, "").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/\s+/g, " ").trim().toLowerCase();
  }
  function has(t, words) { t = norm(t); return words.some(function (x) { return t.indexOf(norm(x)) >= 0; }); }
  function parties(str) {
    return String(str || "").split("·").map(function (p) {
      p = p.trim(); if (!p) return null;
      var m = p.match(/^([\s\S]*?)\s*\(([^)]*)\)\s*$/);
      return m ? { name: m[1].trim(), cap: m[2].trim() } : { name: p, cap: "" };
    }).filter(Boolean);
  }
  function sortedSessions(c) {
    return ((c && c.sessions) || []).slice().sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
  }
  function resultOf(sn) { var r = (sn && sn.raw) || {}; return r.result || r.decision || r["for"] || r.reason || ""; }
  function reasonOf(sn) { var r = (sn && sn.raw) || {}; return r["for"] || r.reason || ""; }
  function isCrim(t) { return /جناي|جنح/.test(String(t || "")); }
  function appealHigher(c) {
    var lvl = norm(c.courtLevel), typ = norm(c.caseType);
    if (has(lvl, ["استئناف عالي", "نقض"])) return true;
    return has(lvl, ["ابتدائ", "كلية"]) && has(typ, ["مدني مستأنف", "جنح مستأنف"]);
  }
  function direction(c, L) {
    var rows = parties(c.clients).filter(function (x) { return x.cap; });
    var cap = norm((rows[0] && rows[0].cap) || "");
    if (!cap) return "";
    if (cap.indexOf(norm("ضده")) >= 0) return L.againstHim;
    if (has(cap, ["مستأنف", "طاعن", "مدعي", "مستشكل", "معلن", "طالب"])) return L.byHim;
    return "";
  }
  function cat(level) { var l = norm(level); return l.indexOf("نقض") >= 0 ? 2 : (l.indexOf("استيناف") >= 0 ? 1 : 0); }
  function noKey(level) { var k = cat(level); return k === 2 ? "cass" : (k === 1 ? "appeal" : "civil"); }

  /* ---------- تقسيم الجلسات إلى مراحل ---------- */
  function markerLabelCat(text) {
    var t = norm(text);
    if (has(t, ["اول جلسة نقض", "اول جلسة طعن بالنقض", "اول جلسة الطعن بالنقض"])) return 2;
    if (has(t, ["اول جلسة استئناف"])) return 1;
    return -1;
  }
  /** يعيد [{cat, rows}] — rows بترتيب زمني. chain: سجلات أقدم (اختياري). */
  function stageGroups(c, chain) {
    var i;
    if (chain && chain.length) {
      var nodes = chain.concat([c]);
      return nodes.map(function (n) { return { cat: cat(n.courtLevel), rows: sortedSessions(n) }; }).filter(function (g) { return g.rows.length; });
    }
    var ss = sortedSessions(c);
    if (!ss.length) return [];
    /* علامات نصية */
    var groups = [{ cat: -1, rows: [] }];
    ss.forEach(function (sn) {
      var k = markerLabelCat((resultOf(sn) || "") + " " + (reasonOf(sn) || "") + " " + ((sn.raw && sn.raw.type) || ""));
      var last = groups[groups.length - 1];
      if (k >= 0 && k !== last.cat) groups.push(last = { cat: k, rows: [] });
      last.rows.push(sn);
    });
    if (groups.length > 1) {
      if (groups[0].cat === -1) groups[0].cat = Math.max(0, groups[1].cat - 1);
      return groups.filter(function (g) { return g.rows.length; });
    }
    /* قاعدة الحكم */
    var stages = [[]];
    ss.forEach(function (sn, idx) {
      stages[stages.length - 1].push(sn);
      var isJudg = norm((sn.raw && sn.raw.type) || "") === norm("حكم");
      if (isJudg && idx < ss.length - 1) stages.push([]);
    });
    var n = stages.length, last = cat(c.courtLevel);
    return stages.map(function (rows, k) { return { cat: Math.max(0, last - (n - 1 - k)), rows: rows }; });
  }

  /* ---------- النموذج ---------- */
  function build(c, o) {
    o = o || {};
    var lang = o.lang === "en" ? "en" : "ar", L = T[lang], F = L.f;
    var tv = o.tv || function (v) { return v; };
    var num = function (v) {
      v = String(v == null ? "" : v);
      return lang === "ar" ? v.replace(/[0-9]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩"[+d]; }) : v.replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x0660; });
    };
    var nyr = function (n, y) { return n ? num(n) + (y ? F.of + num(y) : "") : ""; };
    var rows = [];
    function add(k, v) { if (v != null && String(v) !== "") rows.push([k, String(v)]); }
    add(F.file, num(c.fileNo || "—")); add(F.deal, num(c.dealYear || ""));
    add(L.no[noKey(c.courtLevel)], nyr(c.caseNo, c.caseYear));
    if (appealHigher(c) && c.firstNo) add(F.firstNo, nyr(c.firstNo, c.firstYear));
    add(F.level, tv(c.courtLevel, "courtLevel") + (appealHigher(c) ? F.higher : ""));
    if (appealHigher(c)) add(F.dir, direction(c, L));
    add(F.status, tv(c.status, "status")); add(F.type, tv(c.caseType, "caseType")); add(F.lawyer, tv(c.lawyer, "lawyer"));
    add(F.court, tv(c.courtName, "courtName")); add(F.circuit, tv(c.circuit, "circuit"));
    add(F.subject, tv(c.subject, "subject")); add(F.notes, tv(c.notes, "notes"));
    if (isCrim(c.caseType)) {
      add(F.crime, nyr(c.crimeNo, c.crimeYear));
      add(c.appealKind ? tv(c.appealKind, "appealKind") : L.appeal, nyr(c.appealNo, c.appealYear));
      add(F.total, nyr(c.totalNo, c.totalYear));
    }
    var cl = parties(c.clients).map(function (p) { return tv(p.name, "party") + (p.cap ? " (" + tv(p.cap, "party") + ")" : ""); });
    var op = parties(c.opponents).map(function (p) { return tv(p.name, "party") + (p.cap ? " (" + tv(p.cap, "party") + ")" : ""); });
    var pRows = [];
    if (cl.length) pRows.push([L.clients, cl.join(lang === "ar" ? "  ·  " : "  ·  ")]);
    if (op.length) pRows.push([L.opponents, op.join("  ·  ")]);
    var partyBlocks = pRows.length ? [{ title: L.partyTitle(tv(c.courtLevel, "courtLevel"), nyr(c.caseNo, c.caseYear) || "—", tv(c.subject, "subject")), rows: pRows }] : [];

    var groups = stageGroups(c, o.chain), n = 0;
    var multi = groups.length > 1;
    var sess = groups.map(function (g) {
      return {
        label: multi ? L.st[g.cat] : L.seq,
        rows: g.rows.map(function (sn) {
          n++;
          var raw = sn.raw || {}, done = resultOf(sn) || (reasonOf(sn) ? L.delay + reasonOf(sn) : "");
          return [num(n), num(raw.roll || ""), num(String(sn.date || "").replace(/-/g, "/")), tv(raw.type || "", "stype"), tv(done, "decision"), ""];
        })
      };
    });
    return {
      lang: lang, L: L, title: L.title(num(c.caseNo || "—"), c.caseYear ? num(c.caseYear) : "", tv(c.courtName, "courtName")),
      fields: rows, parties: partyBlocks, sessions: sess
    };
  }

  /* ---------- PDF (PdfDoc blocks) ---------- */
  function toBlocks(m) {
    var L = m.L, blocks = [{ center: m.title }, { table: { headers: L.head, widths: [1, 2.6], rows: m.fields } }];
    m.parties.forEach(function (p) { blocks.push({ h: p.title }, { table: { headers: L.pHead, widths: [1, 3.2], rows: p.rows } }); });
    m.sessions.forEach(function (g) {
      if (!g.rows.length) return;
      blocks.push({ h: g.label }, { table: { headers: L.sHead, widths: [0.5, 0.7, 1.2, 1.3, 4, 0.6], rows: g.rows } });
    });
    return blocks;
  }

  /* ---------- HTML (بوابة الموكلين) ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }
  var CSS = ".stmt{font-family:inherit;color:#111}.stmt h3.st-title{text-align:center;font-size:1.15rem;margin:6px 0 10px}" +
    ".stmt h4{margin:16px 0 6px;font-size:1rem}.stmt .st-wrap{overflow-x:auto}.stmt table{width:100%;border-collapse:collapse;margin-bottom:6px}" +
    ".stmt th{background:#efe6d6;border:1px solid #c9b48f;padding:7px 9px;font-size:.9rem;text-align:start}.stmt td{border:1px solid #c9b48f;padding:7px 9px;vertical-align:top;font-size:.92rem;white-space:pre-line;overflow-wrap:anywhere}" +
    ".stmt td.c,.stmt th.c{text-align:center}.stmt.rtl{direction:rtl}.stmt.ltr{direction:ltr}";
  function toHtml(m) {
    var L = m.L, h = "<div class=\"stmt " + L.dir + "\"><style>" + CSS + "</style><h3 class=\"st-title\">" + esc(m.title) + "</h3>";
    function table(head, rows, centerCols) {
      var t = "<div class=\"st-wrap\"><table><thead><tr>" + head.map(function (x, i) { return "<th" + (centerCols && centerCols[i] ? " class=\"c\"" : "") + ">" + esc(x) + "</th>"; }).join("") + "</tr></thead><tbody>";
      rows.forEach(function (r) { t += "<tr>" + r.map(function (x, i) { return "<td" + (centerCols && centerCols[i] ? " class=\"c\"" : "") + ">" + esc(x) + "</td>"; }).join("") + "</tr>"; });
      return t + "</tbody></table></div>";
    }
    h += table(L.head, m.fields);
    m.parties.forEach(function (p) { h += "<h4>" + esc(p.title) + "</h4>" + table(L.pHead, p.rows); });
    m.sessions.forEach(function (g) {
      if (!g.rows.length) return;
      h += "<h4>" + esc(g.label) + "</h4>" + table(L.sHead, g.rows, [1, 1, 1, 1, 0, 1]);
    });
    return h + "</div>";
  }

  w.CaseStatement = { build: build, toBlocks: toBlocks, toHtml: toHtml, stageGroups: stageGroups, T: T, norm: norm };
})(window);
