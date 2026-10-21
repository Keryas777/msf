// Catalogue des défenses publiées : regroupement par joueur, source ou collection.
// Fichier statique, réutilisable dans les tests Node sans framework.
(function (root) {
  "use strict";

  const text = value => String(value ?? "").trim();
  const normalize = value => text(value).toLocaleLowerCase("fr")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
  const personalSources = new Set(["", "personnel", "personnelle", "joueur", "joueurs",
    "player", "players", "losp", "proposition personnelle"]);

  function activeEntries(data, season) {
    if (!season || !Array.isArray(data)) return [];
    return data.filter(entry =>
      entry && entry.season === season &&
      Number.isInteger(Number(entry.room)) && Number(entry.room) >= 1 && Number(entry.room) <= 6 &&
      Array.isArray(entry.characters) && entry.characters.length === 5 &&
      entry.characters.every(id => text(id)) &&
      new Set(entry.characters.map(text)).size === 5
    );
  }

  function groupFor(entry) {
    const source = text(entry?.source);
    const author = text(entry?.author);
    const collection = text(entry?.collection);
    const external = !personalSources.has(normalize(source));
    const kind = external ? "source" : "player";
    const owner = external ? source : (author || "Sans auteur");
    const label = collection || (external ? source : "Défenses de " + owner);
    // Le libellé peut évoluer indépendamment de la clé stable.
    const id = JSON.stringify([kind, normalize(owner), normalize(collection)]);
    return { id, kind, label };
  }

  function groupsFor(entries) {
    const groups = new Map();
    for (const entry of Array.isArray(entries) ? entries : []) {
      const group = groupFor(entry);
      const previous = groups.get(group.id);
      if (previous) previous.count += 1;
      else groups.set(group.id, { ...group, count: 1 });
    }
    return [...groups.values()].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "player" ? -1 : 1;
      return a.label.localeCompare(b.label, "fr", { sensitivity: "base" });
    });
  }

  function entriesForGroup(entries, selectedId) {
    if (!selectedId) return [...entries];
    return entries.filter(entry => groupFor(entry).id === selectedId);
  }

  // Les recommandations gardent leur nom brut dans le JSON ; seuls les libellés
  // et leur ordre sont traduits pour la consultation (Best, Optimal, Budget).
  const tiers = new Map([
    ["best defense", { key: "best", label: "Meilleure défense", order: 1 }],
    ["meilleure defense", { key: "best", label: "Meilleure défense", order: 1 }],
    ["optimal defense", { key: "optimal", label: "Défense optimisée", order: 2 }],
    ["defense optimisee", { key: "optimal", label: "Défense optimisée", order: 2 }],
    ["budget defense", { key: "budget", label: "Défense économique", order: 3 }],
    ["defense economique", { key: "budget", label: "Défense économique", order: 3 }]
  ]);
  function presentationFor(entry) {
    const name = text(entry?.name) || (entry?.author ? "Défense de " + text(entry.author) : "Défense publiée");
    const parts = name.match(/^(.+?)\s+[—–-]\s+(.+)$/);
    const tier = parts ? tiers.get(normalize(parts[1])) : null;
    return tier
      ? { key: tier.key, label: tier.label, team: parts[2].trim(), order: tier.order }
      : { key: "other", label: "", team: name, order: 99 };
  }

  function sortedForDisplay(entries) {
    // Stable au sein d'une catégorie, même lorsque deux variantes coexistent.
    return (Array.isArray(entries) ? entries : [])
      .map((entry, index) => ({ entry, index, order: presentationFor(entry).order }))
      .sort((a, b) => a.order - b.order || a.index - b.index)
      .map(item => item.entry);
  }

  function displaySource(entry) {
    const source = text(entry?.source);
    const author = text(entry?.author);
    return personalSources.has(normalize(source))
      ? (author || "Joueur LoSP")
      : (source || author || "Joueur LoSP");
  }

  root.LoSPCosmicDefenseCatalog = Object.freeze({
    activeEntries, groupFor, groupsFor, entriesForGroup,
    presentationFor, sortedForDisplay, displaySource
  });
})(globalThis);
