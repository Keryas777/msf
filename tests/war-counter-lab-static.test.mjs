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

test("le chargeur du catalogue personnages reste défini", () => {
  assert.match(js, /async function loadCatalog\(\)/);
  assert.match(js, /fetch\("data\/msf-characters\.json"/);
  assert.match(js, /catalogById = catalogIndex\.byId/);
});

test("les puissances sont reconnues localement sans appel réseau", () => {
  assert.match(js, /war-counter-power-reader\.js/);
  assert.match(js, /readPowerFromImageData\(/);
  assert.match(js, /leftPower: header\.powerRead\.left\.value/);
  assert.match(js, /rightPower: header\.powerRead\.right\.value/);
  assert.doesNotMatch(js, /read-power|workers\.dev|GROQ_API_KEY|api\.groq\.com/);
});

test("prévisualisation matchup charge teams et war-counters en lecture seule", () => {
  assert.match(js, /war-counter-matchup-preview\.js/);
  assert.match(js, /fetch\("data\/teams\.json"/);
  assert.match(js, /fetch\("data\/war-counters\.json"/);
  assert.match(js, /buildTeamLabels\(/);
  assert.match(js, /findMatchingCounters\(/);
  assert.match(js, /summarizeCounterComparison\(/);
  assert.doesNotMatch(js, /spreadsheets\.values\.update|appendCells|batchUpdate|Google Sheet.*POST/);
});

test("aucun lien de production ajouté", () => {
  const index = fs.readFileSync(
    new URL("../docs/index.html", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(index, /war-counter-lab/);
});
