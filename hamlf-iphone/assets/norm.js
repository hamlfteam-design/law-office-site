/* =============================================================================
   تطبيع النص العربي — الدالة الوحيدة في التطبيق كله (مهمة 19).
   يتجاهل: التشكيل والتطويل، الفروق بين أ/إ/آ/ٱ/ا، ى/ي، ة/ه، ؤ/و، ئ/ي، الهمزة المفردة،
   ويوحّد الأرقام العربية/الفارسية إلى لاتينية، ويقلّص المسافات، ويحوّل لحروف صغيرة.
   كل الوحدات تستدعي window.lawyerNorm — لا تُنسَخ هذه الدالة في أي مكان آخر.
   ============================================================================= */
(function (w) {
  "use strict";
  function norm(t) {
    return String(t == null ? "" : t)
      .replace(/[\u0660-\u0669]/g, function (d) { return d.charCodeAt(0) - 0x0660; })
      .replace(/[\u06F0-\u06F9]/g, function (d) { return d.charCodeAt(0) - 0x06F0; })
      .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
      .replace(/[\u0623\u0625\u0622\u0671]/g, "\u0627")
      .replace(/\u0624/g, "\u0648")
      .replace(/\u0626/g, "\u064A")
      .replace(/\u0621/g, "")
      .replace(/\u0649/g, "\u064A")
      .replace(/\u0629/g, "\u0647")
      .replace(/\s+/g, " ")
      .trim().toLowerCase();
  }
  w.lawyerNorm = norm;

  /* التاريخ الهجري (أم القرى) — من مكتبة المتصفح نفسها، من غير جداول.
     opts.month = اسم الشهر والسنة بس. "" لو الجهاز ما يدعمش. */
  w.lawyerHijri = function (d, opts) {
    try {
      if (!(d instanceof Date)) d = new Date(String(d).slice(0, 10) + "T12:00:00");
      if (isNaN(d)) return "";
      var o = (opts && opts.month) ? { month: "long", year: "numeric" } : { day: "numeric", month: "long", year: "numeric" };
      return new Intl.DateTimeFormat("ar-EG-u-ca-islamic-umalqura", o).format(d);
    } catch (e) { return ""; }
  };
})(window);
