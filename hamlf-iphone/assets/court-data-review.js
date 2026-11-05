(function () {
  var D = (window.COURT_DATA && window.COURT_DATA.levels) || {};
  var keys = (window.COURT_DATA && window.COURT_DATA.order || Object.keys(D))
               .filter(function (k) { return D[k]; });

  function uniq(a) { var s = {}, o = []; a.forEach(function (x) { if (!s[x]) { s[x] = 1; o.push(x); } }); return o; }

  function levelStats(k) {
    var lv = D[k], types = [], circ = [];
    (lv.courts || []).forEach(function (c) {
      (c.types || []).forEach(function (t) {
        types.push(t.name);
        (t.circuits || []).forEach(function (x) { circ.push(x); });
      });
    });
    return { courts: (lv.courts || []).length, types: uniq(types).length, circ: uniq(circ).length };
  }

  /* ---------- الإجمالي ---------- */
  var tc = 0, tt = 0, tx = 0, rows = "";
  keys.forEach(function (k) {
    var s = levelStats(k);
    tc += s.courts; tt += s.types; tx += s.circ;
    rows += "<tr><td>" + k + "</td><td>" + s.courts + "</td><td>" +
            s.types + "</td><td>" + s.circ + "</td></tr>";
  });
  document.getElementById("levelRows").innerHTML = rows;
  document.getElementById("totals").innerHTML =
    "<div><b>" + keys.length + "</b>درجة تقاضٍ</div>" +
    "<div><b>" + tc + "</b>محكمة</div>" +
    "<div><b>" + tt + "</b>نوع دعوى</div>" +
    "<div><b>" + tx + "</b>دائرة</div>";

  /* ---------- التصفّح ---------- */
  var lvSel = document.getElementById("lv");
  var ctSel = document.getElementById("ct");

  keys.forEach(function (k) {
    var o = document.createElement("option");
    o.value = k; o.textContent = k;
    lvSel.appendChild(o);
  });

  function onLevel() {
    var lv = D[lvSel.value];
    document.getElementById("lvSrc").textContent = "المصدر: " + (lv.source || "—");
    ctSel.innerHTML = "";
    (lv.courts || []).forEach(function (c, i) {
      var o = document.createElement("option");
      o.value = i; o.textContent = c.name;
      ctSel.appendChild(o);
    });
    onCourt();
  }

  function onCourt() {
    var lv = D[lvSel.value];
    var c  = (lv.courts || [])[ctSel.value | 0];
    if (!c) { document.getElementById("types").innerHTML = ""; document.getElementById("circRows").innerHTML = ""; return; }

    document.getElementById("types").innerHTML =
      (c.types || []).map(function (t) { return '<span class="pill">' + t.name + "</span>"; }).join("") ||
      '<span class="note">— لا توجد —</span>';

    document.getElementById("circRows").innerHTML =
      (c.types || []).map(function (t) {
        var list = (t.circuits || []);
        return "<tr><td>" + t.name + "</td><td>" +
               (list.length ? list.join(" · ") : '<span style="color:#9aa7b2">— لا دوائر مسجَّلة —</span>') +
               "</td></tr>";
      }).join("");
  }

  lvSel.addEventListener("change", onLevel);
  ctSel.addEventListener("change", onCourt);
  if (keys.length) onLevel();
})();
