import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pages = [
  "battleworld", "challenges", "challenges-category", "classements",
  "codex", "conseils", "cosmic", "cosmic-counters", "cosmic-defenses",
  "cosmic-defense-propose", "evolution", "evolution-classement",
  "historique-personnages", "index", "iso", "joueur", "mvp", "tcp",
  "war-admin", "war-attack-checker", "war-choose", "war-counters",
  "war-graphs", "war-history", "war-rankings", "war-stats",
];
const homeOnly = new Set([
  "evolution", "evolution-classement", "iso", "conseils",
  "challenges", "joueur", "codex",
]);

for (const page of pages) {
  test(`navigation monochrome : ${page}`, () => {
    const html = readFileSync(new URL(`../docs/${page}.html`, import.meta.url), "utf8");
    const navButtons = [...html.matchAll(
      /<(?:a|button)\b[^>]*class=["'][^"']*\b(?:backBtn|homeBtn)\b[^"']*["'][^>]*>[\s\S]*?<\/(?:a|button)>/g,
    )].map((match) => match[0]);

    for (const markup of navButtons) {
      assert.doesNotMatch(markup, /⬅️|🏠/, `${page}: emoji de navigation résiduel`);
    }

    if (homeOnly.has(page)) {
      assert.doesNotMatch(html, /class=["'][^"']*\bbackBtn\b/, `${page}: retour arrière inutile`);
      assert.doesNotMatch(html, /id=["']codexBack["']/, `${page}: retour Codex inutile`);
      assert.match(html, /⌂/, `${page}: symbole maison absent`);
    }

    if (page === "joueur") {
      assert.match(html, /class="homeBtn" href="\.\/home\.html"/);
    }

    if (page === "codex") {
      assert.match(html, /class="codexNavButton codexHomeButton"/);
    }
  });
}

test("navigation du hub Codex : une seule maison SVG, sans emojis", () => {
  const js = readFileSync(new URL("../docs/codex.js", import.meta.url), "utf8");
  const landing = js.match(/<section class="codexLandingHero"[\s\S]*?<\/section>/)?.[0];
  assert.ok(landing, "Bannière Codex introuvable");
  assert.equal((landing.match(/class="codexLandingNav /g) || []).length, 1);
  assert.doesNotMatch(landing, /codexLandingNav--back|⬅️|🏠/);
  assert.match(landing, /class="codexLandingNav codexLandingNav--home" href="\.\/home\.html"/);
  assert.match(landing, /<svg\b[^>]*aria-hidden="true"/);

  const css = readFileSync(new URL("../docs/codex.css", import.meta.url), "utf8");
  assert.match(css, /\.codexLandingNav--home\s*\{\s*left:\s*15px;\s*\}/);
});
