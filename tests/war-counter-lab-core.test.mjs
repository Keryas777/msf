import test from "node:test";
import assert from "node:assert/strict";
import {
  filterWarPlayableCatalog,
  getCropVariants,
  getLayoutSlots,
  isWarPlayableCharacter
} from "../docs/war-counter-lab-core.js";

test("filtre les boss, invocations et variantes techniques", () => {
  const catalog = [
    { id: "Knull", nameKey: "Knull" },
    { id: "KnullPVE_Boss_Knull", nameKey: "Knull" },
    { id: "CarnageKnullSummon", nameKey: "Carnage (Enragé)" },
    { id: "Example_NPC_Boss", nameKey: "Boss" },
    { id: "Venom", nameKey: "Venom" }
  ];
  assert.deepEqual(filterWarPlayableCatalog(catalog).map((item) => item.id), ["Knull", "Venom"]);
  assert.equal(isWarPlayableCharacter({ id: "Knull", nameKey: "Knull" }), true);
  assert.equal(isWarPlayableCharacter({ id: "CarnageKnullSummon", nameKey: "Carnage" }), false);
});

test("respecte les drapeaux explicites non jouables", () => {
  assert.equal(isWarPlayableCharacter({ id: "BossX", nameKey: "Boss X", isBoss: true }), false);
  assert.equal(isWarPlayableCharacter({ id: "SummonX", nameKey: "Summon X", isSummon: true }), false);
  assert.equal(isWarPlayableCharacter({ id: "HeroX", nameKey: "Hero X", isPlayable: false }), false);
});

test("les crops portrait retirent le bas du slot sans couper excessivement la tête", () => {
  const slot = getLayoutSlots()[0];
  const variants = getCropVariants(slot);
  assert.ok(variants.wide.y > slot.y);
  assert.ok(variants.wide.height < slot.height);
  assert.ok(variants.tight.width > slot.width * 0.7);
  assert.ok(variants.tight.height > slot.height * 0.65);
  assert.deepEqual(
    { x: variants.grayscale.x, y: variants.grayscale.y, width: variants.grayscale.width, height: variants.grayscale.height },
    { x: variants.wide.x, y: variants.wide.y, width: variants.wide.width, height: variants.wide.height }
  );
});
