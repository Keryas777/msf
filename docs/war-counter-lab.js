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
  calculateTopMetrics,
  STRATEGIES
} from "./war-counter-lab-core.js";

const WORKER_ENDPOINT = "https://msf-war-counter-vision.deliriousfan7.workers.dev/api/war-counter-vision/analyze";
const $ = (selector) => document.querySelector(selector);
const input = $("#captureInput");
const status = $("#uploadStatus");
const panel = $("#previewPanel");
const preview = $("#previewCanvas");
const meta = $("#imageMeta");
const slotsRoot = $("#slots");
const dialog = $("#characterDialog");
const search = $("#characterSearch");
const results = $("#characterResults");
const strategy = $("#strategy");
const metric = $("#metricSummary");
const groqCalls = $("#groqCalls");

let catalog = [];
let catalogById = new Map();
let groundTruth = [];
let draft = createDraft();
let activeSlot = null;
let currentCaptureId = null;

async function loadData() {
  const [charactersResponse, truthResponse] = await Promise.all([
    fetch("data/msf-characters.json", { cache: "no-store" }),
    fetch("data/war-counter-vision/benchmark-ground-truth.json", { cache: "no-store" })
  ]);

  if (!charactersResponse.ok || !truthResponse.ok) {
    throw new Error("Données du laboratoire indisponibles.");
  }

  catalog = (await charactersResponse.json()).filter((item) => item.id && item.nameKey);
  catalogById = normalizeCatalog(catalog).byId;
  groundTruth = (await truthResponse.json()).captures || [];
}

async function requestMockAnalysis(file, selectedStrategy, layoutId) {
  const form = new FormData();
  form.set("image", file, file.name);
  form.set("strategy", selectedStrategy);
  form.set("layout", layoutId);

  const response = await fetch(WORKER_ENDPOINT, {
    method: "POST",
    body: form,
    cache: "no-store"
  });

  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.ok || !body?.result) {
    throw new Error(body?.error || `Worker indisponible (${response.status}).`);
  }

  return body.result;
}

function applyWorkerResult(result) {
  if (!result || !Array.isArray(result.slots) || result.slots.length !== draft.slots.length) {
    throw new Error("Réponse mock du Worker invalide.");
  }

  draft.provider = result.provider || "mock";
  draft.groqRealCalls = Number.isInteger(result.groqRealCalls) ? result.groqRealCalls : 0;
  groqCalls.textContent = String(draft.groqRealCalls);

  result.slots.forEach((workerSlot, index) => {
    const target = draft.slots[index];
    if (workerSlot.slot !== target.slot || !Array.isArray(workerSlot.candidates)) {
      throw new Error("Ordre des slots invalide dans la réponse du Worker.");
    }

    target.candidates = workerSlot.candidates
      .filter((candidate) => catalogById.has(candidate.characterId))
      .slice(0, 5)
      .map((candidate) => ({
        characterId: candidate.characterId,
        confidence: candidate.confidence ?? null,
        source: "worker-mock"
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

  if (kind === "grayscale") {
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < imageData.data.length; index += 4) {
      const gray = Math.round(
        0.299 * imageData.data[index] +
        0.587 * imageData.data[index + 1] +
        0.114 * imageData.data[index + 2]
      );
      imageData.data[index] = gray;
      imageData.data[index + 1] = gray;
      imageData.data[index + 2] = gray;
    }
    context.putImageData(imageData, 0, 0);
  }

  if (kind === "redMask") {
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < imageData.data.length; index += 4) {
      const red = imageData.data[index];
      const green = imageData.data[index + 1];
      const blue = imageData.data[index + 2];
      if (red > 145 && red > green * 1.35 && red > blue * 1.25) {
        imageData.data[index + 3] = 0;
      }
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
  return character ? `${character.nameKey} — ${character.id}` : "Aucun personnage sélectionné";
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
      if (kind === "wide") {
        draft.slots[index].barred = detectRedCross(
          canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height)
        );
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

    card.append(
      head,
      crops,
      document.createTextNode(`Croix locale : ${draft.slots[index].barred ? "oui" : "non"}`),
      selected,
      choose,
      validate
    );
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
  const matches = catalog
    .filter((item) => `${item.nameKey} ${item.id}`.toLocaleLowerCase("fr").includes(normalized))
    .slice(0, 60);

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

strategy.replaceChildren(...STRATEGIES.map((value) => {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = value;
  return option;
}));

strategy.onchange = () => {
  draft = createDraft(strategy.value);
  groqCalls.textContent = "0";
  status.textContent = "Stratégie changée : charge à nouveau la capture pour interroger le Worker mock.";
};
search.oninput = () => renderSearch(search.value);

input.onchange = async () => {
  let bitmap = null;
  try {
    const file = input.files?.[0];
    validateUpload(file);
    status.textContent = "Chargement de la capture…";

    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const layout = detectLayout(bitmap.width, bitmap.height);

    preview.width = bitmap.width;
    preview.height = bitmap.height;
    const context = preview.getContext("2d");
    context.drawImage(bitmap, 0, 0);
    context.lineWidth = Math.max(2, bitmap.width / 800);
    context.font = `${Math.max(16, bitmap.width / 90)}px system-ui`;
    for (const slot of getLayoutSlots()) {
      const rect = calculatePixelRect(slot, bitmap.width, bitmap.height);
      context.strokeStyle = "#35d7ff";
      context.fillStyle = "#35d7ff";
      context.strokeRect(rect.x, rect.y, rect.width, rect.height);
      context.fillText(slot.label, rect.x + 4, rect.y + 22);
    }

    draft = createDraft(strategy.value);
    currentCaptureId = bitmap.width === 2310 && bitmap.height === 583
      ? "capture-1"
      : bitmap.width === 2410 && bitmap.height === 600
        ? "capture-2"
        : null;

    status.textContent = "Envoi au Worker Cloudflare en mode mock…";
    const workerResult = await requestMockAnalysis(file, strategy.value, layout.layoutId);
    applyWorkerResult(workerResult);
    renderCards(bitmap);

    panel.hidden = false;
    meta.textContent = `${bitmap.width} × ${bitmap.height} · ratio ${layout.ratio.toFixed(4)} · ${layout.layoutId} · ${ACCEPTED_IMAGE_TYPES.join(", ")} · ${MAX_IMAGE_BYTES / 1024 / 1024} Mo max`;
    status.textContent = `Worker joint avec succès · fournisseur ${workerResult.provider} · appels Groq réels ${draft.groqRealCalls}.`;
  } catch (error) {
    status.textContent = error?.message || "Erreur inconnue.";
    panel.hidden = true;
    slotsRoot.replaceChildren();
    groqCalls.textContent = "0";
  } finally {
    bitmap?.close();
  }
};

loadData().catch((error) => {
  status.textContent = error.message;
});
