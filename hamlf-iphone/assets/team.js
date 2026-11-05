/* =============================================================================
   المحامي المحترف — المحامون والصلاحيات والتكليفات  (نموذج)

   قائمة المحامين بتتزامن بين أجهزة المدير عن طريق records/team (انظر pullTeam).
      الصلاحيات هنا تُخفي
      الشاشات فقط — وليست حماية أمنية. التنفيذ الفعلي مكانه تطبيق Flutter
      المتصل بالسيرفر.
   ============================================================================= */
(function (w) {
  "use strict";

  var KEY    = "proflawyer.team.v1";
  var META   = "proflawyer.recmeta.v1";   // من يملك كل سجل وفي أي نطاق
  var SCREEN = (location.pathname.split("/").pop() || "index").replace(/\.html.*$/, "");

  /* ---------------------------------------------------------- الأقسام والأدوار */

  var SECTIONS = {
    cases:       "القضايا",
    finance:     "الإدارة المالية",
    hr:          "شئون الموظفين",
    secretariat: "السكرتارية",
    reports:     "التقارير",
    clients:     "الموكلون",
    team:        "المحامون والصلاحيات"
  };

  /* أي شاشة تتبع أي قسم — الشاشات غير المذكورة متاحة للجميع */
  var SCREEN_SECTION = {
    "01-cases": "cases", "02-admin-works": "cases", "03-execution": "cases",
    "04-bailiff-papers": "cases", "05-powers-of-attorney": "cases",
    "20-cases-hub": "cases", "92-court-data": "cases",
    "90-proposal-case-types": "cases", "91-economic-seed-result": "cases",

    "30-finance-hub": "finance", "31-case-revenue": "finance",
    "32-case-expenses": "finance", "33-office-expenses": "finance",

    "40-hr-hub": "hr", "41-contract": "hr", "42-wage": "hr", "43-payroll": "hr",
    "44-evaluation": "hr", "45-residency": "hr", "46-work-permit": "hr",
    "47-visa": "hr", "48-end-service": "hr", "49-staff": "hr",

    "50-secretariat": "secretariat",

    "60-reports-hub": "reports", "61-report-builder": "reports",
    "62-report-print": "reports",

    "70-clients-hub": "clients", "71-client-profile": "clients", "89-clients": "clients",

    "97-client-accounts": "finance",

    /* أدوات الإدارة: المدير بس */
    "80-team": "team", "79-assign-cases": "team", "86-import": "team", "09-backup": "team", "94-lists": "team",
    "98-connect": "team", "95-audit": "team", "97-pc-control": "team"
  };

  /* الشاشة تتبع أي مفتاح تعديل (PERMKEYS) — لو مستوى المستخدم عليه "view" تتحوّل الشاشة لوضع عرض فقط */
  var SCREEN_EDITKEY = {
    "01-cases": "cases", "90-case-file": "cases", "92-court-data": "cases",
    "02-admin-works": "admin", "03-execution": "execution", "04-bailiff-papers": "bailiff",
    "05-powers-of-attorney": "poa", "31-case-revenue": "fees", "33-office-expenses": "expenses"
  };

  /* مجموعات السحابة (records/{coll}) ← مفتاح الصلاحية. نفس خريطة firestore.rules (screenKey) —
     أي مجموعة غير مذكورة = للمدير فقط. */
  var COLLECTION_KEY = {
    "cases": "cases", "general-tasks": "cases", "clients": "clients", "expenses": "expenses",
    "01-cases": "cases", "20-cases-hub": "cases", "90-links": "cases", "92-court-data": "cases",
    "07-alerts": "cases", "83-experts": "cases", "84-forgery": "cases", "85-appointments": "cases",
    "02-admin-works": "admin", "03-execution": "execution", "04-bailiff-papers": "bailiff",
    "05-powers-of-attorney": "poa", "31-case-revenue": "fees", "32-case-expenses": "expenses",
    "33-office-expenses": "expenses", "50-secretariat": "secretariat", "71-client-profile": "clients",
    "60-reports-hub": "reports", "61-report-builder": "reports", "62-report-print": "reports",
    "30-finance-hub": "fees",
    "40-hr-hub": "hr", "41-contract": "hr", "42-wage": "hr", "44-evaluation": "hr", "45-residency": "hr",
    "46-work-permit": "hr", "47-visa": "hr", "48-end-service": "hr", "49-staff": "hr",
    "attendance-places": "payroll",
    /* بعد 1.41: طلبات تعديل القضايا من أجهزة الفريق (1.51) والسجلات وأوراق المحضرين (1.54) */
    "edits": "cases", "regs": "cases"
  };
  /* مجموعات يكتبها أي عضو (سجل التعديلات + الحضور + تسجيل الجهاز) — السيرفر يقيّدها بصاحب السجل.
     «shared» (القوائم والمحاكم) و«deleted» (علامات الحذف) و«team» للمدير بس (مش مذكورة = المدير). */
  var OPEN_COLLECTIONS = { "audit": 1, "attendance": 1, "attendance-stamps": 1, "devices": 1 };

  var DEFAULT_ROLES = {
    owner:      { name: "مدير المكتب", perms: Object.keys(SECTIONS) },
    lawyer:     { name: "محامٍ",        perms: ["cases", "clients", "reports"] },
    secretary:  { name: "سكرتارية",     perms: ["secretariat", "clients", "cases"] },
    accountant: { name: "محاسب",        perms: ["finance", "reports"] },
    /* عرض فقط لقضيته الشخصية — لا وصول لأي شاشة إدارية أو لبيانات موكلين آخرين.
       شاشة الرئيسية المبسّطة الخاصة بهذا الدور مرحلة لاحقة من المشروع. */
    client:     { name: "عميل (موكل)",  perms: [] }
  };

  /* §8 مفاتيح الصلاحيات لكل شاشة — لكلٍّ مستوى: none / view / edit */
  var PERMKEYS = {
    cases: "القضايا", fees: "الأتعاب", expenses: "المصروفات", bailiff: "أوراق المحضرين",
    poa: "التوكيلات", admin: "الأعمال الإدارية", execution: "تنفيذ الأحكام", reports: "التقارير",
    appeal: "مواعيد الطعن", lists: "إدارة القوائم", backup: "النسخ الاحتياطي", users: "إدارة المستخدمين",
    /* لوحة الحضور والتقرير الشهري والمرتبات والإعدادات. من غيرها الموظف بيشوف
       «تسجيل يومي» لنفسه بس (عشان يبعت موقعه) — كانت الصفحة مفتوحة للكل بالمرتبات. */
    payroll: "الحضور والرواتب"
  };
  function allLevel(v) { var o = {}; Object.keys(PERMKEYS).forEach(function (k) { o[k] = v; }); return o; }
  var ROLE_LEVELS = {
    owner: allLevel("edit"),
    lawyer: (function () { var o = allLevel("edit"); o.fees = "none"; o.users = "none"; o.payroll = "none"; o.backup = "none"; o.lists = "view"; return o; })(),
    secretary: { cases: "edit", bailiff: "edit", poa: "edit", admin: "view", appeal: "view",
      lists: "view", reports: "none", fees: "none", expenses: "none", execution: "none",
      backup: "none", users: "none", payroll: "none" },
    accountant: { fees: "edit", expenses: "edit", reports: "edit", cases: "view", poa: "view",
      bailiff: "none", admin: "none", execution: "none", appeal: "none", lists: "none",
      backup: "view", users: "none", payroll: "edit" },
    client: allLevel("none")
  };
  var LEVELS_OK = { none: 1, view: 1, edit: 1 };
  /* دور غير معروف (لا في ROLE_LEVELS ولا في T.roles) = "none" لكل المفاتيح. المدير وحده "edit". */
  function roleLevels(role) {
    var r = (T.roles && T.roles[role]) || {};
    var base = ROLE_LEVELS[role] || allLevel("none");
    var out = {}; Object.keys(PERMKEYS).forEach(function (k) {
      var v = (r.levels && r.levels[k]) || base[k] || "none";
      out[k] = LEVELS_OK[v] === 1 ? v : "none";
    });
    return out;
  }
  /** مستوى المستخدم الحالي لمفتاح شاشة. */
  function level(key) {
    var u = current(); if (!u || !u.role || u.role === "none") return "none";
    if (u.role === "owner") return "edit";
    if (u.role === "client") return "none";
    return roleLevels(u.role)[key] || "none";
  }
  function canView(key) { return level(key) !== "none"; }
  function canEdit(key) { return level(key) === "edit"; }
  function setRoleLevel(role, key, lv) {
    if (!T.roles[role]) T.roles[role] = { name: role };
    T.roles[role].levels = T.roles[role].levels || {};
    T.roles[role].levels[key] = lv;
    save(T);
  }

  /* ------------------------------------------------------------------ التخزين */

  function load() {
    var d;
    try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) { d = null; }
    if (!d || !d.users || !d.users.length) {
      d = {
        users: [{
          id: "u1", name: "مدير المكتب", email: "", phone: "",
          role: "owner", active: true
        }],
        roles: JSON.parse(JSON.stringify(DEFAULT_ROLES)),
        currentUserId: "u1",
        scope: "office",              // office | personal
        assignments: []
      };
      save(d);
    }
    if (!d.roles) d.roles = JSON.parse(JSON.stringify(DEFAULT_ROLES));
    /* أدوار أُضيفت لاحقاً للنظام (مثل "client") لا تصل تلقائياً للأجهزة
       اللي حفظت بياناتها قبل إضافتها — لأن السطر أعلاه لا يُستدعى إلا لو
       d.roles غائب بالكامل. بلا هذا، دور مفقود يُعامَل "دوراً تالفاً" في
       can()/roleLevels() فتُمنح صلاحيات كاملة افتراضياً (أمان مقصود ضد
       الحبس، لكنه خطِر هنا لأنه يمنح موكلاً/محامياً كل شيء بالخطأ). */
    var changed = false;
    Object.keys(DEFAULT_ROLES).forEach(function (key) {
      if (!d.roles[key]) { d.roles[key] = JSON.parse(JSON.stringify(DEFAULT_ROLES[key])); changed = true; }
    });
    if (changed) save(d);
    if (!d.assignments) d.assignments = [];
    return d;
  }

  function save(d) {
    try { localStorage.setItem(KEY, JSON.stringify(d)); }
    catch (e) { return false; }
    if (d === T && !_pulling) schedulePushTeam();
    return true;
  }
  var _pulling = false, _pushTimer = 0;
  function schedulePushTeam() {
    clearTimeout(_pushTimer);
    _pushTimer = setTimeout(function () { pushTeam(); }, 800);
  }

  var T = load();

  /* لو حُدِّد دور من Firestore (بعد تسجيل دخول حقيقي — انظر fetchCloudRole
     أسفل) فهو المرجع، ويتفوّق على أي مستخدم محلي بنفس الاسم/البريد. مستخدم
     تركيبي بسيط: id بادئته "cloud:" حتى لا يتصادم مع معرّفات محلية. */
  var _cloudUser = null;

  /* ----------------------------------------------- الدور المحفوظ من السحابة
     حادثة 2026-10: محامين على نسخة المحامين كانوا بيفتحوا المالية وشئون
     الموظفين والفريق بصلاحيات المدير. السبب إن أغلب الشاشات بتحمّل team.js
     من غير auth.js، فما كانتش بتعرف دور المحامي وبترجع للمستخدم المحلي
     الافتراضي «مدير المكتب». دلوقتي الدور اللي جه من السحابة بيتحفظ هنا،
     وكل شاشة بتقراه حتى لو مفيهاش اتصال. في نسخة المحامين (CLEAN) مفيش
     رجوع للمدير المحلي أبداً، ودور «owner» نفسه ما بيتقبلش (ده مكتب فاضي
     اتعمل للمحامي بالغلط، مش مكتب الفريق). */
  var ROLE_CACHE = "proflawyer.cloudrole.v1";
  var ROLES_PUSHED = "proflawyer.rolespushed.v1";
  var CLEAN = !!(w.HAMLF_CLEAN || (function () {
    try { return !!(w.AndroidUpdater && w.AndroidUpdater.isClean && w.AndroidUpdater.isClean()); }
    catch (e) { return false; }
  })());

  function session() {
    try { var s = JSON.parse(localStorage.getItem("proflawyer.session.v1")); return s && s.uid ? s : null; }
    catch (e) { return null; }
  }
  function roleCache() {
    try { return JSON.parse(localStorage.getItem(ROLE_CACHE)) || null; } catch (e) { return null; }
  }
  /** صلاحيات الأدوار زي ما حددها مدير المكتب (ماعدا المدير نفسه). */
  function applyCloudRoles(roles) {
    if (!roles || typeof roles !== "object") return;
    Object.keys(roles).forEach(function (k) {
      if (k === "owner" || !roles[k] || !Array.isArray(roles[k].perms)) return;
      T.roles[k] = roles[k];
    });
  }
  (function () {
    var s = session(), rc = roleCache();
    if (s && rc && rc.uid === s.uid) applyCloudRoles(rc.roles);
  })();
  /* هوية الحساب المسجّل — fail-closed: الدور يأتي من مستند العضو على السحابة (يتحفظ في ROLE_CACHE
     بعد أول مزامنة ناجحة). حساب مسجّل من غير دور مؤكَّد = "none" = ممنوع كل شيء. */
  function cachedUser() {
    var s = session();
    if (!s) return null;
    var rc = roleCache();
    var role = "none";
    if (rc && rc.uid === s.uid && typeof rc.role === "string" && rc.role) {
      role = (CLEAN && rc.role === "owner") ? "none" : rc.role;
    }
    /* حادثة 2026-10-05: محامين اتبعتلهم نسخة المكتب (مش نسخة المحامين) فتحت لهم بصلاحيات المدير،
       لأن نسخة المكتب كانت بترجع للمستخدم المحلي الافتراضي «مدير المكتب». دلوقتي في أي نسخة:
       طول ما فيه حساب مسجّل دخول ودوره على السحابة لسه مش معروف ← من غير صلاحيات، مش مدير. */
    return { id: "cloud:" + s.uid, name: (rc && rc.uid === s.uid && rc.name) || s.email || "", email: s.email || "", role: role };
  }

  /* من غير أي حساب مسجّل (جهاز المكتب أو نسخة الكمبيوتر أوفلاين) نسخة المكتب بترجع للمستخدم
     المحلي — مفيش اتصال بالسحابة أصلاً، والسيرفر (firestore.rules) هو اللي بيحمي بيانات الفريق.
     نسخة المحامين (CLEAN) من غير حساب = من غير صلاحيات. */
  function current() {
    if (_cloudUser) return _cloudUser;
    var cu = cachedUser();
    if (cu) return cu;
    if (CLEAN) return { id: "none", name: "غير مسجَّل", email: "", role: "none" };
    var i, u = null;
    for (i = 0; i < T.users.length; i++) {
      if (T.users[i].id === T.currentUserId) u = T.users[i];
    }
    return u || T.users[0];
  }

  /**
   * fail-closed: أي دور غير معروف أو بلا صلاحيات مسجَّلة = ممنوع.
   * مدير المكتب وحده مفتوح له كل شيء (دوره يأتي من السحابة لا من الجهاز).
   */
  function can(section) {
    if (!section) return true;
    var u = current();
    if (!u || typeof u.role !== "string" || !u.role || u.role === "none" || u.role === "client") return false;
    if (u.role === "owner") return true;
    var r = T.roles[u.role];
    if (!r || !Array.isArray(r.perms)) return false;
    return r.perms.indexOf(section) >= 0;
  }

  /* ------------------------- مصفوفة الصلاحيات الفعلية (تُرفع للسيرفر وتُستعمل في فحص الكتابة)
     مفتاح PERMKEYS يُقيَّد بقسمه: لو القسم نفسه ممنوع على الدور يبقى المفتاح "none" مهما كان مستواه. */
  var KEY_SECTION = { cases: "cases", bailiff: "cases", poa: "cases", admin: "cases", execution: "cases",
    appeal: "cases", fees: "finance", reports: "reports", lists: "team", backup: "team", users: "team" };
  var SECTION_KEYS = ["clients", "hr", "secretariat", "finance", "team"];
  function serverLevel(role, key) {
    if (role === "owner") return "edit";
    var r = T.roles && T.roles[role];
    if (!r || !Array.isArray(r.perms) || role === "client" || role === "none") return "none";
    if (PERMKEYS[key]) {
      var sec = KEY_SECTION[key];
      if (sec && r.perms.indexOf(sec) < 0) return "none";
      return roleLevels(role)[key];
    }
    return r.perms.indexOf(key) >= 0 ? "edit" : "none";
  }
  function serverMatrix() {
    var out = {};
    Object.keys(T.roles || {}).forEach(function (role) {
      if (role === "owner" || role === "client") return;
      var m = {};
      Object.keys(PERMKEYS).concat(SECTION_KEYS).forEach(function (k) { m[k] = serverLevel(role, k); });
      out[role] = m;
    });
    return out;
  }
  /** هل المستخدم الحالي يقدر يكتب في هذه المجموعة السحابية؟ (العميل يمتنع قبل الإرسال؛ السيرفر هو اللي يفرض فعلياً) */
  function canWriteCollection(coll) {
    if (OPEN_COLLECTIONS[coll]) return true;
    var u = current();
    if (!u || typeof u.role !== "string" || !u.role || u.role === "none") return false;
    if (u.role === "owner") return true;
    var k = COLLECTION_KEY[coll];
    return !!k && serverLevel(u.role, k) === "edit";
  }

  /** يُعيد لدور مدير المكتب كل صلاحياته — يُنادى عند الإقلاع. */
  function healOwner() {
    if (!T.roles || !T.roles.owner) return false;
    var all = Object.keys(SECTIONS);
    var cur = T.roles.owner.perms || [];
    var missing = all.filter(function (s) { return cur.indexOf(s) < 0; });
    if (!missing.length) return false;
    T.roles.owner.perms = all;
    save(T);
    return true;
  }

  /* ------------------------------------------------------- ملكية السجلات والنطاق */

  function meta() {
    try { return JSON.parse(localStorage.getItem(META)) || {}; }
    catch (e) { return {}; }
  }
  function setMeta(m) {
    try { localStorage.setItem(META, JSON.stringify(m)); } catch (e) { }
  }

  /**
   * قائمة السجلات (#__recs) التي ينشئها data.js تعرض كل شيء.
   * هنا نُسم كل سجل جديد بصاحبه ونطاقه، ثم نُخفي ما لا يخص المستخدم الحالي.
   */
  function hookRecords() {
    var sel = document.getElementById("__recs");
    if (!sel) return;

    function ids() {
      return Array.prototype.map.call(sel.options, function (o) { return o.value; })
        .filter(function (v) { return v && v.indexOf("__") !== 0; });
    }

    var m = meta();
    var u = current();

    // أي سجل بلا بيانات ملكية يُنسب للمستخدم الحالي في النطاق الحالي
    var changed = false;
    ids().forEach(function (id) {
      if (!m[id]) { m[id] = { owner: u.id, scope: T.scope }; changed = true; }
    });
    if (changed) setMeta(m);

    // إخفاء ما لا يخص النطاق أو المالك الحالي
    Array.prototype.slice.call(sel.options).forEach(function (o) {
      if (!o.value || o.value.indexOf("__") === 0) return;
      var r = m[o.value];
      if (!r) return;
      var mine    = (r.owner === u.id);
      var visible = (T.scope === "personal")
            ? (mine && r.scope === "personal")
            : (r.scope === "office" && (can("team") || mine));
      o.hidden   = !visible;
      o.disabled = !visible;
    });
  }

  /* ------------------------------------------------------------- منع الدخول */

  function block(sectionName) {
    var host = document.querySelector("main") || document.body;
    host.innerHTML =
      '<div style="margin:26px 14px;padding:22px;background:#fff5f4;border:1px solid #f0cfcb;' +
      'border-radius:12px;text-align:center;direction:rtl">' +
      '<div style="font-size:34px;margin-bottom:10px">🔒</div>' +
      '<div style="font-weight:600;font-size:16px;color:#8c1d18;margin-bottom:8px">' +
      'لا تملك صلاحية الدخول</div>' +
      '<div style="font-size:14px;color:#7d7166;line-height:1.8">' +
      'قسم «' + sectionName + '» غير متاح لدور <b>' +
      (T.roles[current().role] || {}).name + '</b>.<br>' +
      'راجع مدير المكتب من شاشة «المحامون والصلاحيات».</div>' +
      '<a href="home.html" style="display:inline-block;margin-top:16px;padding:11px 22px;' +
      'background:#5b3a21;color:#fff;border-radius:9px;text-decoration:none;font-size:15px">' +
      'الرئيسية</a></div>';
  }

  /** يُخفي البطاقات والروابط المؤدية لشاشات ممنوعة */
  function hideLinks() {
    document.querySelectorAll("a[href]").forEach(function (a) {
      var href = a.getAttribute("href") || "";
      if (href.indexOf("://") >= 0 || href.charAt(0) === "#") return;
      var scr = href.split("/").pop().replace(/\.html.*$/, "");
      var sec = SCREEN_SECTION[scr];
      if (sec && !can(sec)) a.style.display = "none";
    });
  }

  /* ------------------------------------------------- شريط المستخدم والنطاق */

  function bar() {
    if (SCREEN === "80-team") return;      // شاشة الفريق لها شريطها الخاص

    var u = current();
    var b = document.createElement("div");
    b.setAttribute("data-nosave", "1");
    b.style.cssText =
      "display:flex;align-items:center;gap:8px;flex-wrap:wrap;direction:rtl;" +
      "background:#efe7db;border-bottom:1px solid #ddd4c8;padding:8px 12px;font-size:13px";

    var who = document.createElement("span");
    who.style.cssText = "flex:1;color:#5b3a21;min-width:120px";
    who.innerHTML = "<b>" + u.name + "</b> · " +
                    ((T.roles[u.role] || {}).name || u.role);
    b.appendChild(who);

    ["office", "personal"].forEach(function (s) {
      var on = (T.scope === s);
      var x = document.createElement("button");
      x.type = "button";
      x.textContent = (s === "office" ? "شغل المكتب" : "قضاياي");
      x.style.cssText =
        "padding:6px 12px;border-radius:8px;font-family:inherit;font-size:12.5px;" +
        "min-height:34px;border:1px solid " + (on ? "#5b3a21" : "#ccc0ac") + ";" +
        "background:" + (on ? "#5b3a21" : "#fff") + ";color:" + (on ? "#fff" : "#5b3a21");
      x.onclick = function () { T.scope = s; save(T); location.reload(); };
      b.appendChild(x);
    });

    /* تسجيل الخروج — يظهر فقط في الشاشات المتصلة فعلياً بـFirebase (auth.js
       محمَّل)، ومطلوب لتبديل الحساب أثناء تجربة الأدوار المختلفة. */
    if (w.Auth && w.Auth.logout) {
      var out = document.createElement("button");
      out.type = "button";
      out.textContent = "خروج";
      out.style.cssText =
        "padding:6px 12px;border-radius:8px;font-family:inherit;font-size:12.5px;" +
        "min-height:34px;border:1px solid #b3261e;background:#fff;color:#b3261e";
      out.onclick = function () {
        if (!confirm("تسجيل الخروج من الحساب الحالي؟")) return;
        w.Auth.logout(function () { location.href = "98-login.html"; });
      };
      b.appendChild(out);
    }

    var host = document.querySelector(".appbar");
    if (host && host.parentNode) host.parentNode.insertBefore(b, host.nextSibling);
    else document.body.insertBefore(b, document.body.firstChild);
  }

  /* ------------------------------------------- وضع «عرض فقط» (صلاحية view)
     لو مستوى المستخدم على مفتاح الشاشة "view": كل حقول النماذج وأزرارها (حفظ/إضافة/حذف) تتعطّل.
     ده تسهيل للمستخدم فقط — الحماية الحقيقية من cloud-store (قبل الإرسال) ومن firestore.rules (السيرفر). */
  function applyReadOnly() {
    var key = SCREEN_EDITKEY[SCREEN];
    if (!key || level(key) !== "view") return;
    var note = document.createElement("div");
    note.setAttribute("data-nosave", "1");
    note.style.cssText = "background:#fff5f4;border-bottom:1px solid #f0cfcb;color:#8c1d18;padding:7px 12px;font-size:13px;direction:rtl;text-align:center";
    note.textContent = "🔒 عرض فقط — ليس لديك صلاحية التعديل على هذه الشاشة.";
    var host = document.querySelector(".appbar");
    if (host && host.parentNode) host.parentNode.insertBefore(note, host.nextSibling);
    else document.body.insertBefore(note, document.body.firstChild);
    var busy = false;
    function lock() {
      if (busy) return; busy = true;
      document.querySelectorAll("form input, form select, form textarea").forEach(function (el) {
        if (el.closest("[data-nolock]") || el.closest("[data-nosave]")) return;
        if (el.type === "file" || el.tagName === "SELECT" || el.type === "radio" || el.type === "checkbox") { if (!el.disabled) el.disabled = true; }
        else if (!el.readOnly) el.readOnly = true;
      });
      document.querySelectorAll("form button, .del-session, [data-add], [data-addrow], [data-addopt], [data-addlevel]").forEach(function (b) {
        if (b.hasAttribute("data-note") || b.closest("[data-nolock]")) return;
        if (!b.disabled) b.disabled = true;
      });
      setTimeout(function () { busy = false; }, 0);
    }
    document.addEventListener("submit", function (e) { e.preventDefault(); e.stopImmediatePropagation(); }, true);
    lock();
    try { new MutationObserver(function () { setTimeout(lock, 50); }).observe(document.body, { childList: true, subtree: true }); } catch (e) { }
  }

  /* ------------------------------------------------------------------ إقلاع */

  /**
   * لو Firebase Auth محمَّل ومسجَّل دخول بحساب معروف (بالبريد)، تُطابق هويّة
   * team.js بهويّة Firebase تلقائياً. لا يفعل شيئاً بدون تسجيل دخول فعلي —
   * فلا يغيّر أي سلوك حالي للشاشات التي لم تُفعَّل فيها هذه المرحلة بعد.
   */
  function syncWithFirebaseUser(cb) {
    if (!w.Auth) { cb(); return; }
    w.Auth.whenKnown(function (user) {
      if (!user) { cb(); return; }
      if (!w.CloudStore || !w.CloudStore.whenReady) {
        /* لا اتصال سحابي على هذه الشاشة — طابق محلياً بالبريد فقط كسابقاً */
        cb();
        return;
      }
      w.CloudStore.whenReady(function (ok) {
        if (!ok) { cb(); return; }
        var I = w.CloudStore._internal;
        var url = I.officeUrl() + "/users/" + encodeURIComponent(user.uid);
        I.authedRequest("GET", url, null).then(function (r) {
          var f = r.ok && r.data && r.data.fields;
          var role = f && f.role && f.role.stringValue;
          if (role && f.active && f.active.booleanValue === false) {   /* موقوف = بلا دور (ويُمسح الدور المحفوظ) */
            try { localStorage.removeItem(ROLE_CACHE); } catch (e) { }
            _cloudUser = { id: "cloud:" + user.uid, name: user.email, email: user.email, role: "none" };
            cb();
            return;
          }
          if (role) {
            var name = (f.name && f.name.stringValue) || user.email;
            _cloudUser = { id: "cloud:" + user.uid, name: name, email: user.email,
                           role: (CLEAN && role === "owner") ? "none" : role };
            /* صلاحيات الأدوار من مستند المكتب (المدير بيرفعها من شاشة الفريق) */
            I.authedRequest("GET", I.officeUrl(), null).then(function (o) {
              var rj = o.ok && o.data && o.data.fields && o.data.fields.rolesJson && o.data.fields.rolesJson.stringValue;
              var oj = o.ok && o.data && o.data.fields && o.data.fields.officeJson && o.data.fields.officeJson.stringValue;
              var roles = null, office = null;
              try { roles = rj ? JSON.parse(rj) : null; } catch (e) { roles = null; }
              try { office = oj ? JSON.parse(oj) : null; } catch (e) { office = null; }
              if (role !== "owner") applyCloudRoles(roles);
              var prevScope = (roleCache() || {}).office;
              try {
                localStorage.setItem(ROLE_CACHE, JSON.stringify({ uid: user.uid, email: user.email, name: name,
                  role: role, roles: roles, office: office, at: Date.now() }));
              } catch (e) { }
              /* المدير غيّر «قضايا المحامين»: الشاشة تتفتح من جديد علشان الفلترة تتطبّق */
              if (CLEAN && JSON.stringify(prevScope || null) !== JSON.stringify(office || null) &&
                  ((prevScope && prevScope.lawyerScope) || "all") !== ((office && office.lawyerScope) || "all")) {
                try { if (!sessionStorage.getItem("team.scope.reload")) { sessionStorage.setItem("team.scope.reload", "1"); location.reload(); return; } } catch (e) { }
              }
              if (role === "owner" && !CLEAN) pushRoles(false);
              cb();
            }).catch(function () {
              try {
                var rc = roleCache() || {};
                localStorage.setItem(ROLE_CACHE, JSON.stringify({ uid: user.uid, email: user.email, name: name,
                  role: role, roles: rc.uid === user.uid ? rc.roles : null, at: Date.now() }));
              } catch (e) { }
              cb();
            });
            return;
          }
          /* حادثة حقيقية 2026-09-11: owner المكتب نفسه كان بيتمسح جهازه
             بالغلط بصورة متكرّرة — السبب أن أي فشل غير حاسم (خطأ شبكة
             عابر، حظر مؤقّت، 500/403 من Firestore) كان يُعامَل هنا كـ"تم
             حذفه فعلاً" ويُنفَّذ wipeAndLockOut()، رغم عدم التأكد إطلاقاً.
             الحذف الحقيقي الوحيد المضمون هو رد Firestore الصريح 404 (لا
             يوجد مستند بهذا المسار) — أي رد آخر (حتى r.ok=false) لا يثبت
             الحذف، فالإجراء الآمن هو التراجع للمطابقة المحلية العادية،
             تماماً مثل انقطاع الاتصال. لا يُمسَح أي جهاز أبداً إلا بثقة
             ١٠٠٪ عبر 404 صريح. */
          if (r.status === 404) { wipeAndLockOut(); return; }
          cb();   /* فشل غير حاسم: يبقى الدور المحفوظ (أو "none") — لا رجوع لأي مستخدم محلي */
        }).catch(function () { cb(); });
      });
    });
  }

  /** المدير بيرفع صلاحيات الأدوار لمستند المكتب، فتوصل لكل أجهزة المحامين.
      force=false: بيرفع بس لو اتغيّرت عن آخر رفعة. */
  function pushRoles(force) {
    if (CLEAN || !w.CloudStore || !w.CloudStore._internal) return;
    var u = current();
    if (!u || u.role !== "owner") return;
    var roles = {};
    Object.keys(T.roles).forEach(function (k) { if (k !== "owner") roles[k] = T.roles[k]; });
    /* إعدادات المكتب للمحامين: «يشوفوا كل القضايا» ولا «قضاياهم بس»، ومعاها
       اسم وإيميل كل محامي (علشان جهازه يعرف تكليفاته — case-scope.js). */
    var office = { lawyerScope: (T.settings && T.settings.lawyerScope) || "all",
      team: T.users.filter(function (x) { return x.role !== "owner"; })
        .map(function (x) { return { id: x.id, name: x.name || "", email: String(x.email || "").toLowerCase() }; }) };
    /* rolePerms: نفس الصلاحيات كحقل Map حقيقي — firestore.rules بتقرأه لفرض الصلاحيات على السيرفر
       (لا تقدر تفكّ نص JSON). المدير وحده يكتبه. */
    var matrix = serverMatrix(), rpFields = {};
    Object.keys(matrix).forEach(function (role) {
      var f = {}; Object.keys(matrix[role]).forEach(function (k) { f[k] = { stringValue: matrix[role][k] }; });
      rpFields[role] = { mapValue: { fields: f } };
    });
    var js = JSON.stringify(roles), oj = JSON.stringify(office), both = js + "|" + oj + "|" + JSON.stringify(matrix);
    try { if (!force && localStorage.getItem(ROLES_PUSHED) === both) return; } catch (e) { }
    var I = w.CloudStore._internal;
    I.authedRequest("PATCH", I.officeUrl() + "?updateMask.fieldPaths=rolesJson&updateMask.fieldPaths=officeJson&updateMask.fieldPaths=rolePerms",
      { fields: { rolesJson: { stringValue: js }, officeJson: { stringValue: oj },
                  rolePerms: { mapValue: { fields: rpFields } } } })
      .then(function (r) { if (r.ok) { try { localStorage.setItem(ROLES_PUSHED, both); } catch (e) { } } })
      .catch(function () { });
  }

  /* ------------------------------------------- مزامنة قائمة المحامين بين أجهزة المكتب
     طلب المستخدم ٧-١٠-٢٠٢٦: القائمة كانت محلية على كل جهاز (البنا كان على الموبايل بس).
     كل عضو = مستند في records/team (id العضو)، وبيتزامن بين أجهزة المدير بس — نسخة
     المحامين (CLEAN) ما بتسحبش القائمة (فيها أرقام قومية وصور كارنيهات زمايلهم).
     التعارض: الأحدث (_at) بيكسب. الحذف: عضو كان متزامن قبل كده واختفى من السحابة =
     اتمسح من جهاز تاني فبيتمسح هنا؛ وعضو جديد محلي (ما اتزامنش قبل كده) بيترفع. */
  var TEAM_COLL = "team", TSYNC = "proflawyer.team.sync.v1";
  function teamSyncOn() {
    if (CLEAN || !w.CloudStore || !w.CloudStore.collection) return false;
    var u = current();
    return !!u && u.role === "owner";
  }
  function tsRead() {
    var o = null; try { o = JSON.parse(localStorage.getItem(TSYNC)); } catch (e) { }
    o = o || {}; o.h = o.h || {}; return o;
  }
  function tsWrite(o) { try { localStorage.setItem(TSYNC, JSON.stringify(o)); } catch (e) { } }
  function userHash(u) {
    var c = {}; Object.keys(u || {}).sort().forEach(function (k) { if (k !== "_at" && k.indexOf("__") !== 0) c[k] = u[k]; });
    var s = JSON.stringify(c), h = 0;
    for (var i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
    return s.length + ":" + h;
  }
  function cleanRemote(r) {
    var o = {}; Object.keys(r || {}).forEach(function (k) {
      if (k.indexOf("__") === 0 || k === "clientUid" || k === "clientUids") return; o[k] = r[k]; });
    return o;
  }
  /** يرفع اللي اتغيّر من آخر مزامنة، ويمسح من السحابة اللي اتشال من هنا. */
  function pushTeam() {
    if (!teamSyncOn()) return;
    var st = tsRead(), now = Date.now(), dirty = false, seen = {};
    T.users.forEach(function (u) {
      if (!u || !u.id) return;
      seen[u.id] = 1;
      var h = userHash(u);
      if (st.h[u.id] === h) return;
      u._at = now; dirty = true;
      st.h[u.id] = h;
      w.CloudStore.collection.save(TEAM_COLL, u.id, u);
    });
    Object.keys(st.h).forEach(function (id) {
      if (seen[id]) return;
      delete st.h[id];
      w.CloudStore.collection.remove(TEAM_COLL, id);
    });
    tsWrite(st);
    if (dirty) { _pulling = true; save(T); _pulling = false; }
  }
  /** يسحب القائمة من السحابة ويدمجها (كام مستند صغير — قراءة رخيصة). */
  function pullTeam(force, done) {
    if (!teamSyncOn()) { done && done(false); return; }
    var st = tsRead();
    if (!force && st.pulledAt && Date.now() - st.pulledAt < 10 * 60 * 1000) { pushTeam(); done && done(false); return; }
    w.CloudStore.collection.list(TEAM_COLL, function (remote) {
      if (!remote) { done && done(false); return; }
      st = tsRead();
      var cur = current(), changed = false, rmap = {};
      remote.forEach(function (r0) {
        var r = cleanRemote(r0); if (!r.id) return;
        rmap[r.id] = 1;
        var i, at = -1;
        for (i = 0; i < T.users.length; i++) if (T.users[i].id === r.id) { at = i; break; }
        if (at < 0) {
          /* مش موجود هنا: لو كان متزامن ومتشال محلياً، pushTeam هيمسحه من السحابة */
          if (st.h[r.id]) return;
          T.users.push(r); changed = true;
        } else if ((+r._at || 0) > (+T.users[at]._at || 0) && userHash(r) !== userHash(T.users[at])) {
          T.users[at] = r; changed = true;
        } else return;
        st.h[r.id] = userHash(r);
      });
      T.users = T.users.filter(function (u) {
        if (rmap[u.id] || !st.h[u.id]) return true;
        if (u.role === "owner" || (cur && cur.id === u.id)) return true;
        delete st.h[u.id]; changed = true; return false;     /* اتمسح من جهاز تاني */
      });
      st.pulledAt = Date.now();
      tsWrite(st);
      if (changed) { _pulling = true; save(T); _pulling = false; }
      pushTeam();
      if (changed) { try { w.dispatchEvent(new CustomEvent("team:synced")); } catch (e) { } }
      done && done(changed);
    });
  }

  /** نسخة المحامين من غير دور مؤكَّد على مكتب الفريق: ما يتفتحش أي حاجة. */
  function blockNoRole() {
    var host = document.querySelector("main") || document.body;
    host.innerHTML =
      '<div style="margin:26px 14px;padding:22px;background:#fff5f4;border:1px solid #f0cfcb;' +
      'border-radius:12px;text-align:center;direction:rtl">' +
      '<div style="font-size:34px;margin-bottom:10px">🔒</div>' +
      '<div style="font-weight:600;font-size:16px;color:#8c1d18;margin-bottom:8px">' +
      'لسه ما اتأكدناش من صلاحياتك على المكتب</div>' +
      '<div style="font-size:14px;color:#7d7166;line-height:1.8">' +
      'افتح البرنامج وإنت متصل بالإنترنت. لو الرسالة دي فضلت، كلّم مدير المكتب ' +
      'يتأكد إنك متسجّل عنده في «المحامون والصلاحيات» بنفس إيميلك.</div>' +
      '<a href="home.html" style="display:inline-block;margin-top:16px;padding:11px 22px;' +
      'background:#5b3a21;color:#fff;border-radius:9px;text-decoration:none;font-size:15px">' +
      'حاول تاني</a></div>';
  }

  /** حذف نهائي من owner المكتب اكتُشف عند تسجيل الدخول: يمسح كل بيانات
      هذا الجهاز (لا يبقى للمكتب أي أثر عليه) ويسجّل الخروج فوراً. */
  function wipeAndLockOut() {
    try { localStorage.clear(); } catch (e) {}
    var msg = "تم إلغاء صلاحيتك على هذا المكتب. تم مسح كل البيانات من هذا الجهاز وتسجيل خروجك.";
    function goLogin() { location.href = "98-login.html"; }
    if (w.Auth && w.Auth.logout) { w.Auth.logout(function () { alert(msg); goLogin(); }); }
    else { alert(msg); goLogin(); }
  }

  var CLIENT_HOME = "client-home";

  function boot() {
    healOwner();
    /* قفل فوري من الدور المحفوظ — قبل ما رد السحابة يرجع، علشان محتوى
       الشاشة الممنوعة ما يبانش ولا ثانية. لو الرد رجع بصلاحية، الشاشة بتتفتح. */
    var preBlocked = false;
    (function () {
      if (SCREEN.indexOf("98-login") === 0) return;
      var u0 = current(), s0 = SCREEN_SECTION[SCREEN];
      if (u0 && u0.role === "none") { blockNoRole(); preBlocked = true; if (!session()) location.replace("98-login.html"); return; }
      if (s0 && !can(s0)) { block(SECTIONS[s0] || s0); preBlocked = true; }
    })();
    syncWithFirebaseUser(function () {
      if (preBlocked) {
        var u1 = current(), s1 = SCREEN_SECTION[SCREEN];
        var okNow = !(u1 && u1.role === "none") && (!s1 || can(s1));
        /* مرة واحدة بس لكل شاشة (لو التخزين مليان والدور ما اتحفظش، ما ندخلش في لفّة) */
        var rk = "team.reloaded." + SCREEN, last = 0;
        try { last = +sessionStorage.getItem(rk) || 0; } catch (e) { }
        if (okNow && Date.now() - last > 15000) {
          try { sessionStorage.setItem(rk, String(Date.now())); } catch (e) { }
          location.reload();
        }
        /* السيرفر رد بدور معروف لكنه لا يملك الشاشة: نغيّر رسالة «لسه ما اتأكدناش» لـ«لا تملك صلاحية الدخول» */
        if (!okNow && u1 && u1.role !== "none" && s1 && !can(s1)) block(SECTIONS[s1] || s1);
        return;
      }
      /* دور "عميل" له شاشة رئيسية مبسّطة واحدة (قضاياه فقط) — أي شاشة
         أخرى (حتى لو بلا قسم محدَّد أصلاً في SCREEN_SECTION) تُحوَّل إليها
         فوراً بدل أن يُترَك أمام شاشات المكتب الكاملة. */
      var u = current();
      if (u && u.role === "none" && SCREEN.indexOf("98-login") !== 0) { blockNoRole(); return; }
      if (u && u.role === "client" && SCREEN !== CLIENT_HOME && SCREEN.indexOf("98-login") !== 0) {
        location.replace(CLIENT_HOME + ".html");
        return;
      }
      var sec = SCREEN_SECTION[SCREEN];
      if (sec && !can(sec)) { block(SECTIONS[sec] || sec); return; }
      bar();
      hideLinks();
      pullTeam(SCREEN === "80-team");
      applyReadOnly();
      setTimeout(hookRecords, 350);          // بعد أن يبني data.js قائمته
    });
  }

  w.Team = {
    data: T, save: function () { return save(T); }, reload: function () { T = load(); return T; },
    current: current, can: can, healOwner: healOwner, pushRoles: pushRoles, isClean: CLEAN,
    pullTeam: pullTeam, pushTeam: pushTeam,
    /* «قضايا المحامين»: all = كل القضايا (الافتراضي) — mine = اللي هو مسئول عنها أو عليه تكليف فيها */
    lawyerScope: function () { return (T.settings && T.settings.lawyerScope) || "all"; },
    setLawyerScope: function (v) { T.settings = T.settings || {}; T.settings.lawyerScope = v === "mine" ? "mine" : "all"; save(T); pushRoles(true); },
    SECTIONS: SECTIONS, DEFAULT_ROLES: DEFAULT_ROLES,
    PERMKEYS: PERMKEYS, level: level, canView: canView, canEdit: canEdit,
    roleLevels: roleLevels, setRoleLevel: setRoleLevel,
    canWriteCollection: canWriteCollection, serverMatrix: serverMatrix
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else { boot(); }

})(window);
