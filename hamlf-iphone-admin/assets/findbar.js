/* =============================================================================
   شريط البحث المدمج — في كل شاشة، لا في شاشة واحدة.

   البيان الخطأ أو الناقص يُكتشف في أي لحظة ومن أي شاشة، فلا معنى لأن
   يضطر المستخدم إلى تذكّر الشاشة التي أُدخل منها ثم يذهب إليها.

   هنا: خانة في أعلى كل شاشة — تكتب فيها أي قيمة (رقم توكيل بالمكتب ·
   رقم ملف · رقم دعوى · اسم موكل · رقم محضر · مبلغ) فتظهر بياناتها فوراً
   وأنت مكانك، ومعها «تعديل» يفتح محرّرها و«حذف».

   يعتمد على FindAll: هي التي تعرف المخازن وكيف يُعدَّل كلٌّ منها.
   ============================================================================= */
(function (w) {
  "use strict";

  function el(tag, css, txt) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function ar(n) {
    return String(n == null ? "" : n)
      .replace(/[0-9]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩"[+d]; });
  }

  function mount() {
    if (!w.FindAll) return;                       /* الشاشة لم تُحمَّل عليها */
    if (document.getElementById("__findbar")) return;

    var main = document.querySelector("main");
    if (!main) return;

    var box = el("div", "margin-bottom:12px");
    box.id = "__findbar";
    box.setAttribute("data-nosave", "1");

    var inp = document.createElement("input");
    inp.type = "text";
    inp.id = "__fbq";
    inp.setAttribute("lang", "ar");
    inp.setAttribute("dir", "rtl");
    inp.setAttribute("autocomplete", "off");
    inp.placeholder = "🔎 اكتب أي قيمة — رقم توكيل · ملف · دعوى · اسم موكل…";
    inp.style.cssText =
      "width:100%;min-height:52px;font-size:16px;padding:11px 14px;" +
      "border:1px solid var(--line,#ddd);border-radius:11px;background:var(--card);" +
      "direction:rtl;text-align:right;font-family:inherit";
    box.appendChild(inp);

    var hint = el("div",
      "font-size:12px;color:var(--muted);margin-top:5px;line-height:1.8",
      "النتائج تظهر هنا من كل السجلات — ومعها التعديل والحذف.");
    box.appendChild(hint);

    var out = el("div", "margin-top:10px");
    box.appendChild(out);

    main.insertBefore(box, main.firstChild);

    /* ------------------------------------------------------------ الرسم */

    function draw() {
      var q = inp.value.trim();
      out.textContent = "";
      if (!q) { hint.hidden = false; return; }
      hint.hidden = true;

      var list = w.FindAll.search(q);
      if (!list.length) {
        out.appendChild(el("div",
          "padding:14px;text-align:center;color:var(--muted);font-size:13.5px;" +
          "border:1px dashed var(--line,#ddd);border-radius:11px",
          "لا يوجد ما يطابق «" + q + "» في أي سجل."));
        return;
      }

      out.appendChild(el("div",
        "font-size:12.5px;color:var(--muted);margin-bottom:7px",
        "النتائج: " + ar(list.length)));

      list.slice(0, 25).forEach(function (r) {
        var card = el("div",
          "background:var(--card);border:1px solid var(--line);border-radius:12px;" +
          "padding:11px;margin-bottom:8px");

        var hd = el("div", "display:flex;gap:8px;align-items:flex-start");
        hd.appendChild(el("span", "flex:0 0 auto;font-size:17px", r.icon || "•"));
        hd.appendChild(el("span",
          "flex:1;font-family:var(--f-title);font-size:14.5px;line-height:1.7;" +
          "word-break:break-word", r.title));
        hd.appendChild(el("span",
          "flex:0 0 auto;font-size:11px;padding:2px 9px;border-radius:20px;" +
          "background:#efe7db;color:#5b3a21;white-space:nowrap", r.kind));
        card.appendChild(hd);

        if (r.lines && r.lines.length) {
          card.appendChild(el("div",
            "font-size:12.5px;color:var(--muted);margin-top:6px;line-height:1.95;" +
            "white-space:pre-line;word-break:break-word", r.lines.join("\n")));
        }

        var act = el("div", "display:flex;gap:7px;margin-top:9px;flex-wrap:wrap");
        function b(label, on, css) {
          var x = document.createElement("button");
          x.type = "button";
          x.textContent = label;
          x.style.cssText = "flex:1 1 auto;min-width:80px;min-height:42px;" +
            "border:1px solid var(--line);border-radius:8px;background:transparent;" +
            "color:var(--brand);font-family:inherit;font-size:12.5px;" + (css || "");
          x.onclick = on;
          act.appendChild(x);
        }

        b("✎ تعديل وحفظ", function () { r.edit(draw); },
          "border-color:var(--brand);font-weight:600");

        if (r.appt) {
          b("↪ اجعله جلسة", function () { w.FindAll.toSession(r.id, draw); });
        }

        b("🗑 حذف", function () {
          Ask.confirm("حذف هذا السجل نهائياً؟",
                      { detail: r.kind + " — " + r.title, ok: "حذف" },
                      function () { r.remove(draw); });
        }, "color:#b3261e;border-color:#e3c9c6");

        card.appendChild(act);
        out.appendChild(card);
      });

      if (list.length > 25) {
        var more = el("div", "margin-top:4px");
        var a = document.createElement("a");
        a.href = "93-find.html?q=" + encodeURIComponent(q);
        a.textContent = "…و" + ar(list.length - 25) + " نتيجة — افتحها كلها";
        a.style.cssText = "display:flex;align-items:center;justify-content:center;" +
          "min-height:44px;color:var(--brand);font-size:13px;text-decoration:none;" +
          "border:1px solid var(--line);border-radius:9px";
        more.appendChild(a);
        out.appendChild(more);
      }
    }

    var timer;
    inp.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(draw, 180);
    });

    /* ?find=… يفتح الشاشة والبحث جاهز */
    var m = location.search.match(/[?&]find=([^&]*)/);
    if (m) { inp.value = decodeURIComponent(m[1]); draw(); }

    w.__findbarDraw = draw;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(mount, 120); });
  } else { setTimeout(mount, 120); }
})(window);
