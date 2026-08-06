const SITE_ORIGIN = "https://keryas777.github.io";
const SITE_BASE_URL = "https://keryas777.github.io/msf/";

const CLIENT_ID = "1498718329953583266";
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

function noStoreHeaders() {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0"
  };
}

function jsonResponse(data, request, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      ...corsHeaders(request),
      ...noStoreHeaders(),
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders
    }
  });
}

function textResponse(message, status = 200, extraHeaders = {}) {
  return new Response(message, {
    status,
    headers: {
      ...noStoreHeaders(),
      "Content-Type": "text/plain; charset=utf-8",
      ...extraHeaders
    }
  });
}

function redirectTo(location, status = 302, extraHeaders = {}) {
  return new Response(null, {
    status,
    headers: {
      ...noStoreHeaders(),
      ...extraHeaders,
      "Location": location
    }
  });
}

function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const parts = cookie.split(";").map((part) => part.trim());
  const found = parts.find((part) => part.startsWith(`${name}=`));

  return found ? found.slice(name.length + 1) : "";
}

function getBearerSession(request) {
  const auth = request.headers.get("Authorization") || "";

  if (!auth.toLowerCase().startsWith("bearer ")) {
    return "";
  }

  return auth.slice(7).trim();
}

function base64UrlEncodeBytes(bytes) {
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecodeBytes(value) {
  const base64 = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);

  return new Uint8Array(
    Array.from(binary).map((char) => char.charCodeAt(0))
  );
}

function base64UrlEncodeText(value) {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlDecodeText(value) {
  return new TextDecoder().decode(base64UrlDecodeBytes(value));
}

async function getHmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign", "verify"]
  );
}

async function encodeSession(payload, sessionSecret) {
  const encodedPayload = base64UrlEncodeText(JSON.stringify(payload));
  const key = await getHmacKey(sessionSecret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encodedPayload)
  );

  return `${encodedPayload}.${base64UrlEncodeBytes(new Uint8Array(signature))}`;
}

async function decodeSession(value, sessionSecret) {
  const [encodedPayload, encodedSignature, ...extra] = String(value || "").split(".");

  if (!encodedPayload || !encodedSignature || extra.length) {
    throw new Error("invalid_session_format");
  }

  const key = await getHmacKey(sessionSecret);
  const signature = base64UrlDecodeBytes(encodedSignature);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    new TextEncoder().encode(encodedPayload)
  );

  if (!valid) {
    throw new Error("invalid_session_signature");
  }

  const payload = JSON.parse(base64UrlDecodeText(encodedPayload));
  const now = Math.floor(Date.now() / 1000);

  if (!payload?.id || !Number.isFinite(payload?.exp) || payload.exp <= now) {
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

function createSessionCookie(session) {
  return [
    `${SESSION_COOKIE_NAME}=${session}`,
    "Path=/",
    "Secure",
    "HttpOnly",
    "SameSite=None",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`
  ].join("; ");
}

function clearSessionCookie() {
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

function getAlliancesFromRoles(memberRoles) {
  const roles = Array.isArray(memberRoles) ? memberRoles : [];

  return Object.entries(ROLE_TO_ALLIANCE)
    .filter(([roleId]) => roles.includes(roleId))
    .map(([, alliance]) => alliance);
}

async function fetchDiscordMember(userId, botToken) {
  const memberRes = await fetch(
    `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}`,
    {
      headers: {
        "Authorization": `Bot ${botToken}`
      }
    }
  );

  if (memberRes.status === 404) {
    return {
      ok: false,
      reason: "not_guild_member",
      status: 404
    };
  }

  if (!memberRes.ok) {
    return {
      ok: false,
      reason: "discord_member_check_failed",
      status: memberRes.status
    };
  }

  return {
    ok: true,
    member: await memberRes.json()
  };
}

function buildPublicSession(session, member, alliances) {
  const specialProfile = PLAYER_PROFILES[session.id];

  return {
    ok: true,
    id: session.id,
    username: session.username || member?.user?.username || "",
    global_name: session.global_name || member?.user?.global_name || "",
    displayName:
      member?.nick ||
      session.global_name ||
      member?.user?.global_name ||
      session.username ||
      member?.user?.username ||
      "",
    role: specialProfile?.role || "member",
    alliances,
    primaryAlliance: alliances[0],
    players: specialProfile?.players || []
  };
}

function getRequiredSecret(env, name) {
  const value = String(env?.[name] || "").trim();

  if (!value) {
    throw new Error(`missing_secret_${name}`);
  }

  return value;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders(request),
          ...noStoreHeaders()
        }
      });
    }

    let clientSecret;
    let botToken;
    let sessionSecret;

    try {
      clientSecret = getRequiredSecret(env, "DISCORD_CLIENT_SECRET");
      botToken = getRequiredSecret(env, "DISCORD_BOT_TOKEN");
      sessionSecret = getRequiredSecret(env, "SESSION_SECRET");
    } catch (error) {
      return jsonResponse(
        {
          ok: false,
          reason: "worker_secret_missing",
          error: String(error?.message || error)
        },
        request,
        500
      );
    }

    if (url.pathname === "/me") {
      const rawSession =
        getCookie(request, SESSION_COOKIE_NAME) || getBearerSession(request);

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
        session = await decodeSession(rawSession, sessionSecret);
      } catch (_) {
        return jsonResponse(
          {
            ok: false,
            reason: "invalid_session"
          },
          request,
          401,
          {
            "Set-Cookie": clearSessionCookie()
          }
        );
      }

      const memberResult = await fetchDiscordMember(session.id, botToken);

      if (!memberResult.ok) {
        const shouldClearCookie =
          memberResult.reason === "not_guild_member" || memberResult.status === 404;

        return jsonResponse(
          {
            ok: false,
            reason: memberResult.reason,
            discordStatus: memberResult.status
          },
          request,
          memberResult.reason === "not_guild_member" ? 403 : 502,
          shouldClearCookie
            ? {
                "Set-Cookie": clearSessionCookie()
              }
            : {}
        );
      }

      const alliances = getAlliancesFromRoles(memberResult.member.roles);

      if (!alliances.length) {
        return jsonResponse(
          {
            ok: false,
            reason: "no_authorized_alliance"
          },
          request,
          403,
          {
            "Set-Cookie": clearSessionCookie()
          }
        );
      }

      return jsonResponse(
        buildPublicSession(session, memberResult.member, alliances),
        request
      );
    }

    if (url.pathname === "/logout") {
      if (request.method !== "POST") {
        return jsonResponse(
          {
            ok: false,
            reason: "method_not_allowed"
          },
          request,
          405,
          {
            "Allow": "POST"
          }
        );
      }

      return jsonResponse(
        {
          ok: true,
          reason: "logged_out"
        },
        request,
        200,
        {
          "Set-Cookie": clearSessionCookie(),
          "Clear-Site-Data": "\"cache\", \"cookies\", \"storage\""
        }
      );
    }

    if (url.pathname === "/login") {
      const next = sanitizeNext(url.searchParams.get("next") || "home.html");
      const discordAuthUrl = new URL("https://discord.com/api/oauth2/authorize");

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
        return textResponse("Code Discord manquant.", 400);
      }

      const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          client_secret: clientSecret,
          grant_type: "authorization_code",
          code,
          redirect_uri: CALLBACK_URL
        })
      });

      const tokenData = await tokenRes.json();

      if (!tokenData.access_token) {
        return textResponse(
          `Erreur token Discord : ${JSON.stringify(tokenData)}`,
          400
        );
      }

      const userRes = await fetch("https://discord.com/api/users/@me", {
        headers: {
          "Authorization": `Bearer ${tokenData.access_token}`
        }
      });

      const user = await userRes.json();

      if (!user?.id) {
        return textResponse(
          "Erreur : impossible de récupérer l'utilisateur Discord.",
          400
        );
      }

      const guildsRes = await fetch("https://discord.com/api/users/@me/guilds", {
        headers: {
          "Authorization": `Bearer ${tokenData.access_token}`
        }
      });

      const guilds = await guildsRes.json();
      const isMember =
        Array.isArray(guilds) && guilds.some((guild) => guild.id === GUILD_ID);

      if (!isMember) {
        return textResponse(
          "Accès refusé : tu n’es pas membre du serveur Discord LoSP.",
          403
        );
      }

      const memberResult = await fetchDiscordMember(user.id, botToken);

      if (!memberResult.ok) {
        return textResponse(
          `Accès refusé : impossible de vérifier tes rôles Discord. Statut ${memberResult.status}`,
          403
        );
      }

      const alliances = getAlliancesFromRoles(memberResult.member.roles);

      if (!alliances.length) {
        return textResponse(
          "Accès refusé : aucun rôle d’alliance autorisé.",
          403
        );
      }

      const now = Math.floor(Date.now() / 1000);
      const sessionPayload = {
        id: user.id,
        username: user.username || "",
        global_name: user.global_name || "",
        iat: now,
        exp: now + SESSION_MAX_AGE_SECONDS
      };

      const session = await encodeSession(sessionPayload, sessionSecret);
      const fallbackUrl =
        `${SITE_BASE_URL}auth.html` +
        `?next=${encodeURIComponent(next)}` +
        `#session=${encodeURIComponent(session)}`;

      return redirectTo(fallbackUrl, 302, {
        "Set-Cookie": createSessionCookie(session)
      });
    }

    return textResponse("LoSP Auth Worker OK");
  }
};
