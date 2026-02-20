// scripts/fetch-iso-reco.mjs
import fs from "node:fs/promises";
import path from "node:path";

// Accepte plusieurs noms de variables (comme tes autres scripts)
const SHEET_ID =
  process.env.SHEET_ID ||
  process.env.SPREADSHEET_ID ||
  process.env.GOOGLE_SHEET_ID ||
  process.env.SHEETID;

const SHEET_NAME = process.env.SHEET_NAME || "ISO-reco";

if (!SHEET_ID) {
  console.error("Missing env SHEET_ID (or SPREADSHEET_ID / GOOGLE_SHEET_ID)");
  process.exit(1);
}

const OUT_FILE = "docs/data/iso-reco.json";

function normalizeKey(s) {
  return (s ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[-_]/g, "");
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function cleanCell(x) {
  return (x ?? "").toString().trim();
}

async function main() {
  const url =
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}` +
    `/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}`;

  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching CSV (${SHEET_NAME})`);

  const csv = await res.text();
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length);

  if (lines.length < 2) throw new Error("CSV empty / no data rows.");

  // Colonnes de ton onglet ISO-reco (d'après ta capture) :
  // A=0 character
  // B=1 ISO-reco-class
  // C=2 ISO-reco-matrix
  const idxChar = 0,
    idxClass = 1,
    idxMatrix = 2;

  // On sort un mapping simple par perso (clé normalisée)
  // + on garde les valeurs d'origine pour debug/affichage si besoin
  const out = {
    updatedAt: new Date().toISOString(),
    byCharacter: {},
  };

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);

    const character = cleanCell(cols[idxChar]);
    const isoClass = cleanCell(cols[idxClass]).toLowerCase();
    const isoMatrix = cleanCell(cols[idxMatrix]).toLowerCase(); // peut être vide

    if (!character) continue;

    const cKey = normalizeKey(character);
    out.byCharacter[cKey] = {
      character,         // ex: "SpiderMan"
      isoRecoClass: isoClass || null,   // ex: "raider"
      isoRecoMatrix: isoMatrix || null, // ex: "purple" (ou null si vide)
    };
  }

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");

  console.log(
    `✅ Wrote ${OUT_FILE} (${Object.keys(out.byCharacter).length} characters)`
  );
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
