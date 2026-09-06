// scripts/fetch-iso-reco.mjs
import fs from "node:fs/promises";
import path from "node:path";

const ROSTERS_FILE = "docs/data/rosters.json";
const OUT_FILE = "docs/data/iso-reco.json";

const SOURCE_PLAYER = "Keryas I";
const SOURCE_ALLIANCE = "Zeus";

function normalizeKey(s) {
  return (s ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .replace(/[-_]/g, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]/g, "");
}

async function main() {
  const raw = await fs.readFile(ROSTERS_FILE, "utf8");
  const rosters = JSON.parse(raw);

  if (!Array.isArray(rosters)) {
    throw new Error(`${ROSTERS_FILE} is not an array`);
  }

  const source = rosters.find((row) => {
    return (
      normalizeKey(row?.player) === normalizeKey(SOURCE_PLAYER) &&
      normalizeKey(row?.alliance) === normalizeKey(SOURCE_ALLIANCE)
    );
  });

  if (!source) {
    throw new Error(
      `Source roster not found: ${SOURCE_PLAYER} (${SOURCE_ALLIANCE})`
    );
  }

  const chars = source?.chars && typeof source.chars === "object" ? source.chars : {};
  const iso = source?.iso && typeof source.iso === "object" ? source.iso : {};

  const out = {
    updatedAt: new Date().toISOString(),
    byCharacter: {},
  };

  for (const charKeyRaw of Object.keys(chars)) {
    const charKey = normalizeKey(charKeyRaw);
    if (!charKey) continue;

    const picked = iso[charKeyRaw] ?? iso[charKey] ?? null;
    const isoClass = (picked?.isoClass ?? "").toString().trim().toLowerCase();
    const isoColor = (picked?.isoColor ?? "").toString().trim().toLowerCase();

    out.byCharacter[charKey] = {
      character: charKeyRaw,
      isoRecoClass: isoClass || null,
      isoRecoMatrix: isoColor || null,
    };
  }

  const count = Object.keys(out.byCharacter).length;
  if (!count) {
    throw new Error(`Source roster is empty: ${SOURCE_PLAYER} (${SOURCE_ALLIANCE})`);
  }

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");

  console.log(
    `✅ Wrote ${OUT_FILE} from ${SOURCE_PLAYER} (${SOURCE_ALLIANCE}) (${count} characters)`
  );
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
