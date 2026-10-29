// docs/app.js
(() => {
  const FILES = {
    teams: "./data/teams.json",
    characters: "./data/msf-characters.json",
    joueurs: "./data/joueurs.json",
    rosters: "./data/rosters.json",
    isoIcons: "./data/iso-icons.json",
  };

  const FALLBACK_ALLIANCES = Object.freeze([
    { key: "zeus", name: "Zeus", emoji: "⚡️", color: "#F8FF00", order: 1 },
    { key: "athena", name: "Athéna", emoji: "🦉", color: "#F28C28", order: 2 },
    { key: "kronos", name: "Kronos", emoji: "⏳", color: "#E10D17", order: 3 },
    { key: "dionysos", name: "Dionysos", emoji: "🍇", color: "#93328E", order: 4 },
    { key: "poseidon", name: "Poséidon", emoji: "🔱", color: "#0000FF", order: 5 },
    { key: "hades", name: "Hadès", emoji: "🔥", color: "#1EA164", order: 6 },
  ]);

  const MODE_ORDER = [
    "Arène",
    "Raids",
    "Guerre",
    "Epreuve",
    "Battleworld",
    "Divers hors méta",
  ];

  const THRESH = {
    level: 100,
    gear: 19,
    iso: 13,
  };

  const ABILITY_TYPES = Object.freeze([
    { key: "basic", label: "Basique" },
    { key: "special", label: "Spécial" },
    { key: "ultimate", label: "Ultime" },
    { key: "passive", label: "Passif" },
  ]);

  // Official /game/v1 materials, verified against the LoSP R2 audit (29 Oct 2026).
  const ABILITY_MATERIAL_ICONS = Object.freeze({
    T1: "https://assets.marvelstrikeforce.com/imgs/ICON_ABILITY_MATERIAL_GREEN_ABILITY_MAT_b4780c94.png",
    T2: "https://assets.marvelstrikeforce.com/imgs/ICON_ABILITY_MATERIAL_BLUE_ABILITY_MAT_66eb7f9d.png",
    T3: "https://assets.marvelstrikeforce.com/imgs/ICON_ABILITY_MATERIAL_PURPLE_ABILITY_MAT_2250890d.png",
    T4: "https://assets.marvelstrikeforce.com/imgs/ICON_ABILITY_MATERIAL_ORANGE_ABILITY_MAT_bb60fc90.png",
  });
  // Material used to reach each level; awakened levels are character-specific.
  const ABILITY_MATERIAL_TIERS = Object.freeze({
    basic: [null, null, "T1", "T1", "T2", "T2", "T3", "T4"],
    special: [null, null, "T1", "T2", "T2", "T3", "T3", "T4"],
    ultimate: [null, null, "T1", "T2", "T2", "T3", "T3", "T4"],
    passive: [null, null, "T2", "T3", "T3", "T4"],
  });
  const AWAKENED_MATERIALS_URL =
    "https://losp-roster-service.deliriousfan7.workers.dev/api/public/awakened-materials";
  let awakenedMaterialsPromise = null;

  const qs = (s) => document.querySelector(s);

  const modeSelect = qs("#modeSelect");
  const teamSelect = qs("#teamSelect");

  const teamTitle = qs("#teamTitle");
  const portraitsWrap = qs("#portraits");

  const playersWrap = qs("#players");
  const playersCount = qs("#playersCount");

  const filtersWrap = qs("#allianceFilters");

  let TEAMS = [];
  let CHARS = [];
  let CHAR_MAP = new Map();
  let CHAR_MULTI = new Map();

  let JOUEURS = [];
  let ROSTERS = [];
  let ROSTER_MAP = new Map();
  let ROSTER_ISO_MAP = new Map();
  let ISO_ICONS = {};
  let detailOverlay = null;
  let detailReturnFocus = null;
  let detailPreviousOverflow = "";
  let abilityManifestPromise = null;
  const abilityReferenceCache = new Map();

  const bust = (url) => {
    const u = new URL(url, window.location.href);
    u.searchParams.set("v", Date.now().toString());
    return u.toString();
  };

  async function fetchJson(url) {
    const res = await fetch(bust(url), { cache: "no-store" });

    if (!res.ok) {
      throw new Error(`${url} -> HTTP ${res.status}`);
    }

    return res.json();
  }

  function normalizeKey(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[-_‐-‒–—―﹘﹣－]/g, "")
      .replace(/[’'`´]/g, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function normalizePlayerKey(value) {
    return normalizeKey(value).replace(/[^a-z0-9]/g, "");
  }

  function allianceHelper() {
    return window.LoSPAlliances || null;
  }

  function getKnownAlliances() {
    const helper = allianceHelper();

    if (helper?.getKnownAlliances) {
      const alliances = helper.getKnownAlliances();

      if (Array.isArray(alliances) && alliances.length) return alliances;
    }

    return FALLBACK_ALLIANCES;
  }

  function allianceKey(value) {
    const helper = allianceHelper();

    if (helper?.getAllianceKey) return helper.getAllianceKey(value);

    const key = normalizeKey(value);

    if (key.includes("zeus")) return "zeus";
    if (key.includes("athena")) return "athena";
    if (key.includes("dionysos")) return "dionysos";
    if (key.includes("hades")) return "hades";
    if (key.includes("poseidon") || key.includes("posseidon")) return "poseidon";

    if (
      key.includes("kronos") ||
      key.includes("cronos") ||
      key.includes("chronos") ||
      key.includes("lospkronos")
    ) {
      return "kronos";
    }

    return "";
  }

  function allianceEmoji(value) {
    const helper = allianceHelper();

    if (helper?.getAllianceEmoji) return helper.getAllianceEmoji(value);

    return FALLBACK_ALLIANCES.find((a) => a.key === value)?.emoji || "•";
  }

  function allianceLabel(value) {
    const helper = allianceHelper();

    if (helper?.getAllianceLabel) return helper.getAllianceLabel(value);

    return FALLBACK_ALLIANCES.find((a) => a.key === value)?.name || "Alliance";
  }

  function clearNode(el) {
    if (!el) return;

    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
  }

  function formatThousandsDot(n) {
    const num = Number(n);

    if (!Number.isFinite(num)) return "0";

    return Math.trunc(num)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function getSelectedAlliances() {
    const selected = {};

    filtersWrap
      ?.querySelectorAll('input[type="checkbox"][data-alliance]')
      .forEach((input) => {
        selected[input.dataset.alliance] = input.checked;
      });

    return selected;
  }

  function renderAllianceFilters() {
    if (!filtersWrap) return;

    clearNode(filtersWrap);

    getKnownAlliances().forEach((alliance) => {
      const key = allianceKey(alliance.key);

      if (!key) return;

      const label = document.createElement("label");
      label.className = "filterToggle";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = true;
      input.dataset.alliance = key;

      const stack = document.createElement("span");
      stack.className = "fStack";

      const emoji = document.createElement("span");
      emoji.className = "fEmoji";
      emoji.textContent = allianceEmoji(key);

      const name = document.createElement("span");
      name.className = "fName";
      name.textContent = allianceLabel(key);

      stack.appendChild(emoji);
      stack.appendChild(name);
      label.appendChild(input);
      label.appendChild(stack);
      filtersWrap.appendChild(label);
    });
  }

  function getSelectedMode() {
    return String(modeSelect?.value || "").trim();
  }

  function getTeamListFilteredByMode() {
    const selectedMode = getSelectedMode();

    if (!selectedMode) return [];

    return TEAMS.filter((t) => String(t.mode || "").trim() === selectedMode);
  }

  function renderModeOptions() {
    if (!modeSelect) return;

    const modes = Array.from(
      new Set(TEAMS.map((t) => String(t.mode || "").trim()).filter(Boolean))
    );

    modes.sort((a, b) => {
      const ia = MODE_ORDER.indexOf(a);
      const ib = MODE_ORDER.indexOf(b);

      if (ia !== -1 || ib !== -1) {
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      }

      return a.localeCompare(b, "fr", { sensitivity: "base" });
    });

    modeSelect.innerHTML = "";

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "— Choisir un mode de jeu —";
    modeSelect.appendChild(opt0);

    modes.forEach((mode) => {
      const opt = document.createElement("option");
      opt.value = mode;
      opt.textContent = mode;
      modeSelect.appendChild(opt);
    });

    modeSelect.value = "";
  }

  function renderTeamOptions() {
    if (!teamSelect) return;

    const list = getTeamListFilteredByMode()
      .slice()
      .sort((a, b) =>
        String(a.team || "").localeCompare(String(b.team || ""), "fr", {
          sensitivity: "base",
        })
      );

    teamSelect.innerHTML = "";

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "— Choisir une équipe —";
    teamSelect.appendChild(opt0);

    list.forEach((teamObj) => {
      const opt = document.createElement("option");
      opt.value = teamObj.team;
      opt.textContent = teamObj.team;
      teamSelect.appendChild(opt);
    });

    teamSelect.value = "";
  }

  function isVariantId(id) {
    const s = String(id ?? "");

    if (!s) return false;

    return /(_props|_bbminn|_npc|_event|_raid|_trial|_campaign|_boss)$/i.test(s);
  }

  function scoreCharacterMatch(c, queryKey) {
    const id = String(c?.id ?? "");
    const nameKey = String(c?.nameKey ?? "");

    const idKey = normalizeKey(id);
    const nameKeyKey = normalizeKey(nameKey);

    let score = 0;

    if (idKey && idKey === queryKey) score += 1000;
    if (nameKeyKey && nameKeyKey === queryKey) score += 900;

    if (isVariantId(id)) score -= 200;
    if (id && id.length <= 18) score += 10;

    return score;
  }

  function findPortraitFor(name) {
    const raw = String(name ?? "").trim();

    if (!raw) return null;

    const key = normalizeKey(raw);

    if (!key) return null;

    const list = CHAR_MULTI.get(key);

    if (Array.isArray(list) && list.length) {
      let best = list[0];
      let bestScore = -Infinity;

      for (const c of list) {
        const score = scoreCharacterMatch(c, key);

        if (score > bestScore) {
          bestScore = score;
          best = c;
        }
      }

      return best || null;
    }

    return CHAR_MAP.get(key) || null;
  }

  function renderSelectedTeam(teamName) {
    clearNode(portraitsWrap);

    if (teamTitle) {
      teamTitle.textContent = teamName || "—";
    }

    if (!teamName) return;

    const teamsFiltered = getTeamListFilteredByMode();
    const teamObj = teamsFiltered.find((t) => t.team === teamName);

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

  function readCharPower(val) {
    if (val == null) return 0;

    if (typeof val === "number") {
      return Number.isFinite(val) ? val : 0;
    }

    if (typeof val === "string") {
      const n = Number(val);
      return Number.isFinite(n) ? n : 0;
    }

    if (typeof val === "object") {
      const n = Number(val.power);
      return Number.isFinite(n) ? n : 0;
    }

    return 0;
  }

  function readCharLevel(val) {
    if (!val || typeof val !== "object") return 0;

    const n = Number(val.level);
    return Number.isFinite(n) ? n : 0;
  }

  function readCharGear(val) {
    if (!val || typeof val !== "object") return 0;

    const n = Number(val.gear);
    return Number.isFinite(n) ? n : 0;
  }

  function readCharIsoMax(val) {
    if (!val || typeof val !== "object") return 0;

    const n = Number(val.isoMax);
    return Number.isFinite(n) ? n : 0;
  }

  function buildBarTooltip(charName, present, level, gear, isoMax) {
    if (!present) return `${charName}\n❌ Non débloqué`;

    const okLevel = level >= THRESH.level;
    const okGear = gear >= THRESH.gear;
    const okIso = isoMax >= THRESH.iso;

    return [
      charName,
      `${okLevel ? "✅" : "⚠️"} Level : ${level || "—"} (≥ ${THRESH.level})`,
      `${okGear ? "✅" : "⚠️"} Gear  : ${gear || "—"} (≥ ${THRESH.gear})`,
      `${okIso ? "✅" : "⚠️"} ${getIsoDetail({ isoMax }, null).text} (objectif : ${getIsoDetail({ isoMax: THRESH.iso }, null).text})`,
    ].join("\n");
  }

  function getRosterValueForCharacter(charsMap, charName) {
    if (!charsMap) return null;

    const info = findPortraitFor(charName);

    const candidateKeys = [
      charName,
      info?.id,
      info?.nameKey,
      info?.nameEn,
      info?.nameFr,
    ]
      .map(normalizeKey)
      .filter(Boolean);

    for (const key of candidateKeys) {
      if (charsMap[key] != null) {
        return charsMap[key];
      }
    }

    return null;
  }

  function computeTeamStatsForPlayer(playerName, teamName) {
    const playerK = normalizePlayerKey(playerName);
    const charsMap = ROSTER_MAP.get(playerK) || null;

    if (!charsMap) return { sum: 0, bars: [] };

    const teamsFiltered = getTeamListFilteredByMode();
    const teamObj = teamsFiltered.find((t) => t.team === teamName);

    if (!teamObj) return { sum: 0, bars: [] };

    let sum = 0;
    const bars = [];

    for (const charName of teamObj.characters || []) {
      const raw = getRosterValueForCharacter(charsMap, charName);

      const present = raw !== undefined && raw !== null;
      const power = readCharPower(raw);

      if (present && Number.isFinite(power)) {
        sum += power;
      }

      const level = readCharLevel(raw);
      const gear = readCharGear(raw);
      const isoMax = readCharIsoMax(raw);

      let status = "red";

      if (present) {
        const ok = level >= THRESH.level && gear >= THRESH.gear && isoMax >= THRESH.iso;
        status = ok ? "green" : "orange";
      }

      const tip = buildBarTooltip(charName, present, level, gear, isoMax);
      bars.push({ status, tip });
    }

    return { sum, bars };
  }


  // Individual data is read from the same roster used to calculate ranking powers.
  // Missing fields are unknown (never reconstructed from the total power).
  function readOptionalStat(raw, field) {
    if (!raw || typeof raw !== "object" || raw[field] === null ||
        raw[field] === undefined || raw[field] === "") return null;
    const n = Number(raw[field]);
    return Number.isSafeInteger(n) && n >= 0 ? n : null;
  }

  const ISO_CLASS_LABELS = {
    striker: "Attaquant",
    raider: "Fantassin",
    skirmisher: "Tirailleur",
    healer: "Soigneur",
    fortifier: "Fortificateur",
  };

  const ISO_COLOR_LABELS = {
    green: "Vert", blue: "Bleu", purple: "Violet", orange: "Orange",
  };

  function getIsoDetail(raw, isoRow) {
    const max = readOptionalStat(raw, "isoMax");
    const source = isoRow && typeof isoRow === "object" ? isoRow : {};
    const cls = String(source.isoClass ?? raw?.isoClass ?? "").trim().toLowerCase();
    const rawColor = String(source.isoColor ?? raw?.isoColor ?? "")
      .trim().toLowerCase();
    const colors = { vert: "green", bleu: "blue", violet: "purple" };
    // Numeric ISO progress is authoritative; the stored color is a fallback.
    let color = colors[rawColor] || rawColor;
    let tier = null;
    if (max !== null && max >= 1 && max <= 18) {
      color = max <= 5 ? "green" : max <= 10 ? "blue" :
        max <= 15 ? "purple" : "orange";
      tier = max <= 5 ? max : max <= 10 ? max - 5 :
        max <= 15 ? max - 10 : max - 15;
    }
    const role = ISO_CLASS_LABELS[cls] || (cls || "");
    const icon = ISO_ICONS?.[cls]?.[color] || "";
    const progress = tier === null ? (ISO_COLOR_LABELS[color] || "") :
      `${ISO_COLOR_LABELS[color] || color} ${tier}`;
    const label = [progress.toLowerCase(), role].filter(Boolean).join(" - ");
    return {
      max, role, color, icon,
      text: label ? `ISO ${label}` : "ISO non renseigné",
    };
  }

  function detailNode(tag, className, textContent) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (textContent !== undefined) node.textContent = textContent;
    return node;
  }

  function detailStat(label, value, kind) {
    const node = detailNode("div", "rankDetailStat");
    node.appendChild(detailNode("span", "rankDetailStatLabel", label));
    node.appendChild(detailNode("span",
      `rankDetailStatValue${kind ? ` is-${kind}` : ""}`, value));
    return node;
  }


  // Fetch official maxima and icon URLs only when the player opens a detail.
  // Some characters have no published reference: never assume 7/7/7/5.
  async function getAbilityReferences(charId) {
    if (!/^[A-Za-z0-9_-]+$/.test(String(charId ?? ""))) return {};
    if (!abilityManifestPromise) {
      abilityManifestPromise = fetchJson("./data/msf-capabilities-explorer/manifest.json")
        .catch(() => null);
    }
    if (!abilityReferenceCache.has(charId)) {
      const promise = (async () => {
        const manifest = await abilityManifestPromise;
        const folder = String(manifest?.currentPath ?? "");
        if (!/^generations\/sha256-[a-f0-9]{64}\/$/.test(folder)) return {};
        const url = "./data/msf-capabilities-explorer/" + folder +
          "characters/" + encodeURIComponent(charId) + ".json";
        const shard = await fetchJson(url);
        if (shard?.character?.id !== charId || !Array.isArray(shard.abilities)) return {};
        const details = {};
        for (const ability of shard.abilities) {
          const key = ability?.baseType;
          if (!ABILITY_TYPES.some(item => item.key === key) ||
              ability.isEmpowered) continue;
          const rawMax = ability.maxLevel;
          const n = rawMax === null || rawMax === undefined ||
            rawMax === "" ? null : Number(rawMax);
          const max = Number.isSafeInteger(n) && n > 0 && n <= 20 ? n : null;
          const iconUrl = typeof ability.iconUrl === "string" &&
            /^https:\/\/assets\.marvelstrikeforce\.com\/imgs\/[A-Za-z0-9_./%-]+\.(?:png|webp|jpg|jpeg)$/.test(ability.iconUrl)
            ? ability.iconUrl : null;
          details[key] = { max, iconUrl };
        }
        return details;
      })().catch(() => ({}));
      abilityReferenceCache.set(charId, promise);
    }
    return abilityReferenceCache.get(charId);
  }

  function getAbilityMaterialTier(type, level) {
    return ABILITY_MATERIAL_TIERS[type]?.[level] || null;
  }

  function isAwakenedAbilityLevel(type, level) {
    return type === "passive" ? level === 6 :
      ["basic", "special", "ultimate"].includes(type) && level === 8;
  }

  function abilityMaterialImage(url, label) {
    // Only known official image URLs are accepted; never synthesize a CDN path.
    if (typeof url !== "string" ||
        !/^https:\/\/assets\.marvelstrikeforce\.com\/(?:imgs|key_art)\/[A-Za-z0-9_./%-]+\.(?:png|webp|jpg|jpeg)$/i.test(url)) return null;
    const icon = detailNode("img", "rankDetailAbilityMaterial");
    icon.src = url;
    icon.alt = label;
    icon.title = label;
    icon.loading = "lazy";
    icon.decoding = "async";
    icon.referrerPolicy = "no-referrer";
    return icon;
  }

  async function getAwakenedAbilityMaterials() {
    if (!awakenedMaterialsPromise) {
      awakenedMaterialsPromise = fetchJson(AWAKENED_MATERIALS_URL).then(data => {
        if (data?.schemaVersion !== 1 || data.status !== "ok" ||
            !Array.isArray(data.materials)) throw new Error("Catalogue d'éveil invalide");
        return data.materials;
      }).catch(() => {
        // Optional decoration: never break the roster when the catalog is down.
        awakenedMaterialsPromise = null;
        return [];
      });
    }
    return awakenedMaterialsPromise;
  }

  function detailAbilities(raw, charId) {
    const grid = detailNode("div", "rankDetailAbilities");
    grid.setAttribute("role", "group");
    grid.setAttribute("aria-label", "Niveaux des capacités");
    const items = new Map();
    let hasLevel = false;

    for (const { key, label } of ABILITY_TYPES) {
      const value = raw?.abilities?.[key];
      const level = Number.isSafeInteger(value) && value >= 0 ? value : null;
      if (level !== null) hasLevel = true;

      const tile = detailNode("div", "rankDetailAbility");
      const iconSlot = detailNode("span", "rankDetailAbilityIcon");
      iconSlot.setAttribute("aria-hidden", "true");
      const iconRow = detailNode("div", "rankDetailAbilityIcons");
      iconRow.appendChild(iconSlot);
      const tier = getAbilityMaterialTier(key, level);
      if (tier) {
        const material = abilityMaterialImage(ABILITY_MATERIAL_ICONS[tier],
          "Matériau de capacité " + tier);
        if (material) iconRow.appendChild(material);
      }
      const name = detailNode("span", "rankDetailAbilityName", label);
      const levels = detailNode("div", "rankDetailAbilityNumbers");
      levels.append(
        detailNode("strong", "rankDetailAbilityLevel",
          level === null ? "—" : String(level)),
        detailNode("span", "rankDetailAbilityMaximum", "/ —")
      );
      const maxText = levels.lastChild;
      const status = detailNode("span", "rankDetailAbilityStatus",
        level === null ? "Non renseigné" : "Niveau relevé");
      if (level === null) tile.classList.add("is-unknown");
      tile.append(iconRow, name, levels, status);
      grid.appendChild(tile);
      items.set(key, { tile, iconSlot, iconRow, maxText, status, level });
    }

    const awakened = [...items].filter(([key, item]) =>
      isAwakenedAbilityLevel(key, item.level));
    if (awakened.length) {
      getAwakenedAbilityMaterials().then(materials => {
        if (!grid.isConnected) return;
        for (const [key, item] of awakened) {
          const match = materials.find(material =>
            String(material?.characterId || "").toLowerCase() ===
              String(charId).toLowerCase() &&
            String(material?.abilityType || "").toLowerCase() === key);
          const image = abilityMaterialImage(match?.iconUrl, "Matériau de capacité éveillée");
          if (image) item.iconRow.appendChild(image);
        }
      });
    }

    if (hasLevel) {
      getAbilityReferences(charId).then(references => {
        if (!grid.isConnected) return;
        for (const [key, item] of items) {
          const reference = references[key];
          if (reference?.iconUrl) {
            const icon = document.createElement("img");
            icon.src = reference.iconUrl;
            icon.alt = "";
            icon.loading = "lazy";
            icon.decoding = "async";
            icon.referrerPolicy = "no-referrer";
            item.iconSlot.appendChild(icon);
          }
          // An absent or outdated Codex maximum must not be shown as MAX.
          const max = reference?.max;
          if (item.level === null || !Number.isSafeInteger(max) ||
              max < item.level) continue;
          item.maxText.textContent = "/ " + max;
          const complete = item.level === max;
          item.status.textContent = complete ? "MAX" : "À améliorer";
          item.tile.classList.add(complete ? "is-max" : "is-upgrade");
        }
      });
    }
    return grid;
  }

  function closeDetail() {
    if (!detailOverlay) return;
    document.removeEventListener("keydown", onDetailKeydown);
    detailOverlay.remove();
    detailOverlay = null;
    document.body.style.overflow = detailPreviousOverflow;
    if (detailReturnFocus?.isConnected) detailReturnFocus.focus();
    detailReturnFocus = null;
  }

  function onDetailKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDetail();
    } else if (event.key === "Tab" && detailOverlay) {
      // Only the close button is interactive inside this dialog.
      event.preventDefault();
      detailOverlay.querySelector(".rankDetailClose")?.focus();
    }
  }

  function openPlayerDetail(player, teamName, rank, totalPower) {
    closeDetail();
    const team = getTeamListFilteredByMode().find(t => t.team === teamName);
    if (!team) return;

    const playerK = normalizePlayerKey(player.player);
    const charsMap = ROSTER_MAP.get(playerK) || null;
    const isoMap = ROSTER_ISO_MAP.get(playerK) || null;
    detailReturnFocus = document.activeElement;
    detailPreviousOverflow = document.body.style.overflow;

    const overlay = detailNode("div", "rankDetailOverlay");
    const dialog = detailNode("section", "rankDetailDialog");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "rankDetailTitle");
    dialog.setAttribute("aria-describedby", "rankDetailContext");

    const heading = detailNode("div", "rankDetailHeading");
    const headingText = detailNode("div", "rankDetailHeadingText");
    const title = detailNode("h2", "rankDetailTitle", player.player);
    title.id = "rankDetailTitle";
    const context = detailNode("p", "rankDetailContext",
      `${teamName} · ${allianceEmoji(player.allianceKey)} ${allianceLabel(player.allianceKey)} · #${rank}`);
    context.id = "rankDetailContext";
    headingText.append(title, context);

    const close = detailNode("button", "rankDetailClose", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Fermer les détails");
    close.addEventListener("click", closeDetail);
    heading.append(headingText, close);
    dialog.appendChild(heading);

    dialog.appendChild(detailNode("div", "rankDetailTotal",
      `Puissance de l'équipe : ${formatThousandsDot(totalPower)}`));

    const list = detailNode("div", "rankDetailCharacters");
    for (const charId of team.characters || []) {
      const raw = getRosterValueForCharacter(charsMap, charId);
      const isoRaw = getRosterValueForCharacter(isoMap, charId);
      const info = findPortraitFor(charId);
      const card = detailNode("article", "rankDetailCharacter");
      const portrait = detailNode("div", "rankDetailPortrait");
      if (info?.portraitUrl) {
        const img = document.createElement("img");
        img.src = info.portraitUrl;
        img.alt = charId;
        img.loading = "lazy";
        img.decoding = "async";
        img.referrerPolicy = "no-referrer";
        portrait.appendChild(img);
      } else {
        portrait.appendChild(detailNode("span", "", "?"));
      }
      card.appendChild(portrait);

      const body = detailNode("div", "rankDetailCharacterBody");
      const top = detailNode("div", "rankDetailCharacterTop");
      top.appendChild(detailNode("h3", "", info?.nameFr || info?.nameKey || info?.nameEn || charId));
      top.appendChild(detailNode("strong", "",
        raw === null ? "Absent du roster" :
        `${formatThousandsDot(readCharPower(raw))} pts`));
      body.appendChild(top);

      const stats = detailNode("div", "rankDetailStats");
      const val = (field, prefix = "", suffix = "") => {
        const n = readOptionalStat(raw, field);
        return n === null ? "—" : `${prefix}${n}${suffix}`;
      };
      stats.appendChild(detailStat("Niveau", val("level")));
      stats.appendChild(detailStat("Équipement", val("gear", "G")));
      stats.appendChild(detailStat("Étoiles jaunes", val("yellowStars", "", " ★"), "yellow"));
      stats.appendChild(detailStat("Étoiles rouges", val("redStars", "", " ★"), "red"));
      stats.appendChild(detailStat("Diamants", val("diamonds", "", " ◆"), "diamond"));
      body.appendChild(stats);

      const iso = getIsoDetail(raw, isoRaw);
      const isoBox = detailNode("div", "rankDetailIso");
      if (iso.icon) {
        const icon = document.createElement("img");
        icon.src = iso.icon;
        icon.alt = "";
        icon.loading = "lazy";
        icon.decoding = "async";
        icon.referrerPolicy = "no-referrer";
        isoBox.appendChild(icon);
      }
      isoBox.appendChild(detailNode("span", "", iso.text));
      body.appendChild(isoBox);
      card.appendChild(body);
      card.appendChild(detailAbilities(raw, info?.id || charId));
      list.appendChild(card);
    }
    if (!charsMap) list.prepend(detailNode("p", "rankDetailMissing",
      "Aucune donnée de roster disponible pour ce joueur."));
    dialog.appendChild(list);

    overlay.appendChild(dialog);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeDetail();
    });
    document.body.appendChild(overlay);
    detailOverlay = overlay;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onDetailKeydown);
    close.focus();
  }

  function renderRanking() {
    closeDetail();
    clearNode(playersWrap);

    const selectedMode = getSelectedMode();
    const teamName = String(teamSelect?.value || "").trim();

    if (!selectedMode || !teamName) {
      if (playersCount) playersCount.textContent = "0";
      return;
    }

    const allianceEnabled = getSelectedAlliances();

    const rows = JOUEURS
      .filter((p) => {
        const key = allianceKey(p.alliance);

        if (!key) return false;

        return allianceEnabled[key] === true;
      })
      .map((p) => {
        const stats = computeTeamStatsForPlayer(p.player, teamName);
        const key = allianceKey(p.alliance);

        return {
          ...p,
          allianceKey: key,
          power: stats.sum,
          bars: stats.bars,
        };
      })
      .sort((a, b) => {
        if (b.power !== a.power) return b.power - a.power;

        return String(a.player || "").localeCompare(String(b.player || ""), "fr", {
          sensitivity: "base",
        });
      });

    if (playersCount) {
      playersCount.textContent = String(rows.length);
    }

    const list = document.createElement("div");
    list.className = "rankList";

    rows.forEach((r, idx) => {
      const key = r.allianceKey || allianceKey(r.alliance);
      const emoji = allianceEmoji(key);
      const label = allianceLabel(key);

      const row = document.createElement("button");
      row.type = "button";
      row.className = "rankRow";
      row.setAttribute("aria-haspopup", "dialog");
      row.setAttribute("aria-label", `Voir ${teamName} de ${r.player}`);
      row.addEventListener("click", () => openPlayerDetail(r, teamName, idx + 1, r.power));

      const left = document.createElement("div");
      left.className = "rankLeft";

      const num = document.createElement("div");
      num.className = "rankNum";
      num.textContent = String(idx + 1);

      const name = document.createElement("div");
      name.className = "rankName";
      name.title = `${label} • ${r.player}`;
      name.textContent = `${emoji}${r.player}`;

      left.appendChild(num);
      left.appendChild(name);

      const bars = document.createElement("div");
      bars.className = "rankBars";

      const barsData = Array.isArray(r.bars) ? r.bars : [];

      for (let i = 0; i < 5; i++) {
        const b = barsData[i] || { status: "empty", tip: "—" };

        const bar = document.createElement("span");
        bar.className = `rankBar is-${b.status}`;
        bar.setAttribute("role", "img");
        bar.setAttribute("aria-label", b.tip || "—");
        bar.title = b.tip || "";
        bar.dataset.tip = b.tip || "";

        bars.appendChild(bar);
      }

      const power = document.createElement("div");
      power.className = "rankPower";
      power.textContent = formatThousandsDot(r.power);

      row.appendChild(left);
      row.appendChild(bars);
      row.appendChild(power);

      list.appendChild(row);
    });

    playersWrap.appendChild(list);
  }

  function onModeChange() {
    if (teamSelect) teamSelect.value = "";

    renderTeamOptions();
    renderSelectedTeam("");
    renderRanking();
  }

  function onTeamChange() {
    renderSelectedTeam(teamSelect.value || "");
    renderRanking();
  }

  async function boot() {
    if (allianceHelper()?.loadAlliances) {
      await allianceHelper().loadAlliances();
    }

    renderAllianceFilters();

    const [teamsRaw, charsRaw, joueursRaw, rostersRaw, isoIconsRaw] = await Promise.all([
      fetchJson(FILES.teams),
      fetchJson(FILES.characters),
      fetchJson(FILES.joueurs),
      fetchJson(FILES.rosters),
      fetchJson(FILES.isoIcons).catch(() => ({})),
    ]);
    ISO_ICONS = isoIconsRaw && typeof isoIconsRaw === "object" ? isoIconsRaw : {};

    CHARS = Array.isArray(charsRaw) ? charsRaw : [];

    CHAR_MAP = new Map();
    CHAR_MULTI = new Map();

    CHARS.forEach((c) => {
      const keys = [c.id, c.nameKey, c.nameFr, c.nameEn].filter(Boolean);

      keys.forEach((k) => {
        const kk = normalizeKey(k);

        if (!kk) return;

        if (!CHAR_MULTI.has(kk)) {
          CHAR_MULTI.set(kk, []);
        }

        CHAR_MULTI.get(kk).push(c);

        const existing = CHAR_MAP.get(kk);

        if (!existing) {
          CHAR_MAP.set(kk, c);
          return;
        }

        const scNew = scoreCharacterMatch(c, kk);
        const scOld = scoreCharacterMatch(existing, kk);

        if (scNew > scOld) {
          CHAR_MAP.set(kk, c);
        }
      });
    });

    TEAMS = (Array.isArray(teamsRaw) ? teamsRaw : [])
      .map((t) => {
        const team = String(t.team ?? t.Team ?? "").trim();
        const mode = String(t.mode ?? t.Mode ?? "").trim();

        const characters = Array.isArray(t.characters)
          ? t.characters.map((c) => String(c ?? "").trim()).filter(Boolean)
          : [];

        return { team, mode, characters };
      })
      .filter((t) => t.team);

    JOUEURS = (Array.isArray(joueursRaw) ? joueursRaw : [])
      .map((r) => {
        const player = String(r.player ?? r.joueur ?? r.JOUEURS ?? "").trim();
        const rawAlliance = String(r.alliance ?? r.ALLIANCES ?? "").trim();
        const key = allianceKey(rawAlliance);

        return {
          player,
          alliance: key,
          allianceRaw: rawAlliance,
        };
      })
      .filter((r) => r.player && r.alliance);

    ROSTERS = (Array.isArray(rostersRaw) ? rostersRaw : [])
      .map((r) => ({
        player: String(r.playerKey ?? r.player ?? "").trim(),
        chars: r.chars && typeof r.chars === "object" ? r.chars : {},
        iso: r.iso && typeof r.iso === "object" ? r.iso : {},
      }))
      .filter((r) => r.player);

    ROSTER_MAP = new Map();
    ROSTER_ISO_MAP = new Map();

    for (const r of ROSTERS) {
      const playerK = normalizePlayerKey(r.player);

      if (!playerK) continue;

      const normChars = {};

      for (const [k, v] of Object.entries(r.chars || {})) {
        const key = normalizeKey(k);

        if (!key) continue;

        normChars[key] = v;
      }

      ROSTER_MAP.set(playerK, normChars);
      const normIso = {};
      for (const [k, v] of Object.entries(r.iso || {})) {
        const key = normalizeKey(k);
        if (key) normIso[key] = v;
      }
      ROSTER_ISO_MAP.set(playerK, normIso);
    }

    renderModeOptions();
    renderTeamOptions();
    renderSelectedTeam("");
    renderRanking();
  }

  modeSelect?.addEventListener("change", onModeChange);
  teamSelect?.addEventListener("change", onTeamChange);

  filtersWrap?.addEventListener("change", (event) => {
    if (event.target?.matches('input[type="checkbox"][data-alliance]')) {
      renderRanking();
    }
  });

  boot().catch((e) => {
    console.error("[app] boot error:", e);
  });
})();
