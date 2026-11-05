/* =============================================================================
   تصحيحات لمرة واحدة على البيانات المحفوظة.

   تعديل ملف البذور لا يكفي: النسخة المثبَّتة على الهاتف زرعت بياناتها مرة
   واحدة وحفظتها في localStorage، فلا تُقرأ البذور ثانيةً. هنا تُصحَّح
   البيانات الموجودة فعلاً، ويُسجَّل علَم حتى لا يتكرر التصحيح.

   كل تصحيح له مفتاحه ورقمه — فإضافة تصحيح جديد لا تعيد تنفيذ ما سبقه.
   ============================================================================= */
(function (w) {
  "use strict";

  var CKEY = "proflawyer.agenda.clients.v1";
  var FLAG = "proflawyer.fixups.v1";

  function done() {
    try { return JSON.parse(localStorage.getItem(FLAG)) || {}; }
    catch (e) { return {}; }
  }
  function mark(id) {
    var d = done();
    d[id] = 1;
    try { localStorage.setItem(FLAG, JSON.stringify(d)); } catch (e) { }
  }

  function clients() {
    try { return JSON.parse(localStorage.getItem(CKEY)) || []; } catch (e) { return []; }
  }
  function saveClients(list) {
    try { localStorage.setItem(CKEY, JSON.stringify(list)); return true; }
    catch (e) { return false; }
  }

  /* ------------------------------------------------------------------------
     poa-year-1138-1139
     توكيلا الملفين ١١٣٨ و١١٣٩ سُجّلا سنة ٢٠٢٧ و٢٠٢٨، وهما موثَّقان في اليوم
     نفسه (١٩ فبراير ٢٠٢٦) بأرقام متتالية من المكتب نفسه — فالسنة ٢٠٢٦.
     راجعها صاحب المكتب وأكّد التصحيح.
  */
  var YEAR_FIX = { "803": "2026", "804": "2026" };

  function fixYears() {
    var list = clients(), n = 0;

    function fix(rec) {
      if (["1138", "1139"].indexOf(String(rec.officeNo || "")) < 0) return;
      var want = YEAR_FIX[String(rec.poaNo || "")];
      if (!want || String(rec.poaYear) === want) return;
      rec.poaYear = want;
      n++;
    }

    list.forEach(function (c) {
      fix(c);
      (c.poas || []).forEach(fix);
    });

    if (n && saveClients(list)) return n;
    return 0;
  }


  /* ------------------------------------------------------------------------
     restore-poa-office-4
     توكيل الملف رقم ٤ حُذف أثناء اختبار زر الحذف على الجهاز — ضغطة خاطئة
     على «موافق» في نافذة التأكيد. يُعاد من ملف التوكيلات الأصلي.
  */
  function restorePoa4() {
    var list = clients();
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (String(c.officeNo || '') !== '4') continue;
      if ((c.poas || []).length) return 0;          /* موجود — لا نلمسه */

      var p = {
        officeNo: '4', poaNo: '71', poaLetter: 'س', poaYear: '1996',
        poaType: 'عام', notary: 'المطرية', poaDate: '06 يناير 1996',
        agent: 'حسن عبد المنعم', role: '',
        poaStatus: 'ساري', poaReason: '', poaNote: '', sharedWith: 0
      };
      c.poas = [p];
      Object.keys(p).forEach(function (k) { c[k] = p[k]; });
      return saveClients(list) ? 1 : 0;
    }
    return 0;
  }

  var FIXES = [
    { id: "poa-year-1138-1139", run: fixYears },
    { id: "restore-poa-office-4", run: restorePoa4 }
  ];

  function apply() {
    var d = done();
    FIXES.forEach(function (f) {
      if (d[f.id]) return;
      try { f.run(); } catch (e) { return; }
      mark(f.id);
    });
  }

  w.Fixups = { apply: apply, done: done };
  apply();
})(window);
