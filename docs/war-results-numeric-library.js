/* Local MSF numeric glyph library builder. Does not participate in normal analysis. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WarResultsNumericLibrary = api;
  if (root && root.document) api.init(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const SCHEMA = "msf-numeric-glyph-library";
  const SCHEMA_VERSION = 1;
  const NORMALIZATION_VERSION = "contrast-fit-48x64-v1";
  const FAMILY_ID = "msf-numeric-common-v1";
  const DB_NAME = "msf-war-results-numeric-library";
  const STORE_NAME = "references";
  const TARGET = Object.freeze({ width: 48, height: 64, padding: 4 });

  function assertImageData(imageData) {
    if (!imageData || !Number.isInteger(imageData.width) || !Number.isInteger(imageData.height) ||
        imageData.width < 1 || imageData.height < 1 || !imageData.data || imageData.data.length !== imageData.width * imageData.height * 4) {
      throw new TypeError("ImageData invalide.");
    }
  }
  function toBase64(bytes) {
    if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }
  function fromBase64(value) {
    if (typeof value !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new TypeError("Donnée base64 invalide.");
    if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(value, "base64"));
    const binary = atob(value), bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  function normalizeGlyph(glyph, target = TARGET) {
    const { width, height, rgba, mask } = glyph;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || rgba.length !== width * height * 4 || mask.length !== width * height) throw new TypeError("Glyphe natif invalide.");
    let minX = width, minY = height, maxX = -1, maxY = -1, lo = 255, hi = 0;
    const luminance = new Float32Array(width * height);
    for (let p = 0; p < mask.length; p++) if (mask[p]) {
      const x = p % width, y = Math.floor(p / width), i = p * 4;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      const l = .2126 * rgba[i] + .7152 * rgba[i + 1] + .0722 * rgba[i + 2];
      luminance[p] = l; lo = Math.min(lo, l); hi = Math.max(hi, l);
    }
    if (maxX < minX) throw new TypeError("Le masque ne contient aucun pixel de glyphe.");
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    const scale = Math.min((target.width - 2 * target.padding) / bw, (target.height - 2 * target.padding) / bh);
    const rw = Math.max(1, Math.round(bw * scale)), rh = Math.max(1, Math.round(bh * scale));
    const ox = Math.floor((target.width - rw) / 2), oy = Math.floor((target.height - rh) / 2);
    const normalized = new Uint8Array(target.width * target.height * 4), range = Math.max(12, hi - lo);
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
      const sx = minX + Math.min(bw - 1, Math.floor(x / scale)), sy = minY + Math.min(bh - 1, Math.floor(y / scale)), src = sy * width + sx;
      if (!mask[src]) continue;
      const value = Math.max(0, Math.min(255, Math.round(255 * (1 - (luminance[src] - lo) / range))));
      const dst = ((oy + y) * target.width + ox + x) * 4;
      normalized[dst] = normalized[dst + 1] = normalized[dst + 2] = value; normalized[dst + 3] = 255;
    }
    return { width: target.width, height: target.height, rgba: normalized, fit: { scale, x: ox, y: oy, width: rw, height: rh }, normalizationVersion: NORMALIZATION_VERSION };
  }
  function estimateShear(normalized) {
    const { width, height, rgba } = normalized;
    const rows = [];
    for (let y = 0; y < height; y++) {
      let sum = 0, count = 0;
      for (let x = 0; x < width; x++) if (rgba[(y * width + x) * 4 + 3] && rgba[(y * width + x) * 4] < 235) { sum += x; count++; }
      if (count) rows.push({ y, x: sum / count });
    }
    if (rows.length < 3) return { slope: 0, confidence: 0, reason: "too-few-ink-rows" };
    const meanY = rows.reduce((s, r) => s + r.y, 0) / rows.length, meanX = rows.reduce((s, r) => s + r.x, 0) / rows.length;
    const denominator = rows.reduce((s, r) => s + (r.y - meanY) ** 2, 0);
    const slope = denominator ? rows.reduce((s, r) => s + (r.y - meanY) * (r.x - meanX), 0) / denominator : 0;
    const fitted = rows.reduce((s, r) => s + (r.x - (meanX + slope * (r.y - meanY))) ** 2, 0);
    const total = rows.reduce((s, r) => s + (r.x - meanX) ** 2, 0);
    return { slope, confidence: total ? Math.max(0, Math.min(1, 1 - fitted / total)) : 0, method: "row-centroid-linear-regression" };
  }
  function shearGlyph(normalized, estimate = estimateShear(normalized)) {
    const { width, height, rgba } = normalized, slope = Number(estimate.slope) || 0;
    const offsets = Array.from({ length: height }, (_, y) => -slope * (y - (height - 1) / 2));
    const minOffset = Math.min(...offsets), maxOffset = Math.max(...offsets), outWidth = width + Math.ceil(maxOffset - minOffset);
    const out = new Uint8Array(outWidth * height * 4), shift = -minOffset;
    for (let y = 0; y < height; y++) {
      const dx = Math.round(offsets[y] + shift);
      for (let x = 0; x < width; x++) {
        const from = (y * width + x) * 4;
        if (!rgba[from + 3]) continue;
        const to = (y * outWidth + x + dx) * 4;
        out.set(rgba.subarray(from, from + 4), to);
      }
    }
    return { width: outWidth, height, rgba: out, shear: { ...estimate, pixelShift: maxOffset - minOffset } };
  }
  function componentLabels(mask, width, height) {
    const labels = new Int32Array(width * height), boxes = [], stack = [];
    let id = 0;
    for (let start = 0; start < mask.length; start++) {
      if (!mask[start] || labels[start]) continue;
      id++; labels[start] = id; stack.push(start);
      let minX = width, minY = height, maxX = -1, maxY = -1, area = 0;
      while (stack.length) {
        const at = stack.pop(), x = at % width, y = Math.floor(at / width); area++;
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if ((!dx && !dy) || nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const next = ny * width + nx;
          if (mask[next] && !labels[next]) { labels[next] = id; stack.push(next); }
        }
      }
      boxes.push({ id, x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, area });
    }
    return { labels, boxes };
  }
  function sameBox(a, b) { return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height; }
  function extractGlyphs(imageData, category, count, reader) {
    assertImageData(imageData);
    if (!reader || typeof reader.segment !== "function" || typeof reader.foreground !== "function") throw new TypeError("Le lecteur de glyphes MSF n’est pas disponible.");
    if (!Number.isInteger(count) || count < 1 || count > 32) throw new RangeError("Le nombre de chiffres doit être compris entre 1 et 32.");
    let segmentation = reader.segment(imageData, category, count, { iconAware: true });
    // The existing confidence formula is designed for multi-glyph runs and can
    // reject an otherwise unique single digit because there is no spacing cue.
    // In the isolated library crop, accept only one substantial component and
    // retain its low-confidence metrics for manual review.
    if (count === 1 && segmentation.reason === "ambiguous-component-run" && segmentation.candidates?.length === 1) {
      segmentation = { ...segmentation, reason: null, bounds: [segmentation.candidates[0]], glyphs: [], warnings: [...(segmentation.warnings || []), "single-component-library-fallback"] };
    }
    if (segmentation.reason || segmentation.bounds?.length !== count) return { glyphs: [], segmentation, reason: segmentation.reason || "glyph-count-mismatch" };
    const ink = reader.foreground(imageData, category), { labels, boxes } = componentLabels(ink, imageData.width, imageData.height);
    const glyphs = [];
    for (let index = 0; index < segmentation.bounds.length; index++) {
      const bound = segmentation.bounds[index], parentBox = bound.splitFrom ? boxes.find((box) => sameBox(box, bound.splitFrom)) : boxes.find((box) => sameBox(box, bound));
      if (!parentBox) return { glyphs: [], segmentation, reason: "component-mask-unavailable", failedIndex: index };
      const rgba = new Uint8Array(bound.width * bound.height * 4), mask = new Uint8Array(bound.width * bound.height);
      for (let y = 0; y < bound.height; y++) for (let x = 0; x < bound.width; x++) {
        const sx = bound.x + x, sy = bound.y + y, srcPixel = sy * imageData.width + sx;
        if (labels[srcPixel] !== parentBox.id || sx < bound.x || sx >= bound.x + bound.width) continue;
        const dstPixel = y * bound.width + x, src = srcPixel * 4, dst = dstPixel * 4;
        mask[dstPixel] = 255;
        rgba[dst] = imageData.data[src]; rgba[dst + 1] = imageData.data[src + 1]; rgba[dst + 2] = imageData.data[src + 2];
        rgba[dst + 3] = imageData.data[src + 3];
      }
      if (!mask.some(Boolean)) return { glyphs: [], segmentation, reason: "empty-isolated-mask", failedIndex: index };
      const native = { width: bound.width, height: bound.height, rgba, mask };
      const normalized = normalizeGlyph(native), shearEstimate = estimateShear(normalized);
      glyphs.push({ index, bounds: { x: bound.x, y: bound.y, width: bound.width, height: bound.height }, area: parentBox.area,
        native, normalized, sheared: shearGlyph(normalized, shearEstimate), maskCoverage: Array.from(mask).filter(Boolean).length / mask.length });
    }
    const warnings = [...(segmentation.warnings || [])];
    for (let i = 1; i < glyphs.length; i++) {
      const a = glyphs[i - 1].bounds, b = glyphs[i].bounds;
      if (a.x + a.width > b.x) warnings.push(`overlapping-bounds:${i - 1}:${i}`);
    }
    return { glyphs, segmentation, warnings: [...new Set(warnings)], reason: null };
  }
  // Builds the per-glyph masks from the already selected groups returned by
  // locateNumericFields. This deliberately does not call segment() and its
  // result is independent of OCR text or a manually entered digit count.
  function extractGlyphsFromBounds(imageData, category, bounds, reader) {
    assertImageData(imageData);
    if (!reader || typeof reader.foreground !== "function") throw new TypeError("Le masque colorimétrique MSF n’est pas disponible.");
    if (!Array.isArray(bounds) || !bounds.length || bounds.length > 32) return { glyphs: [], reason: "no-physical-glyph-groups", warnings: [] };
    const { width, height } = imageData, ink = reader.foreground(imageData, category);
    const components = componentLabels(ink, width, height);
    const groups = bounds.map((box, index) => {
      if (!box || ![box.x, box.y, box.width, box.height].every(Number.isFinite) || box.width <= 0 || box.height <= 0)
        throw new TypeError(`Rectangle de glyphe invalide à la position ${index + 1}.`);
      const x = Math.max(0, Math.floor(box.x)), y = Math.max(0, Math.floor(box.y));
      const right = Math.min(width, Math.ceil(box.x + box.width)), bottom = Math.min(height, Math.ceil(box.y + box.height));
      return { index, sourceBounds: { ...box }, x, y, width: right - x, height: bottom - y,
        centerX: (box.x + box.width / 2), area: 0, sharedPixelCount: 0, pixels: [], componentIds: new Set() };
    });
    const warnings = [];
    for (let i = 1; i < groups.length; i++) {
      if (groups[i - 1].sourceBounds.x + groups[i - 1].sourceBounds.width > groups[i].sourceBounds.x)
        warnings.push(`overlapping-bounds:${i - 1}:${i}`);
    }
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const at = y * width + x;
      if (!ink[at]) continue;
      const candidates = groups.filter((group) => x >= group.x && x < group.x + group.width && y >= group.y && y < group.y + group.height);
      if (!candidates.length) continue;
      candidates.sort((a, b) => Math.abs(x + .5 - a.centerX) - Math.abs(x + .5 - b.centerX));
      const owner = candidates[0];
      if (candidates.length > 1) owner.sharedPixelCount++;
      owner.pixels.push(at); owner.area++;
      if (components.labels[at]) owner.componentIds.add(components.labels[at]);
    }
    const glyphs = groups.map((group) => {
      if (!group.area) return { index: group.index, bounds: group.sourceBounds, native: null, normalized: null, sheared: null,
        maskCoverage: 0, integrity: { status: "empty", reason: "no-foreground-pixels-in-localizer-group", sharedPixelCount: 0 } };
      let minX = width, minY = height, maxX = -1, maxY = -1;
      for (const p of group.pixels) { const x = p % width, y = Math.floor(p / width); minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
      const nativeWidth = maxX - minX + 1, nativeHeight = maxY - minY + 1;
      const rgba = new Uint8Array(nativeWidth * nativeHeight * 4), mask = new Uint8Array(nativeWidth * nativeHeight);
      for (const p of group.pixels) {
        const x = p % width, y = Math.floor(p / width), local = (y - minY) * nativeWidth + x - minX;
        mask[local] = 255;
        rgba.set(imageData.data.subarray(p * 4, p * 4 + 4), local * 4);
      }
      const native = { width: nativeWidth, height: nativeHeight, rgba, mask };
      const normalized = normalizeGlyph(native), estimate = estimateShear(normalized);
      return { index: group.index, bounds: group.sourceBounds, pixelBounds: { x: minX, y: minY, width: nativeWidth, height: nativeHeight },
        area: group.area, native, normalized, sheared: shearGlyph(normalized, estimate), maskCoverage: group.area / (nativeWidth * nativeHeight),
        integrity: { status: group.sharedPixelCount ? "review" : "isolated", sharedPixelCount: group.sharedPixelCount,
          pixelOwnership: "nearest-localizer-group-center", componentIds: [...group.componentIds], componentCount: group.componentIds.size } };
    });
    if (glyphs.some((glyph) => glyph.integrity.status === "empty")) warnings.push("one-or-more-localizer-groups-have-no-ink");
    if (glyphs.some((glyph) => glyph.integrity.sharedPixelCount)) warnings.push("overlapping-ink-assigned-once-by-nearest-group-center");
    return { glyphs, warnings: [...new Set(warnings)], reason: null, source: "shared-localizer-groups" };
  }
  function validateGlyphSelection(glyphs, labels, excluded, confirmedValue = "") {
    const value = String(confirmedValue ?? "").replace(/\D/g, ""), excludedSet = new Set(excluded || []);
    const selected = glyphs.map((glyph, index) => ({ glyph, index, digit: String(labels?.[index] ?? "") }))
      .filter((item) => !excludedSet.has(item.index) && item.digit !== "");
    const invalid = selected.filter(({ glyph, digit }) => !glyph?.native || !/^\d$/.test(digit));
    const contradictions = value.length === glyphs.length
      ? selected.filter(({ index, digit }) => digit !== value[index]).map(({ index }) => index) : [];
    const valid = selected.length > 0 && invalid.length === 0 && contradictions.length === 0;
    return { valid, confirmedValue: value, selected, invalidIndices: invalid.map((item) => item.index),
      contradictionIndices: contradictions, excludedIndices: [...excludedSet].sort((a, b) => a - b),
      pendingIndices: glyphs.map((_, index) => index).filter((index) => !excludedSet.has(index) && !String(labels?.[index] ?? "")),
      valueLengthMismatch: Boolean(value && value.length !== glyphs.length),
      warning: !selected.length ? "Identifie au moins un glyphe avant validation." : invalid.length ? "Corrige l’identification des glyphes sélectionnés." :
        contradictions.length ? "Une identification contredit la valeur réelle saisie." : null };
  }
  function validateManualValue(value, glyphCount) {
    const digits = String(value ?? "").replace(/\D/g, "");
    return { digits, valid: digits.length > 0 && digits.length === glyphCount, digitCount: digits.length, glyphCount,
      warning: !digits ? "Saisis la valeur confirmée (chiffres uniquement)." : digits.length !== glyphCount ? `La valeur comporte ${digits.length} chiffre(s), mais ${glyphCount} glyphe(s) sont segmentés.` : null };
  }
  async function sha256(bytes, cryptoObject = globalThis.crypto) {
    if (cryptoObject?.subtle) {
      const digest = await cryptoObject.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
    }
    let hash = 2166136261;
    for (const b of bytes) hash = Math.imul(hash ^ b, 16777619);
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }
  async function createReference(glyph, digit, provenance, cryptoObject) {
    if (!/^\d$/.test(String(digit))) throw new TypeError("L’identification doit être un chiffre de 0 à 9.");
    if (provenance?.synthetic === true) throw new TypeError("Les références synthétiques sont interdites dans la bibliothèque.");
    const native = glyph.native, normalized = glyph.normalized || normalizeGlyph(native), sheared = glyph.sheared || shearGlyph(normalized);
    const fingerprintBytes = new Uint8Array(native.rgba.length + native.mask.length); fingerprintBytes.set(native.rgba); fingerprintBytes.set(native.mask, native.rgba.length);
    const imageHash = await sha256(fingerprintBytes, cryptoObject);
    const unique = cryptoObject?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const id = `glyph-${imageHash.slice(-16)}-${unique}`;
    return { id, digit: String(digit), familyId: FAMILY_ID, source: { captureId: String(provenance.captureId), captureHash: String(provenance.captureHash), confirmedValue: String(provenance.confirmedValue || ""),
      fileName: String(provenance.fileName || "capture"), field: String(provenance.field), fieldType: provenance.fieldType === "score" ? "score" : "trophy",
      side: provenance.side === "opponent" ? "opponent" : "losp", captureDimensions: { width: Number(provenance.captureWidth), height: Number(provenance.captureHeight) },
      position: Number(provenance.position), segmentIndex: Number(provenance.segmentIndex ?? provenance.position), isolationMethod: "shared-localizer-bounds+color-component-mask", sourceCropRect: provenance.sourceCropRect || null,
      locatorVersion: String(provenance.locatorVersion || "unknown"), locatorMethod: String(provenance.locatorMethod || "unknown"),
      localizationStatus: String(provenance.localizationStatus || "localized"), localizationWarnings: Array.isArray(provenance.localizationWarnings) ? provenance.localizationWarnings : [],
      segmentation: provenance.segmentation || null, glyphBounds: provenance.glyphBounds || null },
      native: { width: native.width, height: native.height, rgba: toBase64(native.rgba), mask: toBase64(native.mask) },
      normalized: { width: normalized.width, height: normalized.height, rgba: toBase64(normalized.rgba), fit: normalized.fit, version: normalized.normalizationVersion },
      sheared: { width: sheared.width, height: sheared.height, rgba: toBase64(sheared.rgba), estimate: sheared.shear },
      metadata: { addedAt: new Date().toISOString(), status: "manually-validated", fingerprint: imageHash, normalizationVersion: NORMALIZATION_VERSION, synthetic: false } };
  }
  function emptyLibrary() { return { schema: SCHEMA, schemaVersion: SCHEMA_VERSION, familyId: FAMILY_ID, exportedAt: null, references: [] }; }
  function referenceKey(ref) { return `${ref.metadata.fingerprint}:${ref.source.captureId}:${ref.source.field}:${ref.source.position}`; }
  function exportLibrary(references) { const payload = { ...emptyLibrary(), exportedAt: new Date().toISOString(), references: [...references] }; validateLibrary(payload); return JSON.stringify(payload, null, 2); }
  function parseLibrary(json) { const data = typeof json === "string" ? JSON.parse(json) : json; return validateLibrary(data); }
  function validateLibrary(data) {
    if (!data || data.schema !== SCHEMA || data.schemaVersion !== SCHEMA_VERSION || !Array.isArray(data.references)) throw new TypeError("Format de bibliothèque non reconnu.");
    for (const ref of data.references) {
      if (!ref || !ref.id || !/^\d$/.test(String(ref.digit)) || ref.metadata?.status !== "manually-validated" || ref.metadata?.synthetic ||
          !ref.source?.captureId || !ref.source?.captureHash || !/^\d*$/.test(ref.source?.confirmedValue ?? "") || !["score", "trophy"].includes(ref.source.fieldType) ||
          !["localScore", "opponentScore", "localTrophies", "opponentTrophies"].includes(ref.source.field) || !["losp", "opponent"].includes(ref.source.side) ||
          !Number.isInteger(ref.source.position) || ref.source.position < 0 || !Number.isInteger(ref.source.segmentIndex) || ref.source.segmentIndex < 0 ||
          !Number.isInteger(ref.source.captureDimensions?.width) || !Number.isInteger(ref.source.captureDimensions?.height) ||
          !Number.isInteger(ref.native?.width) || !Number.isInteger(ref.native?.height) || !ref.native?.rgba || !ref.native?.mask ||
          ref.normalized?.width !== TARGET.width || ref.normalized?.height !== TARGET.height || !ref.normalized?.rgba || !ref.sheared?.width || !ref.sheared?.height || !ref.sheared?.rgba) throw new TypeError("Référence incomplète ou non validée dans la bibliothèque.");
      const n = ref.native.width * ref.native.height;
      if (fromBase64(ref.native.rgba).length !== n * 4 || fromBase64(ref.native.mask).length !== n) throw new TypeError(`Masque ou pixels invalides pour ${ref.id}.`);
      if (fromBase64(ref.normalized.rgba).length !== TARGET.width * TARGET.height * 4 || fromBase64(ref.sheared.rgba).length !== ref.sheared.width * ref.sheared.height * 4) throw new TypeError(`Représentation normalisée invalide pour ${ref.id}.`);
    }
    return data;
  }
  function mergeLibraries(...libraries) {
    const references = new Map();
    for (const lib of libraries) {
      validateLibrary(lib);
      for (const ref of lib.references) if (!references.has(referenceKey(ref))) references.set(referenceKey(ref), ref);
    }
    return { ...emptyLibrary(), exportedAt: new Date().toISOString(), references: [...references.values()] };
  }
  function summarize(references) {
    const byDigit = Object.fromEntries(Array.from({ length: 10 }, (_, d) => [String(d), { total: 0, scores: 0, trophies: 0, previews: [] }]));
    const captureIds = new Set();
    for (const ref of references) { const row = byDigit[ref.digit]; if (!row) continue; row.total++; row[ref.source.fieldType === "score" ? "scores" : "trophies"]++; captureIds.add(ref.source.captureId); if (row.previews.length < 5) row.previews.push(ref.id); }
    return { byDigit, total: references.length, coveredDigits: Object.values(byDigit).filter((r) => r.total).length, missingDigits: Object.keys(byDigit).filter((d) => !byDigit[d].total), distinctCaptures: captureIds.size,
      duplicateCount: references.length - new Set(references.map((ref) => ref.metadata.fingerprint)).size };
  }
  function openDatabase(indexedDBObject = globalThis.indexedDB) {
    if (!indexedDBObject) return Promise.reject(new Error("IndexedDB n’est pas disponible sur ce navigateur."));
    return new Promise((resolve, reject) => {
      const request = indexedDBObject.open(DB_NAME, 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "id" }); };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error || new Error("Ouverture IndexedDB impossible."));
    });
  }
  function requestResult(request) { return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error || new Error("Opération IndexedDB impossible.")); }); }
  async function createStore(indexedDBObject = globalThis.indexedDB) {
    const db = await openDatabase(indexedDBObject);
    const run = async (mode, action) => { const tx = db.transaction(STORE_NAME, mode); const result = action(tx.objectStore(STORE_NAME)); await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error("Transaction IndexedDB annulée.")); }); return result; };
    return { async list() { const tx = db.transaction(STORE_NAME, "readonly"); return requestResult(tx.objectStore(STORE_NAME).getAll()); },
      async put(ref) { await run("readwrite", (s) => s.put(ref)); return ref; }, async delete(id) { await run("readwrite", (s) => s.delete(id)); }, async clear() { await run("readwrite", (s) => s.clear()); }, close() { db.close(); } };
  }

  function init(root) {
    const section = root.document.getElementById("numericGlyphLibrary");
    if (!section || section.dataset.ready === "true") return;
    section.dataset.ready = "true";
    const $ = (selector) => section.querySelector(selector), status = $("#numericLibraryStatus"), captureSelect = $("#numericLibraryCapture"), fieldSelect = $("#numericLibraryField");
    let store = null, files = [], current = null, references = [];
    const drafts = new Map(), fieldProgress = new Map(), reviewedCaptures = new Set();
    const setStatus = (message, error = false) => { status.textContent = message; status.classList.toggle("is-error", error); };
    const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    function updateCollectionProgress() {
      const fields = [...fieldProgress.values()], detected = fields.reduce((n, row) => n + row.glyphCount, 0);
      const validated = fields.reduce((n, row) => n + row.validatedCount, 0), excluded = fields.reduce((n, row) => n + row.excludedCount, 0);
      $("#numericLibraryProgress").textContent = files.length
        ? `Capture ${Number(captureSelect.value) + 1}/${files.length} · champ ${fieldSelect.selectedIndex + 1}/4 · ${reviewedCaptures.size} capture(s) examinée(s) · ${fields.length} champ(s) préparé(s) · ${detected} glyphe(s) détecté(s) · ${validated} glyphe(s) validé(s) · ${excluded} exclu(s) · ${references.length} référence(s) enregistrée(s).`
        : "Aucune capture importée.";
    }
    function updateCaptureOptions() {
      const prior = captureSelect.value;
      captureSelect.innerHTML = files.map((entry, i) => {
        const name = String(entry.name || `Capture ${i + 1}`), short = name.length > 34 ? `${name.slice(0, 15)}…${name.slice(-15)}` : name;
        return `<option value="${i}" title="${escape(name)}">${escape(short)}</option>`;
      }).join("");
      if (files.length) captureSelect.value = String(Math.min(Number(prior) || 0, files.length - 1));
      updateCollectionProgress();
    }
    async function refreshReferences() {
      if (!store) return;
      references = await store.list();
      const storedFields = new Map();
      for (const ref of references) {
        const key = `${ref.source.captureId}:${ref.source.field}`, row = storedFields.get(key) || { captureId: ref.source.captureId, positions: new Set(), groupCount: 0 };
        row.positions.add(ref.source.position); row.groupCount = Math.max(row.groupCount, Number(ref.source.segmentation?.physicalGroupCount) || 0);
        storedFields.set(key, row); reviewedCaptures.add(ref.source.captureId);
      }
      for (const [key, row] of storedFields) if (!fieldProgress.has(key)) fieldProgress.set(key, {
        captureId: row.captureId, glyphCount: row.groupCount || row.positions.size, validatedCount: row.positions.size, excludedCount: 0
      });
      const summary = summarize(references);
      $("#numericLibrarySummary").textContent = `${summary.total} référence(s) · ${summary.coveredDigits}/10 chiffres couverts · ${summary.distinctCaptures} capture(s) source(s) · ${summary.duplicateCount} doublon(s) détecté(s).`;
      $("#numericLibraryDigits").innerHTML = Object.entries(summary.byDigit).map(([digit, row]) => {
        const rows = references.filter((ref) => ref.digit === digit).map((ref) => `<div class="numeric-library-reference"><div class="numeric-library-reference-previews"><canvas data-ref-native="${escape(ref.id)}" width="${ref.native.width}" height="${ref.native.height}" aria-label="Pixels originaux masqués, chiffre ${digit}"></canvas><canvas data-ref-normalized="${escape(ref.id)}" width="48" height="64" aria-label="Version normalisée, chiffre ${digit}"></canvas><canvas data-ref-sheared="${escape(ref.id)}" width="${ref.sheared.width}" height="${ref.sheared.height}" aria-label="Version redressée, chiffre ${digit}"></canvas></div><div><strong>${escape(ref.source.fileName)}</strong><br>${escape(ref.source.field)} · ${escape(ref.source.fieldType)} · ${escape(ref.source.side)}<br>${ref.native.width}×${ref.native.height} px · position ${ref.source.position + 1}<br><small>ID ${escape(ref.id)}<br>Capture ${escape(ref.source.captureId.slice(0, 16))}…</small></div><button type="button" class="secondary-button" data-delete-ref="${escape(ref.id)}">Supprimer cette référence</button></div>`).join("");
        return `<article class="numeric-library-digit"><strong>${digit}</strong><span>${row.total} réf. · scores ${row.scores} · trophées ${row.trophies}</span>${row.total ? `<details><summary>Examiner ${row.total} référence(s)</summary>${rows}</details>` : `<small>Manquant</small>`}</article>`;
      }).join("");
      for (const canvas of $("#numericLibraryDigits").querySelectorAll("[data-ref-native]")) { const ref = references.find((item) => item.id === canvas.dataset.refNative); if (ref) drawBytes(canvas, ref.native.width, ref.native.height, fromBase64(ref.native.rgba)); }
      for (const canvas of $("#numericLibraryDigits").querySelectorAll("[data-ref-normalized]")) { const ref = references.find((item) => item.id === canvas.dataset.refNormalized); if (ref) drawBytes(canvas, 48, 64, fromBase64(ref.normalized.rgba)); }
      for (const canvas of $("#numericLibraryDigits").querySelectorAll("[data-ref-sheared]")) { const ref = references.find((item) => item.id === canvas.dataset.refSheared); if (ref) drawBytes(canvas, ref.sheared.width, ref.sheared.height, fromBase64(ref.sheared.rgba)); }
      $("#numericLibraryCoverage").textContent = summary.missingDigits.length ? `À collecter en priorité : ${summary.missingDigits.join(", ")}.` : "Les dix chiffres disposent d’au moins une référence.";
      $("#numericLibraryTotal").textContent = `${summary.total} glyphes validés`;
      updateCollectionProgress();
    }
    function renderGlyphs() {
      const host = $("#numericLibraryGlyphs");
      if (!current?.extraction) { host.innerHTML = ""; return; }
      if (!current.extraction.glyphs?.length) {
        host.innerHTML = "";
        $("#numericLibraryLengthCheck").textContent = `Aucun groupe physique exploitable n’a été fourni par le localisateur (${current.localization?.status || "indisponible"}). ${current.extraction.reason || "Vérifie la localisation partagée et réessaie."} Aucune référence ne peut être validée.`;
        return;
      }
      const length = current.value.replace(/\D/g, "").length, count = current.extraction.glyphs.length;
      const mismatch = length && length !== count ? `La valeur contient ${length} chiffre(s) pour ${count} groupes physiques. La segmentation reste celle du localisateur; identifie chaque groupe ou laisse la valeur vide pour une validation individuelle.` : "La segmentation provient du localisateur partagé et ne dépend pas de l’OCR.";
      $("#numericLibraryLengthCheck").textContent = current.localizationBlocked
        ? `Localisation ${current.localization?.status || "indisponible"} : ${[...(current.localization?.warnings || []), current.localization?.reason].filter(Boolean).join(" · ") || "aucun rectangle final validé"}. Aucune référence ne peut être créée à partir de ce champ.`
        : `${count} groupe(s) physique(s) fourni(s) par le localisateur. ${mismatch}`;
      host.innerHTML = current.extraction.glyphs.map((glyph, index) => {
        const selected = current.labels[index] ?? "", isExcluded = current.excluded.has(index), isValidated = current.validatedIndices.has(index);
        const statusText = isExcluded ? "Exclu" : !glyph.native ? "À contrôler · masque vide" : isValidated ? "Validé" : selected ? "Identifié · à valider" : "Détecté · à identifier";
        const previews = glyph.native ? `<div class="numeric-library-previews"><figure><figcaption>Natif</figcaption><canvas data-glyph="${index}" width="${glyph.native.width}" height="${glyph.native.height}" aria-label="Glyphe natif isolé ${index + 1}"></canvas></figure><figure><figcaption>Normalisé 48×64</figcaption><canvas data-normalized="${index}" width="48" height="64" aria-label="Glyphe normalisé ${index + 1}"></canvas></figure><figure><figcaption>Redressé</figcaption><canvas data-sheared="${index}" width="${glyph.sheared.width}" height="${glyph.sheared.height}" aria-label="Glyphe redressé ${index + 1}"></canvas></figure></div>` : `<p class="is-error">Aucun pixel isolé dans ce groupe.</p>`;
        const metrics = glyph.native ? `${glyph.area} pixel(s) de masque · ${glyph.native.width}×${glyph.native.height} px natifs · pente ${glyph.sheared.shear.slope.toFixed(2)} · confiance d’estimation ${Math.round(glyph.sheared.shear.confidence * 100)} %${glyph.integrity.sharedPixelCount ? ` · ${glyph.integrity.sharedPixelCount} pixel(s) attribué(s) dans des rectangles chevauchants` : ""}` : "Référence désactivée tant que le masque reste vide.";
        return `<article class="numeric-library-glyph"><strong>Position physique ${index + 1} · ${statusText}</strong>${previews}<label>Identification manuelle du chiffre<select data-digit-index="${index}" ${glyph.native ? "" : "disabled"}><option value="">À identifier</option>${Array.from({ length: 10 }, (_, d) => `<option value="${d}" ${selected === String(d) ? "selected" : ""}>${d}</option>`).join("")}</select></label><label class="numeric-library-exclude"><input type="checkbox" data-exclude-index="${index}" ${isExcluded ? "checked" : ""}> Exclure cette position physique</label><small>Rectangle ${glyph.bounds.x},${glyph.bounds.y} · ${glyph.bounds.width}×${glyph.bounds.height} · ${metrics}</small></article>`;
      }).join("");
      $("#numericLibraryReviewed").checked = false;
      current.extraction.glyphs.forEach((glyph, index) => {
        if (!glyph.native) return;
        drawBytes(host.querySelector(`[data-glyph="${index}"]`), glyph.native.width, glyph.native.height, glyph.native.rgba);
        drawBytes(host.querySelector(`[data-normalized="${index}"]`), 48, 64, glyph.normalized.rgba);
        drawBytes(host.querySelector(`[data-sheared="${index}"]`), glyph.sheared.width, glyph.sheared.height, glyph.sheared.rgba);
      });
      if (current.extraction.warnings?.length) $("#numericLibraryLengthCheck").textContent += ` Contrôle visuel requis : ${current.extraction.warnings.join(", ")}.`;
      if (length && length !== count) $("#numericLibraryLengthCheck").textContent += ` ${mismatch}`;
      updateCollectionProgress();
    }
    function drawBytes(canvas, width, height, bytes) {
      if (!canvas) return;
      const context = canvas.getContext("2d");
      context.putImageData(new ImageData(new Uint8ClampedArray(bytes), width, height), 0, 0);
    }
    function decodeFile(file) {
      if (root.createImageBitmap) return root.createImageBitmap(file);
      return new Promise((resolve, reject) => { const image = new Image(), url = URL.createObjectURL(file); image.onload = () => { URL.revokeObjectURL(url); resolve(image); }; image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image impossible à décoder.")); }; image.src = url; });
    }
    function saveCurrentDraft() {
      if (!current?.draftKey) return;
      drafts.set(current.draftKey, { value: $("#numericLibraryValue").value, labels: [...current.labels], excluded: [...current.excluded],
        manuallyLabeled: [...current.manuallyLabeled], validatedIndices: [...current.validatedIndices] });
    }
    function fieldGroups(localization, field, rect) {
      if (field.endsWith("Score")) return (localization.glyphs || []).map((box) => ({ ...box, x: box.x - rect.x, y: box.y - rect.y }));
      const segmentation = localization.diagnostics?.segmentation, band = localization.diagnostics?.segmentationBandRect;
      if (!Array.isArray(segmentation?.bounds) || !band) return [];
      return segmentation.bounds.map((box) => ({ ...box, x: band.x + box.x - rect.x, y: band.y + box.y - rect.y }));
    }
    function drawContext(image, rect) {
      const canvas = $("#numericLibrarySourceContext"), scale = Math.min(720 / image.width, 260 / image.height, 1);
      canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d"); context.drawImage(image, 0, 0, canvas.width, canvas.height);
      if (rect) { context.strokeStyle = "#ffcf43"; context.lineWidth = Math.max(2, canvas.width / image.width * 3); context.strokeRect(rect.x * scale, rect.y * scale, rect.width * scale, rect.height * scale); }
    }
    async function prepare() {
      saveCurrentDraft();
      current = null;
      $("#numericLibraryValue").value = ""; $("#numericLibraryValue").disabled = true;
      $("#numericLibraryGlyphs").innerHTML = ""; $("#numericLibraryReviewed").checked = false;
      $("#numericLibraryOcrButton").disabled = true;
      $("#numericLibraryCrop").width = $("#numericLibraryCrop").height = 1;
      $("#numericLibrarySourceContext").width = $("#numericLibrarySourceContext").height = 1;
      const entry = files[Number(captureSelect.value)]; if (!entry?.file) { setStatus("Importe d’abord une ou plusieurs captures dans le panneau principal.", true); return; }
      const field = fieldSelect.value; setStatus(`Localisation partagée · ${entry.name} · ${field}…`);
      try {
        const located = await root.WarResultsVisionEngine.locateNumericFields(entry.file, [field]);
        const localization = located.fields?.[field], rect = localization?.finalRect;
        const image = await decodeFile(entry.file), captureHash = await sha256(new Uint8Array(await entry.file.arrayBuffer()));
        reviewedCaptures.add(captureHash);
        const imageData = rect ? (() => {
          const canvas = root.document.createElement("canvas"); canvas.width = Math.max(1, Math.round(rect.width)); canvas.height = Math.max(1, Math.round(rect.height));
          const context = canvas.getContext("2d", { willReadFrequently: true }); context.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
          return context.getImageData(0, 0, canvas.width, canvas.height);
        })() : null;
        drawContext(image, rect || localization?.proportionalRect || localization?.initialRect || null);
        const prior = drafts.get(`${captureHash}:${field}`) || {};
        const persistedPositions = references.filter((ref) => ref.source.captureId === captureHash && ref.source.field === field).map((ref) => ref.source.position);
        const groups = rect ? fieldGroups(localization, field, rect) : [];
        const extraction = rect && localization?.status === "localized" && groups.length
          ? extractGlyphsFromBounds(imageData, field.endsWith("Score") ? "score" : "trophy", groups, root.WarResultsDigitReader)
          : { glyphs: [], warnings: [], reason: localization?.status !== "localized" ? localization?.reason || localization?.status || "field-not-localized" : "physical-glyph-groups-unavailable" };
        current = { entry, field, rect: rect || null, dimensions: located.dimensions, imageData, localization, extraction,
          value: prior.value || "", labels: prior.labels || [], excluded: new Set(prior.excluded || []), manuallyLabeled: new Set(prior.manuallyLabeled || []),
          validatedIndices: new Set([...(prior.validatedIndices || []), ...persistedPositions]), captureHash, draftKey: `${captureHash}:${field}`,
          localizationBlocked: localization?.status !== "localized", ocr: null };
        $("#numericLibraryCrop").width = rect ? Math.min(480, imageData.width) : 1; $("#numericLibraryCrop").height = rect ? Math.max(1, Math.round(imageData.height * Math.min(480 / imageData.width, 1))) : 1;
        if (rect) $("#numericLibraryCrop").getContext("2d").drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, $("#numericLibraryCrop").width, $("#numericLibraryCrop").height);
        image.close?.();
        $("#numericLibraryValue").value = current.value; $("#numericLibraryValue").disabled = false;
        $("#numericLibraryOcr").textContent = "OCR non exécuté. Tu peux demander une suggestion facultative sur cette découpe; elle ne pilote ni le nombre ni les positions des glyphes.";
        $("#numericLibraryOcrButton").disabled = !rect || localization?.status !== "localized";
        for (const index of current.manuallyLabeled) current.labels[index] = current.labels[index] || "";
        if (current.value && current.value.replace(/\D/g, "").length === extraction.glyphs.length && !prior.labels?.length) {
          current.labels = [...current.value.replace(/\D/g, "")];
        }
        if (current.extraction.glyphs.length) fieldProgress.set(current.draftKey, { captureId: captureHash, glyphCount: current.extraction.glyphs.length,
          validatedCount: current.validatedIndices.size, excludedCount: current.excluded.size });
        renderGlyphs(); updateCaptureOptions();
        setStatus(rect && localization?.status === "localized" ? `Découpe partagée prête · ${entry.name} · ${field}. Aucun OCR n’a déterminé les groupes physiques.${localization.warnings?.length ? " Vérifie les avertissements avant toute validation." : ""}`
          : `Localisation ${localization?.status || "indisponible"} · ce champ ne peut pas alimenter la bibliothèque.`, !rect || localization?.status !== "localized");
      } catch (error) { setStatus(error.message || String(error), true); }
    }
    async function suggestOcr() {
      if (!current?.rect || current.localizationBlocked) return;
      const button = $("#numericLibraryOcrButton"); button.disabled = true; setStatus("Suggestion OCR facultative sur la découpe déjà localisée…");
      try {
        const result = await root.WarResultsVisionEngine.analyzeField(current.entry.file, current.field, current.rect);
        current.ocr = { raw: String(result.raw || ""), confidence: result.confidence ?? null, ms: result.ms ?? null };
        $("#numericLibraryOcr").textContent = current.ocr.raw
          ? `Suggestion Tesseract : « ${current.ocr.raw} »${current.ocr.confidence == null ? "" : ` · confiance ${Math.round(current.ocr.confidence)} %`}. Cette suggestion ne modifie ni la valeur réelle ni la segmentation.`
          : "Tesseract n’a pas proposé de texte. La segmentation physique reste disponible.";
        setStatus("Suggestion OCR terminée; les groupes, positions et masques n’ont pas été recalculés.");
      } catch (error) {
        current.ocr = { raw: "", error: error.message || String(error) };
        $("#numericLibraryOcr").textContent = `Suggestion OCR indisponible : ${current.ocr.error}. L’extraction physique reste utilisable.`;
        setStatus("OCR indisponible; la validation manuelle des glyphes reste possible.");
      } finally { button.disabled = false; saveCurrentDraft(); }
    }
    function valueChanged() {
      if (!current) return;
      current.value = $("#numericLibraryValue").value;
      const digits = current.value.replace(/\D/g, ""), glyphs = current.extraction?.glyphs || [];
      if (digits.length === glyphs.length) digits.split("").forEach((digit, index) => { if (!current.manuallyLabeled.has(index)) current.labels[index] = digit; });
      renderGlyphs(); saveCurrentDraft();
    }
    async function validateCurrent() {
      if (!current?.extraction?.glyphs?.length || current.extraction.reason) { setStatus("Aucun groupe physique exploitable. Aucune référence n’a été validée.", true); return; }
      if (current.localizationBlocked) { setStatus("La localisation est incertaine ou échouée. Ce champ ne peut pas alimenter la bibliothèque.", true); return; }
      if (!$("#numericLibraryReviewed").checked) { setStatus("Confirme d’abord avoir vérifié la découpe et chaque glyphe inclus.", true); return; }
      const glyphs = current.extraction.glyphs, labels = [...$("#numericLibraryGlyphs").querySelectorAll("[data-digit-index]")].map((input) => input.value);
      const excluded = new Set([...$("#numericLibraryGlyphs").querySelectorAll("[data-exclude-index]:checked")].map((input) => Number(input.dataset.excludeIndex)));
      const selection = validateGlyphSelection(glyphs, labels, excluded, $("#numericLibraryValue").value);
      if (!selection.valid) { setStatus(selection.warning || "Les glyphes sélectionnés nécessitent une identification manuelle.", true); return; }
      const field = current.field, side = field.startsWith("opponent") ? "opponent" : "losp", fieldType = field.endsWith("Score") ? "score" : "trophy", additions = [];
      for (const { glyph, index, digit } of selection.selected) additions.push(await createReference(glyph, digit, {
        captureId: current.captureHash, captureHash: current.captureHash, confirmedValue: selection.confirmedValue, fileName: current.entry.name, field, fieldType, side,
        captureWidth: current.dimensions.width, captureHeight: current.dimensions.height, position: index, segmentIndex: index, sourceCropRect: current.rect,
        locatorVersion: fieldType === "score" ? "score-locator-v0.2.0" : "numeric-locator+vertical-recovery-combined",
        locatorMethod: current.localization.method, localizationStatus: current.localization.status, localizationWarnings: current.localization.warnings || [],
        glyphBounds: { ...glyph.bounds, coordinateSpace: "field-crop-pixels" },
        segmentation: { source: "shared-localizer-groups", physicalGroupCount: glyphs.length, bounds: glyph.bounds,
          integrity: glyph.integrity, extractionWarnings: current.extraction.warnings || [] }
      }, root.crypto));
      const known = new Set(references.map(referenceKey)); let added = 0, duplicates = 0;
      for (const ref of additions) { if (known.has(referenceKey(ref))) { duplicates++; continue; } known.add(referenceKey(ref)); await store.put(ref); added++; }
      current.validatedIndices = new Set([...current.validatedIndices, ...selection.selected.map((item) => item.index)]); current.excluded = excluded;
      drafts.set(current.draftKey, { value: $("#numericLibraryValue").value, labels, excluded: [...excluded], manuallyLabeled: [...current.manuallyLabeled], validatedIndices: [...current.validatedIndices] });
      fieldProgress.set(current.draftKey, { captureId: current.captureHash, glyphCount: glyphs.length, validatedCount: current.validatedIndices.size, excludedCount: excluded.size });
      await refreshReferences(); renderGlyphs();
      setStatus(`${selection.selected.length} glyphe(s) identifié(s) et validé(s) sur leurs positions physiques d’origine · ${added} nouvelle(s) référence(s) unique(s) enregistrée(s)${duplicates ? ` · ${duplicates} doublon(s) déjà présent(s)` : ""}${selection.pendingIndices.length ? ` · ${selection.pendingIndices.length} position(s) restent à identifier` : ""}${selection.valueLengthMismatch ? ` · valeur complète conservée (${selection.confirmedValue.length} chiffres), sans contrainte de segmentation` : ""}.`);
    }
    async function exportJson() { return exportLibrary(await store.list()); }
    $("#numericLibraryPrepare").addEventListener("click", prepare);
    $("#numericLibraryOcrButton").addEventListener("click", suggestOcr);
    $("#numericLibraryValue").addEventListener("input", valueChanged);
    $("#numericLibraryValidate").addEventListener("click", () => validateCurrent().catch((e) => setStatus(e.message, true)));
    captureSelect.addEventListener("change", () => { saveCurrentDraft(); updateCaptureOptions(); prepare(); });
    fieldSelect.addEventListener("change", () => { saveCurrentDraft(); updateCaptureOptions(); prepare(); });
    $("#numericLibraryGlyphs").addEventListener("change", (event) => {
      if (!current) return;
      const target = event.target;
      if (target.matches("[data-digit-index]")) { const index = Number(target.dataset.digitIndex); current.labels[index] = target.value; current.manuallyLabeled.add(index); }
      if (target.matches("[data-exclude-index]")) { const index = Number(target.dataset.excludeIndex); if (target.checked) current.excluded.add(index); else current.excluded.delete(index); }
      saveCurrentDraft(); renderGlyphs();
    });
    $("#numericLibraryDigits").addEventListener("click", async (event) => {
      const deleteButton = event.target.closest("[data-delete-ref]");
      if (deleteButton) { const ref = references.find((item) => item.id === deleteButton.dataset.deleteRef); if (!ref || !root.confirm(`Supprimer la référence ${ref.id} du chiffre ${ref.digit} ?`)) return; await store.delete(ref.id); await refreshReferences(); setStatus(`Référence ${ref.id} supprimée.`); return; }
      const button = event.target.closest("[data-delete-digit]"); if (!button) return;
      const digit = button.dataset.deleteDigit, matches = references.filter((ref) => ref.digit === digit);
      if (!root.confirm(`Supprimer les ${matches.length} référence(s) du chiffre ${digit} ?`)) return;
      for (const ref of matches) await store.delete(ref.id); await refreshReferences(); setStatus(`Références du chiffre ${digit} supprimées.`);
    });
    $("#numericLibraryDeleteOne").addEventListener("click", async () => {
      const id = root.prompt("ID exact de la référence à supprimer"); if (!id || !references.some((ref) => ref.id === id)) return;
      await store.delete(id); await refreshReferences(); setStatus(`Référence ${id} supprimée.`);
    });
    $("#numericLibraryReset").addEventListener("click", async () => { if (!root.confirm("Réinitialiser toute la bibliothèque numérique locale ? Cette action ne touche pas aux résultats War Results Vision.")) return; await store.clear(); await refreshReferences(); setStatus("Bibliothèque locale réinitialisée."); });
    $("#numericLibraryExport").addEventListener("click", async () => {
      try { const json = await exportJson(), blob = new Blob([json], { type: "application/json" }), url = URL.createObjectURL(blob), a = root.document.createElement("a"); a.href = url; a.download = `msf-numeric-glyph-library-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setStatus("Export complet téléchargé. Les pixels originaux, masques et métadonnées sont inclus."); }
      catch (error) { setStatus(`Export impossible : ${error.message}`, true); }
    });
    $("#numericLibraryCopy").addEventListener("click", async () => {
      try { const json = await exportJson(); await root.navigator.clipboard.writeText(json); setStatus("JSON copié dans le presse-papiers."); }
      catch (error) { setStatus(`Copie indisponible. Utilise le téléchargement JSON. ${error.message}`, true); }
    });
    $("#numericLibraryImport").addEventListener("change", async (event) => {
      try {
        let imported = emptyLibrary();
        for (const file of event.target.files || []) imported = mergeLibraries(imported, parseLibrary(await file.text()));
        const existing = await store.list(), merged = mergeLibraries({ ...emptyLibrary(), references: existing }, imported), currentKeys = new Set(existing.map(referenceKey));
        for (const ref of merged.references) if (!currentKeys.has(referenceKey(ref))) await store.put(ref);
        await refreshReferences(); setStatus(`Import fusionné et contrôlé · ${merged.references.length} référence(s) dans l’ensemble · les doublons ont été écartés.`);
      } catch (error) { setStatus(`Import rejeté : ${error.message}`, true); } finally { event.target.value = ""; }
    });
    root.addEventListener("war-results-capture-batch", (event) => { files = Array.isArray(event.detail) ? event.detail.filter((item) => item?.file) : []; updateCaptureOptions(); });
    updateCaptureOptions();
    createStore().then((value) => { store = value; refreshReferences().then(() => setStatus("Bibliothèque locale restaurée. Les résultats OCR existants sont inchangés.")); })
      .catch((error) => setStatus(`Le stockage persistant est indisponible : ${error.message}. Tu peux encore examiner les captures, mais la conservation de références est bloquée.`, true));
  }

  return { schema: SCHEMA, schemaVersion: SCHEMA_VERSION, familyId: FAMILY_ID, normalizationVersion: NORMALIZATION_VERSION, target: TARGET,
    normalizeGlyph, estimateShear, shearGlyph, componentLabels, extractGlyphs, extractGlyphsFromBounds, validateGlyphSelection, validateManualValue, sha256, createReference, emptyLibrary, exportLibrary, parseLibrary, validateLibrary, mergeLibraries, summarize, createStore, init };
});
