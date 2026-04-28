// /docs/auth-session.js

const LOSP_AUTH_WORKER = "https://losp-auth.deliriousfan7.workers.dev";

window.LoSP_SESSION = null;

async function loadLoSPSession() {
  try {
    const res = await fetch(`${LOSP_AUTH_WORKER}/me`, {
      method: "GET",
      credentials: "include",
      cache: "no-store"
    });

    const data = await res.json();

    window.LoSP_SESSION = data;

    window.dispatchEvent(new CustomEvent("losp:auth-ready", {
      detail: data
    }));

    return data;
  } catch (error) {
    window.LoSP_SESSION = {
      ok: false,
      reason: "auth_worker_unreachable",
      error: String(error)
    };

    window.dispatchEvent(new CustomEvent("losp:auth-ready", {
      detail: window.LoSP_SESSION
    }));

    return window.LoSP_SESSION;
  }
}

loadLoSPSession();
