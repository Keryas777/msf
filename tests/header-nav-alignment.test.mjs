// Non-régression : les boutons Retour et Accueil partagent leur en-tête.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const docs = fileURLToPath(new URL("../docs/", import.meta.url));
const pages = readdirSync(docs).filter(name => name.endsWith(".html"));
const homeOnly = new Set([
  "evolution.html", "evolution-classement.html", "iso.html", "conseils.html",
  "challenges.html", "joueur.html", "codex.html",
]);

for (const page of pages) {
  test("navigation dans le header : " + page, () => {
    const html = readFileSync(path.join(docs, page), "utf8");
    const headers = [...html.matchAll(/<header\b[^>]*>[\s\S]*?<\/header>/g)]
      .map(match => ({start: match.index, end: match.index + match[0].length}));
    const buttons = [...html.matchAll(/<(?:a|button)\b[^>]*\bclass=["'][^"']*\b(?:backBtn|homeBtn)\b[^"']*["'][^>]*>/g)]
      .map(match => ({ index: match.index, kind: /\bbackBtn\b/.test(match[0]) ? "back" : "home" }));

    const paired = buttons.some(button => button.kind === "back") &&
      buttons.some(button => button.kind === "home");

    if (paired || page === "conseils.html") {
      const headerFor = button => headers.findIndex(h => button.index > h.start && button.index < h.end);
      const indexes = buttons.map(headerFor);
      assert.ok(indexes.every(index => index >= 0), page + " : bouton hors du header");
      assert.equal(new Set(indexes).size, 1, page + " : boutons répartis sur plusieurs headers");
    }

    if (homeOnly.has(page)) {
      assert.ok(buttons.every(button => button.kind !== "back"), page + " : retour non souhaité");
    }
  });
}
