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

  function boundsFromSegments(segments, offsetX, offsetY, imageWidth, imageHeight, paddingRatio) {
    if (!Array.isArray(segments) || !segments.length) return null;
    const minX = Math.min(...segments.map((b) => b.x));
    const minY = Math.min(...segments.map((b) => b.y));
    const maxX = Math.max(...segments.map((b) => b.x + b.width));
    const maxY = Math.max(...segments.map((b) => b.y + b.height));
    const glyphHeight = segments.map((b) => b.height).sort((a, b) => a - b)[Math.floor(segments.length / 2)];
    const pad = Math.max(2, Math.ceil(glyphHeight * paddingRatio));
    return clampRect({
      x: offsetX + minX - pad, y: offsetY + minY - pad,
      width: maxX - minX + 2 * pad, height: maxY - minY + 2 * pad
    }, imageWidth, imageHeight);
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
    const segmented = reader.segment(band, "trophy", cfg.glyphCount);
    if (segmented.reason || segmented.bounds?.length !== cfg.glyphCount) {
      return { rect: null, bandRect, reason: segmented.reason || "glyph-count-mismatch", segmented };
    }
    const rect = boundsFromSegments(segmented.bounds, bandRect.x, bandRect.y, width, height, cfg.paddingByGlyphHeight);
    if (!rect || rect.width <= 0 || rect.height <= 0) return { rect: null, bandRect, reason: "empty-refined-rect", segmented };
    const preview = cropImageData(imageData, rect);
    return {
      rect, bandRect, preview: preview && { width: preview.width, height: preview.height, data: preview.data },
      method: "proportional-side-band+color-components", geometryConfidence: segmented.confidence ?? null,
      segmented, reason: null
    };
  }

  return { version: "0.1.0-experimental", defaults: DEFAULTS, proportionalBand, cropImageData, locate };
});
