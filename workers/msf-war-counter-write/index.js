import worker from "./worker.js";

const DEFAULT_SITE_ORIGIN = "https://keryas777.github.io";
const DEFAULT_AUTH_BASE_URL = "https://losp-auth.deliriousfan7.workers.dev";
const AUTH_CHECK_PATH = "/api/war-counter-write/auth-check";
const WRITE_PATHS = new Set([
  "/api/war-counter-write/apply",
  "/api/war-counter-write/apply-batch"
]);

function corsHeaders(request, env) {
  const allowed = String(env?.SITE_ORIGIN || DEFAULT_SITE_ORIGIN).trim();
  const origin = request.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": origin === allowed ? origin : allowed,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-War-Counter-Write-Key",
    "Vary": "Origin"
  };
}

function jsonResponse(data, request, env, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      ...corsHeaders(request, env),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function getBearer(request) {
  const value = request.headers.get("Authorization") || "";
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : "";
}

async function verifyWriteAdminSession(request, env) {
  const session = getBearer(request);
  if (!session) {
    return {
      ok: false,
      status: 401,
      reason: "missing_bearer",
      authStatus: 0
    };
  }

  const authBase = String(env?.AUTH_BASE_URL || DEFAULT_AUTH_BASE_URL).trim().replace(/\/$/, "");
  const siteOrigin = String(env?.SITE_ORIGIN || DEFAULT_SITE_ORIGIN).trim();

  let response;
  try {
    response = await fetch(`${authBase}/me`, {
      method: "GET",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${session}`,
        Origin: siteOrigin,
        Accept: "application/json"
      }
    });
  } catch (error) {
    return {
      ok: false,
      status: 502,
      reason: "auth_fetch_failed",
      authStatus: 0
    };
  }

  let data = null;
  try {
    data = await response.json();
  } catch (_) {}

  if (!response.ok || !data?.ok) {
    return {
      ok: false,
      status: 401,
      reason: String(data?.reason || `auth_http_${response.status}`),
      authStatus: response.status
    };
  }

  if (String(data.role || "").toLowerCase() !== "admin") {
    return {
      ok: false,
      status: 403,
      reason: "not_admin",
      authStatus: response.status
    };
  }

  return {
    ok: true,
    status: 200,
    reason: "ok",
    authStatus: response.status
  };
}

async function digest(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

async function constantTimeEqual(left, right) {
  const [a, b] = await Promise.all([digest(left), digest(right)]);
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    diff |= (a[index % a.length] || 0) ^ (b[index % b.length] || 0);
  }
  return diff === 0;
}

async function hasValidWriteKey(request, env) {
  const expected = String(env?.WRITE_ADMIN_SECRET || "").trim();
  const supplied = String(request.headers.get("X-War-Counter-Write-Key") || "").trim();
  if (!expected || !supplied) return false;
  return constantTimeEqual(supplied, expected);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (url.pathname === "/health") {
      return jsonResponse({
        ok: true,
        service: "msf-war-counter-write",
        googleConfigured: Boolean(String(env?.GOOGLE_SERVICE_ACCOUNT_EMAIL || "").trim() && String(env?.GOOGLE_PRIVATE_KEY || "").trim()),
        adminKeyConfigured: Boolean(String(env?.WRITE_ADMIN_SECRET || "").trim()),
        workflowDispatchConfigured: Boolean(String(env?.GITHUB_WORKFLOW_TOKEN || "").trim())
      }, request, env);
    }

    if (url.pathname === AUTH_CHECK_PATH) {
      if (request.method !== "GET") {
        return jsonResponse({ ok: false, error: "Méthode non autorisée." }, request, env, 405);
      }

      const check = await verifyWriteAdminSession(request, env);
      if (!check.ok) {
        return jsonResponse({
          ok: false,
          error: "Autorisation d’écriture LoSP non validée.",
          reason: check.reason,
          authStatus: check.authStatus
        }, request, env, check.status);
      }

      return jsonResponse({
        ok: true,
        role: "admin",
        authStatus: check.authStatus
      }, request, env);
    }

    if (WRITE_PATHS.has(url.pathname)) {
      if (!(await hasValidWriteKey(request, env))) {
        return jsonResponse({
          ok: false,
          error: "Clé d’écriture administrateur absente ou invalide."
        }, request, env, 403);
      }
    }

    return worker.fetch(request, env, ctx);
  }
};

export {
  AUTH_CHECK_PATH,
  constantTimeEqual,
  hasValidWriteKey,
  verifyWriteAdminSession,
  WRITE_PATHS
};
