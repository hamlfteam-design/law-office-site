/* =============================================================================
   استيراد تصديرة «تقويم الجلسات والمواعيد».

   شكل الملف الحقيقي:
     { cases:[ {_id,fileNo,dealYear,status,courtLevel,courtName,caseType,circuit,
                caseNo,caseYear,subject,hall,floor,time,loc,
                clientsAll:[{name,role}], opponents:[{name,role}],
                sessions:[{date,…}], notes, officeLawyer } ],
       clients:[ {name,email,phone,poaNo,…} ],
       papers:[…] }

   يُخزَّن في مخازن التطبيق نفسها فتظهر البيانات في البحث والتقويم
   ومركز السجلات دون أي شاشة خاصة.
   ============================================================================= */
(function (w) {
  "use strict";
  /* كتابة كذا مخزن مع بعض «يا كله يا ولا حاجة» (F-AGN-1): لو المساحة خلصت في
     النص، بيرجّع اللي اتكتب لقيمته القديمة بدل ما يسيب القاعدة نص جديدة ونص قديمة */
  function stableId(c, i) {
    var parts = [c.fileNo, c.caseNo, c.caseYear, c.courtName, c.circuit, c.clients, c.opponents, c.subject]
      .map(function (v) { return String(v == null ? "" : v).replace(/\s+/g, " ").trim(); });
    if (!parts.join("")) return "ag" + i;               /* سجل فاضي: مفيش حاجة ثابتة نبني عليها */
    var str = parts.join("|"), h1 = 5381, h2 = 52711;
    for (var k = 0; k < str.length; k++) {
      var ch = str.charCodeAt(k);
      h1 = ((h1 * 33) ^ ch) >>> 0; h2 = ((h2 * 31) + ch) >>> 0;
    }
    return "ag" + h1.toString(36) + h2.toString(36);
  }
  function atomicSet(pairs) {
    var old = pairs.map(function (p) { return localStorage.getItem(p[0]); });
    try {
      pairs.forEach(function (p) { localStorage.setItem(p[0], p[1]); });
      return true;
    } catch (e) {
      pairs.forEach(function (p, i) {
        try { if (old[i] === null) localStorage.removeItem(p[0]); else localStorage.setItem(p[0], old[i]); } catch (e2) { }
      });
      return false;
    }
  }



  var CASES_KEY   = "proflawyer.agenda.cases.v1";
  var CLIENTS_KEY = "proflawyer.agenda.clients.v1";
  var APPTS_KEY   = "proflawyer.appointments.v1";

  function read(k, d) {
    try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; }
  }
  function la(t) {
    return String(t == null ? "" : t)
      .replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x0660; });
  }
  function ar(n, p) {
    var s = String(n);
    if (p) while (s.length < p) s = "0" + s;
    return s.replace(/[0-9]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩"[+d]; });
  }
  function isoOf(v) {
    var s = la(v).trim().replace(/\//g, "-");
    var m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!m) return "";
    var p = function (x) { x = String(parseInt(x, 10)); return x.length < 2 ? "0" + x : x; };
    return m[1] + "-" + p(m[2]) + "-" + p(m[3]);
  }

  /** هل هذا الملف تصديرة تقويم بصيغة القضايا؟ */
  function detect(raw) {
    return !!(raw && Array.isArray(raw.cases) && raw.cases.length &&
              raw.cases[0] && ("courtName" in raw.cases[0] || "caseNo" in raw.cases[0]));
  }

  function summarise(raw, onlyActive) {
    var cases = raw.cases || [];
    if (onlyActive) {
      cases = cases.filter(function (c) { return String(c.status || "").trim() === "متداولة"; });
    }
    var sessions = 0, upcoming = 0;
    var today = new Date().toISOString().slice(0, 10);
    cases.forEach(function (c) {
      (c.sessions || []).forEach(function (s) {
        sessions++;
        var d = isoOf(s.date || s.d || s);
        if (d && d >= today) upcoming++;
      });
    });
    return {
      cases: cases.length,
      allCases: (raw.cases || []).length,
      clients: (raw.clients || []).length,
      sessions: sessions,
      upcoming: upcoming,
      list: cases
    };
  }

  function title(c) {
    var bits = [];
    if (c.caseNo) bits.push("دعوى " + c.caseNo + (c.caseYear ? " لسنة " + c.caseYear : ""));
    if (c.courtName) bits.push(c.courtName);
    if (!bits.length && c.subject) bits.push(c.subject);
    return bits.join(" — ") || "قضية";
  }

  function names(list) {
    return (list || []).map(function (p) {
      return (p.name || "").trim() + (p.role ? " (" + p.role + ")" : "");
    }).filter(Boolean).join(" · ");
  }

  /**
   * يستورد القضايا المختارة.
   * تُحفظ كسجلات قضايا، وتُضاف جلساتها القادمة إلى المواعيد بتنبيه.
   */
  function run(raw, opts) {
    opts = opts || {};
    var info = summarise(raw, opts.onlyActive !== false);

    var store = read(CASES_KEY, []);
    var seen = {};
    store.forEach(function (c) { seen[c.id] = true; });

    var appts = read(APPTS_KEY, []);
    var apSeen = {};
    appts.forEach(function (a) { apSeen[a.id] = true; });

    var today = new Date().toISOString().slice(0, 10);
    var added = 0, dup = 0, apAdded = 0;

    info.list.forEach(function (c, i) {
      /* من غير _id: معرّف ثابت من محتوى القضية نفسها (F-AGN-2) — رقم الصف كان
         بيتغيّر بين استيراد والتاني فقضايا مختلفة تاخد نفس المعرّف وتتخطّى «مكررة» */
      var id = c._id || stableId(c, i);
      if (seen[id]) { dup++; return; }
      seen[id] = true;

      store.push({
        id: id,
        fileNo: c.fileNo || "", dealYear: c.dealYear || "",
        status: c.status || "", courtLevel: c.courtLevel || "",
        courtName: c.courtName || "", caseType: c.caseType || "",
        circuit: c.circuit || "", caseNo: c.caseNo || "",
        caseYear: c.caseYear || "", subject: c.subject || "",
        hall: c.hall || "", floor: c.floor || "", time: c.time || "",
        loc: c.loc || "", lawyer: c.officeLawyer || "",
        clients: names(c.clientsAll || c.clients),
        opponents: names(c.opponents),
        notes: c.notes || "",
        sessions: (c.sessions || []).map(function (s) {
          return { date: isoOf(s.date || s.d || s), raw: s };
        }).filter(function (s) { return s.date; })
      });
      added++;

      /* الجلسات القادمة تصبح مواعيد بتنبيه قبل يوم */
      (c.sessions || []).forEach(function (s, k) {
        var d = isoOf(s.date || s.d || s);
        if (!d || d < today) return;
        var aid = "ag_" + id + "_" + k;
        if (apSeen[aid]) return;
        apSeen[aid] = true;
        var p = d.split("-");
        appts.push({
          id: aid,
          title: "جلسة — " + title(c),
          with: (c.clientsAll && c.clientsAll[0] && c.clientsAll[0].name) || "",
          date: ar(p[0]) + "/" + ar(p[1], 2) + "/" + ar(p[2], 2),
          time: "", kind: "جلسة", before: 1440,
          notes: [c.circuit ? "الدائرة: " + c.circuit : "",
                  c.hall ? "قاعة " + c.hall + (c.floor ? " — دور " + c.floor : "") : "",
                  c.loc || "",
                  c.opponents && c.opponents.length ? "الخصوم: " + names(c.opponents) : "",
                  s.result ? "النتيجة: " + s.result : ""]
                 .filter(Boolean).join("\n"),
          done: false, imported: true
        });
        apAdded++;
      });
    });

    var clients = read(CLIENTS_KEY, []);
    if (Array.isArray(raw.clients) && raw.clients.length) {
      var cSeen = {};
      clients.forEach(function (x) { cSeen[(x.name || "").trim()] = true; });
      raw.clients.forEach(function (cl) {
        var n = (cl.name || "").trim();
        if (!n || cSeen[n]) return;
        cSeen[n] = true;
        clients.push(cl);
      });
    }

    if (!atomicSet([[CASES_KEY, JSON.stringify(store)], [CLIENTS_KEY, JSON.stringify(clients)],
                    [APPTS_KEY, JSON.stringify(appts)]])) {
      return { ok: false, error: "المساحة ممتلئة — لم يكتمل الاستيراد، وما اتغيّرش حاجة." };
    }

    var dd = dedupe();

    /* الاستيراد كان بيكتب في localStorage فقط ولا يوصل فيربيز — القضايا المستوردة
       كانت تفضل حبيسة الجهاز/المتصفح اللي وقع عليه الاستيراد. نمرّرها هنا على
       CaseFile.commitAll (لو الصفحة حمّلت case-file.js) عشان ترفع كل قضية جديدة
       لفيربيز بنفس آلية الحفظ العادية (مقارنة بالنسخة الأخيرة المتزامنة). */
    if (window.CaseFile && window.CaseFile.commitAll) {
      try { window.CaseFile.commitAll(JSON.parse(localStorage.getItem(CASES_KEY)) || []); } catch (e) { }
    }

    return { ok: true, added: added, dup: dup, appointments: apAdded,
             merged: dd.removed, clients: clients.length, total: store.length };
  }


  /* ------------------------------------------------- إزالة الازدواج
     الجلسة المستوردة تُنشئ موعداً لتذكيرها. وإذا كان الموعد نفسه مسجّلاً
     سلفاً بيد المستخدم، صار لدينا سطران لشيء واحد. القاعدة: **تبقى الجلسة
     ويُحذف الموعد** — لأن الجلسة تحمل بيانات القضية كاملة والموعد لا.

     التطابق: نفس اليوم + إشارة مشتركة (رقم الدعوى أو اسم المحكمة).       */

  function dedupe() {
    var appts = read(APPTS_KEY, []);
    var cases = read(CASES_KEY, []);
    if (!appts.length || !cases.length) return { removed: 0, kept: appts.length };

    /* فهرس: اليوم -> نصوص الجلسات فيه */
    var byDay = {};
    cases.forEach(function (c) {
      (c.sessions || []).forEach(function (ss) {
        if (!ss.date) return;
        var keys = [];
        if (c.caseNo)    keys.push(norm(c.caseNo));
        if (c.courtName) keys.push(norm(c.courtName));
        if (c.circuit)   keys.push(norm(c.circuit));
        (byDay[ss.date] = byDay[ss.date] || []).push(keys);
      });
    });

    var removed = 0;
    var kept = appts.filter(function (a) {
      /* المواعيد التي وُلدت من الاستيراد نفسه تُبقى — فهي تمثيل الجلسة */
      if (a.id && a.id.indexOf("ag_") === 0) return true;

      var iso = toISO(a.date);
      var day = byDay[iso];
      if (!day) return true;

      var hay = norm([a.title, a.with, a.notes].filter(Boolean).join(" "));
      var dup = day.some(function (keys) {
        return keys.length && keys.some(function (k) {
          return k.length > 2 && hay.indexOf(k) >= 0;
        });
      });
      if (dup) { removed++; return false; }
      return true;
    });

    if (removed) {
      try { localStorage.setItem(APPTS_KEY, JSON.stringify(kept)); } catch (e) { }
    }
    return { removed: removed, kept: kept.length };
  }

  function norm(t) { return window.lawyerNorm(t); }

  function toISO(v) {
    if (w.lawyerToISO) return w.lawyerToISO(v);
    return String(v || "").replace(/[٠-٩]/g,
      function (d) { return d.charCodeAt(0) - 0x0660; }).replace(/\//g, "-");
  }

  /* ------ دمج مواعيد التقويم كملفات قضايا (بمعاينة، لا يمسّ القائم) ------ */
  function norm(t) { return window.lawyerNorm(t); }
  function firstName(s) { return String(s || "").split("·")[0].replace(/\([^)]*\)/g, "").trim(); }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

  /** يبني قضية من موعد تقويم — الحقول توضَع فيما يناسبها من حقول القضية. */
  function caseFromAppt(a, i) {
    var t = String(a.title || "");
    var m = la(t).match(/دعوى\s*(\d+)\s*(?:\/|لسنة)\s*(\d+)/);
    var d = isoOf(a.date);
    return {
      id: "cal" + Date.now().toString(36) + i + Math.floor(Math.random() * 1e4).toString(36),
      migrated: true, fileNo: "", dealYear: (d || "").slice(0, 4),
      status: "متداولة", courtLevel: "", courtName: "", caseType: "", circuit: "",
      caseNo: m ? m[1] : "", caseYear: m ? m[2] : "", subject: t,
      clients: a.with || "", opponents: "", lawyer: "", hall: "", floor: "", time: a.time || "", loc: "",
      notes: "مُدمَجة من التقويم" + (a.kind ? " — " + a.kind : "") + (a.notes ? " — " + a.notes : ""),
      sessions: d ? [{ date: d, raw: { type: a.kind || "موعد", roll: "", result: "", next: "", "for": a.notes || "" } }] : []
    };
  }
  /** مواعيد التقويم غير الممثَّلة أصلاً بجلسة قضية قائمة (بلا تكرار). */
  function apptCandidates() {
    var cases = read(CASES_KEY, []), appts = read(APPTS_KEY, []), sig = {};
    cases.forEach(function (c) {
      var cl = norm(firstName(c.clients));
      (c.sessions || []).forEach(function (s) { var d = isoOf(s.date); if (d) sig[d + "|" + cl] = 1; });
    });
    var seen = {}, out = [];
    appts.forEach(function (a) {
      var d = isoOf(a.date); if (!d) return;
      if (sig[d + "|" + norm(a.with || "")]) return;
      var key = d + "|" + norm(a.title || "");
      if (seen[key]) return; seen[key] = 1;
      out.push(a);
    });
    return out;
  }
  function mergePreview() {
    var c = apptCandidates();
    return { count: c.length, examples: c.slice(0, 6).map(function (a) {
      return (a.title || "موعد") + (a.with ? " — " + a.with : "") + (a.date ? " · " + ar(isoOf(a.date)) : ""); }) };
  }
  function mergeAppts() {
    var cases = read(CASES_KEY, []), cand = apptCandidates();
    cand.forEach(function (a, i) { cases.push(caseFromAppt(a, i)); });
    if (!write(CASES_KEY, cases)) return { ok: false };
    return { ok: true, added: cand.length };
  }

  w.AgendaImport = { detect: detect, dedupe: dedupe, summarise: summarise, run: run, title: title,
                     CASES_KEY: CASES_KEY, CLIENTS_KEY: CLIENTS_KEY,
                     mergePreview: mergePreview, mergeAppts: mergeAppts };
})(window);
