/* =============================================================================
   معاينة التقرير — بيانات حيّة ومفلترة فعلياً حسب اختيارات منشئ التقارير.

   كانت المشكلة مضاعفة: (١) الترويسة والملخّص كانا نصوصاً ثابتة لا علاقة
   لها بالبيانات الحقيقية. (٢) حتى بعد ربطها بالبيانات، الجدول كان يعرض
   كل قضايا المكتب دائماً بلا أي فلترة فعلية — فلاتر الفترة/الموكل/
   التصنيف/الدرجة/الحالة في 61-report-builder.html كانت واجهة بلا منطق
   خلفها. هنا: تُقرأ كل معايير الفلترة من رابط الصفحة (مرَّرها منشئ
   التقارير)، وتُطبَّق فعلياً قبل العرض، وتُعرض كل قضية كبطاقة حقول
   (تسمية: قيمة) بحد أقصى ٣ حقول في السطر — بدل الجدول — بنفس أسلوب طباعة
   بيان القضية الفردي للموكل. */
(function (w) {
  "use strict";

  function read(k, d) {
    try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; }
  }
  function ar(n) {
    return String(n == null ? "" : n)
      .replace(/[0-9]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩"[+d]; });
  }
  var AR_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  /** «السبت ٢٠٢٦/٩/٥» — اسم اليوم بجوار التاريخ */
  function dayFull(iso) {
    if (!iso) return "";
    var p = String(iso).split("-");
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return (isNaN(d.getTime()) ? "" : AR_DAYS[d.getDay()] + " ") + ar(p[0] + "/" + p[1] + "/" + p[2]);
  }
  function localISO() {
    var d = new Date();
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }
  function decisionOf(s) { var r = (s && s.raw) || {}; return r.result || r.decision || r["for"] || r.reason || ""; }

  /** الجلسة المؤجَّل إليها: المدوَّنة في القرار، وإلا أقرب جلسة لاحقة في التتابع. */
  /** الجلسة اللي قبل الجلسة دي في نفس القضية (تاريخها وقرارها) — طلب المستخدم ١-١٠ للشكل المختصر */
  function prevOf(c, s) {
    var prev = null;
    (c.sessions || []).forEach(function (x) { if (x && x.date && x.date < s.date && (!prev || x.date > prev.date)) prev = x; });
    return prev;
  }
  function nextOf(c, s) {
    var n = (s.raw || {}).next;
    if (n) return dayFull(n);
    var later = (c.sessions || []).map(function (x) { return x.date; })
      .filter(function (d) { return d && d > s.date; }).sort()[0];
    return later ? dayFull(later) : "";
  }

  /** مهمة 28: أرقام توكيلات موكلي القضية (السارية أولاً)، بصيغة «٥٨٩٢ أ لسنة ٢٠٢٢». */
  var _cliIdx = null;
  function clientsIndex() {
    if (_cliIdx) return _cliIdx;
    _cliIdx = {};
    /* نفس الاسم متسجّل كذا مرة (عاذر/عازر، بصفة وبدون): التوكيل يتاخد من السجل اللي عليه رقم */
    var has = function (k) { return (k.poas && k.poas.length) || String(k.officeNo || "").trim() ? 1 : 0; };
    read("proflawyer.agenda.clients.v1", []).forEach(function (k) {
      if (!k.name) return;
      var key = nkey(k.name), cur = _cliIdx[key];
      if (!cur || has(k) > has(cur)) _cliIdx[key] = k;
    });
    setTimeout(function () { _cliIdx = null; }, 5000);
    return _cliIdx;
  }
  /* قرار المستخدم (٣٠-٩): لكل موكل توكيل واحد بس — آخر توكيل عامله «بشخصه»
     (مش بصفته) ويكون ساري — ويظهر «رقم الموكل بالمكتب» بتاعه مش رقم التوثيق،
     لأنه هو اللي بيوصّل لملف التوكيل في المكتب. مفيش توكيل شخصي ساري ← رقم
     الموكل بالمكتب من سجله لو موجود. */
  function personalPoa(p) {
    var r = norm(p.role || "");
    if (!r) return true;
    if (/بصفت|ولي|وصي|قيم|ممثل|وريث|نائب|مدير|رئيس/.test(r)) return false;
    return /شخص|نفسه/.test(r);
  }
  function poaTime(p) {
    var t = lat(p.poaDate || ""), m = t.match(/(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/) || t.match(/(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/);
    if (m) return m[1].length === 4 ? +m[1] * 10000 + +m[2] * 100 + +m[3] : +m[3] * 10000 + +m[2] * 100 + +m[1];
    var y = parseInt(lat(p.poaYear || ""), 10);
    return isFinite(y) ? y * 10000 : 0;
  }
  /* الموكل في قاعدة الموكلين: الاسم بالظبط، وإلا اسم أطول/أقصر بيبدأ بنفس الكلمات
     (٣ كلمات على الأقل) ولو مطابقة واحدة بس — «رانيا أحمد هاني خضر» ↔ الاسم الكامل */
  function findClient(nm) {
    var idx = clientsIndex();
    var has = function (k) { return k && ((k.poas && k.poas.length) || String(k.officeNo || "").trim()); };
    if (has(idx[nm])) return idx[nm];
    if (nm.split(" ").length < 3) return idx[nm] || null;
    /* «مينا ملاك عاذر» متسجّل من غير توكيل، والتوكيل على «مينا ملاك عازر عبد الشهيد» */
    var hits = Object.keys(idx).filter(function (k) { return k.indexOf(nm + " ") === 0 || nm.indexOf(k + " ") === 0 && k.split(" ").length >= 3; });
    var withPoa = hits.filter(function (k) { return has(idx[k]); });
    if (withPoa.length === 1) return idx[withPoa[0]];
    return idx[nm] || (hits.length === 1 ? idx[hits[0]] : null);
  }
  /* «رقم التوكيل بالمكتب» (قرار المستخدم ١-١٠: التقرير داخلي، والرقم ده اللي بيطلّع
     التوكيل من الحفظ في أول جلسة): آخر توكيل ساري «بشخصه»، وإلا أي توكيل ساري،
     وإلا أي توكيل، وإلا رقم الموكل في سجله. */
  function officeNoOf(c) {
    var seen = {}, out = [];
    String(c.clients || "").split(/\s*·\s*/).forEach(function (part) {
      if (/^ورثة\./.test(part.trim())) return;
      var nm = nkey(part.replace(/\(.*?\)/g, "").replace(/\s[-–]\s*.+$/, "").replace(/^\s*[٠-٩0-9]+\s*[.\-)]\s*/, "").trim());
      var k = nm && findClient(nm);
      if (!k) return;
      var ps = (k.poas && k.poas.length) ? k.poas : (k.poaNo || k.officeNo ? [k] : []);
      var live = function (x) { return String(x.poaStatus || "").indexOf("منته") < 0; };
      /* بالتاريخ؛ ولو توكيل منهم من غير تاريخ ← برقم المكتب (بيزيد مع الوقت) — زي
         حسام أدم: ١٣٣٠ اتسجّل من غير تاريخ وكان ١١١٦ المؤرَّخ بيغلبه */
      var byTime = function (a, b) {
        var ta = poaTime(a), tb = poaTime(b), na = parseInt(lat(a.officeNo), 10) || 0, nb = parseInt(lat(b.officeNo), 10) || 0;
        if (ta && tb && ta !== tb) return tb - ta;
        return nb - na;
      };
      var pick = [ps.filter(function (x) { return live(x) && personalPoa(x); }), ps.filter(live), ps]
        .map(function (g) { return g.filter(function (x) { return String(x.officeNo || "").trim(); }).sort(byTime)[0]; })
        .filter(Boolean)[0];
      var no = (pick && String(pick.officeNo).trim()) || String(k.officeNo || "").trim();
      if (no && !seen[lat(no)]) { seen[lat(no)] = 1; out.push(ar(no)); }
    });
    /* مترتبة تصاعدي (ورثة توفيق: ٩٩٠، ١١٣٧، ١١٣٨، ١١٣٩، ١١٤٢) */
    out.sort(function (a, b) { return (parseInt(lat(a), 10) || 0) - (parseInt(lat(b), 10) || 0); });
    return out;
  }
  function sessionTitle(i, c, s, t) {
    var p = officeNoOf(c);
    return ar(i + 1) + ". " + dayFull(s.date) + (s.date === t ? " (اليوم)" : "") +
      (c.fileNo ? " — ملف رقم " + ar(c.fileNo) : "") +
      " — توكيل بالمكتب " + (p.length ? p.join("، ") : "غير مسجّل");
  }

  /** مهمة 24: تقرير فترة ⇒ كل جلسة داخل الفترة مرتّبة زمنياً تصاعدياً (أول الشهر أولاً)؛
      والجلسات السابقة لليوم تظهر فقط لو لم يُدوَّن لها قرار. */
  function sessionEntries(list, f) {
    var t = localISO(), out = [];
    list.forEach(function (c) {
      (c.sessions || []).forEach(function (s) {
        if (!s.date) return;
        if (f.from && s.date < f.from) return;
        if (f.to && s.date > f.to) return;
        if (s.date < t && decisionOf(s)) return;
        out.push({ c: c, s: s });
      });
    });
    /* صف واحد للقضية في اليوم: نفس الدعوى متسجّلة مرتين (أو جلسة مكررة بنفس
       التاريخ) كانت بتطلع بيانين متطابقين. الهوية: رقم الدعوى/سنتها وإلا رقم
       الملف، + أول موكل. يفضل الأكمل بيانات. */
    var byKey = {}, keep = [];
    var firstClient = function (c) { return norm(String(c.clients || "").split("·")[0].replace(/\(.*?\)/g, "")).split(" ").slice(0, 2).join(" "); };
    var ident = function (c) {
      var n = lat(c.caseNo).replace(/\D/g, "");
      return n ? "n" + n + "/" + lat(c.caseYear).replace(/\D/g, "") : (lat(c.fileNo).replace(/\D/g, "") ? "f" + lat(c.fileNo).replace(/\D/g, "") : "i" + c.id);
    };
    var richness = function (e) { return Object.keys(e.c).filter(function (k) { return e.c[k] !== "" && e.c[k] != null; }).length + (e.c.sessions || []).length; };
    out.forEach(function (e) {
      var k = e.s.date + "|" + ident(e.c) + "|" + firstClient(e.c);
      if (!byKey[k]) { byKey[k] = e; keep.push(e); }
      else if (richness(e) > richness(byKey[k])) { keep[keep.indexOf(byKey[k])] = e; byKey[k] = e; }
    });
    /* نفس اليوم ونفس الموكل والخصم، وواحد من غير رقم دعوى ← نفس القضية متسجّلة مرتين */
    var oppKey = function (c) {
      return norm(String(c.opponents || "").split("·").filter(function (x) { return !/نيابه/.test(norm(x)); })[0] || "")
        .replace(/\(.*?\)/g, "").trim().split(" ").slice(0, 2).join(" ");
    };
    var hasNo = function (c) { return !!lat(c.caseNo).replace(/\D/g, ""); };
    var drop = [];
    keep.forEach(function (e, i) {
      if (drop.indexOf(e) >= 0) return;
      keep.forEach(function (f, j) {
        if (j <= i || drop.indexOf(f) >= 0) return;
        if (e.s.date !== f.s.date || firstClient(e.c) !== firstClient(f.c)) return;
        if (hasNo(e.c) === hasNo(f.c)) return;
        var oe = oppKey(e.c), of2 = oppKey(f.c);
        if (!oe || oe !== of2) return;
        drop.push(hasNo(e.c) ? f : e);                     /* يفضل اللي فيه رقم الدعوى */
      });
    });
    out = keep.filter(function (e) { return drop.indexOf(e) < 0; });
    if (f.last) {
      var lastBy = {};
      out.forEach(function (e) {
        var k = e.c.id || e.c.fileNo || e.c.clients;
        if (!lastBy[k] || e.s.date > lastBy[k].s.date) lastBy[k] = e;
      });
      out = out.filter(function (e) { return lastBy[e.c.id || e.c.fileNo || e.c.clients] === e; });
    }
    out.sort(function (a, b) {
      return a.s.date.localeCompare(b.s.date) ||
        String(a.c.fileNo || "").localeCompare(String(b.c.fileNo || ""), "ar", { numeric: true });
    });
    return out;
  }

  function today() {
    var d = new Date(), p = function (n) { return String(n).padStart(2, "0"); };
    return ar(d.getFullYear() + "/" + p(d.getMonth() + 1) + "/" + p(d.getDate()));
  }
  function dayLabel(iso) {
    if (!iso) return "";
    return ar(String(iso).replace(/-/g, "/"));
  }
  function norm(t) { return window.lawyerNorm(t); }
  /* مفتاح أسماء الموكلين: «عاذر» و«عازر» نفس الاسم (مينا ملاك، توكيل ١١٢٨) */
  function nkey(t) { return norm(t).replace(/ذ/g, "ز"); }
  function lat(v) { return String(v == null ? "" : v).replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x0660; }).trim(); }
  /** شهر إدراج الملف (بيان داخلي للإخطار الضريبي من ٢٠٢٧): يُستخرج من وقت إنشاء معرّف الملف. */
  function addedMonth(c) {
    var m = /^e([0-9a-z]{8})/.exec(String(c.id || "")), t = m ? parseInt(m[1], 36) : NaN;
    if (!isFinite(t)) return "";
    var d = new Date(t);
    return isNaN(d.getTime()) ? "" : MONTHS[d.getMonth()] + " " + ar(d.getFullYear());
  }
  function fileNum(c) { var n = parseInt(lat(c.fileNo).replace(/[^0-9]/g, ""), 10); return isFinite(n) ? n : 1e9; }

  var HOLD = /حكم|حجز|للحكم|للنطق/;

  function cases() { return read("proflawyer.agenda.cases.v1", []); }

  /** آخر جلسة سابقة وأقرب جلسة قادمة لقضية، من تتابع جلساتها. */
  function sessionInfo(c) {
    var iso = (function (d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); })(new Date());
    var dates = (c.sessions || []).map(function (s) { return s.date; }).filter(Boolean).sort();
    var next = dates.filter(function (d) { return d >= iso; })[0] || "";
    var last = dates.filter(function (d) { return d < iso; }).pop() || "";
    return { next: next, last: last };
  }

  /** يقرأ كل معايير الفلترة من رابط الصفحة. */
  function readFilters() {
    var q = new URLSearchParams(location.search);
    var nd = function (v) {
      v = String(v || "").replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x0660; }).replace(/\//g, "-");
      var m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      return m ? m[1] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[3]).slice(-2) : "";
    };
    var from = nd(q.get("from")), to = nd(q.get("to"));
    /* «قضايا الشهر»: بلا فترة مكتوبة ⇒ الشهر الحالي كله من يومه الأول */
    if (q.get("type") === "month" && !from && !to) {
      var d0 = new Date(), p2 = function (n) { return ("0" + n).slice(-2); };
      var last = new Date(d0.getFullYear(), d0.getMonth() + 1, 0).getDate();
      from = d0.getFullYear() + "-" + p2(d0.getMonth() + 1) + "-01";
      to = d0.getFullYear() + "-" + p2(d0.getMonth() + 1) + "-" + p2(last);
    }
    /* «الأسبوع الجاري»: من السبت الماضي/اليوم إلى الخميس (الجمعة إجازة) */
    if (q.get("type") === "week" && !from && !to) {
      var d1 = new Date(), p3 = function (n) { return ("0" + n).slice(-2); };
      var add = -((d1.getDay() + 1) % 7);
      var st = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate() + add);
      var en = new Date(st.getFullYear(), st.getMonth(), st.getDate() + 5);
      var iso = function (d) { return d.getFullYear() + "-" + p3(d.getMonth() + 1) + "-" + p3(d.getDate()); };
      from = iso(st); to = iso(en);
    }
    return {
      from: from,
      to: to,
      type0: q.get("type") || "",
      year: q.get("year") || "",
      client: q.get("client") || "",
      type: q.get("ctype") || "",
      level: q.get("level") || "",
      status: q.get("status") || "",
      lawyer: q.get("lawyer") || "",
      by: q.get("by") || "",
      last: q.get("last") === "1"
    };
  }

  /** الجلسة/الجلسات المرجعية لمطابقة الفترة الزمنية — أي جلسة (سابقة أو
      قادمة) وقعت داخل الفترة المحدَّدة تُدخل القضية في التقرير. */
  function anySessionInRange(c, from, to) {
    if (!from && !to) return true;
    var ss = c.sessions || [];
    if (!ss.length) return false;
    return ss.some(function (s) {
      if (!s.date) return false;
      if (from && s.date < from) return false;
      if (to && s.date > to) return false;
      return true;
    });
  }

  function matchesFilters(c, f) {
    if (!(f.from || f.to) && f.year && f.year.indexOf("كل") < 0 && lat(c.dealYear) !== lat(f.year)) return false;
    if ((f.from || f.to) && !anySessionInRange(c, f.from, f.to)) return false;
    if (f.client && f.client.indexOf("كل") < 0) {
      /* مطابقة تامة لاسم أحد أطراف الموكلين في القضية (لا احتواء جزئي) */
      var want = norm(f.client);
      var hit = String(c.clients || "").split(/\s*·\s*/).some(function (part) {
        if (/^ورثة\./.test(part.trim())) return false;
        return norm(part.replace(/^\s*[٠-٩0-9]+\s*[.\-)]\s*/, "").replace(/\(.*?\)/g, "").replace(/\s*[-–]\s*(مدعي|مستأنف|طاعن|متهم)\S*$/, "").trim()) === want;
      });
      if (!hit) return false;
    }
    if (f.type && f.type.indexOf("كل") < 0 &&
        norm(c.caseType).indexOf(norm(f.type)) < 0) return false;
    if (f.level && f.level.indexOf("كل") < 0 && norm(c.courtLevel) !== norm(f.level)) return false;
    if (f.status && f.status.indexOf("كل") < 0 && norm(c.status) !== norm(f.status)) return false;
    if (f.lawyer && f.lawyer.indexOf("كل") < 0) {
      var strip = function (t) { return norm(String(t || "").replace(/^\s*[اأ]\/\s*/, "")); };
      var wantL = strip(f.lawyer);
      var hasL = String(c.lawyer || "").split(/\s*[·,،]\s*/).some(function (x) { return strip(x) === wantL; });
      if (!hasL) return false;
    }
    if (f.by === "us" || f.by === "them") {
      var dir = filedDirection(c);
      if (f.by === "us" && dir !== "منه") return false;
      if (f.by === "them" && dir !== "ضده") return false;
    }
    return true;
  }

  /** مين أقام الدعوى: صفة أول موكل بين القوسين (نفس منطق partyDirection في case-file). */
  function filedDirection(c) {
    var m = /\(([^)]*)\)/.exec(String(c.clients || ""));
    var cap = norm(m ? m[1] : "");
    if (!cap) return "";
    if (/ضده/.test(cap)) return "ضده";
    if (/مستانف|طاعن|مدعي|مستشكل|معلن|طالب/.test(cap)) return "منه";
    return "";
  }

  /* «القضايا واجبة الطعن» (F-REP-1): القضايا اللي صدر فيها حكم وميعاد طعنها لسه
     ما فاتش — نفس حساب تنبيه «ميعاد طعن» في reminders.js (تاريخ الحكم + المدة،
     ممتدة للعطلات). ترتيبها بأقرب ميعاد. */
  function appealDue() {
    var t = new Date(), today = t.getFullYear() + "-" + ("0" + (t.getMonth() + 1)).slice(-2) + "-" + ("0" + t.getDate()).slice(-2);
    var by = {};
    if (w.Reminders && Reminders.items) Reminders.items().forEach(function (x) {
      if (x.kind === "ميعاد طعن" && x.caseId && x.date >= today) by[x.caseId] = x.date;
    });
    return by;
  }

  function filteredCases() {
    var f = readFilters();
    var out = cases().filter(function (c) { return matchesFilters(c, f); });
    if (f.type0 === "appeal") {
      var due = appealDue();
      out = out.filter(function (c) { return !!due[c.id]; })
               .sort(function (a, b) { return due[a.id] < due[b.id] ? -1 : due[a.id] > due[b.id] ? 1 : 0; });
      out.forEach(function (c) { c._appealDue = due[c.id]; });
      return out;
    }
    if (f.type0 === "year" || (f.year && !(f.from || f.to))) out.sort(function (a, b) { return fileNum(a) - fileNum(b); });   /* الأقدم فالأحدث */
    return out;
  }

  function stats(list) {
    var iso = (function (d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); })(new Date());
    var active = 0, held = 0, upcoming = 0, ended = 0;
    list.forEach(function (c) {
      if (String(c.status || "").trim() === "متداولة") active++;
      if (c.finished || /منته/.test(String(c.status || ""))) ended++;
      var h = false, up = false;
      (c.sessions || []).forEach(function (s) {
        if (!s.date) return;
        if (s.date >= iso) up = true;
        var _r = s.raw || {};
        var dec = [_r.result, _r.decision, _r["for"], _r.reason].filter(Boolean).join(" ");
        if (HOLD.test(dec)) h = true;
      });
      if (h) held++;
      if (up) upcoming++;
    });
    return { total: list.length, active: active, held: held, upcoming: upcoming, ended: ended };
  }

  function setText(node, text) {
    if (node) node.textContent = text;
  }

  /** يستبدل النص الذي يلي وسم <b> داخل عنصر */
  function fixPair(el, value) {
    if (!el) return;
    var b = el.querySelector("b");
    el.textContent = "";
    if (b) el.appendChild(b);
    el.appendChild(document.createTextNode(" " + value));
  }

  var MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  function titleOf(f) {
    if (f.type0 === "appeal") return "تقرير القضايا واجبة الطعن (ميعاد الطعن لسه ساري)";
    if (f.type0 === "month" && f.from) {
      var d = new Date(f.from + "T00:00:00");
      return "تقرير جلسات هذا الشهر (" + MONTHS[d.getMonth()] + " " + ar(d.getFullYear()) + ")";
    }
    if (f.type0 === "week" && f.from) return "تقرير جلسات الأسبوع الجاري من " + dayLabel(f.from) + " إلى " + dayLabel(f.to);
    if (f.from || f.to) return "تقرير جلسات الفترة" + (f.from ? " من " + dayLabel(f.from) : "") + (f.to ? " إلى " + dayLabel(f.to) : "");
    return "";
  }

  function apply() {
    var f = readFilters();
    var rt = document.querySelector("h2.rt"), tt = titleOf(f);
    if (rt && tt) rt.textContent = tt;
    var list = filteredCases();
    var s = stats(list);

    /* الترويسة */
    document.querySelectorAll("span, div").forEach(function (el) {
      if (el.children.length) return;
      var t = el.textContent;
      if (/تاريخ الإصدار:/.test(t)) setText(el, "تاريخ الإصدار: " + today());
      else if (/رقم التقرير:/.test(t)) setText(el, "");
      else if (/ت:\s*[٠-٩0-9]{6,}/.test(t)) {
        setText(el, t.replace(/·?\s*ت:\s*[٠-٩0-9]+/, "").trim());
      }
    });

    /* معايير الفلترة المطبَّقة فعلياً — تُعرض كما هي، لا نصوصاً ثابتة */
    document.querySelectorAll("span, div.t").forEach(function (el) {
      var b = el.querySelector("b");
      if (!b) return;
      var k = b.textContent.replace(/[:：]\s*$/, "").trim();
      if (k === "سنة التعامل") fixPair(el, f.year || "كل السنوات");
      else if (k === "الموكل") fixPair(el, f.client || "كل الموكلين");
      else if (k === "التصنيف") fixPair(el, f.type || "كل التصنيفات");
      else if (k === "الدرجة") fixPair(el, f.level || "كل الدرجات");
      else if (k === "الحالة") fixPair(el, f.status || "كل الحالات");
      else if (k === "الفترة" && (f.from || f.to))
        fixPair(el, (f.from ? dayLabel(f.from) : "…") + " → " + (f.to ? dayLabel(f.to) : "…"));
      else if (k === "عدد النتائج") fixPair(el, (f.from || f.to) ? ar(sessionEntries(list, f).length) + " جلسة" : ar(s.total) + " قضية");
      else if (k === "إجمالي القضايا") fixPair(el, ar(s.total));
      else if (k === "متداولة") fixPair(el, ar(s.active));
      else if (k === "واجبة الطعن") fixPair(el, ar(s.held));
      else if (k === "لها جلسات قادمة") fixPair(el, ar(s.upcoming));
      else if (k === "منتهية") fixPair(el, ar(s.ended));
      else if (k === "المحامي" && f.lawyer) fixPair(el, f.lawyer);
    });

    fillCards(list, f);
    setTimeout(renderPaper, 50);
  }

  /** بطاقة حقول (تسمية: قيمة) لكل قضية — ٣ حقول كحد أقصى في السطر،
      بنفس أسلوب طباعة بيان القضية الفردي (لا جدول). */
  function fillCards(list, f) {
    var box = document.getElementById("repCards");
    if (!box) return;
    box.textContent = "";
    box.style.cssText = "display:flex;flex-direction:column;gap:10px";

    if (f && (f.from || f.to)) { fillSessionCards(box, sessionEntries(list, f)); return; }

    if (!list.length) {
      var d = document.createElement("div");
      d.style.cssText = "text-align:center;padding:22px;color:var(--muted)";
      d.textContent = "لا توجد قضايا مطابقة لمعايير هذا التقرير.";
      box.appendChild(d);
      return;
    }

    list.forEach(function (c, i) {
      var si = sessionInfo(c);
      var card = document.createElement("div");
      card.style.cssText = "border:1px solid #ccc;border-radius:8px;padding:10px 12px;" +
        "page-break-inside:avoid;break-inside:avoid";

      var title = document.createElement("div");
      title.style.cssText = "font-weight:700;margin-bottom:6px;font-size:13px";
      title.textContent = ar(i + 1) + ". " + (c.clients || "—") +
        (c.fileNo ? " — ملف رقم " + ar(c.fileNo) : "");
      card.appendChild(title);

      var grid = document.createElement("div");
      grid.style.cssText = "display:flex;flex-wrap:wrap;gap:5px 14px";

      var fields = [
        ["رقم الدعوى", c.caseNo ? ar(c.caseNo) + (c.caseYear ? " لسنة " + ar(c.caseYear) : "") : ""],
        ["الدرجة", c.courtLevel || ""],
        ["المحكمة", [c.courtName, c.circuit].filter(Boolean).join(" — ")],
        ["الموكل", c.clients || ""],
        ["الخصم", c.opponents || ""],
        ["الموضوع", c.subject || ""],
        ["التصنيف", c.caseType || ""],
        ["الحالة", c.status || ""],
        ["آخر جلسة", dayLabel(si.last)],
        ["الجلسة القادمة", dayLabel(si.next)],
        ["سنة التعامل", c.dealYear ? ar(c.dealYear) : ""],
        ["شهر الإدراج", (+lat(readFilters().year) >= 2027) ? addedMonth(c) : ""]
      ];

      fields.forEach(function (kv) {
        if (!kv[1]) return;
        var cell = document.createElement("div");
        cell.style.cssText = "flex:1 1 30%;min-width:140px;font-size:12.5px;" +
          "display:flex;gap:10px;line-height:1.9;padding:2px 10px;overflow:visible";
        var bEl = document.createElement("b");
        bEl.style.cssText = "font-weight:600;flex:0 0 auto";
        bEl.textContent = kv[0] + ":";
        var sp = document.createElement("span");
        sp.textContent = kv[1];
        sp.style.flex = "1";
        cell.appendChild(bEl); cell.appendChild(sp);
        grid.appendChild(cell);
      });

      card.appendChild(grid);
      box.appendChild(card);
    });
  }

  function fillSessionCards(box, entries) {
    if (!entries.length) {
      var d = document.createElement("div");
      d.style.cssText = "text-align:center;padding:22px;color:var(--muted)";
      d.textContent = "لا توجد جلسات في هذه الفترة.";
      box.appendChild(d);
      return;
    }
    var t = localISO();
    entries.forEach(function (e, i) {
      var c = e.c, s = e.s, dec = decisionOf(s), past = s.date < t;
      var card = document.createElement("div");
      card.style.cssText = "border:1px solid #ccc;border-radius:8px;padding:10px 12px;" +
        "page-break-inside:avoid;break-inside:avoid" + (past ? ";border-color:#d9a441;background:#fff8ec" : "");
      var title = document.createElement("div");
      title.style.cssText = "font-weight:700;margin-bottom:6px;font-size:13px";
      title.textContent = sessionTitle(i, c, s, t);
      card.appendChild(title);
      var grid = document.createElement("div");
      grid.style.cssText = "display:flex;flex-wrap:wrap;gap:5px 14px";
      var fields = [
        ["الدعوى", c.caseNo ? ar(c.caseNo) + (c.caseYear ? " لسنة " + ar(c.caseYear) : "") : ""],
        ["المحكمة", [c.courtName, c.circuit].filter(Boolean).join(" — ")],
        ["القاعة", [c.hall && "قاعة " + ar(c.hall), c.floor && "دور " + ar(c.floor), c.time].filter(Boolean).join(" · ")],
        ["الموكل", c.clients || ""],
        ["الخصم", c.opponents || ""],
        ["الموضوع", c.subject || ""],
        ["القرار", past ? (dec || "بدون قرار") : dec],
        ["تأجلت إلى", dec ? nextOf(c, s) : ""]
      ];
      fields.forEach(function (kv) {
        if (!kv[1]) return;
        var cell = document.createElement("div");
        cell.style.cssText = "flex:1 1 30%;min-width:140px;font-size:12.5px;display:flex;gap:5px;line-height:1.8";
        var bEl = document.createElement("b");
        bEl.style.cssText = "font-weight:600;flex:0 0 auto";
        bEl.textContent = kv[0] + ":";
        var sp = document.createElement("span");
        sp.textContent = kv[1]; sp.style.flex = "1";
        cell.appendChild(bEl); cell.appendChild(sp);
        grid.appendChild(cell);
      });
      card.appendChild(grid);
      box.appendChild(card);
    });
  }

  /** بلوكات PDF للتقرير الحالي (تُرسم على ورق المؤسسة عبر PdfDoc) */
  /* شكل الطباعة: «مفصّل» (كروت ٣ أعمدة) أو «مختصر» (سطور «العنوان: القيمة»، ٤–٥ جلسات في الصفحة) */
  var LAYOUT_KEY = "proflawyer.report.layout";
  function layout() {
    var q = new URLSearchParams(location.search).get("layout");
    if (q === "brief" || q === "full") return q;
    try { return localStorage.getItem(LAYOUT_KEY) === "brief" ? "brief" : "full"; } catch (e) { return "full"; }
  }
  function setLayout(v) { try { localStorage.setItem(LAYOUT_KEY, v === "brief" ? "brief" : "full"); } catch (e) { } }
  /* الموكلون في سطر والخصوم في سطر (طلب المستخدم ١-١٠)، كل اسم بصفته */
  function sideLine(t) { return String(t || "").split(/\s*·\s*/).filter(Boolean).join("، "); }
  /* «الموكل (صفته) / الخصم (صفته)» في سطر واحد */
  function partiesLine(c) {
    var cl = String(c.clients || "").split(/\s*·\s*/).filter(Boolean).join("، ");
    var op = String(c.opponents || "").split(/\s*·\s*/).filter(Boolean).join("، ");
    return cl && op ? cl + "  /  " + op : (cl || op);
  }

  function pdfBlocks() {
    var f = readFilters(), list = filteredCases(), t = localISO(), brief = layout() === "brief";
    var blocks = [{ center: titleOf(f) || ("تقرير المحامي المحترف — " + (f.from || f.to ? "جلسات الفترة" : "بيان القضايا")) },
      { center: "تاريخ الإصدار: " + today() + ((f.from || f.to) ? "   ·   الفترة: " + (f.from ? dayLabel(f.from) : "…") + " → " + (f.to ? dayLabel(f.to) : "…") : "") }];
    if (f.from || f.to) {
      var es = sessionEntries(list, f);
      blocks.push({ center: "عدد الجلسات: " + ar(es.length) });
      es.forEach(function (e, i) {
        var c = e.c, s2 = e.s, dec = decisionOf(s2), past = s2.date < t;
        var pairs = [
          ["الدعوى", c.caseNo ? ar(c.caseNo) + (c.caseYear ? " لسنة " + ar(c.caseYear) : "") : ""],
          ["المحكمة", [c.courtName, c.circuit].filter(Boolean).join(" — ")],
          ["القاعة", [c.hall && "قاعة " + ar(c.hall), c.floor && "دور " + ar(c.floor), c.time].filter(Boolean).join(" · ")],
          ["الموكل", c.clients || ""], ["الخصم", c.opponents || ""], ["الموضوع", c.subject || ""],
          ["القرار", past ? (dec || "بدون قرار") : dec],
          ["تأجلت إلى", dec ? nextOf(c, s2) : ""]
        ].filter(function (p) { return p[1]; });
        if (brief) {
          var hall = [c.hall && "قاعة " + ar(c.hall), c.floor && "دور " + ar(c.floor), c.time].filter(Boolean).join(" · ");
          blocks.push({ brief: { title: sessionTitle(i, c, s2, t), lines: [
            [["الجهة", [c.courtName, c.circuit].filter(Boolean).join(" — ") + (hall ? " — " + hall : "")],
             ["الدعوى", c.caseNo ? ar(c.caseNo) + (c.caseYear ? " لسنة " + ar(c.caseYear) : "") : ""]],
            [["الموكلون", sideLine(c.clients)]],
            [["الخصوم", sideLine(c.opponents)]],
            [["الموضوع", c.subject || ""]],
            (function () { var pv = prevOf(c, s2); return pv ? [["الجلسة السابقة", dayFull(pv.date)], ["قرارها", decisionOf(pv) || "بدون قرار"]] : [["الجلسة السابقة", "أول جلسة"]]; })(),
            [["القرار", past ? (dec || "بدون قرار") : dec], ["تأجلت إلى", dec ? nextOf(c, s2) : ""]]
          ] } });
          return;
        }
        blocks.push({ card: { title: sessionTitle(i, c, s2, t), pairs: pairs, perRow: 3 } });
      });
    } else {
      blocks.push({ center: "عدد النتائج: " + ar(list.length) + " قضية" });
      list.forEach(function (c, i) {
        var si = sessionInfo(c);
        var pairs = [
          ["رقم الدعوى", c.caseNo ? ar(c.caseNo) + (c.caseYear ? " لسنة " + ar(c.caseYear) : "") : ""],
          ["الدرجة", c.courtLevel || ""],
          ["المحكمة", [c.courtName, c.circuit].filter(Boolean).join(" — ")],
          ["الموكل", c.clients || ""], ["الخصم", c.opponents || ""], ["الموضوع", c.subject || ""], ["التصنيف", c.caseType || ""], ["الحالة", c.status || ""],
          ["آخر جلسة", dayLabel(si.last)], ["الجلسة القادمة", dayLabel(si.next)],
          ["سنة التعامل", c.dealYear ? ar(c.dealYear) : ""],
        ["شهر الإدراج", (+lat(readFilters().year) >= 2027) ? addedMonth(c) : ""]
        ].filter(function (p) { return p[1]; });
        if (brief) {
          blocks.push({ brief: { title: ar(i + 1) + ". " + (c.fileNo ? "ملف رقم " + ar(c.fileNo) + " — " : "") + (c.status || ""), lines: [
            [["الجهة", [c.courtName, c.circuit].filter(Boolean).join(" — ")],
             ["الدعوى", c.caseNo ? ar(c.caseNo) + (c.caseYear ? " لسنة " + ar(c.caseYear) : "") + (c.courtLevel ? " (" + c.courtLevel + ")" : "") : ""]],
            [["الموكلون", sideLine(c.clients)]],
            [["الخصوم", sideLine(c.opponents)]],
            [["الموضوع", c.subject || ""], ["التصنيف", c.caseType || ""]],
            [["آخر جلسة", dayLabel(si.last)], ["القادمة", dayLabel(si.next)], ["سنة التعامل", c.dealYear ? ar(c.dealYear) : ""]]
          ] } });
          return;
        }
        blocks.push({ card: { title: ar(i + 1) + ". " + (c.clients || "—") + (c.fileNo ? " — ملف رقم " + ar(c.fileNo) : ""), pairs: pairs, perRow: 3 } });
      });
    }
    return blocks;
  }

  /** PDF على ورق المؤسسة ثم مشاركته/حفظه (منه يُطبع أو يُرسل) */
  function sharePaperPdf() {
    if (!w.PdfDoc || !w.PdfBuild || !w.Share) { alert("بناء الـPDF غير متاح."); return; }
    if (w.Letterhead && !Letterhead.paper()) { alert("ورق المؤسسة لم يُحمَّل بعد — أعد المحاولة بعد ثانيتين."); return; }
    PdfDoc.build(pdfBlocks()).then(function (pages) {
      var pdf = PdfBuild.fromJpegs(pages);
      if (!pdf) { alert("تعذّر بناء الـPDF."); return; }
      Share.sharePdf(PdfBuild.toBase64(pdf), "تقرير-" + today().replace(/\//g, "-"));
    }).catch(function (e) { alert("تعذّر بناء الـPDF: " + (e && e.message ? e.message : e)); });
  }

  /** يفتح Gmail برسالة جاهزة والـPDF مرفقاً كمرفق عادي (يُفتح ويُنزَّل مباشرة من البريد). */
  function emailPaperPdf() {
    if (!w.PdfDoc || !w.PdfBuild) { alert("بناء الـPDF غير متاح."); return; }
    if (w.Letterhead && !Letterhead.paper()) { alert("ورق المؤسسة لم يُحمَّل بعد — أعد المحاولة بعد ثانيتين."); return; }
    PdfDoc.build(pdfBlocks()).then(function (pages) {
      var pdf = PdfBuild.fromJpegs(pages);
      if (!pdf) { alert("تعذّر بناء الـPDF."); return; }
      var name = "تقرير-" + today().replace(/\//g, "-") + ".pdf", b64 = PdfBuild.toBase64(pdf);
      var t = titleOf(readFilters()) || "تقرير المكتب";
      if (w.AndroidShare && AndroidShare.sendEmail) AndroidShare.sendEmail("", t, t + " — التقرير مرفق (PDF) — مؤسسة المستشار حسن عبد المنعم.", name, b64, "application/pdf");
      else Share.sharePdf(b64, name.replace(/\.pdf$/, ""));
    }).catch(function (e) { alert("تعذّر بناء الـPDF: " + (e && e.message ? e.message : e)); });
  }

  /** معاينة/طباعة على ورق المؤسسة: صفحات PDF نفسها (خلفية الورق + كارت البيان) بدل الورقة القديمة */
  var _paperTries = 0;
  function renderPaper() {
    if (!w.PdfDoc || !w.Letterhead) return;
    if (!Letterhead.paper()) {                       /* الخلفية لم تُحمَّل بعد */
      if (++_paperTries < 40) setTimeout(renderPaper, 250);
      return;
    }
    PdfDoc.build(pdfBlocks()).then(function (pages) {
      var host = document.getElementById("paperPreview");
      if (!host) {
        host = document.createElement("div"); host.id = "paperPreview";
        var wrap = document.querySelector(".sheet-wrap");
        if (wrap && wrap.parentNode) wrap.parentNode.insertBefore(host, wrap); else document.body.appendChild(host);
        var st = document.createElement("style");
        st.textContent = "body.paper-mode .sheet-wrap{display:none!important}" +
          "#paperPreview{padding:10px 8px}" +
          "#paperPreview img{display:block;width:100%;max-width:820px;margin:0 auto 14px;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.25)}" +
          "@media print{@page{size:A4 portrait;margin:0}body.paper-mode .no-print,body.paper-mode .appbar{display:none!important}" +
          "body.paper-mode .phone{max-width:none!important}#paperPreview{padding:0}" +
          "#paperPreview img{max-width:none;width:100%;margin:0;box-shadow:none;page-break-after:always;break-after:page}}";
        document.head.appendChild(st);
      }
      host.textContent = "";
      pages.forEach(function (src) {
        var im = document.createElement("img"); im.src = src; im.alt = "صفحة التقرير";
        host.appendChild(im);
      });
      document.body.classList.add("paper-mode");
      var sg = document.getElementById("sizeGroup");   /* ورق المؤسسة A4 طولي دائماً */
      if (sg) sg.style.display = "none";
    }).catch(function () { /* يبقى العرض القديم */ });
  }

  /* زرار الشكل جنب أزرار الـPDF — بيعيد رسم المعاينة على طول */
  function wireLayoutBtn() {
    var ref = document.getElementById("paperBtn");
    if (!ref || document.getElementById("layoutBtn")) return;
    var b = document.createElement("button");
    b.type = "button"; b.className = "btn sm"; b.id = "layoutBtn";
    var label = function () { b.textContent = layout() === "brief" ? "▤ الشكل: مختصر" : "▦ الشكل: مفصّل"; };
    label();
    b.onclick = function () { setLayout(layout() === "brief" ? "full" : "brief"); label(); _paperTries = 0; renderPaper(); };
    ref.parentNode.insertBefore(b, ref);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wireLayoutBtn); else wireLayoutBtn();

  w.ReportLive = { apply: apply, stats: stats, filteredCases: filteredCases, pdfBlocks: pdfBlocks, sharePaperPdf: sharePaperPdf, emailPaperPdf: emailPaperPdf, renderPaper: renderPaper, layout: layout, setLayout: setLayout };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(apply, 300); });
  } else { setTimeout(apply, 300); }
})(window);
