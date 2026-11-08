/* =============================================================================
   اقتراح — بديل عام لأي <input list="..."> عن الـdatalist الأصلي.

   القائمة الأصلية (datalist) في WebView أندرويد بتفتح كنافذة كاملة تغطّي
   لوحة المفاتيح، بلا أي تقليص للنتائج أثناء الكتابة (لازم تسكرول لحد ما
   تلاقي اللي بتدور عليه)، ولمس أي سطر فيها بيختار عنصراً بالغلط أثناء
   محاولة التمرير. هنا لوحة اقتراحات خاصة بالتطبيق (نفس أسلوب combo.js
   للقوائم المنسدلة): صندوق صغير تحت الحقل، سحب = تمرير ونقرة = اختيار،
   وتقليص فوري للنتائج بأي جزء من النص يكتبه المستخدم في أي مكان من القيمة
   (مش بس أول الكلمة) — راجع طلب المستخدم [[feedback_lookup_substring_filter]].

   المصدر: لـ"dlPeople" تُبنى الأسماء من بيانات الموكلين/الخصوم طازجة في كل
   فتحة (يشمل آخر موكل مُضاف)؛ ولأي datalist تاني تُقرأ عناصره <option>
   مباشرة (سواء مكتوبة في الصفحة أو مُضافة بجافاسكربت عند التحميل).
   ============================================================================= */
(function (w) {
  "use strict";

  var openPanel = null;

  function norm(t) { return window.lawyerNorm(t); }

  /* تُقرأ طازجة من التخزين في كل فتحة — لا تُحفظ في متغيّر ثابت — حتى
     يظهر آخر موكل أُضيف ولو أُضيف بعد فتح هذه الشاشة. */
  function collectPeople() {
    var seen = {}, names = [];
    function add(n) {
      n = (n == null ? "" : String(n)).trim();
      if (n && !seen[n]) { seen[n] = 1; names.push(n); }
    }
    try {
      (JSON.parse(localStorage.getItem("proflawyer.agenda.clients.v1")) || [])
        .forEach(function (c) { if (c && c.name) add(c.name); });
    } catch (e) { }
    try {
      (JSON.parse(localStorage.getItem("proflawyer.agenda.cases.v1")) || [])
        .forEach(function (c) {
          [c.clients, c.opponents].forEach(function (s) {
            String(s || "").split("·").forEach(function (p) {
              add(String(p).replace(/\([^)]*\)/g, ""));
            });
          });
        });
    } catch (e) { }
    names.sort(function (a, b) { return a.localeCompare(b, "ar"); });
    return names;
  }

  /** مصدر الأسماء لأي حقل: dlPeople له مصدر خاص متجدد، وأي datalist آخر
      يُقرأ من عناصر <option> بتاعته مباشرة (فتشمل أي قائمة وُلّدت بجافاسكربت
      قبل هذه اللحظة — انظر مثلاً 04-bailiff-papers.html). */
  function sourceFor(listId) {
    if (listId === "dlPeople") return collectPeople;
    return function () {
      var dl = document.getElementById(listId);
      if (!dl) return [];
      return Array.prototype.map.call(dl.querySelectorAll("option"), function (o) { return o.value; })
        .filter(Boolean);
    };
  }

  function upgrade(inp) {
    if (inp.dataset.peopled) return;
    var listId = inp.getAttribute("list");
    if (!listId) return;
    var getList = sourceFor(listId);
    inp.dataset.peopled = "1";
    inp.removeAttribute("list");
    inp.setAttribute("autocomplete", "off");

    var panel = document.createElement("div");
    panel.setAttribute("data-nosave", "1");
    panel.style.cssText =
      "position:fixed;z-index:9500;background:#fff;border:1px solid #ddd4c8;border-radius:10px;" +
      "overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;" +
      "max-height:min(40vh,280px);box-shadow:0 8px 26px rgba(60,40,20,.22);display:none";
    document.body.appendChild(panel);

    var blurTimer = null;
    panel.addEventListener("pointerdown", function () {
      if (blurTimer) { clearTimeout(blurTimer); blurTimer = null; }
    });

    function positionPanel() {
      var r = inp.getBoundingClientRect();
      var vh = window.innerHeight || document.documentElement.clientHeight;
      var maxH = Math.min(280, vh * 0.4);
      panel.style.left = r.left + "px";
      panel.style.width = r.width + "px";
      var below = vh - r.bottom;
      if (below < Math.min(maxH, 170) && r.top > below) {
        panel.style.top = "auto";
        panel.style.bottom = (vh - r.top + 4) + "px";
        panel.style.maxHeight = Math.max(120, Math.min(maxH, r.top - 10)) + "px";
      } else {
        panel.style.bottom = "auto";
        panel.style.top = (r.bottom + 4) + "px";
        panel.style.maxHeight = Math.max(120, Math.min(maxH, below - 10)) + "px";
      }
    }

    function close() {
      panel.style.display = "none";
      if (openPanel === close) openPanel = null;
    }

    /** يبني اللوحة، ويعيد عدد العناصر المعروضة. */
    function render(filter) {
      var q = norm(filter);
      var list = getList();
      var shown = q ? list.filter(function (n) { return norm(n).indexOf(q) >= 0; }) : list;
      panel.innerHTML = "";
      shown.slice(0, 80).forEach(function (n) {
        var row = document.createElement("button");
        row.type = "button";
        row.style.cssText =
          "display:block;width:100%;text-align:right;padding:12px 14px;border:0;" +
          "border-bottom:1px solid #f4efe6;font-family:inherit;font-size:15px;" +
          "min-height:46px;direction:rtl;background:#fff;color:#3d2614";
        row.textContent = n;
        /* الاختيار عند نقرةٍ حقيقية فقط — إن حرّك إصبعه فهو تمرير لا اختيار */
        var sy0 = 0, movd = false;
        row.addEventListener("pointerdown", function (e) { sy0 = e.clientY; movd = false; });
        row.addEventListener("pointermove", function (e) {
          if (Math.abs(e.clientY - sy0) > 8) movd = true;
        });
        row.addEventListener("pointerup", function (e) {
          if (movd) return;
          e.preventDefault();
          inp.value = n;
          inp.dispatchEvent(new Event("input", { bubbles: true }));
          inp.dispatchEvent(new Event("change", { bubbles: true }));
          close();
        });
        panel.appendChild(row);
      });
      return shown.length;
    }

    function open(filter) {
      if (openPanel && openPanel !== close) openPanel();
      var n = render(filter || "");
      if (!n) { close(); return; }
      panel.style.display = "block";
      positionPanel();
      panel.scrollTop = 0;
      openPanel = close;
      if (!panel._onScroll) {
        panel._onScroll = function () { if (panel.style.display === "block") positionPanel(); };
        window.addEventListener("scroll", panel._onScroll, true);
        window.addEventListener("resize", panel._onScroll);
      }
      if (!panel._onDocDown) {
        panel._onDocDown = function (e) {
          if (panel.style.display !== "block") return;
          if (inp.contains(e.target) || panel.contains(e.target)) return;
          close();
        };
        document.addEventListener("pointerdown", panel._onDocDown, true);
      }
    }

    inp.addEventListener("focus", function () { open(inp.value); });
    inp.addEventListener("input", function () { open(inp.value); });
    /* الخروج من الحقل يُغلق اللوحة (بعد مهلة قصيرة كي لا يقاطع نقرة عليها) */
    inp.addEventListener("blur", function () {
      blurTimer = setTimeout(function () { blurTimer = null; close(); }, 150);
    });
  }

  function scan() {
    document.querySelectorAll('input[list]').forEach(upgrade);
  }

  function boot() {
    scan();
    var pending = false;
    new MutationObserver(function () {
      if (pending) return;
      pending = true;
      setTimeout(function () { pending = false; scan(); }, 150);
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 150); });
  } else { setTimeout(boot, 150); }
})(window);
