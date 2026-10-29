import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../docs/app.js", import.meta.url), "utf8");
const boot = `  boot().catch((e) => {
    console.error("[app] boot error:", e);
  });`;
assert.ok(source.includes(boot), "Unexpected app bootstrap: update test harness");

class FakeElement {
  constructor(tag) {
    this.tagName = tag;
    this.className = "";
    this.children = [];
    this.isConnected = true;
    this.classList = { add: () => {} };
  }
  append(...children) { this.children.push(...children); }
  appendChild(node) { this.children.push(node); return node; }
  setAttribute() {}
  get lastChild() { return this.children.at(-1); }
}
const official = "https://assets.marvelstrikeforce.com/imgs/";
const awakeIcon = official +
  "ICON_ABILITY_MATERIAL_UNIQUE_ABILITY_MAT_ARCHANGEL_PASSIVE_85673e31.png";

function harness({ materials = [], unavailable = false } = {}) {
  const calls = [];
  const context = {
    URL,
    console: { error: () => {} },
    window: { location: { href: "https://example.test/docs/index.html" } },
    document: {
      querySelector: () => null,
      createElement: tag => new FakeElement(tag),
    },
    fetch: async url => {
      calls.push(String(url));
      if (String(url).includes("/api/public/awakened-materials")) {
        return unavailable
          ? { ok: false, status: 503 }
          : { ok: true, json: async () => ({ schemaVersion: 1,
              status: "ok", materials }) };
      }
      return { ok: true, json: async () => ({ currentPath: "" }) };
    },
  };
  const instrumented = source.replace(boot,
    "window.__rosterTest = { getAbilityMaterialTier, isAwakenedAbilityLevel, detailAbilities };");
  runInNewContext(instrumented, context, { filename: "app.js" });
  return { ...context.window.__rosterTest, calls };
}

function materialImages(node) {
  return [
    ...(node.className === "rankDetailAbilityMaterial" ? [node] : []),
    ...node.children.flatMap(materialImages),
  ];
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test("material icon tier follows the four ability-specific level grids", () => {
  const { getAbilityMaterialTier: tier, isAwakenedAbilityLevel: awakened } = harness();
  const grids = {
    basic: [null, null, "T1", "T1", "T2", "T2", "T3", "T4"],
    special: [null, null, "T1", "T2", "T2", "T3", "T3", "T4"],
    ultimate: [null, null, "T1", "T2", "T2", "T3", "T3", "T4"],
    passive: [null, null, "T2", "T3", "T3", "T4"],
  };
  for (const [type, expected] of Object.entries(grids)) {
    expected.forEach((value, level) => assert.equal(tier(type, level), value,
      type + " level " + level));
  }
  assert.equal(tier("basic", 8), null);
  assert.equal(tier("passive", 6), null);
  assert.equal(awakened("basic", 8), true);
  assert.equal(awakened("passive", 6), true);
  assert.equal(awakened("passive", 5), false);
});

test("normal levels display authentic icons; unknown levels remain blank", async () => {
  const { detailAbilities, calls } = harness();
  const grid = detailAbilities({ abilities: {
    basic: 7, special: 6, ultimate: 4, passive: 5,
  } }, "Oath");
  const icons = materialImages(grid);
  assert.equal(icons.length, 4);
  assert.ok(icons.every(image => image.src.startsWith(official)));
  assert.ok(icons.every(image => image.alt.includes("T")));
  const unknown = detailAbilities({ abilities: {} }, "Oath");
  assert.equal(materialImages(unknown).length, 0);
  await flush();
  assert.equal(calls.filter(url => url.includes("/awakened-materials")).length, 0);
});

test("only reached awakened levels show the character-specific official icon", async () => {
  const { detailAbilities, calls } = harness({ materials: [
    { characterId: "ARCHANGEL", abilityType: "PASSIVE", iconUrl: awakeIcon },
    { characterId: "ARCHANGEL", abilityType: "ULTIMATE",
      iconUrl: "http://invalid.example/unsafe.png" },
  ] });
  const grid = detailAbilities({ abilities: {
    basic: 7, special: 7, ultimate: 7, passive: 6,
  } }, "Archangel");
  await flush();
  const icons = materialImages(grid);
  assert.equal(icons.length, 4);
  assert.equal(icons.filter(image => image.src === awakeIcon).length, 1);
  const invalid = detailAbilities({ abilities: {
    basic: 7, special: 7, ultimate: 8, passive: 5,
  } }, "Archangel");
  await flush();
  assert.equal(materialImages(invalid).length, 3, "Never display an unsafe awakened URL");
  assert.equal(calls.filter(url => url.includes("/awakened-materials")).length, 1,
    "Share the public catalog fetch across character cards");
});

test("unavailable awakened catalog never hides ordinary ability materials", async () => {
  const { detailAbilities } = harness({ unavailable: true });
  const grid = detailAbilities({ abilities: {
    basic: 7, special: 7, ultimate: 8, passive: 5,
  } }, "Archangel");
  await flush();
  assert.equal(materialImages(grid).length, 3);
});

test("localized character name from nameKey is used before English fallback", () => {
  const characters = JSON.parse(readFileSync(
    new URL("../docs/data/msf-characters.json", import.meta.url), "utf8"));
  const oath = characters.find(character => character.id === "Oath");
  assert.equal(oath?.nameKey, "Serment");
  assert.match(source, /info\?\.nameFr \|\| info\?\.nameKey \|\| info\?\.nameEn \|\| charId/);
});
