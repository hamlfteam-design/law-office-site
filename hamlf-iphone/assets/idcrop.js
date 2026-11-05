/* =============================================================================
   قص تلقائي لصور إثبات الشخصية + تعديل الاتجاه للقراءة — من غير مكتبات ولا نت.

   IdCrop.process(dataUrl, { side: "front" | "back" }) → Promise<{ dataUrl, cropped, rotated }>

   ١) يلاقي البطاقة جوه الصورة (صورة مبعوتة على الواتس، أو متصوّرة على ترابيزة):
      - بيجرّب مرشّحين: فصل بالإضاءة (Otsu، البطاقة أفتح/أغمق من الخلفية) وفصل
        بالحواف (Sobel + ملء المناطق المقفولة).
      - لكل منطقة: الغلاف المحدّب ← أصغر مستطيل حواليها ← نسبة الأبعاد لازم
        تقرب من البطاقة (٨٥٫٦×٥٤ = ١٫٥٩)، والمنطقة تملى المستطيل، ومساحتها معقولة.
      - أعلى تقييم يكسب. لو مفيش مرشّح مقنع، الصورة بترجع زي ما هي (مع تعديل
        الاتجاه بس) — أحسن من قصّ غلط.
   ٢) أركان البطاقة الأربعة من الغلاف (أقرب نقطة لكل ركن من أركان المستطيل)،
      فالبطاقة المتصوّرة بزاوية بتتعدل (تحويل منظوري) مش بتتقص بس.
   ٣) الاتجاه: الضلع الطويل أفقي دايماً. وقلب ١٨٠°:
      - الظهر: الباركود بيكون تحت ← لو «طاقة» الخطوط الرأسية فوق أكتر، تتقلب.
      - الوش: صورة صاحب البطاقة على الشمال ← لو الجزء الغامق الكبير يمين، تتقلب.
      وفي زرار «تدوير» يدوي لأي حالة الحساب فيها يغلط.
   ============================================================================= */
(function (w) {
  "use strict";

  var CARD_RATIO = 85.6 / 54;
  var DOC_RATIO = Math.SQRT2;     /* «doc»: ورقة التوكيل (A4) — نفس الكشف والمغناطيس بنسبة الورقة */
  var OUT_CW = 1280, OUT_CH = Math.round(OUT_CW / CARD_RATIO);
  var WORK = 700;                 /* أقصى بُعد لصورة التحليل — البطاقة ممكن تكون ٥–١٠٪ بس من الصورة */

  function loadImage(src) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () { res(im); };
      im.onerror = function () { rej(new Error("تعذّر قراءة الصورة.")); };
      im.src = src;
    });
  }

  function canvasOf(wd, ht) {
    var c = document.createElement("canvas"); c.width = wd; c.height = ht; return c;
  }

  /* ------------------------------------------------------ تحليل مصغّر */
  function grayOf(im, sc) {
    var wd = Math.max(1, Math.round(im.naturalWidth * sc)), ht = Math.max(1, Math.round(im.naturalHeight * sc));
    var c = canvasOf(wd, ht), x = c.getContext("2d");
    x.drawImage(im, 0, 0, wd, ht);
    var d = x.getImageData(0, 0, wd, ht).data, g = new Float32Array(wd * ht);
    for (var i = 0, j = 0; i < g.length; i++, j += 4) g[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
    return { g: blur(g, wd, ht, 2), w: wd, h: ht };
  }

  function blur(src, wd, ht, r) {           /* box blur أفقي ثم رأسي */
    var tmp = new Float32Array(src.length), out = new Float32Array(src.length), x, y, s, n;
    for (y = 0; y < ht; y++) {
      for (x = 0; x < wd; x++) {
        s = 0; n = 0;
        for (var k = -r; k <= r; k++) { var xx = x + k; if (xx >= 0 && xx < wd) { s += src[y * wd + xx]; n++; } }
        tmp[y * wd + x] = s / n;
      }
    }
    for (x = 0; x < wd; x++) {
      for (y = 0; y < ht; y++) {
        s = 0; n = 0;
        for (var k2 = -r; k2 <= r; k2++) { var yy = y + k2; if (yy >= 0 && yy < ht) { s += tmp[yy * wd + x]; n++; } }
        out[y * wd + x] = s / n;
      }
    }
    return out;
  }

  function otsu(g) {
    var hist = new Array(256).fill(0), i;
    for (i = 0; i < g.length; i++) hist[Math.max(0, Math.min(255, g[i] | 0))]++;
    var total = g.length, sum = 0;
    for (i = 0; i < 256; i++) sum += i * hist[i];
    var sumB = 0, wB = 0, best = 0, th = 128;
    for (i = 0; i < 256; i++) {
      wB += hist[i]; if (!wB) continue;
      var wF = total - wB; if (!wF) break;
      sumB += i * hist[i];
      var mB = sumB / wB, mF = (sum - sumB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
      if (v > best) { best = v; th = i; }
    }
    return th;
  }

  function morph(bin, wd, ht, dilate, it) {
    var cur = bin;
    for (var t = 0; t < it; t++) {
      var nx = new Uint8Array(cur.length);
      for (var y = 0; y < ht; y++) for (var x = 0; x < wd; x++) {
        var v = dilate ? 0 : 1;
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
          var xx = x + dx, yy = y + dy;
          var p = (xx < 0 || yy < 0 || xx >= wd || yy >= ht) ? 0 : cur[yy * wd + xx];
          if (dilate) { if (p) v = 1; } else if (!p) v = 0;
        }
        nx[y * wd + x] = v;
      }
      cur = nx;
    }
    return cur;
  }

  /* مكوّنات متصلة: يرجّع لكل مكوّن كبير نقاط حدوده (للغلاف) ومساحته */
  function components(bin, wd, ht, minArea) {
    var lab = new Int32Array(bin.length), out = [], stack = new Int32Array(bin.length), cur = 0;
    for (var i = 0; i < bin.length; i++) {
      if (!bin[i] || lab[i]) continue;
      cur++; var sp = 0; stack[sp++] = i; lab[i] = cur;
      var area = 0, edge = [], touch = 0;
      while (sp) {
        var p = stack[--sp], x = p % wd, y = (p / wd) | 0; area++;
        /* هامش ٤ بكسل: التنظيف (erode) بيبعّد الخلفية عن الحافة بكام بكسل */
        if (x <= 4 || y <= 4 || x >= wd - 5 || y >= ht - 5) touch++;
        var border = false;
        var nb = [p - 1, p + 1, p - wd, p + wd];
        for (var k = 0; k < 4; k++) {
          var q = nb[k];
          if ((k === 0 && x === 0) || (k === 1 && x === wd - 1) || (k === 2 && y === 0) || (k === 3 && y === ht - 1)) { border = true; continue; }
          if (!bin[q]) { border = true; continue; }
          if (!lab[q]) { lab[q] = cur; stack[sp++] = q; }
        }
        if (border) edge.push([x, y]);
      }
      if (area >= minArea) out.push({ area: area, pts: edge, touch: touch });
    }
    return out;
  }

  function hull(pts) {                       /* monotone chain */
    pts = pts.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    function cross(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    var lo = [], up = [], i;
    for (i = 0; i < pts.length; i++) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], pts[i]) <= 0) lo.pop(); lo.push(pts[i]); }
    for (i = pts.length - 1; i >= 0; i--) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], pts[i]) <= 0) up.pop(); up.push(pts[i]); }
    up.pop(); lo.pop();
    return lo.concat(up);
  }

  /* أصغر مستطيل (بأي زاوية) حوالين الغلاف — ضلع من الغلاف دايماً على ضلع المستطيل */
  function minRect(h) {
    var best = null;
    for (var i = 0; i < h.length; i++) {
      var a = h[i], b = h[(i + 1) % h.length];
      var ang = Math.atan2(b[1] - a[1], b[0] - a[0]), c = Math.cos(ang), s = Math.sin(ang);
      var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      for (var j = 0; j < h.length; j++) {
        var x = h[j][0] * c + h[j][1] * s, y = -h[j][0] * s + h[j][1] * c;
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      var area = (maxX - minX) * (maxY - minY);
      if (!best || area < best.area) {
        var R = function (x, y) { return [x * c - y * s, x * s + y * c]; };
        best = { area: area, w: maxX - minX, h: maxY - minY,
                 corners: [R(minX, minY), R(maxX, minY), R(maxX, maxY), R(minX, maxY)] };
      }
    }
    return best;
  }

  function polyArea(p) {
    var s = 0; for (var i = 0; i < p.length; i++) { var a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; }
    return Math.abs(s) / 2;
  }

  /* ملء الثقوب: أي منطقة «مش بطاقة» مقفولة جوه منطقة «بطاقة» (صورة الشخص،
     الباركود، الكتابة الغامقة) تتحسب منها — من غير كده صورة الوش بتقطّع البطاقة. */
  function fillHoles(b, wd, ht) {
    var n = wd * ht, out = new Uint8Array(n), st = [], i;
    for (var x = 0; x < wd; x++) { st.push(x, (ht - 1) * wd + x); }
    for (var y = 0; y < ht; y++) { st.push(y * wd, y * wd + wd - 1); }
    while (st.length) {
      var q = st.pop();
      if (out[q] || b[q]) continue;
      out[q] = 1;
      var qx = q % wd, qy = (q / wd) | 0;
      if (qx > 0) st.push(q - 1); if (qx < wd - 1) st.push(q + 1);
      if (qy > 0) st.push(q - wd); if (qy < ht - 1) st.push(q + wd);
    }
    var f = new Uint8Array(n);
    for (i = 0; i < n; i++) f[i] = out[i] ? 0 : 1;
    return f;
  }

  /* الأركان بدقة: خط مستقيم على كل ضلع من نقط الحدود (من غير الأركان
     المدوّرة)، والركن = تقاطع ضلعين. بيمسك الميل والتصوير بزاوية. */
  function refineQuad(pts, r) {
    var C = r.corners, lines = [];
    var side = Math.min(r.w, r.h);
    for (var k = 0; k < 4; k++) {
      var a = C[k], b = C[(k + 1) % 4];
      var L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1) return null;
      var ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, nx = -uy, ny = ux;
      var sel = [];
      for (var i = 0; i < pts.length; i++) {
        var px = pts[i][0] - a[0], py = pts[i][1] - a[1];
        var t = (px * ux + py * uy) / L, d = Math.abs(px * nx + py * ny);
        if (t > 0.15 && t < 0.85 && d < side * 0.06) sel.push(pts[i]);
      }
      if (sel.length < 6) return null;
      var mx = 0, my = 0; sel.forEach(function (q) { mx += q[0]; my += q[1]; }); mx /= sel.length; my /= sel.length;
      var sxx = 0, syy = 0, sxy = 0;
      sel.forEach(function (q) { var dx = q[0] - mx, dy = q[1] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; });
      var ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
      lines.push({ x: mx, y: my, dx: Math.cos(ang), dy: Math.sin(ang) });
    }
    var quad = [];
    for (var j = 0; j < 4; j++) {
      var l1 = lines[(j + 3) % 4], l2 = lines[j];       /* الركن j بين الضلع اللي قبله والضلع بتاعه */
      var den = l1.dx * l2.dy - l1.dy * l2.dx;
      if (Math.abs(den) < 1e-6) return null;
      var t1 = ((l2.x - l1.x) * l2.dy - (l2.y - l1.y) * l2.dx) / den;
      quad.push([l1.x + t1 * l1.dx, l1.y + t1 * l1.dy]);
    }
    var a2 = polyArea(quad);
    if (!(a2 > r.area * 0.85 && a2 < r.area * 1.15)) return null;
    return quad;
  }

  function scoreCandidate(comp, wd, ht, doc) {
    if (comp.pts.length < 8) return null;
    var h = hull(comp.pts);
    if (h.length < 4) return null;
    var r = minRect(h);
    if (!r || r.area < 1) return null;
    var frac = r.area / (wd * ht);
    if (frac < 0.015 || frac > 0.985) return null;
    var ratio = Math.max(r.w, r.h) / Math.max(1, Math.min(r.w, r.h));
    if (doc ? (ratio < 1.05 || ratio > 2.3) : (ratio < 1.25 || ratio > 2.0)) return null;
    var fill = polyArea(h) / r.area;                  /* الغلاف قد إيه مالي المستطيل */
    var solid = comp.area / r.area;                   /* المنطقة نفسها مصمتة ولا مخرّمة */
    if (fill < 0.86) return null;
    /* الخلفية (الترابيزة) دايماً لامسة حواف الصورة؛ البطاقة لأ — إلا لو مالية
       الكادر تقريباً (ساعتها القص مش فارق أصلاً) */
    /* لامسة حرف الصورة: يا خلفية، يا بطاقة متصوّرة قريب ومالية العرض (موكل ١١٣٠).
       بنسيبها مرشّحة بعلامة «touchy»، وcardLike بيطلب منها تفاصيل وإضاءة أعلى. */
    var touchy = comp.touch > 0.04 * comp.pts.length && frac < 0.8;
    if (comp.touch > 0.35 * comp.pts.length) return null;
    var ratioScore = doc ? 1 - Math.min(1, Math.abs(ratio - DOC_RATIO) / 0.6)
                         : 1 - Math.min(1, Math.abs(ratio - CARD_RATIO) / 0.45);
    var score = (0.45 * ratioScore + 0.35 * fill + 0.2 * Math.min(1, solid)) * Math.pow(frac, 0.25);
    /* أركان المستطيل ← أقرب نقطة غلاف لكل ركن (بيمسك الميل المنظوري) */
    var quad = refineQuad(comp.pts, r) || r.corners;
    return { score: touchy ? score * 0.85 : score, quad: quad, touchy: touchy };
  }

  function detect(im, doc) {
    var sc = Math.min(1, WORK / Math.max(im.naturalWidth, im.naturalHeight));
    var G = grayOf(im, sc), wd = G.w, ht = G.h, g = G.g, n = wd * ht, i;
    var minArea = n * 0.012, cands = [];

    /* (أ) فصل بالإضاءة بأكتر من عتبة: Otsu لوحده ممكن يلزّق البطاقة الفاتحة
       في انعكاس رمادي على الإزاز؛ عتبة أعلى بتسيب البطاقة البيضا لوحدها.
       بنوقف أول ما نلاقي مستطيل بطاقة واضح. */
    var th = otsu(g);
    var srt = Array.prototype.slice.call(g).sort(function (a, b) { return a - b; });
    var pct = function (q) { return srt[Math.min(n - 1, Math.floor(n * q))]; };
    /* البطاقة فاتحة ومليانة كتابة/صورة/باركود. ضل الموبايل اللي صوّر (مستطيل غامق
       فاضي) كان بيتمسك على إنه البطاقة (موكل ١١٣٠، ١-١٠) — فالمرشّح لازم يكون
       مش أغمق من نص الصورة، وجواه تفاصيل قريبة من متوسط الصورة على الأقل. */
    var gTex = 0;
    for (i = 0; i < n - wd - 1; i += 7) gTex += Math.abs(g[i + 1] - g[i]) + Math.abs(g[i + wd] - g[i]);
    gTex /= Math.ceil((n - wd - 1) / 7);
    var gMed = pct(0.5);
    function inside(quad) {
      var xs = quad.map(function (q) { return q[0]; }), ys = quad.map(function (q) { return q[1]; });
      var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
      var mx = (x1 - x0) * 0.15, my = (y1 - y0) * 0.15;
      x0 = Math.max(1, Math.round(x0 + mx)); x1 = Math.min(wd - 2, Math.round(x1 - mx));
      y0 = Math.max(1, Math.round(y0 + my)); y1 = Math.min(ht - 2, Math.round(y1 - my));
      var sum = 0, tex = 0, k = 0;
      for (var yy = y0; yy <= y1; yy += 2) for (var xx = x0; xx <= x1; xx += 2) {
        var pp = yy * wd + xx; sum += g[pp]; tex += Math.abs(g[pp + 1] - g[pp]) + Math.abs(g[pp + wd] - g[pp]); k++;
      }
      return k ? { mean: sum / k, tex: tex / k } : null;
    }
    function cardLike(sc) {
      if (!sc) return null;
      var m = inside(sc.quad);
      if (!m) return null;
      if (m.mean < gMed * (sc.touchy ? 1.0 : 0.92)) return null;   /* أغمق من الصورة ← ضل/خلفية */
      if (m.tex < gTex * (sc.touchy ? 1.3 : 0.7)) return null;     /* سادة من غير تفاصيل */
      return sc;
    }
    /* [العتبة، فاتح؟، قوة الفصل]: الأخيرة بفصل أقوى — البطاقة اللي لازقة في رسمة
       على المفرش (دايرة فاتحة، موكل ١١٣٠ ضهر) بتنفصل عنها */
    var tries = [[th, true, 2], [th, false, 2], [pct(0.85), true, 2], [pct(0.78), true, 2], [pct(0.92), true, 2], [pct(0.70), true, 2],
                 [pct(0.80), true, 6], [pct(0.85), true, 6], [pct(0.74), true, 6], [pct(0.88), true, 8]];
    var good = null;
    for (var ti = 0; ti < tries.length && !good; ti++) {
      var thr = tries[ti][0], bright = tries[ti][1], openIt = tries[ti][2];
      var b = new Uint8Array(n);
      for (i = 0; i < n; i++) b[i] = bright ? (g[i] > thr ? 1 : 0) : (g[i] <= thr ? 1 : 0);
      b = morph(morph(b, wd, ht, true, 2), wd, ht, false, 2);          /* close */
      b = fillHoles(b, wd, ht);                                        /* صورة الشخص/الباركود جوه البطاقة */
      b = morph(morph(b, wd, ht, false, openIt), wd, ht, true, openIt);  /* open — يفصل البطاقة عن أي لمعة لازقة */
      components(b, wd, ht, minArea).forEach(function (c) {
        cands.push(c);
        var sc0 = cardLike(scoreCandidate(c, wd, ht, doc));
        if (sc0 && sc0.score >= 0.55) good = sc0;
      });
    }

    /* (ب٠) بكثافة التفاصيل — البطاقة مليانة كتابة وأرقام وباركود وصورة، والخلفية
       (مفرش، ترابيزة، ضل) ناعمة نسبياً. ده بيشتغل مع الصور المهزوزة أو اللي فيها
       ضل أو رسومات لازقة في البطاقة، لأنه مش معتمد على لون البطاقة ولا حوافها. */
    if (!good) {
      var tx = new Float32Array(n);
      for (i = 0; i < n - wd - 1; i++) tx[i] = Math.abs(g[i + 1] - g[i]) + Math.abs(g[i + wd] - g[i]);
      var rB = Math.max(3, Math.round(Math.min(wd, ht) / 60));
      var tb = blur(tx, wd, ht, rB);
      var ts = Array.prototype.slice.call(tb).sort(function (a, b) { return a - b; });
      /* [العتبة، قوة الفصل]: فصل أقوى بيقطع الرسومات اللي لازقة في حرف البطاقة */
      [[0.70, 3], [0.70, 7], [0.62, 7], [0.78, 5], [0.70, 11], [0.62, 11]].forEach(function (qo) {
        if (good) return;
        var tthr = ts[Math.floor(n * qo[0])], bt = new Uint8Array(n);
        for (i = 0; i < n; i++) bt[i] = tb[i] > tthr ? 1 : 0;
        bt = morph(morph(bt, wd, ht, true, 3), wd, ht, false, 3);
        bt = fillHoles(bt, wd, ht);
        bt = morph(morph(bt, wd, ht, false, qo[1]), wd, ht, true, qo[1]);
        components(bt, wd, ht, minArea).forEach(function (c) {
          cands.push(c);
          var sc1 = cardLike(scoreCandidate(c, wd, ht, doc));
          if (sc1 && sc1.score >= 0.45) good = sc1;
        });
      });
    }

    /* (ب) بالحواف — لو الإضاءة ما لقتش بطاقة واضحة */
    if (!good) {
    var mag = new Float32Array(n), mx = 0;
    for (var y = 1; y < ht - 1; y++) for (var x = 1; x < wd - 1; x++) {
      var p = y * wd + x;
      var gx = g[p - wd + 1] + 2 * g[p + 1] + g[p + wd + 1] - g[p - wd - 1] - 2 * g[p - 1] - g[p + wd - 1];
      var gy = g[p + wd - 1] + 2 * g[p + wd] + g[p + wd + 1] - g[p - wd - 1] - 2 * g[p - wd] - g[p - wd + 1];
      mag[p] = Math.sqrt(gx * gx + gy * gy); if (mag[p] > mx) mx = mag[p];
    }
    var sorted = Array.prototype.slice.call(mag).sort(function (a, b) { return a - b; });
    var eth = Math.max(sorted[Math.floor(n * 0.88)], mx * 0.12);
    var e = new Uint8Array(n);
    for (i = 0; i < n; i++) e[i] = mag[i] > eth ? 1 : 0;
    e = morph(e, wd, ht, true, 2);
    /* ملء من حافة الصورة على غير الحواف ← اللي ما اتملاش = مناطق مقفولة */
    var outside = new Uint8Array(n), st = [];
    for (x = 0; x < wd; x++) { st.push(x, (ht - 1) * wd + x); }
    for (y = 0; y < ht; y++) { st.push(y * wd, y * wd + wd - 1); }
    while (st.length) {
      var q = st.pop();
      if (outside[q] || e[q]) continue;
      outside[q] = 1;
      var qx = q % wd, qy = (q / wd) | 0;
      if (qx > 0) st.push(q - 1); if (qx < wd - 1) st.push(q + 1);
      if (qy > 0) st.push(q - wd); if (qy < ht - 1) st.push(q + wd);
    }
    var filled = new Uint8Array(n);
    for (i = 0; i < n; i++) filled[i] = outside[i] ? 0 : 1;
    filled = morph(filled, wd, ht, false, 2);
    components(filled, wd, ht, minArea).forEach(function (c) { cands.push(c); });
    }

    var best = null, dbg = [];
    cands.forEach(function (c) {
      var s = cardLike(scoreCandidate(c, wd, ht, doc));
      dbg.push({ area: c.area, pts: c.pts.length, touch: c.touch, score: s ? +s.score.toFixed(3) : null });
      if (s && (!best || s.score > best.score)) best = s;
    });
    detect.last = { w: wd, h: ht, cands: dbg, quad: best && best.quad };
    if (!best || best.score < 0.12) return null;
    /* شدّة صغيرة لجوه (٠٫٦٪) عشان خط الخلفية الرفيع على الحواف ما يبانش */
    var cx = 0, cy = 0;
    best.quad.forEach(function (p) { cx += p[0] / 4; cy += p[1] / 4; });
    return best.quad.map(function (p) {
      return [(p[0] + (cx - p[0]) * 0.012) / sc, (p[1] + (cy - p[1]) * 0.012) / sc];
    });
  }

  /* ------------------------------------------------ تحويل منظوري */
  function solve(A, b) {                   /* Gauss-Jordan لنظام ٨×٨ */
    var n = b.length, M = A.map(function (r, i) { return r.concat([b[i]]); });
    for (var c = 0; c < n; c++) {
      var piv = c;
      for (var r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      var t = M[c]; M[c] = M[piv]; M[piv] = t;
      if (Math.abs(M[c][c]) < 1e-12) return null;
      for (r = 0; r < n; r++) {
        if (r === c) continue;
        var f = M[r][c] / M[c][c];
        for (var k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    return M.map(function (r, i) { return r[n] / r[i]; });
  }
  /* homography من مستطيل الناتج (dst) لأركان البطاقة في الأصل (src) */
  function homography(dst, src) {
    var A = [], b = [];
    for (var i = 0; i < 4; i++) {
      var x = dst[i][0], y = dst[i][1], u = src[i][0], v = src[i][1];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    var h = solve(A, b);
    return h ? h.concat([1]) : null;
  }

  /* يرتّب الأركان: فوق-شمال، فوق-يمين، تحت-يمين، تحت-شمال، والضلع الأول هو الطويل */
  function orderQuad(q, doc) {
    var cx = 0, cy = 0; q.forEach(function (p) { cx += p[0] / 4; cy += p[1] / 4; });
    q = q.slice().sort(function (a, b) { return Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx); });
    /* بعد الترتيب بالزاوية: ابدأ من أقرب ركن لفوق-شمال */
    var si = 0, bd = 1e18;
    q.forEach(function (p, i) { var d = p[0] + p[1]; if (d < bd) { bd = d; si = i; } });
    q = q.slice(si).concat(q.slice(0, si));
    function len(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
    var top = len(q[0], q[1]) + len(q[2], q[3]), side = len(q[1], q[2]) + len(q[3], q[0]);
    if (!doc && side > top) q = [q[3], q[0], q[1], q[2]];      /* البطاقة واقفة ← خلّي الطويل أفقي */
    return q;
  }

  function warp(im, quad, doc) {
    var sw = im.naturalWidth, sh = im.naturalHeight, OUT_W = OUT_CW, OUT_H = OUT_CH;
    if (doc) {                                /* الورقة بمقاسها من أضلاعها (طولي أو عرضي زي ما هي) */
      var L = function (a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); };
      var qw = (L(quad[0], quad[1]) + L(quad[2], quad[3])) / 2, qh = (L(quad[1], quad[2]) + L(quad[3], quad[0])) / 2;
      var k = Math.min(1, 2200 / Math.max(qw, qh, 1));
      OUT_W = Math.max(50, Math.round(qw * k)); OUT_H = Math.max(50, Math.round(qh * k));
    }
    var sc = canvasOf(sw, sh), sx = sc.getContext("2d");
    sx.drawImage(im, 0, 0);
    var src = sx.getImageData(0, 0, sw, sh).data;
    var H = homography([[0, 0], [OUT_W, 0], [OUT_W, OUT_H], [0, OUT_H]], quad);
    if (!H) return null;
    var oc = canvasOf(OUT_W, OUT_H), ox = oc.getContext("2d"), out = ox.createImageData(OUT_W, OUT_H), od = out.data;
    for (var y = 0; y < OUT_H; y++) {
      for (var x = 0; x < OUT_W; x++) {
        var den = H[6] * x + H[7] * y + H[8];
        var u = (H[0] * x + H[1] * y + H[2]) / den, v = (H[3] * x + H[4] * y + H[5]) / den;
        var o = (y * OUT_W + x) * 4;
        if (u < 0 || v < 0 || u >= sw - 1 || v >= sh - 1) { od[o] = od[o + 1] = od[o + 2] = 255; od[o + 3] = 255; continue; }
        var x0 = u | 0, y0 = v | 0, fx = u - x0, fy = v - y0, i0 = (y0 * sw + x0) * 4, i1 = i0 + sw * 4;
        for (var ch = 0; ch < 3; ch++) {
          var top = src[i0 + ch] * (1 - fx) + src[i0 + 4 + ch] * fx;
          var bot = src[i1 + ch] * (1 - fx) + src[i1 + 4 + ch] * fx;
          od[o + ch] = top * (1 - fy) + bot * fy;
        }
        od[o + 3] = 255;
      }
    }
    ox.putImageData(out, 0, 0);
    return oc;
  }

  /* --------------------------------------------- اتجاه القراءة (٠ أو ١٨٠) */
  function needsFlip(cv, side) {
    if (side === "doc") return false;
    var wd = 160, ht = Math.round(wd * cv.height / cv.width);
    var c = canvasOf(wd, ht), x = c.getContext("2d");
    x.drawImage(cv, 0, 0, wd, ht);
    var d = x.getImageData(0, 0, wd, ht).data, g = new Float32Array(wd * ht), i;
    for (i = 0; i < g.length; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    function hEnergy(y0, y1) {                /* تغيّرات أفقية = خطوط رأسية (باركود) */
      var s = 0;
      for (var y = y0; y < y1; y++) for (var xx = 1; xx < wd; xx++) s += Math.abs(g[y * wd + xx] - g[y * wd + xx - 1]);
      return s / Math.max(1, (y1 - y0) * wd);
    }
    function dark(x0, x1) {
      var s = 0, n = 0;
      for (var y = Math.round(ht * 0.15); y < Math.round(ht * 0.85); y++) for (var xx = x0; xx < x1; xx++) { s += 255 - g[y * wd + xx]; n++; }
      return s / Math.max(1, n);
    }
    function sat(x0, x1) {                    /* التشبّع اللوني: الطباعة الملونة (الأهرامات والختم) */
      var s = 0, n = 0;
      for (var y = Math.round(ht * 0.15); y < Math.round(ht * 0.85); y++) for (var xx = x0; xx < x1; xx++) {
        var k = (y * wd + xx) * 4, mx = Math.max(d[k], d[k + 1], d[k + 2]), mn = Math.min(d[k], d[k + 1], d[k + 2]);
        s += mx ? (mx - mn) / mx : 0; n++;
      }
      return s / Math.max(1, n);
    }
    if (side === "back") {
      var top = hEnergy(0, Math.round(ht * 0.35)), bot = hEnergy(Math.round(ht * 0.65), ht);
      return top > bot * 1.15;
    }
    /* الوش: صورة الشخص على الشمال، والطباعة الملونة (الأهرامات) على اليمين.
       الأساس التشبّع اللوني (ناحية الصورة رمادي باهت) — الغمقان لوحده غلط مع
       بطاقة خلفية صورتها فاتحة (موكل ١١١٨: اتقلبت ١٨٠). الغمقان احتياطي بس. */
    var x3 = Math.round(wd * 0.33), x6 = Math.round(wd * 0.67);
    var sL = sat(0, x3), sR = sat(x6, wd);
    if (sL > sR * 1.15) return true;
    if (sR > sL * 1.15) return false;
    var left = dark(0, x3), right = dark(x6, wd);
    return right > left * 1.12;
  }

  function rotate180(cv) {
    var c = canvasOf(cv.width, cv.height), x = c.getContext("2d");
    x.translate(cv.width, cv.height); x.rotate(Math.PI); x.drawImage(cv, 0, 0);
    return c;
  }
  function rotate90(cv) {
    var c = canvasOf(cv.height, cv.width), x = c.getContext("2d");
    x.translate(cv.height, 0); x.rotate(Math.PI / 2); x.drawImage(cv, 0, 0);
    return c;
  }

  function cardShaped(wd, ht) {                 /* ٨٥٫٦×٥٤ = ١٫٥٨٥ ± شوية */
    var r = Math.max(wd, ht) / Math.max(1, Math.min(wd, ht));
    return r >= 1.52 && r <= 1.66;            /* ٣:٢ (١٫٥) و١٦:٩ (١٫٧٨) صور كاميرا عادية — برّه المدى */
  }
  /* التحسين بتاع السكانر (scanfx.js) بعد القص — زي «تلقائي» في السكانر */
  function finish(cv, opts) {
    if (opts && opts.enhance === false || !w.ScanFx) return cv;
    try { return ScanFx.enhance(cv); } catch (e) { return cv; }
  }
  function process(dataUrl, opts) {
    opts = opts || {};
    var doc = opts.side === "doc";
    return loadImage(dataUrl).then(function (im) {
      var quad = null;
      try { quad = detect(im, doc); } catch (e) { quad = null; }
      var cv, cropped = false;
      if (quad) {
        quad = orderQuad(quad, doc);
        try { quad = snapQuad(buildSnapField(im), quad, Math.max(im.naturalWidth, im.naturalHeight) * 0.02); } catch (e) { }
        cv = warp(im, orderQuad(quad, doc), doc);
        cropped = !!cv;
      }
      if (!cv) {                              /* مفيش بطاقة واضحة: الصورة كاملة، بس أفقي */
        cv = canvasOf(im.naturalWidth, im.naturalHeight);
        cv.getContext("2d").drawImage(im, 0, 0);
        if (doc) return { dataUrl: finish(cv, opts).toDataURL("image/jpeg", 0.9), cropped: false, rotated: false };
        if (cv.height > cv.width) cv = rotate90(cv);
        /* الصورة نفسها بمقاس البطاقة (متقصوصة قبل كده — واتساب/سكانر): مفيش
           حواف حوالين البطاقة تتلقط، فدي بطاقة جاهزة مش فشل في القص. */
        if (cardShaped(cv.width, cv.height)) cropped = true;
      }
      /* الاتجاه بيتظبط كمان لصورة مقصوصة جاهزة (من السكانر) لو شكلها بطاقة */
      var ratio = cv.width / cv.height, rotated = false;
      if (!opts.noFlip && (cropped || (ratio > 1.4 && ratio < 1.8)) && needsFlip(cv, opts.side)) { cv = rotate180(cv); rotated = true; }
      return { dataUrl: finish(cv, opts).toDataURL("image/jpeg", 0.9), cropped: cropped, rotated: rotated };
    });
  }

  /* تدوير يدوي ٩٠° مع عقارب الساعة — للحالات اللي الحساب فيها يغلط */
  function rotateRight(dataUrl) {
    return loadImage(dataUrl).then(function (im) {
      var cv = canvasOf(im.naturalWidth, im.naturalHeight);
      cv.getContext("2d").drawImage(im, 0, 0);
      return rotate90(cv).toDataURL("image/jpeg", 0.9);
    });
  }

  /** للشاشة المنفصلة: الأركان المكتشفة بإحداثيات الصورة الأصلية (أو null) */
  function detectCorners(dataUrl, side) {
    var doc = side === "doc";
    return loadImage(dataUrl).then(function (im) {
      var q = null;
      try { q = detect(im, doc); } catch (e) { q = null; }
      return { quad: q ? orderQuad(q, doc) : null, w: im.naturalWidth, h: im.naturalHeight };
    });
  }
  /** تعديل اتجاه صورة متقصوصة قبل كده (من غير قص) — للصور القديمة */
  function fixOrientation(dataUrl, side) {
    return loadImage(dataUrl).then(function (im) {
      var c = canvasOf(im.naturalWidth, im.naturalHeight); c.getContext("2d").drawImage(im, 0, 0);
      var cv = c;
      if (cv.height > cv.width) cv = rotate90(cv);
      var turned = cv !== c;
      if (needsFlip(cv, side)) { cv = rotate180(cv); turned = true; }
      return { dataUrl: turned ? cv.toDataURL("image/jpeg", 0.9) : dataUrl, rotated: turned };
    });
  }
  /** قص بأركان محددة (من الكشف أو من سحب المستخدم) + تعديل الاتجاه */
  function cropWithQuad(dataUrl, quad, side, opts) {
    var doc = side === "doc";
    return loadImage(dataUrl).then(function (im) {
      var cv = warp(im, orderQuad(quad, doc), doc);
      if (!cv) throw new Error("تعذّر القص");
      if (needsFlip(cv, side)) cv = rotate180(cv);
      return finish(cv, opts).toDataURL("image/jpeg", 0.9);
    });
  }

  /* ===================================== المغناطيس — منقول من السكانر (SnapField.kt)
     خريطة قوة الحواف، والركن المسحوب بيتشد لأقرب نقطة الضلعين الطالعين منها
     راكبين على حافة حقيقية على طول الضلع كله (مش سطر كتابة أو خط صغير).
     نفس الأرقام: الحافة القوية = ١ (النسبة ٩٧)، أقل درجة ٠٫٣، مكسب ٠٫٠٦. */
  var SNAP_MIN_SCORE = 0.3, SNAP_MIN_GAIN = 0.06, SNAP_STEP = 2, SNAP_WORK = 800;
  function buildSnapField(im) {
    var longest = Math.max(im.naturalWidth, im.naturalHeight);
    var f = longest > SNAP_WORK ? SNAP_WORK / longest : 1;
    var wd = Math.max(1, Math.round(im.naturalWidth * f)), ht = Math.max(1, Math.round(im.naturalHeight * f));
    var c = canvasOf(wd, ht), x = c.getContext("2d"); x.drawImage(im, 0, 0, wd, ht);
    var d = x.getImageData(0, 0, wd, ht).data, n = wd * ht, g0 = new Float32Array(n), i;
    for (i = 0; i < n; i++) g0[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    var g = blur(g0, wd, ht, 1);
    var gx = new Float32Array(n), gy = new Float32Array(n), mx = 0;
    for (var yy = 1; yy < ht - 1; yy++) for (var xx = 1; xx < wd - 1; xx++) {
      var p = yy * wd + xx;
      gx[p] = g[p - wd + 1] + 2 * g[p + 1] + g[p + wd + 1] - g[p - wd - 1] - 2 * g[p - 1] - g[p + wd - 1];
      gy[p] = g[p + wd - 1] + 2 * g[p + wd] + g[p + wd + 1] - g[p - wd - 1] - 2 * g[p - wd] - g[p - wd + 1];
      var m = Math.hypot(gx[p], gy[p]); if (m > mx) mx = m;
    }
    if (mx > 0) {
      var bins = 512, hist = new Int32Array(bins);
      for (i = 0; i < n; i++) hist[Math.min(bins - 1, ((Math.hypot(gx[i], gy[i]) / mx) * (bins - 1)) | 0)]++;
      var target = (n * 0.97) | 0, seen = 0, bin = 0;
      while (bin < bins) { seen += hist[bin]; if (seen >= target) break; bin++; }
      var norm = Math.max(1e-3, (bin + 1) / bins * mx);
      for (i = 0; i < n; i++) { gx[i] /= norm; gy[i] /= norm; }
    }
    return { w: wd, h: ht, scale: wd / im.naturalWidth, gx: gx, gy: gy };
  }
  function snapAcross(F, px, py, nx, ny) {
    var ix = Math.round(px), iy = Math.round(py);
    if (ix < 0 || iy < 0 || ix >= F.w || iy >= F.h) return 0;
    var i = iy * F.w + ix;
    return Math.min(1, Math.abs(F.gx[i] * nx + F.gy[i] * ny));
  }
  function snapLineScore(F, ax, ay, bx, by, spread) {
    var sax = ax * F.scale, say = ay * F.scale, ex = bx * F.scale - sax, ey = by * F.scale - say;
    var len = Math.hypot(ex, ey); if (len < 4) return 0;
    var nx = -ey / len, ny = ex / len;
    var samples = Math.max(8, Math.min(240, Math.round(len / 2))), total = 0;
    for (var k = 0; k < samples; k++) {
      var t = 0.1 + 0.8 * (k + 0.5) / samples, px = sax + ex * t, py = say + ey * t, best = 0;
      for (var o = -spread; o <= spread; o++) { var v = snapAcross(F, px + nx * o, py + ny * o, nx, ny); if (v > best) best = v; }
      total += best;
    }
    return Math.max(0, Math.min(1, total / samples));
  }
  /** الركن (x,y) بين prev و next ← أحسن نقطة في radius، أو null لو مفيش مكسب واضح */
  function snapCorner(F, x, y, prev, next, radius) {
    var r = Math.max(2, Math.round(radius * F.scale)), cx = Math.round(x * F.scale), cy = Math.round(y * F.scale);
    function score(px, py) {
      var sx = px / F.scale, sy = py / F.scale;
      return (snapLineScore(F, sx, sy, prev[0], prev[1], 0) + snapLineScore(F, sx, sy, next[0], next[1], 0)) / 2;
    }
    var raw = score(cx, cy), best = raw, bx = cx, by = cy, dx, dy;
    for (dy = -r; dy <= r; dy += SNAP_STEP) for (dx = -r; dx <= r; dx += SNAP_STEP) {
      var px = cx + dx, py = cy + dy;
      if (px < 0 || py < 0 || px >= F.w || py >= F.h) continue;
      var v = score(px, py); if (v > best) { best = v; bx = px; by = py; }
    }
    var ox = bx, oy = by;
    for (dy = -1; dy <= 1; dy++) for (dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      var qx = ox + dx, qy = oy + dy;
      if (qx < 0 || qy < 0 || qx >= F.w || qy >= F.h) continue;
      var v2 = score(qx, qy); if (v2 > best) { best = v2; bx = qx; by = qy; }
    }
    if (best < SNAP_MIN_SCORE || best < raw + SNAP_MIN_GAIN) return null;
    return [bx / F.scale, by / F.scale];
  }
  function snapQuad(F, quad, radius) {
    for (var it = 0; it < 2; it++) for (var k = 0; k < 4; k++) {
      var s2 = snapCorner(F, quad[k][0], quad[k][1], quad[(k + 3) % 4], quad[(k + 1) % 4], radius);
      if (s2) quad[k] = s2;
    }
    return quad;
  }

  /* ============================================ شاشة القص (بالضغط على الصورة)
     الصورة كاملة + ٤ أركان تتسحب بالصباع. «قص تلقائي» بيحط الأركان على حواف
     البطاقة، «قص» بيعرض النتيجة معدولة، «حفظ» بيسجّلها. */
  function openEditor(dataUrl, side, onSave) {
    var back = document.createElement("div");
    back.setAttribute("data-modal", "1"); back.setAttribute("data-nosave", "1");
    back.style.cssText = "position:fixed;inset:0;z-index:10060;background:#111;display:flex;flex-direction:column;direction:rtl";
    var stage = document.createElement("div");
    stage.style.cssText = "flex:1;position:relative;overflow:hidden;touch-action:none;display:flex;align-items:center;justify-content:center";
    var img = document.createElement("img");
    img.style.cssText = "max-width:100%;max-height:100%;display:block;user-select:none;-webkit-user-select:none";
    img.draggable = false;
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.style.cssText = "position:absolute;left:0;top:0;pointer-events:none";
    var poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    poly.setAttribute("fill", "rgba(37,99,235,.15)"); poly.setAttribute("stroke", "#2563EB"); poly.setAttribute("stroke-width", "2");
    svg.appendChild(poly);
    stage.appendChild(img); stage.appendChild(svg);
    var msg = document.createElement("div");
    msg.style.cssText = "color:#ddd;font-size:13px;text-align:center;padding:6px 10px;min-height:20px";
    var bar = document.createElement("div");
    bar.style.cssText = "display:flex;gap:6px;padding:8px;flex-wrap:wrap;background:#1c1c1c";
    back.appendChild(stage); back.appendChild(msg); back.appendChild(bar);
    document.body.appendChild(back);
    if (w.UiLayer) UiLayer.raise(back);         /* قدّام الصفحة اللي اتفتحت منها (صفحة الموكل) */

    var cur = dataUrl, quad = null, natW = 0, natH = 0, handles = [], mode = "edit", field = null;
    var NOUN = side === "doc" ? "الورقة" : "البطاقة";
    function snapRadius() { return Math.max(natW, natH) * 0.03; }
    function snapOne(k) {
      if (!field || !quad) return false;
      var s2 = snapCorner(field, quad[k][0], quad[k][1], quad[(k + 3) % 4], quad[(k + 1) % 4], snapRadius());
      if (s2) { quad[k] = s2; return true; }
      return false;
    }
    function btn(txt, primary, fn) {
      var b = document.createElement("button");
      b.type = "button"; b.textContent = txt;
      b.style.cssText = "flex:1 1 auto;min-height:46px;border-radius:10px;font-family:inherit;font-size:14px;padding:0 10px;" +
        (primary ? "border:0;background:#2563EB;color:#fff" : "border:1px solid #555;background:transparent;color:#eee");
      b.onclick = fn; bar.appendChild(b); return b;
    }
    function box() { return img.getBoundingClientRect(); }
    function stageBox() { return stage.getBoundingClientRect(); }
    function toScreen(p) { var r = box(), sb = stageBox(); return [r.left - sb.left + p[0] * r.width / natW, r.top - sb.top + p[1] * r.height / natH]; }
    function toImage(x, y) { var r = box(), sb = stageBox(); return [Math.max(0, Math.min(natW, (x - (r.left - sb.left)) * natW / r.width)), Math.max(0, Math.min(natH, (y - (r.top - sb.top)) * natH / r.height))]; }
    function drawQuad() {
      var sb = stageBox();
      svg.setAttribute("width", sb.width); svg.setAttribute("height", sb.height);
      handles.forEach(function (h) { h.style.display = quad && mode === "edit" ? "block" : "none"; });
      if (!quad || mode !== "edit") { poly.setAttribute("points", ""); return; }
      var pts = quad.map(toScreen);
      poly.setAttribute("points", pts.map(function (p) { return p[0] + "," + p[1]; }).join(" "));
      pts.forEach(function (p, i) { handles[i].style.left = (p[0] - 18) + "px"; handles[i].style.top = (p[1] - 18) + "px"; });
    }
    for (var k = 0; k < 4; k++) (function (k) {
      var h = document.createElement("div");
      h.style.cssText = "position:absolute;width:36px;height:36px;border-radius:50%;border:3px solid #fff;background:rgba(37,99,235,.85);box-shadow:0 0 0 2px #2563EB;touch-action:none;display:none";
      h.addEventListener("pointerdown", function (e) {
        e.preventDefault(); h.setPointerCapture(e.pointerId);
        function mv(ev) { var sb = stageBox(); quad[k] = toImage(ev.clientX - sb.left, ev.clientY - sb.top); drawQuad(); }
        function up() {
          h.removeEventListener("pointermove", mv); h.removeEventListener("pointerup", up);
          if (snapOne(k)) drawQuad();                        /* المغناطيس: يتشد على حافة البطاقة */
        }
        h.addEventListener("pointermove", mv); h.addEventListener("pointerup", up);
      });
      stage.appendChild(h); handles.push(h);
    })(k);
    function load(src, cb) {
      img.onload = function () {
        natW = img.naturalWidth; natH = img.naturalHeight;
        try { field = buildSnapField(img); } catch (e) { field = null; }
        setTimeout(function () { drawQuad(); if (cb) cb(); }, 30);
      };
      img.src = src;
    }
    function defaultQuad() {
      /* صورة بمقاس البطاقة = البطاقة مالية الصورة: الأركان على حواف الصورة نفسها */
      var f = side === "doc" ? 0.04 : cardShaped(natW, natH) ? 0.005 : 0.08, mx = natW * f, my = natH * f;
      return [[mx, my], [natW - mx, my], [natW - mx, natH - my], [mx, natH - my]];
    }
    function auto() {
      msg.textContent = "بيدوّر على حواف " + NOUN + "…";
      detectCorners(cur, side).then(function (d) {
        if (d.quad) {
          quad = field ? snapQuad(field, d.quad, snapRadius()) : d.quad;
          msg.textContent = "دي حواف " + NOUN + " — لو محتاجة ظبط اسحب الأركان (بتتشد لوحدها على الحافة)، وبعدين «قص».";
        }
        else { quad = defaultQuad(); msg.textContent = "ما لقيتش حواف واضحة — حط الأركان الأربعة على أركان " + NOUN + " بإيدك، وبعدين «قص»."; }
        mode = "edit"; drawQuad();
      });
    }
    function doCrop() {
      if (!quad) { auto(); return; }
      msg.textContent = "بيقص ويعدّل الاتجاه…";
      cropWithQuad(cur, quad, side).then(function (out) {
        cur = out; mode = "view"; quad = null;
        load(cur); msg.textContent = "لو كويسة دوس «حفظ». لو مقلوبة دوس «تدوير».";
      }).catch(function () { msg.textContent = "تعذّر القص — عدّل الأركان وجرّب تاني."; });
    }
    btn("✂ قص تلقائي", false, auto);
    btn("قص", true, doCrop);
    btn("↻ تدوير", false, function () {
      rotateRight(cur).then(function (out) { cur = out; quad = null; mode = "view"; load(cur); });
    });
    btn("💾 حفظ", true, function () {
      if (onSave && onSave(cur) === false) { msg.textContent = "تعذّر الحفظ."; return; }
      back.remove();
    });
    btn("إلغاء", false, function () { back.remove(); });
    window.addEventListener("resize", drawQuad);
    load(cur, auto);
  }

  /* لفّ صورة بزاوية مع عقارب الساعة (مضاعفات ٩٠) */
  function turnBy(dataUrl, deg) {
    return loadImage(dataUrl).then(function (im) {
      var cv = canvasOf(im.naturalWidth, im.naturalHeight);
      cv.getContext("2d").drawImage(im, 0, 0);
      for (var q = 0; q < Math.round(deg / 90) % 4; q++) cv = rotate90(cv);
      return cv.toDataURL("image/jpeg", 0.9);
    });
  }

  /* نفس اللي برنامج الاسكانر بيعمله، في خطوة واحدة، لأي صورة بتترفع في
     التطبيق (كارنيه محامي، بطاقة، مستند، مرفق): قص الحواف وتسوية المنظور +
     التحسين + اللف في اتجاه القراءة من النص نفسه (IdOcr.uprightTurn).
     kind: "card" (كارنيه/بطاقة: أفقي، والاتجاه ٠ أو ١٨٠) أو "doc" (ورق: ٠/٩٠/١٨٠/٢٧٠).
     بيرجّع { dataUrl, cropped, rotated } زي process. */
  function autoFix(dataUrl, kind) {
    var doc = kind !== "card";
    return process(dataUrl, { side: doc ? "doc" : "card", noFlip: true }).then(function (res) {
      if (!w.IdOcr || !IdOcr.uprightTurn) return res;
      return IdOcr.uprightTurn(res.dataUrl, doc ? [0, 90, 180, 270] : [0, 180]).then(function (deg) {
        if (!deg) return res;
        return turnBy(res.dataUrl, deg).then(function (url) {
          return { dataUrl: url, cropped: res.cropped, rotated: true };
        });
      });
    });
  }

  w.IdCrop = { process: process, autoFix: autoFix, turnBy: turnBy, rotateRight: rotateRight, detectCorners: detectCorners, fixOrientation: fixOrientation,
               cropWithQuad: cropWithQuad, openEditor: openEditor, _detect: detect,
               _snap: { build: buildSnapField, corner: snapCorner, quad: snapQuad } };
})(window);
