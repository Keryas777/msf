// docs/sw.js
const CACHE = "losp-v1";

const CORE_ASSETS = [
  "./",
  "./home.html",
  "./style.css",
  "./home.css",
  "./install-banner.js",
  "./manifest.webmanifest",

  // tes images clés (ajuste si besoin)
  "./HeaderHome.webp",
  "./icon-512.PNG",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req)
        .then((res) => {
          // On met en cache les assets statiques usuels
          const url = new URL(req.url);
          const isSameOrigin = url.origin === self.location.origin;
          const isStatic =
            /\.(css|js|png|jpg|jpeg|webp|svg|json|woff2?)$/i.test(url.pathname);

          if (isSameOrigin && isStatic && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached); // fallback si offline
    })
  );
});
