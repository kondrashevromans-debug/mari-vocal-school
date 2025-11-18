// Service Worker для offline-first
const CACHE_VERSION = "v1-mari-vocal";
const CACHE_NAME = `${CACHE_VERSION}`;
const MANIFEST_URL = "manifest.json";

// Список ресурсов для предзагрузки (будет обновляться из manifest.json)
let PRECACHE_RESOURCES = [
  "/",
  "index.html",
  "style.css",
  "trainer.html",
  "trainer.js",
  "tracks.html",
  "tracks.js",
  "track_detail.html",
  "track_detail.js",
  "daily_practice.html",
  "daily_practice.js",
  // ...добавить остальные html/js/audio/json
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    fetch(MANIFEST_URL)
      .then((resp) => resp.json())
      .then((manifest) => {
        if (Array.isArray(manifest.resources)) {
          PRECACHE_RESOURCES = manifest.resources;
        }
      })
      .catch(() => {})
      .then(() => {
        return caches.open(CACHE_NAME).then((cache) => {
          return cache.addAll(PRECACHE_RESOURCES);
        });
      })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    })
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((response) => {
      return (
        response ||
        fetch(event.request)
          .then((networkResp) => {
            // Кэшируем новые ресурсы
            if (networkResp.ok) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResp.clone());
              });
            }
            return networkResp;
          })
          .catch(() => {
            // Offline fallback: можно вернуть кастомную страницу или пустой ответ
            if (event.request.destination === "document") {
              return caches.match("index.html");
            }
          })
      );
    })
  );
});

// Для отладки: сообщение о статусе кэша
self.addEventListener("message", (event) => {
  if (event.data === "get-cache-keys") {
    caches.open(CACHE_NAME).then((cache) => {
      cache.keys().then((keys) => {
        event.ports[0].postMessage(keys.map((r) => r.url));
      });
    });
  }
});
