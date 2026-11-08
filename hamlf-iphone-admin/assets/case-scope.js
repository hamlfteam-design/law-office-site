/* =============================================================================
   قضايا المحامي — نسخة المحامين فقط (بيتحمّل بعد identity-gate.js في كل شاشة).

   مدير المكتب بيختار من «المحامون والصلاحيات»: المحامين يشوفوا «كل القضايا»
   (الافتراضي) أو «قضاياهم بس». قضايا المحامي = اللي اسمه في خانة «المحامي»
   أو عليه تكليف فيها. الإعداد واسم المحامين بيوصلوا من مستند المكتب على السحابة
   (team.js بيحفظهم في proflawyer.cloudrole.v1).

   التنفيذ مركزي: قراية مخزن القضايا بترجع قضايا المحامي بس، والكتابة بترجّع
   القضايا المخفية زي ما هي — فتعديل المحامي في قضيته ما يمسحش باقي القضايا
   من جهازه. ده إخفاء في الشاشات، مش حماية على السحابة.
   ============================================================================= */
(function () {
  "use strict";
  var KEY = "proflawyer.agenda.cases.v1";
  var S = window.localStorage;
  if (!S) return;
  var rawGet = Storage.prototype.getItem, rawSet = Storage.prototype.setItem;
  function get(k) { try { return rawGet.call(S, k); } catch (e) { return null; } }

  var sess = null, rc = null;
  try { sess = JSON.parse(get("proflawyer.session.v1")); } catch (e) { }
  try { rc = JSON.parse(get("proflawyer.cloudrole.v1")); } catch (e) { }
  if (!sess || !sess.uid || !rc || rc.uid !== sess.uid) return;
  if (!rc.role || rc.role === "owner") return;
  var office = rc.office || {};
  if (office.lawyerScope !== "mine") return;

  function norm(s) {
    return String(s || "").replace(/[ًٌٍَُِّْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
      .replace(/عبد\s+/g, "عبد").replace(/\s+/g, " ").trim();
  }
  var myEmail = String(sess.email || rc.email || "").toLowerCase();
  var myNames = [], myIds = {};
  (office.team || []).forEach(function (u) {
    if (u && u.email && String(u.email).toLowerCase() === myEmail) {
      if (u.id) myIds[u.id] = 1;
      if (u.name) myNames.push(norm(u.name));
    }
  });
  if (rc.name && rc.name.indexOf("@") < 0) myNames.push(norm(rc.name));
  myNames = myNames.filter(function (n) { return n && n.split(" ").length >= 2; });

  function mine(c) {
    var law = norm(c && c.lawyer);
    if (law && myNames.some(function (n) { return law.indexOf(n) >= 0 || n.indexOf(law) >= 0 && law.split(" ").length >= 2; })) return true;
    return (c && c.adminTasks || []).some(function (t) {
      return (t.assignees || []).some(function (a) {
        var id = typeof a === "string" ? a : (a && (a.id || a.uid));
        var em = a && typeof a === "object" && a.email ? String(a.email).toLowerCase() : "";
        var nm = a && typeof a === "object" && a.name ? norm(a.name) : (typeof a === "string" ? norm(a) : "");
        return (id && myIds[id]) || (em && em === myEmail) || (nm && myNames.indexOf(nm) >= 0);
      });
    });
  }

  var lastRaw = null, lastView = null, hidden = [], hiddenIds = {};
  function view(raw) {
    if (raw === lastRaw) return lastView;
    var all;
    try { all = JSON.parse(raw); } catch (e) { return raw; }
    if (!Array.isArray(all)) return raw;
    var vis = [], hid = [], ids = {};
    all.forEach(function (c) { if (mine(c)) vis.push(c); else { hid.push(c); if (c && c.id) ids[c.id] = 1; } });
    hidden = hid; hiddenIds = ids; lastRaw = raw; lastView = JSON.stringify(vis);
    return lastView;
  }

  /* أمان السحابة: مزامنة القضايا (case-file.js) بتمسح من السحابة أي قضية مش
     موجودة في القايمة اللي اتحفظت — والمحامي شايف قايمة متفلترة، فمن غير ده
     كانت قضايا المكتب المخفية عنه هتتمسح من السحابة أول ما يعدّل قضية. */
  function guard(cs) {
    if (!cs || !cs.collection || cs.collection.__scoped) return;
    var rm = cs.collection.remove;
    cs.collection.remove = function (col, id) {
      if (col === "cases" && hiddenIds[id]) {
        var cb = arguments[arguments.length - 1];
        if (typeof cb === "function") { try { cb(); } catch (e) { } }
        return;
      }
      return rm.apply(this, arguments);
    };
    cs.collection.__scoped = true;
  }
  var _cs = window.CloudStore;
  try {
    Object.defineProperty(window, "CloudStore", {
      configurable: true,
      get: function () { return _cs; },
      set: function (v) { _cs = v; guard(v); }
    });
  } catch (e) { }
  guard(_cs);
  Storage.prototype.getItem = function (k) {
    var v = rawGet.call(this, k);
    if (this === S && k === KEY && v) return view(v);
    return v;
  };
  Storage.prototype.setItem = function (k, val) {
    if (this === S && k === KEY && hidden.length) {
      try {
        var list = JSON.parse(val), have = {};
        if (Array.isArray(list)) {
          list.forEach(function (c) { if (c && c.id) have[c.id] = 1; });
          hidden.forEach(function (c) { if (c && c.id && !have[c.id]) list.push(c); });
          val = JSON.stringify(list);
        }
      } catch (e) { }
    }
    return rawSet.call(this, k, val);
  };
  window.CaseScope = { active: true, mine: mine };
})();
