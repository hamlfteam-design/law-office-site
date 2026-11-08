/* =============================================================================
   المرفقات — تخزين داخلي على الهاتف.

   كانت الصور تُحفظ في localStorage وسعته نحو خمسة ميجابايت للتطبيق كله،
   فتمتلئ بعد صور قليلة ويتوقف الحفظ بلا إنذار. الآن تُكتب ملفاتٍ حقيقية
   في التخزين الداخلي الخاص بالتطبيق عبر جسر AndroidFiles، فلا حدّ عملي
   إلا مساحة الجهاز.

   الضغط عند الحفظ فقط: تُصغَّر الصورة إلى حدٍّ معقول وتُحوَّل JPEG، ثم
   **تُعرض وتُطبع بأبعادها الكاملة** كما هي مخزَّنة — لا صورة مصغَّرة.

   في المتصفح (بلا أندرويد) يعمل الملف على localStorage تلقائياً للتجربة.
   ============================================================================= */
(function (w) {
  "use strict";

  var FALLBACK_KEY = "proflawyer.attachments.v1";
  var MAX_EDGE     = 2200;   // أطول ضلع بعد الضغط — يكفي لقراءة توكيل وطباعته
  var QUALITY      = 0.82;

  var native = (typeof AndroidFiles !== "undefined" && AndroidFiles && AndroidFiles.put);

  /* -------------------------------------------------- تحسين تلقائي للصورة
     صور الكاميرا (توكيلات وبطاقات رقم قومي غالباً) بتيجي فاتحة/غامقة أو
     فيها ظل جانبي. تمديد تباين تلقائي لكل قناة لونية على حدة (percentile
     stretch) بيرفع الظل ويوضّح النص بلا ما يلوّن الصورة أو يبطّئ الحفظ —
     يُحسب على عيّنة مصغّرة (سريع) ثم يُطبَّق كجدول LUT على الصورة كاملة. */
  function autoEnhance(cx, cw, ch) {
    try {
      var full = cx.getImageData(0, 0, cw, ch);
      var d = full.data, n = d.length;

      /* هستوجرام لكل قناة من نفس البيانات (بلا إعادة رسم) لسرعة الحساب */
      var histR = new Uint32Array(256), histG = new Uint32Array(256), histB = new Uint32Array(256);
      var total = 0;
      var step = Math.max(1, Math.floor((n / 4) / 250000) * 4);  /* عيّنة تكفي لتوزيع موثوق */
      for (var i = 0; i < n; i += step) {
        histR[d[i]]++; histG[d[i + 1]]++; histB[d[i + 2]]++; total++;
      }

      function bounds(hist) {
        var lo = 0, hi = 255, seen = 0, cut = total * 0.006;   /* ٪٠.٦ تقليم من كل طرف */
        for (lo = 0; lo < 255; lo++) { seen += hist[lo]; if (seen >= cut) break; }
        seen = 0;
        for (hi = 255; hi > 0; hi--) { seen += hist[hi]; if (seen >= cut) break; }
        if (hi - lo < 40) { lo = Math.max(0, lo - 20); hi = Math.min(255, hi + 20); }
        return [lo, hi];
      }
      var bR = bounds(histR), bG = bounds(histG), bB = bounds(histB);

      function lut(b) {
        var lo = b[0], hi = b[1], t = new Uint8ClampedArray(256), sc = 255 / Math.max(1, hi - lo);
        for (var v = 0; v < 256; v++) t[v] = (v - lo) * sc;
        return t;
      }
      var lR = lut(bR), lG = lut(bG), lB = lut(bB);

      for (var j = 0; j < n; j += 4) {
        d[j]     = lR[d[j]];
        d[j + 1] = lG[d[j + 1]];
        d[j + 2] = lB[d[j + 2]];
      }
      cx.putImageData(full, 0, 0);
    } catch (e) { /* أي خطأ هنا لا يوقف الحفظ — تُحفظ الصورة كما التُقطت */ }
  }

  /* ------------------------------------------- محاذاة تلقائية لحواف المستند

     صور الكاميرا لبطاقة أو توكيل نادراً ما تكون الورقة فيها مضبوطة الأطراف
     ومربّعة تماماً مع الإطار. هنا نكتشف حواف المستند تلقائياً (أكبر منطقة
     متباينة عن الخلفية) ثم "نُسوّي" منظورها لمستطيل مضبوط — بلا أي مكتبة
     خارجية، بحساب مباشر بالـcanvas.

     الخطوات: تصغير للكشف السريع ← تدرج رمادي ← عتبة Otsu ← أكبر مكوّن متصل
     (نجرّب المنطقة الغامقة كمقدّمة، وإن فشلت نجرّب الفاتحة) ← أركان المستطيل
     التقريبية من نهايات x+y وx−y ← تسوية المنظور (تحويل إسقاطي) للحجم
     الأصلي. أي خطوة غير واثقة (المساحة صغيرة/كبيرة جداً) تُلغي العملية
     وتُبقي الصورة كما التُقطت — أفضل من قصّ خاطئ يُفسد المستند. */
  function autoCropDocument(srcCanvas) {
    try {
      var sw = srcCanvas.width, sh = srcCanvas.height;
      var scale = Math.min(1, 480 / Math.max(sw, sh));
      var ww = Math.max(1, Math.round(sw * scale)), wh = Math.max(1, Math.round(sh * scale));

      var wc = document.createElement("canvas");
      wc.width = ww; wc.height = wh;
      var wctx = wc.getContext("2d");
      wctx.drawImage(srcCanvas, 0, 0, ww, wh);
      var img = wctx.getImageData(0, 0, ww, wh).data;

      var gray = new Uint8ClampedArray(ww * wh);
      var hist = new Uint32Array(256);
      for (var p = 0, gi = 0; p < img.length; p += 4, gi++) {
        var g = (img[p] * 0.299 + img[p + 1] * 0.587 + img[p + 2] * 0.114) | 0;
        gray[gi] = g; hist[g]++;
      }

      /* عتبة Otsu */
      var total = ww * wh, sum = 0;
      for (var t = 0; t < 256; t++) sum += t * hist[t];
      var sumB = 0, wB = 0, maxVar = 0, threshold = 127;
      for (var t2 = 0; t2 < 256; t2++) {
        wB += hist[t2]; if (!wB) continue;
        var wF = total - wB; if (!wF) break;
        sumB += t2 * hist[t2];
        var mB = sumB / wB, mF = (sum - sumB) / wF;
        var varBetween = wB * wF * (mB - mF) * (mB - mF);
        if (varBetween > maxVar) { maxVar = varBetween; threshold = t2; }
      }

      /* أكبر مكوّن متصل (٤-اتصال، تكديس تكراري لا استدعاء ذاتي) */
      function largestBlob(darkIsFg) {
        var seen = new Uint8Array(ww * wh);
        var best = null, bestCount = 0;
        var stack = new Int32Array(ww * wh);
        for (var y0 = 0; y0 < wh; y0++) {
          for (var x0 = 0; x0 < ww; x0++) {
            var idx0 = y0 * ww + x0;
            if (seen[idx0]) continue;
            var isFg = darkIsFg ? gray[idx0] < threshold : gray[idx0] >= threshold;
            seen[idx0] = 1;
            if (!isFg) continue;
            var sp = 0, count = 0;
            var minX = x0, maxX = x0, minY = y0, maxY = y0;
            var sumXpY = 0, sumXmY = 0;
            var cornerMinS = null, cornerMaxS = null, cornerMinD = null, cornerMaxD = null;
            var vMinS = Infinity, vMaxS = -Infinity, vMinD = Infinity, vMaxD = -Infinity;
            stack[sp++] = idx0;
            while (sp > 0) {
              var idx = stack[--sp];
              var x = idx % ww, y = (idx / ww) | 0;
              count++;
              if (x < minX) minX = x; if (x > maxX) maxX = x;
              if (y < minY) minY = y; if (y > maxY) maxY = y;
              var s = x + y, d = x - y;
              if (s < vMinS) { vMinS = s; cornerMinS = [x, y]; }
              if (s > vMaxS) { vMaxS = s; cornerMaxS = [x, y]; }
              if (d < vMinD) { vMinD = d; cornerMinD = [x, y]; }
              if (d > vMaxD) { vMaxD = d; cornerMaxD = [x, y]; }
              var nx, ny, nidx;
              nx = x - 1; if (nx >= 0) { nidx = y * ww + nx; if (!seen[nidx]) {
                seen[nidx] = 1;
                var fg = darkIsFg ? gray[nidx] < threshold : gray[nidx] >= threshold;
                if (fg) stack[sp++] = nidx;
              } }
              nx = x + 1; if (nx < ww) { nidx = y * ww + nx; if (!seen[nidx]) {
                seen[nidx] = 1;
                var fg2 = darkIsFg ? gray[nidx] < threshold : gray[nidx] >= threshold;
                if (fg2) stack[sp++] = nidx;
              } }
              ny = y - 1; if (ny >= 0) { nidx = ny * ww + x; if (!seen[nidx]) {
                seen[nidx] = 1;
                var fg3 = darkIsFg ? gray[nidx] < threshold : gray[nidx] >= threshold;
                if (fg3) stack[sp++] = nidx;
              } }
              ny = y + 1; if (ny < wh) { nidx = ny * ww + x; if (!seen[nidx]) {
                seen[nidx] = 1;
                var fg4 = darkIsFg ? gray[nidx] < threshold : gray[nidx] >= threshold;
                if (fg4) stack[sp++] = nidx;
              } }
            }
            if (count > bestCount) {
              bestCount = count;
              best = { count: count, tl: cornerMinS, br: cornerMaxS, tr: cornerMaxD, bl: cornerMinD,
                       minX: minX, maxX: maxX, minY: minY, maxY: maxY };
            }
          }
        }
        return best;
      }

      var blob = largestBlob(true);
      var ratio = blob ? blob.count / total : 0;
      if (!blob || ratio < 0.15 || ratio > 0.93) {
        var blob2 = largestBlob(false);
        var ratio2 = blob2 ? blob2.count / total : 0;
        if (blob2 && ratio2 >= 0.15 && ratio2 <= 0.93) { blob = blob2; ratio = ratio2; }
        else return null;   /* لا ثقة كافية — لا تُخاطر بقصّ خاطئ */
      }
      /* تحقّق إضافي: صندوق الإحاطة يجب ألا يلامس حواف الإطار الأربعة كلها
         (لو لامسها كلها فهذا على الأرجح الإطار نفسه لا ورقة داخله). */
      var margin = 3;
      var touches = (blob.minX <= margin) + (blob.maxX >= ww - 1 - margin) +
                    (blob.minY <= margin) + (blob.maxY >= wh - 1 - margin);
      if (touches >= 4) return null;

      var inv = 1 / scale;
      var quad = {
        tl: [blob.tl[0] * inv, blob.tl[1] * inv],
        tr: [blob.tr[0] * inv, blob.tr[1] * inv],
        br: [blob.br[0] * inv, blob.br[1] * inv],
        bl: [blob.bl[0] * inv, blob.bl[1] * inv]
      };

      /* هامش خفيف للخارج (١٪) حتى لا تُقصّ حافة المستند نفسها */
      var cx0 = (quad.tl[0] + quad.tr[0] + quad.br[0] + quad.bl[0]) / 4;
      var cy0 = (quad.tl[1] + quad.tr[1] + quad.br[1] + quad.bl[1]) / 4;
      ["tl", "tr", "br", "bl"].forEach(function (k) {
        var pt = quad[k];
        pt[0] = pt[0] + (pt[0] - cx0) * 0.01;
        pt[1] = pt[1] + (pt[1] - cy0) * 0.01;
        pt[0] = Math.max(0, Math.min(sw - 1, pt[0]));
        pt[1] = Math.max(0, Math.min(sh - 1, pt[1]));
      });

      function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
      var outW = Math.round((dist(quad.tl, quad.tr) + dist(quad.bl, quad.br)) / 2);
      var outH = Math.round((dist(quad.tl, quad.bl) + dist(quad.tr, quad.br)) / 2);
      if (outW < 40 || outH < 40) return null;

      /* تحويل إسقاطي: تربيع الوحدة (u,v)∈[0,1] ← رباعي الزوايا (خوارزمية
         Heckbert القياسية لتخطيط الملمس على رباعي غير منتظم). */
      var x0 = quad.tl[0], y0 = quad.tl[1], x1 = quad.tr[0], y1 = quad.tr[1],
          x2 = quad.br[0], y2 = quad.br[1], x3 = quad.bl[0], y3 = quad.bl[1];
      var dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
      var dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
      var den = dx1 * dy2 - dx2 * dy1;
      var a13 = 0, a23 = 0;
      if (Math.abs(den) > 1e-9) { a13 = (dx3 * dy2 - dx2 * dy3) / den; a23 = (dx1 * dy3 - dx3 * dy1) / den; }
      var a11 = x1 - x0 + a13 * x1, a21 = x3 - x0 + a23 * x3, a31 = x0;
      var a12 = y1 - y0 + a13 * y1, a22 = y3 - y0 + a23 * y3, a32 = y0;

      var outCv = document.createElement("canvas");
      outCv.width = outW; outCv.height = outH;
      var outCx = outCv.getContext("2d");
      var srcCx = srcCanvas.getContext("2d");
      var srcData = srcCx.getImageData(0, 0, sw, sh).data;
      var outImg = outCx.createImageData(outW, outH);
      var od = outImg.data;
      for (var oy = 0; oy < outH; oy++) {
        var v = oy / outH;
        for (var ox = 0; ox < outW; ox++) {
          var u = ox / outW;
          var wgt = a13 * u + a23 * v + 1;
          var X = (a11 * u + a21 * v + a31) / wgt;
          var Y = (a12 * u + a22 * v + a32) / wgt;
          var xi = X | 0, yi = Y | 0;
          var oIdx = (oy * outW + ox) * 4;
          if (xi < 0 || yi < 0 || xi >= sw || yi >= sh) {
            od[oIdx] = 255; od[oIdx + 1] = 255; od[oIdx + 2] = 255; od[oIdx + 3] = 255;
            continue;
          }
          var sIdx = (yi * sw + xi) * 4;
          od[oIdx] = srcData[sIdx]; od[oIdx + 1] = srcData[sIdx + 1];
          od[oIdx + 2] = srcData[sIdx + 2]; od[oIdx + 3] = 255;
        }
      }
      outCx.putImageData(outImg, 0, 0);
      return outCv;
    } catch (e) { return null; }
  }

  function fallback() {
    try { return JSON.parse(localStorage.getItem(FALLBACK_KEY)) || {}; }
    catch (e) { return {}; }
  }

  /* ------------------------------------------------------------- الضغط */

  /* لفّ لوحة ٩٠° مع عقارب الساعة */
  function turnCanvas(src) {
    var c = document.createElement("canvas");
    c.width = src.height; c.height = src.width;
    var x = c.getContext("2d");
    x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
    x.translate(c.width, 0); x.rotate(Math.PI / 2);
    x.drawImage(src, 0, 0);
    return c;
  }

  /**
   * يضغط صورة قبل الحفظ.
   * @returns Promise<{dataUrl, width, height, bytes, ratio}>
   */
  function compress(file) {
    return new Promise(function (resolve, reject) {
      var rd = new FileReader();
      rd.onerror = function () { reject(new Error("تعذّر قراءة الملف")); };
      rd.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error("الملف ليس صورة صالحة")); };
        img.onload = function () {
          var wid = img.naturalWidth, hei = img.naturalHeight;
          var scale = Math.min(1, MAX_EDGE / Math.max(wid, hei));
          var cw = Math.round(wid * scale), ch = Math.round(hei * scale);

          var cv = document.createElement("canvas");
          cv.width = cw; cv.height = ch;
          var cx = cv.getContext("2d");
          cx.fillStyle = "#fff";
          cx.fillRect(0, 0, cw, ch);
          cx.drawImage(img, 0, 0, cw, ch);

          /* محاذاة تلقائية: اكتشاف حواف المستند وتسوية منظوره قبل تحسين
             التباين — لو الكشف غير واثق تُترك الصورة كاملة كما هي. */
          if (file.__noCrop !== true) {
            var cropped = autoCropDocument(cv);
            if (cropped) { cv = cropped; cx = cv.getContext("2d"); cw = cv.width; ch = cv.height; }
          }
          if (file.__noEnhance !== true) autoEnhance(cx, cw, ch);

          /* اتجاه القراءة (زي برنامج الاسكانر): صورة متصوّرة مقلوبة أو على جنبها
             بتتلف بحيث النص يتقري معدول. صفحات السكانر (__noCrop) جاية متعدّلة. */
          var turnP = (file.__noCrop !== true && w.IdOcr && IdOcr.uprightTurn)
            ? IdOcr.uprightTurn(cv.toDataURL("image/jpeg", 0.85)).catch(function () { return 0; })
            : Promise.resolve(0);
          turnP.then(function (deg) {
            for (var q = 0; q < Math.round((deg || 0) / 90) % 4; q++) cv = turnCanvas(cv);
            cw = cv.width; ch = cv.height;
            var out = cv.toDataURL("image/jpeg", QUALITY);
            resolve({
              dataUrl: out,
              width: cw, height: ch,
              originalWidth: wid, originalHeight: hei,
              bytes: Math.round(out.length * 3 / 4),
              originalBytes: file.size
            });
          });
        };
        img.src = String(rd.result);
      };
      rd.readAsDataURL(file);
    });
  }

  /* ------------------------------------------------------------- الحفظ */

  function put(id, dataUrl) {
    var comma = dataUrl.indexOf(",");
    var b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;

    if (native) {
      var saved = AndroidFiles.put(id, b64);
      return !!saved;
    }
    var all = fallback();
    all[id] = dataUrl;
    try { localStorage.setItem(FALLBACK_KEY, JSON.stringify(all)); return true; }
    catch (e) { return false; }
  }

  /** يعيد الصورة كاملةً بأبعادها المخزَّنة — للعرض والطباعة. */
  function get(id) {
    if (native) {
      var b64 = AndroidFiles.get(id);
      if (!b64) return "";
      /* النوع من الامتداد: المخزن يضمّ صوراً وملفات PDF وغيرها */
      return "data:" + mimeOf(id) + ";base64," + b64;
    }
    return fallback()[id] || "";
  }

  function has(id) {
    if (native) return !!AndroidFiles.has(id);
    return !!fallback()[id];
  }

  function remove(id) {
    if (native) return !!AndroidFiles.remove(id);
    var all = fallback();
    delete all[id];
    try { localStorage.setItem(FALLBACK_KEY, JSON.stringify(all)); return true; }
    catch (e) { return false; }
  }

  function list() {
    if (native) {
      var s = AndroidFiles.list();
      return s ? s.split("\n").filter(Boolean) : [];
    }
    return Object.keys(fallback());
  }

  /** مساحة المرفقات والمتاح — بالبايت */
  function space() {
    if (native) {
      return { used: AndroidFiles.usedBytes(), free: AndroidFiles.freeBytes(),
               internal: true };
    }
    var n = 0;
    var all = fallback();
    Object.keys(all).forEach(function (k) { n += all[k].length; });
    return { used: Math.round(n * 3 / 4), free: -1, internal: false };
  }

  function human(bytes) {
    if (bytes == null || bytes < 0) return "—";
    var u = ["بايت", "ك.ب", "م.ب", "ج.ب"], i = 0, n = bytes;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    var t = (i === 0 ? Math.round(n) : n.toFixed(1)) + " " + u[i];
    return t.replace(/[0-9]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩"[+d]; });
  }


  /* ═══════════════════════════════════════════════ دفعة الرفع

     المرفقات تأتي في دفعات: صورٌ متعددة لمستند واحد. فتُضغط كلها، ثم
     تُدمج في ملف PDF واحد يُخزَّن مرفقاً واحداً — لا صوراً متفرقة يصعب
     تصفّحها وطباعتها. */

  /* نوع الملف: صورةٌ تُضغط وتُدمج، أو PDF يُحفظ كما هو، أو غيرهما. */

  function kindOf(f) {
    var n = String(f.name || "").toLowerCase();
    if (/^image\//.test(f.type) || /\.(jpe?g|png|webp|bmp|heic|heif|gif|tiff?)$/.test(n)) {
      return "image";
    }
    if (f.type === "application/pdf" || /\.pdf$/.test(n)) return "pdf";
    return "other";
  }

  function extOf(f) {
    var m = String(f.name || "").match(/\.([A-Za-z0-9]{1,8})$/);
    return m ? m[1].toLowerCase() : "bin";
  }

  /** يقرأ ملفاً كما هو بلا إعادة ترميز. */
  function readRaw(f) {
    return new Promise(function (resolve, reject) {
      var rd = new FileReader();
      rd.onerror = function () { reject(new Error("تعذّر قراءة " + (f.name || "الملف"))); };
      rd.onload = function () { resolve(String(rd.result)); };
      rd.readAsDataURL(f);
    });
  }

  /** يضغط عدّة صور على التوالي مع بلاغ التقدّم. */
  function compressAll(files, onProgress) {
    var list = Array.prototype.slice.call(files).filter(function (f) {
      return kindOf(f) === "image";
    });
    var out = [];
    return list.reduce(function (chain, f, i) {
      return chain.then(function () {
        if (onProgress) onProgress(i + 1, list.length, f.name || "");
        return compress(f).then(function (r) { out.push(r); });
      });
    }, Promise.resolve()).then(function () { return out; });
  }

  /**
   * يحفظ دفعة مرفقات مختلطة.
   *   الصور  → تُضغط وتُدمج في مستند PDF واحد.
   *   PDF    → يُحفظ كما هو؛ إعادة ترميزه تُفقده نصّه ووضوحه.
   *   غيرهما → يُحفظ كما هو بامتداده.
   *
   * @returns Promise<{saved:[{id,kind,pages,name,bytes}], merged:number, kept:number}>
   */
  function putBatch(idPrefix, files, onProgress) {
    var all = Array.prototype.slice.call(files);
    if (!all.length) return Promise.reject(new Error("لم تختر ملفات."));

    var imgs   = all.filter(function (f) { return kindOf(f) === "image"; });
    var others = all.filter(function (f) { return kindOf(f) !== "image"; });
    var saved  = [];
    var step = 0, total = all.length;

    function tick(name) {
      step++;
      if (onProgress) onProgress(step, total, name || "");
    }

    /* ١) الملفات غير الصور تُحفظ كما هي */
    var chain = others.reduce(function (p, f) {
      return p.then(function () {
        tick(f.name);
        return readRaw(f).then(function (url) {
          var id = idPrefix + Date.now().toString(36) +
                   Math.floor(Math.random() * 1e4).toString(36) + "." + extOf(f);
          if (!putRaw(id, url)) throw new Error("تعذّر حفظ " + (f.name || "الملف"));
          saved.push({ id: id, kind: kindOf(f), name: f.name || id,
                       pages: null, bytes: f.size });
        });
      });
    }, Promise.resolve());

    /* ٢) الصور تُضغط ثم تُدمج في ملف واحد */
    if (imgs.length) {
      chain = chain.then(function () {
        if (!w.PdfBuild) {
          throw new Error("مولِّد الـPDF غير محمَّل في هذه الشاشة.");
        }
        return imgs.reduce(function (p, f) {
          return p.then(function () {
            tick(f.name);
            return compress(f);
          }).then(function (r) {
            if (!chain.__pics) chain.__pics = [];
            chain.__pics.push(r.dataUrl);
          });
        }, Promise.resolve());
      }).then(function () {
        var pics = chain.__pics || [];
        if (!pics.length) return;

        /* صورةٌ واحدة تبقى صورة: تُعاين في مكانها وتُطبع.
           تحويلها PDF يُفقدها الاثنين بلا فائدة — الدمج إنما هو لمستند
           من عدّة ورقات. */
        if (pics.length === 1) {
          var iid = idPrefix + Date.now().toString(36) + ".jpg";
          if (!put(iid, pics[0])) throw new Error("تعذّر حفظ الصورة.");
          saved.push({ id: iid, kind: "image", name: "صورة",
                       pages: 1, bytes: Math.round(pics[0].length * 3 / 4) });
          return;
        }

        var pdf = PdfBuild.fromJpegs(pics);
        if (!pdf) throw new Error("تعذّر بناء المستند من الصور.");
        var id = idPrefix + Date.now().toString(36) + ".pdf";
        var b64 = PdfBuild.toBase64(pdf);
        var ok = native ? !!AndroidFiles.put(id, b64)
                        : putRaw(id, "data:application/pdf;base64," + b64);
        if (!ok) throw new Error("تعذّر الحفظ — راجع مساحة الجهاز.");
        saved.push({ id: id, kind: "merged", name: "مستند مدموج",
                     pages: pics.length, bytes: pdf.length });
      });
    }

    return chain.then(function () {
      if (!saved.length) throw new Error("لم يُحفظ شيء.");
      return {
        saved: saved,
        merged: imgs.length,
        kept: others.length,
        id: saved[saved.length - 1].id,
        pages: imgs.length
      };
    });
  }

  /** حفظ خام بلا ضغط — يُستعمل للـPDF المبنيّ. */
  function putRaw(id, dataUrl) {
    var comma = dataUrl.indexOf(",");
    var b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
    if (native) return !!AndroidFiles.put(id, b64);
    var all = fallback();
    all[id] = dataUrl;
    try { localStorage.setItem(FALLBACK_KEY, JSON.stringify(all)); return true; }
    catch (e) { return false; }
  }

  function isPdf(id) { return /\.pdf$/i.test(String(id || "")); }

  function isImage(id) {
    return /\.(jpe?g|png|webp|gif|bmp)$/i.test(String(id || ""));
  }

  var MIME = {
    pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg",
    png: "image/png", webp: "image/webp", gif: "image/gif", bmp: "image/bmp",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    txt: "text/plain", rtf: "application/rtf", zip: "application/zip"
  };

  function mimeOf(id) {
    var m = String(id || "").match(/\.([A-Za-z0-9]{1,8})$/);
    return MIME[(m ? m[1] : "").toLowerCase()] || "application/octet-stream";
  }

  /** وصفٌ مختصر لنوع المرفق — يُعرض للمستخدم. */
  function kindLabel(id) {
    if (isPdf(id)) return "مستند PDF";
    if (isImage(id)) return "صورة";
    var m = String(id || "").match(/\.([A-Za-z0-9]{1,8})$/);
    return m ? "ملف " + m[1].toUpperCase() : "ملف";
  }

  /** يعيد الملف كـdata URL بنوعه الصحيح. */
  function getUrl(id) {
    if (native) {
      var raw = AndroidFiles.get(id);
      if (!raw) return "";
      return "data:" + mimeOf(id) + ";base64," + raw;
    }
    return fallback()[id] || "";
  }

  /* ═══════════════════════════════════════════ منطقة السحب والإفلات */

  /**
   * يحوّل عنصراً إلى منطقة استقبال: سحب وإفلات · لصق · نقر لاختيار ملفات
   * · زر كاميرا. ويستدعي onFiles(FileList).
   *
   * @param {HTMLElement} box
   * @param {function} onFiles
   * @param {object} opts { camera:true }
   */
  function dropZone(box, onFiles, opts) {
    opts = opts || {};

    var file = document.createElement("input");
    file.type = "file";
    /* صور وملفات PDF — والقائمة مفتوحة لغيرها فيُحفظ كما هو */
    file.accept = "image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.txt";
    file.multiple = true;
    file.style.display = "none";
    box.appendChild(file);

    var cam = document.createElement("input");
    cam.type = "file";
    cam.accept = "image/*";
    cam.setAttribute("capture", "environment");
    /* multiple: لو التصوير اتم بالسكانر، مستند من أكتر من صفحة يرجع كله */
    cam.multiple = true;
    cam.style.display = "none";
    box.appendChild(cam);

    var idle = "border:2px dashed var(--line,#ddd);border-radius:12px;" +
               "padding:16px;text-align:center;transition:background .15s,border-color .15s";
    var over = "border:2px dashed var(--brand);border-radius:12px;background:var(--bg,#f4ece0);" +
               "padding:16px;text-align:center";
    box.style.cssText = idle;

    var msg = document.createElement("div");
    msg.style.cssText = "font-size:13.5px;color:var(--muted);line-height:1.95;margin-bottom:11px";
    msg.textContent = "اسحب الصور وملفات PDF وأفلتها هنا، أو الصقها، أو اخترها من الجهاز.";
    box.appendChild(msg);

    var bar = document.createElement("div");
    bar.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;justify-content:center";
    function mk(label, on) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.style.cssText = "flex:1 1 auto;min-width:120px;min-height:46px;padding:10px 14px;" +
        "border:1px solid var(--line,#ddd);border-radius:10px;background:var(--card);" +
        "color:var(--brand);font-family:inherit;font-size:14px";
      b.onclick = on;
      bar.appendChild(b);
      return b;
    }
    mk("📂 اختيار ملفات", function () { file.click(); });
    if (opts.camera !== false) {
      var scanner = false;
      try {
        scanner = typeof AndroidScanner !== "undefined" && !!AndroidScanner.supportsResult &&
          AndroidScanner.supportsResult();
      } catch (e) { }
      mk(scanner ? "📷 تصوير بالسكانر (قص تلقائي)" : "📷 تصوير", function () {
        try { if (scanner) AndroidScanner.prepareCapture("document", ""); } catch (e) { }
        cam.click();
      });
    }
    box.appendChild(bar);

    function hand(files) {
      if (files && files.length) onFiles(files);
    }
    file.onchange = function () { hand(file.files); file.value = ""; };
    cam.onchange  = function () { hand(cam.files);  cam.value = ""; };

    ["dragenter", "dragover"].forEach(function (ev) {
      box.addEventListener(ev, function (e) {
        e.preventDefault(); e.stopPropagation();
        box.style.cssText = over;
      });
    });
    ["dragleave", "dragend"].forEach(function (ev) {
      box.addEventListener(ev, function (e) {
        e.preventDefault(); e.stopPropagation();
        box.style.cssText = idle;
      });
    });
    box.addEventListener("drop", function (e) {
      e.preventDefault(); e.stopPropagation();
      box.style.cssText = idle;
      hand(e.dataTransfer && e.dataTransfer.files);
    });

    /* اللصق: صورة من الحافظة تُقبل كما تُقبل الملفات */
    function onPaste(e) {
      var items = (e.clipboardData || {}).items || [];
      var picked = [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].kind === "file") {
          var f = items[i].getAsFile();
          if (f) picked.push(f);
        }
      }
      if (picked.length) { e.preventDefault(); hand(picked); }
    }
    document.addEventListener("paste", onPaste);
    box.__unbind = function () { document.removeEventListener("paste", onPaste); };

    return { chooseFiles: function () { file.click(); },
             camera: function () { cam.click(); },
             setMessage: function (t) { msg.textContent = t; } };
  }

  /* ═══════════════════════════════════════════════════ الطباعة */

  /**
   * يبني PDF من مرفقات ثم يسلّمه لحوار الطباعة.
   * الصور تُدمج، وملفات الـPDF المخزَّنة تُطبع كما هي (واحدٌ في كل مرة).
   */
  function printAttachments(ids, title) {
    if (!ids || !ids.length) { alert("لا مرفقات لطباعتها."); return; }

    var pdfs = ids.filter(isPdf);
    var pics = ids.filter(function (x) { return !isPdf(x); });

    /* الصور تُدمج في ملف واحد */
    if (pics.length) {
      if (!w.PdfBuild) { alert("مولِّد الـPDF غير محمَّل في هذه الشاشة."); return; }
      var data = pics.map(function (id) { return get(id); }).filter(Boolean);
      var pdf = PdfBuild.fromJpegs(data);
      if (pdf) { openPdf(PdfBuild.toBase64(pdf), title); return; }
    }
    if (pdfs.length) {
      var one = native ? AndroidFiles.get(pdfs[0]) : "";
      if (one) { openPdf(one, title); return; }
      var url = getUrl(pdfs[0]);
      if (url) { openPdf(url.slice(url.indexOf(",") + 1), title); return; }
    }
    alert("تعذّر تجهيز الملف للطباعة.");
  }

  /**
   * يعرض الـPDF في الصفحة ويتيح طباعته أو حفظه.
   * WebView لا يعرض PDF داخلياً، فيُسلَّم لحوار الطباعة في أندرويد أو
   * يُحفظ في التنزيلات ليفتحه المستخدم بقارئه.
   */
  function openPdf(b64, title) {
    var name = (title || "مرفقات") + ".pdf";

    var back = document.createElement("div");
    back.setAttribute("data-modal", "1");
    back.setAttribute("data-nosave", "1");
    back.style.cssText = "position:fixed;inset:0;background:rgba(20,14,8,.62);z-index:10070;" +
      "display:flex;align-items:flex-end;justify-content:center";

    var box = document.createElement("div");
    box.style.cssText = "background:var(--card,#fff);border-radius:18px 18px 0 0;" +
      "padding:18px 18px 26px;width:100%;max-width:560px;direction:rtl;color:var(--text)";

    function line(t, css) {
      var d = document.createElement("div");
      d.style.cssText = css || "font-size:13.5px;color:var(--muted);line-height:1.95";
      d.textContent = t;
      box.appendChild(d);
    }
    line(name, "font-family:var(--f-title);font-size:17px;margin-bottom:6px");
    line("حجم الملف " + Math.round(b64.length * 3 / 4 / 1024) + " ك.ب.");

    var row = document.createElement("div");
    row.style.cssText = "display:flex;gap:9px;margin-top:16px;flex-wrap:wrap";
    function mk(label, css, on) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.style.cssText = "flex:1 1 140px;padding:14px;border-radius:11px;font-family:inherit;" +
                        "font-size:15px;min-height:52px;" + css;
      b.onclick = on;
      row.appendChild(b);
    }

    mk("💾 حفظ في التنزيلات", "border:0;background:var(--brand);color:#fff;font-weight:600",
      function () {
        if (w.AndroidSaver && AndroidSaver.save) {
          AndroidSaver.save(name, b64);
        } else {
          var a = document.createElement("a");
          a.href = "data:application/pdf;base64," + b64;
          a.download = name;
          a.click();
        }
        back.remove();
      });

    mk("🖨 طباعة", "border:1px solid var(--line,#ddd);background:transparent;color:var(--brand)",
      function () {
        if (w.AndroidSaver && AndroidSaver.printPage) {
          /* حوار الطباعة يطبع الصفحة المعروضة، فتُعرض الصور أولاً */
          back.remove();
          printPictures(name);
        } else {
          var win = window.open("");
          if (win) {
            win.document.write('<iframe width="100%" height="100%" src="data:application/pdf;base64,' +
              b64 + '"></iframe>');
          }
        }
      });

    mk("إغلاق", "border:1px solid var(--line,#ddd);background:transparent;color:var(--muted)",
      function () { back.remove(); });

    box.appendChild(row);
    back.appendChild(box);
    back.onclick = function (e) { if (e.target === back) back.remove(); };
    document.body.appendChild(back);

    back.__pics = null;
    function printPictures(t) {
      if (w.AndroidSaver && AndroidSaver.printPage) AndroidSaver.printPage(t);
      else window.print();
    }
  }

  /**
   * يعرض المرفقات في صفحة طباعة نظيفة ثم يفتح حوار الطباعة.
   * هذه هي الطريقة الصحيحة في WebView: الطباعة تطبع المستند المعروض.
   */
  function printView(ids, title) {
    var pics = (ids || []).filter(function (x) { return !isPdf(x); });
    if (!pics.length) { alert("لا صور لطباعتها."); return; }

    var win = document.createElement("div");
    win.setAttribute("data-nosave", "1");
    win.style.cssText = "position:fixed;inset:0;background:#fff;z-index:10080;" +
      "overflow:auto;padding:16px;direction:rtl";

    var h = document.createElement("div");
    h.style.cssText = "font-family:var(--f-title);font-size:16px;text-align:center;" +
                      "margin-bottom:12px;color:#000";
    h.textContent = title || "مرفقات";
    win.appendChild(h);

    pics.forEach(function (id) {
      var src = get(id);
      if (!src) return;
      var im = document.createElement("img");
      im.src = src;
      im.style.cssText = "display:block;max-width:100%;margin:0 auto 12px;" +
                         "page-break-after:always;break-after:page";
      win.appendChild(im);
    });

    var bar = document.createElement("div");
    bar.style.cssText = "display:flex;gap:9px;margin-top:14px";
    bar.className = "noprint";
    function mk(t, css, on) {
      var b = document.createElement("button");
      b.type = "button"; b.textContent = t;
      b.style.cssText = "flex:1;padding:14px;border-radius:11px;font-family:inherit;" +
                        "font-size:15px;min-height:52px;" + css;
      b.onclick = on;
      bar.appendChild(b);
    }
    mk("🖨 طباعة / حفظ PDF", "border:0;background:#5b3a21;color:#fff;font-weight:600",
      function () {
        if (w.AndroidSaver && AndroidSaver.printPage) AndroidSaver.printPage(title || "مرفقات");
        else window.print();
      });
    mk("رجوع", "border:1px solid #ccc;background:transparent;color:#333",
      function () { win.remove(); });
    win.appendChild(bar);

    document.body.appendChild(win);
  }

  w.Attach = {
    compress: compress, compressAll: compressAll,
    put: put, putRaw: putRaw, putBatch: putBatch, getUrl: getUrl, isPdf: isPdf,
    dropZone: dropZone, printAttachments: printAttachments, printView: printView,
    kindOf: kindOf, isImage: isImage, kindLabel: kindLabel, mimeOf: mimeOf,
    readRaw: readRaw,
    get: get, has: has,
    remove: remove, list: list, space: space, human: human,
    isInternal: !!native, MAX_EDGE: MAX_EDGE
  };
})(window);
