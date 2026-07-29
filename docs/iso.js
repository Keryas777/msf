// docs/iso.js
(() => {
  const FILES = {
    alliances: "./data/alliances.json",
    teams: "./data/teams.json",
    characters: "./data/msf-characters.json",
    joueurs: "./data/joueurs.json",
    rosters: "./data/rosters.json",
    isoReco: "./data/iso-reco.json",
    isoIcons: "./data/iso-icons.json",
  };

  // ✅ Ordre forcé des modes de jeu (affichage dans le select)
  const MODE_ORDER = ["Arène", "Raids", "Guerre", "Epreuve", "Battleworld", "Divers hors méta"];

  const qs = (s) => document.querySelector(s);

  const allianceSelect = qs("#allianceSelect");
  const playerSelect = qs("#playerSelect");
  const modeSelect = qs("#modeSelect2");
  const teamSelect = qs("#teamSelect2");

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

  // Règle : si vide => VERT
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

  function prettyIsoClass(cls) {
    const c = normalizeIsoClass(cls);
    if (!c) return "—";
    return c.charAt(0).toUpperCase() + c.slice(1);
  }

  function prettyIsoColor(col) {
    const c = normalizeIsoColor(col);
    if (c === "green") return "Vert";
    if (c === "blue") return "Bleu";
    if (c === "purple") return "Violet";
    return "Vert";
  }

  // -------- Data --------
  let ALLIANCES = [];
  let ALLIANCE_BY_KEY = new Map();
  let ALLIANCE_ALIAS_TO_KEY = new Map();
  let ALLIANCE_ORDER_KEYS = [];

  let TEAMS = []; // [{team, mode, characters[]}]
  let CHARS = [];
  let CHAR_MAP = new Map();   // alias -> best char
  let CHAR_MULTI = new Map(); // alias -> [chars]
  let CANON_KEYS = [];
  let CANON_SET = new Set();

  let JOUEURS = []; // [{player, alliance}]
  let PLAYERS_BY_ALLIANCE = new Map();

  let ROSTERS = [];
  let ROSTER_ISO_MAP = new Map(); // playerKey -> { charKey -> {isoClass, isoColor} }

  let ISO_RECO_MAP = new Map(); // canonCharKey -> {isoClass, isoColor}
  let ISO_ICONS = {}; // { striker:{green,blue,purple}, ... }

  // -------- Alliances --------
  const FALLBACK_ALLIANCES = Object.freeze([
    Object.freeze({
      key: "zeus",
      name: "Zeus",
      emoji: "⚡️",
      color: "#F8FF00",
      order: 1,
      aliases: Object.freeze(["Zeus", "zeus", "LoSP Zeus", "losp zeus"]),
    }),
    Object.freeze({
      key: "athena",
      name: "Athéna",
      emoji: "🦉",
      color: "#F28C28",
      order: 2,
      aliases: Object.freeze([
        "Athéna",
        "Athena",
        "athéna",
        "athena",
        "LoSP Athéna",
        "LoSP Athena",
        "losp athéna",
        "losp athena",
      ]),
    }),
    Object.freeze({
      key: "kronos",
      name: "Kronos",
      emoji: "⏳",
      color: "#E10D17",
      order: 3,
      aliases: Object.freeze(["Kronos", "kronos", "Cronos", "Chronos", "LoSP Kronos", "losp kronos"]),
    }),
    Object.freeze({
      key: "dionysos",
      name: "Dionysos",
      emoji: "🍇",
      color: "#93328E",
      order: 4,
      aliases: Object.freeze(["Dionysos", "dionysos", "LoSP Dionysos", "losp dionysos"]),
    }),
    Object.freeze({
      key: "poseidon",
      name: "Poséidon",
      emoji: "🔱",
      color: "#0000FF",
      order: 5,
      aliases: Object.freeze([
        "Poséidon",
        "Poseidon",
        "Posseidon",
        "poséidon",
        "poseidon",
        "posseidon",
        "LoSP Poséidon",
        "losp poseidon",
      ]),
    }),
    Object.freeze({
      key: "hades",
      name: "Hadès",
      emoji: "🔥",
      color: "#1EA164",
      order: 6,
      aliases: Object.freeze(["Hadès", "Hades", "hadès", "hades", "LoSP Hadès", "losp hades"]),
    }),
  ]);

  function normalizeAllianceAlias(value) {
    return (value ?? "")
      .toString()
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "")
      .replace(/[-_‐-‒–—―﹘﹣－]/g, "")
      .replace(/[’'`´]/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  function normalizeAllianceData(data) {
    const rows = Array.isArray(data) ? data : [];

    return rows
      .map((a) => {
        const key = normalizeAllianceAlias(a?.key);
        const name = (a?.name ?? "").toString().trim();
        const emoji = (a?.emoji ?? "").toString().trim();
        const color = (a?.color ?? "").toString().trim();
        const rawOrder = a?.order;
        const order = rawOrder === null || rawOrder === undefined || rawOrder === "" ? NaN : Number(rawOrder);
        const aliases = Array.isArray(a?.aliases) ? a.aliases : [];

        if (!key) return null;

        return {
          key,
          name,
          emoji,
          color,
          order: Number.isFinite(order) ? order : null,
          aliases: [...new Set([name, a?.key, key, ...aliases].filter(Boolean).map(String))],
        };
      })
      .filter(Boolean);
  }

  function mergeAliases(...lists) {
    const seen = new Set();
    const aliases = [];

    lists.flat().filter(Boolean).forEach((alias) => {
      const normalized = normalizeAllianceAlias(alias);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      aliases.push(alias);
    });

    return aliases;
  }

  function buildAllianceMaps(data) {
    const fallbackByKey = new Map(normalizeAllianceData(FALLBACK_ALLIANCES).map((a) => [a.key, a]));
    const helperByKey = new Map(normalizeAllianceData(data).map((a) => [a.key, a]));
    const keys = [...new Set([...fallbackByKey.keys(), ...helperByKey.keys()])];

    ALLIANCES = keys
      .map((key) => {
        const fallback = fallbackByKey.get(key) || {};
        const helper = helperByKey.get(key) || {};

        return {
          key,
          name: helper.name || fallback.name || key,
          emoji: helper.emoji || fallback.emoji || "•",
          color: helper.color || fallback.color || "",
          order: helper.order ?? fallback.order ?? 999,
          aliases: mergeAliases(
            [key, helper.name, fallback.name],
            helper.aliases || [],
            fallback.aliases || []
          ),
        };
      })
      .sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.name.localeCompare(b.name, "fr");
      });

    ALLIANCE_BY_KEY = new Map();
    ALLIANCE_ALIAS_TO_KEY = new Map();

    ALLIANCES.forEach((alliance) => {
      ALLIANCE_BY_KEY.set(alliance.key, alliance);

      [alliance.key, alliance.name, ...(alliance.aliases || [])].forEach((value) => {
        const aliasKey = normalizeAllianceAlias(value);
        if (!aliasKey) return;
        ALLIANCE_ALIAS_TO_KEY.set(aliasKey, alliance.key);
      });
    });

    ALLIANCE_ORDER_KEYS = ALLIANCES.map((a) => a.key);
  }

  async function loadAllianceMetadata() {
    const helper = window.LoSPAlliances;
    if (!helper) {
      buildAllianceMaps(FALLBACK_ALLIANCES);
      return;
    }

    let knownAlliances = [];
    try {
      if (typeof helper.loadAlliances === "function") await helper.loadAlliances();
      if (typeof helper.getKnownAlliances === "function") knownAlliances = helper.getKnownAlliances();
    } catch (e) {
      console.warn("Impossible de charger les métadonnées d'alliance communes", e);
    }

    buildAllianceMaps(knownAlliances);
  }

  function allianceKey(value) {
    const helper = window.LoSPAlliances;
    const helperKey = typeof helper?.getAllianceKey === "function" ? helper.getAllianceKey(value) : "";
    const key = normalizeAllianceAlias(helperKey || value);

    if (ALLIANCE_ALIAS_TO_KEY.has(key)) {
      return ALLIANCE_ALIAS_TO_KEY.get(key);
    }

    return key;
  }

  function getAllianceMeta(value) {
    return ALLIANCE_BY_KEY.get(allianceKey(value)) || null;
  }

  function getAllianceEmoji(value) {
    return getAllianceMeta(value)?.emoji || "•";
  }

  function getAllianceName(value) {
    return getAllianceMeta(value)?.name || (value ?? "").toString().trim();
  }

  function getAllianceSortIndex(value) {
    const idx = ALLIANCE_ORDER_KEYS.indexOf(allianceKey(value));
    return idx === -1 ? 999 : idx;
  }

  // -------- Canon / variants handling --------
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

  function findCharacterInfo(name) {
    const raw = (name ?? "").toString().trim();
    if (!raw) return null;

    const key = normalizeKey(raw);
    if (!key) return null;

    const list = CHAR_MULTI.get(key);
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

    return CHAR_MAP.get(key) || null;
  }

  function getIsoIconUrl(isoClass, isoColor) {
    const cls = normalizeIsoClass(isoClass);
    const col = normalizeIsoColor(isoColor);
    return ISO_ICONS?.[cls]?.[col] || null;
  }

  /**
   * opts:
   * - status: "warn" | "ok" | ""  (badge emoji + halo)
   * - statusTitle: string
   */
  function buildPortraitCard(charName, isoClass, isoColor, opts = {}) {
    const info = findCharacterInfo(charName);

    const card = document.createElement("div");
    card.className = "portraitCard";

    if (opts.status === "warn") card.classList.add("hasIsoWarn");
    if (opts.status === "ok") card.classList.add("hasIsoOk");

    // ✅/⚠️ au-dessus
    if (opts.status === "warn" || opts.status === "ok") {
      const st = document.createElement("div");
      st.className = "isoStatus";
      st.textContent = opts.status === "ok" ? "✅" : "⚠️";
      if (opts.statusTitle) st.title = opts.statusTitle;
      st.setAttribute(
        "aria-label",
        opts.status === "ok" ? "ISO conforme" : "ISO différent"
      );
      card.appendChild(st);
    }

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

  // -------- Mode / Team --------
  function getSelectedMode() {
    return (modeSelect?.value || "").trim();
  }

  function getTeamListFilteredByMode() {
    const m = getSelectedMode();
    if (!m) return [];
    return TEAMS.filter((t) => (t.mode || "").trim() === m);
  }

  function getSelectedTeamObj() {
    const teamName = (teamSelect?.value || "").trim();
    if (!teamName) return null;
    const list = getTeamListFilteredByMode();
    return list.find((t) => (t.team || "").trim() === teamName) || null;
  }

  // -------- Alliance / player --------
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

  // -------- Rendering selects --------
  function renderModeOptions() {
    const modes = Array.from(
      new Set(TEAMS.map((t) => (t.mode || "").trim()).filter(Boolean))
    );

    // ✅ Tri selon MODE_ORDER, puis fallback alphabétique
    modes.sort((a, b) => {
      const ia = MODE_ORDER.indexOf(a);
      const ib = MODE_ORDER.indexOf(b);

      if (ia !== -1 || ib !== -1) {
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      }
      return a.localeCompare(b, "fr");
    });

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
    const selectedMode = getSelectedMode();
    teamSelect.innerHTML = "";

    const opt0 = document.createElement("option");
    opt0.value = "";

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

    const alliances = ALLIANCES.map((alliance) => ({
      key: alliance.key,
      raw: alliance.key,
      name: getAllianceName(alliance.key) || alliance.name,
      emoji: getAllianceEmoji(alliance.key),
      order: getAllianceSortIndex(alliance.key),
    }));

    alliances
      .sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.name.localeCompare(b.name, "fr");
      })
      .forEach((a) => {
        const opt = document.createElement("option");
        opt.value = a.key;
        opt.textContent = `${a.emoji || "•"} ${a.name || a.raw}`.trim();
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

    const list = (PLAYERS_BY_ALLIANCE.get(allianceKey(alliance)) || [])
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

  // -------- Rendering blocks --------
  function renderRecoBlock() {
    clearNode(recoWrap);

    const team = getSelectedTeamObj();
    if (!team) return;

    (team.characters || []).forEach((charName) => {
      const info = findCharacterInfo(charName);
      const key1 = normalizeKey(
        info?.id || info?.nameKey || info?.nameEn || info?.nameFr || charName
      );
      const key2 = normalizeKey(charName);

      const reco = ISO_RECO_MAP.get(key1) || ISO_RECO_MAP.get(key2) || null;

      recoWrap.appendChild(
        buildPortraitCard(charName, reco?.isoClass || "", reco?.isoColor || "")
      );
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
      const key1 = normalizeKey(
        info?.id || info?.nameKey || info?.nameEn || info?.nameFr || charName
      );
      const key2 = normalizeKey(charName);

      const picked = isoByChar[key1] || isoByChar[key2] || null;
      const reco = ISO_RECO_MAP.get(key1) || ISO_RECO_MAP.get(key2) || null;

      const pickedCls = normalizeIsoClass(picked?.isoClass || "");
      const pickedCol = normalizeIsoColor(picked?.isoColor || "");
      const recoCls = normalizeIsoClass(reco?.isoClass || "");
      const recoCol = normalizeIsoColor(reco?.isoColor || "");

      const hasReco = !!recoCls;
      const hasPicked = !!pickedCls;

      let status = "";
      let statusTitle = "";

      if (hasReco) {
        const isMatch = hasPicked && pickedCls === recoCls && pickedCol === recoCol;

        if (isMatch) {
          status = "ok";
          statusTitle = `Reco: ${prettyIsoClass(recoCls)} ${prettyIsoColor(
            recoCol
          )}\nJoueur: ${prettyIsoClass(pickedCls)} ${prettyIsoColor(pickedCol)}`;
        } else {
          status = "warn";
          statusTitle = `Reco: ${prettyIsoClass(recoCls)} ${prettyIsoColor(
            recoCol
          )}\nJoueur: ${
            hasPicked
              ? `${prettyIsoClass(pickedCls)} ${prettyIsoColor(pickedCol)}`
              : "—"
          }`;
        }
      }

      playerWrap.appendChild(
        buildPortraitCard(
          charName,
          picked?.isoClass || "",
          picked?.isoColor || "",
          status ? { status, statusTitle } : {}
        )
      );
    });
  }

  function renderAll() {
    renderRecoBlock();
    renderPlayerBlock();
  }

  // -------- Maps --------
  function buildPlayersByAlliance() {
    PLAYERS_BY_ALLIANCE = new Map();

    for (const j of JOUEURS) {
      const a = (j.alliance || "").trim();
      const key = allianceKey(a);

      if (!a || !key) continue;
      if (!PLAYERS_BY_ALLIANCE.has(key)) PLAYERS_BY_ALLIANCE.set(key, []);
      PLAYERS_BY_ALLIANCE.get(key).push(j);
    }
  }

  function resolveToCanonKey(rawName) {
    const raw = (rawName || "").toString().trim();
    if (!raw) return null;

    const info = findCharacterInfo(raw);
    if (info) {
      const k = normalizeKey(info.id || info.nameKey || info.nameEn || info.nameFr || raw);
      if (k && CANON_SET.has(k)) return k;
      return k || null;
    }

    const k0 = normalizeKey(raw);
    if (!k0) return null;
    if (CANON_SET.has(k0)) return k0;

    let best = null;
    for (const ck of CANON_KEYS) {
      if (ck.startsWith(k0) || k0.startsWith(ck)) {
        if (!best || ck.length < best.length) best = ck;
      }
    }
    if (best) return best;

    for (const ck of CANON_KEYS) {
      if (ck.includes(k0) || k0.includes(ck)) return ck;
    }

    return null;
  }

  function buildIsoRecoMap(isoRecoRaw) {
    ISO_RECO_MAP = new Map();

    if (Array.isArray(isoRecoRaw)) {
      (isoRecoRaw || []).forEach((r) => {
        const characterRaw = (r.character ?? r.Character ?? "").toString().trim();
        if (!characterRaw) return;

        const cls = normalizeIsoClass(
          r["ISO-reco-class"] ?? r.isoRecoClass ?? r.iso_reco_class ?? r.recoClass
        );
        const col = normalizeIsoColor(
          r["ISO-reco-matrix"] ?? r.isoRecoMatrix ?? r.iso_reco_matrix ?? r.recoMatrix
        );

        const canonKey = resolveToCanonKey(characterRaw);
        if (!canonKey) return;

        ISO_RECO_MAP.set(canonKey, { isoClass: cls, isoColor: col });
      });
      return;
    }

    const byChar = isoRecoRaw?.byCharacter;
    if (!byChar || typeof byChar !== "object") return;

    for (const [charKeyRaw, v] of Object.entries(byChar)) {
      const canonKey = resolveToCanonKey(charKeyRaw);
      if (!canonKey) continue;

      const cls = normalizeIsoClass(v?.isoRecoClass ?? v?.isoClass ?? v?.class);
      const col = normalizeIsoColor(v?.isoRecoMatrix ?? v?.isoColor ?? v?.matrix);

      ISO_RECO_MAP.set(canonKey, { isoClass: cls, isoColor: col });
    }
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
        const keys = new Set([...Object.keys(clsMap || {}), ...Object.keys(colMap || {})]);
        keys.forEach((k) => {
          const ck = normalizeKey(k);
          if (!ck) return;
          out[ck] = {
            isoClass: normalizeIsoClass(clsMap?.[k]),
            isoColor: normalizeIsoColor(colMap?.[k]),
          };
        });
      }

      ROSTER_ISO_MAP.set(pKey, out);
    });
  }

  // -------- Events --------
  function onModeChange() {
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
    const [teamsRaw, charsRaw, joueursRaw, rostersRaw, isoRecoRaw, isoIconsRaw] =
      await Promise.all([
        fetchJson(FILES.teams),
        fetchJson(FILES.characters),
        fetchJson(FILES.joueurs),
        fetchJson(FILES.rosters),
        fetchJson(FILES.isoReco).catch(() => ({})),
        fetchJson(FILES.isoIcons).catch(() => ({})),
      ]);

    await loadAllianceMetadata();

    CHARS = Array.isArray(charsRaw) ? charsRaw : [];

    CHAR_MAP = new Map();
    CHAR_MULTI = new Map();
    CANON_KEYS = [];
    CANON_SET = new Set();

    CHARS.forEach((c) => {
      const keys = [c.id, c.nameKey, c.nameFr, c.nameEn].filter(Boolean);
      keys.forEach((k) => {
        const kk = normalizeKey(k);
        if (!kk) return;

        if (!CHAR_MULTI.has(kk)) CHAR_MULTI.set(kk, []);
        CHAR_MULTI.get(kk).push(c);

        const existing = CHAR_MAP.get(kk);
        if (!existing) {
          CHAR_MAP.set(kk, c);
        } else {
          const scNew = scoreCharacterMatch(c, kk);
          const scOld = scoreCharacterMatch(existing, kk);
          if (scNew > scOld) CHAR_MAP.set(kk, c);
        }
      });

      const canon = normalizeKey(c.id || c.nameKey || c.nameEn || c.nameFr);
      if (canon && !CANON_SET.has(canon)) {
        CANON_SET.add(canon);
        CANON_KEYS.push(canon);
      }
    });

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

    JOUEURS = (joueursRaw || [])
      .map((r) => ({
        player: (r.player ?? r.joueur ?? r.JOUEURS ?? "").toString().trim(),
        alliance: (r.alliance ?? r.ALLIANCES ?? "").toString().trim(),
      }))
      .filter((r) => r.player);

    buildPlayersByAlliance();

    ISO_ICONS = isoIconsRaw && typeof isoIconsRaw === "object" ? isoIconsRaw : {};
    buildIsoRecoMap(isoRecoRaw);

    ROSTERS = Array.isArray(rostersRaw) ? rostersRaw : [];
    buildRosterIsoMap(ROSTERS);

    renderAllianceOptions();
    renderPlayerOptions();
    renderModeOptions();
    renderTeamOptions();

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
