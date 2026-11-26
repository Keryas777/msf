/* Additive V0.2.0 score geometry experiments; V0.1.0 remains the reference module. */
(function (root, factory) {
  const api = factory(root?.WarResultsScoreLocatorExperiment || null);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WarResultsScoreLocatorV020Experiment = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (reference) {
  "use strict";

  const VERSION = "0.2.0-score-geometry-experiment";
  const DEFAULTS = Object.freeze({
    minimumArea: 3,
    minimumHeightRatioBetweenComponents: .42,
    maximumCenterOffsetByHeight: .34,
    maximumEdgeOffsetByHeight: .42,
    maximumGapByHeight: 1.9,
    initialHorizontalPaddingByCrop: .16,
    initialVerticalPaddingByCrop: .24,
    priorityConfidence: .66,
    selectionMargin: .065,
    cropPaddingByHeight: .14,
    stageBSearchXFraction: .075,
    stageBSearchYFraction: .055,
    stageCSearchXFraction: .12,
    stageCSearchYFraction: .1
  });
  const FIELDS = ["localScore", "opponentScore"];
  const median = (values) => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  const clampRect = (rect, width, height) => {
    if (!rect) return null;
    const x = Math.max(0, Math.floor(rect.x)), y = Math.max(0, Math.floor(rect.y));
    const right = Math.min(width, Math.ceil(rect.x + rect.width)), bottom = Math.min(height, Math.ceil(rect.y + rect.height));
    return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
  };

  function verticallyCompatible(a, b, config) {
    const ah = Math.max(1, a.height), bh = Math.max(1, b.height), scale = Math.max(ah, bh);
    if (Math.min(ah, bh) / scale < config.minimumHeightRatioBetweenComponents) return false;
    return Math.abs((a.y + ah / 2) - (b.y + bh / 2)) <= scale * config.maximumCenterOffsetByHeight &&
      Math.abs(a.y - b.y) <= scale * config.maximumEdgeOffsetByHeight &&
      Math.abs((a.y + ah) - (b.y + bh)) <= scale * config.maximumEdgeOffsetByHeight;
  }

  function makeFamilies(components, config) {
    const sorted = [...components].sort((a, b) => b.height - a.height || a.y - b.y || a.x - b.x);
    const visited = new Set(), families = [];
    for (let i = 0; i < sorted.length; i++) {
      if (visited.has(i)) continue;
      const queue = [i], family = []; visited.add(i);
      while (queue.length) {
        const current = queue.pop(), component = sorted[current]; family.push(component);
        for (let j = 0; j < sorted.length; j++) {
          if (!visited.has(j) && verticallyCompatible(component, sorted[j], config)) {
            visited.add(j); queue.push(j);
          }
        }
      }
      families.push(family.sort((a, b) => a.x - b.x || a.y - b.y));
    }
    return families.sort((a, b) => Math.min(...a.map((c) => c.y)) - Math.min(...b.map((c) => c.y)) ||
      Math.min(...a.map((c) => c.x)) - Math.min(...b.map((c) => c.x)));
  }

  function spread90(values) {
    if (values.length < 2) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor((sorted.length - 1) * .9)] - sorted[Math.floor((sorted.length - 1) * .1)];
  }

  function scoreGroup(run, anchor, strategy, config = DEFAULTS) {
    const heights = run.map((c) => c.height), height = median(heights);
    if (!height) return null;
    const topSpread = spread90(run.map((c) => c.y)), bottomSpread = spread90(run.map((c) => c.y + c.height));
    const heightVariation = heights.reduce((sum, item) => sum + Math.abs(item - height) / height, 0) / run.length;
    const alignment = Math.max(0, 1 - (topSpread + bottomSpread) / (2 * height));
    const gaps = run.slice(1).map((c, i) => Math.max(0, c.x - run[i].x - run[i].width));
    const meanGap = gaps.length ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length : 0;
    const spacing = Math.max(0, 1 - meanGap / (height * config.maximumGapByHeight));
    const density = run.reduce((sum, c) => sum + c.area / Math.max(1, c.width * c.height), 0) / run.length;
    const support = run.length < 2 ? .22 : 1 - Math.exp(-.43 * (run.length - 1));
    const singletonPenalty = run.length === 1 ? .24 : 0;
    const x = Math.min(...run.map((c) => c.x)), y = Math.min(...run.map((c) => c.y));
    const right = Math.max(...run.map((c) => c.x + c.width)), bottom = Math.max(...run.map((c) => c.y + c.height));
    const rect = { x, y, width: right - x, height: bottom - y };
    const ow = Math.max(0, Math.min(right, anchor.x + anchor.width) - Math.max(x, anchor.x));
    const oh = Math.max(0, Math.min(bottom, anchor.y + anchor.height) - Math.max(y, anchor.y));
    const overlap = ow * oh / Math.max(1, rect.width * rect.height);
    const distance = Math.hypot(x + rect.width / 2 - (anchor.x + anchor.width / 2),
      y + rect.height / 2 - (anchor.y + anchor.height / 2));
    const proximity = Math.exp(-distance / Math.max(1, height * 2.4));
    const anchorScore = Math.max(overlap, proximity * .72);
    const heightConsistency = Math.max(0, 1 - heightVariation);
    const densityScore = Math.min(1, density * 1.5);
    const geometryScore = Math.max(0, Math.min(1, .32 * support + .22 * heightConsistency +
      .22 * alignment + .14 * spacing + .10 * densityScore - singletonPenalty));
    const score = strategy === "geometry" ? geometryScore : geometryScore * .78 + anchorScore * .22;
    const widthPerGlyphHeight = rect.width / Math.max(1, run.length * height);
    const reasons = [];
    if (run.length === 1) reasons.push("single-component-needs-independent-evidence");
    if (widthPerGlyphHeight < .08 || widthPerGlyphHeight > 1.9) reasons.push("implausible-width-per-component");
    if (heightVariation > .42) reasons.push("inconsistent-component-heights");
    if (alignment < .45) reasons.push("weak-vertical-alignment");
    if (strategy !== "geometry" && anchorScore < .18) reasons.push("distant-from-proportional-anchor");
    return {
      rect, glyphs: run.map((c) => ({ x: c.x, y: c.y, width: c.width, height: c.height, area: c.area, touchesSearchEdge: c.touchesSearchEdge })),
      count: run.length, glyphHeight: height, topSpread, bottomSpread, baselineSpread:
        Math.max(...run.map((c) => c.y + c.height)) - Math.min(...run.map((c) => c.y + c.height)),
      heightVariation, maxGap: Math.max(0, ...gaps), meanGap, density, collectiveSupport: support,
      geometryScore, anchorScore, overlapWithAnchor: overlap, proximityToAnchor: proximity,
      widthPerGlyphHeight, widthPlausibility: widthPerGlyphHeight >= .08 && widthPerGlyphHeight <= 1.9,
      score, rank: score, touchesSearchEdge: run.some((c) => c.touchesSearchEdge), reasons,
      contributions: { collectiveSupport: .32 * support, heightConsistency: .22 * heightConsistency,
        verticalAlignment: .22 * alignment, spacing: .14 * spacing, density: .10 * densityScore,
        singletonPenalty: -singletonPenalty, anchor: strategy === "geometry" ? 0 : .22 * anchorScore }
    };
  }

  function groupComponents(components, region, proportionalRect, strategy = "anchored", options = {}) {
    const config = { ...DEFAULTS, ...options }, candidates = [], families = [];
    for (const [familyIndex, family] of makeFamilies(components, config).entries()) {
      const runs = []; let run = [];
      for (const item of family) {
        const previous = run[run.length - 1], referenceHeight = previous ? median([previous.height, item.height]) : item.height;
        const gap = previous ? item.x - (previous.x + previous.width) : 0;
        if (previous && gap > referenceHeight * config.maximumGapByHeight) { runs.push(run); run = []; }
        run.push(item);
      }
      if (run.length) runs.push(run);
      const groups = runs.map((items) => scoreGroup(items, proportionalRect, strategy, config)).filter(Boolean);
      candidates.push(...groups);
      const x = Math.min(...family.map((c) => c.x)), y = Math.min(...family.map((c) => c.y));
      families.push({ familyIndex, componentCount: family.length,
        rect: { x, y, width: Math.max(...family.map((c) => c.x + c.width)) - x,
          height: Math.max(...family.map((c) => c.y + c.height)) - y },
        componentKeys: family.map((c) => [c.x, c.y, c.width, c.height, c.area].join(":")),
        candidateCount: groups.length });
    }
    return { candidates: candidates.sort((a, b) => b.score - a.score), families };
  }

  function sameGlyphAcrossSearches(a, b, height) {
    const overlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
    const overlapRatio = overlap / Math.max(1, Math.min(a.width, b.width));
    const centersNear = Math.abs(a.x + a.width / 2 - b.x - b.width / 2) <= height * .32;
    return (overlapRatio >= .45 || centersNear) && Math.abs(a.y - b.y) <= height * .3 &&
      Math.abs(a.height - b.height) <= height * .4;
  }

  function candidateSubset(small, large) {
    return small.glyphs.length <= large.glyphs.length && small.glyphs.every((a) =>
      large.glyphs.some((b) => sameGlyphAcrossSearches(a, b, Math.max(a.height, b.height))));
  }

  function searchRect(width, height, field, anchor, stage, config) {
    const half = Math.floor(width / 2), left = field === "localScore", minX = left ? 0 : half, maxX = left ? half : width;
    const padX = stage === "anchor-priority" ? anchor.width * config.initialHorizontalPaddingByCrop :
      width * (stage === "anchor-expanded" ? config.stageBSearchXFraction : config.stageCSearchXFraction);
    const padY = stage === "anchor-priority" ? anchor.height * config.initialVerticalPaddingByCrop :
      height * (stage === "anchor-expanded" ? config.stageBSearchYFraction : config.stageCSearchYFraction);
    const x = Math.max(minX, Math.floor(anchor.x - padX)), right = Math.min(maxX, Math.ceil(anchor.x + anchor.width + padX));
    const y = Math.max(0, Math.floor(anchor.y - padY)), bottom = Math.min(height, Math.ceil(anchor.y + anchor.height + padY));
    const rect = clampRect({ x, y, width: right - x, height: bottom - y }, width, height);
    return rect && { ...rect, stage };
  }

  function locate(imageData, field, proportionalRect, strategy = "anchored", options = {}) {
    const started = typeof performance !== "undefined" ? performance.now() : Date.now();
    const config = { ...DEFAULTS, ...options }, stages = [], candidates = [], components = [], families = [], warnings = [];
    if (!reference || !FIELDS.includes(field) || !imageData?.width || !imageData?.height || !proportionalRect)
      return { field, method: VERSION, strategy, localized: false, status: "no-localization",
        warnings: ["invalid-input-or-reference-mask-unavailable"], candidates: [], stages, elapsedMs: 0 };
    let previous = null;
    // The geometry-only ablation starts in the same proportional-expanded
    // window as V0.1.0. Anchor-first and joint variants get the tighter pass.
    const searchStages = strategy === "geometry"
      ? ["anchor-expanded", "wide-recovery"]
      : ["anchor-priority", "anchor-expanded", "wide-recovery"];
    for (const stage of searchStages) {
      const rect = searchRect(imageData.width, imageData.height, field, proportionalRect, stage, config);
      if (!rect || (previous && rect.x === previous.x && rect.y === previous.y &&
        rect.width === previous.width && rect.height === previous.height)) continue;
      previous = rect;
      // Re-run connected components from the unmodified source pixels for every expansion.
      const raw = reference.componentsInRegion(imageData, rect, { ...reference.defaults, minimumArea: 1 });
      const all = raw.components || [], accepted = all.filter((item) => item.area >= config.minimumArea);
      const rejected = all.filter((item) => item.area < config.minimumArea).map((item) => ({ ...item, rejection: "below-minimum-area" }));
      const groups = groupComponents(accepted, rect, proportionalRect, strategy, config);
      for (const candidate of groups.candidates) {
        const key = candidate.glyphs.map((g) => [g.x, g.y, g.width, g.height, g.area].join(":")).join("|");
        const prior = candidates.find((item) => item.key === key || candidateSubset(item, candidate) || candidateSubset(candidate, item));
        if (prior) {
          const stagesSeen = [...prior.stages, stage];
          const candidateMoreComplete = candidate.glyphs.length > prior.glyphs.length ||
            (candidate.glyphs.length === prior.glyphs.length && prior.touchesSearchEdge && !candidate.touchesSearchEdge) ||
            (candidate.glyphs.length === prior.glyphs.length && candidate.score > prior.score && !candidate.touchesSearchEdge);
          if (candidateMoreComplete) Object.assign(prior, candidate, { key, stages: stagesSeen });
          else prior.stages = stagesSeen;
        } else candidates.push({ ...candidate, key, stages: [stage] });
      }
      components.push(...accepted.map((c) => ({ ...c, accepted: true, stage })),
        ...rejected.map((c) => ({ ...c, accepted: false, stage })));
      families.push(...groups.families.map((family) => ({ ...family, stage })));
      stages.push({ stage, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        pixelCount: rect.width * rect.height, maskAcceptedPixelCount: raw.mask?.reduce((sum, value) => sum + value, 0) || 0,
        rawComponentCount: all.length,
        acceptedComponentCount: accepted.length, rejectedComponentCount: rejected.length,
        familyCount: groups.families.length, candidateCount: groups.candidates.length,
        rejectionReasons: { "below-minimum-area": rejected.length } });
      const best = groups.candidates[0], next = groups.candidates[1];
      const ambiguous = Boolean(best && next && best.score - next.score < config.selectionMargin);
      const reliable = Boolean(best && best.count >= 2 && best.widthPlausibility && best.geometryScore >= .62 &&
        best.score >= config.priorityConfidence && !ambiguous && (strategy === "geometry" || best.anchorScore >= .18));
      const continuation = Boolean(best && (best.rect.x < proportionalRect.x ||
        best.rect.x + best.rect.width > proportionalRect.x + proportionalRect.width ||
        best.rect.x - rect.x < best.glyphHeight * .85 ||
        rect.x + rect.width - (best.rect.x + best.rect.width) < best.glyphHeight * .85));
      if (reliable && !best.touchesSearchEdge && !continuation) break;
    }
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0], next = candidates[1];
    const ambiguous = Boolean(best && next && best.score - next.score < config.selectionMargin && best.key !== next.key);
    const selected = best && best.count >= 2 && best.widthPlausibility && best.geometryScore >= .62 &&
      best.score >= config.priorityConfidence && !ambiguous && (strategy === "geometry" || best.anchorScore >= .18) ? best : null;
    if (!best) warnings.push("no-coherent-score-group");
    else if (!selected) warnings.push(best.count === 1 ? "single-component-not-validated" :
      ambiguous ? "multiple-plausible-groups" : "candidate-below-reliability-threshold");
    if (best?.touchesSearchEdge) warnings.push("candidate-touches-search-edge");
    if (stages.length === 3 && !selected) warnings.push("wide-search-did-not-resolve");
    const pad = selected ? Math.max(2, Math.round(selected.glyphHeight * config.cropPaddingByHeight)) : 0;
    const finalRect = selected ? clampRect({ x: selected.rect.x - pad, y: selected.rect.y - pad,
      width: selected.rect.width + 2 * pad, height: selected.rect.height + 2 * pad }, imageData.width, imageData.height) : null;
    const selectedKeys = new Set(selected?.glyphs.map((g) => [g.x, g.y, g.width, g.height, g.area].join(":")) || []);
    const unselected = components.filter((c) => !selectedKeys.has([c.x, c.y, c.width, c.height, c.area].join(":")))
      .map((c) => ({ ...c, rejection: c.accepted ? "not-in-selected-localization" : c.rejection || "below-minimum-area" }));
    const elapsedMs = Math.max(0, Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - started));
    return { field, method: VERSION, strategy, localized: Boolean(selected && finalRect),
      status: selected ? "validated-localization" : best ? "uncertain-candidate" : "no-localization",
      initialRegion: stages[0]?.rect || null, searchRegion: stages[stages.length - 1]?.rect || null,
      regions: stages.map((s) => ({ stage: s.stage, rect: s.rect })), finalRect,
      diagnosticCandidateRect: best?.rect || null,
      cropDimensions: finalRect ? { width: finalRect.width, height: finalRect.height } : null,
      glyphs: selected?.glyphs || [], glyphCount: selected?.count || 0, selected,
      candidates: candidates.map((candidate, index) => ({ ...candidate, selected: Boolean(selected && candidate.key === best?.key),
        rejection: selected && candidate.key === best?.key ? null : selected ? "lower-ranked-or-ambiguous" :
          candidate.reasons[0] || (ambiguous ? "multiple-plausible-candidates" : "below-reliability-threshold"), index })),
      components: { accepted: components.filter((c) => c.accepted), rejected: unselected },
      families, stages, scoreBreakdown: selected?.contributions || best?.contributions || null,
      parameters: { ...config, colorMask: "V0.1.0 unchanged; no color thresholds adjusted", strategy },
      extensions: stages.slice(1).map((s, i) => ({ reason: i === 0 ? "anchor-incomplete-or-uncertain" : "wide-search-still-needed",
        from: stages[i].rect, to: s.rect, recovered: Boolean(selected) })),
      warnings: [...new Set(warnings)], elapsedMs, rankingNote: "heuristic score; not a calibrated probability" };
  }

  function compare(imageData, requestedFields, proportionalRects, variants = ["geometry", "anchored", "joint"], options = {}) {
    const fields = [...new Set(requestedFields || [])].filter((field) => FIELDS.includes(field));
    const enabled = [...new Set(variants)].filter((variant) => ["geometry", "anchored", "joint"].includes(variant));
    const results = {};
    for (const variant of enabled) {
      const workFields = variant === "joint" ? FIELDS : fields;
      const located = Object.fromEntries(workFields.map((field) => [field,
        locate(imageData, field, proportionalRects?.[field], variant === "joint" ? "anchored" : variant, options)]));
      let pairCount = 0;
      if (variant === "joint") {
        const pairs = [];
        for (const left of located.localScore.candidates) for (const right of located.opponentScore.candidates) {
          const leftStrong = left.count >= 2 && left.geometryScore >= .64 && left.anchorScore >= .30;
          const rightStrong = right.count >= 2 && right.geometryScore >= .64 && right.anchorScore >= .30;
          const leftAnchoredSingle = left.count === 1 && left.anchorScore >= .82;
          const rightAnchoredSingle = right.count === 1 && right.anchorScore >= .82;
          if ((!leftStrong && !leftAnchoredSingle) || (!rightStrong && !rightAnchoredSingle) ||
            (!leftStrong && !rightStrong)) continue;
          const h = Math.max(left.glyphHeight, right.glyphHeight, 1);
          const heightAgreement = Math.max(0, 1 - Math.abs(left.glyphHeight - right.glyphHeight) / h);
          const leftY = left.rect.y + left.rect.height / 2, rightY = right.rect.y + right.rect.height / 2;
          const verticalAgreement = Math.max(0, 1 - Math.abs(leftY - rightY) / h);
          pairs.push({ localScore: left, opponentScore: right, heightAgreement, verticalAgreement,
            score: (left.score + right.score) / 2 + .08 * heightAgreement + .08 * verticalAgreement });
        }
        pairs.sort((a, b) => b.score - a.score); pairCount = pairs.length;
        const bestPair = pairs[0], runnerUp = pairs[1];
        const ambiguous = Boolean(bestPair && runnerUp && bestPair.score - runnerUp.score < DEFAULTS.selectionMargin);
        const reliable = Boolean(bestPair && bestPair.score >= .72 && !ambiguous);
        for (const field of FIELDS) {
          const result = located[field], candidate = reliable ? bestPair[field] : null;
          result.joint = { evaluatedBothSides: true, requestedFields: fields, pairCount,
            pairScore: reliable ? bestPair.score : null, heightAgreement: reliable ? bestPair.heightAgreement : null,
            verticalAgreement: reliable ? bestPair.verticalAgreement : null,
            oppositeCandidate: located[field === "localScore" ? "opponentScore" : "localScore"].candidates[0] || null,
            reason: reliable ? "compatible-score-pair" : ambiguous ? "ambiguous-score-pairs" : "no-reliable-compatible-pair" };
          if (candidate && !result.localized) {
            result.selected = candidate; result.localized = true; result.status = "validated-localization";
            const padding = Math.max(2, Math.round(candidate.glyphHeight * DEFAULTS.cropPaddingByHeight));
            result.finalRect = clampRect({ x: candidate.rect.x - padding, y: candidate.rect.y - padding,
              width: candidate.rect.width + padding * 2, height: candidate.rect.height + padding * 2 }, imageData.width, imageData.height);
            result.cropDimensions = result.finalRect && { width: result.finalRect.width, height: result.finalRect.height };
            result.glyphs = candidate.glyphs; result.glyphCount = candidate.count; result.diagnosticCandidateRect = candidate.rect;
            result.scoreBreakdown = { ...candidate.contributions, joint: { pairScore: bestPair.score,
              heightAgreement: bestPair.heightAgreement, verticalAgreement: bestPair.verticalAgreement } };
            result.warnings = result.warnings.filter((w) => !["single-component-not-validated", "multiple-plausible-groups",
              "candidate-below-reliability-threshold"].includes(w));
            result.extensions.push({ reason: "opposite-score-geometry-guidance", recovered: true, from: null, to: null });
          } else if (!candidate) {
            if (result.localized) result.warnings.push("joint-could-not-confirm-independent-localization");
            else {
              result.localized = false; result.status = result.candidates.length ? "uncertain-candidate" : "no-localization";
              result.finalRect = null; result.cropDimensions = null; result.glyphs = []; result.glyphCount = 0;
              if (!result.warnings.includes("joint-localization-abstained")) result.warnings.push("joint-localization-abstained");
            }
          }
          const opposite = located[field === "localScore" ? "opponentScore" : "localScore"];
          result.jointContext = { evaluatedFields: FIELDS, requestedFields: fields,
            oppositeField: opposite.field, opposite: { localized: opposite.localized, status: opposite.status,
              selected: opposite.selected, regions: opposite.regions, stages: opposite.stages, components: opposite.components,
              families: opposite.families, candidates: opposite.candidates, warnings: opposite.warnings,
              extensions: opposite.extensions, elapsedMs: opposite.elapsedMs } };
        }
      }
      results[variant] = { fields: Object.fromEntries(fields.map((field) => [field, located[field]])),
        jointContext: variant === "joint" ? { evaluatedFields: FIELDS, pairCount } : null };
    }
    return { method: VERSION, requestedFields: fields, variants: results };
  }

  return { version: VERSION, defaults: DEFAULTS, verticallyCompatible, makeFamilies, groupComponents, locate, compare };
});
