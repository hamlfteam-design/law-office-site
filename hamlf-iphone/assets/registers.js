/* =============================================================================
   السجلات — بنفس تعريفات تقويم الجلسات حرفياً.

   الشاشات هنا كانت حقولاً مبعثرة مكرَّرة، وفي التقويم سجلاتٌ محكمة: لكل
   سجل حقوله وعرض كل حقل وتلميحه وقائمته، وحقول تُفتح بشرط (التصرف في
   المحضر يفتح ما يخصّه وحده)، وتخطيط صفوفٍ يجمع المتصل ببعضه.

   نُقلت التعريفات كما هي من REGS في «تقويم-الجلسات.html»، ويقرؤها هنا
   محرّك واحد يرسم أي سجل منها: بحث · إضافة · تعديل · حذف · طباعة.

   عرض الحقول: xxs صغير جداً (السنة) · xs · s (رقم) · m (متوسط) ·
   w (اسم) · wide · wider · grow (يملأ السطر).
   ============================================================================= */
(function (w) {
  "use strict";

  var DBKEY   = "proflawyer.regs.v1";     /* { regKey: [ …قيود… ] } */
  var LISTKEY = "proflawyer.reglists.v1"; /* { listName: [ …ما أُضيف يدوياً… ] } */

  /* ------------------------------------------------------------- المخزن */

  function db() {
    try { return JSON.parse(localStorage.getItem(DBKEY)) || {}; } catch (e) { return {}; }
  }
  function saveDb(d) {
    var before = neverSynced() ? db() : null;
    try { localStorage.setItem(DBKEY, JSON.stringify(d)); }
    catch (e) { alert("تعذّر الحفظ — المساحة ممتلئة."); return false; }
    pushChanged(d, before);
    return true;
  }

  /* ------------------------------------------- مزامنة السجلات مع الفريق (١٫٥٤)
     طلب المستخدم: أي تعديل على جهاز المدير يظهر عند باقي الفريق أول بأول —
     وأهمها أوراق المحضرين. السجلات كانت على كل جهاز لوحده. دلوقتي كل قيد
     مستند في السحابة records/regs/items/{السجل}__{_id} (القواعد الحالية بتسمح
     لأي عضو في الفريق). الرفع: القيود اللي اتغيّرت بس بعد كل حفظ. السحب: اللي
     اتغيّر من آخر مرة كل دقيقة والبرنامج مفتوح، والمسح بعلامات الحذف. */
  var COLL = "regs", synced = {};      /* docId → آخر نص متطابق مع السحابة */
  var _rgate = null;
  function cs() { return w.CloudStore && w.CloudStore.collection ? w.CloudStore : null; }
  function rgate() { return _rgate || (cs() && w.CloudStore.gate ? (_rgate = w.CloudStore.gate("regs", 60000)) : null); }
  function docId(regKey, r) { return regKey + "__" + r._id; }
  function flat(d) {
    var m = {};
    Object.keys(d || {}).forEach(function (k) {
      (Array.isArray(d[k]) ? d[k] : []).forEach(function (r) { if (r && r._id) m[docId(k, r)] = { reg: k, rec: r }; });
    });
    return m;
  }
  function payload(reg, r) { var o = {}; Object.keys(r).forEach(function (k) { o[k] = r[k]; }); o._reg = reg; return o; }
  /* الجهاز لسه ما اتزامنش مع السحابة ولا مرة: التعديل اللي بيتعمل قبل أول مزامنة كاملة
     يكسب نسخة السحابة (وإلا كانت هتكتب فوقه)، والمسح ما يرجعش من السحابة */
  var pendingSave = {}, pendingDel = {};
  function neverSynced() { try { return !!cs() && !localStorage.getItem("proflawyer.sync.regs.hashes"); } catch (e) { return false; } }
  function restoreSynced(g) {
    var hs = g.hashes(), m = flat(db());
    synced = {};
    Object.keys(m).forEach(function (id) {
      var j = JSON.stringify(payload(m[id].reg, m[id].rec));
      if (hs[id] === w.CloudStore.hash(j)) synced[id] = j;
    });
  }
  function pushChanged(d, before) {
    var C = cs(), g = rgate();
    if (!C || w.HAMLF_PC) return;
    if (before) {
      var mb = flat(before), mn = flat(d);
      Object.keys(mn).forEach(function (id) {
        if (!mb[id] || JSON.stringify(mb[id].rec) !== JSON.stringify(mn[id].rec)) { pendingSave[id] = 1; delete pendingDel[id]; }
      });
      Object.keys(mb).forEach(function (id) { if (!mn[id]) { pendingDel[id] = 1; delete pendingSave[id]; } });
      setTimeout(pull, 0);
      return;
    }
    if (g && !Object.keys(synced).length) restoreSynced(g);
    var m = flat(d);
    Object.keys(m).forEach(function (id) {
      var p = payload(m[id].reg, m[id].rec), j = JSON.stringify(p);
      if (synced[id] === j) return;
      C.collection.save(COLL, id, p);
      synced[id] = j;
      if (g) g.touch(id, C.hash(j));
    });
    Object.keys(synced).forEach(function (id) {
      if (m[id]) return;
      C.collection.remove(COLL, id);
      delete synced[id];
      if (g) g.forget(id);
    });
  }
  /** يكتب اللي جه من السحابة في السجلات المحلية؛ يرجّع عدد القيود اللي اتغيّرت. */
  function applyRemote(list, full) {
    var C = w.CloudStore, g = rgate(), d = db(), m = flat(d), qo = C.queued ? C.queued(COLL) : {};
    var n = 0, hs = full ? {} : null, seen = {};
    list.forEach(function (p) {
      if (!p || !p._reg || !p._id) return;
      var id = docId(p._reg, p);
      seen[id] = 1;
      if (qo[id]) return;                   /* تعديل/مسح محلي لسه ما اترفعش — يكسب */
      if (full && pendingSave[id]) return;  /* اتعدّل هنا قبل أول مزامنة — يترفع تحت */
      if (full && pendingDel[id]) { C.collection.remove(COLL, id); return; }
      var j = JSON.stringify(p);
      if (full) hs[id] = C.hash(j);
      if (synced[id] === j && m[id]) return;
      var rec = {};
      Object.keys(p).forEach(function (k) { if (k !== "_reg") rec[k] = p[k]; });
      var arr = d[p._reg] = d[p._reg] || [];
      var at = -1;
      for (var i = 0; i < arr.length; i++) if (arr[i] && arr[i]._id === p._id) { at = i; break; }
      if (at >= 0) { if (JSON.stringify(arr[at]) !== JSON.stringify(rec)) { arr[at] = rec; n++; } }
      else { arr.push(rec); n++; }
      synced[id] = j;
      if (!full && g) g.touch(id, C.hash(j));
    });
    if (full) {
      /* اتمسح من جهاز تاني (كان متزامن ومش على السحابة دلوقتي) ← يتشال هنا. أمان: لو كتير (تحميل ناقص) ما نشيلش */
      var old = g.hashes() || {}, gone = Object.keys(m).filter(function (id) { return old[id] && !seen[id] && qo[id] !== "save"; });
      if (gone.length && gone.length <= Math.max(5, Math.round(Object.keys(m).length * 0.04))) {
        gone.forEach(function (id) {
          var x = m[id]; d[x.reg] = (d[x.reg] || []).filter(function (r) { return r._id !== x.rec._id; }); delete synced[id]; n++;
        });
      }
      /* قيود على الجهاز ده عمرها ما اترفعت ← تترفع (أول مرة على جهاز المدير) */
      Object.keys(m).forEach(function (id) {
        if ((seen[id] || old[id]) && !pendingSave[id]) return;
        var p2 = payload(m[id].reg, m[id].rec), j2 = JSON.stringify(p2);
        C.collection.save(COLL, id, p2); synced[id] = j2; hs[id] = C.hash(j2);
      });
    }
    if (n) {
      try { localStorage.setItem(DBKEY, JSON.stringify(d)); } catch (e) { }
      try { w.dispatchEvent(new CustomEvent("regs:synced", { detail: { n: n } })); } catch (e) { }
    }
    if (full) { g.done(hs); pendingSave = {}; pendingDel = {}; }
    return n;
  }
  var _pulling = false;
  function pull() {
    var C = cs(), g = rgate();
    if (!C || !g || _pulling || w.HAMLF_PC) return;
    var mode = g.mode();
    if (!mode) return;
    _pulling = true;
    if (!Object.keys(synced).length) restoreSynced(g);
    function fin() { _pulling = false; }
    if (mode === "delta" && C.collection.listChanged) {
      C.collection.listChanged(COLL, g.since(), false, function (list) {
        fin();
        if (list === null) return;
        applyRemote(list, false);
        g.deltaDone({});
      });
      return;
    }
    C.collection.list(COLL, function (list) {
      fin();
      if (list === null) return;
      applyRemote(list, true);
    });
  }
  function regDeleted() {
    if (!w.CloudStore || !w.CloudStore.onDeleted || regDeleted.done) return;
    regDeleted.done = true;
    w.CloudStore.onDeleted(COLL, function (id) {
      var i = id.indexOf("__");
      if (i < 0) return;
      var reg = id.slice(0, i), rid = id.slice(i + 2), d = db(), arr = d[reg] || [], n = arr.length;
      d[reg] = arr.filter(function (r) { return r._id !== rid; });
      delete synced[id];
      var g = rgate(); if (g) g.forget(id);
      if (d[reg].length !== n) {
        try { localStorage.setItem(DBKEY, JSON.stringify(d)); } catch (e) { }
        try { w.dispatchEvent(new CustomEvent("regs:synced", { detail: { n: 1 } })); } catch (e) { }
      }
    });
  }
  setTimeout(function () { regDeleted(); pull(); }, 3000);
  setInterval(function () { if (!document.hidden) pull(); }, 60000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) pull(); });
  function rows(key) {
    var d = db();
    return d[key] || [];
  }
  function setRows(key, list) {
    var d = db();
    d[key] = list;
    return saveDb(d);
  }

  /* رقم الملف التالي — نفس عدّاد القضايا الموحَّد (يبدأ ٢٠٧٠ ويتوالى تلقائياً
     بعد أعلى رقم مسجَّل فعلياً في القضايا وكل السجلات). CaseFile.js يملك
     العدّاد الفعلي؛ هنا احتياط بسيط فقط لو لم يُحمَّل بعد في هذه الشاشة. */
  function nextFileNo() {
    if (w.CaseFile && w.CaseFile.nextCaseFileNo) return w.CaseFile.nextCaseFileNo();
    var FILE_NO_START = 2070;
    var mx = FILE_NO_START - 1;
    function consider(v) {
      var n = parseInt(la(v).replace(/[^0-9]/g, ""), 10);
      if (isFinite(n) && n > mx) mx = n;
    }
    try {
      (JSON.parse(localStorage.getItem("proflawyer.agenda.cases.v1")) || [])
        .forEach(function (c) { consider(c.fileNo); });
    } catch (e) { }
    var d = db();
    Object.keys(d).forEach(function (k) {
      (d[k] || []).forEach(function (r) { if (r && r.fileNo != null) consider(r.fileNo); });
    });
    return String(mx + 1);
  }

  /* تمدّد تلقائي لحقول الأسطر الكثيرة — يلتفّ المحتوى ويكبر الحقل معه. */
  function autogrow(t) {
    function fit() { t.style.height = "auto"; t.style.height = (t.scrollHeight + 2) + "px"; }
    t.addEventListener("input", fit);
    setTimeout(fit, 0);
  }

  function ar(n) {
    return String(n == null ? "" : n)
      .replace(/[0-9]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩"[+d]; });
  }
  function la(t) {
    return String(t == null ? "" : t)
      .replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x0660; });
  }
  function norm(t) { return window.lawyerNorm(t); }
  function el(tag, css, txt) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function money(v) {
    var n = parseFloat(la(v).replace(/[^0-9.\-]/g, ""));
    return isFinite(n) ? n : 0;
  }
  function fmtMoney(n) {
    var s = (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, "");
    var p = s.split(".");
    p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, "٬");
    return ar(p.join("٫"));
  }

  /* --------------------------------------------------- القوائم الأساسية

     محسوبة من بيانات المحاكم كما في التقويم: النيابة الجزئية تتبع المحكمة
     الجزئية، والكلية تتبع الابتدائية. */

  /* بيانات المحاكم ملفٌّ كبير (نحو ٧٨٠ ك.ب)، فلا يُحمَّل مع كل شاشة.
     يُطلب عند أول حاجة إليه — أي عند فتح محرّر فيه قائمة محاكم أو نيابات. */
  var cdAsked = false;
  function needCourtData(after) {
    if (w.COURT_DATA) { if (after) after(); return; }
    if (cdAsked) return;
    cdAsked = true;
    var sc = document.createElement("script");
    sc.src = "assets/court-data.js?v=1";
    sc.onload = function () { if (after) after(); };
    document.head.appendChild(sc);
  }
  function CD() { return (w.COURT_DATA && w.COURT_DATA.levels) || {}; }
  function uniq(a) {
    var seen = {}, out = [];
    a.forEach(function (v) {
      var k = norm(v);
      if (!k || seen[k]) return;
      seen[k] = 1; out.push(v);
    });
    return out;
  }
  function courtsIn(level) {
    return ((CD()[level] || {}).courts || []).map(function (c) { return c.name; });
  }
  function shortN(n) {
    return String(n).replace(/^محكمة\s*/, "")
      .replace(/\s*(الجزئية|الابتدائية)\s*$/, "").trim();
  }

  var BASE = {
    JZ_IB:    function () { return uniq(courtsIn("جزئي").concat(courtsIn("ابتدائي"))); },
    QALAM:    function () { return uniq(BASE.JZ_IB().map(shortN)); },
    NIABA_JZ: function () {
      return uniq(courtsIn("جزئي").map(function (c) {
        return "نيابة " + shortN(c) + " الجزئية";
      }));
    },
    NIABA_KL: function () {
      return uniq(courtsIn("ابتدائي").map(function (c) {
        return "نيابة " + shortN(c) + " الكلية";
      }));
    },
    TZ_JIHA:  function () {
      return ["النائب العام", "المحامي العام", "رئيس النيابة الكلية", "المحكمة المختصة"]
        .concat(BASE.NIABA_KL());
    },
    EXP_BAND: function () {
      return ["رسوم قضائية", "أمانة خبير", "رسوم إعلان محضرين", "صور رسمية وشهادات",
              "دمغات وطوابع", "انتقالات ومواصلات", "توكيلات وتوثيق", "نسخ وتصوير",
              "رسوم نقض", "أمانة نقض", "بريد وشحن", "مصروفات عمومية", "أخرى"];
    },
    EXP_JIHA: function () {
      return uniq(BASE.JZ_IB().concat(
        ["قلم المحضرين", "قلم الكتاب", "خزينة المحكمة", "مأمورية الشهر العقاري",
         "نقابة المحامين", "مكتب خبراء وزارة العدل", "محكمة النقض", "نيابة عامة",
         "مصلحة الضرائب", "الشهر العقاري", "مصروفات المكتب", "بريد وشحن", "انتقالات"]));
    },
    EXP_CLI:  function () {
      var out = [];
      try {
        (JSON.parse(localStorage.getItem("proflawyer.agenda.clients.v1")) || [])
          .forEach(function (c) { if (c.name) out.push(c.name); });
      } catch (e) { }
      return uniq(out).slice(0, 500);
    }
  };

  /* --------------------------------------------------- القوائم المضافة */

  function customLists() {
    try { return JSON.parse(localStorage.getItem(LISTKEY)) || {}; } catch (e) { return {}; }
  }
  /* القوائم والمحاكم بيديرها مدير المكتب بس (١٫٥٥): على أجهزة باقي الفريق
     الإضافة/الإخفاء/التعديل ما بتتحفظش، والنسخة بتيجي من جهاز المدير (cloud-store.js). */
  function refLocked() {
    if (w.HAMLF_PC) return false;
    try {
      var u = w.Team && w.Team.current && w.Team.current();
      if (!u || !u.role || u.role === "owner") return false;
    } catch (e) { return false; }
    if (!w.__refWarned) {
      w.__refWarned = true;
      try {
        if (w.PL && w.PL.toast) w.PL.toast("القوائم والمحاكم", "بيعدّلها مدير المكتب بس — التعديل ده مش هيتحفظ.", "");
      } catch (e) { }
    }
    return true;
  }
  function rememberInList(name, value) {
    if (!name || !value) return;
    if (refLocked()) return;
    var c = customLists();
    c[name] = c[name] || [];
    if (!c[name].some(function (v) { return norm(v) === norm(value); })) {
      c[name].push(value);
      try { localStorage.setItem(LISTKEY, JSON.stringify(c)); } catch (e) { }
    }
  }

  /** خيارات حقل: الأساس + ما أُضيف يدوياً + ما استُعمل فعلاً في السجل. */
  function optionsOf(regKey, f) {
    var out = [];
    if (typeof f.base === "string" && BASE[f.base]) out = BASE[f.base]();
    else if (Array.isArray(f.base)) out = f.base.slice();

    if (f.list) out = out.concat(customLists()[f.list] || []);

    rows(regKey).forEach(function (r) {
      var v = String(r[f.k] == null ? "" : r[f.k]).trim();
      if (v) out.push(v);
    });
    return uniq(out);
  }

  /** الحقل قائمةٌ إن كان له list أو base. */
  function isList(f) {
    return !!(f.list || (Array.isArray(f.base) && f.base.length) ||
              (typeof f.base === "string"));
  }

  /* ------------------------------------------------------ ظهور الحقل

     when: لا يظهر الحقل إلا إذا ساوى الحقل الحاكم قيمةً بعينها.
     wk:  الحقل الحاكم — وإن غاب فهو «after» في المحاضر. */

  function governor(reg, f) {
    if (f.wk) return f.wk;
    /* الحقل الحاكم هو صاحب القائمة التي تضمّ قيمة الشرط — لا أول حقل
       اسمه «act»: في المحاضر «التصرف» نصٌّ حرّ، والحاكم «ملاحظات بعد
       التصرف» وهي التي تضمّ جلسة وحفظ وتظلم. */
    var g = null;
    reg.F.forEach(function (x) {
      if (g || !Array.isArray(x.base)) return;
      if (x.base.some(function (v) { return norm(v) === norm(f.when); })) g = x.k;
    });
    return g || "after";
  }
  function visible(reg, f, values) {
    if (!f.when) return true;
    return String(values[governor(reg, f)] || "") === f.when;
  }

  /* ------------------------------------------------------------- الواجهة */

  var WIDTH = { xxs: "70px", xs: "84px", s: "104px", m: "140px",
                w: "170px", wide: "210px", wider: "260px", grow: "100%" };

  var CSS_IN = "width:100%;min-height:50px;font-size:18px;padding:11px 12px;" +
    "border:1px solid var(--line,#ddd);border-radius:9px;background:var(--card);" +
    "font-family:inherit;direction:rtl;text-align:right;line-height:1.7";
  var MANUAL = "__manual__";

  function sheet(z) {
    var back = el("div",
      "position:fixed;inset:0;background:rgba(20,14,8,.62);z-index:" + (z || 10040) + ";" +
      "display:flex;align-items:flex-end;justify-content:center");
    back.setAttribute("data-modal", "1");
    back.setAttribute("data-nosave", "1");
    var box = el("div",
      "background:var(--card,#fff);border-radius:18px 18px 0 0;padding:18px 18px 26px;" +
      "width:100%;max-width:640px;direction:rtl;color:var(--text);" +
      "max-height:92vh;overflow-y:auto");
    back.appendChild(box);
    back.onclick = function (e) { if (e.target === back) back.remove(); };
    document.body.appendChild(back);
    return { back: back, box: box };
  }

  function head(box, txt, css) {
    box.appendChild(el("div",
      css || "font-family:var(--f-title);font-size:18px;margin-bottom:10px", txt));
  }
  function btn(label, css) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.style.cssText = "flex:1;padding:14px;border-radius:11px;font-family:inherit;" +
                      "font-size:16px;min-height:52px;" + css;
    return b;
  }

  /* ------------------------------------------------------- محرِّر القيد */

  function edit(regKey, id, done) {
    var reg = w.REGS[regKey];
    if (!reg) return;

    /* قوائم المحاكم والنيابات تحتاج بيانات المحاكم — تُطلب الآن إن غابت */
    if (!w.COURT_DATA) {
      needCourtData(function () { edit(regKey, id, done); });
      if (!w.COURT_DATA) return;
    }

    var list = rows(regKey).slice();
    var rec = id ? list.filter(function (x) { return x._id === id; })[0] : null;
    var isNew = !rec;
    if (isNew) rec = { _id: "rg" + Date.now().toString(36) };

    var values = {};
    reg.F.forEach(function (f) { values[f.k] = rec[f.k] || ""; });

    /* قيدٌ جديد: الحقول ذات الترقيم التلقائي تُملأ تلقائياً. */
    if (isNew) {
      reg.F.forEach(function (f) {
        if (f.auto && !values[f.k]) values[f.k] = nextFileNo();
        if (f.autoSerial && !values[f.k]) values[f.k] = String(rows(regKey).length + 1);
      });
    }

    var s = sheet(10042);
    head(s.box, (isNew ? "قيد جديد — " : "تعديل — ") + reg.n);

    var body = el("div");
    s.box.appendChild(body);

    var subsSeen = {};

    function drawAll() {
      body.textContent = "";
      subsSeen = {};

      (reg.P || [reg.F.map(function (f) { return f.k; })]).forEach(function (line) {
        var defs = line.map(function (k) {
          return reg.F.filter(function (f) { return f.k === k; })[0];
        }).filter(Boolean).filter(function (f) { return visible(reg, f, values); });

        if (!defs.length) return;

        /* عنوان المجموعة المشروطة يُكتب مرة واحدة */
        var sub = defs[0].sub;
        if (sub && !subsSeen[sub]) {
          subsSeen[sub] = 1;
          head(body, sub, "font-family:var(--f-title);font-size:15px;" +
                          "margin:16px 0 8px;color:var(--brand-dark)");
        }

        var r = el("div", "display:flex;gap:9px;flex-wrap:wrap;align-items:flex-start");
        body.appendChild(r);
        defs.forEach(function (f) { drawField(r, f); });
      });
    }

    function drawField(parent, f) {
      var wid = WIDTH[f.w] || "160px";
      var g = el("div", f.w === "grow"
        ? "flex:1 1 100%;margin-bottom:10px"
        : "flex:1 1 " + wid + ";max-width:100%;margin-bottom:10px");

      g.appendChild(el("label",
        "display:block;font-family:var(--f-title);font-size:14px;" +
        "margin-bottom:5px;color:var(--brand-dark)", f.t));

      var holder = el("div");
      g.appendChild(holder);
      if (f.h) {
        g.appendChild(el("div",
          "font-size:12px;color:var(--muted);margin-top:4px;line-height:1.75", f.h));
      }
      parent.appendChild(g);

      /* حقل محسوب — يُعرض ولا يُكتب */
      if (f.calc) {
        var box = el("div",
          "min-height:48px;display:flex;align-items:center;justify-content:center;" +
          "padding:10px;border:1px solid var(--brand);border-radius:9px;" +
          "background:var(--bg,#f4ece0);font-family:var(--f-title);font-size:17px;" +
          "direction:ltr;unicode-bidi:embed;color:var(--brand-dark)");
        holder.appendChild(box);
        function refresh() {
          box.textContent = fmtMoney(money(values.custody) - money(values.amount));
        }
        refresh();
        g.__refresh = refresh;
        return;
      }

      function textBox() {
        var t = document.createElement(f.w === "grow" ? "textarea" : "input");
        if (f.w === "grow") t.rows = 2; else t.type = "text";
        t.value = values[f.k] || "";
        t.setAttribute("lang", "ar");
        t.setAttribute("dir", "rtl");
        t.title = f.h || f.t;
        if (f.d) { t.type = "date";
          t.value = w.lawyerToISO ? (w.lawyerToISO(values[f.k]) || "") : (values[f.k] || ""); }
        t.style.cssText = CSS_IN;
        if (f.w === "grow") { t.style.overflow = "hidden"; autogrow(t); }
        t.oninput = function () {
          /* بعد ترقية datepicker.js للحقل، قيمته المعروضة نص عربي منسَّق
             لا ISO — تُحوَّل هنا قبل التخزين كما تُحوَّل في كل حقول التاريخ. */
          values[f.k] = f.d && w.lawyerToISO ? (w.lawyerToISO(t.value) || "") : t.value.trim();
          if (f.k === "custody" || f.k === "amount") refreshCalc();
        };
        return t;
      }

      /* حقل متعدد القيم: صفوف بأزرار «+ إضافة آخر» و«✕» — يُخزَّن مفصولاً بسطر. */
      if (f.multi && !isList(f)) {
        var arr = String(values[f.k] || "").split("\n")
          .map(function (x) { return x.trim(); }).filter(Boolean);
        if (!arr.length) arr = [""];
        function syncMulti() {
          values[f.k] = arr.filter(function (x) { return x.trim(); }).join("\n");
        }
        function drawMulti() {
          holder.textContent = "";
          arr.forEach(function (val, idx) {
            var row = el("div", "display:flex;gap:6px;align-items:center;margin-bottom:6px");
            var t = document.createElement("input");
            t.type = "text"; t.value = val;
            t.setAttribute("dir", "rtl"); t.setAttribute("lang", "ar");
            t.style.cssText = CSS_IN;
            t.oninput = function () { arr[idx] = t.value; syncMulti(); };
            row.appendChild(t);
            if (arr.length > 1) {
              var rm = document.createElement("button");
              rm.type = "button"; rm.textContent = "✕";
              rm.style.cssText = "flex:0 0 46px;min-height:50px;border:1px solid var(--line,#ddd);" +
                "border-radius:9px;background:transparent;color:#b3261e;font-size:16px";
              rm.onclick = function () { arr.splice(idx, 1); syncMulti(); drawMulti(); };
              row.appendChild(rm);
            }
            holder.appendChild(row);
          });
          var add = document.createElement("button");
          add.type = "button"; add.textContent = "+ إضافة آخر";
          add.style.cssText = "min-height:44px;padding:8px 14px;border:1px dashed var(--brand);" +
            "border-radius:9px;background:transparent;color:var(--brand);font-family:inherit;font-size:14px";
          add.onclick = function () {
            arr.push(""); drawMulti();
            setTimeout(function () {
              var ins = holder.querySelectorAll("input");
              if (ins.length) ins[ins.length - 1].focus();
            }, 40);
          };
          holder.appendChild(add);
        }
        drawMulti();
        return;
      }

      if (!isList(f)) { holder.appendChild(textBox()); return; }

      var pool = optionsOf(regKey, f);
      var sel = document.createElement("select");
      /* معرّف لكل حقل: به يُحفظ ما يُضاف يدوياً في موضعه لا مختلطاً بغيره */
      sel.id = "rg_" + regKey + "_" + f.k;
      sel.style.cssText = CSS_IN;
      sel.title = f.h || f.t;

      function fill(extra) {
        sel.textContent = "";
        var blank = document.createElement("option");
        blank.value = ""; blank.textContent = "— غير محدَّد —";
        sel.appendChild(blank);
        var l = pool.slice();
        if (extra && !l.some(function (v) { return norm(v) === norm(extra); })) {
          l.unshift(extra);
        }
        l.forEach(function (o) {
          var op = document.createElement("option");
          op.value = o; op.textContent = o;
          sel.appendChild(op);
        });
        var man = document.createElement("option");
        man.value = MANUAL; man.textContent = "✎ إضافة يدوية…";
        sel.appendChild(man);
      }
      fill(values[f.k]);
      sel.value = values[f.k] || "";
      holder.appendChild(sel);

      sel.onchange = function () {
        if (sel.value === MANUAL) {
          holder.textContent = "";
          var t = textBox();
          t.value = "";
          t.placeholder = "اكتب " + f.t + "…";
          holder.appendChild(t);

          var bar = el("div", "display:flex;gap:8px;margin-top:7px");
          function sm(label, css) {
            var b = document.createElement("button");
            b.type = "button"; b.textContent = label;
            b.style.cssText = "flex:1;padding:10px;border-radius:9px;font-family:inherit;" +
                              "font-size:13px;min-height:42px;" + css;
            return b;
          }
          var ok = sm("حفظه بالقائمة",
            "border:0;background:var(--brand);color:#fff;font-weight:600");
          var bk = sm("↩ رجوع",
            "border:1px solid var(--line,#ddd);background:transparent;color:var(--muted)");
          bar.appendChild(ok); bar.appendChild(bk);
          holder.appendChild(bar);

          ok.onclick = function () {
            var v = t.value.trim();
            if (!v) { t.focus(); return; }
            if (f.list) rememberInList(f.list, v);
            pool = optionsOf(regKey, f);
            if (!pool.some(function (x) { return norm(x) === norm(v); })) pool.unshift(v);
            values[f.k] = v;
            drawAll();
          };
          bk.onclick = function () {
            holder.textContent = "";
            holder.appendChild(sel);
            fill(values[f.k]); sel.value = values[f.k] || "";
          };
          setTimeout(function () { t.focus(); }, 60);
          return;
        }
        values[f.k] = sel.value;
        /* الحقل الحاكم يعيد رسم ما يتوقف عليه */
        var governs = reg.F.some(function (x) {
          return x.when && governor(reg, x) === f.k;
        });
        if (governs) drawAll();
      };
    }

    function refreshCalc() {
      body.querySelectorAll("div").forEach(function () { });
      /* أبسط: أعِد رسم الحقل المحسوب وحده */
      var calc = reg.F.filter(function (f) { return f.calc; })[0];
      if (!calc) return;
      drawAll();
    }

    drawAll();

    /* زر الفعل — الترحيل إلى صفحة القضايا */
    var actF = reg.F.filter(function (f) {
      return f.act && visible(reg, f, values);
    })[0];
    if (actF) {
      var go = btn(actF.actLabel || "⤴ ترحيل",
        "border:1px solid var(--brand);background:transparent;color:var(--brand);" +
        "font-weight:600");
      go.onclick = function () { toCase(regKey, values, rec); };
      var r0 = el("div", "display:flex;margin-top:6px");
      r0.appendChild(go);
      s.box.appendChild(r0);
    }

    var save = btn("حفظ", "border:0;background:var(--brand);color:#fff;font-weight:600");
    var cancel = btn("إلغاء",
      "border:1px solid var(--line,#ddd);background:transparent;color:var(--muted)");

    save.onclick = function () {
      reg.F.forEach(function (f) {
        if (f.calc) return;
        rec[f.k] = visible(reg, f, values) ? (values[f.k] || "") : "";
      });
      if (isNew) list.push(rec);
      if (!setRows(regKey, list)) return;
      var posted = regKey === "waraq" ? waraqToAdmin(rec) : null;
      s.back.remove();
      if (posted && w.PL && PL.toast) {
        PL.toast("تم الحفظ", "ونزلت في الأعمال الإدارية " +
          (posted.fileNo ? "لملف " + ar(posted.fileNo) : "(التكليفات العامة — مفيش قضية بالرقم ده)") + ".", "ok");
      }
      if (done) done(rec);
    };
    cancel.onclick = function () { s.back.remove(); };

    var r2 = el("div", "display:flex;gap:9px;margin-top:16px");
    r2.appendChild(save); r2.appendChild(cancel);
    s.box.appendChild(r2);
  }

  /* ------------------------------ بطاقة ورقة المحضرين: أعمال إدارية · واتساب · تنزيل */

  function isoOf(v) { return w.lawyerToISO ? (w.lawyerToISO(v) || "") : isoKey(v); }

  /** تنزّل ورقة المحضرين في «الأعمال الإدارية» لقضيتها (أو التكليفات العامة). */
  function waraqToAdmin(r) {
    if (!w.CaseFile || !CaseFile.upsertRegTask) return null;
    var bits = [r.kind, r.subject].filter(Boolean).join(" — ");
    var text = "ورقة محضرين" + (bits ? ": " + bits : "") +
      (r.no ? " — رقم " + ar(r.no) : "") + (r.client ? " — " + r.client : "");
    var done = /^تم/.test(String(r.done || "").trim()) || !!String(r.received || "").trim();
    var notes = ["من سجل أوراق المحضرين" + (r.serial ? " (مسلسل " + ar(r.serial) + ")" : "")];
    if (r.handed) notes.push("اتسلّمت للمحضر " + ar(r.handed));
    if (r.received) notes.push("اتستلمت معلَنة " + ar(r.received) + (r.receivedBy ? " — استلمها " + r.receivedBy : ""));
    if (r.jalsa) notes.push("الجلسة " + ar(r.jalsa));
    try {
      return CaseFile.upsertRegTask(r._id, r.fileNo, {
        text: text,
        taskDate: isoOf(r.handed),
        dueDate: isoOf(r.jalsa),
        state: done ? "تم" : "لم يتم",
        org: r.qalam ? "قلم محضري " + r.qalam : (r.court || ""),
        notes: notes.join(" · ")
      });
    } catch (e) { return null; }
  }

  function waraqRows(r) {
    return w.REGS.waraq.F.map(function (f) {
      return r[f.k] ? [f.t, ar(r[f.k])] : null;
    }).filter(Boolean);
  }
  function waraqName(r) {
    return "ورقة-محضرين" + (r.no ? "-" + la(r.no) : "") + (r.serial ? "-م" + la(r.serial) : "");
  }
  function waraqPdf(r) {
    if (!w.PdfDoc || !w.PdfBuild) return Promise.reject(new Error("pdf"));
    return PdfDoc.build([
      { center: "بطاقة ورقة محضرين" },
      { table: { headers: ["الحقل", "البيان"], widths: [1, 2.6], rows: waraqRows(r) } }
    ]).then(function (pages) { return PdfBuild.toBase64(PdfBuild.fromJpegs(pages)); });
  }
  function waraqText(r) {
    return "📄 ورقة محضرين" + String.fromCharCode(10) + waraqRows(r).map(function (x) {
      return x[0] + ": " + x[1];
    }).join(String.fromCharCode(10));
  }
  function busyBtn(b, txt) {
    var old = b.textContent; b.disabled = true; b.textContent = txt;
    return function () { b.disabled = false; b.textContent = old; };
  }

  /* ---- فريق أوراق المحضرين (طلب المستخدم: الإرسال «لفريق محدد») ----
     المدير بيختار أعضاء الفريق مرة واحدة من «المحامون والصلاحيات» (اللي ليهم
     تليفون). الاختيار محفوظ في proflawyer.reglists.v1 تحت __waraqTeam، فبيتزامن
     مع الفريق من جهاز المدير زي باقي القوائم وما حدش غيره يغيّره. الإرسال:
     واتساب بيتفتح على محادثة كل عضو بالـPDF جاهز، والمستخدم يدوس «إرسال»
     (واتساب ما بيسمحش لتطبيق يبعت لوحده، ولا يحط ملف في جروب من بره). */
  var WTEAM = "__waraqTeam";
  function teamUsers() {
    var T = w.Team && w.Team.data;
    return ((T && T.users) || []).filter(function (u) { return u && u.id && u.role !== "client"; });
  }
  function waNumber(raw) {
    var d = la(raw).replace(/\D/g, "");
    if (d.indexOf("00") === 0) d = d.slice(2);
    else if (/^0\d{10}$/.test(d)) d = "20" + d.slice(1);
    return d;
  }
  function waraqTeam() {
    var ids = customLists()[WTEAM] || [];
    return teamUsers().filter(function (u) { return ids.indexOf(u.id) >= 0 && waNumber(u.phone).length >= 10; });
  }
  function isOwnerDev() {
    if (w.HAMLF_PC) return true;
    try { var u = w.Team && w.Team.current && w.Team.current(); return !u || !u.role || u.role === "owner"; } catch (e) { return true; }
  }
  /** المدير بيختار فريق أوراق المحضرين */
  function pickWaraqTeam(done) {
    if (!isOwnerDev()) { alert("فريق أوراق المحضرين بيحدّده مدير المكتب."); return; }
    var users = teamUsers(), ids = (customLists()[WTEAM] || []).slice();
    var s0 = sheet(10060);
    head(s0.box, "فريق أوراق المحضرين");
    s0.box.appendChild(el("div", "font-size:12.5px;color:var(--muted);line-height:1.8;margin-bottom:10px",
      "اختار اللي تتبعتلهم بطاقة ورقة المحضرين على واتساب. اللي مالوش تليفون في «المحامون والصلاحيات» مش هيظهر هنا قابل للاختيار."));
    if (!users.length) s0.box.appendChild(el("div", "font-size:14px", "مفيش أعضاء في الفريق لسه."));
    users.forEach(function (u) {
      var ok = waNumber(u.phone).length >= 10;
      var row = el("label", "display:flex;gap:10px;align-items:center;padding:10px 4px;border-bottom:1px solid var(--line,#eee);" +
        "font-size:15px;" + (ok ? "" : "opacity:.5"));
      var cb = document.createElement("input");
      cb.type = "checkbox"; cb.disabled = !ok; cb.checked = ok && ids.indexOf(u.id) >= 0;
      cb.style.cssText = "width:22px;height:22px;flex:0 0 auto";
      cb.onchange = function () {
        ids = ids.filter(function (x) { return x !== u.id; });
        if (cb.checked) ids.push(u.id);
      };
      row.appendChild(cb);
      row.appendChild(el("span", "flex:1", u.name || "—"));
      row.appendChild(el("bdi", "font-size:12.5px;color:var(--muted)", ok ? String(u.phone) : "مالوش تليفون"));
      s0.box.appendChild(row);
    });
    var r2 = el("div", "display:flex;gap:9px;margin-top:16px");
    var sv = btn("حفظ الفريق", "border:0;background:var(--brand);color:#fff;font-weight:600");
    var cn = btn("إلغاء", "border:1px solid var(--line,#ddd);background:transparent;color:var(--muted)");
    sv.onclick = function () {
      var c = customLists(); c[WTEAM] = ids;
      try { localStorage.setItem(LISTKEY, JSON.stringify(c)); } catch (e) { }
      if (w.CloudStore && w.CloudStore.refSync) setTimeout(w.CloudStore.refSync, 300);
      s0.back.remove();
      if (done) done();
    };
    cn.onclick = function () { s0.back.remove(); };
    r2.appendChild(sv); r2.appendChild(cn); s0.box.appendChild(r2);
  }

  /** إرسال البطاقة لفريق أوراق المحضرين: محادثة واتساب كل عضو بالـPDF جاهز، واحد ورا التاني. */
  function shareWaraq(r, btnEl) {
    if (!w.Share) { alert("الإرسال مش متاح على الجهاز ده."); return; }
    var direct = w.AndroidShare && AndroidShare.sendWhatsApp;
    var team = waraqTeam();
    if (!team.length) {
      if (isOwnerDev() && direct) { pickWaraqTeam(function () { if (waraqTeam().length) shareWaraq(r, btnEl); }); return; }
      return shareAny(r, btnEl);
    }
    if (!direct) return shareAny(r, btnEl);       /* الكمبيوتر/المتصفح: ورقة المشاركة العادية */
    var undo = btnEl ? busyBtn(btnEl, "⏳ جارٍ تجهيز البطاقة…") : function () { };
    waraqPdf(r).catch(function () { return ""; }).then(function (b64) {
      undo();
      var name = waraqName(r) + ".pdf", text = waraqText(r);
      var s1 = sheet(10060);
      head(s1.box, "إرسال ورقة المحضرين للفريق");
      s1.box.appendChild(el("div", "font-size:12.5px;color:var(--muted);line-height:1.8;margin-bottom:10px",
        "اضغط على كل اسم: واتساب هيفتح على محادثته والبطاقة جاهزة — دوس «إرسال» وارجع للبرنامج للي بعده."));
      team.forEach(function (u) {
        var b = btn("🟢 " + (u.name || "—"), "border:1px solid #25d366;background:transparent;color:#128c3e;font-weight:600");
        b.style.cssText += ";display:block;width:100%;margin-bottom:8px;text-align:right";
        b.onclick = function () {
          AndroidShare.sendWhatsApp(waNumber(u.phone), b64 ? name : "", b64 || "", b64 ? "application/pdf" : "", text);
          b.textContent = "✓ " + (u.name || "—") + " — اتفتح";
          b.style.opacity = ".6";
        };
        s1.box.appendChild(b);
      });
      var r3 = el("div", "display:flex;gap:9px;margin-top:10px;flex-wrap:wrap");
      var other = btn("📤 لحد تاني", "border:1px solid var(--brand);background:transparent;color:var(--brand)");
      other.onclick = function () { s1.back.remove(); shareAny(r); };
      r3.appendChild(other);
      if (isOwnerDev()) {
        var ed = btn("👥 تعديل الفريق", "border:1px solid var(--line,#ddd);background:transparent;color:var(--muted)");
        ed.onclick = function () { s1.back.remove(); pickWaraqTeam(function () { shareWaraq(r); }); };
        r3.appendChild(ed);
      }
      var cl = btn("تم", "border:0;background:var(--brand);color:#fff;font-weight:600");
      cl.setAttribute("data-plain-save", "1");
      cl.onclick = function () { s1.back.remove(); };
      r3.appendChild(cl);
      s1.box.appendChild(r3);
    });
  }

  /** ورقة المشاركة العادية (أي تطبيق / أي حد) */
  function shareAny(r, btnEl) {
    if (!w.PdfDoc || !w.PdfBuild) { Share.shareText(waraqText(r), { name: waraqName(r) }); return; }
    var undo = btnEl ? busyBtn(btnEl, "⏳ جارٍ تجهيز البطاقة…") : function () { };
    waraqPdf(r).then(function (b64) {
      undo();
      Share.sharePdf(b64, waraqName(r));
    }).catch(function () { undo(); Share.shareText(waraqText(r), { name: waraqName(r) }); });
  }

  /** تنزيل البطاقة PDF على الجهاز (التنزيلات) بضغطة واحدة — من غير ورقة المشاركة. */
  function downloadWaraq(r, btnEl) {
    if (!w.Share || !Share.saveFile || !w.PdfDoc || !w.PdfBuild) { alert("التنزيل مش متاح على الجهاز ده."); return; }
    var undo = btnEl ? busyBtn(btnEl, "⏳ جارٍ التنزيل…") : function () { };
    waraqPdf(r).then(function (b64) {
      undo();
      Share.saveFile(waraqName(r) + ".pdf", b64, "application/pdf");
      /* الجسر الأصلي بيكتب «تم الحفظ في…» بنفسه */
      if (!w.AndroidSaver && w.PL && PL.toast) PL.toast("اتنزّلت البطاقة", waraqName(r) + ".pdf — في التنزيلات.", "ok");
    }).catch(function () { undo(); alert("تعذّر إنشاء الـPDF."); });
  }

  /* -------------------------------- الترحيل إلى صفحة القضايا بنفس رقم الملف */

  function toCase(regKey, v, rec) {
    var fileNo = String(v.fileNo || "").trim();
    Ask.confirm("ترحيل القيد إلى سجل القضايا؟", {
      danger: false, ok: "ترحيل",
      detail: (fileNo ? "سيُفتح ملف بالرقم " + ar(fileNo) + " بالمكتب."
                      : "بلا رقم ملف — اكتبه أولاً ليُقيَّد به.") +
              String.fromCharCode(10) +
              "تُنقل المحكمة ورقم الدعوى وتاريخ الجلسة، ويبقى القيد في سجله."
    }, function () {
      var cases = [];
      try { cases = JSON.parse(localStorage.getItem("proflawyer.agenda.cases.v1")) || []; }
      catch (e) { cases = []; }

      var iso = w.lawyerToISO ? w.lawyerToISO(v.jalsa) : la(v.jalsa).replace(/\//g, "-");
      cases.push({
        id: "rc" + Date.now().toString(36),
        fileNo: fileNo, dealYear: v.year || "", status: "متداولة",
        courtLevel: "", courtName: v.jcourt || "", circuit: "",
        caseType: v.mkind === "جنح" ? "جنح" : (v.mkind || ""),
        caseNo: v.jcase || "", caseYear: v.jcaseYear || "",
        subject: v.subject || "",
        clients: v.shaki || v.client || "", opponents: v.mashko || "",
        hall: "", floor: "", time: "", loc: "", lawyer: "",
        notes: "مُرحَّلة من " + (w.REGS[regKey] ? w.REGS[regKey].n : regKey) +
               (v.no ? " — رقم " + v.no : "") +
               (v.niabaJz ? " — " + v.niabaJz : ""),
        sessions: iso
          ? [{ date: iso, raw: { type: "مرافعة", roll: "", result: "", next: "", "for": "" } }]
          : []
      });
      try { localStorage.setItem("proflawyer.agenda.cases.v1", JSON.stringify(cases)); }
      catch (e) { alert("تعذّر الحفظ — المساحة ممتلئة."); return; }
      alert("تم الترحيل إلى سجل القضايا.");
    });
  }

  /* ------------------------------------------------------------- الحذف */

  function remove(regKey, id, done) {
    var reg = w.REGS[regKey];
    var r = rows(regKey).filter(function (x) { return x._id === id; })[0];
    if (!r) return;
    Ask.confirm("حذف هذا القيد نهائياً؟", {
      detail: reg.n + String.fromCharCode(10) + summary(regKey, r),
      ok: "حذف القيد"
    }, function () {
      if (!setRows(regKey, rows(regKey).filter(function (x) { return x._id !== id; }))) return;
      if (regKey === "waraq" && w.CaseFile && CaseFile.removeRegTask) {
        try { CaseFile.removeRegTask(id); } catch (e) { }
      }
      if (done) done();
    });
  }

  /* ------------------------------------------------------------- العرض */

  function summary(regKey, r) {
    var reg = w.REGS[regKey];
    return reg.F.slice(0, 4).map(function (f) {
      return r[f.k] ? f.t + ": " + ar(r[f.k]) : "";
    }).filter(Boolean).join("  ·  ");
  }

  /* تاريخ بأي صيغة محفوظة (ISO أو يوم/شهر/سنة، بأرقام عربية أو لاتينية) → «YYYY-MM-DD» للمقارنة */
  function isoKey(v) {
    var t = la(v).trim(), m = t.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
    if (m) return m[1] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[3]).slice(-2);
    m = t.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/);
    if (m) return m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
    return "";
  }

  function search(regKey, q) {
    var list = rows(regKey);
    var raw = la(q).trim();
    if (raw) {
      var words = norm(raw).split(" ").filter(Boolean);
      list = list.filter(function (r) {
        var hay = norm(Object.keys(r).map(function (k) { return r[k]; }).join(" "));
        return words.every(function (t) { return hay.indexOf(t) >= 0; });
      });
    }
    /* أوراق المحضرين من الأحدث للأقدم (طلب المستخدم — للسجل ده بس):
       بتاريخ الاستلام، والورقة اللي لسه ما اتستلمتش بتاريخ تسليمها للمحضر
       (عشان الورقة الجديدة ما تنزلش آخر القائمة)، ولو التاريخ واحد أو
       مفيش تاريخ خالص: آخر ما اتضاف الأول. */
    if (regKey === "waraq") {
      list = list.map(function (r, i) {
        return { r: r, i: i, k: isoKey(r.received) || isoKey(r.handed) };
      }).sort(function (a, b) {
        if (a.k !== b.k) return a.k < b.k ? 1 : -1;
        return b.i - a.i;
      }).map(function (x) { return x.r; });
    }
    return list;
  }

  /** رصيد العهدة التراكمي في سجل المصاريف. */
  function expenseTotals(list) {
    var custody = 0, spent = 0;
    (list || rows("masarif")).forEach(function (r) {
      custody += money(r.custody);
      spent += money(r.amount);
    });
    return { custody: custody, spent: spent, balance: custody - spent };
  }

  /* ------------------------------------------------------------- الطباعة */

  function print(regKey, list) {
    var reg = w.REGS[regKey];
    var win = el("div",
      "position:fixed;inset:0;background:#fff;color:#000;z-index:10060;" +
      "overflow:auto;padding:20px;direction:rtl;font-family:inherit");
    win.setAttribute("data-nosave", "1");

    var _lh = w.Letterhead && Letterhead.htmlHeader && Letterhead.htmlHeader();
    if (_lh) win.appendChild(_lh);
    else win.appendChild(el("div",
      "font-family:var(--f-title);font-size:15px;text-align:center;margin-bottom:4px",
      "مؤسسة المستشار حسن عبد المنعم — محامون ومستشارون قانونيون"));
    win.appendChild(el("div",
      "font-size:19px;font-family:var(--f-title);text-align:center;margin-bottom:14px",
      reg.n));

    if (reg.exp) {
      var t = expenseTotals(list);
      var sum = el("div", "display:flex;gap:10px;margin-bottom:14px");
      [["العهدة", t.custody], ["المنصرف", t.spent], ["الرصيد", t.balance]]
        .forEach(function (p) {
          var d = el("div",
            "flex:1;border:1px solid #ccc;border-radius:8px;padding:10px;text-align:center");
          d.appendChild(el("div", "font-size:12px;color:#555", p[0]));
          d.appendChild(el("div", "font-size:17px;font-family:var(--f-title)", fmtMoney(p[1])));
          sum.appendChild(d);
        });
      win.appendChild(sum);
    }

    /* طباعة كارت لكل قيد بنفس شكل الشاشة — حقول موزَّعة، لا جدول. */
    var flds = reg.F.filter(function (f) { return !f.act; });
    list.forEach(function (r) {
      var card = el("div",
        "border:1px solid #c9b48f;border-radius:10px;padding:12px 14px;margin-bottom:12px;" +
        "page-break-inside:avoid;background:#fffdf8");

      var segs = flds.slice(0, 3).map(function (f) {
        return f.calc ? "" : (r[f.k] ? ar(r[f.k]) : "");
      }).filter(Boolean);
      var ttl = el("div",
        "font-family:var(--f-title);font-size:15px;margin-bottom:8px;color:#3a2a17;" +
        "border-bottom:1px solid #e5d9bf;padding-bottom:6px");
      if (!segs.length) {
        ttl.textContent = "قيد بلا بيان";
      } else {
        segs.forEach(function (sgv, i) {
          if (i) ttl.appendChild(el("span", "color:#999", " · "));
          var bd = document.createElement("bdi"); bd.textContent = sgv; ttl.appendChild(bd);
        });
      }
      card.appendChild(ttl);

      var grid = el("div", "display:flex;flex-wrap:wrap;gap:6px 18px");
      flds.slice(3).forEach(function (f) {
        var v = f.calc ? fmtMoney(money(r.custody) - money(r.amount)) : r[f.k];
        if (!v) return;
        var cell = el("div",
          "flex:1 1 45%;min-width:180px;font-size:12.5px;line-height:1.9;display:flex;gap:6px");
        cell.appendChild(el("b",
          "color:#5b3a21;font-family:var(--f-title);font-weight:400;flex:0 0 auto", f.t + ":"));
        var sp = document.createElement("bdi");
        sp.textContent = ar(v); sp.style.cssText = "flex:1;white-space:pre-line";
        cell.appendChild(sp);
        grid.appendChild(cell);
      });
      card.appendChild(grid);
      win.appendChild(card);
    });

    var bar = el("div", "display:flex;gap:9px;margin-top:20px");
    var go = btn("🖨 طباعة / حفظ PDF",
      "border:0;background:#5b3a21;color:#fff;font-weight:600");
    go.onclick = function () {
      if (w.AndroidSaver && AndroidSaver.printPage) AndroidSaver.printPage(reg.n);
      else window.print();
    };
    var back = btn("رجوع", "border:1px solid #ccc;background:transparent;color:#333");
    back.onclick = function () { win.remove(); };
    bar.appendChild(go); bar.appendChild(back);
    win.appendChild(bar);

    document.body.appendChild(win);
  }

  /* =========================================== مزامنة قضايا الخبراء تلقائياً

     أي قضية تحمل عبارة "خبير" أو "لورود التقرير" (في حالتها، موضوعها،
     نتيجة/سبب أي جلسة، أو ملاحظاتها) تُعتبر قضية خبراء — تُنسخ بياناتها
     تلقائياً إلى سجل "خبراء" بدل إعادة كتابتها يدوياً. الحقول التي
     يملأها المستخدم بنفسه (المكتب المنتدب/الصادر/الوارد/اسم الخبير/
     الإجراءات) لا تُمسّ إن كانت مملوءة بالفعل — المزامنة تُحدِّث فقط
     الحقول المنسوخة من القضية نفسها. */

  function partyNames(txt) {
    return String(txt || "").split("·").map(function (p) {
      return p.replace(/\([^)]*\)/g, "").trim();
    }).filter(Boolean);
  }

  function caseSearchBlob(c) {
    var parts = [c.status, c.subject, c.kind, c.caseType];
    (c.sessions || []).forEach(function (s) {
      var raw = s.raw || {};
      Object.keys(raw).forEach(function (k) { parts.push(raw[k]); });
    });
    (c.noteLog || []).forEach(function (n) { parts.push(n.text); });
    return parts.filter(Boolean).join(" و ");
  }

  /* قضية خبراء = فيها ذكر "خبير" مقترناً بحالة انتظار حالية (تقرير لم يرد
     بعد، أو أمانة لم تُسدَّد بعد...) — وليس أي ذكر تاريخي عابر للكلمة قد
     يكون انتهى أمره من زمن. لذلك تُفحص فقط الحالة الحالية للقضية (قرار آخر
     جلسة مسجَّلة) لا كل الجلسات والملاحظات القديمة معاً. */
  var EXPERT_MENTION_RE = /خبير/;
  var EXPERT_PENDING_RE = /لورود|لسداد|أمانة|تقرير/;
  function isExpertPending(c) {
    if (!w.CaseFile) return false;
    var up = w.CaseFile.nextSession && w.CaseFile.nextSession(c);
    if (!up) return false;   /* بلا جلسة قادمة، لا داعي لإبقائها في متابعة الخبراء */
    var last = w.CaseFile.lastSession && w.CaseFile.lastSession(c);
    var reason = (last && w.CaseFile.resultOf ? w.CaseFile.resultOf(last) : "") || "";
    var blob = [reason, c.status, c.subject].filter(Boolean).join(" و ");
    return EXPERT_MENTION_RE.test(blob) && EXPERT_PENDING_RE.test(blob);
  }

  function syncExpertsFromCases() {
    if (!w.CaseFile || !w.CaseFile.all) return { scanned: 0, added: 0, updated: 0 };
    var cases = w.CaseFile.all();
    var list = rows("khubara").slice();
    var byFile = {};
    list.forEach(function (r, i) { if (r.fileNo) byFile[la(r.fileNo)] = i; });

    var added = 0, updated = 0, matched = 0;
    cases.forEach(function (c) {
      if (!isExpertPending(c)) return;
      matched++;

      var fileNo = la(c.fileNo || "");
      var fromCase = {
        fileNo: c.fileNo || "",
        ctype: c.caseType || "",
        subj: c.subject || "",
        no: c.caseNo || "",
        caseYear: c.caseYear || "",
        court: c.courtName || "",
        client: partyNames(c.clients).join("، "),
        foe: partyNames(c.opponents).join("، ")
      };

      var idx = fileNo && (fileNo in byFile) ? byFile[fileNo] : -1;
      if (idx >= 0) {
        var changed = false;
        Object.keys(fromCase).forEach(function (k) {
          if (list[idx][k] !== fromCase[k]) { list[idx][k] = fromCase[k]; changed = true; }
        });
        if (changed) updated++;
      } else {
        var rec = Object.assign({ _id: "rg" + Date.now().toString(36) +
          Math.floor(Math.random() * 1e4).toString(36) }, fromCase);
        list.push(rec);
        if (fileNo) byFile[fileNo] = list.length - 1;
        added++;
      }
    });

    if (added || updated) setRows("khubara", list);
    return { scanned: cases.length, matched: matched, added: added, updated: updated };
  }

  w.Registers = {
    rows: rows, setRows: setRows, search: search, edit: edit, remove: remove, pull: pull,
    commitAll: function (d) { return saveDb(d); },
    waraqToAdmin: waraqToAdmin, shareWaraq: shareWaraq, downloadWaraq: downloadWaraq,
    pickWaraqTeam: pickWaraqTeam, waraqTeam: waraqTeam,
    print: print, summary: summary, expenseTotals: expenseTotals,
    optionsOf: optionsOf, isList: isList, visible: visible, governor: governor,
    needCourtData: needCourtData,
    syncExpertsFromCases: syncExpertsFromCases,
    money: money, fmtMoney: fmtMoney, ar: ar, la: la, norm: norm, BASE: BASE
  };
})(window);
