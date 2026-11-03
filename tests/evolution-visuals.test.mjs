import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

function read(path) {
  return readFileSync(new URL("../" + path, import.meta.url), "utf8");
}

const context = { window: {} };
runInNewContext(read("docs/evolution-visuals.js"), context);
const { abilityMaterial, isoVisual, awakenedMaterialUrl, officialAssetUrl } =
  context.window.LoSPEvolutionVisuals;
const icons = JSON.parse(read("docs/data/iso-icons.json"));

test("material icon follows actual basic/special/ultimate/passive level grids", () => {
  const tiers = {
    "Capacité Basique": [null, null, "T1", "T1", "T2", "T2", "T3", "T4"],
    "Capacité Spéciale": [null, null, "T1", "T2", "T2", "T3", "T3", "T4"],
    "Capacité Ultime": [null, null, "T1", "T2", "T2", "T3", "T3", "T4"],
    "Capacité Passive": [null, null, "T2", "T3", "T3", "T4"],
  };
  for (const [label, expected] of Object.entries(tiers)) {
    for (let level = 0; level < expected.length; level++) {
      const material = abilityMaterial(label, String(level));
      assert.equal(material?.tier || null, expected[level], label + " at " + level);
      if (material) assert.equal(officialAssetUrl(material.url), true);
    }
  }
  assert.match(abilityMaterial("Capacité Basique", "7").url, /ORANGE_ABILITY_MAT/);
  assert.match(abilityMaterial("Capacité Passive", "5").url, /ORANGE_ABILITY_MAT/);
});

test("awakened levels are character-specific and never substituted with an ordinary material", () => {
  for (const label of ["Capacité Basique", "Capacité Spéciale", "Capacité Ultime"]) {
    const material = abilityMaterial(label, 8);
    assert.equal(material.awakened, true);
    assert.equal(material.url, null);
  }
  assert.equal(abilityMaterial("Capacité Passive", 6).awakened, true);
  assert.equal(abilityMaterial("Capacité Basique", 9), null);
  assert.equal(abilityMaterial("Capacité Passive", 7), null);
  assert.equal(abilityMaterial("Capacité Basique", "—"), null);
  assert.equal(abilityMaterial("Puissance", 7), null);
});

test("ISO class icon and exact tier-local level use published catalog, without English class names", () => {
  const cases = [
    { max: 5, color: "green", level: 5 },
    { max: 6, color: "blue", level: 1 },
    { max: 10, color: "blue", level: 5 },
    { max: 11, color: "purple", level: 1 },
    { max: 15, color: "purple", level: 5 },
  ];
  for (const { max, color, level } of cases) {
    const visual = isoVisual({ isoClass: "raider", isoMax: max }, icons);
    assert.equal(visual.color, color);
    assert.equal(visual.level, level);
    assert.equal(visual.label, "niveau " + level);
    assert.equal(visual.url, icons.raider[color]);
    assert.match(visual.description, /Fantassin/);
    assert.equal(visual.approximate, false);
  }
});

test("orange uses a disclosed recolored class shape; unknown class retains French level text", () => {
  const orange = isoVisual({ isoClass: "striker", isoMax: 18 }, icons);
  assert.equal(orange.color, "orange");
  assert.equal(orange.level, 3);
  assert.equal(orange.approximate, true);
  assert.equal(orange.url, icons.striker.purple);
  assert.match(orange.description, /Attaquant/);
  const missing = isoVisual({ isoClass: "unknown", isoMax: 13 }, icons);
  assert.equal(missing.url, null);
  assert.equal(missing.label, "violet · niveau 3");
  assert.equal(isoVisual({ isoClass: "striker", isoMax: 0 }, icons), null);
  assert.equal(isoVisual({ isoClass: "striker", isoMax: 21 }, icons), null);
});

test("awakened materials resolve only a matching character/type and safe official image", () => {
  const url = "https://assets.marvelstrikeforce.com/imgs/ICON_ABILITY_MATERIAL_UNIQUE_ABILITY_MAT_ARCHANGEL_PASSIVE_85673e31.png";
  const materials = [
    { characterId: "ARCHANGEL", abilityType: "PASSIVE", iconUrl: url },
    { characterId: "ARCHANGEL", abilityType: "ULTIMATE", iconUrl: "https://evil.example/bad.png" },
  ];
  assert.equal(awakenedMaterialUrl(materials, "Archangel", "passive"), url);
  assert.equal(awakenedMaterialUrl(materials, "SpiderMan", "passive"), null);
  assert.equal(awakenedMaterialUrl(materials, "Archangel", "ultimate"), null);
  assert.equal(officialAssetUrl("javascript:alert(1)"), false);
});

test("Evolution loads visuals before renderer and keeps snapshot comparison labels intact", () => {
  const html = read("docs/evolution.html");
  assert.ok(html.indexOf("evolution-visuals.js?v=1") < html.indexOf("evolution.js?v=12"));
  const source = read("docs/evolution.js");
  assert.match(source, /renderIsoValue\(newValue, card\.isoAfter, change\.newValue\)/);
  assert.match(source, /renderAbilityMaterial\(newValue, change, card, awakenedSlots\)/);
  assert.match(source, /generation !== compareGeneration/);
  assert.match(source, /fetchJson\(FILES\.isoIcons\)\.catch/);
});
