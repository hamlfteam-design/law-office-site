/* =============================================================================
   تحسين صورة المستند/البطاقة — منقول من السكانر (AutoEnhance.kt) بنفس الخطوات
   والأرقام، بالـcanvas من غير OpenCV:

     ١) شيل الضل: كل قناة تتقسم على تقدير الإضاءة (تمدد ٧×٧ ← وسيط ٢١ ←
        تنعيم كبير قده ١/١٢ من الصفحة). التقدير بيتحسب على نسخة مصغّرة لأنه
        ناعم أصلاً، وبعدين يتكبّر — نفس النتيجة بجزء من الوقت.
     ٢) توازن الأبيض (grey-world) بمعامل بين ٠٫٧ و١٫٤.
     ٣) التباين: الأسود من أغمق ٠٫٥٪، والأبيض من «اللون الغالب» في النص
        الفاتح من الصورة (لون الورقة نفسها) — فالورقة تبقى بيضا فعلاً.
     ٤) توضيح الحروف (unsharp mask) بمقدار ٠٫٦ ونصف قطر ٢ — أكتر من كده
        بيعمل هالات حوالين التشكيل العربي.

   ScanFx.enhance(canvas) → canvas جديد (الأصل ما بيتغيّرش).
   ============================================================================= */
(function (w) {
  "use strict";

  function canvasOf(wd, ht) {
    var c = document.createElement("canvas"); c.width = wd; c.height = ht; return c;
  }

  /* تنعيم بصندوق أفقي ثم رأسي (الحواف بتتكرر زي BORDER_REPLICATE) */
  function boxBlur(src, wd, ht, r) {
    if (r < 1) return src;
    var tmp = new Float32Array(wd * ht), out = new Float32Array(wd * ht), x, y, i, s, n = 2 * r + 1;
    for (y = 0; y < ht; y++) {
      var row = y * wd;
      s = 0;
      for (i = -r; i <= r; i++) s += src[row + Math.min(wd - 1, Math.max(0, i))];
      for (x = 0; x < wd; x++) {
        tmp[row + x] = s / n;
        s += src[row + Math.min(wd - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
      }
    }
    for (x = 0; x < wd; x++) {
      s = 0;
      for (i = -r; i <= r; i++) s += tmp[Math.min(ht - 1, Math.max(0, i)) * wd + x];
      for (y = 0; y < ht; y++) {
        out[y * wd + x] = s / n;
        s += tmp[Math.min(ht - 1, y + r + 1) * wd + x] - tmp[Math.max(0, y - r) * wd + x];
      }
    }
    return out;
  }
  /* جاوسي تقريبي = ٣ مرات صندوق بعرض محسوب من سيجما */
  function gauss(src, wd, ht, sigma) {
    var r = Math.max(1, Math.round((Math.sqrt(12 * sigma * sigma / 3 + 1) - 1) / 2));
    return boxBlur(boxBlur(boxBlur(src, wd, ht, r), wd, ht, r), wd, ht, r);
  }
  function maxFilter(src, wd, ht, r) {
    var tmp = new Float32Array(wd * ht), out = new Float32Array(wd * ht), x, y, k, m;
    for (y = 0; y < ht; y++) for (x = 0; x < wd; x++) {
      m = 0;
      for (k = -r; k <= r; k++) { var v = src[y * wd + Math.min(wd - 1, Math.max(0, x + k))]; if (v > m) m = v; }
      tmp[y * wd + x] = m;
    }
    for (y = 0; y < ht; y++) for (x = 0; x < wd; x++) {
      m = 0;
      for (k = -r; k <= r; k++) { var v2 = tmp[Math.min(ht - 1, Math.max(0, y + k)) * wd + x]; if (v2 > m) m = v2; }
      out[y * wd + x] = m;
    }
    return out;
  }
  /* وسيط بهيستوجرام متحرك (قيم ٠..٢٥٥) */
  function median(src, wd, ht, r) {
    var out = new Float32Array(wd * ht), half, x, y, k, j;
    var area = (2 * r + 1) * (2 * r + 1);
    half = (area + 1) >> 1;
    for (y = 0; y < ht; y++) {
      var h = new Int32Array(256);
      for (k = -r; k <= r; k++) for (j = -r; j <= r; j++)
        h[src[Math.min(ht - 1, Math.max(0, y + k)) * wd + Math.min(wd - 1, Math.max(0, j))] | 0]++;
      for (x = 0; x < wd; x++) {
        var c = 0, v = 0;
        while (v < 255 && c + h[v] < half) { c += h[v]; v++; }
        out[y * wd + x] = v;
        if (x + 1 < wd) for (k = -r; k <= r; k++) {
          var yy = Math.min(ht - 1, Math.max(0, y + k)) * wd;
          h[src[yy + Math.max(0, x - r)] | 0]--;
          h[src[yy + Math.min(wd - 1, x + r + 1)] | 0]++;
        }
      }
    }
    return out;
  }

  /* تقدير الإضاءة لقناة واحدة على نسخة مصغّرة، ويرجع بمقاس الصورة الأصلي */
  function illumination(chan, wd, ht) {
    var full = Math.max(wd, ht);
    var kernel = Math.max(31, Math.floor(full / 12) | 1);       /* AutoEnhance.shadowBlurKernelSize */
    var sigma = 0.3 * ((kernel - 1) * 0.5 - 1) + 0.8;            /* سيجما OpenCV لما تكون صفر */
    var sc = Math.min(1, 420 / full);
    var sw = Math.max(1, Math.round(wd * sc)), sh = Math.max(1, Math.round(ht * sc));
    var small = new Float32Array(sw * sh), x, y;
    /* تصغير بمتوسط المساحة */
    var fx = wd / sw, fy = ht / sh;
    for (y = 0; y < sh; y++) for (x = 0; x < sw; x++) {
      var y0 = Math.floor(y * fy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * fy));
      var x0 = Math.floor(x * fx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * fx));
      var s = 0, n = 0;
      for (var yy = y0; yy < y1; yy++) for (var xx = x0; xx < x1; xx++) { s += chan[yy * wd + xx]; n++; }
      small[y * sw + x] = s / n;
    }
    var b = maxFilter(small, sw, sh, Math.max(1, Math.round(3 * sc)));
    b = median(b, sw, sh, Math.max(1, Math.round(10 * sc)));
    b = gauss(b, sw, sh, Math.max(1, sigma * sc));
    /* تكبير خطّي للمقاس الأصلي */
    var out = new Float32Array(wd * ht);
    for (y = 0; y < ht; y++) {
      var v = (y + 0.5) / fy - 0.5, v0 = Math.max(0, Math.min(sh - 1, Math.floor(v))), v1 = Math.min(sh - 1, v0 + 1), ty = Math.max(0, Math.min(1, v - v0));
      for (x = 0; x < wd; x++) {
        var u = (x + 0.5) / fx - 0.5, u0 = Math.max(0, Math.min(sw - 1, Math.floor(u))), u1 = Math.min(sw - 1, u0 + 1), tx = Math.max(0, Math.min(1, u - u0));
        var a = b[v0 * sw + u0] * (1 - tx) + b[v0 * sw + u1] * tx;
        var c2 = b[v1 * sw + u0] * (1 - tx) + b[v1 * sw + u1] * tx;
        out[y * wd + x] = a * (1 - ty) + c2 * ty;
      }
    }
    return out;
  }

  /* AutoEnhance.ContrastMath.computeWhitePoint */
  function whitePoint(hist, total, blackPct) {
    var cum = 0, low = 0, lowFound = false, med = 0, medFound = false, i;
    for (i = 0; i < 256; i++) {
      cum += hist[i];
      var f = cum / total;
      if (!lowFound && f >= blackPct) { low = i; lowFound = true; }
      if (!medFound && f >= 0.5) { med = i; medFound = true; }
    }
    var from = Math.max(low, med), peak = from, pc = -1;
    for (i = from; i < 256; i++) if (hist[i] > pc) { pc = hist[i]; peak = i; }
    return [low, Math.max(peak, low + 1)];
  }

  function enhance(src) {
    var wd = src.width, ht = src.height, n = wd * ht;
    if (!wd || !ht) return src;
    var ctx = src.getContext("2d");
    var img = ctx.getImageData(0, 0, wd, ht), d = img.data, c, i;
    var ch = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
    for (i = 0; i < n; i++) { ch[0][i] = d[i * 4]; ch[1][i] = d[i * 4 + 1]; ch[2][i] = d[i * 4 + 2]; }

    /* ١) الضل */
    for (c = 0; c < 3; c++) {
      var bg = illumination(ch[c], wd, ht), a = ch[c];
      for (i = 0; i < n; i++) a[i] = Math.min(255, a[i] * 255 / Math.max(1, bg[i]));
    }
    /* ٢) توازن الأبيض */
    var means = ch.map(function (a) { var s = 0; for (var k = 0; k < n; k++) s += a[k]; return s / n; });
    var target = (means[0] + means[1] + means[2]) / 3;
    if (target > 0) for (c = 0; c < 3; c++) {
      var g = means[c] > 1 ? Math.max(0.7, Math.min(1.4, target / means[c])) : 1;
      for (i = 0; i < n; i++) ch[c][i] = Math.min(255, ch[c][i] * g);
    }
    /* ٣) التباين */
    var hist = new Int32Array(256);
    for (i = 0; i < n; i++) hist[Math.min(255, (0.299 * ch[0][i] + 0.587 * ch[1][i] + 0.114 * ch[2][i]) | 0)]++;
    var lh = whitePoint(hist, n, 0.005), alpha = 255 / (lh[1] - lh[0]), beta = -lh[0] * alpha;
    for (c = 0; c < 3; c++) for (i = 0; i < n; i++) ch[c][i] = ch[c][i] * alpha + beta;
    /* ٤) توضيح */
    var out = canvasOf(wd, ht), ox = out.getContext("2d"), od = ox.createImageData(wd, ht);
    for (c = 0; c < 3; c++) {
      var bl = gauss(ch[c], wd, ht, 2);
      for (i = 0; i < n; i++) {
        var v = ch[c][i] * 1.6 - bl[i] * 0.6;
        od.data[i * 4 + c] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
    for (i = 0; i < n; i++) od.data[i * 4 + 3] = 255;
    ox.putImageData(od, 0, 0);
    return out;
  }

  /** نفس enhance لكن على data: URL — يرجّع Promise<dataUrl jpeg> */
  function enhanceDataUrl(dataUrl, quality) {
    return new Promise(function (res) {
      var im = new Image();
      im.onload = function () {
        try {
          var c = canvasOf(im.naturalWidth, im.naturalHeight);
          c.getContext("2d").drawImage(im, 0, 0);
          res(enhance(c).toDataURL("image/jpeg", quality || 0.9));
        } catch (e) { res(dataUrl); }
      };
      im.onerror = function () { res(dataUrl); };
      im.src = dataUrl;
    });
  }

  w.ScanFx = { enhance: enhance, enhanceDataUrl: enhanceDataUrl };
})(window);
