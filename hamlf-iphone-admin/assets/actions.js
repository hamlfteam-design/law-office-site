/* =============================================================================
   توصيل أزرار الحفظ والطباعة والتفريغ.

   إحدى عشرة شاشة (الأتعاب · المصروفات · العقود · الأجر · المرتبات · التقييم ·
   الإقامات · التصاريح · الفيزات · إنهاء الخدمة …) لم يكن بها أي جافاسكريبت،
   فكانت أزرارها الرئيسية شكلاً بلا وظيفة: تضغط «حفظ البيانات» فلا يُحفظ شيء،
   و«طباعة التقرير» فلا يُطبع شيء.

   هنا نوصّلها بما هو موجود فعلاً:
     · «حفظ …»  → زر الحفظ في شريط السجلات الذي يبنيه data.js
     · «طباعة …» → حوار الطباعة في أندرويد (ومنه «حفظ بصيغة PDF»)
     · «تفريغ»   → «سجل جديد»
   ============================================================================= */
(function (w) {
  "use strict";

  var SAVE  = /^(حفظ|إضافة المصروف|إصدار|إنهاء الإجراءات|اعتماد|تسجيل)/;
  var PRINT = /طباعة|🖨/;
  var CLEAR = /^(تفريغ|مسح الحقول)/;
  var CALC  = /^(حساب|احسب)/;

  function toolbarBtn(label) {
    var bar = document.querySelector(".modebar");
    if (!bar) return null;
    var list = bar.querySelectorAll("button");
    for (var i = 0; i < list.length; i++) {
      if (list[i].textContent.trim() === label) return list[i];
    }
    return null;
  }

  function toast(msg, bad) {
    if (w.PL && w.PL.toast) { w.PL.toast(msg, "", bad ? "urgent" : ""); return; }
    var t = document.createElement("div");
    t.setAttribute("data-nosave", "1");
    t.style.cssText =
      "position:fixed;left:50%;transform:translateX(-50%);bottom:110px;z-index:9999;" +
      "background:" + (bad ? "#8c1d18" : "#2f5d3f") + ";color:#fff;padding:11px 18px;" +
      "border-radius:10px;font-size:14px;max-width:86%;text-align:center;" +
      "box-shadow:0 4px 16px rgba(0,0,0,.28)";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }

  function doPrint(label) {
    if (typeof AndroidSaver !== "undefined" && AndroidSaver.printPage) {
      AndroidSaver.printPage(label || document.title);
      return;
    }
    w.print();
  }

  function wire() {
    document.querySelectorAll("main button").forEach(function (b) {
      if (b.dataset.actionWired) return;
      if (b.closest("[data-nosave]")) return;
      if (b.hasAttribute("data-add") || b.hasAttribute("data-addrow") ||
          b.hasAttribute("data-addlevel") || b.hasAttribute("data-sound-toggle") ||
          b.hasAttribute("data-sound-test")) return;
      if (b.onclick) return;                       // له معالج بالفعل

      var txt = (b.textContent || "").trim();
      if (!txt) return;

      if (PRINT.test(txt)) {
        b.dataset.actionWired = "1";
        b.onclick = function () { doPrint(txt.replace(/[🖨📧]/g, "").trim()); };
        return;
      }

      if (SAVE.test(txt)) {
        b.dataset.actionWired = "1";
        b.onclick = function () {
          var s = toolbarBtn("حفظ");
          if (!s) { toast("لا يوجد سجل لحفظه في هذه الشاشة", true); return; }
          s.click();
          toast("تم الحفظ");
        };
        return;
      }

      if (CLEAR.test(txt)) {
        b.dataset.actionWired = "1";
        b.onclick = function () {
          var n = toolbarBtn("سجل جديد");
          if (!n) { toast("لا شيء لتفريغه", true); return; }
          n.click();
          toast("أُفرغت الحقول");
        };
        return;
      }

      /* أزرار الحساب: تُطلق حدث input فتعمل معادلات app.js */
      if (CALC.test(txt)) {
        b.dataset.actionWired = "1";
        b.onclick = function () {
          document.querySelectorAll("main input").forEach(function (f) {
            f.dispatchEvent(new Event("input", { bubbles: true }));
          });
          toast("أُعيد الحساب");
        };
      }
    });
  }

  function boot() {
    wire();
    setTimeout(wire, 700);      // شريط data.js يُبنى بعد قليل
    var pending = false;
    new MutationObserver(function () {
      if (pending) return;
      pending = true;
      setTimeout(function () { pending = false; wire(); }, 300);
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else { boot(); }
})(window);
