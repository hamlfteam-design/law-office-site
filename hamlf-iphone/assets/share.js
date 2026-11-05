/* =============================================================================
   المشاركة — إرسال الملف نصاً أو PDF عبر واتساب/إيميل، أو حفظه.

   المطلوب: زر إرسال بجوار الطباعة، لا بدلها. والإرسال الحقيقي لملف PDF عبر
   واتساب أو الإيميل يحتاج «ورقة المشاركة» في أندرويد (Intent) — يوفّرها جسر
   AndroidShare. فإن وُجد الجسر أرسلنا الملف فعلاً؛ وإلا سقطنا إلى فتح واتساب
   أو الإيميل بالنصّ، أو حفظ الملف في التنزيلات ليُرفق يدوياً.
   ============================================================================= */
(function (w) {
  "use strict";

  var hasShare = (typeof AndroidShare !== "undefined" && AndroidShare);

  function b64Text(text) {
    /* UTF‑8 → base64 */
    var bytes = new TextEncoder().encode(text);
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  /** يشارك نصاً — يفتح ورقة المشاركة إن وُجد الجسر، وإلا خيارات مباشرة. */
  function shareText(text, opts) {
    opts = opts || {};
    if (hasShare && AndroidShare.shareText) { AndroidShare.shareText(text); return true; }
    /* بديل: نافذة خيارات */
    picker([
      ["واتساب", function () {
        window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank");
      }],
      ["الإيميل", function () {
        window.location.href = "mailto:?subject=" +
          encodeURIComponent(opts.subject || "ملف من المحامي المحترف") +
          "&body=" + encodeURIComponent(text);
      }],
      ["حفظ txt", function () {
        saveFile((opts.name || "ملف") + ".txt", b64Text(text), "text/plain");
      }]
    ], "إرسال نصاً");
    return true;
  }

  /**
   * يشارك ملف PDF (base64). عبر الجسر يفتح ورقة المشاركة (واتساب/إيميل/…)؛
   * وإلا يُحفظ في التنزيلات ليُرفق يدوياً.
   */
  function sharePdf(b64, name) {
    name = (name || "ملف") + ".pdf";
    if (hasShare && AndroidShare.shareFile) {
      AndroidShare.shareFile(name, b64, "application/pdf");
      return true;
    }
    /* لا جسر: احفظه وأخبر المستخدم */
    saveFile(name, b64, "application/pdf");
    alert("حُفظ الملف في التنزيلات — أرفقه من واتساب أو الإيميل." +
          String.fromCharCode(10) + name);
    return true;
  }

  /** يشارك أي ملف (صورة/PDF/أي نوع) بامتداده ونوعه الصحيحين — نسخة عامة من
      sharePdf لمستندات الموكل الفردية (صور توكيلات/إثبات شخصية) التي
      يطلبها بريداً/واتساباً. راجع [[feedback_apply_fixes_app_wide]]. */
  function shareFile(b64, name, mime) {
    if (hasShare && AndroidShare.shareFile) { AndroidShare.shareFile(name, b64, mime); return true; }
    saveFile(name, b64, mime);
    alert("حُفظ الملف في التنزيلات — أرفقه من واتساب أو الإيميل." +
          String.fromCharCode(10) + name);
    return true;
  }

  function saveFile(name, b64, mime) {
    if (w.AndroidSaver && AndroidSaver.save) { AndroidSaver.save(name, b64); return; }
    var a = document.createElement("a");
    a.href = "data:" + (mime || "application/octet-stream") + ";base64," + b64;
    a.download = name;
    a.click();
  }

  /** نافذة خيارات بسيطة على المتصفح (بديل ورقة أندرويد). */
  function picker(items, title) {
    var back = document.createElement("div");
    back.setAttribute("data-nosave", "1");
    back.style.cssText = "position:fixed;inset:0;background:rgba(20,14,8,.6);z-index:10090;" +
      "display:flex;align-items:flex-end;justify-content:center";
    var box = document.createElement("div");
    box.style.cssText = "background:var(--card,#fff);border-radius:18px 18px 0 0;" +
      "padding:18px;width:100%;max-width:520px;direction:rtl";
    var h = document.createElement("div");
    h.style.cssText = "font-family:var(--f-title);font-size:17px;margin-bottom:12px";
    h.textContent = title || "مشاركة";
    box.appendChild(h);
    items.forEach(function (it) {
      var b = document.createElement("button");
      b.type = "button"; b.textContent = it[0];
      b.style.cssText = "width:100%;min-height:50px;margin-bottom:9px;border:1px solid var(--line,#ddd);" +
        "border-radius:11px;background:transparent;color:var(--brand);font-family:inherit;font-size:16px";
      b.onclick = function () { back.remove(); it[1](); };
      box.appendChild(b);
    });
    var c = document.createElement("button");
    c.type = "button"; c.textContent = "إلغاء";
    c.style.cssText = "width:100%;min-height:46px;border:0;border-radius:11px;" +
      "background:var(--line,#eee);color:var(--text);font-family:inherit;font-size:15px";
    c.onclick = function () { back.remove(); };
    box.appendChild(c);
    back.appendChild(box);
    back.onclick = function (e) { if (e.target === back) back.remove(); };
    document.body.appendChild(back);
  }

  /** طباعة معزولة: تُطبع النافذة المعلَّمة .print-overlay وحدها.
     نعزل بأنماطٍ سطرية (لا نعتمد على @media print وحده — بعض إصدارات WebView
     تطبع بوسط الشاشة لا الطباعة فتتكرّر العناصر الثابتة). نُخفي كل شيءٍ عدا
     الورقة، ونجعل الغلاف عادياً بلا تثبيت ولا تكبير ولا ارتفاعٍ زائد. */
  function printOverlay(title) {
    var ov = document.querySelector(".print-overlay");
    var restore = [];
    if (ov) {
      Array.prototype.forEach.call(document.body.children, function (ch) {
        if (ch !== ov && ch.style.display !== "none") {
          restore.push([ch, "display", ch.style.display]);
          ch.style.display = "none";
        }
      });
      var pg = ov.querySelector(".print-page") || ov;
      [[ov, "position", "static"], [ov, "inset", "auto"], [ov, "height", "auto"],
       [ov, "maxHeight", "none"], [ov, "overflow", "visible"], [ov, "background", "#fff"],
       [ov, "padding", "0"], [ov, "zoom", "1"],
       [pg, "boxShadow", "none"], [pg, "maxWidth", "none"], [pg, "margin", "0"]
      ].forEach(function (s) {
        restore.push([s[0], s[1], s[0].style[s[1]]]);
        s[0].style[s[1]] = s[2];
      });
      var hadZoom = document.body.style.zoom;
      restore.push([document.body, "zoom", hadZoom]);
      document.body.style.zoom = "1";
    }
    document.body.classList.add("printing");
    function done() {
      document.body.classList.remove("printing");
      restore.forEach(function (r) { r[0].style[r[1]] = r[2]; });
    }
    if (w.AndroidSaver && AndroidSaver.printPage) {
      AndroidSaver.printPage(title || "طباعة");
      setTimeout(done, 1800);
    } else {
      window.print();
      setTimeout(done, 500);
    }
  }

  w.Share = {
    shareText: shareText, sharePdf: sharePdf, shareFile: shareFile, saveFile: saveFile,
    printOverlay: printOverlay, b64Text: b64Text, hasBridge: !!hasShare
  };
})(window);
