import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CORPUS_DIR = resolve(ROOT, "benchmarks/war-counter-field");
const manifest = JSON.parse(readFileSync(resolve(CORPUS_DIR, "manifest.json"), "utf8"));
const characters = JSON.parse(readFileSync(resolve(ROOT, "docs/data/msf-characters.json"), "utf8"));
const charactersById = new Map(characters.map((item) => [item.id, item]));

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

test("field corpus keeps the validated 6-capture / 58-portrait baseline", () => {
  assert.equal(manifest.schemaVersion, "1.0.0");
  assert.equal(manifest.engine.openCvVersion, "4.10.0");
  assert.equal(manifest.engine.referenceCount, 379);
  assert.equal(manifest.engine.descriptorCount, 78253);
  assert.equal(manifest.engine.segmentation, "R6.6");
  assert.equal(manifest.captures.length, 6);

  const slots = manifest.captures.flatMap((capture) => capture.slots);
  const states = slots.reduce(
    (out, slot) => {
      out[slot.state] = (out[slot.state] || 0) + 1;
      return out;
    },
    {}
  );
  const evaluated = slots.filter((slot) => slot.characterId);

  assert.equal(slots.length, 60);
  assert.equal(evaluated.length, 58);
  assert.deepEqual(states, { alive: 24, dead: 34, absent: 2 });
  assert.equal(evaluated.filter((slot) => slot.expectedRank === 1).length, 58);

  assert.deepEqual(manifest.validation, {
    date: "2026-09-22",
    mergeBaseline: "1107930ce7671bc5edac8ea269bbe77a58dfc967",
    captureCount: 6,
    slotCount: 60,
    evaluated: 58,
    alive: 24,
    dead: 34,
    absent: 2,
    top1: 58,
    top1Rate: 1
  });
});

test("field corpus images match their recorded SHA-256", () => {
  for (const capture of manifest.captures) {
    const path = resolve(CORPUS_DIR, capture.file);
    assert.equal(sha256(path), capture.sha256, capture.id);
  }
});

test("every evaluated truth ID is currently a playable MSF character", () => {
  for (const capture of manifest.captures) {
    for (const slot of capture.slots) {
      if (!slot.characterId) {
        assert.equal(slot.state, "absent");
        assert.equal(slot.expectedRank, null);
        continue;
      }

      const character = charactersById.get(slot.characterId);
      assert.ok(character, `${capture.id} ${slot.slot}: unknown ${slot.characterId}`);
      assert.equal(
        character.player_Character,
        true,
        `${capture.id} ${slot.slot}: ${slot.characterId} is no longer playable`
      );
    }
  }
});
