(() => {
  "use strict";

  const form = document.getElementById("warAdminForm");
  if (!form) return;

  let wakeLock = null;
  let requestInFlight = false;

  function isSessionRunning() {
    return form.getAttribute("aria-busy") === "true";
  }

  function isPageVisible() {
    return document.visibilityState !== "hidden";
  }

  function isSupported() {
    return Boolean(navigator.wakeLock && typeof navigator.wakeLock.request === "function");
  }

  async function releaseWakeLock() {
    const current = wakeLock;
    wakeLock = null;
    if (!current || current.released || typeof current.release !== "function") return;

    try {
      await current.release();
    } catch (_) {
      // La libération peut déjà avoir été faite automatiquement par le navigateur.
    }
  }

  async function requestWakeLock() {
    if (
      !isSupported() ||
      !isSessionRunning() ||
      !isPageVisible() ||
      requestInFlight ||
      (wakeLock && !wakeLock.released)
    ) {
      return;
    }

    requestInFlight = true;
    try {
      const sentinel = await navigator.wakeLock.request("screen");

      if (!isSessionRunning() || !isPageVisible()) {
        if (!sentinel.released && typeof sentinel.release === "function") {
          try {
            await sentinel.release();
          } catch (_) {
            // Rien à faire : la page n'a plus besoin de conserver l'écran éveillé.
          }
        }
        return;
      }

      wakeLock = sentinel;
      if (typeof sentinel.addEventListener === "function") {
        sentinel.addEventListener("release", () => {
          if (wakeLock === sentinel) wakeLock = null;
        });
      }
    } catch (_) {
      // Le système peut refuser le wake lock (batterie faible, économie d'énergie, etc.).
      // Le traitement War Admin doit continuer normalement dans ce cas.
    } finally {
      requestInFlight = false;
    }
  }

  async function syncWakeLock() {
    if (!isSessionRunning() || !isPageVisible()) {
      await releaseWakeLock();
      return;
    }

    await requestWakeLock();
  }

  const observer = new MutationObserver(() => {
    void syncWakeLock();
  });
  observer.observe(form, {
    attributes: true,
    attributeFilter: ["aria-busy"]
  });

  document.addEventListener("visibilitychange", () => {
    void syncWakeLock();
  });
  window.addEventListener("focus", () => {
    void syncWakeLock();
  });
  window.addEventListener("pageshow", () => {
    void syncWakeLock();
  });
  window.addEventListener("pagehide", () => {
    void releaseWakeLock();
  });

  void syncWakeLock();
})();
