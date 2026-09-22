/* =============================================================================
   بناء ملف PDF من صور — بلا مكتبات خارجية.

   المطلوب أن تُدمج مرفقات الدفعة الواحدة في ملف PDF واحد. والتطبيق يعمل
   أوفلاين داخل WebView بسياسة محتوى تمنع تحميل أي مكتبة من الشبكة، فلا
   سبيل إلا كتابة المولِّد هنا.

   الطريقة: صفحة لكل صورة، والصورة تُضمَّن كما هي بترميز JPEG عبر مرشِّح
   DCTDecode — فلا يُعاد ترميزها ولا يزيد الحجم. والصفحة بمقاس A4 تُوسَّط
   فيها الصورة بأكبر قياس يحفظ نسبتها.

   المخرج Uint8Array — يُحفظ أو يُطبع أو يُشارك.
   ============================================================================= */
(function (w) {
  "use strict";

  /* A4 بالنقاط الطباعية: ٥٩٥٫٢٨ × ٨٤١٫٨٩ */
  var A4W = 595.28, A4H = 841.89, MARGIN = 18;

  function latin1(str) {
    var out = new Uint8Array(str.length);
    for (var i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
    return out;
  }

  function b64ToBytes(b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /** يقرأ أبعاد صورة JPEG من بايتاتها — لا نحتاج تحميلها في الصفحة. */
  function jpegSize(bytes) {
    var i = 2;
    while (i < bytes.length) {
      if (bytes[i] !== 0xFF) { i++; continue; }
      var marker = bytes[i + 1];
      /* علامات بداية الإطار تحمل الأبعاد */
      if (marker >= 0xC0 && marker <= 0xCF &&
          marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
        return { h: (bytes[i + 5] << 8) | bytes[i + 6],
                 w: (bytes[i + 7] << 8) | bytes[i + 8] };
      }
      var len = (bytes[i + 2] << 8) | bytes[i + 3];
      i += 2 + len;
    }
    return null;
  }

  /** هل الصورة رمادية؟ عدد المكوّنات في إطار JPEG. */
  function jpegComponents(bytes) {
    var i = 2;
    while (i < bytes.length) {
      if (bytes[i] !== 0xFF) { i++; continue; }
      var marker = bytes[i + 1];
      if (marker >= 0xC0 && marker <= 0xCF &&
          marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
        return bytes[i + 9];
      }
      var len = (bytes[i + 2] << 8) | bytes[i + 3];
      i += 2 + len;
    }
    return 3;
  }

  /**
   * يبني PDF من صور JPEG.
   * @param {Array} images  [{ bytes:Uint8Array }] أو [dataUrl]
   * @returns {Uint8Array}
   */
  function fromJpegs(images) {
    var imgs = images.map(function (x) {
      var bytes;
      if (typeof x === "string") {
        var c = x.indexOf(",");
        bytes = b64ToBytes(c >= 0 ? x.slice(c + 1) : x);
      } else if (x && x.bytes) {
        bytes = x.bytes;
      } else {
        bytes = x;
      }
      var s = jpegSize(bytes) || { w: 1000, h: 1400 };
      return { bytes: bytes, w: s.w, h: s.h, comps: jpegComponents(bytes) };
    }).filter(function (x) { return x.bytes && x.bytes.length; });

    if (!imgs.length) return null;

    var objects = [];        /* كل عنصر: Uint8Array لجسم الكائن كاملاً */

    function push(str, raw) {
      objects.push({ head: str, raw: raw || null });
      return objects.length;             /* رقم الكائن يبدأ من ١ */
    }

    /* الكائنات: ١ الفهرس · ٢ الصفحات · ثم لكل صورة ثلاثةٌ */
    var catalogNo = push("");            /* يُملأ لاحقاً */
    var pagesNo   = push("");

    var kids = [];
    imgs.forEach(function (im) {
      /* الصورة نفسها */
      var imgNo = push(
        "<</Type/XObject/Subtype/Image/Width " + im.w + "/Height " + im.h +
        "/ColorSpace/" + (im.comps === 1 ? "DeviceGray" : "DeviceRGB") +
        "/BitsPerComponent 8/Filter/DCTDecode/Length " + im.bytes.length + ">>\n" +
        "stream\n", im.bytes);

      /* أكبر قياس يحفظ النسبة داخل هوامش الصفحة */
      var maxW = A4W - MARGIN * 2, maxH = A4H - MARGIN * 2;
      var scale = Math.min(maxW / im.w, maxH / im.h);
      var dw = im.w * scale, dh = im.h * scale;
      var x = (A4W - dw) / 2, y = (A4H - dh) / 2;

      var content = "q\n" + dw.toFixed(2) + " 0 0 " + dh.toFixed(2) + " " +
                    x.toFixed(2) + " " + y.toFixed(2) + " cm\n/Im0 Do\nQ\n";
      var contNo = push("<</Length " + content.length + ">>\nstream\n",
                        latin1(content));

      var pageNo = push(
        "<</Type/Page/Parent " + pagesNo + " 0 R" +
        "/MediaBox[0 0 " + A4W.toFixed(2) + " " + A4H.toFixed(2) + "]" +
        "/Resources<</XObject<</Im0 " + imgNo + " 0 R>>/ProcSet[/PDF/ImageB/ImageC]>>" +
        "/Contents " + contNo + " 0 R>>");
      kids.push(pageNo);
    });

    objects[catalogNo - 1].head = "<</Type/Catalog/Pages " + pagesNo + " 0 R>>";
    objects[pagesNo - 1].head =
      "<</Type/Pages/Kids[" + kids.map(function (n) { return n + " 0 R"; }).join(" ") +
      "]/Count " + kids.length + ">>";

    /* التجميع مع حساب المواضع بدقّة البايت */
    var parts = [], offsets = [], pos = 0;
    function add(bytes) { parts.push(bytes); pos += bytes.length; }

    add(latin1("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n"));

    objects.forEach(function (o, i) {
      offsets[i] = pos;
      add(latin1((i + 1) + " 0 obj\n" + o.head));
      if (o.raw) {
        add(o.raw);
        add(latin1("\nendstream"));
      }
      add(latin1("\nendobj\n"));
    });

    var xref = pos;
    var x = "xref\n0 " + (objects.length + 1) + "\n0000000000 65535 f \n";
    offsets.forEach(function (off) {
      x += ("0000000000" + off).slice(-10) + " 00000 n \n";
    });
    x += "trailer\n<</Size " + (objects.length + 1) + "/Root " + catalogNo + " 0 R>>\n" +
         "startxref\n" + xref + "\n%%EOF\n";
    add(latin1(x));

    var total = parts.reduce(function (n, p) { return n + p.length; }, 0);
    var out = new Uint8Array(total), at = 0;
    parts.forEach(function (p) { out.set(p, at); at += p.length; });
    return out;
  }

  function toBase64(bytes) {
    var chunk = 0x8000, s = "";
    for (var i = 0; i < bytes.length; i += chunk) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(s);
  }

  w.PdfBuild = {
    fromJpegs: fromJpegs, toBase64: toBase64,
    jpegSize: jpegSize, A4: { w: A4W, h: A4H }
  };
})(window);
