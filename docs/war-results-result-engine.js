/* Lightweight title-color decision engine. Confidence uses the app-wide 0–100 convention. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WarResultsResultEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const now = () => typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  const MIN_COLOR_EVIDENCE_PIXELS = 16;

  function hueOf(r, g, b) {
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    if (!delta) return 0;
    let hue;
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    return (hue * 60 + 360) % 360;
  }

  function analyzePixels(imageData) {
    const data = imageData?.data, width = Number(imageData?.width) || 0, height = Number(imageData?.height) || 0;
    if (!data || width < 1 || height < 1 || data.length < width * height * 4) return { value: null, confidence: 0, blue: 0, red: 0, other: 0, active: 0, blueRatio: 0, redRatio: 0, reason: "invalid-pixel-region" };
    let blue = 0, red = 0, other = 0;
    for (let i = 0; i < data.length; i += 4) {
      if ((data[i + 3] ?? 255) < 96) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b), saturation = max ? (max - min) / max : 0;
      if (max < 105 || saturation < 0.24) continue;
      const hue = hueOf(r, g, b);
      if (hue >= 190 && hue <= 255) blue++;
      else if (hue <= 18 || hue >= 342) red++;
      else other++;
    }
    const active = blue + red + other;
    const blueRatio = active ? blue / active : 0, redRatio = active ? red / active : 0;
    const winner = blueRatio >= redRatio ? "win" : "loss";
    const dominance = Math.max(blueRatio, redRatio);
    const margin = Math.abs(blueRatio - redRatio);
    const decisive = active >= MIN_COLOR_EVIDENCE_PIXELS && dominance >= 0.68 && margin >= 0.35;
    const reason = active < MIN_COLOR_EVIDENCE_PIXELS ? "too-few-color-evidence-pixels" : decisive ? null : "mixed-or-weak-color-dominance";
    const confidence = decisive ? Math.round(Math.min(0.99, 0.62 + margin * 0.27 + Math.min(1, active / 80) * 0.1) * 1000) / 10 : 0;
    return { value: decisive ? winner : null, confidence,
      blue, red, other, active, blueRatio: Number(blueRatio.toFixed(4)), redRatio: Number(redRatio.toFixed(4)), dominance: Number(dominance.toFixed(4)), margin: Number(margin.toFixed(4)), reason };
  }

  function normalizeRect(rect, width, height) {
    const rx = Number(rect?.x), ry = Number(rect?.y), rw = Number(rect?.width), rh = Number(rect?.height);
    if (![rx, ry, rw, rh, width, height].every(Number.isFinite) || width < 1 || height < 1 || rw <= 0 || rh <= 0 || rx >= width || ry >= height || rx + rw <= 0 || ry + rh <= 0) return null;
    const x = Math.max(0, Math.min(width - 1, Math.floor(rx)));
    const y = Math.max(0, Math.min(height - 1, Math.floor(ry)));
    const right = Math.max(x + 1, Math.min(width, Math.ceil(rx + rw)));
    const bottom = Math.max(y + 1, Math.min(height, Math.ceil(ry + rh)));
    return { x, y, width: right - x, height: bottom - y };
  }

  function cropPixels(imageData, rect) {
    const x0 = Math.max(0, Math.min(imageData.width - 1, Math.floor(rect.x)));
    const y0 = Math.max(0, Math.min(imageData.height - 1, Math.floor(rect.y)));
    const x1 = Math.max(x0 + 1, Math.min(imageData.width, Math.ceil(rect.x + rect.width)));
    const y1 = Math.max(y0 + 1, Math.min(imageData.height, Math.ceil(rect.y + rect.height)));
    const width = x1 - x0, height = y1 - y0, output = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      const start = ((y + y0) * imageData.width + x0) * 4;
      output.set(imageData.data.subarray(start, start + width * 4), y * width * 4);
    }
    return { width, height, data: output };
  }

  function splitTitle(imageData) {
    const third = imageData.width / 3;
    return [0, 1, 2].map((index) => cropPixels(imageData, { x: index * third, y: 0, width: third, height: imageData.height }));
  }

  function normalizeTitle(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
  }

  function parseTitleText(value) {
    const text = normalizeTitle(value);
    if (/\b(?:victoire|victory)\b/.test(text)) return "win";
    if (/\b(?:defaite|defeat)\b/.test(text)) return "loss";
    return null;
  }

  async function decideRegions(input) {
    const started = now();
    const primary = analyzePixels(input.title);
    const banner = input.banner ? analyzePixels(input.banner) : null;
    let subregions = [];
    let coloredSubregions = [];
    let uniqueSubregionValues = [];
    const bannerConflict = Boolean(primary.value && banner?.value && primary.value !== banner.value);
    let subregionConflict = false;
    let targetedBannerConflict = false;
    let value = null, confidence = 0, method = "uncertain", reason = null, fallbackUsed = false, ocrUsed = false;
    let textFallback = null;

    if (primary.value && !bannerConflict) {
      value = primary.value;
      if (banner?.value === primary.value) { confidence = Math.max(primary.confidence, banner.confidence) * 0.5 + Math.min(primary.confidence, banner.confidence) * 0.5; method = "title-and-banner-color"; }
      else { confidence = Math.min(0.9, primary.confidence); method = "title-color"; }
    } else {
      fallbackUsed = true;
      subregions = Array.isArray(input.subregions) ? input.subregions.map(analyzePixels) : splitTitle(input.title).map(analyzePixels);
      coloredSubregions = subregions.filter((item) => item.value);
      uniqueSubregionValues = [...new Set(coloredSubregions.map((item) => item.value))];
      subregionConflict = uniqueSubregionValues.length > 1;
      if (bannerConflict) reason = "title-banner-color-contradiction";
      else if (subregionConflict) reason = "contradictory-title-subregions";
      else if (uniqueSubregionValues.length === 1 && coloredSubregions.length >= 2) {
        const targetedValue = uniqueSubregionValues[0];
        if (banner?.value && banner.value !== targetedValue) { targetedBannerConflict = true; reason = "targeted-title-banner-color-contradiction"; }
        else { value = targetedValue; confidence = Math.min(84, coloredSubregions.reduce((sum, item) => sum + item.confidence, 0) / coloredSubregions.length); method = "targeted-title-subregions"; }
      } else if (primary.value && bannerConflict) reason = "persistent-title-banner-contradiction";
      else reason = primary.reason || "color-cue-ambiguous";

      // A contradictory color cue stays unresolved. OCR is only used for a genuinely ambiguous cue.
      if (!value && !bannerConflict && !subregionConflict && !targetedBannerConflict && typeof input.recognize === "function") {
        ocrUsed = true;
        textFallback = await input.recognize(input.ocrImage || null);
        const textValue = parseTitleText(typeof textFallback === "string" ? textFallback : textFallback?.data?.text ?? textFallback?.text);
        const textConfidence = Number(textFallback?.data?.confidence ?? textFallback?.confidence);
        if (textValue && Number.isFinite(textConfidence) && textConfidence >= 50 && (!primary.value || textValue === primary.value) && (!banner?.value || textValue === banner.value)) {
          value = textValue; confidence = 74; method = "targeted-title-ocr-fallback"; reason = null;
        } else reason = textValue
          ? (!Number.isFinite(textConfidence) ? "ocr-confidence-unavailable" : textConfidence < 50 ? "low-confidence-ocr-fallback" : "ocr-color-contradiction")
          : "color-and-ocr-uncertain";
      }
    }
    if (!value && !reason) reason = bannerConflict || subregionConflict ? "color-contradiction" : "insufficient-color-evidence";
    return {
      value,
      confidence: value ? Number(confidence.toFixed(3)) : null,
      uncertain: !value || confidence < 80,
      source: method,
      diagnostics: {
        zone: input.zone || null,
        bannerZone: input.bannerZone || null,
        title: primary,
        banner,
        subregions,
        decision: value,
        confidence: value ? Number(confidence.toFixed(3)) : null,
        method,
        fallbackUsed,
        ocrUsed,
        reason,
        durationMs: Math.round(now() - started),
        ocrConfidence: textFallback?.data?.confidence ?? textFallback?.confidence ?? null
      }
    };
  }

  function readCanvas(source, rect) {
    if (typeof document === "undefined") throw new Error("Canvas navigateur indisponible pour le moteur Résultat.");
    const safe = normalizeRect(rect, source.width, source.height);
    if (!safe || safe.width < 2 || safe.height < 2) throw new Error("Zone du titre de résultat trop petite ou hors capture.");
    const scale = Math.max(0.01, Math.min(1.5, 1400 / safe.width, 560 / safe.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(2, Math.round(safe.width * scale)); canvas.height = Math.max(2, Math.round(safe.height * scale));
    const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!ctx) throw new Error("Canvas 2D indisponible pour le moteur Résultat.");
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, safe.x, safe.y, safe.width, safe.height, 0, 0, canvas.width, canvas.height);
    return { canvas, rect: safe };
  }

  async function analyze(source, options = {}) {
    const started = now();
    const titleRect = options.titleRect || { x: source.width * 0.30, y: 0, width: source.width * 0.40, height: source.height * 0.12 };
    const titleCrop = readCanvas(source, titleRect);
    let bannerCrop = null;
    try {
      const title = titleCrop.canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, titleCrop.canvas.width, titleCrop.canvas.height);
      const bannerRect = options.bannerRect || { x: titleCrop.rect.x + titleCrop.rect.width * 0.2, y: titleCrop.rect.y, width: titleCrop.rect.width * 0.6, height: Math.max(2, titleCrop.rect.height * 0.22) };
      if (bannerRect.x !== titleCrop.rect.x || bannerRect.width !== titleCrop.rect.width || bannerRect.height !== titleCrop.rect.height) bannerCrop = readCanvas(source, bannerRect);
      const banner = bannerCrop ? bannerCrop.canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, bannerCrop.canvas.width, bannerCrop.canvas.height) : null;
      const recognize = typeof options.recognize === "function" ? async () => options.recognize(titleCrop.canvas) : undefined;
      const result = await decideRegions({ title, banner, zone: titleCrop.rect, bannerZone: bannerCrop?.rect || null, ocrImage: titleCrop.canvas, recognize });
      result.diagnostics.durationMs = Math.round(now() - started);
      return result;
    } finally {
      titleCrop.canvas.width = titleCrop.canvas.height = 1;
      if (bannerCrop) bannerCrop.canvas.width = bannerCrop.canvas.height = 1;
    }
  }

  return { analyze, analyzePixels, analyzeRegions: decideRegions, normalizeRect, parseTitleText };
});
