// docs/sw.js
const CACHE = "losp-v2";

const CORE_ASSETS = [
  "./home.html",
  "./style.css",
  "./home.css",
  "./install-banner.js",
  "./manifest.webmanifest",

  // Images home
  "./HeaderHome.webp",
  "./Contres.webp",
  "./Classement.webp",
  "./ISO-8.webp",

  // Icon
  "./icon-512.PNG",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;

  // ✅ Navigation (pages): cache-first + fallback home
  if (req.mode === "navigate") {
    event.respondWith(
      caches.match("./home.html")
        .then((homeCached) =>
          fetch(req)
            .then((res) => {
              // cache la page si OK
              if (res && res.ok) {
                const copy = res.clone();
                caches.open(CACHE).then((c) => c.put(req, copy));
              }
              return res;
            })
            .catch(() => homeCached || caches.match(req))
        )
    );
    return;
  }

  // Static assets: cache-first then network+cache
  const isStatic = /\.(css|js|png|jpg|jpeg|webp|svg|json|woff2?)$/i.test(url.pathname);

  if (!isSameOrigin || !isStatic) {
    // laisse passer (pas de cache)
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});