/* =============================================================================
   مزامنة الموكلين والمحامين مع جهات اتصال الجهاز.

   عند حفظ اسم جديد: لو رقمه موجود بالفعل في جهات اتصال الموبايل تُعرض
   بياناته (اسم/بريد) ليقتبسها المستخدم بنقرة. ولو غير موجود، تُضاف جهة
   اتصال جديدة تلقائياً تحت تصنيف "موكل" أو "محامي" — وهتتزامن هي مع جوجل
   تلقائياً من نظام أندرويد نفسه لو حساب المستخدم مضبوط على مزامنة جهات
   الاتصال (لا رفع مباشر لخوادم جوجل من عندنا).

   بلا جسر AndroidContacts (متصفح عادي، أو صلاحية مرفوضة) كل الدوال تصمت
   ولا تُعطّل الحفظ.
   ============================================================================= */
(function (w) {
  "use strict";

  var native = (typeof AndroidContacts !== "undefined" && AndroidContacts);

  function ensurePermission() {
    if (native && AndroidContacts.ensurePermission) {
      try { AndroidContacts.ensurePermission(); } catch (e) { }
    }
  }

  /**
   * يبحث عن جهة اتصال مطابقة (بالاسم أو الرقم)، ولو المستخدم عايز يستورد
   * بياناتها ينادي onFound(data) — وإلا onNotFound() فيضيفها المستخدم لاحقاً
   * تلقائياً عند الحفظ عبر syncClient/syncLawyer.
   *
   * @param {string} name
   * @param {string} phone
   * @param {function} onFound   ({name, phone, email})
   * @param {function} [onNotFound]
   */
  function offerImport(name, phone, onFound, onNotFound) {
    if (!native || !AndroidContacts.find) { if (onNotFound) onNotFound(); return; }
    if (!AndroidContacts.hasPermission || !AndroidContacts.hasPermission()) {
      ensurePermission();
      if (onNotFound) onNotFound();
      return;
    }
    var raw;
    try { raw = AndroidContacts.find(name || "", phone || ""); } catch (e) { raw = null; }
    var data = null;
    if (raw) { try { data = JSON.parse(raw); } catch (e) { data = null; } }
    if (data && data.found) {
      if (w.Ask && Ask.confirm) {
        Ask.confirm("وجدنا جهة اتصال بهذا الاسم/الرقم", {
          detail: "الاسم: " + (data.name || "—") +
            (data.phone ? String.fromCharCode(10) + "الهاتف: " + data.phone : "") +
            (data.email ? String.fromCharCode(10) + "البريد: " + data.email : "") +
            String.fromCharCode(10) + String.fromCharCode(10) + "استيراد بياناته إلى النموذج؟",
          ok: "استيراد", danger: false
        }, function () { onFound(data); }, onNotFound);
      } else if (confirm("وجدنا جهة اتصال بنفس الاسم/الرقم — استيراد بياناته؟")) {
        onFound(data);
      } else if (onNotFound) onNotFound();
    } else if (onNotFound) onNotFound();
  }

  /* ---- استيراد من جهات الاتصال عند إضافة موكل جديد (طلب المستخدم) ----
     بحث تقريبي بالاسم: كل جهة اتصال أسماؤها الأولى (لحد ٣) هي نفس اللي
     اتكتب بعد التطبيع (أ/ا، ة/ه، ى/ي). نتيجة واحدة = سؤال «استيراد؟»، أكتر
     من نتيجة = قائمة يختار منها المستخدم — ما بناخدش أول واحدة. الاستيراد
     اقتراح: بيملا النموذج والمستخدم بيراجع قبل «حفظ». */
  function nm(t) { return w.lawyerNorm ? w.lawyerNorm(t) : String(t || "").trim(); }
  function core(word) {
    return String(word || "").replace(/^[اأإآ]/, "").replace(/[ةهىي]$/, "");
  }
  function matchesByName(name) {
    if (!native || !AndroidContacts.search) return null;
    var words = nm(name).split(" ").filter(Boolean);
    if (!words.length || nm(name).length < 3) return [];
    var raw = String(name || "").trim().split(/\s+/);
    var probe = raw.map(core).sort(function (a, b) { return b.length - a.length; })[0] || raw[0];
    var list = [];
    try { list = JSON.parse(AndroidContacts.search(probe) || "[]") || []; } catch (e) { list = []; }
    var want = words.slice(0, 3);
    return list.filter(function (c) {
      var cw = nm(c.name).split(" ").filter(Boolean);
      if (cw.length < want.length) return want.every(function (x) { return cw.indexOf(x) >= 0; });
      return want.every(function (x, i) { return cw[i] === x; });
    }).slice(0, 8);
  }
  function detailsOf(c) {
    var d = {};
    try { d = JSON.parse(AndroidContacts.details(c.id) || "{}") || {}; } catch (e) { d = {}; }
    return { name: c.name, phones: d.phones || [], emails: d.emails || [],
             phone: (d.phones || [])[0] || "", email: (d.emails || [])[0] || "" };
  }
  function pickSheet(items, onPick, onNone) {
    var back = document.createElement("div");
    back.setAttribute("data-nosave", "1");
    back.style.cssText = "position:fixed;inset:0;background:rgba(20,14,8,.55);z-index:10090;" +
      "display:flex;align-items:flex-end;justify-content:center";
    var box = document.createElement("div");
    box.style.cssText = "background:var(--card,#fff);border-radius:16px 16px 0 0;padding:16px 16px 22px;" +
      "width:100%;max-width:520px;direction:rtl;max-height:80vh;overflow-y:auto";
    var h = document.createElement("div");
    h.style.cssText = "font-family:var(--f-title);font-size:16px;margin-bottom:4px";
    h.textContent = "جهات اتصال بنفس الاسم تقريباً";
    box.appendChild(h);
    var sub = document.createElement("div");
    sub.style.cssText = "font-size:12.5px;color:var(--muted);margin-bottom:10px";
    sub.textContent = "اختار اللي تستورد تليفونه وإيميله (تقدر تعدّلهم قبل الحفظ):";
    box.appendChild(sub);
    items.forEach(function (d) {
      var b = document.createElement("button");
      b.type = "button";
      b.style.cssText = "display:block;width:100%;text-align:right;margin-bottom:7px;padding:10px 12px;" +
        "border:1px solid var(--line,#ddd);border-radius:10px;background:transparent;color:var(--text);" +
        "font-family:inherit;font-size:14px;line-height:1.7;min-height:48px";
      b.textContent = d.name + (d.phones.length ? "  ·  📱 " + d.phones.join("، ") : "") +
        (d.emails.length ? "  ·  @ " + d.emails.join("، ") : "");
      b.onclick = function () { back.remove(); onPick(d); };
      box.appendChild(b);
    });
    var no = document.createElement("button");
    no.type = "button";
    no.textContent = "ولا واحد منهم";
    no.style.cssText = "display:block;width:100%;margin-top:4px;padding:11px;border:0;border-radius:10px;" +
      "background:var(--line,#eee);color:var(--text);font-family:inherit;font-size:14px;min-height:46px";
    no.onclick = function () { back.remove(); if (onNone) onNone(); };
    box.appendChild(no);
    back.appendChild(box);
    back.onclick = function (e) { if (e.target === back) { back.remove(); if (onNone) onNone(); } };
    document.body.appendChild(back);
  }
  /** زي offerImport لكن بالبحث التقريبي وقائمة اختيار لو في أكتر من جهة اتصال. */
  function offerImportByName(name, phone, onFound, onNotFound) {
    if (!native || !AndroidContacts.search || !AndroidContacts.details) {
      return offerImport(name, phone, onFound, onNotFound);
    }
    if (!AndroidContacts.hasPermission || !AndroidContacts.hasPermission()) {
      ensurePermission();
      if (onNotFound) onNotFound();
      return;
    }
    var hits = (matchesByName(name) || []).map(detailsOf)
      .filter(function (d) { return d.phones.length || d.emails.length; });
    if (!hits.length) return offerImport(name, phone, onFound, onNotFound);
    if (hits.length === 1) {
      var d = hits[0], NL = String.fromCharCode(10);
      Ask.confirm("لقينا «" + d.name + "» في جهات الاتصال", {
        detail: (d.phones.length ? "الهاتف: " + d.phones.join("، ") + NL : "") +
          (d.emails.length ? "البريد: " + d.emails.join("، ") + NL : "") + NL +
          "نستورد بياناته للنموذج؟ (تقدر تعدّلها قبل الحفظ)",
        ok: "استيراد", danger: false
      }, function () { onFound(d); }, onNotFound);
      return;
    }
    pickSheet(hits, onFound, onNotFound);
  }

  /** يضيف/يزامن جهة اتصال جديدة بعد الحفظ — صامتة، لا تُنبّه المستخدم. */
  function syncOne(name, phone, email, label) {
    if (!native || !AndroidContacts.save || !name) return;
    if (!AndroidContacts.hasPermission || !AndroidContacts.hasPermission()) {
      ensurePermission();
      return;   // المرة القادمة بعد منح الصلاحية ستنجح
    }
    /* لا تُضاف لو موجودة بالفعل بنفس الاسم أو الرقم */
    try {
      var raw = AndroidContacts.find(name, phone || "");
      var data = raw ? JSON.parse(raw) : null;
      if (data && data.found) return;
    } catch (e) { }
    try { AndroidContacts.save(name, phone || "", email || "", label || "موكل"); }
    catch (e) { }
  }

  function syncClient(name, phone, email) { syncOne(name, phone, email, "موكل"); }
  function syncLawyer(name, phone, email) { syncOne(name, phone, email, "محامي"); }

  w.ContactsSync = {
    ensurePermission: ensurePermission,
    offerImport: offerImport,
    offerImportByName: offerImportByName,
    syncClient: syncClient,
    syncLawyer: syncLawyer
  };
})(window);
