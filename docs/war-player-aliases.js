// Normalisation des pseudos de guerre, utilisée par War Admin et l'historique.
// Source de vérité : data/player-aliases.json (aucun alias codé ici).
(() => {
  "use strict";

  const ALIASES_URL = "./data/player-aliases.json";
  let pendingLoad = null;

  // Identique à la clé de regroupement de scripts/build-war-data.mjs.
  function nameKey(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "")
      .replace(/[-_‐-‒–—―﹘﹣－]/g, "")
      .replace(/[’'\u0060´]/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  function createMap(data) {
    const source = data?.aliases && typeof data.aliases === "object" && !Array.isArray(data.aliases)
      ? data.aliases : data;
    const aliases = new Map();

    if (source && typeof source === "object" && !Array.isArray(source)) {
      for (const [alias, canonical] of Object.entries(source)) {
        const key = nameKey(alias);
        const target = String(canonical ?? "").trim();
        if (key && target) aliases.set(key, target);
      }
    } else if (Array.isArray(source)) {
      for (const row of source) {
        const key = nameKey(row?.alias ?? row?.from ?? row?.name);
        const target = String(row?.canonical ?? row?.to ?? row?.target ?? "").trim();
        if (key && target) aliases.set(key, target);
      }
    }
    return aliases;
  }

  function load() {
    if (!pendingLoad) {
      pendingLoad = fetch(ALIASES_URL, { cache: "no-store" })
        .then((response) => {
          if (!response.ok) throw new Error("Chargement des alias impossible (HTTP " + response.status + ").");
          return response.json();
        })
        .then(createMap)
        .catch((error) => {
          pendingLoad = null; // un nouvel essai reste possible
          throw error;
        });
    }
    return pendingLoad;
  }

  function canonicalName(name, aliases) {
    let current = String(name ?? "").trim();
    const seen = new Set();
    for (let i = 0; i < 10 && current; i += 1) {
      const key = nameKey(current);
      if (seen.has(key)) break;
      seen.add(key);
      const next = aliases.get(key);
      if (!next || next.trim() === current) break;
      current = next.trim();
    }
    return current;
  }

  // Remplacement du seul pseudo OCR lié à cette analyse, jamais d'une
  // sous-chaîne d'un autre joueur ou d'un mot ordinaire.
  function correctAnalysis(analysis, original, canonical) {
    if (typeof analysis !== "string" || !original || original === canonical) return analysis;
    const escaped = original.replace(/[.*+?^$()|[\]{}\\]/g, "\\$&");
    const token = "[\\p{L}\\p{N}\\p{M}_]";
    const pattern = new RegExp("(^|[^\\p{L}\\p{N}\\p{M}_])(" + escaped + ")(?=$|[^\\p{L}\\p{N}\\p{M}_])", "giu");
    return analysis.replace(pattern, (_match, prefix) => prefix + canonical);
  }

  function normalizeDraft(draft, aliases) {
    if (!draft || !Array.isArray(draft.players)) throw new Error("Brouillon de guerre invalide.");
    const seen = new Set();
    const players = draft.players.map((player) => {
      const name = canonicalName(player.name, aliases);
      const key = nameKey(name);
      if (!key || seen.has(key)) {
        throw new Error("Collision de pseudos après correction des alias : " + name + ". Vérifier les lignes OCR.");
      }
      seen.add(key);
      return { ...player, name };
    });
    return { ...draft, players };
  }

  function normalizeWarData(data, aliases) {
    if (!data || typeof data !== "object") return data;
    const correctPlayer = (player) => {
      if (!player || typeof player !== "object") return player;
      const original = String(player.name ?? "").trim();
      const name = canonicalName(original, aliases);
      return {
        ...player,
        name,
        ...(typeof player.analysis === "string"
          ? { analysis: correctAnalysis(player.analysis, original, name) }
          : {})
      };
    };
    const report = data.report && typeof data.report === "object" ? {
      ...data.report,
      ...(Array.isArray(data.report.players)
        ? { players: data.report.players.map(correctPlayer) } : {}),
      ...(Array.isArray(data.report.ranking)
        ? { ranking: data.report.ranking.map(correctPlayer) } : {})
    } : data.report;

    return {
      ...data,
      ...(Array.isArray(data.players) ? { players: data.players.map(correctPlayer) } : {}),
      ...(report ? { report } : {})
    };
  }

  globalThis.MsfWarPlayerAliases = Object.freeze({
    nameKey, createMap, load, canonicalName, correctAnalysis, normalizeDraft, normalizeWarData
  });
})();
