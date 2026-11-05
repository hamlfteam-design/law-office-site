/* ==================================================================
   المحامي المحترف — طبقة حفظ البيانات
   تُضاف فوق الشاشات كما هي دون تغيير شكلها أو حقولها.
   كل شاشة تصبح سجلاً كامل الوظائف: سجل جديد · حفظ · فتح · حذف · تصدير.
   التخزين محلي (localStorage) — بلا سيرفر وبلا إنترنت.
   ================================================================== */
(function () {
  "use strict";

  var KEY = "proflawyer.screens.v1";
  var SCREEN = (location.pathname.split("/").pop() || "index.html").replace(/\.html.*$/, "");
  var DB = {};

  /* ---------- تخزين ---------- */

  /* آخر نسخة معروفة متطابقة مع السحابة — تُستعمل لحساب الفرق (إضافة/تعديل/
     حذف) عند كل persist() بدل رفع كل السجلات في كل مرة. null يعني: لم تتم
     أي مزامنة بعد (إما بلا اتصال، أو بلا تسجيل دخول، أو لم تكتمل بعد). */
  var lastSynced = {};

  function load() {
    try { DB = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { DB = {}; }
    if (!DB[SCREEN]) DB[SCREEN] = [];
    syncFromCloud();
  }

  /** يسحب سجلات هذه الشاشة من Firestore (لو مسجَّل دخول) ويدمجها محلياً. */
  function syncFromCloud() {
    if (!window.CloudStore || !window.CloudStore.records) return;
    window.CloudStore.records.list(SCREEN, function (remote) {
      if (remote === null) return;   // بلا اتصال أو بلا تسجيل دخول — استمر بالنسخة المحلية
      var byId = {};
      remote.forEach(function (r) { byId[r._id] = r; });
      /* أي سجل محلي لم يصل للسحابة بعد (أُنشئ للتو، أو فشل رفعه سابقاً) يبقى */
      DB[SCREEN].forEach(function (r) { if (!byId[r._id]) byId[r._id] = r; });
      DB[SCREEN] = Object.keys(byId).map(function (k) { return byId[k]; });
      lastSynced = {};
      DB[SCREEN].forEach(function (r) { if (r._id) lastSynced[r._id] = JSON.stringify(r); });
      persistLocal();
      if (typeof fill === "function") fill();
    });
  }

  function persistLocal() {
    try { localStorage.setItem(KEY, JSON.stringify(DB)); return true; }
    catch (e) { alert("تعذّر الحفظ: " + e.message + "\nصدّر نسخة واحذف بيانات قديمة."); return false; }
  }

  /** يرفع للسحابة فقط ما تغيّر فعلياً منذ آخر مزامنة (سجلات مضافة/معدَّلة/محذوفة). */
  function pushChangedToCloud() {
    if (!window.CloudStore || !window.CloudStore.records) return;
    var cur = DB[SCREEN] || [];
    var curIds = {};
    cur.forEach(function (r) {
      if (!r._id) return;
      curIds[r._id] = 1;
      var json = JSON.stringify(r);
      if (lastSynced[r._id] !== json) {
        window.CloudStore.records.save(SCREEN, r);
        lastSynced[r._id] = json;
      }
    });
    Object.keys(lastSynced).forEach(function (id) {
      if (!curIds[id]) { window.CloudStore.records.remove(SCREEN, id); delete lastSynced[id]; }
    });
  }

  function persist() {
    var ok = persistLocal();
    pushChangedToCloud();
    return ok;
  }
  var uid = function () { return "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };

  /* ---------- الحقول ---------- */
  function root() { return document.querySelector("main") || document.body; }

  function fields() {
    return Array.prototype.slice.call(
      root().querySelectorAll("input, select, textarea")
    ).filter(function (e) {
      return e.type !== "file" && !e.closest("[data-nosave]") && e.id !== "__recs";
    });
  }

  /* حاويات التكرار: «+ إضافة أخر» و«+ إضافة صف» */
  function repeaters() {
    var out = [];
    Array.prototype.forEach.call(document.querySelectorAll("[data-add]"), function (b, i) {
      var w = document.querySelector(b.getAttribute("data-add"));
      if (w) out.push({ id: "m" + i, btn: b, count: function () { return w.querySelectorAll(".item").length; } });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-addrow]"), function (b, i) {
      var w = document.querySelector(b.getAttribute("data-addrow"));
      if (w) out.push({ id: "t" + i, btn: b, count: function () { return w.querySelectorAll("tr").length; } });
    });
    return out;
  }

  function readRec() {
    var rec = { _id: uid(), _at: new Date().toISOString(), rep: {}, v: [] };
    repeaters().forEach(function (r) { rec.rep[r.id] = r.count(); });
    fields().forEach(function (e) {
      if (e.type === "radio" || e.type === "checkbox") rec.v.push({ c: e.checked });
      else rec.v.push({ x: e.value });
    });
    return rec;
  }

  function writeRec(rec) {
    /* ١) اضبط عدد الصفوف أولاً حتى تتطابق الحقول */
    repeaters().forEach(function (r) {
      var want = (rec.rep && rec.rep[r.id]) || r.count();
      var guard = 0;
      while (r.count() < want && guard++ < 200) r.btn.click();
    });
    /* ٢) املأ القيم بالترتيب */
    var f = fields();
    (rec.v || []).forEach(function (val, i) {
      var e = f[i];
      if (!e) return;
      if (e.type === "radio" || e.type === "checkbox") {
        e.checked = !!val.c;
      } else {
        e.value = val.x == null ? "" : val.x;
      }
      e.dispatchEvent(new Event("input", { bubbles: true }));
      e.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function clearAll() {
    fields().forEach(function (e) {
      if (e.type === "radio" || e.type === "checkbox") return;
      if (e.tagName === "SELECT") e.selectedIndex = 0; else e.value = "";
      e.dispatchEvent(new Event("input", { bubbles: true }));
      e.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  /* عنوان السجل في القائمة: أول قيمة نصية ذات معنى */
  function labelOf(rec) {
    var f = fields(), best = "";
    for (var i = 0; i < (rec.v || []).length && i < f.length; i++) {
      var v = rec.v[i] && rec.v[i].x;
      if (v && String(v).trim() && !/^\d{4}-\d{2}-\d{2}$/.test(v) && String(v).trim().length > 1) {
        best = String(v).trim(); break;
      }
    }
    var d = rec._at ? new Date(rec._at) : null;
    var when = d ? d.toLocaleDateString("ar-EG") : "";
    return (best || "سجل") + (when ? " — " + when : "");
  }

  /* ---------- شريط الأدوات ---------- */
  var CURRENT = null;

  function bar() {
    var b = document.createElement("div");
    b.className = "modebar";
    b.setAttribute("data-nosave", "1");
    b.style.cssText = "flex-wrap:wrap;background:#f4f0e8;border-color:#e0d5c2;color:#6b5330";

    var sel = document.createElement("select");
    sel.id = "__recs";
    sel.style.cssText = "flex:0 1 240px;width:auto;padding:5px 9px;font-size:12.5px";
    b.appendChild(sel);

    function mk(txt, cls, fn) {
      var x = document.createElement("button");
      x.type = "button"; x.className = cls; x.textContent = txt; x.onclick = fn;
      b.appendChild(x); return x;
    }

    mk("سجل جديد", "btn sm ghost", function () {
      CURRENT = null; clearAll(); fill(); note("جاهز لإدخال سجل جديد");
    });

    mk("حفظ", "btn sm", function () {
      var rec = readRec();
      if (CURRENT) {
        var i = DB[SCREEN].findIndex(function (r) { return r._id === CURRENT; });
        rec._id = CURRENT;
        if (i >= 0) DB[SCREEN][i] = rec; else DB[SCREEN].push(rec);
      } else {
        DB[SCREEN].push(rec); CURRENT = rec._id;
      }
      if (persist()) { fill(); note("تم الحفظ ✓ — عدد السجلات: " + DB[SCREEN].length); }
    });

    mk("حذف", "btn sm ghost", function () {
      if (!CURRENT) { alert("اختر سجلاً محفوظاً أولاً."); return; }
      var id = CURRENT;
      Ask.confirm("حذف هذا السجل نهائياً؟", { ok: "حذف السجل" }, function () {
        DB[SCREEN] = DB[SCREEN].filter(function (r) { return r._id !== id; });
        CURRENT = null; persist(); clearAll(); fill(); note("تم الحذف");
      });
    });

    mk("⬇ تصدير كل البيانات", "btn sm ghost", function () {
      var blob = new Blob([JSON.stringify(DB, null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      var d = new Date();
      a.download = "بيانات-المحامي-المحترف-" + d.getFullYear() + "-" +
        String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") + ".json";
      a.click();
      note("تم تنزيل نسخة من كل الشاشات");
    });

    var lb = document.createElement("label");
    lb.className = "btn sm ghost";
    lb.style.cssText = "display:inline-block;margin:0";
    lb.textContent = "⬆ استيراد";
    var fi = document.createElement("input");
    fi.type = "file"; fi.accept = ".json"; fi.style.display = "none";
    fi.setAttribute("data-nosave", "1");
    fi.onchange = function () {
      var f = fi.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var d = JSON.parse(rd.result);
          Ask.confirm("استيراد هذا الملف؟", {
            detail: "سيحلّ محل البيانات الحالية في كل الشاشات.",
            ok: "استيراد"
          }, function () {
            DB = d; if (!DB[SCREEN]) DB[SCREEN] = [];
            persist(); CURRENT = null; clearAll(); fill(); note("تم الاستيراد");
          });
        } catch (e) { alert("ملف غير صالح: " + e.message); }
      };
      rd.readAsText(f);
    };
    lb.appendChild(fi);
    b.appendChild(lb);

    var msg = document.createElement("span");
    msg.id = "__msg";
    msg.style.cssText = "flex:1;min-width:140px;font-size:12px";
    b.appendChild(msg);

    sel.onchange = function () {
      var id = sel.value;
      if (!id) { CURRENT = null; clearAll(); note("سجل جديد"); return; }
      var r = DB[SCREEN].find(function (x) { return x._id === id; });
      if (!r) return;
      CURRENT = id; clearAll(); writeRec(r); note("تم فتح السجل — عدّل ثم احفظ");
    };

    return b;
  }

  function fill() {
    var sel = document.getElementById("__recs");
    if (!sel) return;
    sel.innerHTML = '<option value="">— سجل جديد —</option>' +
      DB[SCREEN].map(function (r) {
        return '<option value="' + r._id + '"' + (r._id === CURRENT ? " selected" : "") + ">" +
          labelOf(r).replace(/</g, "&lt;") + "</option>";
      }).join("");
    var c = document.getElementById("__cnt");
    if (c) c.textContent = DB[SCREEN].length;
  }

  function note(t) {
    var m = document.getElementById("__msg");
    if (m) m.textContent = t;
  }

  /* ---------- تشغيل ---------- */
  function init() {
    load();
    var m = root();
    if (!m) return;
    /* الشاشات التي لا تحتوي حقول إدخال (الرئيسية · الفهارس) لا تحتاج الشريط */
    if (fields().length < 3) return;

    var b = bar();
    var first = m.firstElementChild;
    if (first) m.insertBefore(b, first); else m.appendChild(b);
    fill();
    note(DB[SCREEN].length ? "عدد السجلات المحفوظة: " + DB[SCREEN].length
                           : "لا توجد سجلات — املأ الشاشة واضغط «حفظ»");

    /* منع فقد البيانات عند مغادرة الصفحة بعد تعديل */
    window.addEventListener("beforeunload", function () { persist(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
