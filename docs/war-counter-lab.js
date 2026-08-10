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
import {
  signatureFromImageData,
  rankPortraitSignatures,
  prefilterMetrics
} from "./war-counter-prefilter.js";

const WORKER_ENDPOINT = "https://msf-war-counter-vision.deliriousfan7.workers.dev/api/war-counter-vision/analyze";
const GROQ_JPEG_QUALITY = 0.82;
const CONTACT_COLUMNS = 5;
const CONTACT_ROWS = 2;
const CONTACT_CELL_WIDTH = 220;
const CONTACT_CELL_HEIGHT = 220;
const CONTACT_LABEL_HEIGHT = 34;
const LOCAL_TOP_N = 20;
const $ = (selector) => document.querySelector(selector);
const input = $("#captureInput");
const runLocalButton = $("#runLocal");
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
const localMetric = $("#localMetricSummary");
const groqCalls = $("#groqCalls");

let catalog = [];
let catalogById = new Map();
let groundTruth = [];
let portraitSignatures = [];
let draft = createDraft("grouped_wide_crops");
let activeSlot = null;
let currentCaptureId = null;
let selectedFile = null;
let selectedLayout = null;
let previewBitmap = null;
let requestInFlight = false;
let localInFlight = false;
let callUsedForCurrentFile = false;

async function loadData() {
  const [charactersResponse, truthResponse, signaturesResponse] = await Promise.all([
    fetch("data/msf-characters.json", { cache: "no-store" }),
    fetch("data/war-counter-vision/benchmark-ground-truth.json", { cache: "no-store" }),
    fetch("data/war-counter-vision/portrait-signatures.json", { cache: "no-store" })
  ]);
  if (!charactersResponse.ok || !truthResponse.ok) throw new Error("Données du laboratoire indisponibles.");
  if (!signaturesResponse.ok) throw new Error("Signatures locales absentes. Le workflow de génération doit terminer.");
  catalog = filterWarPlayableCatalog(await charactersResponse.json());
  catalogById = normalizeCatalog(catalog).byId;
  groundTruth = (await truthResponse.json()).captures || [];
  const signaturePayload = await signaturesResponse.json();
  portraitSignatures = Array.isArray(signaturePayload.items) ? signaturePayload.items : [];
  if (!portraitSignatures.length) throw new Error("Aucune signature locale exploitable.");
  status.textContent = `${portraitSignatures.length} signatures locales chargées. Choisis une capture.`;
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

function drawVariant(image, rect, kind) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, rect.width);
  canvas.height = Math.max(1, rect.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
  if (kind === "grayscale" || kind === "redMask") {
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < imageData.data.length; index += 4) {
      const red = imageData.data[index];
      const green = imageData.data[index + 1];
      const blue = imageData.data[index + 2];
      if (kind === "grayscale") {
        const gray = Math.round(0.299 * red + 0.587 * green + 0.114 * blue);
        imageData.data[index] = imageData.data[index + 1] = imageData.data[index + 2] = gray;
      } else if (red > 145 && red > green * 1.35 && red > blue * 1.25) {
        imageData.data[index] = imageData.data[index + 1] = imageData.data[index + 2] = 9;
      }
    }
    context.putImageData(imageData, 0, 0);
  }
  return canvas;
}

function truthForCurrentCapture() {
  return groundTruth.find((item) => item.captureId === currentCaptureId)?.slots || [];
}

function updateMetrics() {
  const truth = truthForCurrentCapture();
  if (!truth.length) {
    metric.textContent = "Groq Top 1/3/5 : aucune vérité terrain associée";
    return;
  }
  const metrics = calculateTopMetrics(draft.slots, truth);
  metric.textContent = `Groq Top 1 ${metrics.top1}/${metrics.evaluated} · Top 3 ${metrics.top3}/${metrics.evaluated} · Top 5 ${metrics.top5}/${metrics.evaluated}`;
}

function updateLocalMetrics() {
  const truth = truthForCurrentCapture();
  if (!truth.length) {
    localMetric.textContent = "Préfiltre local : aucune vérité terrain associée";
    return;
  }
  const metrics = prefilterMetrics(draft.slots, truth, LOCAL_TOP_N);
  localMetric.textContent = `Préfiltre local Top ${LOCAL_TOP_N} : ${metrics.hits}/${metrics.evaluated}`;
}

function selectedLabel(slot) {
  const character = catalogById.get(slot.selectedCharacterId);
  if (!character) return "Aucun personnage résolu";
  const confidence = slot.candidates[0]?.confidence;
  return `${character.nameKey} — ${character.id}${Number.isFinite(confidence) ? ` · ${Math.round(confidence * 100)} %` : ""}`;
}

function localCandidateList(slot) {
  if (!Array.isArray(slot.localCandidates) || !slot.localCandidates.length) return null;
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = `Top ${slot.localCandidates.length} local`;
  const list = document.createElement("ol");
  for (const candidate of slot.localCandidates) {
    const item = document.createElement("li");
    const character = catalogById.get(candidate.id);
    item.textContent = `${character?.nameKey || candidate.name || candidate.id} — ${candidate.id} · distance ${candidate.score.toFixed(4)}`;
    list.append(item);
  }
  details.append(summary, list);
  return details;
}

function renderCards(image) {
  slotsRoot.replaceChildren();
  getLayoutSlots().forEach((slot, index) => {
    const draftSlot = draft.slots[index];
    const card = document.createElement("article");
    card.className = "slot-card";
    card.dataset.status = draftSlot.validationStatus;
    const head = document.createElement("div");
    head.className = "slot-head";
    head.innerHTML = `<strong>${slot.label}</strong><span>${slot.slot}</span>`;
    const crops = document.createElement("div");
    crops.className = "crops";
    for (const [kind, variant] of Object.entries(getCropVariants(slot))) {
      const cropCanvas = drawVariant(image, calculatePixelRect(variant, image.width, image.height), kind);
      cropCanvas.title = kind;
      crops.append(cropCanvas);
      if (kind === "wide" && draftSlot.barred === null) {
        draftSlot.barred = detectRedCross(cropCanvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, cropCanvas.width, cropCanvas.height));
      }
    }
    const selected = document.createElement("div");
    selected.className = "selected";
    selected.textContent = selectedLabel(draftSlot);
    const choose = document.createElement("button");
    choose.type = "button";
    choose.textContent = "Corriger";
    choose.onclick = () => openChooser(index, selected, card);
    const validate = document.createElement("button");
    validate.type = "button";
    validate.textContent = "Valider";
    validate.onclick = () => {
      if (draftSlot.selectedCharacterId) {
        draftSlot.validationStatus = "validated";
        card.dataset.status = "validated";
        updateMetrics();
      }
    };
    card.append(head, crops, document.createTextNode(`Croix : ${draftSlot.barred ? "oui" : "non"}`), selected);
    const localList = localCandidateList(draftSlot);
    if (localList) card.append(localList);
    card.append(choose, validate);
    slotsRoot.append(card);
  });
  updateMetrics();
  updateLocalMetrics();
}

async function runLocalPrefilter(image) {
  const slots = getLayoutSlots();
  for (let index = 0; index < slots.length; index += 1) {
    const variants = [];
    for (const [kind, variant] of Object.entries(getCropVariants(slots[index]))) {
      const cropCanvas = drawVariant(image, calculatePixelRect(variant, image.width, image.height), kind);
      const context = cropCanvas.getContext("2d", { willReadFrequently: true });
      variants.push(signatureFromImageData(context.getImageData(0, 0, cropCanvas.width, cropCanvas.height)));
    }
    const ranked = rankPortraitSignatures(variants, portraitSignatures, LOCAL_TOP_N);
    const target = draft.slots[index];
    target.localCandidates = ranked;
    target.candidates = ranked.slice(0, 5).map((candidate) => ({
      characterId: candidate.id,
      confidence: Math.max(0, Math.min(1, 1 - candidate.score)),
      source: "local"
    }));
    target.selectedCharacterId = target.candidates[0]?.characterId || null;
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

async function buildGroqContactSheet(image) {
  const canvas = document.createElement("canvas");
  canvas.width = CONTACT_COLUMNS * CONTACT_CELL_WIDTH;
  canvas.height = CONTACT_ROWS * CONTACT_CELL_HEIGHT;
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#091326";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.font = "700 24px system-ui";
  context.textAlign = "center";
  context.textBaseline = "middle";
  getLayoutSlots().forEach((slot, index) => {
    const column = index % CONTACT_COLUMNS;
    const row = Math.floor(index / CONTACT_COLUMNS);
    const cellX = column * CONTACT_CELL_WIDTH;
    const cellY = row * CONTACT_CELL_HEIGHT;
    const rect = calculatePixelRect(getCropVariants(slot).wide, image.width, image.height);
    context.fillStyle = "#ffffff";
    context.fillText(slot.slot, cellX + CONTACT_CELL_WIDTH / 2, cellY + CONTACT_LABEL_HEIGHT / 2);
    context.drawImage(image, rect.x, rect.y, rect.width, rect.height, cellX + 8, cellY + CONTACT_LABEL_HEIGHT + 4, CONTACT_CELL_WIDTH - 16, CONTACT_CELL_HEIGHT - CONTACT_LABEL_HEIGHT - 12);
  });
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Création de la planche de portraits impossible.")), "image/jpeg", GROQ_JPEG_QUALITY);
  });
  return new File([blob], "war-counter-contact-sheet.jpg", { type: "image/jpeg", lastModified: Date.now() });
}

async function requestRealAnalysis(image, layoutId) {
  const groqFile = await buildGroqContactSheet(image);
  const form = new FormData();
  form.set("image", groqFile, groqFile.name);
  form.set("strategy", "grouped_wide_crops");
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
    target.candidates = workerSlot.candidates.filter((candidate) => catalogById.has(candidate.characterId)).slice(0, 3).map((candidate) => ({ characterId: candidate.characterId, confidence: candidate.confidence ?? null, source: "groq" }));
    target.selectedCharacterId = target.candidates[0]?.characterId || null;
    target.barred = typeof workerSlot.barred === "boolean" ? workerSlot.barred : null;
  });
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
    draft = createDraft("grouped_wide_crops");
    groqCalls.textContent = "0";
    localMetric.textContent = "Préfiltre local : non évalué";
    metric.textContent = "Groq Top 1/3/5 : non évalué";
    slotsRoot.replaceChildren();
    currentCaptureId = previewBitmap.width === 2310 && previewBitmap.height === 583 ? "capture-1" : previewBitmap.width === 2410 && previewBitmap.height === 600 ? "capture-2" : null;
    drawPreview(previewBitmap);
    panel.hidden = false;
    meta.textContent = `${previewBitmap.width} × ${previewBitmap.height} · ratio ${selectedLayout.ratio.toFixed(4)} · ${selectedLayout.layoutId} · ${portraitSignatures.length} références locales`;
    runLocalButton.disabled = false;
    runButton.disabled = false;
    status.textContent = "Capture prête. Lance d’abord le préfiltre local : aucun appel Groq.";
  } catch (error) {
    selectedFile = null;
    runLocalButton.disabled = true;
    runButton.disabled = true;
    panel.hidden = true;
    status.textContent = error?.message || "Erreur inconnue.";
  }
};

runLocalButton.onclick = async () => {
  if (!previewBitmap || localInFlight) return;
  localInFlight = true;
  runLocalButton.disabled = true;
  status.textContent = `Comparaison locale des 10 slots avec ${portraitSignatures.length} portraits…`;
  const startedAt = performance.now();
  try {
    await runLocalPrefilter(previewBitmap);
    renderCards(previewBitmap);
    status.textContent = `Préfiltre local terminé en ${Math.round(performance.now() - startedAt)} ms. Aucun appel Groq.`;
  } catch (error) {
    status.textContent = error?.message || "Échec du préfiltre local.";
  } finally {
    localInFlight = false;
    runLocalButton.disabled = false;
  }
};

runButton.onclick = async () => {
  if (!selectedFile || !selectedLayout || !previewBitmap || requestInFlight || callUsedForCurrentFile) return;
  const confirmed = window.confirm("Déclencher un unique appel Groq sur la planche des 10 portraits recadrés ?");
  if (!confirmed) return;
  requestInFlight = true;
  callUsedForCurrentFile = true;
  runButton.disabled = true;
  status.textContent = "Création de la planche puis appel Groq Vision en cours…";
  try {
    const result = await requestRealAnalysis(previewBitmap, selectedLayout.layoutId);
    applyWorkerResult(result);
    renderCards(previewBitmap);
    status.textContent = `Analyse Groq terminée · modèle ${result.model} · ${result.durationMs ?? "?"} ms · appels réels ${draft.groqRealCalls}.`;
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
