// /docs/auth-guard.js
(() => {
  const LOSP_AUTH_WORKER = "https://losp-auth.deliriousfan7.workers.dev";
  const AUTH_PAGE = "./auth.html";
  const LOCAL_SESSION_KEY = "losp_session";

  let resolveAuthReady;
  window.LoSP_AUTH_READY = new Promise((resolve) => { resolveAuthReady = resolve; });

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

  function clearSessionStorage() {
    try {
      sessionStorage.clear();
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

  // Contrôle des vues uniquement : les JSON GitHub Pages restent publics par choix du projet.
  const LOSP_ONLY_PAGES = new Set([
    "war-history.html", "war-rankings.html", "war-graphs.html",
    "cosmic.html", "cosmic-counters.html", "cosmic-defenses.html",
    "cosmic-defense-propose.html", "battleworld.html"
  ]);
  const LOSP_ONLY_TILES = new Set([
    "war-history.html", "war-rankings.html", "war-graphs.html",
    "cosmic.html", "battleworld.html"
  ]);

  function normalizeAlliance(value) {
    return String(value ?? "").trim().toLowerCase().normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
  }

  function isLoSPMember(session = window.LoSP_SESSION) {
    return session?.ok === true &&
      (session.role === "admin" || session.groupKey === "losp" ||
        (session.role === "member" && !session.groupKey));
  }

  function allowedAllianceKeys(session = window.LoSP_SESSION) {
    if (!session?.ok) return new Set();
    if (session.role === "admin" && !Array.isArray(session.allowedAlliances)) {
      return new Set(["zeus", "athena", "kronos", "dionysos", "poseidon", "hades"]);
    }
    const alliances = Array.isArray(session.allowedAlliances) ? session.allowedAlliances :
      (session.role === "guest" ? [] : session.alliances || []);
    return new Set(alliances.map(normalizeAlliance).filter(Boolean));
  }

  function isAllianceAllowed(value, session = window.LoSP_SESSION) {
    if (session?.role === "admin" && session?.ok) return true;
    const key = window.LoSPAlliances?.getAllianceKey?.(value) || value;
    return allowedAllianceKeys(session).has(normalizeAlliance(key));
  }

  window.LoSPAccess = Object.freeze({
    isLoSPMember,
    isAllianceAllowed,
    allowedAllianceKeys,
    filterRows(rows, field = "alliance") {
      return (Array.isArray(rows) ? rows : []).filter(row => isAllianceAllowed(row?.[field]));
    }
  });

  function applyGuestTiles() {
    const cssId = "losp-reserved-tile-style";
    if (!document.getElementById(cssId)) {
      const style = document.createElement("style");
      style.id = cssId;
      style.textContent = `
        .lospReservedTile { position: relative !important; overflow: hidden; cursor: not-allowed !important; }
        .lospReservedTile > img { filter: grayscale(1) brightness(.60) !important; }
        .lospReservedMask {
          position:absolute;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;
          background:rgba(35,39,46,.58);pointer-events:none;
        }
        .lospReservedMask > span {
          display:block;max-width:96%;padding:8px 12px;border:2px solid #ef4545;border-radius:6px;
          color:#ff5353;background:rgba(12,12,14,.79);font:900 clamp(13px,3.5vw,23px)/1.14 system-ui,sans-serif;
          text-align:center;text-transform:uppercase;letter-spacing:.04em;
          text-shadow:0 1px 2px #000;transform:rotate(-17deg);
          box-shadow:0 3px 14px rgba(0,0,0,.5);white-space:nowrap;
        }
        .lospReservedTile:hover,.lospReservedTile:active { transform:none !important; }
        .lospReservedTile::after { opacity:0 !important; }
        @media (max-width: 480px) {
          .lospReservedMask > span {font-size:clamp(9px,2.3vw,12px);padding:5px 4px;letter-spacing:.01em;}
        }
      `;
      document.head.appendChild(style);
    }

    document.querySelectorAll("a.homeTile[href], a.rankingsTile[href]").forEach(tile => {
      const url = tile.getAttribute("href") || "";
      const page = url.split(/[?#]/)[0].split("/").pop();
      if (!LOSP_ONLY_TILES.has(page) || tile.classList.contains("lospReservedTile")) return;
      tile.classList.add("lospReservedTile");
      tile.setAttribute("aria-disabled", "true");
      tile.setAttribute("aria-label", (tile.querySelector("img")?.alt || page) + " — Réservé LoSP");
      tile.removeAttribute("href");
      tile.setAttribute("tabindex", "-1");
      const mask = document.createElement("span");
      mask.className = "lospReservedMask";
      mask.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.textContent = "Réservé LoSP";
      mask.appendChild(label);
      tile.appendChild(mask);
    });
  }

  function guardGuestPage(data) {
    if (data?.role !== "guest") return true;
    const page = window.location.pathname.split("/").pop() || "index.html";
    if (LOSP_ONLY_PAGES.has(page)) {
      window.location.replace("./home.html");
      return false;
    }
    if (document.readyState === "loading") {
      // Ne dévoiler les tuiles qu'une fois leur masque posé, y compris sur Safari/PWA.
      document.addEventListener("DOMContentLoaded", () => {
        applyGuestTiles();
        document.documentElement.classList.remove("authChecking");
      }, { once:true });
      return false;
    }
    applyGuestTiles();
    return true;
  }

  function dispatchSession(data) {
    window.LoSP_SESSION = data;
    if (resolveAuthReady) { resolveAuthReady(data); resolveAuthReady = null; }

    window.dispatchEvent(
      new CustomEvent("losp:auth-ready", {
        detail: data
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
        cache: "no-store"
      });
    } catch (_) {}
  }

  async function logoutLoSP() {
    await revokeWorkerSession();

    removeLocalSession();
    clearSessionStorage();

    dispatchSession({
      ok: false,
      reason: "local_logout"
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
    const localSession = getLocalSession();

    try {
      const res = await fetch(`${LOSP_AUTH_WORKER}/me`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: localSession
          ? {
              Authorization: `Bearer ${localSession}`
            }
          : {}
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        if (data?.reason === "invalid_session") {
          removeLocalSession();
        }

        throw new Error(data?.reason || "not_connected");
      }

      dispatchSession(data);
      if (!guardGuestPage(data)) return;

      document.documentElement.classList.remove("authChecking");
    } catch (error) {
      const next = sanitizeNext(getCurrentPageForReturn());
      redirectToAuth(next);
    }
  }

  window.LoSPLogout = logoutLoSP;

  bindLogoutButtons();
  checkAuth();
})();