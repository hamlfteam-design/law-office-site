/* =============================================================================
   خط السير — تجميع الأعمال الإدارية المفتوحة + جلسات "اطلاع" (جلسة فاتت بلا
   قرار مُسجَّل) من كل القضايا، مبوَّبة حسب المحكمة ومرتَّبة بأقرب موعد، مع
   معاينة قابلة للتعديل (حذف/ترتيب/ملاحظة) قبل التصدير كملف Word.

   المصدر: CaseFile.all() + CaseFile.generalBox() (نفس مصدر "٩٦ تجميع الأعمال
   الإدارية" — عرض "حسب المحاكم" الموجود هناك). لا تُعدَّل هنا بيانات القضايا
   نفسها — شاشة قراءة وتصدير فقط.
   ============================================================================= */
(function (w) {
  "use strict";

  var CF = function () { return w.CaseFile; };

  function ar(n) {
    var cf = CF();
    return (cf && cf.ar) ? cf.ar(n) : String(n == null ? "" : n);
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }
  var AR_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  function dayDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso + "T00:00:00");
    if (isNaN(d.getTime())) return ar(String(iso).replace(/-/g, "/"));
    return AR_DAYS[d.getDay()] + " " + ar(d.getFullYear() + "/" + (d.getMonth() + 1) + "/" + d.getDate());
  }
  function resultOf(sn) {
    var r = sn && sn.raw ? sn.raw : {};
    return r.result || r.decision || r["for"] || r.reason || "";
  }
  function isOpenTask(t) {
    var st = (t && t.state) || "لم يتم";
    return st !== "تم" && st !== "ملغي";
  }

  function cases() {
    var cf = CF();
    var l = ((cf && cf.all && cf.all()) || []).slice();
    if (cf && cf.generalBox) l.push(cf.generalBox());
    return l;
  }

  function courtKey(name) {
    var cf = CF();
    return cf && cf.courtKeyT ? cf.courtKeyT(name) : String(name || "").trim().toLowerCase();
  }

  /** يجمع بنود خط السير: أعمال إدارية مفتوحة + جلسات اطلاع فاتت بلا قرار */
  function collectItems() {
    var cf = CF(), out = [], td = today();
    cases().forEach(function (c) {
      (c.adminTasks || []).forEach(function (t, idx) {
        if (!isOpenTask(t)) return;
        var court = cf && cf.taskCourt ? cf.taskCourt(c, t) : (t.court || (!c.general ? c.courtName : "") || "");
        out.push({
          kind: "task", c: c, t: t, idx: idx, court: court,
          date: t.taskDate || t.dueDate || "",
          label: t.text || "(بلا وصف)",
          sub: "دعوى " + ar(c.caseNo || "—") + (c.caseYear ? "/" + ar(c.caseYear) : "") +
               (c.fileNo ? " — ملف " + ar(c.fileNo) : "")
        });
      });
      if (c.general) return;
      (c.sessions || []).forEach(function (s0) {
        if (!s0 || !/^\d{4}-\d{2}-\d{2}$/.test(s0.date || "")) return;
        if (s0.date >= td) return;              /* مش فاتت */
        if (resultOf(s0)) return;                /* القرار مُسجَّل بالفعل */
        out.push({
          kind: "review", c: c, s: s0, court: c.courtName || "", date: s0.date,
          label: "اطلاع على نتيجة جلسة " + dayDate(s0.date),
          sub: "دعوى " + ar(c.caseNo || "—") + (c.caseYear ? "/" + ar(c.caseYear) : "") +
               (c.fileNo ? " — ملف " + ar(c.fileNo) : "")
        });
      });
    });
    return out;
  }

  /** يبوّب البنود حسب المحكمة، مرتَّبة: المحاكم بأقرب تاريخ، والبنود داخل كل محكمة زمنياً */
  function groupByCourt(items) {
    var groups = {}, order = [];
    items.forEach(function (it) {
      var k = courtKey(it.court) || "";
      if (!groups[k]) { groups[k] = { key: k, court: it.court || "بلا محكمة محدَّدة", items: [] }; order.push(k); }
      groups[k].items.push(it);
    });
    order.forEach(function (k) {
      groups[k].items.sort(function (a, b) {
        var da = a.date || "9999", db = b.date || "9999";
        return da < db ? -1 : da > db ? 1 : 0;
      });
    });
    order.sort(function (a, b) {
      var da = (groups[a].items[0] || {}).date || "9999", db = (groups[b].items[0] || {}).date || "9999";
      return da < db ? -1 : da > db ? 1 : 0;
    });
    return order.map(function (k) { return groups[k]; });
  }

  /* -------------------------------------------------- ورق المؤسسة (خلفية)
     نفس اقتطاع pdfdoc.js لصفحات بلا ترويسة: علامة مائية + تذييل (مربع رقم
     صفحة وQR)، بلا الترويسة العلوية — طلب المستخدم ٢-١١-٢٠٢٦: "العلامة
     المائية والـQR كفاية، الترويسة مش مهمة". */
  function watermarkDataUrl() {
    try {
      var paper = w.Letterhead && Letterhead.paper && Letterhead.paper();
      if (!paper || !paper.width) return null;
      var W = 1240, H = 1754;
      var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      var ctx = cv.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
      var kx = paper.width / W, ky = paper.height / H;
      ctx.drawImage(paper, 0, 260 * ky, W * kx, 1330 * ky, 0, 260, W, 1330);          /* العلامة المائية + الـQR */
      ctx.drawImage(paper, 50 * kx, 1600 * ky, 186 * kx, 112 * ky, 50, 1600, 186, 112); /* مربّع التذييل */
      return cv.toDataURL("image/jpeg", 0.82);
    } catch (e) { return null; }
  }

  /** بناء مستند Word (HTML بامتداد .doc) من البنود المعروضة حالياً */
  function buildDoc(groups) {
    var bg = watermarkDataUrl();
    var rows = "";
    groups.forEach(function (g) {
      if (!g.items.length) return;
      rows += '<tr><td colspan="3" style="background:#f4ece0;font-weight:700;padding:8px 10px;' +
        'border:1px solid #ccc;font-size:14px">🏛 ' + esc(g.court) + '</td></tr>';
      g.items.forEach(function (it) {
        rows += '<tr>' +
          '<td style="border:1px solid #ccc;padding:6px 8px;font-size:12px;white-space:nowrap">' + esc(it.date ? dayDate(it.date) : "—") + '</td>' +
          '<td style="border:1px solid #ccc;padding:6px 8px;font-size:12.5px">' + esc(it.label) +
            (it.note ? '<div style="color:#666;font-size:11px;margin-top:3px">ملاحظة: ' + esc(it.note) + '</div>' : '') + '</td>' +
          '<td style="border:1px solid #ccc;padding:6px 8px;font-size:11.5px;color:#555">' + esc(it.sub) + '</td>' +
          '</tr>';
      });
    });
    var bgCss = bg
      ? 'background-image:url(' + bg + ');background-repeat:repeat-y;background-size:210mm 297mm;'
      : '';
    var html = '<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8">' +
      '<style>body{' + bgCss + 'font-family:Tahoma,Arial,sans-serif;margin:0;padding:25mm 15mm 20mm}' +
      'table{width:100%;border-collapse:collapse;direction:rtl}h1{font-size:18px;text-align:center;margin:0 0 4px}' +
      '.sub{text-align:center;color:#666;font-size:12px;margin-bottom:16px}</style></head><body>' +
      '<h1>خط السير</h1><div class="sub">' + esc(dayDate(today())) + '</div>' +
      '<table>' + rows + '</table></body></html>';
    return html;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function toB64(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  function exportDoc(groups, done) {
    var html = buildDoc(groups);
    var name = "خط-السير-" + today() + ".doc";
    try {
      if (w.AndroidSaver && AndroidSaver.save) { AndroidSaver.save(name, toB64(html)); if (done) done(true); return; }
    } catch (e) { }
    if (done) done(false);
  }

  w.RouteSheet = {
    collectItems: collectItems, groupByCourt: groupByCourt,
    exportDoc: exportDoc, dayDate: dayDate, today: today
  };
})(window);
