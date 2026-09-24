import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../docs/war-counter-lab.html", import.meta.url), "utf8");
const entry = fs.readFileSync(new URL("../docs/war-counter-lab-entry.js", import.meta.url), "utf8");

test("le labo charge l'entrée qui privilégie le Sheet direct", () => {
  assert.match(html, /war-counter-lab-entry\.js\?v=r7-entry-13/);
  assert.match(html, /id="counterSourceStatus"/);
  assert.match(entry, /loadLiveWarCounters/);
  assert.match(entry, /data\/war-counters\.json/);
  assert.match(entry, /source === "sheet-live"/);
  assert.match(entry, /json-fallback/);
});

test("l'interception reste limitée au seul war-counters.json", () => {
  assert.match(entry, /isWarCountersJsonRequest/);
  assert.match(entry, /url\.pathname === localCountersUrl\.pathname/);
  assert.match(entry, /return nativeFetch\(input, init\)/);
});

test("le module Vision versionné reste isolé du bootstrap d'entrée", () => {
  assert.match(entry, /import\("\.\/war-counter-lab\.js\?v=r7-vertical-1"\)/);
  assert.doesNotMatch(entry, /AKAZE|R6\.6|readPowerFromImageData|analyzePortraitOccupancy/);
});
