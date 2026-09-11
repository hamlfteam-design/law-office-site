// Service Worker بسيط لتطبيق مؤسسة د. حسن عبد المنعم حسن
// الاستراتيجية: "الشبكة أولاً" (network-first) للصفحات — يعني أي تحديث
// جديد للموقع بيظهر فورًا لأي زائر، ومفيش تخزين قديم بيتعارض مع التحديثات.
// الكاش بيتستخدم بس لو النت مقطوع تمامًا (احتياطي، مش المصدر الأساسي).

const CACHE_NAME = "hamlf-app-v2"; // غيّر الرقم ده في أي تحديث مستقبلي عشان يجبر تفريغ الكاش القديم
const APP_SHELL = [
  "./app.html",
  "./index.html",
  "./css/style.css",
  "./manifest.json",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
