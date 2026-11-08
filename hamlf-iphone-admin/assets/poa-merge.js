/* =============================================================================
   دمج ملف التوكيلات مع قاعدة الموكلين.

   المصدر: «ملف التوكيلات» بعد فصل الأسماء المتعددة إلى سجل لكل شخص.
   كل اسم يحمل نفس رقم التوكيل وبيانات التوثيق ونفس رقم الموكل بالمكتب (م)،
   فتكرار الرقم بين الأسماء مقصود لا خطأ.

   ⚠️ الموكل الواحد قد يكون له أكثر من توكيل بأرقام مكتب مختلفة — ٩٥ موكلاً
      كذلك في هذا الملف. لذلك تُحفظ التوكيلات في مصفوفة `poas` ولا يُستبدل
      توكيلٌ بآخر. الحقول المفردة تعكس التوكيل الساري الأحدث للتوافق مع
      الشاشات التي تقرأ حقلاً واحداً.

   الترقيم التلقائي للموكل الجديد يبدأ بعد أعلى رقم مسجَّل.
   ============================================================================= */
(function (w) {
  "use strict";

  var CLIENTS_KEY = "proflawyer.agenda.clients.v1";
  var NEXT_KEY    = "proflawyer.nextOfficeNo";

  function read(k, d) {
    try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; }
  }

  function norm(s) { return window.lawyerNorm(s); }

  function detect(raw) {
    return !!(raw && raw.format === "poa-excel-v1" && Array.isArray(raw.clients));
  }

  /** بطاقة توكيل واحدة من سجل المصدر */
  function poaOf(src) {
    return {
      officeNo:  src.officeNo  || "",
      poaNo:     src.poaNo     || "",
      poaLetter: src.poaLetter || "",
      poaYear:   src.poaYear   || "",
      poaType:   src.poaType   || "",
      notary:    src.notary    || "",
      poaDate:   src.poaDate   || "",
      poaStatus: src.poaStatus || "ساري",
      poaReason: src.poaReason || "",
      poaNote:   src.poaNote   || "",
      agent:     src.agent     || "",
      role:      src.role      || "",
      sharedWith: src.sharedWith || 0
    };
  }

  function sameKey(p) {
    return [p.officeNo, p.poaNo, p.poaLetter, p.poaYear].join("|");
  }

  /** التوكيل المعروض: أحدث ساري، وإلا الأحدث مطلقاً */
  function primary(list) {
    if (!list || !list.length) return null;
    var year = function (p) {
      var y = parseInt(String(p.poaYear || "").replace(/[٠-٩]/g,
        function (d) { return d.charCodeAt(0) - 0x0660; }), 10);
      return isNaN(y) ? 0 : y;
    };
    var live = list.filter(function (p) { return p.poaStatus !== "منتهي"; });
    var pool = live.length ? live : list;
    return pool.slice().sort(function (a, b) { return year(b) - year(a); })[0];
  }

  function applyPrimary(target) {
    var p = primary(target.poas);
    if (!p) return;
    ["officeNo", "poaNo", "poaLetter", "poaYear", "poaType", "notary",
     "poaDate", "poaStatus", "poaReason", "poaNote", "agent", "role"]
      .forEach(function (k) { if (p[k]) target[k] = p[k]; });
    target.poaCount = target.poas.length;
  }

  function summarise(raw) {
    var list = raw.clients || [];
    var current = read(CLIENTS_KEY, []);
    var have = {};
    current.forEach(function (c) { have[norm(c.name)] = 1; });

    var names = {}, split = 0, ended = 0;
    list.forEach(function (c) {
      names[norm(c.name)] = 1;
      if (c.sharedWith) split++;
      if (c.poaStatus === "منتهي") ended++;
    });
    var uniq = Object.keys(names);

    return {
      incoming: list.length,
      uniqueNames: uniq.length,
      multiPoa: list.length - uniq.length,
      matched: uniq.filter(function (n) { return have[n]; }).length,
      fresh:   uniq.filter(function (n) { return !have[n]; }).length,
      split: split, ended: ended,
      existing: current.length,
      nextNo: raw.nextOfficeNo || 1
    };
  }

  function run(raw) {
    var list = raw.clients || [];
    var current = read(CLIENTS_KEY, []);

    /* المطابقة (F-CLI-1): الرقم القومي الأول، ثم رقم الموكل بالمكتب، ثم الاسم —
       والاسم بس ما يكفيش لو الاتنين ليهم رقم قومي ومختلفين (شخصين بنفس الاسم). */
    var digits = function (v) { return String(v == null ? "" : v).replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x0660; }).replace(/\D/g, ""); };
    var byName = {}, byNid = {}, byOff = {};
    function index(c) {
      (byName[norm(c.name)] = byName[norm(c.name)] || []).push(c);
      if (digits(c.idNo).length >= 10) byNid[digits(c.idNo)] = c;
      [c].concat(c.poas || []).forEach(function (p) { if (digits(p.officeNo)) byOff[digits(p.officeNo)] = byOff[digits(p.officeNo)] || c; });
    }
    current.forEach(function (c) {
      if (!c.poas && c.poaNo) c.poas = [poaOf(c)];
      index(c);
    });
    function findTarget(src) {
      var nid = digits(src.idNo), off = digits(src.officeNo);
      if (nid.length >= 10 && byNid[nid]) return byNid[nid];
      var named = (byName[norm(src.name)] || []).filter(function (c) {
        return !(nid.length >= 10 && digits(c.idNo).length >= 10 && digits(c.idNo) !== nid);
      });
      if (off && byOff[off] && named.indexOf(byOff[off]) >= 0) return byOff[off];
      return named[0] || null;
    }

    var updated = 0, added = 0, poas = 0;

    list.forEach(function (src) {
      var t = findTarget(src);

      if (!t) {
        t = { name: src.name, email: "", phone: "", emails: [], phones: [], poas: [] };
        if (digits(src.idNo).length >= 10) t.idNo = src.idNo;
        current.push(t);
        index(t);
        added++;
      } else {
        if (!t.poas) t.poas = [];
        updated++;
      }

      var p = poaOf(src);
      if (p.poaNo || p.officeNo) {
        var k = sameKey(p);
        var dup = t.poas.some(function (x) { return sameKey(x) === k; });
        if (!dup) { t.poas.push(p); poas++; }
      }
      applyPrimary(t);
    });

    try {
      localStorage.setItem(CLIENTS_KEY, JSON.stringify(current));
      localStorage.setItem(NEXT_KEY, String(raw.nextOfficeNo || nextOfficeNo()));
    } catch (e) {
      return { ok: false, error: "المساحة ممتلئة — لم يكتمل الدمج." };
    }

    return { ok: true, updated: updated, added: added,
             poas: poas, total: current.length };
  }

  /* ------------------------------------------------ الترقيم التلقائي */

  function toLatin(v) {
    return parseInt(String(v || "").replace(/[٠-٩]/g,
      function (d) { return d.charCodeAt(0) - 0x0660; }), 10);
  }

  /** رقم التوكيل بالمكتب التالي (قاعدة المستخدم ٧-١٠-٢٠٢٦):
      التتابع ده بتاع **أرقام التوكيلات** بالمكتب، مش الموكلين — فبيتحسب من أرقام التوكيلات بس
      (موكل من غير توكيل مالوش رقم ولا بيدخل في الحساب). والأرقام المؤقتة (زي ١٣٣٠–١٣٤١ اللي
      اتحطت لتوكيلات أرشيف) بتبان كمجموعة فوق فجوة كبيرة (١٠٠+) عن آخر التتابع الحقيقي، فما بتتحسبش. */
  function poaNumbers() {
    var seen = {}, out = [];
    read(CLIENTS_KEY, []).forEach(function (c) {
      var list = (c.poas && c.poas.length) ? c.poas : (c.poaNo ? [{ officeNo: c.officeNo }] : []);
      list.forEach(function (p) {
        var n = toLatin(p.officeNo || ((c.poas && c.poas.length) ? "" : c.officeNo));
        if (!isNaN(n) && n > 0 && !seen[n]) { seen[n] = 1; out.push(n); }
      });
    });
    return out.sort(function (a, b) { return a - b; });
  }
  var TEMP_GAP = 100;
  function nextOfficeNo() {
    var nums = poaNumbers();
    if (!nums.length) return 1;
    var top = nums.length - 1;
    for (var i = nums.length - 1; i > 0 && i >= nums.length - 60; i--) {
      if (nums[i] - nums[i - 1] >= TEMP_GAP) { top = i - 1; break; }   /* فوق الفجوة = أرقام مؤقتة */
    }
    return nums[top] + 1;
  }

  function takeOfficeNo() {
    var n = nextOfficeNo();
    try { localStorage.setItem(NEXT_KEY, String(n + 1)); } catch (e) { }
    return n;
  }

  w.PoaMerge = {
    detect: detect, summarise: summarise, run: run,
    nextOfficeNo: nextOfficeNo, takeOfficeNo: takeOfficeNo,
    norm: norm, primary: primary, poaOf: poaOf
  };
})(window);
