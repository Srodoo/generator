const CACHE_NAME = "lottoforge-mobile-v2-20260908";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./mobile.css",
  "./script.js",
  "./app-mobile.js",
  "./manifest.webmanifest",
  "./offline.html",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const request = event.request;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // Dla strony i kodu najpierw sieć, aby aktualizacje z GitHub Pages
  // były widoczne od razu zamiast utkwić w starym cache.
  const isAppCode = request.mode === "navigate" ||
    /\.(?:html|js|css|webmanifest)$/i.test(url.pathname);

  if (sameOrigin && isAppCode) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || (request.mode === "navigate" ? caches.match("./offline.html") : Response.error());
        })
    );
    return;
  }

  // Obrazy i pozostałe zasoby: cache-first.
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (sameOrigin && response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
