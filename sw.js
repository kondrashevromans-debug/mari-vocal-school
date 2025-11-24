const CACHE_NAME = "audio-cache-v1";
const AUDIO_EXTENSIONS = [".mp3", ".wav", ".ogg"];

self.addEventListener("fetch", (event) => {
  const url = event.request.url;
  if (AUDIO_EXTENSIONS.some((ext) => url.endsWith(ext))) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then(
          (response) =>
            response ||
            fetch(event.request).then((networkResponse) => {
              cache.put(event.request, networkResponse.clone());
              return networkResponse;
            })
        )
      )
    );
  }
});
