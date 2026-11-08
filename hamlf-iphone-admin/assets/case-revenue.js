/* =============================================================================
   أتعاب القضايا ومصروفاتها (31-case-revenue.html) — دمج شاشتَي «أتعاب وإيرادات
   القضايا» و«رسوم ومصروفات القضايا» في شاشة واحدة.

   كل قضية لها أتعابها ورسومها ومصروفاتها المستقلة: تُختار القضية من ملفات
   المكتب (CaseFile)، ويُحفظ اتفاق الأتعاب على سجل القضية نفسه (patchCase)،
   وتُقيَّد الدفعات والمصروفات في دفتر المصروفات العام (Expenses) مصفّاةً على
   رقم الملف — فالبيان الذي يُدخَل من هنا يظهر في ملف القضية، والبيان الذي
   يُدخَل من ملف القضية (case-file.js → feesSection) يظهر هنا، بلا ازدواج.
   ============================================================================= */
(function (w, d) {
  "use strict";

  function ready(fn) {
    if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  ready(function () {
    if (!w.CaseFile || !w.Expenses) return;

    var q = {};
    (location.search || "").replace(/^\?/, "").split("&").forEach(function (p) {
      if (!p) return;
      var kv = p.split("=");
      q[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || "");
    });

    var selFile   = document.getElementById("feeFile");
    var elClient  = document.getElementById("feeClient");
    var elSubject = document.getElementById("feeSubject");
    var elLevel   = document.getElementById("feeCourtLevel");
    var noFileMsg = document.getElementById("noFileMsg");
    var feeArea   = document.getElementById("feeArea");
    var openBtn   = document.getElementById("openCaseBtn");

    var feeKindSel  = document.getElementById("feeKind");
    var feeStartWrap = document.getElementById("feeStartWrap");
    var feePctWrap   = document.getElementById("feePctWrap");
    var feeStart = document.getElementById("feeStart");
    var feePct   = document.getElementById("feePct");
    var feeCustodyEl = document.getElementById("feeCustody");
    var feeRemainEl  = document.getElementById("feeRemain");
    var dueDate  = document.getElementById("dueDate");
    var feeNotes = document.getElementById("feeNotes");
    var saveBtn  = document.getElementById("saveFeeAgreement");

    var movesList = document.getElementById("movesList");
    var addPaymentBtn = document.getElementById("addPaymentBtn");
    var addExpenseBtn = document.getElementById("addExpenseBtn");
    var feeOnClientEl = document.getElementById("feeOnClient");
    var printBtn = document.getElementById("printMovesBtn");

    var la = w.CaseFile.norm ? function (t) {
      return String(t == null ? "" : t).replace(/[٠-٩]/g, function (ch) { return ch.charCodeAt(0) - 0x0660; });
    } : String;

    var cases = w.CaseFile.all().filter(function (c) { return String(c.fileNo || "").trim(); });

    function label(c) {
      var no = w.CaseFile.ar(c.fileNo || "");
      var cli = (w.CaseFile.clientsWithOffice(c)[0] || {}).name || "";
      return no + (cli ? " — " + cli : "") + (c.subject ? " — " + c.subject : "");
    }

    cases.sort(function (a, b) { return String(a.fileNo).localeCompare(String(b.fileNo), "ar"); });
    cases.forEach(function (c) {
      var op = document.createElement("option");
      op.value = c.id;
      op.textContent = label(c);
      selFile.appendChild(op);
    });

    function currentCase() {
      var id = selFile.value;
      if (!id) return null;
      return w.CaseFile.all().filter(function (x) { return x.id === id; })[0] || null;
    }

    function refresh() {
      var c = currentCase();
      if (!c) {
        noFileMsg.hidden = false;
        feeArea.hidden = true;
        return;
      }
      noFileMsg.hidden = true;
      feeArea.hidden = false;

      elClient.value  = (w.CaseFile.clientsWithOffice(c)[0] || {}).name || "";
      elSubject.value = c.subject || "";
      elLevel.value   = c.courtLevel || "";

      feeKindSel.value = c.feeKind === "نسبة" ? "نسبة" : "قيمة";
      feeStartWrap.hidden = feeKindSel.value === "نسبة";
      feePctWrap.hidden   = feeKindSel.value !== "نسبة";
      feeStart.value = c.feeStart || "";
      feePct.value   = c.feePct || "";
      dueDate.value  = c.feeDueDate || "";
      feeNotes.value = c.feeNotes || "";

      var fileNo = String(c.fileNo || "").trim();
      var moves = w.Expenses.all().filter(function (r) {
        return la(r.fileNo).trim() === la(fileNo).trim();
      }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });

      var custody = 0, spent = 0, onClient = 0;
      moves.forEach(function (r) {
        var v = w.Expenses.money(r.amount);
        if (r.kind === "عهدة مستلمة") { custody += v; return; }
        spent += v;
        if (r.charge !== "على المكتب") onClient += v;
      });

      feeCustodyEl.textContent = w.Expenses.fmt(custody);
      var remain = feeKindSel.value === "نسبة" ? 0 : (w.Expenses.money(feeStart.value) - custody);
      feeRemainEl.textContent = w.Expenses.fmt(remain);
      feeOnClientEl.textContent = w.Expenses.fmt(onClient);

      movesList.textContent = "";
      if (!moves.length) {
        var empty = document.createElement("div");
        empty.className = "note";
        empty.textContent = "لا حركات مسجَّلة على هذا الملف بعد.";
        movesList.appendChild(empty);
      }
      moves.forEach(function (r) {
        var isIn = r.kind === "عهدة مستلمة";
        var line = document.createElement("div");
        line.style.cssText = "display:flex;gap:8px;align-items:center;border:1px solid var(--line,#eee);" +
          "border-radius:9px;padding:8px 10px;margin-bottom:6px;font-size:13px;cursor:pointer";
        var amt = document.createElement("span");
        amt.style.cssText = "flex:0 0 auto;font-family:var(--f-title);color:" +
          (isIn ? "#1f7a4d" : "#b3261e");
        amt.textContent = (isIn ? "+ " : "− ") + w.Expenses.fmt(w.Expenses.money(r.amount));
        var mid = document.createElement("span");
        mid.style.cssText = "flex:1;color:var(--muted);word-break:break-word";
        mid.textContent = (r.item || r.kind || "") +
          (r.date ? " · " + w.CaseFile.ar(String(r.date).replace(/-/g, "/")) : "") +
          (r.charge ? " · " + r.charge : "");
        var del = document.createElement("button");
        del.type = "button";
        del.className = "icon-btn";
        del.textContent = "✕";
        del.title = "حذف";
        line.appendChild(amt); line.appendChild(mid); line.appendChild(del);
        line.onclick = function (e) {
          if (e.target === del) return;
          w.Expenses.edit(r.id, refresh);
        };
        del.onclick = function () { w.Expenses.remove(r.id, refresh); };
        movesList.appendChild(line);
      });

      w.__lastMoves = moves;
    }

    selFile.onchange = refresh;

    if (q.fileNo) {
      var hit = cases.filter(function (c) {
        return la(c.fileNo).trim() === la(q.fileNo).trim();
      })[0];
      if (hit) selFile.value = hit.id;
    }
    refresh();

    feeKindSel.onchange = function () {
      feeStartWrap.hidden = feeKindSel.value === "نسبة";
      feePctWrap.hidden   = feeKindSel.value !== "نسبة";
    };

    openBtn.onclick = function () {
      var c = currentCase();
      if (!c) { alert("اختر الملف أولاً."); return; }
      w.CaseFile.openCase(c.id, refresh);
    };

    saveBtn.onclick = function () {
      var c = currentCase();
      if (!c) { alert("اختر الملف أولاً."); return; }
      w.CaseFile.patchCase(c.id, function (cc) {
        cc.feeKind = feeKindSel.value;
        cc.feeStart = feeStart.value;
        cc.feePct = feePct.value;
        cc.feeDueDate = dueDate.value;
        cc.feeNotes = feeNotes.value;
      });
      refresh();
      if (w.Ask && Ask.toast) Ask.toast("تم حفظ اتفاق الأتعاب.");
      else alert("تم حفظ اتفاق الأتعاب.");
    };

    function addMove(kind) {
      var c = currentCase();
      if (!c) { alert("اختر الملف أولاً."); return; }
      var client = (w.CaseFile.clientsWithOffice(c)[0] || {}).name || "";
      w.Expenses.edit({
        scope: "مصروفات قضية",
        fileNo: String(c.fileNo || "").trim(),
        client: client,
        kind: kind
      }, refresh);
    }
    addPaymentBtn.onclick = function () { addMove("عهدة مستلمة"); };
    addExpenseBtn.onclick = function () { addMove("مصروف"); };

    printBtn.onclick = function () {
      var c = currentCase();
      if (!c) { alert("اختر الملف أولاً."); return; }
      var custody = 0, spent = 0;
      (w.__lastMoves || []).forEach(function (r) {
        var v = w.Expenses.money(r.amount);
        if (r.kind === "عهدة مستلمة") custody += v; else spent += v;
      });
      w.Expenses.print(w.__lastMoves || [], { custody: custody, spent: spent, balance: custody - spent });
    };
  });
})(window, document);
