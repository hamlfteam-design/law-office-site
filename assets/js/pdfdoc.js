/* =============================================================================
   PdfDoc — يبني صفحات A4 (صور JPEG) من «بلوكات» جدولية لتُحوَّل PDF عبر PdfBuild.

   القاعدة المعتمدة: البيان المُرسَل يخرج جدولياً — أسماء الحقول بخط ثابت،
   ومحتوى الحقول يتمدّد ويلتفّ بمحاذاة اليمين.

   البلوكات:
     { h: "عنوان" }                         سطر عنوان
     { center: "نص" }                        سطر موسّط (ترويسة)
     { table: { headers:[…], widths:[…], rows:[[…]] } }   جدول
   العرض width بالنسبة (مجموعها ≈ ١) أو بكسل؛ إن غابت وُزّعت بالتساوي.
   ============================================================================= */
(function (w) {
  "use strict";
  var W = 1240, H = 1754, M = 60;
  /* الخطوط المعتمدة بالتطبيق (مُعرَّفة أصلاً في app.css عبر @font-face) —
     العناوين SF Sultan ١٢pt والمحتوى SF Mada Bold ١٤pt (المعتمد لكل ما يُطبع أو يُرسل).
     Segoe UI/Tahoma يبقيان احتياطاً فقط إن تعذّر تحميل الخط المخصَّص. */
  var TITLE_FONT = "'SF Sultan','Segoe UI','Tahoma',sans-serif";
  var BODY_FONT  = "'SF Mada','Segoe UI','Tahoma',sans-serif";

  /* تحويل نقطة طباعية إلى بكسل بدقّة اللوحة الحالية (W=1240 لعرض A4 210مم
     ⇒ ≈150 نقطة/بوصة، و١ نقطة طباعية = ١٫٥ نقطة عرض تقريباً، فعلياً هنا
     نستخدم النسبة الدقيقة dpi/72). */
  var DPI = W / (210 / 25.4);
  function pt(n) { return Math.round(n * DPI / 72); }

  /* يضمن تحميل الخطوط المخصَّصة فعلياً قبل الرسم — بلا هذا الانتظار يرسم
     المتصفح بالخط الاحتياطي صامتاً حتى يكتمل تحميل الخط في الخلفية. */
  var _fontsReady = null;
  function fontsReady() {
    if (_fontsReady) return _fontsReady;
    if (!(w.document && document.fonts && document.fonts.load)) {
      _fontsReady = Promise.resolve();
      return _fontsReady;
    }
    _fontsReady = Promise.all([
      document.fonts.load("16px \"SF Sultan\""),
      document.fonts.load("16px \"SF Mada\"")
    ]).catch(function () { }).then(function () { return true; });
    return _fontsReady;
  }

  function wrap(ctx, text, maxW, font) {
    ctx.font = font;
    var words = String(text == null ? "" : text).split(/\s+/), lines = [], line = "";
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + " " + words[i] : words[i];
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = words[i]; }
      else line = test;
    }
    if (line || !lines.length) lines.push(line);
    return lines;
  }

  /** يبني صفحات PDF (Promise<Array>) — ينتظر تحميل الخطوط المعتمدة أولاً. */
  function build(blocks, opts) {
    return fontsReady().then(function () { return buildSync(blocks, opts); });
  }

  function buildSync(blocks, opts) {
    opts = opts || {};
    var head = opts.header || (w.Letterhead && Letterhead.on && Letterhead.on() && Letterhead.img && Letterhead.img());
    /* ورق المؤسسة: خلفية كاملة الصفحة، والمحتوى بين الترويسة (تنتهي عند ~252) والتذييل (يبدأ ~1600) */
    var paper = (opts.paper !== false && !opts.header && w.Letterhead && Letterhead.on && Letterhead.on() &&
                 Letterhead.paper && Letterhead.paper()) || null;
    var TOP = paper ? 285 : M, BOTTOM = paper ? 1585 : H - M;
    var pages = [], cv, ctx, y;
    /* opts.ltr: مستند إنجليزي — نفس التخطيط لكن يبدأ من اليسار (نعكس إحداثيات المحتوى فقط، لا الخلفية ولا مربّع رقم الصفحة) */
    var LTR = !!opts.ltr, mir = false;
    function newPage() {
      cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
      ctx.direction = LTR ? "ltr" : "rtl"; ctx.textAlign = "right"; ctx.textBaseline = "top";
      y = M;
      if (paper) {
        try { ctx.drawImage(paper, 0, 0, W, H); } catch (e) { }
        y = TOP;
      } else if (head && head.width) {
        try {
          var topM = Math.round(20 * DPI / 25.4);   /* هامش علوي ٢سم فوق الترويسة */
          var iw = W - 2 * M, ih = head.height * iw / head.width;
          ctx.drawImage(head, M, topM, iw, ih);
          y = topM + ih + 14;
        } catch (e) { }
      }
      if (LTR) {
        var _ft = ctx.fillText.bind(ctx), _fr = ctx.fillRect.bind(ctx), _sr = ctx.strokeRect.bind(ctx);
        ctx.fillText = function (t, x, yy) {
          if (!mir) return _ft(t, x, yy);
          var a = ctx.textAlign;
          ctx.textAlign = a === "right" ? "left" : (a === "left" ? "right" : a);
          _ft(t, W - x, yy); ctx.textAlign = a;
        };
        ctx.fillRect = function (x, yy, w, h) { return mir ? _fr(W - x - w, yy, w, h) : _fr(x, yy, w, h); };
        ctx.strokeRect = function (x, yy, w, h) { return mir ? _sr(W - x - w, yy, w, h) : _sr(x, yy, w, h); };
        mir = true;
      }
    }
    function push() {
      var _mir = mir; mir = false;
      if (paper) {                                   /* رقم الصفحة الصحيح داخل مربّع التذييل */
        ctx.fillStyle = "#fff"; ctx.fillRect(68, 1626, 152, 66);
        ctx.fillStyle = "#1a1a1a"; ctx.font = "bold " + pt(12) + "px " + TITLE_FONT;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(LTR ? "Page " + (pages.length + 1)
          : "صفحة " + String(pages.length + 1).replace(/[0-9]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩"[+d]; }), 143, 1665);
        /* سطر بيانات الطباعة (تاريخ/ساعة…) في منتصف التذييل بين الـQR ورقم الصفحة */
        if (opts.footer) {
          ctx.fillStyle = "#4a4a4a"; ctx.font = pt(10) + "px " + BODY_FONT; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(String(opts.footer), 630, 1665);
        }
        ctx.textAlign = "right"; ctx.textBaseline = "top";
      }
      pages.push(cv.toDataURL("image/jpeg", 0.92));
      mir = _mir;
    }
    function ensure(hgt) { if (y + hgt > BOTTOM) { push(); newPage(); } }
    newPage();

    blocks.forEach(function (b) {
      if (b.center != null) {
        ensure(38); ctx.fillStyle = "#333"; ctx.font = "bold " + pt(12) + "px " + TITLE_FONT;
        ctx.textAlign = "center"; ctx.fillText(String(b.center), W / 2, y); ctx.textAlign = "right";
        y += 38; return;
      }
      if (b.h != null) {
        ensure(50); y += 10; ctx.fillStyle = "#3a2411"; ctx.font = "bold " + pt(12) + "px " + TITLE_FONT;
        ctx.fillText(String(b.h), W - M, y); y += 42; return;
      }
      if (b.card) {
        /* كارت بيان: عنوان + حقول (اسم الحقل فوق قيمته) بحد أقصى perRow حقول في السطر */
        var cd = b.card, per = cd.perRow || 3, availC = W - 2 * M, cw = Math.floor(availC / per);
        var lblFont = "bold " + pt(12) + "px " + TITLE_FONT, valFont = "bold " + pt(14) + "px " + BODY_FONT;
        var rowsC = [];
        for (var i0 = 0; i0 < cd.pairs.length; i0 += per) rowsC.push(cd.pairs.slice(i0, i0 + per));
        var lineC = 34, padC = 16;
        var titleLines = wrap(ctx, cd.title || "", availC - 2 * padC, "bold " + pt(12) + "px " + TITLE_FONT);
        function rowH(r) {
          var mx = 1;
          r.forEach(function (p) { mx = Math.max(mx, wrap(ctx, p[1], cw - 2 * padC, valFont).length); });
          return lineC + mx * lineC + padC;
        }
        var totalH = titleLines.length * 34 + padC + rowsC.reduce(function (a, r) { return a + rowH(r); }, 0) + padC;
        ensure(Math.min(totalH, 300));
        var top0 = y;
        ctx.fillStyle = "#efe6d6"; ctx.fillRect(M, y, availC, titleLines.length * 34 + padC);
        ctx.fillStyle = "#3a2411"; ctx.font = "bold " + pt(12) + "px " + TITLE_FONT;
        var ty0 = y + padC / 2;
        titleLines.forEach(function (ln) { ctx.fillText(ln, W - M - padC, ty0); ty0 += 34; });
        y += titleLines.length * 34 + padC;
        rowsC.forEach(function (r) {
          var h = rowH(r);
          if (y + h > BOTTOM) { ctx.strokeStyle = "#c9b48f"; ctx.strokeRect(M, top0, availC, y - top0); push(); newPage(); top0 = y; }
          r.forEach(function (p, ci) {
            var right = W - M - ci * cw - padC, yy = y + 4;
            ctx.fillStyle = "#7a5a2a"; ctx.font = lblFont; ctx.fillText(p[0], right, yy); yy += lineC;
            ctx.fillStyle = "#222"; ctx.font = valFont;
            wrap(ctx, p[1], cw - 2 * padC, valFont).forEach(function (ln) { ctx.fillText(ln, right, yy); yy += lineC; });
          });
          y += h;
        });
        ctx.strokeStyle = "#c9b48f"; ctx.lineWidth = 1; ctx.strokeRect(M, top0, availC, y - top0);
        y += 14;
        return;
      }
      if (b.table) {
        var t = b.table, cols = t.headers.length, avail = W - 2 * M;
        var widths = (t.widths && t.widths.length === cols) ? t.widths.slice() : [];
        if (!widths.length) for (var i = 0; i < cols; i++) widths.push(1);
        var sum = widths.reduce(function (a, x) { return a + x; }, 0);
        var px = widths.map(function (x) { return Math.floor(x / sum * avail); });
        /* رؤوس الأعمدة (أسماء الحقول) بخط SF Sultan ١٤pt، ومحتوى الخلايا
           بخط SF Mada Bold ١٦pt — بنفس منطق العرض داخل التطبيق. */
        var pad = 9, lineH = 34,
            headFont = "bold " + pt(12) + "px " + TITLE_FONT,
            cellFont = "bold " + pt(14) + "px " + BODY_FONT;

        function rightEdges() {
          var edges = [], cur = W - M;
          for (var c = 0; c < cols; c++) { edges.push(cur); cur -= px[c]; }
          return edges;
        }
        function drawRow(cells, font, shade) {
          var wrapped = cells.map(function (v, c) { return wrap(ctx, v, px[c] - 2 * pad, font); });
          var rows = wrapped.reduce(function (m, l) { return Math.max(m, l.length); }, 1);
          var rh = rows * lineH + 2 * pad;
          ensure(rh);
          var edges = rightEdges(), top = y;
          if (shade) { ctx.fillStyle = "#efe6d6"; ctx.fillRect(M, top, avail, rh); }
          ctx.strokeStyle = "#c9b48f"; ctx.lineWidth = 1;
          ctx.fillStyle = "#222"; ctx.font = font;
          for (var c = 0; c < cols; c++) {
            var right = edges[c], left = right - px[c];
            ctx.strokeRect(left, top, px[c], rh);
            var tx = right - pad, ty = top + pad;
            wrapped[c].forEach(function (ln) { ctx.fillText(ln, tx, ty); ty += lineH; });
          }
          y += rh;
        }
        drawRow(t.headers, headFont, true);
        (t.rows || []).forEach(function (r) { drawRow(r, cellFont, false); });
        y += 10;
        return;
      }
    });
    push();
    return pages;
  }

  w.PdfDoc = { build: build };
})(window);
