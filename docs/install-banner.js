(() => {
  const banner = document.getElementById("installBanner");
  const btnHow = document.getElementById("installHow");
  const btnNow = document.getElementById("installNow");
  const btnClose = document.getElementById("installClose");
  const sub = document.getElementById("installSub");
  const modal = document.getElementById("installModal");

  if (!banner || !btnClose) return;

  // =========================
  // Storage
  // =========================
  const KEY_DISMISSED = "losp_install_dismissed_v4";
  const KEY_INSTALLED = "losp_install_installed_v4";

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

  // =========================
  // Platform
  // =========================
  const isIOS = () => {
    const ua = navigator.userAgent || "";
    return /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  };

  const isStandalone = () => {
    return window.navigator.standalone === true ||
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
  };

  // =========================
  // UI helpers
  // =========================
  const hide = () => {
    banner.hidden = true;
    banner.style.display = "none";
  };

  const showShell = () => {
    banner.style.display = "";
    banner.hidden = false;

    if (btnHow) btnHow.hidden = true;
    if (btnNow) btnNow.hidden = true;
  };

  const shouldHideForever = () => {
    if (wasInstalled()) return true;

    if (isStandalone()) {
      markInstalled();
      return true;
    }

    if (wasDismissed()) return true;

    return false;
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
    if (e.target?.dataset?.close === "1") closeModal();
  });

  // =========================
  // Android install
  // =========================
  let deferredPrompt = null;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;

    if (shouldHideForever()) return;
    show("android");
  });

  window.addEventListener("appinstalled", () => {
    markInstalled();
    hide();
  });

  const onAndroidInstall = async () => {
    if (!deferredPrompt) return;

    banner.classList.add("isActive");
    deferredPrompt.prompt();

    let res = null;
    try {
      res = await deferredPrompt.userChoice;
    } catch {}

    banner.classList.remove("isActive");
    deferredPrompt = null;

    if (res?.outcome === "accepted") {
      markInstalled();
      hide();
    }
  };

  // =========================
  // Show logic
  // =========================
  const show = (mode) => {
    if (shouldHideForever()) {
      hide();
      return;
    }

    showShell();

    if (mode === "android") {
      sub && (sub.textContent = "Installe LoSP en 1 clic (Android).");
      if (btnNow) {
        btnNow.hidden = false;
        btnNow.onclick = onAndroidInstall;
      }
    } else {
      // iOS
      sub && (sub.textContent = "Ajoute LoSP sur ton écran d’accueil (iPhone/iPad).");

      if (btnHow) {
        btnHow.hidden = false;
        btnHow.onclick = () => {
          banner.classList.add("isActive");
          openModal();
          setTimeout(() => banner.classList.remove("isActive"), 200);
        };
      }
    }
  };

  // =========================
  // Close button (FIX iOS)
  // =========================
  btnClose.onclick = () => {
    markDismissed();
    closeModal();
    hide();
  };

  // =========================
  // Re-check (retour depuis ajout écran)
  // =========================
  const recheck = () => {
    if (isStandalone()) {
      markInstalled();
      hide();
    }
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") recheck();
  });

  window.addEventListener("focus", recheck);

  // =========================
  // Init
  // =========================
  if (shouldHideForever()) {
    hide();
    return;
  }

  if (isIOS()) {
    setTimeout(() => show("ios"), 300);
  }
})();