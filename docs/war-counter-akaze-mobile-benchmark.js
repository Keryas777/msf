import {
  calculatePixelRect,
  filterWarPlayableCatalog,
  getCropVariants,
  getLayoutSlots,
  normalizeCatalog
} from "./war-counter-lab-core.js";

const OPENCV_URL = "https://docs.opencv.org/4.10.0/opencv.js";
const META_URL = "data/war-counter-vision/akaze-r5-reference-descriptors.json";
const TOP_N = 10;
const $ = (selector) => document.querySelector(selector);
const runButton = $("#runAkazeMobile");
const statusNode = $("#akazeMobileStatus");
const summaryNode = $("#akazeMobileSummary");
const resultsNode = $("#akazeMobileResults");
const input = $("#captureInput");

let cvPromise = null;
let referencePromise = null;
let catalogById = new Map();

function ms(value) {
  return `${value.toFixed(1)} ms`;
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

async function loadCatalog() {
  const response = await fetch("data/msf-characters.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Catalogue personnages indisponible.");
  const catalog = filterWarPlayableCatalog(await response.json());
  catalogById = normalizeCatalog(catalog).byId;
}

function loadOpenCvScript() {
  return new Promise((resolve, reject) => {
    if (window.cv) {
      resolve();
      return;
    }
    const existing = document.querySelector(`script[src="${OPENCV_URL}"]`);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", () => reject(new Error("Chargement OpenCV.js impossible.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = OPENCV_URL;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Chargement OpenCV.js impossible."));
    document.head.append(script);
  });
}

async function resolveCv() {
  if (!cvPromise) {
    cvPromise = (async () => {
      const started = performance.now();
      await loadOpenCvScript();
      let candidate = window.cv;
      if (candidate && typeof candidate.then === "function") candidate = await candidate;
      const deadline = performance.now() + 20000;
      while ((!candidate || !candidate.Mat || !candidate.AKAZE || !candidate.BFMatcher) && performance.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        candidate = window.cv;
        if (candidate && typeof candidate.then === "function") candidate = await candidate;
      }
      if (!candidate?.Mat || !candidate?.AKAZE || !candidate?.BFMatcher) {
        throw new Error("Cette build OpenCV.js n’expose pas AKAZE/BFMatcher.");
      }
      return { cv: candidate, loadMs: performance.now() - started };
    })();
  }
  return cvPromise;
}

function ownerMapFromOffsets(offsets, descriptorCount) {
  const owners = new Int32Array(descriptorCount);
  for (let refIndex = 0; refIndex < offsets.length - 1; refIndex += 1) {
    owners.fill(refIndex, offsets[refIndex], offsets[refIndex + 1]);
  }
  return owners;
}

async function loadReferences(cv) {
  if (!referencePromise) {
    referencePromise = (async () => {
      const started = performance.now();
      const metaResponse = await fetch(META_URL, { cache: "no-store" });
      if (!metaResponse.ok) throw new Error("Index AKAZE navigateur absent. Attends la fin du workflow GitHub Actions.");
      const meta = await metaResponse.json();
      const binaryResponse = await fetch(`data/war-counter-vision/${meta.binaryFile}`, { cache: "no-store" });
      if (!binaryResponse.ok) throw new Error("Descripteurs AKAZE navigateur absents.");
      const buffer = await binaryResponse.arrayBuffer();
      if (buffer.byteLength !== meta.binaryBytes) throw new Error("Taille du fichier AKAZE invalide.");
      const bytes = new Uint8Array(buffer);
      const expected = meta.descriptorCount * meta.descriptorCols;
      if (bytes.byteLength !== expected) throw new Error("Dimensions des descripteurs AKAZE invalides.");

      const mat = new cv.Mat(meta.descriptorCount, meta.descriptorCols, cv.CV_8UC1);
      mat.data.set(bytes);
      return {
        meta,
        mat,
        owners: ownerMapFromOffsets(meta.offsets, meta.descriptorCount),
        loadMs: performance.now() - started
      };
    })();
  }
  return referencePromise;
}

function cropBase(image, slot) {
  const variant = getCropVariants(slot).wide;
  const rect = calculatePixelRect(variant, image.width, image.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, rect.width);
  canvas.height = Math.max(1, rect.height);
  canvas.getContext("2d").drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function describeCanvas(cv, detector, canvas, resizeMax) {
  const source = cv.imread(canvas);
  const gray = new cv.Mat();
  const resized = new cv.Mat();
  const keypoints = new cv.KeyPointVector();
  const descriptors = new cv.Mat();
  const mask = new cv.Mat();
  try {
    cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY);
    const scale = resizeMax / Math.max(gray.cols, gray.rows);
    const width = Math.max(32, Math.round(gray.cols * scale));
    const height = Math.max(32, Math.round(gray.rows * scale));
    cv.resize(gray, resized, new cv.Size(width, height), 0, 0, cv.INTER_CUBIC);
    detector.detectAndCompute(resized, mask, keypoints, descriptors);
    return descriptors.clone();
  } finally {
    source.delete();
    gray.delete();
    resized.delete();
    keypoints.delete();
    descriptors.delete();
    mask.delete();
  }
}

function globalVoteTop10(cv, matcher, queryDescriptors, refs) {
  if (!queryDescriptors.rows) return [];
  const matches = new cv.DMatchVectorVector();
  try {
    matcher.knnMatch(queryDescriptors, refs.mat, matches, 4);
    const votes = new Float64Array(refs.meta.referenceCount);
    const hits = new Uint16Array(refs.meta.referenceCount);
    const seen = new Set();
    for (let index = 0; index < matches.size(); index += 1) {
      const nearest = matches.get(index);
      seen.clear();
      for (let item = 0; item < nearest.size(); item += 1) {
        const match = nearest.get(item);
        const owner = refs.owners[match.trainIdx];
        if (seen.has(owner)) continue;
        seen.add(owner);
        votes[owner] += 1 / (8 + match.distance);
        hits[owner] += 1;
      }
      nearest.delete();
    }
    const rows = refs.meta.refIds.map((id, refIndex) => {
      const count = refs.meta.offsets[refIndex + 1] - refs.meta.offsets[refIndex];
      return { id, score: votes[refIndex] / Math.sqrt(Math.max(1, count)), hits: hits[refIndex] };
    });
    rows.sort((a, b) => b.score - a.score || b.hits - a.hits || a.id.localeCompare(b.id));
    return rows.slice(0, TOP_N);
  } finally {
    matches.delete();
  }
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
  statusNode.textContent = "Chargement paresseux d’OpenCV.js et des descripteurs…";

  const totalStarted = performance.now();
  await loadCatalog();
  const { cv, loadMs: openCvLoadMs } = await resolveCv();
  const refs = await loadReferences(cv);
  statusNode.textContent = `${refs.meta.referenceCount} références / ${refs.meta.descriptorCount} descripteurs chargés.`;

  const detector = cv.AKAZE.create();
  detector.setThreshold(refs.meta.threshold);
  const matcher = cv.BFMatcher.create(cv.NORM_HAMMING, false);
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const rows = [];

  try {
    for (const slot of getLayoutSlots()) {
      const crop = cropBase(bitmap, slot);
      const extractStarted = performance.now();
      const query = describeCanvas(cv, detector, crop, refs.meta.resizeMax);
      const extractMs = performance.now() - extractStarted;
      const matchStarted = performance.now();
      const candidates = globalVoteTop10(cv, matcher, query, refs);
      const matchMs = performance.now() - matchStarted;
      query.delete();
      rows.push({ slot: slot.slot, extractMs, matchMs, top1: candidates[0]?.id || null });
      renderResult(slot, candidates, extractMs, matchMs);
      await nextFrame();
    }
  } finally {
    bitmap.close();
    detector.delete();
    matcher.delete();
  }

  const totalMs = performance.now() - totalStarted;
  const computeMs = rows.reduce((sum, row) => sum + row.extractMs + row.matchMs, 0);
  const memory = performance.memory?.usedJSHeapSize;
  summaryNode.textContent = `10 slots : ${ms(totalMs)} au total · calcul ${ms(computeMs)} · OpenCV ${ms(openCvLoadMs)} · références ${ms(refs.loadMs)}${Number.isFinite(memory) ? ` · heap ${(memory / 1048576).toFixed(1)} Mo` : " · mémoire non exposée par ce navigateur"}`;
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
