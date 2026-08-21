import {
  calculatePixelRect,
  detectRedCross,
  filterWarPlayableCatalog,
  getCropVariants,
  getLayoutSlots,
  normalizeCatalog,
  normalizeText,
  validateUpload
} from "./war-counter-lab-core.js";

const WORKER_URL = "war-counter-akaze-worker.js?v=r5-akaze-worker-2";
const STORAGE_KEY = "warCounterAkazeValidationTruthV1";

const $ = (selector) => document.querySelector(selector);
const input = $("#akazeValidationInput");
const runButton = $("#runAkazeValidation");
const exportButton = $("#exportAkazeTruth");
const statusNode = $("#akazeValidationStatus");
const summaryNode = $("#akazeValidationSummary");
const resultsNode = $("#akazeValidationResults");
const dataList = $("#akazeCharacterOptions");

let worker = null;
let requestId = 0;
const pending = new Map();
let catalogIndex = null;
let catalog = [];
let runs = [];
let initMetrics = null;

function ms(value) {
  return `${Number(value || 0).toFixed(1)} ms`;
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function readTruthStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
}

function writeTruthStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (error) {
    console.warn("Impossible de sauvegarder les vérités AKAZE dans localStorage.", error);
  }
}

async function fingerprint(file) {
  const buffer = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function loadCatalog() {
  if (catalogIndex) return;
  const response = await fetch("data/msf-characters.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Catalogue personnages indisponible.");
  catalog = filterWarPlayableCatalog(await response.json());
  catalogIndex = normalizeCatalog(catalog);

  const fragment = document.createDocumentFragment();
  for (const item of [...catalog].sort((a, b) => String(a.nameKey).localeCompare(String(b.nameKey), "fr"))) {
    const option = document.createElement("option");
    option.value = item.nameKey || item.id;
    option.dataset.characterId = item.id;
    fragment.append(option);
  }
  dataList.replaceChildren(fragment);
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

function isOutlinePixel(red, green, blue) {
  const cyan = green > 75 && blue > 95 && blue > red * 1.15 && green > red * 0.85;
  const redOutline = red > 135 && red > green * 1.45 && red > blue * 1.12;
  return cyan || redOutline;
}

function detectHorizontalContentBounds(image) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0);

  const yStart = Math.max(0, Math.floor(image.height * 0.47));
  const yEnd = Math.min(image.height, Math.ceil(image.height * 0.93));
  const scanHeight = Math.max(1, yEnd - yStart);
  const imageData = context.getImageData(0, yStart, image.width, scanHeight);
  const counts = new Uint16Array(image.width);

  for (let y = 0; y < scanHeight; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      if (isOutlinePixel(imageData.data[offset], imageData.data[offset + 1], imageData.data[offset + 2])) {
        counts[x] += 1;
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

  // Safari screenshots can include a thin scroll indicator near the far right.
  // Ignore an isolated, very narrow tail separated from the actual war panel.
  while (groups.length > 2) {
    const tail = groups[groups.length - 1];
    const before = groups[groups.length - 2];
    const gap = tail.start - before.end - 1;
    const tailWidth = tail.end - tail.start + 1;
    if (gap > image.width * 0.035 && tailWidth < image.width * 0.02) groups.pop();
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

  // Ne recale que lorsqu'il existe un vrai padding/cadrage horizontal.
  // Les captures plein écran historiques conservent donc exactement la grille R5.
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
  return baseSlots.map((slot) => Object.freeze({
    ...slot,
    x: leftRatio + slot.x * widthRatio,
    width: slot.width * widthRatio
  }));
}

function cropBase(image, slot) {
  const variant = getCropVariants(slot).wide;
  const rect = calculatePixelRect(variant, image.width, image.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, rect.width);
  canvas.height = Math.max(1, rect.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function thumbnailDataUrl(crop) {
  const width = 86;
  const height = 86;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(crop, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.58);
}

function characterName(id) {
  return catalogIndex?.byId.get(id)?.nameKey || id || "—";
}

function resolveTypedCharacter(value) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  return catalogIndex.aliases.get(normalized) || null;
}

function rankFor(row) {
  if (!row.truthId) return null;
  const index = row.candidates.findIndex((candidate) => candidate.id === row.truthId);
  return index >= 0 ? index + 1 : Infinity;
}

function metricsFromRuns() {
  const rows = runs.flatMap((run) => run.rows).filter((row) => row.truthId);
  const out = {
    evaluated: rows.length,
    top1: 0,
    top3: 0,
    top5: 0,
    top10: 0,
    rankSum: 0,
    barred: { evaluated: 0, top1: 0, top3: 0, top5: 0, top10: 0 },
    unbarred: { evaluated: 0, top1: 0, top3: 0, top5: 0, top10: 0 }
  };
  for (const row of rows) {
    const rank = rankFor(row);
    const bucket = row.barred ? out.barred : out.unbarred;
    bucket.evaluated += 1;
    if (rank !== Infinity) out.rankSum += rank;
    else out.rankSum += 11;
    for (const [key, limit] of [["top1", 1], ["top3", 3], ["top5", 5], ["top10", 10]]) {
      if (rank <= limit) {
        out[key] += 1;
        bucket[key] += 1;
      }
    }
  }
  return out;
}

function pct(value, total) {
  return total ? `${value}/${total} (${(value * 100 / total).toFixed(1)} %)` : "0/0";
}

function updateSummary() {
  const metrics = metricsFromRuns();
  const totalSlots = runs.reduce((sum, run) => sum + run.rows.length, 0);
  const totalMs = runs.reduce((sum, run) => sum + run.totalMs, 0);
  const computeMs = runs.reduce((sum, run) => sum + run.rows.reduce((slotSum, row) => slotSum + row.extractMs + row.matchMs, 0), 0);
  const meanRank = metrics.evaluated ? (metrics.rankSum / metrics.evaluated).toFixed(2) : "—";
  const realigned = runs.filter((run) => run.alignment?.used).length;
  summaryNode.textContent = `${runs.length} capture(s) · ${totalSlots} slots analysés · ${metrics.evaluated} vérité(s) confirmée(s) · Top 1 ${pct(metrics.top1, metrics.evaluated)} · Top 3 ${pct(metrics.top3, metrics.evaluated)} · Top 5 ${pct(metrics.top5, metrics.evaluated)} · Top 10 ${pct(metrics.top10, metrics.evaluated)} · rang moyen ${meanRank} · recalage horizontal ${realigned}/${runs.length} · calcul ${ms(computeMs)} · total ${ms(totalMs)}`;

  if (metrics.evaluated) {
    statusNode.textContent = `Barrés : Top 1 ${pct(metrics.barred.top1, metrics.barred.evaluated)} · Top 5 ${pct(metrics.barred.top5, metrics.barred.evaluated)} — Non barrés : Top 1 ${pct(metrics.unbarred.top1, metrics.unbarred.evaluated)} · Top 5 ${pct(metrics.unbarred.top5, metrics.unbarred.evaluated)}.`;
  }
  exportButton.disabled = metrics.evaluated === 0;
}

function persistTruth(run, row) {
  const store = readTruthStore();
  const entry = store[run.hash] || { fileName: run.fileName, slots: {} };
  if (row.truthId) entry.slots[row.slot] = { characterId: row.truthId, barred: row.barred };
  else delete entry.slots[row.slot];
  store[run.hash] = entry;
  writeTruthStore(store);
}

function renderRow(run, row) {
  const article = document.createElement("article");
  article.className = "slot-card";

  const top5 = row.candidates.slice(0, 5).map((candidate, index) => `${index + 1}. ${characterName(candidate.id)}`).join(" · ");
  const rank = rankFor(row);
  const rankText = !row.truthId ? "à confirmer" : rank === Infinity ? "hors Top 10" : `rang ${rank}`;

  article.innerHTML = `
    <div class="slot-head"><strong>${row.label}</strong><span>${row.slot}</span></div>
    ${row.previewUrl ? `<img src="${row.previewUrl}" alt="Crop ${row.label}" width="86" height="86" style="border-radius:12px;object-fit:cover;display:block;margin:.4rem 0">` : ""}
    <div class="selected">${characterName(row.candidates[0]?.id)}</div>
    <small>${row.barred ? "Croix rouge détectée" : "Non barré"} · ${rankText}</small>
    <small>${top5}</small>
    <small>AKAZE ${ms(row.extractMs)} · matching ${ms(row.matchMs)}</small>
    <label>Vérité terrain
      <input class="akaze-truth-input" type="search" list="akazeCharacterOptions" autocomplete="off" placeholder="Confirmer ou corriger…">
    </label>
    <button class="akaze-confirm-top1" type="button">Confirmer Top 1</button>
  `;

  const truthInput = article.querySelector(".akaze-truth-input");
  const confirmButton = article.querySelector(".akaze-confirm-top1");
  if (row.truthId) truthInput.value = characterName(row.truthId);

  const applyTruth = (id) => {
    row.truthId = id;
    truthInput.value = id ? characterName(id) : "";
    persistTruth(run, row);
    const newRank = rankFor(row);
    const small = article.querySelectorAll("small")[0];
    small.textContent = `${row.barred ? "Croix rouge détectée" : "Non barré"} · ${!id ? "à confirmer" : newRank === Infinity ? "hors Top 10" : `rang ${newRank}`}`;
    updateSummary();
  };

  confirmButton.addEventListener("click", () => applyTruth(row.candidates[0]?.id || null));
  truthInput.addEventListener("change", () => {
    const id = resolveTypedCharacter(truthInput.value);
    if (!id && truthInput.value.trim()) {
      truthInput.setCustomValidity("Personnage inconnu dans le catalogue MSF.");
      truthInput.reportValidity();
      return;
    }
    truthInput.setCustomValidity("");
    applyTruth(id);
  });

  return article;
}

function alignmentLabel(run) {
  const alignment = run.alignment;
  if (!alignment?.used) return "Grille R5 standard";
  const width = Math.max(1, alignment.right - alignment.left);
  const ratio = (width * 100 / run.width).toFixed(1);
  return `🔧 Recalage horizontal auto : x=${alignment.left}…${alignment.right - 1} (${ratio} % de la largeur)`;
}

function renderRun(run) {
  const section = document.createElement("section");
  section.className = "validation-capture";
  const header = document.createElement("div");
  header.className = "validation-capture-head";
  header.innerHTML = `<h3>${run.fileName}</h3><p>${alignmentLabel(run)}</p><p>${run.width} × ${run.height} · ${ms(run.totalMs)}</p>`;

  const confirmAll = document.createElement("button");
  confirmAll.type = "button";
  confirmAll.textContent = "Confirmer les 10 Top 1";
  confirmAll.addEventListener("click", () => {
    for (const row of run.rows) {
      if (!row.truthId && row.candidates[0]?.id) {
        row.truthId = row.candidates[0].id;
        persistTruth(run, row);
      }
    }
    renderAll();
  });
  header.append(confirmAll);
  section.append(header);

  const grid = document.createElement("div");
  grid.className = "slots";
  for (const row of run.rows) grid.append(renderRow(run, row));
  section.append(grid);
  return section;
}

function renderAll() {
  resultsNode.replaceChildren();
  for (const run of runs) resultsNode.append(renderRun(run));
  updateSummary();
}

async function analyzeFile(file, fileIndex, fileCount) {
  validateUpload(file);
  const hash = await fingerprint(file);
  const store = readTruthStore();
  const saved = store[hash]?.slots || {};
  const started = performance.now();
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const width = bitmap.width;
  const height = bitmap.height;
  const rows = [];

  try {
    const alignment = detectHorizontalContentBounds(bitmap);
    const slots = slotsForBounds(alignment, width);
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      const slot = slots[slotIndex];
      statusNode.textContent = `Capture ${fileIndex + 1}/${fileCount} · slot ${slotIndex + 1}/10 — ${file.name}${alignment.used ? " · recalage X" : ""}`;
      const crop = cropBase(bitmap, slot);
      const context = crop.getContext("2d", { willReadFrequently: true });
      const imageData = context.getImageData(0, 0, crop.width, crop.height);
      const barred = detectRedCross(imageData);
      const previewUrl = alignment.used ? thumbnailDataUrl(crop) : null;
      const buffer = imageData.data.buffer;
      const result = await workerCall("analyze", { width: crop.width, height: crop.height, buffer }, [buffer], 60000);
      rows.push({
        slot: slot.slot,
        label: slot.label,
        barred,
        truthId: saved[slot.slot]?.characterId || null,
        extractMs: result.extractMs,
        matchMs: result.matchMs,
        candidates: result.candidates,
        previewUrl
      });
      crop.width = 1;
      crop.height = 1;
      await nextFrame();
    }

    return {
      hash,
      fileName: file.name,
      width,
      height,
      alignment,
      totalMs: performance.now() - started,
      rows
    };
  } finally {
    bitmap.close();
  }
}

async function runValidation() {
  const files = [...(input.files || [])];
  if (!files.length) throw new Error("Choisis au moins une capture.");

  runButton.disabled = true;
  exportButton.disabled = true;
  resultsNode.replaceChildren();
  runs = [];
  summaryNode.textContent = "Initialisation du benchmark multi-captures…";
  statusNode.textContent = "Chargement du catalogue et du moteur AKAZE…";
  await nextFrame();

  await loadCatalog();
  initMetrics = await workerCall("init", null, [], 120000);
  statusNode.textContent = `${initMetrics.referenceCount} références / ${initMetrics.descriptorCount} descripteurs prêts. Démarrage des captures…`;

  for (let index = 0; index < files.length; index += 1) {
    const run = await analyzeFile(files[index], index, files.length);
    runs.push(run);
    renderAll();
    await nextFrame();
  }

  statusNode.textContent = `Benchmark terminé sur ${files.length} capture(s). Confirme ou corrige les vérités terrain ; elles sont mémorisées sur ce téléphone.`;
  updateSummary();
}

function exportTruth() {
  const payload = {
    schemaVersion: "1.1.0",
    generatedAt: new Date().toISOString(),
    engine: {
      referenceCount: initMetrics?.referenceCount || null,
      descriptorCount: initMetrics?.descriptorCount || null
    },
    captures: runs.map((run) => ({
      sha256: run.hash,
      fileName: run.fileName,
      segmentation: {
        horizontalRealignment: Boolean(run.alignment?.used),
        left: run.alignment?.used ? run.alignment.left : 0,
        right: run.alignment?.used ? run.alignment.right : run.width,
        sourceWidth: run.width
      },
      slots: run.rows.filter((row) => row.truthId).map((row) => ({
        slot: row.slot,
        characterId: row.truthId,
        barred: row.barred,
        rank: rankFor(row) === Infinity ? null : rankFor(row)
      }))
    }))
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `war-counter-akaze-truth-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

runButton?.addEventListener("click", async () => {
  try {
    await runValidation();
  } catch (error) {
    console.error(error);
    statusNode.textContent = error?.message || String(error);
    summaryNode.textContent = "Benchmark multi-captures impossible.";
  } finally {
    runButton.disabled = !(input.files?.length);
  }
});

exportButton?.addEventListener("click", exportTruth);
input?.addEventListener("change", () => {
  runButton.disabled = !(input.files?.length);
  exportButton.disabled = true;
  const count = input.files?.length || 0;
  statusNode.textContent = count ? `${count} capture(s) sélectionnée(s).` : "Sélectionne plusieurs captures de guerre.";
});

loadCatalog().catch((error) => {
  statusNode.textContent = error?.message || "Catalogue indisponible.";
});
