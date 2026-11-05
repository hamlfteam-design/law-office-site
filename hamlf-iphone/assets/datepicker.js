/* =============================================================================
   منتقي تاريخ عربي.

   حقول <input type="date"> يفرض المتصفح فيها صيغة ISO لاتينية (2026-10-15)
   ولا يمكن لأي تطبيق تغييرها. لذلك نحوّلها إلى حقول نصية ونعرض التاريخ
   بالأرقام العربية: ٢٠٢٦/١٠/١٥ — ونفتح تقويماً من صنعنا عند اللمس.

   لماذا هذا الترتيب بالذات (سنة/شهر/يوم)؟
     · مقروء بالعربية بالكامل كما طُلب،
     · وترتيبه كنص مطابق لترتيب ISO، فتظل المقارنات والفرز صحيحة،
     · ويُحوَّل ذهاباً وإياباً بلا لبس، فلا تضيع السجلات القديمة.

   لقراءة القيمة برمجياً: window.lawyerISO(el) تُعيد "2026-10-15".
   ============================================================================= */
(function (w) {
  "use strict";

  var AR = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  var MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
                "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  var DAYS = ["سبت", "أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة"];   /* السبت أول الأسبوع */

  function ar(n, pad) {
    var s = String(n);
    if (pad) while (s.length < pad) s = "0" + s;
    return s.replace(/[0-9]/g, function (d) { return AR[+d]; });
  }
  function la(t) {
    return String(t == null ? "" : t)
      .replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x0660; });
  }

  /* ------------------------------------------------------------- تحويلات */

  function isoToShown(iso, kind) {
    if (!iso) return "";
    var p = la(iso).split("-");
    if (kind === "month") return p.length >= 2 ? ar(p[0]) + "/" + ar(p[1], 2) : "";
    if (kind === "time")  { var t = la(iso).split(":"); return t.length >= 2 ? ar(t[0], 2) + ":" + ar(t[1], 2) : ""; }
    return p.length >= 3 ? ar(p[0]) + "/" + ar(p[1], 2) + "/" + ar(p[2], 2) : "";
  }

  function shownToIso(txt, kind) {
    var s = la(txt).replace(/\s/g, "");
    if (!s) return "";
    if (kind === "time") {
      var t = s.split(":");
      return t.length >= 2 ? pad(t[0]) + ":" + pad(t[1]) : "";
    }
    var p = s.split(/[\/\-.]/);
    if (kind === "month") return p.length >= 2 ? p[0] + "-" + pad(p[1]) : "";
    return p.length >= 3 ? p[0] + "-" + pad(p[1]) + "-" + pad(p[2]) : "";
  }
  function pad(n) { n = String(parseInt(n, 10) || 0); return n.length < 2 ? "0" + n : n; }

  w.lawyerISO = function (el) {
    if (!el) return "";
    return shownToIso(el.value, el.dataset.dateKind || "date");
  };

  /* ------------------------------------------------------------- اللوحة */

  var open = null;

  function close() { if (open) { open.remove(); open = null; } }

  function el(t, css, txt) {
    var e = document.createElement(t);
    if (css) e.style.cssText = css;
    if (txt != null) e.textContent = txt;
    return e;
  }

  function panel(input) {
    close();
    var kind = input.dataset.dateKind || "date";
    var iso  = shownToIso(input.value, kind);

    var now = new Date();
    var y, m, d;
    if (kind === "time") {
      var tp = (iso || "09:00").split(":");
      y = parseInt(tp[0], 10); m = parseInt(tp[1], 10);
    } else {
      var p = (iso || "").split("-");
      y = parseInt(p[0], 10) || now.getFullYear();
      m = (parseInt(p[1], 10) || now.getMonth() + 1) - 1;
      d = parseInt(p[2], 10) || now.getDate();
    }

    var wrap = el("div",
      "position:fixed;inset:0;background:rgba(20,14,8,.55);z-index:10050;" +
      "display:flex;align-items:flex-end;justify-content:center");
    wrap.setAttribute("data-modal", "1");
    wrap.setAttribute("data-nosave", "1");

    var box = el("div",
      "background:var(--card,#fff);border-radius:16px 16px 0 0;padding:16px 14px 24px;" +
      "width:100%;max-width:460px;direction:rtl;color:var(--text,#241a12)");

    function commit(v) {
      input.value = v;
      input.dispatchEvent(new Event("input",  { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      close();
    }

    /* ---------------- الوقت ---------------- */
    if (kind === "time") {
      box.appendChild(el("div",
        "font-family:var(--f-title);font-size:17px;margin-bottom:12px", "اختر الوقت"));
      var rowT = el("div", "display:flex;gap:10px;align-items:center;justify-content:center");

      function spin(val, max, lbl) {
        var c = el("div", "text-align:center;flex:0 0 auto");
        c.appendChild(el("div", "font-size:12px;color:var(--muted);margin-bottom:5px", lbl));
        var up = el("button", btnCss(), "▲"); up.type = "button";
        var show = el("div", "font-size:26px;padding:8px 0;font-family:var(--f-title)", ar(val, 2));
        var dn = el("button", btnCss(), "▼"); dn.type = "button";
        up.onclick = function () { val = (val + 1) % (max + 1); show.textContent = ar(val, 2); c.dataset.v = val; };
        dn.onclick = function () { val = (val - 1 + max + 1) % (max + 1); show.textContent = ar(val, 2); c.dataset.v = val; };
        c.dataset.v = val;
        c.appendChild(up); c.appendChild(show); c.appendChild(dn);
        return c;
      }
      function btnCss() {
        return "display:block;width:54px;min-height:40px;border:1px solid var(--line,#ddd);" +
               "border-radius:9px;background:transparent;color:var(--brand);font-size:15px;" +
               "font-family:inherit;margin:0 auto";
      }
      var hh = spin(isNaN(y) ? 9 : y, 23, "ساعة");
      var mm = spin(isNaN(m) ? 0 : m, 59, "دقيقة");
      rowT.appendChild(hh);
      rowT.appendChild(el("div", "font-size:24px", ":"));
      rowT.appendChild(mm);
      box.appendChild(rowT);

      box.appendChild(actions(function () {
        commit(ar(hh.dataset.v, 2) + ":" + ar(mm.dataset.v, 2));
      }, function () { commit(""); }));

      wrap.appendChild(box);
      wrap.onclick = function (e) { if (e.target === wrap) close(); };
      document.body.appendChild(wrap);
      open = wrap;
      return;
    }

    /* ---------------- الشهر والسنة ---------------- */
    var head = el("div", "display:flex;align-items:center;gap:8px;margin-bottom:12px");
    var prev = el("button", navCss(), "›"); prev.type = "button";
    var title = el("div",
      "flex:1;text-align:center;font-family:var(--f-title);font-size:17px");
    var next = el("button", navCss(), "‹"); next.type = "button";
    head.appendChild(next); head.appendChild(title); head.appendChild(prev);
    box.appendChild(head);

    function navCss() {
      return "width:44px;height:44px;border:1px solid var(--line,#ddd);border-radius:10px;" +
             "background:transparent;color:var(--brand);font-size:20px;font-family:inherit";
    }

    var grid = el("div", "display:grid;grid-template-columns:repeat(7,1fr);gap:4px");
    box.appendChild(grid);

    function render() {
      /* اختيار الشهر والسنة مستقلَّين بدل التنقل بالأسهم */
      title.textContent = "";
      var selCss = "font-family:inherit;font-size:15px;padding:8px 6px;border-radius:9px;" +
                   "border:1px solid var(--line,#ddd);background:var(--card,#fff);color:var(--text);min-height:42px";
      if (kind !== "month") {
        var sm = el("select", selCss); sm.setAttribute("data-no-combo", "1");   /* ترتيب الشهور الطبيعي — بلا قائمة البحث الأبجدية */
        MONTHS.forEach(function (nm, i) { var o = el("option", "", nm); o.value = i; if (i === m) o.selected = true; sm.appendChild(o); });
        sm.onchange = function () { m = +sm.value; render(); };
        title.appendChild(sm);
        title.appendChild(document.createTextNode(" "));
      }
      var sy = el("select", selCss); sy.setAttribute("data-no-combo", "1");
      var y0 = Math.min(y, new Date().getFullYear()) - 12, y1 = Math.max(y, new Date().getFullYear()) + 8;
      for (var yy = y1; yy >= y0; yy--) { var oy = el("option", "", ar(yy)); oy.value = yy; if (yy === y) oy.selected = true; sy.appendChild(oy); }
      sy.onchange = function () { y = +sy.value; render(); };
      title.appendChild(sy);
      grid.textContent = "";

      if (kind === "month") {
        grid.style.gridTemplateColumns = "repeat(3,1fr)";
        MONTHS.forEach(function (nm, i) {
          var on = (i === m);
          var b = el("button",
            "padding:14px 4px;border-radius:10px;font-family:inherit;font-size:14px;" +
            "min-height:52px;color:var(--text);" +
            "border:1px solid " + (on ? "var(--brand)" : "var(--line,#ddd)") + ";" +
            "background:" + (on ? "var(--brand)" : "transparent") + ";" +
            (on ? "color:#fff;font-weight:700;" : ""), nm);
          b.type = "button";
          b.onclick = function () { commit(ar(y) + "/" + ar(i + 1, 2)); };
          grid.appendChild(b);
        });
        return;
      }

      DAYS.forEach(function (n) {
        grid.appendChild(el("div",
          "text-align:center;font-size:11.5px;color:var(--muted);padding:4px 0", n));
      });

      var first = (new Date(y, m, 1).getDay() + 1) % 7;
      var days  = new Date(y, m + 1, 0).getDate();
      var today = new Date(); today.setHours(0, 0, 0, 0);

      for (var i = 0; i < first; i++) grid.appendChild(el("div"));

      for (var day = 1; day <= days; day++) {
        (function (day) {
          var cur = new Date(y, m, day);
          var isToday = cur.getTime() === today.getTime();
          var isSel = (day === d);
          var b = el("button",
            "padding:10px 0;border-radius:9px;font-family:inherit;font-size:15px;" +
            "min-height:44px;" +
            "border:1px solid " + (isSel ? "var(--brand)" : (isToday ? "var(--gold,#c8a165)" : "transparent")) + ";" +
            "background:" + (isSel ? "var(--brand)" : "transparent") + ";" +
            "color:" + (isSel ? "#fff" : "var(--text)") + ";" +
            "font-weight:" + (isSel || isToday ? "700" : "400"), ar(day));
          b.type = "button";
          b.onclick = function () {
            commit(ar(y) + "/" + ar(m + 1, 2) + "/" + ar(day, 2));
          };
          grid.appendChild(b);
        })(day);
      }
    }

    prev.onclick = function () {
      if (kind === "month") { y++; } else { m++; if (m > 11) { m = 0; y++; } }
      render();
    };
    next.onclick = function () {
      if (kind === "month") { y--; } else { m--; if (m < 0) { m = 11; y--; } }
      render();
    };

    box.appendChild(actions(function () {
      var n = new Date();
      if (kind === "month") commit(ar(n.getFullYear()) + "/" + ar(n.getMonth() + 1, 2));
      else commit(ar(n.getFullYear()) + "/" + ar(n.getMonth() + 1, 2) + "/" + ar(n.getDate(), 2));
    }, function () { commit(""); }, "اليوم"));

    render();
    wrap.appendChild(box);
    wrap.onclick = function (e) { if (e.target === wrap) close(); };
    document.body.appendChild(wrap);
    open = wrap;
  }

  function actions(okFn, clearFn, okLabel) {
    var row = el("div", "display:flex;gap:9px;margin-top:14px");
    function mk(label, css, fn) {
      var b = el("button",
        "flex:1;padding:12px;border-radius:10px;font-family:inherit;font-size:15px;" +
        "min-height:48px;" + css, label);
      b.type = "button"; b.onclick = fn;
      return b;
    }
    row.appendChild(mk(okLabel || "تأكيد",
      "border:0;background:var(--brand);color:#fff;font-weight:600", okFn));
    row.appendChild(mk("مسح",
      "border:1px solid var(--line,#ddd);background:transparent;color:var(--brand)", clearFn));
    row.appendChild(mk("إغلاق",
      "border:1px solid var(--line,#ddd);background:transparent;color:var(--muted)", close));
    return row;
  }

  /* ---------------------------------------------------------- التحويل */

  function upgrade(f) {
    var t = (f.getAttribute("type") || "").toLowerCase();
    if (["date", "month", "time"].indexOf(t) < 0) return;
    if (f.dataset.dateKind) return;

    f.dataset.dateKind = t;
    var iso = f.value;
    f.setAttribute("type", "text");
    f.setAttribute("readonly", "readonly");     // يفتح التقويم بدل لوحة المفاتيح
    f.setAttribute("inputmode", "none");
    f.setAttribute("data-latin", "1");          // لا تتدخّل طبقة الأرقام
    f.style.cursor = "pointer";
    f.style.background = f.style.background || "";
    f.placeholder = t === "time" ? "اضغط لاختيار الوقت"
                  : t === "month" ? "اضغط لاختيار الشهر"
                  : "اضغط لاختيار التاريخ";
    f.value = isoToShown(iso, t);

    f.addEventListener("click", function () { panel(f); });
    f.addEventListener("focus", function () { f.blur(); panel(f); });
  }

  function scan(root) {
    (root || document).querySelectorAll('input[type="date"], input[type="month"], input[type="time"]')
      .forEach(upgrade);
    /* قيم قديمة محفوظة بصيغة ISO لاتينية تُعرض عربية */
    (root || document).querySelectorAll("input[data-date-kind], input[data-dateKind]")
      .forEach(function (f) {
        if (/^\d{4}-\d{2}/.test(f.value)) f.value = isoToShown(f.value, f.dataset.dateKind);
      });
  }

  function boot() {
    scan();
    var pending = false;
    new MutationObserver(function () {
      if (pending) return;
      pending = true;
      setTimeout(function () { pending = false; scan(); }, 200);
    }).observe(document.body, { childList: true, subtree: true });

    /* السجل المحفوظ قديماً يُكتب بصيغة ISO — نعيد عرضه عربياً بعد التحميل */
    document.addEventListener("change", function (e) {
      var f = e.target;
      if (f && f.dataset && f.dataset.dateKind && /^\d{4}-\d{2}/.test(f.value)) {
        f.value = isoToShown(f.value, f.dataset.dateKind);
      }
    }, true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 120); });
  } else { setTimeout(boot, 120); }

})(window);
