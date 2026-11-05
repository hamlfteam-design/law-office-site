/* =============================================================================
   المصروفات — العهدة والمصروف والرصيد.

   الشاشتان السابقتان كانتا حقول إدخال متفرّقة بلا حساب: تكتب قيمة المصروف
   ولا يظهر لك ما بقي من العهدة. والمكتب يعمل بعهدة تُسلَّم ثم يُصرف منها،
   فالرقم المهم هو الثالث — الرصيد.

   هنا شكل أوراق المحضرين: صفٌّ لكل حركة بحقول متجاورة، وفوقها ثلاث خانات
   منفصلة لا تختلط:

        العهدة المستلمة   |   المصروف   |   الرصيد

   والرصيد يُحسب لا يُكتب: العهدة ناقص المصروف.
   ولكل حقل تلميح يشرح ما يُكتب فيه.
   ============================================================================= */
(function (w) {
  "use strict";

  var KEY = "proflawyer.expenses.v1";

  function readRaw() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; }
  }
  function writeRaw(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); return true; }
    catch (e) { alert("تعذّر الحفظ — المساحة ممتلئة."); return false; }
  }
  /* المحامي يرى حركاته فقط؛ المدير يرى الكل */
  function read() {
    var l = readRaw();
    if (isMgr()) return l;
    var m = me().email;
    return l.filter(function (r) { return !r.ownerEmail || r.ownerEmail === m; });
  }
  function write(list) {
    var vis = {}; list.forEach(function (r) { vis[r.id] = 1; });
    var old = readRaw(), keep = old.filter(function (r) { return !vis[r.id] && !isVisible(r); });
    var gone = old.filter(function (r) { return !vis[r.id] && isVisible(r); });
    var m = me();
    list.forEach(function (r) {
      var o = old.filter(function (x) { return x.id === r.id; })[0];
      if (!o || JSON.stringify(o) !== JSON.stringify(r)) {
        if (!r.ownerEmail && m.email) { r.ownerEmail = m.email; r.ownerName = m.name; }
        r.updatedAt = Date.now();
        syncOne(r);
      }
    });
    gone.forEach(syncDel);
    return writeRaw(keep.concat(list));
  }
  function isVisible(r) { return isMgr() || !r.ownerEmail || r.ownerEmail === me().email; }
  /* ---- ربط الحركة بالمحامي + مزامنة سحابية (مهمة 47) ---- */
  function me() {
    var e = "", n = "", role = "";
    try { var u = w.Team && Team.current && Team.current(); if (u) { e = u.email || ""; n = u.name || ""; role = u.role || ""; } } catch (x) { }
    try { if (!e && w.Auth && Auth.session) { var se = Auth.session(); e = (se && se.email) || ""; } } catch (x) { }
    return { email: String(e).toLowerCase(), name: n, role: role };
  }
  function isMgr() { var m = me(); return !m.role || m.role === "owner" || m.role === "manager"; }
  function cloudId(r) { return String(r.id).replace(/[^A-Za-z0-9_]/g, "_"); }
  function syncOne(r) {
    try { if (w.CloudStore && CloudStore.collection) { var c = JSON.parse(JSON.stringify(r)); CloudStore.collection.save("expenses", cloudId(r), c); } } catch (x) { }
  }
  function syncDel(r) {
    try { if (w.CloudStore && CloudStore.collection) CloudStore.collection.remove("expenses", cloudId(r)); } catch (x) { }
  }
  function pullFromCloud(done) {
    if (!(w.CloudStore && CloudStore.collection)) { if (done) done(false); return; }
    CloudStore.collection.list("expenses", function (list) {
      if (!list) { if (done) done(false); return; }
      var cur = readRaw(), idx = {}, n = 0;
      cur.forEach(function (r) { idx[r.id] = r; });
      list.forEach(function (r) {
        if (!r || !r.id || !r.ownerEmail) return;
        var l = idx[r.id];
        if (!l) { cur.push(r); n++; }
        else if ((r.updatedAt || 0) > (l.updatedAt || 0)) { Object.keys(r).forEach(function (k) { l[k] = r[k]; }); n++; }
      });
      if (n) writeRaw(cur);
      if (done) done(true, n);
    });
  }
  /** تحليل للمدير: حسب المحامي / البند / الشهر (المصروف فقط) */
  function analysis() {
    var by = {}, item = {}, month = {}, total = 0;
    read().forEach(function (r) {
      if (r.kind === "عهدة مستلمة") return;
      var v = money(r.amount); total += v;
      var who = r.ownerName || r.ownerEmail || "المكتب";
      by[who] = (by[who] || 0) + v;
      var it = String(r.item || "بدون بند").trim() || "بدون بند";
      item[it] = (item[it] || 0) + v;
      var m = String(r.date || "").slice(0, 7) || "؟";
      month[m] = (month[m] || 0) + v;
    });
    return { by: by, item: item, month: month, total: total };
  }
  function showAnalysis() {
    var a = analysis();
    var box = el("div", "position:fixed;inset:0;background:var(--bg,#fff);color:var(--ink,#000);z-index:10050;overflow:auto;padding:18px;direction:rtl;font-family:inherit");
    box.appendChild(el("div", "font-size:19px;font-weight:700;margin-bottom:10px", "تحليل المصروفات — الإجمالي " + fmt(a.total) + " جنيه"));
    [["حسب المحامي", a.by], ["حسب البند", a.item], ["حسب الشهر", a.month]].forEach(function (g) {
      box.appendChild(el("div", "font-weight:700;margin:14px 0 6px;color:var(--brand)", g[0]));
      Object.keys(g[1]).sort(function (x, y) { return g[1][y] - g[1][x]; }).forEach(function (k) {
        var r = el("div", "display:flex;justify-content:space-between;padding:8px 4px;border-bottom:1px solid var(--line,#ddd)");
        r.appendChild(el("span", "", g[0] === "حسب الشهر" ? ar(k) : k));
        r.appendChild(el("b", "", fmt(g[1][k])));
        box.appendChild(r);
      });
    });
    var c = btn("رجوع", "border:1px solid var(--line,#ddd);background:transparent;color:var(--muted);margin-top:16px;width:100%");
    c.onclick = function () { box.remove(); };
    box.appendChild(c);
    document.body.appendChild(box);
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

  /** يقرأ رقماً من نصّ قد يكون بأرقام عربية أو فيه فواصل. */
  function money(v) {
    var n = parseFloat(la(v).replace(/[^0-9.\-]/g, ""));
    return isFinite(n) ? n : 0;
  }
  /** يعرض المبلغ بأرقام عربية وفاصلة آلاف. */
  function fmt(n) {
    var s = (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, "");
    var p = s.split(".");
    p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, "٬");
    return ar(p.join("٫"));
  }

  /* ----------------------------------------------------------- نوع الحركة

     العهدة تدخل، والمصروف يخرج. حركة واحدة لا حركتان حتى لا يُكتب
     الرقم مرتين. */

  var KINDS = ["عهدة مستلمة", "مصروف"];

  var SCOPES = ["مصروفات قضية", "مصروفات المكتب"];

  /* بنود الصرف الثابتة — تظهر في دروب بوكس، مع إتاحة إضافة بند يدوي
     غير موجود في القائمة (زر «✎ إضافة يدوية…» المدمج في آلية options). */
  var ITEMS = [
    "رسوم الدعوى",
    "اتعاب محاماة",
    "ضريبة قيمة مضافة",
    "تحت حساب الضريبة",
    "دمغة محاماة",
    "دمغة عادية",
    "تصوير مستندات",
    "صورة رسمية مميكنة",
    "اكراميات",
    "انتقالات وسفر"
  ];

  var FIELDS = [
    { k: "date",   label: "التاريخ", date: true, width: "mid",
      hint: "يوم استلام العهدة أو يوم الصرف." },
    { k: "kind",   label: "النوع", options: KINDS, width: "mid",
      hint: "عهدة مستلمة: مبلغ دخل الخزنة · مصروف: مبلغ خرج منها." },
    { k: "amount", label: "المبلغ", num: true, width: "mid",
      hint: "بالجنيه — يُكتب رقماً بلا كلمات." },
    { k: "scope",  label: "على حساب", options: SCOPES,
      hint: "مصروفات قضية: تُحمَّل على ملف بعينه · المكتب: مصروف عام." },
    { k: "fileNo", label: "رقم الملف بالمكتب", num: true,
      hint: "الملف الذي يُحمَّل عليه المصروف — يُترك فارغاً لمصروف المكتب." },
    { k: "client", label: "اسم الموكل", suggest: true,
      hint: "صاحب الملف — يُملأ وحده إن عُرف رقم الملف." },
    { k: "item",   label: "بند المصروف", options: ITEMS,
      hint: "اختر من القائمة، أو اختر «✎ إضافة يدوية…» لبند غير موجود بها." },
    { k: "by",     label: "القائم بالصرف", suggest: true,
      hint: "من سلّم أو صرف المبلغ — اختر من القائمة أو أضِف اسماً جديداً." },
    { k: "charge", label: "تحميل المصروف", options: ["على الموكل", "على المكتب"],
      hint: "هل يُطالَب به الموكل أم يتحمّله المكتب؟" },
    { k: "notes",  label: "ملاحظات", multi: true,
      hint: "رقم الإيصال أو أي بيان يوضّح الحركة." }
  ];

  /* ------------------------------------------------------------- الحساب */

  /**
   * العهدة والمصروف والرصيد — لكل النطاق أو لملف بعينه.
   * الرصيد محسوب لا مكتوب: العهدة ناقص المصروف.
   */
  function totals(filter) {
    var custody = 0, spent = 0;
    read().forEach(function (r) {
      if (filter && !filter(r)) return;
      var v = money(r.amount);
      if (r.kind === "عهدة مستلمة") custody += v;
      else spent += v;
    });
    return { custody: custody, spent: spent, balance: custody - spent };
  }

  function search(q) {
    var list = read().slice().sort(function (a, b) {
      return String(b.date).localeCompare(String(a.date));
    });
    var raw = la(q).trim();
    if (!raw) return list;

    if (/^\d+$/.test(raw)) {
      var exact = list.filter(function (r) { return la(r.fileNo).trim() === raw; });
      if (exact.length) return exact;
    }
    var words = norm(raw).split(" ").filter(Boolean);
    return list.filter(function (r) {
      var hay = norm([r.item, r.client, r.by, r.notes, r.scope, r.kind, r.fileNo]
                     .filter(Boolean).join(" "));
      return words.every(function (t) { return hay.indexOf(t) >= 0; });
    });
  }

  function usedValues(key) {
    var seen = {};
    read().forEach(function (r) {
      var v = String(r[key] == null ? "" : r[key]).trim();
      if (v) seen[v] = (seen[v] || 0) + 1;
    });
    return Object.keys(seen).sort(function (a, b) { return seen[b] - seen[a]; });
  }

  /* ------------------------------------------------------------- الواجهة */

  var CSS_IN = "width:100%;min-height:48px;font-size:16px;padding:10px 12px;" +
    "border:1px solid var(--line,#ddd);border-radius:9px;background:var(--card);" +
    "font-family:inherit;direction:rtl;text-align:right";
  var MANUAL = "__manual__";

  function sheet(z) {
    var back = el("div",
      "position:fixed;inset:0;background:rgba(20,14,8,.62);z-index:" + (z || 10030) + ";" +
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

  function field(parent, def, value, inline) {
    var g = el("div", inline
      ? "flex:1 1 " + (def.width === "mid" ? "130px" : "160px") + ";margin-bottom:10px"
      : "margin-bottom:12px");

    g.appendChild(el("label",
      "display:block;font-family:var(--f-title);font-size:14px;" +
      "margin-bottom:5px;color:var(--brand-dark)", def.label));

    var holder = el("div");
    g.appendChild(holder);
    g.appendChild(el("div",
      "font-size:12px;color:var(--muted);margin-top:4px;line-height:1.8", def.hint || ""));
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
      t.style.cssText = CSS_IN;
      t.oninput = function () {
        out.value = def.date && w.lawyerToISO ? (w.lawyerToISO(t.value) || "") : t.value.trim();
        if (def.onInput) def.onInput(out.value);
      };
      return t;
    }

    var pool = def.options ? def.options.slice() : null;

    if (pool) {
      var sel = document.createElement("select");
      sel.id = "ex_" + def.k;
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
          var bk = sm("↩ رجوع",
            "border:1px solid var(--line,#ddd);background:transparent;color:var(--muted)");
          bar.appendChild(ok); bar.appendChild(bk);
          holder.appendChild(bar);
          ok.onclick = function () {
            var v = t.value.trim();
            if (!v) { t.focus(); return; }
            if (pool.indexOf(v) < 0) pool.push(v);
            out.value = v;
            holder.textContent = "";
            holder.appendChild(sel);
            fill(v); sel.value = v;
            if (def.onInput) def.onInput(v);
          };
          bk.onclick = function () {
            holder.textContent = "";
            holder.appendChild(sel);
            fill(out.value); sel.value = out.value;
          };
          setTimeout(function () { t.focus(); }, 60);
          return;
        }
        out.value = sel.value;
        if (def.onInput) def.onInput(sel.value);
      };

    } else {
      var t2 = textBox(out.value);
      if (def.suggest) {
        var vals = usedValues(def.k);
        if (vals.length) {
          var dl = document.createElement("datalist");
          dl.id = "xdl_" + def.k + "_" + Math.floor(Date.now() % 100000);
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

  /* ------------------------------------------------------------ المحرِّر */

  /**
   * @param id  معرّف حركة قائمة، أو كائن بذور لحركة جديدة (يُدرَج من القضية).
   */
  function edit(id, done) {
    var list = read();
    var seed = (id && typeof id === "object") ? id : null;
    var r = (id && !seed) ? list.filter(function (x) { return x.id === id; })[0] : null;
    var isNew = !r;
    if (isNew) {
      r = { id: "ex" + Date.now().toString(36), date: today(), kind: "مصروف" };
      if (seed) Object.keys(seed).forEach(function (k) { r[k] = seed[k]; });
    }

    var s = sheet(10032);
    head(s.box, isNew ? "حركة جديدة" : "تعديل الحركة");

    var v = {};

    /* التاريخ والنوع والمبلغ في صفٍّ واحد كما في أوراق المحضرين */
    var r1 = el("div", "display:flex;gap:9px;flex-wrap:wrap;align-items:flex-start");
    s.box.appendChild(r1);
    ["date", "kind", "amount"].forEach(function (k) {
      var def = FIELDS.filter(function (f) { return f.k === k; })[0];
      v[k] = field(r1, def, r[k], true);
    });

    ["scope", "fileNo", "client", "item", "by", "charge", "notes"].forEach(function (k) {
      var def = FIELDS.filter(function (f) { return f.k === k; })[0];
      if (k === "by") {
        /* دروب بوكس بأسماء القائمين بالصرف اللي سبق إدخالها، مع إتاحة
           إضافة اسم جديد (نفس آلية options+MANUAL). */
        def = Object.create(def);
        def.options = usedValues("by");
      }
      v[k] = field(s.box, def, r[k]);
    });

    var save = btn("حفظ", "border:0;background:var(--brand);color:#fff;font-weight:600");
    var cancel = btn("إلغاء",
      "border:1px solid var(--line,#ddd);background:transparent;color:var(--muted)");

    function validate() {
      if (!money(v.amount.value)) { alert("اكتب المبلغ."); return false; }
      if (!v.kind.value) { alert("حدِّد النوع: عهدة مستلمة أم مصروف."); return false; }
      return true;
    }
    function apply() {
      Object.keys(v).forEach(function (k) { r[k] = v[k].value; });
      if (isNew) list.push(r);
      return write(list);
    }

    save.onclick = function () {
      if (!validate()) return;
      if (!apply()) return;
      s.back.remove();
      if (done) done(r);
    };
    cancel.onclick = function () { s.back.remove(); };

    /* يحفظ البند الحالي بدون إغلاق الشاشة، ويفتح بند جديد بنفس بيانات
       القضية (النوع/التاريخ/على حساب/رقم الملف/الموكل/التحميل/القائم
       بالصرف) — فلا داعي لتكرار إدخالها مع كل بند صرف متتالٍ. */
    var saveAdd = btn("حفظ وإضافة بند آخر",
      "border:1px solid var(--brand);background:transparent;color:var(--brand);font-weight:600");
    saveAdd.onclick = function () {
      if (!validate()) return;
      var carry = {
        date: v.date.value, kind: v.kind.value, scope: v.scope.value,
        fileNo: v.fileNo.value, client: v.client.value,
        by: v.by.value, charge: v.charge.value
      };
      if (!apply()) return;
      if (done) done(r);
      s.back.remove();
      list = read();
      edit({ id: "ex" + Date.now().toString(36) + Math.floor(Math.random() * 1000),
             date: carry.date, kind: carry.kind, scope: carry.scope,
             fileNo: carry.fileNo, client: carry.client,
             by: carry.by, charge: carry.charge }, done);
    };

    row(s.box, [saveAdd], "margin-top:16px");
    row(s.box, [save, cancel], "margin-top:10px");
  }

  function remove(id, done) {
    var r = read().filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    Ask.confirm("حذف هذه الحركة نهائياً؟", {
      detail: (r.kind || "") + " — " + fmt(money(r.amount)) + " جنيه" +
              (r.item ? String.fromCharCode(10) + r.item : ""),
      ok: "حذف الحركة"
    }, function () {
      if (!write(read().filter(function (x) { return x.id !== id; }))) return;
      if (done) done();
    });
  }

  /* ------------------------------------------------------------- الطباعة */

  function print(list, t) {
    var win = el("div",
      "position:fixed;inset:0;background:#fff;color:#000;z-index:10060;" +
      "overflow:auto;padding:20px;direction:rtl;font-family:inherit");
    win.setAttribute("data-nosave", "1");

    win.appendChild(el("div",
      "font-family:var(--f-title);font-size:15px;text-align:center;margin-bottom:4px",
      "مؤسسة المستشار حسن عبد المنعم — محامون ومستشارون قانونيون"));
    win.appendChild(el("div",
      "font-size:19px;font-family:var(--f-title);text-align:center;margin-bottom:14px",
      "بيان المصروفات والعهدة"));

    var sum = el("div", "display:flex;gap:10px;margin-bottom:14px");
    [["العهدة المستلمة", t.custody], ["المصروف", t.spent], ["الرصيد", t.balance]]
      .forEach(function (p) {
        var d = el("div",
          "flex:1;border:1px solid #ccc;border-radius:8px;padding:10px;text-align:center");
        d.appendChild(el("div", "font-size:12px;color:#555", p[0]));
        d.appendChild(el("div", "font-size:17px;font-family:var(--f-title)", fmt(p[1])));
        sum.appendChild(d);
      });
    win.appendChild(sum);

    var tbl = document.createElement("table");
    tbl.style.cssText = "width:100%;border-collapse:collapse;font-size:12.5px";
    var hr = tbl.insertRow();
    ["التاريخ", "النوع", "المبلغ", "على حساب", "رقم الملف", "البند", "القائم بالصرف"]
      .forEach(function (h) {
        var th = hr.insertCell();
        th.textContent = h;
        th.style.cssText = "padding:7px;border:1px solid #ccc;background:#f5f0e6;" +
                           "font-family:var(--f-title)";
      });
    list.forEach(function (x) {
      var tr = tbl.insertRow();
      [ar(String(x.date || "").replace(/-/g, "/")), x.kind || "",
       fmt(money(x.amount)), x.scope || "",
       x.fileNo ? ar(x.fileNo) : "", x.item || "", x.by || ""]
        .forEach(function (val) {
          var td = tr.insertCell();
          td.textContent = val;
          td.style.cssText = "padding:7px;border:1px solid #ccc";
        });
    });
    win.appendChild(tbl);

    var bar = el("div", "display:flex;gap:9px;margin-top:20px");
    var go = btn("🖨 طباعة / حفظ PDF",
      "border:0;background:#5b3a21;color:#fff;font-weight:600");
    go.onclick = function () {
      if (w.AndroidSaver && AndroidSaver.printPage) AndroidSaver.printPage("بيان المصروفات");
      else window.print();
    };
    var back = btn("رجوع", "border:1px solid #ccc;background:transparent;color:#333");
    back.onclick = function () { win.remove(); };
    bar.appendChild(go); bar.appendChild(back);
    win.appendChild(bar);

    document.body.appendChild(win);
  }

  w.Expenses = {
    all: read, pullFromCloud: pullFromCloud, showAnalysis: showAnalysis, analysis: analysis, search: search, totals: totals, edit: edit, remove: remove,
    print: print, money: money, fmt: fmt, ar: ar,
    FIELDS: FIELDS, KINDS: KINDS, SCOPES: SCOPES
  };
})(window);
