import {
  analyzePortraitOccupancy,
  calculatePixelRect,
  detectRedCross,
  getCropVariants,
  getLayoutSlots,
  normalizeCatalog,
  normalizeText,
  validateUpload
} from "./war-counter-lab-core.js";
import {
  HEADER_REGIONS,
  greenMarkerRatio,
  inferAttackSide,
  mapPanelRegion
} from "./war-counter-header-vision.js";
import { readPowerFromImageData } from "./war-counter-power-reader.js";
import {
  buildTeamLabels,
  ceilRatioToHundredth,
  findMatchingCounters,
  summarizeCounterComparison
} from "./war-counter-matchup-preview.js";

const WORKER_URL = new URL("./war-counter-akaze-worker.js?v=r5-akaze-worker-2", import.meta.url);
const REALIGNED_RIGHT_TEAM_X_SHIFT = 0.125;
const REALIGNED_RIGHT_D1_EXTRA_SHIFT = 0.15;
const REALIGNED_LEFT_TAIL_X_SHIFTS = Object.freeze({ 3: -0.10, 4: -0.15, 5: -0.20 });

const $ = (selector) => document.querySelector(selector);
const input = $("#captureInput");
const analyzeButton = $("#analyzeButton");
const selectionSummary = $("#selectionSummary");
const analysisStatus = $("#analysisStatus");
const batchBadge = $("#batchBadge");
const batchSummary = $("#batchSummary");
const batchSummaryText = $("#batchSummaryText");
const resultsRoot = $("#captureResults");

const characterDialog = $("#characterDialog");
const characterDialogTitle = $("#characterDialogTitle");
const characterCropPreview = $("#characterCropPreview");
const characterSearch = $("#characterSearch");
const characterResults = $("#characterResults");
const candidateHeading = $("#candidateHeading");
const markAbsentButton = $("#markAbsentButton");

let catalog = [];
let catalogById = new Map();
let catalogIndex = null;
let teamDefinitions = [];
let warCounters = [];
let worker = null;
let requestId = 0;
let analyzing = false;
let runs = [];
let activeCorrection = null;
const pending = new Map();

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function isOutlinePixel(red, green, blue) {
  const cyan = green > 75 && blue > 95 && blue > red * 1.15 && green > red * 0.85;
  const redOutline = red > 135 && red > green * 1.45 && red > blue * 1.12;
  return cyan || redOutline;
}

function imageDimensions(image) {
  return {
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height
  };
}

function detectHorizontalContentBounds(image) {
  const { width, height } = imageDimensions(image);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0);

  const yStart = Math.max(0, Math.floor(height * 0.47));
  const yEnd = Math.min(height, Math.ceil(height * 0.93));
  const scanHeight = Math.max(1, yEnd - yStart);
  const imageData = context.getImageData(0, yStart, width, scanHeight);
  const counts = new Uint16Array(width);
  const redCounts = new Uint16Array(width);

  for (let y = 0; y < scanHeight; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
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
    return { used: false, left: 0, right: width, scale: 1, reason: "contours insuffisants" };
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

  // Même garde-fou que la validation R6.6 : ignorer l'indicateur Safari,
  // mais conserver une vraie bordure rouge de panneau à droite.
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
      tail.end >= width * 0.97 &&
      tailPeak >= scanHeight * 0.55 &&
      tailRedPeak >= tailPeak * 0.80;

    if (gap > width * 0.035 && tailWidth < width * 0.02 && !isRightPanelBorder) groups.pop();
    else break;
  }

  const left = groups[0].start;
  const right = groups[groups.length - 1].end;
  const contentWidth = right - left + 1;
  const widthRatio = contentWidth / width;
  const leftRatio = left / width;
  const rightMarginRatio = (width - 1 - right) / width;

  const plausible =
    widthRatio >= 0.72 &&
    widthRatio <= 1.01 &&
    leftRatio <= 0.14 &&
    rightMarginRatio <= 0.22;

  if (!plausible) {
    return { used: false, left: 0, right: width, scale: 1, reason: "contours non plausibles" };
  }

  const needsRealignment =
    widthRatio < 0.96 ||
    Math.abs(leftRatio - rightMarginRatio) > 0.055;

  if (!needsRealignment) {
    return {
      used: false,
      left: 0,
      right: width,
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

function applyFineSlotAdjustments(slots) {
  return slots.map((slot) => {
    const leftTeamShift = slot.side === "left"
      ? slot.width * (REALIGNED_LEFT_TAIL_X_SHIFTS[slot.position] || 0)
      : 0;

    let rightTeamShift = 0;
    if (slot.side === "right") {
      const progressToD5 = (slot.position - 1) / 4;
      const extraD1Shift = slot.width * REALIGNED_RIGHT_D1_EXTRA_SHIFT * (1 - progressToD5);
      rightTeamShift = slot.width * REALIGNED_RIGHT_TEAM_X_SHIFT + extraD1Shift;
    }

    return Object.freeze({
      ...slot,
      x: slot.x + leftTeamShift + rightTeamShift
    });
  });
}

function slotsForBounds(bounds, imageWidth) {
  const baseSlots = getLayoutSlots();

  const panelSlots = !bounds?.used
    ? baseSlots
    : baseSlots.map((slot) => {
        const leftRatio = bounds.left / imageWidth;
        const widthRatio = (bounds.right - bounds.left) / imageWidth;
        return Object.freeze({
          ...slot,
          x: leftRatio + slot.x * widthRatio,
          width: slot.width * widthRatio
        });
      });

  return applyFineSlotAdjustments(panelSlots);
}

async function decodeImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close()
      };
    } catch (_) {
      // Fallback ci-dessous pour Safari/Discord si createImageBitmap échoue.
    }
  }

  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";

  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error("Impossible de décoder la capture."));
    image.src = url;
  });

  return {
    image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    close: () => URL.revokeObjectURL(url)
  };
}

function cropBase(image, slot) {
  const variant = getCropVariants(slot).wide;
  const { width, height } = imageDimensions(image);
  const rect = calculatePixelRect(variant, width, height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, rect.width);
  canvas.height = Math.max(1, rect.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function cropPreviewDataUrl(crop) {
  const maxSide = 150;
  const scale = Math.min(1, maxSide / Math.max(crop.width, crop.height));
  const width = Math.max(1, Math.round(crop.width * scale));
  const height = Math.max(1, Math.round(crop.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(crop, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.84);
}

function headerCropPreviewDataUrl(crop) {
  const maxWidth = 520;
  const scale = Math.min(1, maxWidth / crop.width);
  const width = Math.max(1, Math.round(crop.width * scale));
  const height = Math.max(1, Math.round(crop.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(crop, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.88);
}

function cropHeaderRegion(image, region, alignment) {
  const { width, height } = imageDimensions(image);
  const mapped = mapPanelRegion(region, alignment, width);
  const rect = calculatePixelRect(mapped, width, height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, rect.width);
  canvas.height = Math.max(1, rect.height);
  canvas.getContext("2d", { willReadFrequently: true }).drawImage(
    image,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    canvas.width,
    canvas.height
  );
  return canvas;
}

function analyzeHeader(image, alignment) {
  const leftPowerCrop = cropHeaderRegion(image, HEADER_REGIONS.power.left, alignment);
  const rightPowerCrop = cropHeaderRegion(image, HEADER_REGIONS.power.right, alignment);
  const leftAttackCrop = cropHeaderRegion(image, HEADER_REGIONS.attackMarker.left, alignment);
  const rightAttackCrop = cropHeaderRegion(image, HEADER_REGIONS.attackMarker.right, alignment);

  const leftPowerData = leftPowerCrop
    .getContext("2d", { willReadFrequently: true })
    .getImageData(0, 0, leftPowerCrop.width, leftPowerCrop.height);
  const rightPowerData = rightPowerCrop
    .getContext("2d", { willReadFrequently: true })
    .getImageData(0, 0, rightPowerCrop.width, rightPowerCrop.height);

  const leftAttackData = leftAttackCrop
    .getContext("2d", { willReadFrequently: true })
    .getImageData(0, 0, leftAttackCrop.width, leftAttackCrop.height);
  const rightAttackData = rightAttackCrop
    .getContext("2d", { willReadFrequently: true })
    .getImageData(0, 0, rightAttackCrop.width, rightAttackCrop.height);

  const leftGreenRatio = greenMarkerRatio(leftAttackData);
  const rightGreenRatio = greenMarkerRatio(rightAttackData);
  const attackSide = inferAttackSide(leftGreenRatio, rightGreenRatio);

  const result = {
    powerPreview: {
      left: headerCropPreviewDataUrl(leftPowerCrop),
      right: headerCropPreviewDataUrl(rightPowerCrop)
    },
    powerRead: {
      left: readPowerFromImageData(leftPowerData),
      right: readPowerFromImageData(rightPowerData)
    },
    attackPreview: {
      left: headerCropPreviewDataUrl(leftAttackCrop),
      right: headerCropPreviewDataUrl(rightAttackCrop)
    },
    greenRatio: {
      left: leftGreenRatio,
      right: rightGreenRatio
    },
    attackSide
  };

  for (const crop of [leftPowerCrop, rightPowerCrop, leftAttackCrop, rightAttackCrop]) {
    crop.width = 1;
    crop.height = 1;
  }

  return result;
}


async function loadCatalog() {
  if (catalogIndex && teamDefinitions.length && warCounters.length) return;

  const [charactersResponse, teamsResponse, countersResponse] = await Promise.all([
    fetch("data/msf-characters.json", { cache: "no-store" }),
    fetch("data/teams.json", { cache: "no-store" }),
    fetch("data/war-counters.json", { cache: "no-store" })
  ]);

  if (!charactersResponse.ok) throw new Error("Catalogue personnages indisponible.");
  if (!teamsResponse.ok) throw new Error("Catalogue équipes indisponible.");
  if (!countersResponse.ok) throw new Error("Base War Counters indisponible.");

  const [rawCharacters, rawTeams, rawCounters] = await Promise.all([
    charactersResponse.json(),
    teamsResponse.json(),
    countersResponse.json()
  ]);

  catalog = rawCharacters
    .filter((item) => item?.player_Character === true && item?.id && item?.nameKey)
    .sort((a, b) => String(a.nameKey).localeCompare(String(b.nameKey), "fr"));

  teamDefinitions = Array.isArray(rawTeams) ? rawTeams : [];
  warCounters = Array.isArray(rawCounters) ? rawCounters : [];

  catalogIndex = normalizeCatalog(catalog);
  catalogById = catalogIndex.byId;
}

function ensureWorker() {
  if (worker) return worker;

  worker = new Worker(WORKER_URL.href);
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

function characterName(id) {
  return catalogById.get(id)?.nameKey || id || "Non reconnu";
}

function characterPortrait(id) {
  return catalogById.get(id)?.portraitUrl || "";
}

function parsePower(value) {
  const digits = String(value ?? "").replace(/\D+/g, "");
  if (!digits) return 0;
  const number = Number(digits);
  return Number.isSafeInteger(number) && number > 0 ? number : 0;
}

function formatPower(value) {
  const number = parsePower(value);
  return number ? new Intl.NumberFormat("fr-FR").format(number) : "";
}

function formatRatio(value) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function buildMatchupPreview(run) {
  const state = attackDefenseState(run);
  if (!state || !state.ratio) return null;

  const attackTeam = buildTeamLabels(state.attackIds, teamDefinitions, characterName);
  const defenseTeam = buildTeamLabels(state.defenseIds, teamDefinitions, characterName);
  const matches = findMatchingCounters(warCounters, state.attackIds, state.defenseIds);
  const comparison = summarizeCounterComparison(matches, state.ratio);

  return {
    state,
    ratio: ceilRatioToHundredth(state.ratio),
    attackTeam,
    defenseTeam,
    comparison
  };
}

function teamRows(run, side) {
  return run.rows.filter((row) => row.side === side);
}

function teamCharacterIds(run, side) {
  return teamRows(run, side)
    .filter((row) => !row.isAbsent && row.selectedCharacterId)
    .map((row) => row.selectedCharacterId);
}

function canonicalTeamKey(ids) {
  return [...ids].filter(Boolean).sort((a, b) => a.localeCompare(b)).join("|");
}

function teamLabel(run, side) {
  if (!run.direction) return side === "left" ? "Équipe gauche" : "Équipe droite";
  const attackSide = run.direction === "left-attack" ? "left" : "right";
  return side === attackSide ? "Attaque" : "Défense";
}

function attackDefenseState(run) {
  if (!run.direction) return null;

  const attackSide = run.direction === "left-attack" ? "left" : "right";
  const defenseSide = attackSide === "left" ? "right" : "left";
  const attackPower = parsePower(attackSide === "left" ? run.leftPower : run.rightPower);
  const defensePower = parsePower(defenseSide === "left" ? run.leftPower : run.rightPower);
  const attackIds = teamCharacterIds(run, attackSide);
  const defenseIds = teamCharacterIds(run, defenseSide);

  return {
    attackSide,
    defenseSide,
    attackPower,
    defensePower,
    attackIds,
    defenseIds,
    attackKey: canonicalTeamKey(attackIds),
    defenseKey: canonicalTeamKey(defenseIds),
    ratio: attackPower > 0 && defensePower > 0 ? attackPower / defensePower : null
  };
}

function portraitsResolved(run) {
  return run.rows.length === 10 && run.rows.every((row) => row.isAbsent || Boolean(row.selectedCharacterId));
}

function runReady(run) {
  if (run.error || !run.portraitsConfirmed || !portraitsResolved(run) || !run.direction) return false;
  return parsePower(run.leftPower) > 0 && parsePower(run.rightPower) > 0;
}

function statusForRun(run) {
  if (run.error) return { label: "Erreur", className: "is-error" };
  if (runReady(run)) return { label: "Prêt à comparer", className: "is-ready" };
  if (run.rows.length) return { label: "À vérifier", className: "" };
  return { label: "En attente", className: "" };
}

function setStatusChip(node, status) {
  node.className = "status-chip";
  if (status.className) node.classList.add(status.className);
  node.textContent = status.label;
}

function revokeRunUrls() {
  for (const run of runs) {
    if (run.sourceUrl) URL.revokeObjectURL(run.sourceUrl);
  }
}

function resetResults() {
  revokeRunUrls();
  runs = [];
  resultsRoot.replaceChildren();
  batchSummary.hidden = true;
  batchSummaryText.textContent = "";
}

function updateBatchSummary() {
  if (!runs.length) {
    batchSummary.hidden = true;
    return;
  }

  const valid = runs.filter((run) => !run.error);
  const ready = valid.filter(runReady).length;
  const errors = runs.length - valid.length;
  const parts = [
    `${runs.length} capture${runs.length > 1 ? "s" : ""}`,
    `${ready} prête${ready > 1 ? "s" : ""}`,
    `${valid.length - ready} à vérifier`
  ];
  if (errors) parts.push(`${errors} en erreur`);

  batchSummary.hidden = false;
  batchSummaryText.textContent = parts.join(" · ");
  batchBadge.textContent = `${runs.length} analysée${runs.length > 1 ? "s" : ""}`;
}

function createButton(label, className = "secondary-button") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  return button;
}

function renderSlot(run, row) {
  const article = document.createElement("article");
  article.className = "slot-card";
  if (row.corrected) article.classList.add("is-corrected");
  if (row.isAbsent) article.classList.add("is-absent");

  const head = document.createElement("div");
  head.className = "slot-head";

  const slotName = document.createElement("strong");
  slotName.textContent = row.label;
  const state = document.createElement("span");
  if (row.barred) {
    state.className = "ko-badge";
    state.textContent = "KO";
  } else {
    state.textContent = row.slot;
  }
  head.append(slotName, state);

  const crop = document.createElement("img");
  crop.className = "slot-crop";
  crop.src = row.previewUrl;
  crop.alt = `Fragment analysé ${row.label}`;

  const result = document.createElement("div");
  result.className = "slot-result";

  if (!row.isAbsent && row.selectedCharacterId) {
    const portraitUrl = characterPortrait(row.selectedCharacterId);
    if (portraitUrl) {
      const portrait = document.createElement("img");
      portrait.className = "slot-portrait";
      portrait.src = portraitUrl;
      portrait.alt = "";
      portrait.loading = "lazy";
      result.append(portrait);
    }
  }

  const name = document.createElement("div");
  name.className = "slot-name";
  name.textContent = row.isAbsent ? "Emplacement vide" : characterName(row.selectedCharacterId);
  result.append(name);

  const note = document.createElement("div");
  note.className = "slot-note";
  const source = document.createElement("span");
  source.textContent = row.corrected
    ? "Corrigé"
    : row.absenceDetected
      ? "Vide détecté"
      : "AKAZE Top 1";
  const candidateCount = document.createElement("span");
  candidateCount.textContent = `${row.candidates.length} candidats`;
  note.append(source, candidateCount);

  const correctionButton = createButton("Vérifier / corriger");
  correctionButton.addEventListener("click", () => openCorrection(run, row));

  article.append(head, crop, result, note, correctionButton);
  return article;
}

function renderPowerField(run, side, section) {
  const wrap = document.createElement("div");
  wrap.className = "power-block";

  const evidence = document.createElement("div");
  evidence.className = "power-evidence";

  const crop = document.createElement("img");
  crop.className = "power-crop";
  crop.src = run.header?.powerPreview?.[side] || "";
  crop.alt = `Zone puissance ${side === "left" ? "gauche" : "droite"} analysée`;

  const evidenceText = document.createElement("div");
  evidenceText.className = "power-evidence-text";

  const evidenceTitle = document.createElement("strong");
  evidenceTitle.textContent = "Zone puissance";

  const evidenceNote = document.createElement("span");
  const powerRead = run.header?.powerRead?.[side];

  if (powerRead?.value) {
    const score = Number.isFinite(powerRead.minScore)
      ? ` · score min ${powerRead.minScore.toFixed(2)}`
      : "";
    evidenceNote.textContent =
      `Puissance détectée localement${score}. Vérifie ce crop et corrige seulement si nécessaire.`;
  } else {
    evidenceNote.textContent =
      "Lecture locale incertaine. Vérifie ce crop et saisis la puissance manuellement.";
  }

  evidenceText.append(evidenceTitle, evidenceNote);
  evidence.append(crop, evidenceText);

  const label = document.createElement("label");
  label.className = "power-field";

  const text = document.createElement("span");
  text.textContent = `Puissance ${teamLabel(run, side).toLowerCase()}`;

  const powerInput = document.createElement("input");
  powerInput.type = "text";
  powerInput.inputMode = "numeric";
  powerInput.enterKeyHint = "done";
  powerInput.autocomplete = "off";
  powerInput.placeholder = "ex. 5 250 000";
  powerInput.value = formatPower(side === "left" ? run.leftPower : run.rightPower);
  powerInput.setAttribute("aria-label", `Puissance équipe ${side === "left" ? "gauche" : "droite"}`);

  powerInput.addEventListener("input", () => {
    const digits = powerInput.value.replace(/\D+/g, "");
    if (side === "left") run.leftPower = digits;
    else run.rightPower = digits;
    refreshDerived(run, section);
  });

  powerInput.addEventListener("blur", () => {
    powerInput.value = formatPower(powerInput.value);
  });

  label.append(text, powerInput);
  wrap.append(evidence, label);
  return wrap;
}

function renderTeam(run, side, section) {
  const panel = document.createElement("section");
  panel.className = "team-panel";

  const head = document.createElement("div");
  head.className = "team-head";

  const titleBlock = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = teamLabel(run, side);
  const subtitle = document.createElement("p");
  subtitle.textContent = side === "left" ? "5 emplacements de gauche" : "5 emplacements de droite";
  titleBlock.append(title, subtitle);
  head.append(titleBlock);

  const scroller = document.createElement("div");
  scroller.className = "team-slots-scroll";
  const slots = document.createElement("div");
  slots.className = "team-slots";

  for (const row of teamRows(run, side)) {
    slots.append(renderSlot(run, row));
  }

  scroller.append(slots);
  panel.append(head, scroller, renderPowerField(run, side, section));
  return panel;
}

function renderDirection(run, section) {
  const panel = document.createElement("section");
  panel.className = "direction-panel";

  const title = document.createElement("h3");
  title.textContent = "Sens du combat";

  const detected = document.createElement("div");
  detected.className = "direction-detection";

  const detectedText = document.createElement("div");
  detectedText.className = "direction-detection-text";

  const detectedTitle = document.createElement("strong");
  if (run.header?.attackSide === "left") {
    detectedTitle.textContent = "Attaquant détecté : gauche";
  } else if (run.header?.attackSide === "right") {
    detectedTitle.textContent = "Attaquant détecté : droite";
  } else {
    detectedTitle.textContent = "Attaquant non déterminé automatiquement";
  }

  const detectedNote = document.createElement("span");
  detectedNote.textContent = "Détection locale basée sur le marqueur vert de points en haut, jamais sur le fond bleu/rouge.";

  detectedText.append(detectedTitle, detectedNote);

  const evidence = document.createElement("div");
  evidence.className = "attack-evidence";

  for (const side of ["left", "right"]) {
    const item = document.createElement("div");
    item.className = "attack-evidence-item";
    if (run.header?.attackSide === side) item.classList.add("is-detected");

    const label = document.createElement("span");
    label.textContent = side === "left" ? "Haut gauche" : "Haut droite";

    const image = document.createElement("img");
    image.src = run.header?.attackPreview?.[side] || "";
    image.alt = `Zone marqueur d’attaque ${side === "left" ? "gauche" : "droite"}`;

    const score = document.createElement("small");
    const ratio = Number(run.header?.greenRatio?.[side] || 0) * 100;
    score.textContent = `signal vert ${ratio.toFixed(1)} %`;

    item.append(label, image, score);
    evidence.append(item);
  }

  detected.append(detectedText, evidence);

  const options = document.createElement("div");
  options.className = "direction-options";

  const choices = [
    { value: "left-attack", label: "Gauche = ATTAQUE → Droite = DÉFENSE" },
    { value: "right-attack", label: "Droite = ATTAQUE → Gauche = DÉFENSE" }
  ];

  for (const choice of choices) {
    const label = document.createElement("label");
    label.className = "direction-option";

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = `direction-${run.id}`;
    radio.value = choice.value;
    radio.checked = run.direction === choice.value;

    const text = document.createElement("span");
    text.textContent = choice.label;

    radio.addEventListener("change", () => {
      run.direction = choice.value;
      run.directionCorrected = true;
      renderAll();
    });

    label.append(radio, text);
    options.append(label);
  }

  panel.append(title, detected, options);
  return panel;
}

function teamSummaryText(ids) {
  if (!ids.length) return "Aucun personnage";
  return ids.map(characterName).join(" · ");
}

function renderCounterSummary(run) {
  const panel = document.createElement("section");
  panel.className = "counter-summary";

  const head = document.createElement("div");
  head.className = "summary-head";

  const title = document.createElement("h3");
  title.textContent = "Contre préparé";

  const chip = document.createElement("span");
  chip.dataset.role = "summary-status";
  setStatusChip(chip, statusForRun(run));

  head.append(title, chip);

  const state = attackDefenseState(run);
  const preview = runReady(run) ? buildMatchupPreview(run) : null;
  const grid = document.createElement("div");
  grid.className = "summary-grid";

  const makeTeam = (labelText, ids, power, teamInfo) => {
    const block = document.createElement("div");
    block.className = "summary-team";

    const label = document.createElement("div");
    label.className = "summary-label";
    label.textContent = labelText;

    if (teamInfo) {
      const teamName = document.createElement("div");
      teamName.className = "summary-team-name";

      if (teamInfo.status === "resolved") {
        teamName.textContent = teamInfo.variant;
      } else if (teamInfo.status === "ambiguous") {
        const candidates = [...new Set(teamInfo.candidates.map((item) => item.team))];
        teamName.textContent = `Nom d’équipe à vérifier : ${candidates.join(" / ")}`;
        teamName.classList.add("is-warning");
      } else {
        teamName.textContent = "Équipe non déterminée dans teams.json";
        teamName.classList.add("is-warning");
      }

      block.append(label, teamName);
    } else {
      block.append(label);
    }

    const names = document.createElement("div");
    names.className = "summary-characters";
    names.textContent = teamSummaryText(ids);

    const powerNode = document.createElement("div");
    powerNode.className = "summary-power";
    powerNode.textContent = power ? formatPower(power) : "Puissance à renseigner";

    block.append(names, powerNode);
    return block;
  };

  if (state) {
    grid.append(
      makeTeam("Attaque", state.attackIds, state.attackPower, preview?.attackTeam),
      makeTeam("Défense", state.defenseIds, state.defensePower, preview?.defenseTeam)
    );
  } else {
    grid.append(
      makeTeam("Équipe gauche", teamCharacterIds(run, "left"), parsePower(run.leftPower)),
      makeTeam("Équipe droite", teamCharacterIds(run, "right"), parsePower(run.rightPower))
    );
  }

  const ratioLine = document.createElement("div");
  ratioLine.className = "ratio-line";
  const ratioLabel = document.createElement("span");
  ratioLabel.textContent = "Ratio retenu · arrondi supérieur";
  const ratioValue = document.createElement("span");
  ratioValue.className = "ratio-value";
  ratioValue.textContent = preview?.ratio ? formatRatio(preview.ratio) : "—";
  ratioLine.append(ratioLabel, ratioValue);

  const sheetState = document.createElement("div");
  sheetState.className = "sheet-state";

  if (preview) {
    const comparison = preview.comparison;
    const message = document.createElement("strong");
    const detail = document.createElement("span");

    if (comparison.status === "new") {
      sheetState.classList.add("is-new");
      message.textContent = "Nouveau matchup";
      detail.textContent = "Aucune composition attaque/défense identique dans la base actuelle.";
    } else if (comparison.status === "improves") {
      sheetState.classList.add("is-improvement");
      message.textContent = "Amélioration du contre existant";
      detail.textContent = `Ratio actuel ${formatRatio(comparison.existingRatio)} → nouveau ratio ${formatRatio(comparison.ratio)}. Seule la valeur hard (Q) serait abaissée.`;
    } else if (comparison.status === "same") {
      sheetState.classList.add("is-same");
      message.textContent = "Ratio déjà enregistré";
      detail.textContent = `La base contient déjà ${formatRatio(comparison.existingRatio)}. Aucune modification nécessaire.`;
    } else if (comparison.status === "worse") {
      sheetState.classList.add("is-worse");
      message.textContent = "Le contre existant est meilleur";
      detail.textContent = `Ratio actuel ${formatRatio(comparison.existingRatio)} · nouveau ratio ${formatRatio(comparison.ratio)}. Aucune modification.`;
    } else {
      sheetState.classList.add("is-warning");
      message.textContent = "Plusieurs valeurs différentes pour ce matchup";
      detail.textContent = "Lecture seule : vérification manuelle requise avant toute future écriture.";
    }

    sheetState.append(message, detail);

    if (comparison.matches.length > 1) {
      const classifications = document.createElement("small");
      const labels = comparison.matches
        .map((item) => `${item.defFamily || item.defVariant} → ${item.atkFamily || item.atkTeam}`)
        .filter(Boolean);
      classifications.textContent = `${comparison.matches.length} classifications trouvées : ${[...new Set(labels)].join(" · ")}`;
      sheetState.append(classifications);
    }

    panel.dataset.attackKey = state.attackKey || "";
    panel.dataset.defenseKey = state.defenseKey || "";
  } else if (!run.portraitsConfirmed) {
    sheetState.textContent = "Vérifie les fragments analysés puis confirme les portraits.";
  } else if (!run.direction) {
    sheetState.textContent = "Choisis le sens du combat.";
  } else {
    sheetState.textContent = "Renseigne les deux puissances pour calculer le ratio.";
  }

  panel.append(head, grid, ratioLine, sheetState);
  return panel;
}

function renderRun(run) {
  const section = document.createElement("article");
  section.className = "capture-card";
  section.dataset.runId = run.id;

  const head = document.createElement("div");
  head.className = "capture-head";

  const titleBlock = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = run.fileName;
  const meta = document.createElement("p");
  meta.className = "capture-meta";

  if (run.error) {
    meta.textContent = "Analyse impossible";
  } else {
    const alignmentText = run.alignment?.used ? "recalage horizontal R6.6" : "grille R6.6";
    meta.textContent = `${run.width} × ${run.height} · ${alignmentText}`;
  }

  titleBlock.append(title, meta);

  const status = document.createElement("span");
  status.dataset.role = "capture-status";
  setStatusChip(status, statusForRun(run));

  head.append(titleBlock, status);
  section.append(head);

  if (run.sourceUrl) {
    const details = document.createElement("details");
    details.className = "source-details";
    const summary = document.createElement("summary");
    summary.textContent = "Voir la capture complète";
    const image = document.createElement("img");
    image.className = "source-preview";
    image.src = run.sourceUrl;
    image.alt = `Capture complète ${run.fileName}`;
    image.loading = "lazy";
    details.append(summary, image);
    section.append(details);
  }

  if (run.error) {
    const error = document.createElement("p");
    error.className = "capture-error";
    error.textContent = run.error;
    section.append(error);
    return section;
  }

  const teamGrid = document.createElement("div");
  teamGrid.className = "team-grid";
  teamGrid.append(
    renderTeam(run, "left", section),
    renderTeam(run, "right", section)
  );
  section.append(teamGrid);

  const verifyRow = document.createElement("div");
  verifyRow.className = "verify-row";

  const verifyButton = createButton(run.portraitsConfirmed ? "Portraits vérifiés ✓" : "Confirmer les portraits");
  if (run.portraitsConfirmed) verifyButton.classList.add("is-confirmed");

  verifyButton.addEventListener("click", () => {
    if (!portraitsResolved(run)) return;
    run.portraitsConfirmed = !run.portraitsConfirmed;
    renderAll();
  });

  const verifyHint = document.createElement("span");
  verifyHint.className = "verify-hint";
  verifyHint.textContent = "Les 10 fragments ci-dessus sont ceux réellement envoyés à AKAZE.";

  verifyRow.append(verifyButton, verifyHint);
  section.append(verifyRow, renderDirection(run, section), renderCounterSummary(run));

  return section;
}

function renderAll() {
  resultsRoot.replaceChildren();
  for (const run of runs) resultsRoot.append(renderRun(run));
  updateBatchSummary();
}

function openCorrection(run, row) {
  activeCorrection = { run, row };
  characterDialogTitle.textContent = `${row.label} · ${teamLabel(run, row.side)}`;
  characterCropPreview.src = row.previewUrl;
  characterSearch.value = "";
  renderCharacterChoices("");
  characterDialog.showModal();
}

function applyCorrection(characterId, isAbsent = false) {
  if (!activeCorrection) return;

  const { run, row } = activeCorrection;
  row.selectedCharacterId = isAbsent ? null : characterId;
  row.isAbsent = isAbsent;
  row.corrected = true;
  run.portraitsConfirmed = false;

  activeCorrection = null;
  characterDialog.close();
  renderAll();
}

function renderCharacterChoices(query) {
  characterResults.replaceChildren();
  if (!activeCorrection) return;

  const { row } = activeCorrection;
  const normalizedQuery = normalizeText(query);

  let choices;
  if (!normalizedQuery) {
    candidateHeading.textContent = "Top 10 AKAZE";
    choices = row.candidates.slice(0, 10).map((candidate, index) => ({
      id: candidate.id,
      rank: index + 1,
      score: candidate.score
    }));
  } else {
    candidateHeading.textContent = "Résultats du catalogue";
    choices = catalog
      .filter((item) => {
        const haystack = normalizeText([
          item.id,
          item.nameKey,
          item.nameFr,
          item.nameEn
        ].filter(Boolean).join(" "));
        return haystack.includes(normalizedQuery);
      })
      .slice(0, 60)
      .map((item) => ({ id: item.id, rank: null, score: null }));
  }

  const seen = new Set();
  const unique = choices.filter((choice) => {
    if (!choice.id || seen.has(choice.id) || !catalogById.has(choice.id)) return false;
    seen.add(choice.id);
    return true;
  });

  if (!unique.length) {
    const empty = document.createElement("p");
    empty.className = "empty-results";
    empty.textContent = normalizedQuery ? "Aucun personnage trouvé." : "Aucun candidat AKAZE.";
    characterResults.append(empty);
    return;
  }

  for (const choice of unique) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "character-choice";

    const portraitUrl = characterPortrait(choice.id);
    if (portraitUrl) {
      const image = document.createElement("img");
      image.src = portraitUrl;
      image.alt = "";
      image.loading = "lazy";
      button.append(image);
    }

    const text = document.createElement("span");
    text.className = "character-choice-text";

    const name = document.createElement("span");
    name.className = "character-choice-name";
    name.textContent = characterName(choice.id);

    const detail = document.createElement("span");
    detail.className = "character-choice-rank";
    if (choice.rank) {
      const score = Number.isFinite(choice.score) ? ` · score ${choice.score.toFixed(4)}` : "";
      detail.textContent = `AKAZE #${choice.rank}${score}`;
    } else {
      detail.textContent = choice.id;
    }

    text.append(name, detail);
    button.append(text);
    button.addEventListener("click", () => applyCorrection(choice.id, false));
    characterResults.append(button);
  }
}

async function analyzeFile(file, index, count) {
  validateUpload(file);

  const decoded = await decodeImage(file);
  const sourceUrl = URL.createObjectURL(file);
  const started = performance.now();

  try {
    const alignment = detectHorizontalContentBounds(decoded.image);
    const header = analyzeHeader(decoded.image, alignment);
    const slots = slotsForBounds(alignment, decoded.width);
    const rows = [];

    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      const slot = slots[slotIndex];
      analysisStatus.textContent =
        `Capture ${index + 1}/${count} · portrait ${slotIndex + 1}/10 — ${file.name}${alignment.used ? " · recalage X" : ""}`;

      const crop = cropBase(decoded.image, slot);
      const context = crop.getContext("2d", { willReadFrequently: true });
      const imageData = context.getImageData(0, 0, crop.width, crop.height);
      const previewUrl = cropPreviewDataUrl(crop);
      const occupancy = analyzePortraitOccupancy(imageData);

      if (occupancy.isAbsent) {
        rows.push({
          slot: slot.slot,
          label: slot.label,
          side: slot.side,
          position: slot.position,
          barred: false,
          previewUrl,
          candidates: [],
          selectedCharacterId: null,
          isAbsent: true,
          absenceDetected: true,
          occupancy,
          corrected: false,
          extractMs: 0,
          matchMs: 0
        });

        crop.width = 1;
        crop.height = 1;
        await nextFrame();
        continue;
      }

      const barred = detectRedCross(imageData);
      const buffer = imageData.data.buffer;

      const result = await workerCall("analyze", {
        width: crop.width,
        height: crop.height,
        buffer
      }, [buffer], 60000);

      rows.push({
        slot: slot.slot,
        label: slot.label,
        side: slot.side,
        position: slot.position,
        barred,
        previewUrl,
        candidates: Array.isArray(result.candidates) ? result.candidates : [],
        selectedCharacterId: result.candidates?.[0]?.id || null,
        isAbsent: false,
        absenceDetected: false,
        occupancy,
        corrected: false,
        extractMs: result.extractMs,
        matchMs: result.matchMs
      });

      crop.width = 1;
      crop.height = 1;
      await nextFrame();
    }

    return {
      id: `capture-${Date.now()}-${index}`,
      fileName: file.name,
      width: decoded.width,
      height: decoded.height,
      sourceUrl,
      alignment,
      header,
      rows,
      direction: header.attackSide ? `${header.attackSide}-attack` : "",
      directionCorrected: false,
      leftPower: header.powerRead.left.value || "",
      rightPower: header.powerRead.right.value || "",
      portraitsConfirmed: false,
      totalMs: performance.now() - started,
      error: null
    };
  } catch (error) {
    URL.revokeObjectURL(sourceUrl);
    throw error;
  } finally {
    decoded.close();
  }
}

async function analyzeSelected() {
  const files = [...(input.files || [])];
  if (!files.length || analyzing) return;

  analyzing = true;
  analyzeButton.disabled = true;
  resetResults();

  try {
    analysisStatus.textContent = "Chargement du catalogue et du moteur AKAZE…";
    await loadCatalog();
    const init = await workerCall("init", null, [], 120000);
    analysisStatus.textContent = `${init.referenceCount} références / ${init.descriptorCount} descripteurs prêts.`;

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];

      try {
        const run = await analyzeFile(file, index, files.length);
        runs.push(run);
      } catch (error) {
        runs.push({
          id: `capture-error-${Date.now()}-${index}`,
          fileName: file.name,
          width: 0,
          height: 0,
          sourceUrl: URL.createObjectURL(file),
          alignment: null,
          header: null,
          rows: [],
          direction: "",
          directionCorrected: false,
          leftPower: "",
          rightPower: "",
          portraitsConfirmed: false,
          totalMs: 0,
          error: error?.message || String(error)
        });
      }

      renderAll();
      await nextFrame();
    }

    const successful = runs.filter((run) => !run.error).length;
    analysisStatus.textContent =
      `Analyse terminée : ${successful}/${files.length} capture${files.length > 1 ? "s" : ""} exploitable${successful > 1 ? "s" : ""}. Vérifie maintenant les fragments et les personnages proposés.`;
  } catch (error) {
    analysisStatus.textContent = error?.message || "Analyse impossible.";
  } finally {
    analyzing = false;
    analyzeButton.disabled = !(input.files?.length);
  }
}

input.addEventListener("change", () => {
  resetResults();

  const files = [...(input.files || [])];
  analyzeButton.disabled = !files.length || analyzing;

  if (!files.length) {
    batchBadge.textContent = "Aucune capture";
    selectionSummary.textContent = "JPEG, PNG ou WebP — 12 Mo maximum par image.";
    analysisStatus.textContent = "";
    return;
  }

  batchBadge.textContent = `${files.length} sélectionnée${files.length > 1 ? "s" : ""}`;
  selectionSummary.textContent =
    `${files.length} capture${files.length > 1 ? "s" : ""} prête${files.length > 1 ? "s" : ""} à analyser depuis le même lot.`;
  analysisStatus.textContent = "";
});

analyzeButton.addEventListener("click", analyzeSelected);

characterSearch.addEventListener("input", () => {
  renderCharacterChoices(characterSearch.value);
});

markAbsentButton.addEventListener("click", () => {
  applyCorrection(null, true);
});

characterDialog.addEventListener("close", () => {
  activeCorrection = null;
  characterSearch.value = "";
  characterResults.replaceChildren();
});
