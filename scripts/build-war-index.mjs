import fs from "fs";
import path from "path";
import {
  loadAllianceRegistry,
  normalizeAllianceKey,
  sortAllianceKeys,
} from "./lib/alliances-node.mjs";

const WAR_DIR = path.join(process.cwd(), "docs", "data", "war");
const OUT_FILE = path.join(WAR_DIR, "index.json");
const DRY_RUN = process.env.DRY_RUN === "1";

function isDateFolder(name) {
  return /^\d{4}-\d{2}-\d{2}$/.test(name);
}

function warnUnknownAllianceFile(date, filename) {
  console.warn(
    `Warning: fichier d'alliance inconnu ignoré dans ${date} : ${filename}`,
  );
}

function main() {
  if (!fs.existsSync(WAR_DIR)) {
    throw new Error(`Dossier introuvable : ${WAR_DIR}`);
  }

  const registry = loadAllianceRegistry();
  const knownKeys = new Set(registry.knownKeys);
  const entries = fs.readdirSync(WAR_DIR, { withFileTypes: true });

  const dates = entries
    .filter((entry) => entry.isDirectory() && isDateFolder(entry.name))
    .map((entry) => {
      const folder = path.join(WAR_DIR, entry.name);
      const allianceKeys = new Set();

      for (const file of fs.readdirSync(folder, { withFileTypes: true })) {
        if (!file.isFile() || !file.name.toLowerCase().endsWith(".json")) {
          continue;
        }

        const filename = file.name.replace(/\.json$/i, "");
        const allianceKey = normalizeAllianceKey(filename);

        if (!allianceKey || !knownKeys.has(allianceKey)) {
          warnUnknownAllianceFile(entry.name, file.name);
          continue;
        }

        allianceKeys.add(allianceKey);
      }

      return {
        date: entry.name,
        alliances: sortAllianceKeys([...allianceKeys]),
      };
    })
    .filter((entry) => entry.alliances.length > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const alliancesInDates = sortAllianceKeys([
    ...new Set(dates.flatMap((entry) => entry.alliances)),
  ]);

  const index = {
    alliances: alliancesInDates,
    dates,
  };

  if (DRY_RUN) {
    console.log("DRY_RUN=1 : aucun fichier écrit.");
    console.log(`Chemin qui aurait été écrit : ${OUT_FILE}`);
    console.log(`Dates indexées : ${dates.length}`);
    console.log(`Alliances trouvées : ${index.alliances.join(", ") || "(aucune)"}`);
    console.log(JSON.stringify(index, null, 2));
    return;
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(index, null, 2) + "\n", "utf8");

  console.log(`Index généré : ${OUT_FILE}`);
  console.log(`Alliances trouvées : ${index.alliances.join(", ")}`);
  console.log(`Dates indexées : ${dates.length}`);
}

main();
