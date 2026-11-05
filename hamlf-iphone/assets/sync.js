/* =============================================================================
   §6 مزامنة الأجهزة — يدوية آمنة عبر ملف JSON واحد.

   التطبيق أوفلاين بلا سيرفر، فالمزامنة تتم بملفٍ واحد يُصدَّر من جهاز ويُستورد
   في الآخر (عبر مجلد مشترك أو نقل على نفس الواي فاي). الاستيراد نوعان:

     • دمج آمن (المُوصى به): يضيف الجديد فقط — لا يحذف ولا يستبدل أي سجل محليّ،
       فالإضافة والتعديل من الجهازين تتراكم بلا فقدان بيانات.
     • استبدال كامل: يحلّ محتوى الملف محل كل المحفوظ (يأخذ نسخة أمان أولاً).

   يُصدِّر كل مفاتيح proflawyer.* (بما فيها السجلات التي كانت النسخة القديمة
   تُغفلها) في ملفٍ واحد.
   ============================================================================= */
(function (w) {
  "use strict";

  function allKeys() {
    var out = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf("proflawyer.") === 0 &&
          k !== "proflawyer.sync.safetyBackup") out.push(k);
    }
    return out;
  }

  function exportAll() {
    var store = {};
    allKeys().forEach(function (k) { store[k] = localStorage.getItem(k); });
    return JSON.stringify({
      app: "المحامي المحترف", kind: "sync", version: 2,
      exportedAt: new Date().toISOString(), store: store
    }, null, 2);
  }

  function idOf(o) {
    return (o && (o.id != null || o._id != null)) ? String(o.id != null ? o.id : o._id) : null;
  }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  /* اتحادٌ لا يفقد ولا يكرّر: يضيف من الوارد ما لا يوجد مُعرِّفه محلياً، ومن
     عديم المُعرِّف ما ليس نسخةً طبق الأصل. السجل الموجود مُعرِّفه يبقى كما هو. */
  function unionArray(L, I) {
    var out = L.slice(), seen = {};
    L.forEach(function (o) { var id = idOf(o); if (id) seen[id] = 1; });
    I.forEach(function (o) {
      var id = idOf(o);
      if (id) { if (!seen[id]) { out.push(o); seen[id] = 1; } }
      else if (!out.some(function (x) { return same(x, o); })) out.push(o);
    });
    return out;
  }

  /* دمجٌ لا يفقد شيئاً: يضيف الجديد فقط، ولا يستبدل ولا يحذف أي سجل محليّ. */
  function mergeValue(localStr, incomingStr) {
    var L, I;
    try { I = JSON.parse(incomingStr); } catch (e) { return localStr; }
    if (localStr == null) return incomingStr;
    try { L = JSON.parse(localStr); } catch (e) { return incomingStr; }

    if (Array.isArray(L) && Array.isArray(I)) {
      return JSON.stringify(unionArray(L, I));
    }
    if (L && I && typeof L === "object" && typeof I === "object") {
      var m = {};
      Object.keys(L).forEach(function (k) { m[k] = L[k]; });
      Object.keys(I).forEach(function (k) {
        if (!(k in m)) m[k] = I[k];
        else if (Array.isArray(m[k]) && Array.isArray(I[k])) m[k] = unionArray(m[k], I[k]);
        /* غير ذلك: نُبقي المحليّ فلا نفقد تعديلاً */
      });
      return JSON.stringify(m);
    }
    return localStr; /* قيمة مفردة: نُبقي المحليّ */
  }

  /* دعم الملفات القديمة ذات المفاتيح المسطّحة */
  function toStore(raw) {
    if (raw.store) return raw.store;
    /* صيغة النسخة الاحتياطية الكاملة (data): القيم متحلّلة → رجّعها نصوص */
    if (raw.data && typeof raw.data === "object") {
      var st = {};
      Object.keys(raw.data).forEach(function (k) {
        if (k.indexOf("proflawyer.") !== 0 || raw.data[k] == null) return;
        st[k] = typeof raw.data[k] === "string" ? raw.data[k] : JSON.stringify(raw.data[k]);
      });
      return st;
    }
    var map = {
      screens: "proflawyer.screens.v1", manual: "proflawyer.manual.v1",
      appointments: "proflawyer.appointments.v1", agendaCases: "proflawyer.agenda.cases.v1",
      agendaClients: "proflawyer.agenda.clients.v1", team: "proflawyer.team.v1"
    };
    var s = {};
    Object.keys(map).forEach(function (k) {
      if (raw[k]) s[map[k]] = JSON.stringify(raw[k]);
    });
    return s;
  }

  function importText(text, mode) {
    var raw;
    try { raw = JSON.parse(text); } catch (e) { return { ok: false, msg: "الملف ليس JSON صالحاً." }; }
    var store = toStore(raw);
    var keys = Object.keys(store);
    if (!keys.length) return { ok: false, msg: "لا توجد بيانات لهذا التطبيق في الملف." };

    /* نسخة أمان قبل أي تغيير */
    try { localStorage.setItem("proflawyer.sync.safetyBackup", exportAll()); } catch (e) { }

    var changed = 0;
    keys.forEach(function (k) {
      try {
        if (mode === "replace") { localStorage.setItem(k, store[k]); changed++; }
        else {
          var merged = mergeValue(localStorage.getItem(k), store[k]);
          if (merged !== localStorage.getItem(k)) { localStorage.setItem(k, merged); changed++; }
        }
      } catch (e) { }
    });
    return { ok: true, keys: keys.length, changed: changed };
  }

  /* عدد السجلات في الملف — للعرض قبل التأكيد */
  function countRecords(text) {
    var raw; try { raw = JSON.parse(text); } catch (e) { return null; }
    var store = toStore(raw), n = 0;
    Object.keys(store).forEach(function (k) {
      try {
        var v = JSON.parse(store[k]);
        if (Array.isArray(v)) n += v.length;
        else if (v && typeof v === "object") {
          Object.keys(v).forEach(function (x) {
            if (Array.isArray(v[x])) n += v[x].length; else n += 1;
          });
        }
      } catch (e) { }
    });
    return n;
  }

  function saveFile(name, text) {
    if (typeof AndroidSaver !== "undefined" && AndroidSaver.backup) {
      var bytes = new TextEncoder().encode(text), bin = "";
      for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      AndroidSaver.backup(name, btoa(bin), false);
      return true;
    }
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    a.download = name; a.click();
    return true;
  }

  w.Sync = {
    exportAll: exportAll, importText: importText, countRecords: countRecords,
    saveFile: saveFile
  };
})(window);
