import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import {
  loadAllianceRegistry,
  normalizeAllianceKey,
} from "../scripts/lib/alliances-node.mjs";

const EXPECTED_KEYS = [
  "zeus",
  "athena",
  "kronos",
  "dionysos",
  "poseidon",
  "hades",
];

const FALLBACK_FILES = [
  "docs/alliances.js",
  "docs/app.js",
  "docs/iso.js",
  "docs/joueur.js",
  "docs/mvp.js",
  "docs/tcp.js",
  "docs/war-attack-checker.js",
  "docs/war-counters.js",
  "docs/war-graphs.js",
  "docs/war-history.js",
  "docs/war-rankings.js",
];

function readRepositoryFile(file) {
  return fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
}

function extractFallbackArray(source, file) {
  const marker = source.indexOf("FALLBACK_ALLIANCES");
  const start = source.indexOf("[", marker);

  assert.notEqual(marker, -1, `${file}: FALLBACK_ALLIANCES is missing`);
  assert.notEqual(start, -1, `${file}: fallback array is missing`);

  let depth = 0;

  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "[") depth += 1;
    if (source[index] === "]") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }

  assert.fail(`${file}: fallback array is not closed`);
}

test("Node alliance registry exposes six independent alliances in order", () => {
  const registry = loadAllianceRegistry();

  assert.deepEqual(registry.knownKeys, EXPECTED_KEYS);
  assert.equal(registry.alliances.length, 6);
  assert.equal(new Set(registry.knownKeys).size, 6);
  assert.equal(new Set(registry.alliances.map((alliance) => alliance.order)).size, 6);

  const athena = registry.allianceByKey.get("athena");
  const hades = registry.allianceByKey.get("hades");

  assert.deepEqual(
    registry.alliances.map((alliance) => alliance.order),
    [1, 2, 3, 4, 5, 6]
  );
  assert.equal(athena?.name, "Athéna");
  assert.equal(athena?.emoji, "🦉");
  assert.equal(athena?.color, "#F28C28");
  assert.equal(hades?.name, "Hadès");
  assert.equal(hades?.emoji, "🔥");
  assert.equal(hades?.color, "#1EA164");
});

test("Node alliance normalization keeps Athéna and Hadès separate", () => {
  const cases = new Map([
    ["Athéna", "athena"],
    ["Athena", "athena"],
    ["athena", "athena"],
    ["Hadès", "hades"],
    ["Hades", "hades"],
    ["hades", "hades"],
  ]);

  for (const [input, expected] of cases) {
    assert.equal(normalizeAllianceKey(input), expected);
  }

  assert.notEqual(normalizeAllianceKey("Athéna"), normalizeAllianceKey("Hadès"));
});

test("Browser helper fallback exposes the same six alliances", () => {
  const source = readRepositoryFile("docs/alliances.js");
  const context = vm.createContext({ window: {} });

  vm.runInContext(source, context, { filename: "docs/alliances.js" });

  const helper = context.window.LoSPAlliances;
  const alliances = helper.getKnownAlliances();
  const keys = Array.from(alliances, (alliance) => alliance.key);

  assert.deepEqual(keys, EXPECTED_KEYS);
  assert.equal(helper.getAllianceKey("Athéna"), "athena");
  assert.equal(helper.getAllianceKey("Athena"), "athena");
  assert.equal(helper.getAllianceKey("Hadès"), "hades");
  assert.equal(helper.getAllianceKey("Hades"), "hades");
  assert.equal(helper.getAllianceMeta("athena").color, "#F28C28");
  assert.equal(helper.getAllianceMeta("hades").color, "#1EA164");
});

test("Every browser fallback contains the same six ordered alliances", () => {
  const expectedOrders = new Map(
    EXPECTED_KEYS.map((key, index) => [key, index + 1])
  );

  for (const file of FALLBACK_FILES) {
    const fallback = extractFallbackArray(readRepositoryFile(file), file);
    const entries = [
      ...fallback.matchAll(
        /key:\s*"([^"]+)"[\s\S]*?order:\s*(\d+)/g
      ),
    ].map((match) => [match[1], Number(match[2])]);

    assert.deepEqual(
      entries,
      [...expectedOrders],
      `${file}: fallback keys or order differ`
    );
    assert.match(fallback, /key:\s*"athena"[\s\S]*?#F28C28/);
    assert.match(fallback, /key:\s*"hades"[\s\S]*?#1EA164/);
  }
});

test("Alliance filter grids stay balanced and touch-friendly at narrow widths", () => {
  for (const file of [
    "docs/tcp.css",
    "docs/mvp.css",
    "docs/war-rankings.css",
  ]) {
    const css = readRepositoryFile(file);

    assert.match(
      css,
      /\.filters\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/
    );
    assert.match(
      css,
      /@media\s*\(max-width:\s*520px\)[\s\S]*?\.filters\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/
    );
    assert.match(css, /\.filterToggle\s*\{[\s\S]*?min-width:\s*0/);
    assert.match(
      css,
      /@media\s*\(max-width:\s*520px\)[\s\S]*?\.filterToggle\s*\{[\s\S]*?min-height:\s*58px/
    );
  }

  const appCss = readRepositoryFile("docs/style.css");
  assert.match(
    appCss,
    /\.filters\.filters--twoColumns\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/
  );

  const uploadPage = readRepositoryFile("docs/upload/athena.html");
  assert.match(uploadPage, /<meta name="viewport" content="width=device-width,initial-scale=1">/);
  assert.match(uploadPage, /<title>Upload Athéna<\/title>/);
  assert.match(uploadPage, /const ALLIANCE = "athena";/);
  assert.match(
    uploadPage,
    /https:\/\/msf-upload\.deliriousfan7\.workers\.dev\/\$\{ALLIANCE\}/
  );
  assert.doesNotMatch(uploadPage, /const ALLIANCE = "hades";/);
  assert.match(uploadPage, /button\s*\{[\s\S]*?min-height:48px/);
  assert.match(
    uploadPage,
    /@media \(max-width:520px\)\{[\s\S]*?body\{[\s\S]*?padding:14px/
  );
});

test("Alliance selectors retain registered alliances before player data exists", () => {
  assert.match(
    readRepositoryFile("docs/joueur.js"),
    /new Set\(state\.alliances\.map\(\(alliance\) => alliance\.key\)\)/
  );
  assert.match(
    readRepositoryFile("docs/war-history.js"),
    /const fromRegistry = allianceMeta\.map\(\(alliance\) => alliance\.key\)/
  );
  assert.match(
    readRepositoryFile("docs/war-attack-checker.js"),
    /const alliances = ALLIANCES\.filter\(\(alliance\) =>[\s\S]*?isAllianceAllowed\(alliance\.key\)/
  );
});
