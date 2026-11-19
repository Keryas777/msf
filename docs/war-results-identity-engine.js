/* Local alliance-name OCR and color reconstruction. Numeric image processing is kept separate. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WarResultsIdentityEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const clean = (value) => String(value || "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().normalize("NFC");
  const normalizeName = (value) => clean(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
  const now = () => typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();

  function graphemes(value) {
    const output = [];
    for (const char of Array.from(String(value || ""))) {
      if (/\p{M}/u.test(char) && output.length) output[output.length - 1] += char;
      else output.push(char);
    }
    return output;
  }

  function normalizeRect(rect, width, height) {
    if (!rect || width < 1 || height < 1) return null;
    const x0 = Math.max(0, Math.min(width - 1, Math.floor(Number(rect.x) || 0)));
    const y0 = Math.max(0, Math.min(height - 1, Math.floor(Number(rect.y) || 0)));
    const x1 = Math.max(x0 + 1, Math.min(width, Math.ceil((Number(rect.x) || 0) + (Number(rect.width) || 0))));
    const y1 = Math.max(y0 + 1, Math.min(height, Math.ceil((Number(rect.y) || 0) + (Number(rect.height) || 0))));
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }

  function pixelColor(data, index) {
    const r = data[index], g = data[index + 1], b = data[index + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b), chroma = max - min;
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    if (brightness < 72 || max < 90) return null;
    let hue = 0;
    if (chroma) {
      if (max === r) hue = ((g - b) / chroma) % 6;
      else if (max === g) hue = (b - r) / chroma + 2;
      else hue = (r - g) / chroma + 4;
      hue = (hue * 60 + 360) % 360;
    }
    const saturation = max ? chroma / max : 0;
    if (saturation < 0.18) return { key: "neutral", hue: null, r, g, b, brightness };
    return { key: String(Math.round(hue / 20) % 18), hue, r, g, b, brightness };
  }

  function hexColor(r, g, b) {
    return "#" + [r, g, b].map((part) => Math.max(0, Math.min(255, Math.round(part))).toString(16).padStart(2, "0")).join("");
  }

  function rgbDistance(first, second) {
    if (!first || !second) return Infinity;
    return Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2]);
  }

  function parseHexColor(value) {
    const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(String(value || ""));
    return match ? match.slice(1).map((part) => parseInt(part, 16)) : null;
  }

  function dominantColor(imageData, bounds) {
    const width = Number(imageData?.width) || 0, height = Number(imageData?.height) || 0, data = imageData?.data;
    if (!width || !height || !data) return { color: null, confidence: 0, samples: 0 };
    const x0 = Math.max(0, Math.min(width - 1, Math.floor(bounds.x0)));
    const y0 = Math.max(0, Math.min(height - 1, Math.floor(bounds.y0)));
    const x1 = Math.max(x0 + 1, Math.min(width, Math.ceil(bounds.x1)));
    const y1 = Math.max(y0 + 1, Math.min(height, Math.ceil(bounds.y1)));
    const groups = new Map();
    let samples = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const index = (y * width + x) * 4;
      if ((data[index + 3] ?? 255) < 96) continue;
      const pixel = pixelColor(data, index);
      if (!pixel) continue;
      samples++;
      const group = groups.get(pixel.key) || { count: 0, r: 0, g: 0, b: 0 };
      group.count++; group.r += pixel.r; group.g += pixel.g; group.b += pixel.b;
      groups.set(pixel.key, group);
    }
    const ranked = [...groups.values()].sort((a, b) => b.count - a.count);
    const best = ranked[0];
    if (!best || samples < 2) return { color: null, confidence: 0, samples };
    return { color: hexColor(best.r / best.count, best.g / best.count, best.b / best.count), confidence: best.count / samples, samples };
  }

  function wordBounds(word) {
    const box = word?.bbox || word;
    if (!box) return null;
    const x0 = Number(box.x0 ?? box.left), x1 = Number(box.x1 ?? (Number(box.left) + Number(box.width)));
    const y0 = Number(box.y0 ?? box.top), y1 = Number(box.y1 ?? (Number(box.top) + Number(box.height)));
    return [x0, x1, y0, y1].every(Number.isFinite) && x1 > x0 && y1 > y0 ? { x0, x1, y0, y1 } : null;
  }

  function findInkBounds(imageData) {
    const width = imageData?.width || 0, height = imageData?.height || 0, data = imageData?.data;
    if (!width || !height || !data) return null;
    let left = width, right = 0, top = height, bottom = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (pixelColor(data, (y * width + x) * 4)) { left = Math.min(left, x); right = Math.max(right, x + 1); top = Math.min(top, y); bottom = Math.max(bottom, y + 1); }
    }
    return right > left && bottom > top ? { x0: left, x1: right, y0: top, y1: bottom } : null;
  }

  function colorSegments(text, imageData, words = [], scaleX = 1, scaleY = 1) {
    const value = clean(text), chars = graphemes(value);
    if (!value) return { segments: [], symbols: [], colorCoverage: 0 };
    const validWords = words.map((word) => ({ word, bounds: wordBounds(word) })).filter((item) => clean(item.word.text) && item.bounds).sort((a, b) => a.bounds.x0 - b.bounds.x0);
    const ink = findInkBounds(imageData);
    const tokens = value.match(/\S+/gu) || [];
    const ranges = [];
    if (validWords.length === tokens.length) {
      let textIndex = 0;
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const word = validWords[i];
        while (textIndex < value.length && /\s/u.test(value[textIndex])) textIndex++;
        const tokenGraphemes = graphemes(token);
        const width = (word.bounds.x1 - word.bounds.x0) * scaleX;
        let localOffset = 0;
        tokenGraphemes.forEach((char, index) => {
          const left = word.bounds.x0 * scaleX + width * index / tokenGraphemes.length;
          const right = word.bounds.x0 * scaleX + width * (index + 1) / tokenGraphemes.length;
          ranges.push({ text: char, start: textIndex + localOffset, end: textIndex + localOffset + char.length, bounds: { x0: left, x1: right, y0: word.bounds.y0 * scaleY, y1: word.bounds.y1 * scaleY }, confidence: Number(word.word.confidence ?? word.word.conf ?? 0) });
          localOffset += char.length;
        });
        textIndex += token.length;
      }
    } else if (ink) {
      const width = ink.x1 - ink.x0;
      let textIndex = 0;
      chars.forEach((char, index) => {
        ranges.push({ text: char, start: textIndex, end: textIndex + char.length, bounds: { x0: ink.x0 + width * index / chars.length, x1: ink.x0 + width * (index + 1) / chars.length, y0: ink.y0, y1: ink.y1 }, confidence: null });
        textIndex += char.length;
      });
    }
    let coverage = 0;
    const items = ranges.map((item) => {
      const color = dominantColor(imageData, item.bounds);
      if (color.color) coverage++;
      return { ...item, color: color.color, colorConfidence: color.confidence, colorSamples: color.samples };
    });
    // Preserve spaces even if OCR word boxes do not include them.
    if (items.length && items.map((item) => item.text).join("") !== value) {
      let cursor = 0;
      for (const item of [...items]) {
        const at = value.indexOf(item.text, cursor);
        if (at > cursor) items.splice(items.indexOf(item), 0, { text: value.slice(cursor, at), start: cursor, end: at, color: items[items.indexOf(item) - 1]?.color || item.color, colorConfidence: item.colorConfidence });
        cursor = Math.max(cursor, at) + item.text.length;
      }
      if (cursor < value.length) items.push({ text: value.slice(cursor), start: cursor, end: value.length, color: items[items.length - 1]?.color || null, colorConfidence: 0 });
    }
    const segments = [];
    for (const item of items) {
      const prior = segments[segments.length - 1];
      const rgb = parseHexColor(item.color);
      const priorRgb = prior && parseHexColor(prior.color);
      if (prior && ((!rgb && !priorRgb) || (rgb && priorRgb && rgbDistance(prior.anchorRgb, rgb) <= 20))) {
        prior.text += item.text; prior.end = item.end; prior.confidence = Math.min(prior.confidence, Number(item.confidence) || 0); prior.colorConfidence = Math.min(prior.colorConfidence, Number(item.colorConfidence) || 0);
        if (rgb) {
          prior.colorSamples.push(rgb);
          const mean = prior.colorSamples.reduce((sum, sample) => [sum[0] + sample[0], sum[1] + sample[1], sum[2] + sample[2]], [0, 0, 0]).map((part) => part / prior.colorSamples.length);
          prior.color = hexColor(...mean);
        }
      } else segments.push({ text: item.text, color: item.color, start: item.start, end: item.end, confidence: Number(item.confidence) || 0, colorConfidence: Number(item.colorConfidence) || 0, uncertain: !item.color, anchorRgb: rgb, colorSamples: rgb ? [rgb] : [] });
    }
    for (const segment of segments) { delete segment.anchorRgb; delete segment.colorSamples; }
    const symbols = items.flatMap((item) => /\p{S}/u.test(item.text) ? [{ text: item.text, index: item.start, recognized: true, confidence: Number.isFinite(item.confidence) ? item.confidence : null }] : []);
    return { segments, symbols, colorCoverage: items.length ? coverage / items.length : 0 };
  }

  function usableText(result) { return clean(result?.data?.text ?? result?.text); }
  function confidenceOf(result) {
    const value = Number(result?.data?.confidence ?? result?.confidence);
    return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
  }
  function identityText(value, side) {
    let text = clean(value);
    if (side === "local") text = text.replace(/^LoSP(?:\s*[:·|\-]\s*|\s+)/iu, "").trim();
    return text;
  }
  function normalizedRead(value) { return clean(value).normalize("NFKC").toLocaleLowerCase(); }

  function arbitrateReads(primary, fallback, side) {
    const firstText = identityText(usableText(primary), side), secondText = identityText(usableText(fallback), side);
    const firstConfidence = confidenceOf(primary), secondConfidence = confidenceOf(fallback);
    const firstGood = Boolean(firstText), secondGood = Boolean(secondText);
    const conflict = firstGood && secondGood && normalizedRead(firstText) !== normalizedRead(secondText);
    // A clear confidence margin can resolve an OCR disagreement without discarding
    // the alternatives. Keep the result uncertain so the user can still review it.
    const margin = 30;
    const text = conflict
      ? firstConfidence != null && secondConfidence != null && Math.abs(firstConfidence - secondConfidence) >= margin
        ? (firstConfidence ?? 0) > (secondConfidence ?? 0) ? firstText : secondText
        : ""
      : firstGood && (!secondGood || (firstConfidence ?? 0) >= (secondConfidence ?? 0)) ? firstText : secondText;
    const confidence = text ? (text === firstText ? firstConfidence : secondConfidence) : null;
    return { text, confidence, conflict, alternatives: conflict ? [...new Set([firstText, secondText])] : [], chosenResult: text ? (text === firstText ? primary : fallback || primary) : null,
      uncertain: !text || conflict || confidence == null || confidence < 55 };
  }

  function makeCanvas(source, rect, maxWidth, maxHeight, multiplier) {
    if (typeof document === "undefined") throw new Error("Canvas navigateur indisponible pour le moteur Identité.");
    const safe = normalizeRect(rect, source.width, source.height);
    if (!safe || safe.width < 2 || safe.height < 2) throw new Error("Zone d’alliance trop petite ou hors capture.");
    const scale = Math.max(0.01, Math.min(multiplier, maxWidth / safe.width, maxHeight / safe.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(2, Math.round(safe.width * scale)); canvas.height = Math.max(2, Math.round(safe.height * scale));
    const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!ctx) throw new Error("Canvas 2D indisponible pour le moteur Identité.");
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, safe.x, safe.y, safe.width, safe.height, 0, 0, canvas.width, canvas.height);
    return { canvas, rect: safe, scale };
  }

  async function analyzeRegion(source, rect, recognize, options = {}) {
    const started = now();
    if (typeof recognize !== "function") throw new Error("Le moteur Identité attend un lecteur OCR local.");
    const colorCrop = makeCanvas(source, rect, 1400, 520, 1);
    const colorData = colorCrop.canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, colorCrop.canvas.width, colorCrop.canvas.height);
    const ocrCrop = makeCanvas(source, rect, 4096, 1024, 2);
    let primary, fallback = null;
    const calls = [];
    try {
      primary = await recognize(ocrCrop.canvas, 11);
      calls.push({ psm: 11, confidence: confidenceOf(primary) });
      const firstText = identityText(usableText(primary), options.side);
      if ((!firstText || (confidenceOf(primary) != null && confidenceOf(primary) < 35))) {
        fallback = await recognize(ocrCrop.canvas, 7);
        calls.push({ psm: 7, confidence: confidenceOf(fallback) });
      }
      const arbitration = arbitrateReads(primary, fallback, options.side);
      const chosen = arbitration.text, chosenResult = arbitration.chosenResult, chosenConfidence = arbitration.confidence;
      const words = (chosenResult?.data?.words || []).filter((word) => !(options.side === "local" && /^LoSP$/iu.test(clean(word.text))));
      const colored = colorSegments(chosen, colorData, words, colorData.width / ocrCrop.canvas.width, colorData.height / ocrCrop.canvas.height);
      const uncertainty = [];
      if (arbitration.conflict) uncertainty.push({ reason: "ocr-read-disagreement", alternatives: arbitration.alternatives });
      if (!chosen) uncertainty.push({ reason: arbitration.conflict ? "conflicting-reads" : "no-text-read" });
      if (chosenConfidence != null && chosenConfidence < 55) uncertainty.push({ reason: "low-text-confidence", confidence: chosenConfidence });
      if (colored.colorCoverage < 0.35) uncertainty.push({ reason: "insufficient-color-pixels", coverage: Number(colored.colorCoverage.toFixed(3)) });
      const uncertainSymbols = colored.symbols.filter((symbol) => symbol.confidence == null || symbol.confidence < 55);
      if (uncertainSymbols.length) uncertainty.push({ reason: "low-symbol-confidence", symbols: uncertainSymbols });
      const richName = chosen ? { schemaVersion: 1, segments: colored.segments.map((segment) => ({ text: segment.text, color: segment.color })) } : null;
      return {
        text: chosen,
        normalizedName: normalizeName(chosen),
        confidence: chosenConfidence,
        uncertain: arbitration.uncertain || uncertainSymbols.length > 0,
        colorUncertain: colored.colorCoverage < 0.35,
        alternatives: arbitration.alternatives,
        symbols: chosen ? colored.symbols : [],
        segments: colored.segments,
        richName,
        uncertainty,
        diagnostics: {
          sourceRect: colorCrop.rect,
          colorReadFrom: "original-capture-rgb",
          ocrScale: ocrCrop.scale,
          colorScale: colorCrop.scale,
          ocrDimensions: { width: ocrCrop.canvas.width, height: ocrCrop.canvas.height },
          colorDimensions: { width: colorCrop.canvas.width, height: colorCrop.canvas.height },
          colorCoverage: Number(colored.colorCoverage.toFixed(3)),
          calls,
          durationMs: Math.round(now() - started),
          text: chosen,
          normalizedName: normalizeName(chosen),
          confidence: chosenConfidence,
          colorUncertain: colored.colorCoverage < 0.35,
          symbols: colored.symbols,
          segments: colored.segments.map(({ text, color, colorConfidence, uncertain: segmentUncertain }) => ({ text, color, colorConfidence, uncertain: segmentUncertain })),
          uncertainty
        },
        sourcePreview: colorCrop.canvas.toDataURL("image/jpeg", 0.86),
        preview: ocrCrop.canvas.toDataURL("image/jpeg", 0.86)
      };
    } finally {
      colorCrop.canvas.width = colorCrop.canvas.height = 1;
      ocrCrop.canvas.width = ocrCrop.canvas.height = 1;
    }
  }

  return { analyzeRegion, arbitrateReads, colorSegments, dominantColor, normalizeName, normalizeRect, graphemes };
});
