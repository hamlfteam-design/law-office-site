/* =============================================================================
   «تقرير الطوارئ الميداني» — واجهة مشتركة: كارت البلاغ، العدّاد، التقرير الأولي، التقرير التفصيلي.
   بيستخدمها تطبيق Hamlf (15-emergency.html) وبوابة محامي الطوارئ (hamlf.com/emergency/lawyer.html).
   محتاج emergency-core.js قبله. نفس الملف منسوخ في law-office-site/emergency/.
   ============================================================================= */
(function (w) {
  "use strict";
  var EM = w.EM, ar = EM.ar;

  var CSS = "\
.em-card{background:var(--card,#fff);border:1px solid var(--line,#ddd);border-radius:14px;padding:12px;margin-bottom:10px}\
.em-card h3{margin:0 0 4px;font-size:15px;font-family:var(--f-title,inherit)}\
.em-meta{font-size:12.5px;color:var(--muted,#666);line-height:1.9}\
.em-clock{display:inline-block;border-radius:20px;padding:3px 12px;color:#fff;font-size:13px;margin:4px 0}\
.em-clock.green{background:#1c8a4a}.em-clock.yellow{background:#c9a227;color:#222}.em-clock.red{background:#B60000}\
.em-badge{display:inline-block;font-size:11.5px;padding:2px 9px;border-radius:20px;background:#0B6E4F;color:#fff;margin-inline-end:4px}\
.em-alarm{background:#fde8e8;color:#8a1010;border-radius:9px;padding:7px 10px;font-size:13px;margin:6px 0}\
.em-row{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px}\
.em-btn{min-height:44px;border-radius:10px;border:0;padding:0 14px;font-family:inherit;font-size:14px;cursor:pointer;background:#0B6E4F;color:#fff}\
.em-btn.sec{background:#e6e4dc;color:#16261F}.em-btn.red{background:#B23B3B}.em-btn.gold{background:#C9A227;color:#16261F}\
.em-form{background:var(--card,#fff);border-radius:14px;padding:12px;margin-bottom:10px}\
.em-sec{border:1px solid var(--line,#ddd);border-radius:12px;padding:10px;margin-bottom:9px}\
.em-sec>h4{margin:0 0 8px;font-size:14.5px;display:flex;justify-content:space-between;align-items:center;font-family:var(--f-title,inherit)}\
.em-sec.missing{border-color:#c9a227;background:#fffaf0}\
.em-f{margin-bottom:8px;position:relative}\
.em-f label{display:block;font-size:12.5px;color:var(--muted,#666);margin-bottom:3px}\
.em-f input,.em-f textarea,.em-f select{width:100%;box-sizing:border-box;padding:9px;border:1px solid #cfd6d1;border-radius:9px;font:inherit;background:#fcfcfa}\
.em-f textarea{min-height:64px;padding-left:44px}\
.em-mic{border:0;background:#0B6E4F;color:#fff;border-radius:50%;width:34px;height:34px;cursor:pointer;font-size:15px}\
.em-f .em-mic{position:absolute;left:6px;bottom:8px}\
.em-mic.big{width:64px;height:64px;font-size:28px;display:block;margin:6px auto}\
.em-mic.rec{background:#B23B3B;animation:empulse 1s infinite}@keyframes empulse{50%{opacity:.5}}\
.em-note{font-size:12px;color:var(--muted,#666);line-height:1.8}\
.em-tl{border-right:3px solid #0B6E4F;padding:2px 10px;margin:6px 0;font-size:13px}\
.em-tl small{color:var(--muted,#777)}\
.em-tbl{width:100%;border-collapse:collapse;font-size:13px}.em-tbl td,.em-tbl th{border-bottom:1px solid #eee;padding:6px;text-align:right}\
";
  function injectCss() { if (document.getElementById("em-css")) return; var s = document.createElement("style"); s.id = "em-css"; s.textContent = CSS; document.head.appendChild(s); }

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function btn(txt, cls, fn) { var b = el("button", "em-btn " + (cls || ""), txt); b.type = "button"; b.onclick = fn; return b; }

  function clockBadge(r) {
    var c = EM.clock(r), s = el("span", "em-clock " + c.color, (c.live ? "⏱ " : "✓ ") + EM.fmtDur(c.min) + " — " + c.label);
    return s;
  }

  /* كارت بلاغ. opts: { role: "manager"|"lawyer", onOpen } */
  function card(r, opts) {
    opts = opts || {};
    var L = EM.lawyer(r.assignedLawyerId) || {}, c = el("div", "em-card");
    c.appendChild(el("h3", "", "بلاغ " + ar(r.ref) + " — " + (r.detainee || "")));
    var bd = el("div"); bd.appendChild(el("span", "em-badge", EM.STATUS[r.status] || r.status));
    bd.appendChild(el("span", "em-badge", EM.STAGES[r.stage] || r.stage)); if (r.foreign) bd.appendChild(el("span", "em-badge", "أجنبي"));
    c.appendChild(bd); c.appendChild(clockBadge(r));
    c.appendChild(el("div", "em-meta", "المكان المبدئي: " + (r.place || "—") + " · المحامي: " + (L.name || "—") +
      " · البلاغ: " + EM.fmtDT(r.createdAt) + (r.initial ? " · التواصل: " + EM.fmtDur(EM.contactMin(r)) : "")));
    if (EM.detentionAlarm(r)) c.appendChild(el("div", "em-alarm", "⚠️ عدّى ٢٤ ساعة من القبض ولسه ما اتعرضش على النيابة"));
    if (EM.detailedOverdue(r)) c.appendChild(el("div", "em-alarm", "⏰ التقرير التفصيلي متأخر — عدّت ساعة من الأولي"));
    if (opts.onOpen) { c.style.cursor = "pointer"; c.onclick = function (e) { if (e.target.tagName !== "BUTTON") opts.onOpen(r); }; }
    return c;
  }

  function field(f, val, sec) {
    var box = el("div", "em-f"), lab = el("label", "", f.l + (f.req ? " *" : "")), inp;
    box.appendChild(lab);
    if (f.t === "area") { inp = el("textarea"); inp.value = val || ""; }
    else if (f.t === "choice") { inp = el("select"); inp.appendChild(el("option", "", "")); f.o.forEach(function (o) { var op = el("option", "", o); op.value = o; inp.appendChild(op); }); inp.value = val || ""; }
    else if (f.t === "datetime") { inp = el("input"); inp.type = "datetime-local"; inp.value = val || ""; }
    else if (f.t === "people") {
      inp = el("textarea"); inp.placeholder = "كل شخص في سطر: الاسم — الرتبة/الوظيفة";
      inp.value = (val || []).map(function (p) { return p.name + (p.title ? " — " + p.title : ""); }).join("\n");
    } else { inp = el("input"); inp.value = val || ""; }
    inp.dataset.k = f.k; inp.dataset.t = f.t; box.appendChild(inp);
    if (f.t === "area" || f.t === "people" || f.t === "text") {
      var m = el("button", "em-mic", "🎤"); m.type = "button"; m.title = "احكي بالعامية";
      m.onclick = function () { EM.mic(m, inp); }; box.appendChild(m);
    }
    return box;
  }
  function readSection(secEl) {
    var o = {};
    secEl.querySelectorAll("[data-k]").forEach(function (i) {
      if (i.dataset.t === "people") o[i.dataset.k] = i.value.split("\n").map(function (s) { s = s.trim(); if (!s) return null;
        var p = s.split(/\s+[—-]\s+/); return { name: p[0], title: p[1] || "" }; }).filter(Boolean);
      else o[i.dataset.k] = EM.la(i.value).trim();
    });
    return o;
  }
  function sectionEmpty(o) { return !Object.keys(o).some(function (k) { var v = o[k]; return Array.isArray(v) ? v.length : !!v; }); }

  /* التقرير الأولي الفوري: لازم يبدأ بالتهمة، والوقت + GPS بيتسجلوا أوتوماتيك */
  function initialForm(r, by, done) {
    var f = el("div", "em-form");
    f.appendChild(el("h3", "", "التقرير الأولي الفوري — بلاغ " + ar(r.ref)));
    f.appendChild(el("div", "em-note", "ابدأ بالتهمة. وقت الإرسال وموقعك (GPS) بيتسجلوا أوتوماتيك، وده الوقت المعتمد في الحساب."));
    var ch = field({ k: "charge", l: "التهمة", t: "area", req: true }); f.appendChild(ch);
    var tx = field({ k: "text", l: "ملخص سريع للموقف", t: "area" }); f.appendChild(tx);
    var audio = null, rec = null, ab = btn("⏺ تسجيل صوتي يتحفظ مع التقرير", "sec", function () {
      if (rec) { rec.stop(); rec = null; ab.textContent = "✓ اتسجل — تسجيل جديد؟"; return; }
      rec = EM.recordAudio(function (a) { audio = a; }); if (rec) ab.textContent = "⏹ إيقاف التسجيل"; });
    f.appendChild(ab);
    var st = el("div", "em-note", ""); f.appendChild(st);
    var row = el("div", "em-row");
    row.appendChild(btn("إرسال التقرير الأولي", "", function (ev) {
      var charge = EM.la(ch.querySelector("[data-k]").value).trim();
      if (!charge) { st.textContent = "التهمة إجبارية."; return; }
      ev.target.disabled = true; st.textContent = "بنسجّل موقعك…";
      if (rec) rec.stop();
      EM.gps(function (g) {
        EM.sendInitial(r, { charge: charge, text: EM.la(tx.querySelector("[data-k]").value).trim(), audio: audio }, g, by);
        done && done();
      });
    }));
    row.appendChild(btn("إلغاء", "sec", function () { done && done(true); }));
    f.appendChild(row);
    return f;
  }

  /* التقرير التفصيلي بالبنود الـ١٤ */
  function detailedForm(r, by, done) {
    var data = r.detailed || {}, f = el("div", "em-form");
    if (!data.charge && r.initial) data.charge = { text: r.initial.charge };
    f.appendChild(el("h3", "", "التقرير التفصيلي — بلاغ " + ar(r.ref)));
    var big = el("button", "em-mic big", "🎤"); big.type = "button"; big.title = "احكي الحكاية كلها بالعامية";
    f.appendChild(big);
    f.appendChild(el("div", "em-note", "احكي الحكاية كلها بالعامية، أو استخدم الميكروفون جنب كل بند. راجع وعدّل قبل الإرسال — مفيش إرسال أوتوماتيك. (الصياغة بالفصحى وتوزيع الكلام على البنود هيشتغلوا بعد ربط الذكاء الاصطناعي.)"));
    var foreignChk = el("label", "em-note"); var fc = el("input"); fc.type = "checkbox"; fc.checked = !!r.foreign;
    foreignChk.appendChild(fc); foreignChk.appendChild(document.createTextNode(" المحتجز أجنبي")); f.appendChild(foreignChk);
    var secs = {};
    EM.SECTIONS.forEach(function (S, i) {
      var s = el("div", "em-sec"); s.dataset.sec = S.k;
      var h = el("h4", "", ar(i + 1) + ". " + S.t + (S.req ? " (إجباري)" : "")); s.appendChild(h);
      if (S.auto) {
        var hrs = EM.detentionHours(r);
        s.appendChild(el("div", "em-note", hrs == null ? "بتتحسب أوتوماتيك من ميعاد القبض (البند ٣)." : "مدة الاحتجاز لحد دلوقتي: " + ar(hrs) + " ساعة"));
        if (EM.detentionAlarm(r)) s.appendChild(el("div", "em-alarm", "⚠️ عدّى ٢٤ ساعة من غير عرض على النيابة"));
      }
      S.f.forEach(function (F) { s.appendChild(field(F, (data[S.k] || {})[F.k], S)); });
      if (S.foreignOnly) s.style.display = fc.checked ? "" : "none";
      secs[S.k] = s; f.appendChild(s);
    });
    fc.onchange = function () { secs.foreign.style.display = fc.checked ? "" : "none"; };
    big.onclick = function () {
      EM.mic(big, null, function (text) {
        EM.ai.split(text).then(function (o) {
          Object.keys(o).forEach(function (sk) { if (sk === "linked" || !secs[sk]) return;
            Object.keys(o[sk]).forEach(function (fk) { var i = secs[sk].querySelector('[data-k="' + fk + '"]'); if (i) i.value = (i.value ? i.value + " " : "") + o[sk][fk]; }); });
          mark();
        });
      });
    };
    function collect() { var o = {}; EM.SECTIONS.forEach(function (S) { if (!S.auto) o[S.k] = readSection(secs[S.k]); }); return o; }
    function mark() { var o = collect(); EM.SECTIONS.forEach(function (S) { if (S.auto) return; secs[S.k].classList.toggle("missing", sectionEmpty(o[S.k])); }); }
    mark(); f.addEventListener("input", mark);
    var st = el("div", "em-note"); f.appendChild(st);
    var row = el("div", "em-row");
    row.appendChild(btn("إرسال التقرير التفصيلي", "", function () {
      var o = collect(); if (!o.charge.text) { st.textContent = "التهمة إجبارية (البند ١)."; secs.charge.scrollIntoView(); return; }
      r.foreign = fc.checked; EM.sendDetailed(r, o, by); done && done();
    }));
    row.appendChild(btn("حفظ مسودة", "sec", function () { r.detailed = null; r.draft = collect(); EM.store.save(); st.textContent = "اتحفظت المسودة على الجهاز."; }));
    row.appendChild(btn("إلغاء", "sec", function () { done && done(true); }));
    f.appendChild(row);
    if (r.draft && !r.detailed) { /* استرجاع المسودة */
      Object.keys(r.draft).forEach(function (sk) { if (!secs[sk]) return; Object.keys(r.draft[sk]).forEach(function (fk) {
        var i = secs[sk].querySelector('[data-k="' + fk + '"]'); var v = r.draft[sk][fk];
        if (i) i.value = Array.isArray(v) ? v.map(function (p) { return p.name + (p.title ? " — " + p.title : ""); }).join("\n") : v; }); });
      mark();
    }
    return f;
  }

  /* عرض تقرير للقراءة (المدير) */
  function reportView(r) {
    var v = el("div", "em-form");
    if (r.initial) {
      v.appendChild(el("h3", "", "التقرير الأولي — " + EM.fmtDT(r.initial.at)));
      v.appendChild(el("div", "", "التهمة: " + r.initial.charge));
      if (r.initial.text) v.appendChild(el("div", "em-note", r.initial.text));
      if (r.initial.gps) { var a = el("a", "em-note", "📍 الموقع وقت الإرسال (دقة " + ar(r.initial.gps.acc) + " م)");
        a.href = "https://maps.google.com/?q=" + r.initial.gps.lat + "," + r.initial.gps.lng; a.target = "_blank"; v.appendChild(a); }
      else v.appendChild(el("div", "em-note", "الموقع ما اتسجلش (المحامي ما سمحش أو الجهاز ما قدرش)."));
      if (r.initial.audio && r.initial.audio.dataUrl) { var au = el("audio"); au.controls = true; au.src = r.initial.audio.dataUrl; v.appendChild(au); }
    }
    if (r.detailed) {
      v.appendChild(el("h3", "", "التقرير التفصيلي — " + EM.fmtDT(r.detailedAt)));
      EM.SECTIONS.forEach(function (S, i) {
        if (S.foreignOnly && !r.foreign) return;
        var d = r.detailed[S.k] || {}, lines = [];
        S.f.forEach(function (F) { var x = d[F.k]; if (Array.isArray(x)) x = x.map(function (p) { return p.name + (p.title ? " (" + p.title + ")" : ""); }).join("، ");
          if (x) lines.push(F.l + ": " + (F.t === "datetime" ? EM.fmtDT(new Date(x).getTime()) : x)); });
        if (S.auto) { var h = EM.detentionHours(r); if (h != null) lines.push("لحد دلوقتي: " + ar(h) + " ساعة"); }
        var s = el("div", "em-sec" + (lines.length ? "" : " missing")); s.appendChild(el("h4", "", ar(i + 1) + ". " + S.t));
        s.appendChild(el("div", "em-note", lines.length ? lines.join("\n") : "فاضي")); s.lastChild.style.whiteSpace = "pre-line"; v.appendChild(s);
      });
    }
    return v;
  }

  function timeline(r, editable) {
    var box = el("div", "em-form"); box.appendChild(el("h3", "", "الخط الزمني"));
    (r.timeline || []).forEach(function (t, i) {
      var row = el("div", "em-tl"); row.appendChild(el("div", "", t.txt)); row.appendChild(el("small", "", EM.fmtDT(t.at)));
      if (editable) { var l = el("label", "em-note"); var c = el("input"); c.type = "checkbox"; c.checked = !!t.public;
        c.onchange = function () { EM.setPublic(r, i, c.checked); }; l.appendChild(c); l.appendChild(document.createTextNode(" يظهر للعميل")); row.appendChild(l); }
      box.appendChild(row);
    });
    return box;
  }

  injectCss();
  w.EMUI = { el: el, btn: btn, card: card, clockBadge: clockBadge, initialForm: initialForm, detailedForm: detailedForm, reportView: reportView, timeline: timeline };
})(window);
