/* نسخة الآيفون (PWA): تسجيل sw.js علشان التطبيق يفتح من غير نت،
   وتنبيه مرة واحدة لو المحامي فاتح من Safari مش من الأيقونة. */
(function () {
  "use strict";
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(function () { });
  }
  var standalone = window.navigator.standalone === true ||
    (window.matchMedia && matchMedia("(display-mode: standalone)").matches);
  var ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (!ios || standalone) return;
  try { if (sessionStorage.getItem("pwa.hint")) return; sessionStorage.setItem("pwa.hint", "1"); } catch (e) { }
  var d = document.createElement("a");
  d.href = "iphone.html";
  d.textContent = "📲 ثبّت التطبيق على الشاشة الرئيسية — اضغط هنا للخطوات";
  d.style.cssText = "position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:99999;" +
    "background:#0f3d2e;color:#fff;padding:12px 14px;border-radius:12px;text-align:center;font-weight:600;text-decoration:none;box-shadow:0 6px 20px #0004";
  document.addEventListener("DOMContentLoaded", function () {
    document.body.appendChild(d);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 12000);
  });
})();
