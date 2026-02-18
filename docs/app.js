// docs/app.js
(() => {
  const FILES = {
    teams: "./data/teams.json",
    characters: "./data/msf-characters.json",
    joueurs: "./data/joueurs.json",
  };

  const ALLIANCE_EMOJI = {
    Zeus: "⚡️",
    Dionysos: "🍇",
    Poséidon: "🔱",
    Poseidon: "🔱",
  };

  const qs = (s) => document.querySelector(s);

  const teamSelect = qs("#teamSelect");
  const btnRefresh = qs("#refreshBtn");
  const teamTitle = qs("#teamTitle");
  const portraitsWrap = qs("#portraits");
  const playersWrap = qs("#players");
  const playersCount = qs("#playersCount");
  const statusBox = qs("#statusBox");

  let TEAMS = [];
  let CHAR_MAP = new Map();
  let JOUEURS = [];

  const bust = (url) => {
    const u = new URL(url, window.location.href);
    u.searchParams.set("v", Date.now().toString());
    return u.toString();
  };

  async function fetchJson(url) {
    const res = await fetch(bust(url), { cache: "no-store" });
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return res.json();
  }

  function setStatus(msg) {
    if (!statusBox) return;
    statusBox.textContent = msg || "";
    statusBox.style.display = msg ? "block" : "none";
  }

  const normalizeKey = (s) =>
    (s ?? "")
      .toString()
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // enlève accents
      .replace(/\s+/g, "")
      .replace(/[-_]/g, "");

  function clearNode(el) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  // === Team tiles : 5 portraits sans scroll horizontal, taille dynamique ===
  function computeTileSize(containerEl, columns = 5) {
    const w = containerEl?.clientWidth || 360;
    const gap = 10;
    const totalGaps = gap * (columns - 1);
    const size = Math.floor((w - totalGaps) / columns);
    return Math.max(56, Math.min(size, 96));
  }

  function applyTeamGridSizing() {
    const tile = computeTileSize(portraitsWrap, 5);
    document.documentElement.style.setProperty("--tile", `${tile}px`);
  }

  // === Teams select ===
  function renderTeamOptions() {
    if (!teamSelect) return;
    teamSelect.innerHTML = "";

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
    return CHAR_MAP.get(key) || null;
  }

  // === Joueurs parsing (2 champs seulement, ultra tolérant) ===
  function parseJoueurs(raw) {
    if (!Array.isArray(raw) || raw.length === 0) return [];

    // ✅ tableau d'objets
    if (typeof raw[0] === "object" && !Array.isArray(raw[0])) {
      const first = raw[0];
      const keys = Object.keys(first);
      const normPairs = keys.map((k) => [k, normalizeKey(k)]);

      const joueurKey =
        normPairs.find(([, nk]) => nk === "joueur" || nk === "joueurs" || nk.includes("joueur"))?.[0] ||
        normPairs.find(([, nk]) => nk === "nom" || nk.includes("pseudo") || nk.includes("player") || nk.includes("name"))?.[0] ||
        keys[0];

      const allianceKey =
        normPairs.find(([, nk]) => nk === "alliance" || nk === "alliances" || nk.includes("alliance"))?.[0] ||
        normPairs.find(([, nk]) => nk.includes("guilde") || nk.includes("guild") || nk.includes("team"))?.[0] ||
        keys[1];

      return raw
        .map((r) => ({
          joueur: (r?.[joueurKey] ?? "").toString().trim(),
          alliance: (r?.[allianceKey] ?? "").toString().trim(),
        }))
        .filter((x) => x.joueur);
    }

    // ✅ tableau de tableaux (2 colonnes)
    if (Array.isArray(raw[0])) {
      return raw
        .map((r) => ({
          joueur: (r?.[0] ?? "").toString().trim(),
          alliance: (r?.[1] ?? "").toString().trim(),
        }))
        .filter((x) => x.joueur);
    }

    return [];
  }

  // === Render team portraits (SANS noms) ===
  function renderSelectedTeam(teamName) {
    clearNode(portraitsWrap);
    if (teamTitle) teamTitle.textContent = teamName || "—";
    if (!teamName) return;

    const teamObj = TEAMS.find((t) => t.team === teamName);
    if (!teamObj) return;

    applyTeamGridSizing();

    (teamObj.characters || []).slice(0, 5).forEach((charName) => {
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
      // évite “haut coupé” côté rendu (si CSS a du cover)
      img.style.objectFit = "contain";
      img.style.background = "transparent";

      card.appendChild(img);
      portraitsWrap.appendChild(card);
    });
  }

  // === Render players chips ===
  function renderPlayers() {
    clearNode(playersWrap);
    if (playersCount) playersCount.textContent = String(JOUEURS.length || 0);
    if (!JOUEURS.length) return;

    const sorted = [...JOUEURS].sort((a, b) => {
      const A = (a.alliance || "").toString();
      const B = (b.alliance || "").toString();
      if (A !== B) return A.localeCompare(B, "fr");
      return (a.joueur || "").toString().localeCompare((b.joueur || "").toString(), "fr");
    });

    sorted.forEach((row) => {
      const joueur = (row.joueur ?? "").toString().trim();
      const alliance = (row.alliance ?? "").toString().trim();
      if (!joueur) return;

      const emoji = ALLIANCE_EMOJI[alliance] || "•";
      const chip = document.createElement("div");
      chip.className = "playerChip";
      chip.textContent = `${emoji}${joueur}`; // PAS d’espace
      playersWrap.appendChild(chip);
    });
  }

  async function refreshAll() {
    // on enlève le message "OK ✅ ..." -> pas de status en succès
    setStatus("Chargement…");

    try {
      const [teamsRaw, charsRaw, joueursRaw] = await Promise.all([
        fetchJson(FILES.teams),
        fetchJson(FILES.characters),
        fetchJson(FILES.joueurs),
      ]);

      // Teams
      TEAMS = (teamsRaw || [])
        .map((t) => ({
          team: (t.team ?? "").toString().trim(),
          characters: Array.isArray(t.characters)
            ? t.characters.map((c) => (c ?? "").toString().trim()).filter(Boolean)
            : [],
        }))
        .filter((t) => t.team);

      // Characters map
      CHAR_MAP = new Map();
      (charsRaw || []).forEach((c) => {
        const keys = [c.id, c.nameKey, c.nameFr, c.nameEn].filter(Boolean);
        keys.forEach((k) => CHAR_MAP.set(normalizeKey(k), c));
      });

      // Joueurs (2 champs uniquement)
      JOUEURS = parseJoueurs(joueursRaw);

      renderTeamOptions();
      renderPlayers();

      // garde la sélection actuelle si possible
      const selected = teamSelect?.value || "";
      if (selected) renderSelectedTeam(selected);

      // succès -> on cache le status
      setStatus("");
    } catch (e) {
      console.error(e);
      setStatus(`Erreur de chargement : ${e.message}`);
    }
  }

  btnRefresh?.addEventListener("click", refreshAll);
  teamSelect?.addEventListener("change", () => renderSelectedTeam(teamSelect.value));
  window.addEventListener("resize", applyTeamGridSizing);

  // init
  applyTeamGridSizing();
  refreshAll();
})();