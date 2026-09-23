import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzePortraitOccupancy,
  detectRedCross,
  EMPTY_PORTRAIT_MAX_EDGE_RATIO,
  EMPTY_PORTRAIT_MAX_LUMA_STD,
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


function makeImageData(width, height, pixelAt) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixelAt(x, y);
      const offset = (y * width + x) * 4;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = 255;
    }
  }
  return { width, height, data };
}

test("détecte un emplacement visuellement vide sans confondre un portrait texturé", () => {
  const empty = makeImageData(100, 80, (x) =>
    x > 95 ? [120, 20, 35] : [45, 18, 35]
  );
  const emptyMetrics = analyzePortraitOccupancy(empty);
  assert.equal(emptyMetrics.isAbsent, true);
  assert.ok(emptyMetrics.lumaStd < EMPTY_PORTRAIT_MAX_LUMA_STD);
  assert.ok(emptyMetrics.edgeRatio < EMPTY_PORTRAIT_MAX_EDGE_RATIO);

  const occupied = makeImageData(100, 80, (x, y) =>
    (x + Math.floor(y / 2)) % 12 < 6
      ? [225, 190, 145]
      : [35, 55, 95]
  );
  const occupiedMetrics = analyzePortraitOccupancy(occupied);
  assert.equal(occupiedMetrics.isAbsent, false);
});

test("détecte une vraie croix rouge sans confondre le cercle rouge du portrait", () => {
  const crossed = makeImageData(100, 100, (x, y) => {
    const onDescendingBar = Math.abs(y - x) <= 4;
    const onAscendingBar = Math.abs(y - (99 - x)) <= 4;
    return onDescendingBar || onAscendingBar ? [220, 25, 25] : [35, 40, 60];
  });
  assert.equal(detectRedCross(crossed), true);

  const ringOnly = makeImageData(100, 100, (x, y) => {
    const distance = Math.hypot(x - 49.5, y - 49.5);
    return Math.abs(distance - 34) <= 4 ? [220, 25, 25] : [35, 40, 60];
  });
  assert.equal(detectRedCross(ringOnly), false);
});

test("une image invalide ne peut jamais être déclarée vide automatiquement", () => {
  assert.equal(analyzePortraitOccupancy(null).isAbsent, false);
  assert.equal(detectRedCross(null), false);
});
