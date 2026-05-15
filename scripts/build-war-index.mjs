import fs from "fs";
import path from "path";

const WAR_DIR = path.join(process.cwd(), "docs", "data", "war");
const OUT_FILE = path.join(WAR_DIR, "index.json");

const ALLIANCE_ORDER = ["zeus", "dionysos", "poseidon", "kronos"];

function isDateFolder(name) {
  return /^\d{4}-\d{2}-\d{2}$/.test(name);
}

function normalizeAllianceName(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .replace(/[-_‐-‒–—―﹘﹣－]/g, "");

  if (key === "zeus") return "zeus";
  if (key === "dionysos") return "dionysos";
  if (key === "poseidon" || key === "posseidon") return "poseidon";
  if (
    key === "kronos" ||
    key === "cronos" ||
    key === "chronos" ||
    key === "lospkronos"
  ) {
    return "kronos";
  }

  return "";
}

function sortAlliances(a, b) {
  const ia = ALLIANCE_ORDER.indexOf(a);
  const ib = ALLIANCE_ORDER.indexOf(b);

  return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
}

function main() {
  if (!fs.existsSync(WAR_DIR)) {
    throw new Error(`Dossier introuvable : ${WAR_DIR}`);
  }

  const entries = fs.readdirSync(WAR_DIR, { withFileTypes: true });

  const dates = entries
    .filter((entry) => entry.isDirectory() && isDateFolder(entry.name))
    .map((entry) => {
      const folder = path.join(WAR_DIR, entry.name);

      const alliances = fs
        .readdirSync(folder, { withFileTypes: true })
        .filter((file) => file.isFile() && file.name.toLowerCase().endsWith(".json"))
        .map((file) => file.name.replace(/\.json$/i, ""))
        .map(normalizeAllianceName)
        .filter((name) => ALLIANCE_ORDER.includes(name))
        .filter((name, index, array) => array.indexOf(name) === index)
        .sort(sortAlliances);

      return {
        date: entry.name,
        alliances,
      };
    })
    .filter((entry) => entry.alliances.length > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const alliancesInDates = [
    ...new Set(dates.flatMap((entry) => entry.alliances)),
  ].sort(sortAlliances);

  const index = {
    alliances: alliancesInDates.length ? alliancesInDates : ALLIANCE_ORDER,
    dates,
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(index, null, 2) + "\n", "utf8");

  console.log(`Index généré : ${OUT_FILE}`);
  console.log(`Alliances trouvées : ${index.alliances.join(", ")}`);
  console.log(`Dates indexées : ${dates.length}`);
}

main();