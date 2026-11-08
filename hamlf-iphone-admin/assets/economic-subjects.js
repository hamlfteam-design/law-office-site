/* assets/economic-subjects.js
   يملأ «موضوع الدعوى» بقيم البوابة عند اختيار نوع دعوى اقتصادي.
   منفصل عن app.js عمداً — لا يعدّل سلوك ق-١، بل يقترح فقط.
   الحقل يظل نصياً حراً؛ ما يضيفه المكتب لا يحمل sourceId ولا يُرفع إلكترونياً. */
(function () {
  "use strict";
  var D = (window.COURT_DATA && window.COURT_DATA.economic) || null;
  if (!D) return;

  var typeSel = document.getElementById("caseType");
  var subIn   = document.getElementById("subject");
  var dl      = document.getElementById("dlSubjects");
  if (!typeSel || !subIn || !dl) return;

  var baseOpts = Array.prototype.map.call(dl.options, function (o) { return o.value; });
  var hint = document.createElement("div");
  hint.className = "note";
  subIn.parentNode.appendChild(hint);

  /* مطابقة متسامحة: بيانات المحاكم تحتوي مسافات غير قابلة للكسر ومسافات مكررة،
     والمستخدم قد يكتب مسافة زائدة. الاعتماد على === وحده يُفشل المطابقة بصمت. */
  function norm(s) {
    return String(s || "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
  }

  function currentSubject() {
    var list = D.subjectsByType[typeSel.value] || [];
    var v = norm(subIn.value);
    for (var i = 0; i < list.length; i++) if (norm(list[i].name) === v) return list[i];
    return null;
  }

  function paint() {
    var list = D.subjectsByType[typeSel.value];
    dl.innerHTML = "";

    if (!list) {                                  // نوع غير اقتصادي — سلوك ق-١ كما هو
      baseOpts.forEach(function (v) { dl.appendChild(new Option(v, v)); });
      hint.innerHTML = "";
      return;
    }

    list.forEach(function (s) {
      var o = new Option(s.name, s.name);
      o.label = s.name + (s.forum ? "  —  " + s.forum : "");
      dl.appendChild(o);
    });

    var meta = D.typeMeta[typeSel.value] || {};
    var parts = ["<strong>" + list.length + "</strong> موضوعاً من البوابة"];
    if (meta.singleJudge) parts.push("جهة النظر: " + (meta.forum || "تتحدد من الموضوع"));

    var s = currentSubject();
    if (s) {
      var vals = D.valuation[s.valuationCode];
      if (vals) parts.push("تقدير القيمة: <strong>" + vals.join(" أو ") + "</strong>");
      if (s.forum) parts.push("أمام: <strong>" + s.forum + "</strong>");
      parts.push('<span class="badge auto">قابل للرفع الإلكتروني</span>');
    } else if (subIn.value) {
      parts.push('<span class="badge">قيمة المكتب — غير قابلة للرفع الإلكتروني</span>');
    }
    hint.innerHTML = parts.join(" · ");
  }

  typeSel.addEventListener("change", function () { paint(); });
  subIn.addEventListener("input", paint);
  subIn.addEventListener("change", paint);
  paint();
})();
