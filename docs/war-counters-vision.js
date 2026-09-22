import {
  calculatePixelRect,
  detectLayout,
  detectRedCross,
  getCropVariants,
  getLayoutSlots,
  validateUpload
} from "./war-counter-lab-core.js";
import {
  findExactDefenseMatches,
  normalizeDefenseVariants
} from "./war-counters-vision-core.js";

const WORKER_URL = new URL("./war-counter-akaze-worker.js?v=r5-akaze-worker-2", import.meta.url);
const REALIGNED_RIGHT_TEAM_X_SHIFT = 0.125;
const REALIGNED_RIGHT_D1_EXTRA_SHIFT = 0.15;
const REALIGNED_LEFT_TAIL_X_SHIFTS = Object.freeze({ 3: -0.10, 4: -0.15, 5: -0.20 });

const input = document.querySelector("#warVisionCaptureInput");
const pickButton = document.querySelector("#warVisionPick");
const statusNode = document.querySelector("#warVisionStatus");
const resultsNode = document.querySelector("#warVisionResults");
const slotsNode = document.querySelector("#warVisionSlots");
const matchNode = document.querySelector("#warVisionMatch");
const matchSelect = document.querySelector("#warVisionMatchSelect");
const applyButton = document.querySelector("#warVisionApply");
const familySelect = document.querySelector("#defFamilySelect");
const variantSelect = document.querySelector("#defVariantSelect");

let worker = null;
let requestId = 0;
let initPromise = null;
let dataPromise = null;
let charactersById = new Map();
let defenses = [];
let recognizedSlots = [];
let currentMatches = [];
const pending = new Map();

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function setStatus(message, state = "idle") {
  if (!statusNode) return;
  statusNode.textContent = message;
  statusNode.dataset.state = state;
}

function characterLabel(id) {
  const character = charactersById.get(id);
  return character?.nameKey || character?.nameFr || character?.nameEn || id || "—";
}

function characterPortrait(id) {
  const character = charactersById.get(id);
  return character?.portraitUrl || character?.portrait || character?.iconUrl || "";
}

async function loadData() {
  if (dataPromise) return dataPromise;
  dataPromise = Promise.all([
    fetch("./data/war-counters.json", { cache: "no-store" }),
    fetch("./data/msf-characters.json", { cache: "no-store" })
  ]).then(async ([warResponse, charactersResponse]) => {
    if (!warResponse.ok) throw new Error("Données War Counters indisponibles.");
    if (!charactersResponse.ok) throw new Error("Catalogue personnages indisponible.");

    const [warRows, characters] = await Promise.all([
      warResponse.json(),
      charactersResponse.json()
    ]);
    defenses = normalizeDefenseVariants(warRows);
    charactersById = new Map(
      (Array.isArray(characters) ? characters : [])
        .filter((item) => item?.id)
        .map((item) => [item.id, item])
    );
  });
  return dataPromise;
}

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(WORKER_URL);
  worker.addEventListener("message", (event) => {
    const { id, ok, result, error } = event.data || {};
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    clearTimeout(entry.timer);
    if (ok) entry.resolve(result);
    else entry.reject(new Error(error || "Erreur AKAZE inconnue."));
  });
  worker.addEventListener("error", (event) => {
    const error = new Error(event.message || "Le moteur AKAZE s’est arrêté dans le navigateur.");
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    pending.clear();
    worker?.terminate();
    worker = null;
    initPromise = null;
  });
  return worker;
}

function workerCall(type, payload = null, transfer = [], timeoutMs = 90000) {
  const target = ensureWorker();
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Le moteur AKAZE ne répond pas sur ce téléphone."));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    target.postMessage({ id, type, payload }, transfer);
  });
}

function initWorker() {
  if (!initPromise) initPromise = workerCall("init", null, [], 120000);
  return initPromise;
}

function isOutlinePixel(red, green, blue) {
  const cyan = green > 75 && blue > 95 && blue > red * 1.15 && green > red * 0.85;
  const redOutline = red > 135 && red > green * 1.45 && red > blue * 1.12;
  return cyan || redOutline;
}

function drawSource(image, context, ...args) {
  context.drawImage(image.source || image, ...args);
}

function detectHorizontalContentBounds(image) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  drawSource(image, context, 0, 0, image.width, image.height);

  const yStart = Math.max(0, Math.floor(image.height * 0.47));
  const yEnd = Math.min(image.height, Math.ceil(image.height * 0.93));
  const scanHeight = Math.max(1, yEnd - yStart);
  const imageData = context.getImageData(0, yStart, image.width, scanHeight);
  const counts = new Uint16Array(image.width);
  const redCounts = new Uint16Array(image.width);

  for (let y = 0; y < scanHeight; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      const red = imageData.data[offset];
      const green = imageData.data[offset + 1];
      const blue = imageData.data[offset + 2];
      if (isOutlinePixel(red, green, blue)) {
        counts[x] += 1;
        if (red > 135 && red > green * 1.45 && red > blue * 1.12) redCounts[x] += 1;
      }
    }
  }

  const threshold = Math.max(8, Math.round(scanHeight * 0.075));
  const strongColumns = [];
  for (let x = 0; x < counts.length; x += 1) {
    if (counts[x] >= threshold) strongColumns.push(x);
  }

  if (strongColumns.length < 2) {
    return { used: false, left: 0, right: image.width, scale: 1, reason: "contours insuffisants" };
  }

  const groups = [];
  let start = strongColumns[0];
  let previous = strongColumns[0];
  for (let index = 1; index < strongColumns.length; index += 1) {
    const value = strongColumns[index];
    if (value !== previous + 1) {
      groups.push({ start, end: previous });
      start = value;
    }
    previous = value;
  }
  groups.push({ start, end: previous });

  // Keep the PR #175 behavior: a strong red border at the far right is the war
  // panel edge, not a Safari scroll indicator, even when D5 is empty.
  while (groups.length > 2) {
    const tail = groups[groups.length - 1];
    const before = groups[groups.length - 2];
    const gap = tail.start - before.end - 1;
    const tailWidth = tail.end - tail.start + 1;
    let tailPeak = 0;
    let tailRedPeak = 0;
    for (let x = tail.start; x <= tail.end; x += 1) {
      tailPeak = Math.max(tailPeak, counts[x]);
      tailRedPeak = Math.max(tailRedPeak, redCounts[x]);
    }
    const isRightPanelBorder =
      tail.end >= image.width * 0.97 &&
      tailPeak >= scanHeight * 0.55 &&
      tailRedPeak >= tailPeak * 0.80;
    if (gap > image.width * 0.035 && tailWidth < image.width * 0.02 && !isRightPanelBorder) groups.pop();
    else break;
  }

  const left = groups[0].start;
  const right = groups[groups.length - 1].end;
  const contentWidth = right - left + 1;
  const widthRatio = contentWidth / image.width;
  const leftRatio = left / image.width;
  const rightMarginRatio = (image.width - 1 - right) / image.width;

  const plausible =
    widthRatio >= 0.72 &&
    widthRatio <= 1.01 &&
    leftRatio <= 0.14 &&
    rightMarginRatio <= 0.22;

  if (!plausible) {
    return { used: false, left: 0, right: image.width, scale: 1, reason: "contours non plausibles" };
  }

  const needsRealignment =
    widthRatio < 0.96 ||
    Math.abs(leftRatio - rightMarginRatio) > 0.055;

  if (!needsRealignment) {
    return {
      used: false,
      left: 0,
      right: image.width,
      scale: 1,
      detectedLeft: left,
      detectedRight: right,
      detectedWidthRatio: widthRatio,
      reason: "capture déjà alignée"
    };
  }

  return {
    used: true,
    left,
    right: right + 1,
    scale: widthRatio,
    detectedLeft: left,
    detectedRight: right,
    detectedWidthRatio: widthRatio,
    reason: "recalage horizontal automatique"
  };
}

function slotsForBounds(bounds, imageWidth) {
  const baseSlots = getLayoutSlots();
  if (!bounds?.used) return baseSlots;

  const leftRatio = bounds.left / imageWidth;
  const widthRatio = (bounds.right - bounds.left) / imageWidth;
  return baseSlots.map((slot) => {
    const width = slot.width * widthRatio;
    const leftTeamShift = slot.side === "left" ? width * (REALIGNED_LEFT_TAIL_X_SHIFTS[slot.position] || 0) : 0;
    let rightTeamShift = 0;
    if (slot.side === "right") {
      const progressToD5 = (slot.position - 1) / 4;
      const extraD1Shift = width * REALIGNED_RIGHT_D1_EXTRA_SHIFT * (1 - progressToD5);
      rightTeamShift = width * REALIGNED_RIGHT_TEAM_X_SHIFT + extraD1Shift;
    }
    return Object.freeze({
      ...slot,
      x: leftRatio + slot.x * widthRatio + leftTeamShift + rightTeamShift,
      width
    });
  });
}

function cropBase(image, slot) {
  const variant = getCropVariants(slot).wide;
  const rect = calculatePixelRect(variant, image.width, image.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, rect.width);
  canvas.height = Math.max(1, rect.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  drawSource(image, context, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function decodeImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch (_) {
      // Fall through to the HTMLImageElement path for embedded/mobile browsers.
    }
  }

  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error("Impossible de lire cette capture."));
    image.src = url;
  });
  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    close: () => URL.revokeObjectURL(url)
  };
}

function selectedIds() {
  return recognizedSlots.map((slot) => slot.selectedCharacterId).filter(Boolean);
}

function refreshMatch() {
  currentMatches = findExactDefenseMatches(defenses, selectedIds());
  if (matchSelect) {
    matchSelect.replaceChildren();
    matchSelect.hidden = currentMatches.length <= 1;
  }

  if (!currentMatches.length) {
    if (matchNode) matchNode.textContent = "Aucune variante exacte dans War Counters. Corrige les personnages si besoin ou garde la sélection manuelle.";
    if (applyButton) applyButton.disabled = true;
    return;
  }

  if (currentMatches.length === 1) {
    const match = currentMatches[0];
    if (matchNode) matchNode.textContent = \`Variante exacte trouvée : \${match.family} — \${match.variant}\`;
    if (applyButton) applyButton.disabled = false;
    return;
  }

  if (matchNode) matchNode.textContent = \`\${currentMatches.length} variantes exactes utilisent cette composition. Choisis celle à appliquer.\`;
  currentMatches.forEach((match, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = \`\${match.family} — \${match.variant}\`;
    matchSelect?.append(option);
  });
  if (applyButton) applyButton.disabled = false;
}

function updateSlotPortrait(row, image) {
  const portrait = characterPortrait(row.selectedCharacterId);
  if (!portrait) {
    image.removeAttribute("src");
    image.hidden = true;
    return;
  }
  image.src = portrait;
  image.alt = characterLabel(row.selectedCharacterId);
  image.hidden = false;
}

function renderRecognizedSlots() {
  if (!slotsNode) return;
  slotsNode.replaceChildren();

  for (const row of recognizedSlots) {
    const article = document.createElement("article");
    article.className = "warVisionSlot";

    const label = document.createElement("strong");
    label.className = "warVisionSlotLabel";
    label.textContent = row.label;

    const image = document.createElement("img");
    image.className = "warVisionPortrait";
    image.width = 48;
    image.height = 48;
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";

    const select = document.createElement("select");
    select.className = "select warVisionCandidate";
    select.setAttribute("aria-label", \`Personnage reconnu \${row.label}\`);

    const absent = document.createElement("option");
    absent.value = "";
    absent.textContent = "— Absent —";
    select.append(absent);

    row.candidates.forEach((candidate, index) => {
      const option = document.createElement("option");
      option.value = candidate.id;
      option.textContent = \`\${index + 1}. \${characterLabel(candidate.id)}\`;
      select.append(option);
    });

    row.selectedCharacterId = row.candidates[0]?.id || null;
    select.value = row.selectedCharacterId || "";
    updateSlotPortrait(row, image);

    select.addEventListener("change", () => {
      row.selectedCharacterId = select.value || null;
      updateSlotPortrait(row, image);
      refreshMatch();
    });

    const state = document.createElement("span");
    state.className = "warVisionSlotState";
    state.textContent = row.barred ? "KO sur la capture" : "présent";

    const body = document.createElement("div");
    body.className = "warVisionSlotBody";
    body.append(select, state);
    article.append(label, image, body);
    slotsNode.append(article);
  }

  if (resultsNode) resultsNode.hidden = false;
  refreshMatch();
}

async function analyzeCapture(file) {
  validateUpload(file);
  setStatus("Initialisation du moteur local…", "busy");
  if (pickButton) pickButton.disabled = true;
  if (applyButton) applyButton.disabled = true;
  if (resultsNode) resultsNode.hidden = true;
  recognizedSlots = [];

  const [image, initMetrics] = await Promise.all([
    decodeImage(file),
    Promise.all([loadData(), initWorker()]).then(([, metrics]) => metrics)
  ]);

  try {
    detectLayout(image.width, image.height);
    const alignment = detectHorizontalContentBounds(image);
    const rightSlots = slotsForBounds(alignment, image.width).filter((slot) => slot.side === "right");

    for (let index = 0; index < rightSlots.length; index += 1) {
      const slot = rightSlots[index];
      setStatus(\`Analyse locale \${index + 1}/5 — \${slot.label}…\`, "busy");
      const crop = cropBase(image, slot);
      const context = crop.getContext("2d", { willReadFrequently: true });
      const imageData = context.getImageData(0, 0, crop.width, crop.height);
      const barred = detectRedCross(imageData);
      const buffer = imageData.data.buffer;
      const result = await workerCall("analyze", { width: crop.width, height: crop.height, buffer }, [buffer], 60000);
      recognizedSlots.push({
        slot: slot.slot,
        label: slot.label,
        barred,
        candidates: result.candidates,
        selectedCharacterId: result.candidates[0]?.id || null
      });
      crop.width = 1;
      crop.height = 1;
      await nextFrame();
    }

    renderRecognizedSlots();
    const alignmentText = alignment.used ? " · cadrage horizontal recalé" : "";
    setStatus(\`\${initMetrics.referenceCount} références · défense droite reconnue localement\${alignmentText}. Vérifie les 5 cases avant d’appliquer.\`, "ok");
  } finally {
    image.close?.();
    if (pickButton) pickButton.disabled = false;
  }
}

function applyRecognizedDefense() {
  if (!currentMatches.length || !familySelect || !variantSelect) return;
  const requestedIndex = Number(matchSelect?.value || 0);
  const match = currentMatches[Math.max(0, Math.min(currentMatches.length - 1, requestedIndex))];
  if (!match) return;

  familySelect.value = match.family;
  familySelect.dispatchEvent(new Event("change", { bubbles: true }));
  variantSelect.value = match.variant;
  variantSelect.dispatchEvent(new Event("change", { bubbles: true }));

  setStatus(\`Défense appliquée : \${match.variant}.\`, "ok");
  document.querySelector("#defTitle")?.closest(".card")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

pickButton?.addEventListener("click", () => input?.click());
input?.addEventListener("change", async () => {
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  try {
    await analyzeCapture(file);
  } catch (error) {
    console.error("[war-counters-vision]", error);
    setStatus(error?.message || "Analyse impossible.", "error");
    if (pickButton) pickButton.disabled = false;
    if (applyButton) applyButton.disabled = true;
  }
});
applyButton?.addEventListener("click", applyRecognizedDefense);

setStatus("Analyse 100 % locale. Utilise une capture recadrée sur le panneau de résultat de combat.");
