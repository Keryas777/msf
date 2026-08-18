import {
  calculatePixelRect,
  filterWarPlayableCatalog,
  getCropVariants,
  getLayoutSlots,
  normalizeCatalog
} from "./war-counter-lab-core.js";

const WORKER_URL = "war-counter-akaze-worker.js?v=r5-akaze-worker-1";
const $ = (selector) => document.querySelector(selector);
const runButton = $("#runAkazeMobile");
const statusNode = $("#akazeMobileStatus");
const summaryNode = $("#akazeMobileSummary");
const resultsNode = $("#akazeMobileResults");
const input = $("#captureInput");

let catalogById = new Map();
let worker = null;
let requestId = 0;
const pending = new Map();

function ms(value) {
  return `${value.toFixed(1)} ms`;
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

async function loadCatalog() {
  if (catalogById.size) return;
  const response = await fetch("data/msf-characters.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Catalogue personnages indisponible.");
  const catalog = filterWarPlayableCatalog(await response.json());
  catalogById = normalizeCatalog(catalog).byId;
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

function renderResult(slot, candidates, extractMs, matchMs) {
  const article = document.createElement("article");
  article.className = "slot-card";
  const winner = candidates[0];
  const character = winner ? catalogById.get(winner.id) : null;
  const top3 = candidates.slice(0, 3).map((candidate, index) => {
    const item = catalogById.get(candidate.id);
    return `${index + 1}. ${item?.nameKey || candidate.id}`;
  }).join(" · ");
  article.innerHTML = `
    <div class="slot-head"><strong>${slot.label}</strong><span>${slot.slot}</span></div>
    <div class="selected">${character?.nameKey || winner?.id || "Aucun résultat"}</div>
    <small>${top3 || "Aucun candidat"}</small>
    <small>AKAZE ${ms(extractMs)} · matching ${ms(matchMs)}</small>
  `;
  resultsNode.append(article);
}

async function runBenchmark() {
  const file = input.files?.[0];
  if (!file) throw new Error("Choisis d’abord une capture.");

  runButton.disabled = true;
  resultsNode.replaceChildren();
  summaryNode.textContent = "Benchmark en cours…";
  statusNode.textContent = "Initialisation d’OpenCV.js dans un thread séparé…";
  await nextFrame();

  const totalStarted = performance.now();
  await loadCatalog();
  const init = await workerCall("init", null, [], 120000);
  statusNode.textContent = `${init.referenceCount} références / ${init.descriptorCount} descripteurs chargés. Analyse des 10 slots…`;
  await nextFrame();

  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const rows = [];

  try {
    const slots = getLayoutSlots();
    for (let index = 0; index < slots.length; index += 1) {
      const slot = slots[index];
      statusNode.textContent = `Analyse AKAZE ${index + 1}/${slots.length} — ${slot.label}…`;
      const crop = cropBase(bitmap, slot);
      const context = crop.getContext("2d", { willReadFrequently: true });
      const imageData = context.getImageData(0, 0, crop.width, crop.height);
      const buffer = imageData.data.buffer;
      const result = await workerCall("analyze", {
        width: crop.width,
        height: crop.height,
        buffer
      }, [buffer], 60000);

      rows.push({
        slot: slot.slot,
        extractMs: result.extractMs,
        matchMs: result.matchMs,
        top1: result.candidates[0]?.id || null
      });
      renderResult(slot, result.candidates, result.extractMs, result.matchMs);
      await nextFrame();
    }
  } finally {
    bitmap.close();
  }

  const totalMs = performance.now() - totalStarted;
  const computeMs = rows.reduce((sum, row) => sum + row.extractMs + row.matchMs, 0);
  summaryNode.textContent = `10 slots : ${ms(totalMs)} au total · calcul worker ${ms(computeMs)} · OpenCV ${ms(init.openCvLoadMs)} · références ${ms(init.referenceLoadMs)} · interface restée séparée du calcul`;
  statusNode.textContent = "Benchmark terminé. Aucun appel Groq.";
}

runButton?.addEventListener("click", async () => {
  try {
    await runBenchmark();
  } catch (error) {
    console.error(error);
    statusNode.textContent = error?.message || String(error);
    summaryNode.textContent = "Benchmark AKAZE impossible.";
  } finally {
    runButton.disabled = !input.files?.[0];
  }
});

input?.addEventListener("change", () => {
  runButton.disabled = !input.files?.[0];
});
