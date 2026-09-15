// scripts/fetch-characters.mjs
import fs from "node:fs/promises";

const CHAR_LIST_URL =
  "https://api-prod.marvelstrikeforce.com/services/api/getCharacterList?lang=fr";

// On va aussi chercher la table "heroes" pour avoir un mapping de noms FR si besoin
const LOC_HEROES_URL =
  "https://api-prod.marvelstrikeforce.com/services/api/getLocalization?tableId=heroes&lang=fr&format=json";
const HERO_SHEET_HISTORY_URL =
  "https://msf-datamines.magneticzero.dev/file/heroes/M3HeroSheet.json";
// Snapshot aligné sur le WebGL 10_5_0 build 1666317. À remplacer avec la
// version source suivante; MSF_HERO_SHEET_REVISION permet un essai explicite.
const HERO_SHEET_REVISION =
  process.env.MSF_HERO_SHEET_REVISION ||
  "828421b4c9b9e3ceb4f5ac538c072ce331ab9b6193fe6eb58a94c6675e139f74";

function safeStr(v) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.json();
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return { body: await res.text(), url: res.url };
}

function decodeHtml(value) {
  const named = { amp: "&", apos: "'", gt: ">", lt: "<", quot: '"' };
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) =>
      String.fromCodePoint(Number.parseInt(code, 16))
    )
    .replace(/&#([0-9]+);/g, (_match, code) =>
      String.fromCodePoint(Number.parseInt(code, 10))
    )
    .replace(/&([a-z]+);/gi, (match, name) => named[name] ?? match);
}

async function fetchHeroSheet() {
  const overrideUrl = process.env.MSF_HERO_SHEET_URL;
  if (overrideUrl) return fetchJson(overrideUrl);

  const history = await fetchText(HERO_SHEET_HISTORY_URL);
  const revisionPath = `/view/heroes/M3HeroSheet.json/${HERO_SHEET_REVISION}`;
  if (!history.body.includes(revisionPath)) {
    throw new Error(
      `M3HeroSheet revision ${HERO_SHEET_REVISION} is not present in history`
    );
  }

  const revision = await fetchText(new URL(revisionPath, history.url).href);
  const dumpMatch = revision.body.match(
    /<pre[^>]*class=["'][^"']*\bfiledump\b[^"']*["'][^>]*>([\s\S]*?)<\/pre>/i
  );
  if (!dumpMatch) {
    throw new Error(`M3HeroSheet payload is missing from ${revision.url}`);
  }

  try {
    return JSON.parse(decodeHtml(dumpMatch[1]));
  } catch (error) {
    throw new Error(`Invalid M3HeroSheet payload from ${revision.url}`, {
      cause: error,
    });
  }
}

function unwrapHeroSheet(payload) {
  const sheet =
    payload?.Data && typeof payload.Data === "object" && !Array.isArray(payload.Data)
      ? payload.Data
      : payload;
  if (!sheet || typeof sheet !== "object" || Array.isArray(sheet)) {
    throw new Error(
      "M3HeroSheet must be a JSON object keyed by internal character ID"
    );
  }
  return sheet;
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
  const [charList, locHeroes, heroSheetPayload] = await Promise.all([
    fetchJson(CHAR_LIST_URL),
    fetchJson(LOC_HEROES_URL).catch(() => null),
    fetchHeroSheet(),
  ]);

  const locMap = buildLocMap(locHeroes);
  const heroSheet = unwrapHeroSheet(heroSheetPayload);

  // charList peut être { characters: [...] } ou directement [...]
  const raw = Array.isArray(charList)
    ? charList
    : Array.isArray(charList?.characters)
      ? charList.characters
      : Array.isArray(charList?.data)
        ? charList.data
        : [];
  if (!raw.length) {
    throw new Error("The official character list is empty or has an unknown shape");
  }

  const metadataErrors = [];
  const missingMetadata = [];
  const seenIds = new Set();
  const out = raw
    .map(c => {
      const id = safeStr(c.id || c.characterId || c.internalName || c.nameKey).trim();
      if (!id) return null;
      if (seenIds.has(id)) {
        throw new Error(`Duplicate internal character ID from API: ${id}`);
      }
      seenIds.add(id);

      const heroMetadata = heroSheet[id];
      let playerCharacter = false;
      if (!heroMetadata) {
        missingMetadata.push(id);
      } else if (typeof heroMetadata.player_Character !== "boolean") {
        metadataErrors.push(
          `${id}: invalid player_Character=${JSON.stringify(heroMetadata.player_Character)}`
        );
      } else {
        playerCharacter = heroMetadata.player_Character;
      }

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
        player_Character: playerCharacter,
      };
    })
    .filter(Boolean);

  if (metadataErrors.length) {
    throw new Error(
      `M3HeroSheet join failed for ${metadataErrors.length} character(s): ` +
        metadataErrors.slice(0, 20).join(", ")
    );
  }
  if (missingMetadata.length) {
    console.warn(
      `M3HeroSheet has no row for ${missingMetadata.length} API character(s); ` +
        `fail-closed as non-playable: ${missingMetadata.join(", ")}`
    );
  }

  const playableCount = out.filter(item => item.player_Character === true).length;
  await fs.mkdir("docs/data", { recursive: true });
  await fs.writeFile("docs/data/msf-characters.json", JSON.stringify(out, null, 2), "utf8");

  console.log(
    `OK: wrote ${out.length} characters (${playableCount} playable, ` +
      `${out.length - playableCount} non-playable) -> docs/data/msf-characters.json`
  );
  console.log("Sample:", out.slice(0, 5));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
