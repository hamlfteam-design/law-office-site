/* =============================================================================
   نسخة بدون بيانات.

   الشاشات نفسها ببياناتها التجريبية مفيدة للعرض، لكن المكتب يحتاج نسخة
   نظيفة يبدأ منها. هذا الملف يُدرج في نسخة «بدون بيانات» فقط، ويفرّغ كل
   قيمة مكتوبة سلفاً في الحقول عند فتح أي شاشة — دون المساس بالتصميم.

   لا يُحذف شيء من المحفوظات: ما يحفظه المستخدم يبقى كما هو.
   ============================================================================= */
(function () {
  "use strict";

  window.__EMPTY_BUILD = true;

  /* الحقول التي يجب أن تحتفظ بقيمتها: مقاسات الورق واتجاه الطباعة ونحوها */
  function keep(f) {
    if (f.closest("[data-nosave]")) return true;          // أدواتنا
    if (f.hasAttribute("data-keep")) return true;
    var id = (f.id || "") + " " + (f.name || "");
    return /size|orient|paper|طباعة/i.test(id);
  }

  function clearOnce() {
    var root = document.querySelector("main") || document.body;

    root.querySelectorAll("input, textarea").forEach(function (f) {
      if (keep(f)) return;
      var t = (f.getAttribute("type") || "text").toLowerCase();
      if (t === "checkbox" || t === "radio") { f.checked = false; return; }
      if (t === "file" || t === "button" || t === "submit") return;
      if (!f.value) return;
      f.value = "";
      f.dispatchEvent(new Event("input",  { bubbles: true }));
      f.dispatchEvent(new Event("change", { bubbles: true }));
    });

    root.querySelectorAll("select").forEach(function (s) {
      if (keep(s)) return;
      if (s.selectedIndex === 0) return;
      s.selectedIndex = 0;
      s.dispatchEvent(new Event("change", { bubbles: true }));
    });

    /* نصوص العرض التجريبية داخل الجداول (خلايا غير قابلة للتحرير) */
    root.querySelectorAll("table td:not(:has(input)):not(:has(select))")
        .forEach(function (td) {
          if (td.querySelector("input, select, textarea, button")) return;
          if (td.closest("[data-nosave]")) return;
          if (td.textContent.trim()) td.textContent = "";
        });
  }

  function boot() {
    clearOnce();
    /* الشاشات تبني بعض الصفوف بعد التحميل — نفرّغها مرة أخرى بعد استقرارها */
    setTimeout(clearOnce, 400);
    setTimeout(clearOnce, 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else { boot(); }
})();
