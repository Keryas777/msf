// docs/install-banner.js
(() => {
  const banner = document.getElementById("installBanner");
  const btnHow = document.getElementById("installHow");
  const btnNow = document.getElementById("installNow");
  const btnClose = document.getElementById("installClose");
  const sub = document.getElementById("installSub");
  const modal = document.getElementById("installModal");

  if (!banner || !btnClose) return;

  // -------------------------
  // Storage (définitif)
  // -------------------------
  const KEY_DISMISSED = "losp_install_dismissed_v3"; // "1"
  const KEY_INSTALLED = "losp_install_installed_v3"; // "1"

  const safeGet = (k) => {
    try { return localStorage.getItem(k); } catch { return null; }
  };
  const safeSet = (k, v) => {
    try { localStorage.setItem(k, v); } catch {}
  };

  const wasDismissed = () => safeGet(KEY_DISMISSED) === "1";
  const wasInstalled = () => safeGet(KEY_INSTALLED) === "1";
  const markDismissed = () => safeSet(KEY_DISMISSED, "1");
  const markInstalled = () => safeSet(KEY_INSTALLED, "1");

  // -------------------------
  // Platform detection
  // -------------------------
  const isIOS = () => {
    const ua = navigator.userAgent || "";
    const iOSDevice = /iPad|iPhone|iPod/.test(ua);
    const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    return iOSDevice || iPadOS;
  };

  const isStandalone = () => {
    const iosStandalone = window.navigator.standalone === true;
    const mqlStandalone =
      window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
    return iosStandalone || mqlStandalone;
  };

  // -------------------------
  // UI helpers
  // -------------------------
  const hardHide = () => {
    // Hidden attribute should be enough, but we harden it.
    banner.hidden = true;
    banner.style.display = "none";
  };

  const showShell = () => {
    banner.style.display = ""; // reset if previously forced
    banner.hidden = false;

    if (btnHow) btnHow.hidden = true;
    if (btnNow) btnNow.hidden = true;
  };

  const shouldNeverShow = () => {
    if (wasInstalled()) return true;

    // Si on est déjà en standalone -> on marque installé et on ne montre jamais
    if (isStandalone()) {
      markInstalled();
      return true;
    }

    // Si l’utilisateur a fermé -> on ne montre jamais
    if (wasDismissed()) return true;

    return false;
  };

  // -------------------------
  // Modal
  // -------------------------
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

  // -------------------------
  // Android prompt
  // -------------------------
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
      hardHide();
    }
  };

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;

    if (shouldNeverShow()) return;
    show("android");
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    markInstalled();
    hardHide();
  });

  // -------------------------
  // Show logic
  // -------------------------
  const show = (mode) => {
    if (shouldNeverShow()) {
      hardHide();
      return;
    }

    showShell();

    if (mode === "android") {
      if (sub) sub.textContent = "Installe LoSP en 1 clic (Android).";
      if (btnNow) btnNow.hidden = false;

      btnNow?.removeEventListener("click", onAndroidInstallClick);
      btnNow?.addEventListener("click", onAndroidInstallClick);
    } else {
      // iOS
      if (sub) sub.textContent = "Ajoute LoSP sur ton écran d’accueil (iPhone/iPad).";
      if (btnHow) btnHow.hidden = false;

      const onHow = (ev) => {
        ev?.preventDefault?.();
        banner.classList.add("isActive");
        openModal();
        setTimeout(() => banner.classList.remove("isActive"), 220);
      };

      // Important : pas de {once:true} ici, sinon après un reload ça peut coincer selon cache/sw
      btnHow?.onclick = null;
      btnHow?.addEventListener("click", onHow);
      btnHow?.addEventListener("touchend", onHow, { passive: false });
    }
  };

  // -------------------------
  // Close handler (iOS safe)
  // -------------------------
  const onClose = (ev) => {
    ev?.preventDefault?.();
    ev?.stopPropagation?.();
    markDismissed();
    closeModal();
    hardHide();
  };

  // triple-binding robuste iOS
  btnClose.addEventListener("click", onClose);
  btnClose.addEventListener("pointerup", onClose);
  btnClose.addEventListener("touchend", onClose, { passive: false });

  // -------------------------
  // If user comes back and it's now standalone, mark installed
  // -------------------------
  const recheckStandalone = () => {
    if (isStandalone()) {
      markInstalled();
      hardHide();
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") recheckStandalone();
  });
  window.addEventListener("focus", recheckStandalone);

  // -------------------------
  // Init
  // -------------------------
  if (shouldNeverShow()) {
    hardHide();
    return;
  }

  // iOS: show immediately
  if (isIOS()) {
    // petite tempo pour éviter les “click weirdness” juste au load
    setTimeout(() => show("ios"), 250);
    return;
  }

  // Android: wait for beforeinstallprompt
})();