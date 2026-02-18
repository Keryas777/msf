// scripts/fetch-characters.mjs
import fs from "node:fs/promises";

const CHAR_LIST_URL =
  "https://api-prod.marvelstrikeforce.com/services/api/getCharacterList?lang=fr";

// On va aussi chercher la table "heroes" pour avoir un mapping de noms FR si besoin
const LOC_HEROES_URL =
  "https://api-prod.marvelstrikeforce.com/services/api/getLocalization?tableId=heroes&lang=fr&format=json";

function safeStr(v) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.json();
}

function buildLocMap(locJson) {
  // La structure peut varier; on tente plusieurs formats courants
  const map = new Map();

  if (!locJson) return map;

  // Format A: { data: { KEY: "Valeur" } }
  if (locJson.data && typeof locJson.data === "object") {
    for (const [k, v] of Object.entries(locJson.data)) map.set(k, safeStr(v));
  }

  // Format B: { entries: [{key,value}] }
  if (Array.isArray(locJson.entries)) {
    for (const e of locJson.entries) {
      if (e?.key) map.set(e.key, safeStr(e.value));
    }
  }

  // Format C: { localization: {...} }
  if (locJson.localization && typeof locJson.localization === "object") {
    for (const [k, v] of Object.entries(locJson.localization))
      map.set(k, safeStr(v));
  }

  return map;
}

function pickPortraitUrl(c) {
  // On essaye plusieurs champs possibles (selon versions)
  const candidates = [
    c.portraitUrl,
    c.portrait,
    c.portrait_image,
    c.portraitImage,
    c.portrait_icon,
    c.portraitIcon,
    c.image,
    c.icon,
  ].filter(Boolean);

  const u = candidates.find(x => typeof x === "string" && x.startsWith("http"));
  return u || null;
}

async function main() {
  const [charList, locHeroes] = await Promise.all([
    fetchJson(CHAR_LIST_URL),
    fetchJson(LOC_HEROES_URL).catch(() => null),
  ]);

  const locMap = buildLocMap(locHeroes);

  // charList peut être { characters: [...] } ou directement [...]
  const raw = Array.isArray(charList)
    ? charList
    : Array.isArray(charList?.characters)
      ? charList.characters
      : Array.isArray(charList?.data)
        ? charList.data
        : [];

  const out = raw
    .map(c => {
      const id = safeStr(c.id || c.characterId || c.internalName || c.nameKey).trim();
      if (!id) return null;

      // nameKey peut être un identifiant de loc (parfois égal à l'id)
      const nameKey = safeStr(c.nameKey || c.name || id).trim();

      // Nom FR : si l’API renvoie déjà le nom FR ok, sinon on tente la loc
      const nameFrDirect = safeStr(c.nameFr || c.localizedName || c.displayName).trim();
      const nameFr = nameFrDirect || locMap.get(nameKey) || locMap.get(id) || null;

      const portraitUrl = pickPortraitUrl(c) || null;

      return {
        id,
        nameKey,
        nameFr,
        nameEn: null,
        portraitUrl,
      };
    })
    .filter(Boolean);

  await fs.mkdir("docs/data", { recursive: true });
  await fs.writeFile("docs/data/msf-characters.json", JSON.stringify(out, null, 2), "utf8");

  console.log(`OK: wrote ${out.length} characters -> docs/data/msf-characters.json`);
  console.log("Sample:", out.slice(0, 5));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});