const VERSION = "20260908-interaction-v3";
const CACHE_NAME = `lottoforge-mobile-${VERSION}`;
const CORE_ASSETS = [
  "./",
  "./index.html",
  `./style.css?v=${VERSION}`,
  `./mobile.css?v=${VERSION}`,
  `./script.js?v=${VERSION}`,
  `./app-mobile.js?v=${VERSION}`,
  "./manifest.webmanifest",
  "./offline.html",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const request = event.request;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  const isAppCode = request.mode === "navigate" || /\.(?:html|js|css|webmanifest)$/i.test(url.pathname);

  if (sameOrigin && isAppCode) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: "no-store" });
        if (response?.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone()).catch(() => {});
        }
        return response;
      } catch (_) {
        return (await caches.match(request, { ignoreSearch: true })) ||
          (request.mode === "navigate" ? await caches.match("./offline.html") : Response.error());
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (sameOrigin && response?.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    } catch (_) {
      return Response.error();
    }
  })());
});
