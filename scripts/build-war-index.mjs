import fs from "fs";
import path from "path";

const WAR_DIR = path.join(process.cwd(), "docs", "data", "war");
const OUT_FILE = path.join(WAR_DIR, "index.json");
const ALLOWED_ALLIANCES = ["zeus", "dionysos", "poseidon"];

function isDateFolder(name) {
  return /^\d{4}-\d{2}-\d{2}$/.test(name);
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

      const alliances = fs.readdirSync(folder, { withFileTypes: true })
        .filter((file) => file.isFile() && file.name.endsWith(".json"))
        .map((file) => file.name.replace(/\.json$/i, ""))
        .filter((name) => ALLOWED_ALLIANCES.includes(name))
        .sort((a, b) => ALLOWED_ALLIANCES.indexOf(a) - ALLOWED_ALLIANCES.indexOf(b));

      return {
        date: entry.name,
        alliances
      };
    })
    .filter((entry) => entry.alliances.length > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const index = {
    alliances: ALLOWED_ALLIANCES,
    dates
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(index, null, 2) + "\n", "utf8");
  console.log(`Index généré : ${OUT_FILE}`);
}

main();
