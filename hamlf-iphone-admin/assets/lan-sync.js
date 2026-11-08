/* =============================================================================
   مزامنة مع HAMLF على الكمبيوتر — نفس الواي فاي، من غير فيربيز (طلب المستخدم ١٨-١٠).

   الكمبيوتر بيشغّل tools/pc-app/hamlf_pc_server.py ويخزّن نسخته من البيانات بس؛
   الدمج كله بيحصل هنا على الموبايل:

     • كل مفتاح proflawyer.* (ماعدا الخاص بالجهاز — LOCAL_RX، ونفسها في pc-mode.js)
       بيتقسم «وحدات»: كل سجل له id/_id وحدة لوحده (قضية، موكل، قيد سجل…)، وأي
       خانة تانية في الكائن وحدة، والباقي المفتاح كله وحدة واحدة.
     • بنفتكر بصمة كل وحدة وقت آخر مزامنة ناجحة (hamlflan.base.v1). الوحدة اللي
       اتغيّرت على جهاز واحد بس، تغييرها بيروح للتاني (ومنه المسح). اللي اتغيّرت
       على الجهازين ← المستخدم يختار لكل سجل: نسخة الموبايل ولا الكمبيوتر.
     • أول مزامنة (مفيش بصمات): لو الكمبيوتر فاضي بياخد كل حاجة من الموبايل؛
       غير كده المستخدم بيختار مين الأساس، أو «قارن واسألني».
     • قبل أي كتابة: نسخة من بيانات الموبايل بتتحفظ على الكمبيوتر (backups).
     • القضايا والموكلين والسجلات بيتحفظوا هنا بـCaseFile.commitAll / ClientsPOA.commitAll /
       Registers.commitAll، فاللي جه من الكمبيوتر بيترفع لفيربيز من الموبايل زي أي تعديل.
   ============================================================================= */
(function (w) {
  "use strict";

  var LOCAL_RX = /^proflawyer\.(session|cloudrole|sync\.|syncnow|team\.sync|snap\.|updchk|device\.|clientlinks\.|_|theme|numerals|kbmode|smoothwheel|homeHidden|lastBackup|backupHistory|edits\.|deleted\.at|cloudqueue|bulkpush|collab\.|rolespushed|portalindex|poaExpiry|remind\.fired|geoCache|fixups|casedraft|clientdraft|lastNewCase|cases\.backupBeforeMerge|att\.feed|report\.layout|budget)/;
  var CFG = "hamlflan.cfg.v1", BASE = "hamlflan.base.v1";
  var CASES = "proflawyer.agenda.cases.v1", CLIENTS = "proflawyer.agenda.clients.v1";
  var NL = String.fromCharCode(10);

  function isData(k) { return typeof k === "string" && k.indexOf("proflawyer.") === 0 && !LOCAL_RX.test(k); }
  function getJ(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function setJ(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function cfg() { return getJ(CFG, {}); }
  function saveCfg(c) { setJ(CFG, c); }
  function ar(n) { return String(n).replace(/\d/g, function (d) { return "٠١٢٣٤٥٦٧٨٩"[d]; }); }

  function localStore() {
    var o = {};
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (isData(k)) o[k] = localStorage.getItem(k);
    }
    return o;
  }

  /* ---------------------------------------------------------------- الاتصال */
  var seq = 0, waiting = {};
  w.__lanCallback = function (id, ok, status, body) {
    var cb = waiting[id]; delete waiting[id];
    if (!cb) return;
    var j = null;
    try { j = JSON.parse(body); } catch (e) { }
    cb({ ok: ok, status: status, json: j });
  };
  function call(method, path, body) {
    var c = cfg();
    return new Promise(function (res) {
      if (!w.AndroidLan || !AndroidLan.request) { res({ ok: false, status: 0, json: { __nativeError: "حدّث التطبيق (المزامنة محتاجة نسخة ١٫٥٣ أو أحدث)" } }); return; }
      var hp = String(c.host || "").trim().split(":");
      var id = "l" + (++seq) + "_" + Date.now();
      waiting[id] = res;
      AndroidLan.request(id, method, hp[0], parseInt(hp[1] || "8770", 10), path,
        body === undefined ? null : JSON.stringify(body), c.token || "");
    });
  }
  function errText(r) {
    if (r.json && r.json.__nativeError) return "الكمبيوتر مش بيرد — اتأكد إن «HAMLF على الكمبيوتر» شغّال وإن الاتنين على نفس الواي فاي (" + r.json.__nativeError + ")";
    if (r.status === 401) return "الموبايل مش مربوط بالكمبيوتر ده — اعمل إقران تاني.";
    if (r.status === 403) return "كود الإقران غلط أو انتهى — خُد الكود الجديد من الكمبيوتر.";
    return "حصل خطأ من الكمبيوتر (" + r.status + ")";
  }

  function pair(host, code, done) {
    var c = cfg(); c.host = String(host || "").trim(); c.token = ""; saveCfg(c);
    call("POST", "/lan/pair", { code: String(code || "").trim(), name: "موبايل " + (navigator.userAgent.match(/;\s*([^;)]+)\s+Build/) || [, ""])[1] })
      .then(function (r) {
        if (!r.ok || !r.json || !r.json.token) { done(errText(r)); return; }
        var c2 = cfg(); c2.token = r.json.token;
        if (c2.serverId !== r.json.serverId) { c2.serverId = r.json.serverId; localStorage.removeItem(BASE); }
        saveCfg(c2); done(null);
      });
  }
  function unpair() { localStorage.removeItem(CFG); localStorage.removeItem(BASE); }

  /* ------------------------------------------------------------- الوحدات */
  function hash(s) {
    var h1 = 0x811c9dc5, h2 = 5381;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      h1 ^= c; h1 = Math.imul(h1, 0x01000193);
      h2 = (Math.imul(h2, 33) + c) | 0;
    }
    return (h1 >>> 0).toString(36) + "." + (h2 >>> 0).toString(36) + "." + s.length.toString(36);
  }
  function recId(r) {
    if (!r || typeof r !== "object" || Array.isArray(r)) return null;
    var v = r.id != null && r.id !== "" ? r.id : r._id;
    return v == null || v === "" ? null : String(v);
  }
  function isRecArr(a) {
    if (!Array.isArray(a) || !a.length) return false;
    var seen = {};
    for (var i = 0; i < a.length; i++) {
      var id = recId(a[i]);
      if (id == null || seen[id]) return false;
      seen[id] = 1;
    }
    return true;
  }
  var SEP = "\u0001";
  /** القيمة ← {type, list: [[وحدة, نص]...]} بالترتيب */
  function units(raw) {
    if (raw == null) return null;
    var v;
    try { v = JSON.parse(raw); } catch (e) { return { type: "R", list: [["*", raw]] }; }
    var list = [];
    if (isRecArr(v) || (Array.isArray(v) && !v.length)) {
      v.forEach(function (r) { list.push(["r:" + SEP + recId(r), JSON.stringify(r)]); });
      return { type: "A", list: list };
    }
    if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.keys(v).forEach(function (k) {
        var x = v[k];
        if (isRecArr(x) || (Array.isArray(x) && !x.length)) {
          list.push(["a:" + k, "[]"]);
          x.forEach(function (r) { list.push(["r:" + k + SEP + recId(r), JSON.stringify(r)]); });
        } else list.push(["p:" + k, JSON.stringify(x)]);
      });
      return { type: "O", list: list };
    }
    return { type: "R", list: [["*", raw]] };
  }
  function rebuild(type, list) {
    if (type === "R") return list.length ? list[0][1] : null;
    if (type === "A") return JSON.stringify(list.map(function (u) { return JSON.parse(u[1]); }));
    var o = {};
    list.forEach(function (u) {
      var id = u[0];
      if (id.indexOf("p:") === 0) o[id.slice(2)] = JSON.parse(u[1]);
      else if (id.indexOf("a:") === 0) { var k = id.slice(2); if (!o[k]) o[k] = []; }
      else if (id.indexOf("r:") === 0) {
        var k2 = id.slice(2, id.indexOf(SEP));
        if (!Array.isArray(o[k2])) o[k2] = [];
        o[k2].push(JSON.parse(u[1]));
      }
    });
    return JSON.stringify(o);
  }
  function baseOf(type, list) {
    var b = { "#": type };
    list.forEach(function (u) { b[u[0]] = hash(u[1]); });
    return b;
  }

  /* ---------------------------------------------------------- وصف التعارض */
  var KEY_NAMES = {};
  KEY_NAMES[CASES] = "القضايا"; KEY_NAMES[CLIENTS] = "الموكلون";
  KEY_NAMES["proflawyer.regs.v1"] = "السجلات"; KEY_NAMES["proflawyer.screens.v1"] = "الشاشات";
  KEY_NAMES["proflawyer.agenda.generaltasks.v1"] = "التكليفات العامة";
  KEY_NAMES["proflawyer.team.v1"] = "المحامون"; KEY_NAMES["proflawyer.lists.v1"] = "القوائم";
  function describe(key, uid, l, r) {
    var o = null;
    try { o = JSON.parse(l || r); } catch (e) { }
    var where = KEY_NAMES[key] || key.replace(/^proflawyer\./, "");
    var t = where;
    if (o && typeof o === "object" && !Array.isArray(o)) {
      if (key === CASES) t = "قضية" + (o.fileNo ? " ملف " + ar(o.fileNo) : "") + (o.clients ? " — " + String(o.clients).split("·")[0].replace(/\([^)]*\)/g, "").trim() : "");
      else if (key === CLIENTS) t = "موكل: " + (o.name || "—") + (o.officeNo ? " (" + ar(o.officeNo) + ")" : "");
      else {
        var sub = uid.indexOf("r:") === 0 ? uid.slice(2, uid.indexOf(SEP)) : "";
        if (key === "proflawyer.regs.v1" && w.REGS && w.REGS[sub]) sub = w.REGS[sub].n;
        var bits = Object.keys(o).filter(function (k) { return k.charAt(0) !== "_" && typeof o[k] === "string" && o[k].trim(); })
          .slice(0, 3).map(function (k) { return o[k].trim().slice(0, 40); });
        t = where + (sub ? " · " + sub : "") + (bits.length ? ": " + bits.join(" · ") : "");
      }
    } else if (uid.indexOf("p:") === 0) t = where + " · " + uid.slice(2);
    var fields = [];
    try {
      var a = JSON.parse(l), b = JSON.parse(r);
      if (a && b && typeof a === "object" && typeof b === "object") {
        var labels = {};
        if (key === CASES && w.CaseFile && CaseFile.FIELDS) CaseFile.FIELDS.forEach(function (f) { labels[f.k] = f.label; });
        Object.keys(a).concat(Object.keys(b)).forEach(function (k) {
          if (fields.indexOf(labels[k] || k) < 0 && JSON.stringify(a[k]) !== JSON.stringify(b[k])) fields.push(labels[k] || k);
        });
      }
    } catch (e) { }
    return { title: t, fields: fields.slice(0, 6) };
  }

  /* ------------------------------------------------------------- الدمج */
  /** يحسب الناتج لكل مفتاح؛ التعارضات بتترجع للمستخدم يختار. firstMode: "phone"|"pc"|"ask" */
  function plan(local, remote, base, firstMode) {
    var keys = {}, out = { keys: {}, conflicts: [] };
    Object.keys(local).concat(Object.keys(remote)).forEach(function (k) { if (isData(k)) keys[k] = 1; });
    Object.keys(keys).forEach(function (k) {
      var L = local[k] == null ? null : local[k], R = remote[k] == null ? null : remote[k];
      var B = base ? base[k] : undefined;
      if (L === R) { out.keys[k] = { same: true, value: L }; return; }
      var lu = units(L), ru = units(R);
      /* شكل مختلف بين الجهازين (أو مفتاح كامل): المفتاح كله وحدة واحدة */
      var whole = !lu || !ru ? false : lu.type !== ru.type;
      var type = (lu || ru).type;
      if (whole) { lu = { type: "R", list: [["*", L]] }; ru = { type: "R", list: [["*", R]] }; type = "R"; }
      if (B && B["#"] !== type) B = null;
      var lm = {}, rm = {};
      (lu ? lu.list : []).forEach(function (u) { lm[u[0]] = u[1]; });
      (ru ? ru.list : []).forEach(function (u) { rm[u[0]] = u[1]; });
      var order = (lu ? lu.list : []).map(function (u) { return u[0]; });
      (ru ? ru.list : []).forEach(function (u) { if (!(u[0] in lm)) order.push(u[0]); });
      var pick = {};
      order.forEach(function (uid) {
        var l = uid in lm ? lm[uid] : null, r = uid in rm ? rm[uid] : null;
        if (l === r) { pick[uid] = l; return; }
        var lh = l == null ? null : hash(l), rh = r == null ? null : hash(r);
        if (B) {
          var bh = uid in B ? B[uid] : null;
          if (lh === bh) { pick[uid] = r; return; }      /* اتغيّرت على الكمبيوتر بس */
          if (rh === bh) { pick[uid] = l; return; }      /* اتغيّرت على الموبايل بس */
        } else if (base) {
          /* مفتاح جديد من آخر مزامنة: الموجود على جهاز واحد بيتنقل للتاني */
          if (l == null) { pick[uid] = r; return; }
          if (r == null) { pick[uid] = l; return; }
        } else {
          if (firstMode === "phone") { pick[uid] = l; return; }
          if (firstMode === "pc") { pick[uid] = r; return; }
          if (l == null) { pick[uid] = r; return; }
          if (r == null) { pick[uid] = l; return; }
        }
        pick[uid] = undefined;
        var d = describe(k, uid, l, r);
        out.conflicts.push({ key: k, uid: uid, local: l, remote: r, title: d.title, fields: d.fields,
                             gone: l == null ? "phone" : r == null ? "pc" : "" });
      });
      out.keys[k] = { type: type, order: order, pick: pick, L: L, R: R };
    });
    return out;
  }
  function finish(p, choices) {
    var res = {};
    Object.keys(p.keys).forEach(function (k) {
      var x = p.keys[k];
      if (x.same) { res[k] = x.value; return; }
      var list = [];
      x.order.forEach(function (uid) {
        var v = x.pick[uid];
        if (v === undefined) v = choices[k + SEP + SEP + uid];
        if (v != null) list.push([uid, v]);
      });
      /* كل السجلات اتمسحت: المفتاح يتمسح لو كان أصلاً على جهاز واحد بس */
      res[k] = list.length || (x.L != null && x.R != null) ? rebuild(x.type, list) : null;
    });
    return res;
  }

  /* -------------------------------------------------------- اختيار التعارض */
  function chooseConflicts(conflicts, done) {
    var choice = {};
    var back = document.createElement("div");
    back.setAttribute("data-modal", "1"); back.setAttribute("data-nosave", "1");
    back.style.cssText = "position:fixed;inset:0;background:rgba(20,14,8,.62);z-index:10095;display:flex;align-items:flex-end;justify-content:center";
    var box = document.createElement("div");
    box.style.cssText = "background:var(--card,#fff);border-radius:16px 16px 0 0;padding:16px 16px 22px;width:100%;max-width:620px;direction:rtl;max-height:90vh;overflow-y:auto;color:var(--text)";
    function el(t, css, txt) { var e = document.createElement(t); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; }
    box.appendChild(el("div", "font-family:var(--f-title);font-size:17px", "اتعدّلوا على الجهازين — تختار أنهي نسخة؟"));
    box.appendChild(el("div", "font-size:12.5px;color:var(--muted);margin:2px 0 10px;line-height:1.8",
      ar(conflicts.length) + " سجل اتغيّر على الموبايل وعلى الكمبيوتر من آخر مزامنة. لكل واحد اختار النسخة اللي تفضل على الجهازين."));
    var all = el("div", "display:flex;gap:8px;margin-bottom:10px");
    var rows = [];
    function mk(txt, css) { var b = el("button", "flex:1;min-height:42px;border-radius:9px;font-family:inherit;font-size:13.5px;" + css, txt); b.type = "button"; return b; }
    var allP = mk("📱 كله نسخة الموبايل", "border:1px solid var(--brand);background:transparent;color:var(--brand)");
    var allC = mk("💻 كله نسخة الكمبيوتر", "border:1px solid #1a4a8a;background:transparent;color:#1a4a8a");
    all.appendChild(allP); all.appendChild(allC); box.appendChild(all);
    conflicts.forEach(function (c, i) {
      var card = el("div", "border:1px solid var(--line,#ddd);border-radius:10px;padding:9px 11px;margin-bottom:8px");
      card.appendChild(el("div", "font-weight:600;font-size:14px;line-height:1.7", c.title));
      var note = c.gone === "phone" ? "اتمسح من الموبايل واتعدّل على الكمبيوتر" : c.gone === "pc" ? "اتمسح من الكمبيوتر واتعدّل على الموبايل"
        : (c.fields.length ? "الاختلاف في: " + c.fields.join("، ") : "");
      if (note) card.appendChild(el("div", "font-size:12px;color:var(--muted);margin:2px 0 6px", note));
      var r = el("div", "display:flex;gap:8px");
      var bp = mk(c.local == null ? "📱 امسحه (الموبايل)" : "📱 الموبايل", ""), bc = mk(c.remote == null ? "💻 امسحه (الكمبيوتر)" : "💻 الكمبيوتر", "");
      function paint() {
        var v = choice[i];
        bp.style.cssText = bc.style.cssText = "flex:1;min-height:42px;border-radius:9px;font-family:inherit;font-size:13.5px;border:1px solid var(--line,#ddd);background:transparent;color:var(--text)";
        if (v === "phone") bp.style.cssText += ";border:2px solid var(--brand);font-weight:700";
        if (v === "pc") bc.style.cssText += ";border:2px solid #1a4a8a;font-weight:700";
      }
      bp.onclick = function () { choice[i] = "phone"; paint(); };
      bc.onclick = function () { choice[i] = "pc"; paint(); };
      paint(); rows.push(paint);
      r.appendChild(bp); r.appendChild(bc); card.appendChild(r); box.appendChild(card);
    });
    allP.onclick = function () { conflicts.forEach(function (c, i) { choice[i] = "phone"; }); rows.forEach(function (f) { f(); }); };
    allC.onclick = function () { conflicts.forEach(function (c, i) { choice[i] = "pc"; }); rows.forEach(function (f) { f(); }); };
    var act = el("div", "display:flex;gap:9px;margin-top:12px;position:sticky;bottom:-22px;background:var(--card,#fff);padding:8px 0");
    var ok = mk("كمّل المزامنة", "border:0;background:var(--brand);color:#fff;font-weight:600;min-height:50px");
    ok.setAttribute("data-plain-save", "1");
    var no = mk("إلغاء (من غير تغيير)", "border:1px solid var(--line,#ddd);background:transparent;color:var(--muted);min-height:50px");
    ok.onclick = function () {
      var left = conflicts.filter(function (c, i) { return !choice[i]; }).length;
      if (left) { alert("لسه " + ar(left) + " سجل ما اخترتش نسخته."); return; }
      var out = {};
      conflicts.forEach(function (c, i) { out[c.key + SEP + SEP + c.uid] = choice[i] === "phone" ? c.local : c.remote; });
      back.remove(); done(out);
    };
    no.onclick = function () { back.remove(); done(null); };
    act.appendChild(ok); act.appendChild(no); box.appendChild(act);
    back.appendChild(box); document.body.appendChild(back);
  }

  /* -------------------------------------------------------------- الحفظ هنا */
  function writeLocal(res, local) {
    var changed = 0;
    Object.keys(res).forEach(function (k) {
      var v = res[k];
      if (v === (local[k] == null ? null : local[k])) return;
      changed++;
      if (v == null) { localStorage.removeItem(k); return; }
      if (k === CASES && w.CaseFile && CaseFile.commitAll) { if (!CaseFile.commitAll(JSON.parse(v))) throw new Error("space"); return; }
      if (k === CLIENTS && w.ClientsPOA && ClientsPOA.commitAll) { if (!ClientsPOA.commitAll(JSON.parse(v))) throw new Error("space"); return; }
      if (k === "proflawyer.regs.v1" && w.Registers && Registers.commitAll) { if (!Registers.commitAll(JSON.parse(v))) throw new Error("space"); return; }
      localStorage.setItem(k, v);
    });
    return changed;
  }

  /* --------------------------------------------------------------- المزامنة */
  var busy = false;
  /** progress(text) — done(err, summary) */
  function sync(progress, done, firstMode) {
    if (busy) return;
    var c = cfg();
    if (!c.host || !c.token) { done("اعمل إقران مع الكمبيوتر الأول."); return; }
    busy = true;
    function end(err, sum) { call("POST", "/lan/end", {}).then(function () { busy = false; done(err, sum); }); }
    progress("بنتصل بالكمبيوتر…");
    var tries = 0;
    function begin() {
      call("POST", "/lan/begin", {}).then(function (r) {
        if (!r.ok) { busy = false; done(errText(r)); return; }
        if (r.json.pcOpen && !r.json.flushed && tries++ < 8) { progress("مستنيين الكمبيوتر يحفظ آخر تعديل…"); setTimeout(begin, 1000); return; }
        fetchAll();
      });
    }
    function fetchAll() {
      progress("بنقرا بيانات الكمبيوتر…");
      call("GET", "/lan/store").then(function (r) {
        if (!r.ok || !r.json) { end(errText(r)); return; }
        var remote = r.json.store || {}, rev = r.json.rev;
        if (c.serverId && r.json.serverId !== c.serverId) { localStorage.removeItem(BASE); }
        c.serverId = r.json.serverId; saveCfg(c);
        var b = getJ(BASE, null);
        var base = b && b.serverId === c.serverId ? b.keys : null;
        /* نسخة الكمبيوتر الجديدة بتعمل لنفسها قوائم وفريق افتراضي أول ما تتفتح، فـ«فاضية»
           = مافيهاش ولا قضية ولا موكل؛ ساعتها الموبايل هو الأساس من غير سؤال */
        function count(k) { try { return (JSON.parse(remote[k] || "[]") || []).length; } catch (e) { return 1; } }
        var pcEmpty = !count(CASES) && !count(CLIENTS);
        if (!base && !pcEmpty && !firstMode) {
          end(null, { needFirst: true });
          return;
        }
        var local = localStore();
        var p = plan(local, remote, base, pcEmpty ? "phone" : firstMode);
        function apply(choices) {
          if (!choices) { end("اتلغت المزامنة — ما اتغيّرش حاجة."); return; }
          var res = finish(p, choices);
          progress("بنحفظ نسخة احتياطية من الموبايل على الكمبيوتر…");
          call("POST", "/lan/backup", { store: local }).then(function (bk) {
            if (!bk.ok) { end(errText(bk)); return; }
            progress("بنحفظ على الموبايل…");
            var nLocal;
            try { nLocal = writeLocal(res, local); }
            catch (e) { end("المساحة على الموبايل مش كفاية — ما اتغيّرش الكمبيوتر."); return; }
            var set = {}, del = [];
            Object.keys(res).forEach(function (k) {
              var R = remote[k] == null ? null : remote[k];
              if (res[k] === R) return;
              if (res[k] == null) { if (R != null) del.push(k); } else set[k] = res[k];
            });
            progress("بنبعت للكمبيوتر…");
            call("POST", "/lan/store", { baseRev: rev, set: set, del: del }).then(function (s) {
              if (!s.ok) { end(errText(s)); return; }
              var nb = {};
              Object.keys(res).forEach(function (k) {
                if (res[k] == null) return;
                var u = units(res[k]); nb[k] = baseOf(u.type, u.list);
              });
              setJ(BASE, { serverId: c.serverId, at: Date.now(), keys: nb });
              var c2 = cfg(); c2.lastAt = Date.now(); saveCfg(c2);
              end(null, { toPhone: nLocal, toPc: Object.keys(set).length + del.length, conflicts: p.conflicts.length });
            });
          });
        }
        if (p.conflicts.length) { progress("فيه سجلات اتعدّلت على الجهازين…"); chooseConflicts(p.conflicts, apply); }
        else apply({});
      });
    }
    begin();
  }

  w.LanSync = { cfg: cfg, pair: pair, unpair: unpair, sync: sync, available: function () { return !!(w.AndroidLan && AndroidLan.request); },
                _plan: plan, _finish: finish, _units: units };
})(window);
