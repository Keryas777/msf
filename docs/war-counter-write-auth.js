export const LOSP_AUTH_WORKER = "https://losp-auth.deliriousfan7.workers.dev";
export const LOCAL_SESSION_KEY = "losp_session";
export const WRITE_AUTH_PAGE = "./war-counter-auth.html";

export function sanitizeWarCounterReturn(value) {
  const raw = String(value || "war-counter-lab.html").trim();
  return raw === "war-counter-lab.html" ? raw : "war-counter-lab.html";
}

export function readLocalSession(storage = globalThis.localStorage) {
  try {
    return storage?.getItem?.(LOCAL_SESSION_KEY) || "";
  } catch (_) {
    return "";
  }
}

export function clearLocalSession(storage = globalThis.localStorage) {
  try {
    storage?.removeItem?.(LOCAL_SESSION_KEY);
  } catch (_) {}
}

export async function validateBearerToken(token, { fetchImpl = globalThis.fetch } = {}) {
  const value = String(token || "").trim();
  if (!value) {
    return { ok: false, reason: "missing_session", status: 0 };
  }

  try {
    const response = await fetchImpl(`${LOSP_AUTH_WORKER}/me`, {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${value}`
      }
    });

    let data = null;
    try {
      data = await response.json();
    } catch (_) {}

    if (!response.ok || !data?.ok) {
      return {
        ok: false,
        reason: data?.reason || `http_${response.status}`,
        status: response.status
      };
    }

    return { ok: true, status: response.status, data };
  } catch (error) {
    return {
      ok: false,
      reason: "network_error",
      status: 0,
      error: error?.message || String(error)
    };
  }
}

export function buildWriteAuthRepairUrl(returnPage = "war-counter-lab.html") {
  const safeReturn = sanitizeWarCounterReturn(returnPage);
  return `${WRITE_AUTH_PAGE}?return=${encodeURIComponent(safeReturn)}`;
}

export async function ensureWarCounterWriteBearer({
  storage = globalThis.localStorage,
  fetchImpl = globalThis.fetch,
  location = globalThis.location
} = {}) {
  const token = readLocalSession(storage);
  const result = await validateBearerToken(token, { fetchImpl });

  if (result.ok) return result;

  clearLocalSession(storage);
  location?.replace?.(buildWriteAuthRepairUrl("war-counter-lab.html"));
  return result;
}
