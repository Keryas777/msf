// docs/app.js
(() => {
  const FILES = {
    teams: "./data/teams.json",
    characters: "./data/msf-characters.json",
    joueurs: "./data/joueurs.json",
    rosters: "./data/rosters.json",
  };

  const ALLIANCE_EMOJI = { Zeus: "⚡️", Dionysos: "🍇", "Poséidon": "🔱", Poseidon: "🔱" };

  const qs = (s) => document.querySelector(s);

  const modeSelect = qs("#modeSelect");
  const teamSelect = qs("#teamSelect");

  const teamTitle = qs("#teamTitle");
  const portraitsWrap = qs("#portraits");

  const playersWrap = qs("#players");
  const playersCount = qs("#playersCount");

  const filterZeus = qs("#filterZeus");
  const filterDionysos = qs("#filterDionysos");
  const filterPoseidon = qs("#filterPoseidon");

  let TEAMS = [];          // [{team, mode, characters[]}]
  let CHAR_MAP = new Map(); // normalized name -> character obj (contains id + portraitUrl etc)
  let JOUEURS = [];        // [{player, alliance}]
  let ROSTERS = [];        // [{player, chars:{key:power}}]
  let ROSTER_MAP = new Map(); // playerKey -> chars map

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

  const normalizeKey = (s) =>
    (s ?? "")
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[-_]/g, "")
      .replace(/[’']/g, "");

  function clearNode(el) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function formatThousandsDot(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return "0";
    return Math.trunc(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function getSelectedModesAlliances() {
    const modes = {
      Zeus: !!filterZeus?.checked,
      Dionysos: !!filterDionysos?.checked,
      "Poséidon": !!filterPoseidon?.checked,
      Poseidon: !!filterPoseidon?.checked,
    };
    return modes;
  }

  function getTeamListFilteredByMode() {
    const selectedMode = (modeSelect?.value || "").trim();
    if (!selectedMode) return [...TEAMS];
    return TEAMS.filter((t) => (t.mode || "") === selectedMode);
  }

  function renderModeOptions() {
    if (!modeSelect) return;

    const modes = Array.from(
      new Set(
        TEAMS.map((t) => (t.mode || "").trim()).filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, "fr"));

    modeSelect.innerHTML = "";

    const allOpt = document.createElement("option");
    allOpt.value = "";
    allOpt.textContent = "Tous les modes";
    modeSelect.appendChild(allOpt);

    modes.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      modeSelect.appendChild(opt);
    });
  }

  function renderTeamOptions() {
    if (!teamSelect) return;

    const list = getTeamListFilteredByMode()
      .slice()
      .sort((a, b) => a.team.localeCompare(b.team, "fr"));

    const current = teamSelect.value || "";

    teamSelect.innerHTML = "";

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "— Choisir une équipe —";
    teamSelect.appendChild(opt0);

    list.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.team;
      opt.textContent = t.team;
      teamSelect.appendChild(opt);
    });

    // si l'équipe sélectionnée n'existe plus dans ce mode -> reset
    const stillExists = list.some((t) => t.team === current);
    teamSelect.value = stillExists ? current : "";
  }

  function findPortraitFor(name) {
    const key = normalizeKey(name);
    return CHAR_MAP.get(key) || null;
  }

  function renderSelectedTeam(teamName) {
    clearNode(portraitsWrap);
    if (teamTitle) teamTitle.textContent = teamName || "—";
    if (!teamName) return;

    // IMPORTANT: on filtre par mode sélectionné pour éviter mismatch
    const teamsFiltered = getTeamListFilteredByMode();
    const teamObj = teamsFiltered.find((t) => t.team === teamName) || TEAMS.find((t) => t.team === teamName);
    if (!teamObj) return;

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
      img.src = info?.portraitUrl || "";

      card.appendChild(img);
      portraitsWrap.appendChild(card);
    });
  }

  // calcule puissance team pour un joueur: somme des persos présents (missing => 0)
  function computeTeamPowerForPlayer(playerName, teamName) {
    const playerKey = normalizeKey(playerName);
    const charsMap = ROSTER_MAP.get(playerKey) || null;
    if (!charsMap) return 0;

    const teamObj = TEAMS.find((t) => t.team === teamName);
    if (!teamObj) return 0;

    let sum = 0;

    for (const charName of (teamObj.characters || [])) {
      // on essaye de convertir le nom affiché -> clé roster (id)
      const info = findPortraitFor(charName);
      const rosterKey =
        normalizeKey(info?.id || info?.nameKey || info?.nameEn || info?.nameFr || charName);

      const val = charsMap[rosterKey];
      if (Number.isFinite(Number(val))) sum += Number(val);
      // sinon: perso non débloqué / pas présent => 0
    }

    return sum;
  }

  function renderRanking() {
    clearNode(playersWrap);

    const teamName = teamSelect?.value || "";
    if (!teamName) {
      if (playersCount) playersCount.textContent = "0";
      return;
    }

    const allianceEnabled = getSelectedModesAlliances();

    // on construit le classement sur les joueurs filtrés par alliances cochées
    const rows = JOUEURS
      .filter((p) => {
        const a = (p.alliance || "").trim();
        // si alliance inconnue => on garde ? (ici: non)
        return !!allianceEnabled[a];
      })
      .map((p) => {
        const power = computeTeamPowerForPlayer(p.player, teamName);
        return { ...p, power };
      })
      .sort((a, b) => b.power - a.power);

    if (playersCount) playersCount.textContent = String(rows.length);

    // container lignes
    const list = document.createElement("div");
    list.className = "rankList";

    rows.forEach((r, idx) => {
      const emoji = ALLIANCE_EMOJI[r.alliance] || "•";

      const row = document.createElement("div");
      row.className = "rankRow";

      const left = document.createElement("div");
      left.className = "rankLeft";

      const num = document.createElement("div");
      num.className = "rankNum";
      num.textContent = String(idx + 1);

      const name = document.createElement("div");
      name.className = "rankName";
      name.textContent = `${emoji}${r.player}`;

      left.appendChild(num);
      left.appendChild(name);

      const power = document.createElement("div");
      power.className = "rankPower";
      power.textContent = formatThousandsDot(r.power);

      row.appendChild(left);
      row.appendChild(power);
      list.appendChild(row);
    });

    playersWrap.appendChild(list);
  }

  function onModeChange() {
    renderTeamOptions();
    renderSelectedTeam(teamSelect.value || "");
    renderRanking();
  }

  function onTeamChange() {
    renderSelectedTeam(teamSelect.value || "");
    renderRanking();
  }

  async function boot() {
    const [teamsRaw, charsRaw, joueursRaw, rostersRaw] = await Promise.all([
      fetchJson(FILES.teams),
      fetchJson(FILES.characters),
      fetchJson(FILES.joueurs),
      fetchJson(FILES.rosters),
    ]);

    // Characters map
    CHAR_MAP = new Map();
    (charsRaw || []).forEach((c) => {
      const keys = [c.id, c.nameKey, c.nameFr, c.nameEn].filter(Boolean);
      keys.forEach((k) => CHAR_MAP.set(normalizeKey(k), c));
    });

    // Teams (mode + team + characters[])
    TEAMS = (teamsRaw || [])
      .map((t) => {
        const team = (t.team ?? t.Team ?? "").toString().trim();
        const mode = (t.mode ?? t.Mode ?? "").toString().trim(); // <-- nouveau
        const characters = Array.isArray(t.characters)
          ? t.characters.map((c) => (c ?? "").toString().trim()).filter(Boolean)
          : [];
        return { team, mode, characters };
      })
      .filter((t) => t.team);

    // Joueurs (2 champs: player + alliance)
    JOUEURS = (joueursRaw || [])
      .map((r) => ({
        player: (r.player ?? r.joueur ?? r.JOUEURS ?? "").toString().trim(),
        alliance: (r.alliance ?? r.ALLIANCES ?? "").toString().trim(),
      }))
      .filter((r) => r.player);

    // Rosters (player + chars)
    ROSTERS = (rostersRaw || [])
      .map((r) => ({
        player: (r.player ?? "").toString().trim(),
        chars: r.chars && typeof r.chars === "object" ? r.chars : {},
      }))
      .filter((r) => r.player);

    ROSTER_MAP = new Map();
    for (const r of ROSTERS) {
      // normalisation des clés chars: on stocke tout normalisé
      const normChars = {};
      for (const [k, v] of Object.entries(r.chars || {})) {
        normChars[normalizeKey(k)] = v;
      }
      ROSTER_MAP.set(normalizeKey(r.player), normChars);
    }

    // Options de mode + équipes filtrées
    renderModeOptions();

    // mode par défaut = Tous
    if (modeSelect) modeSelect.value = "";

    renderTeamOptions();

    // si tu veux garder une team déjà sélectionnée au reload, on tente
    const defaultTeam = teamSelect?.value || "";
    renderSelectedTeam(defaultTeam);
    renderRanking();
  }

  // Events
  modeSelect?.addEventListener("change", onModeChange);
  teamSelect?.addEventListener("change", onTeamChange);

  filterZeus?.addEventListener("change", renderRanking);
  filterDionysos?.addEventListener("change", renderRanking);
  filterPoseidon?.addEventListener("change", renderRanking);

  boot().catch((e) => console.error(e));
})();