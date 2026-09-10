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
