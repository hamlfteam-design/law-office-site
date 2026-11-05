/* =============================================================================
   مستندات القضايا على درايف hamlfteam — عبر «جسر» Apps Script (docs/drive-bridge/Code.gs).
   المجلد: مستندات العملاء / [اسم الموكل] / [ملف رقم … — الموضوع]. الملفات خاصة (Restricted).
   الإعداد (الرابط + كلمة السر) في drive-config.js — موجود في نسخة المدير فقط، محذوف من نسخة المحامين.
   ============================================================================= */
(function (w) {
  "use strict";
  var MAX = 20 * 1024 * 1024;   // حد آمن لطلب Apps Script (~٥٠م بعد base64)

  function cfg() { return w.DRIVE_BRIDGE && w.DRIVE_BRIDGE.url && w.DRIVE_BRIDGE.token ? w.DRIVE_BRIDGE : null; }
  function available() { return !!cfg(); }

  function call(payload) {
    var c = cfg();
    if (!c) return Promise.reject(new Error("ربط الدرايف غير مُفعَّل في هذه النسخة."));
    payload.token = c.token;
    return fetch(c.url, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(payload) })
      .then(function (r) { return r.text(); })
      .then(function (t) {
        var j; try { j = JSON.parse(t); } catch (e) { throw new Error("رد غير متوقع من الدرايف."); }
        if (!j.ok) throw new Error(j.error === "unauthorized" ? "كلمة سر الجسر غير صحيحة." : (j.error || "تعذّر الاتصال بالدرايف."));
        return j;
      });
  }

  function readB64(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { var s = String(fr.result); res(s.slice(s.indexOf(",") + 1)); };
      fr.onerror = function () { rej(new Error("تعذّرت قراءة الملف.")); };
      fr.readAsDataURL(file);
    });
  }

  function labels(c) {
    var first = String(c.clients || "").split("·")[0].replace(/\([^)]*\)/g, "").trim() || "بدون موكل";
    var subj = String(c.subject || "").trim().slice(0, 40);
    var cl = "ملف " + (c.fileNo || c.id) + (c.caseNo ? " — قضية " + c.caseNo + (c.caseYear ? "/" + c.caseYear : "") : "") + (subj ? " — " + subj : "");
    return { client: first, caseLabel: cl };
  }

  /** يرفع ملفاً لمجلد قضية؛ يعيد {id,name,url,size,date,mime} + folderId */
  function upload(file, c) {
    if (file.size > MAX) return Promise.reject(new Error("الملف أكبر من ٢٠ ميجا — قسّمه أو ضغطه."));
    var L = labels(c);
    return readB64(file).then(function (b64) {
      return call({ action: "upload", client: L.client, caseLabel: L.caseLabel, name: file.name, mime: file.type || "application/octet-stream", data: b64 });
    }).then(function (j) {
      return { doc: { id: j.file.id, name: j.file.name, url: j.file.url, size: j.file.size, mime: file.type || "", date: new Date().toISOString().slice(0, 10) },
               folder: j.folder };
    });
  }

  function trash(fileId) { return call({ action: "delete", fileId: fileId }); }
  function openFolder(c) { return call({ action: "ensure", client: labels(c).client, caseLabel: labels(c).caseLabel }); }

  w.DriveDocs = { available: available, upload: upload, trash: trash, openFolder: openFolder, MAX: MAX };
})(window);
