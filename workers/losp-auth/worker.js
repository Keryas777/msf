const SITE_ORIGIN = "https://keryas777.github.io";
const SITE_BASE_URL = "https://keryas777.github.io/msf/";

const CLIENT_ID = "1498718329953583266";
const CLIENT_SECRET = "A_REMPLACER_PAR_LE_CLIENT_SECRET_DISCORD";

const CALLBACK_URL = "https://losp-auth.deliriousfan7.workers.dev/callback";
const GUILD_ID = "758717819923333191";

const BOT_TOKEN = "A_REMPLACER_PAR_LE_TOKEN_DU_BOT_DISCORD";

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

function encodeSession(payload) {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);

  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeSession(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");

  const binary = atob(padded);
  const bytes = new Uint8Array(
    Array.from(binary).map((char) => char.charCodeAt(0))
  );

  return JSON.parse(new TextDecoder().decode(bytes));
}


// Écriture des défenses : seules les sessions Discord signées font foi.
// Les anciennes sessions base64 restent utilisables en consultation.
const SESSION_VERSION = "v1";
function b64u(bytes) {
  let s="";for(const b of bytes)s+=String.fromCharCode(b);
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}
function unb64u(s) {
  if(!/^[A-Za-z0-9_-]+$/.test(s))throw Error("invalid_base64");
  const b=atob(s.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(s.length/4)*4,"="));
  return Uint8Array.from(b,c=>c.charCodeAt(0));
}
async function signingKey(env) {
  const secret=String(env?.SESSION_SIGNING_SECRET||"");
  if(secret.length<32)throw Error("SESSION_SIGNING_SECRET_required");
  return crypto.subtle.importKey("raw",new TextEncoder().encode(secret),
    {name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);
}
async function signSession(payload,env){
  const now=Math.floor(Date.now()/1000);
  const body="v1."+b64u(new TextEncoder().encode(JSON.stringify({
    ...payload,iat:now,exp:now+SESSION_MAX_AGE_SECONDS
  })));
  const mac=await crypto.subtle.sign("HMAC",await signingKey(env),new TextEncoder().encode(body));
  return body+"."+b64u(new Uint8Array(mac));
}
async function verifiedSession(token,env){
  const parts=String(token||"").split(".");
  if(parts.length!==3||parts[0]!==SESSION_VERSION||parts[1].length>4096)
    throw Error("invalid_signed_session");
  const mac=unb64u(parts[2]);
  if(mac.byteLength!==32||!(await crypto.subtle.verify(
    "HMAC",await signingKey(env),mac,new TextEncoder().encode(parts[0]+"."+parts[1])
  )))throw Error("invalid_signature");
  const data=JSON.parse(new TextDecoder().decode(unb64u(parts[1])));
  const now=Math.floor(Date.now()/1000);
  if(!/^\d{15,22}$/.test(String(data?.id||""))||
    !Number.isSafeInteger(data?.iat)||!Number.isSafeInteger(data?.exp)||
    data.iat>now+60||data.exp<=now||
    data.exp-data.iat>SESSION_MAX_AGE_SECONDS+60)
    throw Error("invalid_or_expired");
  return data;
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

function redirectTo(location, status = 302, extraHeaders = {}) {
  return new Response(null, {
    status,
    headers: {
      ...extraHeaders,
      Location: location,
      "Cache-Control": "no-store"
    }
  });
}

function sessionCookie(value) {
  return `${SESSION_COOKIE_NAME}=${value}; Path=/; Secure; HttpOnly; SameSite=None; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

function expiredSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; Path=/; Secure; HttpOnly; SameSite=None; Max-Age=0`;
}

async function getCurrentDiscordAccess(userId) {
  const memberRes = await fetch(
    `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}`,
    {
      headers: {
        Authorization: `Bot ${BOT_TOKEN}`
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
      reason: "discord_check_failed",
      status: memberRes.status
    };
  }

  const member = await memberRes.json();
  const memberRoles = Array.isArray(member.roles) ? member.roles : [];

  const alliances = Object.entries(ROLE_TO_ALLIANCE)
    .filter(([roleId]) => memberRoles.includes(roleId))
    .map(([, alliance]) => alliance);

  if (!alliances.length) {
    return {
      ok: false,
      reason: "no_authorized_alliance",
      status: 403
    };
  }

  return {
    ok: true,
    member,
    alliances
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request)
      });
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
            Allow: "POST"
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
          "Clear-Site-Data": '"cache", "cookies", "storage"'
        }
      );
    }

    if (url.pathname === "/me" || url.pathname === "/signed-me") {
      const rawSession = getBearerSession(request) || getCookie(request, SESSION_COOKIE_NAME);
      const signedOnly = url.pathname === "/signed-me";

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

      try {
        const isSigned = rawSession.startsWith(SESSION_VERSION + ".");
        if (signedOnly && !isSigned)
          return jsonResponse({ ok:false, reason:"signed_session_required" },request,401);
        const session = isSigned ? await verifiedSession(rawSession,env) : decodeSession(rawSession);
        if (!session?.id) {
          throw new Error("missing_user_id");
        }

        const access = await getCurrentDiscordAccess(session.id);

        if (!access.ok) {
          return jsonResponse(
            {
              ok: false,
              reason: access.reason
            },
            request,
            401,
            {
              "Set-Cookie": expiredSessionCookie()
            }
          );
        }

        const specialProfile = PLAYER_PROFILES[session.id];
        const refreshedSession = {
          ...session,
          displayName:
            access.member.nick ||
            session.global_name ||
            session.username ||
            "",
          role: specialProfile?.role || "member",
          alliances: access.alliances,
          primaryAlliance: access.alliances[0],
          players: specialProfile?.players || []
        };

        // Ne pas convertir une ancienne session non signée en session fiable.
        const refreshedSessionValue = isSigned
          ? await signSession(refreshedSession,env) : encodeSession(refreshedSession);

        return jsonResponse(
          {
            ok: true,
            ...refreshedSession,
            signedSession: isSigned
          },
          request,
          200,
          {
            "Set-Cookie": sessionCookie(refreshedSessionValue)
          }
        );
      } catch (error) {
        return jsonResponse(
          {
            ok: false,
            reason: "invalid_session"
          },
          request,
          401,
          {
            "Set-Cookie": expiredSessionCookie()
          }
        );
      }
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
        return new Response("Code Discord manquant.", { status: 400 });
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

      if (!tokenData.access_token) {
        return new Response(
          "Erreur token Discord : " + JSON.stringify(tokenData),
          {
            status: 400
          }
        );
      }

      const userRes = await fetch("https://discord.com/api/users/@me", {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`
        }
      });

      const user = await userRes.json();

      if (!user?.id) {
        return new Response(
          "Erreur : impossible de récupérer l'utilisateur Discord.",
          {
            status: 400
          }
        );
      }

      const guildsRes = await fetch("https://discord.com/api/users/@me/guilds", {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`
        }
      });

      const guilds = await guildsRes.json();
      const isMember =
        Array.isArray(guilds) && guilds.some((guild) => guild.id === GUILD_ID);

      if (!isMember) {
        return new Response(
          "Accès refusé : tu n’es pas membre du serveur Discord LoSP.",
          {
            status: 403
          }
        );
      }

      const access = await getCurrentDiscordAccess(user.id);

      if (!access.ok) {
        return new Response(
          access.reason === "no_authorized_alliance"
            ? "Accès refusé : aucun rôle d’alliance autorisé."
            : `Accès refusé : impossible de vérifier tes rôles Discord. Statut ${access.status}`,
          {
            status: 403
          }
        );
      }

      const specialProfile = PLAYER_PROFILES[user.id];

      const sessionPayload = {
        id: user.id,
        username: user.username,
        global_name: user.global_name || "",
        displayName:
          access.member.nick || user.global_name || user.username || "",
        role: specialProfile?.role || "member",
        alliances: access.alliances,
        primaryAlliance: access.alliances[0],
        players: specialProfile?.players || []
      };

      // OAuth uniquement : les nouveaux logins sont signés si le secret est prêt.
      // Sans secret, la lecture LoSP continue, mais toute publication est bloquée.
      const session = String(env?.SESSION_SIGNING_SECRET || "").length >= 32
        ? await signSession(sessionPayload,env) : encodeSession(sessionPayload);

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