// docs/sw.js
const CACHE = "losp-v3";

const CORE_ASSETS = [
  "./",                 // utile si quelqu’un ouvre /msf/ (selon ton routing GH pages)
  "./home.html",
  "./style.css",
  "./home.css",
  "./install-banner.js",
  "./manifest.webmanifest",
  "./sw.js",

  // Images home
  "./HeaderHome.webp",
  "./Contres.webp",
  "./Classement.webp",
  "./ISO-8.webp",

  // Icons
  "./icon-192.png",
  "./icon-512.PNG",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Helpers
const isSameOrigin = (url) => url.origin === self.location.origin;
const isStaticAsset = (pathname) => /\.(css|js|png|jpg|jpeg|webp|svg|json|woff2?)$/i.test(pathname);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // On ne gère que le même origin
  if (!isSameOrigin(url)) return;

  // ✅ NAVIGATION: network-first (pour éviter de rester bloqué sur une vieille version),
  // fallback -> cache home.html si offline
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // cache une copie "propre" de home.html (pas la requête exacte, qui peut contenir des params)
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("./home.html", copy));
          return res;
        })
        .catch(() => caches.match("./home.html"))
    );
    return;
  }

  // ✅ STATIC: cache-first + update en background
  if (!isStaticAsset(url.pathname)) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchAndCache = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            caches.open(CACHE).then((c) => c.put(req, res.clone()));
          }
          return res;
        })
        .catch(() => cached);

      // cache-first
      return cached || fetchAndCache;
    })
  );
});