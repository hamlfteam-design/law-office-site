/* =============================================================================
   سجل المحاضر.

   الشاشة السابقة كانت حقولاً مكرَّرة متجاورة بلا تسلسل: «رقم المحضر» و«سنة
   المحضر» و«رقم النيابة» و«سنة النيابة» و«الحالة» و«رقم ملف القضية بعد
   التحويل» — كلها مفتوحة معاً وإن لم يكن لها محل.

   هنا: صفٌّ واحد لرقم المحضر وسنته ونوعه كما في أوراق المحضرين، ثم
   «التصرف فيه» يفتح ما يخصّه وحده:

     جلسة  → تُرحَّل بياناته إلى صفحة القضايا بنفس رقم الملف.
     حفظ   → تاريخ الحفظ وسببه، والسبب يُحفظ في قاعدة الأسباب فيصير خياراً.
     تظلم  → رقمه وجهته وتاريخه ونوعه، والعرائض الإلكترونية تفتح
             رقم العريضة وتاريخ تقديمها وما تم فيها.

   ولكل ملف سجلّ ملاحظات مؤرَّخة تُضاف واحدةً بعد أخرى.
   ولكل حقل تلميح يشرح ما يُكتب فيه — فلا يبقى حقل غامض كـ«(ق)».
   ============================================================================= */
(function (w) {
  "use strict";

  var KEY     = "proflawyer.minutes.v1";
  var REASONS = "proflawyer.minutes.reasons.v1";   /* أسباب الحفظ المتراكمة */

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; }
  }
  function write(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); return true; }
    catch (e) { alert("تعذّر الحفظ — المساحة ممتلئة."); return false; }
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
  function today() { return new Date().toISOString().slice(0, 10); }
  function arDate(iso) { return ar(String(iso || "").replace(/-/g, "/")); }

  /* ------------------------------------------------- أسباب الحفظ المتراكمة */

  var BASE_REASONS = ["لعدم وجود جريمة", "لعدم كفاية الأدلة", "لعدم معرفة الفاعل",
                      "للتصالح", "لانقضاء الدعوى", "إدارياً"];

  function reasons() {
    var extra;
    try { extra = JSON.parse(localStorage.getItem(REASONS)) || []; }
    catch (e) { extra = []; }
    var seen = {}, out = [];
    BASE_REASONS.concat(extra).forEach(function (r) {
      var k = norm(r);
      if (!k || seen[k]) return;
      seen[k] = 1; out.push(r);
    });
    return out;
  }
  function rememberReason(r) {
    if (!r) return;
    var cur = reasons();
    if (cur.some(function (x) { return norm(x) === norm(r); })) return;
    var extra;
    try { extra = JSON.parse(localStorage.getItem(REASONS)) || []; }
    catch (e) { extra = []; }
    extra.push(r);
    try { localStorage.setItem(REASONS, JSON.stringify(extra)); } catch (e) { }
  }

  /* -------------------------------------------------------------- الحقول

     لكل حقل تلميح: ما الذي يُكتب فيه بالضبط. */

  var KINDS = ["إداري", "جنح", "عرائض"];

  var FIELDS = [
    { k: "no",       label: "رقم المحضر", width: "narrow", num: true,
      hint: "الرقم المتسلسل للمحضر في دفتر القسم." },
    { k: "year",     label: "لسنة", width: "narrow", num: true,
      hint: "سنة تحرير المحضر — أربعة أرقام." },
    { k: "kind",     label: "نوع المحضر", options: KINDS,
      hint: "إداري: إثبات حالة بلا اتهام · جنح: فيه اتهام بجنحة · عرائض: قُدِّم عريضةً." },
    { k: "station",  label: "قسم / مركز الشرطة", suggest: true,
      hint: "الجهة التي حُرِّر أمامها المحضر." },
    { k: "date",     label: "تاريخ التحرير", date: true,
      hint: "يوم تحرير المحضر — مثال ٢٠٢٦/٠٨/٢٥." },
    { k: "client",   label: "الموكل",
      hint: "اسم موكّل المكتب في هذا المحضر." },
    { k: "role",     label: "صفته", options: ["شاكٍ", "مشكوٌّ في حقه", "شاهد", "بلاغ"],
      hint: "صفة الموكل في المحضر — شاكٍ أم مشكوٌّ في حقه." },
    { k: "subject",  label: "موضوع المحضر", multi: true,
      hint: "ملخّص الواقعة في سطر أو سطرين." },
    { k: "prosNo",   label: "رقم النيابة", width: "narrow", num: true,
      hint: "رقم القيد في النيابة بعد إحالة المحضر إليها." },
    { k: "prosYear", label: "لسنة", width: "narrow", num: true,
      hint: "سنة قيد المحضر بالنيابة." },
    { k: "pros",     label: "النيابة المختصة", suggest: true,
      hint: "النيابة الجزئية أو الكلية التي تُباشر التحقيق." }
  ];

  /* التصرف في المحضر — كل خيار يفتح ما يخصّه وحده */
  var ACTIONS = ["", "جلسة", "حفظ", "تظلم"];

  var ACTION_FIELDS = {
    "جلسة": [
      { k: "caseFileNo", label: "رقم الملف بالمكتب", num: true,
        hint: "الملف الذي ستُقيَّد فيه القضية — تُرحَّل إليه بيانات المحضر." },
      { k: "hearingDate", label: "تاريخ الجلسة", date: true,
        hint: "أول جلسة حُدِّدت لنظر الدعوى." }
    ],
    "حفظ": [
      { k: "keepDate", label: "تاريخ الحفظ", date: true,
        hint: "اليوم الذي صدر فيه قرار الحفظ." },
      { k: "keepReason", label: "سبب الحفظ", reasons: true,
        hint: "يُكتب يدوياً أول مرة ثم يصير خياراً في القائمة." }
    ],
    "تظلم": [
      { k: "grNo",   label: "رقم التظلم", num: true,
        hint: "رقم قيد التظلم لدى الجهة المتظلَّم أمامها." },
      { k: "grBody", label: "جهة التظلم", suggest: true,
        hint: "النيابة الكلية · المحامي العام · النائب العام." },
      { k: "grDate", label: "تاريخ التظلم", date: true,
        hint: "يوم تقديم التظلم." },
      { k: "grKind", label: "نوع التظلم", options: ["يدوي", "عرائض إلكترونية"],
        hint: "يدوي: يُقدَّم بالمكتب · إلكتروني: عبر بوابة العرائض." }
    ]
  };

  /* يُفتح وحده حين يكون التظلم عبر العرائض الإلكترونية */
  var EPETITION_FIELDS = [
    { k: "epNo",     label: "رقم العريضة", num: true,
      hint: "الرقم الذي تعطيه البوابة عند التقديم." },
    { k: "epDate",   label: "تاريخ تقديم العريضة", date: true,
      hint: "يوم إرسال العريضة إلكترونياً." },
    { k: "epResult", label: "ما تم في العريضة", multi: true,
      hint: "ردّ الجهة أو ما اتُّخذ بشأنها." }
  ];

  /* ------------------------------------------------------------- القراءة */

  function title(m) {
    var t = "محضر " + ar(m.no || "—") + (m.year ? " لسنة " + ar(m.year) : "");
    return t + (m.kind ? " " + m.kind : "");
  }

  function search(q) {
    var list = read();
    var raw = la(q).trim();
    if (!raw) return list;

    if (/^\d+$/.test(raw)) {
      var exact = list.filter(function (m) {
        return la(m.no).trim() === raw || la(m.prosNo).trim() === raw ||
               la(m.caseFileNo).trim() === raw;
      });
      if (exact.length) return exact;
    }
    var words = norm(raw).split(" ").filter(Boolean);
    return list.filter(function (m) {
      var hay = norm([m.no, m.year, m.kind, m.station, m.client, m.subject,
                      m.pros, m.prosNo, m.action, m.keepReason, m.grBody]
                     .filter(Boolean).join(" "));
      return words.every(function (t) { return hay.indexOf(t) >= 0; });
    });
  }

  function usedValues(key) {
    var seen = {};
    read().forEach(function (m) {
      var v = String(m[key] == null ? "" : m[key]).trim();
      if (v) seen[v] = (seen[v] || 0) + 1;
    });
    return Object.keys(seen).sort(function (a, b) { return seen[b] - seen[a]; });
  }

  /* ------------------------------------------------------------- الواجهة */

  function sheet(z) {
    var back = el("div",
      "position:fixed;inset:0;background:rgba(20,14,8,.62);z-index:" + (z || 10020) + ";" +
      "display:flex;align-items:flex-end;justify-content:center");
    back.setAttribute("data-modal", "1");
    back.setAttribute("data-nosave", "1");
    var box = el("div",
      "background:var(--card,#fff);border-radius:18px 18px 0 0;padding:18px 18px 26px;" +
      "width:100%;max-width:620px;direction:rtl;color:var(--text);" +
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

  var CSS_IN = "width:100%;min-height:48px;font-size:16px;padding:10px 12px;" +
    "border:1px solid var(--line,#ddd);border-radius:9px;background:var(--card);" +
    "font-family:inherit;direction:rtl;text-align:right";

  var MANUAL = "__manual__";

  /**
   * حقل واحد بتلميحه. يعيد كائناً له value.
   * @param inline إن صحّ وُضع الحقل في صفّ لا في سطر مستقل
   */
  function field(parent, def, value, inline) {
    var g = el("div", inline
      ? "flex:" + (def.width === "narrow" ? "0 0 96px" : "1 1 140px") + ";margin-bottom:10px"
      : "margin-bottom:12px");

    g.appendChild(el("label",
      "display:block;font-family:var(--f-title);font-size:14px;" +
      "margin-bottom:5px;color:var(--brand-dark)", def.label));

    var holder = el("div");
    g.appendChild(holder);

    var hint = el("div",
      "font-size:12px;color:var(--muted);margin-top:4px;line-height:1.8", def.hint || "");
    g.appendChild(hint);
    parent.appendChild(g);

    var out = { value: String(value == null ? "" : value) };

    function textBox(v) {
      var t = document.createElement(def.multi ? "textarea" : "input");
      if (def.multi) t.rows = 2; else t.type = "text";
      t.value = v || "";
      t.setAttribute("lang", "ar");
      t.setAttribute("dir", "rtl");
      t.title = def.hint || def.label;
      if (def.date) { t.type = "date";
        t.value = w.lawyerToISO ? (w.lawyerToISO(v) || "") : (v || ""); }
      else if (def.num) t.placeholder = "رقم";
      t.style.cssText = CSS_IN + (def.width === "narrow" ? ";text-align:center" : "");
      t.oninput = function () {
        out.value = def.date && w.lawyerToISO ? (w.lawyerToISO(t.value) || "") : t.value.trim();
      };
      return t;
    }

    var pool = null;
    if (def.options) pool = def.options.filter(Boolean);
    else if (def.reasons) pool = reasons();

    if (pool) {
      var sel = document.createElement("select");
      sel.id = "mn_" + def.k;
      sel.style.cssText = CSS_IN;
      sel.title = def.hint || def.label;

      function fill(extra) {
        sel.textContent = "";
        var blank = document.createElement("option");
        blank.value = ""; blank.textContent = "— غير محدَّد —";
        sel.appendChild(blank);
        var list = pool.slice();
        if (extra && !list.some(function (v) { return norm(v) === norm(extra); })) {
          list.unshift(extra);
        }
        list.forEach(function (o) {
          var op = document.createElement("option");
          op.value = o; op.textContent = o;
          sel.appendChild(op);
        });
        var man = document.createElement("option");
        man.value = MANUAL; man.textContent = "✎ إضافة يدوية…";
        sel.appendChild(man);
      }
      fill(out.value);
      sel.value = out.value;
      holder.appendChild(sel);

      sel.onchange = function () {
        if (sel.value === MANUAL) {
          holder.textContent = "";
          var t = textBox("");
          t.placeholder = "اكتب " + def.label + "…";
          holder.appendChild(t);
          var bar = el("div", "display:flex;gap:8px;margin-top:7px");
          function sm(label, css) {
            var b = document.createElement("button");
            b.type = "button"; b.textContent = label;
            b.style.cssText = "flex:1;padding:10px;border-radius:9px;font-family:inherit;" +
                              "font-size:13.5px;min-height:42px;" + css;
            return b;
          }
          var ok = sm("حفظه في القائمة",
            "border:0;background:var(--brand);color:#fff;font-weight:600");
          var back = sm("↩ رجوع",
            "border:1px solid var(--line,#ddd);background:transparent;color:var(--muted)");
          bar.appendChild(ok); bar.appendChild(back);
          holder.appendChild(bar);
          ok.onclick = function () {
            var v = t.value.trim();
            if (!v) { t.focus(); return; }
            if (def.reasons) { rememberReason(v); pool = reasons(); }
            else if (pool.indexOf(v) < 0) pool.push(v);
            out.value = v;
            holder.textContent = "";
            holder.appendChild(sel);
            fill(v); sel.value = v;
            if (def.onChange) def.onChange(v);
          };
          back.onclick = function () {
            holder.textContent = "";
            holder.appendChild(sel);
            fill(out.value); sel.value = out.value;
          };
          setTimeout(function () { t.focus(); }, 60);
          return;
        }
        out.value = sel.value;
        if (def.onChange) def.onChange(sel.value);
      };

    } else {
      var t2 = textBox(out.value);
      if (def.suggest) {
        var vals = usedValues(def.k);
        if (vals.length) {
          var dl = document.createElement("datalist");
          dl.id = "mdl_" + def.k + "_" + Math.floor(Date.now() % 100000);
          vals.slice(0, 200).forEach(function (v) {
            var o = document.createElement("option");
            o.value = v;
            dl.appendChild(o);
          });
          holder.appendChild(dl);
          t2.setAttribute("list", dl.id);
        }
      }
      holder.appendChild(t2);
    }
    return out;
  }

  function btn(label, css) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.style.cssText = "flex:1;padding:14px;border-radius:11px;font-family:inherit;" +
                      "font-size:16px;min-height:52px;" + css;
    return b;
  }
  function row(box, kids, css) {
    var r = el("div", "display:flex;gap:9px;" + (css || "margin-top:14px"));
    kids.forEach(function (k) { r.appendChild(k); });
    box.appendChild(r);
    return r;
  }

  /* ----------------------------------------------- الخصم (قد يتعدد)

     الموكل واحد دائماً وصفته شاكٍ/مشكوٌّ في حقه/شاهد/بلاغ (حقل client/role
     فوق)، لكن المشكو في حقهم قد يتعددوا — فهنا صفوف قابلة للتعدد تُحفَظ
     بنفس صيغة «الخصوم» في صفحة القضايا: «اسم (صفة) · اسم (صفة)»، حتى
     تنتقل بلا تحويل عند الترحيل (طلب المستخدم ٢-١١-٢٠٢٦). */

  /** يفكّ "اسم (صفة) · اسم (صفة)" إلى [{name, role}] — نفس صيغة case-file.js. */
  function parseParties(txt) {
    var out = [];
    String(txt || "").split("·").forEach(function (p) {
      p = p.trim(); if (!p) return;
      var m2 = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(p);
      out.push(m2 ? { name: m2[1].trim(), role: m2[2].trim() } : { name: p, role: "" });
    });
    return out;
  }
  function joinParties(rows) {
    return rows.filter(function (r) { return r.name && r.name.trim(); })
      .map(function (r) { return r.role ? r.name.trim() + " (" + r.role.trim() + ")" : r.name.trim(); })
      .join(" · ");
  }

  /** محرِّر صفوف الخصوم: اسم + صفة (من نفس قائمة صفات الخصم بصفحة القضايا) + حذف + إضافة أخرى.
      يعيد {value()} تُرجع النص المجمَّع بصيغة case-file.js. */
  function opponentsEditor(parent, initialText) {
    var wrap = el("div", "margin-bottom:12px");
    wrap.appendChild(el("label",
      "display:block;font-family:var(--f-title);font-size:14px;" +
      "margin-bottom:5px;color:var(--brand-dark)", "الخصم (المشكوّ في حقه)"));
    var rowsBox = el("div");
    wrap.appendChild(rowsBox);
    wrap.appendChild(el("div",
      "font-size:12px;color:var(--muted);margin-top:2px;margin-bottom:6px;line-height:1.8",
      "إن تعدد المشكوّ في حقهم أضِف كلاً منهم بصفته — تُنقل كلها للقضية عند الترحيل."));
    parent.appendChild(wrap);

    var rows = parseParties(initialText);
    if (!rows.length) rows.push({ name: "", role: "" });
    var caps = w.Lists ? Lists.get("partyCapsOpponent") : [];

    function draw() {
      rowsBox.textContent = "";
      rows.forEach(function (r) {
        var line = el("div", "display:flex;flex-wrap:nowrap;gap:6px;margin-bottom:7px;align-items:center");

        var name = document.createElement("input");
        name.type = "text"; name.setAttribute("lang", "ar"); name.setAttribute("dir", "rtl");
        name.placeholder = "اسم الخصم"; name.value = r.name || "";
        name.style.cssText = "flex:1 1 auto;min-width:0;" + CSS_IN;
        name.oninput = function () { r.name = name.value; };
        line.appendChild(name);

        var sel = document.createElement("select");
        sel.style.cssText = "flex:0 0 118px;" + CSS_IN;
        var blank = document.createElement("option");
        blank.value = ""; blank.textContent = "";
        sel.appendChild(blank);
        var pool = caps.slice();
        if (r.role && pool.indexOf(r.role) < 0) pool.unshift(r.role);
        /* "مشكوٌّ في حقه" هي الصفة الغالبة هنا، فتظهر أول الاختيارات */
        var def = "مشكو في حقه";
        if (pool.indexOf(def) > 0) { pool.splice(pool.indexOf(def), 1); pool.unshift(def); }
        pool.forEach(function (o) {
          var op = document.createElement("option");
          op.value = o; op.textContent = o;
          sel.appendChild(op);
        });
        sel.value = r.role || "";
        sel.onchange = function () { r.role = sel.value; };
        line.appendChild(sel);

        var rm = document.createElement("button");
        rm.type = "button"; rm.textContent = "✕"; rm.title = "حذف هذا الخصم";
        rm.style.cssText = "flex:0 0 auto;min-width:40px;min-height:46px;border-radius:9px;" +
          "border:1px solid #e3c9c6;background:transparent;color:#b3261e;font-family:inherit";
        rm.onclick = function () {
          var i = rows.indexOf(r);
          if (i >= 0) rows.splice(i, 1);
          if (!rows.length) rows.push({ name: "", role: "" });
          draw();
        };
        line.appendChild(rm);
        rowsBox.appendChild(line);
      });

      var add = document.createElement("button");
      add.type = "button"; add.textContent = "＋ إضافة أخرى";
      add.style.cssText = "margin-top:2px;padding:9px 14px;border-radius:9px;" +
        "border:1px solid var(--line,#ddd);background:transparent;color:var(--brand);" +
        "font-family:inherit;font-size:13.5px;min-height:40px";
      add.onclick = function () { rows.push({ name: "", role: "" }); draw(); };
      rowsBox.appendChild(add);
    }
    draw();

    return { value: function () { return joinParties(rows); } };
  }

  /** الشاكي = مجني عليه دائماً عند الترحيل للقضايا، والمشكوّ في حقه = متهم
      (قاعدة المستخدم ٢-١١-٢٠٢٦) — صفات أخرى (شاهد/بلاغ) تنتقل كما كُتبت. */
  function transferRole(role, kind) {
    var n = norm(role || "");
    if (kind === "client" && n === norm("شاكٍ")) return "مجني عليه";
    if (kind === "opponent" && n === norm("مشكو في حقه")) return "متهم";
    return role || "";
  }

  /* --------------------------------------------------- محرِّر المحضر */

  function edit(id, done) {
    var list = read();
    var m = id ? list.filter(function (x) { return x.id === id; })[0] : null;
    var isNew = !m;
    if (isNew) m = { id: "mn" + Date.now().toString(36), notes: [] };

    var s = sheet(10022);
    head(s.box, isNew ? "محضر جديد" : "تعديل المحضر");

    var v = {};

    /* رقم المحضر ولسنة ونوعه في صفٍّ واحد كما في أوراق المحضرين */
    var r1 = el("div", "display:flex;gap:9px;flex-wrap:wrap;align-items:flex-start");
    s.box.appendChild(r1);
    ["no", "year", "kind"].forEach(function (k) {
      var def = FIELDS.filter(function (f) { return f.k === k; })[0];
      v[k] = field(r1, def, m[k], true);
    });

    ["station", "date", "client", "role"].forEach(function (k) {
      var def = FIELDS.filter(function (f) { return f.k === k; })[0];
      v[k] = field(s.box, def, m[k]);
    });

    var opponentsField = opponentsEditor(s.box, m.opponents);

    v.subject = field(s.box, FIELDS.filter(function (f) { return f.k === "subject"; })[0], m.subject);

    head(s.box, "النيابة",
         "font-family:var(--f-title);font-size:15px;margin:16px 0 8px");
    var r2 = el("div", "display:flex;gap:9px;flex-wrap:wrap;align-items:flex-start");
    s.box.appendChild(r2);
    ["prosNo", "prosYear"].forEach(function (k) {
      var def = FIELDS.filter(function (f) { return f.k === k; })[0];
      v[k] = field(r2, def, m[k], true);
    });
    v.pros = field(s.box, FIELDS.filter(function (f) { return f.k === "pros"; })[0], m.pros);

    /* ---------------- التصرف فيه ---------------- */
    head(s.box, "التصرف في المحضر",
         "font-family:var(--f-title);font-size:15px;margin:18px 0 8px");

    var actBox = el("div");
    s.box.appendChild(actBox);
    var subBox = el("div");
    s.box.appendChild(subBox);

    v.action = field(actBox, {
      k: "action", label: "ما تم فيه", options: ACTIONS.filter(Boolean),
      hint: "جلسة: أُحيل إلى المحكمة · حفظ: صدر قرار بحفظه · تظلم: تُظلِّم من الحفظ.",
      onChange: function (val) { drawSub(val); }
    }, m.action);

    var sub = {};

    function drawSub(action) {
      subBox.textContent = "";
      sub = {};
      var defs = ACTION_FIELDS[action];
      if (!defs) return;

      defs.forEach(function (def) {
        var d = def;
        if (def.k === "grKind") {
          d = {};
          Object.keys(def).forEach(function (kk) { d[kk] = def[kk]; });
          d.onChange = function (val) { drawEp(val); };
        }
        sub[def.k] = field(subBox, d, m[def.k]);
      });

      if (action === "جلسة") {
        var note = el("div",
          "background:var(--bg,#f4ece0);border-radius:11px;padding:11px 13px;" +
          "margin:4px 0 10px;font-size:13px;color:var(--muted);line-height:1.9",
          "بعد الحفظ يظهر زر «ترحيل إلى القضايا» — يفتح ملف قضية بنفس رقم الملف " +
          "وينقل إليه بيانات المحضر والموكل والموضوع.");
        subBox.appendChild(note);
      }

      if (action === "تظلم") {
        epBox = el("div");
        subBox.appendChild(epBox);
        drawEp(m.grKind);
      }
    }

    var epBox = null;
    function drawEp(kind) {
      if (!epBox) return;
      epBox.textContent = "";
      if (kind !== "عرائض إلكترونية") return;
      head(epBox, "العريضة الإلكترونية",
           "font-family:var(--f-title);font-size:14.5px;margin:12px 0 8px;" +
           "color:var(--brand-dark)");
      EPETITION_FIELDS.forEach(function (def) {
        sub[def.k] = field(epBox, def, m[def.k]);
      });
    }

    drawSub(m.action || "");

    /* ---------------- الحفظ ---------------- */
    var save = btn("حفظ", "border:0;background:var(--brand);color:#fff;font-weight:600");
    var cancel = btn("إلغاء",
      "border:1px solid var(--line,#ddd);background:transparent;color:var(--muted)");

    save.onclick = function () {
      if (!v.no.value && !v.subject.value) {
        alert("اكتب رقم المحضر أو موضوعه على الأقل.");
        return;
      }
      Object.keys(v).forEach(function (k) { m[k] = v[k].value; });
      m.opponents = opponentsField.value();

      /* حقول التصرف: تُمسح حقول ما لم يُختَر */
      var all = [];
      Object.keys(ACTION_FIELDS).forEach(function (a) {
        ACTION_FIELDS[a].forEach(function (d) { all.push(d.k); });
      });
      EPETITION_FIELDS.forEach(function (d) { all.push(d.k); });
      all.forEach(function (k) { if (!(k in sub)) m[k] = ""; });
      Object.keys(sub).forEach(function (k) { m[k] = sub[k].value; });

      if (m.action === "حفظ" && m.keepReason) rememberReason(m.keepReason);

      if (isNew) { m.at = new Date().toISOString(); list.push(m); }
      if (!write(list)) return;

      /* التصرف "جلسة" يُحوَّل تلقائياً لصفحة القضايا بمجرد تحديد الجلسة —
         بلا حاجة لزرّ "ترحيل" يدوي (طلب المستخدم ٢-١١-٢٠٢٦). أول مرة
         يُفتح ملف جديد، وبعدها كل جلسة جديدة تُضاف لتتابع جلساته. */
      if (m.action === "جلسة" && (m.hearingDate || m.caseFileNo)) {
        syncToCase(m, list);
        write(list);
      }

      s.back.remove();
      if (done) done(m);
    };
    cancel.onclick = function () { s.back.remove(); };
    row(s.box, [save, cancel], "margin-top:18px");
  }

  /* ------------------------------------------------ ملاحظات داخل الملف */

  function addNote(id, done) {
    var list = read();
    var m = list.filter(function (x) { return x.id === id; })[0];
    if (!m) return;

    var s = sheet(10024);
    head(s.box, "ملاحظة جديدة");
    var t = document.createElement("textarea");
    t.rows = 4;
    t.setAttribute("lang", "ar");
    t.setAttribute("dir", "rtl");
    t.placeholder = "ما تريد تسجيله في هذا الملف…";
    t.style.cssText = CSS_IN;
    s.box.appendChild(t);
    s.box.appendChild(el("div",
      "font-size:12px;color:var(--muted);margin-top:5px;line-height:1.8",
      "تُحفظ بتاريخ اليوم وتبقى في سجلّ الملف."));

    var ok = btn("حفظ الملاحظة",
      "border:0;background:var(--brand);color:#fff;font-weight:600");
    var no = btn("إلغاء",
      "border:1px solid var(--line,#ddd);background:transparent;color:var(--muted)");
    ok.onclick = function () {
      var body = t.value.trim();
      if (!body) { t.focus(); return; }
      m.notes = m.notes || [];
      m.notes.push({ at: today(), body: body });
      if (!write(list)) return;
      s.back.remove();
      if (done) done();
    };
    no.onclick = function () { s.back.remove(); };
    row(s.box, [ok, no]);
    setTimeout(function () { t.focus(); }, 80);
  }

  /* ------------------------------------------- الترحيل إلى صفحة القضايا

     يحصل تلقائياً من save() بمجرد ما "التصرف" = جلسة ويتحدد تاريخها —
     أول مرة يفتح ملف قضية جديد، وبعدها كل جلسة جديدة تُضاف لتتابع
     جلسات القضية المرتبطة. toCase تحت دي نفس المنطق لكن بتأكيد يدوي،
     تُستخدم كبديل احتياطي من زرّ "ترحيل" في الشاشة. */

  function readCases() {
    try { return JSON.parse(localStorage.getItem("proflawyer.agenda.cases.v1")) || []; }
    catch (e) { return []; }
  }
  function writeCases(cases) {
    try { localStorage.setItem("proflawyer.agenda.cases.v1", JSON.stringify(cases)); return true; }
    catch (e) { alert("تعذّر الحفظ — المساحة ممتلئة."); return false; }
  }

  /** الموكل (شاكٍ ← مجني عليه) والخصوم (مشكوٌّ في حقه ← متهم) بصيغة
      case-file.js الجاهزة للنسخ المباشر في clients/opponents. */
  function buildParties(m) {
    var clientRole = transferRole(m.role, "client");
    var clients = m.client
      ? joinParties([{ name: m.client, role: clientRole }])
      : "";
    var opponents = joinParties(parseParties(m.opponents).map(function (r) {
      return { name: r.name, role: transferRole(r.role, "opponent") };
    }));
    return { clients: clients, opponents: opponents };
  }

  /** ينشئ قضية من المحضر أو يحدّث تتابع جلسات القضية المرتبطة إن وُجدت.
      بلا تأكيد أو تنبيه — القرار بالتأكيد والتنبيه لمن يستدعيها. */
  function syncToCase(m, minutesList) {
    var cases = readCases();
    var hearingIso = m.hearingDate ? (w.lawyerToISO ? w.lawyerToISO(m.hearingDate) : m.hearingDate) : "";

    if (m.caseId) {
      var existing = cases.filter(function (x) { return x.id === m.caseId; })[0];
      if (existing) {
        existing.sessions = existing.sessions || [];
        if (hearingIso && !existing.sessions.some(function (s) { return s.date === hearingIso; })) {
          existing.sessions.push({ date: hearingIso,
            raw: { type: "مرافعة", roll: "", result: "", next: "", "for": "" } });
          if (!writeCases(cases)) return null;
        }
        return existing;
      }
    }

    var parties = buildParties(m);
    var c = {
      id: "mc" + Date.now().toString(36),
      fileNo: String(m.caseFileNo || "").trim(),
      dealYear: m.year || "",
      status: "متداولة",
      courtLevel: "", courtName: "", circuit: "",
      caseType: m.kind === "جنح" ? "جنح" : (m.kind || ""),
      caseNo: m.prosNo || "", caseYear: m.prosYear || "",
      subject: m.subject || "",
      clients: parties.clients, opponents: parties.opponents,
      hall: "", floor: "", time: "", loc: "", lawyer: "",
      notes: "مُرحَّلة من " + title(m) +
             (m.station ? " — " + m.station : "") +
             (m.pros ? " — نيابة " + m.pros : ""),
      sessions: hearingIso
        ? [{ date: hearingIso, raw: { type: "مرافعة", roll: "", result: "", next: "", "for": "" } }]
        : [],
      fromMinute: m.id
    };
    cases.push(c);
    if (!writeCases(cases)) return null;

    m.caseId = c.id;
    if (minutesList) {
      var t = minutesList.filter(function (x) { return x.id === m.id; })[0];
      if (t) t.caseId = c.id;
    }
    return c;
  }

  function toCase(id, done) {
    var list = read();
    var m = list.filter(function (x) { return x.id === id; })[0];
    if (!m) return;
    if (!w.CaseFile) { alert("سجل القضايا غير متاح من هذه الشاشة."); return; }

    var fileNo = String(m.caseFileNo || "").trim();
    Ask.confirm("ترحيل المحضر إلى سجل القضايا؟", {
      danger: false, ok: "ترحيل",
      detail: title(m) + String.fromCharCode(10) +
              (fileNo ? "سيُفتح ملف بالرقم " + ar(fileNo) + " بالمكتب."
                      : "بلا رقم ملف — اكتبه في «رقم الملف بالمكتب» أولاً ليُقيَّد به.") +
              String.fromCharCode(10) +
              "تُنقل بيانات الموكل (مجني عليه) والخصم (متهم) والموضوع والنيابة، ويبقى المحضر في سجله."
    }, function () {
      var c = syncToCase(m, list);
      if (!c) return;
      if (!write(list)) return;
      alert("تم الترحيل." + String.fromCharCode(10) +
            "افتح سجل القضايا لاستكمال المحكمة والدائرة.");
      if (done) done(c);
    });
  }

  function remove(id, done) {
    var m = read().filter(function (x) { return x.id === id; })[0];
    if (!m) return;
    Ask.confirm("حذف هذا المحضر نهائياً؟", {
      detail: title(m) + (m.client ? String.fromCharCode(10) + m.client : ""),
      ok: "حذف المحضر"
    }, function () {
      if (!write(read().filter(function (x) { return x.id !== id; }))) return;
      if (done) done();
    });
  }

  w.Minutes = {
    all: read, search: search, edit: edit, remove: remove,
    addNote: addNote, toCase: toCase, title: title,
    FIELDS: FIELDS, ACTION_FIELDS: ACTION_FIELDS,
    EPETITION_FIELDS: EPETITION_FIELDS, KINDS: KINDS,
    reasons: reasons, ar: ar, arDate: arDate, sheet: sheet, field: field,
    head: head, btn: btn, row: row
  };
})(window);
