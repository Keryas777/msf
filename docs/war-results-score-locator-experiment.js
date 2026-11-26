/* Experimental score-only crop locator. It does not read or classify digits. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WarResultsScoreLocatorExperiment = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "0.1.0-score-localization";
  const DEFAULTS = Object.freeze({ searchXFraction: .075, searchYFraction: .055, minimumChroma: 16,
    minimumLuma: 76, minimumArea: 3, maximumGapByHeight: 1.65, minimumGroupHeightRatio: .08,
    maximumGroupHeightRatio: 2.1, cropPaddingByHeight: .12, minimumConfidence: .52 });

  function clampRect(rect, width, height) {
    if (!rect) return null;
    const x0 = Math.max(0, Math.floor(Number(rect.x))), y0 = Math.max(0, Math.floor(Number(rect.y)));
    const x1 = Math.min(width, Math.ceil(Number(rect.x) + Number(rect.width)));
    const y1 = Math.min(height, Math.ceil(Number(rect.y) + Number(rect.height)));
    return [x0, y0, x1, y1].every(Number.isFinite) && x1 > x0 && y1 > y0
      ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
  }

  function isYellowPixel(r, g, b, options = DEFAULTS) {
    const luma = .2126 * r + .7152 * g + .0722 * b;
    const chroma = Math.min(r, g) - b;
    return luma >= options.minimumLuma && chroma >= Math.max(options.minimumChroma, Math.min(r, g) * .26) &&
      r >= g * .78 && g >= r * .48 && Math.max(r, g) - b >= options.minimumChroma;
  }

  function componentsInRegion(imageData, rect, options = {}) {
    const { width, height, data } = imageData || {};
    if (!Number.isInteger(width) || !Number.isInteger(height) || !data || data.length < width * height * 4)
      return { components: [], reason: "invalid-image-data" };
    const region = clampRect(rect, width, height);
    if (!region) return { components: [], reason: "invalid-search-region" };
    const rw = region.width, rh = region.height, mask = new Uint8Array(rw * rh), visited = new Uint8Array(rw * rh), stack = [];
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
      const src = ((region.y + y) * width + region.x + x) * 4;
      mask[y * rw + x] = isYellowPixel(data[src], data[src + 1], data[src + 2], options) ? 1 : 0;
    }
    const components = [];
    for (let start = 0; start < mask.length; start++) {
      if (!mask[start] || visited[start]) continue;
      let minX = rw, minY = rh, maxX = -1, maxY = -1, area = 0;
      stack.push(start); visited[start] = 1;
      while (stack.length) {
        const at = stack.pop(), x = at % rw, y = Math.floor(at / rw); area++;
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= rw || ny < 0 || ny >= rh) continue;
          const next = ny * rw + nx;
          if (mask[next] && !visited[next]) { visited[next] = 1; stack.push(next); }
        }
      }
      if (area < options.minimumArea) continue;
      components.push({ x: region.x + minX, y: region.y + minY, width: maxX - minX + 1,
        height: maxY - minY + 1, area, touchesSearchEdge: minX === 0 || minY === 0 || maxX === rw - 1 || maxY === rh - 1 });
    }
    return { components, mask, region, reason: components.length ? null : "no-yellow-components" };
  }

  function median(values) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  function groupComponents(components, region) {
    const sorted = [...components].sort((a, b) => a.y - b.y || a.x - b.x), rows = [];
    for (const item of sorted) {
      const center = item.y + item.height / 2;
      let row = rows.find((candidate) => Math.abs(candidate.center - center) <= Math.max(candidate.height, item.height) * .36);
      if (!row) { row = { center, height: item.height, components: [] }; rows.push(row); }
      row.components.push(item);
      row.center = row.components.reduce((sum, c) => sum + c.y + c.height / 2, 0) / row.components.length;
      row.height = median(row.components.map((c) => c.height));
    }
    const candidates = [];
    for (const row of rows) {
      const run = [];
      for (const item of row.components.sort((a, b) => a.x - b.x)) {
        const prev = run.at(-1), gap = prev ? item.x - (prev.x + prev.width) : 0;
        if (prev && gap > Math.max(prev.height, item.height) * DEFAULTS.maximumGapByHeight) {
          if (run.length) candidates.push(makeCandidate(run, row, region));
          run.length = 0;
        }
        run.push(item);
      }
      if (run.length) candidates.push(makeCandidate(run, row, region));
    }
    return candidates.filter(Boolean).sort((a, b) => b.rank - a.rank);
  }

  function makeCandidate(run, row, region) {
    const heights = run.map((c) => c.height), h = median(heights);
    if (!h || h < region.height * DEFAULTS.minimumGroupHeightRatio || h > region.height * DEFAULTS.maximumGroupHeightRatio) return null;
    const baseline = run.map((c) => c.y + c.height), baselineSpread = Math.max(...baseline) - Math.min(...baseline);
    if (baselineSpread > h * .48) return null;
    const gaps = run.slice(1).map((c, i) => c.x - (run[i].x + run[i].width));
    const maxGap = Math.max(0, ...gaps), width = run.at(-1).x + run.at(-1).width - run[0].x;
    if (width < h * .24 || width > run.length * h * 1.85) return null;
    const heightVariation = heights.reduce((sum, item) => sum + Math.abs(item - h) / h, 0) / heights.length;
    const density = run.reduce((sum, c) => sum + c.area / (c.width * c.height), 0) / run.length;
    const confidence = Math.max(0, Math.min(1, .9 - heightVariation * .34 - baselineSpread / h * .38 - Math.max(0, maxGap / h - .8) * .13));
    return { rect: { x: run[0].x, y: Math.min(...run.map((c) => c.y)), width,
      height: Math.max(...run.map((c) => c.y + c.height)) - Math.min(...run.map((c) => c.y)) },
      glyphs: run.map(({ x, y, width: w, height: hh, area, touchesSearchEdge }) => ({ x, y, width: w, height: hh, area, touchesSearchEdge })),
      count: run.length, glyphHeight: h, baselineSpread, heightVariation, maxGap, density,
      touchesSearchEdge: run.some((c) => c.touchesSearchEdge), confidence,
      rank: confidence + Math.min(.08, run.length * .01) + Math.min(.06, density * .06) };
  }

  function locate(imageData, field, proportionalRect, options = {}) {
    const started = typeof performance !== "undefined" ? performance.now() : Date.now();
    const { width, height } = imageData || {}, side = field === "localScore" ? "left" : field === "opponentScore" ? "right" : null;
    const warnings = [], diagnostics = [];
    if (!side || !width || !height || !proportionalRect) return { field, side, method: VERSION, localized: false,
      reason: "invalid-score-field-or-proportional-zone", warnings: ["initial-region-insufficient"], elapsedMs: 0 };
    const half = Math.floor(width / 2), expansionX = Math.round(width * (options.searchXFraction ?? DEFAULTS.searchXFraction));
    const expansionY = Math.round(height * (options.searchYFraction ?? DEFAULTS.searchYFraction));
    const x0 = side === "left" ? Math.max(0, Math.floor(proportionalRect.x - expansionX)) : Math.max(half, Math.floor(proportionalRect.x - expansionX));
    const x1 = side === "left" ? Math.min(half, Math.ceil(proportionalRect.x + proportionalRect.width + expansionX)) : Math.min(width, Math.ceil(proportionalRect.x + proportionalRect.width + expansionX));
    const searchRect = clampRect({ x: x0, y: proportionalRect.y - expansionY,
      width: x1 - x0, height: proportionalRect.height + expansionY * 2 }, width, height);
    const found = componentsInRegion(imageData, searchRect, { ...DEFAULTS, ...options });
    const candidates = groupComponents(found.components, found.region || searchRect);
    if (found.reason) warnings.push(found.reason);
    if (!candidates.length && !found.reason) warnings.push("incoherent-component-dimensions");
    if (candidates.length > 1 && candidates[0].rank - candidates[1].rank < .045) warnings.push("multiple-plausible-groups");
    let selected = candidates[0] || null;
    if (candidates.length > 1 && candidates[0].rank - candidates[1].rank < .045) selected = null;
    const pad = selected ? Math.max(2, Math.round(selected.glyphHeight * (options.cropPaddingByHeight ?? DEFAULTS.cropPaddingByHeight))) : 0;
    let rect = selected && clampRect({ x: selected.rect.x - pad, y: selected.rect.y - pad,
      width: selected.rect.width + pad * 2, height: selected.rect.height + pad * 2 }, width, height);
    const extensions = [];
    if (selected?.touchesSearchEdge || (!selected && candidates.length === 0)) {
      warnings.push(selected ? "glyph-touches-search-region-edge" : "initial-region-insufficient");
      const retryX = Math.round(width * .12), retryY = Math.round(height * .1);
      const expanded = clampRect({ x: side === "left" ? Math.max(0, searchRect.x - retryX) : Math.max(half, searchRect.x - retryX),
        y: Math.max(0, searchRect.y - retryY),
        width: Math.min(side === "left" ? half : width, searchRect.x + searchRect.width + retryX) - Math.max(side === "left" ? 0 : half, searchRect.x - retryX),
        height: Math.min(height, searchRect.y + searchRect.height + retryY) - Math.max(0, searchRect.y - retryY) }, width, height);
      if (expanded && (expanded.x !== searchRect.x || expanded.y !== searchRect.y || expanded.width !== searchRect.width || expanded.height !== searchRect.height)) {
        const retry = componentsInRegion(imageData, expanded, { ...DEFAULTS, ...options });
        const retryCandidates = groupComponents(retry.components, retry.region || expanded);
        if (retryCandidates.length > 1 && retryCandidates[0].rank - retryCandidates[1].rank < .045) warnings.push("multiple-plausible-groups");
        const retryMatch = selected ? retryCandidates.find((candidate) => candidate.glyphs.some((glyph) =>
          selected.glyphs.some((old) => Math.abs(glyph.x - old.x) <= Math.max(old.height * .7, old.width) && Math.abs(glyph.y - old.y) <= Math.max(2, old.height * .25))))
          : retryCandidates.length === 1 || (retryCandidates.length > 1 && retryCandidates[0].rank - retryCandidates[1].rank >= .045) ? retryCandidates[0] : null;
        extensions.push({ reason: "glyph-touch-or-search-edge", from: searchRect, to: expanded, recovered: Boolean(retryMatch) });
        if (retryMatch) {
          selected = retryMatch;
          const retryPad = Math.max(2, Math.round(selected.glyphHeight * (options.cropPaddingByHeight ?? DEFAULTS.cropPaddingByHeight)));
          rect = clampRect({ x: selected.rect.x - retryPad, y: selected.rect.y - retryPad,
            width: selected.rect.width + retryPad * 2, height: selected.rect.height + retryPad * 2 }, width, height);
          diagnostics.push("recovered-from-original-capture");
          warnings.splice(warnings.indexOf("glyph-touches-search-region-edge"), 1);
          warnings.splice(warnings.indexOf("initial-region-insufficient"), 1);
          warnings.splice(warnings.indexOf("incoherent-component-dimensions"), 1);
        } else warnings.push("edge-extension-did-not-resolve");
      }
    }
    if (selected && selected.confidence < (options.minimumConfidence ?? DEFAULTS.minimumConfidence)) warnings.push("low-geometry-confidence");
    if (selected && selected.glyphs.some((glyph) => glyph.x <= rect.x || glyph.x + glyph.width >= rect.x + rect.width || glyph.y <= rect.y || glyph.y + glyph.height >= rect.y + rect.height)) warnings.push("glyph-touches-final-crop-edge");
    const elapsedMs = Math.max(0, Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - started));
    return { field, side, method: VERSION, parameters: { ...DEFAULTS, ...options }, initialRegion: proportionalRect,
      searchRegion: searchRect, finalRect: rect, cropDimensions: rect && { width: rect.width, height: rect.height },
      componentCount: found.components.length, glyphCount: selected?.count || 0, glyphs: selected?.glyphs || [],
      selected, candidates: candidates.map((candidate, index) => ({ ...candidate, selected: Boolean(selected && candidate === candidates[0]), rank: candidate.rank, index })),
      extensions, diagnostics, warnings: [...new Set(warnings)], localized: Boolean(selected && rect &&
        !warnings.some((warning) => ["multiple-plausible-groups", "low-geometry-confidence", "glyph-touches-final-crop-edge", "edge-extension-did-not-resolve"].includes(warning))),
      reason: selected ? null : warnings[0] || "no-reliable-numeric-group", elapsedMs };
  }

  function compare(imageData, fields, proportionalRects, options = {}) {
    const requested = [...new Set(Array.isArray(fields) ? fields : [])].filter((field) => field === "localScore" || field === "opponentScore");
    const results = Object.fromEntries(requested.map((field) => [field, locate(imageData, field, proportionalRects?.[field], options)]));
    return { schemaVersion: "1.0.0", method: VERSION, dimensions: { width: imageData?.width || 0, height: imageData?.height || 0 }, fields: results };
  }
  return { version: VERSION, defaults: DEFAULTS, isYellowPixel, componentsInRegion, groupComponents, locate, compare };
});
