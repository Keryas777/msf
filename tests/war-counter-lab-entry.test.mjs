import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../docs/war-counter-lab.html", import.meta.url), "utf8");
const entry = fs.readFileSync(new URL("../docs/war-counter-lab-entry.js", import.meta.url), "utf8");

test("le labo charge l'entrée qui privilégie le Sheet direct", () => {
  assert.match(html, /war-counter-lab-entry\.js\?v=r7-entry-16/);
  assert.match(html, /id="counterSourceStatus"/);
  assert.match(entry, /loadLiveWarCounters/);
  assert.match(entry, /data\/war-counters\.json/);
  assert.match(entry, /source === "sheet-live"/);
  assert.match(entry, /fallbackUrl:\s*localCountersUrl\.toString\(\)/);
});

test("l'interception reste limitée aux sources War Counters attendues", () => {
  assert.match(entry, /isWarCountersJsonRequest/);
  assert.match(entry, /url\.pathname === localCountersUrl\.pathname/);
  assert.match(entry, /isTeamsJsonRequest/);
  assert.match(entry, /url\.pathname === localTeamsUrl\.pathname/);
  assert.match(entry, /createSharedWarCounterTeamsResponse\(\)/);
  assert.match(entry, /return nativeFetch\(input, init\)/);
});

test("le module Vision versionné reste isolé du bootstrap d'entrée", () => {
  assert.match(entry, /war-counter-lab-stability\.js\?v=1/);
  assert.match(entry, /installWarCounterLabStability\(\)/);
  assert.match(entry, /war-counter-write-team-source\.js\?v=2/);
  assert.match(entry, /war-counter-write-manual-teams\.js\?v=2/);
  assert.match(entry, /war-counter-write-ui\.js\?v=r3/);
  assert.match(entry, /initWarCounterManualTeamUi\(\)/);
  assert.match(entry, /import\("\.\/war-counter-lab\.js\?v=r7-vertical-2"\)/);
  assert.doesNotMatch(entry, /AKAZE|R6\.6|readPowerFromImageData|analyzePortraitOccupancy/);
});
