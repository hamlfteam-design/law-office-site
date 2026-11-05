/* =============================================================================
   المحامي المحترف — طبقة الموبايل
   تُحمَّل بعد app.js و data.js ولا تعدّل أياً منهما.

   1) كل حقول الكتابة عربية الاتجاه مهما كانت لغة الصفحة
   2) إضافة يدوية لأي قيمة غير موجودة في أي قائمة منسدلة
   3) زر «رجوع» وزر «حفظ» ثابتان في أسفل كل شاشة
   4) نسخة احتياطية: على الجهاز + على التخزين السحابي، مؤرَّخة
      مع تحديث «آخر نسخة» في كل مرة
   ============================================================================= */
(function () {
  "use strict";

  var DB_KEY     = "proflawyer.screens.v1";   // نفس مفتاح data.js
  var MANUAL_KEY = "proflawyer.manual.v1";    // القيم المضافة يدوياً
  var ADD_VALUE   = "__manual_add__";
  var CLEAR_VALUE = "__manual_clear__";
  var SCREEN     = (location.pathname.split("/").pop() || "index").replace(/\.html.*$/, "");

  var hasAndroid = (typeof AndroidSaver !== "undefined");

  /* ------------------------------------------------------------------ أدوات */

  function el(tag, css, txt) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (txt != null) e.textContent = txt;
    return e;
  }

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch (e) { return fallback; }
  }

  function toast(msg, bad) {
    var t = el("div",
      "position:fixed;left:50%;transform:translateX(-50%);bottom:96px;z-index:9999;" +
      "background:" + (bad ? "#8c1d18" : "#2f5d3f") + ";color:#fff;padding:11px 18px;" +
      "border-radius:10px;font-size:14px;max-width:86%;text-align:center;" +
      "box-shadow:0 4px 16px rgba(0,0,0,.28);line-height:1.6", msg);
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 3200);
  }

  function stamp() {
    var d = new Date(), p = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
           "-" + p(d.getHours()) + p(d.getMinutes());
  }

  /* ============================================================ 1) عربي دائماً
     الحقول النصية تُكتب بالعربية مهما كانت لغة الصفحة. ملاحظة: اختيار لغة
     لوحة المفاتيح نفسها بيد نظام أندرويد ولا يستطيع أي تطبيق فرضه — لكن
     الاتجاه والمحاذاة والترتيب تصبح عربية بالكامل.                            */

  /* ---------------------------------------------------- الأرقام عربية دائماً
     لوحة مفاتيح أندرويد تكتب ٠..٩ بالصورة اللاتينية 0..9 مهما كانت لغتها،
     فنحوّلها فور الكتابة إلى الأرقام العربية المستخدمة في المحاكم.
     تُستثنى حقول التاريخ والوقت لأن المتصفح يشترط فيها الصورة اللاتينية.   */

  var AR_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  var NUM_KEY   = "proflawyer.numerals";        // ar | en

  function numerals() {
    try { return localStorage.getItem(NUM_KEY) || "ar"; } catch (e) { return "ar"; }
  }
  function setNumerals(v) {
    try { localStorage.setItem(NUM_KEY, v); } catch (e) { }
  }
  window.lawyerNumerals    = numerals;
  window.lawyerSetNumerals = setNumerals;

  function toArabicDigits(t) {
    return String(t).replace(/[0-9]/g, function (d) { return AR_DIGITS[+d]; });
  }
  function toLatinDigits(t) {
    return String(t).replace(/[٠-٩]/g,
      function (d) { return String(d.charCodeAt(0) - 0x0660); });
  }
  function convert(t) {
    return numerals() === "en" ? toLatinDigits(t) : toArabicDigits(t);
  }
  window.lawyerToLatin = toLatinDigits;

  /* حقول التاريخ والوقت والبريد والتليفون يشترط فيها المتصفح/صحة البيانات
     الصورة اللاتينية — "tel" أُضيف هنا لأن أرقام الهاتف (تُستعمل لإرسال
     واتساب مباشرة عبر wa.me/<رقم>) تنكسر بالأرقام العربية-الهندية تماماً
     مثل الإيميل. راجع [[feedback_arabic_numerals_email_exception]]. */
  function skipDigits(f) {
    var t = (f.getAttribute("type") || "").toLowerCase();
    if (["date", "time", "datetime-local", "month", "week",
         "email", "url", "password", "tel"].indexOf(t) >= 0) return true;
    return f.hasAttribute("data-latin");
  }

  /**
   * حقول type="number" لا تقبل الأرقام العربية إطلاقاً — المتصفح يرفضها
   * ويُفرغ الحقل. لذلك نحوّلها إلى نص مع لوحة مفاتيح رقمية، فتعمل الصورتان.
   */
  function unlockNumberFields(root) {
    (root || document).querySelectorAll('input[type="number"]').forEach(function (f) {
      if (f.dataset.wasNumber) return;
      f.dataset.wasNumber = "1";
      var v = f.value;
      f.setAttribute("type", "text");
      f.setAttribute("inputmode", "numeric");
      f.value = v;
    });
  }

  function digitsOn(root) {
    unlockNumberFields(root);
    (root || document)
      .querySelectorAll('input[type="text"], input[type="search"], input[type="tel"], input:not([type]), textarea')
      .forEach(function (f) {
        if (skipDigits(f)) return;
        if (!f.dataset.arDigits) {
          f.dataset.arDigits = "1";
          f.addEventListener("input", function () {
            var want = convert(f.value);
            if (want === f.value) return;
            var pos = f.selectionStart;
            f.value = want;                    // نفس الطول — الموضع يبقى صحيحاً
            try { f.setSelectionRange(pos, pos); } catch (e) { }
          });
        }
        var w = convert(f.value);
        if (w !== f.value) f.value = w;
      });
  }

  /* ------------------------------------------ أرقام النصوص المعروضة (عامّ)
     كل نص ظاهر في أي شاشة يُحوَّل لأرقام عربية، عدا: الإيميل، أرقام التليفون،
     الروابط، وأي عنصر عليه data-latin / lang="en" / رابط tel: أو wa.me. */
  var TEXT_SKIP = 'script,style,textarea,input,code,pre,[data-latin],[lang="en"],' +
                  'a[href^="tel:"],a[href*="wa.me"],a[href^="mailto:"]';
  function keepLatinToken(tok) {
    if (tok.indexOf("@") >= 0 || /https?:|www\./i.test(tok)) return true;
    if (/^\+?[\d\-]+$/.test(tok)) {
      var d = tok.replace(/\D/g, "");
      if (/^(20|0)\d{8,10}$/.test(d) && tok.replace(/^\+/, "") .length >= 9) return true;
    }
    return false;
  }
  function arabizeText(root) {
    if (numerals() === "en") return;
    var base = root && root.nodeType === 1 ? root : document.body;
    if (!base) return;
    var walker = document.createTreeWalker(base, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = walker.nextNode())) {
      var v = n.nodeValue;
      if (!v || !/[0-9]/.test(v)) continue;
      var pe = n.parentElement;
      if (!pe || pe.closest(TEXT_SKIP)) continue;
      var out = v.replace(/\S+/g, function (tok) {
        return /[0-9]/.test(tok) && !keepLatinToken(tok) ? toArabicDigits(tok) : tok;
      });
      if (out !== v) n.nodeValue = out;
    }
  }
  window.lawyerArabizeText = arabizeText;

  /* كانت هذه الدالة تفرض lang="ar"/dir="rtl" على كل textarea وكل input
     نصي بلا استثناء — بما فيها حقول الإيميل المبنية بـ<textarea> (لدعم
     أكثر من بريد)، فكانت تُبطل أي lang="en" وضعه field() في clients-poa.js
     عمداً لهذه الحقول تحديداً. نفس استثناء data-latin/type=email المستعمل
     في skipDigits أعلاه لازم يُطبَّق هنا كذلك، وإلا فحل الأرقام العربية في
     الإيميل يفشل رغم صحة الكود في مكان الإنشاء. راجع
     [[feedback_arabic_numerals_email_exception]]. */
  function arabize(root) {
    var sel = 'input[type="text"], input[type="search"], input:not([type]), textarea';
    (root || document).querySelectorAll(sel).forEach(function (f) {
      if (f.dataset.arabized) return;
      f.dataset.arabized = "1";
      if (skipDigits(f)) return;
      f.setAttribute("lang", "ar");
      f.setAttribute("dir", "rtl");
      f.style.textAlign = "right";
      f.style.direction = "rtl";
    });
  }

  /* ================================================== 2) إضافة يدوية للقوائم */

  var manual = readJSON(MANUAL_KEY, {});

  function saveManual() {
    try { localStorage.setItem(MANUAL_KEY, JSON.stringify(manual)); }
    catch (e) { toast("تعذّر حفظ القيمة المضافة", true); }
  }

  function keyOf(s) {
    var own = s.id || s.getAttribute("name");
    if (!own) {
      var all = Array.prototype.slice.call(document.querySelectorAll("select"));
      own = "idx" + all.indexOf(s);
    }
    return SCREEN + "|" + own;
  }

  function skip(s) {
    return s.id === "__recs" ||                 // قائمة السجلات المحفوظة
           s.closest("[data-nosave]") ||
           s.hasAttribute("data-no-manual") ||
           s.multiple;
  }

  /**
   * نافذة إدخال داخل الصفحة.
   * أنظف من prompt() التي تُظهر في WebView سطر «تعرض الصفحة في …».
   */
  function ask(title, cb, initial) {
    var back = el("div",
      "position:fixed;inset:0;background:rgba(28,18,8,.55);z-index:10000;" +
      "display:flex;align-items:center;justify-content:center;padding:22px");
    back.setAttribute("data-modal", "1");

    var box = el("div",
      "background:#fffdf8;border-radius:14px;padding:20px;width:100%;max-width:380px;" +
      "box-shadow:0 10px 40px rgba(0,0,0,.35);direction:rtl");

    box.appendChild(el("div",
      "font-weight:600;font-size:16px;margin-bottom:12px;color:#3d2614", title));

    var inp = el("input",
      "width:100%;padding:12px;font-size:16px;border:1px solid #ddd4c8;border-radius:9px;" +
      "direction:rtl;text-align:right;min-height:46px;font-family:inherit");
    inp.setAttribute("lang", "ar");
    inp.setAttribute("dir", "rtl");
    if (initial) inp.value = initial;
    box.appendChild(inp);

    var row = el("div", "display:flex;gap:10px;margin-top:16px");
    var ok = el("button",
      "flex:1;padding:12px;border:0;border-radius:9px;background:#5b3a21;color:#fff;" +
      "font-size:15px;font-family:inherit;min-height:46px", "إضافة");
    var no = el("button",
      "flex:1;padding:12px;border:1px solid #ddd4c8;border-radius:9px;background:#fff;" +
      "color:#5b3a21;font-size:15px;font-family:inherit;min-height:46px", "إلغاء");
    row.appendChild(ok); row.appendChild(no);
    box.appendChild(row);

    back.appendChild(box);
    document.body.appendChild(back);
    setTimeout(function () { inp.focus(); }, 60);

    function close(val) { back.remove(); cb(val); }
    ok.onclick   = function () {
      var v = inp.value.trim();
      if (!v) { inp.focus(); return; }
      close(v);
    };
    no.onclick   = function () { close(null); };
    back.onclick = function (e) { if (e.target === back) close(null); };
    inp.onkeydown = function (e) { if (e.key === "Enter") ok.click(); };
  }

  function has(s, val) {
    return Array.prototype.some.call(s.options, function (o) { return o.value === val; });
  }

  /**
   * يعيد بناء القيم المضافة يدوياً + خيار «إضافة يدوية» في نهاية القائمة.
   *
   * ⚠️ لا يلمس الـDOM إلا عند وجود نقص فعلي. أي تعديل غير ضروري يوقظ
   *    المراقب فيُعيد النداء هنا في حلقة لا تنتهي، وتُلغى معها اختيارات
   *    المستخدم لأن أندرويد يُبطل نافذة الاختيار كلما تغيّرت القائمة.
   */
  function decorate(s) {
    if (skip(s)) return;

    // القائمة مفتوحة الآن؟ لا تلمسها إطلاقاً حتى لا يضيع الاختيار
    if (document.activeElement === s) return;

    var k = keyOf(s);

    (manual[k] || []).forEach(function (v) {
      if (has(s, v)) return;
      var o = document.createElement("option");
      o.value = v; o.textContent = v; o.dataset.manual = "1";
      quiet(function () { s.appendChild(o); });
    });

    /* خيار إلغاء الاختيار — يعيد القائمة إلى حالتها الأولى دون مغادرة الصفحة */
    var clr = s.querySelector('option[value="' + CLEAR_VALUE + '"]');
    if (!clr) {
      clr = document.createElement("option");
      clr.value = CLEAR_VALUE;
      clr.textContent = "✕ إلغاء الاختيار";
      clr.dataset.nosave = "1";
      quiet(function () { s.appendChild(clr); });
    }

    var add = s.querySelector('option[value="' + ADD_VALUE + '"]');
    if (!add) {
      add = document.createElement("option");
      add.value = ADD_VALUE;
      add.textContent = "＋ إضافة يدوية…";
      add.dataset.nosave = "1";
      quiet(function () { s.appendChild(add); });
    } else if (add !== s.lastElementChild) {
      // موجود لكنه ليس الأخير — انقله مرة واحدة فقط
      quiet(function () { s.appendChild(add); });
    }

    if (s.dataset.manualHooked) return;
    s.dataset.manualHooked = "1";
    s.dataset.prev = s.value;

    s.addEventListener("focus", function () { s.dataset.prev = s.value; });

    s.addEventListener("change", function () {
      /* إلغاء الاختيار: ارجع إلى الخيار الأول (عادةً «— اختر —») */
      if (s.value === CLEAR_VALUE) {
        var first = s.querySelector('option:not([data-nosave])');
        s.value = first ? first.value : "";
        s.dataset.prev = s.value;
        s.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }

      if (s.value !== ADD_VALUE) { s.dataset.prev = s.value; return; }

      var back = s.dataset.prev || "";
      s.value = back;

      ask("أضف قيمة غير موجودة في القائمة", function (v) {
        if (!v) return;
        if (!manual[k]) manual[k] = [];
        if (manual[k].indexOf(v) < 0) { manual[k].push(v); saveManual(); }

        if (!has(s, v)) {
          var o = document.createElement("option");
          o.value = v; o.textContent = v; o.dataset.manual = "1";
          s.insertBefore(o, s.querySelector('option[value="' + ADD_VALUE + '"]'));
        }
        s.value = v;
        s.dataset.prev = v;
        s.dispatchEvent(new Event("change", { bubbles: true }));  // يشغّل أي منطق تابع
        toast("أُضيفت: " + v);
      });
    });
  }

  function scanSelects(root) {
    (root || document).querySelectorAll("select").forEach(decorate);
  }

  /* القوائم المتسلسلة (الدرجة ← المحكمة ← نوع الدعوى) تُعاد تعبئتها برمجياً،
     فنراقب الصفحة ونعيد حقن الخيارات كلما تغيّرت.

     الحلقة اللانهائية تُمنع بأمرين: تعديلاتنا نحن تُنفَّذ داخل quiet()
     فيتجاهلها المراقب، وdecorate() لا يلمس الـDOM بلا داعٍ. */
  var observer = null;
  var muted    = 0;

  /** ينفّذ تعديلاً على الـDOM دون أن يوقظ المراقب */
  function quiet(fn) {
    muted++;
    try { fn(); }
    finally {
      // نفرّغ طابور المراقب أولاً ثم نرفع الكتم
      setTimeout(function () { if (muted > 0) muted--; }, 0);
    }
  }

  function watch() {
    var pending = false;
    observer = new MutationObserver(function (records) {
      if (muted > 0) { if (observer) observer.takeRecords(); return; }

      // تجاهل التغييرات التي مصدرها خيارات أضفناها نحن
      var real = records.some(function (r) {
        return Array.prototype.some.call(r.addedNodes, function (n) {
          return !(n.nodeType === 1 && n.tagName === "OPTION" &&
                   (n.dataset.manual || n.value === ADD_VALUE));
        }) || r.addedNodes.length === 0;
      });
      if (!real) return;

      if (pending) return;
      pending = true;
      setTimeout(function () {
        pending = false;
        scanSelects();
        arabize();
        digitsOn();
        arabizeText();
      }, 120);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  /* ========================================== 3) زرّا «رجوع» و«حفظ» الثابتان */

  /* ================================= الرجوع دون فقدان ما أُدخل =============
     زر الرجوع — وزر الرجوع في أندرويد — كانا يغادران الصفحة فوراً فتضيع
     البيانات المكتوبة. الآن يسأل أولاً إن كان هناك إدخال غير محفوظ.        */

  var dirty = false;

  function watchDirty() {
    document.addEventListener("input", mark, true);
    document.addEventListener("change", mark, true);
    function mark(e) {
      var t = e.target;
      if (!t || !t.tagName) return;
      if (t.closest("[data-nosave]")) return;      // شريط الأدوات وأزرارنا
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) dirty = true;
    }
  }

  function leave() {
    dirty = false;
    if (history.length > 1) history.back();
    else location.href = "home.html";
  }

  /** يعيد true إن تولّى الأمر (عرض السؤال)، وfalse ليُكمل النظام رجوعه */
  function goBack() {
    if (!dirty) { leave(); return true; }
    if (document.querySelector('[data-modal="1"]')) return true;   // مفتوحة بالفعل

    var wrap = el("div",
      "position:fixed;inset:0;background:rgba(28,18,8,.55);z-index:10001;" +
      "display:flex;align-items:center;justify-content:center;padding:22px");
    wrap.setAttribute("data-modal", "1");
    var box = el("div",
      "background:#fffdf8;border-radius:14px;padding:20px;width:100%;max-width:380px;" +
      "direction:rtl;box-shadow:0 10px 40px rgba(0,0,0,.35)");

    box.appendChild(el("div",
      "font-weight:600;font-size:16px;color:#3d2614;margin-bottom:8px",
      "يوجد إدخال لم يُحفظ"));
    box.appendChild(el("div",
      "font-size:13.5px;color:#7d7166;line-height:1.9;margin-bottom:16px",
      "لو خرجت الآن ستفقد ما كتبته في هذه الشاشة."));

    function opt(label, css, fn) {
      var b = el("button",
        "display:block;width:100%;padding:13px;margin-bottom:9px;border-radius:10px;" +
        "font-family:inherit;font-size:15px;min-height:48px;" + css, label);
      b.type = "button";
      b.onclick = function () { wrap.remove(); fn(); };
      box.appendChild(b);
    }

    var saveBtn = findSaveButton();
    if (saveBtn) {
      opt("حفظ ثم الرجوع", "border:0;background:#5b3a21;color:#fff;font-weight:600",
          function () { saveBtn.click(); setTimeout(leave, 260); });
    }
    opt("الخروج بدون حفظ", "border:1px solid #e3c9c6;background:#fff;color:#b3261e", leave);
    opt("البقاء في الصفحة", "border:1px solid #ddd4c8;background:#fff;color:#5b3a21",
        function () { });

    wrap.appendChild(box);
    wrap.onclick = function (e) { if (e.target === wrap) wrap.remove(); };
    document.body.appendChild(wrap);
    return true;
  }

  /* يناديها زر الرجوع في أندرويد قبل أن يغادر الصفحة */
  window.__lawyerBack = function () {
    /* نافذة مفتوحة؟ أغلق الأعلى منها فقط.
       querySelector يعيد الأولى في ترتيب المستند لا الأعلى على الشاشة،
       فتُؤخذ الأخيرة — وهي آخر ما فُتح. */
    var all = document.querySelectorAll('[data-modal="1"]');
    if (all.length) {
      var top = all[all.length - 1];
      /* لوحة التأكيد تُلغى إلغاءً حقيقياً لا إزالةً صامتة */
      if (typeof top.__lawyerDismiss === "function") return top.__lawyerDismiss();
      top.remove();
      return true;
    }
    return goBack();
  };

  function findSaveButton() {
    var bar = document.querySelector(".modebar");
    if (!bar) return null;
    var btns = bar.querySelectorAll("button");
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].textContent.trim() === "حفظ") return btns[i];
    }
    return null;
  }

  function dock() {
    /* شريط التبويبات السفلي (إن وُجد) يبقى ظاهراً — الشريط الجديد يجلس فوقه */
    var nav = document.querySelector(".bottomnav");
    var navH = nav ? nav.offsetHeight : 0;
    if (nav) nav.style.zIndex = "9100";

    var d = el("div",
      "position:fixed;z-index:9000;right:0;left:0;bottom:" + navH + "px;display:flex;gap:10px;" +
      "padding:10px 14px" + (nav ? "" : " calc(10px + env(safe-area-inset-bottom))") + ";" +
      "background:linear-gradient(to top,rgba(242,239,234,.99),rgba(242,239,234,.90));" +
      "border-top:1px solid #ddd4c8;direction:rtl;max-width:860px;margin:0 auto");
    d.setAttribute("data-nosave", "1");

    var back = el("button",
      "flex:0 0 auto;padding:12px 20px;border:1px solid #c9bda9;border-radius:10px;" +
      "background:#fff;color:#5b3a21;font-size:15px;font-family:inherit;min-height:48px",
      "→ رجوع");
    back.type = "button";
    back.onclick = goBack;

    var save = el("button",
      "flex:1;padding:12px;border:0;border-radius:10px;background:#5b3a21;color:#fff;" +
      "font-size:16px;font-weight:600;font-family:inherit;min-height:48px",
      "حفظ");
    save.type = "button";
    save.onclick = function () {
      var b = findSaveButton();
      if (b) { b.click(); toast("تم الحفظ"); }
      else toast("هذه الشاشة لا تحتوي على بيانات للحفظ", true);
    };

    var bk = el("button",
      "flex:0 0 auto;padding:12px 16px;border:1px solid #c9bda9;border-radius:10px;" +
      "background:#fff;color:#5b3a21;font-size:15px;font-family:inherit;min-height:48px",
      "نسخة");
    bk.type = "button";
    bk.onclick = backupMenu;

    d.appendChild(back);
    d.appendChild(save);
    d.appendChild(bk);
    document.body.appendChild(d);

    if (!findSaveButton()) save.style.display = "none";

    /* مساحة أسفل المحتوى حتى لا يغطي الشريط آخر عنصر */
    var pad = el("div", "height:" + (d.offsetHeight + 14) + "px;flex:0 0 auto");
    pad.setAttribute("data-nosave", "1");
    if (nav) nav.parentNode.insertBefore(pad, nav);
    else (document.querySelector(".phone") || document.body).appendChild(pad);
  }

  /* ================================================ 4) النسخ الاحتياطي */

  /**
   * النسخة الاحتياطية.
   *
   * كانت تحفظ سجلات الشاشات فقط، فتضيع القضايا المستوردة والمواعيد والموكلون
   * والتكليفات — أي أغلب البيانات. الآن تشمل كل المخازن.
   */
  /* كل مفاتيح proflawyer.* — نفس صيغة شاشة «النسخ الاحتياطي» (data، v2).
     كانت قائمة ثابتة من ٧ مخازن بس، فكانت بتُسقط الحضور والرواتب والمصروفات
     والسجلات والإعدادات... من أي نسخة متاخدة من زرار «نسخة». */
  var BACKUP_EXCLUDE = {
    "proflawyer.lastBackup": 1, "proflawyer.backupHistory.v1": 1, "proflawyer.sync.safetyBackup": 1
  };
  function payload() {
    var data = {};
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (!k || k.indexOf("proflawyer.") !== 0 || BACKUP_EXCLUDE[k] || k.indexOf("proflawyer._") === 0) continue;
      var v = localStorage.getItem(k);
      try { data[k] = JSON.parse(v); } catch (e) { data[k] = v; }
    }
    return JSON.stringify({
      app:        "المحامي المحترف",
      version:    2,
      exportedAt: new Date().toISOString(),
      data:       data
    }, null, 2);
  }

  function toBase64(str) {
    var bytes = new TextEncoder().encode(str), bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function backupName() {
    return "نسخة-المحامي-المحترف-" + stamp() + ".json";
  }

  function browserFallback() {
    var blob = new Blob([payload()], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = backupName();
    a.click();
  }

  function backupMenu() {
    var back = el("div",
      "position:fixed;inset:0;background:rgba(28,18,8,.55);z-index:10000;" +
      "display:flex;align-items:flex-end;justify-content:center");

    var box = el("div",
      "background:#fffdf8;border-radius:16px 16px 0 0;padding:18px 18px 26px;" +
      "width:100%;max-width:520px;direction:rtl");

    box.appendChild(el("div",
      "font-weight:600;font-size:17px;margin-bottom:4px;color:#3d2614",
      "حفظ نسخة من كل البيانات"));
    box.appendChild(el("div",
      "font-size:13px;color:#7d7166;margin-bottom:16px;line-height:1.7",
      "تُحفظ باسم مؤرَّخ، ومعها تُحدَّث دائماً نسخة باسم «آخر نسخة»."));

    function opt(label, sub, fn) {
      var b = el("button",
        "display:block;width:100%;text-align:right;padding:14px;margin-bottom:10px;" +
        "border:1px solid #ddd4c8;border-radius:11px;background:#fff;font-family:inherit;" +
        "color:#3d2614;min-height:48px");
      b.type = "button";
      b.appendChild(el("div", "font-size:15px;font-weight:600", label));
      b.appendChild(el("div", "font-size:12.5px;color:#7d7166;margin-top:3px", sub));
      b.onclick = function () { back.remove(); fn(); };
      box.appendChild(b);
      return b;
    }

    opt("على الجهاز", "مجلد التنزيلات — يعمل بدون إنترنت", function () {
      if (!hasAndroid) { browserFallback(); return; }
      AndroidSaver.backup(backupName(), toBase64(payload()), false);
    });

    var online = navigator.onLine;
    var c = opt("على التخزين السحابي",
      online ? "اختر Google Drive أو أي تطبيق تخزين"
             : "غير متاح — لا يوجد اتصال بالإنترنت",
      function () {
        if (!hasAndroid) { browserFallback(); return; }
        AndroidSaver.backup(backupName(), toBase64(payload()), true);
      });
    if (!online) { c.disabled = true; c.style.opacity = ".5"; }

    var cancel = el("button",
      "display:block;width:100%;padding:13px;border:0;border-radius:11px;" +
      "background:#efe9df;color:#5b3a21;font-family:inherit;font-size:15px;min-height:46px",
      "إلغاء");
    cancel.type = "button";
    cancel.onclick = function () { back.remove(); };
    box.appendChild(cancel);

    back.appendChild(box);
    back.onclick = function (e) { if (e.target === back) back.remove(); };
    document.body.appendChild(back);
  }

  /* ------------------------------------------------------------------ إقلاع */

  /* Ask(...) نافذة إدخال، وAsk.confirm(...) لوحة تأكيد من ask.js.
     هذا الملف يُحمَّل بعدها، فيُحافَظ على confirm بدل محوها. */
  if (window.Ask && window.Ask.confirm) ask.confirm = window.Ask.confirm;
  window.Ask = ask;   // متاحة للشاشات الأخرى

  function boot() {
    arabize();
    digitsOn();
    arabizeText();
    scanSelects();
    watch();
    dock();
    watchDirty();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 120); });
  } else {
    setTimeout(boot, 120);
  }
})();

/* وضع سطح المكتب: زر «☰ القائمة» يفتح/يغلق شريط التنقل السفلي كقائمة منسدلة (يظهر فقط ≥1280px عبر CSS) */
(function () {
  function init() {
    var nav = document.querySelector(".bottomnav");
    if (!nav || document.getElementById("navToggle")) return;
    var b = document.createElement("button");
    b.type = "button"; b.id = "navToggle"; b.textContent = "☰ القائمة"; b.setAttribute("data-nosave", "1");
    b.addEventListener("click", function (e) { e.stopPropagation(); nav.classList.toggle("open"); });
    document.body.appendChild(b);
    document.addEventListener("click", function (e) { if (!nav.contains(e.target)) nav.classList.remove("open"); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();

/* وضع سطح المكتب (≥1280px): عجلة الماوس عبر scrcpy تصل كنقلات متقطعة (كل خطوة قفزة) — نُنعّمها بحركة انزلاق:
   نعترض wheel ونحرّك أقرب عنصر قابل للتمرير بإزاحة متدرجة (lerp) كل إطار. لا أثر على اللمس ولا على الموبايل. */
(function () {
  /* معطَّل افتراضياً: سبّب رجوع الصفحة لنفس النقطة عند التمرير — يُفعَّل يدوياً للتجربة فقط (localStorage proflawyer.smoothwheel=1) */
  try { if (localStorage.getItem("proflawyer.smoothwheel") !== "1") return; } catch (e) { return; }
  if (window.__smoothWheel) return; window.__smoothWheel = 1;
  var target = null, goal = 0, raf = 0;
  function scroller(el) {
    while (el && el !== document.body && el !== document.documentElement) {
      var cs = getComputedStyle(el);
      if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) return el;
      el = el.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }
  function step() {
    var cur = target.scrollTop, d = goal - cur;
    if (Math.abs(d) < 0.6) { target.scrollTop = goal; raf = 0; return; }
    target.scrollTop = cur + d * 0.18;
    raf = requestAnimationFrame(step);
  }
  window.addEventListener("wheel", function (e) {
    if (window.innerWidth < 1200 || e.ctrlKey || e.defaultPrevented) return;
    var t = scroller(e.target);
    var max = t.scrollHeight - t.clientHeight;
    if (max <= 0) return;
    e.preventDefault();
    if (t !== target || !raf) { target = t; goal = t.scrollTop; }
    var dy = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
    goal = Math.max(0, Math.min(max, goal + dy * 1.6));
    if (!raf) raf = requestAnimationFrame(step);
  }, { passive: false });
})();

/* كتابة عربية من كيبورد الكمبيوتر (وضع سطح المكتب ≥1200px): كيبورد الكمبيوتر يصل للتطبيق بتخطيط إنجليزي (حرف الزر الفعلي فقط)،
   فنحوّل موضع الزر (event.code) إلى حرف التخطيط العربي القياسي (Arabic 101) ونُدخله في الحقل.
   حقول البريد/كلمة السر/الرقم/الرابط (dir=ltr أو type email…) تبقى إنجليزية دائماً. التبديل: Ctrl+Space (مؤشر AR/EN أسفل اليسار). */
(function () {
  if (window.__arKeys) return; window.__arKeys = 1;
  var N = { Backquote: "ذ", Digit1: "١", Digit2: "٢", Digit3: "٣", Digit4: "٤", Digit5: "٥", Digit6: "٦", Digit7: "٧", Digit8: "٨", Digit9: "٩", Digit0: "٠",
    KeyQ: "ض", KeyW: "ص", KeyE: "ث", KeyR: "ق", KeyT: "ف", KeyY: "غ", KeyU: "ع", KeyI: "ه", KeyO: "خ", KeyP: "ح", BracketLeft: "ج", BracketRight: "د",
    KeyA: "ش", KeyS: "س", KeyD: "ي", KeyF: "ب", KeyG: "ل", KeyH: "ا", KeyJ: "ت", KeyK: "ن", KeyL: "م", Semicolon: "ك", Quote: "ط",
    KeyZ: "ئ", KeyX: "ء", KeyC: "ؤ", KeyV: "ر", KeyB: "لا", KeyN: "ى", KeyM: "ة", Comma: "و", Period: "ز", Slash: "ظ" };
  var S = { Backquote: "ّ", KeyQ: "َ", KeyW: "ً", KeyE: "ُ", KeyR: "ٌ", KeyT: "لإ", KeyY: "إ", KeyU: "‘", KeyI: "÷", KeyO: "×", KeyP: "؛",
    BracketLeft: "<", BracketRight: ">", KeyA: "ِ", KeyS: "ٍ", KeyD: "]", KeyF: "[", KeyG: "لأ", KeyH: "أ", KeyJ: "ـ", KeyK: "،", KeyL: "/",
    Semicolon: ":", Quote: "\"", KeyZ: "~", KeyX: "ْ", KeyC: "}", KeyV: "{", KeyB: "لآ", KeyN: "آ", KeyM: "’", Comma: ",", Period: ".", Slash: "؟" };
  var KEY = "proflawyer.kbmode", ar = true, ind = null;
  try { ar = localStorage.getItem(KEY) !== "en"; } catch (e) { }
  function indicator() {
    if (!ind) {
      ind = document.createElement("div"); ind.setAttribute("data-nosave", "1");
      ind.style.cssText = "position:fixed;left:14px;bottom:14px;z-index:99999;padding:5px 12px;border-radius:14px;background:#1a4a8a;color:#fff;font:700 13px sans-serif;opacity:.85;pointer-events:none;display:none";
      document.body.appendChild(ind);
    }
    return ind;
  }
  function show() { var i = indicator(); i.textContent = ar ? "AR" : "EN"; i.style.display = "block"; clearTimeout(show._t); show._t = setTimeout(function () { i.style.display = "none"; }, 1800); }
  function textual(t) {
    if (!t) return false;
    if (t.isContentEditable) return true;
    if (t.tagName === "TEXTAREA") return !(t.getAttribute("dir") === "ltr" || t.getAttribute("lang") === "en");
    if (t.tagName !== "INPUT") return false;
    var ty = (t.type || "text").toLowerCase();
    if (ty !== "text" && ty !== "search") return false;         // email/password/tel/number/url/date… إنجليزي
    return !(t.getAttribute("dir") === "ltr" || t.getAttribute("lang") === "en" || t.style.direction === "ltr");
  }
  document.addEventListener("keydown", function (e) {
    if (window.innerWidth < 1200) return;
    if (e.ctrlKey && e.code === "Space") { ar = !ar; try { localStorage.setItem(KEY, ar ? "ar" : "en"); } catch (x) { } show(); e.preventDefault(); return; }
    if (!ar || e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return;
    if (!textual(e.target)) return;
    var ch = (e.shiftKey ? S[e.code] : N[e.code]);
    if (ch === undefined) return;
    e.preventDefault();
    try { document.execCommand("insertText", false, ch); } catch (x) { }
  }, true);
})();

/* ================================================== الإدخال بالصوت 🎤
   مايك كيبورد سامسونج مش مضمون جوه حقول التطبيق (بيختفي لما يكون فيه كيبورد
   فعلي متوصّل زي scrcpy، وفي حقول البحث اللي الاقتراحات فيها مقفولة). فبيظهر
   زرار 🎤 صغير على طرف أي حقل نص عربي وانت بتكتب فيه؛ بيفتح التعرّف على الكلام
   بتاع الجهاز (عربي مصري) ويحط النص مكان المؤشر. */
(function () {
  if (window.__voiceBtn || !window.AndroidVoice || !AndroidVoice.listen) return;
  try { if (AndroidVoice.available && !AndroidVoice.available()) return; } catch (e) { return; }
  window.__voiceBtn = 1;
  var btn = null, target = null, selS = 0, selE = 0, oldPad = null;

  function voiceable(t) {
    if (!t || t.disabled || t.readOnly) return false;
    if (t.tagName === "TEXTAREA") return t.getAttribute("dir") !== "ltr";
    if (t.tagName !== "INPUT") return false;
    var ty = (t.getAttribute("type") || "text").toLowerCase();
    if (ty !== "text" && ty !== "search") return false;
    if (t.getAttribute("dir") === "ltr" || t.hasAttribute("data-latin") || t.getAttribute("lang") === "en") return false;
    if (t.getAttribute("inputmode") === "numeric" || t.getAttribute("inputmode") === "decimal") return false;
    return true;
  }
  function ensure() {
    if (btn) return btn;
    btn = document.createElement("button");
    btn.type = "button"; btn.textContent = "🎤";
    btn.setAttribute("data-nosave", "1"); btn.setAttribute("aria-label", "إدخال بالصوت");
    btn.style.cssText = "position:fixed;z-index:100000;width:34px;height:34px;border-radius:50%;" +
      "border:1px solid var(--brand,#5b3a21);background:#fffdf8;font-size:17px;line-height:1;padding:0;" +
      "display:none;box-shadow:0 1px 4px rgba(0,0,0,.18)";
    /* الضغط ما يشيلش التركيز من الحقل */
    btn.addEventListener("pointerdown", function (e) { e.preventDefault(); });
    btn.addEventListener("mousedown", function (e) { e.preventDefault(); });
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      if (!target) return;
      try { selS = target.selectionStart; selE = target.selectionEnd; } catch (x) { selS = selE = target.value.length; }
      if (selS == null) selS = selE = target.value.length;
      btn.textContent = "…";
      try { AndroidVoice.listen("ar-EG", "اتكلم…"); } catch (x) { btn.textContent = "🎤"; }
    });
    document.body.appendChild(btn);
    return btn;
  }
  function place() {
    if (!btn || !target || !target.isConnected) return;
    var r = target.getBoundingClientRect();
    if (r.width < 60 || r.bottom < 0 || r.top > window.innerHeight) { btn.style.display = "none"; return; }
    btn.style.left = (r.left + 5) + "px";
    btn.style.top = (r.top + Math.max(0, (r.height - 34) / 2)) + "px";
    btn.style.display = "block";
  }
  function show(t) {
    target = t; ensure();
    if (oldPad === null) { oldPad = t.style.paddingLeft; t.style.paddingLeft = "44px"; }
    place();
  }
  function hide() {
    if (target && oldPad !== null) { target.style.paddingLeft = oldPad; }
    oldPad = null;
    if (btn) { btn.style.display = "none"; btn.textContent = "🎤"; }
  }
  document.addEventListener("focusin", function (e) {
    if (voiceable(e.target)) { if (target !== e.target) hide(); show(e.target); }
  }, true);
  document.addEventListener("focusout", function (e) {
    var t = e.target;
    setTimeout(function () {
      /* لسه في الحقل (أو راح لنشاط التعرّف على الكلام) → سيبه */
      if (document.activeElement === t || document.visibilityState === "hidden" || (btn && btn.textContent === "…")) return;
      if (t === target) { hide(); target = null; }
    }, 150);
  }, true);
  window.addEventListener("scroll", place, true);
  window.addEventListener("resize", place);

  window.__voiceResult = function (text) {
    if (btn) btn.textContent = "🎤";
    var t = target;
    if (!t || !t.isConnected) return;
    t.focus();
    if (!text) { place(); return; }
    var v = t.value || "", s = Math.min(selS, v.length), en = Math.min(selE, v.length);
    var pre = v.slice(0, s), post = v.slice(en);
    var ins = String(text).trim();
    if (pre && !/\s$/.test(pre)) ins = " " + ins;
    if (post && !/^\s/.test(post)) ins = ins + " ";
    t.value = pre + ins + post;
    var p = (pre + ins).length;
    try { t.setSelectionRange(p, p); } catch (x) { }
    t.dispatchEvent(new Event("input", { bubbles: true }));
    t.dispatchEvent(new Event("change", { bubbles: true }));
    place();
  };
})();
