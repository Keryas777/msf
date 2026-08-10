import {
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  createDraft,
  getCropVariants,
  getLayoutSlots,
  calculatePixelRect,
  detectLayout,
  detectRedCross,
  validateUpload,
  normalizeCatalog,
  filterWarPlayableCatalog,
  calculateTopMetrics
} from "./war-counter-lab-core.js";

const WORKER_ENDPOINT = "https://msf-war-counter-vision.deliriousfan7.workers.dev/api/war-counter-vision/analyze";
const GROQ_MAX_WIDTH = 1280;
const GROQ_JPEG_QUALITY = 0.74;
const $ = (selector) => document.querySelector(selector);
const input = $("#captureInput");
const runButton = $("#runGroq");
const status = $("#uploadStatus");
const panel = $("#previewPanel");
const preview = $("#previewCanvas");
const meta = $("#imageMeta");
const slotsRoot = $("#slots");
const dialog = $("#characterDialog");
const search = $("#characterSearch");
const results = $("#characterResults");
const metric = $("#metricSummary");
const groqCalls = $("#groqCalls");

let catalog = [];
let catalogById = new Map();
let groundTruth = [];
let draft = createDraft("full_capture");
let activeSlot = null;
let currentCaptureId = null;
let selectedFile = null;
let selectedLayout = null;
let previewBitmap = null;
let requestInFlight = false;
let callUsedForCurrentFile = false;

async function loadData() {
  const [charactersResponse, truthResponse] = await Promise.all([
    fetch("data/msf-characters.json", { cache: "no-store" }),
    fetch("data/war-counter-vision/benchmark-ground-truth.json", { cache: "no-store" })
  ]);
  if (!charactersResponse.ok || !truthResponse.ok) throw new Error("Données du laboratoire indisponibles.");
  catalog = filterWarPlayableCatalog(await charactersResponse.json());
  catalogById = normalizeCatalog(catalog).byId;
  groundTruth = (await truthResponse.json()).captures || [];
}

function workerCatalog() {
  return catalog.map((item) => ({
    id: item.id,
    nameKey: item.nameKey,
    nameFr: item.nameFr || null,
    nameEn: item.nameEn || null,
    aliases: [item.id, item.nameKey, item.nameFr, item.nameEn].filter(Boolean)
  }));
}

async function buildGroqReadyFile(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, GROQ_MAX_WIDTH / bitmap.width);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Compression de l’image impossible.")), "image/jpeg", GROQ_JPEG_QUALITY);
    });
    return new File([blob], "war-counter-groq.jpg", { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}

async function requestRealAnalysis(file, layoutId) {
  const groqFile = await buildGroqReadyFile(file);
  const form = new FormData();
  form.set("image", groqFile, groqFile.name);
  form.set("strategy", "full_capture");
  form.set("layout", layoutId);
  form.set("confirmed", "one-real-call");
  form.set("catalog", JSON.stringify(workerCatalog()));
  const response = await fetch(WORKER_ENDPOINT, { method: "POST", body: form, cache: "no-store" });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.ok || !body?.result) throw new Error(body?.error || `Worker indisponible (${response.status}).`);
  return body.result;
}

function applyWorkerResult(result) {
  if (!result || !Array.isArray(result.slots) || result.slots.length !== draft.slots.length) throw new Error("Réponse Groq invalide.");
  draft.provider = result.provider || "groq";
  draft.groqRealCalls = Number.isInteger(result.groqRealCalls) ? result.groqRealCalls : 0;
  groqCalls.textContent = String(draft.groqRealCalls);
  result.slots.forEach((workerSlot, index) => {
    const target = draft.slots[index];
    if (workerSlot.slot !== target.slot || !Array.isArray(workerSlot.candidates)) throw new Error("Ordre des slots invalide dans la réponse.");
    target.candidates = workerSlot.candidates.filter((candidate) => catalogById.has(candidate.characterId)).slice(0, 3).map((candidate) => ({
      characterId: candidate.characterId,
      confidence: candidate.confidence ?? null,
      source: "groq"
    }));
    target.selectedCharacterId = target.candidates[0]?.characterId || null;
    target.barred = typeof workerSlot.barred === "boolean" ? workerSlot.barred : null;
  });
}

function drawVariant(image, rect, kind) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, rect.width);
  canvas.height = Math.max(1, rect.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
  if (kind === "grayscale" || kind === "redMask") {
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < imageData.data.length; index += 4) {
      const red = imageData.data[index], green = imageData.data[index + 1], blue = imageData.data[index + 2];
      if (kind === "grayscale") {
        const gray = Math.round(0.299 * red + 0.587 * green + 0.114 * blue);
        imageData.data[index] = imageData.data[index + 1] = imageData.data[index + 2] = gray;
      } else if (red > 145 && red > green * 1.35 && red > blue * 1.25) imageData.data[index + 3] = 0;
    }
    context.putImageData(imageData, 0, 0);
  }
  return canvas;
}

function updateMetrics() {
  const truth = groundTruth.find((item) => item.captureId === currentCaptureId)?.slots || [];
  if (!truth.length) {
    metric.textContent = "Top 1/3/5 : aucune vérité terrain associée";
    return;
  }
  const metrics = calculateTopMetrics(draft.slots, truth);
  metric.textContent = `Top 1 ${metrics.top1}/${metrics.evaluated} · Top 3 ${metrics.top3}/${metrics.evaluated} · Top 5 ${metrics.top5}/${metrics.evaluated}`;
}

function selectedLabel(slot) {
  const character = catalogById.get(slot.selectedCharacterId);
  if (!character) return "Aucun personnage résolu";
  const confidence = slot.candidates[0]?.confidence;
  return `${character.nameKey} — ${character.id}${Number.isFinite(confidence) ? ` · ${Math.round(confidence * 100)} %` : ""}`;
}

function renderCards(image) {
  slotsRoot.replaceChildren();
  getLayoutSlots().forEach((slot, index) => {
    const card = document.createElement("article");
    card.className = "slot-card";
    card.dataset.status = draft.slots[index].validationStatus;
    const head = document.createElement("div");
    head.className = "slot-head";
    head.innerHTML = `<strong>${slot.label}</strong><span>${slot.slot}</span>`;
    const crops = document.createElement("div");
    crops.className = "crops";
    for (const [kind, variant] of Object.entries(getCropVariants(slot))) {
      const canvas = drawVariant(image, calculatePixelRect(variant, image.width, image.height), kind);
      canvas.title = kind;
      crops.append(canvas);
      if (kind === "wide" && draft.slots[index].barred === null) {
        draft.slots[index].barred = detectRedCross(canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height));
      }
    }
    const selected = document.createElement("div");
    selected.className = "selected";
    selected.textContent = selectedLabel(draft.slots[index]);
    const choose = document.createElement("button");
    choose.type = "button";
    choose.textContent = "Corriger";
    choose.onclick = () => openChooser(index, selected, card);
    const validate = document.createElement("button");
    validate.type = "button";
    validate.textContent = "Valider";
    validate.onclick = () => {
      if (draft.slots[index].selectedCharacterId) {
        draft.slots[index].validationStatus = "validated";
        card.dataset.status = "validated";
        updateMetrics();
      }
    };
    card.append(head, crops, document.createTextNode(`Croix : ${draft.slots[index].barred ? "oui" : "non"}`), selected, choose, validate);
    slotsRoot.append(card);
  });
  updateMetrics();
}

function openChooser(index, node, card) {
  activeSlot = { index, node, card };
  search.value = "";
  renderSearch("");
  dialog.showModal();
}

function renderSearch(query) {
  const normalized = query.trim().toLocaleLowerCase("fr");
  const matches = catalog.filter((item) => `${item.nameKey} ${item.id}`.toLocaleLowerCase("fr").includes(normalized)).slice(0, 60);
  results.replaceChildren(...matches.map((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "character-choice";
    button.innerHTML = `${item.portraitUrl ? `<img src="${item.portraitUrl}" alt="">` : ""}<span>${item.nameKey}<small>${item.id}</small></span>`;
    button.onclick = () => {
      const slot = draft.slots[activeSlot.index];
      slot.selectedCharacterId = item.id;
      slot.candidates = [{ characterId: item.id, confidence: 1, source: "human" }];
      slot.validationStatus = "corrected";
      activeSlot.card.dataset.status = "corrected";
      activeSlot.node.textContent = `${item.nameKey} — ${item.id}`;
      dialog.close();
      updateMetrics();
    };
    return button;
  }));
}

function drawPreview(bitmap) {
  preview.width = bitmap.width;
  preview.height = bitmap.height;
  const context = preview.getContext("2d");
  context.drawImage(bitmap, 0, 0);
  context.lineWidth = Math.max(2, bitmap.width / 800);
  context.font = `${Math.max(16, bitmap.width / 90)}px system-ui`;
  for (const slot of getLayoutSlots()) {
    const rect = calculatePixelRect(slot, bitmap.width, bitmap.height);
    context.strokeStyle = context.fillStyle = "#35d7ff";
    context.strokeRect(rect.x, rect.y, rect.width, rect.height);
    context.fillText(slot.label, rect.x + 4, rect.y + 22);
  }
}

input.onchange = async () => {
  try {
    const file = input.files?.[0];
    validateUpload(file);
    previewBitmap?.close();
    previewBitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    selectedLayout = detectLayout(previewBitmap.width, previewBitmap.height);
    selectedFile = file;
    callUsedForCurrentFile = false;
    draft = createDraft("full_capture");
    groqCalls.textContent = "0";
    slotsRoot.replaceChildren();
    currentCaptureId = previewBitmap.width === 2310 && previewBitmap.height === 583 ? "capture-1" : previewBitmap.width === 2410 && previewBitmap.height === 600 ? "capture-2" : null;
    drawPreview(previewBitmap);
    panel.hidden = false;
    meta.textContent = `${previewBitmap.width} × ${previewBitmap.height} · ratio ${selectedLayout.ratio.toFixed(4)} · ${selectedLayout.layoutId} · ${ACCEPTED_IMAGE_TYPES.join(", ")} · ${MAX_IMAGE_BYTES / 1024 / 1024} Mo max`;
    runButton.disabled = false;
    status.textContent = "Capture prête. Aucun appel n’a encore été effectué.";
  } catch (error) {
    selectedFile = null;
    runButton.disabled = true;
    panel.hidden = true;
    status.textContent = error?.message || "Erreur inconnue.";
  }
};

runButton.onclick = async () => {
  if (!selectedFile || !selectedLayout || requestInFlight || callUsedForCurrentFile) return;
  const confirmed = window.confirm("Déclencher maintenant un unique appel Groq Vision sur cette capture ?");
  if (!confirmed) return;
  requestInFlight = true;
  callUsedForCurrentFile = true;
  runButton.disabled = true;
  status.textContent = "Compression puis appel Groq Vision en cours…";
  try {
    const result = await requestRealAnalysis(selectedFile, selectedLayout.layoutId);
    applyWorkerResult(result);
    renderCards(previewBitmap);
    status.textContent = `Analyse terminée · modèle ${result.model} · ${result.durationMs ?? "?"} ms · appels Groq réels ${draft.groqRealCalls}.`;
  } catch (error) {
    callUsedForCurrentFile = false;
    runButton.disabled = false;
    status.textContent = error?.message || "Échec de l’appel Groq.";
  } finally {
    requestInFlight = false;
  }
};

search.oninput = () => renderSearch(search.value);
loadData().catch((error) => { status.textContent = error.message; });
