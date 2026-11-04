import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("evolution chips keep the checkbox and centered LoSP emoji/name together", () => {
  const js = read("docs/evolution-classement.js");
  const css = read("docs/evolution-classement.css");
  assert.match(js, /check\.textContent = '✅'/);
  assert.match(js, /button\.append\(check, identity\)/);
  assert.match(js, /button\.addEventListener\('click'/);
  assert.match(js, /identity\.classList\.add\('evolutionAllianceChipIdentity--losp'\)/);
  assert.match(css, /\.evolutionAllianceChipCheck\s*\{[^}]*position:\s*absolute;[^}]*left:\s*11px/s);
  assert.match(css, /\.evolutionAllianceChipIdentity\s*\{[^}]*flex-direction:\s*row;[^}]*justify-content:\s*center/s);
  assert.match(css, /\.evolutionAllianceChipIdentity--losp\s*\{[^}]*flex-wrap:\s*nowrap/s);
});

test("ENDGAME red/orange names are split across two lines, without ellipsis", () => {
  const js = read("docs/evolution-classement.js");
  const css = read("docs/evolution-classement.css");
  const metadata = JSON.parse(read("docs/data/alliances.json"));
  const endgame = metadata.filter((a) => a.group === "endgame-revolution");
  assert.equal(endgame.length, 2);
  for (const alliance of endgame) {
    assert.deepEqual(alliance.displayParts[0], "END");
    assert.equal(alliance.displayParts[1], "GΔME R-évolution");
    assert.match(alliance.color, /^#[0-9A-Fa-f]{6}$/);
  }
  assert.match(js, /alliance\.group === 'endgame-revolution'/);
  assert.match(js, /name\.classList\.add\('evolutionAllianceChipName--two-lines'\)/);
  assert.match(js, /topLine\.append\(prefix, colored\)/);
  assert.match(js, /name\.append\(topLine, bottomLine\)/);
  assert.match(js, /bottomLine\.style\.color = colored\.style\.color/);
  assert.match(css, /\.evolutionAllianceChipName--two-lines\s*\{[^}]*flex-direction:\s*column/s);
  assert.match(css, /\.evolutionAllianceChipName\s*\{[^}]*text-overflow:\s*clip/s);
});

test("very narrow screens get one-column chips, and layout assets are cache-busted", () => {
  const css = read("docs/evolution-classement.css");
  const html = read("docs/evolution-classement.html");
  assert.match(css, /@media \(max-width: 380px\)\s*\{\s*\.evolutionAllianceFilterGrid\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(html, /evolution-classement\.css\?v=6/);
  assert.match(html, /evolution-classement\.js\?v=8/);
});
