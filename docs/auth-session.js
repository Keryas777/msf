// /docs/auth-session.js
(() => {
  const LOSP_AUTH_WORKER = "https://losp-auth.deliriousfan7.workers.dev";
  const LOCAL_SESSION_KEY = "losp_session";

  window.LoSP_SESSION = null;

  function getLocalSession() {
    try {
      return localStorage.getItem(LOCAL_SESSION_KEY) || "";
    } catch (_) {
      return "";
    }
  }

  function removeLocalSession() {
    try {
      localStorage.removeItem(LOCAL_SESSION_KEY);
    } catch (_) {}
  }

  function dispatchSession(data) {
    window.LoSP_SESSION = data;

    window.dispatchEvent(
      new CustomEvent("losp:auth-ready", {
        detail: data,
      })
    );

    return data;
  }

  async function loadLoSPSession() {
    const localSession = getLocalSession();

    try {
      const res = await fetch(`${LOSP_AUTH_WORKER}/me`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: localSession
          ? {
              Authorization: `Bearer ${localSession}`,
            }
          : {},
      });

      let data;

      try {
        data = await res.json();
      } catch (_) {
        data = {
          ok: false,
          reason: "invalid_auth_response",
        };
      }

      if (!res.ok || !data?.ok) {
        if (
          data?.reason === "invalid_session" ||
          data?.reason === "not_connected" ||
          data?.reason === "not_guild_member" ||
          data?.reason === "no_authorized_alliance"
        ) {
          removeLocalSession();
        }

        return dispatchSession({
          ok: false,
          ...data,
        });
      }

      return dispatchSession(data);
    } catch (error) {
      return dispatchSession({
        ok: false,
        reason: "auth_worker_unreachable",
        error: String(error),
      });
    }
  }

  window.LoSP_AUTH_READY = loadLoSPSession();
})();
