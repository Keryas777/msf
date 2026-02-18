import fs from "node:fs";

// 1) On tente directement la liste en FR (souvent ça marche)
// 2) On récupère aussi la table de localisation FR "heroes" pour traduire si besoin
const CHAR_URL = "https://api-prod.marvelstrikeforce.com/services/api/getCharacterList?lang=fr";
const HEROES_FR_URL =
  "https://api-prod.marvelstrikeforce.com/services/api/getLocalization?tableId=heroes&lang=fr&format=json";

function pick(obj, keys) {
  for (const k of keys) if (obj && obj[k] != null) return obj[k];
  return null;
}

function toTable(maybe) {
  // Certains endpoints renvoient { data: {...} }, d'autres {...}
  return maybe?.data || maybe?.table || maybe || {};
}

function normalizeString(s) {
  return typeof s === "string" ? s.replace(/\s+/g, " ").trim() : null;
}

const [charsRes, heroesRes] = await Promise.all([
  fetch(CHAR_URL),
  fetch(HEROES_FR_URL),
]);

if (!charsRes.ok) throw new Error(`getCharacterList failed: ${charsRes.status}`);
if (!heroesRes.ok) throw new Error(`heroes FR failed: ${heroesRes.status}`);

const charsJson = await charsRes.json();
const heroesJson = await heroesRes.json();

const heroesTable = toTable(heroesJson);
const list = charsJson?.data || charsJson?.characters || charsJson || [];

if (!Array.isArray(list)) {
  throw new Error("Unexpected getCharacterList format: expected an array at .data/.characters/root");
}

const out = list
  .map((c) => {
    const id = pick(c, ["id", "characterId", "key", "internalName"]);

    // Souvent name/displayName est déjà la bonne valeur (FR si lang=fr fonctionne)
    const nameFromList = normalizeString(pick(c, ["name", "displayName"]));

    // Si l'API ne donne pas de clé de localisation, on utilise l'id (souvent compatible)
    const nameKey =
      pick(c, ["nameKey", "locKey", "localizationKey"]) ||
      id;

    const nameFromTable = nameKey && heroesTable[nameKey] ? normalizeString(heroesTable[nameKey]) : null;

    // Images : l'API MSF fournit déjà un portraitUrl complet (dans ton exemple c'est le cas)
    const portraitUrl = pick(c, [
      "portraitUrl",
      "portrait",
      "portraitImage",
      "portrait_image",
      "iconUrl",
      "icon",
      "avatarUrl",
      "imageUrl",
      "image",
    ]);

    const nameFr = nameFromList || nameFromTable || null;

    return {
      id: normalizeString(id),
      nameKey: normalizeString(nameKey),
      nameFr,
      nameEn: null, // on ne force pas ici; si tu veux, on peut aussi récupérer un EN séparément plus tard
      portraitUrl: normalizeString(portraitUrl),
    };
  })
  // nettoie les entrées bizarres
  .filter((x) => x.id && (x.nameFr || x.portraitUrl));

fs.mkdirSync("data", { recursive: true });
fs.writeFileSync("data/msf-characters.json", JSON.stringify(out, null, 2), "utf-8");

console.log(`OK: wrote ${out.length} characters -> data/msf-characters.json`);
console.log("Sample:", out.slice(0, 5));