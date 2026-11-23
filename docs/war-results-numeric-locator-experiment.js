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
      let minX = width, minY = height, maxX = -1, maxY = -1, area = 0, sumR = 0, sumG = 0, sumB = 0;
      stack.push(start); visited[start] = 1;
      while (stack.length) {
        const at = stack.pop(), x = at % width, y = (at - x) / width;
        area++; sumR += data[at * 4]; sumG += data[at * 4 + 1]; sumB += data[at * 4 + 2];
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const next = ny * width + nx;
          if (mask[next] && !visited[next]) { visited[next] = 1; stack.push(next); }
        }
      }
      const box = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, area, meanRed: sumR / area, meanGreen: sumG / area, meanBlue: sumB / area };
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

  function runsForSide(rows, count, side, imageWidth, category) {
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
        const iconAnchor = category === "trophy" ? row.components
          .filter((item) => {
            const gap = x0 - (item.x + item.width), centerDelta = Math.abs(item.y + item.height / 2 - (y0 + (y1 - y0) / 2));
            const density = item.area / (item.width * item.height);
            return gap >= 0 && gap <= medianHeight * .8 && item.width / item.height >= .88 && item.width / item.height <= 1.35 &&
              item.height >= medianHeight * .85 && item.height <= medianHeight * 2.6 && centerDelta <= item.height * .34 && density >= .24;
          })
          .sort((a, b) => Math.abs(a.y + a.height / 2 - (y0 + (y1 - y0) / 2)) - Math.abs(b.y + b.height / 2 - (y0 + (y1 - y0) / 2)))[0] || null : null;
        const colorEvidence = run.reduce((sum, item) => sum + item.meanBlue - item.meanRed, 0) / count;
        if (category === "trophy" && colorEvidence < 7) continue;
        const confidence = Math.max(0, Math.min(1, 1 - heightVariation * .5 - gapVariation * .25 - baselineSpread / medianHeight * .25));
        candidates.push({ rect: { x: x0, y: y0, width, height: y1 - y0 }, anchors: run, baseline: row.baseline, glyphHeight: medianHeight,
          confidence, colorEvidence, iconAnchor, rankScore: confidence + (iconAnchor ? .3 : 0) + Math.min(.12, Math.max(0, colorEvidence) / 500) });
      }
    }
    return candidates;
  }

  function choosePair(left, right) {
    if (!left.length || !right.length) return { pair: null, candidates: [], ambiguous: false };
    const pairs = [];
    for (const a of left) for (const b of right) {
      const height = Math.max(a.glyphHeight, b.glyphHeight);
      const baselineDelta = Math.abs(a.baseline - b.baseline);
      if (baselineDelta > height * .55) continue;
      const score = a.rankScore + b.rankScore - baselineDelta / height * .35;
      pairs.push({ left: a, right: b, score });
    }
    pairs.sort((a, b) => b.score - a.score);
    if (!pairs.length) return { pair: null, candidates: [], ambiguous: false };
    const ambiguous = pairs.length > 1 && pairs[0].score - pairs[1].score < .08 &&
      (!pairs[0].left.iconAnchor || !pairs[0].right.iconAnchor);
    return { pair: ambiguous ? null : pairs[0], candidates: pairs.map(({ left: a, right: b, score }) => ({
      left: { rect: a.rect, score: a.rankScore, geometryScore: a.confidence, iconAnchor: a.iconAnchor },
      right: { rect: b.rect, score: b.rankScore, geometryScore: b.confidence, iconAnchor: b.iconAnchor }, score,
      selected: !ambiguous && score === pairs[0].score,
      reason: ambiguous ? "ambiguous-similar-pairs" : score === pairs[0].score ? "best-geometry-and-icon-evidence" : "lower-ranked-alternative"
    })), ambiguous };
  }

  function uniqueRuns(candidates) {
    const seen = new Set();
    return candidates.filter((candidate) => {
      const key = `${candidate.rect.x}:${candidate.rect.y}:${candidate.rect.width}:${candidate.rect.height}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }

  function selectSide(candidates) {
    const sorted = uniqueRuns(candidates).sort((a, b) => b.rankScore - a.rankScore);
    if (!sorted.length) return { run: null, ambiguous: false, ranked: [] };
    const top = sorted[0], next = sorted[1];
    const ambiguous = Boolean(next && top.rankScore - next.rankScore < .08 && !top.iconAnchor && !next.iconAnchor);
    return { run: ambiguous ? null : top, ambiguous, ranked: sorted.slice(0, 8) };
  }

  function trophyIconRuns(components, count, imageWidth) {
    const candidates = [];
    for (const icon of components) {
      const ratio = icon.width / icon.height, density = icon.area / (icon.width * icon.height), iconCenter = icon.y + icon.height / 2;
      if (ratio < .88 || ratio > 1.35 || density < .24) continue;
      const following = components.filter((item) => item.x >= icon.x + icon.width && item.x - (icon.x + icon.width) <= icon.height * 3.2 &&
        Math.abs(item.y + item.height / 2 - iconCenter) <= icon.height * .34).sort((a, b) => a.x - b.x);
      if (following.length < count) continue;
      const run = following.slice(0, count), heights = run.map((item) => item.height).sort((a, b) => a - b);
      const glyphHeight = heights[Math.floor(heights.length / 2)];
      if (glyphHeight < icon.height * .33 || glyphHeight > icon.height * 1.2) continue;
      const colorEvidence = run.reduce((sum, item) => sum + item.meanBlue - item.meanRed, 0) / count;
      if (colorEvidence < 7) continue;
      const gaps = run.map((item, index) => item.x - (index ? run[index - 1].x + run[index - 1].width : icon.x + icon.width));
      const centers = run.map((item) => item.y + item.height / 2), center = centers.reduce((a, b) => a + b, 0) / centers.length;
      if (gaps.some((gap) => gap < -glyphHeight * .3 || gap > glyphHeight * .85) ||
        Math.max(...centers) - Math.min(...centers) > glyphHeight * .42 || Math.abs(center - iconCenter) > icon.height * .34 ||
        run.some((item) => item.height < glyphHeight * .55 || item.height > glyphHeight * 1.55 || item.width / item.height > 1.4)) continue;
      const x0 = run[0].x, x1 = run.at(-1).x + run.at(-1).width, y0 = Math.min(...run.map((item) => item.y)), y1 = Math.max(...run.map((item) => item.y + item.height));
      const avgGap = gaps.slice(1).reduce((a, b) => a + b, 0) / Math.max(1, gaps.length - 1);
      const gapSpread = gaps.slice(1).length > 1 ? Math.max(...gaps.slice(1)) - Math.min(...gaps.slice(1)) : 0;
      const confidence = Math.max(0, Math.min(1, 1 - gapSpread / glyphHeight * .12 - (Math.max(...centers) - Math.min(...centers)) / glyphHeight * .25));
      candidates.push({ rect: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, anchors: run,
        baseline: y1, glyphHeight, confidence, iconAnchor: { x: icon.x, y: icon.y, width: icon.width, height: icon.height, area: icon.area },
        colorEvidence, rankScore: confidence + .35 + Math.max(0, .08 - avgGap / glyphHeight) + Math.min(.12, Math.max(0, colorEvidence) / 500) });
    }
    const unique = uniqueRuns(candidates);
    return unique.filter((item) => item.rect.x + item.rect.width / 2 < imageWidth / 2).map((item) => ({ ...item, side: "left" }))
      .concat(unique.filter((item) => item.rect.x + item.rect.width / 2 >= imageWidth / 2).map((item) => ({ ...item, side: "right" })));
  }

  function chooseTrophyPair(candidates) {
    const collapse = (side) => {
      const sorted = candidates.filter((item) => item.side === side).sort((a, b) => b.rankScore - a.rankScore), kept = [];
      for (const item of sorted) {
        const duplicate = kept.some((other) => {
          const intersection = Math.max(0, Math.min(item.rect.x + item.rect.width, other.rect.x + other.rect.width) - Math.max(item.rect.x, other.rect.x)) *
            Math.max(0, Math.min(item.rect.y + item.rect.height, other.rect.y + other.rect.height) - Math.max(item.rect.y, other.rect.y));
          const smaller = Math.min(item.rect.width * item.rect.height, other.rect.width * other.rect.height);
          return smaller > 0 && intersection / smaller >= .58;
        });
        if (!duplicate) kept.push(item);
      }
      return kept;
    };
    const left = collapse("left"), right = collapse("right"), pairs = [];
    for (const a of left) for (const b of right) {
      const height = Math.max(a.glyphHeight, b.glyphHeight), baselineDelta = Math.abs(a.baseline - b.baseline);
      if (baselineDelta > height * .7) continue;
      const separation = b.rect.x - (a.rect.x + a.rect.width);
      if (separation < height * 1.5) continue;
      pairs.push({ left: a, right: b, score: a.rankScore + b.rankScore - baselineDelta / height * .25 });
    }
    pairs.sort((a, b) => b.score - a.score);
    if (!pairs.length) return { pair: null, candidates: [], ambiguous: false };
    const alternatives = pairs.slice(0, 8).map(({ left: a, right: b, score }) => ({
      left: { rect: a.rect, score: a.rankScore, iconAnchor: a.iconAnchor }, right: { rect: b.rect, score: b.rankScore, iconAnchor: b.iconAnchor }, score
    }));
    const ambiguous = pairs.length > 1 && pairs[0].score - pairs[1].score < .04 &&
      JSON.stringify([pairs[0].left.rect, pairs[0].right.rect]) !== JSON.stringify([pairs[1].left.rect, pairs[1].right.rect]);
    return { pair: ambiguous ? null : pairs[0], candidates: alternatives, ambiguous };
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
    const result = { method: "full-image-color-components", dimensions: { width, height }, fields: {}, anchors: {}, reasons: {}, candidates: {} };
    if (!width || !height || !image?.data) return { ...result, reason: "invalid-image-data" };
    for (const category of ["score", "trophy"]) {
      const componentResult = findComponents(image, category), rows = makeRows(componentResult.components);
      const count = category === "score" ? 6 : 4;
      const left = runsForSide(rows, count, "left", width, category), right = runsForSide(rows, count, "right", width, category);
      const leftSelection = selectSide(left), rightSelection = selectSide(right);
      const geometricPair = choosePair(left, right);
      const iconPair = category === "trophy" ? chooseTrophyPair(trophyIconRuns(componentResult.components, count, width)) : null;
      for (const side of ["left", "right"]) {
        const field = side === "left" ? `local${category === "score" ? "Score" : "Trophies"}` : `opponent${category === "score" ? "Score" : "Trophies"}`;
        if (!requested.includes(field)) continue;
        let selection = side === "left" ? leftSelection : rightSelection, run = selection.run;
        if (category === "score") {
          run = geometricPair.pair?.[side] || [...(side === "left" ? left : right)].sort((a, b) => b.confidence - a.confidence)[0] || null;
          selection = { ...selection, run, ambiguous: false };
        }
        if (iconPair?.pair) {
          run = iconPair.pair[side];
          selection = { ...selection, run, ambiguous: false };
        } else if (iconPair?.ambiguous) {
          run = null; selection = { ...selection, run: null, ambiguous: true };
        }
        const iconCandidates = (iconPair?.candidates || []).map((candidate) => {
          const item = candidate[side]; return { rect: item.rect, score: item.score, iconAnchor: item.iconAnchor,
            selected: Boolean(run && item.rect.x === run.rect.x && item.rect.y === run.rect.y),
            reason: iconPair.ambiguous ? "ambiguous-trophy-icon-pairs" : "paired-trophy-icon-and-four-glyph-run" };
        });
        const fallbackCandidates = selection.ranked.map((item, index) => ({ rect: item.rect, score: item.rankScore,
          geometryScore: item.confidence, iconAnchor: item.iconAnchor, selected: Boolean(run && item.rect.x === run.rect.x && item.rect.y === run.rect.y),
          reason: selection.ambiguous ? "ambiguous-similar-candidates" : item.iconAnchor ? "trophy-icon-adjacency-and-glyph-geometry" : index === 0 ? "best-geometry-no-icon-evidence" : "lower-ranked-alternative" }));
        const seenRects = new Set();
        result.candidates[field] = [...iconCandidates, ...fallbackCandidates].filter((candidate) => {
          const key = `${candidate.rect.x}:${candidate.rect.y}:${candidate.rect.width}:${candidate.rect.height}`;
          if (seenRects.has(key)) return false; seenRects.add(key); return true;
        }).slice(0, 8);
        if (selection.ambiguous) {
          result.fields[field] = null; result.anchors[field] = []; result.reasons[field] = "ambiguous-candidates"; continue;
        }
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
