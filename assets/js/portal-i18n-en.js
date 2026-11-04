/* =============================================================================
   قاموس الترجمة للإنجليزية لبيانات القضايا — لبوابة الموكلين الأجانب والـPDF.

   ما يقرؤه الموكل الأجنبي ويطبعه (بوابة hamlf.com/en/portal و PDF) يجب ألّا يحوي كلمة عربية.
   الترجمة هنا في المتصفح لحظة العرض/الطباعة فقط — لا تُخزَّن في قاعدة البيانات إطلاقاً.

   القاموس يُطابَق بعد التطبيع (lawyerNorm) فلا يفرّق بين ه/ة وأ/ا وأمثالها.
   ما لا يوجد له ترجمة يُسجَّل في c.enMissing ويظهر في البوابة «Translation pending»
   بدل العربي — ثم تُضاف ترجمته هنا لو مصطلح عام.
   ممنوع هنا أي اسم شخص أو جهة أو رقم قضية أو مبلغ: الملف منشور ومن غير تسجيل دخول.
   ============================================================================= */
(function (w) {
  "use strict";

  var D = {
    /* درجات التقاضي */
    "استئناف عالي": "Court of Appeal", "جزئي": "Summary Court", "ابتدائي": "Court of First Instance",
    "نقض": "Court of Cassation", "قضاء إداري": "Administrative Judiciary Court",
    /* الحالة */
    "جديدة": "New", "محجوزة للحكم": "Reserved for judgment", "متداولة": "Pending", "منتهية": "Concluded",
    "تنفيذ أحكام": "Enforcement of judgments",
    /* نوع الدعوى */
    "اقتصاديه": "Economic", "مدنى جزئى": "Civil (Summary)", "عمال كلى": "Labor (First Instance)",
    "الطعون المدنية": "Civil appeals (Cassation)", "مدنى كلى": "Civil (First Instance)", "مدنى": "Civil",
    "جنح جزئي": "Misdemeanor (Summary)", "إلغاء قرار إداري": "Annulment of an administrative decision",
    "مدنى حكومه": "Civil (Government)",
    /* المحاكم */
    "محكمة القاهرة الاقتصادية": "Cairo Economic Court", "محكمة السيدة زينب الجزئية": "Sayeda Zeinab Summary Court",
    "محكمة شمال القاهرة الابتدائية": "North Cairo Court of First Instance", "محكمة النقض": "Court of Cassation",
    "محكمة القاهرة الجديدة الابتدائية": "New Cairo Court of First Instance",
    "ماموريه استئناف شمال القاهره": "North Cairo Court of Appeal", "محكمة استئناف القاهرة": "Cairo Court of Appeal",
    "محكمة دار السلام الجزئية": "Dar El Salam Summary Court",
    "محكمة القضاء الإداري — القاهرة": "Administrative Judiciary Court — Cairo",
    "محكمة مدينة نصر الجزئية": "Nasr City Summary Court", "محكمة الخانكة الجزئية": "El Khanka Summary Court",
    /* الدوائر */
    "٣١ مدني جزئي السيدة زينب": "Circuit 31 — Civil (Summary), Sayeda Zeinab",
    "35 عمال كلى الاربعاء": "Circuit 35 — Labor (First Instance), Wednesdays",
    "جنح أول مدينة نصر": "Nasr City First Misdemeanor Circuit", "٧ اقتصادي": "Circuit 7 — Economic",
    "د/ الثانيه عشر مدنى": "Circuit 12 — Civil",
    "الدائره 28 مدنى جنوب وجيزه 9 تعويضات سابقا": "Circuit 28 — Civil, South Giza (formerly Circuit 9 — Compensation)",
    "جنح دار السلام": "Dar El Salam Misdemeanor Circuit", "٥ مدني كلي": "Circuit 5 — Civil (First Instance)",
    "د/ التاسعه مدنى": "Circuit 9 — Civil", "٢١ مدني": "Circuit 21 — Civil",
    "جنح مدينة نصر أول": "Nasr City First Misdemeanor Circuit", "جنح الدقي": "Dokki Misdemeanor Circuit",
    "د / 3 الخميس مدنى حكومه": "Circuit 3 — Civil (Government), Thursdays",
    /* المحامي */
    "حسن عبد المنعم حسن": "Dr. Hassan Abdelmoneim Hassan",
    /* نوع الجلسة */
    "تحضير": "Preparation", "حجز للحكم": "Reserved for judgment", "مرافعة": "Pleading", "حكم": "Judgment",
    /* صفات الأطراف */
    "مدعي": "Plaintiff", "مدعى عليه": "Defendant", "طاعن": "Cassation appellant", "مطعون ضده": "Cassation respondent",
    "مجني عليه": "Victim", "متهم": "Accused", "مستأنف": "Appellant", "مستأنف ضده": "Appellee",
    "مدعي بالحق المدني": "Civil claimant", "ملتمس": "Petitioner (reconsideration)",
    "ملتمس ضده": "Respondent (reconsideration)",
    /* الموضوع */
    "دعوى حبس الاقساط والثمن والتعويض": "Action to withhold instalments and price, and for compensation",
    "براءة ذمة من رسوم قضائية": "Discharge from court fees",
    "مطالبة بمستحقات وتعويض عن الفصل التعسفي": "Claim for dues and compensation for wrongful dismissal",
    "إلغاء توكيل وفسخ عقد بيع سيارة": "Cancellation of a power of attorney and rescission of a car sale contract",
    "تعويض عن عن الإخلال بالالتزام التعاقدي وإساءة استعمال حق التقاضي": "Compensation for breach of contractual obligation and abuse of the right to litigate",
    "استئناف تعويض عن المسئولية العقدية": "Appeal — compensation for contractual liability",
    "جنحة مباشرة نصب وتبديد": "Direct misdemeanor action — fraud and misappropriation",
    "نقض بطلان عقد البيع لصوريته": "Cassation — nullity of a sale contract as a sham",
    "الزام بتقديم أصل عقد البيع للطعن عليه بالتزوير": "Order to produce the original sale contract to challenge it as forged",
    "استئناف رفض طرد للغصب": "Appeal — dismissal of an eviction-for-usurpation claim", "ف": "—",
    "استحقاق عقار": "Claim of entitlement to real estate",
    "طعن على قرار الرسوم والتعويض عنه": "Challenge to the fees decision and compensation for it",
    "جنحة شيك بدون رصيد": "Bounced-cheque misdemeanor",
    "مباشرة امتناع عن تنفيذ امر قضائي": "Direct action — refusal to enforce a court order",
    "استئناف عدم اعتداد بحكم": "Appeal — non-recognition of a judgment",
    "استئناف حكم الزام بمبلغ": "Appeal — judgment ordering payment of a sum",
    /* قرارات الجلسات */
    "أول جلسة\nلاخطار الشركة المدعى عليها بالجلسة": "First hearing — to notify the defendant company of the hearing",
    "لإعلان الخصم بخطاب مسجل بعلم الوصول بالحضور لجلسة التحضير": "To notify the opponent by registered letter with return receipt to attend the preparation hearing",
    "للاطلاع كطلب الحاضر عن الشركة": "For review, at the request of the company's representative",
    "تاجيل كطلب الشركة": "Adjourned at the company's request", "مد اجل للحكم": "Judgment deferred",
    "أول جلسة": "First hearing", "لورود أصل الصحيفة": "Pending receipt of the original statement of claim",
    "لتقديم صورة رسمية من الأحكام": "To submit an official copy of the judgments",
    "أول جلسة بعد التجديد من الشطب - لتقديم صورة رسمية من الأحكام": "First hearing after reinstatement from striking-off — to submit an official copy of the judgments",
    "للاعلان بورود تقرير الخبير": "To notify of the arrival of the expert's report",
    "أول حضور لنا": "Our first appearance",
    "لادخال خصوم جدد وتصحيح الطلبات": "To add new parties and amend the requests",
    "للمستندات وصرحت": "For documents; leave granted",
    "لاتخاذ إجراءات الطعن بالتزوير": "To take forgery-challenge procedures",
    "لورود صحيفة شواهد الطعن بالتزوير ولادخال خصوم جدد": "Pending the forgery-challenge evidence sheet, and to add new parties",
    "حكم": "Judgment", "في حالة عدم سداد الأمانة": "In case the deposit is not paid",
    "لورود تقرير الخبير": "Pending the expert's report",
    "لإعادة إعلان الرابع وإعلان الخامس والسادس بأصل الصحيفة والمستندات وصرحت": "To re-notify the fourth party and notify the fifth and sixth with the original claim and documents; leave granted",
    "للإعلان بالطلب العارض": "To notify of the incidental request",
    "للإعلان بالدعوى الفرعية من المدعى عليها": "To notify of the defendant's counterclaim",
    "لتقديم الأصول المجحودة من الطرفين": "To submit the originals disputed by both parties", "تحقيق": "Investigation",
    "مرافعة للمذكرات": "Pleading, then memoranda",
    "لإعلان باقي الخصوم بانتهاء حكم التحقيق والإعادة للمرافعة": "To notify the remaining parties that the investigation ruling has ended and the case returns to pleading",
    "لتقديم أصول المستندات المجحودة من الخصم والمذكرات الختامية": "To submit the originals of the documents disputed by the opponent, and closing memoranda",
    "رفض الدعوى": "Action dismissed", "اول جلسة": "First hearing",
    "لإعلان الأول والثالث والخامس بأصل الصحيفة ولنظره مع آخر الارتباط": "To notify the first, third and fifth parties with the original claim, and to hear it together with the related case",
    "للاطلاع من المستأنف ضدها على حافظة المستندات والرد على الطلبات الواردة بالمذكرة": "For the appellee to review the documents file and reply to the requests in the memorandum",
    "قبول ورفض وتأييد": "Accepted in part, dismissed in part, and upheld",
    "أول جلسة بعد الإحالة من شمال القاهرة": "First hearing after referral from North Cairo",
    "للاعلان بالاحالة": "To notify of the referral", "أول جلسة خبراء": "First experts' session",
    "لورود التقرير": "Pending the report",
    "للمستندات والمذكرات للرد على الحكم التمهيدي": "For documents and memoranda in response to the preparatory judgment",
    "لورود التقرير ( التقرير ورد )": "Pending the report (report received)",
    "للإعلان بورود التقرير": "To notify of the arrival of the report",
    "استجواب المدعي في شأن تعديل الطلبات": "Questioning of the plaintiff regarding the amendment of requests",
    "للمستندات والمذكرات": "For documents and memoranda",
    "للاطلاع  ولتصحيح شكل استئناف الخصم وضم الاستئنافين للارتباط": "For review, to correct the form of the opponent's appeal, and to join the two appeals as related",
    "لاعادة الاعلان من جانب الخصم": "For re-notification by the opponent", "للمذكرات الختامية": "For closing memoranda",
    "في حالة عدم السداد": "In case of non-payment",
    "لاتخاذ إجراءات الدعوى الدستورية وصرحت المستأنف": "To take constitutional-action procedures; leave granted to the appellant",
    "حكم وقف تعليقي لحين الفصل في الدستورية": "Judgment suspending the case pending the constitutional ruling",
    "إعادة للمرافعة": "Returned to pleading", "للاطلاع على التقرير": "To review the report",
    "حكم - الزام": "Judgment — ordering payment", "اول جلسة موضوعي": "First hearing on the merits",
    "مؤجلة اداري": "Adjourned administratively", "لضم ملف الدعوى": "To join the case file",
    "غرفة مشورة عدم قبول": "Chambers session — inadmissible",
    "أول جلسة موضوعي - نقض للمرة الثانية": "First hearing on the merits — second cassation",
    "لضم المفردات": "To attach the case records",
    "حكم ومذكرات في اسبوع مناصفة": "Judgment; memoranda within one week, split equally", "استجواب": "Questioning",
    "أول جلسة بعد الاحالة": "First hearing after referral",
    "للمستندات وإعادة الاعلان وصرحت": "For documents and re-notification; leave granted",
    "اول جلسة شطب": "First hearing — struck off",
    "اول جلسة بعد تجديد الشطب": "First hearing after reinstatement from striking-off", "للسابق": "As previously",
    "أول جلسة التماس": "First hearing of the petition",
    "لإعلان الاول بالارشاد ولإعادة اعلان الباقيين وللمفردات": "To notify the first party by guidance and re-notify the others, and for the case records",
    "للتحري عن محل إقامة الاول ومن الأحوال المدنية ولإعلان الاول في ضوء ذلك وللمفردات": "To investigate the first party's residence (and via the Civil Status Office), notify him accordingly, and for the case records",
    "لإعادة الاعلان وتقديم أصل التحري": "To re-notify and submit the original investigation",
    "لإعادة الاعلان للملتمس ضده الأول": "To re-notify the first respondent to the petition",
    "للمفردات": "For the case records",
    "لإعادة الاعلان ( أول حضور لنا ) شطب": "To re-notify (our first appearance) — struck off",
    "للمستندات والمذكرات ( أول حضور لنا )": "For documents and memoranda (our first appearance)",
    "أول جلسة شق عاجل": "First hearing — urgent-relief application",
    "للاطلاع من الدولة والتصحيح الطلبات من جانبنا لتشمل القرار الجديد": "For the State to review, and for us to amend our requests to cover the new decision",
    "عدم اختصاص نوعي": "Lack of subject-matter jurisdiction",
    "قبول والغاء امر تقدير الرسوم": "Accepted, and the fee assessment order annulled", "لإعادة الاعلان": "To re-notify",
  };

  function norm(t) {
    return String(t == null ? "" : t).replace(/[‎‏‪-‮]/g, "")
      .replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x0660; })
      .replace(/[ً-ْٰـ]/g, "").replace(/[أإآٱ]/g, "ا")
      .replace(/ؤ/g, "و").replace(/ئ/g, "ي").replace(/ء/g, "").replace(/ى/g, "ي")
      .replace(/ة/g, "ه").replace(/\s+/g, " ").trim().toLowerCase();
  }
  var IDX = null;
  function idx() {
    if (IDX) return IDX;
    IDX = {};
    Object.keys(D).forEach(function (k) { IDX[norm(k)] = D[k]; });
    return IDX;
  }
  function has(t) { return /[؀-ۿ]/.test(String(t || "")); }
  /** ترجمة نص واحد: undefined لو غير موجود */
  function tr(t) {
    t = String(t == null ? "" : t).trim();
    if (!t) return "";
    var v = idx()[norm(t)];
    return v == null ? undefined : v;
  }
  function parties(txt, miss) {
    return String(txt || "").split("·").map(function (p) {
      p = p.trim(); if (!p) return null;
      var m = p.match(/^([\s\S]*?)\s*\(([^)]*)\)\s*$/), name = m ? m[1].trim() : p, cap = m ? m[2].trim() : "";
      var en = tr(name); if (en === undefined) { miss.push(name); en = null; }
      var ec = cap ? tr(cap) : ""; if (ec === undefined) { miss.push(cap); ec = null; }
      return { name: en, cap: ec };
    }).filter(Boolean);
  }
  /** يبني كائن الإنجليزية لقضية (لا يعدّل القضية) */
  function forCase(c) {
    var miss = [], en = {};
    ["courtLevel", "status", "caseType", "courtName", "circuit", "subject", "lawyer", "notes"].forEach(function (f) {
      var v = c[f]; if (!String(v || "").trim()) return;
      var t = tr(v);
      if (t === undefined) { if (has(v)) miss.push(String(v).trim()); en[f] = null; } else en[f] = t;
    });
    en.clients = parties(c.clients, miss);
    en.opponents = parties(c.opponents, miss);
    en.sessions = (c.sessions || []).map(function (s) {
      var r = s.raw || {}, o = {};
      var typ = r.type; if (String(typ || "").trim()) { var a = tr(typ); if (a === undefined) { miss.push(String(typ).trim()); a = null; } o.type = a; }
      var dec = r.result || r.decision || r["for"] || r.reason;
      if (String(dec || "").trim()) { var b = tr(dec); if (b === undefined) { miss.push(String(dec).trim()); b = null; } o.text = b; }
      return o;
    });
    return { en: en, missing: miss.filter(function (x, i, a) { return x && a.indexOf(x) === i; }) };
  }
  w.I18nEn = { tr: tr, forCase: forCase, DICT: D };
})(window);
