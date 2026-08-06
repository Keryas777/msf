// /docs/auth-guard.js
(() => {
  const LOSP_AUTH_WORKER = "https://losp-auth.deliriousfan7.workers.dev";
  const AUTH_PAGE = "./auth.html";
  const LOCAL_SESSION_KEY = "losp_session";

  function removeLocalSession() {
    try {
      localStorage.removeItem(LOCAL_SESSION_KEY);
    } catch (_) {}
  }

  function clearSessionStorage() {
    try {
      sessionStorage.clear();
    } catch (_) {}
  }

  function clearLoSPLocalStorage() {
    try {
      Object.keys(localStorage).forEach((key) => {
        const normalized = String(key || "").toLowerCase();

        if (
          normalized === LOCAL_SESSION_KEY ||
          normalized.startsWith("losp:") ||
          normalized.startsWith("losp_") ||
          normalized.startsWith("losp-")
        ) {
          localStorage.removeItem(key);
        }
      });
    } catch (_) {}
  }

  function clearClientCookies() {
    try {
      document.cookie.split(";").forEach((cookie) => {
        const name = cookie.split("=")[0].trim();
        if (!name) return;

        document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
        document.cookie = `${name}=; Max-Age=0; Path=/msf/; SameSite=Lax`;
      });
    } catch (_) {}
  }

  async function clearLoSPCaches() {
    try {
      if (!("caches" in window)) return;

      const keys = await caches.keys();

      await Promise.all(
        keys
          .filter((key) => String(key || "").startsWith("losp-"))
          .map((key) => caches.delete(key))
      );
    } catch (_) {}
  }

  function sanitizeNext(value) {
    const raw = String(value || "home.html").trim();

    if (!raw) return "home.html";
    if (raw.includes("://")) return "home.html";
    if (raw.startsWith("//")) return "home.html";
    if (raw.includes("..")) return "home.html";
    if (raw.startsWith("/")) return "home.html";
    if (raw.startsWith("auth.html")) return "home.html";

    return raw;
  }

  function getCurrentPageForReturn() {
    const path = window.location.pathname.split("/").pop() || "home.html";
    const search = window.location.search || "";
    const hash = window.location.hash || "";

    if (hash.startsWith("#session=")) {
      return `${path}${search}`;
    }

    return `${path}${search}${hash}`;
  }

  function dispatchSession(data) {
    window.LoSP_SESSION = data;

    window.dispatchEvent(
      new CustomEvent("losp:auth-ready", {
        detail: data,
      })
    );
  }

  function redirectToAuth(next = "home.html") {
    const safeNext = encodeURIComponent(sanitizeNext(next));
    window.location.replace(`${AUTH_PAGE}?next=${safeNext}`);
  }

  async function revokeWorkerSession() {
    try {
      await fetch(`${LOSP_AUTH_WORKER}/logout`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
    } catch (_) {}
  }

  async function logoutLoSP() {
    await revokeWorkerSession();

    removeLocalSession();
    clearLoSPLocalStorage();
    clearSessionStorage();
    clearClientCookies();

    dispatchSession({
      ok: false,
      reason: "local_logout",
    });

    await clearLoSPCaches();

    redirectToAuth("home.html");
  }

  function bindLogoutButtons() {
    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-losp-logout], .lospLogoutBtn");

      if (!button) return;

      event.preventDefault();

      if (button.disabled) return;

      button.disabled = true;
      button.classList.add("is-pressed");

      logoutLoSP();
    });
  }

  async function checkAuth() {
    try {
      const ready = window.LoSP_AUTH_READY;
      const data = ready && typeof ready.then === "function"
        ? await ready
        : window.LoSP_SESSION;

      if (!data?.ok) {
        if (
          data?.reason === "invalid_session" ||
          data?.reason === "not_connected" ||
          data?.reason === "not_guild_member" ||
          data?.reason === "no_authorized_alliance"
        ) {
          removeLocalSession();
        }

        throw new Error(data?.reason || "not_connected");
      }

      document.documentElement.classList.remove("authChecking");
    } catch (_) {
      const next = sanitizeNext(getCurrentPageForReturn());
      redirectToAuth(next);
    }
  }

  window.LoSPLogout = logoutLoSP;

  bindLogoutButtons();
  checkAuth();
})();
