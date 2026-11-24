/* Isolated OCR-only strategies for the numeric laboratory. The source crop is
 * fixed by the caller; this module never invokes or changes a locator. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WarResultsOcrExperiment = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STRATEGIES = Object.freeze([
    { id: "reference", label: "Référence actuelle · PSM 7", group: "baseline", psm: 7, prep: "reference", parameters: { scale: 3, smoothing: "high", grayscale: true, contrast: 1.7 } },
    { id: "grayscale", label: "Niveaux de gris · PSM 7", group: "preprocess", psm: 7, prep: "grayscale", parameters: { scale: 3, smoothing: "high", grayscale: true, contrast: 1 } },
    { id: "otsu", label: "Seuillage global Otsu · PSM 7", group: "preprocess", psm: 7, prep: "otsu", parameters: { scale: 3, smoothing: "high", threshold: "Otsu histogram" } },
    { id: "adaptive", label: "Seuillage local · PSM 7", group: "preprocess", psm: 7, prep: "adaptive", parameters: { scale: 3, smoothing: "high", threshold: "local mean - 8", radius: 6 } },
    { id: "tight-crop", label: "Marge horizontale réduite · PSM 7", group: "geometry", psm: 7, prep: "tight-crop", parameters: { horizontalInset: .06, scale: 3, grayscale: true, contrast: 1.7 } },
    { id: "thin-strokes", label: "Amincissement morphologique · PSM 7", group: "preprocess", psm: 7, prep: "thin-strokes", parameters: { scale: 3, threshold: "Otsu", operation: "3×3 erosion" } },
    { id: "psm8", label: "Image de référence · PSM 8", group: "segmentation", psm: 8, prep: "reference", parameters: { scale: 3, smoothing: "high", grayscale: true, contrast: 1.7 } },
    { id: "psm13", label: "Image de référence · PSM 13", group: "segmentation", psm: 13, prep: "reference", parameters: { scale: 3, smoothing: "high", grayscale: true, contrast: 1.7 } },
    { id: "glyphs", label: "Tesseract chiffre par chiffre · PSM 10", group: "glyph", psm: 10, prep: "glyphs", parameters: { glyphPadding: .18, scalePerGlyph: 4, grayscaleContrast: 1.7 } }
  ]);
  const PSM_MODES = Object.freeze([7, 8, 13]);
  const PREPROCESSING_MODES = Object.freeze([
    { id: "reference", label: "Référence sans correction supplémentaire" },
    { id: "grayscale", label: "Niveaux de gris" },
    { id: "otsu", label: "Seuillage global Otsu" },
    { id: "adaptive", label: "Seuillage local adaptatif" },
    { id: "tight-crop", label: "Marge horizontale réduite" },
    { id: "thin-strokes", label: "Amincissement morphologique" }
  ]);
  function buildCombinations(psms, preprocessings) {
    const validPsms = [...new Set((psms || []).map(Number).filter((value) => PSM_MODES.includes(value)))];
    const validPreps = [...new Set((preprocessings || []).filter((value) => PREPROCESSING_MODES.some((mode) => mode.id === value)))];
    return validPreps.flatMap((prep) => validPsms.map((psm) => ({
      id: `combo:${prep}:psm${psm}`,
      label: `PSM ${psm} · ${PREPROCESSING_MODES.find((mode) => mode.id === prep).label}`,
      group: prep === "reference" ? "baseline" : "preprocess", psm, prep, parameters: {}
    })));
  }
  const MAX_EDGE = 4096;

  function makeCanvas(width, height) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width > MAX_EDGE || height > MAX_EDGE) {
      throw new Error("Dimensions de découpe OCR hors limites.");
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width); canvas.height = Math.round(height);
    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!context) throw new Error("Canvas indisponible pour le comparateur OCR.");
    return { canvas, context };
  }

  function grayAt(data, offset) {
    return .299 * data[offset] + .587 * data[offset + 1] + .114 * data[offset + 2];
  }

  function otsuThreshold(data) {
    const hist = new Uint32Array(256); let total = 0;
    for (let i = 0; i < data.length; i += 4) { hist[Math.max(0, Math.min(255, Math.round(grayAt(data, i))))]++; total++; }
    let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumBackground = 0, weightBackground = 0, bestVariance = -1, threshold = 128;
    for (let i = 0; i < 256; i++) {
      weightBackground += hist[i]; if (!weightBackground) continue;
      const weightForeground = total - weightBackground; if (!weightForeground) break;
      sumBackground += i * hist[i];
      const delta = sumBackground / weightBackground - (sum - sumBackground) / weightForeground;
      const variance = weightBackground * weightForeground * delta * delta;
      if (variance > bestVariance) { bestVariance = variance; threshold = i; }
    }
    return threshold;
  }

  function integralGray(data, width, height) {
    const stride = width + 1, integral = new Float64Array((width + 1) * (height + 1));
    for (let y = 1; y <= height; y++) {
      let row = 0;
      for (let x = 1; x <= width; x++) {
        row += grayAt(data, ((y - 1) * width + x - 1) * 4);
        integral[y * stride + x] = integral[(y - 1) * stride + x] + row;
      }
    }
    return integral;
  }

  function prepCanvas(source, mode, scale = 3) {
    const { canvas, context } = makeCanvas(Math.min(MAX_EDGE, source.width * scale), Math.min(1024, source.height * scale));
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    if (mode === "reference") {
      const image = context.getImageData(0, 0, canvas.width, canvas.height), data = image.data;
      for (let i = 0; i < data.length; i += 4) {
        const value = Math.max(0, Math.min(255, Math.round((grayAt(data, i) - 127.5) * 1.7 + 127.5)));
        data[i] = data[i + 1] = data[i + 2] = value;
      }
      context.putImageData(image, 0, 0);
      return canvas;
    }
    if (mode === "glyphs") return canvas;
    const image = context.getImageData(0, 0, canvas.width, canvas.height), data = image.data;
    const threshold = mode === "otsu" ? otsuThreshold(data) : null;
    const integral = mode === "adaptive" ? integralGray(data, canvas.width, canvas.height) : null;
    const stride = canvas.width + 1, radius = Math.max(3, Math.round(scale * 2));
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4, gray = grayAt(data, i); let value = gray;
      if (mode === "otsu") value = gray >= threshold ? 255 : 0;
      if (mode === "adaptive") {
        const x0 = Math.max(0, x - radius), x1 = Math.min(canvas.width, x + radius + 1);
        const y0 = Math.max(0, y - radius), y1 = Math.min(canvas.height, y + radius + 1);
        const sum = integral[y1 * stride + x1] - integral[y0 * stride + x1] - integral[y1 * stride + x0] + integral[y0 * stride + x0];
        const mean = sum / ((x1 - x0) * (y1 - y0));
        value = gray >= mean - 8 ? 255 : 0;
      }
      data[i] = data[i + 1] = data[i + 2] = Math.round(value);
    }
    context.putImageData(image, 0, 0);
    if (mode === "thin-strokes") {
      const { canvas: eroded, context: erodedContext } = makeCanvas(canvas.width, canvas.height);
      const sourceData = context.getImageData(0, 0, canvas.width, canvas.height), output = erodedContext.createImageData(canvas.width, canvas.height);
      for (let y = 1; y < canvas.height - 1; y++) for (let x = 1; x < canvas.width - 1; x++) {
        const i = (y * canvas.width + x) * 4; let value = 255;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) value = Math.min(value, sourceData.data[((y + dy) * canvas.width + x + dx) * 4]);
        output.data[i] = output.data[i + 1] = output.data[i + 2] = value; output.data[i + 3] = 255;
      }
      erodedContext.putImageData(output, 0, 0); canvas.width = canvas.height = 1; return eroded;
    }
    return canvas;
  }

  function tightCropCanvas(source, inset = .06, scale = 3) {
    const side = Math.max(1, Math.floor(source.width * inset));
    const { canvas, context } = makeCanvas(Math.min(MAX_EDGE, (source.width - side * 2) * scale), Math.min(1024, source.height * scale));
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
    context.drawImage(source, side, 0, source.width - side * 2, source.height, 0, 0, canvas.width, canvas.height);
    const image = context.getImageData(0, 0, canvas.width, canvas.height), data = image.data;
    for (let i = 0; i < data.length; i += 4) { const v = Math.max(0, Math.min(255, Math.round((grayAt(data, i) - 127.5) * 1.7 + 127.5))); data[i] = data[i + 1] = data[i + 2] = v; }
    context.putImageData(image, 0, 0); return canvas;
  }

  function normalizedRead(text) {
    const raw = String(text || "").replace(/\s+/g, " ").trim();
    const digits = raw.replace(/\D/g, "");
    return { raw, digits, value: digits.length === 4 ? digits : "", digitCount: digits.length };
  }

  async function read(worker, image, strategy) {
    const started = performance.now();
    await worker.setParameters({ tessedit_pageseg_mode: String(strategy.psm), preserve_interword_spaces: "1", tessedit_char_whitelist: "0123456789" });
    const output = await worker.recognize(image);
    const parsed = normalizedRead(output.data?.text);
    return { strategy: strategy.id, label: strategy.label, psm: strategy.psm, preprocessing: strategy.prep, parameters: strategy.parameters,
      tesseditCharWhitelist: "0123456789", preserveInterwordSpaces: "1",
      ...parsed, confidence: Number.isFinite(output.data?.confidence) ? output.data.confidence : null,
      ms: Math.round(performance.now() - started), warnings: parsed.digitCount === 4 ? [] : [parsed.digitCount ? "unexpected-digit-count" : "no-numeric-read"] };
  }

  function failedRead(strategy, error, ms) {
    const detail = String(error?.message || error || "OCR unavailable").slice(0, 180);
    return { strategy: strategy.id, label: strategy.label, psm: strategy.psm, preprocessing: strategy.prep, parameters: strategy.parameters,
      tesseditCharWhitelist: "0123456789", raw: "", digits: "", value: "", digitCount: 0, confidence: null, ms,
      warnings: [`strategy-error:${detail}`] };
  }

  async function readGlyphs(source, worker, digitReader) {
    const started = performance.now();
    if (!digitReader || typeof digitReader.segment !== "function") return { strategy: "glyphs", label: "Tesseract chiffre par chiffre · PSM 10", psm: 10, raw: "", digits: "", value: "", digitCount: 0, confidence: null, ms: 0, warnings: ["segmenter-unavailable"], segmentation: null };
    const imageData = source.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, source.width, source.height);
    const segmentation = digitReader.segment(imageData, "trophy", 4);
    if (segmentation.reason || segmentation.bounds?.length !== 4 || !Number.isFinite(segmentation.confidence) || segmentation.confidence < .24) {
      return { strategy: "glyphs", label: "Tesseract chiffre par chiffre · PSM 10", psm: 10, preprocessing: "color-components; 18% glyph padding; ×4; grayscale contrast 1.7", parameters: { glyphPadding: .18, scalePerGlyph: 4, grayscaleContrast: 1.7 }, tesseditCharWhitelist: "0123456789", raw: "", digits: "", value: "", digitCount: 0,
        confidence: null, ms: Math.round(performance.now() - started), warnings: [segmentation.reason || "uncertain-four-glyph-segmentation"],
        segmentation: { confidence: segmentation.confidence ?? null, bounds: segmentation.bounds || [], warnings: segmentation.warnings || [] } };
    }
    const glyphs = [];
    for (const bounds of segmentation.bounds) {
      const padX = Math.max(2, Math.ceil(bounds.height * .18)), padY = Math.max(2, Math.ceil(bounds.height * .18));
      const { canvas, context } = makeCanvas(Math.min(512, (bounds.width + padX * 2) * 4), Math.min(512, (bounds.height + padY * 2) * 4));
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
      context.drawImage(source, bounds.x, bounds.y, bounds.width, bounds.height, padX * 4, padY * 4, bounds.width * 4, bounds.height * 4);
      const prepared = prepCanvas(canvas, "reference", 1);
      try {
        const result = await read(worker, prepared, { id: "glyph", label: "Glyph · PSM 10", psm: 10, prep: "grayscale" });
        glyphs.push({ bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }, preview: prepared.toDataURL("image/jpeg", .78), ...result });
      } catch (error) {
        glyphs.push({ bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }, raw: "", digits: "", value: "", digitCount: 0, confidence: null,
          ms: 0, warnings: [`strategy-error:${String(error?.message || error).slice(0, 180)}`] });
      } finally { canvas.width = canvas.height = prepared.width = prepared.height = 1; }
    }
    const exactEach = glyphs.length === 4 && glyphs.every((item) => item.digitCount === 1);
    const digits = exactEach ? glyphs.map((item) => item.digits).join("") : "";
    const confidenceValues = glyphs.map((item) => item.confidence).filter(Number.isFinite);
    const warnings = [...(segmentation.warnings || [])];
    if (!exactEach) warnings.push("each-glyph-must-produce-one-digit");
    return { strategy: "glyphs", label: "Tesseract chiffre par chiffre · PSM 10", psm: 10, preprocessing: "color-components; 18% glyph padding; ×4; grayscale contrast 1.7", parameters: { glyphPadding: .18, scalePerGlyph: 4, grayscaleContrast: 1.7 }, tesseditCharWhitelist: "0123456789",
      raw: glyphs.map((item) => item.raw).join(" | "), digits, value: exactEach ? digits : "", digitCount: exactEach ? 4 : glyphs.reduce((sum, item) => sum + item.digitCount, 0),
      confidence: confidenceValues.length ? confidenceValues.reduce((sum, n) => sum + n, 0) / confidenceValues.length : null,
      ms: Math.round(performance.now() - started), warnings: [...new Set(warnings)], glyphs,
      segmentation: { confidence: segmentation.confidence, bounds: segmentation.bounds, warnings: segmentation.warnings || [] } };
  }

  function consensus(reads) {
    const eligible = reads.filter((item) => item?.value && item.digitCount === 4);
    const families = new Map();
    for (const item of eligible) {
      const family = item.strategy === "glyphs" ? "glyph" : item.strategy === "reference" || item.strategy === "psm8" || item.strategy === "psm13" ? "tesseract-layout" : "preprocessing";
      if (!families.has(family)) families.set(family, new Map());
      const counts = families.get(family); counts.set(item.value, (counts.get(item.value) || 0) + 1);
    }
    const votes = new Map();
    for (const counts of families.values()) {
      const rankedFamily = [...counts].sort((a, b) => b[1] - a[1]);
      const familyLeader = rankedFamily[0];
      if (familyLeader && (!rankedFamily[1] || familyLeader[1] > rankedFamily[1][1])) votes.set(familyLeader[0], (votes.get(familyLeader[0]) || 0) + 1);
    }
    const ranked = [...votes].sort((a, b) => b[1] - a[1]);
    const clear = ranked.length && ranked[0][1] >= 2 && (!ranked[1] || ranked[0][1] > ranked[1][1]);
    return { strategy: "consensus", value: clear ? ranked[0][0] : "", votes: Object.fromEntries(votes), families: [...families.keys()],
      warnings: clear ? [] : [eligible.length ? "independent-strategies-disagree" : "no-valid-four-digit-read"] };
  }

  async function compare(sourceCrop, referenceCrop, worker, digitReader, onProgress = () => {}, requestedIds = null) {
    if (!sourceCrop || !referenceCrop || !worker) throw new Error("Découpe fixe ou Worker OCR indisponible.");
    const chosen = Array.isArray(requestedIds) ? [...requestedIds.filter((item) => item && typeof item === "object" && Number.isFinite(item.psm) && typeof item.prep === "string"), ...STRATEGIES.filter((item) => requestedIds.includes(item.id))] : STRATEGIES;
    if (!chosen.some((item) => item.id === "reference")) chosen.unshift(STRATEGIES[0]);
    const started = performance.now(), results = [];
    try {
      for (const [index, strategy] of chosen.entries()) {
        onProgress({ strategy: strategy.id, index: index + 1, total: chosen.length });
        if (strategy.id === "glyphs") {
          try { results.push(await readGlyphs(sourceCrop, worker, digitReader)); }
          catch (error) { results.push(failedRead(strategy, error, Math.round(performance.now() - started))); }
        } else {
          const strategyStarted = performance.now();
          let image = null;
          try {
            image = strategy.prep === "reference" ? referenceCrop : strategy.prep === "tight-crop" ? tightCropCanvas(sourceCrop) : prepCanvas(sourceCrop, strategy.prep, 3);
            const result = await read(worker, image, strategy);
            results.push({ ...result, ocrMs: result.ms, ms: Math.round(performance.now() - strategyStarted), preview: image.toDataURL("image/jpeg", .78) });
          } catch (error) {
            results.push(failedRead(strategy, error, Math.round(performance.now() - strategyStarted)));
          }
          finally { if (image && image !== referenceCrop) image.width = image.height = 1; }
        }
      }
      return { strategies: results, consensus: consensus(results), totalMs: Math.round(performance.now() - started) };
    } finally { /* Caller owns and releases the two frozen source crops. */ }
  }

  return { version: "0.2.0-experimental", strategies: STRATEGIES, psmModes: PSM_MODES, preprocessingModes: PREPROCESSING_MODES, buildCombinations, prepCanvas, normalizedRead, consensus, compare };
});
