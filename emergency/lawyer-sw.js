/* Service worker بسيط لبوابة محامي الطوارئ: بيخلّي الصفحة تفتح من غير نت (البيانات محلية لحد الربط). */
var C = "hamlf-em-v1", FILES = ["lawyer.html", "emergency-core.js?v=1", "emergency-ui.js?v=1", "../SF-Mada-Bold.ttf", "../Sultan-Black.ttf", "../logo.png"];
self.addEventListener("install", function (e) { e.waitUntil(caches.open(C).then(function (c) { return c.addAll(FILES); })); self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(caches.keys().then(function (k) { return Promise.all(k.filter(function (x) { return x !== C; }).map(function (x) { return caches.delete(x); })); })); });
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).then(function (r) { var cp = r.clone(); caches.open(C).then(function (c) { c.put(e.request, cp); }); return r; })
    .catch(function () { return caches.match(e.request); }));
});
