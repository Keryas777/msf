import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(
  new URL("../docs/war-counter-lab.html", import.meta.url),
  "utf8"
);
const js = fs.readFileSync(
  new URL("../docs/war-counter-lab.js", import.meta.url),
  "utf8"
);

test("War Counter Vision reste privé et sans secret client", () => {
  assert.match(html, /noindex,nofollow/);
  assert.match(html, /MSF War Counter Vision/);
  assert.doesNotMatch(html + js, /GROQ_API_KEY|api\.groq\.com/);
});

test("une seule entrée accepte une ou plusieurs captures", () => {
  assert.match(html, /id="captureInput"[^>]*multiple/);
  assert.match(html, /image\/jpeg,image\/png,image\/webp/);
  assert.match(html, /id="analyzeButton"/);
  assert.doesNotMatch(html, /akazeValidationInput|strategy/);
});

test("l’analyse d’en-tête reste locale dans la page", () => {
  assert.match(js, /war-counter-header-vision\.js/);
  assert.match(js, /analyzeHeader\(/);
  assert.match(js, /greenMarkerRatio\(/);
  assert.match(js, /inferAttackSide\(/);
});

test("les puissances sont préremplies via le Worker dédié sans secret client", () => {
  assert.match(js, /\/api\/war-counter-vision\/read-power/);
  assert.match(js, /requestPowerRead\(/);
  assert.match(js, /leftPower: powerRead\.status === "ok"/);
  assert.match(js, /rightPower: powerRead\.status === "ok"/);
  assert.doesNotMatch(js, /GROQ_API_KEY|api\.groq\.com/);
});

test("aucun lien de production ajouté", () => {
  const index = fs.readFileSync(
    new URL("../docs/index.html", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(index, /war-counter-lab/);
});
