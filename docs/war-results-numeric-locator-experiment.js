/* Local experimental locator for numeric fields in MSF war-result screenshots.
 * It finds colored glyph groups in source pixels instead of deriving their
 * vertical position from the full-image aspect ratio. No OCR or network calls.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WarResultsNumericLocatorExperiment = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const EXPECTED = Object.freeze({ localScore: 6, opponentScore: 6, localTrophies: 4, opponentTrophies: 4 });

  function isGlyphPixel(r, g, b, category) {
    if (category === "score") return r > 125 && g > 105 && b < 190 && r > b * 1.12 && g > b * .95;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    return max > 145 && min > 105 && max - min < 115 && b >= r * .76 && r >= g * .62;
  }

  function findComponents(image, category) {
    const { width, height, data } = image || {};
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || !data || data.length < width * height * 4) return { components: [], reason: "invalid-image-data" };
    const mask = new Uint8Array(width * height), visited = new Uint8Array(width * height), stack = [];
    for (let p = 0, rgba = 0; p < mask.length; p++, rgba += 4) mask[p] = isGlyphPixel(data[rgba], data[rgba + 1], data[rgba + 2], category) ? 1 : 0;
    const components = [], minArea = Math.max(5, Math.round(width * height * .0000025));
    for (let start = 0; start < mask.length; start++) {
      if (!mask[start] || visited[start]) continue;
      let minX = width, minY = height, maxX = -1, maxY = -1, area = 0;
      stack.push(start); visited[start] = 1;
      while (stack.length) {
        const at = stack.pop(), x = at % width, y = (at - x) / width;
        area++; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const next = ny * width + nx;
          if (mask[next] && !visited[next]) { visited[next] = 1; stack.push(next); }
        }
      }
      const box = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, area };
      const minHeight = Math.max(4, height * .0045);
      if (area >= minArea && box.height >= minHeight && box.height <= height * .12 && box.width <= box.height * 1.8) components.push(box);
    }
    return { components, reason: components.length ? null : "no-colored-glyph-components" };
  }

  function makeRows(components) {
    const rows = [];
    for (const component of [...components].sort((a, b) => a.y + a.height - b.y - b.height || a.x - b.x)) {
      const baseline = component.y + component.height;
      let row = rows.find((candidate) => Math.abs(candidate.baseline - baseline) <= Math.max(candidate.height, component.height) * .48);
      if (!row) { row = { baseline, height: component.height, components: [] }; rows.push(row); }
      row.components.push(component);
      row.baseline = row.components.reduce((sum, item) => sum + item.y + item.height, 0) / row.components.length;
      row.height = row.components.reduce((sum, item) => sum + item.height, 0) / row.components.length;
    }
    return rows.map((row) => ({ ...row, components: row.components.sort((a, b) => a.x - b.x) }));
  }

  function runsForSide(rows, count, side, imageWidth) {
    const candidates = [];
    for (const row of rows) {
      const clusters = [];
      for (const component of row.components) {
        const current = clusters.at(-1), gap = current ? component.x - (current.at(-1).x + current.at(-1).width) : 0;
        if (!current || gap > Math.max(current.at(-1).height, component.height) * 1.4) clusters.push([]);
        clusters.at(-1).push(component);
      }
      // The two alliance sides are identified by the large visual gap between
      // glyph runs, not by treating the screenshot midpoint as a panel anchor.
      const cluster = clusters.length >= 2 ? (side === "left" ? clusters[0] : clusters.at(-1))
        : clusters.length === 1 && ((clusters[0][0].x + clusters[0][0].width / 2 < imageWidth / 2) === (side === "left")) ? clusters[0] : null;
      if (!cluster) continue;
      for (let start = 0; start + count <= cluster.length; start++) {
        const run = cluster.slice(start, start + count), heights = run.map((item) => item.height).sort((a, b) => a - b);
        const medianHeight = heights[Math.floor(heights.length / 2)];
        const gaps = run.slice(1).map((item, index) => item.x - (run[index].x + run[index].width));
        if (run.some((item) => item.height < medianHeight * .55 || item.height > medianHeight * 1.6) || gaps.some((gap) => gap > medianHeight * 1.4 || gap < -medianHeight * .2)) continue;
        const baselineSpread = Math.max(...run.map((item) => item.y + item.height)) - Math.min(...run.map((item) => item.y + item.height));
        if (baselineSpread > medianHeight * .5) continue;
        const x0 = run[0].x, x1 = run.at(-1).x + run.at(-1).width;
        const y0 = Math.min(...run.map((item) => item.y)), y1 = Math.max(...run.map((item) => item.y + item.height));
        const width = x1 - x0;
        const widthRatio = width / (count * medianHeight);
        if (widthRatio < .28 || widthRatio > 1.65) continue;
        const heightVariation = run.reduce((sum, item) => sum + Math.abs(item.height - medianHeight) / medianHeight, 0) / count;
        const gapVariation = gaps.length > 1 ? gaps.reduce((sum, gap) => sum + Math.abs(gap - gaps.reduce((a, b) => a + b, 0) / gaps.length) / medianHeight, 0) / gaps.length : 0;
        candidates.push({ rect: { x: x0, y: y0, width, height: y1 - y0 }, anchors: run, baseline: row.baseline, glyphHeight: medianHeight,
          confidence: Math.max(0, Math.min(1, 1 - heightVariation * .5 - gapVariation * .25 - baselineSpread / medianHeight * .25)) });
      }
    }
    return candidates;
  }

  function choosePair(left, right) {
    if (!left.length || !right.length) return null;
    const pairs = [];
    for (const a of left) for (const b of right) {
      const height = Math.max(a.glyphHeight, b.glyphHeight);
      const baselineDelta = Math.abs(a.baseline - b.baseline);
      if (baselineDelta > height * .55) continue;
      const score = a.confidence + b.confidence - baselineDelta / height * .35;
      pairs.push({ left: a, right: b, score });
    }
    pairs.sort((a, b) => b.score - a.score);
    return pairs[0] || null;
  }

  function padRect(rect, imageWidth, imageHeight, glyphHeight) {
    const pad = Math.max(2, Math.round(glyphHeight * .2));
    const x0 = Math.max(0, rect.x - pad), y0 = Math.max(0, rect.y - pad);
    const x1 = Math.min(imageWidth, rect.x + rect.width + pad), y1 = Math.min(imageHeight, rect.y + rect.height + pad);
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }

  function locate(image, fields = Object.keys(EXPECTED)) {
    const width = Number(image?.width) || 0, height = Number(image?.height) || 0;
    const requested = [...new Set(Array.isArray(fields) ? fields : [])].filter((field) => Object.hasOwn(EXPECTED, field));
    const result = { method: "full-image-color-components", dimensions: { width, height }, fields: {}, anchors: {}, reasons: {} };
    if (!width || !height || !image?.data) return { ...result, reason: "invalid-image-data" };
    for (const category of ["score", "trophy"]) {
      const componentResult = findComponents(image, category), rows = makeRows(componentResult.components);
      const count = category === "score" ? 6 : 4;
      const left = runsForSide(rows, count, "left", width), right = runsForSide(rows, count, "right", width);
      const pair = choosePair(left, right);
      for (const side of ["left", "right"]) {
        const field = side === "left" ? `local${category === "score" ? "Score" : "Trophies"}` : `opponent${category === "score" ? "Score" : "Trophies"}`;
        if (!requested.includes(field)) continue;
        const alternatives = side === "left" ? left : right;
        const run = pair?.[side] || [...alternatives].sort((a, b) => b.confidence - a.confidence)[0] || null;
        if (!run || run.confidence < .62) { result.fields[field] = null; result.anchors[field] = []; result.reasons[field] = componentResult.reason || `no-reliable-${category}-run-pair`; continue; }
        result.fields[field] = padRect(run.rect, width, height, run.glyphHeight);
        result.anchors[field] = run.anchors.map(({ x, y, width: w, height: h }) => ({ x, y, width: w, height: h }));
        result.reasons[field] = null;
      }
    }
    const missing = requested.filter((field) => !result.fields[field]);
    result.reason = missing.length ? `not-localized:${missing.join(",")}` : null;
    return result;
  }

  return { version: "0.1.0-experimental", expected: EXPECTED, findComponents, locate };
});
