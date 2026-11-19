/* Experimental trophy ROI refinement for local MSF war-result images.
 * This module is intentionally not loaded by War Results Vision production.
 * It uses proportional side search bands and the existing color component
 * segmenter; it never reads labels or expected values.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WarResultsTrophyLocatorExperiment = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULTS = Object.freeze({
    leftBand: [0.08, 0.46],
    rightBand: [0.54, 0.92],
    glyphCount: 4,
    paddingByGlyphHeight: 0.18,
    minimumPaddingPixels: 2,
    minBandWidth: 24,
    minBandHeight: 12
  });

  function clampRect(rect, width, height) {
    const x0 = Math.max(0, Math.min(width, Math.floor(rect.x)));
    const y0 = Math.max(0, Math.min(height, Math.floor(rect.y)));
    const x1 = Math.max(x0, Math.min(width, Math.ceil(rect.x + rect.width)));
    const y1 = Math.max(y0, Math.min(height, Math.ceil(rect.y + rect.height)));
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }

  function proportionalBand(width, height, verticalRect, side, options = {}) {
    const cfg = { ...DEFAULTS, ...options };
    const fractions = side === "left" ? cfg.leftBand : side === "right" ? cfg.rightBand : null;
    if (!fractions || !Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return null;
    if (!verticalRect || ![verticalRect.x, verticalRect.y, verticalRect.width, verticalRect.height].every(Number.isFinite) || verticalRect.height <= 0) return null;
    const band = clampRect({
      x: width * fractions[0], y: verticalRect.y,
      width: width * (fractions[1] - fractions[0]), height: verticalRect.height
    }, width, height);
    return band.width >= cfg.minBandWidth && band.height >= cfg.minBandHeight ? band : null;
  }

  function cropImageData(source, rect) {
    const { width, height, data } = source || {};
    if (!width || !height || !data || data.length < width * height * 4) return null;
    const safe = clampRect(rect, width, height);
    if (!safe.width || !safe.height) return null;
    const out = new Uint8ClampedArray(safe.width * safe.height * 4);
    for (let y = 0; y < safe.height; y++) {
      const from = ((safe.y + y) * width + safe.x) * 4;
      out.set(data.subarray(from, from + safe.width * 4), y * safe.width * 4);
    }
    return { width: safe.width, height: safe.height, data: out, rect: safe };
  }

  function translateBoundsToSource(bounds, origin) {
    if (!Array.isArray(bounds) || !origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.y)) return [];
    return bounds.filter((box) => box && [box.x, box.y, box.width, box.height].every(Number.isFinite))
      .map((box) => ({ x: origin.x + box.x, y: origin.y + box.y, width: box.width, height: box.height }));
  }

  function boundsFromSegments(segments, offsetX, offsetY, imageWidth, imageHeight, paddingRatio, minimumPaddingPixels = 2) {
    if (!Array.isArray(segments) || !segments.length) return null;
    const minX = Math.min(...segments.map((b) => b.x));
    const minY = Math.min(...segments.map((b) => b.y));
    const maxX = Math.max(...segments.map((b) => b.x + b.width));
    const maxY = Math.max(...segments.map((b) => b.y + b.height));
    const glyphHeight = segments.map((b) => b.height).sort((a, b) => a - b)[Math.floor(segments.length / 2)];
    const pad = Math.max(minimumPaddingPixels, Math.ceil(glyphHeight * paddingRatio));
    return clampRect({
      x: offsetX + minX - pad, y: offsetY + minY - pad,
      width: maxX - minX + 2 * pad, height: maxY - minY + 2 * pad
    }, imageWidth, imageHeight);
  }

  function locateBand(bandImageData, bandRect, imageWidth, imageHeight, reader, options = {}) {
    const cfg = { ...DEFAULTS, ...options };
    if (!reader || typeof reader.segment !== "function") return { rect: null, reason: "segmenter-unavailable" };
    if (!bandImageData?.width || !bandImageData?.height || !bandRect || !Number.isFinite(bandRect.x) || !Number.isFinite(bandRect.y)) return { rect: null, reason: "invalid-search-band" };
    const segmented = reader.segment(bandImageData, "trophy", cfg.glyphCount);
    if (segmented.reason || segmented.bounds?.length !== cfg.glyphCount) {
      return { rect: null, bandRect, reason: segmented.reason || "glyph-count-mismatch", segmented };
    }
    const rect = boundsFromSegments(segmented.bounds, bandRect.x, bandRect.y, imageWidth, imageHeight, cfg.paddingByGlyphHeight, cfg.minimumPaddingPixels);
    if (!rect || rect.width <= 0 || rect.height <= 0) return { rect: null, bandRect, reason: "empty-refined-rect", segmented };
    return { rect, bandRect, method: "proportional-side-band+color-components", geometryConfidence: segmented.confidence ?? null, segmented, reason: null };
  }

  // Search nearby vertical strips only when the original band contains too few
  // components. The strip height scales with the supplied row, while offsets are
  // relative to that row; this recovers layouts whose existing OCR rectangle is
  // vertically displaced without changing already-segmentable fields.
  function verticalSearchBands(width, height, verticalRect, side, options = {}) {
    const cfg = { ...DEFAULTS, ...options };
    if (!verticalRect || !Number.isFinite(verticalRect.y) || !Number.isFinite(verticalRect.height) || verticalRect.height <= 0) return [];
    const searchHeight = Math.min(height, Math.max(cfg.minBandHeight, Math.round(verticalRect.height * 0.8)));
    if (searchHeight < cfg.minBandHeight || height < searchHeight) return [];
    const bands = [], seen = new Set();
    for (const offset of [-1, -0.375, -0.5, -0.625, -0.75, -0.875, -0.25, -0.125, 0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]) {
      const y = Math.max(0, Math.min(height - searchHeight, Math.round(verticalRect.y + offset * verticalRect.height)));
      if (seen.has(y)) continue;
      seen.add(y);
      const bandRect = proportionalBand(width, height, { ...verticalRect, y, height: searchHeight }, side, cfg);
      if (bandRect) bands.push({ bandRect, offset, searchHeight });
    }
    return bands;
  }

  /**
   * Use nearby proportional bands only after the primary segmentation finds too
   * few components. Edge-touching and ambiguous successful runs keep their
   * original result so a retry cannot silently replace a crop that already has
   * four glyph components.
   */
  function locateWithVerticalRecovery(readBandImageData, imageWidth, imageHeight, verticalRect, side, reader, options = {}) {
    if (typeof readBandImageData !== "function") return { rect: null, reason: "band-reader-unavailable", recovery: null };
    const bandRect = proportionalBand(imageWidth, imageHeight, verticalRect, side, options);
    if (!bandRect) return { rect: null, reason: "invalid-search-band", recovery: null };
    const primary = locateBand(readBandImageData(bandRect), bandRect, imageWidth, imageHeight, reader, options);
    const requestedPadding = Number(options.paddingByGlyphHeight ?? DEFAULTS.paddingByGlyphHeight);
    const edgeSafePadding = Number(options.edgeSafePaddingByGlyphHeight);
    if (!primary.reason && primary.segmented?.warnings?.includes("glyph-touches-crop-edge") &&
        Number.isFinite(edgeSafePadding) && edgeSafePadding > requestedPadding) {
      const safe = locateBand(readBandImageData(bandRect), bandRect, imageWidth, imageHeight, reader, {
        ...options, paddingByGlyphHeight: edgeSafePadding
      });
      if (!safe.reason) return {
        ...safe,
        recovery: { method: "edge-safe-padding", requestedPaddingByGlyphHeight: requestedPadding, appliedPaddingByGlyphHeight: edgeSafePadding },
        appliedMarginPercent: edgeSafePadding * 100
      };
    }
    if (primary.reason !== "too-few-components") return { ...primary, recovery: null };
    for (const candidate of verticalSearchBands(imageWidth, imageHeight, verticalRect, side, options)) {
      const recovered = locateBand(readBandImageData(candidate.bandRect), candidate.bandRect, imageWidth, imageHeight, reader, options);
      if (!recovered.reason && !recovered.segmented?.warnings?.length) {
        return { ...recovered, recovery: { method: "proportional-vertical-search", offset: candidate.offset, initialReason: primary.reason } };
      }
    }
    return { ...primary, recovery: null };
  }

  /**
   * Refine one trophy crop from the original-color full-image ImageData.
   * verticalRect is supplied by the existing layout localizer in original-image
   * coordinates. x is deliberately ignored: it is not a trustworthy anchor on
   * compact layouts. The segmenter, not a value label, determines glyph bounds.
   */
  function locate(imageData, side, verticalRect, reader, options = {}) {
    const { width, height } = imageData || {};
    const cfg = { ...DEFAULTS, ...options };
    if (!reader || typeof reader.segment !== "function") return { rect: null, reason: "segmenter-unavailable" };
    const bandRect = proportionalBand(width, height, verticalRect, side, cfg);
    if (!bandRect) return { rect: null, reason: "invalid-search-band" };
    const band = cropImageData(imageData, bandRect);
    const refined = locateBand(band, bandRect, width, height, reader, cfg);
    if (refined.reason) return refined;
    const { rect, segmented } = refined;
    const preview = cropImageData(imageData, rect);
    return {
      rect, bandRect, preview: preview && { width: preview.width, height: preview.height, data: preview.data },
      method: refined.method, geometryConfidence: refined.geometryConfidence, segmented, reason: null
    };
  }

  return { version: "0.5.0-experimental", defaults: DEFAULTS, proportionalBand, cropImageData, translateBoundsToSource, locateBand, verticalSearchBands, locateWithVerticalRecovery, locate };
});

