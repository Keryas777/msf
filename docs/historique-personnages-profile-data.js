// Helpers indépendants pour la fiche des personnages LoSP.
(() => {
  "use strict";
  const normal = value => String(value ?? "").trim().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const esc = value => String(value ?? "").replace(/&/g, "&amp;")
    .replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");

  function resolveAlias(aliases) {
    const map = new Map();
    for (const [from, to] of Object.entries(aliases?.aliases || {})) {
      if (normal(from)) map.set(normal(from), normal(to));
    }
    return name => {
      let key = normal(name);
      const visited = new Set();
      while (map.has(key) && !visited.has(key)) {
        visited.add(key);
        key = map.get(key);
      }
      return key;
    };
  }

  function rankPlayers(characterId, rosters, players, aliases, alliances) {
    const resolve = resolveAlias(aliases);
    const active = (Array.isArray(alliances) ? alliances : [])
      .filter(alliance => alliance?.key && alliance.active !== false);
    const allianceAliases = new Map();
    for (const alliance of active) {
      for (const name of [alliance.key, alliance.name, ...(alliance.aliases || [])]) {
        allianceAliases.set(normal(name), alliance.key);
      }
    }
    const members = new Map();
    for (const player of Array.isArray(players) ? players : []) {
      const key = resolve(player?.player || player?.name);
      const alliance = allianceAliases.get(normal(player?.alliance));
      if (key && alliance) members.set(key, { name: player.player || player.name, alliance });
    }
    const characterKey = normal(characterId);
    const best = new Map();
    for (const roster of Array.isArray(rosters) ? rosters : []) {
      const key = resolve(roster?.player || roster?.playerKey);
      const member = members.get(key);
      if (!member || !roster?.chars || typeof roster.chars !== "object") continue;
      let character = null, sourceKey = "";
      for (const [id, value] of Object.entries(roster.chars)) {
        if (normal(id) === characterKey) {
          character = value;
          sourceKey = id;
          break;
        }
      }
      const power = Number(character?.power || 0);
      if (!Number.isFinite(power) || power <= 0 || (best.get(key)?.power || 0) >= power) continue;
      let iso = character;
      if (!iso?.isoClass && roster.iso && typeof roster.iso === "object") {
        for (const [id, data] of Object.entries(roster.iso)) {
          if (normal(id) === normal(sourceKey)) {
            iso = data;
            break;
          }
        }
      }
      best.set(key, {
        player: member.name, alliance: member.alliance, power,
        level: character?.level, gear: character?.gear,
        yellowStars: character?.yellowStars, redStars: character?.redStars,
        diamonds: character?.diamonds, isoMax: character?.isoMax,
        isoClass: iso?.isoClass || "", isoColor: iso?.isoColor || ""
      });
    }
    return [...best.values()].sort((a, b) => b.power - a.power ||
      a.player.localeCompare(b.player, "fr", { sensitivity: "base" }));
  }

  const categories = [
    { title: "Origine", tags: ["Global", "City", "Cosmic"] },
    { title: "Type", tags: ["Bio", "Skill", "Tech", "Mystic", "Mutant"] },
    { title: "Rôle", tags: ["Blaster", "Brawler", "Controller", "Protector", "Support"] },
    { title: "Affiliation", tags: ["Hero", "Villain"] }
  ];

  function groupTraits(character) {
    const ids = Array.isArray(character?.traits) ? character.traits : [];
    const labels = Array.isArray(character?.displayTraits) ? character.displayTraits : [];
    const groups = categories.map(c => ({ title: c.title, labels: [] }));
    groups.push({ title: "Équipes et autres tags", labels: [] });
    labels.forEach((label, index) => {
      const found = categories.findIndex(c => c.tags.some(t => normal(t) === normal(ids[index])));
      groups[found < 0 ? groups.length - 1 : found].labels.push(label);
    });
    return groups.filter(g => g.labels.length);
  }

  window.LoSPProfileData = Object.freeze({ normal, esc, rankPlayers, groupTraits });
})();
