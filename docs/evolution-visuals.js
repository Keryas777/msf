// Visual annotations for Evolution; never alter archived snapshot data.
// Material URLs and level grids mirror the verified official assets in docs/app.js.
(() => {
  const MATERIAL_ICONS = Object.freeze({
    T1: "https://assets.marvelstrikeforce.com/imgs/ICON_ABILITY_MATERIAL_GREEN_ABILITY_MAT_b4780c94.png",
    T2: "https://assets.marvelstrikeforce.com/imgs/ICON_ABILITY_MATERIAL_BLUE_ABILITY_MAT_66eb7f9d.png",
    T3: "https://assets.marvelstrikeforce.com/imgs/ICON_ABILITY_MATERIAL_PURPLE_ABILITY_MAT_2250890d.png",
    T4: "https://assets.marvelstrikeforce.com/imgs/ICON_ABILITY_MATERIAL_ORANGE_ABILITY_MAT_bb60fc90.png",
  });
  const MATERIAL_TIERS = Object.freeze({
    basic: [null, null, "T1", "T1", "T2", "T2", "T3", "T4"],
    special: [null, null, "T1", "T2", "T2", "T3", "T3", "T4"],
    ultimate: [null, null, "T1", "T2", "T2", "T3", "T3", "T4"],
    passive: [null, null, "T2", "T3", "T3", "T4"],
  });
  const ABILITY_LABEL_TYPES = Object.freeze({
    "Capacité Basique": "basic",
    "Capacité Spéciale": "special",
    "Capacité Ultime": "ultimate",
    "Capacité Passive": "passive",
  });
  const ISO_COLORS = ["green", "blue", "purple", "orange"];
  const ISO_COLOR_LABELS = { green: "vert", blue: "bleu", purple: "violet", orange: "orange" };
  const ISO_CLASS_LABELS = {
    striker: "Attaquant", raider: "Fantassin", skirmisher: "Tirailleur",
    healer: "Soigneur", fortifier: "Fortificateur",
  };

  function officialAssetUrl(value) {
    return typeof value === "string" &&
      /^https:\/\/assets\.marvelstrikeforce\.com\/(?:imgs|key_art)\/[A-Za-z0-9_./%-]+\.(?:png|webp|jpg|jpeg)$/i.test(value);
  }

  function abilityMaterial(label, level) {
    const type = ABILITY_LABEL_TYPES[label];
    const n = Number(level);
    if (!type || !Number.isSafeInteger(n) || n < 0 || String(level).trim() === "") return null;
    if ((type === "passive" && n === 6) || (type !== "passive" && n === 8)) {
      return { type, level: n, awakened: true, url: null };
    }
    const tier = MATERIAL_TIERS[type]?.[n];
    if (!tier) return null;
    return { type, level: n, awakened: false, url: MATERIAL_ICONS[tier], tier };
  }

  function isoVisual(iso, catalog) {
    const max = Number(iso?.isoMax);
    if (!Number.isSafeInteger(max) || max < 1 || max > 20) return null;
    const color = ISO_COLORS[Math.floor((max - 1) / 5)];
    const level = ((max - 1) % 5) + 1;
    const cls = String(iso?.isoClass || "").toLowerCase();
    const official = catalog?.[cls]?.[color];
    // The current icon catalog has green/blue/purple, but no orange assets.
    // Retain the correct class shape and recolor the purple icon as a fallback.
    const fallback = color === "orange" ? catalog?.[cls]?.purple : null;
    const url = officialAssetUrl(official) ? official :
      (officialAssetUrl(fallback) ? fallback : null);
    const approximate = Boolean(url && color === "orange" && url === fallback);
    const description = [ISO_CLASS_LABELS[cls] || "", "ISO " + ISO_COLOR_LABELS[color],
      "niveau " + level].filter(Boolean).join(" · ");
    return { url, approximate, color, level, description,
      label: url ? "niveau " + level : ISO_COLOR_LABELS[color] + " · niveau " + level };
  }

  function awakenedMaterialUrl(materials, characterId, type) {
    const same = value => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    const match = (Array.isArray(materials) ? materials : []).find(item =>
      same(item?.characterId) === same(characterId) &&
      String(item?.abilityType || "").toLowerCase() === type);
    return officialAssetUrl(match?.iconUrl) ? match.iconUrl : null;
  }

  window.LoSPEvolutionVisuals = Object.freeze({
    abilityMaterial, isoVisual, awakenedMaterialUrl, officialAssetUrl,
  });
})();
