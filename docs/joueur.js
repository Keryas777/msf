// /docs/joueur.js
(() => {
  const AUTH_PLAYER_STORAGE_KEY = "losp:joueur:lastSelection";
  const LOCAL_SESSION_KEY = "losp_session";

  const FILES = {
    infos: "./data/infos.json",
    joueurs: "./data/joueurs.json",
    rosters: "./data/rosters.json",
    teams: "./data/teams.json",
    characters: "./data/msf-characters.json",
    isoIcons: "./data/iso-icons.json",
    warHistory: "./data/war-history-lite.json",
    aliases: "./data/player-aliases.json",
  };

  const ALLIANCE_ORDER = ["zeus", "kronos", "dionysos", "poseidon"];

  const ALLIANCE_LABEL = {
    zeus: "Zeus",
    kronos: "Kronos",
    dionysos: "Dionysos",
    poseidon: "Poseidon",
  };

  const ALLIANCE_EMOJI = {
    zeus: "⚡️",
    kronos: "⏳",
    dionysos: "🍇",
    poseidon: "🔱",
  };

  const MODE_LABELS = {
    Raid: "Raid",
    Guerre: "Guerre",
    Epreuve: "Épreuve cosmique",
    Battleworld: "Battleworld",
  };

  const qs = (s) => document.querySelector(s);
  const qsa = (s) => Array.from(document.querySelectorAll(s));

  const allianceSelect = qs("#allianceSelect");
  const playerSelect = qs("#playerSelect");

  const playerAllianceEl = qs("#playerAlliance");
  const playerNameEl = qs("#playerName");
  const playerTcpEl = qs("#playerTcp");
  const playerWarMvpEl = qs("#playerWarMvp");
  const playerCharCountEl = qs("#playerCharCount");
  const playerWarScoreEl = qs("#playerWarScore");
  const playerWarScoreMetaEl = qs("#playerWarScoreMeta");

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
    warHistory: [],
    playerAliases: new Map(),

    charMap: new Map(),
    charMulti: new Map(),
    isoIcons: {},

    selectedAllianceKey: "",
    selectedPlayerKey: "",
    selectedMode: "",
  };

  let lospSession = window.LoSP_SESSION || null;
  let bootReady = false;
  let authDefaultsApplied = false;
  let userChangedSelection = false;

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

  function normalizeKey(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  function allianceKey(value) {
    const key = normalizeKey(value);

    if (key === "zeus") return "zeus";
    if (
      key === "kronos" ||
      key === "cronos" ||
      key === "chronos" ||
      key === "lospkronos"
    ) {
      return "kronos";
    }
    if (key === "dionysos") return "dionysos";
    if (key === "poseidon" || key === "posseidon") return "poseidon";

    return "";
  }

  function canonicalPlayerName(name) {
    let current = String(name ?? "").trim();

    if (!current) return "";

    for (let i = 0; i < 10; i++) {
      const next = state.playerAliases.get(normalizeKey(current));

      if (!next || String(next).trim() === current) {
        break;
      }

      current = String(next).trim();
    }

    return current;
  }

  function playerKey(name) {
    return normalizeKey(canonicalPlayerName(name));
  }

  function normalizeIsoClass(cls) {
    return String(cls ?? "").trim().toLowerCase();
  }

  function normalizeIsoColor(c) {
    const x = String(c ?? "").trim().toLowerCase();

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

    if (x >= 1000000) {
      return `${(x / 1000000).toLocaleString("fr-FR", {
        maximumFractionDigits: 1,
      })} M`;
    }

    if (x >= 1000) {
      return `${Math.round(x / 1000).toLocaleString("fr-FR")} k`;
    }

    return x.toLocaleString("fr-FR");
  }

  function formatScore(n) {
    const x = Number(n);

    if (!Number.isFinite(x)) return "—";

    return x.toLocaleString("fr-FR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  }

  function clearNode(el) {
    if (!el) return;

    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
  }

  function getParam(...names) {
    const params = new URLSearchParams(window.location.search);

    for (const name of names) {
      const v = params.get(name);
      if (v) return v.trim();
    }

    return "";
  }

  function hasExplicitUrlTarget() {
    const params = new URLSearchParams(window.location.search);

    return Boolean(
      params.get("player") ||
      params.get("playerKey") ||
      params.get("joueur") ||
      params.get("alliance")
    );
  }

  // ---------- Auth session ----------

  function decodeBase64UrlJson(value) {
    try {
      const base64 = String(value || "")
        .replace(/-/g, "+")
        .replace(/_/g, "/");

      const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
      const binary = atob(padded);

      const bytes = new Uint8Array(
        Array.from(binary).map((char) => char.charCodeAt(0))
      );

      return JSON.parse(new TextDecoder().decode(bytes));
    } catch (_) {
      return null;
    }
  }

  function readLocalSessionPayload() {
    try {
      const raw = localStorage.getItem(LOCAL_SESSION_KEY) || "";
      if (!raw) return null;

      const payload = decodeBase64UrlJson(raw);
      if (!payload) return null;

      return {
        ok: true,
        ...payload,
      };
    } catch (_) {
      return null;
    }
  }

  function refreshLoSPSession() {
    lospSession =
      window.LoSP_SESSION ||
      readLocalSessionPayload() ||
      lospSession ||
      null;

    return lospSession;
  }

  function hasUsableSession(session) {
    return !!session && (
      session.ok === true ||
      Array.isArray(session.alliances) ||
      Array.isArray(session.players) ||
      session.primaryAlliance ||
      session.displayName ||
      session.global_name ||
      session.username
    );
  }

  function getSessionAlliancePreferenceKeys(session) {
    if (!hasUsableSession(session)) return [];

    const keys = [];

    if (session.primaryAlliance) {
      keys.push(allianceKey(session.primaryAlliance));
    }

    if (Array.isArray(session.alliances)) {
      session.alliances.forEach((alliance) => {
        keys.push(allianceKey(alliance));
      });
    }

    if (Array.isArray(session.players)) {
      session.players.forEach((player) => {
        if (player?.alliance) keys.push(allianceKey(player.alliance));
        if (player?.alliance_label) keys.push(allianceKey(player.alliance_label));
      });
    }

    return [...new Set(keys.filter(Boolean))];
  }

  function namesFromSessionPlayer(player) {
    if (!player || typeof player !== "object") return [];

    return [
      player.name,
      player.player,
      player.playerName,
      player.player_name,
      player.pseudo,
      player.displayName,
      player.display_name,
      player.global_name,
      player.username,
      player.playerKey,
      player.player_key,
    ]
      .map((v) => String(v ?? "").trim())
      .filter(Boolean);
  }

  function getSessionPlayerCandidates(session) {
    if (!hasUsableSession(session)) return [];

    const names = [];

    if (Array.isArray(session.players)) {
      session.players.forEach((player) => {
        names.push(...namesFromSessionPlayer(player));
      });
    }

    names.push(
      session.displayName,
      session.display_name,
      session.global_name,
      session.username,
      session.name,
      session.player,
      session.playerName,
      session.playerKey
    );

    return [...new Set(names.map((v) => String(v ?? "").trim()).filter(Boolean))];
  }

  function findSessionPlayerInAlliance(allianceK, candidates) {
    if (!allianceK || !Array.isArray(candidates) || !candidates.length) {
      return null;
    }

    const wantedKeys = new Set();

    candidates.forEach((candidate) => {
      const raw = String(candidate ?? "").trim();
      if (!raw) return;

      wantedKeys.add(normalizeKey(raw));
      wantedKeys.add(playerKey(raw));
    });

    if (!wantedKeys.size) return null;

    const players = playersForAlliance(allianceK);

    return (
      players.find((p) => {
        return (
          wantedKeys.has(p.key) ||
          wantedKeys.has(normalizeKey(p.label)) ||
          wantedKeys.has(playerKey(p.label)) ||
          wantedKeys.has(normalizeKey(p.sortName)) ||
          wantedKeys.has(playerKey(p.sortName))
        );
      }) || null
    );
  }

  function applySessionDefaultSelection() {
    const session = refreshLoSPSession();

    if (!hasUsableSession(session)) return false;

    if (Array.isArray(session.players)) {
      for (const sessionPlayer of session.players) {
        const candidateAlliance =
          allianceKey(sessionPlayer?.alliance) ||
          allianceKey(sessionPlayer?.alliance_label);

        if (!candidateAlliance) continue;

        const found = findSessionPlayerInAlliance(
          candidateAlliance,
          namesFromSessionPlayer(sessionPlayer)
        );

        if (found) {
          state.selectedAllianceKey = candidateAlliance;
          state.selectedPlayerKey = found.key;
          return true;
        }
      }
    }

    const candidates = getSessionPlayerCandidates(session);
    const preferredAlliances = getSessionAlliancePreferenceKeys(session);

    for (const allianceK of preferredAlliances) {
      const found = findSessionPlayerInAlliance(allianceK, candidates);

      if (found) {
        state.selectedAllianceKey = allianceK;
        state.selectedPlayerKey = found.key;
        return true;
      }
    }

    const alliances = getAllianceOptions();

    for (const allianceK of alliances) {
      const found = findSessionPlayerInAlliance(allianceK, candidates);

      if (found) {
        state.selectedAllianceKey = allianceK;
        state.selectedPlayerKey = found.key;
        return true;
      }
    }

    return false;
  }

  function readStoredSelection() {
    try {
      return JSON.parse(localStorage.getItem(AUTH_PLAYER_STORAGE_KEY) || "{}") || {};
    } catch (_) {
      return {};
    }
  }

  function saveStoredSelection() {
    if (!state.selectedAllianceKey || !state.selectedPlayerKey) return;

    try {
      localStorage.setItem(
        AUTH_PLAYER_STORAGE_KEY,
        JSON.stringify({
          alliance: state.selectedAllianceKey,
          player: state.selectedPlayerKey,
        })
      );
    } catch (_) {}
  }

  function applyStoredSelection() {
    const stored = readStoredSelection();
    const allianceK = allianceKey(stored.alliance);
    const playerK = normalizeKey(stored.player);

    if (!allianceK || !playerK) return false;

    const players = playersForAlliance(allianceK);
    const found = players.find((p) => p.key === playerK);

    if (!found) return false;

    state.selectedAllianceKey = allianceK;
    state.selectedPlayerKey = found.key;

    return true;
  }

  // ---------- Characters ----------

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

  function buildCharacterMaps() {
    state.charMap = new Map();
    state.charMulti = new Map();

    state.chars.forEach((c) => {
      const keys = [c.id, c.nameKey, c.nameFr, c.nameEn].filter(Boolean);

      keys.forEach((k) => {
        const kk = normalizeKey(k);

        if (!kk) return;

        if (!state.charMulti.has(kk)) {
          state.charMulti.set(kk, []);
        }

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

  // ---------- Player keys ----------

  function getRosterPlayerKey(roster) {
    return normalizeKey(roster?.playerKey || roster?.player || roster?.name || "");
  }

  function getInfoPlayerKey(info) {
    return playerKey(info?.playerKey || info?.name || info?.player || "");
  }

  function getJoueurPlayerKey(joueur) {
    return playerKey(joueur?.playerKey || joueur?.player || joueur?.name || "");
  }

  function getSelectedRoster() {
    if (!state.selectedPlayerKey) return null;

    return (
      state.rosters.find((r) => getRosterPlayerKey(r) === state.selectedPlayerKey) ||
      null
    );
  }

  function getSelectedJoueur() {
    if (!state.selectedPlayerKey) return null;

    return (
      state.joueurs.find((j) => getJoueurPlayerKey(j) === state.selectedPlayerKey) ||
      null
    );
  }

  function getSelectedInfo() {
    if (!state.selectedPlayerKey) return null;

    return (
      state.infos.find((i) => getInfoPlayerKey(i) === state.selectedPlayerKey) ||
      null
    );
  }

  function findRosterByPlayerKey(key) {
    if (!key) return null;

    return state.rosters.find((r) => getRosterPlayerKey(r) === key) || null;
  }

  function findInfoByPlayerKey(key) {
    if (!key) return null;

    return state.infos.find((i) => getInfoPlayerKey(i) === key) || null;
  }

  function resolvePlayerKey(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return "";

    const candidates = new Set([normalizeKey(raw), playerKey(raw)].filter(Boolean));

    for (const r of state.rosters) {
      const key = getRosterPlayerKey(r);
      const labels = [r.player, r.playerKey, r.name];

      if (candidates.has(key)) return key;

      if (
        labels.some((label) => {
          return candidates.has(normalizeKey(label)) || candidates.has(playerKey(label));
        })
      ) {
        return key;
      }
    }

    for (const j of state.joueurs) {
      const key = getJoueurPlayerKey(j);
      const labels = [j.player, j.playerKey, j.name];

      if (candidates.has(key)) return key;

      if (
        labels.some((label) => {
          return candidates.has(normalizeKey(label)) || candidates.has(playerKey(label));
        })
      ) {
        return key;
      }
    }

    for (const i of state.infos) {
      const key = getInfoPlayerKey(i);
      const labels = [i.name, i.player, i.playerKey];

      if (candidates.has(key)) return key;

      if (
        labels.some((label) => {
          return candidates.has(normalizeKey(label)) || candidates.has(playerKey(label));
        })
      ) {
        return key;
      }
    }

    return "";
  }

  function findAllianceForPlayerKey(key) {
    if (!key) return "";

    const joueur = state.joueurs.find((j) => getJoueurPlayerKey(j) === key);
    const roster = state.rosters.find((r) => getRosterPlayerKey(r) === key);
    const info = state.infos.find((i) => getInfoPlayerKey(i) === key);

    return (
      allianceKey(joueur?.alliance) ||
      allianceKey(roster?.alliance) ||
      allianceKey(info?.alliance) ||
      ""
    );
  }

  // ---------- Roster / ISO ----------

  function findRosterChar(roster, charId) {
    if (!roster?.chars || typeof roster.chars !== "object") return null;

    const target = normalizeKey(charId);

    if (!target) return null;

    for (const [key, value] of Object.entries(roster.chars)) {
      if (normalizeKey(key) === target) return value || null;
    }

    const info = findCharacterInfo(charId);
    const aliases = [info?.id, info?.nameKey, info?.nameFr, info?.nameEn]
      .filter(Boolean)
      .map(normalizeKey);

    for (const [key, value] of Object.entries(roster.chars)) {
      if (aliases.includes(normalizeKey(key))) return value || null;
    }

    return null;
  }

  function findIsoForChar(roster, charId) {
    if (!roster) return null;

    const info = findCharacterInfo(charId);
    const rosterChar = findRosterChar(roster, charId);

    const aliases = [charId, info?.id, info?.nameKey, info?.nameFr, info?.nameEn]
      .filter(Boolean)
      .map(normalizeKey);

    const directCls = normalizeIsoClass(
      rosterChar?.isoClass ??
      rosterChar?.class ??
      rosterChar?.iso_class ??
      rosterChar?.isoRole ??
      rosterChar?.iso_role
    );

    const directCol = normalizeIsoColor(
      rosterChar?.isoColor ??
      rosterChar?.color ??
      rosterChar?.iso_color ??
      rosterChar?.isoMatrix ??
      rosterChar?.iso_matrix
    );

    if (directCls) {
      return {
        isoClass: directCls,
        isoColor: directCol,
      };
    }

    if (roster.iso && typeof roster.iso === "object") {
      for (const [k, v] of Object.entries(roster.iso)) {
        if (!aliases.includes(normalizeKey(k))) continue;

        const cls = normalizeIsoClass(v?.isoClass ?? v?.class ?? v?.iso_class);
        const col = normalizeIsoColor(v?.isoColor ?? v?.color ?? v?.iso_color);

        if (cls) {
          return {
            isoClass: cls,
            isoColor: col,
          };
        }
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
      const keys = new Set([
        ...Object.keys(clsMap || {}),
        ...Object.keys(colMap || {}),
      ]);

      for (const k of keys) {
        if (!aliases.includes(normalizeKey(k))) continue;

        const cls = normalizeIsoClass(clsMap?.[k]);
        const col = normalizeIsoColor(colMap?.[k]);

        if (cls) {
          return {
            isoClass: cls,
            isoColor: col,
          };
        }
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

  // ---------- Aliases / war score ----------

  function buildAliasMap(raw) {
    state.playerAliases = new Map();

    const source =
      raw?.aliases && typeof raw.aliases === "object" && !Array.isArray(raw.aliases)
        ? raw.aliases
        : raw;

    if (source && typeof source === "object" && !Array.isArray(source)) {
      Object.entries(source).forEach(([alias, canonical]) => {
        const aliasKey = normalizeKey(alias);
        const canonicalName = String(canonical ?? "").trim();

        if (!aliasKey || !canonicalName) return;

        state.playerAliases.set(aliasKey, canonicalName);
      });
    }

    if (Array.isArray(source)) {
      source.forEach((row) => {
        const alias = String(row?.alias ?? row?.from ?? row?.name ?? "").trim();
        const canonical = String(row?.canonical ?? row?.to ?? row?.target ?? "").trim();

        const aliasKey = normalizeKey(alias);

        if (!aliasKey || !canonical) return;

        state.playerAliases.set(aliasKey, canonical);
      });
    }
  }

  function getAverageWarScore(alliance, playerName) {
    const a = allianceKey(alliance);

    if (!a || !state.warHistory.length) {
      return null;
    }

    const roster = getSelectedRoster();
    const joueur = getSelectedJoueur();
    const info = getSelectedInfo();

    const wantedKeys = new Set(
      [
        state.selectedPlayerKey,
        playerKey(playerName),
        playerKey(roster?.player),
        playerKey(roster?.playerKey),
        playerKey(joueur?.player),
        playerKey(joueur?.playerKey),
        playerKey(info?.name),
        playerKey(info?.player),
      ].filter(Boolean)
    );

    if (!wantedKeys.size) {
      return null;
    }

    const scores = [];

    state.warHistory
      .filter((war) => allianceKey(war.alliance) === a)
      .forEach((war) => {
        const players = Array.isArray(war.players) ? war.players : [];

        const row = players.find((p) => {
          return wantedKeys.has(playerKey(p?.name || p?.player));
        });

        if (!row) return;

        const score = Number(row.score_total);

        if (!Number.isFinite(score)) return;

        scores.push(score);
      });

    if (!scores.length) {
      return null;
    }

    const avg = scores.reduce((sum, score) => sum + score, 0) / scores.length;

    return {
      avg,
      wars: scores.length,
    };
  }

  // ---------- Alliances / players ----------

  function getAllianceOptions() {
    const found = new Set();

    state.joueurs.forEach((j) => {
      const k = allianceKey(j.alliance);
      if (k) found.add(k);
    });

    state.rosters.forEach((r) => {
      const k = allianceKey(r.alliance);
      if (k) found.add(k);
    });

    state.infos.forEach((i) => {
      const k = allianceKey(i.alliance);
      if (k) found.add(k);
    });

    return Array.from(found).sort((a, b) => {
      const ia = ALLIANCE_ORDER.indexOf(a);
      const ib = ALLIANCE_ORDER.indexOf(b);

      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
  }

  function playersForAlliance(allianceK) {
    const rows = new Map();

    state.joueurs.forEach((j) => {
      if (allianceKey(j.alliance) !== allianceK) return;

      const key = getJoueurPlayerKey(j);

      if (!key) return;

      const roster = findRosterByPlayerKey(key);
      const info = findInfoByPlayerKey(key);

      rows.set(key, {
        key,
        label: String(roster?.player || j.player || info?.name || key).trim(),
        sortName: String(info?.name || j.player || roster?.player || key).trim(),
      });
    });

    state.rosters.forEach((r) => {
      if (allianceKey(r.alliance) !== allianceK) return;

      const key = getRosterPlayerKey(r);

      if (!key || rows.has(key)) return;

      const info = findInfoByPlayerKey(key);

      rows.set(key, {
        key,
        label: String(r.player || info?.name || r.playerKey || key).trim(),
        sortName: String(info?.name || r.player || r.playerKey || key).trim(),
      });
    });

    return Array.from(rows.values()).sort((a, b) =>
      a.sortName.localeCompare(b.sortName, "fr", {
        sensitivity: "base",
      })
    );
  }

  function renderAllianceOptions() {
    if (!allianceSelect) return;

    allianceSelect.innerHTML = "";

    const alliances = getAllianceOptions();

    alliances.forEach((key) => {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = `${ALLIANCE_EMOJI[key] || "•"} ${ALLIANCE_LABEL[key] || key}`.trim();
      allianceSelect.appendChild(opt);
    });

    if (!state.selectedAllianceKey && alliances[0]) {
      state.selectedAllianceKey = alliances[0];
    }

    allianceSelect.value = state.selectedAllianceKey;
  }

  function renderPlayerOptions() {
    if (!playerSelect) return;

    playerSelect.innerHTML = "";

    const allianceK = state.selectedAllianceKey;
    const players = playersForAlliance(allianceK);

    if (!players.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "— Aucun joueur —";
      playerSelect.appendChild(opt);
      playerSelect.disabled = true;
      state.selectedPlayerKey = "";
      return;
    }

    playerSelect.disabled = false;

    players.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.key;
      opt.textContent = p.label;
      playerSelect.appendChild(opt);
    });

    const selectedStillExists = players.some((p) => p.key === state.selectedPlayerKey);

    if (!selectedStillExists) {
      state.selectedPlayerKey = players[0].key;
    }

    playerSelect.value = state.selectedPlayerKey;
  }

  // ---------- Render identity ----------

  function renderIdentity() {
    const roster = getSelectedRoster();
    const joueur = getSelectedJoueur();
    const info = getSelectedInfo();

    const name = info?.name || joueur?.player || roster?.player || roster?.playerKey || "Joueur";
    const allianceRaw = info?.alliance || joueur?.alliance || roster?.alliance || state.selectedAllianceKey || "";
    const allianceK = allianceKey(allianceRaw) || state.selectedAllianceKey;
    const allianceLabel = ALLIANCE_LABEL[allianceK] || allianceRaw || "—";
    const allianceEmoji = ALLIANCE_EMOJI[allianceK] || "•";

    playerNameEl.textContent = name;
    playerAllianceEl.textContent = `${allianceEmoji} ${allianceLabel}`.trim();

    playerTcpEl.textContent = formatNumber(info?.tcp);

    playerWarMvpEl.textContent = Number.isFinite(Number(info?.war_mvp))
      ? Number(info.war_mvp).toLocaleString("fr-FR")
      : "—";

    playerCharCountEl.textContent = roster?.chars
      ? Object.keys(roster.chars).length.toLocaleString("fr-FR")
      : "—";

    const warScore = getAverageWarScore(allianceK, name);

    if (warScore) {
      playerWarScoreEl.textContent = `${formatScore(warScore.avg)} /100`;
      playerWarScoreMetaEl.textContent = `${warScore.wars} GA`;
      playerWarScoreEl.title = `Moyenne calculée sur ${warScore.wars} guerre${warScore.wars > 1 ? "s" : ""}`;
    } else {
      playerWarScoreEl.textContent = "—";
      playerWarScoreMetaEl.textContent = "Aucune GA";
      playerWarScoreEl.removeAttribute("title");
    }

    const icon = info?.icon || info?.portrait || "";
    const frame = info?.frame || "";

    playerIconEl.style.display = icon ? "block" : "none";
    playerIconEl.src = icon || "";
    playerIconEl.alt = `Portrait de ${name}`;

    playerFrameEl.style.display = frame ? "block" : "none";
    playerFrameEl.src = frame || "";

    playerAvatarFallbackEl.textContent = name ? name.charAt(0).toUpperCase() : "?";
  }

  // ---------- Render teams ----------

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

    if (!char.owned) {
      card.classList.add("is-missing");
    }

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

    team.chars.forEach((char) => {
      chars.appendChild(buildCharCard(char));
    });

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
      .filter((t) => String(t.mode || "").trim() === state.selectedMode)
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

    teams.forEach((team) => {
      teamListEl.appendChild(buildTeamCard(team));
    });
  }

  function renderAll() {
    renderIdentity();
    renderTeams();
  }

  // ---------- Normalize data ----------

  function normalizeTeams(raw) {
    return (raw || [])
      .map((t) => ({
        team: String(t.team ?? t.Team ?? "").trim(),
        mode: String(t.mode ?? t.Mode ?? "").trim(),
        characters: Array.isArray(t.characters)
          ? t.characters.map((c) => String(c ?? "").trim()).filter(Boolean)
          : [],
      }))
      .filter((t) => t.team && t.mode && t.characters.length);
  }

  function normalizeJoueurs(raw) {
    return (raw || [])
      .map((r) => ({
        player: String(r.player ?? r.joueur ?? r.name ?? "").trim(),
        playerKey: String(r.playerKey ?? "").trim(),
        alliance: String(r.alliance ?? "").trim(),
      }))
      .filter((r) => r.player || r.playerKey);
  }

  function normalizeWarHistory(raw) {
    return (raw || [])
      .map((w) => ({
        ...w,
        alliance: allianceKey(w.alliance),
        date: String(w.date || ""),
        players: Array.isArray(w.players) ? w.players : [],
      }))
      .filter((w) => w.date && w.alliance);
  }

  // ---------- Initial selection ----------

  function applyUrlSelection() {
    const urlAllianceKey = allianceKey(getParam("alliance"));
    const rawPlayer = getParam("player", "playerKey", "joueur");
    const resolvedPlayerKey = resolvePlayerKey(rawPlayer);

    if (resolvedPlayerKey) {
      state.selectedPlayerKey = resolvedPlayerKey;
      state.selectedAllianceKey =
        urlAllianceKey ||
        findAllianceForPlayerKey(resolvedPlayerKey) ||
        state.selectedAllianceKey;
      return true;
    }

    if (urlAllianceKey) {
      const players = playersForAlliance(urlAllianceKey);

      if (players.length) {
        state.selectedAllianceKey = urlAllianceKey;
        state.selectedPlayerKey = players[0].key;
        return true;
      }
    }

    return false;
  }

  function applyFallbackSelection() {
    if (applyStoredSelection()) return;

    const alliances = getAllianceOptions();

    for (const allianceK of alliances) {
      const players = playersForAlliance(allianceK);

      if (players.length) {
        state.selectedAllianceKey = allianceK;
        state.selectedPlayerKey = players[0].key;
        return;
      }
    }

    state.selectedAllianceKey = alliances[0] || "";
    state.selectedPlayerKey = getRosterPlayerKey(state.rosters[0]);
  }

  function chooseInitialSelection() {
    if (applyUrlSelection()) return;

    if (applySessionDefaultSelection()) {
      authDefaultsApplied = true;
      return;
    }

    applyFallbackSelection();
  }

  // ---------- Boot ----------

  async function boot() {
    const [
      infosRaw,
      joueursRaw,
      rostersRaw,
      teamsRaw,
      charsRaw,
      isoIconsRaw,
      warHistoryRaw,
      aliasesRaw,
    ] = await Promise.all([
      fetchJson(FILES.infos).catch(() => []),
      fetchJson(FILES.joueurs).catch(() => []),
      fetchJson(FILES.rosters),
      fetchJson(FILES.teams),
      fetchJson(FILES.characters).catch(() => []),
      fetchJson(FILES.isoIcons).catch(() => ({})),
      fetchJson(FILES.warHistory).catch(() => []),
      fetchJson(FILES.aliases).catch(() => ({})),
    ]);

    state.infos = Array.isArray(infosRaw) ? infosRaw : [];
    state.joueurs = normalizeJoueurs(joueursRaw);
    state.rosters = Array.isArray(rostersRaw) ? rostersRaw : [];
    state.teams = normalizeTeams(teamsRaw);
    state.chars = Array.isArray(charsRaw) ? charsRaw : [];
    state.isoIcons = isoIconsRaw && typeof isoIconsRaw === "object" ? isoIconsRaw : {};
    state.warHistory = normalizeWarHistory(Array.isArray(warHistoryRaw) ? warHistoryRaw : []);

    buildAliasMap(aliasesRaw);
    buildCharacterMaps();

    refreshLoSPSession();
    chooseInitialSelection();

    renderAllianceOptions();
    renderPlayerOptions();
    renderAll();

    bootReady = true;
  }

  // ---------- Events ----------

  window.addEventListener("losp:auth-ready", (event) => {
    lospSession =
      event.detail ||
      window.LoSP_SESSION ||
      readLocalSessionPayload() ||
      lospSession ||
      null;

    if (!bootReady) return;
    if (authDefaultsApplied) return;
    if (userChangedSelection) return;
    if (hasExplicitUrlTarget()) return;

    if (!applySessionDefaultSelection()) return;

    authDefaultsApplied = true;

    renderAllianceOptions();
    renderPlayerOptions();
    renderAll();
  });

  allianceSelect?.addEventListener("change", () => {
    userChangedSelection = true;
    authDefaultsApplied = true;

    state.selectedAllianceKey = allianceSelect.value;
    renderPlayerOptions();
    saveStoredSelection();
    renderAll();
  });

  allianceSelect?.addEventListener("input", () => {
    userChangedSelection = true;
    authDefaultsApplied = true;

    state.selectedAllianceKey = allianceSelect.value;
    renderPlayerOptions();
    saveStoredSelection();
    renderAll();
  });

  playerSelect?.addEventListener("change", () => {
    userChangedSelection = true;
    authDefaultsApplied = true;

    state.selectedPlayerKey = playerSelect.value;
    saveStoredSelection();
    renderAll();
  });

  playerSelect?.addEventListener("input", () => {
    userChangedSelection = true;
    authDefaultsApplied = true;

    state.selectedPlayerKey = playerSelect.value;
    saveStoredSelection();
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