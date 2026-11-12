/* Browser-only adapter around the existing WarResultRecognition core. */
(() => {
  "use strict";
  const CORE = window.WarResultRecognition;
  const VERSION = "5.1-local";
  let workerPromise = null;
  let worker = null;
  let activeProgress = () => {};

  function loadScript() {
    if (window.Tesseract) return Promise.resolve();
    if (workerPromise) return workerPromise;
    workerPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@v5.0.0/dist/tesseract.min.js";
      script.onload = resolve;
      script.onerror = () => { workerPromise = null; reject(new Error("Chargement Tesseract impossible. Vérifie la connexion et réessaie.")); };
      document.head.appendChild(script);
    });
    return workerPromise;
  }

  async function getWorker(logger) {
    if (worker) return worker;
    await loadScript();
    worker = await window.Tesseract.createWorker("eng", 1, {
      logger: (message) => activeProgress(message),
      workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@v5.0.0/dist/worker.min.js",
      corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@v5.0.0",
      langPath: "https://tessdata.projectnaptha.com/4.0.0",
      cacheMethod: "write", gzip: true
    });
    return worker;
  }

  function decode(file) {
    if (typeof createImageBitmap === "function") return createImageBitmap(file);
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Cette image ne peut pas être décodée dans ce navigateur.")); };
      image.src = url;
    });
  }

  function makeCanvas(source, maxPixels = 10000000) {
    const scale = Math.min(1, Math.sqrt(maxPixels / (source.width * source.height)));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(source.width * scale));
    canvas.height = Math.max(1, Math.round(source.height * scale));
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas indisponible dans ce navigateur.");
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return { canvas, scale };
  }

  function resultColor(canvas) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const x = Math.floor(canvas.width * .30), y2 = Math.ceil(canvas.height * .12);
    const data = ctx.getImageData(x, 0, Math.ceil(canvas.width * .40), y2).data;
    let blue = 0, red = 0;
    for (let i = 0; i < data.length; i += 16) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (b > 150 && b > r * 1.18 && b > g * 1.08) blue++;
      if (r > 165 && r > g * 1.25 && r > b * 1.1) red++;
    }
    const high = Math.max(blue, red), low = Math.min(blue, red);
    if (high < 3 || high < 3 * low) return "";
    return blue > red ? "win" : "loss";
  }

  function crop(source, rect, scale = 3, grayscale = false) {
    if (!rect || rect.width < 1 || rect.height < 1) return null;
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(4096, Math.round(rect.width * scale));
    canvas.height = Math.min(1024, Math.round(rect.height * scale));
    const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: grayscale });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
    if (grayscale) {
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < image.data.length; i += 4) {
        const gray = .299 * image.data[i] + .587 * image.data[i + 1] + .114 * image.data[i + 2];
        image.data[i] = image.data[i + 1] = image.data[i + 2] = Math.max(0, Math.min(255, Math.round((gray - 127.5) * 1.7 + 127.5)));
      }
      ctx.putImageData(image, 0, 0);
    }
    return canvas;
  }

  function parse(result, scale) {
    return CORE.parseTsv(result?.data?.tsv || "", { x: 0, y: 0 }, scale);
  }

  function mergeTextFields(a, b) {
    const first = a || { value: "", confidence: null, uncertain: true, source: "pass-1" };
    const second = b || { value: "", confidence: null, uncertain: true, source: "pass-2" };
    const norm = (value) => String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase();
    if (!first.value && second.value) return { ...second, uncertain: true, alternatives: undefined };
    if (first.value && second.value && norm(first.value) !== norm(second.value)) return { value: "", confidence: null, source: "two-pass-disagreement", uncertain: true, alternatives: [first.value, second.value] };
    return { ...first, uncertain: Boolean(first.uncertain || second.uncertain), confidence: Number.isFinite(first.confidence) && Number.isFinite(second.confidence) ? Math.max(first.confidence, second.confidence) : first.confidence ?? second.confidence };
  }

  function numericRead(text) {
    const digits = String(text || "").replace(/\D/g, "");
    return digits.length === 4 || digits.length === 6 ? digits : "";
  }

  async function analyze(file, onProgress = () => {}) {
    if (!CORE) throw new Error("Le module de reconnaissance partagé n’est pas chargé.");
    activeProgress = onProgress;
    const totalStart = performance.now();
    const heapBefore = performance.memory?.usedJSHeapSize ?? null;
    const source = await decode(file);
    let canvas, scale;
    try {
      const prepared = makeCanvas(source);
      canvas = prepared.canvas; scale = prepared.scale;
    } catch (error) {
      source.close?.();
      throw error;
    }
    const dimensions = { width: source.width, height: source.height };
    const engineStart = performance.now();
    let engine;
    try { engine = await getWorker(onProgress); }
    catch (error) { source.close?.(); canvas.width = canvas.height = 1; throw error; }
    const workerLoadMs = Math.round(performance.now() - engineStart);
    const calls = [];
    const run = async (name, image, psm, whitelist = "") => {
      await engine.setParameters({ tessedit_pageseg_mode: String(psm), preserve_interword_spaces: "1", tessedit_char_whitelist: whitelist });
      const t0 = performance.now();
      const output = await engine.recognize(image);
      calls.push({ method: name, ms: Math.round(performance.now() - t0), confidence: output.data?.confidence ?? null });
      return output;
    };
    try {
      onProgress({ status: "Lecture générale", progress: .1 });
      const full = await run("full-psm6", canvas, 6);
      onProgress({ status: "Lecture des éléments isolés", progress: .48 });
      const sparse = await run("sparse-psm11", canvas, 11);
      const fullWords = parse(full, scale), sparseWords = parse(sparse, scale);
      const color = resultColor(canvas);
      const first = CORE.extract(fullWords, source.width, source.height, { colorResult: color });
      const second = CORE.extract(sparseWords, source.width, source.height, { colorResult: color });
      const fields = { ...first.fields };
      for (const key of ["localAlliance", "opponentAlliance"]) fields[key] = mergeTextFields(first.fields[key], second.fields[key]);
      for (const key of ["localScore", "opponentScore", "localTrophies", "opponentTrophies"]) fields[key] = CORE.arbitrateNumeric(first.fields[key], second.fields[key]);
      const titleText = `${full.data?.text || ""} ${sparse.data?.text || ""}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const titleCue = /victoire|victory/.test(titleText) ? "win" : /defaite|defeat/.test(titleText) ? "loss" : "";
      fields.result = color && titleCue && color !== titleCue
        ? { value: "", confidence: null, source: "color-text-disagreement", uncertain: true, alternatives: [color, titleCue] }
        : { value: color || titleCue, confidence: null, source: color ? (titleCue ? "color-and-title-text" : "color-cue") : "title-text-cue", uncertain: !(color || titleCue) };
      const zoneInfo = CORE.locateZones(sparseWords, source.width, source.height);

      // Adaptive second pass: only numerals whose primary reads are absent/uncertain get native-resolution targeted crops.
      const label = fullWords.find((word) => CORE.toSearchKey(word.text) === "points");
      const cropTargets = {
        localScore: label ? { x: source.width * .18, y: Math.max(0, ((label.bbox.y0 + label.bbox.y1) / 2) - source.height * .04), width: source.width * .25, height: source.height * .08 } : null,
        opponentScore: label ? { x: source.width * .58, y: Math.max(0, ((label.bbox.y0 + label.bbox.y1) / 2) - source.height * .04), width: source.width * .25, height: source.height * .08 } : null,
        localTrophies: zoneInfo.zones.localTrophies,
        opponentTrophies: zoneInfo.zones.opponentTrophies
      };
      const cropMethodResults = {};
      for (const key of Object.keys(cropTargets)) {
        const existing = fields[key];
        const shouldRead = !existing.value || existing.uncertain || existing.alternatives?.length;
        if (!shouldRead || !cropTargets[key]) continue;
        onProgress({ status: `Recadrage ciblé : ${key}`, progress: .55 });
        const image = crop(source, cropTargets[key], key.includes("Trophies") ? 3 : 2, key.includes("Trophies"));
        if (!image) continue;
        const output = await run(`${key}-targeted-psm7`, image, 7, "0123456789");
        const value = numericRead(output.data?.text);
        if (value) {
          cropMethodResults[key] = value;
          const expected = key.includes("Score") ? 6 : 4;
          const normalized = value.length === expected ? value : "";
          if (normalized) {
            const targeted = { value: normalized, confidence: output.data?.confidence ?? null, source: `${key}-targeted-native-crop`, uncertain: true };
            if (existing.alternatives?.length) {
              fields[key] = { value: "", confidence: null, source: "three-read-disagreement", uncertain: true, alternatives: [...new Set([...existing.alternatives, normalized])] };
            } else fields[key] = CORE.arbitrateNumeric(existing, targeted);
          }
        }
        image.width = image.height = 1;
      }
      const opponentZone = zoneInfo.zones.opponentAlliance;
      let opponentCropCandidate = "";
      if (opponentZone && (fields.opponentAlliance.uncertain || fields.opponentAlliance.alternatives?.length || !fields.opponentAlliance.value)) {
        const image = crop(source, opponentZone, 2, true);
        if (image) {
          await engine.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1", tessedit_char_whitelist: "" });
          const read = await run("opponent-alliance-targeted-psm6", image, 6);
          opponentCropCandidate = String(read.data?.text || "").replace(/\s+/g, " ").trim();
          image.width = image.height = 1;
          const clean = (v) => v.replace(/[^\p{L}\p{N}'’ -]/gu, "").replace(/\s+/g, " ").trim();
          const candidate = clean(opponentCropCandidate);
          if (candidate.length > 1 && fields.opponentAlliance.alternatives?.length) {
            fields.opponentAlliance = { value: "", confidence: null, source: "three-read-disagreement", uncertain: true, alternatives: [...new Set([...fields.opponentAlliance.alternatives, candidate])] };
          } else if (candidate.length > 1 && fields.opponentAlliance.value && clean(fields.opponentAlliance.value).toLocaleLowerCase() !== candidate.toLocaleLowerCase()) {
            fields.opponentAlliance = { value: "", confidence: null, source: "opponent-name-disagreement", uncertain: true, alternatives: [fields.opponentAlliance.value, candidate] };
          } else if (candidate.length > 1 && !fields.opponentAlliance.value) {
            fields.opponentAlliance = { value: candidate, confidence: read.data?.confidence ?? null, source: "opponent-name-targeted-crop", uncertain: true };
          }
        }
      }
      const warnings = [...new Set([...first.warnings, ...second.warnings])];
      for (const [key, item] of Object.entries(fields)) if (key !== "result" && (!item.value || item.uncertain || item.alternatives?.length)) warnings.push(`${key}_requires_review`);
      if (fields.localScore.value && fields.opponentScore.value && color && ((Number(fields.localScore.value) > Number(fields.opponentScore.value)) !== (color === "win"))) warnings.push("score_result_conflict");
      const fieldStatusSummary = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value.alternatives?.length ? "conflict" : value.value ? (value.uncertain ? "uncertain" : "recognized") : "missing"]));
      return {
        fields, warnings: [...new Set(warnings)], rawText: `${full.data?.text || ""}\n${sparse.data?.text || ""}`,
        metrics: { engine: "Tesseract.js v5 local browser", engineVersion: VERSION, workerLoadMs, totalMs: Math.round(performance.now() - totalStart), calls, dimensions, analyzedCanvas: { width: canvas.width, height: canvas.height }, downscale: scale, methods: calls.map((item) => item.method), colorCue: color || null, zonesFound: zoneInfo.anchorsFound, cropMethodResults, opponentCropCandidate: opponentCropCandidate || null, fieldStatusSummary, bytes: file.size, jsHeapBeforeBytes: heapBefore, jsHeapAfterBytes: performance.memory?.usedJSHeapSize ?? null, jsHeapDeltaBytes: heapBefore != null && performance.memory?.usedJSHeapSize != null ? performance.memory.usedJSHeapSize - heapBefore : null }
      };
    } finally {
      source.close?.();
      canvas.width = canvas.height = 1;
    }
  }

  async function release() {
    activeProgress = () => {};
    if (worker) { await worker.terminate(); worker = null; }
    workerPromise = null;
  }
  window.WarResultsVisionEngine = { analyze, release, version: VERSION };
})();
