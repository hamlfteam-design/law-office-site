/* =============================================================================
   القوائم العامة — مخزنٌ واحد لكل قائمة في التطبيق.

   كانت كل شاشة تحمل قائمتها: أنواع الجلسات هنا، وصفات الأطراف هناك،
   وأسباب الحفظ في ثالثة. فما يُضاف يدوياً في موضع لا يظهر في غيره، ولا
   سبيل لمراجعة ما تراكم ولا لحذف ما أُدخل خطأً.

   هنا قائمةٌ واحدة لكل معنى، لها:
     • أصلٌ ثابت (base) — إما مصفوفة، أو دالّة تشتقّه من بيانات المحاكم.
     • ما أضافه المستخدم (add) — يظهر في كل موضع تُستعمل فيه القائمة.
     • ما أخفاه (off) — لا يُحذف من الأصل بل يُستبعد من العرض.

   والقوائم المتسلسلة (المحاكم تتبع الدرجة، والدوائر تتبع المحكمة) تأخذ
   سياقها في ctx، فتُصفّى به.

   يُقرأ أيضاً المخزن القديم proflawyer.manual.v1 مرةً واحدة فلا يضيع ما
   أُضيف قبل هذا الملف.
   ============================================================================= */
(function (w) {
  "use strict";

  var KEY    = "proflawyer.lists.v1";
  var LEGACY = "proflawyer.manual.v1";

  function read(k, d) {
    try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; }
  }
  function write(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { return false; }
  }
  function la(t) {
    return String(t == null ? "" : t)
      .replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x0660; });
  }
  function norm(t) { return window.lawyerNorm(t); }
  function uniq(a) {
    var seen = {}, out = [];
    a.forEach(function (x) {
      var v = String(x == null ? "" : x).trim();
      if (!v) return;
      var k = norm(v);
      if (seen[k]) return;
      seen[k] = 1;
      out.push(v);
    });
    return out;
  }

  /* ------------------------------------------------------- بيانات المحاكم */

  function CD() { return (w.COURT_DATA && w.COURT_DATA.levels) || {}; }
  function levelOrder() {
    return (w.COURT_DATA && w.COURT_DATA.order) || Object.keys(CD());
  }
  function courtsOf(level) {
    var L = CD()[level];
    if (!L) {
      /* بلا درجة: كل المحاكم */
      var all = [];
      Object.keys(CD()).forEach(function (k) {
        (CD()[k].courts || []).forEach(function (c) { all.push(c.name); });
      });
      return uniq(all);
    }
    return uniq((L.courts || []).map(function (c) { return c.name; }));
  }
  function courtObj(level, court) {
    var levels = level ? [level] : Object.keys(CD());
    for (var i = 0; i < levels.length; i++) {
      var cs = (CD()[levels[i]] || {}).courts || [];
      for (var j = 0; j < cs.length; j++) {
        if (norm(cs[j].name) === norm(court)) return cs[j];
      }
    }
    return null;
  }
  function typesOf(level, court) {
    if (court) {
      var c = courtObj(level, court);
      if (c) return uniq((c.types || []).map(function (t) { return t.name; }));
    }
    var out = [];
    (level ? [level] : Object.keys(CD())).forEach(function (k) {
      ((CD()[k] || {}).courts || []).forEach(function (c) {
        (c.types || []).forEach(function (t) { out.push(t.name); });
      });
    });
    return uniq(out);
  }
  function circuitsOf(level, court, type) {
    var c = court ? courtObj(level, court) : null;
    if (!c) return [];
    var out = [];
    (c.types || []).forEach(function (t) {
      if (type && norm(t.name) !== norm(type)) return;
      (t.circuits || []).forEach(function (x) { out.push(x); });
    });
    if (!out.length && type) {                 /* النوع بلا دوائر: خُذ دوائر المحكمة */
      (c.types || []).forEach(function (t) {
        (t.circuits || []).forEach(function (x) { out.push(x); });
      });
    }
    return uniq(out);
  }

  function shortCourt(n) {
    return String(n || "").replace(/^محكمة\s*/, "")
      .replace(/\s*(الجزئية|الابتدائية)\s*$/, "").trim();
  }

  /* --------------------------------------------------------- تعريف القوائم

     `base` إما مصفوفة ثابتة أو دالّة تأخذ السياق. و`ctx` يذكر الحقول التي
     تُصفّى بها القائمة، فتُعرض للمستخدم في شاشة الإدارة. */

  var DEFS = {
    courtLevels: { label: "درجات التقاضي", base: function () { return levelOrder(); } },

    courts: { label: "المحاكم", ctx: ["level"],
      base: function (c) { return courtsOf(c && c.level); } },

    caseTypes: { label: "أنواع الدعاوى", ctx: ["level", "court"],
      base: function (c) { return typesOf(c && c.level, c && c.court); } },

    circuits: { label: "الدوائر", ctx: ["level", "court", "type"],
      base: function (c) { return circuitsOf(c && c.level, c && c.court, c && c.type); } },

    prosecutionsJz: { label: "النيابات الجزئية",
      base: function () {
        return courtsOf("جزئي").map(function (n) {
          return "نيابة " + shortCourt(n) + " الجزئية";
        });
      } },

    prosecutionsKl: { label: "النيابات الكلية",
      base: function () {
        return courtsOf("ابتدائي").map(function (n) {
          return "نيابة " + shortCourt(n) + " الكلية";
        });
      } },

    paperOffices: { label: "أقلام المحضرين",
      base: function () {
        return uniq(courtsOf("جزئي").concat(courtsOf("ابتدائي")).map(shortCourt));
      } },

    sessionTypes: { label: "أنواع الجلسات",
      base: ["مرافعة", "حجز للحكم", "حكم", "تأجيل", "تحقيق", "خبير", "استكمال مرافعة",
             "نطق بالحكم", "شطب", "تعجيل"] },

    caseStatus: { label: "حالات الدعوى",
      base: ["متداولة", "محجوزة للحكم", "محكوم فيها", "مستأنفة", "مطعون فيها",
             "منتهية", "محفوظة", "مشطوبة"] },

    partyCaps: { label: "صفات الأطراف",
      base: ["مدعي", "مدعى عليه", "مستأنف", "مستأنف ضده", "طاعن", "مطعون ضده",
             "مستشكل", "مستشكل ضده", "متهم", "مجني عليه", "مدعي بالحق المدني", "متظلم",
             "متظلم ضده", "شاكي", "مشكو في حقه", "وارث", "دائن", "مدين"] },

    /* صفات الموكل والخصم — لهما نفس الافتراضيات دائماً حتى لا تفرغ القائمة
       عند التعديل مهما حدث للترحيل أو البيانات. «مجني عليه» أُضيفت لأن
       الشاكي في سجل المحاضر يتحول إليها تلقائياً عند الترحيل للقضايا
       (minutes.js، قاعدة المستخدم ٢-١١-٢٠٢٦). */
    partyCapsClient: { label: "صفات الموكل",
      base: ["مدعي", "مدعى عليه", "مستأنف", "مستأنف ضده", "طاعن", "مطعون ضده",
             "مستشكل", "مستشكل ضده", "متهم", "مجني عليه", "مدعي بالحق المدني", "متظلم",
             "متظلم ضده", "شاكي", "مشكو في حقه", "وارث", "دائن", "مدين"] },
    partyCapsOpponent: { label: "صفات الخصم",
      base: ["مدعي", "مدعى عليه", "مستأنف", "مستأنف ضده", "طاعن", "مطعون ضده",
             "مستشكل", "مستشكل ضده", "متهم", "مجني عليه", "مدعي بالحق المدني", "متظلم",
             "متظلم ضده", "شاكي", "مشكو في حقه", "وارث", "دائن", "مدين"] },

    judgmentKinds: { label: "أنواع الأحكام",
      base: ["حضوري شخصي", "حضوري توكيل", "حضوري اعتباري", "غيابي"] },

    lawyers: { label: "المحامون", base: [] },

    opponents: { label: "الخصوم", base: [] },

    notaries: { label: "مكاتب التوثيق", base: [] },

    paperKinds: { label: "أنواع أوراق المحضرين",
      base: ["صحيفة افتتاح دعوى", "صحيفة استئناف", "صحيفة تعجيل", "إعلان بجلسة",
             "إعلان حكم", "إنذار على يد محضر", "إعلان تقرير خبير", "تكليف بالحضور",
             "إعلان أمر أداء", "إعلان شطب", "مدني", "جنائي", "أسرة"] },

    paperResult: { label: "ما تم في ورقة المحضرين", base: ["معلن", "غير معلن"] },

    minuteKinds: { label: "أنواع المحاضر", base: ["إداري", "جنح", "عرائض"] },

    keepReasons: { label: "أسباب الحفظ",
      base: ["لعدم كفاية الأدلة", "لعدم الجناية", "لعدم معرفة الفاعل", "للتصالح",
             "لانقضاء الدعوى بالتقادم", "إدارياً", "لعدم الأهمية", "لسبق الفصل فيه"] },

    grievanceBodies: { label: "جهات التظلم",
      base: function () {
        return ["النائب العام", "المحامي العام", "رئيس النيابة الكلية", "المحكمة المختصة"]
          .concat(courtsOf("ابتدائي").map(function (n) {
            return "نيابة " + shortCourt(n) + " الكلية";
          }));
      } },

    grievanceKinds: { label: "أنواع التظلم", base: ["يدوي", "عرائض إلكترونية"] },

    naqdKinds: { label: "أنواع الطعون",
      base: ["نقض مدني", "نقض جنائي", "نقض عمالي", "نقض أحوال شخصية",
             "نقض تجاري", "التماس إعادة نظر"] },

    expenseItems: { label: "بنود الصرف",
      base: ["رسوم قضائية", "أمانة خبير", "رسوم إعلان محضرين", "صور رسمية وشهادات",
             "دمغات وطوابع", "انتقالات ومواصلات", "توكيلات وتوثيق", "نسخ وتصوير",
             "رسوم نقض", "أمانة نقض", "بريد وشحن", "مصروفات عمومية", "أخرى"] },

    expenseBodies: { label: "جهات الصرف",
      base: function () {
        return uniq(courtsOf("جزئي").concat(courtsOf("ابتدائي")).concat(
          ["قلم المحضرين", "قلم الكتاب", "خزينة المحكمة", "مأمورية الشهر العقاري",
           "نقابة المحامين", "مكتب خبراء وزارة العدل", "محكمة النقض", "نيابة عامة",
           "مصلحة الضرائب", "الشهر العقاري", "مصروفات المكتب", "بريد وشحن", "انتقالات"]));
      } },

    expertOffices: { label: "مكاتب الخبراء", base: [] },

    sessionTime: { label: "وقت الانعقاد", base: ["صباحي", "مسائي"] }
  };

  /* ---------------------------------------- صفات الأطراف: قائمة واحدة
     «صفات الموكل» و«صفات الخصم» أسماء بديلة لـ«صفات الأطراف» (نفس القيم دائماً). */
  var ALIAS = { partyCapsClient: "partyCaps", partyCapsOpponent: "partyCaps" };
  function K(key) { return ALIAS[key] || key; }

  /** الصفة مذكّراً مفرداً دائماً: لا تأنيث ولا مثنى ولا جمع. */
  var CAP_SPECIAL = {
    "ورثة": "وارث", "ورثه": "وارث", "وارثة": "وارث", "وارثه": "وارث", "وارثان": "وارث", "وارثين": "وارث", "وارثون": "وارث",
    "شاكين": "شاكي", "شاكيان": "شاكي", "شاكون": "شاكي", "شاكية": "شاكي", "شاكيه": "شاكي",
    "مدعين": "مدعي", "مدعيين": "مدعي", "مدعيان": "مدعي", "مدعون": "مدعي", "مدعية": "مدعي", "مدعيه": "مدعي",
    "مدينين": "مدين", "مدينون": "مدين", "مدينان": "مدين", "مدينة": "مدين", "مدينه": "مدين"
  };
  function singularMasc(v) {
    var t = String(v == null ? "" : v).trim().replace(/\s+/g, " ");
    if (!t) return t;
    var parts = t.split(" ").map(function (word) {
      if (CAP_SPECIAL[word]) return CAP_SPECIAL[word];
      if (/^(ضدها|ضدهما|ضدهم|ضدهن)$/.test(word)) return "ضده";
      if (/^(عليها|عليهما|عليهم|عليهن)$/.test(word)) return "عليه";
      if (/^(حقها|حقهما|حقهم|حقهن)$/.test(word)) return "حقه";
      var m = /^(مدعي|مستأنف|مستشكل|متظلم|طاعن|متهم|دائن|مدين)(ة|ه|ان|ين|ون|ات)$/.exec(word);
      if (m) return m[1];
      return word;
    });
    return parts.join(" ");
  }

  /* --------------------------------------------------------------- المخزن */

  /* القوائم والمحاكم بيديرها مدير المكتب بس (١٫٥٥): على أجهزة باقي الفريق
     الإضافة/الإخفاء/التعديل ما بتتحفظش، والنسخة بتيجي من جهاز المدير (cloud-store.js). */
  function refLocked() {
    if (w.HAMLF_PC) return false;
    try {
      var u = w.Team && w.Team.current && w.Team.current();
      if (!u || !u.role || u.role === "owner") return false;
    } catch (e) { return false; }
    if (!w.__refWarned) {
      w.__refWarned = true;
      try {
        if (w.PL && w.PL.toast) w.PL.toast("القوائم والمحاكم", "بيعدّلها مدير المكتب بس — التعديل ده مش هيتحفظ.", "");
      } catch (e) { }
    }
    return true;
  }

  function store() { return read(KEY, {}); }

  function entry(key) {
    var s = store();
    if (!s[key]) s[key] = { add: [], off: [] };
    if (!s[key].add) s[key].add = [];
    if (!s[key].off) s[key].off = [];
    return s;
  }

  /** يُرحَّل ما أضافه المستخدم قبل هذا الملف مرةً واحدة. */
  function migrateLegacy() {
    var s = store();
    if (s.__migrated) return;
    var old = read(LEGACY, {});
    Object.keys(old).forEach(function (k) {
      /* المفتاح القديم «الشاشة|الحقل» — يُلحق بقائمة «متفرقات» فلا يضيع */
      (old[k] || []).forEach(function (v) {
        if (!s.__loose) s.__loose = { add: [], off: [] };
        if (s.__loose.add.indexOf(v) < 0) s.__loose.add.push(v);
      });
    });
    s.__migrated = 1;
    write(KEY, s);
  }

  /**
   * قيم قائمة، مصفّاةً بسياقها.
   * @param {string} key  مفتاح القائمة
   * @param {object} ctx  { level, court, type } عند الحاجة
   */
  function get(key, ctx) {
    key = K(key);
    var def = DEFS[key];
    var base = def ? (typeof def.base === "function" ? def.base(ctx || {}) : def.base) : [];
    var s = store();
    var e = s[key] || {};
    var off = {};
    (e.off || []).forEach(function (v) { off[norm(v)] = 1; });
    return uniq(base.concat(e.add || [])).filter(function (v) { return !off[norm(v)]; });
  }

  /** يضيف قيمةً إلى القائمة فتظهر في كل موضع تُستعمل فيه. */
  function add(key, value) {
    if (refLocked()) return false;
    key = K(key);
    var v = String(value == null ? "" : value).trim();
    if (key === "partyCaps") v = singularMasc(v);
    if (!v) return false;
    var s = entry(key);
    var e = s[key];
    /* موجودة في الأصل أو المضاف؟ نكتفي برفع الإخفاء إن كان */
    e.off = (e.off || []).filter(function (x) { return norm(x) !== norm(v); });
    var known = get(key).some(function (x) { return norm(x) === norm(v); });
    if (!known) e.add.push(v);
    return write(KEY, s);
  }

  /** يُخفي قيمة — لا تُحذف من الأصل الرسمي بل تُستبعد من العرض. */
  function hide(key, value) {
    if (refLocked()) return false;
    key = K(key);
    var v = String(value || "").trim();
    if (!v) return false;
    var s = entry(key);
    var e = s[key];
    e.add = e.add.filter(function (x) { return norm(x) !== norm(v); });
    if (!e.off.some(function (x) { return norm(x) === norm(v); })) e.off.push(v);
    return write(KEY, s);
  }

  function unhide(key, value) {
    if (refLocked()) return false;
    key = K(key);
    var s = entry(key);
    s[key].off = s[key].off.filter(function (x) { return norm(x) !== norm(value); });
    return write(KEY, s);
  }

  /** يعدّل قيمةً مضافة: يُخفى القديم ويُضاف الجديد. */
  function rename(key, oldValue, newValue) {
    if (refLocked()) return false;
    key = K(key);
    var nv = String(newValue || "").trim();
    if (key === "partyCaps") nv = singularMasc(nv);
    if (!nv) return false;
    var s = entry(key);
    var e = s[key];
    var i = -1;
    e.add.forEach(function (x, k) { if (norm(x) === norm(oldValue)) i = k; });
    if (i >= 0) e.add[i] = nv;
    else {                                    /* من الأصل: يُخفى ويُضاف بديله */
      if (!e.off.some(function (x) { return norm(x) === norm(oldValue); })) {
        e.off.push(oldValue);
      }
      e.add.push(nv);
    }
    return write(KEY, s);
  }

  function isAdded(key, value) {
    var e = store()[K(key)] || {};
    return (e.add || []).some(function (x) { return norm(x) === norm(value); });
  }
  function hidden(key) {
    var e = store()[K(key)] || {};
    return (e.off || []).slice();
  }

  function defs() { return DEFS; }
  function label(key) { return (DEFS[key] || {}).label || key; }

  /** المفاتيح مرتَّبة كما تُعرض في شاشة الإدارة. */
  function keys() {
    return Object.keys(DEFS).filter(function (k) { return !ALIAS[k]; });
  }

  migrateLegacy();

  w.Lists = {
    get: get, add: add, hide: hide, unhide: unhide, rename: rename,
    isAdded: isAdded, hidden: hidden, defs: defs, keys: keys, label: label, singularMasc: singularMasc,
    norm: norm, uniq: uniq, locked: refLocked,
    courtsOf: courtsOf, typesOf: typesOf, circuitsOf: circuitsOf,
    levelOrder: levelOrder, courtObj: courtObj
  };
})(window);
