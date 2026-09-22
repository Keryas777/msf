export function normalizeDefenseVariants(rows) {
  const byVariant = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const family = String(row?.def_family || "").trim();
    const variant = String(row?.def_variant || "").trim();
    if (!family || !variant) continue;

    const characters = [row?.def_char1, row?.def_char2, row?.def_char3, row?.def_char4, row?.def_char5]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    if (!characters.length) continue;

    const key = family + "\u0000" + variant;
    if (!byVariant.has(key)) {
      byVariant.set(key, Object.freeze({ family, variant, characters: Object.freeze(characters) }));
    }
  }

  return [...byVariant.values()];
}

export function compositionKey(characterIds) {
  return (Array.isArray(characterIds) ? characterIds : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .join("|");
}

export function findExactDefenseMatches(defenses, selectedCharacterIds) {
  const selected = (Array.isArray(selectedCharacterIds) ? selectedCharacterIds : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (!selected.length) return [];

  const selectedKey = compositionKey(selected);
  return (Array.isArray(defenses) ? defenses : []).filter((defense) => {
    const characters = Array.isArray(defense?.characters) ? defense.characters : [];
    return characters.length === selected.length && compositionKey(characters) === selectedKey;
  });
}
