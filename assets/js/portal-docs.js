/* =============================================================================
   «📎 مستندات قضاياي» في بوابة الموكلين (طلب المستخدم ٦-١٠-٢٠٢٦)
   الموكل داخل بحسابه ← يطلب كود على إيميله (صالح ١٠ دقايق، مرة واحدة) ← يكتبه ←
   «جلسة مشاهدة» لكل قضاياه (بتتقفل بعد ٣٠ دقيقة خمول أو ٤ ساعات أو بالخروج) ←
   المستند بيتجاب من درايف المكتب عن طريق «البوّاب» (Apps Script) ويتعرض في
   القارئ (pdfview.js) بعلامة مائية باسمه والتاريخ — من غير تحميل ولا رابط درايف.
   ============================================================================= */
(function (w) {
  "use strict";
  var BRIDGE = "https://script.google.com/macros/s/AKfycbx0ANOvPHxfLNAfESo4YUEot1C9skLyn4cxUpJyMIa3S3efbM07KjybE0DuExVJWQKyvQ/exec";
  var SKEY = "hamlf.portal.docsSession";
  var getTok = null, email = "";
  var HINDI = "٠١٢٣٤٥٦٧٨٩";
  function ar(v) { return String(v == null ? "" : v).replace(/[0-9]/g, function (d) { return HINDI[+d]; }); }
  var MSG = {
    cooldown: "استنى دقيقة قبل ما تطلب كود تاني.",
    daily_limit: "وصلت لأقصى عدد أكواد النهارده (٣) — جرّب بكرة أو كلّم المكتب.",
    office_limit: "الخدمة مشغولة النهارده — جرّب بكرة أو كلّم المكتب.",
    blocked: "الخدمة مش متاحة لحسابك — كلّم المكتب.",
    expired: "الكود انتهى — اطلب كود جديد.",
    wrong: "الكود غلط.",
    too_many: "محاولات غلط كتير — اطلب كود جديد.",
    session: "جلسة المشاهدة انتهت — اطلب كود جديد.",
    auth: "سجّل دخول تاني.",
    forbidden: "المستند ده مش متاح لحسابك.",
    too_big: "الملف كبير — كلّم المكتب."
  };
  function sess() { try { return sessionStorage.getItem(SKEY) || ""; } catch (e) { return ""; } }
  function setSess(s) { try { if (s) sessionStorage.setItem(SKEY, s); else sessionStorage.removeItem(SKEY); } catch (e) { } }
  function call(p) {
    return getTok().then(function (t) {
      p.idToken = t;
      return fetch(BRIDGE, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(p) });
    }).then(function (r) { return r.text(); }).then(function (t) {
      try { return JSON.parse(t); } catch (e) { return { ok: false, error: "net" }; }
    }).catch(function () { return { ok: false, error: "net" }; });
  }
  function el(t, css, txt) { var e = document.createElement(t); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; }
  function btn(t, primary) {
    var b = el("button", "font-family:inherit;font-size:.95rem;border-radius:999px;padding:10px 20px;cursor:pointer;margin:6px 4px;" +
      (primary ? "background:#1d2b4f;color:#fff;border:0" : "background:none;color:#1d2b4f;border:1px solid #c9c3b6"), t);
    b.type = "button"; return b;
  }

  var back = null, box = null, note = null;
  function modal() {
    if (back) { back.style.display = "flex"; return; }
    back = el("div", "position:fixed;inset:0;z-index:9000;background:rgba(20,16,10,.55);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:30px 12px");
    var card = el("div", "background:#fff;border-radius:16px;max-width:620px;width:100%;padding:22px 20px;direction:rtl;line-height:1.9;box-shadow:0 10px 40px rgba(0,0,0,.25)");
    var head = el("div", "display:flex;align-items:center;gap:8px;margin-bottom:8px");
    head.appendChild(el("h2", "flex:1;margin:0;font-size:1.2rem;color:#1d2b4f", "📎 مستندات قضاياي"));
    var x = btn("✕ قفل"); x.onclick = function () { back.style.display = "none"; }; head.appendChild(x);
    card.appendChild(head);
    note = el("div", "min-height:1.4em;color:#a3122a;font-size:.9rem;margin:4px 0");
    box = el("div");
    card.appendChild(box); card.appendChild(note);
    back.appendChild(card);
    back.addEventListener("click", function (e) { if (e.target === back) back.style.display = "none"; });
    document.body.appendChild(back);
  }
  function say(t, ok) { note.style.color = ok ? "#1d6b3a" : "#a3122a"; note.textContent = t || ""; }
  function err(j) { say(MSG[j && j.error] || "تعذّر الاتصال — جرّب تاني بعد شوية."); }

  function stepAsk() {
    box.textContent = ""; say("");
    box.appendChild(el("p", "margin:0 0 8px;color:#444",
      "علشان نتأكد إنك صاحب الحساب، هنبعتلك كود من ٦ أرقام على إيميلك (" + email + "). الكود صالح ١٠ دقايق، وبيه تتصفح مستندات كل قضاياك."));
    var send = btn("ابعت الكود على إيميلي", true);
    send.onclick = function () {
      send.disabled = true; say("⏳ بنبعت الكود…", true);
      call({ action: "portalOtpRequest" }).then(function (j) {
        send.disabled = false;
        if (!j.ok) return err(j);
        stepCode(j.left);
      });
    };
    box.appendChild(send);
  }
  function stepCode(left) {
    box.textContent = "";
    say("✓ الكود اتبعت على إيميلك (شيّك على الـSpam كمان)." + (left != null ? " باقيلك " + ar(left) + " طلب النهارده." : ""), true);
    var inp = el("input", "font-family:inherit;font-size:1.4rem;letter-spacing:6px;text-align:center;width:200px;padding:8px 10px;border:1px solid #c9c3b6;border-radius:10px;direction:ltr");
    inp.inputMode = "numeric"; inp.maxLength = 6; inp.placeholder = "••••••"; inp.autocomplete = "one-time-code";
    var ok = btn("تأكيد", true), again = btn("ابعت كود تاني");
    ok.onclick = function () {
      var code = String(inp.value || "").replace(/[٠-٩]/g, function (d) { return HINDI.indexOf(d); }).replace(/\D/g, "");
      if (code.length !== 6) { say("اكتب الكود ٦ أرقام."); return; }
      ok.disabled = true; say("⏳ بنتأكد…", true);
      call({ action: "portalOtpVerify", code: code }).then(function (j) {
        ok.disabled = false;
        if (!j.ok) { err(j); if (j.error === "expired" || j.error === "too_many") stepAsk(); return; }
        setSess(j.session); stepList();
      });
    };
    again.onclick = stepAsk;
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") ok.click(); });
    box.appendChild(inp); box.appendChild(el("br")); box.appendChild(ok); box.appendChild(again);
    setTimeout(function () { inp.focus(); }, 50);
  }
  function stepList() {
    box.textContent = ""; say("⏳ بنجيب مستنداتك…", true);
    call({ action: "portalDocs", session: sess() }).then(function (j) {
      if (!j.ok) { setSess(""); err(j); stepAsk(); return; }
      say("");
      var any = false;
      (j.cases || []).forEach(function (c) {
        if (!(c.docs || []).length) return;
        any = true;
        var sec = el("div", "border:1px solid #e7e4dd;border-radius:12px;padding:10px 12px;margin:10px 0");
        sec.appendChild(el("div", "font-weight:700;color:#1d2b4f",
          "ملف " + ar(c.fileNo || "—") + (c.caseNo ? " — الدعوى " + ar(c.caseNo) + (c.caseYear ? " لسنة " + ar(c.caseYear) : "") : "") ));
        if (c.court || c.subject) sec.appendChild(el("div", "font-size:.85rem;color:#777", [c.court, c.subject].filter(Boolean).join(" — ")));
        c.docs.forEach(function (d) {
          var b = el("button", "display:block;width:100%;text-align:start;font-family:inherit;font-size:.95rem;background:#fbfaf7;border:1px solid #eee8dc;border-radius:10px;padding:9px 12px;margin-top:7px;cursor:pointer;color:#1d2b4f",
            "📄 " + d.name);
          b.type = "button";
          b.onclick = function () { openDoc(d); };
          sec.appendChild(b);
        });
        box.appendChild(sec);
      });
      if (!any) box.appendChild(el("p", "color:#777", "لسه مفيش مستندات مرفوعة على قضاياك. المكتب بيرفعها تباعاً."));
      var out = btn("خروج من مشاهدة المستندات");
      out.onclick = function () { call({ action: "portalLogout", session: sess() }); setSess(""); stepAsk(); };
      box.appendChild(out);
      box.appendChild(el("div", "font-size:.8rem;color:#999;margin-top:6px", "الجلسة بتتقفل لوحدها لو سبت البوابة ٣٠ دقيقة، أو بعد ٤ ساعات."));
    });
  }
  function openDoc(d) {
    say("⏳ بنفتح «" + d.name + "»…", true);
    call({ action: "portalDoc", session: sess(), fileId: d.id }).then(function (j) {
      if (!j.ok) { err(j); if (j.error === "session") { setSess(""); stepAsk(); } return; }
      say("");
      var url = "data:" + (j.mime || "application/pdf") + ";base64," + j.data;
      var now = new Date(), wm = email + " — " + ar(now.getFullYear() + "/" + (now.getMonth() + 1) + "/" + now.getDate());
      if (/^image\//.test(j.mime || "")) w.PdfView.openImage(url, j.name, { watermark: wm });
      else w.PdfView.open(url, j.name, { watermark: wm });
    });
  }

  w.PortalDocs = {
    /** getIdToken: دالة بترجّع Promise بتوكن Firebase؛ userEmail: إيميل الموكل */
    init: function (getIdToken, userEmail, buttonHost) {
      getTok = getIdToken; email = userEmail || "";
      var b = btn("📎 مستندات قضاياي", true);
      b.onclick = function () { modal(); if (sess()) stepList(); else stepAsk(); };
      if (buttonHost) buttonHost.appendChild(b);
    },
    logout: function () { if (sess() && getTok) call({ action: "portalLogout", session: sess() }); setSess(""); }
  };
})(window);
