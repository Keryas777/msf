// docs/sw.js

const CACHE = "losp-v16";

const CORE_ASSETS = [
  "./",
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

  // Images stats guerre
  "./HeaderStatGA.webp",
  "./HistoryGA.webp",
  "./ClassementDatas.webp",
  "./DonneesIndividuelles.webp",

  // Icons
  "./icon-192.png",
  "./icon-512.PNG"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key !== CACHE)
            .map((key) => caches.delete(key))
        );
      })
      .then(() => self.clients.claim())
  );
});

const isSameOrigin = (url) => url.origin === self.location.origin;

const isHtmlRequest = (request, url) => {
  return (
    request.mode === "navigate" ||
    url.pathname.endsWith(".html") ||
    url.pathname.endsWith("/")
  );
};

const isJsonRequest = (url) => {
  return url.pathname.endsWith(".json");
};

const isScriptOrStyle = (url) => {
  return /\.(css|js)$/i.test(url.pathname);
};

const isImageOrFont = (url) => {
  return /\.(png|jpg|jpeg|webp|svg|woff2?|ico)$/i.test(url.pathname);
};

async function networkFirst(request, fallbackUrl = null) {
  try {
    const response = await fetch(request);

    if (response && response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;

    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl);
      if (fallback) return fallback;
    }

    throw error;
  }
}

async function cacheFirstWithBackgroundUpdate(request) {
  const cached = await caches.match(request);

  const updatePromise = fetch(request)
    .then(async (response) => {
      if (response && response.ok) {
        const cache = await caches.open(CACHE);
        await cache.put(request, response.clone());
      }

      return response;
    })
    .catch(() => null);

  if (cached) {
    eventWait(updatePromise);
    return cached;
  }

  const response = await updatePromise;

  if (response) return response;

  return fetch(request);
}

function eventWait(promise) {
  promise.catch(() => {});
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (!isSameOrigin(url)) return;

  // HTML : toujours réseau d'abord, fallback home si offline.
  if (isHtmlRequest(request, url)) {
    event.respondWith(networkFirst(request, "./home.html"));
    return;
  }

  // JSON : toujours réseau d'abord.
  // Important pour les debriefs, war/index.json, war-history-lite.json, war-stats.json, joueurs.json, etc.
  if (isJsonRequest(url)) {
    event.respondWith(networkFirst(request));
    return;
  }

  // JS/CSS : réseau d'abord pour éviter les vieux fichiers après modif.
  if (isScriptOrStyle(url)) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Images/fonts : cache-first, car ça change beaucoup moins souvent.
  if (isImageOrFont(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchAndCache = fetch(request)
          .then((response) => {
            if (response && response.ok) {
              caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
            }

            return response;
          })
          .catch(() => cached);

        return cached || fetchAndCache;
      })
    );
  }
});
