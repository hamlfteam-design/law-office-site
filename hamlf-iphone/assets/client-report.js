/* =============================================================================
   تقرير مستجدات الموكل (مهمة 21 — خيار أ): PDF بقضاياه المتداولة وتتابع جلساتها،
   ورسالة جاهزة تُفتح في واتساب/البريد لرقمه/إيميله المسجَّل، وأنت تضغط «إرسال»
   بنفسك (لا سيرفر ولا إرسال تلقائي). كل إرسال يسبقه تأكيد.
   ============================================================================= */
(function (w) {
  "use strict";

  var OFFICE = "مكتب د. حسن عبد المنعم حسن للمحاماة";

  function norm(t) { return w.lawyerNorm(t); }
  function ar(n) { return String(n == null ? "" : n).replace(/[0-9]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩"[+d]; }); }
  function dmy(iso) { var p = String(iso || "").split("-"); return p.length < 3 ? "" : ar(p[0] + "/" + p[1] + "/" + p[2]); }
  function todayLabel() {
    var d = new Date();
    return ar(d.getFullYear() + "/" + ("0" + (d.getMonth() + 1)).slice(-2) + "/" + ("0" + d.getDate()).slice(-2));
  }

  /** رقم مصري/دولي → أرقام لاتينية بلا صفر بادئ (20xxxxxxxxxx) */
  function waNumber(raw) {
    var d = String(raw || "").replace(/[٠-٩]/g, function (x) { return x.charCodeAt(0) - 0x0660; }).replace(/\D/g, "");
    if (d.indexOf("00") === 0) d = d.slice(2);
    else if (/^0\d{10}$/.test(d)) d = "20" + d.slice(1);
    return d;
  }

  function partyNames(txt) {
    return String(txt || "").split("·").map(function (p) { return p.replace(/\([^)]*\)/g, "").trim(); }).filter(Boolean);
  }

  /* فهرس: اسم الموكل المطبَّع ← قضاياه المتداولة. قبل كده casesOf كانت بتقرا
     كل القضايا (~٢٥٠٠) وتطبّع أسماءها من الأول لكل كارت في قائمة الموكلين
     (١٥٠ مرة في الرسمة الواحدة) — صفحة الموكلين كانت بتهنّج ~٦ ثواني بعد ما
     تفتح. الفهرس بيتبني مرة ويتعاد بعد ثواني قليلة، فأي قضية جديدة تبان. */
  var _idx = null, _idxAt = 0;
  function caseIndex() {
    if (_idx && Date.now() - _idxAt < 4000) return _idx;
    var ended = norm("منتهية"), map = {};
    CaseFile.all().forEach(function (c, pos) {
      if (c.finished || c.linkedTo || c.fileType === "عمل") return;
      if (norm(c.status || "") === ended) return;
      partyNames(c.clients).forEach(function (n) {
        var nk = norm(n);
        if (!nk || /^ورثه\./.test(nk)) return;
        var arr = map[nk] || (map[nk] = []);
        if (!arr.length || arr[arr.length - 1].c !== c) arr.push({ c: c, pos: pos });
      });
    });
    _idx = map; _idxAt = Date.now();
    return map;
  }

  /** القضايا المتداولة للموكل (الاسم في القضية قد يكون مختصراً لثلاث كلمات):
      اسم الطرف = اسم الموكل كامل، أو أول كام كلمة منه. */
  function casesOf(client) {
    var k = norm(client.name);
    if (!k || !w.CaseFile) return [];
    var map = caseIndex(), words = k.split(" "), hits = [], seen = {};
    for (var i = 1; i <= words.length; i++) {
      (map[words.slice(0, i).join(" ")] || []).forEach(function (h) {
        if (!seen[h.pos]) { seen[h.pos] = 1; hits.push(h); }
      });
    }
    /* نفس ترتيب القضايا الأصلي زي قبل الفهرس */
    return hits.sort(function (a, b) { return a.pos - b.pos; }).map(function (h) { return h.c; });
  }

  function contactOf(client) {
    var ct = (w.ClientsPOA && ClientsPOA.contacts) ? ClientsPOA.contacts(client) : { phones: [], emails: [] };
    return { phone: ct.phones && ct.phones[0] ? waNumber(ct.phones[0]) : "", email: ct.emails && ct.emails[0] ? ct.emails[0] : "" };
  }

  function caseTitle(c) {
    return "دعوى " + ar(c.caseNo || "—") + (c.caseYear ? " لسنة " + ar(c.caseYear) : "") +
      (c.courtName ? " — " + c.courtName : "");
  }

  function summaryLines(cases) {
    return cases.map(function (c) {
      var nx = CaseFile.nextSession(c), ls = CaseFile.lastSession(c);
      var t = "• " + caseTitle(c);
      if (nx) t += "\n   الجلسة القادمة: " + dmy(nx.date);
      if (ls) t += "\n   آخر جلسة (" + dmy(ls.date) + "): " + (CaseFile.resultOf(ls) || "بدون قرار");
      return t;
    }).join("\n");
  }

  function messageText(client, cases) {
    return "السيد/ " + client.name + "\nتحية طيبة، وبعد،\n" +
      "مرفق تقرير بمستجدات قضاياكم المتداولة لدينا حتى تاريخ " + todayLabel() + " (" + ar(cases.length) + " قضية):\n\n" +
      summaryLines(cases) + "\n\nمع خالص التحية،\n" + OFFICE;
  }

  /** يبني PDF (Promise → {b64, name}) */
  function buildPdf(client, cases) {
    var blocks = [
      { center: "تقرير بمستجدات قضايا الموكل" },
      { center: client.name + " — بتاريخ " + todayLabel() }
    ];
    cases.forEach(function (c) {
      var rows = [];
      if (c.fileNo) rows.push(["رقم الملف بالمكتب", ar(c.fileNo)]);
      if (c.courtName) rows.push(["المحكمة", [c.courtName, c.circuit].filter(Boolean).join(" — ")]);
      if (c.courtLevel) rows.push(["درجة التقاضي", c.courtLevel]);
      if (c.status) rows.push(["حالة الدعوى", c.status]);
      if (c.subject) rows.push(["الموضوع", c.subject]);
      if (c.clients) rows.push(["الموكلون", c.clients]);
      if (c.opponents) rows.push(["الخصوم", c.opponents]);
      var nx = CaseFile.nextSession(c);
      if (nx) rows.push(["الجلسة القادمة", dmy(nx.date) + (c.hall ? " — قاعة " + ar(c.hall) : "")]);
      blocks.push({ h: caseTitle(c) }, { table: { headers: ["الحقل", "البيان"], widths: [1, 3], rows: rows } });
      var ss = CaseFile.sessionsDesc(c).slice(0, 12);
      if (ss.length) blocks.push({ table: { headers: ["تاريخ الجلسة", "ما تم بها من قرارات"], widths: [1.2, 4],
        rows: ss.map(function (s) { return [dmy(s.date), CaseFile.resultOf(s) || "بدون قرار"]; }) } });
    });
    return PdfDoc.build(blocks).then(function (pages) {
      var pdf = PdfBuild.fromJpegs(pages);
      if (!pdf) throw new Error("تعذّر بناء الـPDF");
      return { b64: PdfBuild.toBase64(pdf), name: "تقرير-" + client.name.split(" ").slice(0, 2).join("-") + ".pdf" };
    });
  }

  /** via: "whatsapp" | "email" — بعد التأكيد يُفتح التطبيق برسالة جاهزة ومرفق */
  function send(client, via, done) {
    var cases = casesOf(client), ct = contactOf(client);
    if (!cases.length) { alert("لا توجد قضايا متداولة لهذا الموكل."); return; }
    var to = via === "email" ? ct.email : ct.phone;
    if (!to) { alert(via === "email" ? "لا يوجد بريد مسجَّل لهذا الموكل." : "لا يوجد رقم واتساب مسجَّل لهذا الموكل."); return; }
    var go = function () {
      buildPdf(client, cases).then(function (f) {
        var text = messageText(client, cases);
        if (via === "whatsapp") {
          if (w.AndroidShare && AndroidShare.sendWhatsApp) AndroidShare.sendWhatsApp(to, f.name, f.b64, "application/pdf", text);
          else { Share.sharePdf(f.b64, f.name); window.open("https://wa.me/" + to + "?text=" + encodeURIComponent(text), "_blank"); }
        } else {
          if (w.AndroidShare && AndroidShare.sendEmail) AndroidShare.sendEmail(to, "تقرير بمستجدات قضاياكم — " + OFFICE, text, f.name, f.b64, "application/pdf");
          else { Share.sharePdf(f.b64, f.name); window.location.href = "mailto:" + encodeURIComponent(to) + "?subject=" + encodeURIComponent("تقرير بمستجدات قضاياكم") + "&body=" + encodeURIComponent(text); }
        }
        if (done) done();
      }).catch(function (e) { alert("تعذّر تجهيز التقرير: " + (e && e.message ? e.message : e)); });
    };
    var detail = "الموكل: " + client.name + "\nالمستلم: " + (via === "email" ? ct.email : ar(to)) +
      "\nالقضايا المتداولة: " + ar(cases.length) + "\n\nسيُفتح " + (via === "email" ? "البريد" : "واتساب") +
      " برسالة وملف PDF جاهزين، وتضغط أنت «إرسال».";
    if (w.Ask && Ask.confirm) Ask.confirm("إرسال تقرير المستجدات؟", { ok: "تجهيز الإرسال", detail: detail }, go);
    else if (confirm(detail)) go();
  }

  var PORTAL = "https://hamlf.com/portal/";
  function welcomeText(client, ct) {
    return "السيد/ " + client.name + "\n" +
      "تحية طيبة، وبعد،\n" +
      "يسعدنا انضمامكم لبوابة الموكلين الخاصة بـ" + OFFICE + ".\n" +
      "يمكنكم من خلالها متابعة قضاياكم ومواعيد جلساتها ومستنداتها في أي وقت.\n\n" +
      "طريقة الدخول:\n" +
      "1) افتحوا الرابط: " + PORTAL + "\n" +
      "2) اكتبوا بريدكم الإلكتروني المسجَّل لدينا" + (ct.email ? " (" + ct.email + ")" : "") + "\n" +
      "3) أنشئوا كلمة سر خاصة بكم (6 أحرف على الأقل) وادخلوا.\n\n" +
      "وللاستفسار نحن في خدمتكم.\n" +
      "مع خالص التحية،\n" + OFFICE;
  }

  /** رسالة ترحيب (بلا PDF) بواتساب/بريد الموكل — بعد تأكيد، وأنت تضغط «إرسال» */
  function sendWelcome(client, via, done) {
    var ct = contactOf(client), to = via === "email" ? ct.email : ct.phone;
    if (!to) { alert(via === "email" ? "لا يوجد بريد مسجَّل لهذا الموكل." : "لا يوجد رقم واتساب مسجَّل لهذا الموكل."); return; }
    if (!ct.email && !confirm("لا يوجد بريد إلكتروني مسجَّل لهذا الموكل، والدخول للبوابة يتم بالبريد. تُرسل الرسالة رغم ذلك؟")) return;
    var text = welcomeText(client, ct);
    var go = function () {
      if (via === "whatsapp") {
        if (w.AndroidShare && AndroidShare.sendWhatsApp) AndroidShare.sendWhatsApp(to, "", "", "", text);
        else window.open("https://wa.me/" + to + "?text=" + encodeURIComponent(text), "_blank");
      } else {
        if (w.AndroidShare && AndroidShare.sendEmail) AndroidShare.sendEmail(to, "مرحباً بكم في بوابة موكلي " + OFFICE, text, "", "", "");
        else window.location.href = "mailto:" + encodeURIComponent(to) + "?subject=" + encodeURIComponent("مرحباً بكم في بوابة الموكلين") + "&body=" + encodeURIComponent(text);
      }
      if (done) done();
    };
    var detail = "الموكل: " + client.name + "\n" +
      "المستلم: " + (via === "email" ? ct.email : ar(to)) + "\n\n" +
      "رسالة ترحيب برابط البوابة (" + PORTAL + ") وخطوات إنشاء كلمة السر. تُفتح جاهزة وتضغط أنت «إرسال».";
    if (w.Ask && Ask.confirm) Ask.confirm("إرسال رسالة الترحيب؟", { ok: "تجهيز الإرسال", detail: detail }, go);
    else if (confirm(detail)) go();
  }

  /** كل الموكلين الذين لهم قضايا متداولة وبيان اتصال */
  function eligible() {
    return (w.ClientsPOA ? ClientsPOA.all() : []).map(function (c) {
      return { client: c, n: casesOf(c).length, ct: contactOf(c) };
    }).filter(function (x) { return x.n > 0 && (x.ct.phone || x.ct.email); })
      .sort(function (a, b) { return b.n - a.n; });
  }

  /** لوحة «تقارير الموكلين»: صف لكل موكل بزرّي واتساب/بريد + نسخ أرقام قائمة البث */
  function openPanel() {
    var list = eligible(), sent = {};
    var wrap = document.createElement("div");
    wrap.setAttribute("data-modal", "1"); wrap.setAttribute("data-nosave", "1");
    wrap.style.cssText = "position:fixed;inset:0;background:rgba(20,14,8,.55);z-index:10040;display:flex;align-items:flex-end;justify-content:center";
    var box = document.createElement("div");
    box.style.cssText = "background:var(--card,#fff);border-radius:16px 16px 0 0;padding:16px;width:100%;max-width:560px;direction:rtl;color:var(--text);max-height:90vh;overflow-y:auto";
    function el(t, css, txt) { var e = document.createElement(t); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; }
    box.appendChild(el("div", "font-family:var(--f-title);font-size:17px;margin-bottom:4px", "تقارير مستجدات الموكلين"));
    box.appendChild(el("div", "font-size:12.5px;color:var(--muted);margin-bottom:10px;line-height:1.8",
      ar(list.length) + " موكل لهم قضايا متداولة وبيان اتصال. كل زر يجهّز PDF ورسالة ويفتح التطبيق، وأنت تضغط «إرسال» بنفسك."));
    var bc = el("button", "width:100%;min-height:44px;margin-bottom:10px;border:1px dashed var(--brand);border-radius:9px;background:transparent;color:var(--brand);font-family:inherit;font-size:13.5px",
      "📋 نسخ أرقام واتساب الموكلين (لإنشاء قائمة بث)");
    bc.type = "button";
    bc.onclick = function () {
      var nums = list.filter(function (x) { return x.ct.phone; }).map(function (x) { return "+" + x.ct.phone + "  " + x.client.name; }).join("\n");
      if (w.Share && Share.shareText) Share.shareText(nums, { name: "أرقام-الموكلين" });
    };
    box.appendChild(bc);
    list.forEach(function (x) {
      var row = el("div", "border:1px solid var(--line,#ddd);border-radius:10px;padding:9px 11px;margin-bottom:8px");
      row.appendChild(el("div", "font-size:14px;margin-bottom:6px", x.client.name + "  ·  " + ar(x.n) + " قضية"));
      var act = el("div", "display:flex;gap:8px");
      function mk(label, via, ok) {
        var b = el("button", "flex:1;min-height:42px;border-radius:8px;border:1px solid var(--brand);background:transparent;color:var(--brand);font-family:inherit;font-size:13px" + (ok ? "" : ";opacity:.35"), label);
        b.type = "button"; b.disabled = !ok;
        b.onclick = function () { send(x.client, via, function () { sent[x.client.id] = 1; b.textContent = "✔ " + label; }); };
        return b;
      }
      act.appendChild(mk("واتساب", "whatsapp", !!x.ct.phone));
      act.appendChild(mk("بريد", "email", !!x.ct.email));
      row.appendChild(act);
      var act2 = el("div", "display:flex;gap:8px;margin-top:6px");
      function mk2(label, via, ok) {
        var b = el("button", "flex:1;min-height:38px;border-radius:8px;border:1px dashed var(--line,#bbb);background:transparent;color:var(--muted);font-family:inherit;font-size:12.5px" + (ok ? "" : ";opacity:.35"), label);
        b.type = "button"; b.disabled = !ok;
        b.onclick = function () { sendWelcome(x.client, via, function () { b.textContent = "✔ " + label; }); };
        return b;
      }
      act2.appendChild(mk2("👋 ترحيب واتساب", "whatsapp", !!x.ct.phone));
      act2.appendChild(mk2("👋 ترحيب بريد", "email", !!x.ct.email));
      row.appendChild(act2);
      box.appendChild(row);
    });
    var close = el("button", "width:100%;min-height:46px;margin-top:6px;border:0;background:transparent;color:var(--muted);font-family:inherit;font-size:14px", "إغلاق");
    close.type = "button"; close.onclick = function () { wrap.remove(); };
    box.appendChild(close);
    wrap.appendChild(box); document.body.appendChild(wrap);
  }

  /* الوحدة تُحمَّل بعد أول رسم لقائمة الموكلين — أعد الرسم لتظهر أزرار التقرير */
  setTimeout(function () { if (w.ClientsPOA && typeof w.ClientsPOA.onChange === "function") w.ClientsPOA.onChange(); }, 0);

  /* طلب البطاقة المحدّثة — لما «البطاقة سارية حتى» تقرّب أو تعدّي */
  function idRenewalText(client) {
    var st = w.ClientsPOA && ClientsPOA.idExpiryState ? ClientsPOA.idExpiryState(client) : null;
    var when = st ? ar(st.iso.split("-").reverse().join("/")) : "";
    return "السيد/ " + client.name + "\n" +
      "تحية طيبة، وبعد،\n" +
      (st && st.days < 0
        ? "نحيط سيادتكم علماً بأن بطاقة الرقم القومي المسجّلة لدينا انتهت صلاحيتها بتاريخ " + when + ".\n"
        : "نحيط سيادتكم علماً بأن بطاقة الرقم القومي المسجّلة لدينا تنتهي صلاحيتها بتاريخ " + when + ".\n") +
      "نرجو التكرم بإرسال صورة واضحة من البطاقة المحدّثة (الوجه والظهر) لاستكمال ملفكم لدى المكتب.\n\n" +
      "مع خالص التحية،\n" + OFFICE;
  }
  /** رسالة طلب البطاقة المحدّثة بواتساب/بريد الموكل — بعد تأكيد، وأنت تضغط «إرسال» */
  function sendIdRenewal(client, via) {
    var ct = contactOf(client), to = via === "email" ? ct.email : ct.phone;
    if (!to) { alert(via === "email" ? "لا يوجد بريد مسجَّل لهذا الموكل." : "لا يوجد رقم واتساب مسجَّل لهذا الموكل."); return; }
    var text = idRenewalText(client);
    var go = function () {
      if (via === "whatsapp") {
        if (w.AndroidShare && AndroidShare.sendWhatsApp) AndroidShare.sendWhatsApp(to, "", "", "", text);
        else window.open("https://wa.me/" + to + "?text=" + encodeURIComponent(text), "_blank");
      } else {
        if (w.AndroidShare && AndroidShare.sendEmail) AndroidShare.sendEmail(to, "طلب صورة البطاقة المحدّثة — " + OFFICE, text, "", "", "");
        else window.location.href = "mailto:" + encodeURIComponent(to) + "?subject=" + encodeURIComponent("طلب صورة البطاقة المحدّثة") + "&body=" + encodeURIComponent(text);
      }
    };
    var detail = "الموكل: " + client.name + "\nالمستلم: " + (via === "email" ? ct.email : ar(to)) +
      "\n\nرسالة تطلب صورة البطاقة المحدّثة. تُفتح جاهزة وتضغط أنت «إرسال».";
    if (w.Ask && Ask.confirm) Ask.confirm("طلب البطاقة المحدّثة من الموكل؟", { ok: "تجهيز الإرسال", detail: detail, danger: false }, go);
    else if (confirm(detail)) go();
  }

  w.ClientReport = { casesOf: casesOf, contactOf: contactOf, send: send, sendWelcome: sendWelcome, welcomeText: welcomeText, eligible: eligible, openPanel: openPanel, buildPdf: buildPdf, messageText: messageText,
                     idRenewalText: idRenewalText, sendIdRenewal: sendIdRenewal };
})(window);
