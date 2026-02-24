// docs/install-banner.js
(() => {
  const banner = document.getElementById("installBanner");
  const btnHow = document.getElementById("installHow");
  const btnNow = document.getElementById("installNow");
  const btnClose = document.getElementById("installClose");
  const sub = document.getElementById("installSub");

  const modal = document.getElementById("installModal");

  if (!banner || !btnClose) return;

  // ----- Utils -----
  const isIOS = () => {
    const ua = navigator.userAgent || "";
    const iOSDevice = /iPad|iPhone|iPod/.test(ua);
    // iPadOS 13+ se présente parfois comme Mac, mais a du tactile
    const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    return iOSDevice || iPadOS;
  };

  const isStandalone = () => {
    // iOS safari
    const iosStandalone = window.navigator.standalone === true;
    // Android/Chrome + certains navigateurs
    const mqlStandalone = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
    return iosStandalone || mqlStandalone;
  };

  const storageKey = "losp_install_banner_dismissed_v1";

  const dismissedRecently = () => {
    try {
      const ts = Number(localStorage.getItem(storageKey) || "0");
      if (!ts) return false;
      // 14 jours
      return Date.now() - ts < 14 * 24 * 60 * 60 * 1000;
    } catch {
      return false;
    }
  };

  const dismiss = () => {
    try {
      localStorage.setItem(storageKey, String(Date.now()));
    } catch {}
    banner.hidden = true;
  };

  // ----- Modal -----
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

  // ----- Android install prompt -----
  let deferredPrompt = null;

  window.addEventListener("beforeinstallprompt", (e) => {
    // Chrome/Android: on retient l’event pour déclencher au clic
    e.preventDefault();
    deferredPrompt = e;
    showBanner("android");
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    banner.hidden = true;
  });

  // ----- Show logic -----
  const showBanner = (mode) => {
    if (isStandalone()) return;
    if (dismissedRecently()) return;

    banner.hidden = false;

    // reset buttons
    btnHow && (btnHow.hidden = true);
    btnNow && (btnNow.hidden = true);

    if (mode === "android") {
      if (sub) sub.textContent = "Installe LoSP en 1 clic (Android).";
      if (btnNow) btnNow.hidden = false;

      btnNow?.addEventListener(
        "click",
        async () => {
          if (!deferredPrompt) return;
          banner.classList.add("isActive");
          deferredPrompt.prompt();
          const res = await deferredPrompt.userChoice.catch(() => null);
          deferredPrompt = null;
          banner.classList.remove("isActive");
          if (res && res.outcome === "accepted") banner.hidden = true;
        },
        { once: true }
      );
    } else {
      // iOS
      if (sub) sub.textContent = "Ajoute LoSP sur ton écran d’accueil (iPhone/iPad).";
      if (btnHow) btnHow.hidden = false;

      btnHow?.addEventListener(
        "click",
        () => {
          banner.classList.add("isActive");
          openModal();
          setTimeout(() => banner.classList.remove("isActive"), 220);
        },
        { once: true }
      );
    }
  };

  // fermeture
  btnClose.addEventListener("click", dismiss);

  // ----- Initial check -----
  // Sur iOS, pas d’event beforeinstallprompt => on affiche direct (si pertinent)
  if (!isStandalone() && !dismissedRecently()) {
    if (isIOS()) showBanner("ios");
    // Android sans beforeinstallprompt: on ne force pas
    // (certains navigateurs ne supportent pas l’install PWA)
  }
})();
