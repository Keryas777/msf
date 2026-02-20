// docs/iso.js
(() => {
  const FILES = {
    teams: "./data/teams.json",
    characters: "./data/msf-characters.json",
    joueurs: "./data/joueurs.json",
    rosters: "./data/rosters.json",
    isoReco: "./data/iso-reco.json",
    isoIcons: "./data/iso-icons.json",
  };

  const ALLIANCE_EMOJI = {
    Zeus: "⚡️",
    Dionysos: "🍇",
    "Poséidon": "🔱",
    Poseidon: "🔱",
  };

  const qs = (s) => document.querySelector(s);

  // ✅ NOUVEAU : Mode puis Team (comme la page classement)
  const modeSelect = qs("#modeSelect2");
  const teamSelect = qs("#teamSelect2");

  const allianceSelect = qs("#allianceSelect");
  const playerSelect = qs("#playerSelect");

  const recoWrap = qs("#recoPortraits");
  const playerWrap = qs("#playerPortraits");
  const playerTitle = qs("#playerTitle");

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

  // Règle demandée : si vide => VERT
  function normalizeIsoColor(c) {
    const x = (c ?? "").toString().trim().toLowerCase();
    if (!x) return "green";
    if (x === "vert") return "green";
    if (x === "bleu") return "blue";
    if (x === "violet") return "purple";
    if (x === "green" || x === "blue" || x === "purple") return x;
    return "green";
  }

  function normalizeIsoClass(cls) {
    return (cls ?? "").toString().trim().toLowerCase();
  }

  // -------- Data in-memory --------
  let TEAMS = [];               // [{team, mode, characters[]}]
  let CHAR_MAP = new Map();     // normalized key -> character obj
  let JOUEURS = [];             // [{player, alliance}]
  let PLAYERS_BY_ALLIANCE = new Map(); // alliance -> [{player,alliance}]
  let ROSTERS = [];             // raw rosters (enrichi plus tard avec iso)
  let ROSTER_ISO_MAP = new Map(); // playerKey -> { charKey -> {isoClass, isoColor} }

  let ISO_RECO_MAP = new Map(); // charKey -> {isoClass, isoColor}
  let ISO_ICONS = {};           // { striker:{green,blue,purple}, ... }

  // -------- Mode/Team helpers --------
  function getSelectedMode() {
    return (modeSelect?.value || "").trim();
  }

  // ✅ si aucun mode sélectionné => aucune team proposée
  function getTeamListFilteredByMode() {
    const selectedMode = getSelectedMode();
    if (!selectedMode) return [];
    return TEAMS.filter((t) => (t.mode || "").trim() === selectedMode);
  }

  function getSelectedTeamObj() {
    const teamName = (teamSelect?.value || "").trim();
    if (!teamName) return null;

    const list = getTeamListFilteredByMode();
    return list.find((t) => (t.team || "").trim() === teamName) || null;
  }

  // -------- Helpers --------
  function findCharacterInfo(name) {
    const key = normalizeKey(name);
    return CHAR_MAP.get(key) || null;
  }

  function getIsoIconUrl(isoClass, isoColor) {
    const cls = normalizeIsoClass(isoClass);
    const col = normalizeIsoColor(isoColor);
    return ISO_ICONS?.[cls]?.[col] || null;
  }

  function buildPortraitCard(charName, isoClass, isoColor) {
    const info = findCharacterInfo(charName);

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

    const badge = document.createElement("div");
    badge.className = "isoBadge";

    const iconUrl = getIsoIconUrl(isoClass, isoColor);

    if (iconUrl) {
      const isoImg = document.createElement("img");
      isoImg.className = "isoIcon";
      isoImg.alt = `${isoClass || ""} ${isoColor || ""}`.trim();
      isoImg.loading = "lazy";
      isoImg.decoding = "async";
      isoImg.referrerPolicy = "no-referrer";
      isoImg.src = iconUrl;
      badge.appendChild(isoImg);
    } else {
      const missing = document.createElement("div");
      missing.className = "isoMissing";
      missing.textContent = "—";
      badge.appendChild(missing);
    }

    card.appendChild(badge);
    return card;
  }

  function getSelectedAlliance() {
    return (allianceSelect?.value || "").trim();
  }

  function getSelectedPlayer() {
    return (playerSelect?.value || "").trim();
  }

  function setPlayerTitle() {
    const p = getSelectedPlayer();
    playerTitle.textContent = p ? p : "—";
  }

  // -------- Rendering --------
  function renderModeOptions() {
    if (!modeSelect) return;

    const modes = Array.from(
      new Set(TEAMS.map((t) => (t.mode || "").trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, "fr"));

    modeSelect.innerHTML = "";

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "— Choisir un mode de jeu —";
    modeSelect.appendChild(opt0);

    modes.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      modeSelect.appendChild(opt);
    });

    modeSelect.value = "";
  }

  function renderTeamOptions() {
    if (!teamSelect) return;

    const selectedMode = getSelectedMode();
    teamSelect.innerHTML = "";

    const opt0 = document.createElement("option");
    opt0.value = "";

    // ✅ si pas de mode => on ne propose aucune équipe
    if (!selectedMode) {
      opt0.textContent = "— Choisir un mode d’abord —";
      teamSelect.appendChild(opt0);
      teamSelect.value = "";
      return;
    }

    opt0.textContent = "— Choisir une équipe —";
    teamSelect.appendChild(opt0);

    const list = getTeamListFilteredByMode()
      .slice()
      .sort((a, b) => (a.team || "").localeCompare((b.team || ""), "fr"));

    list.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = (t.team || "").trim();
      opt.textContent = (t.team || "").trim();
      teamSelect.appendChild(opt);
    });

    teamSelect.value = "";
  }

  function renderAllianceOptions() {
    allianceSelect.innerHTML = "";

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "— Choisir une alliance —";
    allianceSelect.appendChild(opt0);

    const alliances = Array.from(
      new Set(JOUEURS.map((j) => (j.alliance || "").trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, "fr"));

    alliances.forEach((a) => {
      const opt = document.createElement("option");
      opt.value = a;
      opt.textContent = `${ALLIANCE_EMOJI[a] || "•"} ${a}`.trim();
      allianceSelect.appendChild(opt);
    });

    allianceSelect.value = "";
  }

  function renderPlayerOptions() {
    const alliance = getSelectedAlliance();

    playerSelect.innerHTML = "";

    if (!alliance) {
      playerSelect.disabled = true;
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "— Choisir une alliance d’abord —";
      playerSelect.appendChild(opt);
      playerSelect.value = "";
      return;
    }

    const list = (PLAYERS_BY_ALLIANCE.get(alliance) || [])
      .slice()
      .sort((a, b) => a.player.localeCompare(b.player, "fr"));

    playerSelect.disabled = false;

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "— Choisir un joueur —";
    playerSelect.appendChild(opt0);

    list.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.player;
      opt.textContent = p.player;
      playerSelect.appendChild(opt);
    });

    playerSelect.value = "";
  }

  function renderRecoBlock() {
    clearNode(recoWrap);

    const team = getSelectedTeamObj();
    if (!team) return;

    (team.characters || []).forEach((charName) => {
      const info = findCharacterInfo(charName);

      const charKey = normalizeKey(
        info?.id || info?.nameKey || info?.nameEn || info?.nameFr || charName
      );

      const reco = ISO_RECO_MAP.get(charKey) || null;
      const card = buildPortraitCard(
        charName,
        reco?.isoClass || "",
        reco?.isoColor || ""
      );
      recoWrap.appendChild(card);
    });
  }

  function renderPlayerBlock() {
    clearNode(playerWrap);
    setPlayerTitle();

    const team = getSelectedTeamObj();
    const player = getSelectedPlayer();
    if (!team || !player) return;

    const pKey = normalizeKey(player);
    const isoByChar = ROSTER_ISO_MAP.get(pKey) || {};

    (team.characters || []).forEach((charName) => {
      const info = findCharacterInfo(charName);
      const charKey = normalizeKey(
        info?.id || info?.nameKey || info?.nameEn || info?.nameFr || charName
      );

      const picked = isoByChar[charKey] || null;

      const card = buildPortraitCard(
        charName,
        picked?.isoClass || "",
        picked?.isoColor || ""
      );
      playerWrap.appendChild(card);
    });
  }

  function renderAll() {
    renderRecoBlock();
    renderPlayerBlock();
  }

  // -------- Build maps --------
  function buildPlayersByAlliance() {
    PLAYERS_BY_ALLIANCE = new Map();
    for (const j of JOUEURS) {
      const a = (j.alliance || "").trim();
      if (!a) continue;
      if (!PLAYERS_BY_ALLIANCE.has(a)) PLAYERS_BY_ALLIANCE.set(a, []);
      PLAYERS_BY_ALLIANCE.get(a).push(j);
    }
  }

  function buildIsoRecoMap(rows) {
    ISO_RECO_MAP = new Map();

    (rows || []).forEach((r) => {
      const character = (r.character ?? r.Character ?? "").toString().trim();
      if (!character) return;

      const cls = normalizeIsoClass(
        r["ISO-reco-class"] ?? r.isoRecoClass ?? r.iso_reco_class ?? r.recoClass
      );
      const col = normalizeIsoColor(
        r["ISO-reco-matrix"] ?? r.isoRecoMatrix ?? r.iso_reco_matrix ?? r.recoMatrix
      );

      const info = findCharacterInfo(character);
      const key = normalizeKey(
        info?.id || info?.nameKey || info?.nameEn || info?.nameFr || character
      );

      if (!key) return;
      ISO_RECO_MAP.set(key, { isoClass: cls, isoColor: col });
    });
  }

  function buildRosterIsoMap(rostersRaw) {
    ROSTER_ISO_MAP = new Map();

    (rostersRaw || []).forEach((r) => {
      const player = (r.player ?? "").toString().trim();
      if (!player) return;

      const pKey = normalizeKey(player);
      const out = {};

      if (r.iso && typeof r.iso === "object") {
        for (const [k, v] of Object.entries(r.iso)) {
          const ck = normalizeKey(k);
          const cls = normalizeIsoClass(v?.isoClass ?? v?.class ?? v?.iso_class);
          const col = normalizeIsoColor(v?.isoColor ?? v?.color ?? v?.iso_color);
          if (ck) out[ck] = { isoClass: cls, isoColor: col };
        }
      }

      const clsMap =
        (r.isoClass && typeof r.isoClass === "object" && r.isoClass) ||
        (r.charsIsoClass && typeof r.charsIsoClass === "object" && r.charsIsoClass) ||
        (r.iso_class && typeof r.iso_class === "object" && r.iso_class) ||
        null;

      const colMap =
        (r.isoMatrix && typeof r.isoMatrix === "object" && r.isoMatrix) ||
        (r.charsIsoMatrix && typeof r.charsIsoMatrix === "object" && r.charsIsoMatrix) ||
        (r.iso_matrix && typeof r.iso_matrix === "object" && r.iso_matrix) ||
        null;

      if (clsMap || colMap) {
        const keys = new Set([
          ...Object.keys(clsMap || {}),
          ...Object.keys(colMap || {}),
        ]);

        keys.forEach((k) => {
          const ck = normalizeKey(k);
          if (!ck) return;
          const cls = normalizeIsoClass(clsMap?.[k]);
          const col = normalizeIsoColor(colMap?.[k]);
          out[ck] = { isoClass: cls, isoColor: col };
        });
      }

      ROSTER_ISO_MAP.set(pKey, out);
    });
  }

  // -------- Events --------
  function onModeChange() {
    // ✅ comme dans classement : reset team + affichage
    if (teamSelect) teamSelect.value = "";
    renderTeamOptions();

    clearNode(recoWrap);
    clearNode(playerWrap);
    renderAll();
  }

  function onTeamChange() {
    renderAll();
  }

  function onAllianceChange() {
    renderPlayerOptions();
    playerTitle.textContent = "—";
    clearNode(playerWrap);
    renderAll();
  }

  function onPlayerChange() {
    renderAll();
  }

  // -------- Boot --------
  async function boot() {
    const [
      teamsRaw,
      charsRaw,
      joueursRaw,
      rostersRaw,
      isoRecoRaw,
      isoIconsRaw,
    ] = await Promise.all([
      fetchJson(FILES.teams),
      fetchJson(FILES.characters),
      fetchJson(FILES.joueurs),
      fetchJson(FILES.rosters),
      fetchJson(FILES.isoReco).catch(() => []),
      fetchJson(FILES.isoIcons).catch(() => ({})),
    ]);

    // Characters map
    CHAR_MAP = new Map();
    (charsRaw || []).forEach((c) => {
      const keys = [c.id, c.nameKey, c.nameFr, c.nameEn].filter(Boolean);
      keys.forEach((k) => CHAR_MAP.set(normalizeKey(k), c));
    });

    // Teams
    TEAMS = (teamsRaw || [])
      .map((t) => {
        const team = (t.team ?? t.Team ?? "").toString().trim();
        const mode = (t.mode ?? t.Mode ?? "").toString().trim();
        const characters = Array.isArray(t.characters)
          ? t.characters.map((c) => (c ?? "").toString().trim()).filter(Boolean)
          : [];
        return { team, mode, characters };
      })
      .filter((t) => t.team);

    // Joueurs
    JOUEURS = (joueursRaw || [])
      .map((r) => ({
        player: (r.player ?? r.joueur ?? r.JOUEURS ?? "").toString().trim(),
        alliance: (r.alliance ?? r.ALLIANCES ?? "").toString().trim(),
      }))
      .filter((r) => r.player);

    buildPlayersByAlliance();

    // Iso icons
    ISO_ICONS = isoIconsRaw && typeof isoIconsRaw === "object" ? isoIconsRaw : {};

    // Iso reco
    buildIsoRecoMap(Array.isArray(isoRecoRaw) ? isoRecoRaw : []);

    // Rosters iso (si dispo)
    ROSTERS = Array.isArray(rostersRaw) ? rostersRaw : [];
    buildRosterIsoMap(ROSTERS);

    // UI
    renderModeOptions();     // ✅ d’abord
    renderTeamOptions();     // ✅ vide tant que mode pas choisi

    renderAllianceOptions();
    renderPlayerOptions();

    playerTitle.textContent = "—";
    clearNode(recoWrap);
    clearNode(playerWrap);
  }

  modeSelect?.addEventListener("change", onModeChange);
  teamSelect?.addEventListener("change", onTeamChange);

  allianceSelect?.addEventListener("change", onAllianceChange);
  playerSelect?.addEventListener("change", onPlayerChange);

  boot().catch((e) => console.error(e));
})();