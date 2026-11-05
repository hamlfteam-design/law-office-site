/* برنامج المحامي المحترف — سكربت النماذج (Mockups)
   وظائف تفاعلية بسيطة لتجربة السلوك المطلوب في الـ handoff:
   - إضافة أخر (تكرار الحقول)
   - عدّاد الحروف للحقول النصية المحدودة
   - إضافة صفوف لجدول الجلسات
   - الفرز في سجل التوكيلات مع حفظ آخر اختيار
   - إظهار/إخفاء نموذج التنفيذ المدني/الجنائي
   لا توجد قاعدة بيانات — البيانات للعرض فقط.
*/
(function () {
  "use strict";

  /* ==================================================================
     -1) حارس الأخطاء العام
     لو حصل استثناء غير متوقّع أثناء رسم أي شاشة (زي تعارض أسماء متغيّرات)،
     الشاشة كانت تتجمّد بصمت (بيظهر وكأنها "مش بتتمرّر"). دلوقتي بيظهر
     شريط تنبيه واضح فوق الشاشة مع زر "إعادة تحميل" بدل التجمّد الصامت.
     ================================================================== */
  (function () {
    var shown = false;
    function showGuard(msg) {
      if (shown) return; shown = true;
      try {
        var bar = document.createElement("div");
        bar.setAttribute("style",
          "position:fixed;left:0;right:0;top:0;z-index:999999;background:#b3261e;" +
          "color:#fff;padding:10px 14px;font-family:sans-serif;font-size:13.5px;" +
          "display:flex;align-items:center;gap:10px;box-shadow:0 2px 8px rgba(0,0,0,.3)");
        var t = document.createElement("span");
        t.style.flex = "1";
        t.textContent = "حدث خطأ أثناء عرض الشاشة. جرّب إعادة التحميل.";
        var b = document.createElement("button");
        b.textContent = "إعادة تحميل";
        b.setAttribute("style",
          "background:#fff;color:#b3261e;border:0;border-radius:8px;padding:6px 14px;font-weight:700");
        b.onclick = function () { location.reload(); };
        bar.appendChild(t); bar.appendChild(b);
        document.body.appendChild(bar);
      } catch (e) { /* لا شيء أكثر يمكن عمله */ }
    }
    window.addEventListener("error", function (ev) {
      showGuard(ev && ev.message);
    });
    window.addEventListener("unhandledrejection", function (ev) {
      showGuard(ev && ev.reason);
    });
  })();

  /* ==================================================================
     0) محرّك التنبيه: صوت + إشعار منبثق
     قاعدة عامة: كل تنبيه في التطبيق له صوت.
     الصوت مولّد برمجياً (Web Audio) — بلا ملفات خارجية.
     في تطبيق أندرويد: قناة إشعارات بنغمة مخصصة + اهتزاز.
     ================================================================== */
  var SOUND_KEY = "alert.sound";

  function soundOn() {
    try { return localStorage.getItem(SOUND_KEY) !== "off"; }
    catch (e) { return true; }
  }
  function setSoundOn(on) {
    try { localStorage.setItem(SOUND_KEY, on ? "on" : "off"); } catch (e) { /* ignore */ }
  }

  var audioCtx = null;
  function playAlertSound(kind) {
    if (!soundOn()) return;
    /* لو المستخدم اختار نغمة من نغمات جهازه (AndroidSound.pickRingtone) تُشغَّل
       هي بدل الصوت المولَّد — نفس المفتاح alert.sound يتحكم في التشغيل من عدمه. */
    if (window.AndroidSound && AndroidSound.play) {
      try { AndroidSound.play(); return; } catch (e) { /* رجوع للصوت الافتراضي */ }
    }
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === "suspended") audioCtx.resume();

      // نغمتان قصيرتان — "دِنـج"
      var tones = kind === "urgent"
        ? [[880, 0], [660, 0.16], [880, 0.32]]
        : [[784, 0], [1046, 0.13]];

      tones.forEach(function (t) {
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        var start = audioCtx.currentTime + t[1];
        osc.type = "sine";
        osc.frequency.setValueAtTime(t[0], start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.22, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(start);
        osc.stop(start + 0.3);
      });

      if (navigator.vibrate) navigator.vibrate(kind === "urgent" ? [90, 60, 90] : 60);
    } catch (e) { /* الصوت ليس حرجاً */ }
  }

  function toastHost() {
    var h = document.querySelector(".toasts");
    if (!h) {
      h = document.createElement("div");
      h.className = "toasts";
      document.body.appendChild(h);
    }
    return h;
  }

  /* kind = "ok": تأكيد حفظ هادي (من غير صوت التنبيه) */
  function showToast(title, body, kind) {
    if (kind !== "ok") playAlertSound(kind);
    var t = document.createElement("div");
    t.className = "toast";
    if (kind === "urgent") t.style.borderInlineStartColor = "#e5534b";
    if (kind === "ok") t.style.borderInlineStartColor = "#2f8f4e";

    var ic = document.createElement("div");
    ic.className = "ic";
    ic.textContent = kind === "urgent" ? "⚠" : kind === "ok" ? "✓" : "🔔";

    var tx = document.createElement("div");
    tx.className = "tx";
    var b = document.createElement("b");
    b.textContent = title;
    var s = document.createElement("span");
    s.textContent = body || "";
    tx.appendChild(b);
    tx.appendChild(s);

    var cl = document.createElement("button");
    cl.className = "cl";
    cl.type = "button";
    cl.textContent = "×";

    var kill = function () {
      t.classList.add("out");
      setTimeout(function () { t.remove(); }, 220);
    };
    cl.addEventListener("click", kill);

    t.appendChild(ic);
    t.appendChild(tx);
    t.appendChild(cl);
    toastHost().appendChild(t);
    setTimeout(kill, 5200);
  }

  // مفتاح الصوت (يظهر في الشاشات التي تحتوي .soundbar)
  document.querySelectorAll("[data-sound-toggle]").forEach(function (btn) {
    var sync = function () {
      var on = soundOn();
      btn.textContent = on ? "الصوت: مفعّل 🔊" : "الصوت: صامت 🔇";
      btn.classList.toggle("ghost", !on);
    };
    btn.addEventListener("click", function () {
      setSoundOn(!soundOn());
      sync();
      if (soundOn()) playAlertSound();
    });
    sync();
  });

  document.querySelectorAll("[data-sound-test]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      showToast("تجربة التنبيه", "هذا شكل الإشعار وصوته.", btn.getAttribute("data-sound-test"));
    });
  });

  /* زر «اختيار نغمة» — يُضاف تلقائياً لأي شريط صوت .soundbar (الجلسات
     والمحضرين والطعون وكل شاشة فيها data-sound-toggle) بدل تعديل كل شاشة
     على حدة. يفتح قائمة نغمات الجهاز نفسه (نظام أندرويد) عبر AndroidSound،
     ويحفظ الاختيار ليُستعمل في كل تنبيه بعدها (playAlertSound أعلاه). */
  if (window.AndroidSound && AndroidSound.pickRingtone) {
    document.querySelectorAll(".soundbar").forEach(function (bar) {
      if (bar.querySelector("[data-ringtone-pick]")) return;
      var nameEl = document.createElement("span");
      nameEl.setAttribute("data-nosave", "1");
      nameEl.style.cssText = "font-size:11.5px;color:var(--muted);width:100%;order:9";
      function syncName() {
        var n = "";
        try { n = AndroidSound.currentName() || ""; } catch (e) { }
        nameEl.textContent = n ? ("النغمة الحالية: " + n) : "النغمة الحالية: افتراضية الجهاز";
      }
      var pick = document.createElement("button");
      pick.type = "button";
      pick.className = "btn sm ghost";
      pick.setAttribute("data-ringtone-pick", "1");
      pick.textContent = "🎵 اختيار نغمة";
      pick.addEventListener("click", function () {
        try { AndroidSound.pickRingtone(); } catch (e) { }
      });
      bar.appendChild(pick);
      bar.appendChild(nameEl);
      syncName();
      window.__ringtonePicked = function (uri, name) { syncName(); if (uri) playAlertSound(); };
    });
  }

  /* ---------- حفظ واضح في كل النوافذ (المودالات) ----------
     بلاغ المستخدم: بعد «حفظ» التطبيق بيتقل كأنه هنج، والشاشة بترجع لأولها،
     ومش باين اتحفظ ولا لأ. أي زرار «حفظ…» جوه نافذة [data-modal]:
       ١) يتقفل ويكتب «جارٍ الحفظ…» ويترسم ده فعلاً قبل ما الحفظ يبدأ؛
       ٢) لو النافذة اتقفلت (يعني الحفظ نجح) تظهر «✓ تم الحفظ» — إلا لو
          الشاشة نفسها أظهرت رسالة؛ ولو الحفظ نقل لصفحة تانية تظهر هناك؛
       ٣) لو إعادة رسم الصفحة رجّعت الـscroll لأولها يرجع لمكانه
          (إلا لو الشاشة نفسها طلبت تحريك الـscroll).
     زرار عليه data-plain-save يُستثنى. */
  var SAVE_RX = /^(💾\s*)?(حفظ|احفظ)/;
  var FLASH_KEY = "pl.saveFlash";
  function toastCount() { return document.querySelectorAll(".toast").length; }
  function savedToast() { showToast("تم الحفظ بنجاح", "", "ok"); }
  try {
    var fl = +sessionStorage.getItem(FLASH_KEY) || 0;
    sessionStorage.removeItem(FLASH_KEY);
    if (fl && Date.now() - fl < 5000) setTimeout(savedToast, 300);
  } catch (e) { }
  document.addEventListener("click", function (e) {
    /* ضغطة المستخدم بس؛ ‎.click()‎ من الكود بيفضل متزامن زي ما هو */
    if (!e.isTrusted) return;
    var b = e.target && e.target.closest ? e.target.closest("button") : null;
    if (!b || b.__plSaving || b.disabled || b.hasAttribute("data-plain-save")) return;
    var modal = b.closest("[data-modal]");
    if (!modal || !SAVE_RX.test((b.textContent || "").trim())) return;
    e.preventDefault();
    e.stopImmediatePropagation();

    var y = window.scrollY || 0;
    var html = b.innerHTML, wasCss = b.style.opacity;
    b.__plSaving = true;
    b.disabled = true;
    b.textContent = "⏳ جارٍ الحفظ…";
    b.style.opacity = ".75";
    var t0 = toastCount();
    requestAnimationFrame(function () { setTimeout(function () {
      b.disabled = false; b.innerHTML = html; b.style.opacity = wasCss;
      var moved = false, spoke = false;
      var oTo = window.scrollTo, oAl = window.alert;
      window.scrollTo = function () { moved = true; return oTo.apply(window, arguments); };
      window.alert = function () { spoke = true; return oAl.apply(window, arguments); };
      try { sessionStorage.setItem(FLASH_KEY, String(Date.now())); } catch (e2) { }
      try { b.click(); }
      finally {
        b.__plSaving = false;
        window.scrollTo = oTo; window.alert = oAl;
      }
      function closed() { return !modal.isConnected || getComputedStyle(modal).display === "none"; }
      function keepScroll() {
        if (!moved && Math.abs((window.scrollY || 0) - y) > 40) window.scrollTo(0, y);
      }
      var done = false;
      function settle(final) {
        if (done) return;
        if (!closed()) {
          if (final) { try { sessionStorage.removeItem(FLASH_KEY); } catch (e3) { } }
          return;
        }
        done = true;
        try { sessionStorage.removeItem(FLASH_KEY); } catch (e4) { }
        keepScroll();
        if (!spoke && toastCount() <= t0) savedToast();
      }
      settle(false);
      if (!done) requestAnimationFrame(function () { setTimeout(function () { settle(true); }, 700); });
      else requestAnimationFrame(keepScroll);
    }, 30); });
  }, true);

  // متاح للاستخدام من باقي أقسام الملف
  window.PL = { toast: showToast, sound: playAlertSound, soundOn: soundOn, saved: savedToast };

  /* ---------- 1) إضافة أخر ---------- */
  // <div class="multi" data-placeholder="اسم العميل"> ... </div>
  document.addEventListener("click", function (e) {
    var addBtn = e.target.closest("[data-add]");
    if (addBtn) {
      e.preventDefault();
      var wrap = document.querySelector(addBtn.getAttribute("data-add"));
      if (!wrap) return;
      var first = wrap.querySelector(".item");
      var clone = first.cloneNode(true);
      clone.querySelectorAll("input, select, textarea").forEach(function (el) {
        el.value = "";
      });
      if (!clone.querySelector(".rm")) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "rm";
        b.title = "حذف";
        b.textContent = "×";
        clone.appendChild(b);
      }
      wrap.appendChild(clone);
      var f = clone.querySelector("input, select, textarea");
      if (f) f.focus();
      return;
    }

    var rm = e.target.closest(".multi .rm");
    if (rm) {
      e.preventDefault();
      var wrap2 = rm.closest(".multi");
      if (wrap2.querySelectorAll(".item").length > 1) {
        rm.closest(".item").remove();
      } else {
        wrap2.querySelectorAll("input, select, textarea").forEach(function (el) { el.value = ""; });
      }
    }
  });

  /* ---------- 2) عدّاد الحروف ---------- */
  document.querySelectorAll("textarea[maxlength]").forEach(function (ta) {
    var out = document.createElement("div");
    out.className = "counter";
    ta.insertAdjacentElement("afterend", out);
    var upd = function () {
      out.textContent = ta.value.length + " / " + ta.getAttribute("maxlength");
    };
    ta.addEventListener("input", upd);
    upd();
  });

  /* ---------- 3) جدول الجلسات: إضافة صف ---------- */
  document.querySelectorAll("[data-addrow]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var tb = document.querySelector(btn.getAttribute("data-addrow"));
      if (!tb) return;
      var last = tb.querySelector("tr:last-child");
      var row = last.cloneNode(true);
      row.querySelectorAll("input, select, textarea").forEach(function (el) { el.value = ""; });

      // زر ملاحظات الجلسة في الصف الجديد: مفتاح مستقل وبلا ملاحظة سابقة
      var nb = row.querySelector("[data-note]");
      if (nb) {
        nb.classList.remove("has-note");
        nb.setAttribute("data-note", "session-" + Date.now());
      }
      tb.appendChild(row);

      // إعادة ترقيم المسلسل تلقائياً
      tb.querySelectorAll("tr").forEach(function (tr, i) {
        var s = tr.querySelector("[data-serial]");
        if (s) {
          s.textContent = i + 1;
          if (nb) nb.setAttribute("data-note-title", "ملاحظات الجلسة رقم " + (i + 1));
        }
      });

      var f = row.querySelector("input");
      if (f) f.focus();
    });
  });

  /* ---------- 4) الفرز في سجل التوكيلات + حفظ آخر اختيار ---------- */
  var sortSel = document.getElementById("poaSort");
  if (sortSel) {
    var KEY = "poa.sort";
    var saved = null;
    try { saved = localStorage.getItem(KEY); } catch (err) { saved = null; }
    if (saved) sortSel.value = saved;

    var doSort = function () {
      var mode = sortSel.value;
      try { localStorage.setItem(KEY, mode); } catch (err) { /* ignore */ }
      var tb = document.getElementById("poaBody");
      if (!tb) return;
      var rows = Array.prototype.slice.call(tb.querySelectorAll("tr"));
      var idx = { client: 1, officeNo: 0, year: 2 }[mode];
      var coll = new Intl.Collator("ar", { numeric: true, sensitivity: "base" });
      rows.sort(function (a, b) {
        var x = a.children[idx].textContent.trim();
        var y = b.children[idx].textContent.trim();
        return coll.compare(x, y);
      });
      rows.forEach(function (r) { tb.appendChild(r); });
    };
    sortSel.addEventListener("change", doSort);
    doSort();
  }

  /* ---------- 5) تبديل نموذج التنفيذ (مدني / جنائي) ----------
     الأقسام المعلّمة بـ data-civil-only تخص التنفيذ المدني وحده
     (إجراءات التنفيذ المدنية · الموعد القادم والمبالغ) وتختفي في الجنائي. */
  if (document.querySelector("input[name=execType]")) {
    var applyExecType = function () {
      var civil = document.getElementById("civilExec");
      var crim  = document.getElementById("criminalExec");
      if (!civil || !crim) return;
      var isCivil = document.querySelector("input[name=execType]:checked").value === "civil";
      civil.hidden = !isCivil;
      crim.hidden  = isCivil;
      document.querySelectorAll("[data-civil-only]").forEach(function (el) {
        el.hidden = !isCivil;
      });
      document.querySelectorAll("[data-criminal-only]").forEach(function (el) {
        el.hidden = isCivil;
      });
      // إخفاء تنبيه الموعد القادم مع قسمه
      var alertBox = document.getElementById("execAlert");
      if (alertBox && !isCivil) alertBox.hidden = true;
    };
    document.querySelectorAll("input[name=execType]").forEach(function (r) {
      r.addEventListener("change", applyExecType);
    });
    applyExecType();
  }

  /* ---------- 6) تنبيه أوراق المحضرين قبل الجلسة بـ 5 أيام ---------- */
  document.querySelectorAll("[data-session-date]").forEach(function (inp) {
    var box = document.querySelector(inp.getAttribute("data-session-date"));
    if (!box) return;
    var check = function () {
      if (!inp.value) { box.hidden = true; return; }
      var today = new Date(); today.setHours(0, 0, 0, 0);
      // التاريخ يُعرض عربياً (٢٠٢٦/١٠/١٥) فنعيده لاتينياً قبل التحويل
      var iso = (window.lawyerISO ? window.lawyerISO(inp) : inp.value) || inp.value;
      var d = new Date(iso); d.setHours(0, 0, 0, 0);
      if (isNaN(d)) { box.hidden = true; return; }
      var days = Math.round((d - today) / 86400000);
      var window_ = parseInt(inp.getAttribute("data-alert-days") || "5", 10);
      if (days >= 0 && days <= window_) {
        var wasHidden = box.hidden;
        box.hidden = false;
        box.textContent = (inp.getAttribute("data-alert-text") ||
          "تنبيه: باقي {d} يوم/أيام على الجلسة — يتكرر التنبيه يومياً حتى تمام الاستلام.")
          .replace("{d}", days);
        // تنبيه بصوت عند ظهوره
        if (wasHidden) {
          showToast(
            inp.getAttribute("data-alert-title") || "ورقة محضرين لم تُستلم",
            (inp.getAttribute("data-alert-body") || "باقي {d} يوم/أيام على الجلسة")
              .replace("{d}", days),
            "urgent"
          );
        }
      } else {
        box.hidden = true;
      }
    };
    inp.addEventListener("change", check);
    check();
  });

  /* ---------- 7) اقتراح القيم المخزّنة (datalist) — محاكاة الاستدعاء عند التكرار ---------- */
  // القيم الجديدة التي يكتبها المستخدم تُضاف للـ datalist المرتبط (سلوك مطلوب في الـ V1)
  document.querySelectorAll("input[list]").forEach(function (inp) {
    inp.addEventListener("change", function () {
      var dl = document.getElementById(inp.getAttribute("list"));
      if (!dl || !inp.value.trim()) return;
      var exists = Array.prototype.some.call(dl.options, function (o) {
        return o.value.trim() === inp.value.trim();
      });
      if (!exists) {
        var o = document.createElement("option");
        o.value = inp.value.trim();
        dl.appendChild(o);
      }
    });
  });

  /* ---------- 8) إضافة قيمة جديدة لقائمة منسدلة ----------
     الزر: <button data-addopt="role">  ويضيف الخيار إلى كل
     <select data-optgroup="role"> في الصفحة، ثم يختاره في القائمة المجاورة للزر.
     يغطي: صفة الموكل/الخصم · نوع الجلسة · وأي قائمة قابلة للتوسع. */
  /* القيم المضافة يدوياً تُحفظ في قاعدة البيانات المحلية وتعود مع كل فتح للبرنامج */
  var OPT_KEY = "PL_customOptions";
  function optStore() {
    try { return JSON.parse(localStorage.getItem(OPT_KEY) || "{}"); } catch (err) { return {}; }
  }
  function optSave(group, val) {
    var s = optStore();
    if (!s[group]) s[group] = [];
    if (s[group].indexOf(val) < 0) s[group].push(val);
    try { localStorage.setItem(OPT_KEY, JSON.stringify(s)); } catch (err) { /* ignore */ }
  }
  function optRestore() {
    var s = optStore();
    Object.keys(s).forEach(function (group) {
      document.querySelectorAll('select[data-optgroup="' + group + '"]').forEach(function (sel) {
        s[group].forEach(function (val) {
          var dup = Array.prototype.some.call(sel.options, function (o) { return o.value.trim() === val; });
          if (dup) return;
          var o = document.createElement("option");
          o.value = val; o.textContent = val;
          sel.appendChild(o);
        });
      });
    });
  }
  optRestore();

  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-addopt]");
    if (!btn) return;
    e.preventDefault();
    var group = btn.getAttribute("data-addopt");
    var val = window.prompt("أدخل القيمة الجديدة:");
    if (!val || !val.trim()) return;
    val = val.trim();
    optSave(group, val);

    var targets = document.querySelectorAll('select[data-optgroup="' + group + '"]');
    var exists = false;
    targets.forEach(function (sel) {
      var dup = Array.prototype.some.call(sel.options, function (o) { return o.value.trim() === val; });
      if (dup) { exists = true; return; }
      var o = document.createElement("option");
      o.value = val;
      o.textContent = val;
      sel.appendChild(o);
    });

    // اختيار القيمة في القائمة المجاورة للزر
    var near = btn.closest(".combo");
    var sel = near ? near.querySelector("select") : targets[0];
    if (sel) sel.value = val;
    if (exists) alert("القيمة موجودة بالفعل في القائمة — تم اختيارها.");
  });

  /* ---------- 9) ملاحظات القضية / ملاحظات الجلسة ----------
     الزر: <button data-note="سلسلة تعريف" data-note-title="عنوان النافذة">
     النص محفوظ في الذاكرة فقط (نموذج) — في التطبيق يُحفظ مع السجل. */
  var noteStore = {};
  var dlg = document.getElementById("notesDlg");
  if (dlg) {
    var dlgTitle = dlg.querySelector("[data-note-heading]");
    var dlgText  = dlg.querySelector("textarea");
    var current  = null;

    document.addEventListener("click", function (e) {
      var b = e.target.closest("[data-note]");
      if (!b) return;
      e.preventDefault();
      current = b;
      var key = b.getAttribute("data-note");
      dlgTitle.textContent = b.getAttribute("data-note-title") || "ملاحظات";
      dlgText.value = noteStore[key] || "";
      dlgText.dispatchEvent(new Event("input")); // تحديث العدّاد
      dlg.showModal();
      dlgText.focus();
    });

    dlg.querySelector("[data-note-save]").addEventListener("click", function () {
      if (current) {
        var key = current.getAttribute("data-note");
        var v = dlgText.value.trim();
        noteStore[key] = v;
        current.classList.toggle("has-note", v.length > 0);
        if (current.hasAttribute("data-note-count")) {
          var lbl = current.querySelector("[data-note-label]");
          if (lbl) lbl.textContent = v ? "ملاحظات (محفوظة)" : "ملاحظات القضية";
        }
      }
      dlg.close();
    });

    dlg.querySelector("[data-note-cancel]").addEventListener("click", function () {
      dlg.close();
    });
  }

  /* ---------- 10) مرفقات PDF ----------
     data-files="#sel" لقائمة محددة، أو data-files فارغة لأقرب قائمة .files
     (تُستخدم مع المهام المضافة ديناميكياً). */
  document.addEventListener("change", function (e) {
    var input = e.target.closest("[data-files]");
    if (!input || input.type !== "file") return;
    var sel = input.getAttribute("data-files");
    // النطاق = المهمة أو البطاقة التي يقع فيها الزر، حتى لا تختلط قوائم المرفقات
    var scope = input.closest("[data-task]") || input.closest("section.card") || document;
    var list = sel ? document.querySelector(sel) : scope.querySelector(".files");
    if (!list) return;
    // تصنيف المرفق (إن وُجدت قائمة تصنيف بجوار الزر)
    var kindSel = scope.querySelector("[data-file-kind]");
    var kind = kindSel && kindSel.value ? kindSel.value : "";

    (function () {
      Array.prototype.forEach.call(input.files, function (f) {
        var li = document.createElement("li");
        var kb = f.size < 1048576
          ? Math.max(1, Math.round(f.size / 1024)) + " KB"
          : (f.size / 1048576).toFixed(1) + " MB";
        var ext = (f.name.split(".").pop() || "").toUpperCase().slice(0, 4);
        li.innerHTML = '<span class="pdf"></span>' +
                       '<span class="nm"></span>' +
                       '<span class="kindtag"></span>' +
                       '<span class="sz"></span>' +
                       '<button type="button" class="rm" title="حذف">×</button>';
        li.querySelector(".pdf").textContent = ext || "FILE";
        li.querySelector(".nm").textContent = f.name;
        li.querySelector(".sz").textContent = kb;
        var kt = li.querySelector(".kindtag");
        if (kind) { kt.textContent = kind; } else { kt.remove(); }
        list.appendChild(li);
      });
      input.value = "";
    })();
  });

  // حذف مرفق
  document.addEventListener("click", function (e) {
    var rm = e.target.closest(".files .rm");
    if (rm) { e.preventDefault(); rm.closest("li").remove(); }
  });

  /* ---------- 11) وضع العرض / التعديل ----------
     كل بيانات ملف القضية قابلة للتعديل في أي وقت.
     القفل هنا وقاية من التغيير بالخطأ فقط — وليس منعاً دائماً. */
  var modeToggle = document.getElementById("modeToggle");
  if (modeToggle) {
    var form = modeToggle.closest("form");
    var bar  = modeToggle.closest(".modebar");
    var lbl  = document.getElementById("modeLabel");
    var locked = false;

    var applyMode = function () {
      form.querySelectorAll("input, select, textarea").forEach(function (el) {
        if (el.closest("[data-nolock]")) return;   // الشات لا يتأثر بالقفل
        if (el.type === "file") { el.disabled = locked; return; }
        if (el.tagName === "SELECT" || el.type === "radio" || el.type === "checkbox") {
          el.disabled = locked;
        } else {
          el.readOnly = locked;
        }
        el.classList.toggle("locked-field", locked);
      });
      // الأزرار داخل النموذج (إضافة أخر · إضافة جلسة · ترحيل · مرفقات)
      form.querySelectorAll("button").forEach(function (b) {
        if (b === modeToggle) return;
        if (b.hasAttribute("data-note")) return;   // الملاحظات تظل متاحة للقراءة
        if (b.closest("[data-nolock]")) return;    // أزرار الشات تظل متاحة
        b.disabled = locked;
      });
      bar.classList.toggle("locked", locked);
      lbl.textContent = locked
        ? "وضع العرض — البيانات مقفلة ضد التعديل بالخطأ"
        : "وضع التعديل — كل بيانات الملف قابلة للتغيير";
      modeToggle.textContent = locked ? "فتح التعديل" : "قفل التعديل";
      // عند فتح التعديل تُعاد قيود الربط (المحاكم/الأنواع) لأن الفتح يُفعّل كل شيء
      if (!locked) { refreshLadder(); cascadeLevel(); }
    };

    modeToggle.addEventListener("click", function () {
      locked = !locked;
      applyMode();
    });
  }

  /* ---------- 12) الانتقال لدرجة التقاضي الأعلى ----------
     التسلسل معتمد من العميل. */
  var NEXT_LEVEL = {
    "جزئي":         "ابتدائي",
    "ابتدائي":      "استئناف عالي",
    "استئناف عالي": "نقض",
    "اقتصادية":     "نقض",
    "إدارية":       "قضاء إداري",
    "تأديبية":      "قضاء إداري",
    "قضاء إداري":   "إدارية عليا",
    "نقض":          null,
    "إدارية عليا":  null,
    "دستورية":      null
  };

  /* ---------- 12-ب) ربط الدرجة ← المحكمة ← نوع الدعوى ← الدائرة ----------
     المصدر: assets/court-data.js (مولَّد آلياً من بوابة وزارة العدل ومحكمة النقض
     ومجلس الدولة والمحكمة الدستورية العليا). أي قيمة يضيفها المستخدم تُخزَّن
     تحت الدرجة/المحكمة المختارة وتظهر في المرات القادمة. */
  var LEVEL_DATA = {};

  (function buildLevelData() {
    var src = (window.COURT_DATA && window.COURT_DATA.levels) || {};
    Object.keys(src).forEach(function (level) {
      var courts   = [];
      var allTypes = [];
      var byCourt  = {};   // اسم المحكمة  -> [أنواع الدعاوى]
      var circuits = {};   // "محكمة||نوع" -> [الدوائر]

      (src[level].courts || []).forEach(function (c) {
        courts.push(c.name);
        var names = [];
        (c.types || []).forEach(function (t) {
          names.push(t.name);
          if (allTypes.indexOf(t.name) < 0) allTypes.push(t.name);
          if (t.circuits && t.circuits.length) {
            circuits[c.name + "||" + t.name] = t.circuits.slice();
          }
        });
        byCourt[c.name] = names;
      });

      LEVEL_DATA[level] = {
        source:   src[level].source || "",
        courts:   courts,
        types:    allTypes,
        byCourt:  byCourt,
        circuits: circuits
      };
    });
  })();

  function emptyLevel() {
    return { source: "", courts: [], types: [], byCourt: {}, circuits: {} };
  }

  var courtSel = document.getElementById("courtName");
  var typeSel  = document.getElementById("caseType");

  function fillSelect(sel, values, placeholder) {
    var keep = sel.value;
    sel.innerHTML = "";
    var ph = document.createElement("option");
    ph.value = "";
    ph.textContent = placeholder;
    sel.appendChild(ph);
    values.forEach(function (v) {
      var o = document.createElement("option");
      o.value = v;
      o.textContent = v;
      sel.appendChild(o);
    });
    // الاحتفاظ بالقيمة السابقة لو ما زالت ضمن الدرجة الجديدة
    if (values.indexOf(keep) >= 0) sel.value = keep;
  }

  /* الدائرة: قائمة تُملأ من (المحكمة + نوع الدعوى) وتظل قابلة للكتابة الحرة */
  function fillCircuits() {
    var dl = document.getElementById("dlCircuits");
    if (!dl) return;
    var levelSel = document.getElementById("courtLevel");
    var level = levelSel ? levelSel.value : "";
    var data  = LEVEL_DATA[level];
    var list  = (data && data.circuits[courtSel.value + "||" + typeSel.value]) || [];

    dl.innerHTML = "";
    list.forEach(function (v) {
      var o = document.createElement("option");
      o.value = v;
      dl.appendChild(o);
    });

    var inp = document.getElementById("circuit");
    if (inp) {
      inp.placeholder = list.length
        ? "اختر من " + list.length + " دائرة أو اكتب دائرة جديدة"
        : "اكتب اسم ورقم الدائرة";
    }
  }

  /* عدّاد يوضح مصدر البيانات وحجمها تحت قائمة الدرجة */
  function showLevelSource(level) {
    var note = document.getElementById("levelSource");
    if (!note) return;
    var data = LEVEL_DATA[level];
    if (!level || !data) { note.textContent = ""; return; }
    note.textContent = data.courts.length + " محكمة · " + data.types.length +
                       " نوع دعوى — المصدر: " + data.source;
  }

  /* المحكمة ← تحصر أنواع الدعاوى على ما يُنظر أمامها فعلاً */
  function cascadeCourt() {
    if (!courtSel || !typeSel) return;
    var levelSel = document.getElementById("courtLevel");
    var level = levelSel ? levelSel.value : "";
    var data  = LEVEL_DATA[level];
    if (!data) return;

    var court = courtSel.value;
    if (court && data.byCourt[court]) {
      fillSelect(typeSel, data.byCourt[court], "— اختر نوع الدعوى —");
    } else {
      fillSelect(typeSel, data.types, "— اختر المحكمة أولاً لحصر الأنواع —");
    }
    fillCircuits();
  }

  function cascadeLevel() {
    if (!courtSel || !typeSel) return;
    var levelSel = document.getElementById("courtLevel");
    var level = levelSel ? levelSel.value : "";
    var btns = document.querySelectorAll("[data-addlevel]");

    if (!level) {
      fillSelect(courtSel, [], "— اختر درجة التقاضي أولاً —");
      fillSelect(typeSel,  [], "— اختر درجة التقاضي أولاً —");
      courtSel.disabled = true;
      typeSel.disabled  = true;
      btns.forEach(function (b) { b.disabled = true; });
      showLevelSource("");
      fillCircuits();
      return;
    }

    if (!LEVEL_DATA[level]) LEVEL_DATA[level] = emptyLevel();
    fillSelect(courtSel, LEVEL_DATA[level].courts, "— اختر المحكمة —");
    courtSel.disabled = false;
    typeSel.disabled  = false;
    btns.forEach(function (b) { b.disabled = false; });
    showLevelSource(level);
    cascadeCourt();
  }

  if (courtSel) courtSel.addEventListener("change", cascadeCourt);
  if (typeSel)  typeSel.addEventListener("change", fillCircuits);

  // إضافة محكمة / نوع دعوى جديد تحت الدرجة المختارة
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-addlevel]");
    if (!b) return;
    e.preventDefault();
    var levelSel = document.getElementById("courtLevel");
    var level = levelSel ? levelSel.value : "";
    if (!level) { alert("اختر درجة التقاضي أولاً."); return; }

    var kind  = b.getAttribute("data-addlevel"); // courts | types
    var data  = LEVEL_DATA[level];
    var court = courtSel.value;

    if (kind === "types" && !court) {
      alert("اختر المحكمة أولاً — نوع الدعوى يُسجَّل تحت محكمة بعينها.");
      return;
    }

    var label = kind === "courts"
      ? "اسم المحكمة الجديدة (تحت درجة: " + level + ")"
      : "نوع الدعوى الجديد (تحت: " + court + ")";
    var val = window.prompt(label);
    if (!val || !val.trim()) return;
    val = val.trim();

    if (kind === "courts") {
      if (data.courts.indexOf(val) < 0) data.courts.push(val);
      if (!data.byCourt[val]) data.byCourt[val] = [];
      cascadeLevel();
      courtSel.value = val;
      cascadeCourt();
    } else {
      if (data.types.indexOf(val) < 0) data.types.push(val);
      if (data.byCourt[court].indexOf(val) < 0) data.byCourt[court].push(val);
      cascadeCourt();
      typeSel.value = val;
      fillCircuits();
    }
  });

  if (courtSel) {
    var lv = document.getElementById("courtLevel");
    if (lv) lv.addEventListener("change", cascadeLevel);
    cascadeLevel();
  }

  var lvlFromEl = document.getElementById("lvlFrom");
  function refreshLadder() {
    if (!lvlFromEl) return;
    var levelSel = document.getElementById("courtLevel");
    var lvlToEl  = document.getElementById("lvlTo");
    var note     = document.getElementById("ladderNote");
    var btn      = document.getElementById("escalateBtn");
    var cur      = levelSel ? levelSel.value : "";

    if (!cur) {
      lvlFromEl.textContent = "—";
      lvlToEl.textContent = "—";
      lvlToEl.className = "lvl next";
      note.textContent = "اختر درجة التقاضي أعلى الصفحة لعرض الدرجة الأعلى.";
      btn.disabled = true;
      return;
    }

    var next = NEXT_LEVEL[cur];
    lvlFromEl.textContent = cur;

    if (next) {
      lvlToEl.textContent = next;
      lvlToEl.className = "lvl next";
      note.textContent = "الترحيل متاح بعد صدور حكم نهائي (حالة الدعوى = منتهية).";
      // يُتاح الزر فقط بعد الحكم النهائي
      var status = document.getElementById("caseStatus");
      var ready = status && status.value === "منتهية";
      btn.disabled = !ready;
      if (ready) note.textContent = "صدر الحكم النهائي — الترحيل متاح الآن.";
    } else {
      lvlToEl.textContent = "لا توجد درجة أعلى";
      lvlToEl.className = "lvl none";
      note.textContent = "هذه آخر درجة تقاضٍ — لا ترحيل بعدها.";
      btn.disabled = true;
    }
  }

  if (lvlFromEl) {
    ["courtLevel", "caseStatus"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("change", refreshLadder);
    });

    var escBtn = document.getElementById("escalateBtn");
    if (escBtn) {
      escBtn.addEventListener("click", function () {
        var cur  = document.getElementById("courtLevel").value;
        var next = NEXT_LEVEL[cur];
        var box  = document.getElementById("escalateDone");
        var fileNo = (document.getElementById("fileNo") || {}).value || "—";
        var year   = (document.getElementById("dealYear") || {}).value || "—";

        box.hidden = false;
        box.innerHTML =
          "تم إنشاء سجل دعوى جديد بدرجة <strong>" + next + "</strong> " +
          "برقم الملف <strong>" + fileNo + "</strong> وسنة التعامل <strong>" + year + "</strong>.<br>" +
          "انتقلت معه بيانات الخصوم والصفات والمستندات. " +
          "رقم الدعوى والسنة والدائرة تُملأ من واقع الدرجة الجديدة." +
          "<br><span style='font-size:11.5px'>(نموذج للعرض — لا يتم إنشاء سجل فعلي)</span>";
        box.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }

    refreshLadder();
  }

  /* ---------- 12-ج) شات متابعة التنفيذ (SCR-02) ----------
     محادثة بين المكلف بالتنفيذ ومدير المكتب، مستقلة لكل عمل إداري.
     في التطبيق: جدول AdminWorkMessage مرتبط بالعمل، ورسائل لا تُحذف. */
  var ROLE_LABEL = { mgr: "مدير المكتب", exec: "مكلف بالتنفيذ", member: "مشارك" };

  function initials(name) {
    var clean = String(name).replace(/^(أ\/|م\/|د\/)\s*/, "").trim();
    var parts = clean.split(/\s+/);
    return (parts[0] || "").charAt(0) + ((parts[1] || "").charAt(0) || "");
  }

  // إعادة محاذاة الرسائل حسب "من تتحدث بصفته" الآن
  function realignChat(task) {
    var sel = task.querySelector(".chat-as-select");
    if (!sel) return;
    var me = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].textContent.trim() : "";
    task.querySelectorAll(".msg").forEach(function (m) {
      var mine = (m.getAttribute("data-sender") || "") === me;
      m.classList.toggle("me", mine);
      m.classList.toggle("other", !mine);
    });
  }

  function chatNow() {
    var d = new Date();
    var h = d.getHours(), m = d.getMinutes();
    var suffix = h < 12 ? "ص" : "م";
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return h12 + ":" + (m < 10 ? "0" + m : m) + " " + suffix;
  }

  // إضافة رسالة للمحادثة — تُستخدم للإرسال وللرسائل الواردة
  function appendMsg(task, senderName, role, text, isIncoming) {
    var body = task.querySelector(".chat");
    if (!body) return;
    var sel = task.querySelector(".chat-as-select");
    var me = sel && sel.options[sel.selectedIndex]
      ? sel.options[sel.selectedIndex].textContent.trim() : "";

    var msg = document.createElement("div");
    msg.className = "msg " + (senderName === me ? "me" : "other");
    msg.setAttribute("data-sender", senderName);
    msg.setAttribute("data-role", role);

    var who = document.createElement("div");
    who.className = "who";
    who.textContent = senderName;
    var rl = document.createElement("span");
    rl.className = "role";
    rl.textContent = ROLE_LABEL[role] || role;
    who.appendChild(rl);

    var bub = document.createElement("div");
    bub.className = "bubble";
    bub.textContent = text;                // نص فقط — لا HTML

    var when = document.createElement("div");
    when.className = "when";
    when.textContent = chatNow();

    msg.appendChild(who);
    msg.appendChild(bub);
    msg.appendChild(when);
    body.appendChild(msg);
    body.scrollTop = body.scrollHeight;

    // تنبيه بصوت للرسائل الواردة فقط
    if (isIncoming) {
      var head = task.querySelector("[data-h-text]");
      var taskName = head ? head.textContent : "مهمة";
      showToast(
        "رسالة جديدة من " + senderName,
        (role === "mgr" ? "تعليمات المدير · " : "") + taskName,
        role === "mgr" ? "urgent" : ""
      );
    }
    return msg;
  }

  function chatSendIn(wrap) {
    var input = wrap.querySelector(".chat-input");
    var task  = wrap.closest("[data-task]");
    if (!task) return;
    var asSel = task.querySelector(".chat-as-select");
    var txt = input.value.trim();
    if (!txt) return;

    var opt = asSel.options[asSel.selectedIndex];
    appendMsg(task, opt.textContent.trim(), opt.value, txt, false);

    input.value = "";
    input.style.height = "auto";
  }

  // تفويض الأحداث — يعمل تلقائياً مع المهام المضافة لاحقاً
  document.addEventListener("click", function (e) {
    var b = e.target.closest(".chat-send");
    if (!b) return;
    e.preventDefault();
    chatSendIn(b.closest(".chat-wrap"));
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" || e.shiftKey) return;
    var inp = e.target.closest(".chat-input");
    if (!inp) return;
    e.preventDefault();
    chatSendIn(inp.closest(".chat-wrap"));
  });

  document.addEventListener("input", function (e) {
    var inp = e.target.closest(".chat-input");
    if (!inp) return;
    inp.style.height = "auto";
    inp.style.height = Math.min(inp.scrollHeight, 110) + "px";
  });

  document.querySelectorAll(".chat").forEach(function (c) { c.scrollTop = c.scrollHeight; });

  // تغيير "تتحدث بصفة" يعيد محاذاة الرسائل
  document.addEventListener("change", function (e) {
    var sel = e.target.closest(".chat-as-select");
    if (!sel) return;
    var task = sel.closest("[data-task]");
    if (task) realignChat(task);
  });

  /* ---------- مشاركو المهمة (محادثة جماعية) ---------- */
  function addPerson(task, name, role) {
    name = String(name).trim();
    if (!name) return;
    var list = task.querySelector(".people");
    var sel  = task.querySelector(".chat-as-select");
    if (!list || !sel) return;

    var dup = Array.prototype.some.call(sel.options, function (o) {
      return o.textContent.trim() === name;
    });
    if (dup) { alert("هذا المشارك مضاف بالفعل."); return; }

    var chip = document.createElement("span");
    chip.className = "person" + (role === "mgr" ? " mgr" : "");
    chip.setAttribute("data-person", name);
    var av = document.createElement("span");
    av.className = "av";
    av.textContent = initials(name);
    var nm = document.createElement("span");
    nm.textContent = name;
    var x = document.createElement("button");
    x.type = "button";
    x.className = "x";
    x.title = "إزالة";
    x.textContent = "×";
    chip.appendChild(av);
    chip.appendChild(nm);
    chip.appendChild(x);
    list.appendChild(chip);

    var o = document.createElement("option");
    o.value = role;
    o.textContent = name;
    sel.appendChild(o);
  }

  document.addEventListener("click", function (e) {
    // إضافة مشارك
    var add = e.target.closest("[data-add-person]");
    if (add) {
      e.preventDefault();
      var task = add.closest("[data-task]");
      var nm = window.prompt("اسم المشارك الجديد:");
      if (!nm) return;
      /* سؤال لا فعل مدمِّر: الزرّان صفتان لا تأكيد وإلغاء */
      Ask.confirm("ما صفة «" + nm + "» في الملف؟", {
        danger: false, ok: "مدير / صاحب المكتب", cancel: "مشارك عادي"
      }, function ()  { addPerson(task, nm, "mgr"); },
         function ()  { addPerson(task, nm, "member"); });
      return;
    }

    // إزالة مشارك
    var rmP = e.target.closest(".person .x");
    if (rmP) {
      e.preventDefault();
      var chip = rmP.closest(".person");
      var task2 = chip.closest("[data-task]");
      var name = chip.getAttribute("data-person");
      var sel2 = task2.querySelector(".chat-as-select");
      if (sel2.options.length <= 2) { alert("لا بد من مشاركَين على الأقل."); return; }
      Array.prototype.slice.call(sel2.options).forEach(function (o) {
        if (o.textContent.trim() === name) o.remove();
      });
      chip.remove();
      realignChat(task2);
      return;
    }

    // محاكاة رسالة واردة (لتجربة التنبيه بالصوت)
    var sim = e.target.closest("[data-sim-incoming]");
    if (sim) {
      e.preventDefault();
      var task3 = sim.closest("[data-task]");
      var sel3 = task3.querySelector(".chat-as-select");
      var meIdx = sel3.selectedIndex;
      // اختر مشاركاً غير الحالي — ويُفضَّل المدير
      var pool = Array.prototype.slice.call(sel3.options).filter(function (o, i) { return i !== meIdx; });
      if (!pool.length) return;
      var pick = pool.filter(function (o) { return o.value === "mgr"; })[0] || pool[0];
      var samples = [
        "تمام، كمّل بالإجراء ووافني بالنتيجة.",
        "لو الموظف اعترض، اطلب مقابلة رئيس القلم فوراً.",
        "أرفق الإيصال على المهمة بعد التقديم.",
        "أجّل الإجراء لبعد جلسة الأحد."
      ];
      var idx = task3.querySelectorAll(".msg").length % samples.length;
      appendMsg(task3, pick.textContent.trim(), pick.value, samples[idx], true);
      return;
    }
  });

  /* ---------- 12-د) مهام متعددة داخل الملف الواحد (SCR-02) ---------- */
  var addTaskBtn = document.getElementById("addTask");
  if (addTaskBtn) {
    var tasksWrap = document.getElementById("tasks");
    var tpl = document.getElementById("taskTpl");
    var seq = tasksWrap.querySelectorAll("[data-task]").length;

    var syncTaskHeader = function (task) {
      var who  = task.querySelector(".t-assignee");
      var what = task.querySelector(".t-text");
      var done = task.querySelector("input[type=radio]:checked");
      var hWho = task.querySelector("[data-h-assignee]");
      var hTxt = task.querySelector("[data-h-text]");
      var hSt  = task.querySelector("[data-h-status]");
      if (hWho) hWho.textContent = (who && who.value) ? who.value : "بدون مكلف";
      if (hTxt) {
        var v = what ? what.value.trim() : "";
        hTxt.textContent = v ? (v.length > 42 ? v.slice(0, 42) + "…" : v) : "مهمة جديدة";
      }
      if (hSt) {
        var isDone = done && done.value === "done";
        hSt.textContent = isDone ? "تم" : "لم يتم";
        hSt.className = "badge " + (isDone ? "ok" : "alert");
      }
    };

    // تحديث ترويسة المهمة عند تغيير أي من حقولها
    document.addEventListener("input", function (e) {
      var t = e.target.closest("[data-task]");
      if (t) syncTaskHeader(t);
    });
    document.addEventListener("change", function (e) {
      var t = e.target.closest("[data-task]");
      if (t) syncTaskHeader(t);
    });

    addTaskBtn.addEventListener("click", function () {
      seq += 1;
      var node = tpl.content.firstElementChild.cloneNode(true);
      node.setAttribute("data-task", "t" + seq);
      node.open = true;
      var n = node.querySelector("[data-t-no]");
      if (n) n.textContent = seq;
      // اسم فريد لمجموعة أزرار الحالة حتى لا تتداخل مهام مع بعضها
      node.querySelectorAll("input[type=radio]").forEach(function (r) {
        r.name = "done" + seq;
      });
      tasksWrap.appendChild(node);
      syncTaskHeader(node);
      node.scrollIntoView({ behavior: "smooth", block: "start" });
      var f = node.querySelector("select, input, textarea");
      if (f) f.focus();
    });

    // حذف مهمة
    document.addEventListener("click", function (e) {
      var d = e.target.closest("[data-del-task]");
      if (!d) return;
      e.preventDefault();
      if (tasksWrap.querySelectorAll("[data-task]").length <= 1) {
        alert("لا يمكن حذف آخر مهمة في الملف.");
        return;
      }
      var task3 = d.closest("[data-task]");
      Ask.confirm("حذف هذه المهمة؟",
                  { detail: "سيُحذف معها كل مرفقاتها ومحادثتها.", ok: "حذف المهمة" },
                  function () { task3.remove(); });
    });

    tasksWrap.querySelectorAll("[data-task]").forEach(syncTaskHeader);
  }

  /* ---------- 12-هـ) حسابات مالية تلقائية ---------- */
  function num(id) {
    var el = document.getElementById(id);
    // الحقول قد تحتوي أرقاماً عربية (٠..٩) فنعيدها لاتينية قبل الحساب
    var raw = el ? String(el.value).replace(/[٠-٩]/g,
                 function (d) { return d.charCodeAt(0) - 0x0660; }) : "";
    var v = parseFloat(raw);
    return isNaN(v) ? 0 : v;
  }
  function fmt(n) {
    var t = (Math.round(n * 100) / 100).toLocaleString("en-US");
    // تُعرض بالأرقام العربية ما لم يختر المستخدم اللاتينية
    if (window.lawyerNumerals && window.lawyerNumerals() === "en") return t;
    return t.replace(/[0-9]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩"[+d]; });
  }

  // باقي الأتعاب = المتفق عليه − المدفوع
  var feeRemain = document.getElementById("feeRemain");
  if (feeRemain) {
    var calcFee = function () {
      var r = num("feeAgreed") - num("feePaid");
      feeRemain.textContent = fmt(r);
      feeRemain.style.color = r > 0 ? "var(--warn)" : "var(--ok)";
    };
    ["feeAgreed", "feePaid"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("input", calcFee);
    });
    calcFee();
  }

  // صافي المرتب = الأجر − الخصومات + البدلات
  var netPay = document.getElementById("netPay");
  if (netPay) {
    var calcPay = function () {
      var gross = num("baseSalary");
      var lateH = num("lateHours"), absD = num("absentDays");
      var hourRate = gross / (num("workDays") * num("dailyHours") || 1);
      var lateCut = Math.round(hourRate * lateH);
      var absCut  = Math.round((gross / (num("workDays") || 1)) * absD);
      var bonus   = num("bonuses");
      var other   = num("otherDeductions");
      var total   = lateCut + absCut + other;

      var set = function (id, v) { var e = document.getElementById(id); if (e) e.textContent = fmt(v); };
      set("lateCut", lateCut);
      set("absCut", absCut);
      set("totalDeduct", total);
      netPay.textContent = fmt(gross - total + bonus);
    };
    ["baseSalary", "workDays", "dailyHours", "lateHours", "absentDays", "bonuses", "otherDeductions"]
      .forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener("input", calcPay);
      });
    calcPay();
  }

  /* ---------- 13) فلترة التنبيهات (شاشة مقترحة PRO-02) ---------- */
  var alertChips = document.getElementById("alertChips");
  if (alertChips) {
    alertChips.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      alertChips.querySelectorAll("button").forEach(function (x) { x.classList.remove("on"); });
      b.classList.add("on");
      var f = b.getAttribute("data-filter");
      document.querySelectorAll(".alert-item[data-kind]").forEach(function (it) {
        it.hidden = (f !== "all" && it.getAttribute("data-kind") !== f);
      });
      // إخفاء البطاقة التي فرغت من العناصر
      document.querySelectorAll(".card").forEach(function (card) {
        var items = card.querySelectorAll(".alert-item[data-kind]");
        if (!items.length) return;
        var visible = Array.prototype.filter.call(items, function (i) { return !i.hidden; });
        card.hidden = visible.length === 0;
      });
    });
  }

  /* ---------- 14) البحث (شاشة مقترحة PRO-03) ---------- */
  var q = document.getElementById("q");
  if (q && window.SEARCH_DATA) {
    var out   = document.getElementById("results");
    var empty = document.getElementById("empty");
    var count = document.getElementById("count");
    var chips = document.getElementById("searchChips");
    var scope = "all";

    // تطبيع عربي بسيط: توحيد الألف والياء والتاء المربوطة وحذف التشكيل
    var norm = function (s) { return window.lawyerNorm(s); };

    var mark = function (text, term) {
      if (!term) return text;
      var i = norm(text).indexOf(norm(term));
      if (i < 0) return text;
      return text.slice(0, i) + "<mark>" + text.slice(i, i + term.length) + "</mark>" + text.slice(i + term.length);
    };

    var render = function () {
      var term = q.value.trim();
      var nt = norm(term);
      var hits = window.SEARCH_DATA.filter(function (r) {
        if (scope !== "all" && r.scope !== scope) return false;
        if (!nt) return true;
        return norm(r.title + " " + r.sub + " " + r.keys).indexOf(nt) >= 0;
      });

      out.innerHTML = hits.map(function (r) {
        var tag = { case: "قضية", paper: "ورقة محضرين", poa: "توكيل" }[r.scope];
        return '<a class="result" href="' + r.href + '">' +
               '<div class="title">' + mark(r.title, term) + ' <span class="badge">' + tag + '</span></div>' +
               '<div class="sub">' + mark(r.sub, term) + '</div></a>';
      }).join("");

      empty.hidden = hits.length > 0;
      count.textContent = hits.length + " نتيجة";
    };

    q.addEventListener("input", render);
    if (chips) {
      chips.addEventListener("click", function (e) {
        var b = e.target.closest("button");
        if (!b) return;
        chips.querySelectorAll("button").forEach(function (x) { x.classList.remove("on"); });
        b.classList.add("on");
        scope = b.getAttribute("data-scope");
        render();
      });
    }
    render();
  }

  /* ---------- 13) منع الإرسال الفعلي في النماذج ---------- */
  document.querySelectorAll("form").forEach(function (f) {
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      alert("نموذج للعرض فقط — لا يتم حفظ بيانات في هذه النسخة.");
    });
  });
})();
