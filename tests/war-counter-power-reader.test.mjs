import test from "node:test";
import assert from "node:assert/strict";
import {
  POWER_DIGIT_HEIGHT,
  POWER_DIGIT_WIDTH,
  POWER_READER_VERSION,
  POWER_SCORE_THRESHOLD,
  findPowerDigitComponents,
  isPowerYellow,
  readPowerFromImageData
} from "../docs/war-counter-power-reader.js";

test("power reader contract stays small and local", () => {
  assert.equal(POWER_READER_VERSION, "1.0.0");
  assert.equal(POWER_DIGIT_WIDTH, 20);
  assert.equal(POWER_DIGIT_HEIGHT, 24);
  assert.equal(POWER_SCORE_THRESHOLD, 0.84);
});

test("MSF yellow threshold keeps the power digits and rejects unrelated colors", () => {
  assert.equal(isPowerYellow(230, 220, 90), true);
  assert.equal(isPowerYellow(255, 255, 255), false);
  assert.equal(isPowerYellow(60, 220, 80), false);
  assert.equal(isPowerYellow(220, 70, 70), false);
});

test("empty crop fails closed instead of inventing a power", () => {
  const width = 120;
  const height = 40;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 3; index < data.length; index += 4) data[index] = 255;

  const imageData = { width, height, data };
  assert.deepEqual(findPowerDigitComponents(imageData), []);

  const result = readPowerFromImageData(imageData);
  assert.equal(result.value, null);
  assert.equal(result.reason, "digit-count");
  assert.equal(result.componentCount, 0);
});
