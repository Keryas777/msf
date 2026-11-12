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

  function readableWorkerStatus(value) {
    const raw = String(value || "");
    const normalized = raw.toLowerCase();
    if (normalized.includes("loading tesseract core")) return "Chargement de Tesseract Core (ressources WASM)…";
    if (normalized.includes("initializing tesseract")) return "Initialisation du moteur Tesseract…";
    if (normalized.includes("loading language traineddata")) return "Chargement du modèle OCR anglais…";
    if (normalized.includes("initializing api")) return "Initialisation de l’API OCR locale…";
    if (normalized.includes("recognizing text")) return "Reconnaissance du texte…";
    return raw ? `Ressource OCR : ${raw}` : "Chargement des ressources OCR locales…";
  }

  async function getWorker() {
    if (worker) return worker;
    activeProgress({ status: "Chargement du script Tesseract.js…", progress: .03 });
    await loadScript();
    activeProgress({ status: "Démarrage du Worker; chargement WASM et du modèle OCR…", progress: .06 });
    try {
      worker = await window.Tesseract.createWorker("eng", 1, {
        logger: (message) => activeProgress({ status: readableWorkerStatus(message.status), progress: message.progress }),
        workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@v5.0.0/dist/worker.min.js",
        corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@v5.0.0",
        langPath: "https://tessdata.projectnaptha.com/4.0.0",
        cacheMethod: "write", gzip: true
      });
    } catch (error) {
      worker = null;
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Échec du Worker ou du chargement WASM/modèle OCR : ${detail}`);
    }
    activeProgress({ status: "Worker OCR prêt.", progress: .09 });
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

  const FIELD_SIDES = { localAlliance: "text", opponentAlliance: "text", localScore: "numeric", opponentScore: "numeric", localTrophies: "numeric", opponentTrophies: "numeric", result: "result" };
  function cleanAlliance(value, field) {
    let text = String(value || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
    if (field === "localAlliance") text = text.replace(/^LoSP\s*/i, "").trim();
    return text.replace(/^[|:;]+|[|:;]+$/g, "").trim();
  }
  function mergeText(primary, secondary, source) {
    const a = cleanAlliance(primary?.value, source), b = cleanAlliance(secondary?.value, source);
    if (primary?.alternatives?.length) return { value: "", confidence: null, source: "multiple-reads-disagree", uncertain: true, alternatives: [...new Set([...primary.alternatives.map((value) => cleanAlliance(value, source)).filter(Boolean), ...(b ? [b] : [])])] };
    if (a && b && a.normalize("NFKC").toLocaleLowerCase() !== b.normalize("NFKC").toLocaleLowerCase()) {
      return { value: "", confidence: null, source: "whole-image-vs-zone-disagreement", uncertain: true, alternatives: [...new Set([a, b])] };
    }
    const picked = a ? primary : b ? secondary : null;
    return picked ? { ...picked, value: a || b, uncertain: true, source: a && b ? "whole-image-and-zone-agree" : picked.source } : { value: "", confidence: null, source: "zone-unreadable", uncertain: true };
  }
  function arbitrateZoneNumeric(primary, secondary) {
    if (primary?.alternatives?.length) return { value: "", confidence: null, source: "multiple-reads-disagree", uncertain: true, alternatives: [...new Set([...primary.alternatives, ...(secondary?.value ? [secondary.value] : [])])] };
    return CORE.arbitrateNumeric(primary, secondary);
  }
  function normalizeRect(rect, width, height) {
    if (!rect) return null;
    const x = Math.max(0, Math.min(width - 1, Math.floor(Number(rect.x) || 0)));
    const y = Math.max(0, Math.min(height - 1, Math.floor(Number(rect.y) || 0)));
    const right = Math.max(x + 1, Math.min(width, Math.ceil((Number(rect.x) || 0) + (Number(rect.width) || 0))));
    const bottom = Math.max(y + 1, Math.min(height, Math.ceil((Number(rect.y) || 0) + (Number(rect.height) || 0))));
    return { x, y, width: right - x, height: bottom - y };
  }

  async function analyze(file, onProgress = () => {}, zoneOverrides = {}) {
    if (!CORE) throw new Error("Le module de reconnaissance partagé n’est pas chargé.");
    activeProgress = onProgress;
    activeProgress({ status: "Ouverture et préparation de l’image…", progress: .01 });
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
    try { engine = await getWorker(); }
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
      onProgress({ status: "Première lecture OCR (PSM 6)…", progress: .12 });
      const full = await run("full-psm6", canvas, 6);
      onProgress({ status: "Lecture des éléments isolés", progress: .48 });
      onProgress({ status: "Seconde lecture OCR (PSM 11)…", progress: .42 });
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
      zoneInfo.method = zoneInfo.zones.method;
      zoneInfo.layout = zoneInfo.zones.layout;
      for (const [key, rect] of Object.entries(zoneOverrides || {})) if (FIELD_SIDES[key] && rect) zoneInfo.zones[key === "result" ? "resultBand" : key] = normalizeRect(rect, source.width, source.height);

      // Every proposal below is read from its displayed field crop. The full-image reads
      // are used only as independent hypotheses and as anchors for locating the crops.
      const zoneImages = {};
      const zoneReads = {};
      const expected = { localScore: 6, opponentScore: 6, localTrophies: 4, opponentTrophies: 4 };
      const zoneKeys = ["localAlliance", "opponentAlliance", "localScore", "opponentScore", "localTrophies", "opponentTrophies", "result"];
      for (const [zoneIndex, key] of zoneKeys.entries()) {
        onProgress({ status: `Découpe et lecture ciblée ${zoneIndex + 1}/7 : ${key}`, progress: .52 + zoneIndex * .055 });
        const rect = normalizeRect(zoneInfo.zones[key === "result" ? "resultBand" : key], source.width, source.height);
        if (!rect || rect.width < 2 || rect.height < 2) {
          zoneReads[key] = { value: "", confidence: null, source: "zone-not-located", uncertain: true };
          continue;
        }
        const numericField = Object.hasOwn(expected, key);
        const sourceCrop = crop(source, rect, 1, false);
        const sourcePreview = sourceCrop?.toDataURL("image/jpeg", .86) || "";
        if (sourceCrop) sourceCrop.width = sourceCrop.height = 1;
        const fieldImage = crop(source, rect, numericField ? 3 : 2, numericField);
        if (!fieldImage) continue;
        try {
          const anchored = key.includes("Score") ? zoneInfo.anchorsFound.scoreValues || zoneInfo.anchorsFound.scoreLabel : key.includes("Trophies") ? zoneInfo.anchorsFound.trophyRow || zoneInfo.anchorsFound.losp : key === "localAlliance" ? zoneInfo.anchorsFound.losp : key === "opponentAlliance" ? zoneInfo.anchorsFound.opponentName : zoneInfo.anchorsFound.resultTitle;
          zoneImages[key] = { rect, sourcePreview, preview: fieldImage.toDataURL("image/jpeg", .86), width: fieldImage.width, height: fieldImage.height, geometryConfidence: anchored ? "anchor-based" : "fallback" };
          if (key === "result") {
            const cue = resultColor(fieldImage);
            zoneReads[key] = { value: cue || "", confidence: null, source: "result-band-color-crop", uncertain: !cue };
          } else {
            const whitelist = numericField ? "0123456789" : "";
            const output = await run(`${key}-zone-psm7`, fieldImage, 7, whitelist);
            const raw = String(output.data?.text || "").replace(/\s+/g, " ").trim();
            const value = numericField ? numericRead(raw) : cleanAlliance(raw, key);
            const valid = numericField ? value.length === expected[key] : value.length > 1;
            zoneReads[key] = { value: valid ? value : "", confidence: output.data?.confidence ?? null, source: `${key}-zone-psm7`, uncertain: !valid || (output.data?.confidence ?? 0) < 60, raw };
          }
        } finally {
          fieldImage.width = fieldImage.height = 1;
        }
      }
      for (const key of ["localAlliance", "opponentAlliance"]) {
        const zone = zoneReads[key];
        const whole = fields[key];
        fields[key] = mergeText(whole, zone, key);
        if (zone.value && fields[key].value && fields[key].value === zone.value && fields[key].source === "whole-image-and-zone-agree") fields[key].uncertain = Boolean(whole.uncertain || zone.uncertain);
      }
      for (const key of Object.keys(expected)) {
        const zone = zoneReads[key];
        fields[key] = arbitrateZoneNumeric(fields[key], zone);
      }
      const resultZone = zoneReads.result;
      if (fields.result?.alternatives?.length) {
        fields.result = { ...fields.result, alternatives: [...new Set([...fields.result.alternatives, ...(resultZone?.value ? [resultZone.value] : [])])] };
      } else if (resultZone?.value && fields.result?.value && resultZone.value !== fields.result.value) {
        fields.result = { value: "", confidence: null, source: "result-color-disagreement", uncertain: true, alternatives: [...new Set([fields.result.value, resultZone.value])] };
      } else if (!fields.result?.value && resultZone?.value) fields.result = resultZone;

      const cropMethodResults = Object.fromEntries(Object.entries(zoneReads).map(([key, value]) => [key, value.value || null]));
      const warnings = [...new Set([...first.warnings, ...second.warnings])];
      for (const [key, item] of Object.entries(fields)) if (key !== "result" && (!item.value || item.uncertain || item.alternatives?.length)) warnings.push(`${key}_requires_review`);
      if (fields.localScore.value && fields.opponentScore.value && color && ((Number(fields.localScore.value) > Number(fields.opponentScore.value)) !== (color === "win"))) warnings.push("score_result_conflict");
      const fieldStatusSummary = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value.alternatives?.length ? "conflict" : value.value ? (value.uncertain ? "uncertain" : "recognized") : "missing"]));
      return {
        fields, warnings: [...new Set(warnings)], rawText: `${full.data?.text || ""}\n${sparse.data?.text || ""}`,
        zones: Object.fromEntries(Object.entries(zoneImages).map(([key, value]) => [key, { ...value, method: zoneInfo.method, ocrMethod: zoneReads[key]?.source || "color-analysis", layout: zoneInfo.layout }])),
        metrics: { engine: "Tesseract.js v5 local browser", engineVersion: VERSION, workerLoadMs, totalMs: Math.round(performance.now() - totalStart), calls, dimensions, analyzedCanvas: { width: canvas.width, height: canvas.height }, downscale: scale, methods: calls.map((item) => item.method), colorCue: color || null, panel: zoneInfo.panel, panelMethod: zoneInfo.panelMethod, zonesFound: zoneInfo.anchorsFound, zoneMethod: zoneInfo.method, layout: zoneInfo.layout, zoneReads, cropMethodResults, fieldStatusSummary, bytes: file.size, jsHeapBeforeBytes: heapBefore, jsHeapAfterBytes: performance.memory?.usedJSHeapSize ?? null, jsHeapDeltaBytes: heapBefore != null && performance.memory?.usedJSHeapSize != null ? performance.memory.usedJSHeapSize - heapBefore : null }
      };
    } finally {
      source.close?.();
      canvas.width = canvas.height = 1;
    }
  }

  async function analyzeField(file, field, rect, onProgress = () => {}) {
    if (!CORE || !FIELD_SIDES[field]) throw new Error("Champ OCR inconnu.");
    activeProgress = onProgress;
    const source = await decode(file);
    let image;
    try {
      const safe = normalizeRect(rect, source.width, source.height);
      if (!safe || safe.width < 2 || safe.height < 2) throw new Error("La zone corrigée est trop petite ou hors image.");
      const numericField = FIELD_SIDES[field] === "numeric";
      image = crop(source, safe, numericField ? 3 : 2, numericField);
      if (!image) throw new Error("Impossible de créer la découpe de ce champ.");
      const sourceCrop = crop(source, safe, 1, false);
      const sourcePreview = sourceCrop?.toDataURL("image/jpeg", .86) || "";
      if (sourceCrop) sourceCrop.width = sourceCrop.height = 1;
      if (field === "result") { const value = resultColor(image); return { field, value, confidence: null, uncertain: !value, source: "result-band-color-crop", rect: safe, sourcePreview, preview: image.toDataURL("image/jpeg", .86) }; }
      const engine = await getWorker();
      await engine.setParameters({ tessedit_pageseg_mode: "7", preserve_interword_spaces: "1", tessedit_char_whitelist: numericField ? "0123456789" : "" });
      const output = await engine.recognize(image);
      const raw = String(output.data?.text || "").replace(/\s+/g, " ").trim();
      const value = numericField ? numericRead(raw) : cleanAlliance(raw, field);
      const expectedLength = field.includes("Score") ? 6 : 4;
      const valid = numericField ? value.length === expectedLength : value.length > 1;
      return { field, value: valid ? value : "", confidence: output.data?.confidence ?? null, uncertain: !valid || (output.data?.confidence ?? 0) < 60, source: `${field}-manual-zone-psm7`, raw, rect: safe, sourcePreview, preview: image.toDataURL("image/jpeg", .86) };
    } finally {
      source.close?.();
      if (image) image.width = image.height = 1;
    }
  }

  async function release() {
    activeProgress = () => {};
    if (worker) { await worker.terminate(); worker = null; }
    workerPromise = null;
  }
  window.WarResultsVisionEngine = { analyze, analyzeField, release, version: VERSION };
})();
