/* =============================================================================
   بحث شامل — بأي قيمة، في كل ما أُدخل، مع التعديل والحذف في مكانه.

   كان البحث يعرض السجل ولا يفعل به شيئاً: لا تعديل ولا حذف ولا إضافة،
   فيضطر المستخدم أن يتذكّر من أي شاشة أُدخل السجل ثم يذهب إليها.

   هنا: اكتب أي قيمة — رقم ملف · رقم دعوى · اسم موكل · رقم محضر · مبلغ —
   فتظهر النتائج من كل المخازن، ومع كل نتيجة زرّا تعديل وحذف يفتحان
   محرّرها الأصلي في مكانه.

   والمواعيد لها فوق ذلك «↪ اجعله جلسة»: يُنقل الموعد إلى قضيته جلسةً
   مؤرَّخة، وتُستكمل حقوله الناقصة، ثم يُحذف الموعد.
   ============================================================================= */
(function (w) {
  "use strict";

  var CASES = "proflawyer.agenda.cases.v1";
  var APPTS = "proflawyer.appointments.v1";

  function read(k, d) {
    try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; }
  }
  function write(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { alert("تعذّر الحفظ — المساحة ممتلئة."); return false; }
  }
  function ar(n) {
    return String(n == null ? "" : n)
      .replace(/[0-9]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩"[+d]; });
  }
  function la(t) {
    return String(t == null ? "" : t)
      .replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x0660; });
  }
  function norm(t) { return window.lawyerNorm(t); }
  function el(tag, css, txt) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function iso(v) {
    return w.lawyerToISO ? w.lawyerToISO(v) : la(v).replace(/\//g, "-");
  }

  /* ------------------------------------------------------------- المصادر

     كل مصدر يعرف: كيف يُقرأ · كيف يُوصف · كيف يُعدَّل · كيف يُحذف.
     فتصير كل نتيجة قابلة للتصرّف بلا مغادرة شاشة البحث. */

  function sources() {
    var out = [];

    /* القضايا */
    read(CASES, []).forEach(function (c) {
      out.push({
        kind: "قضية", icon: "🗂", id: c.id, raw: c,
        title: "دعوى " + ar(c.caseNo || "—") +
               (c.caseYear ? " لسنة " + ar(c.caseYear) : "") +
               (c.fileNo ? "  ·  ملف " + ar(c.fileNo) : ""),
        lines: [c.courtName, c.circuit, c.clients, c.opponents, c.status]
          .filter(Boolean),
        hay: [c.fileNo, c.caseNo, c.caseYear, c.courtName, c.circuit, c.clients,
              c.opponents, c.subject, c.status, c.lawyer, c.notes].join(" "),
        edit: function (done) {
          if (!w.CaseFile) { alert("سجل القضايا غير متاح."); return; }
          CaseFile.openCase(c.id, done);
        },
        remove: function (done) {
          if (!write(CASES, read(CASES, []).filter(function (x) { return x.id !== c.id; })))
            return;
          done();
        }
      });
    });

    /* المواعيد */
    read(APPTS, []).forEach(function (a) {
      out.push({
        kind: "موعد", icon: "⏰", id: a.id, raw: a, appt: true,
        title: a.title || "موعد",
        lines: [a.date ? ar(String(a.date)) : "", a.time || "", a.with || "",
                a.kind || "", a.notes || ""].filter(Boolean),
        hay: [a.title, a.with, a.kind, a.date, a.time, a.notes].join(" "),
        edit: function (done) { editAppt(a.id, done); },
        remove: function (done) {
          if (!write(APPTS, read(APPTS, []).filter(function (x) { return x.id !== a.id; })))
            return;
          done();
        }
      });
    });

    /* الموكلون والتوكيلات */
    read("proflawyer.agenda.clients.v1", []).forEach(function (c) {
      var ps = (c.poas && c.poas.length) ? c.poas : (c.poaNo ? [c] : []);
      out.push({
        kind: "موكل", icon: "👤", id: c.officeNo + "|" + c.name, raw: c,
        title: (c.officeNo ? ar(c.officeNo) + "  ·  " : "") + (c.name || "بلا اسم"),
        lines: ps.map(function (p) {
          return "توكيل " + ar(p.poaNo || "—") +
                 (p.poaLetter ? " " + p.poaLetter : "") +
                 (p.poaYear ? " لسنة " + ar(p.poaYear) : "") +
                 (p.notary ? " — " + p.notary : "");
        }).concat([c.phone || "", c.email || ""]).filter(Boolean),
        hay: [c.name, c.officeNo, c.phone, c.email].concat(
          ps.map(function (p) {
            return [p.poaNo, p.poaYear, p.notary, p.poaType, p.agent].join(" ");
          })).join(" "),
        edit: function (done) {
          if (!w.ClientsPOA) { alert("شاشة الموكلين غير متاحة."); return; }
          ClientsPOA.editClient(c, done);
        },
        remove: function (done) {
          var list = read("proflawyer.agenda.clients.v1", []);
          list = list.filter(function (x) {
            if (c.id && x.id) return x.id !== c.id;
            return !(x.name === c.name && String(x.officeNo) === String(c.officeNo));
          });
          if (!write("proflawyer.agenda.clients.v1", list)) return;
          done();
        }
      });
    });

    /* السجلات الستة */
    if (w.REGS && w.Registers) {
      Object.keys(w.REGS).forEach(function (key) {
        var reg = w.REGS[key];
        Registers.rows(key).forEach(function (r) {
          out.push({
            kind: reg.n.replace(/^سجل\s*(متابعة\s*)?/, ""), icon: reg.i,
            id: r._id, raw: r,
            title: reg.F.slice(0, 3).map(function (f) {
              return r[f.k] ? ar(r[f.k]) : "";
            }).filter(Boolean).join("  ·  ") || "قيد",
            lines: reg.F.slice(3, 9).map(function (f) {
              return r[f.k] ? f.t + ": " + ar(r[f.k]) : "";
            }).filter(Boolean),
            hay: Object.keys(r).map(function (k) { return r[k]; }).join(" "),
            edit: function (done) { Registers.edit(key, r._id, done); },
            remove: function (done) { Registers.remove(key, r._id, done); }
          });
        });
      });
    }

    return out;
  }

  /** بحث بأي قيمة — الأرقام تُطابَق تامّةً أولاً ثم جزئياً. */
  function search(q) {
    var all = sources();
    var raw = la(q).trim();
    if (!raw) return [];

    if (/^\d+$/.test(raw)) {
      var exact = all.filter(function (r) {
        return la(r.hay).split(/[^0-9]+/).indexOf(raw) >= 0;
      });
      if (exact.length) return exact;
    }
    var words = norm(raw).split(" ").filter(Boolean);
    return all.filter(function (r) {
      var hay = norm(r.hay);
      return words.every(function (t) { return hay.indexOf(t) >= 0; });
    });
  }

  /* ------------------------------------------------------ محرِّر الموعد

     شاشة المواعيد كانت تعرض زر حذف وحده — فمن أراد تصحيح موعدٍ أو نقله
     إلى جلسة لم يجد سبيلاً. */

  var APPT_FIELDS = [
    { k: "title", label: "عنوان الموعد",
      hint: "ما يذكّرك به — «جلسة» أو «تسليم مذكرة» أو «مقابلة موكل»." },
    { k: "date",  label: "التاريخ", date: true, hint: "مثال ٢٠٢٦/٠٩/٠٣." },
    { k: "time",  label: "الوقت", hint: "بصيغة ٢٤ ساعة — مثال 09:30." },
    { k: "with",  label: "مع", hint: "الموكل أو الجهة." },
    { k: "kind",  label: "النوع",
      options: ["جلسة", "مقابلة", "تسليم", "استلام", "مهمة", "أخرى"] },
    { k: "notes", label: "ملاحظات", multi: true }
  ];

  function sheet(z) {
    var back = el("div",
      "position:fixed;inset:0;background:rgba(20,14,8,.62);z-index:" + (z || 10046) + ";" +
      "display:flex;align-items:flex-end;justify-content:center");
    back.setAttribute("data-modal", "1");
    back.setAttribute("data-nosave", "1");
    var box = el("div",
      "background:var(--card,#fff);border-radius:18px 18px 0 0;padding:18px 18px 26px;" +
      "width:100%;max-width:620px;direction:rtl;color:var(--text);" +
      "max-height:92vh;overflow-y:auto");
    back.appendChild(box);
    back.onclick = function (e) { if (e.target === back) back.remove(); };
    document.body.appendChild(back);
    return { back: back, box: box };
  }

  var CSS_IN = "width:100%;min-height:48px;font-size:16px;padding:10px 12px;" +
    "border:1px solid var(--line,#ddd);border-radius:9px;background:var(--card);" +
    "font-family:inherit;direction:rtl;text-align:right";

  function btn(label, css) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.style.cssText = "flex:1;padding:14px;border-radius:11px;font-family:inherit;" +
                      "font-size:16px;min-height:52px;" + css;
    return b;
  }

  function editAppt(id, done) {
    var list = read(APPTS, []);
    var a = list.filter(function (x) { return x.id === id; })[0];
    if (!a) return;

    var s = sheet(10046);
    s.box.appendChild(el("div",
      "font-family:var(--f-title);font-size:18px;margin-bottom:10px", "تعديل الموعد"));

    var v = {};
    APPT_FIELDS.forEach(function (f) {
      var g = el("div", "margin-bottom:12px");
      g.appendChild(el("label",
        "display:block;font-family:var(--f-title);font-size:14px;" +
        "margin-bottom:5px;color:var(--brand-dark)", f.label));

      var input;
      if (f.options) {
        input = document.createElement("select");
        input.id = "ap_" + f.k;
        var blank = document.createElement("option");
        blank.value = ""; blank.textContent = "— غير محدَّد —";
        input.appendChild(blank);
        f.options.forEach(function (o) {
          var op = document.createElement("option");
          op.value = o; op.textContent = o;
          input.appendChild(op);
        });
        input.value = a[f.k] || "";
      } else {
        input = document.createElement(f.multi ? "textarea" : "input");
        if (f.multi) input.rows = 2; else input.type = "text";
        input.value = a[f.k] || "";
        input.setAttribute("lang", "ar");
        input.setAttribute("dir", "rtl");
        if (f.date) { input.type = "date";
        input.value = w.lawyerToISO ? (w.lawyerToISO(a[f.k]) || "") : (a[f.k] || ""); }
      }
      input.style.cssText = CSS_IN;
      g.appendChild(input);
      if (f.hint) {
        g.appendChild(el("div",
          "font-size:12px;color:var(--muted);margin-top:4px;line-height:1.8", f.hint));
      }
      s.box.appendChild(g);
      v[f.k] = input;
    });

    var save = btn("حفظ", "border:0;background:var(--brand);color:#fff;font-weight:600");
    var cancel = btn("إلغاء",
      "border:1px solid var(--line,#ddd);background:transparent;color:var(--muted)");
    save.onclick = function () {
      APPT_FIELDS.forEach(function (f) {
        a[f.k] = f.date && w.lawyerToISO ? (w.lawyerToISO(v[f.k].value) || "") : v[f.k].value.trim();
      });
      if (!write(APPTS, list)) return;
      s.back.remove();
      if (done) done();
    };
    cancel.onclick = function () { s.back.remove(); };

    var r = el("div", "display:flex;gap:9px;margin-top:14px");
    r.appendChild(save); r.appendChild(cancel);
    s.box.appendChild(r);

    /* ↪ اجعله جلسة */
    var toS = btn("↪ اجعله جلسة في قضية",
      "border:1px solid var(--brand);background:transparent;color:var(--brand);" +
      "font-weight:600");
    toS.onclick = function () {
      APPT_FIELDS.forEach(function (f) {
        a[f.k] = f.date && w.lawyerToISO ? (w.lawyerToISO(v[f.k].value) || "") : v[f.k].value.trim();
      });
      write(APPTS, list);
      s.back.remove();
      toSession(id, done);
    };
    var r2 = el("div", "display:flex;margin-top:10px");
    r2.appendChild(toS);
    s.box.appendChild(r2);
  }

  /* --------------------------------------------- نقل الموعد إلى جلسة

     يُبحث عن قضية الموعد باسم من هو معه أو بعنوانه، وإن لم تُعرف عُرضت
     قائمة القضايا للاختيار. ثم يصير الموعد جلسةً مؤرَّخة في تلك القضية. */

  function toSession(apptId, done) {
    var appts = read(APPTS, []);
    var a = appts.filter(function (x) { return x.id === apptId; })[0];
    if (!a) return;

    var d = iso(a.date);
    if (!d) { alert("اكتب تاريخ الموعد أولاً."); return; }

    var cases = read(CASES, []);
    var who = norm(a.with || "");
    var guess = who ? cases.filter(function (c) {
      return norm(c.clients).indexOf(who) >= 0;
    }) : [];

    var s = sheet(10048);
    s.box.appendChild(el("div",
      "font-family:var(--f-title);font-size:18px;margin-bottom:4px",
      "اجعل الموعد جلسة"));
    s.box.appendChild(el("div",
      "font-size:13.5px;color:var(--muted);margin-bottom:14px;line-height:1.9",
      (a.title || "موعد") + " — " + ar(String(a.date))));

    s.box.appendChild(el("label",
      "display:block;font-family:var(--f-title);font-size:14px;" +
      "margin-bottom:5px;color:var(--brand-dark)", "القضية"));

    var sel = document.createElement("select");
    sel.id = "apCase";
    sel.style.cssText = CSS_IN;
    var blank = document.createElement("option");
    blank.value = ""; blank.textContent = "— اختر القضية —";
    sel.appendChild(blank);

    /* المرجَّحة أولاً */
    guess.concat(cases.filter(function (c) { return guess.indexOf(c) < 0; }))
      .forEach(function (c) {
        var o = document.createElement("option");
        o.value = c.id;
        o.textContent = (c.fileNo ? "ملف " + ar(c.fileNo) + " — " : "") +
                        "دعوى " + ar(c.caseNo || "—") +
                        (c.courtName ? " — " + c.courtName : "") +
                        (c.clients ? " — " + c.clients.slice(0, 30) : "");
        sel.appendChild(o);
      });
    if (guess.length) sel.value = guess[0].id;
    s.box.appendChild(sel);
    s.box.appendChild(el("div",
      "font-size:12px;color:var(--muted);margin-top:4px;line-height:1.8",
      guess.length ? "رُجِّحت قضية الموكل «" + (a.with || "") + "» — غيّرها إن لم تكن هي."
                   : "اكتب أول حروف رقم الملف أو اسم الموكل لتضييق القائمة."));

    var keep = document.createElement("input");
    keep.type = "checkbox";
    keep.id = "apKeep";
    var lb = el("label",
      "display:flex;gap:9px;align-items:flex-start;font-size:13.5px;line-height:1.9;" +
      "background:var(--bg,#f4ece0);padding:11px 12px;border-radius:9px;margin:12px 0 4px");
    keep.style.cssText = "width:20px;height:20px;margin-top:2px;flex:0 0 auto";
    lb.appendChild(keep);
    lb.appendChild(el("span", "", "أبقِ الموعد بعد التحويل (غير مستحسن — يظهر مرتين)"));
    s.box.appendChild(lb);

    var ok = btn("حوّله جلسة",
      "border:0;background:var(--brand);color:#fff;font-weight:600");
    var no = btn("إلغاء",
      "border:1px solid var(--line,#ddd);background:transparent;color:var(--muted)");

    ok.onclick = function () {
      var id = sel.value;
      if (!id) { alert("اختر القضية أولاً."); return; }
      var c = cases.filter(function (x) { return x.id === id; })[0];
      if (!c) return;

      c.sessions = c.sessions || [];
      var exists = c.sessions.filter(function (x) { return x.date === d; })[0];
      if (exists) {
        exists.raw = exists.raw || {};
        if (!exists.raw.result && !exists.raw.decision && a.notes) exists.raw.result = a.notes;
      } else {
        c.sessions.push({
          date: d,
          raw: {
            type: a.kind === "جلسة" ? "مرافعة" : (a.kind || ""),
            roll: "",
            result: a.notes || "",
            next: "", "for": ""
          }
        });
      }
      if (!write(CASES, cases)) return;

      if (!keep.checked) {
        write(APPTS, appts.filter(function (x) { return x.id !== apptId; }));
      }
      s.back.remove();
      alert("تم — صار جلسة في " + ar(d.replace(/-/g, "/")) + "." +
            String.fromCharCode(10) + "افتح القضية لاستكمال القرار والرول.");
      if (done) done();
    };
    no.onclick = function () { s.back.remove(); };

    var r = el("div", "display:flex;gap:9px;margin-top:14px");
    r.appendChild(ok); r.appendChild(no);
    s.box.appendChild(r);
  }

  w.FindAll = {
    search: search, sources: sources,
    editAppt: editAppt, toSession: toSession, ar: ar
  };
})(window);
