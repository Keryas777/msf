// docs/app.js
(() => {
  const FILES = {
    teams: "./data/teams.json",
    characters: "./data/msf-characters.json",
    joueurs: "./data/joueurs.json",
    rosters: "./data/rosters.json",
  };

  // ✅ Mapping robuste (on gère accent + sans accent)
  const ALLIANCE_EMOJI = {
    zeus: "⚡️",
    dionysos: "🍇",
    poseidon: "🔱",
    poséidon: "🔱",
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
  let ROSTERS = [];

  // ---- Cache-bust ----
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

  // ---- Status ----
  function setStatus(msg, isError = false) {
    if (!statusBox) return;
    statusBox.textContent = msg || "";
    statusBox.style.display = msg ? "block" : "none";
    statusBox.dataset.type = isError ? "error" : "ok";
  }

  // ---- Normalizers ----
  const normalizeKey = (s) =>
    (s ?? "")
      .toString()
      .normalize("NFKC")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[-_]/g, "");

  // ✅ FIX 1 : normalisation alliance (unicode/espaces invisibles)
  function normAlliance(a) {
    return (a ?? "")
      .toString()
      .normalize("NFKC")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  // ✅ FIX 2 : normalisation joueur (évite doublons/espaces invisibles)
  function normPlayerName(p) {
    return (p ?? "")
      .toString()
      .normalize("NFKC")
      .trim()
      .replace(/\s+/g, " ");
  }

  function clearNode(el) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  // ---- Responsive portraits (5 colonnes, 0 scroll horizontal) ----
  function computeTileSize(containerEl, columns = 5, gap = 10) {
    const w = containerEl?.clientWidth || 360;
    const totalGaps = gap * (columns - 1);
    const size = Math.floor((w - totalGaps) / columns);
    return Math.max(56, Math.min(size, 96));
  }

  function applyTileSize(sizePx) {
    document.documentElement.style.setProperty("--tile", `${sizePx}px`);
  }

  // ---- Teams ----
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

  function renderSelectedTeam(teamName) {
    clearNode(portraitsWrap);
    if (teamTitle) teamTitle.textContent = teamName || "—";
    if (!teamName) return;

    const teamObj = TEAMS.find((t) => t.team === teamName);
    if (!teamObj) return;

    // taille dynamique
    applyTileSize(computeTileSize(portraitsWrap, 5, 10));

    (teamObj.characters || []).forEach((charName) => {
      const info = findPortraitFor(charName);

      const card = document.createElement("div");
      card.className = "portraitCard";

      const img = document.createElement("img");
      img.className = "portraitImg";
      img.alt = charName;
      img.loading = "lazy";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.src = info?.portraitUrl || ""; // si vide, CSS doit gérer un fallback

      card.appendChild(img);
      portraitsWrap.appendChild(card);
    });
  }

  // ---- Joueurs : liste simple (emoji + nom) ----
  function renderPlayersListOnly() {
    clearNode(playersWrap);
    if (playersCount) playersCount.textContent = String(JOUEURS.length || 0);
    if (!JOUEURS.length) return;

    const sorted = [...JOUEURS].sort((a, b) => {
      const A = (a.alliance || "").toString();
      const B = (b.alliance || "").toString();
      if (A !== B) return A.localeCompare(B, "fr");
      return (a.player || "").toString().localeCompare((b.player || "").toString(), "fr");
    });

    sorted.forEach((row) => {
      const player = normPlayerName(row.player);
      const allianceKey = normAlliance(row.alliance);
      if (!player) return;

      const emoji = ALLIANCE_EMOJI[allianceKey] || "•";

      const chip = document.createElement("div");
      chip.className = "playerChip";
      chip.textContent = `${emoji}${player}`; // PAS d’espace
      playersWrap.appendChild(chip);
    });
  }

  // ---- ROSTERS : somme des 5 persos de l’équipe, classement décroissant ----
  function computeTeamPowerForPlayer(rosterObj, teamChars) {
    // rosterObj = { player: "...", chars: { "ironfist": 123, ... } }
    const map = rosterObj?.chars || {};
    let sum = 0;

    for (const displayName of teamChars) {
      // On convertit le nom affiché de l’équipe en clé roster (même logique que tes fetch scripts)
      // Si dans ton rosters.json les clés sont déjà "shieldsupportheal" etc,
      // il faut une correspondance fiable depuis msf-characters.json.
      const info = findPortraitFor(displayName);
      const key =
        normalizeKey(info?.id || info?.nameKey || info?.nameEn || info?.nameFr || displayName);

      const v = map[key];
      if (typeof v === "number") sum += v;
      else if (typeof v === "string") {
        const n = Number(v);
        if (Number.isFinite(n)) sum += n;
      }
    }

    return sum;
  }

  function buildAllianceMap() {
    // Map playerName(normalized) -> allianceKey(normalized)
    const m = new Map();
    JOUEURS.forEach((j) => {
      const p = normPlayerName(j.player);
      if (!p) return;
      m.set(p.toLowerCase(), normAlliance(j.alliance));
    });
    return m;
  }

  function renderRanking(teamName) {
    // Si pas d’équipe => on affiche juste la liste
    if (!teamName) {
      renderPlayersListOnly();
      return;
    }

    const teamObj = TEAMS.find((t) => t.team === teamName);
    if (!teamObj) {
      renderPlayersListOnly();
      return;
    }

    const teamChars = teamObj.characters || [];
    const allianceMap = buildAllianceMap();

    // On calcule un score pour chaque joueur présent dans rosters.json
    const rows = (ROSTERS || [])
      .map((r) => {
        const player = normPlayerName(r.player);
        const power = computeTeamPowerForPlayer(r, teamChars);
        const allianceKey = allianceMap.get(player.toLowerCase()) || "";
        return { player, allianceKey, power };
      })
      .filter((x) => x.player && Number.isFinite(x.power));

    rows.sort((a, b) => b.power - a.power);

    clearNode(playersWrap);
    if (playersCount) playersCount.textContent = String(rows.length || 0);

    rows.forEach((row, idx) => {
      const emoji = ALLIANCE_EMOJI[row.allianceKey] || "•";

      const line = document.createElement("div");
      line.className = "rankLine";

      const left = document.createElement("div");
      left.className = "rankLeft";
      left.textContent = `${idx + 1} ${emoji}${row.player}`; // 1 ⚡️Leenos

      const right = document.createElement("div");
      right.className = "rankRight";
      right.textContent = row.power.toLocaleString("fr-FR").replace(/\s/g, ""); // 8 889 004 -> 8889004

      line.appendChild(left);
      line.appendChild(right);
      playersWrap.appendChild(line);
    });
  }

  // ---- Load all ----
  async function refreshAll() {
    setStatus(""); // tu voulais supprimer le OK => on cache tout

    try {
      const [teamsRaw, charsRaw, joueursRaw, rostersRaw] = await Promise.all([
        fetchJson(FILES.teams),
        fetchJson(FILES.characters),
        fetchJson(FILES.joueurs),
        fetchJson(FILES.rosters),
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

      // Characters map (multi-keys -> object)
      CHAR_MAP = new Map();
      (charsRaw || []).forEach((c) => {
        const keys = [c.id, c.nameKey, c.nameFr, c.nameEn, c.name].filter(Boolean);
        keys.forEach((k) => CHAR_MAP.set(normalizeKey(k), c));
      });

      // Joueurs (✅ ton JSON = { player, alliance })
      JOUEURS = (joueursRaw || []).map((r) => ({
        player: normPlayerName(r.player),
        alliance: (r.alliance ?? "").toString(),
      }));

      // Rosters (✅ ton JSON = { player, chars:{...} })
      ROSTERS = Array.isArray(rostersRaw) ? rostersRaw : [];

      renderTeamOptions();

      // Si une team est déjà choisie, on l’affiche et on classe
      const selected = teamSelect?.value || "";
      if (selected) {
        renderSelectedTeam(selected);
        renderRanking(selected);
      } else {
        // pas d’équipe => on affiche juste la liste joueurs (emoji+nom)
        renderSelectedTeam("");
        renderPlayersListOnly();
      }
    } catch (e) {
      console.error(e);
      setStatus(`Erreur ❌\n${e.message}`, true);
    }
  }

  // ---- Events ----
  btnRefresh?.addEventListener("click", refreshAll);

  teamSelect?.addEventListener("change", () => {
    const selected = teamSelect.value;
    renderSelectedTeam(selected);
    renderRanking(selected);
  });

  window.addEventListener("resize", () => {
    applyTileSize(computeTileSize(portraitsWrap, 5, 10));
  });

  refreshAll();
})();