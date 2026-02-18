// docs/app.js
(() => {
  // -----------------------------
  // Config (chemins RELATIFS, pas de / au début)
  // -----------------------------
  const DATA = {
    teams: "./data/teams.json",
    characters: "./data/msf-characters.json",
    joueurs: "./data/joueurs.json",
    players: "./data/players.json", // fallback si tu l'appelles autrement
  };

  const ALLIANCE_EMOJI = {
    Zeus: "⚡️",
    Dionysos: "🍇",
    Poséidon: "🔱",
    Poseidon: "🔱", // au cas où une variante passe
  };

  // -----------------------------
  // Helpers
  // -----------------------------
  const qs = (sel) => document.querySelector(sel);

  function bust(url) {
    // force refresh (évite cache Safari/GH Pages)
    const u = new URL(url, window.location.href);
    u.searchParams.set("v", Date.now().toString());
    return u.toString();
  }

  async function fetchJson(url) {
    const res = await fetch(bust(url), { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
    return res.json();
  }

  function normalizeKey(s) {
    return (s ?? "")
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[-_]/g, "");
  }

  function setStatus(msg, isError = false) {
    const el = qs("#statusBox");
    if (!el) return;
    el.textContent = msg || "";
    el.style.display = msg ? "block" : "none";
    el.dataset.type = isError ? "error" : "ok";
  }

  // Calcule une taille de vignette pour avoir EXACTEMENT 5 colonnes sans scroll horizontal
  function computeTileSize(containerEl, columns = 5, gap = 12) {
    if (!containerEl) return 72;
    const w = containerEl.clientWidth;
    const totalGaps = gap * (columns - 1);
    const size = Math.floor((w - totalGaps) / columns);
    // bornes pour éviter trop petit / trop gros
    return Math.max(58, Math.min(size, 92));
  }

  function applyTileSize(sizePx) {
    // on passe par une CSS var si ton style.css l'utilise,
    // sinon on applique inline sur les vignettes
    document.documentElement.style.setProperty("--tile", `${sizePx}px`);
  }

  // -----------------------------
  // DOM refs (IDs attendus dans ton HTML)
  // -----------------------------
  const teamSelect = qs("#teamSelect");
  const btnRefresh = qs("#refreshBtn");
  const teamTitle = qs("#teamTitle");
  const portraitsWrap = qs("#portraits"); // conteneur des portraits
  const playersWrap = qs("#players");     // conteneur des chips joueurs
  const playersCount = qs("#playersCount");

  // -----------------------------
  // State
  // -----------------------------
  let TEAMS = [];        // [{ team, characters:[...] }]
  let CHAR_MAP = new Map(); // key(normalized) -> {nameFr/nameEn/id/portraitUrl}
  let JOUEURS = [];      // [{ joueur, alliance }] ou similaire

  // -----------------------------
  // Render
  // -----------------------------
  function renderTeamOptions() {
    if (!teamSelect) return;

    teamSelect.innerHTML = "";
    if (!Array.isArray(TEAMS) || TEAMS.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Aucune option";
      teamSelect.appendChild(opt);
      teamSelect.disabled = true;
      return;
    }

    teamSelect.disabled = false;

    // option vide
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "— Choisir une équipe —";
    teamSelect.appendChild(opt0);

    TEAMS.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.team;
      opt.textContent = t.team;
      teamSelect.appendChild(opt);
    });
  }

  function findPortraitFor(name) {
    const key = normalizeKey(name);
    if (!key) return null;
    // mapping direct
    if (CHAR_MAP.has(key)) return CHAR_MAP.get(key);

    // tentative si le sheet contient "IronFistOrson" etc
    // on essaye des variantes simples
    const variants = [
      key,
      key.replace(/modern/g, "modern"), // no-op, placeholder
    ];
    for (const v of variants) {
      if (CHAR_MAP.has(v)) return CHAR_MAP.get(v);
    }
    return null;
  }

  function clearNode(el) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function renderSelectedTeam(teamName) {
    clearNode(portraitsWrap);
    if (teamTitle) teamTitle.textContent = teamName || "—";

    if (!teamName) return;

    const teamObj = TEAMS.find((t) => t.team === teamName);
    if (!teamObj) return;

    // calcul taille vignettes pour 5 sur une ligne
    const tile = computeTileSize(portraitsWrap, 5, 12);
    applyTileSize(tile);

    const chars = teamObj.characters || [];
    chars.forEach((charName) => {
      const info = findPortraitFor(charName);
      const card = document.createElement("div");
      card.className = "portraitCard";

      const img = document.createElement("img");
      img.className = "portraitImg";
      img.alt = charName;
      img.loading = "lazy";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";

      img.src = info?.portraitUrl || "";
      if (!img.src) {
        // fallback visuel si portrait absent
        img.style.opacity = "0.15";
      }

      const label = document.createElement("div");
      label.className = "portraitLabel";
      label.textContent = charName;

      // Option "tap pour nom complet" : mini toast simple (sans prendre de place)
      card.addEventListener("click", () => showToast(charName));

      card.appendChild(img);
      card.appendChild(label);
      portraitsWrap.appendChild(card);
    });
  }

  function renderPlayers() {
    clearNode(playersWrap);
    if (playersCount) playersCount.textContent = "0";

    if (!Array.isArray(JOUEURS) || JOUEURS.length === 0) {
      if (playersWrap) {
        const p = document.createElement("div");
        p.className = "muted";
        p.textContent =
          "Joueurs non chargés (onglet “Joueurs” pas encore exporté en JSON).";
        playersWrap.appendChild(p);
      }
      return;
    }

    if (playersCount) playersCount.textContent = String(JOUEURS.length);

    // tri optionnel (par alliance puis nom)
    const sorted = [...JOUEURS].sort((a, b) => {
      const A = (a.alliance || "").toString();
      const B = (b.alliance || "").toString();
      if (A !== B) return A.localeCompare(B, "fr");
      return (a.joueur || "").toString().localeCompare((b.joueur || "").toString(), "fr");
    });

    sorted.forEach((row) => {
      const joueur = (row.joueur ?? row.JOUEURS ?? row.player ?? row.name ?? "").toString().trim();
      const alliance = (row.alliance ?? row.ALLIANCES ?? row.allianceName ?? "").toString().trim();
      if (!joueur) return;

      const emoji = ALLIANCE_EMOJI[alliance] || "•";
      const chip = document.createElement("div");
      chip.className = "playerChip";
      chip.textContent = `${emoji}${joueur}`; // PAS d’espace après emoji (comme tu veux)
      playersWrap.appendChild(chip);
    });
  }

  // mini toast bas de page
  let toastTimer = null;
  function showToast(text) {
    if (!text) return;
    let t = qs("#toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast";
      t.style.position = "fixed";
      t.style.left = "50%";
      t.style.bottom = "18px";
      t.style.transform = "translateX(-50%)";
      t.style.padding = "10px 14px";
      t.style.borderRadius = "999px";
      t.style.background = "rgba(0,0,0,0.75)";
      t.style.color = "white";
      t.style.fontSize = "14px";
      t.style.border = "1px solid rgba(255,255,255,0.15)";
      t.style.backdropFilter = "blur(10px)";
      t.style.zIndex = "9999";
      t.style.maxWidth = "90vw";
      t.style.whiteSpace = "nowrap";
      t.style.overflow = "hidden";
      t.style.textOverflow = "ellipsis";
      t.style.opacity = "0";
      t.style.transition = "opacity 120ms ease";
      document.body.appendChild(t);
    }
    t.textContent = text;
    requestAnimationFrame(() => (t.style.opacity = "1"));
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      t.style.opacity = "0";
    }, 900);
  }

  // -----------------------------
  // Loaders
  // -----------------------------
  async function loadTeams() {
    const raw = await fetchJson(DATA.teams);

    // raw attendu: [{ team:"X", characters:[...5] }, ...]
    if (!Array.isArray(raw)) throw new Error("teams.json: format invalide (pas un tableau)");
    TEAMS = raw
      .map((t) => ({
        team: (t.team ?? t.Team ?? "").toString().trim(),
        characters: Array.isArray(t.characters)
          ? t.characters.map((c) => (c ?? "").toString().trim()).filter(Boolean)
          : [],
      }))
      .filter((t) => t.team);

    if (TEAMS.length === 0) throw new Error("teams.json: aucune équipe trouvée");
  }

  async function loadCharacters() {
    const raw = await fetchJson(DATA.characters);
    if (!Array.isArray(raw)) throw new Error("msf-characters.json: format invalide");

    CHAR_MAP = new Map();
    raw.forEach((c) => {
      const name = c.nameFr || c.nameEn || c.id || c.nameKey;
      const key = normalizeKey(name);
      if (!key) return;
      CHAR_MAP.set(key, c);

      // ajoute aussi id et nameKey comme clés, si présents
      if (c.id) CHAR_MAP.set(normalizeKey(c.id), c);
      if (c.nameKey) CHAR_MAP.set(normalizeKey(c.nameKey), c);
      if (c.nameEn) CHAR_MAP.set(normalizeKey(c.nameEn), c);
      if (c.nameFr) CHAR_MAP.set(normalizeKey(c.nameFr), c);
    });
  }

  async function loadJoueurs() {
    try {
      const raw = await fetchJson(DATA.joueurs);
      if (!Array.isArray(raw)) throw new Error("joueurs.json invalide");
      JOUEURS = raw.map((r) => ({
        joueur: r.joueur ?? r.JOUEURS ?? r.player ?? r.name,
        alliance: r.alliance ?? r.ALLIANCES ?? r.allianceName,
      }));
      return;
    } catch (_) {
      // fallback players.json si ton workflow l'écrit comme ça
    }

    try {
      const raw2 = await fetchJson(DATA.players);
      if (!Array.isArray(raw2)) throw new Error("players.json invalide");
      JOUEURS = raw2.map((r) => ({
        joueur: r.joueur ?? r.JOUEURS ?? r.player ?? r.name,
        alliance: r.alliance ?? r.ALLIANCES ?? r.allianceName,
      }));
    } catch (_) {
      JOUEURS = [];
    }
  }

  async function refreshAll() {
    setStatus("Chargement…");
    try {
      await Promise.all([loadTeams(), loadCharacters(), loadJoueurs()]);

      renderTeamOptions();
      renderPlayers();

      // si une équipe était sélectionnée, on la rerender
      const selected = teamSelect?.value || "";
      if (selected) renderSelectedTeam(selected);

      setStatus("");
    } catch (e) {
      console.error(e);
      setStatus(
        `Erreur de chargement. Vérifie que les fichiers existent sur le site :\n- ${DATA.teams}\n- ${DATA.characters}\nDétail: ${e.message}`,
        true
      );
      renderTeamOptions();
      renderPlayers();
    }
  }

  // -----------------------------
  // Events
  // -----------------------------
  if (btnRefresh) btnRefresh.addEventListener("click", refreshAll);

  if (teamSelect) {
    teamSelect.addEventListener("change", () => {
      renderSelectedTeam(teamSelect.value);
    });
  }

  // Recalcule les tailles en cas de rotation / resize
  window.addEventListener("resize", () => {
    if (!portraitsWrap) return;
    const tile = computeTileSize(portraitsWrap, 5, 12);
    applyTileSize(tile);
  });

  // -----------------------------
  // Boot
  // -----------------------------
  refreshAll();
})();