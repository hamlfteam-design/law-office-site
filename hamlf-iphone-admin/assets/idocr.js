/* =============================================================================
   قراءة بيانات بطاقة الرقم القومي من صورتها — على الجهاز، من غير نت.

   IdOcr.readFront(dataUrl) → Promise<{ idNo, name, addressFull, area, gov }>
   IdOcr.readBack(dataUrl)  → Promise<{ idExpiry, job, gender, religion, marital }>
   (أي حقل ما اتقراش بثقة بيرجع فاضي — أحسن من تخمين غلط.)

   ١) الرقم القومي وتاريخ «البطاقة سارية حتى»: Tesseract ضعيف جداً في الأرقام
      العربي على البطاقة، فبنقرأها بطريقة تانية:
        - السطر بيتلاقي (أكبر صف أرقام طويلة تحت يمين الوش / آخر سطر فوق
          الباركود في الضهر)، وكل رقم بيتفصل لوحده (مكوّنات متصلة).
        - كل رقم بيتقارن بنماذج أرقام متعلّمة من بطاقات المكتب نفسها
          (assets/ocr/idocr-tpl.js) — أقرب نموذج يكسب.
        - الرقم القومي لازم يعدّي كل الفحوصات: القرن ٢/٣، شهر ويوم صح، كود
          محافظة معروف، ورقم المراجعة الأخير (أوزان ٢٧٦٥٤٣٢٧٦٥٤٣٢ مقياس ١١
          — متجرّب على كل الأرقام المسجّلة). لو ما عدّاش، بنجرب عتبة/اتجاه تاني،
          ولو مفيش، الحقل يفضل فاضي.
      اتجرّب على ١٠٩ بطاقة: ٨٩ اتقروا صح، ٠ غلط، ٢٠ ما اتقروش.
   ٢) الكلام (الاسم، العنوان، المهنة، النوع/الديانة/الحالة): Tesseract
      (tesseract.js + نموذج العربي الخفيف، assets/ocr/) — سطر سطر بعد تنضيف
      الخلفية (الأهرامات والزخرفة)، لأن قراية البطاقة كلها مرة واحدة بتطلع كلام
      ملخبط.
   ============================================================================= */
(function (w) {
  "use strict";

  var GOV = { "01": 1, "02": 1, "03": 1, "04": 1, "11": 1, "12": 1, "13": 1, "14": 1, "15": 1, "16": 1, "17": 1, "18": 1, "19": 1,
              "21": 1, "22": 1, "23": 1, "24": 1, "25": 1, "26": 1, "27": 1, "28": 1, "29": 1, "31": 1, "32": 1, "33": 1, "34": 1, "35": 1, "88": 1 };
  var CHK_W = [2, 7, 6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

  /* ------------------------------------------------------------ نماذج الأرقام */
  var TPL = null;
  function templates() {
    if (TPL) return TPL;
    TPL = { n: [], d: [] };
    (w.IdOcrTpl || []).forEach(function (t) {
      var v = new Float32Array(259), s = t[2];
      for (var i = 0; i < 256; i++) v[i] = (s.charCodeAt(i) - 48) / 9;
      v[256] = t[3]; v[257] = t[4]; v[258] = t[5];
      (TPL[t[0]] || (TPL[t[0]] = [])).push({ y: t[1], v: v });
    });
    return TPL;
  }

  /* ------------------------------------------------------------ أدوات صور */
  function loadImage(src) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () { res(im); };
      im.onerror = function () { rej(new Error("تعذّر قراءة الصورة.")); };
      im.src = src;
    });
  }
  function canvasOf(wd, ht) { var c = document.createElement("canvas"); c.width = wd; c.height = ht; return c; }
  function fromImage(im) { var c = canvasOf(im.naturalWidth, im.naturalHeight); c.getContext("2d", { willReadFrequently: true }).drawImage(im, 0, 0); return c; }
  /* تدوير k×٩٠ عكس عقارب الساعة (زي np.rot90) */
  function rot(cv, k) {
    k = ((k % 4) + 4) % 4;
    if (!k) return cv;
    var sw = cv.width, sh = cv.height, c = k % 2 ? canvasOf(sh, sw) : canvasOf(sw, sh), x = c.getContext("2d");
    if (k === 1) { x.translate(0, sw); x.rotate(-Math.PI / 2); }
    else if (k === 2) { x.translate(sw, sh); x.rotate(Math.PI); }
    else { x.translate(sh, 0); x.rotate(Math.PI / 2); }
    x.drawImage(cv, 0, 0);
    return c;
  }
  function toWidth(cv, W) {
    var H = Math.round(cv.height * W / cv.width), c = canvasOf(W, H), x = c.getContext("2d");
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
    x.drawImage(cv, 0, 0, W, H);
    return c;
  }
  /* أقصى قناة لكل بكسل: الحبر الأسود غامق في التلاتة، والخلفية البيج فاتحة في الأحمر */
  function maxChan(cv) {
    var d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data, n = cv.width * cv.height, out = new Uint8Array(n);
    for (var i = 0; i < n; i++) { var r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2]; out[i] = r > g ? (r > b ? r : b) : (g > b ? g : b); }
    return { d: out, w: cv.width, h: cv.height };
  }
  function crop(M, x0, y0, x1, y1) {
    var w2 = x1 - x0, h2 = y1 - y0, out = new Uint8Array(w2 * h2);
    for (var y = 0; y < h2; y++) out.set(M.d.subarray((y + y0) * M.w + x0, (y + y0) * M.w + x1), y * w2);
    return { d: out, w: w2, h: h2 };
  }
  function percentile(arr, q) {               /* زي numpy (استيفاء خطّي) */
    var h = new Int32Array(256), n = arr.length, i;
    for (i = 0; i < n; i++) h[arr[i]]++;
    var pos = (n - 1) * q / 100, lo = Math.floor(pos), frac = pos - lo;
    function at(k) { var c = 0; for (var v = 0; v < 256; v++) { c += h[v]; if (c > k) return v; } return 255; }
    var a = at(lo);
    return frac ? a + (at(Math.min(n - 1, lo + 1)) - a) * frac : a;
  }
  function median(xs) {
    var s = xs.slice().sort(function (a, b) { return a - b; }), n = s.length;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  }
  function otsu(arr) {                         /* زي cv2.THRESH_OTSU */
    var h = new Float64Array(256), n = arr.length, i;
    for (i = 0; i < n; i++) h[arr[i]]++;
    var mu = 0; for (i = 0; i < 256; i++) mu += i * h[i] / n;
    var q1 = 0, mu1 = 0, best = 0, t = 0;
    for (i = 0; i < 256; i++) {
      var p = h[i] / n, q2;
      q1 += p; if (q1 < 1e-9) continue;
      q2 = 1 - q1; if (q2 < 1e-9) break;
      mu1 += i * p;
      var m1 = mu1 / q1, m2 = (mu - mu1) / q2, s = q1 * q2 * (m1 - m2) * (m1 - m2);
      if (s > best) { best = s; t = i; }
    }
    return t;
  }
  /* مكوّنات متصلة (٤-اتصال)، مرقّمة بترتيب أول بكسل في المسح — زي scipy.ndimage.label */
  function label(mask, wd, ht) {
    var lab = new Int32Array(wd * ht), boxes = [], st = new Int32Array(wd * ht), id = 0;
    for (var p0 = 0; p0 < wd * ht; p0++) {
      if (!mask[p0] || lab[p0]) continue;
      id++;
      var sp = 0, x0 = wd, x1 = 0, y0 = ht, y1 = 0, area = 0;
      st[sp++] = p0; lab[p0] = id;
      while (sp) {
        var p = st[--sp], x = p % wd, y = (p / wd) | 0;
        area++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && mask[p - 1] && !lab[p - 1]) { lab[p - 1] = id; st[sp++] = p - 1; }
        if (x < wd - 1 && mask[p + 1] && !lab[p + 1]) { lab[p + 1] = id; st[sp++] = p + 1; }
        if (y > 0 && mask[p - wd] && !lab[p - wd]) { lab[p - wd] = id; st[sp++] = p - wd; }
        if (y < ht - 1 && mask[p + wd] && !lab[p + wd]) { lab[p + wd] = id; st[sp++] = p + wd; }
      }
      boxes.push({ i: id, x: x0, x1: x1 + 1, y: y0, y1: y1 + 1, area: area });
    }
    return { lab: lab, boxes: boxes, w: wd };
  }
  function glyphMask(L, d, ids) {
    var gw = d.x1 - d.x, gh = d.y1 - d.y, m = new Uint8Array(gw * gh);
    for (var y = 0; y < gh; y++) for (var x = 0; x < gw; x++) {
      var v = L.lab[(y + d.y) * L.w + x + d.x];
      if (v && ids.indexOf(v) >= 0) m[y * gw + x] = 1;
    }
    return { m: m, w: gw, h: gh };
  }

  /* ٢٥٦ متوسط مساحة (١٦×١٦) على مربع محشو بالمنتصف + ٣ نسب — زي feat2 في التعلّم */
  function feat(g, hr, wr) {
    var h = g.h, wd = g.w, S = Math.max(h, wd), oy = (S - h) >> 1, ox = (S - wd) >> 1;
    var cs = new Float64Array((S + 1) * (S + 1)), x, y;
    for (y = 0; y < S; y++) {
      var run = 0;
      for (x = 0; x < S; x++) {
        var yy = y - oy, xx = x - ox, v = (yy >= 0 && yy < h && xx >= 0 && xx < wd) ? g.m[yy * wd + xx] : 0;
        run += v;
        cs[(y + 1) * (S + 1) + x + 1] = cs[y * (S + 1) + x + 1] + run;
      }
    }
    function integ(Y, X) {
      var y0 = Math.floor(Y), x0 = Math.floor(X), y1 = Math.min(y0 + 1, S), x1 = Math.min(x0 + 1, S), fy = Y - y0, fx = X - x0;
      var a = cs[y0 * (S + 1) + x0] * (1 - fx) + cs[y0 * (S + 1) + x1] * fx;
      var b = cs[y1 * (S + 1) + x0] * (1 - fx) + cs[y1 * (S + 1) + x1] * fx;
      return a * (1 - fy) + b * fy;
    }
    var f = new Float32Array(259);
    for (var i = 0; i < 16; i++) for (var j = 0; j < 16; j++) {
      var ya = i * S / 16, yb = (i + 1) * S / 16, xa = j * S / 16, xb = (j + 1) * S / 16;
      f[i * 16 + j] = (integ(yb, xb) - integ(ya, xb) - integ(yb, xa) + integ(ya, xa)) / ((yb - ya) * (xb - xa));
    }
    f[256] = hr * 2; f[257] = wr * 2; f[258] = Math.min(3, wd / h);
    return f;
  }
  function nearest(f, set) {
    var best = 1e18, by = -1;
    for (var k = 0; k < set.length; k++) {
      var v = set[k].v, s = 0;
      for (var i = 0; i < 259; i++) { var dd = f[i] - v[i]; s += dd * dd; if (s >= best) break; }
      if (s < best) { best = s; by = set[k].y; }
    }
    return by;
  }

  /* ------------------------------------------------------------ الرقم القومي */
  function validNid(d) {
    if (!/^[23]\d{13}$/.test(d) || !GOV[d.substr(7, 2)]) return false;
    var m = +d.substr(3, 2), dd = +d.substr(5, 2);
    if (m < 1 || m > 12 || dd < 1 || dd > 31) return false;
    var s = 0; for (var i = 0; i < 13; i++) s += +d[i] * CHK_W[i];
    var r = 11 - s % 11; r = r === 10 ? 0 : r === 11 ? 1 : r;
    return r % 10 === +d[13];
  }
  function segNid(cv1000, thr) {
    var M = maxChan(cv1000), H = M.h, W = M.w;
    var y0 = Math.floor(H * 0.60), x0 = Math.floor(W * 0.33);
    var reg = crop(M, x0, y0, W, H), n = reg.d.length, i;
    if (thr == null) thr = Math.min(120, percentile(reg.d, 8) + 40);
    else if (thr < 0) thr = otsu(reg.d);
    else if (thr < 1) thr = percentile(reg.d, 1) + thr * 100;
    var mask = new Uint8Array(n);
    for (i = 0; i < n; i++) mask[i] = reg.d[i] < thr ? 1 : 0;
    var L = label(mask, reg.w, reg.h), comps = [];
    L.boxes.forEach(function (b) {
      var h = b.y1 - b.y, wd = b.x1 - b.x;
      if (h < H * 0.008 || h > H * 0.10 || wd > W * 0.08 || b.area < 6) return;
      comps.push({ y: b.y, y1: b.y1, x: b.x, x1: b.x1, h: h, w: wd, i: b.i, cy: (b.y + b.y1) / 2 });
    });
    var tall = comps.filter(function (c) { return c.h > H * 0.03; }), best = null;
    tall.forEach(function (c) {
      var band = tall.filter(function (d) { return Math.abs(d.cy - c.cy) < H * 0.025; });
      if (!best || band.length > best.length) best = band;
    });
    if (!best || best.length < 6) return null;
    var cy = median(best.map(function (d) { return d.cy; })), hh = median(best.map(function (d) { return d.h; }));
    var xs0 = Math.min.apply(null, best.map(function (d) { return d.x; })) - hh * 2;
    var xs1 = Math.max.apply(null, best.map(function (d) { return d.x1; })) + hh * 2;
    var row = comps.filter(function (d) { return Math.abs(d.cy - cy) < hh * 0.6 && d.x >= xs0 && d.x <= xs1 && d.h < hh * 1.5; });
    row.sort(function (a, b) { return a.x - b.x; });
    var out = [];
    row.forEach(function (d) {
      var o = out[out.length - 1];
      if (o && d.x < o.x1 - Math.min(d.w, o.w) * 0.5) {
        o.x = Math.min(o.x, d.x); o.x1 = Math.max(o.x1, d.x1); o.y = Math.min(o.y, d.y); o.y1 = Math.max(o.y1, d.y1); o.ids.push(d.i);
      } else out.push({ x: d.x, x1: d.x1, y: d.y, y1: d.y1, h: d.h, w: d.w, ids: [d.i] });
    });
    return {
      glyphs: out.map(function (d) { return { g: glyphMask(L, d, d.ids), hr: d.h / hh, wr: d.w / hh }; }),
      top: (y0 + cy - hh * 0.7) / H
    };
  }
  function readNid(cv) {
    var T = templates().n, rots = cv.width >= cv.height ? [0, 2] : [1, 3], ths = [null, -1, 140, 160, 0.4, 0.6, 0.8, 100];
    var top = null;
    for (var a = 0; a < rots.length; a++) {
      var c1000 = toWidth(rot(cv, rots[a]), 1000);
      for (var b = 0; b < ths.length; b++) {
        var r = segNid(c1000, ths[b]);
        if (!r || r.glyphs.length !== 14) continue;
        if (top == null) top = r.top;
        var s = r.glyphs.map(function (g) { return nearest(feat(g.g, g.hr, g.wr), T); }).join("");
        if (validNid(s)) return { idNo: s, rot: rots[a], top: r.top };
      }
    }
    return { idNo: "", rot: rots[0], top: top };
  }

  /* ------------------------------------------------------- تاريخ الانتهاء */
  function expRow(M, tmode) {
    var H = M.h, W = M.w, x0 = Math.floor(W * 0.05), x1 = Math.floor(W * 0.95);
    var sub = crop(M, x0, 0, x1, H), sw = sub.w, i, y;
    var ot = otsu(sub.d), thr = [ot, Math.min(ot, 130), 150, 110][tmode];
    var ink = new Uint8Array(sub.d.length), dens = new Float32Array(H);
    for (i = 0; i < ink.length; i++) ink[i] = sub.d[i] < thr ? 1 : 0;
    for (y = 0; y < H; y++) { var s = 0; for (var x = 0; x < sw; x++) s += ink[y * sw + x]; dens[y] = s / sw; }
    var bc = -1, run = 0;
    for (y = Math.floor(H * 0.45); y < H; y++) {
      run = dens[y] > 0.22 ? run + 1 : 0;
      if (run >= H * 0.04) { bc = y - run + 1; break; }
    }
    if (bc < 0) return null;
    var rows = [];
    y = bc - 1;
    while (y > H * 0.25) {
      if (dens[y] > 0.012) {
        var yy1 = y;
        while (y > 0 && dens[y] > 0.012) y--;
        if (yy1 - y >= H * 0.018) rows.push([y + 1, yy1 + 1]);
      }
      y--;
      if (rows.length >= 1) break;
    }
    if (!rows.length) return null;
    var ya = rows[0][0], yb = rows[0][1], pad = Math.floor((yb - ya) * 0.25);
    var b0 = Math.max(0, ya - pad), b1 = Math.min(H, yb + pad);
    return { band: ink.subarray(b0 * sw, b1 * sw), w: sw, h: b1 - b0, top: ya / H };
  }
  function isSlash(g) {
    var h = g.h, wd = g.w;
    if (h < wd * 1.6) return false;
    var tS = 0, tN = 0, bS = 0, bN = 0, k = 0;
    for (var y = 0; y < h; y++) for (var x = 0; x < wd; x++) if (g.m[y * wd + x]) {
      k++;
      if (y < h / 3) { tS += x; tN++; } else if (y > 2 * h / 3) { bS += x; bN++; }
    }
    if (k < 5) return false;
    return ((tN ? tS / tN : 0) - (bN ? bS / bN : 0)) > wd * 0.35;
  }
  function readExpiry(cv) {
    var c1000 = toWidth(cv.width >= cv.height ? cv : rot(cv, 1), 1000), M = maxChan(c1000), T = templates().d, top = null;
    for (var t = 0; t < 4; t++) {
      var R = expRow(M, t);
      if (!R) continue;
      if (top == null) top = R.top;
      var L = label(R.band, R.w, R.h), h = R.h, comps = [];
      L.boxes.forEach(function (b) {
        var hh = b.y1 - b.y, ww = b.x1 - b.x;
        if (hh < h * 0.12 || ww > h * 1.5) return;
        comps.push({ x: b.x, x1: b.x1, y: b.y, y1: b.y1, h: hh, w: ww, i: b.i });
      });
      if (!comps.length) continue;
      comps.sort(function (a, b) { return a.x - b.x || a.i - b.i; });
      var big = comps.filter(function (d) { return d.h > h * 0.35; }).map(function (d) { return d.h; });
      var hmed = big.length ? median(big) : h * 0.6, runs = [comps[0]];
      for (var k = 1; k < comps.length; k++) {
        if (comps[k].x - runs[runs.length - 1].x1 > hmed * 0.9) break;
        runs.push(comps[k]);
      }
      if (runs.length < 10) continue;
      var s = runs.slice(0, 10).map(function (d) {
        var g = glyphMask(L, d, [d.i]);
        return isSlash(g) ? "/" : String(nearest(feat(g, d.h / hmed, d.w / hmed), T));
      }).join("");
      var m = /^(20[1-4]\d)\/(\d\d)\/(\d\d)$/.exec(s);
      if (m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31) return { idExpiry: m[1] + "-" + m[2] + "-" + m[3], top: R.top };
    }
    return { idExpiry: "", top: top };
  }

  /* ------------------------------------------------------- سطور الكلام */
  function textRows(c1000, box) {
    var M = maxChan(c1000), H = M.h, W = M.w;
    var x0 = Math.floor(box[0] * W), y0 = Math.floor(box[1] * H), x1 = Math.floor(box[2] * W), y1 = Math.floor(box[3] * H);
    if (y1 - y0 < H * 0.05) return [];
    var R = crop(M, x0, y0, x1, y1), thr = otsu(R.d), rw = R.w, rh = R.h, y, i;
    /* الخلفية البيج/الأهرامات بتخلي أوتسو يفصل الأبيض عن الخلفية مش الكلام عنها —
       لو «الحبر» طلع أكتر من ٢٢٪ من المساحة، بنعيد الحساب على الجزء الأغمق بس */
    for (var it = 0; it < 2; it++) {
      var dark = [], k;
      for (k = 0; k < R.d.length; k++) if (R.d[k] < thr) dark.push(R.d[k]);
      if (dark.length <= R.d.length * 0.22 || dark.length < 50) break;
      thr = otsu(dark);
    }
    var on = [];
    /* ٠٫٨٪: سطر الاسم الأول كلمة واحدة قصيرة على اليمين — نسبة أعلى كانت بتفوّته */
    for (y = 0; y < rh; y++) { var s = 0; for (var x = 0; x < rw; x++) s += R.d[y * rw + x] < thr ? 1 : 0; on.push(s / rw > 0.008); }
    var rows = [];
    y = 0;
    while (y < rh) {
      if (on[y]) { var a = y; while (y < rh && on[y]) y++; rows.push([a, y]); }
      y++;
    }
    var merged = [];
    rows.forEach(function (r) {
      var m = merged[merged.length - 1];
      if (m && r[0] - m[1] < H * 0.012) m[1] = r[1]; else merged.push([r[0], r[1]]);
    });
    return merged.filter(function (r) { return r[1] - r[0] >= H * 0.025; }).map(function (r) {
      var pad = Math.floor((r[1] - r[0]) * 0.2), a = Math.max(0, r[0] - pad), b = Math.min(rh, r[1] + pad);
      var c = canvasOf(rw, b - a), cx = c.getContext("2d"), im = cx.createImageData(rw, b - a);
      for (var yy = a; yy < b; yy++) for (var xx = 0; xx < rw; xx++) {
        var v = 255 * (R.d[yy * rw + xx] - thr * 0.55) / (thr * 0.75), o = ((yy - a) * rw + xx) * 4;
        v = v < 0 ? 0 : v > 255 ? 255 : v;
        im.data[o] = im.data[o + 1] = im.data[o + 2] = v; im.data[o + 3] = 255;
      }
      cx.putImageData(im, 0, 0);
      var c2 = canvasOf(rw * 2, (b - a) * 2), x2 = c2.getContext("2d");
      x2.imageSmoothingEnabled = true; x2.imageSmoothingQuality = "high";
      x2.drawImage(c, 0, 0, rw * 2, (b - a) * 2);
      return c2;
    });
  }

  /* ------------------------------------------------------- Tesseract */
  var worker = null, workerP = null, idleT = null;
  function base() { return location.href.replace(/[^\/]*([?#].*)?$/, "") + "assets/ocr/"; }
  function simd() {
    try {
      return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
    } catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (res, rej) {
      if (w.Tesseract) { res(); return; }
      var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = function () { rej(new Error("تعذّر تحميل محرّك القراءة.")); };
      document.head.appendChild(s);
    });
  }
  function getWorker() {
    clearTimeout(idleT);
    if (workerP) return workerP;
    var b = base();
    workerP = loadScript(b + "tesseract.min.js").then(function () {
      return w.Tesseract.createWorker("ara", 1, {
        workerPath: b + "worker.min.js", workerBlobURL: false,
        corePath: b + (simd() ? "tesseract-core-simd-lstm.js" : "tesseract-core-lstm.js"),
        langPath: b.replace(/\/$/, ""), gzip: false, cacheMethod: "none"
      });
    }).then(function (wk) {
      worker = wk;
      /* preserve_interword_spaces بيشيل المسافات بين الكلمات العربي — فمش مستخدَم */
      return wk.setParameters({ tessedit_pageseg_mode: "7" }).then(function () { return wk; });
    }).catch(function (e) { workerP = null; throw e; });
    return workerP;
  }
  function release() {
    clearTimeout(idleT);
    idleT = setTimeout(function () {
      if (worker) { try { worker.terminate(); } catch (e) { } }
      worker = null; workerP = null;
    }, 60000);
  }
  function ocrRows(rows) {
    if (!rows.length) return Promise.resolve([]);
    return getWorker().then(function (wk) {
      var out = [];
      return rows.reduce(function (p, c) {
        return p.then(function () { return wk.recognize(c).then(function (r) { out.push({ text: r.data.text || "", conf: r.data.confidence || 0 }); }); });
      }, Promise.resolve()).then(function () { release(); return out; });
    });
  }

  /* ------------------------------------------------------- تنضيف وتحليل */
  var AR_DIG = "٠١٢٣٤٥٦٧٨٩";
  function latin(s) { return String(s || "").replace(/[٠-٩]/g, function (c) { return AR_DIG.indexOf(c); }); }
  function clean(s) {
    s = latin(s).replace(/[‎‏‪-‮]/g, "")
      .replace(/[^ء-ي٠-٩ 0-9\-\/]/g, " ")
      .replace(/([ء-ي])\d+/g, "$1").replace(/\d+([ء-ي])/g, "$1")   /* أرقام لازقة في كلمة = بقايا زخرفة */
      .replace(/\s+/g, " ").trim();
    /* حروف/أرقام متطايرة في الأطراف (بقايا الزخرفة) */
    s = s.replace(/^(\S\s)+/, "").replace(/(\s\S)+$/, "").replace(/^[-\/\s]+|[-\/\s]+$/g, "");
    return s;
  }
  function arabicCount(s) { var m = String(s).match(/[ء-ي]/g); return m ? m.length : 0; }
  function isAddr(s) {
    return /(^|\s)\d+(\s|$)/.test(s) || /-/.test(s) ||
      /(^|\s)(ش|شارع|ح|حارة|حاره|عطفة|عطفه|عمارة|عماره|برج|قسم|مركز|ق|ك|طريق|ميدان|منشية|منشيه|عزبة|عزبه|قرية|قريه)(\s|$)/.test(s);
  }
  var GOVS = ["القاهرة", "الجيزة", "الإسكندرية", "القليوبية", "الدقهلية", "الشرقية", "الغربية", "المنوفية", "البحيرة",
    "كفر الشيخ", "دمياط", "بورسعيد", "الإسماعيلية", "السويس", "الفيوم", "بني سويف", "المنيا", "أسيوط", "سوهاج", "قنا",
    "الأقصر", "أسوان", "البحر الأحمر", "الوادي الجديد", "مطروح", "شمال سيناء", "جنوب سيناء"];
  function normAr(s) { return String(s).replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/\s+/g, ""); }
  function matchGov(s) {
    var k = normAr(s);
    for (var i = 0; i < GOVS.length; i++) { var g = normAr(GOVS[i]); if (k === g || k.indexOf(g) >= 0) return GOVS[i]; }
    return "";
  }

  /* نماذج الأرقام (~٢٠٠ ك.ب) بتتحمّل أول مرة القراءة تشتغل بس، مش مع كل صفحة */
  function loadTpl() {
    if (w.IdOcrTpl) return Promise.resolve();
    return new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = base() + "idocr-tpl.js";
      s.onload = function () { TPL = null; res(); }; s.onerror = function () { rej(new Error("تعذّر تحميل نماذج الأرقام.")); };
      document.head.appendChild(s);
    });
  }
  function readFront(dataUrl) {
    return loadTpl().then(function () { return loadImage(dataUrl); }).then(function (im) {
      var cv = fromImage(im), nid = readNid(cv);
      var c1000 = toWidth(rot(cv, nid.rot), 1000);
      var bottom = nid.top ? Math.min(0.74, nid.top) : 0.74;
      var rows = textRows(c1000, [0.30, 0.24, 0.985, bottom]);
      return ocrRows(rows).catch(function () { return []; }).then(function (res) {
        var lines = res.filter(function (r) { return r.conf >= 40; }).map(function (r) { return clean(r.text); })
          .filter(function (s) { return arabicCount(s) >= 2; });
        var name = [], addr = [];
        lines.forEach(function (s) { if (!addr.length && name.length < 2 && !isAddr(s)) name.push(s); else addr.push(s); });
        var out = { idNo: nid.idNo, name: name.join(" "), addressFull: "", area: "", gov: "", lines: lines };
        if (addr.length) {
          var last = addr[addr.length - 1], parts = last.split(/\s*-\s*/);
          var gov = parts.length > 1 ? matchGov(parts[parts.length - 1]) : matchGov(last);
          if (gov) {
            out.gov = gov;
            if (parts.length > 1) out.area = parts.slice(0, -1).join(" - ").trim();
          }
          out.addressFull = addr.length > 1 ? addr.slice(0, -1).join(" - ") + "، " + last : last;
        }
        return out;
      });
    });
  }

  function readBack(dataUrl) {
    return loadTpl().then(function () { return loadImage(dataUrl); }).then(function (im) {
      var cv = fromImage(im), ex = readExpiry(cv);
      var c1000 = toWidth(cv.width >= cv.height ? cv : rot(cv, 1), 1000);
      var bottom = ex.top ? Math.min(0.62, ex.top) : 0.45;
      var rows = textRows(c1000, [0.22, 0.10, 0.80, bottom]);
      return ocrRows(rows).catch(function () { return []; }).then(function (res) {
        var lines = res.filter(function (r) { return r.conf >= 40; }).map(function (r) { return clean(r.text); })
          .filter(function (s) { return arabicCount(s) >= 3; });
        var out = { idExpiry: ex.idExpiry, job: "", gender: "", religion: "", marital: "", lines: lines };
        /* سطر «النوع الديانة الحالة» — ساعات بيلزق في آخر سطر المهنة، فبنقصّه من عند أول كلمة منهم */
        var MARK = /(^|\s)(ذكر|أنثى|انثى|نثى|مسلمة|مسلمه|مسلم|مسيحية|مسيحيه|مسيحى|مسيحي|متزوجة|متزوجه|متزوج|اعزب|أعزب|ارمل|أرمل|مطلق)(\s|$)/;
        var gi = -1;
        lines.forEach(function (s, i) {
          var mk = MARK.exec(s);
          if (gi < 0 && mk) {
            gi = i;
            if (mk.index > 0) {                       /* مهنة + نوع في سطر واحد */
              lines.splice(i, 1, s.slice(0, mk.index).replace(/\s+\S{1,2}$/, "").trim(), s.slice(mk.index).trim());
              gi = i + 1; s = lines[gi];
            }
            out.gender = /ذكر/.test(s) ? "ذكر" : /(أنثى|انثى|نثى|مسلمة|مسلمه|مسيحية|مسيحيه|متزوجة|متزوجه|أرملة|ارمله|مطلقة|مطلقه)/.test(s) ? "أنثى" : "";
            var r = /مسيح/.test(s) ? "مسيحي" : /مسلم/.test(s) ? "مسلم" : "";
            if (r && out.gender === "أنثى") r += "ة";
            out.religion = r;
            var mm = /(متزوجة|متزوجه|متزوج|أعزب|اعزب|عزباء|آنسة|انسه|أرملة|ارمله|أرمل|ارمل|مطلقة|مطلقه|مطلق)/.exec(s);
            out.marital = mm ? mm[1] : "";
          }
        });
        var jobLines = (gi >= 0 ? lines.slice(0, gi) : lines.slice(0, 2)).filter(function (s) { return !/(البطاقة|ساري|سارية)/.test(s); });
        out.job = jobLines.join(" ").replace(/\s+/g, " ").trim();
        return out;
      });
    });
  }

  /* تجهيز المحرّك في الخلفية (أول تحميل بياخد ثواني) — بيتقفل لوحده بعد دقيقة لو ما اتستخدمش */
  function warm() {
    try { loadTpl().catch(function () { }); getWorker().then(release, function () { }); } catch (e) { }
  }
  /* اتجاه القراءة من النص نفسه — نفس طريقة برنامج الاسكانر: الصورة تتقرا
     بكل دوران مسموح، والدوران اللي بتطلع فيه كلمات مقروءة بثقة عالية أكتر
     بفرق واضح هو الصح. صفحة مقروءة كويس وهي معدولة بتاخد قراءة واحدة بس.
     turns: [0,180] للبطاقات (أفقية دايماً)، [0,90,180,270] للورق.
     بيرجّع الدرجات مع عقارب الساعة؛ 0 لو معدولة أو مش واضح. */
  function uprightTurn(dataUrl, turns) {
    turns = turns || [0, 90, 180, 270];
    var counts = {};
    function goodWords(r) {
      var d = (r && r.data) || {}, words = d.words || [];
      if (words.length) {
        return words.filter(function (wd) {
          return wd.confidence >= 75 && String(wd.text || "").replace(/\s/g, "").length >= 2;
        }).length;
      }
      return (d.confidence || 0) >= 60
        ? String(d.text || "").split(/\s+/).filter(function (s) { return s.length >= 2; }).length : 0;
    }
    return loadImage(dataUrl).then(function (im) {
      var src = fromImage(im);
      var k = Math.min(1, 1000 / Math.max(src.width, src.height));
      var base = canvasOf(Math.max(1, Math.round(src.width * k)), Math.max(1, Math.round(src.height * k)));
      base.getContext("2d").drawImage(src, 0, 0, base.width, base.height);
      return getWorker().then(function (wk) {
        return wk.setParameters({ tessedit_pageseg_mode: "11" }).then(function () {
          return turns.reduce(function (p, deg) {
            return p.then(function (done) {
              if (done) return true;
              /* rot بيلف عكس عقارب الساعة؛ deg مع عقارب الساعة */
              return wk.recognize(rot(base, (4 - deg / 90) % 4)).then(function (r) {
                counts[deg] = goodWords(r);
                return deg === 0 && counts[0] >= 12;     /* معدولة وواضحة: كفاية */
              });
            });
          }, Promise.resolve(false));
        }).then(function () {
          return wk.setParameters({ tessedit_pageseg_mode: "7" });
        }).then(function () {
          release();
          var up = counts[0] || 0, best = 0, bestN = up;
          turns.forEach(function (d) { if ((counts[d] || 0) > bestN) { best = d; bestN = counts[d]; } });
          return (best !== 0 && bestN >= 6 && bestN >= up * 2 + 3) ? best : 0;
        });
      });
    }).catch(function () { return 0; });
  }

  w.IdOcr = { readFront: readFront, readBack: readBack, validNid: validNid, warm: warm, uprightTurn: uprightTurn,
              _nid: function (dataUrl) { return loadTpl().then(function () { return loadImage(dataUrl); }).then(function (im) { return readNid(fromImage(im)); }); },
              _exp: function (dataUrl) { return loadTpl().then(function () { return loadImage(dataUrl); }).then(function (im) { return readExpiry(fromImage(im)); }); } };
})(window);
