// /docs/auth-guard.js
(() => {
  const LOSP_AUTH_WORKER = "https://losp-auth.deliriousfan7.workers.dev";
  const AUTH_PAGE = "./auth.html";
  const LOCAL_SESSION_KEY = "losp_session";
  // Identifiant Discord administrateur déjà déclaré dans le Worker losp-auth.
  // L'aperçu est une simulation UI : ce contrôle ne remplace jamais l'authentification serveur.
  const PREVIEW_OWNER_ID = "300305626926415874";
  const PREVIEW_STORAGE_KEY = "losp:admin-preview:group";
  const PREVIEW_GROUPS_URL = "./data/access-groups.json";


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

  function isPreviewOwner(session) {
    return session?.ok === true && session.role === "admin" &&
      String(session.id || "") === PREVIEW_OWNER_ID;
  }

  function getStoredPreviewGroup() {
    try {
      return sessionStorage.getItem(PREVIEW_STORAGE_KEY) || "";
    } catch (_) {
      return "";
    }
  }

  function savePreviewGroup(key) {
    try {
      if (key) sessionStorage.setItem(PREVIEW_STORAGE_KEY, key);
      else sessionStorage.removeItem(PREVIEW_STORAGE_KEY);
    } catch (_) {}
  }

  async function resolveAdminPreview(realSession) {
    if (!isPreviewOwner(realSession)) return { view: realSession, preview: null };

    // Le statut administrateur réel n'est jamais écrasé par le rôle simulé.
    window.LoSP_REAL_SESSION = realSession;

    try {
      const response = await fetch(PREVIEW_GROUPS_URL, { cache: "no-store" });
      if (!response.ok) throw new Error("preview_groups_http_" + response.status);
      const config = await response.json();
      const groups = (Array.isArray(config?.groups) ? config.groups : [])
        .filter(group => typeof group?.key === "string" &&
          Array.isArray(group.alliances) && group.alliances.length > 0)
        .map(group => ({
          key: group.key,
          name: String(group.name || group.key),
          alliances: group.alliances.map(String).filter(Boolean)
        }));
      const requested = getStoredPreviewGroup();
      const active = groups.find(group => group.key === requested) || null;
      if (requested && !active) savePreviewGroup("");

      if (!active) return { view: realSession, preview: { groups, selected: "" } };

      const memberView = active.key === "losp";
      const view = {
        ...realSession,
        role: memberView ? "member" : "guest",
        groupKey: active.key,
        alliances: memberView ? [...active.alliances] : [],
        allowedAlliances: [...active.alliances],
        primaryAlliance: memberView ? active.alliances[0] : null,
        players: [],
        username: "Aperçu",
        displayName: "Aperçu " + active.name,
        previewMode: true,
        previewGroupKey: active.key
      };
      return { view, preview: { groups, selected: active.key } };
    } catch (error) {
      console.warn("[LoSP] Mode aperçu indisponible : affichage administrateur conservé.", error);
      return { view: realSession, preview: null };
    }
  }

  function mountAdminPreview(preview) {
    if (!preview || document.getElementById("lospAdminPreview")) return;

    const style = document.createElement("style");
    style.textContent = `
      #lospAdminPreview {
        position:fixed;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));
        z-index:99990;max-width:min(340px,calc(100vw - 24px));
        font:500 13px/1.4 system-ui,-apple-system,sans-serif;color:#f6f7fa;
      }
      /* Accueil : le contrôle reste dans le flux, loin du footer Déconnexion fixé en bas. */
      #lospAdminPreview.lospPreviewInline {
        position:relative;inset:auto;right:auto;bottom:auto;
        width:min(340px,100%);max-width:100%;margin:2px 0 8px auto;
        align-self:flex-end;z-index:2;
      }
      #lospAdminPreview button,#lospAdminPreview select {font:inherit;}
      .lospPreviewToggle {
        display:block;margin-left:auto;border:1px solid #8290a8;border-radius:999px;
        background:#192335;color:white;padding:10px 14px;min-height:42px;
        box-shadow:0 6px 20px #0009;cursor:pointer;
      }
      .lospPreviewActive .lospPreviewToggle {border-color:#ff5656;color:#ffdcdf;background:#392028;}
      .lospPreviewPanel {
        margin-bottom:8px;padding:14px;border:1px solid #64748b;border-radius:15px;
        background:#141b29;box-shadow:0 8px 28px #000b;
      }
      .lospPreviewPanel[hidden] {display:none!important;}
      .lospPreviewTitle {font-weight:800;margin:0 0 8px;color:#fff;}
      .lospPreviewPanel label {display:block;margin-bottom:6px;color:#d4dce8;}
      .lospPreviewPanel select {
        display:block;width:100%;padding:10px;color:#fff;background:#273248;
        border:1px solid #8596ac;border-radius:9px;min-height:44px;
      }
      .lospPreviewHelp {margin:9px 0 0;color:#b7c2d2;font-size:12px;}
      .lospPreviewReset {
        display:block;margin-top:10px;border:1px solid #f18b8b;border-radius:8px;
        color:#ffe6e6;background:#47252e;padding:8px 12px;min-height:40px;cursor:pointer;
      }
      @media(max-width:400px){#lospAdminPreview{right:8px;bottom:calc(8px + env(safe-area-inset-bottom));}}
    `;
    document.head.appendChild(style);

    const wrap = document.createElement("aside");
    wrap.id = "lospAdminPreview";
    if (preview.selected) wrap.classList.add("lospPreviewActive");

    const panel = document.createElement("section");
    panel.className = "lospPreviewPanel";
    panel.id = "lospAdminPreviewPanel";
    panel.hidden = true;

    const title = document.createElement("p");
    title.className = "lospPreviewTitle";
    title.textContent = "Aperçu administrateur";

    const label = document.createElement("label");
    label.textContent = "Voir l'application comme :";
    const select = document.createElement("select");
    select.id = "lospPreviewGroup";
    label.htmlFor = select.id;

    function addOption(value, name) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = name;
      select.appendChild(option);
    }
    addOption("", "Mon compte — Administrateur");
    preview.groups.forEach(group => {
      addOption(group.key, group.key === "losp"
        ? "Membre LoSP" : "WebApp " + group.name);
    });
    select.value = preview.selected;

    const hint = document.createElement("p");
    hint.className = "lospPreviewHelp";
    hint.textContent = "Simulation d'affichage uniquement. Tes droits Discord restent administrateur.";

    panel.append(title, label, select, hint);

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "lospPreviewToggle";
    const selectedGroup = preview.groups.find(group => group.key === preview.selected);
    toggle.textContent = selectedGroup ? "👁 Aperçu : " + selectedGroup.name : "👁 Aperçu des rôles";
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", panel.id);
    toggle.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      toggle.setAttribute("aria-expanded", String(!panel.hidden));
      if (!panel.hidden) select.focus();
    });
    panel.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        panel.hidden = true;
        toggle.setAttribute("aria-expanded", "false");
        toggle.focus();
      }
    });
    function changePreview(key) {
      if (key === preview.selected) return;
      savePreviewGroup(key);
      // Le rechargement assure que tous les modules reçoivent le même contexte.
      window.location.reload();
    }
    select.addEventListener("change", () => changePreview(select.value));

    if (preview.selected) {
      const reset = document.createElement("button");
      reset.className = "lospPreviewReset";
      reset.type = "button";
      reset.textContent = "Quitter l'aperçu";
      reset.addEventListener("click", () => changePreview(""));
      panel.appendChild(reset);
    }
    wrap.append(panel, toggle);
    const homeGrid = document.querySelector?.(".homeGrid");
    if (homeGrid && window.location.pathname.split("/").pop() === "home.html") {
      // Entre la fraîcheur des rosters et les tuiles, jamais sur la déconnexion fixe.
      wrap.classList.add("lospPreviewInline");
      homeGrid.before(wrap);
    } else {
      document.body.appendChild(wrap);
    }
  }

  function showAdminPreview(preview) {
    if (!preview) return;
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => mountAdminPreview(preview), { once: true });
    } else {
      mountAdminPreview(preview);
    }
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

      const { view, preview } = await resolveAdminPreview(data);
      dispatchSession(view);
      showAdminPreview(preview);
      if (!guardGuestPage(view)) return;

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