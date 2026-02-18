import fs from "node:fs";

const CHAR_URL = "https://api-prod.marvelstrikeforce.com/services/api/getCharacterList?lang=en";
// Table de traduction FR (noms, etc.)
const HEROES_FR_URL = "https://api-prod.marvelstrikeforce.com/services/api/getLocalization?tableId=heroes&lang=fr&format=json";

function pick(obj, keys) {
  for (const k of keys) if (obj && obj[k] != null) return obj[k];
  return null;
}

const [charsRes, heroesRes] = await Promise.all([
  fetch(CHAR_URL),
  fetch(HEROES_FR_URL),
]);

if (!charsRes.ok) throw new Error(`getCharacterList failed: ${charsRes.status}`);
if (!heroesRes.ok) throw new Error(`heroes FR failed: ${heroesRes.status}`);

const charsJson = await charsRes.json();
const heroesJson = await heroesRes.json();

// La table heroes est souvent un mapping clé->texte.
// Selon le format, ça peut être { data: {...} } ou direct {...}
const heroesTable =
  heroesJson?.data || heroesJson?.table || heroesJson || {};

const list = charsJson?.data || charsJson?.characters || charsJson || [];

// On essaye de normaliser sans “inventer” : on garde ce qu’on trouve.
const out = Array.isArray(list) ? list.map(c => {
  const id = pick(c, ["id", "characterId", "key", "nameKey", "internalName"]);
  const nameKey = pick(c, ["nameKey", "key", "locKey", "internalName"]);
  const nameEn = pick(c, ["name", "displayName"]);
  const nameFr = (nameKey && heroesTable[nameKey]) ? heroesTable[nameKey] : null;

  // Images: selon l'API, le champ peut varier. On capture large.
  const portraitUrl = pick(c, [
    "portraitUrl", "portrait", "portraitImage", "portrait_image",
    "iconUrl", "icon", "avatarUrl", "imageUrl", "image"
  ]);

  return {
    id,
    nameKey,
    nameFr,
    nameEn,
    portraitUrl,
  };
}) : [];

fs.mkdirSync("data", { recursive: true });
fs.writeFileSync("data/msf-characters.json", JSON.stringify(out, null, 2), "utf-8");

console.log(`OK: wrote ${out.length} characters -> data/msf-characters.json`);
console.log("Sample:", out.slice(0, 3));
