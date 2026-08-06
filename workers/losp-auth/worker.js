const SITE_ORIGIN = "https://keryas777.github.io";
const SITE_BASE_URL = "https://keryas777.github.io/msf/";

const CLIENT_ID = "1498718329953583266";

// À remplacer uniquement dans Cloudflare avant déploiement.
// Ne publie pas les vraies valeurs dans GitHub.
const CLIENT_SECRET = "A_REMPLACER_PAR_LE_CLIENT_SECRET_DISCORD";
const BOT_TOKEN = "A_REMPLACER_PAR_LE_TOKEN_DU_BOT_DISCORD";
const SESSION_SECRET = "A_REMPLACER_PAR_UNE_LONGUE_CLE_ALEATOIRE";

const CALLBACK_URL = "https://losp-auth.deliriousfan7.workers.dev/callback";
const GUILD_ID = "758717819923333191";

const SESSION_COOKIE_NAME = "session";
const SESSION_MAX_AGE_SECONDS = 7776000; // 90 jours

const ROLE_TO_ALLIANCE = {
  "758722419128401992": "zeus",
  "1064618131491934258": "dionysos",
  "820428635071971328": "poseidon",
  "1503132379567624222": "kronos",
  "1532666598643466420": "hades",
  "1522162077807018024": "athena"
};

const PLAYER_PROFILES = {
  "300305626926415874": {
    role: "admin",
    players: [
      { name: "Keryas I", alliance: "zeus" },
      { name: "Keryas II", alliance: "dionysos" },
      { name: "Keryas III", alliance: "poseidon" }
    ]
  }
};

function corsHeaders(request) {
  const origin = request.headers.get("Origin");

  return {
    "Access-Control-Allow-Origin": origin === SITE_ORIGIN ? origin : SITE_ORIGIN,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin"
  };
}

function jsonResponse(data, request, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
      ...extraHeaders
    }
  });
}

function redirectTo(location, status = 302, extraHeaders = {}) {
  return new Response(null, {
    status,
    headers: {
      ...extraHeaders,
      "Location": location,
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0"
    }
  });
}

function sessionCookie(value, maxAge = SESSION_MAX_AGE_SECONDS) {
  return [
    `${SESSION_COOKIE_NAME}=${value}`,
    "Path=/",
    "Secure",
    "HttpOnly",
    "SameSite=None",
    `Max-Age=${Math.max(0, Math.floor(maxAge))}`
  ].join("; ");
}

function expiredSessionCookie() {
  return [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "Secure",
    "HttpOnly",
    "SameSite=None",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT"
  ].join("; ");
}

function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const parts = cookie.split(";").map((part) => part.trim());
  const found = parts.find((part) => part.startsWith(name + "="));

  if (!found) return "";

  return found.slice(name.length + 1);
}

function getBearerSession(request) {
  const auth = request.headers.get("Authorization") || "";

  if (!auth.toLowerCase().startsWith("bearer ")) {
    return "";
  }

  return auth.slice(7).trim();
}

function bytesToBase64Url(bytes) {
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const base64 = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);

  return new Uint8Array(
    Array.from(binary).map((char) => char.charCodeAt(0))
  );
}

async function getSessionSigningKey() {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function encodeSession(payload) {
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const payloadPart = bytesToBase64Url(payloadBytes);
  const key = await getSessionSigningKey();
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payloadPart)
  );

  return `${payloadPart}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

async function decodeSession(value) {
  const [payloadPart, signaturePart, ...extraParts] = String(value || "").split(".");

  if (!payloadPart || !signaturePart || extraParts.length) {
    throw new Error("invalid_session_format");
  }

  const key = await getSessionSigningKey();
  const isValid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlToBytes(signaturePart),
    new TextEncoder().encode(payloadPart)
  );

  if (!isValid) {
    throw new Error("invalid_session_signature");
  }

  const payload = JSON.parse(
    new TextDecoder().decode(base64UrlToBytes(payloadPart))
  );

  const now = Math.floor(Date.now() / 1000);

  if (!payload?.id || !Number.isFinite(payload?.expiresAt)) {
    throw new Error("invalid_session_payload");
  }

  if (payload.expiresAt <= now) {
    throw new Error("expired_session");
  }

  return payload;
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

function alliancesFromRoles(memberRoles) {
  const roles = Array.isArray(memberRoles) ? memberRoles : [];

  return Object.entries(ROLE_TO_ALLIANCE)
    .filter(([roleId]) => roles.includes(roleId))
    .map(([, alliance]) => alliance);
}

async function getDiscordMember(userId) {
  const memberRes = await fetch(
    `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}`,
    {
      headers: {
        "Authorization": `Bot ${BOT_TOKEN}`
      }
    }
  );

  if (memberRes.status === 404) {
    return {
      ok: false,
      reason: "not_guild_member",
      clearSession: true
    };
  }

  if (memberRes.status === 401 || memberRes.status === 403) {
    return {
      ok: false,
      reason: "discord_bot_unauthorized",
      status: memberRes.status,
      clearSession: false
    };
  }

  if (!memberRes.ok) {
    return {
      ok: false,
      reason: "discord_check_failed",
      status: memberRes.status,
      clearSession: false
    };
  }

  const member = await memberRes.json();
  const alliances = alliancesFromRoles(member.roles);

  if (!alliances.length) {
    return {
      ok: false,
      reason: "no_authorized_alliance",
      clearSession: true
    };
  }

  return {
    ok: true,
    member,
    alliances
  };
}

function publicSession(session, access) {
  const specialProfile = PLAYER_PROFILES[session.id];

  return {
    id: session.id,
    username: session.username || "",
    global_name: session.global_name || "",
    displayName:
      access.member?.nick ||
      session.global_name ||
      session.username ||
      "",
    role: specialProfile?.role || "member",
    alliances: access.alliances,
    primaryAlliance: access.alliances[0],
    players: specialProfile?.players || []
  };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request)
      });
    }

    if (url.pathname === "/me") {
      const rawSession =
        getCookie(request, SESSION_COOKIE_NAME) ||
        getBearerSession(request);

      if (!rawSession) {
        return jsonResponse(
          {
            ok: false,
            reason: "not_connected"
          },
          request,
          401
        );
      }

      let session;

      try {
        session = await decodeSession(rawSession);
      } catch (error) {
        return jsonResponse(
          {
            ok: false,
            reason:
              error?.message === "expired_session"
                ? "expired_session"
                : "invalid_session"
          },
          request,
          401,
          {
            "Set-Cookie": expiredSessionCookie()
          }
        );
      }

      const access = await getDiscordMember(session.id);

      if (!access.ok) {
        const status = access.clearSession ? 401 : 503;
        const extraHeaders = access.clearSession
          ? { "Set-Cookie": expiredSessionCookie() }
          : {};

        return jsonResponse(
          {
            ok: false,
            reason: access.reason,
            discordStatus: access.status || null
          },
          request,
          status,
          extraHeaders
        );
      }

      return jsonResponse(
        {
          ok: true,
          ...publicSession(session, access)
        },
        request
      );
    }

    if (url.pathname === "/logout") {
      if (request.method !== "POST" && request.method !== "GET") {
        return jsonResponse(
          {
            ok: false,
            reason: "method_not_allowed"
          },
          request,
          405,
          {
            "Allow": "GET, POST"
          }
        );
      }

      return jsonResponse(
        {
          ok: true
        },
        request,
        200,
        {
          "Set-Cookie": expiredSessionCookie(),
          "Clear-Site-Data": "\"cache\", \"cookies\", \"storage\""
        }
      );
    }

    if (url.pathname === "/login") {
      const next = sanitizeNext(url.searchParams.get("next") || "home.html");
      const discordAuthUrl = new URL(
        "https://discord.com/api/oauth2/authorize"
      );

      discordAuthUrl.searchParams.set("client_id", CLIENT_ID);
      discordAuthUrl.searchParams.set("redirect_uri", CALLBACK_URL);
      discordAuthUrl.searchParams.set("response_type", "code");
      discordAuthUrl.searchParams.set("scope", "identify guilds");
      discordAuthUrl.searchParams.set("state", next);

      return redirectTo(discordAuthUrl.toString());
    }

    if (url.pathname === "/callback") {
      const code = url.searchParams.get("code");
      const next = sanitizeNext(url.searchParams.get("state") || "home.html");

      if (!code) {
        return new Response("Code Discord manquant.", {
          status: 400,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store"
          }
        });
      }

      const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          grant_type: "authorization_code",
          code,
          redirect_uri: CALLBACK_URL
        })
      });

      const tokenData = await tokenRes.json();

      if (!tokenRes.ok || !tokenData.access_token) {
        return new Response(
          "Erreur token Discord : " + JSON.stringify(tokenData),
          {
            status: 400,
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "no-store"
            }
          }
        );
      }

      const userRes = await fetch("https://discord.com/api/users/@me", {
        headers: {
          "Authorization": `Bearer ${tokenData.access_token}`
        }
      });

      const user = await userRes.json();

      if (!userRes.ok || !user?.id) {
        return new Response(
          "Erreur : impossible de récupérer l'utilisateur Discord.",
          {
            status: 400,
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "no-store"
            }
          }
        );
      }

      const access = await getDiscordMember(user.id);

      if (!access.ok) {
        const message =
          access.reason === "not_guild_member"
            ? "Accès refusé : tu n’es pas membre du serveur Discord LoSP."
            : access.reason === "no_authorized_alliance"
              ? "Accès refusé : aucun rôle d’alliance autorisé."
              : `Accès refusé : impossible de vérifier tes rôles Discord. Statut ${access.status || "inconnu"}`;

        return new Response(message, {
          status: access.clearSession ? 403 : 503,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store"
          }
        });
      }

      const now = Math.floor(Date.now() / 1000);
      const specialProfile = PLAYER_PROFILES[user.id];

      const sessionPayload = {
        id: user.id,
        username: user.username || "",
        global_name: user.global_name || "",
        role: specialProfile?.role || "member",
        issuedAt: now,
        expiresAt: now + SESSION_MAX_AGE_SECONDS
      };

      const session = await encodeSession(sessionPayload);

      const fallbackUrl =
        `${SITE_BASE_URL}auth.html` +
        `?next=${encodeURIComponent(next)}` +
        `#session=${encodeURIComponent(session)}`;

      return redirectTo(fallbackUrl, 302, {
        "Set-Cookie": sessionCookie(session)
      });
    }

    return new Response("LoSP Auth Worker OK", {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  }
};
