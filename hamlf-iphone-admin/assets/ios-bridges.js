/* =============================================================================
   Hamlf-iphone: بدائل جسور أندرويد (MainActivity.java) على الآيفون، علشان كل
   حاجة في صلاحيات المحامي تشتغل من نفس الكود من غير ما نعدّل الشاشات:
     AndroidFiles  ← المرفقات وصور التوكيلات: IndexedDB عن طريق sw.js
     AndroidSaver  ← حفظ/نسخة احتياطية: قائمة المشاركة (حفظ في الملفات) أو تنزيل
                     والطباعة: طباعة Safari
     AndroidShare  ← واتساب/إيميل/مشاركة بالملف: قائمة مشاركة الآيفون
     AndroidVoice  ← الإدخال بالصوت: التعرّف على الكلام في Safari
   مفيش بديل على الآيفون لـ: جهات الاتصال، الإشعارات المجدولة والتطبيق مقفول،
   التعبئة التلقائية في بوابة التقاضي، تقسيم PDF لصور، السكانر الخاص.
   ============================================================================= */
(function (w) {
  "use strict";
  var ctl = navigator.serviceWorker && navigator.serviceWorker.controller;
  if (!w.HAMLF_WEBSTORE || !ctl) return;   /* من غير sw.js مفيش مكان آمن للملفات */
  function post(m) { try { (navigator.serviceWorker.controller || ctl).postMessage(m); return true; } catch (e) { return false; } }

  /* ------------------------------------------------ الملفات (المرفقات) */
  var idx = w.__FILES || {}; try { delete w.__FILES; } catch (e) { }
  var mem = {};   /* اللي اتقرا أو اتكتب في الصفحة دي */
  /* قراية مباشرة من IndexedDB (نفس قاعدة sw.js) — مش متزامنة */
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (ok, bad) {
      var r = indexedDB.open("hamlf-admin-big", 2);
      r.onupgradeneeded = function () { var d = r.result;
        if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv");
        if (!d.objectStoreNames.contains("files")) d.createObjectStore("files"); };
      r.onsuccess = function () { ok(r.result); }; r.onerror = function () { dbp = null; bad(r.error); };
    });
    return dbp;
  }
  var loading = {};
  function fetchOne(id) {
    if (loading[id]) return loading[id];
    return (loading[id] = db().then(function (d) {
      return new Promise(function (ok) {
        var q = d.transaction("files", "readonly").objectStore("files").get(id);
        q.onsuccess = function () { if (q.result != null && idx[id]) mem[id] = String(q.result); ok(); };
        q.onerror = function () { ok(); };
      });
    }).catch(function () { }).then(function () { delete loading[id]; }));
  }
  /* تحميل مسبق في الخلفية لحد ٤٠ ميجا (الأحدث أولاً حسب الاسم) — أغلب الفتحات بتلاقي الملف جاهز */
  setTimeout(function () {
    var budget = 40e6, ids = Object.keys(idx).sort().reverse(), i = 0;
    (function next() {
      while (i < ids.length && (mem[ids[i]] != null || (idx[ids[i]] || 0) > budget)) i++;
      if (i >= ids.length || budget <= 0) return;
      var id = ids[i++]; budget -= idx[id] || 0;
      fetchOne(id).then(next);
    })();
  }, 300);
  function syncGet(id) {
    try {
      var x = new XMLHttpRequest();
      x.open("GET", "hamlf-files/" + encodeURIComponent(id), false);
      x.send();
      return x.status === 200 ? x.responseText : null;
    } catch (e) { return null; }
  }
  w.AndroidFiles = {
    put: function (id, b64) {
      id = String(id); b64 = String(b64 || "");
      if (!post({ hamlfFile: "put", k: id, v: b64 })) return false;
      mem[id] = b64; idx[id] = Math.round(b64.length * 3 / 4); return true;
    },
    get: function (id) {
      id = String(id);
      if (mem[id] != null) return mem[id];
      if (!idx[id]) return null;
      var v = syncGet(id);   /* لو Safari بيعدّي الطلب المتزامن على sw.js */
      if (v != null) { mem[id] = v; return v; }
      fetchOne(id);          /* وإلا بيتحمّل في الخلفية، والضغطة الجاية بتلاقيه */
      return null;
    },
    has: function (id) { return !!idx[String(id)]; },
    remove: function (id) { id = String(id); post({ hamlfFile: "remove", k: id }); delete mem[id]; delete idx[id]; return true; },
    list: function () { return Object.keys(idx).join("\n"); },
    usedBytes: function () { var n = 0; for (var k in idx) n += idx[k] || 0; return n; },
    freeBytes: function () { return w.__FREE || 5e9; }
  };
  try { navigator.storage && navigator.storage.estimate && navigator.storage.estimate().then(function (e) { w.__FREE = Math.max(0, (e.quota || 0) - (e.usage || 0)); }); } catch (e) { }

  /* ------------------------------------------------ الملفات الطالعة */
  var MIME = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", json: "application/json",
    html: "text/html", txt: "text/plain", zip: "application/zip", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", apk: "application/vnd.android.package-archive" };
  function mimeOf(n, m) { if (m) return m; var e = (String(n).match(/\.([a-z0-9]+)$/i) || [])[1]; return MIME[(e || "").toLowerCase()] || "application/octet-stream"; }
  function toFile(name, b64, mime) {
    var bin = atob(String(b64 || "")), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return new File([u], name || "ملف", { type: mimeOf(name, mime) });
  }
  function download(f) {
    var a = document.createElement("a"), url = URL.createObjectURL(f);
    a.href = url; a.download = f.name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 60000);
  }
  /* iOS بيطلب إن المشاركة تبدأ من ضغطة المستخدم؛ لو اتمنعت بنعرض زرار يكمّلها */
  function shareData(d, fallback) {
    if (!navigator.share || (d.files && navigator.canShare && !navigator.canShare({ files: d.files }))) { if (fallback) fallback(); return; }
    navigator.share(d).catch(function (e) {
      if (e && e.name === "AbortError") return;
      tapToShare(d, fallback);
    });
  }
  function tapToShare(d, fallback) {
    var b = document.createElement("button");
    b.textContent = "📤 اضغط هنا للمشاركة / الحفظ";
    b.style.cssText = "position:fixed;left:16px;right:16px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:100001;" +
      "padding:14px;border:0;border-radius:12px;background:#0f3d2e;color:#fff;font:600 16px system-ui;box-shadow:0 6px 20px #0005";
    b.onclick = function () { b.remove(); navigator.share(d).catch(function (e) { if (!(e && e.name === "AbortError") && fallback) fallback(); }); };
    document.body.appendChild(b);
    setTimeout(function () { if (b.isConnected) b.remove(); }, 20000);
  }
  function saveFile(name, b64, mime) {
    var f = toFile(name, b64, mime);
    shareData({ files: [f], title: f.name }, function () { download(f); });
  }
  function wa(to, text) {
    var n = String(to || "").replace(/\D/g, "");
    if (n && n.charAt(0) === "0") n = "2" + n;
    location.href = "https://wa.me/" + n + (text ? "?text=" + encodeURIComponent(text) : "");
  }
  function mailto(to, subj, body) {
    location.href = "mailto:" + encodeURIComponent(to || "") + "?subject=" + encodeURIComponent(subj || "") + "&body=" + encodeURIComponent(body || "");
  }

  w.AndroidSaver = {
    save: function (name, b64) { saveFile(name, b64); return true; },
    backup: function (name, b64, silent) { if (!silent) saveFile(name, b64, "application/json"); return true; },
    printPage: function () { setTimeout(function () { w.print(); }, 50); }
  };
  w.AndroidShare = {
    shareText: function (t) { shareData({ text: t }, function () { wa("", t); }); },
    shareFile: function (name, b64, mime) { saveFile(name, b64, mime); },
    sendWhatsApp: function (to, name, b64, mime, text) {
      if (b64) shareData({ files: [toFile(name, b64, mime)], text: text || "" }, function () { wa(to, text); });
      else wa(to, text);
    },
    sendEmail: function (to, subj, body, name, b64, mime) {
      if (b64) shareData({ files: [toFile(name, b64, mime)], title: subj, text: body }, function () { mailto(to, subj, body); });
      else mailto(to, subj, body);
    },
    openUrl: function (u) { w.open(u, "_blank") || (location.href = u); },
    sendApkToWhatsApp: function () { alert("إرسال تطبيق أندرويد متاح من موبايل أندرويد بس."); }
  };

  /* ------------------------------------------------ الإدخال بالصوت */
  var SR = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (SR) {
    w.AndroidVoice = {
      available: function () { return true; },
      listen: function (lang) {
        var r = new SR(), got = "";
        r.lang = lang || "ar-EG"; r.interimResults = false; r.maxAlternatives = 1;
        r.onresult = function (e) { got = (e.results[0] && e.results[0][0] && e.results[0][0].transcript) || ""; };
        r.onend = function () { if (w.__voiceResult) w.__voiceResult(got); };
        r.onerror = function () { };
        try { r.start(); } catch (e) { if (w.__voiceResult) w.__voiceResult(""); }
      }
    };
  }
  w.HAMLF_IPHONE = true;
})(window);
