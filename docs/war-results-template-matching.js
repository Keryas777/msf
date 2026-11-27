/* Small, explainable pixel-template matcher. No OCR dependency. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WarResultsTemplateMatching = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const VERSION = "1.0.0";
  function maskFromRgba(rgba, width, height) {
    if (!rgba || rgba.length !== width * height * 4) throw new TypeError("RGBA invalide.");
    const out = new Uint8Array(width * height);
    for (let i = 0; i < out.length; i++) { const p = i * 4, l = .2126 * rgba[p] + .7152 * rgba[p + 1] + .0722 * rgba[p + 2]; out[i] = rgba[p + 3] > 0 && l < 250 ? 1 : 0; }
    return out;
  }
  function fitMask(mask, width, height, target = 48) {
    if (!(width > 0 && height > 0 && mask.length === width * height)) throw new TypeError("Masque invalide.");
    const scale = target / Math.max(width, height), w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
    const x0 = Math.floor((target - w) / 2), y0 = Math.floor((target - h) / 2), out = new Uint8Array(target * target);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const sx = Math.min(width - 1, Math.floor((x + .5) / scale)), sy = Math.min(height - 1, Math.floor((y + .5) / scale));
      out[(y + y0) * target + x + x0] = mask[sy * width + sx] ? 1 : 0;
    }
    return { mask: out, width: target, height: target };
  }
  function shiftedSimilarity(a, b, width, height, tolerance = 2) {
    const ap = [], bp = [];
    for (let i = 0; i < a.length; i++) { if (a[i]) ap.push([i % width, Math.floor(i / width)]); if (b[i]) bp.push([i % width, Math.floor(i / width)]); }
    let best = { iou: 0, dice: 0, correlation: 0, similarity: 0, dx: 0, dy: 0 };
    for (let dy = -tolerance; dy <= tolerance; dy++) for (let dx = -tolerance; dx <= tolerance; dx++) {
      let intersection = 0, union = 0, aa = 0, bb = 0;
      for (const [x, y] of ap) { aa++; const xx = x - dx, yy = y - dy; if (xx >= 0 && xx < width && yy >= 0 && yy < height && b[yy * width + xx]) intersection++; }
      for (const [x, y] of bp) { const xx = x + dx, yy = y + dy; if (xx >= 0 && xx < width && yy >= 0 && yy < height) bb++; }
      union = aa + bb - intersection;
      const iou = union ? intersection / union : 1, dice = aa + bb ? 2 * intersection / (aa + bb) : 1;
      const denominator = Math.sqrt(aa * (width * height - aa) * bb * (width * height - bb));
      const correlation = denominator ? (width * height * intersection - aa * bb) / denominator : (aa === bb ? 1 : 0);
      const similarity = .45 * iou + .35 * dice + .2 * ((correlation + 1) / 2);
      if (similarity > best.similarity) best = { iou, dice, correlation, similarity, dx, dy };
    }
    return best;
  }
  function rank(glyphMask, refs, options = {}) {
    const excluded = new Set(options.excludeCaptureIds || []), category = options.category || "mixed";
    const eligible = refs.filter((r) => !excluded.has(r.source?.captureId) && (category === "mixed" || r.source?.fieldType === category));
    const byDigit = new Map(Array.from({ length: 10 }, (_, i) => [String(i), []]));
    for (const ref of eligible) {
      const data = options.representation === "native" ? ref.native : options.representation === "sheared" ? ref.sheared : ref.normalized;
      if (!data?.rgba) continue;
      const cached = ref.matcherMasks?.[options.representation];
      const nativeMask = options.representation === "native" && ref.native?.mask ? decodeBytes(ref.native.mask) : null;
      const candidate = cached || fitMask(nativeMask || maskFromRgba(data.rgba, data.width, data.height), data.width, data.height);
      const query = glyphMask.width === 48 && glyphMask.height === 48 ? glyphMask : fitMask(glyphMask.mask, glyphMask.width, glyphMask.height);
      const score = shiftedSimilarity(query.mask, candidate.mask, 48, 48, options.shiftTolerance ?? 2);
      byDigit.get(String(ref.digit))?.push({ ref, ...score });
    }
    const perClass = [...byDigit].map(([digit, scores]) => {
      scores.sort((a, b) => b.similarity - a.similarity);
      const top = scores.slice(0, Math.min(3, scores.length));
      return { digit, availableReferences: scores.length, similarity: top.length ? top.reduce((n, x) => n + x.similarity, 0) / top.length : null,
        references: top.map(({ ref, similarity, iou, dice, dx, dy }) => ({ id: ref.id, captureId: ref.source.captureId,
          fieldType: ref.source.fieldType, field: ref.source.field, side: ref.source.side, position: ref.source.position, similarity, iou, dice, dx, dy })) };
    }).sort((a, b) => (b.similarity ?? -1) - (a.similarity ?? -1));
    const available = perClass.filter((x) => x.similarity !== null), first = available[0] || null, second = available[1] || null;
    const gap = first && second ? first.similarity - second.similarity : null;
    const missingClasses = perClass.filter((x) => !x.availableReferences).map((x) => x.digit);
    const insufficient = missingClasses.length > 0 || !first || !second || gap < (options.abstentionGap ?? .025);
    return { proposedDigit: insufficient ? null : first.digit, best: first, second, gap, classes: perClass,
      ambiguity: insufficient ? (missingClasses.length ? "missing-class-references" : !first || !second ? "insufficient-classes" : "insufficient-class-separation") : null,
      missingClasses,
      scoreMeaning: "visual similarity index; not a probability", referenceCount: eligible.length, excludedCaptureIds: [...excluded] };
  }
  function decodeBase64(value) {
    if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(value, "base64"));
    const raw = atob(value), out = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i); return out;
  }
  function decodeBytes(value) { return typeof value === "string" ? decodeBase64(value) : value; }
  function prepareReferences(refs) {
    return refs.map((ref) => ({ ...ref, matcherMasks: Object.fromEntries(["native", "normalized", "sheared"].map((representation) => {
      const data = representation === "native" ? ref.native : representation === "sheared" ? ref.sheared : ref.normalized;
      const mask = representation === "native" && ref.native?.mask ? decodeBytes(ref.native.mask) : maskFromRgba(data.rgba, data.width, data.height);
      return [representation, fitMask(mask, data.width, data.height)];
    })) }));
  }
  function reconstructDigits(results) { return (results || []).map((item) => /^\d$/.test(String(item?.proposedDigit ?? "")) ? String(item.proposedDigit) : "?").join(""); }
  function serializeReport(report) { if (!report || report.schema !== "msf-template-matching-report" || !Array.isArray(report.fields)) throw new TypeError("Rapport Template Matching invalide."); return JSON.stringify(report, null, 2); }
  return { version: VERSION, maskFromRgba, fitMask, shiftedSimilarity, rank, prepareReferences, decodeBase64, decodeBytes, reconstructDigits, serializeReport };
});
