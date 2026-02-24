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
  // Storage (définitif)
  // =========================
  const KEY_DISMISSED = "losp_install_dismissed_v2"; // "1"
  const KEY_INSTALLED = "losp_install_installed_v2"; // "1"

  const safeGet = (k) => {
    try { return localStorage.getItem(k); } catch { return null; }
  };
  const safeSet = (k, v) => {
    try { localStorage.setItem(k, v); } catch {}
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
    const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    return iOSDevice || iPadOS;
  };

  const isStandalone = () => {
    const iosStandalone = window.navigator.standalone === true;
    const mqlStandalone = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
    return iosStandalone || mqlStandalone;
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
  // Visibility helpers
  // =========================
  const hideBanner = () => { banner.hidden = true; };

  const showBannerShell = () => {
    banner.hidden = false;
    if (btnHow) btnHow.hidden = true;
    if (btnNow) btnNow.hidden = true;
  };

  const shouldNeverShow = () => {
    if (wasInstalled()) return true;
    if (isStandalone()) {
      markInstalled();
      return true;
    }
    if (wasDismissed()) return true;
    return false;
  };

  // =========================
  // Stable handlers (no stacking)
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
      markInstalled();
      hideBanner();
    }
  };

  const onIOSHowClick = () => {
    banner.classList.add("isActive");
    openModal();
    setTimeout(() => banner.classList.remove("isActive"), 220);
  };

  // =========================
  // Show logic
  // =========================
  const showBanner = (mode) => {
    if (shouldNeverShow()) return;

    showBannerShell();

    if (mode === "android") {
      if (sub) sub.textContent = "Installe LoSP en 1 clic (Android).";
      if (btnNow) btnNow.hidden = false;

      btnNow?.removeEventListener("click", onAndroidInstallClick);
      btnNow?.addEventListener("click", onAndroidInstallClick);
    } else {
      if (sub) sub.textContent = "Ajoute LoSP sur ton écran d’accueil (iPhone/iPad).";
      if (btnHow) btnHow.hidden = false;

      btnHow?.removeEventListener("click", onIOSHowClick);
      btnHow?.addEventListener("click", onIOSHowClick);
    }
  };

  // =========================
  // Close banner => remember forever
  // =========================
  btnClose.addEventListener("click", () => {
    markDismissed();
    hideBanner();
  });

  // If display-mode flips after A2HS, mark installed
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && isStandalone()) {
      markInstalled();
      hideBanner();
    }
  });

  // =========================
  // Android prompt hooks
  // =========================
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;

    if (shouldNeverShow()) return;
    showBanner("android");
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    markInstalled();
    hideBanner();
  });

  // =========================
  // Initial check (home)
  // =========================
  if (shouldNeverShow()) {
    hideBanner();
    return;
  }

  // iOS: show immediately
  if (isIOS()) showBanner("ios");
  // Android: wait for beforeinstallprompt
})();