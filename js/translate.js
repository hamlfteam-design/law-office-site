// ============================================================
// ترجمة تلقائية للموقع بالكامل (Google Website Translator)
// لو الزائر متصفحه بالإنجليزي، الموقع بيتحول تلقائياً للإنجليزي
// (بما فيها المقالات) من غير أي تدخل يدوي.
// ============================================================

function googleTranslateElementInit() {
  new google.translate.TranslateElement(
    {
      pageLanguage: "ar",
      includedLanguages: "en,ar",
      autoDisplay: false,
      layout: google.translate.TranslateElement.InlineLayout.SIMPLE,
    },
    "google_translate_element"
  );
}

(function () {
  try {
    var wantsEnglish =
      navigator.language && navigator.language.toLowerCase().indexOf("en") === 0;
    var hasCookie = document.cookie.indexOf("googtrans") !== -1;
    var alreadyTried = sessionStorage.getItem("hamlfTranslateAttempted");
    if (wantsEnglish && !hasCookie && !alreadyTried) {
      sessionStorage.setItem("hamlfTranslateAttempted", "1");
      document.cookie = "googtrans=/ar/en; path=/";
      location.reload();
    }
  } catch (e) {
    /* تجاهل — الترجمة التلقائية ميزة إضافية، لو فشلت الموقع يفضل شغال بالعربي عادي */
  }
})();

// ============================================================
// حماية أسماء الأشخاص من سوء ترجمة جوجل التلقائية
// (مثال: "أمنية" كانت بتتترجم "wish" بدل ما تفضل اسم علم)
// أي عنصر عليه data-name-en هيتبدل تلقائياً بالنص الإنجليزي
// الصحيح لما الصفحة تتحول للإنجليزية، ويرجع للعربي الأصلي تاني
// لو المستخدم رجّع الصفحة عربي.
// ============================================================
(function () {
  function isPageEnglish() {
    return (
      document.documentElement.classList.contains("translated-ltr") ||
      document.cookie.indexOf("googtrans=/ar/en") !== -1
    );
  }

  function applyNameOverrides() {
    var english = isPageEnglish();
    var nodes = document.querySelectorAll("[data-name-en]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!el.dataset.nameAr) {
        el.dataset.nameAr = el.textContent;
      }
      el.textContent = english ? el.getAttribute("data-name-en") : el.dataset.nameAr;
    }
  }

  try {
    applyNameOverrides();
    var observer = new MutationObserver(applyNameOverrides);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    window.addEventListener("load", function () {
      setTimeout(applyNameOverrides, 1200);
      setTimeout(applyNameOverrides, 3000);
    });
  } catch (e) {
    /* تجاهل — لو فشلت الحماية دي، الموقع يفضل شغال عادي */
  }
})();
