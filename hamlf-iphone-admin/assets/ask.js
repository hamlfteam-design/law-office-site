/* =============================================================================
   لوحة تأكيد داخل الصفحة — بديل confirm() في الأفعال المدمِّرة.

   نافذة أندرويد القياسية أزرارها صغيرة متلاصقة، وضغطة خاطئة عليها تحذف
   السجل فوراً بلا تراجع — وهذا وقع فعلاً أثناء اختبار زر حذف التوكيل.

   هنا زرّان كبيران متباعدان، الحذف أحمر في أسفل اللوحة والإلغاء فوقه،
   بينهما فاصل، والافتراضي هو الإلغاء: الضغط على الخلفية أو زر الرجوع
   يُلغي. ونصّ السجل المستهدف مكتوب في اللوحة حتى يراه المستخدم قبل أن
   يقرّر.

   الاستعمال — بردّ نداء لا بقيمة راجعة، لأن اللوحة غير حاصرة:
     Ask.confirm("حذف هذا السجل؟", { detail: "…", ok: "حذف" }, function () {
       ...الحذف هنا...
     });
   ============================================================================= */
(function (w) {
  "use strict";

  function el(tag, css, txt) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (txt != null) e.textContent = txt;
    return e;
  }

  /**
   * @param {string}   message  السؤال
   * @param {object}   opts     { detail, ok, cancel, danger }
   * @param {function} onOk     يُنادى عند التأكيد فقط
   * @param {function} [onCancel]
   */
  function confirmSheet(message, opts, onOk, onCancel) {
    opts = opts || {};
    var danger = opts.danger !== false;          /* الافتراضي: فعل مدمِّر */

    var back = el("div",
      "position:fixed;inset:0;background:rgba(20,14,8,.66);z-index:10050;" +
      "display:flex;align-items:flex-end;justify-content:center");
    back.setAttribute("data-modal", "1");
    back.setAttribute("data-nosave", "1");

    var box = el("div",
      "background:var(--card,#fffdf8);border-radius:18px 18px 0 0;" +
      "padding:22px 18px 26px;width:100%;max-width:560px;direction:rtl;" +
      "color:var(--text);max-height:88vh;overflow-y:auto;" +
      "box-shadow:0 -8px 40px rgba(0,0,0,.3)");

    box.appendChild(el("div",
      "font-family:var(--f-title);font-size:18px;line-height:1.9;margin-bottom:8px",
      message));

    if (opts.detail) {
      box.appendChild(el("div",
        "font-size:14px;color:var(--muted);line-height:1.95;background:var(--bg,#f4ece0);" +
        "padding:12px 14px;border-radius:11px;margin-bottom:6px;word-break:break-word",
        opts.detail));
    }

    if (danger) {
      box.appendChild(el("div",
        "font-size:13px;color:#b3261e;line-height:1.9;margin:10px 2px 0",
        "لا يمكن التراجع عن هذا الإجراء."));
    }

    function big(label, css) {
      var b = el("button", null, label);
      b.type = "button";
      b.style.cssText =
        "width:100%;min-height:60px;padding:16px;border-radius:13px;" +
        "font-family:inherit;font-size:17px;font-weight:600;" + css;
      return b;
    }

    /* الإلغاء أولاً وأقرب إلى الإبهام، والحذف تحته بفاصل واضح */
    var cancel = big(opts.cancel || "إلغاء",
      "border:1px solid var(--line,#ddd);background:transparent;color:var(--text);" +
      "margin-top:20px");

    var sep = el("div",
      "height:1px;background:var(--line,#eee);margin:16px 2px 14px");

    var ok = big(opts.ok || "حذف",
      danger
        ? "border:0;background:#b3261e;color:#fff"
        : "border:0;background:var(--brand);color:#fff");

    var closed = false;
    function close(run) {
      if (closed) return;
      closed = true;
      back.remove();
      document.removeEventListener("keydown", onKey, true);
      if (run) onOk();
      else if (onCancel) onCancel();
    }

    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); close(false); }
    }

    cancel.onclick = function () { close(false); };
    ok.onclick     = function () { close(true); };

    box.appendChild(cancel);
    box.appendChild(sep);
    box.appendChild(ok);

    back.appendChild(box);
    back.onclick = function (e) { if (e.target === back) close(false); };
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(raise(back));

    /* زر الرجوع في أندرويد يُلغي اللوحة ولا يخرج من الشاشة */
    back.__lawyerDismiss = function () { close(false); return true; };

    setTimeout(function () { cancel.focus(); }, 60);
    return back;
  }

  /* ---------------------------------------------- الطبقة العليا لأي نافذة
     أي نافذة بتتفتح (تأكيد حذف، تعديل، شاشة القص…) لازم تطلع قدّام الصفحة
     اللي اتفتحت منها. قبل كده رسالة «حذف الصورة» وشاشة القص كانوا بيتفتحوا
     ورا صفحة الموكل: زرار الميكروفون (z=100000) ومؤشر الكيبورد (99999)
     كانوا بيتحسبوا ضمن «أعلى طبقة»، فصفحة الموكل تاخد 100001، والنوافذ
     اللي أرقامها ثابتة (10050/10060) تتفتح وراها والمستخدم يفتكر الزرار
     مش شغال. هنا بنحسب النوافذ بس (data-modal أو طبقة ثابتة ≥ 10000 مغطية
     الشاشة)، وبنفضل تحت الأدوات العايمة (الميكروفون والمؤشر) علشان تفضل
     ظاهرة فوق أي نافذة. وكل نافذة بتتضاف للصفحة بتترفع تلقائياً. */
  var LAYER_MIN = 10000, LAYER_MAX = 99000;
  function isOverlay(e) {
    if (!e || e.nodeType !== 1) return false;
    if (e.getAttribute("data-modal") === "1") return true;
    if (e.getAttribute("data-float") === "1") return false;
    var z = parseInt(e.style.zIndex, 10);
    if (!(z >= LAYER_MIN && z < LAYER_MAX) || e.style.position !== "fixed") return false;
    var r = e.getBoundingClientRect();
    return r.width >= w.innerWidth * 0.8 && r.height >= w.innerHeight * 0.5;
  }
  function topZ(except) {
    var m = LAYER_MIN;
    Array.prototype.forEach.call(document.body ? document.body.children : [], function (e) {
      if (e === except || !isOverlay(e)) return;
      var z = parseInt(getComputedStyle(e).zIndex, 10);
      if (z > m && z < LAYER_MAX) m = z;
    });
    return Math.min(m + 1, LAYER_MAX);
  }
  function raise(el) {                         /* ما بتنزّلش نافذة أعلى أصلاً */
    if (!el || !el.style) return el;
    var cur = parseInt(el.style.zIndex, 10) || 0, t = topZ(el);
    if (cur < t || cur >= LAYER_MAX) el.style.zIndex = String(t);
    return el;
  }
  w.UiLayer = w.UiLayer || { topZ: topZ, raise: raise, isOverlay: isOverlay };
  if (w.MutationObserver && !w.__uiLayerObs) {
    w.__uiLayerObs = new MutationObserver(function (list) {
      list.forEach(function (m) {
        Array.prototype.forEach.call(m.addedNodes, function (n) { if (isOverlay(n)) raise(n); });
      });
    });
    var watch = function () { w.__uiLayerObs.observe(document.body, { childList: true }); };
    if (document.body) watch(); else document.addEventListener("DOMContentLoaded", watch);
  }

  /* Ask قد تكون معرَّفة سلفاً (نافذة الإدخال في mobile.js) — تُضاف إليها
     ولا تُمحى، وأيّهما حُمِّل أولاً لا يفرق. */
  w.Ask = w.Ask || {};
  w.Ask.confirm = confirmSheet;
})(window);
