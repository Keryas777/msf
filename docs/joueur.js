// /docs/joueur.js
(() => {
  const FILES = {
    infos: "./data/infos.json",
    joueurs: "./data/joueurs.json",
    rosters: "./data/rosters.json",
    teams: "./data/teams.json",
    characters: "./data/msf-characters.json",
    isoIcons: "./data/iso-icons.json",
  };

  const ALLIANCE_EMOJI = {
    Zeus: "⚡️",
    zeus: "⚡️",
    Dionysos: "🍇",
    dionysos: "🍇",
    "Poséidon": "🔱",
    Poseidon: "🔱",
    poseidon: "🔱",
    Kronos: "⏳",
    kronos: "⏳",
  };

  const MODE_LABELS = {
    Raid: "Raid",
    Guerre: "Guerre",
    Epreuve: "Épreuve cosmique",
    Battleworld: "Battleworld",
  };

  const qs = (s) => document.querySelector(s);
  const qsa = (s) => Array.from(document.querySelectorAll(s));

  const playerSelect = qs("#playerSelect");
  const playerAllianceEl = qs("#playerAlliance");
  const playerNameEl = qs("#playerName");
  const playerTcpEl = qs("#playerTcp");
  const playerWarMvpEl = qs("#playerWarMvp");
  const playerCharCountEl = qs("#playerCharCount");
  const playerIconEl = qs("#playerIcon");
  const playerFrameEl = qs("#playerFrame");
  const playerAvatarFallbackEl = qs("#playerAvatarFallback");
  const teamsTitleEl = qs("#teamsTitle");
  const teamsCountEl = qs("#teamsCount");
  const emptyStateEl = qs("#emptyState");
  const teamListEl = qs("#teamList");

  const state = {
    infos: [],
    joueurs: [],
    rosters: [],
    teams: [],
    chars: [],
    charMap: new Map(),
    charMulti: new Map(),
    isoIcons: {},
    selectedPlayerKey: "",
    selectedMode: "",
  };

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
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");

  const normalizeIsoClass = (cls) => (cls ?? "").toString().trim().toLowerCase();

  function normalizeIsoColor(c) {
    const x = (c ?? "").toString().trim().toLowerCase();
    if (!x) return "green";
    if (x === "vert") return "green";
    if (x === "bleu") return "blue";
    if (x === "violet") return "purple";
    if (x === "green" || x === "blue" || x === "purple") return x;
    return "green";
  }

  function formatNumber(n) {
    const x = Number(n || 0);
    if (!Number.isFinite(x) || x <= 0) return "—";
    return x.toLocaleString("fr-FR");
  }

  function formatCompactPower(n) {
    const x = Number(n || 0);
    if (!Number.isFinite(x) || x <= 0) return "—";
    if (x >= 1000000) return `${(x / 1000000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M`;
    if (x >= 1000) return `${Math.round(x / 1000).toLocaleString("fr-FR")} k`;
    return x.toLocaleString("fr-FR");
  }

  function clearNode(el) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function getParam(...names) {
    const params = new URLSearchParams(window.location.search);
    for (const name of names) {
      const v = params.get(name);
      if (v) return v.trim();
    }
    return "";
  }

  function isVariantId(id) {
    const s = (id ?? "").toString();
    if (!s) return false;
    return /(_props|_bbminn|_npc|_event|_raid|_trial|_campaign|_boss)$/i.test(s);
  }

  function scoreCharacterMatch(c, queryKey) {
    const id = (c?.id ?? "").toString();
    const nameKey = (c?.nameKey ?? "").toString();
    const idKey = normalizeKey(id);
    const nameKeyKey = normalizeKey(nameKey);

    let score = 0;
    if (idKey && idKey === queryKey) score += 1000;
    if (nameKeyKey && nameKeyKey === queryKey) score += 900;
    if (isVariantId(id)) score -= 200;
    if (id && id.length <= 18) score += 10;
    return score;
  }

  function buildCharacterMaps() {
    state.charMap = new Map();
    state.charMulti = new Map();

    state.chars.forEach((c) => {
      const keys = [c.id, c.nameKey, c.nameFr, c.nameEn].filter(Boolean);
      keys.forEach((k) => {
        const kk = normalizeKey(k);
        if (!kk) return;

        if (!state.charMulti.has(kk)) state.charMulti.set(kk, []);
        state.charMulti.get(kk).push(c);

        const existing = state.charMap.get(kk);
        if (!existing || scoreCharacterMatch(c, kk) > scoreCharacterMatch(existing, kk)) {
          state.charMap.set(kk, c);
        }
      });
    });
  }

  function findCharacterInfo(charId) {
    const key = normalizeKey(charId);
    if (!key) return null;

    const list = state.charMulti.get(key);
    if (Array.isArray(list) && list.length) {
      let best = list[0];
      let bestScore = -Infinity;
      for (const c of list) {
        const sc = scoreCharacterMatch(c, key);
        if (sc > bestScore) {
          bestScore = sc;
          best = c;
        }
      }
      return best || null;
    }

    return state.charMap.get(key) || null;
  }

  function getIsoIconUrl(isoClass, isoColor) {
    const cls = normalizeIsoClass(isoClass);
    const col = normalizeIsoColor(isoColor);
    return state.isoIcons?.[cls]?.[col] || null;
  }

  function getRosterPlayerKey(roster) {
    return normalizeKey(roster?.playerKey || roster?.player || roster?.name || "");
  }

  function getInfoPlayerKey(info) {
    return normalizeKey(info?.playerKey || info?.name || info?.player || "");
  }

  function getJoueurPlayerKey(joueur) {
    return normalizeKey(joueur?.playerKey || joueur?.player || joueur?.name || "");
  }

  function getSelectedRoster() {
    if (!state.selectedPlayerKey) return null;
    return state.rosters.find((r) => getRosterPlayerKey(r) === state.selectedPlayerKey) || null;
  }

  function getSelectedJoueur() {
    if (!state.selectedPlayerKey) return null;
    return state.joueurs.find((j) => getJoueurPlayerKey(j) === state.selectedPlayerKey) || null;
  }

  function getSelectedInfo() {
    if (!state.selectedPlayerKey) return null;
    return state.infos.find((i) => getInfoPlayerKey(i) === state.selectedPlayerKey) || null;
  }

  function findRosterChar(roster, charId) {
    if (!roster?.chars || typeof roster.chars !== "object") return null;
    const target = normalizeKey(charId);
    if (!target) return null;

    for (const [key, value] of Object.entries(roster.chars)) {
      if (normalizeKey(key) === target) return value || null;
    }

    const info = findCharacterInfo(charId);
    const aliases = [info?.id, info?.nameKey, info?.nameFr, info?.nameEn].filter(Boolean).map(normalizeKey);
    for (const [key, value] of Object.entries(roster.chars)) {
      if (aliases.includes(normalizeKey(key))) return value || null;
    }

    return null;
  }

  function findIsoForChar(roster, charId) {
    if (!roster) return null;
    const info = findCharacterInfo(charId);
    const aliases = [charId, info?.id, info?.nameKey, info?.nameFr, info?.nameEn]
      .filter(Boolean)
      .map(normalizeKey);

    if (roster.iso && typeof roster.iso === "object") {
      for (const [k, v] of Object.entries(roster.iso)) {
        if (!aliases.includes(normalizeKey(k))) continue;
        const cls = normalizeIsoClass(v?.isoClass ?? v?.class ?? v?.iso_class);
        const col = normalizeIsoColor(v?.isoColor ?? v?.color ?? v?.iso_color);
        if (cls) return { isoClass: cls, isoColor: col };
      }
    }

    const clsMap =
      (roster.isoClass && typeof roster.isoClass === "object" && roster.isoClass) ||
      (roster.charsIsoClass && typeof roster.charsIsoClass === "object" && roster.charsIsoClass) ||
      (roster.iso_class && typeof roster.iso_class === "object" && roster.iso_class) ||
      null;

    const colMap =
      (roster.isoMatrix && typeof roster.isoMatrix === "object" && roster.isoMatrix) ||
      (roster.charsIsoMatrix && typeof roster.charsIsoMatrix === "object" && roster.charsIsoMatrix) ||
      (roster.iso_matrix && typeof roster.iso_matrix === "object" && roster.iso_matrix) ||
      null;

    if (clsMap || colMap) {
      const keys = new Set([...Object.keys(clsMap || {}), ...Object.keys(colMap || {})]);
      for (const k of keys) {
        if (!aliases.includes(normalizeKey(k))) continue;
        const cls = normalizeIsoClass(clsMap?.[k]);
        const col = normalizeIsoColor(colMap?.[k]);
        if (cls) return { isoClass: cls, isoColor: col };
      }
    }

    return null;
  }

  function computeTeam(team, roster) {
    const chars = (team.characters || []).map((charId) => {
      const rosterChar = findRosterChar(roster, charId);
      const power = Number(rosterChar?.power || 0);
      const gear = rosterChar?.gear ?? null;
      const level = rosterChar?.level ?? null;
      const isoMax = rosterChar?.isoMax ?? null;
      const iso = findIsoForChar(roster, charId);
      const info = findCharacterInfo(charId);

      return {
        id: charId,
        info,
        power: Number.isFinite(power) ? power : 0,
        gear,
        level,
        isoMax,
        isoClass: iso?.isoClass || "",
        isoColor: iso?.isoColor || "",
        owned: !!rosterChar && power > 0,
      };
    });

    const power = chars.reduce((sum, c) => sum + (c.power || 0), 0);
    const ownedCount = chars.filter((c) => c.owned).length;

    return {
      team: team.team,
      mode: team.mode,
      chars,
      power,
      ownedCount,
      totalCount: chars.length,
    };
  }

  function renderPlayerOptions() {
    if (!playerSelect) return;
    playerSelect.innerHTML = "";

    const players = state.rosters
      .map((r) => ({
        key: getRosterPlayerKey(r),
        name: (r.player || r.playerKey || "").toString().trim(),
        alliance: (r.alliance || "").toString().trim(),
      }))
      .filter((p) => p.key && p.name)
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));

    players.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.key;
      opt.textContent = p.name;
      playerSelect.appendChild(opt);
    });

    if (!state.selectedPlayerKey && players[0]) state.selectedPlayerKey = players[0].key;
    playerSelect.value = state.selectedPlayerKey;
  }

  function renderIdentity() {
    const roster = getSelectedRoster();
    const joueur = getSelectedJoueur();
    const info = getSelectedInfo();

    const name = info?.name || joueur?.player || roster?.player || roster?.playerKey || "Joueur";
    const alliance = info?.alliance || joueur?.alliance || roster?.alliance || "—";
    const allianceEmoji = ALLIANCE_EMOJI[alliance] || ALLIANCE_EMOJI[normalizeKey(alliance)] || "•";

    playerNameEl.textContent = name;
    playerAllianceEl.textContent = `${allianceEmoji} ${alliance}`.trim();
    playerTcpEl.textContent = formatNumber(info?.tcp);
    playerWarMvpEl.textContent = Number.isFinite(Number(info?.war_mvp)) ? Number(info.war_mvp).toLocaleString("fr-FR") : "—";
    playerCharCountEl.textContent = roster?.chars ? Object.keys(roster.chars).length.toLocaleString("fr-FR") : "—";

    const icon = info?.icon || info?.portrait || "";
    const frame = info?.frame || "";

    playerIconEl.style.display = icon ? "block" : "none";
    playerIconEl.src = icon || "";
    playerIconEl.alt = `Portrait de ${name}`;

    playerFrameEl.style.display = frame ? "block" : "none";
    playerFrameEl.src = frame || "";

    playerAvatarFallbackEl.textContent = name ? name.charAt(0).toUpperCase() : "?";
  }

  function setActiveModeChip() {
    qsa(".modeChip").forEach((btn) => {
      const active = btn.dataset.mode === state.selectedMode;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
  }

  function buildCharCard(char) {
    const card = document.createElement("div");
    card.className = "playerCharCard";
    if (!char.owned) card.classList.add("is-missing");

    const portraitBox = document.createElement("div");
    portraitBox.className = "playerCharPortraitBox";

    const img = document.createElement("img");
    img.className = "playerCharPortrait";
    img.alt = char.info?.nameKey || char.id;
    img.loading = "lazy";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.src = char.info?.portraitUrl || "";
    portraitBox.appendChild(img);

    const info = document.createElement("div");
    info.className = "playerCharInfo";

    const power = document.createElement("div");
    power.className = "playerCharPower";
    power.textContent = char.owned ? formatCompactPower(char.power) : "Absent";
    info.appendChild(power);

    const gear = document.createElement("div");
    gear.className = "playerCharGear";
    gear.textContent = char.owned && char.gear ? `G${char.gear}` : "—";
    info.appendChild(gear);

    const iso = document.createElement("div");
    iso.className = "playerCharIso";
    const isoUrl = getIsoIconUrl(char.isoClass, char.isoColor);
    if (char.owned && isoUrl) {
      const isoImg = document.createElement("img");
      isoImg.className = "playerCharIsoIcon";
      isoImg.alt = `${char.isoClass} ${char.isoColor}`.trim();
      isoImg.loading = "lazy";
      isoImg.decoding = "async";
      isoImg.referrerPolicy = "no-referrer";
      isoImg.src = isoUrl;
      iso.appendChild(isoImg);
    } else {
      const missing = document.createElement("span");
      missing.className = "playerCharIsoMissing";
      missing.textContent = "—";
      iso.appendChild(missing);
    }
    info.appendChild(iso);

    card.appendChild(portraitBox);
    card.appendChild(info);
    return card;
  }

  function buildTeamCard(team) {
    const card = document.createElement("article");
    card.className = "playerTeamCard";

    const top = document.createElement("div");
    top.className = "playerTeamTop";

    const title = document.createElement("h3");
    title.className = "playerTeamName";
    title.textContent = team.team;
    top.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "playerTeamMeta";

    const power = document.createElement("div");
    power.className = "playerTeamPower";
    power.textContent = formatNumber(team.power);
    meta.appendChild(power);

    const count = document.createElement("div");
    count.className = "playerTeamCount";
    count.textContent = `${team.ownedCount}/${team.totalCount} personnages`;
    meta.appendChild(count);

    top.appendChild(meta);
    card.appendChild(top);

    const chars = document.createElement("div");
    chars.className = "playerTeamChars";
    team.chars.forEach((char) => chars.appendChild(buildCharCard(char)));
    card.appendChild(chars);

    const missing = team.chars.filter((c) => !c.owned);
    if (missing.length) {
      const miss = document.createElement("div");
      miss.className = "playerTeamMissing";
      miss.textContent = `Manquant${missing.length > 1 ? "s" : ""} : ${missing
        .map((c) => c.info?.nameKey || c.id)
        .join(", ")}`;
      card.appendChild(miss);
    }

    return card;
  }

  function renderTeams() {
    clearNode(teamListEl);
    setActiveModeChip();

    if (!state.selectedMode) {
      teamsTitleEl.textContent = "Équipes";
      teamsCountEl.textContent = "0";
      emptyStateEl.style.display = "block";
      emptyStateEl.textContent = "Choisis un mode de jeu pour afficher les équipes du joueur.";
      return;
    }

    const roster = getSelectedRoster();
    if (!roster) {
      teamsTitleEl.textContent = MODE_LABELS[state.selectedMode] || state.selectedMode;
      teamsCountEl.textContent = "0";
      emptyStateEl.style.display = "block";
      emptyStateEl.textContent = "Roster introuvable pour ce joueur.";
      return;
    }

    const teams = state.teams
      .filter((t) => (t.mode || "").trim() === state.selectedMode)
      .map((t) => computeTeam(t, roster))
      .sort((a, b) => {
        if (b.power !== a.power) return b.power - a.power;
        if (b.ownedCount !== a.ownedCount) return b.ownedCount - a.ownedCount;
        return a.team.localeCompare(b.team, "fr");
      });

    teamsTitleEl.textContent = MODE_LABELS[state.selectedMode] || state.selectedMode;
    teamsCountEl.textContent = teams.length.toLocaleString("fr-FR");

    if (!teams.length) {
      emptyStateEl.style.display = "block";
      emptyStateEl.textContent = "Aucune équipe trouvée pour ce mode.";
      return;
    }

    emptyStateEl.style.display = "none";
    teams.forEach((team) => teamListEl.appendChild(buildTeamCard(team)));
  }

  function renderAll() {
    renderIdentity();
    renderTeams();
  }

  function normalizeTeams(raw) {
    return (raw || [])
      .map((t) => ({
        team: (t.team ?? t.Team ?? "").toString().trim(),
        mode: (t.mode ?? t.Mode ?? "").toString().trim(),
        characters: Array.isArray(t.characters)
          ? t.characters.map((c) => (c ?? "").toString().trim()).filter(Boolean)
          : [],
      }))
      .filter((t) => t.team && t.mode && t.characters.length);
  }

  function normalizeJoueurs(raw) {
    return (raw || [])
      .map((r) => ({
        player: (r.player ?? r.joueur ?? r.name ?? "").toString().trim(),
        playerKey: (r.playerKey ?? "").toString().trim(),
        alliance: (r.alliance ?? "").toString().trim(),
      }))
      .filter((r) => r.player || r.playerKey);
  }

  function chooseInitialPlayer() {
    const fromUrl = normalizeKey(getParam("player", "playerKey", "joueur"));
    if (fromUrl) {
      const exists = state.rosters.some((r) => getRosterPlayerKey(r) === fromUrl);
      if (exists) return fromUrl;
    }
    return getRosterPlayerKey(state.rosters[0]);
  }

  async function boot() {
    const [infosRaw, joueursRaw, rostersRaw, teamsRaw, charsRaw, isoIconsRaw] = await Promise.all([
      fetchJson(FILES.infos).catch(() => []),
      fetchJson(FILES.joueurs).catch(() => []),
      fetchJson(FILES.rosters),
      fetchJson(FILES.teams),
      fetchJson(FILES.characters).catch(() => []),
      fetchJson(FILES.isoIcons).catch(() => ({})),
    ]);

    state.infos = Array.isArray(infosRaw) ? infosRaw : [];
    state.joueurs = normalizeJoueurs(joueursRaw);
    state.rosters = Array.isArray(rostersRaw) ? rostersRaw : [];
    state.teams = normalizeTeams(teamsRaw);
    state.chars = Array.isArray(charsRaw) ? charsRaw : [];
    state.isoIcons = isoIconsRaw && typeof isoIconsRaw === "object" ? isoIconsRaw : {};

    buildCharacterMaps();

    state.selectedPlayerKey = chooseInitialPlayer();
    state.selectedMode = "";

    renderPlayerOptions();
    renderAll();
  }

  playerSelect?.addEventListener("change", () => {
    state.selectedPlayerKey = playerSelect.value;
    renderAll();
  });

  qsa(".modeChip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode || "";
      state.selectedMode = state.selectedMode === mode ? "" : mode;
      renderTeams();
    });
  });

  boot().catch((e) => {
    console.error(e);
    if (emptyStateEl) {
      emptyStateEl.style.display = "block";
      emptyStateEl.textContent = "Impossible de charger les données joueur.";
    }
  });
})();
