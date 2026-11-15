// Lightweight, fail-closed bridge between the published Codex and DD rankings.
export function mergeOfficialCodexTraits(characters, traitsFile, manifest) {
  if (!Array.isArray(characters) ||
      traitsFile?.schemaVersion !== 1 ||
      typeof traitsFile.sourcePayloadSetChecksum !== "string" ||
      traitsFile.sourcePayloadSetChecksum !== manifest?.currentPayloadSetChecksum ||
      !traitsFile.characters || typeof traitsFile.characters !== "object" ||
      Array.isArray(traitsFile.characters) ||
      Object.keys(traitsFile.characters).length < 300) {
    throw new Error("Catalogue de tags DD9 absent, incomplet ou obsolète.");
  }
  return characters.map(character => {
    const tags = traitsFile.characters[character.id];
    if (!Array.isArray(tags) || !tags.length ||
        tags.some(tag => typeof tag !== "string" || !tag)) return {...character, tags: null};
    return {...character, tags: [...new Set(tags)]};
  });
}
