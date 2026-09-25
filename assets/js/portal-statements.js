/* =============================================================================
   واجهة «قضاياي» في بوابة الموكلين (عربي/إنجليزي) — بنفس شكل بيان الدعوى المطبوع (case-statement.js).
   الموكل: «عندك N قضية»؛ لو أكثر من ٣ → قائمة منسدلة (اختر قضية / استعراض الكل)؛ كل قضية بيان كامل + طباعة + PDF على ورق المؤسسة.
   ============================================================================= */
(function (w) {
  "use strict";
  var TXT = {
    ar: { count1: "عندك قضية واحدة مسجَّلة.", count2: "عندك قضيتان مسجَّلتان.", countN: function (n) { return "عندك " + n + " قضايا مسجَّلة."; },
      pick: "اختر القضية لعرضها:", placeholder: "— اختر قضية —", all: "— استعراض كل القضايا —",
      print: "🖨 طباعة / حفظ PDF", paper: "📄 PDF على ورق المؤسسة", prep: "جارٍ التجهيز…", fail: "تعذّر إنشاء الملف.", wait: "تعذّر تجهيز الملف — حاول بعد ثوانٍ.", empty: "اختر قضية من القائمة لعرضها.", none: "بلا موضوع" },
    en: { count1: "You have 1 registered case.", count2: "You have 2 registered cases.", countN: function (n) { return "You have " + n + " registered cases."; },
      pick: "Select a case to view:", placeholder: "— Select a case —", all: "— View all cases —",
      print: "🖨 Print / Save PDF", paper: "📄 PDF on Firm Letterhead", prep: "Preparing…", fail: "Could not create the PDF.", wait: "Could not prepare the file — please try again in a few seconds.", empty: "Select a case from the list to view it.", none: "No recorded subject" }
  };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; }); }
  var AR = /[؀-ۿ]/;

  function mount(o) {
    var lang = o.lang === "en" ? "en" : "ar", X = TXT[lang], el = o.el, cases = o.cases || [];
    var byId = {}; cases.forEach(function (c) { if (c.id) byId[c.id] = c; });
    var tv = lang === "en"
      ? function (v) {
          v = String(v == null ? "" : v).trim(); if (!v) return "";
          if (!AR.test(v)) return v;
          var t = w.I18nEn && w.I18nEn.tr ? w.I18nEn.tr(v) : undefined;
          return t === undefined ? "Translation pending" : t;
        }
      : function (v) { return v; };
    var num = function (n) { return lang === "ar" ? String(n).replace(/[0-9]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩"[+d]; }) : String(n); };
    function chainOf(c) {
      var out = [], seen = {}, cur = c;
      while (cur && cur.promotedFrom && byId[cur.promotedFrom] && !seen[cur.promotedFrom]) { seen[cur.promotedFrom] = 1; cur = byId[cur.promotedFrom]; out.unshift(cur); }
      return out;
    }
    /* القضايا الأقدم في سلسلة الترحيل تُدمج في بيان أحدث درجة فلا تُعرض منفصلة */
    var absorbed = {};
    cases.forEach(function (c) { chainOf(c).forEach(function (a) { absorbed[a.id] = 1; }); });
    var list = cases.filter(function (c) { return !absorbed[c.id]; });
    var prefix = lang === "en" ? "../../" : "../";
    var lhImg = prefix + "assets/images/letterhead/" + (lang === "en" ? "header_tight_en.png" : "header_tight.png");

    function caseLabel(c) {
      var first = String(c.clients || "").split("·")[0].replace(/\([^)]*\)/g, "").trim();
      return [c.fileNo ? (lang === "en" ? "File " : "ملف ") + num(c.fileNo) : "", c.caseNo ? num(c.caseNo) + (c.caseYear ? "/" + num(c.caseYear) : "") : "", tv(first)]
        .filter(Boolean).join(" — ");
    }
    function model(c) { return CaseStatement.build(c, { lang: lang, chain: chainOf(c), tv: tv }); }

    /* العرض على الشاشة = صور صفحات A4 نفسها المبنية للـPDF (نفس الخطوط سلطان/مادا، ورق المؤسسة، العلامة المائية، QR) — مطابق للمطبوع تماماً */
    function card(c, i) {
      return "<div class=\"case-card\" id=\"case-" + i + "\">" +
        "<div class=\"case-actions\"><button class=\"btn-print\" data-print=\"case-" + i + "\">" + X.print + "</button>" +
        "<button class=\"btn-print\" data-paper=\"" + i + "\" style=\"background:#7a5a2a;margin-inline-start:8px\">" + X.paper + "</button></div>" +
        "<div class=\"st-pages\" data-i=\"" + i + "\" style=\"min-height:120px;text-align:center;color:#8a7a5a;padding:18px\">" + X.prep + "</div></div>";
    }
    var _style = document.createElement("style");
    _style.textContent = ".st-pages img{display:block;width:100%;max-width:820px;margin:0 auto 14px;border:1px solid #d8cdb5;box-shadow:0 2px 10px rgba(0,0,0,.12);background:#fff}" +
      "@media print{.st-pages img{max-width:none;width:100%;margin:0;border:0;box-shadow:none;page-break-after:always;break-after:page}}";
    document.head.appendChild(_style);
    function fonts() {
      try {
        return Promise.all([document.fonts.load("bold 20px \"SF Sultan\""), document.fonts.load("20px \"SF Mada\"")]).catch(function () { });
      } catch (e) { return Promise.resolve(); }
    }
    var _cache = {};
    function pagesFor(c) {
      var key = c.id || JSON.stringify(c).length;
      if (!_cache[key]) _cache[key] = fonts().then(function () {
        return w.PdfDoc.build(CaseStatement.toBlocks(model(c)), lang === "en" ? { ltr: true } : {});
      });
      return _cache[key];
    }
    function fill() {
      Array.prototype.forEach.call(el.querySelectorAll(".st-pages"), function (box) {
        if (box.getAttribute("data-done")) return;
        box.setAttribute("data-done", "1");
        var c = list[+box.getAttribute("data-i")];
        if (!w.PdfDoc) { box.textContent = X.wait; return; }
        pagesFor(c).then(function (pages) {
          box.style.cssText = ""; box.textContent = "";
          pages.forEach(function (p) {
            var im = new Image(); im.alt = ""; im.src = String(p).indexOf("data:") === 0 ? p : "data:image/jpeg;base64," + p;
            box.appendChild(im);
          });
        }).catch(function (e) { console.error(e); box.textContent = X.fail; });
      });
    }

    var n = list.length;
    var head = "<p class=\"cases-count\" style=\"font-size:1.05rem;margin:0 0 12px;font-weight:600\">" + (n === 1 ? X.count1 : n === 2 ? X.count2 : X.countN(num(n))) + "</p>";
    var picker = "", many = n > 3;
    if (many) {
      picker = "<div style=\"margin:0 0 16px\"><label style=\"display:block;margin-bottom:6px\">" + X.pick + "</label>" +
        "<select id=\"casePick\" style=\"width:100%;max-width:520px;padding:10px;font-size:1rem;border:1px solid #c9b48f;border-radius:8px;background:#fff\">" +
        "<option value=\"\">" + X.placeholder + "</option><option value=\"all\">" + X.all + "</option>" +
        list.map(function (c, i) { return "<option value=\"" + i + "\">" + esc(caseLabel(c)) + "</option>"; }).join("") + "</select></div>";
    }
    el.innerHTML = head + picker + "<div id=\"caseView\"></div>";
    var view = el.querySelector("#caseView");
    function show(sel) {
      if (sel === "" ) { view.innerHTML = "<div class=\"empty-state\">" + X.empty + "</div>"; return; }
      var idxs = sel === "all" ? list.map(function (_, i) { return i; }) : [+sel];
      view.innerHTML = idxs.map(function (i) { return card(list[i], i); }).join("");
      fill();
    }
    if (many) { show(""); el.querySelector("#casePick").addEventListener("change", function (e) { show(e.target.value); }); }
    else show("all");

    el.addEventListener("click", function (ev) {
      var pb = ev.target.closest("[data-print]");
      if (pb) {
        var cardEl = document.getElementById(pb.getAttribute("data-print"));
        if (cardEl) { cardEl.classList.add("printing-case"); w.print(); setTimeout(function () { cardEl.classList.remove("printing-case"); }, 500); }
        return;
      }
      var b = ev.target.closest("[data-paper]");
      if (!b) return;
      var c = list[+b.getAttribute("data-paper")];
      if (!c || !w.PdfDoc || !w.PdfBuild) { alert(X.wait); return; }
      var old = b.textContent; b.disabled = true; b.textContent = X.prep;
      pagesFor(c).then(function (pages) {
        var blob = new Blob([w.PdfBuild.fromJpegs(pages)], { type: "application/pdf" });
        var a = document.createElement("a"); a.href = URL.createObjectURL(blob);
        a.download = "case-" + (c.fileNo || "statement") + ".pdf";
        document.body.appendChild(a); a.click(); a.remove();
      }).catch(function (e) { console.error(e); alert(X.fail); }).then(function () { b.disabled = false; b.textContent = old; });
    });
  }
  w.PortalStatements = { mount: mount };
})(window);
