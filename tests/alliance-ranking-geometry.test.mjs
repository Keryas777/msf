import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { detectRankingRows } from "../docs/alliance-ranking-geometry.js";

function syntheticImage(width, height, boundaryYs, borderThickness = 2) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = 10;
    data[offset + 1] = 18;
    data[offset + 2] = 38;
    data[offset + 3] = 255;
  }
  const xStart = Math.round(width * 0.283);
  const xEnd = Math.round(width * 0.906);
  for (const y of boundaryYs) {
    for (let dy = 0; dy < borderThickness; dy++) {
      for (let x = xStart; x < xEnd; x++) {
        const offset = ((y + dy) * width + x) * 4;
        data[offset] = 64;
        data[offset + 1] = 124;
        data[offset + 2] = 158;
      }
    }
  }
  return { width, height, data };
}

test("detects four complete rows and rejects an isolated partial next row", () => {
  const image = syntheticImage(600, 400, [105, 157, 161, 213, 217, 269, 273, 325, 329]);
  const result = detectRankingRows(image);
  assert.equal(result.diagnostics.status, "ok");
  assert.equal(result.rows.length, 4);
  assert.equal(result.rows[0].inferredTop, false);
  assert.equal(result.rejected.length, 1);
  assert.ok(Math.abs(result.rows[0].rect.y - 105 / 400) < 0.005);
  assert.ok(Math.abs(result.rows[3].rect.y + result.rows[3].rect.height - 325.5 / 400) < 0.005);
});

test("infers one obscured top border from repeated row spacing", () => {
  const image = syntheticImage(600, 400, [157, 161, 213, 217, 269, 273, 325, 329]);
  const result = detectRankingRows(image);
  assert.equal(result.rows.length, 4);
  assert.equal(result.diagnostics.topBoundaryInferred, true);
  assert.equal(result.rows[0].inferredTop, true);
  assert.ok(Math.abs(result.rows[0].rect.y - 105 / 400) < 0.015);
});

test("outputs normalized rank, alliance-name and power crops", () => {
  const result = detectRankingRows(syntheticImage(600, 400, [105, 157, 161, 213, 217, 269, 273, 325]));
  const row = result.rows[0];
  assert.deepEqual(Object.keys(row.crops).sort(), ["allianceName", "power", "rank"]);
  for (const box of [row.rect, ...Object.values(row.crops)]) {
    assert.ok(box.x >= 0 && box.y >= 0 && box.width > 0 && box.height > 0);
    assert.ok(box.x + box.width <= 1 && box.y + box.height <= 1);
  }
  assert.ok(row.crops.rank.x < row.crops.allianceName.x);
  assert.ok(row.crops.allianceName.x + row.crops.allianceName.width < row.crops.power.x);
});

test("keeps the same four-row geometry at half, native and enlarged resolutions", () => {
  for (const scale of [0.5, 1, 1.5]) {
    const width = Math.round(600 * scale);
    const height = Math.round(400 * scale);
    const boundaries = [105, 157, 161, 213, 217, 269, 273, 325].map(y => Math.round(y * scale));
    const result = detectRankingRows(syntheticImage(width, height, boundaries, Math.max(1, Math.round(2 * scale))));
    assert.equal(result.rows.length, 4, `scale ${scale}`);
    assert.ok(Math.abs(result.rows[0].rect.y - 105 / 400) < 0.01, `top at scale ${scale}`);
    assert.ok(Math.abs(result.rows[3].rect.height - 52 / 400) < 0.015, `height at scale ${scale}`);
  }
});

test("rejects unrelated blue dividers instead of inventing four rows", () => {
  const result = detectRankingRows(syntheticImage(600, 400, [110, 156, 202, 248, 294]));
  assert.equal(result.rows.length, 0);
  assert.equal(result.diagnostics.status, "no-confident-sequence");
});

test("keeps the experimental page out of public navigation and precaches versioned PWA assets", async () => {
  const [menu, worker, page] = await Promise.all([
    readFile(new URL("../docs/war-choose.html", import.meta.url), "utf8"),
    readFile(new URL("../docs/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../docs/alliance-ranking-locator.html", import.meta.url), "utf8")
  ]);
  assert.doesNotMatch(menu, /alliance-ranking-locator/);
  assert.match(worker, /losp-v30/);
  assert.match(worker, /alliance-ranking-locator\.html/);
  assert.match(worker, /alliance-ranking-locator\.css\?v=1/);
  assert.match(worker, /alliance-ranking-locator\.js\?v=1/);
  assert.match(worker, /alliance-ranking-geometry\.js/);
  assert.match(page, /type="module"/);
  assert.doesNotMatch(page, /auth-guard|password|secret/i);
});
