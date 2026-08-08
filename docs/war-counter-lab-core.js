export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = Object.freeze(["image/jpeg", "image/png", "image/webp"]);
export const LAYOUT_ID = "war-result-ultrawide-v1";

const X_STARTS = Object.freeze([0.012, 0.112, 0.212, 0.312, 0.412]);
const SLOT_WIDTH = 0.084;
const SLOT_Y = 0.49;
const SLOT_HEIGHT = 0.36;

export const SLOT_ORDER = Object.freeze([
  "left-1", "left-2", "left-3", "left-4", "left-5",
  "right-1", "right-2", "right-3", "right-4", "right-5"
]);

export function getLayoutSlots() {
  return SLOT_ORDER.map((slot, index) => {
    const side = index < 5 ? "left" : "right";
    const position = (index % 5) + 1;
    const x = X_STARTS[position - 1] + (side === "right" ? 0.5 : 0);
    return Object.freeze({ slot, label: `${side === "left" ? "G" : "D"}${position}`, side, position, x, y: SLOT_Y, width: SLOT_WIDTH, height: SLOT_HEIGHT });
  });
}

export function validateUpload(file) {
  if (!file || typeof file !== "object") throw new Error("Fichier manquant.");
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) throw new Error("Format non accepté.");
  if (!Number.isFinite(file.size) || file.size <= 0) throw new Error("Fichier vide.");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Image supérieure à 12 Mo.");
  return true;
}

export function calculatePixelRect(slot, width, height) {
  return { x: Math.round(slot.x * width), y: Math.round(slot.y * height), width: Math.round(slot.width * width), height: Math.round(slot.height * height) };
}

export function getCropVariants(slot) {
  return {
    wide: { ...slot },
    tight: { ...slot, x: slot.x + slot.width * 0.18, y: slot.y + slot.height * 0.02, width: slot.width * 0.64, height: slot.height * 0.62 },
    grayscale: { ...slot, filter: "grayscale" },
    redMask: { ...slot, filter: "red-mask" }
  };
}

export function detectRedCross(imageData) {
  const { data, width, height } = imageData;
  if (!data || !width || !height) return false;
  const diagA = new Array(width + height).fill(0);
  const diagB = new Array(width + height).fill(0);
  let redPixels = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a > 80 && r > 145 && r > g * 1.35 && r > b * 1.25) {
        redPixels += 1;
        diagA[x - y + height] += 1;
        diagB[x + y] += 1;
      }
    }
  }
  const minLine = Math.max(5, Math.round(Math.min(width, height) * 0.28));
  return Math.max(...diagA) >= minLine && Math.max(...diagB) >= minLine && redPixels / (width * height) >= 0.035;
}

export function createDraft() {
  return { schemaVersion: "1.0.0", status: "draft", layout: LAYOUT_ID, groqRealCalls: 0, slots: getLayoutSlots().map((item) => ({ slot: item.slot, side: item.side, position: item.position, barred: null, candidates: [], selectedCharacterId: null, validationStatus: "pending" })) };
}

export function validateDraft(draft, characterIds = null) {
  if (!draft || draft.schemaVersion !== "1.0.0" || draft.layout !== LAYOUT_ID) throw new Error("Contrat invalide.");
  if (draft.groqRealCalls !== 0) throw new Error("R1 interdit les appels Groq réels.");
  if (!Array.isArray(draft.slots) || draft.slots.length !== 10) throw new Error("Dix slots requis.");
  const seen = new Set();
  draft.slots.forEach((entry, index) => {
    if (entry.slot !== SLOT_ORDER[index] || seen.has(entry.slot)) throw new Error("Slots absents, dupliqués ou désordonnés.");
    seen.add(entry.slot);
    if (!["pending", "validated", "corrected"].includes(entry.validationStatus)) throw new Error("Statut invalide.");
    if (entry.selectedCharacterId && characterIds && !characterIds.has(entry.selectedCharacterId)) throw new Error("Personnage hors catalogue.");
  });
  return true;
}

export function calculateTopMetrics(slots, groundTruth) {
  const truth = new Map(groundTruth.map((entry) => [entry.slot, entry.characterId]));
  const result = { evaluated: 0, top1: 0, top3: 0, top5: 0 };
  for (const slot of slots) {
    const expected = truth.get(slot.slot);
    if (!expected || !Array.isArray(slot.candidates)) continue;
    result.evaluated += 1;
    const ids = slot.candidates.map((candidate) => candidate.characterId);
    if (ids.slice(0, 1).includes(expected)) result.top1 += 1;
    if (ids.slice(0, 3).includes(expected)) result.top3 += 1;
    if (ids.slice(0, 5).includes(expected)) result.top5 += 1;
  }
  return result;
}
