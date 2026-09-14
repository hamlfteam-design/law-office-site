// ============================================================
// ترجمة اختيارية للموقع (Google Website Translator)
// اللغة العربية هي اللغة الأساسية والثابتة للموقع دايماً.
// الموقع مبيبدّلش اللغة تلقائياً على حسب لغة المتصفح — الترجمة
// بتحصل بس لما الزائر يضغط بنفسه على زرار EN في الهيدر.
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

// ============================================================
// تصحيح لزوار قدامى اتأثروا بمشكلة قديمة كانت بتبدّل اللغة تلقائياً:
// لو لقينا كوكي googtrans=/ar/en من غير أي طلب صريح من المستخدم
// دلوقتي، بنشيله ونرجّع الصفحة عربي (مرة واحدة بس لكل جلسة).
// ============================================================
(function () {
  try {
    var hasOldAutoCookie = document.cookie.indexOf("googtrans=/ar/en") !== -1;
    var alreadyReset = sessionStorage.getItem("hamlfArResetDone");
    if (hasOldAutoCookie && !alreadyReset) {
      sessionStorage.setItem("hamlfArResetDone", "1");
      document.cookie = "googtrans=/ar/ar; path=/";
      document.cookie =
        "googtrans=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      location.reload();
    }
  } catch (e) {
    /* تجاهل */
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
