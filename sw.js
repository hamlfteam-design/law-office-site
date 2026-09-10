// Service Worker بسيط لتطبيق مؤسسة د. حسن عبد المنعم حسن
// الهدف: تخزين الصفحة الرئيسية والأصول الأساسية عشان التطبيق يفتح بسرعة
// ويشتغل حتى لو الاتصال بالإنترنت ضعيف — مش بديل عن الاتصال (البوابة
// والفورمات محتاجة إنترنت فعلي)، هو بس Cache للواجهة.

const CACHE_NAME = "hamlf-app-v1";
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
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
