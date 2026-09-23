import worker from "./worker.js";

const DEFAULT_SITE_ORIGIN = "https://keryas777.github.io";

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

    if (url.pathname === "/api/war-counter-write/apply") {
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

export { constantTimeEqual, hasValidWriteKey };
