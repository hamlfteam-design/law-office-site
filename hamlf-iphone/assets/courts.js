/* =============================================================================
   المحاكم — تسلسل: درجة التقاضي ← المحكمة ← نوع الدعوى ← الدائرة.

   البيانات في COURT_DATA (مصدرها بوابة وزارة العدل ومحكمة النقض ومجلس
   الدولة). كان التسلسل مكتوباً داخل شاشة القضايا وحدها ومربوطاً بمعرّفات
   عناصرها، فلا يُستعمل في غيرها. هنا واجهة مستقلة تُستدعى من أي شاشة.

   وما يضيفه المستخدم يدوياً يُحفظ في قاعدة بياناته ويظهر في كل مرة بعدها —
   في موضعه الصحيح من التسلسل: المحكمة تحت درجتها، ونوع الدعوى تحت محكمته،
   والدائرة تحت نوعها.
   ============================================================================= */
(function (w) {
  "use strict";

  var KEY = "proflawyer.courts.custom.v1";

  function la(t) {
    return String(t == null ? "" : t)
      .replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x0660; });
  }
  function norm(t) { return window.lawyerNorm(t); }
  function uniq(list) {
    var seen = {}, out = [];
    list.forEach(function (v) {
      var k = norm(v);
      if (!k || seen[k]) return;
      seen[k] = 1;
      out.push(v);
    });
    return out;
  }

  /* ------------------------------------------------------ إضافات المستخدم

     { levels:[..], courts:{level:[..]}, types:{level|court:[..]},
       circuits:{level|court|type:[..]} } */

  function custom() {
    try {
      var c = JSON.parse(localStorage.getItem(KEY)) || {};
      c.levels = c.levels || [];
      c.courts = c.courts || {};
      c.types = c.types || {};
      c.circuits = c.circuits || {};
      return c;
    } catch (e) {
      return { levels: [], courts: {}, types: {}, circuits: {} };
    }
  }
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
  function saveCustom(c) {
    if (refLocked()) return false;
    try { localStorage.setItem(KEY, JSON.stringify(c)); return true; }
    catch (e) { return false; }
  }

  function pushInto(obj, key, value) {
    obj[key] = obj[key] || [];
    if (!obj[key].some(function (v) { return norm(v) === norm(value); })) {
      obj[key].push(value);
      return true;
    }
    return false;
  }

  /* ------------------------------------------------------------ القراءة */

  function base() { return (w.COURT_DATA && w.COURT_DATA.levels) || {}; }

  /* يجد عقدة الدرجة في COURT_DATA بمطابقة مباشرة أولاً، وإلا بالتطبيع —
     فتُحلّ فروق الهمزة/الألف المقصورة/التاء المربوطة/المسافات/الأرقام بين
     القيمة المخزَّنة بالقضية ومفتاح القاعدة (وإلا رجعت القوائم فارغة). */
  function baseLevel(level) {
    var b = base();
    if (b[level]) return b[level];
    var k = norm(level), keys = Object.keys(b);
    for (var i = 0; i < keys.length; i++) {
      if (norm(keys[i]) === k) return b[keys[i]];
    }
    return null;
  }
  /** يعيد مفتاح مخزن الإضافات المطابق للدرجة (بالتطبيع) إن وُجد، وإلا الدرجة كما هي. */
  function customKey(map, level) {
    if (map[level]) return level;
    var k = norm(level), keys = Object.keys(map);
    for (var i = 0; i < keys.length; i++) {
      if (norm(keys[i]) === k) return keys[i];
    }
    return level;
  }

  /* إخفاء عبر «إدارة القوائم» (94-lists.html) يُطبَّق هنا أيضاً — القيمة
     المخفاة هناك تختفي فعلياً من حقلَي درجة التقاضي والمحكمة أثناء تسجيل
     القضايا، لا في شاشة الإدارة فقط. هذا يجعل شاشة الإدارة أداة تنظيف
     فعلية لأي بيان دخيل تسرَّب لهذين الحقلين. */
  function hiddenSet(listKey) {
    if (!w.Lists || !w.Lists.hidden) return {};
    var m = {};
    w.Lists.hidden(listKey).forEach(function (v) { m[norm(v)] = 1; });
    return m;
  }

  function levels() {
    var order = (w.COURT_DATA && w.COURT_DATA.order) || Object.keys(base());
    var off = hiddenSet("courtLevels");
    return uniq(order.concat(Object.keys(base())).concat(custom().levels))
      .filter(function (v) { return !off[norm(v)]; });
  }

  function courtsOf(level) {
    if (!level) return [];
    var lv = baseLevel(level);
    var out = ((lv && lv.courts) || []).map(function (c) { return c.name; });
    var cu = custom().courts;
    var off = hiddenSet("courts");
    return uniq(out.concat(cu[customKey(cu, level)] || []))
      .filter(function (v) { return !off[norm(v)]; });
  }

  function courtNode(level, court) {
    var lv = baseLevel(level);
    if (!lv) return null;
    var k = norm(court);
    return (lv.courts || []).filter(function (c) { return norm(c.name) === k; })[0] || null;
  }

  /* أنواع دعاوى جنائية غير موجودة في بيانات وزارة العدل المستوردة (المصدر
     غطّى الأنواع المدنية فقط) — تُضاف يدوياً هنا لكل درجة، وتظهر أمام كل
     محاكم تلك الدرجة. "جنح مستأنف" و"جنايات مستأنفة" تُنظر أمام المحاكم
     الابتدائية فعلياً، لكنها تصنَّف "طعن أعلى" في درجة التقاضي (انظر
     isCriminalType/الطعن الأعلى في case-file.js). */
  var EXTRA_TYPES_BY_LEVEL = {
    "جزئي":         ["جنح جزئي"],
    /* جنح مستأنف = طعن على حكم الجنح الجزئي، وتُنظر أمام المحكمة الابتدائية
       (الكلية) — وليس أمام الاستئناف. وكذلك استئناف المدني الجزئي والإشكالات:
       «مدني مستأنف» أو «مستأنف مستعجل» حسب نوع الدعوى أمام الجزئي (طلب المستخدم ٥-١٠). */
    "ابتدائي":      ["جنح مستأنف", "مدني مستأنف", "مستأنف مستعجل", "أسرة", "جنايات أول درجة"],
    /* جنايات مستأنفة = طعن على حكم الجنايات أول درجة، وتُنظر أمام محكمة
       الاستئناف (طعن أعلى) — وليس أمام الابتدائية. */
    "استئناف عالي": ["جنايات مستأنفة"]
  };
  function extraTypesFor(level) {
    var k = norm(level), keys = Object.keys(EXTRA_TYPES_BY_LEVEL);
    for (var i = 0; i < keys.length; i++) {
      if (norm(keys[i]) === k) return EXTRA_TYPES_BY_LEVEL[keys[i]];
    }
    return [];
  }

  /** أنواع الدعاوى أمام محكمة بعينها، أو كل أنواع الدرجة إن لم تُحدَّد. */
  function typesOf(level, court) {
    if (!level) return [];
    var out = [];
    var node = court ? courtNode(level, court) : null;

    if (node) {
      out = (node.types || []).map(function (t) { return t.name; });
    } else {
      var lv = baseLevel(level);
      ((lv && lv.courts) || []).forEach(function (c) {
        (c.types || []).forEach(function (t) { out.push(t.name); });
      });
    }
    out = out.concat(extraTypesFor(level));
    var c = custom();
    return uniq(out
      .concat(court ? (c.types[level + "|" + norm(court)] || []) : [])
      .concat(c.types[level + "|"] || []));
  }

  function circuitsOf(level, court, type) {
    if (!level) return [];
    var out = [];
    var node = courtNode(level, court);
    if (node) {
      (node.types || []).forEach(function (t) {
        if (!type || norm(t.name) === norm(type)) {
          (t.circuits || []).forEach(function (x) { out.push(x); });
        }
      });
    }
    var key = level + "|" + norm(court) + "|" + norm(type);
    return uniq(out.concat(custom().circuits[key] || []));
  }

  /* ------------------------------------------------------------ الإضافة */

  function addLevel(name) {
    if (!name) return false;
    var c = custom();
    var ok = pushInto(c, "levels", name);
    return ok ? saveCustom(c) : false;
  }
  function addCourt(level, name) {
    if (!level || !name) return false;
    var c = custom();
    var ok = pushInto(c.courts, level, name);
    return ok ? saveCustom(c) : false;
  }
  function addType(level, court, name) {
    if (!level || !name) return false;
    var c = custom();
    var ok = pushInto(c.types, level + "|" + (court ? norm(court) : ""), name);
    return ok ? saveCustom(c) : false;
  }
  function addCircuit(level, court, type, name) {
    if (!level || !name) return false;
    var c = custom();
    var ok = pushInto(c.circuits, level + "|" + norm(court) + "|" + norm(type), name);
    return ok ? saveCustom(c) : false;
  }

  /** يسجّل قيمة في موضعها من التسلسل — أياً كان الحقل. */
  function remember(field, ctx, value) {
    if (!value) return false;
    if (field === "courtLevel") return addLevel(value);
    if (field === "courtName")  return addCourt(ctx.courtLevel, value);
    if (field === "caseType")   return addType(ctx.courtLevel, ctx.courtName, value);
    if (field === "circuit")
      return addCircuit(ctx.courtLevel, ctx.courtName, ctx.caseType, value);
    return false;
  }

  function counts(level) {
    var lv = baseLevel(level);
    var t = 0, x = 0;
    ((lv && lv.courts) || []).forEach(function (c) {
      (c.types || []).forEach(function (ty) {
        t++;
        x += (ty.circuits || []).length;
      });
    });
    return {
      courts: courtsOf(level).length,
      types: typesOf(level).length,
      circuits: x,
      source: (lv && lv.source) || ""
    };
  }

  /* ---------------------------------------------- عناوين مقار المحاكم
     قاموس محكمة → عنوان (مقر الانعقاد) يُبنى من بيانات المكتب نفسها، فبمجرد
     اختيار المحكمة يُملأ العنوان تلقائياً ويمكن فتحه في خرائط جوجل. */
  var AKEY = "proflawyer.courtAddr.v1";
  function addrMap() {
    try { return JSON.parse(localStorage.getItem(AKEY)) || {}; } catch (e) { return {}; }
  }
  function addressOf(court) {
    if (!court) return "";
    var m = addrMap(); if (m[court]) return m[court];
    var k = norm(court), keys = Object.keys(m);
    for (var i = 0; i < keys.length; i++) if (norm(keys[i]) === k) return m[keys[i]];
    return "";
  }
  function setAddress(court, addr) {
    if (!court || !addr) return false;
    if (refLocked()) return false;
    var m = addrMap();
    if (m[court] === addr) return true;
    m[court] = addr;
    try { localStorage.setItem(AKEY, JSON.stringify(m)); return true; } catch (e) { return false; }
  }
  /** رابط خرائط جوجل للعنوان. */
  function mapsUrl(addr) {
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(addr || "");
  }

  /** فهرس عكسي: كل الدرجات اللي فيها محكمة بهذا الاسم (غالباً درجة واحدة؛
      نادراً أكتر من واحدة لو نفس الاسم مستورد تحت درجتين في بيانات وزارة
      العدل) — للاقتراح لا الفرض، راجع case-file.js suggestLevelFor. */
  function levelsForCourt(courtName) {
    if (!courtName) return [];
    var k = norm(courtName), out = [];
    levels().forEach(function (lv) {
      if (courtsOf(lv).some(function (cn) { return norm(cn) === k; })) out.push(lv);
    });
    return out;
  }

  w.Courts = {
    levels: levels, courtsOf: courtsOf, typesOf: typesOf, circuitsOf: circuitsOf,
    addLevel: addLevel, addCourt: addCourt, addType: addType, addCircuit: addCircuit,
    remember: remember, counts: counts, norm: norm, levelsForCourt: levelsForCourt,
    addressOf: addressOf, setAddress: setAddress, mapsUrl: mapsUrl
  };
})(window);
