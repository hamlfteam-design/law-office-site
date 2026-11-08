/* =============================================================================
   إضافات الواجهة
     1) الثيمات — عدة مظاهر يختار المستخدم منها ما يريحه
     2) المواقع الصديقة — عناوين حقيقية قابلة للتعديل
     3) مدير السجلات — تعديل وحذف لكل سجل على حدة
   ============================================================================= */
(function (w) {
  "use strict";

  var SCREEN = (location.pathname.split("/").pop() || "index").replace(/\.html.*$/, "");
  var DB_KEY = "proflawyer.screens.v1";

  function el(t, css, txt) {
    var e = document.createElement(t);
    if (css) e.style.cssText = css;
    if (txt != null) e.textContent = txt;
    return e;
  }

  /* ============================================================ 1) الثيمات */

  var THEMES = {
    office: {
      name: "بني المكتب", swatch: ["#5b3a21", "#c8a165", "#f2efea"],
      v: { brand: "#5b3a21", dark: "#3d2614", light: "#8a6242", gold: "#c8a165",
           bg: "#f2efea", card: "#ffffff", line: "#ddd4c8", text: "#241a12",
           muted: "#7d7166", pageBg: "#e6e1d9" }
    },
    night: {
      name: "ليلي", swatch: ["#c8a165", "#8a6242", "#1c1814"],
      v: { brand: "#c8a165", dark: "#0f0d0a", light: "#e0c391", gold: "#e6c68b",
           bg: "#1c1814", card: "#262019", line: "#3d342a", text: "#f0e8dc",
           muted: "#a89880", pageBg: "#120f0c" }
    },
    green: {
      name: "أخضر قضائي", swatch: ["#1f5240", "#c8a165", "#eef3f0"],
      v: { brand: "#1f5240", dark: "#123328", light: "#3d7a63", gold: "#c8a165",
           bg: "#eef3f0", card: "#ffffff", line: "#cfdcd6", text: "#12241d",
           muted: "#6b7d76", pageBg: "#e2ebe6" }
    },
    navy: {
      name: "كحلي رسمي", swatch: ["#1e3a5f", "#c8a165", "#eef1f6"],
      v: { brand: "#1e3a5f", dark: "#122540", light: "#3f6091", gold: "#c8a165",
           bg: "#eef1f6", card: "#ffffff", line: "#ccd6e4", text: "#101b2b",
           muted: "#6b7789", pageBg: "#e1e7f0" }
    },
    sepia: {
      name: "ورقي مريح", swatch: ["#6b4423", "#a3763f", "#f6efe0"],
      v: { brand: "#6b4423", dark: "#4a2f18", light: "#a3763f", gold: "#b8893f",
           bg: "#f6efe0", card: "#fffcf3", line: "#e2d5b8", text: "#2b2013",
           muted: "#83745c", pageBg: "#ece2cc" }
    },
    contrast: {
      name: "تباين عالٍ", swatch: ["#000000", "#b8860b", "#ffffff"],
      v: { brand: "#000000", dark: "#000000", light: "#333333", gold: "#b8860b",
           bg: "#ffffff", card: "#ffffff", line: "#8a8a8a", text: "#000000",
           muted: "#4a4a4a", pageBg: "#e8e8e8" }
    },
    gold: {
      name: "ذهبي فاتح", swatch: ["#c9975e", "#1c2b4a", "#ffffff"],
      v: { brand: "#c9975e", dark: "#1c2b4a", light: "#e0b47f", gold: "#c9975e",
           bg: "#f4f5f7", card: "#ffffff", line: "#e7e9ee", text: "#1c2b4a",
           muted: "#8a8f9a", pageBg: "#ffffff" }
    }
  };

  var TKEY = "proflawyer.theme";

  function applyTheme(key) {
    var t = THEMES[key] || THEMES.office;
    var r = document.documentElement.style;
    r.setProperty("--brand", t.v.brand);
    r.setProperty("--brand-dark", t.v.dark);
    r.setProperty("--brand-light", t.v.light);
    r.setProperty("--gold", t.v.gold);
    r.setProperty("--bg", t.v.bg);
    r.setProperty("--card", t.v.card);
    r.setProperty("--line", t.v.line);
    r.setProperty("--text", t.v.text);
    r.setProperty("--muted", t.v.muted);
    document.body.style.background = t.v.pageBg;
    document.body.style.color = t.v.text;
  }

  function currentTheme() {
    try { return localStorage.getItem(TKEY) || "office"; } catch (e) { return "office"; }
  }

  applyTheme(currentTheme());          // فوراً قبل الرسم حتى لا ترتجف الألوان

  function themePicker() {
    var wrap = el("div",
      "position:fixed;inset:0;background:rgba(20,14,8,.55);z-index:10002;" +
      "display:flex;align-items:flex-end;justify-content:center");
    wrap.setAttribute("data-modal", "1");
    wrap.setAttribute("data-nosave", "1");

    var box = el("div",
      "background:var(--card,#fff);border-radius:16px 16px 0 0;padding:18px 18px 26px;" +
      "width:100%;max-width:520px;direction:rtl;max-height:82vh;overflow-y:auto");

    box.appendChild(el("div",
      "font-family:var(--f-title);font-size:17px;margin-bottom:4px;color:var(--text)",
      "المظهر والأرقام"));
    box.appendChild(el("div",
      "font-size:13px;color:var(--muted);margin-bottom:16px;line-height:1.8",
      "اختر ما يريح عينك — يُطبَّق على كل الشاشات ويبقى محفوظاً."));

    var cur = currentTheme();
    Object.keys(THEMES).forEach(function (k) {
      var t = THEMES[k], on = (k === cur);
      var b = el("button",
        "display:flex;align-items:center;gap:12px;width:100%;padding:13px;margin-bottom:10px;" +
        "border-radius:12px;font-family:inherit;min-height:56px;text-align:right;" +
        "border:2px solid " + (on ? t.v.brand : "var(--line,#ddd)") + ";" +
        "background:" + (on ? "rgba(0,0,0,.03)" : "transparent") + ";color:var(--text)");
      b.type = "button";

      var sw = el("span", "display:flex;flex:0 0 auto;border-radius:8px;overflow:hidden;" +
                          "width:58px;height:34px;box-shadow:0 1px 4px rgba(0,0,0,.18)");
      t.swatch.forEach(function (c) {
        sw.appendChild(el("span", "flex:1;background:" + c));
      });
      b.appendChild(sw);

      b.appendChild(el("span", "flex:1;font-size:15px;font-weight:" + (on ? "600" : "400"),
                       t.name + (on ? "  ✓" : "")));

      b.onclick = function () {
        try { localStorage.setItem(TKEY, k); } catch (e) { }
        applyTheme(k);
        wrap.remove();
        location.reload();
      };
      box.appendChild(b);
    });

    /* ---------------- صورة الأرقام ---------------- */
    box.appendChild(el("div",
      "font-family:var(--f-title);font-size:16px;margin:20px 0 4px;color:var(--text)",
      "صورة الأرقام"));
    box.appendChild(el("div",
      "font-size:13px;color:var(--muted);margin-bottom:12px;line-height:1.8",
      "تُطبَّق على كل الحقول فوراً — والقيم المحفوظة تُعرض بالصورة المختارة."));

    var curNum = (window.lawyerNumerals ? window.lawyerNumerals() : "ar");
    var row = el("div", "display:flex;gap:10px;margin-bottom:6px");

    [["ar", "عربية  ٠١٢٣٤٥٦٧٨٩"], ["en", "لاتينية  0123456789"]].forEach(function (p) {
      var on = (curNum === p[0]);
      var b = el("button",
        "flex:1;padding:13px 8px;border-radius:11px;font-family:inherit;font-size:14px;" +
        "min-height:52px;color:var(--text);" +
        "border:2px solid " + (on ? "var(--brand)" : "var(--line,#ddd)") + ";" +
        "background:" + (on ? "rgba(0,0,0,.03)" : "transparent") + ";" +
        "font-weight:" + (on ? "600" : "400"), p[1] + (on ? "  ✓" : ""));
      b.type = "button";
      b.onclick = function () {
        if (window.lawyerSetNumerals) window.lawyerSetNumerals(p[0]);
        wrap.remove();
        location.reload();
      };
      row.appendChild(b);
    });
    box.appendChild(row);

    var close = el("button",
      "width:100%;padding:13px;margin-top:16px;border:0;border-radius:11px;" +
      "background:var(--line,#eee);color:var(--text);font-family:inherit;" +
      "font-size:15px;min-height:46px", "إغلاق");
    close.type = "button";
    close.onclick = function () { wrap.remove(); };
    box.appendChild(close);

    wrap.appendChild(box);
    wrap.onclick = function (e) { if (e.target === wrap) wrap.remove(); };
    document.body.appendChild(wrap);
  }

  w.openThemePicker = themePicker;

  /* زر المظهر في شريط العنوان */
  function themeButton() {
    var bar = document.querySelector(".appbar");
    if (!bar || bar.querySelector("[data-theme-btn]")) return;
    var b = el("button",
      "background:transparent;border:0;color:inherit;font-size:19px;padding:4px 6px;" +
      "min-width:40px;min-height:40px;font-family:inherit;line-height:1", "🎨");
    b.type = "button";
    b.title = "المظهر";
    b.setAttribute("data-theme-btn", "1");
    b.setAttribute("data-nosave", "1");
    b.onclick = themePicker;
    bar.appendChild(b);
  }

  /* ================================================== 2) المواقع الصديقة */

  var LKEY = "proflawyer.links.v1";

  /* عناوين معروفة — والمستخدم يستطيع تصحيح أيٍّ منها من زر «تعديل» */
  /* عناوين موثّقة من المستخدم. زر ✎ بجوار كل موقع يسمح بتصحيحه لاحقاً. */
  var DEFAULT_LINKS = {
    "المحامي المحترف":                 "https://professional-lawyer.com",
    "مصر الرقمية":                     "https://digital.gov.eg/",
    "استعلامات وزارة العدل — دعوى":    "https://moj.gov.eg/services/courts/10050004",
    "استعلامات وزارة العدل — طعن":     "https://moj.gov.eg/services/courts/10050003",
    "المحكمة الدستورية":               "https://www.sccourt.gov.eg/",
    "محكمة النقض":                     "https://www.cc.gov.eg/",
    "مجلس الدولة":                     "https://drive.google.com/drive/folders/1klOELG6WMsMUDDRWKIQrYQw_pMLR74yW",
    "النيابة العامة":                  "https://www.ppo.gov.eg/ppo/r/ppoportal/ppoportal/home",
    "المحاكم الاقتصادية":              "https://elec.eecourts.gov.eg/",
    "أرغب في عمل توكيل":               "https://rern.gov.eg/",
    "بوابة التشريعات والأحكام":        "https://share.google/svB4wOVdgafry3Dbu",
    "شكاوى مجلس الوزراء — في خدمتك":   "https://shakwa.eg/GCP/Default.aspx",
    "رئاسة مجلس الوزراء":              "https://www.cabinet.gov.eg/Services#services-4",
    "خدمات وزارة الداخلية":            "https://moi.gov.eg/home/directoryservices",
    "مصلحة الضرائب":                   "https://eservice.incometax.gov.eg/etax",
    "الهيئة العامة للاستثمار":         "https://gafi.gov.eg/",
    /* فروع مجلس الدولة — فولدرات جوجل درايف من لوحة المحامي المحترف (/ar/dashboard/websites، ٥-١٠-٢٠٢٦) */
    "مجلس الدولة بـالعباسية":          "https://drive.google.com/drive/folders/1CG3gIJV7_GCLUY8WeeiIOMbQjSxzgTii",
    "مجلس الدولة بـدمياط":             "https://drive.google.com/drive/folders/1AYi28yzIr0Zxii_GFDpFT2UrveDKtkrQ",
    "مجلس الدولة بـالشرقية":           "https://drive.google.com/drive/folders/1ZHEYkxbQsUzMn2zeewvE0E2q1vVqPXOy",
    "مجلس الدولة بـالإسماعيلية":       "https://drive.google.com/drive/folders/12g7CBDPRvJCSc6vxfVdfhY2hvhMnHqTy",
    "مجلس الدولة بـبورسعيد":           "https://drive.google.com/drive/folders/1H5_v3j7BKvMbViTpoa8mAdw40sRYTNFQ",
    "مجلس الدولة بـالمنصورة":          "https://drive.google.com/drive/folders/1oodkigVJGotJs-7eLMUwfHEHwR42WWub",
    "مجلس الدولة بـكفر الشيخ":         "https://drive.google.com/drive/folders/1Pj9L05-h39zym5nMjYCmfH6BtPCVGgKF",
    "مجلس الدولة بـالإسكندرية":        "https://drive.google.com/drive/folders/19U31SsRA-G1Tv54FYLlQ56RAsXbiN7c7",
    "مجلس الدولة بـالبحيرة":           "https://drive.google.com/drive/folders/1txpR-7bsWOtaLwo_mEf6gWXby6lBeN_r"
  };

  function links() {
    var saved;
    try { saved = JSON.parse(localStorage.getItem(LKEY)) || {}; } catch (e) { saved = {}; }
    var out = {};
    Object.keys(DEFAULT_LINKS).forEach(function (k) { out[k] = saved[k] || DEFAULT_LINKS[k]; });
    /* رابط متخزّن فاضي (اتفتحت الخانة واتقفلت) ما يمسحش الرابط الأساسي */
    Object.keys(saved).forEach(function (k) { if (saved[k]) out[k] = saved[k]; });
    return out;
  }

  function saveLink(name, url) {
    var saved;
    try { saved = JSON.parse(localStorage.getItem(LKEY)) || {}; } catch (e) { saved = {}; }
    saved[name] = url;
    try { localStorage.setItem(LKEY, JSON.stringify(saved)); } catch (e) { }
  }

  function wireLinks() {
    if (SCREEN !== "90-links") return;
    var map = links();

    document.querySelectorAll("a.link-item").forEach(function (a) {
      var nm = a.querySelector(".nm");
      if (!nm) return;
      var name = nm.textContent.trim();
      var url  = map[name] || "";

      a.removeAttribute("onclick");
      a.setAttribute("href", url || "#");
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener");
      a.style.position = "relative";
      a.style.paddingLeft = "48px";

      if (!url) {
        a.addEventListener("click", function (e) {
          e.preventDefault();
          editLink(name, a);
        });
      }

      if (a.querySelector("[data-edit-link]")) return;
      var pen = el("button",
        "position:absolute;left:6px;top:50%;transform:translateY(-50%);width:38px;height:38px;" +
        "border:0;background:transparent;color:var(--muted);font-size:15px;font-family:inherit;" +
        "display:flex;align-items:center;justify-content:center;z-index:2", "✎");
      pen.type = "button";
      pen.title = "تعديل العنوان";
      pen.setAttribute("data-edit-link", "1");
      pen.setAttribute("data-nosave", "1");
      pen.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation();
        editLink(name, a);
      });
      a.appendChild(pen);
    });

    var note = document.querySelector("main .note, main .infobox");
    if (note && !note.dataset.linkNote) {
      note.dataset.linkNote = "1";
      note.innerHTML +=
        '<br>اضغط <strong>✎</strong> بجوار أي موقع لتغيير عنوانه — يُحفظ على الجهاز.';
    }
  }

  function editLink(name, a) {
    var cur = links()[name] || "";
    var v = prompt("عنوان موقع «" + name + "»", cur);
    if (v === null) return;
    v = v.trim();
    if (v && !/^https?:\/\//i.test(v)) v = "https://" + v;
    saveLink(name, v);
    a.setAttribute("href", v || "#");
  }

  /* ============================================== 3) مدير السجلات (حذف/تعديل) */

  function readDB() {
    try { return JSON.parse(localStorage.getItem(DB_KEY)) || {}; } catch (e) { return {}; }
  }
  function writeDB(db) {
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); return true; } catch (e) { return false; }
  }

  /**
   * عنوان السجل في القائمة.
   *
   * data.js يحفظ القيم في مصفوفة r.v بترتيب الحقول لا بأسمائها، فقراءة
   * المفاتيح مباشرةً كانت تُرجع [object Object]. نقرأ أول قيمتين نصيّتين
   * ذواتَي معنى ونتجاهل التواريخ والأرقام القصيرة جداً.
   */
  function recordTitle(r) {
    var vals = (r.v || [])
      .map(function (c) { return c && c.x != null ? String(c.x).trim() : ""; })
      .filter(function (v) {
        if (!v || v.length < 2) return false;
        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;      // تاريخ
        return true;
      });

    var head = vals.slice(0, 2).join(" — ");
    var when = "";
    if (r._at) {
      try { when = new Date(r._at).toLocaleDateString("ar-EG"); } catch (e) { }
    }
    if (!head) head = "سجل بلا بيانات";
    return head + (when ? "  ·  " + when : "");
  }

  /** لوحة تعرض كل سجلات الشاشة، ولكل سجل زرّا تعديل وحذف */
  function recordsManager() {
    var db = readDB();
    var list = db[SCREEN] || [];

    var wrap = el("div",
      "position:fixed;inset:0;background:rgba(20,14,8,.55);z-index:10002;" +
      "display:flex;align-items:flex-end;justify-content:center");
    wrap.setAttribute("data-modal", "1");
    wrap.setAttribute("data-nosave", "1");

    var box = el("div",
      "background:var(--card,#fff);border-radius:16px 16px 0 0;padding:18px 18px 26px;" +
      "width:100%;max-width:520px;direction:rtl;max-height:82vh;overflow-y:auto");

    box.appendChild(el("div",
      "font-family:var(--f-title);font-size:17px;color:var(--text);margin-bottom:4px",
      "سجلات هذه الشاشة (" + list.length + ")"));
    box.appendChild(el("div",
      "font-size:13px;color:var(--muted);margin-bottom:14px;line-height:1.8",
      "افتح أي سجل لتعديله، أو احذفه نهائياً."));

    if (!list.length) {
      box.appendChild(el("div",
        "text-align:center;color:var(--muted);padding:24px;font-size:14px",
        "لا توجد سجلات محفوظة بعد."));
    }

    list.forEach(function (r) {
      var row = el("div",
        "display:flex;align-items:center;gap:9px;padding:11px 0;" +
        "border-bottom:1px solid var(--line,#eee)");

      row.appendChild(el("span",
        "flex:1;font-size:14.5px;color:var(--text);line-height:1.7;word-break:break-word",
        recordTitle(r)));

      var ed = el("button",
        "flex:0 0 auto;min-width:64px;min-height:42px;border:1px solid var(--line,#ddd);" +
        "border-radius:8px;background:transparent;color:var(--brand);font-family:inherit;" +
        "font-size:13px", "تعديل");
      ed.type = "button";
      ed.onclick = function () {
        wrap.remove();
        var sel = document.getElementById("__recs");
        if (sel) {
          sel.value = r._id;
          sel.dispatchEvent(new Event("change", { bubbles: true }));
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      };

      var rm = el("button",
        "flex:0 0 auto;min-width:64px;min-height:42px;border:1px solid #e3c9c6;" +
        "border-radius:8px;background:transparent;color:#b3261e;font-family:inherit;" +
        "font-size:13px", "حذف");
      rm.type = "button";
      rm.onclick = function () {
        Ask.confirm("حذف هذا السجل نهائياً؟",
                    { detail: recordTitle(r), ok: "حذف السجل" }, function () {
        var d = readDB();
        d[SCREEN] = (d[SCREEN] || []).filter(function (x) { return x._id !== r._id; });
        writeDB(d);
        wrap.remove();
        recordsManager();
        var sel = document.getElementById("__recs");
        if (sel) {
          var o = sel.querySelector('option[value="' + r._id + '"]');
          if (o) o.remove();
        }
        });
      };

      row.appendChild(ed);
      row.appendChild(rm);
      box.appendChild(row);
    });

    var close = el("button",
      "width:100%;padding:13px;margin-top:16px;border:0;border-radius:11px;" +
      "background:var(--line,#eee);color:var(--text);font-family:inherit;" +
      "font-size:15px;min-height:46px", "إغلاق");
    close.type = "button";
    close.onclick = function () { wrap.remove(); };
    box.appendChild(close);

    wrap.appendChild(box);
    wrap.onclick = function (e) { if (e.target === wrap) wrap.remove(); };
    document.body.appendChild(wrap);
  }

  w.openRecordsManager = recordsManager;

  /** زر «السجلات» داخل شريط الأدوات الذي يبنيه data.js */
  function recordsButton() {
    var bar = document.querySelector(".modebar");
    if (!bar || bar.querySelector("[data-recman]")) return;
    var b = el("button", "", "🗂 السجلات");
    b.type = "button";
    b.className = "btn sm ghost";
    b.setAttribute("data-recman", "1");
    b.onclick = recordsManager;
    bar.appendChild(b);
  }


  /* ======================================= 4) ترقيم الملفات التلقائي
     «سجل جديد» يقترح الرقم التالي لأعلى رقم ملف مسجَّل، والحقل يبقى
     مفتوحاً لتغييره يدوياً في أي وقت.                                   */

  function toLatin(t) {
    return String(t == null ? "" : t)
      .replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x0660; });
  }
  function toArabic(t) {
    var A = ["٠","١","٢","٣","٤","٥","٦","٧","٨","٩"];
    return String(t).replace(/[0-9]/g, function (d) { return A[+d]; });
  }

  function savedFields() {
    var main = document.querySelector("main") || document.body;
    return Array.prototype.slice.call(main.querySelectorAll("input, select, textarea"))
      .filter(function (e) {
        return e.type !== "file" && !e.closest("[data-nosave]") && e.id !== "__recs";
      });
  }

  function nextFileNo() {
    var f = document.getElementById("fileNo");
    if (!f) return null;
    var idx = savedFields().indexOf(f);
    if (idx < 0) return null;

    var recs = (readDB()[SCREEN] || []);
    var max = 0;
    recs.forEach(function (r) {
      var cell = r.v && r.v[idx];
      var n = parseInt(toLatin(cell && cell.x), 10);
      if (!isNaN(n) && n > max) max = n;
    });
    return max + 1;
  }

  function wireFileNo() {
    var f = document.getElementById("fileNo");
    if (!f || f.dataset.autoNo) return;
    f.dataset.autoNo = "1";

    f.style.minHeight = "50px";
    f.style.fontSize  = "17px";
    f.style.letterSpacing = "1px";
    if (!f.placeholder) f.placeholder = "رقم الملف";

    var hint = el("div",
      "font-size:12.5px;color:var(--muted);margin-top:4px;line-height:1.8",
      "يُقترح تلقائياً بعد أعلى رقم مسجَّل — ويمكنك تغييره بنفسك.");
    hint.setAttribute("data-nosave", "1");
    if (f.parentNode) f.parentNode.insertBefore(hint, f.nextSibling);

    /* زر «سجل جديد» في شريط data.js يُفرّغ الحقول — نملأ الرقم بعده */
    var bar = document.querySelector(".modebar");
    if (!bar) return;
    Array.prototype.forEach.call(bar.querySelectorAll("button"), function (b) {
      if (b.textContent.trim() !== "سجل جديد" || b.dataset.autoNoHooked) return;
      b.dataset.autoNoHooked = "1";
      b.addEventListener("click", function () {
        setTimeout(function () {
          var n = nextFileNo();
          if (n == null) return;
          var useAr = !(window.lawyerNumerals && window.lawyerNumerals() === "en");
          f.value = useAr ? toArabic(n) : String(n);
          f.dispatchEvent(new Event("input", { bubbles: true }));
          f.focus();
          f.select();
        }, 60);
      });
    });
  }

  /* ---------------------------------------------------------------- إقلاع */

  function boot() {
    themeButton();
    wireLinks();
    recordsButton();
    setTimeout(recordsButton, 600);      // شريط data.js يُبنى بعد قليل
    wireFileNo();
    setTimeout(wireFileNo, 700);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else { boot(); }

})(window);
