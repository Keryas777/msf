// /docs/auth-guard.js
(() => {
  const LOSP_AUTH_WORKER = "https://losp-auth.deliriousfan7.workers.dev";
  const AUTH_PAGE = "./auth.html";

  function getCurrentPageForReturn() {
    const path = window.location.pathname.split("/").pop() || "home.html";
    return `${path}${window.location.search}${window.location.hash}`;
  }

  async function checkAuth() {
    try {
      const res = await fetch(`${LOSP_AUTH_WORKER}/me`, {
        method: "GET",
        credentials: "include",
        cache: "no-store"
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.reason || "not_connected");
      }

      window.LoSP_SESSION = data;

      window.dispatchEvent(new CustomEvent("losp:auth-ready", {
        detail: data
      }));

      document.documentElement.classList.remove("authChecking");
    } catch (error) {
      const next = encodeURIComponent(getCurrentPageForReturn());
      window.location.replace(`${AUTH_PAGE}?next=${next}`);
    }
  }

  checkAuth();
})();