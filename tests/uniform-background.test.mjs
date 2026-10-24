// Tests de non-régression visuelle : fonds LoSP communs.
// Le fond concerne la PAGE, jamais les cartes, bannières ni illustrations internes.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const docsDir = fileURLToPath(new URL("../docs/", import.meta.url));
const rootPages = readdirSync(docsDir).filter(file => file.endsWith(".html"));
const uploadPages = readdirSync(path.join(docsDir, "upload"))
  .filter(file => file.endsWith(".html"))
  .map(file => "upload/" + file);
const allPages = [...rootPages, ...uploadPages];
const read = (relative) => readFileSync(path.join(docsDir, relative), "utf8");

test("le fond commun est bien défini dans style.css", () => {
  const css = read("style.css");
  assert.match(css, /background-image:\s*url\(["']\.\/Background\.webp["']\)/);
  assert.match(css, /background-size:\s*cover/);
  assert.doesNotMatch(css, /body\.page-war-history\s*\{[^}]*background-image:\s*none/);
  assert.doesNotMatch(css, /B8BAC9A5-A4C3-4466-8053-15935E15A00E\.jpeg/);
});

test("les styles de page ne réintroduisent pas les fonds anciens", () => {
  for (const file of readdirSync(docsDir).filter(file => file.endsWith(".css"))) {
    const css = read(file);
    assert.doesNotMatch(css, /eagle-pattern\.min\.png|00E91333-9E9F-44E5-9BE4-93AA78D3B650\.png/, file);
    assert.doesNotMatch(css, /background:\s*var\(--bg\)\s*;/, file);
  }
  assert.doesNotMatch(read("evolution-classement.css"), /\.page-evolution-ranking\s*\{\s*background\s*:/);
});

test("toutes les pages HTML disposent d'un fond Background.webp", () => {
  assert.equal(allPages.length, 37, "inventaire des pages HTML à actualiser");
  for (const file of allPages) {
    const html = read(file);
    const assets = [...html.matchAll(/<link\s+[^>]*href=["']([^"']+\.css(?:\?[^"']*)?)["'][^>]*>/g)]
      .map(match => match[1].split("?")[0])
      .map(href => path.normalize(path.join(path.dirname(file), href)));
    const hasSharedBackground = html.includes("Background.webp") ||
      assets.some(cssFile => {
        const css = read(cssFile);
        return /background-image:\s*url\(["']\.\/Background\.webp["']\)/.test(css);
      });
    assert.ok(hasSharedBackground, file + " : fond commun non déclaré");
  }
});

test("les bannières graphiques principales restent présentes", () => {
  assert.match(read("home.css"), /HeaderHome\.webp/);
  assert.match(read("war-stats.css"), /HeaderStatGA\.webp/);
  assert.match(read("codex.css"), /CodexHeader\.webp/);
});
