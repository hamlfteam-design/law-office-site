/* =============================================================================
   التواريخ — تُقبل بأي صيغة، وتُعرض بصيغة واحدة.

   كان الحقل لا يقبل إلا «2026/7/14»، فمن كتب «14/7/2026» أو «14 يوليو 2026»
   ضاع ما كتبه أو رُفض بلا سبب ظاهر. والناس تكتب التاريخ كما اعتادت لا كما
   يشتهي الحقل.

   هنا مُحلِّلٌ واحد يقبل:
     2026/07/14 · 14/7/2026 · 14-7-2026 · 14 7 2026 · 14 يوليو 2026
     ١٤/٧/٢٠٢٦ · 14 July 2026 · 2026-07-14 · اليوم · أمس · غداً

   والعرض موحَّد: اسم اليوم ثم yyyy/mm/dd — «السبت ٢٠٢٦/٠٧/١٤».

   التمييز بين يوم/شهر وشهر/يوم: ما زاد على ١٢ فهو اليوم قطعاً؛ وإن أشكل
   فالعُرف المصري يقدّم اليوم.
   ============================================================================= */
(function (w) {
  "use strict";

  var MONTHS = {
    "يناير": 1, "فبراير": 2, "مارس": 3, "أبريل": 4, "ابريل": 4, "إبريل": 4,
    "مايو": 5, "يونيو": 6, "يونيه": 6, "يوليو": 7, "يوليه": 7, "أغسطس": 8,
    "اغسطس": 8, "سبتمبر": 9, "أكتوبر": 10, "اكتوبر": 10, "نوفمبر": 11,
    "ديسمبر": 12,
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11,
    "december": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7, "aug": 8,
    "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12
  };

  var DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  var AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
                   "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

  function la(t) {
    return String(t == null ? "" : t)
      .replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x0660; })
      .replace(/[۰-۹]/g, function (d) { return d.charCodeAt(0) - 0x06F0; });
  }
  function ar(n) {
    return String(n == null ? "" : n)
      .replace(/[0-9]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩"[+d]; });
  }
  function pad(n) { n = String(n); return n.length < 2 ? "0" + n : n; }

  function todayISO() { return new Date().toISOString().slice(0, 10); }

  function shift(days) {
    var d = new Date();
    d.setDate(d.getDate() + days);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function valid(y, m, d) {
    if (!(y >= 1900 && y <= 2200)) return false;
    if (!(m >= 1 && m <= 12)) return false;
    if (!(d >= 1 && d <= 31)) return false;
    var t = new Date(y, m - 1, d);
    return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d;
  }
  function iso(y, m, d) { return y + "-" + pad(m) + "-" + pad(d); }

  /**
   * يحوّل أي صيغة معقولة إلى yyyy-mm-dd، أو "" إن تعذّر.
   */
  function parse(input) {
    var s = la(input).trim();
    if (!s) return "";

    if (/^(اليوم|النهارده|النهاردة|today)$/i.test(s)) return todayISO();
    if (/^(أمس|امس|إمبارح|امبارح|yesterday)$/i.test(s)) return shift(-1);
    if (/^(غدا|غداً|بكرة|بكره|tomorrow)$/i.test(s)) return shift(1);

    /* اسم اليوم في أول النصّ لا يفيد التحليل — يُطرح */
    s = s.replace(/^(الأحد|الاحد|الإثنين|الاثنين|الثلاثاء|الأربعاء|الاربعاء|الخميس|الجمعة|السبت)\s*[,،]?\s*/, "");
    s = s.replace(/\s+/g, " ").trim();

    var m;

    /* yyyy/mm/dd — السنة أولاً */
    m = s.match(/^(\d{4})\s*[\/\-.\s]\s*(\d{1,2})\s*[\/\-.\s]\s*(\d{1,2})$/);
    if (m) {
      var y1 = +m[1], m1 = +m[2], d1 = +m[3];
      if (valid(y1, m1, d1)) return iso(y1, m1, d1);
      if (valid(y1, d1, m1)) return iso(y1, d1, m1);   /* yyyy/dd/mm */
      return "";
    }

    /* dd/mm/yyyy — اليوم أولاً، وهو العُرف هنا */
    m = s.match(/^(\d{1,2})\s*[\/\-.\s]\s*(\d{1,2})\s*[\/\-.\s]\s*(\d{2,4})$/);
    if (m) {
      var a = +m[1], b = +m[2], y = +m[3];
      if (y < 100) y += y > 50 ? 1900 : 2000;
      if (a > 12 && valid(y, b, a)) return iso(y, b, a);   /* اليوم قطعاً */
      if (b > 12 && valid(y, a, b)) return iso(y, a, b);   /* الشهر ثانياً مستحيل */
      if (valid(y, b, a)) return iso(y, b, a);            /* العُرف: يوم/شهر */
      if (valid(y, a, b)) return iso(y, a, b);
      return "";
    }

    /* 14 يوليو 2026 — الشهر بالاسم */
    m = s.match(/^(\d{1,2})\s+([^\s\d]+)\s+(\d{2,4})$/);
    if (m) {
      var mn = MONTHS[m[2].toLowerCase().replace(/^ال/, "")] || MONTHS[m[2].toLowerCase()];
      var yy = +m[3];
      if (yy < 100) yy += yy > 50 ? 1900 : 2000;
      if (mn && valid(yy, mn, +m[1])) return iso(yy, mn, +m[1]);
      return "";
    }

    /* يوليو 14 2026 */
    m = s.match(/^([^\s\d]+)\s+(\d{1,2})\s*[,،]?\s*(\d{2,4})$/);
    if (m) {
      var mn2 = MONTHS[m[1].toLowerCase().replace(/^ال/, "")] || MONTHS[m[1].toLowerCase()];
      var yy2 = +m[3];
      if (yy2 < 100) yy2 += yy2 > 50 ? 1900 : 2000;
      if (mn2 && valid(yy2, mn2, +m[2])) return iso(yy2, mn2, +m[2]);
      return "";
    }

    /* 20260714 */
    m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m && valid(+m[1], +m[2], +m[3])) return iso(+m[1], +m[2], +m[3]);

    /* dd/mm بلا سنة — تُفترض السنة الجارية */
    m = s.match(/^(\d{1,2})\s*[\/\-.]\s*(\d{1,2})$/);
    if (m) {
      var yNow = new Date().getFullYear();
      if (valid(yNow, +m[2], +m[1])) return iso(yNow, +m[2], +m[1]);
    }

    return "";
  }

  /** «السبت ٢٠٢٦/٠٧/١٤» */
  function show(isoDate) {
    var s = String(isoDate || "");
    var p = s.split("-");
    if (p.length < 3) return ar(s);
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    if (isNaN(d.getTime())) return ar(s);
    return DAYS[d.getDay()] + " " + ar(p[0] + "/" + pad(p[1]) + "/" + pad(p[2]));
  }

  /** «١٤ يوليو ٢٠٢٦» — للطباعة والنصوص */
  function longForm(isoDate) {
    var p = String(isoDate || "").split("-");
    if (p.length < 3) return "";
    return ar(+p[2]) + " " + AR_MONTHS[+p[1] - 1] + " " + ar(p[0]);
  }

  function daysBetween(a, b) {
    var pa = String(a).split("-"), pb = String(b).split("-");
    if (pa.length < 3 || pb.length < 3) return null;
    var da = new Date(+pa[0], +pa[1] - 1, +pa[2]);
    var db = new Date(+pb[0], +pb[1] - 1, +pb[2]);
    return Math.round((db - da) / 86400000);
  }

  /** يضيف عدداً من الأيام إلى تاريخ ويعيد ISO. */
  function addDays(isoDate, n) {
    var p = String(isoDate || "").split("-");
    if (p.length < 3) return "";
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setDate(d.getDate() + (+n || 0));
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  /**
   * يربط حقل نصّ بالمحلِّل: يقبل ما يُكتب، ويُظهر تحته ما فُهم منه.
   * @returns {{value:function():string}} value تعيد ISO أو ""
   */
  function bind(input, opts) {
    opts = opts || {};
    input.setAttribute("dir", "rtl");
    input.setAttribute("inputmode", "text");
    if (!input.placeholder) input.placeholder = "٢٠٢٦/٠٧/١٤ أو ١٤ يوليو ٢٠٢٦";

    var echo = document.createElement("div");
    echo.style.cssText = "font-size:12.5px;margin-top:4px;line-height:1.8;min-height:1.2em";
    if (input.parentNode) input.parentNode.insertBefore(echo, input.nextSibling);

    function refresh() {
      var raw = input.value.trim();
      if (!raw) { echo.textContent = ""; echo.style.color = "var(--muted)"; return ""; }
      var v = parse(raw);
      if (v) {
        echo.textContent = show(v);
        echo.style.color = "var(--brand-dark)";
      } else {
        echo.textContent = "لم أفهم هذا التاريخ — اكتبه مثل ١٤/٧/٢٠٢٦";
        echo.style.color = "#b3261e";
      }
      return v;
    }

    input.addEventListener("input", refresh);
    input.addEventListener("blur", function () {
      var v = parse(input.value);
      if (v) input.value = ar(v.replace(/-/g, "/"));   /* يُثبَّت على صيغة واحدة */
      refresh();
    });
    refresh();

    return { value: function () { return parse(input.value); }, refresh: refresh };
  }

  w.LawyerDate = {
    parse: parse, show: show, longForm: longForm, bind: bind,
    addDays: addDays, daysBetween: daysBetween, today: todayISO,
    ar: ar, la: la, DAYS: DAYS, MONTHS: AR_MONTHS
  };

  /* توافق: كان lawyerToISO هو المحوِّل الوحيد */
  w.lawyerToISO = parse;
})(window);
