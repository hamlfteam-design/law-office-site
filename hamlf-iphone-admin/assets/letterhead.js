/* =============================================================================
   §22ب ترويسة المكتب — تظهر أعلى كل مخرَج مطبوع (بيان دعوى/إداري/عرائض/تقارير…).
   الصورة ثابتة (assets/letterhead.jpg)، وتُحمَّل مسبقاً لتُرسَم في الـPDF كذلك.
   يمكن إخفاؤها من الطباعة عبر إعداد محليّ دون حذفها.
   ============================================================================= */
(function (w) {
  "use strict";
  var SRC = "assets/letterhead.jpg?v=1";
  var KEY = "proflawyer.letterhead.on";
  var _img = null;
  /* ورق المؤسسة كاملاً (ترويسة + علامة مائية + تذييل بمربّع رقم الصفحة وQR) — A4 بدقة ١٥٠ */
  var PAPER_SRC = "assets/officepaper.jpg?v=1";
  var _paper = null;

  function on() { try { return localStorage.getItem(KEY) !== "0"; } catch (e) { return true; } }
  function setOn(v) { try { localStorage.setItem(KEY, v ? "1" : "0"); } catch (e) { } }

  function preload() {
    if (_img) return;
    var im = new Image();
    im.onload = function () { _img = im; };
    im.src = SRC;
    var pp = new Image();
    pp.onload = function () { _paper = pp; };
    pp.src = PAPER_SRC;
  }
  function img() { return _img; }
  function paper() { return _paper; }

  /** عنصر <img> للترويسة (HTML) — أو null إن أُخفيت. */
  function htmlHeader() {
    if (!on()) return null;
    var d = document.createElement("div");
    d.style.cssText = "margin-bottom:12px";
    var im = document.createElement("img");
    im.src = SRC;
    im.style.cssText = "width:100%;max-width:760px;display:block;margin:0 auto";
    d.appendChild(im);
    return d;
  }

  w.Letterhead = { on: on, setOn: setOn, preload: preload, img: img, paper: paper, htmlHeader: htmlHeader, SRC: SRC };
  if (document.readyState !== "loading") preload();
  else document.addEventListener("DOMContentLoaded", preload);
})(window);
