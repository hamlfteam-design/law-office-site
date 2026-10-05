/* =============================================================================
   قارئ المرفقات داخل البرنامج (طلب المستخدم ٦-١٠) — PDF وصور.
   الـWebView ما بيعرضش PDF لوحده، فكان كارت المرفق بيبان بزرارين «حفظ/حذف» بس.
   دلوقتي الضغط على المرفق بيفتحه هنا على طول:
     • PDF بمكتبة pdf.js (Mozilla، Apache-2.0) من جوه البرنامج — من غير نت.
     • الصفحات تحت بعض وبتتنقل بالتمرير، وبتترسم لما تقرّب منها بس (خفيف على الموبايل).
     • تكبير/تصغير بالصباعين (pinch) أو بزراير ＋/－، ودبل تاب = ٢x / رجوع لعرض الصفحة.
   الاستخدام: PdfView.open(dataUrlOrUrl, title) · PdfView.openImage(src, title)
   ============================================================================= */
(function (w) {
  "use strict";
  /* مسار المكتبة: البرنامج «assets/»، والبوابة بتحدد window.PDFVIEW_BASE = "../assets/" */
  function base() { return w.PDFVIEW_BASE || "assets/"; }
  var LIB = "pdfjs/pdf.min.js", WORKER = "pdfjs/pdf.worker.min.js";
  var AR = "٠١٢٣٤٥٦٧٨٩";
  function ar(n) { return String(n).replace(/[0-9]/g, function (d) { return AR[+d]; }); }
  function el(t, css, txt) {
    var e = document.createElement(t);
    if (css) e.style.cssText = css;
    if (txt != null) e.textContent = txt;
    return e;
  }
  var libWaiters = null;
  function loadLib(cb, fail) {
    if (w.pdfjsLib) return cb();
    if (libWaiters) { libWaiters.push([cb, fail]); return; }
    libWaiters = [[cb, fail]];
    var s = document.createElement("script");
    s.src = base() + LIB;
    s.onload = function () {
      try { w.pdfjsLib.GlobalWorkerOptions.workerSrc = base() + WORKER; } catch (e) { }
      var l = libWaiters; libWaiters = null; l.forEach(function (x) { x[0](); });
    };
    s.onerror = function () { var l = libWaiters; libWaiters = null; l.forEach(function (x) { if (x[1]) x[1](); }); };
    document.head.appendChild(s);
  }
  function toBytes(src) {
    if (/^data:/.test(src)) {
      var b = atob(src.slice(src.indexOf(",") + 1)), u = new Uint8Array(b.length);
      for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
      return Promise.resolve(u);
    }
    return fetch(src).then(function (r) { return r.arrayBuffer(); }).then(function (a) { return new Uint8Array(a); });
  }

  /* علامة مائية (البوابة): اسم الموكل والتاريخ مايلين على كل صفحة — لو حد صوّر الشاشة يبان مين */
  function watermark(ctx, wd, ht, text) {
    if (!text) return;
    ctx.save();
    ctx.globalAlpha = 0.13;
    ctx.fillStyle = "#7a1410";
    var fs = Math.max(14, Math.round(wd / 22));
    ctx.font = "bold " + fs + "px Tahoma, Arial";
    ctx.textAlign = "center";
    ctx.translate(wd / 2, ht / 2);
    ctx.rotate(-Math.PI / 6);
    var step = fs * 5;
    for (var y = -ht; y <= ht; y += step) ctx.fillText(text, 0, y);
    ctx.restore();
  }

  /* ---------- الإطار المشترك: شريط علوي + مساحة تمرير ---------- */
  function frame(title) {
    var back = el("div", "position:fixed;inset:0;z-index:20050;background:#2b2520;display:flex;flex-direction:column;direction:rtl");
    back.setAttribute("data-modal", "1");
    back.setAttribute("data-nosave", "1");
    back.addEventListener("contextmenu", function (e) { e.preventDefault(); });   /* عرض بس */
    var bar = el("div", "flex:0 0 auto;display:flex;align-items:center;gap:6px;padding:8px 10px;background:#3d2f22;color:#fff;" +
      "font-family:inherit;box-shadow:0 2px 6px rgba(0,0,0,.3)");
    var close = el("button", "min-width:44px;min-height:40px;border:0;border-radius:9px;background:rgba(255,255,255,.12);color:#fff;font-size:18px", "✕");
    close.type = "button";
    var ttl = el("div", "flex:1;min-width:0;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis", title || "");
    var pg = el("div", "font-size:12.5px;opacity:.85;white-space:nowrap", "");
    function zb(t) {
      var b = el("button", "min-width:40px;min-height:40px;border:0;border-radius:9px;background:rgba(255,255,255,.12);color:#fff;font-size:18px", t);
      b.type = "button"; return b;
    }
    var zOut = zb("－"), zIn = zb("＋"), zFit = zb("⤢");
    bar.appendChild(close); bar.appendChild(ttl); bar.appendChild(pg);
    bar.appendChild(zOut); bar.appendChild(zIn); bar.appendChild(zFit);
    var scroller = el("div", "flex:1 1 auto;overflow:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;touch-action:pan-x pan-y");
    var pages = el("div", "padding:10px 8px 40px;display:flex;flex-direction:column;align-items:center;gap:10px;transform-origin:0 0");
    scroller.appendChild(pages);
    back.appendChild(bar); back.appendChild(scroller);
    document.body.appendChild(back);
    var prevOv = document.body.style.overflow; document.body.style.overflow = "hidden";
    var onClose = [];
    function shut() {
      document.body.style.overflow = prevOv;
      onClose.forEach(function (f) { try { f(); } catch (e) { } });
      back.remove();
    }
    close.onclick = shut;
    back.__lawyerDismiss = shut;   /* زرار الرجوع في أندرويد يقفل القارئ (mobile.js) */
    return { back: back, scroller: scroller, pages: pages, pg: pg, zIn: zIn, zOut: zOut, zFit: zFit, onClose: onClose, shut: shut };
  }

  /* ---------- تكبير بالصباعين + دبل تاب (مشترك بين PDF والصور) ---------- */
  function gestures(F, getZoom, setZoom) {
    var startD = 0, startZ = 1, live = 1, lastTap = 0, mid = null;
    function dist(t) { var dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY; return Math.sqrt(dx * dx + dy * dy); }
    F.scroller.addEventListener("touchstart", function (e) {
      if (e.touches.length === 2) {
        startD = dist(e.touches); startZ = getZoom(); live = 1;
        var r = F.scroller.getBoundingClientRect();
        mid = { x: (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left, y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top };
      } else if (e.touches.length === 1) {
        var now = Date.now();
        if (now - lastTap < 300) { setZoom(getZoom() > 1.05 ? 1 : 2); lastTap = 0; e.preventDefault(); }
        else lastTap = now;
      }
    }, { passive: false });
    F.scroller.addEventListener("touchmove", function (e) {
      if (e.touches.length === 2 && startD) {
        e.preventDefault();
        live = Math.max(0.5 / startZ, Math.min(5 / startZ, dist(e.touches) / startD));
        F.pages.style.transformOrigin = (F.scroller.scrollLeft + mid.x) + "px " + (F.scroller.scrollTop + mid.y) + "px";
        F.pages.style.transform = "scale(" + live + ")";
      }
    }, { passive: false });
    F.scroller.addEventListener("touchend", function (e) {
      if (startD && e.touches.length < 2) {
        var fx = (F.scroller.scrollLeft + mid.x), fy = (F.scroller.scrollTop + mid.y);
        F.pages.style.transform = ""; startD = 0;
        var z0 = getZoom(), z1 = Math.max(0.5, Math.min(5, z0 * live));
        setZoom(z1, { fx: fx, fy: fy, mx: mid.x, my: mid.y, ratio: z1 / z0 });
      }
    });
  }

  /* ---------- PDF ---------- */
  function open(src, title, opts) {
    opts = opts || {};
    var F = frame(title);
    var msg = el("div", "color:#f4ece0;font-size:14px;padding:40px 10px;text-align:center", "⏳ جاري فتح الملف…");
    F.pages.appendChild(msg);
    var zoom = 1, pdf = null, slots = [], obs = null, dead = false, task = null;
    F.onClose.push(function () { dead = true; if (obs) obs.disconnect(); try { if (task) task.destroy(); } catch (e) { } });
    function fail(why) {
      msg.textContent = "⚠ تعذّر فتح الملف" + (why ? " — " + why : "") + ". جرّب «حفظ» وافتحه بقارئ PDF.";
    }
    loadLib(function () {
      toBytes(src).then(function (bytes) {
        task = w.pdfjsLib.getDocument({ data: bytes, isEvalSupported: false });
        return task.promise;
      }).then(function (doc) {
        if (dead) return;
        pdf = doc; msg.remove();
        F.pg.textContent = ar(1) + " / " + ar(pdf.numPages);
        var chain = Promise.resolve();
        for (var i = 1; i <= pdf.numPages; i++) (function (n) {
          var slot = { n: n, box: el("div", "background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.4);position:relative"), canvas: null, vp: null, done: 0 };
          slot.box.dataset.n = n;
          F.pages.appendChild(slot.box);
          slots.push(slot);
          chain = chain.then(function () { return pdf.getPage(n).then(function (p) { slot.page = p; slot.vp = p.getViewport({ scale: 1 }); size(slot); }); });
        })(i);
        chain.then(function () { observe(); });
      }).catch(function (e) { fail(e && e.message ? "" : ""); });
    }, function () { fail("القارئ مش متاح"); });

    function baseScale(slot) { return Math.max(0.2, (F.scroller.clientWidth - 16) / slot.vp.width); }
    function size(slot) {
      var s = baseScale(slot) * zoom;
      slot.box.style.width = Math.round(slot.vp.width * s) + "px";
      slot.box.style.height = Math.round(slot.vp.height * s) + "px";
    }
    function render(slot) {
      if (!slot.page || slot.done === zoom || slot.busy) return;
      slot.busy = true;
      var s = baseScale(slot) * zoom, dpr = Math.min(w.devicePixelRatio || 1, 2.5);
      var vp = slot.page.getViewport({ scale: s * dpr });
      var c = document.createElement("canvas");
      c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      c.style.cssText = "width:100%;height:100%;display:block";
      var z = zoom;
      slot.page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise.then(function () {
        watermark(c.getContext("2d"), c.width, c.height, opts.watermark);
        slot.busy = false;
        if (dead) return;
        if (slot.canvas) slot.canvas.remove();
        slot.canvas = c; slot.box.appendChild(c); slot.done = z;
        if (slot.done !== zoom) render(slot);
      }).catch(function () { slot.busy = false; });
    }
    function release(slot) {
      if (slot.canvas) { slot.canvas.width = 0; slot.canvas.remove(); slot.canvas = null; slot.done = 0; }
    }
    function observe() {
      if (obs) obs.disconnect();
      obs = new IntersectionObserver(function (ents) {
        ents.forEach(function (en) {
          var slot = slots[+en.target.dataset.n - 1];
          if (en.isIntersecting) render(slot); else release(slot);
        });
      }, { root: F.scroller, rootMargin: "900px 0px" });
      slots.forEach(function (s) { obs.observe(s.box); });
    }
    F.scroller.addEventListener("scroll", function () {
      if (!slots.length) return;
      var mid = F.scroller.scrollTop + F.scroller.clientHeight / 3, cur = 1;
      for (var i = 0; i < slots.length; i++) { if (slots[i].box.offsetTop <= mid) cur = i + 1; else break; }
      F.pg.textContent = ar(cur) + " / " + ar(slots.length);
    });
    function setZoom(z, focus) {
      z = Math.max(0.5, Math.min(5, z));
      var ratio = z / zoom;
      var fx = focus ? focus.fx : F.scroller.scrollLeft + F.scroller.clientWidth / 2;
      var fy = focus ? focus.fy : F.scroller.scrollTop + F.scroller.clientHeight / 2;
      var mx = focus ? focus.mx : F.scroller.clientWidth / 2, my = focus ? focus.my : F.scroller.clientHeight / 2;
      zoom = z;
      slots.forEach(function (s) { if (s.vp) size(s); s.done = 0; });
      F.scroller.scrollLeft = fx * ratio - mx;
      F.scroller.scrollTop = fy * ratio - my;
      slots.forEach(function (s) {
        var r = s.box.getBoundingClientRect(), R = F.scroller.getBoundingClientRect();
        if (r.bottom > R.top - 900 && r.top < R.bottom + 900) render(s); else release(s);
      });
    }
    F.zIn.onclick = function () { setZoom(zoom * 1.25); };
    F.zOut.onclick = function () { setZoom(zoom / 1.25); };
    F.zFit.onclick = function () { setZoom(1); };
    gestures(F, function () { return zoom; }, setZoom);
    return F;
  }

  /* ---------- صورة ---------- */
  function openImage(src, title, opts) {
    opts = opts || {};
    var F = frame(title);
    var img = el("img", "display:block;max-width:none;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.4)");
    if (opts.watermark) {
      /* الصورة بتترسم على canvas بالعلامة المائية بدل ما تتعرض خام */
      var raw = new Image();
      raw.onload = function () {
        var c = document.createElement("canvas"); c.width = raw.naturalWidth; c.height = raw.naturalHeight;
        var cx = c.getContext("2d"); cx.drawImage(raw, 0, 0); watermark(cx, c.width, c.height, opts.watermark);
        img.src = c.toDataURL("image/jpeg", 0.9);
      };
      raw.src = src; src = "";
    }
    var zoom = 1;
    function fit() {
      if (!img.naturalWidth) return;
      var base = (F.scroller.clientWidth - 16) / img.naturalWidth;
      img.style.width = Math.round(img.naturalWidth * base * zoom) + "px";
    }
    img.onload = fit;
    if (src) img.src = src;
    F.pages.appendChild(img);
    function setZoom(z, focus) {
      z = Math.max(0.5, Math.min(6, z));
      var ratio = z / zoom;
      var fx = focus ? focus.fx : F.scroller.scrollLeft + F.scroller.clientWidth / 2;
      var fy = focus ? focus.fy : F.scroller.scrollTop + F.scroller.clientHeight / 2;
      var mx = focus ? focus.mx : F.scroller.clientWidth / 2, my = focus ? focus.my : F.scroller.clientHeight / 2;
      zoom = z; fit();
      F.scroller.scrollLeft = fx * ratio - mx; F.scroller.scrollTop = fy * ratio - my;
    }
    F.zIn.onclick = function () { setZoom(zoom * 1.25); };
    F.zOut.onclick = function () { setZoom(zoom / 1.25); };
    F.zFit.onclick = function () { setZoom(1); };
    gestures(F, function () { return zoom; }, setZoom);
    return F;
  }

  w.PdfView = { open: open, openImage: openImage };
})(window);
