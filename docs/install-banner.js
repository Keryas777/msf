// docs/install-banner.js
(() => {
  const banner = document.getElementById("installBanner");
  const btnHow = document.getElementById("installHow");
  const btnNow = document.getElementById("installNow");
  const btnClose = document.getElementById("installClose");
  const sub = document.getElementById("installSub");
  const modal = document.getElementById("installModal");

  if (!banner || !btnClose) return;

  // =========================
  // Config / Storage
  // =========================
  // "si l’utilisateur ferme → on retient" (définitif)
  const KEY_DISMISSED = "losp_install_dismissed_v2"; // value: "1"
  // "si installé → on cache définitivement" (définitif)
  const KEY_INSTALLED = "losp_install_installed_v2"; // value: "1"

  const safeGet = (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  };

  const safeSet = (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  };

  const markDismissed = () => safeSet(KEY_DISMISSED, "1");
  const markInstalled = () => safeSet(KEY_INSTALLED, "1");

  const wasDismissed = () => safeGet(KEY_DISMISSED) === "1";
  const wasInstalled = () => safeGet(KEY_INSTALLED) === "1";

  // =========================
  // Platform detection
  // =========================
  const isIOS = () => {
    const ua = navigator.userAgent || "";
    const iOSDevice = /iPad|iPhone|iPod/.test(ua);
    // iPadOS 13+ can look like Mac
    const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    return iOSDevice || iPadOS;
  };

  const isStandalone = () => {
    // iOS Safari standalone
    const iosStandalone = window.navigator.standalone === true;
    // PWA display-mode
    const mqlStandalone =
      window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
    return iosStandalone || mqlStandalone;
  };

  // =========================
  // UI helpers
  // =========================
  const hideBanner = () => {
    banner.hidden = true;
  };

  const showBannerShell = () => {
    banner.hidden = false;
    // reset buttons visibility
    if (btnHow) btnHow.hidden = true;
    if (btnNow) btnNow.hidden = true;
  };

  // =========================
  // Modal
  // =========================
  const openModal = () => {
    if (!modal) return;
    modal.hidden = false;
    document.documentElement.style.overflow = "hidden";
  };

  const closeModal = () => {
    if (!modal) return;
    modal.hidden = true;
    document.documentElement.style.overflow = "";
  };

  modal?.addEventListener("click", (e) => {
    const t = e.target;
    if (t && t.getAttribute && t.getAttribute("data-close") === "1") closeModal();
  });

  // =========================
  // Decision: should we even show?
  // =========================
  const shouldNeverShow = () => {
    // If already installed OR already in standalone => never show again
    if (wasInstalled()) return true;
    if (isStandalone()) {
      markInstalled();
      return true;
    }
    // If user dismissed => never show again
    if (wasDismissed()) return true;
    return false;
  };

  // =========================
  // Android install prompt
  // =========================
  let deferredPrompt = null;

  const onAndroidInstallClick = async () => {
    if (!deferredPrompt) return;

    banner.classList.add("isActive");
    deferredPrompt.prompt();

    let res = null;
    try {
      res = await deferredPrompt.userChoice;
    } catch {
      res = null;
    }

    deferredPrompt = null;
    banner.classList.remove("isActive");

    if (res && res.outcome === "accepted") {
      // appinstalled event should fire, but we also record immediately
      markInstalled();
      hideBanner();
    }
  };

  window.addEventListener("beforeinstallprompt", (e) => {
    // Chrome/Android: keep the event to trigger on click
    e.preventDefault();
    deferredPrompt = e;

    // If we should never show, do nothing
    if (shouldNeverShow()) return;

    // show Android banner
    showBanner("android");
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    markInstalled();
    hideBanner();
  });

  // =========================
  // Show logic
  // =========================
  const showBanner = (mode) => {
    if (shouldNeverShow()) return;

    showBannerShell();

    if (mode === "android") {
      if (sub) sub.textContent = "Installe LoSP en 1 clic (Android).";
      if (btnNow) btnNow.hidden = false;

      // ensure we don't stack listeners
      btnNow?.removeEventListener("click", onAndroidInstallClick);
      btnNow?.addEventListener("click", onAndroidInstallClick, { passive: true });
    } else {
      // iOS: no programmatic install prompt
      if (sub) sub.textContent = "Ajoute LoSP sur ton écran d’accueil (iPhone/iPad).";
      if (btnHow) btnHow.hidden = false;

      const onHow = () => {
        banner.classList.add("isActive");
        openModal();
        setTimeout(() => banner.classList.remove("isActive"), 220);
      };

      // avoid stacking
      btnHow?.removeEventListener("click", onHow);
      btnHow?.addEventListener("click", onHow, { passive: true });
    }
  };

  // Close banner => remember forever
  btnClose.addEventListener("click", () => {
    markDismissed();
    hideBanner();
  });

  // If the user navigates in standalone, mark installed
  // (some browsers flip display-mode after "Add to Home Screen")
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && isStandalone()) {
      markInstalled();
      hideBanner();
    }
  });

  // =========================
  // Initial check (home page)
  // =========================
  if (shouldNeverShow()) {
    hideBanner();
    return;
  }

  // iOS: show immediately (if not installed and not dismissed)
  if (isIOS()) {
    showBanner("ios");
  }
  // Android: we wait for beforeinstallprompt (do not force)
})();