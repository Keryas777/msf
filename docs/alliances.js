// docs/alliances.js
// Helper commun pour charger et exploiter les métadonnées d'alliances.
(() => {
  const ALLIANCES_URL = "./data/alliances.json";

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
      aliases: Object.freeze(["Kronos", "kronos", "LoSP Kronos", "losp kronos"]),
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
        "poséidon",
        "poseidon",
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

  let loaded = false;
  let loadingPromise = null;
  let alliances = [];
  let allianceByKey = new Map();
  let aliasToKey = new Map();

  function normalizeAllianceKey(value) {
    return String(value ?? "")
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
      .map((alliance) => {
        const key = normalizeAllianceKey(alliance?.key);
        const name = String(alliance?.name ?? "").trim();
        const emoji = String(alliance?.emoji ?? "").trim();
        const color = String(alliance?.color ?? "").trim();
        const nameColor = String(alliance?.nameColor ?? "").trim();
        const group = String(alliance?.group ?? "losp").trim();
        const displayParts = Array.isArray(alliance?.displayParts) ? alliance.displayParts.map(String) : [];
        const order = Number(alliance?.order);
        const aliases = Array.isArray(alliance?.aliases) ? alliance.aliases : [];

        if (!key || !name) return null;

        return {
          key,
          name,
          emoji,
          color,
          nameColor,
          group,
          displayParts,
          order: Number.isFinite(order) ? order : 999,
          aliases: [...new Set([key, name, ...aliases].map(String).map((v) => v.trim()).filter(Boolean))],
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.name.localeCompare(b.name, "fr");
      });
  }

  function applyAlliances(data, options = {}) {
    const fallbackRows = normalizeAllianceData(FALLBACK_ALLIANCES);
    const normalized = normalizeAllianceData(data);
    const byKey = new Map(fallbackRows.map((alliance) => [alliance.key, alliance]));

    normalized.forEach((alliance) => {
      byKey.set(alliance.key, alliance);
    });

    alliances = Array.from(byKey.values()).sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.name.localeCompare(b.name, "fr");
    });
    allianceByKey = new Map();
    aliasToKey = new Map();

    const aliasOwners = new Map();
    alliances.forEach((alliance) => {
      allianceByKey.set(alliance.key, alliance);
      [alliance.key, alliance.name, ...(alliance.aliases || [])].forEach((alias) => {
        const aliasKey = normalizeAllianceKey(alias);
        if (!aliasKey) return;
        // Deux alliances Endgame portent le même nom : leur identifiant reste distinct.
        if (aliasOwners.has(aliasKey) && aliasOwners.get(aliasKey) !== alliance.key) {
          aliasOwners.set(aliasKey, null);
        } else if (!aliasOwners.has(aliasKey)) {
          aliasOwners.set(aliasKey, alliance.key);
        }
      });
    });
    aliasOwners.forEach((key, alias) => {
      if (key) aliasToKey.set(alias, key);
    });

    loaded = options.loaded === true;
    return getKnownAlliances();
  }

  function ensureFallbackLoaded() {
    if (!alliances.length) applyAlliances(FALLBACK_ALLIANCES, { loaded: false });
  }

  async function loadAlliances(options = {}) {
    if (window.LoSP_AUTH_READY) await window.LoSP_AUTH_READY;
    if (loaded && !options.force) return getKnownAlliances();
    if (loadingPromise && !options.force) return loadingPromise;

    if (typeof fetch !== "function") {
      return applyAlliances(FALLBACK_ALLIANCES, { loaded: false });
    }

    loadingPromise = fetch(ALLIANCES_URL, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`${ALLIANCES_URL} -> HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => applyAlliances(data, { loaded: true }))
      .catch(() => applyAlliances(FALLBACK_ALLIANCES, { loaded: false }))
      .finally(() => {
        loadingPromise = null;
      });

    return loadingPromise;
  }

  function getAllianceKey(value) {
    ensureFallbackLoaded();

    const key = normalizeAllianceKey(value);
    if (!key) return "";
    if (allianceByKey.has(key)) return key;
    if (aliasToKey.has(key)) return aliasToKey.get(key);
    return key;
  }

  function getAllianceMeta(value) {
    ensureFallbackLoaded();
    return allianceByKey.get(getAllianceKey(value)) || null;
  }

  function getAllianceEmoji(value) {
    return getAllianceMeta(value)?.emoji || "•";
  }

  function getAllianceLabel(value) {
    return getAllianceMeta(value)?.name || String(value ?? "").trim();
  }

  // Rend le nom officiel sans suffixe rouge/orange ; seuls les caractères changent de couleur.
  function renderAllianceName(target, value) {
    if (!target) return;
    const meta = getAllianceMeta(value);
    target.textContent = "";
    target.style.color = meta?.nameColor || "";
    if (meta?.displayParts?.length === 2) {
      const prefix = document.createElement("span");
      prefix.textContent = meta.displayParts[0];
      prefix.style.color = "#fff";
      const colored = document.createElement("span");
      colored.textContent = meta.displayParts[1];
      colored.style.color = meta.color;
      target.append(prefix, colored);
    } else {
      target.textContent = meta?.name || String(value ?? "").trim();
    }
  }

  function getAllianceOrder(value) {
    return getAllianceMeta(value)?.order ?? 999;
  }

  function getKnownAlliances() {
    ensureFallbackLoaded();
    const permitted = window.LoSP_SESSION?.allowedAlliances;
    const allowedKeys = Array.isArray(permitted)
      ? new Set(permitted.map(normalizeAllianceKey))
      : null;
    return alliances
      .filter((alliance) => allowedKeys ? allowedKeys.has(alliance.key) : alliance.group === "losp")
      .map((alliance) => ({
        key: alliance.key,
        name: alliance.name,
        emoji: alliance.emoji,
        color: alliance.color,
        nameColor: alliance.nameColor,
        group: alliance.group,
        displayParts: [...(alliance.displayParts || [])],
        order: alliance.order,
        aliases: [...(alliance.aliases || [])],
      }));
  }

  window.LoSPAlliances = Object.freeze({
    loadAlliances,
    normalizeAllianceKey,
    getAllianceKey,
    getAllianceMeta,
    getAllianceEmoji,
    getAllianceLabel,
    renderAllianceName,
    getAllianceOrder,
    getKnownAlliances,
  });
})();
