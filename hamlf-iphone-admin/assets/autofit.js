/* =============================================================================
   التمديد التلقائي المعمَّم — قاعدة الاحتواء على كل الشاشات.
   أي عنصر يحمل class="autofit" (أو ".ttl" عنوان القضية) يُصغَّر خطُّه تلقائياً
   ليحتوي بيانه في سطرٍ واحد بلا كسر ولا انزلاق. يعمل عند التحميل، وعند تغيّر
   المحتوى (MutationObserver)، وعند تغيّر المقاس/الدوران.
   ============================================================================= */
(function (w) {
  "use strict";
  var SEL = ".autofit, .ttl";

  function fit(el, max, min) {
    if (!el || !el.isConnected) return;
    el.style.whiteSpace = "nowrap";
    el.style.overflow = "hidden";
    var s = max, g = 0;
    el.style.fontSize = s + "px";
    while (el.scrollWidth > el.clientWidth + 1 && s > min && g < 90) {
      s -= 0.5; el.style.fontSize = s + "px"; g++;
    }
  }

  function scan() {
    var list = document.querySelectorAll(SEL);
    for (var i = 0; i < list.length; i++) {
      var e = list[i], wNow = e.clientWidth;
      if (!wNow) continue;
      /* أعد الملاءمة فقط إن لم تُلائم بعد أو تغيّر عرض الحاوية (دوران/مقاس) */
      if (e.dataset.fitW === String(wNow)) continue;
      e.dataset.fitW = String(wNow);
      (function (el) {
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            fit(el, parseFloat(el.dataset.fitMax) || 16, parseFloat(el.dataset.fitMin) || 10);
          });
        });
      })(e);
    }
  }

  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    setTimeout(function () { pending = false; scan(); }, 180);
  }

  function boot() {
    scan();
    if (w.MutationObserver)
      new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    w.addEventListener("resize", schedule);
    if (w.visualViewport) w.visualViewport.addEventListener("resize", schedule);
  }

  w.AutoFit = { fit: fit, scan: scan };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 200); });
  else setTimeout(boot, 200);
})(window);
