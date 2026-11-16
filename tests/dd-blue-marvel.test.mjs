import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {evaluateDimension} from "../docs/dd-ranking-engine.mjs";

const config = JSON.parse(readFileSync(new URL("../docs/data/dark-dimensions.json", import.meta.url)));
const traits = JSON.parse(readFileSync(new URL("../docs/data/dd-character-traits.json", import.meta.url)));
const blue = config.dimensions.find(d => d.key === "target-blue-marvel");

test("Blue Marvel has ten ordered missions and the official ray layout", () => {
  assert.ok(blue);
  assert.equal(blue.official.combatNodesPerTeam, 10);
  assert.equal(blue.official.startingRoomId, "A1");
  assert.deepEqual(blue.nodes.map(n => n.id), ["A2","B2","B1","C1","C2","C5","C6","D6","D5","E5"]);
  assert.equal(new Set(blue.map.combatNodeIds).size, 10);
  assert.equal(blue.map.visualEdges.length, 10);
});

test("Blue Marvel mission ISO thresholds and official event tag", () => {
  assert.deepEqual(blue.nodes.map(n => n.requirement.alternatives[0].minIsoTier),
    [14,14,15,14,15,14,15,14,15,15]);
  assert.deepEqual(blue.nodes.map(n => n.requirement.alternatives[0].tagIds),
    [[],["Conqueror"],["Conqueror"],["Cosmic"],["Cosmic"],["City"],["City"],["Global"],["Global"],[]]);
  for (const i of [3,4,5,6,7,8])
    assert.deepEqual(blue.nodes[i].requirement.alternatives[0].excludeTagIds, ["Epic","Legendary","Mythic"]);
  assert.ok(Object.values(traits.characters).filter(tags => tags.includes("Conqueror")).length >= 5);
});

test("DD9 and Magik configurations remain available", () => {
  assert.ok(config.dimensions.some(d => d.key === "dd9" && d.nodes.length === 16));
  assert.ok(config.dimensions.some(d => d.key === "magik-first-breaker" && d.nodes.length === 10));
  assert.equal(blue.completionRule.characterId, "BlueMarvel");
});
