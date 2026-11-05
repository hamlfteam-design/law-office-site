/* =============================================================================
   مزامنة بملف JSON — محلي أو على درايف المكتب (hamlfteam)، باختيار المستخدم:
   • محلي (ويندوز فقط، File System Access): اختيار ملف مرة واحدة داخل مجلد
     الدرايف المتزامن على الجهاز (showSaveFilePicker) ← يُحفظ المقبض في
     IndexedDB ← بعد أي تعديل بـ٤ ثوانٍ يُكتب JSON كامل في نفس الملف دائماً.
   • سحابي (عبر جسر Apps Script — نفس بوابة docs/drive-bridge/Code.gs): يرفع
     لنفس الملف الثابت "مزامنة النسخة الاحتياطية/HAMLF-بيانات-المزامنة.json"
     على درايف hamlfteam، ويحدّثه في مكانه (setContent) — لا يُنشئ نسخة جديدة
     في كل رفعة. الاسترجاع يقرأ نفس الملف من نفس المكان.
   • الموبايل بلا اختيار محلي (لا File System Access): يدوي — تنزيل الملف من
     الدرايف ثم «دمج من ملف»، أو الوضع السحابي لو متاح.
   • الاستيراد = دمج بالمعرّف (لا استبدال)؛ التعارض على نفس السجل يحسمه updatedAt/modified/ts إن وُجد، وإلا
     الأحدث زمناً (ملف أحدث من آخر تعديل محلي ← الملف يفوز، وإلا المحلي). لقطة قبل أي دمج (آخر ٨).
   • الحذف لا ينتقل بالدمج (يُوثَّق للمستخدم). الملف فيه بيانات موكلين: مجلد الدرايف خاص، ولا يُرفع لأي مستودع عام.
   ============================================================================= */
(function (w) {
  "use strict";
  var EXCLUDE = { "proflawyer.lastBackup": 1, "proflawyer.backupHistory.v1": 1, "proflawyer.sync.safetyBackup": 1 };
  var MODKEY = "proflawyer._localModAt";
  var supported = typeof w.showSaveFilePicker === "function";
  var origSet = Storage.prototype.setItem, origRemove = Storage.prototype.removeItem;

  /* ---------------- IndexedDB صغير ---------------- */
  function idb() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open("hamlf-filesync", 1);
      r.onupgradeneeded = function () { r.result.createObjectStore("kv"); };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    });
  }
  function kvGet(k) { return idb().then(function (db) { return new Promise(function (res) { var q = db.transaction("kv").objectStore("kv").get(k); q.onsuccess = function () { res(q.result); }; q.onerror = function () { res(undefined); }; }); }); }
  function kvSet(k, v) { return idb().then(function (db) { return new Promise(function (res) { var t = db.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = function () { res(); }; }); }); }

  /* ---------------- الحمولة ---------------- */
  function dataKeys() {
    var out = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf("proflawyer.") === 0 && !EXCLUDE[k] && k.indexOf("proflawyer._") !== 0) out.push(k);
    }
    return out;
  }
  function readKey(k) { var raw = localStorage.getItem(k); if (raw == null) return null; try { return JSON.parse(raw); } catch (e) { return raw; } }
  function payload() {
    var data = {}; dataKeys().forEach(function (k) { data[k] = readKey(k); });
    return JSON.stringify({ app: "المحامي المحترف", version: 2, exportedAt: new Date().toISOString(), data: data });
  }

  /* ---------------- سحابي: نفس جسر Apps Script المستعمَل لمستندات القضايا ---------------- */
  var SYNC_NAME = "HAMLF-بيانات-المزامنة.json";
  function driveCfg() { return w.DRIVE_BRIDGE && w.DRIVE_BRIDGE.url && w.DRIVE_BRIDGE.token ? w.DRIVE_BRIDGE : null; }
  function driveAvailable() { return !!driveCfg(); }
  function driveCall(body) {
    var c = driveCfg();
    if (!c) return Promise.reject(new Error("ربط الدرايف غير مُفعَّل في هذه النسخة."));
    body.token = c.token;
    return fetch(c.url, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(body) })
      .then(function (r) { return r.text(); })
      .then(function (t) {
        var j; try { j = JSON.parse(t); } catch (e) { throw new Error("رد غير متوقع من الدرايف."); }
        if (!j.ok) throw new Error(j.error === "unauthorized" ? "كلمة سر الجسر غير صحيحة." : (j.error || "تعذّر الاتصال بالدرايف."));
        return j;
      });
  }
  function textToB64(s) { return btoa(unescape(encodeURIComponent(s))); }
  function b64ToText(b) { return decodeURIComponent(escape(atob(b))); }
  function driveWriteNow() {
    return driveCall({ action: "syncUpload", name: SYNC_NAME, mime: "application/json", data: textToB64(payload()) })
      .then(function () { say("✓ حُفظ على درايف hamlfteam " + new Date().toLocaleTimeString("ar-EG")); return true; })
      .catch(function (e) { say("تعذّرت الكتابة على الدرايف: " + (e && e.message ? e.message : e)); return false; });
  }
  /** يقرأ ملف المزامنة من الدرايف ويدمجه (نفس دمج «دمج من ملف» يدوياً). */
  function driveRestore() {
    return driveCall({ action: "syncDownload", name: SYNC_NAME }).then(function (j) {
      return mergeText(b64ToText(j.data));
    });
  }

  /* ---------------- الكتابة التلقائية ---------------- */
  var handle = null, enabled = false, mode = "local", timer = 0, status = "", listeners = [];
  function say(s) { status = s; listeners.forEach(function (f) { try { f(s); } catch (e) { } }); }
  function schedule() {
    if (!enabled) return;
    if (mode === "local" && !handle) return;
    clearTimeout(timer); timer = setTimeout(writeNow, 4000);
  }
  function hasPerm(h, req) {
    var opt = { mode: "readwrite" };
    return h.queryPermission(opt).then(function (p) { if (p === "granted") return true; return req ? h.requestPermission(opt).then(function (q) { return q === "granted"; }) : false; });
  }
  function writeNow(fromClick) {
    if (!enabled) return Promise.resolve(false);
    if (mode === "drive") return driveWriteNow();
    if (!handle) return Promise.resolve(false);
    return hasPerm(handle, !!fromClick).then(function (ok) {
      if (!ok) { say("⚠ اضغط أي مكان في الصفحة للسماح بالكتابة في ملف المزامنة"); pendingPerm = true; return false; }
      return handle.createWritable().then(function (wr) {
        return wr.write(payload()).then(function () { return wr.close(); });
      }).then(function () { say("✓ حُفظ في ملف الدرايف المحلي " + new Date().toLocaleTimeString("ar-EG")); return true; });
    }).catch(function (e) { say("تعذّرت الكتابة: " + (e && e.message ? e.message : e)); return false; });
  }
  var pendingPerm = false;
  document.addEventListener("click", function () { if (pendingPerm && handle) { pendingPerm = false; writeNow(true); } }, true);

  /* التقاط أي تعديل على بيانات التطبيق */
  Storage.prototype.setItem = function (k, v) {
    origSet.call(this, k, v);
    if (this === localStorage && typeof k === "string" && k.indexOf("proflawyer.") === 0 && k.indexOf("proflawyer._") !== 0 && !EXCLUDE[k]) {
      try { origSet.call(localStorage, MODKEY, new Date().toISOString()); } catch (e) { }
      schedule();
    }
  };
  Storage.prototype.removeItem = function (k) {
    origRemove.call(this, k);
    if (this === localStorage && typeof k === "string" && k.indexOf("proflawyer.") === 0 && k.indexOf("proflawyer._") !== 0) schedule();
  };

  function init() {
    return Promise.all([kvGet("handle"), kvGet("enabled"), kvGet("mode")]).then(function (r) {
      handle = r[0] || null; enabled = !!r[1]; mode = r[2] || "local";
      if (mode === "local" && !handle) enabled = false;
      if (enabled && mode === "local") {
        hasPerm(handle, false).then(function (ok) { if (!ok) { pendingPerm = true; say("⚠ اضغط أي مكان في الصفحة للسماح بالكتابة في ملف المزامنة"); } else say("ملف المزامنة المحلي جاهز"); });
      } else if (enabled && mode === "drive") {
        say(driveAvailable() ? "مفعّل على درايف hamlfteam" : "⚠ ربط الدرايف غير مُفعَّل في هذه النسخة");
      }
    }).catch(function () { });
  }

  /** اختيار محلي: مرة واحدة داخل مجلد الدرايف المتزامن على الجهاز. */
  function chooseLocal() {
    if (!supported) return Promise.reject(new Error("هذا الجهاز لا يدعم اختيار ملف تلقائي — استخدم «دمج من ملف» يدوياً."));
    return w.showSaveFilePicker({ suggestedName: SYNC_NAME, types: [{ description: "JSON", accept: { "application/json": [".json"] } }] })
      .then(function (h) { handle = h; enabled = true; mode = "local"; return Promise.all([kvSet("handle", h), kvSet("enabled", true), kvSet("mode", "local")]); })
      .then(function () { return writeNow(true); });
  }
  /** سحابي: يرفع على درايف hamlfteam عبر جسر Apps Script (نفس ملف ثابت يتحدَّث دائماً). */
  function chooseDrive() {
    if (!driveAvailable()) return Promise.reject(new Error("ربط الدرايف غير مُفعَّل في هذه النسخة."));
    enabled = true; mode = "drive";
    return Promise.all([kvSet("enabled", true), kvSet("mode", "drive")]).then(function () { return writeNow(true); });
  }
  /* توافق مع أي كود قديم كان ينادي choose() مباشرة (محلي افتراضياً) */
  function choose() { return chooseLocal(); }
  function disable() { enabled = false; clearTimeout(timer); return kvSet("enabled", false).then(function () { say("أُوقفت الكتابة التلقائية"); }); }

  /* ---------------- الدمج ---------------- */
  function isObj(x) { return x && typeof x === "object" && !Array.isArray(x); }
  function stamp(x) { var t = x && (x.updatedAt || x.modified || x.ts); var n = t ? Date.parse(t) : 0; return isNaN(n) ? 0 : n; }
  function mergeVal(local, inc, incNewer) {
    if (Array.isArray(local) && Array.isArray(inc)) {
      var out = local.slice(), idx = {};
      out.forEach(function (x, i) { if (x && typeof x === "object" && x.id != null) idx[x.id] = i; });
      inc.forEach(function (x) {
        if (x && typeof x === "object" && x.id != null) {
          if (idx[x.id] == null) { idx[x.id] = out.length; out.push(x); return; }
          var L = out[idx[x.id]];
          if (JSON.stringify(L) === JSON.stringify(x)) return;
          var lt = stamp(L), it = stamp(x);
          var takeInc = (lt || it) ? it > lt : incNewer;
          if (takeInc) out[idx[x.id]] = x;
        } else if (!out.some(function (y) { return JSON.stringify(y) === JSON.stringify(x); })) out.push(x);
      });
      return out;
    }
    if (isObj(local) && isObj(inc)) {
      var o = {}; Object.keys(local).forEach(function (k) { o[k] = local[k]; });
      Object.keys(inc).forEach(function (k) { o[k] = (k in local) ? mergeVal(local[k], inc[k], incNewer) : inc[k]; });
      return o;
    }
    return local;   /* قيم مفردة/إعدادات: نُبقي المحلي */
  }

  function snapshot() {
    return kvGet("snaps").then(function (s) {
      s = s || []; s.unshift({ at: new Date().toISOString(), json: payload() });
      return kvSet("snaps", s.slice(0, 8));
    });
  }
  function snapshots() { return kvGet("snaps").then(function (s) { return s || []; }); }

  /** يدمج نص ملف JSON في البيانات المحلية. يعيد {keys, added, updated}. */
  function mergeText(text) {
    var raw; try { raw = JSON.parse(text); } catch (e) { return Promise.reject(new Error("الملف ليس JSON صالحاً.")); }
    var data = raw && raw.data;
    if (!data) return Promise.reject(new Error("هذا ليس ملف مزامنة من هذا التطبيق."));
    var fileAt = Date.parse(raw.exportedAt) || 0, localAt = Date.parse(localStorage.getItem(MODKEY)) || 0;
    var incNewer = fileAt > localAt;
    return snapshot().then(function () {
      var changed = 0;
      Object.keys(data).forEach(function (k) {
        if (k.indexOf("proflawyer.") !== 0 || EXCLUDE[k] || k.indexOf("proflawyer._") === 0 || data[k] == null) return;
        var local = readKey(k), merged = local == null ? data[k] : mergeVal(local, data[k], incNewer);
        var s = typeof merged === "string" ? merged : JSON.stringify(merged);
        if (s !== localStorage.getItem(k)) { origSet.call(localStorage, k, s); changed++; }
      });
      try { origSet.call(localStorage, MODKEY, new Date().toISOString()); } catch (e) { }
      schedule();
      return { keys: changed, incomingNewer: incNewer };
    });
  }
  function restoreSnapshot(i) {
    return snapshots().then(function (s) {
      if (!s[i]) throw new Error("لا توجد لقطة");
      var raw = JSON.parse(s[i].json);
      Object.keys(raw.data || {}).forEach(function (k) { if (raw.data[k] != null) origSet.call(localStorage, k, typeof raw.data[k] === "string" ? raw.data[k] : JSON.stringify(raw.data[k])); });
      schedule(); return true;
    });
  }

  /* لوحة صغيرة: محلي أم سحابي؟ — نفس أسلوب Ask.confirm لكن باختيارين مُسمَّيين. */
  function askLocalOrDrive(cb) {
    var back = document.createElement("div");
    back.setAttribute("data-nosave", "1"); back.setAttribute("data-modal", "1");
    back.style.cssText = "position:fixed;inset:0;background:rgba(20,14,8,.6);z-index:10060;display:flex;align-items:flex-end;justify-content:center";
    var box = document.createElement("div");
    box.style.cssText = "background:#fff;border-radius:16px 16px 0 0;padding:18px;width:100%;max-width:480px;direction:rtl";
    var t = document.createElement("div"); t.style.cssText = "font-family:var(--f-title);font-size:16.5px;margin-bottom:12px"; t.textContent = "تحتفظ بملف المزامنة فين؟";
    box.appendChild(t);
    function opt(label, detail, fn) {
      var btn = document.createElement("button"); btn.type = "button";
      btn.style.cssText = "display:block;width:100%;text-align:right;padding:13px 14px;margin-bottom:9px;border-radius:11px;border:1px solid #ddd4c8;background:#fff;font-family:inherit;min-height:56px";
      btn.innerHTML = "<b style='display:block;font-size:15px'>" + label + "</b><span style='font-size:12.5px;color:#7d7166'>" + detail + "</span>";
      btn.onclick = function () { back.remove(); fn(); };
      box.appendChild(btn);
    }
    opt("💻 محلي على هذا الجهاز", "ملف داخل مجلد الدرايف المتزامن على الكمبيوتر (يحتاج ويندوز).", function () { cb("local"); });
    opt("☁ سحابي على درايف hamlfteam", "يُرفع لدرايف المكتب مباشرة ويتحدَّث في مكانه — يفتح من أي جهاز.", function () { cb("drive"); });
    var cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "إلغاء";
    cancel.style.cssText = "width:100%;padding:12px;border:0;border-radius:11px;background:#eee;font-family:inherit;min-height:46px";
    cancel.onclick = function () { back.remove(); };
    box.appendChild(cancel);
    back.appendChild(box);
    back.onclick = function (e) { if (e.target === back) back.remove(); };
    document.body.appendChild(back);
  }

  /* ---------------- واجهة في شاشة النسخ الاحتياطي ---------------- */
  function ui() {
    var host = document.querySelector("main");
    if (!host || document.getElementById("dfsBox")) return;
    var box = document.createElement("div"); box.id = "dfsBox"; box.setAttribute("data-nosave", "1");
    box.style.cssText = "margin:14px 0;padding:14px;border:1px solid #c9b48f;border-radius:12px;background:#fffdf8;line-height:1.9";
    var b = function (t, css, fn) { var x = document.createElement("button"); x.type = "button"; x.textContent = t; x.style.cssText = "min-height:46px;padding:0 14px;border-radius:10px;font-family:inherit;font-size:14px;margin:4px 4px 0 0;" + css; x.onclick = fn; return x; };
    var h = document.createElement("div"); h.style.cssText = "font-family:var(--f-title);font-size:15.5px;margin-bottom:6px"; h.textContent = "🔗 مزامنة بملف — محلي أو على درايف المكتب";
    var d = document.createElement("div"); d.style.cssText = "font-size:13px;color:#7d7166"; d.innerHTML =
      "اختر محلي (ويندوز) أو سحابي (درايف hamlfteam) — أي رفعة بعدها تُحدِّث نفس الملف، لا تُنشئ نسخة جديدة. " +
      "الموبايل بلا اختيار محلي: نزّل الملف من الدرايف ثم «دمج من ملف»، أو استعمل الوضع السحابي. الدمج بالمعرّف (لا يستبدل) — <b>الحذف لا ينتقل بالدمج</b>.";
    var st = document.createElement("div"); st.style.cssText = "margin:8px 0;font-size:13.5px;color:#1e5b33;font-weight:700";
    st.textContent = enabled ? status || (mode === "drive" ? "مفعّل على درايف hamlfteam" : "ملف المزامنة المحلي جاهز")
                              : (supported || driveAvailable() ? "غير مفعّل" : "هذا الجهاز: دمج يدوي فقط");
    listeners.push(function (s) { st.textContent = s; });
    box.appendChild(h); box.appendChild(d); box.appendChild(st);
    if (supported || driveAvailable()) {
      box.appendChild(b("📁 اختيار ملف المزامنة", "border:0;background:#1a4a8a;color:#fff;font-weight:700", function () {
        askLocalOrDrive(function (choice) {
          var p = choice === "drive" ? chooseDrive() : chooseLocal();
          p.catch(function (e) { if (e && e.name !== "AbortError") alert(e.message || e); });
        });
      }));
      box.appendChild(b("💾 كتابة الآن", "border:1px solid #1a4a8a;background:#fff;color:#1a4a8a", function () { writeNow(true); }));
      box.appendChild(b("⏸ إيقاف", "border:1px solid #ccc;background:#fff;color:#555", function () { disable(); }));
    }
    if (driveAvailable()) {
      box.appendChild(b("⬇ استرجاع من درايف hamlfteam", "border:1px solid #7a5a2a;background:#fff;color:#7a5a2a", function () {
        if (!confirm("استرجاع أحدث نسخة من درايف hamlfteam ودمجها فوق بياناتك الحالية؟")) return;
        driveRestore().then(function (r) {
          alert("تم الدمج (" + r.keys + " مجموعة بيانات تغيّرت" + (r.incomingNewer ? " — ملف الدرايف أحدث فاعتُمد عند التعارض" : " — بياناتك المحلية أحدث فاحتُفظ بها عند التعارض") + ").\nأُخذت لقطة قبل الدمج.");
          location.reload();
        }).catch(function (e) {
          alert(e && e.message === "no_file" ? "مفيش ملف مزامنة مرفوع على الدرايف بعد." : (e && e.message ? e.message : e));
        });
      }));
    }
    var inp = document.createElement("input"); inp.type = "file"; inp.accept = ".json,application/json"; inp.style.display = "none";
    inp.onchange = function () {
      var f = inp.files && inp.files[0]; inp.value = ""; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        mergeText(String(rd.result)).then(function (r) {
          alert("تم الدمج (" + r.keys + " مجموعة بيانات تغيّرت" + (r.incomingNewer ? " — الملف أحدث فاعتُمد عند التعارض" : " — بياناتك المحلية أحدث فاحتُفظ بها عند التعارض") + ").\
أُخذت لقطة قبل الدمج.");
          location.reload();
        }).catch(function (e) { alert(e.message || e); });
      };
      rd.readAsText(f, "utf-8");
    };
    box.appendChild(inp);
    box.appendChild(b("📥 دمج من ملف…", "border:1px solid #7a5a2a;background:#fff;color:#7a5a2a", function () { inp.click(); }));
    var snapBtn = b("↩ استرجاع لقطة", "border:1px solid #b3261e;background:#fff;color:#b3261e", function () {
      snapshots().then(function (s) {
        if (!s.length) { alert("لا توجد لقطات بعد."); return; }
        var msg = s.map(function (x, i) { return (i + 1) + ") " + x.at.replace("T", " ").slice(0, 16); }).join("\
");
        var n = parseInt(prompt("اختر رقم اللقطة للاسترجاع:\
" + msg, "1"), 10);
        if (n >= 1 && n <= s.length && confirm("استرجاع لقطة " + n + "؟ (تُدمج فوق الحالي)")) restoreSnapshot(n - 1).then(function () { alert("تم."); location.reload(); });
      });
    });
    box.appendChild(snapBtn);
    host.insertBefore(box, host.firstChild.nextSibling || null);
  }

  w.DriveFileSync = { supported: supported, init: init, choose: choose, writeNow: writeNow, mergeText: mergeText, snapshots: snapshots, payload: payload, _merge: mergeVal };
  init().then(function () { if (document.getElementById("doBackup")) { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ui); else ui(); } });
})(window);
