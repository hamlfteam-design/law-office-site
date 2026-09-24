/* =============================================================================
   ورق المؤسسة لبوابة الموكلين — نفس صورة الخلفية (ترويسة + علامة مائية +
   تذييل برقم الصفحة) المستخدمة في تقارير التطبيق نفسها، حتى تطابق أي PDF
   يحمّله الموكل من البوابة شكل التقرير اللي يستلمه من المكتب بالظبط.
   ============================================================================= */
(function (w) {
  "use strict";
  var me = document.currentScript && document.currentScript.src;
  /* الصفحات الإنجليزية (/en/) تستعمل ورق المؤسسة بترويسة إنجليزية (الشعار فقط يبقى) */
  var EN = /\/en\//.test(location.pathname);
  var FILE = EN ? "officepaper_en.jpg" : "officepaper.jpg";
  var PAPER_SRC = me ? new URL("../images/letterhead/" + FILE, me).href : "../assets/images/letterhead/" + FILE;
  var _paper = null;
  function preload() {
    if (_paper) return;
    var im = new Image();
    im.onload = function () { _paper = im; };
    im.src = PAPER_SRC;
  }
  w.Letterhead = { on: function () { return true; }, img: function () { return null; }, paper: function () { return _paper; } };
  preload();
})(window);
