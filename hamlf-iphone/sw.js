/* HAMLF PWA — نسخة 264bc0ae16 (بتتولّد تلقائياً من tools/build-pwa.py، ما تعدّلهاش بإيدك) */
var CACHE = "hamlf-iphone-264bc0ae16";
var CORE = ["01-cases.html", "02-admin-works.html", "03-execution.html", "04-bailiff-papers.html", "05-powers-of-attorney.html", "06-route-sheet.html", "07-alerts.html", "08-search.html", "09-backup.html", "20-cases-hub.html", "30-finance-hub.html", "31-case-revenue.html", "32-case-expenses.html", "33-office-expenses.html", "40-hr-hub.html", "41-contract.html", "42-wage.html", "43-payroll.html", "44-evaluation.html", "45-residency.html", "46-work-permit.html", "47-visa.html", "48-end-service.html", "49-staff.html", "50-secretariat.html", "60-reports-hub.html", "61-report-builder.html", "62-report-print.html", "70-clients-hub.html", "71-client-profile.html", "79-assign-cases.html", "80-team.html", "81-assignments.html", "82-minutes.html", "83-experts.html", "84-forgery.html", "85-appointments.html", "86-import.html", "87-calendar.html", "88-records.html", "89-clients.html", "90-case-file.html", "90-links.html", "90-proposal-case-types.html", "91-expenses.html", "92-court-data.html", "92-register.html", "93-find.html", "94-lists.html", "95-audit.html", "96-tasks.html", "97-client-accounts.html", "98-connect.html", "98-login.html", "98-report.html", "99-attendance.html", "99-chat.html", "all-screens.html", "apple-touch-icon.png", "assets/IBMPlexSansArabic-Medium.ttf", "assets/IBMPlexSansArabic-Regular.ttf", "assets/IBMPlexSansArabic-SemiBold.ttf", "assets/SF-Sultan-Black.ttf", "assets/_depmap.json", "assets/actions.js", "assets/admin-courts-data.js", "assets/agenda-import.js", "assets/app-icon.png", "assets/app.css", "assets/app.js", "assets/ask.js", "assets/attach.js", "assets/attendance.js", "assets/auth.js", "assets/autofit.js", "assets/backup-page.js", "assets/big-store.js", "assets/birthdays.js", "assets/case-file.js", "assets/case-revenue.js", "assets/case-scope.js", "assets/case-statement.js", "assets/chat.js", "assets/cleanup.js", "assets/client-report.js", "assets/clients-poa.js", "assets/clients.js", "assets/cloud-store.js", "assets/combo.js", "assets/contacts-sync.js", "assets/court-data-review.js", "assets/court-data.js", "assets/courts.js", "assets/data.js", "assets/dateinput.js", "assets/datepicker.js", "assets/drive-docs.js", "assets/drive-file-sync.js", "assets/economic-subjects.js", "assets/empty.js", "assets/expenses.js", "assets/extras.js", "assets/findall.js", "assets/findbar.js", "assets/firebase-config.js", "assets/fixups.js", "assets/holidays.js", "assets/home-hide.js", "assets/idcrop.js", "assets/identity-gate.js", "assets/idocr.js", "assets/ios-bridges.js", "assets/lan-sync.js", "assets/letterhead.jpg", "assets/letterhead.js", "assets/lists.js", "assets/login-gate.js", "assets/minutes.js", "assets/mobile.js", "assets/norm.js", "assets/officepaper.jpg", "assets/pdfbuild.js", "assets/pdfdoc.js", "assets/pdfview.js", "assets/people-suggest.js", "assets/poa-merge.js", "assets/poa-sync.js", "assets/portal-statements.js", "assets/pwa.css", "assets/pwa.js", "assets/qr.js", "assets/registers.js", "assets/regs-def.js", "assets/reminders.js", "assets/report-live.js", "assets/route-sheet.js", "assets/scanfx.js", "assets/sf-mada-bold.ttf", "assets/share.js", "assets/stats.js", "assets/store.js", "assets/suntime.js", "assets/sync.js", "assets/team.js", "assets/web-store.js", "client-home.html", "e-litigation.html", "home.html", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "index.html", "iphone.html", "manifest.webmanifest"];
var WEB = '<script src="assets/web-store.js?v=1"></script>';

/* ---- مخزن البيانات الكبيرة (kv: بيتحقن في كل صفحة) والمرفقات (files: بتتقري عند الطلب) ---- */
var mem = null, fidx = null, chain = null, dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise(function (ok, bad) {
    var r = indexedDB.open("hamlf-big", 2);
    r.onupgradeneeded = function () {
      var d = r.result;
      if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv");
      if (!d.objectStoreNames.contains("files")) d.createObjectStore("files");
    };
    r.onsuccess = function () { ok(r.result); }; r.onerror = function () { dbp = null; bad(r.error); };
  });
  return dbp;
}
function scan(d, store, val) {
  return new Promise(function (ok, bad) {
    var out = {}, t = d.transaction(store, "readonly"), c = t.objectStore(store).openCursor();
    c.onsuccess = function () { var x = c.result; if (x) { out[x.key] = val(x.value); x.continue(); } };
    t.oncomplete = function () { ok(out); }; t.onerror = function () { bad(t.error); };
  });
}
function load() {
  if (chain) return chain;
  chain = db().then(function (d) {
    return Promise.all([scan(d, "kv", function (v) { return v; }),
                        scan(d, "files", function (v) { return Math.round(String(v).length * 3 / 4); })]);
  }).then(function (r) { mem = r[0]; fidx = r[1]; })
    .catch(function () { mem = mem || {}; fidx = fidx || {}; });
  return chain;
}
function persist(store, op, k, v) {
  return db().then(function (d) {
    return new Promise(function (ok) {
      var t = d.transaction(store, "readwrite"), st = t.objectStore(store);
      if (op === "set" || op === "put") st.put(v, k); else st.delete(k);
      t.oncomplete = ok; t.onerror = ok; t.onabort = ok;
    });
  });
}
function readFile(k) {
  return db().then(function (d) {
    return new Promise(function (ok) {
      var q = d.transaction("files", "readonly").objectStore("files").get(k);
      q.onsuccess = function () { ok(q.result); }; q.onerror = function () { ok(undefined); };
    });
  });
}
self.addEventListener("message", function (e) {
  var m = e.data;
  if (!m || !(m.hamlfStore || m.hamlfFile)) return;
  /* بالترتيب: كل كتابة بتستنى اللي قبلها، والصفحة الجاية بتستنى الكل */
  chain = load().then(function () {
    if (m.hamlfStore) {
      if (m.hamlfStore === "set") mem[m.k] = m.v; else delete mem[m.k];
      return persist("kv", m.hamlfStore, m.k, m.v);
    }
    if (m.hamlfFile === "put") fidx[m.k] = Math.round(String(m.v).length * 3 / 4); else delete fidx[m.k];
    return persist("files", m.hamlfFile, m.k, m.v);
  });
  e.waitUntil(chain);
});
function esc(o) {
  return JSON.stringify(o || {}).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
function inject(res) {
  return Promise.all([res.text(), load()]).then(function (a) {
    var html = a[0], js = "window.__BIG=" + esc(mem) + ";window.__FILES=" + esc(fidx) + ";";
    html = html.replace(WEB, function () { return "<script>" + js + "<\/script>\n" + WEB; });
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  });
}
function serveFile(name) {
  return load().then(function () { return readFile(name); }).then(function (v) {
    return v == null ? new Response("", { status: 404 })
      : new Response(v, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  });
}

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf("hamlf-iphone-") === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin) return;   /* فايربيز وجوجل: دايماً من النت، ما بتتخزنش */
  var fm = u.pathname.match(/\/hamlf-files\/([^\/]+)$/);
  if (fm) { e.respondWith(serveFile(decodeURIComponent(fm[1]))); return; }
  var page = /\.html$/.test(u.pathname) || /\/$/.test(u.pathname);
  e.respondWith(caches.open(CACHE).then(function (c) {
    return c.match(r, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      return fetch(r).then(function (res) { if (res.ok) c.put(r, res.clone()); return res; });
    });
  }).then(function (res) { return page && res.ok ? inject(res) : res; }));
});
