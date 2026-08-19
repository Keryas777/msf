const OPENCV_URL = "vendor/opencv-akaze/4.10.0/opencv.js";
const META_URL = "data/war-counter-vision/akaze-r5-reference-descriptors.json";
const TOP_N = 10;

let cv = null;
let detector = null;
let matcher = null;
let refs = null;

function now() {
  return performance.now();
}

async function resolveCv() {
  const started = now();
  importScripts(OPENCV_URL);

  let candidate = self.cv;
  if (candidate && typeof candidate.then === "function") {
    candidate = await candidate;
  } else if (candidate && !candidate.Mat) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Initialisation OpenCV.js trop longue.")), 60000);
      candidate.onRuntimeInitialized = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }

  const deadline = now() + 60000;
  while ((!candidate || !candidate.Mat || !candidate.AKAZE || !candidate.BFMatcher) && now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    candidate = self.cv;
    if (candidate && typeof candidate.then === "function") candidate = await candidate;
  }

  if (!candidate?.Mat || !candidate?.AKAZE || !candidate?.BFMatcher) {
    throw new Error("Cette build OpenCV.js n’expose pas AKAZE/BFMatcher.");
  }

  return { instance: candidate, loadMs: now() - started };
}

function ownerMapFromOffsets(offsets, descriptorCount) {
  const owners = new Int32Array(descriptorCount);
  for (let refIndex = 0; refIndex < offsets.length - 1; refIndex += 1) {
    owners.fill(refIndex, offsets[refIndex], offsets[refIndex + 1]);
  }
  return owners;
}

async function loadReferences() {
  const started = now();
  const metaResponse = await fetch(META_URL, { cache: "no-store" });
  if (!metaResponse.ok) throw new Error("Index AKAZE navigateur absent.");
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
    loadMs: now() - started
  };
}

function describeRgbaBuffer(buffer, width, height, resizeMax) {
  const source = new cv.Mat(height, width, cv.CV_8UC4);
  source.data.set(new Uint8Array(buffer));
  const gray = new cv.Mat();
  const resized = new cv.Mat();
  const keypoints = new cv.KeyPointVector();
  const descriptors = new cv.Mat();
  const mask = new cv.Mat();

  try {
    cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY);
    const scale = resizeMax / Math.max(gray.cols, gray.rows);
    const targetWidth = Math.max(32, Math.round(gray.cols * scale));
    const targetHeight = Math.max(32, Math.round(gray.rows * scale));
    cv.resize(gray, resized, new cv.Size(targetWidth, targetHeight), 0, 0, cv.INTER_CUBIC);
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

function globalVoteTop10(queryDescriptors) {
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

async function initialize() {
  if (cv && refs && detector && matcher) {
    return {
      openCvLoadMs: 0,
      referenceLoadMs: 0,
      referenceCount: refs.meta.referenceCount,
      descriptorCount: refs.meta.descriptorCount,
      cached: true
    };
  }

  const { instance, loadMs } = await resolveCv();
  cv = instance;
  refs = await loadReferences();
  detector = cv.AKAZE.create();
  detector.setThreshold(refs.meta.threshold);
  matcher = cv.BFMatcher.create(cv.NORM_HAMMING, false);

  return {
    openCvLoadMs: loadMs,
    referenceLoadMs: refs.loadMs,
    referenceCount: refs.meta.referenceCount,
    descriptorCount: refs.meta.descriptorCount,
    cached: false
  };
}

async function analyzeCrop(payload) {
  if (!cv || !refs || !detector || !matcher) throw new Error("AKAZE n’est pas initialisé.");

  const extractStarted = now();
  const query = describeRgbaBuffer(payload.buffer, payload.width, payload.height, refs.meta.resizeMax);
  const extractMs = now() - extractStarted;
  const matchStarted = now();
  const candidates = globalVoteTop10(query);
  const matchMs = now() - matchStarted;
  query.delete();

  return { extractMs, matchMs, candidates };
}

self.addEventListener("message", async (event) => {
  const { id, type, payload } = event.data || {};
  try {
    let result;
    if (type === "init") result = await initialize();
    else if (type === "analyze") result = await analyzeCrop(payload);
    else throw new Error(`Commande inconnue: ${type}`);
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error?.message || String(error) });
  }
});
