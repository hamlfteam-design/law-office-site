/* =============================================================================
   دمج المكرَّر وتنظيفه.

   الاستيراد كان يصنع من كل جلسة قادمة موعداً مستقلاً، فصارت الجلسة الواحدة
   تظهر مرتين: تحت «قضايا التقويم» وتحت «المواعيد». والموعد أحياناً يحمل
   بياناً لا تحمله الجلسة (الدائرة · القاعة والدور · مقرّ المحكمة · الخصوم ·
   نتيجة الجلسة)، فحذفه وحده يُضيّع ذلك البيان.

   لذلك الترتيب هنا: **يُكمَّل الناقص أولاً من البيان الأوفى، ثم يُحذف
   المكرَّر** — لا العكس. والجلسة هي التي تبقى.

   ويُدمج كذلك ملفّان لقضية واحدة إن وُجدا: يُبقى صاحب رقم الملف بالمكتب،
   ويُكمَّل منه ومن أخيه كل حقل ناقص، وتُضمّ جلساتهما.
   ============================================================================= */
(function (w) {
  "use strict";

  var CASES = "proflawyer.agenda.cases.v1";
  var APPTS = "proflawyer.appointments.v1";

  function read(k, d) {
    try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; }
  }
  function write(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { return false; }
  }
  function la(t) {
    return String(t == null ? "" : t)
      .replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x0660; });
  }
  /* نفس الأسماء (المحاكم خصوصاً) بتتطبّع آلاف المرات في الخطة — ذاكرة بسيطة */
  var normMemo = {}, normMemoN = 0;
  function norm(t) {
    var key = t == null ? "" : String(t), v = normMemo[key];
    if (v === undefined) {
      if (normMemoN > 40000) { normMemo = {}; normMemoN = 0; }
      v = normMemo[key] = window.lawyerNorm(key); normMemoN++;
    }
    return v;
  }
  function iso(v) {
    return w.lawyerToISO ? w.lawyerToISO(v) : la(v).replace(/\//g, "-");
  }
  function blank(v) { return !String(v == null ? "" : v).trim(); }

  /* ------------------------------------------- قراءة ملاحظات الموعد

     الموعد المصنوع من جلسة يحمل ملاحظاته في أسطر معنونة، فتُقرأ منها
     البيانات التي قد تنقص القضية أو الجلسة. */

  function parseNotes(text) {
    var out = {};
    String(text || "").split(/\r?\n/).forEach(function (line) {
      var t = line.trim();
      if (!t) return;
      var m = t.match(/^الدائرة:\s*(.+)$/);
      if (m) { out.circuit = m[1].trim(); return; }
      m = t.match(/^الخصوم:\s*(.+)$/);
      if (m) { out.opponents = m[1].trim(); return; }
      m = t.match(/^النتيجة:\s*(.+)$/);
      if (m) { out.result = m[1].trim(); return; }
      m = t.match(/^قاعة\s*(\S+)(?:\s*—\s*دور\s*(\S+))?/);
      if (m) { out.hall = m[1]; if (m[2]) out.floor = m[2]; return; }
      if (!out.loc) out.loc = t;          /* أول سطر بلا عنوان: مقرّ المحكمة */
    });
    return out;
  }

  /** يُكمِّل الحقول الفارغة في الهدف من المصدر، ويعيد عدد ما أُكمِل. */
  function fillBlanks(target, source, keys) {
    var n = 0;
    keys.forEach(function (k) {
      if (blank(target[k]) && !blank(source[k])) { target[k] = source[k]; n++; }
    });
    return n;
  }

  /* --------------------------------------- ١) المواعيد المكرَّرة للجلسات */

  /**
   * كل موعد صُنع من جلسة: يُكمَّل منه ما ينقص القضية والجلسة ثم يُحذف.
   * المطابقة بالمعرّف «ag_<القضية>_<رقم>» أولاً، ثم بالتاريخ والاسم احتياطاً.
   */
  function mergeSessionAppointments(apply) {
    var cases = read(CASES, []);
    var appts = read(APPTS, []);

    var byId = {};
    cases.forEach(function (c) { byId[c.id] = c; });

    var report = { matched: 0, filledCase: 0, filledSession: 0, removed: 0, kept: 0 };
    var keep = [];

    appts.forEach(function (a) {
      var m = String(a.id || "").match(/^ag_(.+)_(\d+)$/);
      var c = m ? byId[m[1]] : null;
      var d = iso(a.date);

      /* لا معرّف؟ نبحث عن قضية لها جلسة في اليوم نفسه وموكلها هو صاحب الموعد */
      if (!c && d && a.with) {
        var who = norm(a.with);
        for (var i = 0; i < cases.length; i++) {
          var cand = cases[i];
          if (norm(cand.clients).indexOf(who) < 0) continue;
          if ((cand.sessions || []).some(function (s) { return s.date === d; })) {
            c = cand; break;
          }
        }
      }
      if (!c || !d) { keep.push(a); report.kept++; return; }

      var sn = (c.sessions || []).filter(function (s) { return s.date === d; })[0];
      if (!sn) { keep.push(a); report.kept++; return; }   /* لا جلسة تقابله — يبقى */

      report.matched++;
      var info = parseNotes(a.notes);

      /* أكمل ما ينقص القضية من بيان الموعد */
      report.filledCase += fillBlanks(c, info,
        ["circuit", "hall", "floor", "loc", "opponents"]);

      /* وأكمل ما ينقص الجلسة نفسها */
      sn.raw = sn.raw || {};
      if (blank(sn.raw.result) && blank(sn.raw.decision) && !blank(info.result)) {
        sn.raw.result = info.result;
        report.filledSession++;
      }
      /* التذكير ينتقل إلى الجلسة بدل الموعد المحذوف */
      if (a.before && !sn.remindBefore) sn.remindBefore = a.before;

      if (apply) report.removed++;
      else { report.removed++; keep.push(a); }
    });

    if (apply) {
      write(CASES, cases);
      write(APPTS, keep);
    }
    return report;
  }

  /* ------------------------------------------- ٢) ملفّان لقضية واحدة */

  function caseSig(c) {
    var no = la(c.caseNo).trim(), yr = la(c.caseYear).trim();
    if (no) return "n|" + no + "|" + yr + "|" + norm(c.courtName);
    /* بلا رقم دعوى: الموكلون والمحكمة */
    return "c|" + norm(c.clients) + "|" + norm(c.courtName);
  }

  var CASE_KEYS = ["fileNo", "dealYear", "status", "courtLevel", "courtName",
                   "caseType", "circuit", "caseNo", "caseYear", "subject",
                   "hall", "floor", "time", "loc", "lawyer", "clients",
                   "opponents", "notes"];

  /**
   * يجمع الملفات المتطابقة: يبقى صاحب رقم الملف بالمكتب، ويُكمَّل منه
   * ومن أخيه كل حقل ناقص، وتُضمّ الجلسات بلا تكرار تاريخ.
   */
  function mergeDuplicateCases(apply) {
    var cases = read(CASES, []);
    var groups = {};
    cases.forEach(function (c) {
      var k = caseSig(c);
      if (!norm(c.clients) && !la(c.caseNo).trim()) return;   /* بلا هوية — يُترك */
      (groups[k] = groups[k] || []).push(c);
    });

    var report = { groups: 0, merged: 0, filled: 0, sessions: 0 };
    var drop = {};

    Object.keys(groups).forEach(function (k) {
      var g = groups[k];
      if (g.length < 2) return;

      /* صاحب رقم الملف بالمكتب هو الأصل؛ فإن تعدّد فالأوفى بياناً */
      g.sort(function (a, b) {
        var fa = blank(a.fileNo) ? 0 : 1, fb = blank(b.fileNo) ? 0 : 1;
        if (fa !== fb) return fb - fa;
        var ca = CASE_KEYS.filter(function (x) { return !blank(a[x]); }).length;
        var cb = CASE_KEYS.filter(function (x) { return !blank(b[x]); }).length;
        return cb - ca;
      });

      report.groups++;
      var keep = g[0];

      g.slice(1).forEach(function (other) {
        report.filled += fillBlanks(keep, other, CASE_KEYS);

        keep.sessions = keep.sessions || [];
        var have = {};
        keep.sessions.forEach(function (s) { have[s.date] = s; });
        (other.sessions || []).forEach(function (s) {
          if (!have[s.date]) { keep.sessions.push(s); report.sessions++; }
          else {
            /* الجلسة نفسها في الملفّين — أكمل قرارها إن كان ناقصاً */
            var t = have[s.date];
            t.raw = t.raw || {};
            var src = s.raw || {};
            if (blank(t.raw.result) && blank(t.raw.decision)) {
              if (!blank(src.result))   { t.raw.result = src.result; report.filled++; }
              else if (!blank(src.decision)) { t.raw.result = src.decision; report.filled++; }
            }
          }
        });
        drop[other.id] = true;
        report.merged++;
      });
    });

    if (apply && report.merged) {
      write(CASES, cases.filter(function (c) { return !drop[c.id]; }));
    }
    return report;
  }


  /* ------------------------------------------------ مهمة 14: خطة الدمج (dry-run)
     قواعد الأسماء (حقل الموكل) + الدمج بالمطابقة الأعلى. plan() لا تغيّر شيئاً؛
     planApply() تحفظ نسخة احتياطية أولاً ثم تنفّذ وترفع للسحابة (حذف/حفظ). */

  var OTHERS_RE = /^(.*?)\s*(?:و\s*[آأا]خر(?:ين|ون)?|[آأا]خر(?:ين|ون))(?=\s|$|[(\-،,])(.*)$/;
  var CAP_WORDS = /^(مدعي|مدعى|مدعين|مدعية|مستأنف|مستأنفين|مستأنفة|طاعن|طاعنين|طاعنة|مطعون|م عليهم|ضد)/;

  function splitParties(txt) {
    return String(txt || "").split("·").map(function (p) {
      p = p.trim(); if (!p) return null;
      var m = p.match(/^([\s\S]*?)\s*\(([^()]*)\)\s*$/);
      return m ? { name: m[1].trim(), cap: m[2].trim() } : { name: p, cap: "" };
    }).filter(Boolean);
  }
  function joinParties(list) {
    return list.map(function (x) { return x.name + (x.cap ? " (" + x.cap + ")" : ""); }).join(" · ");
  }
  function cleanName(n) {
    return String(n || "").replace(/^[\s\-،,؛\/]+|[\s\-،,؛\/]+$/g, "").replace(/\s+/g, " ");
  }

  /* أسماء قاعدة الموكلين (فريدة بعد التطبيع) لإكمال الاسم الأقصر */
  function dbNames() {
    var seen = {}, out = [];
    ((w.ClientsPOA && w.ClientsPOA.all) ? w.ClientsPOA.all() : []).forEach(function (c) {
      var k = norm(c.name);
      if (k && !seen[k]) { seen[k] = 1; out.push({ name: c.name, k: k }); }
    });
    return out;
  }
  /* اسم قاعدة «نظيف» فقط يصلح للإكمال التلقائي (بلا بصفته/وكيل/رموز) */
  function cleanDbName(n) {
    return !/(بصفته|بصفتها|وكيل|ولي|عن |شركة|[-،,()\/])/.test(n) &&
           !/(^|\s)و(\s|$)/.test(n) && n.split(/\s+/).length <= 6;
  }
  function completeFromDb(name, db) {
    var k = norm(name), words = k.split(" ");
    if (words.length < 2) return null;
    var hits = db.filter(function (d) { return d.k !== k && d.k.indexOf(k + " ") === 0; });
    var clean = hits.filter(function (d) { return cleanDbName(d.name); });
    if (clean.length === 1 && hits.length === 1) return { name: clean[0].name, weak: words.length < 3 };
    /* عدّة مطابقات: نأخذ أطول اسم نظيف (الأوفى) لو له طول فريد ولا يقل المكتوب عن ٣ كلمات */
    if (clean.length && words.length >= 3) {
      var mx = Math.max.apply(null, clean.map(function (d) { return d.k.split(" ").length; }));
      var top = clean.filter(function (d) { return d.k.split(" ").length === mx; });
      if (top.length === 1) return { name: top[0].name, weak: false, longest: clean.length };
    }
    return hits.length ? { ambiguous: hits.length, dirty: !clean.length } : null;
  }

  /* الصفة دائماً مذكّر مفرد وبإملاء القائمة المكتوبة (Lists partyCaps):
     أي تأنيث أو تثنية أو جمع يُستبدل بالمذكّر المفرد. */
  var CAP_FIX = [
    ["مدعى عليها", "مدعى عليه"], ["مدعى عليهما", "مدعى عليه"], ["مدعى عليهم", "مدعى عليه"], ["مدعى عليهن", "مدعى عليه"],
    ["مدعي عليها", "مدعى عليه"], ["مدعي عليهم", "مدعى عليه"], ["مدعي عليهما", "مدعى عليه"], ["مدعي عليه", "مدعى عليه"],
    ["مستأنف ضدها", "مستأنف ضده"], ["مستأنف ضدهما", "مستأنف ضده"], ["مستأنف ضدهم", "مستأنف ضده"], ["مستأنف ضدهن", "مستأنف ضده"],
    ["مستأنف عليها", "مستأنف عليه"], ["مستأنف عليهما", "مستأنف عليه"], ["مستأنف عليهم", "مستأنف عليه"],
    ["مطعون ضدها", "مطعون ضده"], ["مطعون ضدهما", "مطعون ضده"], ["مطعون ضدهم", "مطعون ضده"],
    ["مستشكل ضدها", "مستشكل ضده"], ["مستشكل ضدهم", "مستشكل ضده"], ["متظلم ضدها", "متظلم ضده"], ["متظلم ضدهم", "متظلم ضده"],
    ["مشكو في حقها", "مشكو في حقه"], ["مشكو في حقهما", "مشكو في حقه"], ["مشكو في حقهم", "مشكو في حقه"],
    ["مجني عليها", "مجني عليه"], ["مجني عليهما", "مجني عليه"], ["مجني عليهم", "مجني عليه"],
    ["م عليها", "م عليه"], ["م عليهما", "م عليه"], ["م عليهم", "م عليه"],
    ["مدعية", "مدعي"], ["مدعيين", "مدعي"], ["مدعيان", "مدعي"], ["مدعين", "مدعي"], ["مدعيتين", "مدعي"], ["مدعيات", "مدعي"], ["مدعٍ", "مدعي"],
    ["متهمة", "متهم"], ["متهمين", "متهم"], ["متهمان", "متهم"], ["متهمتين", "متهم"], ["متهمات", "متهم"],
    ["طاعنة", "طاعن"], ["طاعنين", "طاعن"], ["طاعنان", "طاعن"], ["طاعنتين", "طاعن"],
    ["مستأنفة", "مستأنف"], ["مستأنفين", "مستأنف"], ["مستأنفان", "مستأنف"], ["مستأنفتين", "مستأنف"],
    ["مستشكلة", "مستشكل"], ["مستشكلين", "مستشكل"], ["متظلمة", "متظلم"], ["متظلمين", "متظلم"],
    ["شاكية", "شاكي"], ["شاكين", "شاكي"], ["شاكيان", "شاكي"], ["متدخلة", "متدخل"], ["متدخلين", "متدخل"], ["متدخلان", "متدخل"],
    ["مستأنفون", "مستأنف"], ["مستأنفة ضدها", "مستأنف ضده"], ["مستانفة", "مستأنف"], ["ملتمسة", "ملتمس"], ["ملتمس ضدهم", "ملتمس ضده"],
    ["م ضدها", "م ضده"], ["م ضدهم", "م ضده"], ["م ضدهما", "م ضده"], ["مطعون ضدهن", "مطعون ضده"],
    ["وارثة", "وارث"], ["ورثة", "وارث"], ["دائنة", "دائن"], ["دائنين", "دائن"], ["مدينة", "مدين"], ["مدينين", "مدين"]
  ];
  CAP_FIX.sort(function (x, y) { return y[0].length - x[0].length; });
  function capList() {
    try { return (w.Lists && w.Lists.get) ? (w.Lists.get("partyCapsClient") || []) : []; } catch (e) { return []; }
  }
  /* «م ضده» / «م عليه» / «م ض» تُحسم بدرجة التقاضي:
     استئناف ← مستأنف ضده، نقض ← مطعون ضده، (م عليه) في الابتدائي/الجزئي ← مدعى عليه. */
  function levelKind(level) {
    var l = norm(level);
    if (l.indexOf(norm("استئناف")) >= 0) return "app";
    if (l.indexOf(norm("نقض")) >= 0) return "cass";
    if (l.indexOf(norm("ابتدائي")) >= 0 || l.indexOf(norm("جزئي")) >= 0) return "first";
    return "";
  }
  function resolveAbbrev(t, level, flag) {
    var kind = levelKind(level);
    return t.replace(/(^|\s|[(/،,])(م\.?\s*ض(?:ده)?|م ضده|م عليه)(?=$|\s|[)/،,]|\d|[٠-٩])/g, function (all, pre, tok) {
      var isOn = /^م\.?\s*ض/.test(tok);          /* م ض / م ضده */
      var rep = kind === "app" ? "مستأنف ضده" : kind === "cass" ? "مطعون ضده"
              : (kind === "first" && !isOn) ? "مدعى عليه" : "";
      if (!rep) { if (flag) flag.push(tok); return all; }
      return pre + rep;
    });
  }

  function normCap(cap, level, flag) {
    var t = String(cap || "");
    if (!t) return t;
    CAP_FIX.forEach(function (p) {
      t = t.replace(new RegExp("(^|\\s|[(/،,])" + p[0] + "(?=$|\\s|[)/،,])", "g"), "$1" + p[1]);
    });
    t = resolveAbbrev(t, level, flag);
    /* إملاء القائمة المكتوبة: نفس الصفة بعد التطبيع تُكتب كما في القائمة */
    var k = norm(t);
    capList().forEach(function (x) { if (norm(x) === k) t = x; });
    return t;
  }

  /* الأطراف بعد: حذف «وآخرين»، فصل الأسماء المتجاورة، إكمال الاسم من القاعدة */
  /* تصحيحات يدوية قررها المستخدم لأسماء بعينها (المفتاح: النص الأصلي مطبَّعاً) */
  /* المتوفى يُعرَف من حالة التوكيل: «منتهي» بسبب «وفاة الموكل» (ClientsPOA.deceasedList).
     SEED = بذرة لمرة واحدة: تُسجَّل حالة المتوفى وورثته في سجل الموكل عند التنفيذ. */
  var DECEASED_SEED = [];
  /* جوه الخطة الجدول ثابت: كان بيتبني من قاعدة الموكلين كلها مع كل طرف
     (~٢٠٠٠ مرة = دقيقة على التابلت) */
  var decMemo = null;
  function deceasedTable() {
    if (decMemo) return decMemo;
    var out = [], seen = {};
    var dyn = (w.ClientsPOA && w.ClientsPOA.deceasedList) ? w.ClientsPOA.deceasedList() : [];
    dyn.concat(DECEASED_SEED).forEach(function (d) {
      var k = norm(d.name);
      if (!seen[k]) { seen[k] = 1; out.push({ name: d.name, heirs: (d.heirs || []).map(function (h) { return h.name || h; }) }); }
    });
    return out;
  }
  function caseActive(c) { return norm(c.status || "") !== norm("منتهية"); }

  
  var ZEINA_NAMES = [];
  function isZeina(n) { return false; }

  var MANUAL_CLIENTS = [];

  /* قاعدة الورثة على قائمة أطراف (تُستعمل للخصوم): فصل الاسم المتلاصق، استبدال المتوفى
     بسطر «ورثة. … وهم :» + الورثة، أو إضافة السطر فقط لو الورثة مكتوبون فعلاً. */
  var SPLIT_RE = /\s*[،,؛\/]\s*|\s+-\s+|\s+و\s+/;
  function deceasedOnParties(list, c) {
    if (!caseActive(c)) return false;
    var changed = false;
    deceasedTable().forEach(function (dec) {
      var dn = norm(dec.name), hk = dec.heirs.map(norm), head = norm("ورثة. " + dec.name);
      var out = [];
      list.forEach(function (x) {
        var segs = x.name.split(SPLIT_RE).map(cleanName).filter(Boolean);
        if (segs.length > 1 && segs.some(function (g) { return norm(g) === dn; })) {
          segs.forEach(function (g) { out.push({ name: g, cap: x.cap }); });
          changed = true;
        } else out.push(x);
      });
      var hasHead = out.some(function (x) { return norm(x.name).indexOf(head) === 0; });
      var res = [];
      out.forEach(function (x) {
        if (norm(x.name) === dn) {
          if (!hasHead) { res.push({ name: heirHeading(dec.name), cap: "" }); hasHead = true; }
          dec.heirs.forEach(function (h) {
            var nm = h.name || h;
            if (!out.some(function (y) { return norm(y.name) === norm(nm); }))
              res.push({ name: nm, cap: normCap(h.cap || x.cap, c.courtLevel) });
          });
          changed = true;
        } else res.push(x);
      });
      if (!hasHead) {
        var at = -1;
        res.forEach(function (x, i) { if (at < 0 && hk.indexOf(norm(x.name)) >= 0) at = i; });
        if (at >= 0) { res.splice(at, 0, { name: heirHeading(dec.name), cap: "" }); changed = true; }
      }
      list.length = 0; res.forEach(function (x) { list.push(x); });
    });
    return changed;
  }

  function normalizeClients(c, db, log) {
    var parties = splitParties(c.clients), out = [];
    for (var mi = 0; mi < MANUAL_CLIENTS.length; mi++) {
      if (norm(MANUAL_CLIENTS[mi].from) === norm(c.clients)) {
        var mcap = normCap(parties[0] ? parties[0].cap : "", c.courtLevel);
        var mtext = joinParties(MANUAL_CLIENTS[mi].to.map(function (n) { return typeof n === "string" ? { name: n, cap: mcap } : n; }));
        if (log) log.push(["تصحيح يدوي: فصل " + MANUAL_CLIENTS[mi].to.length + " أسماء"]);
        return { text: mtext, changed: mtext !== String(c.clients || "").trim() };
      }
    }
    parties.forEach(function (p, pi) {
      var name = p.name, cap = p.cap, notes = [];
      var m = name.match(OTHERS_RE);
      if (m) {
        var rest = cleanName(m[2]);
        var restIsCap = CAP_WORDS.test(rest);
        name = cleanName(m[1] + " " + (restIsCap ? "" : rest));
        if (!cap && restIsCap) cap = rest;
        notes.push("حذف «وآخرين»");
      }
      /* و. (الاسم) = ورثة الاسم: حقل ثابت بلا صفة، وتحته حقل لكل وريث بصفته */
      var hm = name.match(/^(و\.\s*[^()]+?)\s*\(\s*([^()]+?)\s*\)\s*$/);
      if (hm) {
        out.push({ name: cleanName(hm[1]), cap: "" });
        name = cleanName(hm[2]);
        notes.push("ورثة: حقل «" + cleanName(hm[1]) + "» ثابت بلا صفة + حقل لكل وريث");
      }
      var segs = name.split(/\s*[،,؛\/]\s*|\s+-\s+|\s+و\s+/).map(cleanName).filter(Boolean);
      segs = segs.filter(function (x) { return !/^(ب)?(صفته|صفتها|شخصه|شخصها)/.test(x); });
      var parenOdd = /[()]/.test(name);
      if (segs.length > 1) notes.push((parenOdd ? "؟ " : "") + "فصل " + segs.length + " أسماء");
      if (!segs.length) segs = [name];
      
      if (segs.length > 1) {
        var lastW = segs[segs.length - 1].split(/\s+/);
        if (lastW.length >= 3) {
          segs = segs.map(function (x, i) {
            if (i < segs.length - 1 && x.split(/\s+/).length === 1) {
              notes.push("استكمال اللقب المشترك: «" + x + "»");
              return x + " " + lastW.slice(1).join(" ");
            }
            return x;
          });
        }
      }
      if (cap) {
        var abFlag = [];
        var sc = normCap(cap, c.courtLevel, abFlag);
        if (abFlag.length) notes.push("؟ صفة مختصرة «" + abFlag[0] + "» ودرجة التقاضي غير محسومة (" + (c.courtLevel || "—") + ")");
        if (sc !== cap) { notes.push("صفة مذكّر مفرد: «" + cap + "» ← «" + sc + "»"); cap = sc; }
      }
      if (segs.some(isZeina)) {
        segs = ZEINA_NAMES.filter(function (nm) {
          return !parties.some(function (x, xi) { return xi !== pi && norm(x.name) === norm(nm); });
        });
        notes.push("زينة: الأسماء الأربعة في حقول منفصلة (الصفات تُعدَّل يدوياً)");
      }
      segs.forEach(function (n) {
        if (ZEINA_NAMES.indexOf(n) >= 0) { out.push({ name: n, cap: cap }); return; }
        /* متوفى حلّ محله ورثته: حقل «و. الاسم» ثابت بلا صفة + حقل لكل وريث بنفس الصفة */
        var dec = caseActive(c) ? deceasedTable().filter(function (d) { return norm(d.name) === norm(n); })[0] : null;
        if (dec) {
          /* سطر ثابت بلا صفة؛ الورثة يُضافون فقط لو ليسوا مكتوبين فعلاً في الملف */
          out.push({ name: "ورثة. " + dec.name + " وهم :", cap: "" });
          var present = dec.heirs.some(function (h) {
            return parties.some(function (x) { return norm(x.name) === norm(h); });
          });
          if (!present) dec.heirs.forEach(function (h) { out.push({ name: h, cap: cap }); });
          notes.push("توفى وحل محله ورثته: «" + dec.name + "»" + (present ? " (الورثة مكتوبون فعلاً — سطر فقط)" : ""));
          return;
        }
        var comp = completeFromDb(n, db);
        if (comp && comp.name) {
          notes.push("إكمال «" + n + "» ← «" + comp.name + "»" + (comp.weak ? " (كلمتان فقط)" : ""));
          n = comp.name;
        } else if (comp && comp.ambiguous) {
          notes.push("ℹ «" + n + "» يطابق " + comp.ambiguous + " أسماء" + (comp.dirty ? " (كلها بأسماء غير نظيفة)" : "") + " — تُرك");
        }
        out.push({ name: n, cap: cap });
      });
      if (notes.length && log) log.push(notes);
    });
    /* الورثة مكتوبون فعلاً والمتوفى غير موجود: نضيف سطر «ورثة. الاسم وهم :» قبل أول وريث فقط */
    if (caseActive(c)) {
      deceasedTable().forEach(function (dec) {
        var head = norm("ورثة. " + dec.name);
        if (out.some(function (x) { return norm(x.name).indexOf(head) === 0; })) return;
        var hk = dec.heirs.map(norm), at = -1;
        out.forEach(function (x, i) { if (at < 0 && hk.indexOf(norm(x.name)) >= 0) at = i; });
        if (at >= 0) {
          out.splice(at, 0, { name: heirHeading(dec.name), cap: "" });
          if (log) log.push(["إضافة سطر «ورثة. " + dec.name + " وهم :» (الورثة مكتوبون فعلاً)"]);
        }
      });
    }
    var res = joinParties(out);
    return { text: res, changed: res !== String(c.clients || "").trim() };
  }

  function lat(v) { return la(v).replace(/\s+/g, " ").trim(); }
  function courtCanon(name) {
    var k = norm(name);
    if (!k) return name;
    var lv = (w.COURT_DATA && w.COURT_DATA.levels) || {}, hit = null;
    Object.keys(lv).forEach(function (L) {
      (lv[L].courts || []).forEach(function (c) { if (!hit && norm(c.name) === k) hit = c.name; });
    });
    return hit || name;
  }

  /* نفس رقم الدعوى+السنة ونفس رقم الملف (أو أحدهما بلا رقم ملف) = ملف مكرّر.
     رقما ملف مختلفان صراحةً = ملفان مختلفان: لا دمج. */
  function dupGroups(cases) {
    var by = {};
    cases.forEach(function (c) {
      if (c.linkedTo) return;                 /* الفرعية/المنضمة ليست مكرّراً لأصلها */
      var no = norm(lat(c.caseNo)), y = norm(lat(c.caseYear));
      if (!no) return;
      (by[no + "/" + y] = by[no + "/" + y] || []).push(c);
    });
    var out = [];
    Object.keys(by).forEach(function (k) {
      var g = by[k];
      if (g.length < 2) return;
      var files = {}, blankOnes = [];
      g.forEach(function (c) {
        var f = norm(lat(c.fileNo));
        if (f) (files[f] = files[f] || []).push(c); else blankOnes.push(c);
      });
      var fk = Object.keys(files);
      if (fk.length === 0) { out.push(g); return; }
      if (fk.length === 1) { out.push(files[fk[0]].concat(blankOnes)); return; }
      fk.forEach(function (f) { if (files[f].length > 1) out.push(files[f]); });
    });
    return out.filter(function (x) { return x.length > 1; });
  }

  /* دعوى فرعية/منضمة: الأسماء تبقى كما هي والصفات فقط تُعدَّل (مذكّر مفرد) */
  function capsOnly(txt, level) {
    var parties = splitParties(txt), ch = false;
    parties.forEach(function (x) { var nc = normCap(x.cap, level); if (nc !== x.cap) { x.cap = nc; ch = true; } });
    return { text: joinParties(parties), changed: ch };
  }

  function plan() {
    decMemo = null; decMemo = deceasedTable();
    try { return planInner(); } finally { decMemo = null; }
  }
  function planInner() {
    var cases = read(CASES, []), db = dbNames();
    var rep = { total: cases.length, names: [], groups: [],
      dbOthers: (w.ClientsPOA && w.ClientsPOA.stripOthersCount) ? w.ClientsPOA.stripOthersCount() : 0 };
    cases.forEach(function (c) {
      if (c.linkedTo) {                       /* فرعية/منضمة: صفات فقط */
        ["clients", "opponents"].forEach(function (f) {
          var lr = capsOnly(c[f], c.courtLevel);
          if (lr.changed) rep.names.push({
            id: c.id, field: f, fileNo: c.fileNo || "", caseNo: (c.caseNo || "") + "/" + (c.caseYear || ""),
            before: c[f], after: lr.text, notes: ["صفة مذكّر مفرد (" + (c.kind || "مرتبطة") + " — الأسماء كما هي)"], auto: true
          });
        });
        return;
      }
      var log = [], r = normalizeClients(c, db, log);
      var allNotes = [].concat.apply([], log);
      var trivial = r.changed && norm(r.text.replace(/[-ـ·()]/g, " ")) === norm(String(c.clients || "").replace(/[-ـ·()]/g, " "));
      var opp = splitParties(c.opponents), oppChanged = false, oppNotes = ["صفة مذكّر مفرد (الخصوم)"];
      opp.forEach(function (x) {
        var om = x.name.match(OTHERS_RE);
        if (om) {
          var orest = cleanName(om[2]);
          var oIsCap = CAP_WORDS.test(orest);
          x.name = cleanName(om[1] + " " + (oIsCap ? "" : orest));
          if (!x.cap && oIsCap) x.cap = orest;
          oppChanged = true; oppNotes = ["حذف «وآخرين» (الخصوم)"];
        }
        var nc = normCap(x.cap, c.courtLevel);
        if (nc !== x.cap) { x.cap = nc; oppChanged = true; }
      });
      if (deceasedOnParties(opp, c)) { oppChanged = true; oppNotes = ["ورثة (الخصوم)"]; }
      if (oppChanged) rep.names.push({
        id: c.id, field: "opponents", fileNo: c.fileNo || "", caseNo: (c.caseNo || "") + "/" + (c.caseYear || ""),
        before: c.opponents, after: joinParties(opp), notes: oppNotes, auto: true
      });
      if (r.changed && !trivial) rep.names.push({
        id: c.id, field: "clients", fileNo: c.fileNo || "", caseNo: (c.caseNo || "") + "/" + (c.caseYear || ""),
        before: c.clients, after: r.text, notes: allNotes,
        auto: allNotes.length > 0 && !allNotes.some(function (t) { return t.charAt(0) === "؟"; })
      });
    });
    dupGroups(cases).forEach(function (g) {
      g = g.slice().sort(function (a, b) {
        var fa = blank(a.fileNo) ? 0 : 1, fb = blank(b.fileNo) ? 0 : 1;
        if (fa !== fb) return fb - fa;
        return CASE_KEYS.filter(function (x) { return !blank(b[x]); }).length -
               CASE_KEYS.filter(function (x) { return !blank(a[x]); }).length;
      });
      /* محكمتان بلا أي كلمة مشتركة (مثل محكمة ↔ إدارة طب شرعي) = جهتان مختلفتان: لا دمج */
      var kw = norm(g[0].courtName).split(" ").filter(function (x) { return x.length >= 3; });
      g = g.filter(function (x, i) {
        if (i === 0 || blank(x.courtName) || !kw.length || !/[؀-ۿ]/.test(x.courtName)) return true;
        return norm(x.courtName).split(" ").some(function (t) { return t.length >= 3 && kw.indexOf(t) >= 0; });
      });
      if (g.length < 2) return;
      rep.groups.push({
        keep: g[0].id, drop: g.slice(1).map(function (x) { return x.id; }),
        label: (g[0].caseNo || "") + "/" + (g[0].caseYear || "") + " ملف " + (g[0].fileNo || "—"),
        courts: g.map(function (x) { return x.courtName || "—"; }),
        canon: courtCanon(g[0].courtName),
        sessions: g.map(function (x) { return (x.sessions || []).length; })
      });
    });
    return rep;
  }

  /** opts.skipGroups: من غير دمج الملفات (أداة الدمج في case-file أدق وليها شاشة مراجعة) */
  function planApply(done, opts) {
    opts = opts || {};
    var cases = read(CASES, []), rep = plan();
    if (opts.skipGroups) rep.groups = [];
    try {
      var b64 = btoa(unescape(encodeURIComponent(JSON.stringify(cases))));
      if (!(w.AndroidSaver && w.AndroidSaver.save)) throw 0;
      w.AndroidSaver.save("cases-backup-before-task14-" +
        new Date().toISOString().replace(/[:.]/g, "-") + ".json", b64);
    } catch (e) { alert("تعذّر حفظ النسخة الاحتياطية — أُلغي التنفيذ."); if (done) done(null); return; }
    var byId = {}; cases.forEach(function (c) { byId[c.id] = c; });
    var out = { names: 0, merged: 0, sessions: 0 };
    if (w.ClientsPOA && w.ClientsPOA.markDeceased) DECEASED_SEED.forEach(function (d) { out.deceasedMarked = (out.deceasedMarked || 0) + w.ClientsPOA.markDeceased(d.name, d.heirs); });
    var OTHERS = /\s*و\s*[أاآ]خر(ين|ون|ى)?(?=\s|$|[()\-،,·])/g;
    rep.names.forEach(function (n) {
      if (!n.auto || !byId[n.id]) return;
      var after = n.after;
      /* الإكمال من قاعدة الموكلين ما يضيفش «وآخرين» (القاعدة نفسها فيها كده أحياناً) */
      if (!OTHERS.test(n.before)) after = after.replace(OTHERS, "");
      OTHERS.lastIndex = 0;
      byId[n.id][n.field || "clients"] = after; out.names++;
    });
    var drop = {};
    rep.groups.forEach(function (g) {
      var keep = byId[g.keep]; if (!keep) return;
      g.drop.forEach(function (id) {
        var o = byId[id]; if (!o) return;
        fillBlanks(keep, o, CASE_KEYS);
        if (norm(o.clients).indexOf(norm(keep.clients)) === 0 &&
            norm(o.clients).length > norm(keep.clients).length) keep.clients = o.clients;
        keep.sessions = keep.sessions || [];
        var have = {}; keep.sessions.forEach(function (s) { have[s.date] = s; });
        (o.sessions || []).forEach(function (s) {
          if (!have[s.date]) { keep.sessions.push(s); have[s.date] = s; out.sessions++; }
          else {
            var t = have[s.date]; t.raw = t.raw || {}; var src = s.raw || {};
            if (blank(t.raw.result) && blank(t.raw.decision)) {
              if (!blank(src.result)) t.raw.result = src.result;
              else if (!blank(src.decision)) t.raw.result = src.decision;
            }
          }
        });
        drop[id] = 1; out.merged++;
      });
      keep.courtName = courtCanon(keep.courtName);
    });
    var res = cases.filter(function (c) { return !drop[c.id]; });
    if (w.ClientsPOA && w.ClientsPOA.stripOthersApply) out.dbOthers = w.ClientsPOA.stripOthersApply();
    /* commitAll: حفظ محلي + رفع المتغيّر + حذف المحذوف من السحابة (وإلا رجع بعد المزامنة) */
    var ok = (w.CaseFile && w.CaseFile.commitAll) ? w.CaseFile.commitAll(res) : write(CASES, res);
    out.total = res.length;
    if (done) done(ok ? out : null);
  }


  /* ------------------------------------------- الورثة بحسب حالة التوكيل (وفاة الموكل)
     المتوفى يتحول في القضايا المتداولة من طرف حقيقي إلى سطر ثابت بلا صفة
     «ورثة. الاسم وهم :» ويُضاف تحته حقل لكل وريث (اسم + صفة). */
  function heirHeading(name) { return "ورثة. " + name + " وهم :"; }

  function deceasedApplyToCase(c, dec) {
    var changed = false;
    ["clients", "opponents"].forEach(function (f) {
      var parties = splitParties(c[f]);
      var idx = -1;
      parties.forEach(function (x, i) { if (idx < 0 && norm(x.name) === norm(dec.name)) idx = i; });
      if (idx < 0) return;
      var orig = parties[idx], cap = normCap(orig.cap, c.courtLevel);
      var hasHeading = parties.some(function (x) { return norm(x.name).indexOf(norm("ورثة. " + dec.name)) === 0; });
      var repl = hasHeading ? [] : [{ name: heirHeading(dec.name), cap: "" }];
      dec.heirs.forEach(function (h) {
        var nm = h.name || h;
        var dup = parties.some(function (x) { return norm(x.name) === norm(nm); });
        if (!dup) repl.push({ name: nm, cap: normCap(h.cap || cap, c.courtLevel) });
      });
      parties.splice.apply(parties, [idx, 1].concat(repl));
      c[f] = joinParties(parties);
      changed = true;
    });
    return changed;
  }

  /** القضايا المتداولة التي فيها المتوفى طرفاً حقيقياً */
  function deceasedCases(dec) {
    return read(CASES, []).filter(function (c) {
      if (!caseActive(c)) return false;
      return ["clients", "opponents"].some(function (f) {
        return splitParties(c[f]).some(function (x) { return norm(x.name) === norm(dec.name); });
      });
    });
  }

  function deceasedApply(dec, done) {
    var cases = read(CASES, []);
    try {
      var b64 = btoa(unescape(encodeURIComponent(JSON.stringify(cases))));
      if (!(w.AndroidSaver && w.AndroidSaver.save)) throw 0;
      w.AndroidSaver.save("cases-backup-before-heirs-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json", b64);
    } catch (e) { alert("تعذّر حفظ النسخة الاحتياطية — أُلغي التنفيذ."); if (done) done(null); return; }
    var n = 0;
    cases.forEach(function (c) { if (caseActive(c) && deceasedApplyToCase(c, dec)) n++; });
    var ok = (w.CaseFile && w.CaseFile.commitAll) ? w.CaseFile.commitAll(cases) : write(CASES, cases);
    if (done) done(ok ? n : null);
  }


  /* ---------------------------------------- مهمة 16: المحكمة والدائرة بصيغة قاعدة المحاكم
     «استئناف شمال القاهرة» ← «ماموريه استئناف شمال القاهره» (الوارد في قاعدة المحاكم)
     و«د/١٧ س مدني» ← «الدائره / السابعه عشر مدنى». أياً كانت درجة التقاضي. */

  var ORD_UNIT = { "اولي": 1, "ثانيه": 2, "ثالثه": 3, "رابعه": 4, "خامسه": 5, "سادسه": 6, "سابعه": 7,
                   "ثامنه": 8, "تاسعه": 9, "عاشره": 10 };
  var SUBJ = [[/مدن/, "مدني"], [/ايجار/, "ايجارات"], [/تجار/, "تجاري"], [/عمال/, "عمال"], [/جناي/, "جنايات"],
              [/جنح/, "جنح"], [/احوال|اسر/, "احوال"], [/اقتصاد/, "اقتصادي"], [/تعويض/, "تعويضات"],
              [/كلي/, "كلي"], [/جزي/, "جزئي"], [/تنفيذ/, "تنفيذ"], [/مستانف/, "مستأنف"]];

  /** يفكّ اسم دائرة إلى {n: رقم الدائرة, subj: [مواضيع]} — بلا رقم أو موضوع ⇒ null */
  function parseCircuit(txt) {
    var t = norm(txt).replace(/[\/\\.,،\-_]+/g, " ").replace(/(\d)([^\d\s])/g, "$1 $2").replace(/([^\d\s])(\d)/g, "$1 $2")
      .replace(/\s+/g, " ").trim();
    if (!t) return null;
    var toks = t.split(" "), n = 0, subj = {};
    for (var i = 0; i < toks.length; i++) {
      var tk = toks[i].replace(/^ال/, "");
      if (!n && /^\d+$/.test(toks[i])) n = parseInt(toks[i], 10);
      else if (!n && ORD_UNIT[tk] != null) {
        n = ORD_UNIT[tk];
        if (toks[i + 1] === "عشر") n += 10;
      }
    }
    SUBJ.forEach(function (sj) { if (sj[0].test(t)) subj[sj[1]] = 1; });
    var keys = Object.keys(subj);
    if (!n || !keys.length) return null;
    return { n: n, subj: keys };
  }

  function courtLevelsFor(level) {
    var lv = (w.COURT_DATA && w.COURT_DATA.levels) || {}, k = norm(level || "");
    var hit = Object.keys(lv).filter(function (L) { var x = norm(L); return k && (x === k || x.indexOf(k) >= 0 || k.indexOf(x) >= 0); });
    return { lv: lv, keys: hit.length ? hit : Object.keys(lv) };
  }

  /** اسم المحكمة كما في قاعدة المحاكم — لو الاسم الحالي غير موجود ويوجد مرشّح فريد يحتويه/يحتويه الاسم */
  function courtFix(c) {
    var name = c.courtName, k = norm(name);
    if (!k) return null;
    var cl = courtLevelsFor(c.courtLevel), exact = null, cand = [];
    cl.keys.forEach(function (L) {
      (cl.lv[L].courts || []).forEach(function (x) {
        var xk = norm(x.name);
        if (xk === k) exact = x.name;
        else if (xk.length >= 6 && (xk.indexOf(k) >= 0 || k.indexOf(xk) >= 0) && cand.indexOf(x.name) < 0) cand.push(x.name);
      });
    });
    if (exact) return exact === name ? null : exact;
    if (cand.length === 1) return cand[0];
    /* درجة الاستئناف مكتوب اسم محكمتها بصيغة الابتدائي («العباسية محكمة شمال القاهرة الابتدائية»،
       «دار القضاء العالي»، «المحلة الكبرى»): تُوحَّد لمحكمة الاستئناف في القاعدة */
    /* استثناء: جنح مستأنفة ودوائر «مدني مستأنف» تنظرها المحكمة الابتدائية نفسها بهيئة استئنافية، لا محكمة الاستئناف */
    var apCirc = norm((c.circuit || "") + " " + (c.caseType || ""));
    if (/استيناف/.test(norm(c.courtLevel || "")) && !/جنح|مستانف/.test(apCirc)) {
      var APPEAL = [[/شمال القاهره/, "استيناف شمال القاهره"], [/دار القضاء العالي/, "استيناف القاهره"],
                    [/المحله/, "استيناف المحله"]];
      for (var i = 0; i < APPEAL.length; i++) {
        if (!APPEAL[i][0].test(k)) continue;
        var hit = null;
        cl.keys.forEach(function (L) {
          (cl.lv[L].courts || []).forEach(function (x) { if (!hit && norm(x.name).indexOf(APPEAL[i][1]) >= 0) hit = x.name; });
        });
        if (hit) return hit;
      }
    }
    return null;
  }

  function circuitsOfCourt(c, courtName) {
    var cl = courtLevelsFor(c.courtLevel), ck = norm(courtName), out = [];
    cl.keys.forEach(function (L) {
      (cl.lv[L].courts || []).forEach(function (x) {
        if (norm(x.name) !== ck) return;
        (x.types || []).forEach(function (t) { (t.circuits || []).forEach(function (ci) { out.push(ci); }); });
      });
    });
    return out;
  }

  function circuitFix(c, courtName) {
    var cur = c.circuit; if (!cur) return null;
    var list = circuitsOfCourt(c, courtName);
    if (!list.length) return null;
    var ck = norm(cur);
    if (list.some(function (x) { return norm(x) === ck; })) return null;          /* مطابقة تماماً */
    var pc = parseCircuit(cur); if (!pc) return null;
    var DAYS = ["السبت", "الاحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"].map(norm);
    function daysOf(t) { var k2 = norm(t); return DAYS.filter(function (d) { return k2.indexOf(d) >= 0; }); }
    var appealLvl = /استيناف/.test(norm(c.courtLevel || ""));         /* الاستئناف يعمل الأسبوع كله: لا أيام */
    var caseDays = daysOf(cur).join(",");
    var cands = list.filter(function (x) {
      var px = parseCircuit(x);
      /* اليوم المذكور في الدائرة (سبت/أحد…) لا يتغيّر ولا يُضاف يوم لم يُكتب */
      return px && px.n === pc.n && pc.subj.every(function (sj) { return px.subj.indexOf(sj) >= 0; }) &&
             (appealLvl || daysOf(x).join(",") === caseDays);
    });
    if (cands.length > 1) {                                                        /* الأدق: نفس مجموعة المواضيع */
      var same = cands.filter(function (x) { var px = parseCircuit(x); return px.subj.length === pc.subj.length; });
      if (same.length) cands = same;
    }
    return cands.length === 1 ? cands[0] : null;
  }

  function courtPlan() {
    var rows = [];
    read(CASES, []).forEach(function (c) {
      var nc = courtFix(c), court = nc || c.courtName, ni = circuitFix(c, court);
      if (nc || ni) rows.push({ id: c.id, fileNo: c.fileNo || "", level: c.courtLevel || "",
        courtBefore: c.courtName || "", courtAfter: nc || "", circBefore: c.circuit || "", circAfter: ni || "" });
    });
    return rows;
  }

  function courtApply(done) {
    var cases = read(CASES, []), rows = courtPlan();
    try {
      var b64 = btoa(unescape(encodeURIComponent(JSON.stringify(cases))));
      if (!(w.AndroidSaver && w.AndroidSaver.save)) throw 0;
      w.AndroidSaver.save("cases-backup-before-courts-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json", b64);
    } catch (e) { alert("تعذّر حفظ النسخة الاحتياطية — أُلغي التنفيذ."); if (done) done(null); return; }
    var byId = {}; cases.forEach(function (c) { byId[c.id] = c; });
    var n = 0;
    rows.forEach(function (r) {
      var c = byId[r.id]; if (!c) return;
      if (r.courtAfter) c.courtName = r.courtAfter;
      if (r.circAfter) c.circuit = r.circAfter;
      n++;
    });
    var ok = (w.CaseFile && w.CaseFile.commitAll) ? w.CaseFile.commitAll(cases) : write(CASES, cases);
    if (done) done(ok ? { changed: n } : null);
  }

  /* ------------------------------------------------------------ الملخّص */

  function preview() {
    return {
      appts: mergeSessionAppointments(false),
      cases: mergeDuplicateCases(false)
    };
  }

  function apply() {
    var a = mergeSessionAppointments(true);
    var c = mergeDuplicateCases(true);
    return { appts: a, cases: c };
  }

  w.Cleanup = {
    preview: preview, apply: apply,
    mergeSessionAppointments: mergeSessionAppointments,
    mergeDuplicateCases: mergeDuplicateCases, plan: plan, planApply: planApply, courtPlan: courtPlan, courtApply: courtApply,
    deceasedCases: deceasedCases, deceasedApply: deceasedApply, heirHeading: heirHeading, splitParties: splitParties, normCap: normCap,
    parseNotes: parseNotes
  };
})(window);
