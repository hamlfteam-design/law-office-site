/* =============================================================================
   قائمة بحث — نفس سلوك تقويم الجلسات والمواعيد.

   في كل حقل ثلاثة أشياء معاً:
     ▾  سهم يفتح القائمة كاملة للتصفّح
     ⌨  الكتابة تُضيّق المعروض حرفاً بحرف حتى تصل لما تريد
     ✕  إلغاء الاختيار

   القائمة <select> الأصلية تبقى في الصفحة مخفيّة وهي مصدر الحقيقة، حتى لا
   يتأثر ربط المحاكم بالدرجات ولا حفظ السجلات. ولا نعتمد على <datalist>
   لأن عرضه على أندرويد غير متسق ولا يعطي سهماً.
   ============================================================================= */
(function () {
  "use strict";

  var SKIP_VALUES = ["__manual_add__", "__manual_clear__"];
  var MKEY   = "proflawyer.manual.v1";
  var SCREEN = (location.pathname.split("/").pop() || "index").replace(/\.html.*$/, "");
  var openPanel = null;

  /* توحيد الحروف حتى يطابق البحث رغم اختلاف الهمزات والتشكيل */
  function norm(t) { return window.lawyerNorm(t); }

  /* مُوسِّع اختصارات المحاكم/الدوائر — للمطابقة فقط (لا يغيّر البيانات): يوحّد
     «د/٨ س إيجارات» مع «الدائرة الثامنة إيجارات»، ويطابق «استئناف شمال» مع
     «مأمورية استئناف شمال». يُطبَّق على نصٍّ مطبَّع بالفعل (بعد norm). */
  var ORD = {
    "الاولي":"1","الثانيه":"2","الثالثه":"3","الرابعه":"4","الخامسه":"5",
    "السادسه":"6","السابعه":"7","الثامنه":"8","التاسعه":"9","العاشره":"10",
    "الحاديه عشر":"11","الثانيه عشر":"12","الثالثه عشر":"13","الرابعه عشر":"14",
    "الخامسه عشر":"15","السادسه عشر":"16","السابعه عشر":"17","الثامنه عشر":"18",
    "التاسعه عشر":"19","العشرين":"20"
  };
  function expandAbbr(s) {
    s = " " + s + " ";
    s = s.replace(/الدائره|دائره/g, " د ")             /* الدائرة → د */
         .replace(/د ?\/ ?/g, " د ")                   /* د/ → د (بلا \b — العربي) */
         .replace(/ماموريه|مموريه/g, " ")              /* مأمورية → حذف */
         .replace(/\s+/g, " ");
    Object.keys(ORD).sort(function (a, b) { return b.length - a.length; })   /* الأطول أولاً */
      .forEach(function (k) {                          /* الترتيب → رقم (حدود مسافات) */
        s = s.replace(new RegExp("(?<= )" + k + "(?= )", "g"), " " + ORD[k] + " ").replace(/\s+/g, " ");
      });
    s = s.replace(/(?<= )س(?= )/g, " ")               /* «س» درجة → حذف */
         .replace(/\s+/g, " ").trim();
    return s;
  }

  function realOptions(sel) {
    return Array.prototype.filter.call(sel.options, function (o) {
      if (SKIP_VALUES.indexOf(o.value) >= 0) return false;
      if (o.disabled) return false;
      if (!o.value && /^\s*—/.test(o.textContent)) return false;   // «— اختر —»
      return o.textContent.trim() !== "";
    });
  }

  function skip(sel) {
    if (sel.id === "__recs" || sel.multiple) return true;
    if (sel.hasAttribute("data-no-combo")) return true;
    /* حقلٌ مُلزَم بالبحث التوليدي حتى لو قصُرت قائمته (المحاكم والدوائر) */
    if (sel.getAttribute("data-combo") === "1") return false;

    /* data-nosave يمنع حفظ الحقل مع سجل الشاشة — ونوافذ التحرير كلها
       تحمله. لكن قوائمها تحتاج البحث بالكتابة كغيرها، فلا تُتخطّى. */
    if (sel.closest("[data-nosave]") && !sel.closest("[data-modal]")) return true;

    return realOptions(sel).length < 6;      // القوائم القصيرة أوضح كما هي
  }

  /* ترتيب أبجدي عربي، مع تثبيت «الإضافة اليدوية» آخراً */
  function alpha(options) {
    return options.slice().sort(function (a, b) {
      var am = a.value === "__manual__", bm = b.value === "__manual__";
      if (am !== bm) return am ? 1 : -1;
      return a.textContent.trim().localeCompare(b.textContent.trim(), "ar");
    });
  }

  function remember(sel, val) {
    var all;
    try { all = JSON.parse(localStorage.getItem(MKEY)) || {}; } catch (e) { all = {}; }
    var k = SCREEN + "|" + (sel.id || sel.name || "?");
    if (!all[k]) all[k] = [];
    if (all[k].indexOf(val) < 0) all[k].push(val);
    try { localStorage.setItem(MKEY, JSON.stringify(all)); } catch (e) { }
  }

  /* ------------------------------------------------------------------ بناء */

  function upgrade(sel) {
    if (sel.dataset.comboed || skip(sel)) return;
    sel.dataset.comboed = "1";

    /* استرجاع القيم اليدوية المحفوظة سابقاً لهذا الحقل وإضافتها كخيارات دائمة —
       فما يُدرَج يدوياً يُسجَّل ويبقى ضمن الخيارات في كل مرة بعدها (كل الحقول). */
    try {
      var _mem = JSON.parse(localStorage.getItem(MKEY)) || {};
      var _mk = SCREEN + "|" + (sel.id || sel.name || "?");
      (_mem[_mk] || []).forEach(function (v) {
        if (![].some.call(sel.options, function (o) { return o.value === v; })) {
          var o = document.createElement("option");
          o.value = v; o.textContent = v;
          sel.appendChild(o);
        }
      });
    } catch (e) { }

    /* ⚠️ الصندوق لا يحمل data-nosave: القائمة المخفية بداخله هي ما يحفظه
       data.js، ووسمُ الصندوق كان يستثنيها فتضيع كل الاختيارات عند الحفظ.
       نضع الوسم على العناصر المساعدة فقط. */
    var box = document.createElement("div");
    box.className = "combo";
    box.style.cssText = "position:relative;display:block;width:100%";

    var inp = document.createElement("input");
    inp.type = "text";
    inp.autocomplete = "off";
    inp.setAttribute("lang", "ar");
    inp.setAttribute("dir", "rtl");
    inp.placeholder = "اختر أو اكتب للبحث…";
    inp.setAttribute("data-nosave", "1");
    inp.className = "combo-input";

    /* تمديد تلقائي: يصغّر خط القيمة حتى تحتويها مساحة الحقل بلا انزلاقٍ تحت
       زرَّي السهم والمسح (قاعدة الاحتواء المعتمدة). لا يُطبَّق أثناء الكتابة. */
    var _fitCv = null;
    function fitInput() {
      if (document.activeElement === inp) return;
      var v = inp.value || "";
      if (!v) { inp.style.fontSize = "16px"; return; }
      var cs = window.getComputedStyle(inp);
      var avail = inp.clientWidth -
        (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
      if (avail <= 6) { setTimeout(fitInput, 70); return; }
      if (!_fitCv) _fitCv = document.createElement("canvas").getContext("2d");
      var size = 16, g = 0;
      function wide(sz) { _fitCv.font = sz + "px " + cs.fontFamily; return _fitCv.measureText(v).width; }
      while (wide(size) > avail && size > 10 && g < 40) { size -= 0.5; g++; }
      inp.style.fontSize = size + "px";
    }

    function sideBtn(label, offset, size, wdt) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.setAttribute("data-nosave", "1");
      b.className = "combo-btn";
      b.style.left = offset + "px";
      b.style.width = (wdt || 40) + "px";
      b.style.fontSize = size + "px";
      return b;
    }

    /* زرّان أضيق (٢٨px) ليتّسع الحقل الضيّق للبيان بلا انزلاقٍ تحتهما */
    var arrow = sideBtn("▾", 2, 18, 28);   arrow.setAttribute("aria-label", "فتح القائمة");
    var clr   = sideBtn("✕", 30, 15, 28);  clr.setAttribute("aria-label", "إلغاء الاختيار");

    /* اللوحة ثابتة (fixed) لا مطلقة — كي لا يقصّها تمرير الكارت وتتمرّر بذاتها */
    var panel = document.createElement("div");
    panel.setAttribute("data-nosave", "1");
    panel.className = "combo-panel";
    panel.style.cssText =
      /* z-index فوق كل النوافذ والطبقات (تعديل القضية ١٠٠٦١ · مرفقات ١٠٠٨٠ ·
         مشاركة ١٠٠٩٠) وإلا ظهرت اللوحة خلف النافذة فلا تُرى وهي تُضيّق. */
      "position:fixed;z-index:100000;background:#fff;border:1px solid #ddd4c8;border-radius:10px;" +
      "overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;" +
      "max-height:min(46vh,300px);box-shadow:0 8px 26px rgba(60,40,20,.22);display:none";

    /* المساحة المرئية الحقيقية — visualViewport ينكمش مع ظهور لوحة المفاتيح،
       بعكس innerHeight الذي يبقى ثابتاً فتُفتح اللوحة تحت الكيبورد فلا تُرى. */
    function vp() {
      var v = window.visualViewport;
      return v ? { top: v.offsetTop || 0, height: v.height }
               : { top: 0, height: window.innerHeight || document.documentElement.clientHeight };
    }

    function positionPanel() {
      var r = inp.getBoundingClientRect();
      var v = vp();
      var visTop = v.top, visBottom = v.top + v.height;
      var maxH = Math.min(300, v.height * 0.6);
      panel.style.left = r.left + "px";
      panel.style.width = r.width + "px";
      var below = visBottom - r.bottom;      /* حيّز مرئي أسفل الحقل (فوق الكيبورد) */
      var above = r.top - visTop;            /* حيّز مرئي أعلى الحقل */
      if (below < Math.min(maxH, 160) && above > below) {   /* افتح لأعلى */
        panel.style.top = "auto";
        panel.style.bottom = ((window.innerHeight || 0) - r.top + 4) + "px";
        panel.style.maxHeight = Math.max(120, Math.min(maxH, above - 8)) + "px";
      } else {                                              /* افتح لأسفل */
        panel.style.bottom = "auto";
        panel.style.top = (r.bottom + 4) + "px";
        panel.style.maxHeight = Math.max(120, Math.min(maxH, below - 8)) + "px";
      }
    }

    /* يرفع الحقل إلى أعلى المساحة المرئية كي لا يغطّيه الكيبورد وتظهر
       الاقتراحات تحته في الحيّز المرئي — يُنادى عند التركيز وعند ظهور الكيبورد. */
    function ensureVisible() {
      var r = inp.getBoundingClientRect();
      var v = vp();
      var want = v.top + Math.min(140, v.height * 0.18);   /* ثُلث علوي مريح */
      var delta = r.top - want;
      if (Math.abs(delta) < 24) return;
      var sc = inp.closest("[data-modal],.sheet,.modal,.box") || document.scrollingElement || document.documentElement;
      /* مرّر أقرب حاوية قابلة للتمرير */
      var node = inp.parentNode;
      while (node && node !== document.body) {
        var st = getComputedStyle(node);
        if (/(auto|scroll)/.test(st.overflowY) && node.scrollHeight > node.clientHeight) {
          node.scrollTop += delta; return;
        }
        node = node.parentNode;
      }
      if (sc && sc.scrollBy) sc.scrollBy(0, delta);
      else window.scrollBy(0, delta);
    }

    sel.parentNode.insertBefore(box, sel);
    box.appendChild(inp);
    box.appendChild(arrow);
    box.appendChild(clr);
    box.appendChild(sel);
    sel.style.display = "none";

    /* اللوحة تُلحَق بـ body مباشرةً لا داخل box: .phone على التابلت تحمل
       zoom (app.css) وأي position:fixed داخل حاوية بها zoom يتموضع
       بالنسبة لمربّعها المكبَّر لا بالنسبة للشاشة الفعلية في WebView —
       فتظهر اللوحة منزاحة لأسفل ومتراكبة مع حقول أخرى. إلحاقها بـ body
       يُخرجها من تأثير الـ zoom فتتموضع بإحداثيات الشاشة الحقيقية. */
    document.body.appendChild(panel);
    sel.setAttribute("data-no-manual", "1");

    var quiet = false;
    var blurTimer = null;
    /* لمس اللوحة (تمرير أو نقر) يلغي إغلاقها المؤجَّل بسبب فقد التركيز */
    panel.addEventListener("pointerdown", function () {
      if (blurTimer) { clearTimeout(blurTimer); blurTimer = null; }
    });

    function setSel(v) {
      if (sel.value === v) return;
      sel.value = v;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function label() {
      var o = sel.selectedOptions[0];
      var t = o ? o.textContent.trim() : "";
      return /^—/.test(t) ? "" : t;
    }

    function syncInput() {
      if (document.activeElement === inp) return;   // لا تقاطع الكتابة
      var t = label();
      if (inp.value !== t) inp.value = t;
      if (window.requestAnimationFrame)
        requestAnimationFrame(function () { requestAnimationFrame(fitInput); });
      else setTimeout(fitInput, 40);
    }

    /* ------------------------------------------------------------ اللوحة */

    function close() {
      panel.style.display = "none";
      arrow.textContent = "▾";
      if (openPanel === close) openPanel = null;
    }

    function render(filter) {
      var q = norm(filter), qe = expandAbbr(q);
      var list = alpha(realOptions(sel));
      var shown = q ? list.filter(function (o) {
                    var t = norm(o.textContent);
                    return t.indexOf(q) >= 0 || expandAbbr(t).indexOf(qe) >= 0;
                  }) : list;

      panel.textContent = "";

      if (!shown.length) {
        var none = document.createElement("div");
        none.style.cssText = "padding:14px;color:#7d7166;font-size:13.5px;text-align:center";
        none.textContent = "لا يوجد ما يطابق «" + filter + "»";
        panel.appendChild(none);

        var addNew = document.createElement("button");
        addNew.type = "button";
        addNew.textContent = "＋ إضافة «" + filter.trim() + "» كقيمة جديدة";
        addNew.style.cssText =
          "display:block;width:100%;padding:13px;border:0;border-top:1px solid #efe7db;" +
          "background:#f7f2e9;color:#5b3a21;font-family:inherit;font-size:14px;" +
          "text-align:center;min-height:46px";
        var asy = 0, amv = false;
        addNew.addEventListener("pointerdown", function (e) { asy = e.clientY; amv = false; });
        addNew.addEventListener("pointermove", function (e) {
          if (Math.abs(e.clientY - asy) > 8) amv = true;
        });
        addNew.addEventListener("pointerup", function (e) {
          if (amv) return;
          e.preventDefault();
          var v = filter.trim();
          if (!v) return;
          /* يُحفظ في المرجع الرسمي للحقل إن عرّف onAdd (المحاكم/الدوائر)،
             وإلا في المخزن العام — فيظهر في كل مرة بعدها. */
          if (typeof sel._onAdd === "function") sel._onAdd(v);
          else remember(sel, v);
          if (![].some.call(sel.options, function (o) { return o.value === v; })) {
            var o = document.createElement("option");
            o.value = v; o.textContent = v; o.dataset.manual = "1";
            sel.appendChild(o);
          }
          setSel(v);
          inp.value = v;
          close();
        });
        panel.appendChild(addNew);
        return;
      }

      shown.forEach(function (o) {
        var row = document.createElement("button");
        row.type = "button";
        var on = (o.value === sel.value);
        row.style.cssText =
          "display:block;width:100%;text-align:right;padding:13px 14px;border:0;" +
          "border-bottom:1px solid #f4efe6;font-family:inherit;font-size:15px;" +
          "min-height:48px;direction:rtl;" +
          "background:" + (on ? "#f2e9db" : "#fff") + ";" +
          "color:#3d2614;font-weight:" + (on ? "600" : "400");
        row.textContent = o.textContent.trim();
        /* الاختيار عند نقرةٍ حقيقية فقط — إن حرّك إصبعه فهو تمرير لا اختيار،
           فيعمل السحب/الاسكرول بلا اختيارٍ خاطئ. */
        var sy0 = 0, movd = false;
        row.addEventListener("pointerdown", function (e) { sy0 = e.clientY; movd = false; });
        row.addEventListener("pointermove", function (e) {
          if (Math.abs(e.clientY - sy0) > 8) movd = true;
        });
        row.addEventListener("pointerup", function (e) {
          if (movd) return;
          e.preventDefault();
          setSel(o.value);
          inp.value = o.textContent.trim();
          close();
        });
        panel.appendChild(row);
      });
    }

    function open(filter) {
      if (sel.disabled) return;
      if (openPanel && openPanel !== close) openPanel();
      render(filter || "");
      panel.style.display = "block";
      positionPanel();
      panel.scrollTop = 0;
      arrow.textContent = "▴";
      openPanel = close;
      /* أعد وضع اللوحة عند تمرير أي حاوية (اللوحة ثابتة فلا تتبع الكارت) */
      if (!panel._onScroll) {
        panel._onScroll = function () { if (panel.style.display === "block") positionPanel(); };
        window.addEventListener("scroll", panel._onScroll, true);
        window.addEventListener("resize", panel._onScroll);
        /* ظهور/إخفاء لوحة المفاتيح يغيّر المساحة المرئية — أعد الموضعة فوراً */
        if (window.visualViewport) {
          window.visualViewport.addEventListener("resize", panel._onScroll);
          window.visualViewport.addEventListener("scroll", panel._onScroll);
        }
      }
      /* نقرة خارج الحقل واللوحة تُغلق القائمة (حتى بعد التمرير وفقد التركيز) */
      if (!panel._onDocDown) {
        panel._onDocDown = function (e) {
          if (panel.style.display !== "block") return;
          if (box.contains(e.target) || panel.contains(e.target)) return;
          close();
        };
        document.addEventListener("pointerdown", panel._onDocDown, true);
      }
    }

    /* ------------------------------------------------------------ الأحداث */

    arrow.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      if (panel.style.display === "block") { close(); return; }
      inp.focus();
      open("");                       // السهم يعرض القائمة كاملة
    });

    clr.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      quiet = true;
      inp.value = "";
      setSel("");
      quiet = false;
      close();
      inp.blur();
    });

    inp.addEventListener("focus", function () {
      inp.style.fontSize = "16px";
      open(inp.value);
      /* الكيبورد يظهر بعد لحظة — نرفع الحقل ونعيد وضع اللوحة مرّتين لنطابق انكماش
         الشاشة، كي يظهر الحقل والاقتراحات فوق لوحة المفاتيح لا تحتها. */
      setTimeout(function () { ensureVisible(); positionPanel(); }, 120);
      setTimeout(function () { ensureVisible(); positionPanel(); }, 350);
    });
    inp.addEventListener("input", function () { open(inp.value); });

    /* الخروج من الحقل: اعتمد ما كُتب — مطابقة تامة، ثم وحيدة مطابقة جزئياً */
    inp.addEventListener("blur", function () {
      blurTimer = setTimeout(function () {
        blurTimer = null;
        if (quiet) return;
        if (panel.style.display === "block") close();

        var typed = inp.value.trim();
        if (!typed) { setSel(""); return; }

        var n = norm(typed), list = realOptions(sel);
        var exact = list.filter(function (o) { return norm(o.textContent) === n; })[0];
        if (exact) { setSel(exact.value); inp.value = exact.textContent.trim(); return; }

        var part = list.filter(function (o) { return norm(o.textContent).indexOf(n) >= 0; });
        if (part.length === 1) { setSel(part[0].value); inp.value = part[0].textContent.trim(); return; }

        /* قيمة جديدة تماماً: لا تُضاف تلقائياً بمجرد الخروج من الحقل —
           كانت أي كتابة عابرة (خطأ مطبعي، لصق جزئي) تتحول فوراً لعنصر
           دائم في القائمة (خصوصاً درجة التقاضي والمحكمة) فتتراكم بيانات
           دخيلة لا علاقة لها بالحقل. الإضافة الآن فعلٌ صريح وحده: زر
           "＋ إضافة كقيمة جديدة" في لوحة النتائج الفارغة. هنا فقط تُرجَع
           القيمة إلى آخر اختيار صحيح. */
        syncInput();
      }, 140);
    });

    sel.addEventListener("change", syncInput);

    /* القوائم المرتبطة يُعاد بناء خياراتها برمجياً */
    new MutationObserver(function () {
      syncInput();
      if (panel.style.display === "block") render(inp.value);
    }).observe(sel, { childList: true });

    function applyDisabled() {
      inp.disabled  = sel.disabled;
      arrow.style.opacity = clr.style.opacity = sel.disabled ? ".35" : "1";
      inp.style.background = sel.disabled ? "#f4f0e8" : "#fff";
      inp.placeholder = sel.disabled
        ? (sel.options[0] ? sel.options[0].textContent.replace(/—/g, "").trim() : "غير متاح")
        : "اختر أو اكتب للبحث…";
      if (sel.disabled) close();
    }
    new MutationObserver(applyDisabled)
      .observe(sel, { attributes: true, attributeFilter: ["disabled"] });

    applyDisabled();
    syncInput();
  }

  /* أي ضغطة خارج اللوحة والحقل تغلقها — لكن الضغط داخل اللوحة (اختيار نتيجة) لا يُغلق.
     اللوحة مُلحَقة بـ body لا داخل .combo، فبدون استثناء .combo-panel كان الضغط على
     النتيجة يُغلق اللوحة (في مرحلة الالتقاط) قبل تنفيذ الاختيار — فلا يُختار إلا بـTab. */
  document.addEventListener("pointerdown", function (e) {
    if (openPanel && !e.target.closest(".combo") && !e.target.closest(".combo-panel")) openPanel();
  }, true);

  /* ---------------------------------------------------------------- إقلاع */

  function scan() { document.querySelectorAll("select").forEach(upgrade); }

  function boot() {
    scan();
    var pending = false;
    new MutationObserver(function () {
      if (pending) return;
      pending = true;
      setTimeout(function () { pending = false; scan(); }, 220);
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 220); });
  } else { setTimeout(boot, 220); }
})();
