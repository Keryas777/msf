// Changement de saison CC : sans dépendances, fail-closed, GitHub Actions ou exécution locale.
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateCosmicLocalization } from "./cosmic-localization.mjs";

const DEFAULT_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const FILES = Object.freeze({
  config: "cosmic-config.json",
  counters: "cosmic-counters.json",
  defenses: "cosmic-defenses.json"
});

function validSeasonConfig(config) {
  const season = config?.season;
  if (!Number.isInteger(season?.number) || season.number <= 0 ||
      season.id !== "season-" + season.number ||
      !season.name || !season.sourceUrl || !season.firstTrialAt || !season.startAt ||
      !Number.isFinite(Date.parse(season.startAt)) ||
      !Number.isFinite(Date.parse(season.firstTrialAt))) {
    throw new Error("Métadonnées de saison incomplètes ou invalides");
  }
  const url = new URL(season.sourceUrl);
  if (url.protocol !== "https:" || url.hostname !== "marvelstrikeforce.com" ||
      !url.pathname.includes("/updates/")) {
    throw new Error("Une source officielle Scopely est exigée");
  }
  if (season.verified !== "official-announcement") {
    throw new Error("Saison non vérifiée à partir de l'annonce officielle");
  }
  if (!config.globalRule?.title || !config.globalRule?.rule) {
    throw new Error("Règle globale manquante");
  }
  if (!Array.isArray(config.rooms) || config.rooms.length !== 6 ||
      new Set(config.rooms.map(room => room?.id)).size !== 6 ||
      config.rooms.some(room => !Number.isInteger(room?.id) || room.id < 1 ||
        room.id > 6 || !room.label || !room.rule)) {
    throw new Error("Les six salles doivent être entièrement renseignées");
  }
  if (Date.parse(season.firstTrialAt) < Date.parse(season.startAt)) {
    throw new Error("La première épreuve précède l'ouverture des défenses");
  }
  return season;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function pathExists(path) {
  try { await access(path); return true; }
  catch (error) { if (error?.code === "ENOENT") return false; throw error; }
}

// Export pour tests ; aucun accès réseau, aucune supposition sur les futures saisons.
export async function rollCosmicSeason({ root = DEFAULT_ROOT, now = new Date() } = {}) {
  const base = join(root, "docs", "data");
  const pendingPath = join(base, "cosmic-next-season.json");
  let pending;
  try { pending = await readJson(pendingPath); }
  catch (error) {
    if (error?.code === "ENOENT") return { status: "no-pending" };
    throw error;
  }
  if (pending === null) return { status: "no-pending" };

  const next = validSeasonConfig(pending);
  // Bloquer toute réinitialisation si la règle globale ou une salle n'a pas
  // été revue en privilégiant les textes officiels réellement en français.
  validateCosmicLocalization(pending);
  const paths = Object.fromEntries(
    Object.entries(FILES).map(([key, filename]) => [key, join(base, filename)])
  );
  // Lire et valider les trois fichiers avant toute écriture.
  const originals = {};
  for (const [key, path] of Object.entries(paths)) {
    originals[key] = await readFile(path, "utf8");
  }
  const current = JSON.parse(originals.config);
  const previous = validSeasonConfig(current);
  const counters = JSON.parse(originals.counters);
  const defenses = JSON.parse(originals.defenses);
  if (!Array.isArray(counters) || !Array.isArray(defenses)) {
    throw new Error("Les contres et défenses doivent être des tableaux JSON");
  }
  // Protection contre un basculement qui archiverait des lignes associées à une autre saison.
  for (const [kind, rows] of [["contres", counters], ["défenses", defenses]]) {
    if (rows.some(row => !row || row.season !== previous.id)) {
      throw new Error("Lignes " + kind + " sans saison active explicite : corriger avant archivage");
    }
  }
  if (next.number !== previous.number + 1) {
    throw new Error("La prochaine saison doit succéder immédiatement à la saison active");
  }
  if (Date.parse(next.startAt) <= Date.parse(previous.startAt)) {
    throw new Error("Date de début de la nouvelle saison incohérente");
  }
  const timestamp = new Date(now).getTime();
  if (!Number.isFinite(timestamp)) throw new Error("Horloge invalide");
  if (timestamp < Date.parse(next.startAt)) {
    return { status: "scheduled", season: next.id, startAt: next.startAt };
  }

  const archive = join(base, "cosmic-archive", previous.id);
  if (await pathExists(archive)) {
    throw new Error("Archive déjà existante : " + archive + " — intervention humaine nécessaire");
  }
  await mkdir(join(base, "cosmic-archive"), { recursive: true });
  await mkdir(archive, { recursive: false });
  await Promise.all(Object.entries(FILES).map(([key]) =>
    writeFile(join(archive, FILES[key]), originals[key], { flag: "wx" })
  ));
  await writeFile(join(archive, "archive-meta.json"),
    JSON.stringify({
      schemaVersion: 1,
      archivedSeason: previous.id,
      replacedBy: next.id,
      rolloverAt: new Date(timestamp).toISOString(),
      sourceUrl: next.sourceUrl
    }, null, 2) + "\n", { flag: "wx" });
  // GitHub Actions versionne le tout dans un unique commit : pas d'état intermédiaire publié.
  await writeFile(paths.config, JSON.stringify(pending, null, 2) + "\n");
  await writeFile(paths.counters, "[]\n");
  await writeFile(paths.defenses, "[]\n");
  await writeFile(pendingPath, "null\n");
  return { status: "rolled", from: previous.id, to: next.id, archive };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await rollCosmicSeason();
    console.log(JSON.stringify(result));
    if (process.env.GITHUB_OUTPUT) {
      const { appendFile } = await import("node:fs/promises");
      await appendFile(process.env.GITHUB_OUTPUT, "rolled=" + (result.status === "rolled") + "\n");
    }
  } catch (error) {
    console.error("[cosmic-season]", error?.stack || error);
    process.exitCode = 1;
  }
}
