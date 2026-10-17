// Signalement NON destructif d'une annonce possible : la validation des règles reste humaine.
import { readFile, appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const config = JSON.parse(await readFile(resolve(ROOT, "docs/data/cosmic-config.json"), "utf8"));
    const current = config.season?.number;
    if (!Number.isInteger(current)) throw Error("Saison courante inconnue");
    const response = await fetch("https://marvelstrikeforce.com/en/updates", {
      signal: AbortSignal.timeout(12000),
      headers: { "User-Agent": "LoSP-Cosmic-Season-Monitor/1.0" }
    });
    if (!response.ok) throw Error("Index officiel HTTP " + response.status);
    const html = await response.text();
    const matches = [...html.matchAll(/(?:cosmic\s+)?crucible\s+season\s+(\d{1,3})/gi)]
      .map(match => Number(match[1]));
    const next = Math.max(0, ...matches.filter(n => n === current + 1));
    if (next && process.env.GITHUB_OUTPUT) {
      await appendFile(process.env.GITHUB_OUTPUT, "candidate_number=" + next + "\n");
    }
    console.log(next ? "Saison possible à vérifier : " + next : "Pas d'annonce reconnue de saison " + (current + 1));
  } catch (error) {
    // Le format du site officiel peut changer ; ne jamais provoquer de reset sur un échec réseau/parsing.
    console.warn("[cosmic-season-watch] Information indisponible : " + (error?.message || error));
  }
}
