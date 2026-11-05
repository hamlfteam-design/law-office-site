/* =============================================================================
   زرّا شاشة النسخ الاحتياطي.

   كانا في الأصل بلا أي وظيفة — مجرد شكل. وُضِعا هنا في ملف مستقل بدل كتابتهما
   داخل الصفحة، لأن الكتابة المضمّنة كسرت الجافاسكريبت مرة بسطر جديد داخل نص.
   ============================================================================= */
(function () {
  "use strict";

  /* النسخ الاحتياطي/الاستعادة: مدير المكتب (أو دور مُنح قسم الإدارة + مستوى backup) فقط.
     team.js بيقفل الشاشة كلها، وهنا حاجز تاني: لا أزرار ولا وظائف لغير المصرَّح له حتى لو فُتحت الصفحة بالرابط. */
  if (!(window.Team && Team.can && Team.can("team") && Team.canView && Team.canView("backup"))) return;

  var doBackup = document.getElementById("doBackup");
  var pickBtn  = document.getElementById("pickRestore");
  var fileInp  = document.getElementById("restoreFile");
  if (!doBackup) return;

  /* تُعيد القيمة كائناً/مصفوفةً إن كانت JSON، وإلا نصّها الخام كما هو —
     فمفاتيح نصّية بسيطة (الثيم مثلاً «خشبي») لا تضيع بتحوّلها إلى {} في النسخة. */
  function read(k) {
    var raw = localStorage.getItem(k);
    if (raw == null) return null;
    try { return JSON.parse(raw); }
    catch (e) { return raw; }
  }

  /* مفاتيح داخلية خاصة بجهاز النسخ الاحتياطي نفسه — لا تُصدَّر ولا تُستعاد،
     لتفادي تضاعف السجل أو استعادة إعدادات جهاز آخر (سمة العرض مثلاً). */
  var EXCLUDE = {
    "proflawyer.lastBackup": 1,
    "proflawyer.backupHistory.v1": 1,
    "proflawyer.sync.safetyBackup": 1
  };

  /* تجميع كل مفاتيح proflawyer.* الفعلية من التخزين ديناميكيًا — بدل قائمة
     يدوية ثابتة يسهل نسيان تحديثها عند إضافة ميزة جديدة (وهو ما كان يُسقط
     بيانات السجلات proflawyer.regs.v1 من كل نسخة احتياطية سابقًا). */
  function allDataKeys() {
    var out = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf("proflawyer.") === 0 && !EXCLUDE[k] && k.indexOf("proflawyer._") !== 0) {
        out.push(k);
      }
    }
    return out;
  }

  function payload() {
    var data = {};
    allDataKeys().forEach(function (k) { data[k] = read(k); });
    return JSON.stringify({
      app: "المحامي المحترف",
      version: 2,
      exportedAt: new Date().toISOString(),
      data: data
    }, null, 2);
  }

  function stamp() {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
           "-" + p(d.getHours()) + p(d.getMinutes());
  }

  function fmtDate(iso) {
    try {
      var d = new Date(iso);
      var p = function (n) { return String(n).padStart(2, "0"); };
      return d.getFullYear() + "/" + p(d.getMonth() + 1) + "/" + p(d.getDate()) +
             " " + p(d.getHours()) + ":" + p(d.getMinutes());
    } catch (e) { return iso || ""; }
  }

  function fmtSize(bytes) {
    if (bytes > 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " ميجابايت";
    return Math.max(1, Math.round(bytes / 1024)) + " كيلوبايت";
  }

  /* سجل نسخ حقيقي — كل نسخة فعلية تُضاف هنا (بديل النسخ الوهمية الثابتة سابقًا).
     الاحتفاظ بآخر ٢٠ نسخة فقط. */
  var HIST_KEY = "proflawyer.backupHistory.v1";
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HIST_KEY)) || []; }
    catch (e) { return []; }
  }
  function pushHistory(entry) {
    var h = loadHistory();
    h.unshift(entry);
    if (h.length > 20) h = h.slice(0, 20);
    try { localStorage.setItem(HIST_KEY, JSON.stringify(h)); } catch (e) { }
    renderHistory();
  }
  function removeHistoryAt(i) {
    var h = loadHistory();
    h.splice(i, 1);
    try { localStorage.setItem(HIST_KEY, JSON.stringify(h)); } catch (e) { }
    renderHistory();
  }
  function renderHistory() {
    var box = document.getElementById("backupHistory");
    if (!box) return;
    var h = loadHistory();
    if (!h.length) {
      box.innerHTML = "";
      var empty = document.createElement("div");
      empty.className = "note";
      empty.style.padding = "12px";
      empty.textContent = "لا توجد نسخ سابقة على هذا الجهاز بعد.";
      box.appendChild(empty);
      return;
    }
    box.innerHTML = "";
    h.forEach(function (e, i) {
      var row = document.createElement("div");
      row.className = "alert-item";
      row.style.display = "flex";
      row.style.alignItems = "flex-start";
      row.style.gap = "8px";
      var dot = document.createElement("span");
      dot.className = "dot blue";
      row.appendChild(dot);
      var txt = document.createElement("div");
      txt.className = "txt";
      txt.style.flex = "1";
      var strong = document.createElement("strong");
      strong.textContent = "نسخة " + fmtDate(e.date) + " — " + fmtSize(e.size);
      txt.appendChild(strong);
      var when = document.createElement("div");
      when.className = "when";
      /* الملف يُستبدَل بكل نسخة جديدة — فقط أحدث سطر هنا يطابق الملف
         الموجود فعلياً على الجهاز الآن؛ الأقدم سجلٌّ تاريخي فقط. */
      when.textContent = i === 0
        ? (e.dest === "device" ? "ذاكرة الجهاز" : "مشاركة") +
          " · هذه هي النسخة الحالية على الجهاز — استعدّها من قسم «الاستعادة»."
        : "نسخة سابقة — حلّت محلها نسخة أحدث بنفس الاسم.";
      txt.appendChild(when);
      row.appendChild(txt);

      var del = document.createElement("button");
      del.type = "button";
      del.setAttribute("data-nosave", "1");
      del.textContent = "×";
      del.title = "حذف هذا السطر من السجل";
      del.style.cssText =
        "flex:0 0 auto;width:32px;height:32px;border:0;border-radius:8px;" +
        "background:transparent;color:#b3261e;font-size:20px;line-height:1;" +
        "font-family:inherit";
      del.onclick = function () { removeHistoryAt(i); };
      row.appendChild(del);

      box.appendChild(row);
    });
  }
  renderHistory();

  window.__backupWired = 1;

  doBackup.onclick = function () {
    var now = new Date().toISOString();
    try { localStorage.setItem("proflawyer.lastBackup", now); } catch (e) { }
    /* اسمٌ ثابت — كل نسخة جديدة تستبدل السابقة بدل تراكم ملفات بلا نهاية.
       التاريخ والحجم يبقيان في سجل النسخ هنا داخل التطبيق للمراجعة. */
    var name = "نسخة-المحامي-المحترف.json";
    var text = payload();
    pushHistory({ name: name, date: now, size: text.length, dest: "device" });

    /* على أندرويد: يستبدل نفس الملف + يحدّث «آخر نسخة» عبر الجسر */
    if (typeof AndroidSaver !== "undefined" && AndroidSaver.backup) {
      var bytes = new TextEncoder().encode(text), bin = "";
      for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      AndroidSaver.backup(name, btoa(bin), false);
      return;
    }
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    a.download = name;
    a.click();
  };

  if (pickBtn && fileInp) {
    pickBtn.onclick = function () { fileInp.click(); };

    fileInp.onchange = function () {
      var f = fileInp.files && fileInp.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        var raw;
        try { raw = JSON.parse(String(rd.result)); }
        catch (e) { alert("الملف ليس JSON صالحاً."); return; }

        /* نسخة v2 (ديناميكية، تشمل كل proflawyer.*) أو v1 القديمة (حقول مسمّاة) */
        var data = raw.data || null;
        var legacy = !data && (raw.screens || raw.manual || raw.agendaCases);
        if (!data && !legacy) {
          alert("هذا ليس نسخة من هذا التطبيق." +
                "\nلاستيراد ملف التقويم استخدم شاشة «استيراد واستعادة».");
          return;
        }
        if (legacy) {
          data = {
            "proflawyer.screens.v1": raw.screens,
            "proflawyer.manual.v1": raw.manual,
            "proflawyer.appointments.v1": raw.appointments,
            "proflawyer.agenda.cases.v1": raw.agendaCases,
            "proflawyer.agenda.clients.v1": raw.agendaClients,
            "proflawyer.team.v1": raw.team
          };
        }

        var n = 0;
        var screensObj = data["proflawyer.screens.v1"] || {};
        Object.keys(screensObj).forEach(function (k) { n += (screensObj[k] || []).length; });
        var cases = (data["proflawyer.agenda.cases.v1"] || []).length;
        var regsObj = data["proflawyer.regs.v1"] || {};
        var regs = 0;
        Object.keys(regsObj).forEach(function (k) {
          if (Array.isArray(regsObj[k])) regs += regsObj[k].length;
        });

        Ask.confirm("استعادة النسخة الاحتياطية؟", {
          detail: "تحتوي " + n + " سجلاً و" + cases + " قضية و" + regs + " قيد سجلات." +
                  String.fromCharCode(10) +
                  "سيحلّ محتواها محل كل المحفوظ في التطبيق الآن — لا يُدمَج مع الحالي." +
                  String.fromCharCode(10) +
                  "يُفضَّل أخذ نسخة احتياطية من الحالي أولاً قبل المتابعة.",
          ok: "استعادة"
        }, function () {
        try {
          Object.keys(data).forEach(function (k) {
            if (data[k] == null) return;
            /* النصوص الخام (كالثيم) تُكتب كما هي؛ الكائنات/المصفوفات تُسلسَل. */
            localStorage.setItem(k,
              typeof data[k] === "string" ? data[k] : JSON.stringify(data[k]));
          });
        } catch (e) {
          alert("تعذّرت الاستعادة — المساحة ممتلئة.");
          return;
        }
        alert("تمت الاستعادة.");
        location.href = "88-records.html";
        });
      };
      rd.readAsText(f, "utf-8");
    };
  }
})();
