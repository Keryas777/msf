/* Experimental orchestration for Template Matching; deliberately separate from production OCR. */
(function (root) {
  "use strict";
  const fields = ["localScore", "opponentScore", "localTrophies", "opponentTrophies"];
  const labels = { localScore: "Score LoSP", opponentScore: "Score adverse", localTrophies: "Trophées LoSP", opponentTrophies: "Trophées adverses" };
  const reps = ["native", "normalized", "sheared"], corpora = ["score", "trophy", "mixed"];
  const $ = (s) => root.document.querySelector(s);
  let files = [], lastReport = null, libraryPromise = null, fieldPreviews = new Map();
  const status = (s, error = false) => { const el = $("#templateMatchingStatus"); if (el) { el.textContent = s; el.classList.toggle("is-error", error); } };
  const b64 = (value) => root.WarResultsTemplateMatching.decodeBase64(value);
  const asMask = (data) => ({ mask: data.mask ? root.WarResultsTemplateMatching.decodeBytes(data.mask) : root.WarResultsTemplateMatching.maskFromRgba(data.rgba, data.width, data.height), width: data.width, height: data.height });
  async function loadLibrary() {
    if (!libraryPromise) libraryPromise = root.fetch("./data/numeric-references/manifest.json").then((r) => { if (!r.ok) throw new Error(`Manifeste permanent indisponible (${r.status}).`); return r.json(); }).then(async (manifest) => {
      if (manifest.schema !== "msf-numeric-reference-manifest" || !manifest.libraryPath || !manifest.sha256) throw new Error("Manifeste de références invalide.");
      const response = await root.fetch(`./data/numeric-references/${manifest.libraryPath}`); if (!response.ok) throw new Error(`Bibliothèque permanente indisponible (${response.status}).`);
      const bytes = new Uint8Array(await response.arrayBuffer()), digest = [...new Uint8Array(await root.crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
      if (digest !== manifest.sha256 || bytes.length !== manifest.sizeBytes) throw new Error("L’intégrité de la bibliothèque permanente ne correspond pas au manifeste.");
      const lib = JSON.parse(new TextDecoder().decode(bytes));
      if (lib.schema !== "msf-numeric-glyph-library" || lib.schemaVersion !== 1 || !Array.isArray(lib.references)) throw new Error("Schéma de bibliothèque permanente invalide.");
      const invalid = lib.references.filter((r) => !/^\d$/.test(String(r.digit)) || r.metadata?.status !== "manually-validated" || r.metadata?.synthetic || !r.source?.captureId || !r.native?.rgba || !r.native?.mask || !r.normalized?.rgba || !r.sheared?.rgba);
      if (invalid.length) throw new Error(`${invalid.length} référence(s) permanente(s) invalide(s).`);
      if (lib.references.length !== manifest.referenceCount) throw new Error("Le nombre de références ne correspond pas au manifeste.");
      return { ...lib, manifest };
    });
    return libraryPromise;
  }
  async function bytesFor(file) { return new Uint8Array(await file.arrayBuffer()); }
  async function hash(bytes) {
    const digest = await root.crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  async function decode(file) {
    if (root.createImageBitmap) return root.createImageBitmap(file);
    return new Promise((resolve, reject) => { const img = new Image(), url = URL.createObjectURL(file); img.onload = () => { URL.revokeObjectURL(url); resolve(img); }; img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Capture illisible.")); }; img.src = url; });
  }
  function groupsFor(field, localized, rect) {
    if (field.endsWith("Score")) return (localized.glyphs || []).map((b) => ({ ...b, x: b.x - rect.x, y: b.y - rect.y }));
    const bounds = localized.diagnostics?.segmentation?.bounds, band = localized.diagnostics?.segmentationBandRect;
    return Array.isArray(bounds) && band ? bounds.map((b) => ({ ...b, x: band.x + b.x - rect.x, y: band.y + b.y - rect.y })) : [];
  }
  async function extract(file, field) {
    const located = await root.WarResultsVisionEngine.locateNumericFields(file, [field]);
    const result = located.fields?.[field], rect = result?.finalRect;
    if (result?.status !== "localized" || !rect) return { error: result?.reason || result?.status || "localization-failed" };
    const image = await decode(file);
    try {
      const canvas = root.document.createElement("canvas"); canvas.width = Math.round(rect.width); canvas.height = Math.round(rect.height);
      const ctx = canvas.getContext("2d", { willReadFrequently: true }); ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height), groups = groupsFor(field, result, rect);
      if (!groups.length) return { error: "physical-groups-unavailable" };
      const reader = root.WarResultsNumericLibrary.componentReaderForField(field, pixels);
      const extracted = root.WarResultsNumericLibrary.extractGlyphsFromBounds(pixels, field.endsWith("Score") ? "score" : "trophy", groups, reader);
      return { rect, extracted, cropPreview: canvas.toDataURL("image/png"), dimensions: { width: image.width, height: image.height }, warnings: result.warnings || [] };
    } finally { image.close?.(); }
  }
  function checked(attr) { return [...root.document.querySelectorAll(`[${attr}]:checked`)].map((e) => e.getAttribute(attr)); }
  function selectedFields() { return [...root.document.querySelectorAll("#laboratoryFields input[data-lab-field]:checked")].map((e) => e.dataset.labField).filter((f) => fields.includes(f)); }
  function canvasPreview(bytes, width, height) {
    return `<canvas class="tm-reference-preview" width="${width}" height="${height}" data-preview="${bytes}" data-width="${width}" data-height="${height}"></canvas>`;
  }
  function renderPreviewCanvases() {
    for (const canvas of root.document.querySelectorAll("canvas[data-preview]")) {
      const bytes = b64(canvas.dataset.preview), w = Number(canvas.dataset.width), h = Number(canvas.dataset.height);
      canvas.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(bytes), w, h), 0, 0);
      canvas.removeAttribute("data-preview");
    }
  }
  function evaluate(report, fieldResult) {
    const truth = String(fieldResult.truth || "").replace(/\D/g, "");
    for (const run of fieldResult.configurations) {
      run.evaluation = truth ? { truth, exactField: run.reconstructed === truth,
        glyphs: run.glyphResults.map((g, i) => ({ position: i, correct: g.proposedDigit === truth[i] })) } : null;
    }
    const totals = { glyphs: 0, correct: 0, errors: 0, abstentions: 0 };
    for (const field of report.fields) {
      const truth = String(field.truth || "").replace(/\D/g, "");
      for (const config of field.configurations || []) for (let i = 0, length = Math.max(truth.length, config.glyphResults.length); i < length; i++) {
        const proposed = config.glyphResults[i]?.proposedDigit ?? null, expected = truth[i];
        if (expected == null && !truth) continue;
        totals.glyphs++;
        if (proposed == null) totals.abstentions++;
        else if (expected != null && proposed === expected) totals.correct++;
        else totals.errors++;
      }
    }
    $("#templateMatchingSummary").textContent = `Champs ${report.fields.length} · glyphes évalués ${totals.glyphs} · exacts ${totals.correct}/${totals.glyphs} · erreurs ${totals.errors} · abstentions ${totals.abstentions} · ${report.elapsedMs} ms. Les scores sont des indices visuels, pas des probabilités.`;
    renderConfigurationSummary(report);
  }
  function renderConfigurationSummary(report) {
    const target = $("#templateMatchingConfigurationSummary"); if (!target) return;
    const groups = new Map();
    for (const field of report.fields) for (const config of field.configurations || []) {
      const key = [config.representation, config.corpus, config.exclusion].join("|");
      if (!groups.has(key)) groups.set(key, { representation: config.representation, corpus: config.corpus, exclusion: config.exclusion,
        exactFields: 0, evaluatedFields: 0, evaluatedGlyphs: 0, correctGlyphs: 0, errors: 0, abstentions: 0, elapsedMs: 0 });
      const total = groups.get(key), truth = String(field.truth || "").replace(/\D/g, "");
      total.elapsedMs += Number(config.elapsedMs) || 0;
      if (truth) { total.evaluatedFields++; if (config.reconstructed === truth) total.exactFields++; }
      for (let i = 0, length = Math.max(truth.length, (config.glyphResults || []).length); i < length; i++) {
        const glyph = config.glyphResults[i] || {}, expected = truth[i];
        if (expected == null && !truth) continue;
        total.evaluatedGlyphs++;
        if (expected != null && glyph.proposedDigit === expected) total.correctGlyphs++;
        else if (glyph.proposedDigit == null) total.abstentions++;
        else total.errors++;
      }
    }
    const rows = [...groups.values()];
    if (!rows.length) { target.innerHTML = ""; return; }
    target.innerHTML = `<h4>Comparaison synthétique des configurations</h4><div class="tm-summary-scroll"><table class="tm-summary-table"><thead><tr><th>Représentation</th><th>Corpus</th><th>Références</th><th>Glyphes exacts</th><th>Champs exacts</th><th>Erreurs</th><th>Abstentions</th><th>Temps cumulé</th></tr></thead><tbody>${rows.map((r) => `<tr><th>${r.representation}</th><td>${r.corpus}</td><td>${r.exclusion === "capture" ? "capture exclue" : "complet"}</td><td>${r.correctGlyphs}/${r.evaluatedGlyphs}${r.evaluatedGlyphs ? ` (${Math.round(100 * r.correctGlyphs / r.evaluatedGlyphs)} %)` : ""}</td><td>${r.exactFields}/${r.evaluatedFields}${r.evaluatedFields ? ` (${Math.round(100 * r.exactFields / r.evaluatedFields)} %)` : ""}</td><td>${r.errors}</td><td>${r.abstentions}</td><td>${Math.round(r.elapsedMs)} ms</td></tr>`).join("")}</tbody></table></div>`;
  }
  function render(report) {
    const results = $("#templateMatchingResults");
    results.innerHTML = report.fields.map((field) => `<details class="tm-field"><summary>${field.fileName} · ${labels[field.field]} · ${field.glyphCount} glyphes · ${field.elapsedMs} ms · localisation ${field.localizationStatus}</summary>${field.error ? `<p class="analysis-status is-error">Champ non analysé : ${field.error}</p>` : ""}<img class="tm-field-crop" src="${fieldPreviews.get(field.id) || ""}" alt="Découpe numérique de ${labels[field.field]}"><label>Valeur réelle (évaluation seulement)<input inputmode="numeric" pattern="[0-9]*" data-tm-truth="${field.id}" value="${field.truth || ""}" placeholder="Saisie manuelle après reconnaissance"></label>${field.configurations.map((config) => `<details class="tm-config"><summary>${config.representation} · corpus ${config.corpus} · ${config.exclusion === "capture" ? "capture source exclue" : "bibliothèque complète"} · ${config.reconstructed}</summary>${config.missingDigits.length ? `<p class="analysis-status is-error">Classes sans référence après exclusion : ${config.missingDigits.join(", ")}</p>` : ""}<div class="tm-glyph-list">${config.glyphResults.map((g, i) => `<article class="tm-glyph"><div>${canvasPreview(g.glyphPreview, g.glyphWidth, g.glyphHeight)}<strong>Position ${i + 1}: ${g.proposedDigit ?? "abstention"}</strong><small>Indice ${g.similarity == null ? "—" : g.similarity.toFixed(4)} · second ${g.secondDigit ?? "—"} (${g.secondSimilarity == null ? "—" : g.secondSimilarity.toFixed(4)}) · écart ${g.gap == null ? "—" : g.gap.toFixed(4)} · ${g.elapsedMs} ms</small><small>${g.ambiguity || ""}</small></div><div>${g.bestPreview ? canvasPreview(g.bestPreview.rgba, g.bestPreview.width, g.bestPreview.height) : ""}<small>${g.bestReference ? `Réf. ${g.bestReference.id} · ${g.bestReference.fieldType} · ${g.bestReference.field} · ${g.bestReference.side} · capture ${g.bestReference.captureId.slice(0, 12)}…` : "Aucune référence disponible"}</small><small>Classes: ${g.classes.map((x) => `${x.digit}:${x.similarity == null ? "n/a" : x.similarity.toFixed(3)}`).join(" · ")}</small></div></article>`).join("")}</div></details>`).join("")}</details>`).join("");
    renderPreviewCanvases();
    results.querySelectorAll("[data-tm-truth]").forEach((input) => input.addEventListener("input", () => {
      const row = report.fields.find((f) => f.id === input.dataset.tmTruth); if (!row) return; row.truth = input.value;
      for (const c of row.configurations) for (let i = 0; i < c.glyphResults.length; i++) c.glyphResults[i].truthDigit = row.truth.replace(/\D/g, "")[i] ?? null;
      evaluate(report, row);
    }));
    $("#copyTemplateMatchingJsonButton").disabled = false; $("#exportTemplateMatchingJsonButton").disabled = false;
  }
  function referenceData(ref, representation) { return representation === "native" ? ref.native : representation === "sheared" ? ref.sheared : ref.normalized; }
  async function run() {
    const selected = selectedFields(), representations = checked("data-tm-representation"), selectedCorpora = checked("data-tm-corpus");
    if (!files.length || !selected.length || !representations.length || !selectedCorpora.length) { status("Importe des captures et sélectionne des champs, représentations et corpus.", true); return; }
    const button = $("#runTemplateMatchingButton"); button.disabled = true; status("Chargement de la bibliothèque permanente…");
    try {
      const library = await loadLibrary(), references = root.WarResultsTemplateMatching.prepareReferences(library.references), exclude = $("#templateMatchingExcludeCapture").checked, report = { schema: "msf-template-matching-report", schemaVersion: 1,
        engineVersion: root.WarResultsTemplateMatching.version, libraryVersion: library.manifest.libraryVersion, libraryManifestSha256: library.manifest.sha256, libraryExportedAt: library.exportedAt,
        startedAt: new Date().toISOString(), configurations: { representations, corpora: selectedCorpora, excludeSourceCapture: exclude, compareFullCorpus: $("#templateMatchingCompareFullCorpus").checked, initialAbstentionGap: .025, shiftTolerancePixels: 1, classAggregation: "mean-of-top-three-per-class" },
        library: { totalReferences: library.references.length, excludedReferencesByCapture: {}, referencesByDigit: {}, version: library.schemaVersion }, fields: [], elapsedMs: 0 };
      for (const d of "0123456789") report.library.referencesByDigit[d] = references.filter((r) => r.digit === d).length;
      const started = performance.now();
      for (const file of files) {
        const fileBytes = await bytesFor(file), captureId = await hash(fileBytes);
        report.library.excludedReferencesByCapture[captureId] = references.filter((r) => r.source.captureId === captureId).length;
        for (const field of selected) {
          status(`Localisation et segmentation sans OCR · ${file.name} · ${labels[field]}…`);
          const extraction = await extract(file, field), row = { id: `${captureId}:${field}`, captureId, fileName: file.name, field, truth: "", elapsedMs: 0, configurations: [] };
          if (extraction.error) { row.error = extraction.error; row.localizationStatus = "blocked"; row.glyphCount = 0; report.fields.push(row); continue; }
          row.localizationStatus = "localized"; row.localizationWarnings = extraction.warnings; row.cropRect = extraction.rect; row.glyphCount = extraction.extracted.glyphs.length;
          fieldPreviews.set(row.id, extraction.cropPreview);
          const fieldStarted = performance.now();
          const exclusionModes = exclude ? ($( "#templateMatchingCompareFullCorpus").checked ? [true, false] : [true]) : [false];
          for (const representation of representations) for (const corpus of selectedCorpora) for (const useExclusion of exclusionModes) {
            const config = { representation, corpus, exclusion: useExclusion ? "capture" : "none", glyphResults: [] }, refs = references.filter((r) => corpus === "mixed" || r.source.fieldType === corpus);
            const excluded = useExclusion ? [captureId] : [];
            const excludedRefs = refs.filter((r) => excluded.includes(r.source.captureId));
            config.referenceSelection = { availableReferenceIds: refs.filter((r) => !excluded.includes(r.source.captureId)).map((r) => r.id),
              excludedReferenceIds: excludedRefs.map((r) => r.id), excludedCaptureIds: excluded };
            for (let i = 0; i < extraction.extracted.glyphs.length; i++) {
              const glyph = extraction.extracted.glyphs[i], t0 = performance.now();
              if (!glyph.native || glyph.integrity.status === "ambiguous") { config.glyphResults.push({ proposedDigit: null, ambiguity: glyph.integrity.reason || "invalid-glyph-mask", classes: [], elapsedMs: performance.now() - t0 }); continue; }
              const data = representation === "native" ? glyph.native : representation === "sheared" ? glyph.sheared : glyph.normalized;
              const ranked = root.WarResultsTemplateMatching.rank(asMask(data), refs, { representation, category: corpus, excludeCaptureIds: excluded, shiftTolerance: 1 });
              const best = ranked.best?.references?.[0], source = best && library.references.find((r) => r.id === best.id), previewData = source && referenceData(source, representation);
              const result = { ...ranked, similarity: ranked.best?.similarity ?? null, secondDigit: ranked.second?.digit ?? null, secondSimilarity: ranked.second?.similarity ?? null,
                elapsedMs: performance.now() - t0, truthDigit: null, glyphPreview: btoa(String.fromCharCode(...glyph.native.rgba)), glyphWidth: glyph.native.width, glyphHeight: glyph.native.height,
                bestReference: best ? { id: best.id, captureId: best.captureId, fieldType: best.fieldType, field: best.field, side: best.side } : null,
                bestPreview: previewData ? { rgba: source[representation === "native" ? "native" : representation === "sheared" ? "sheared" : "normalized"].rgba, width: previewData.width, height: previewData.height } : null };
              config.glyphResults.push(result);
            }
            config.missingDigits = rankedMissing(refs, excluded); config.reconstructed = root.WarResultsTemplateMatching.reconstructDigits(config.glyphResults); config.elapsedMs = config.glyphResults.reduce((n, g) => n + g.elapsedMs, 0); row.configurations.push(config);
          }
          row.elapsedMs = performance.now() - fieldStarted; report.fields.push(row);
        }
      }
      report.elapsedMs = performance.now() - started; report.completedAt = new Date().toISOString(); lastReport = report;
      render(report); evaluate(report, report.fields[0] || { configurations: [] }); status(`Comparaison terminée · ${report.fields.length} champ(s). La valeur réelle n’a pas influencé la reconnaissance.`);
    } catch (error) { status(error.message || String(error), true); }
    finally { button.disabled = false; }
  }
  function rankedMissing(refs, excluded) {
    return [..."0123456789"].filter((d) => !refs.some((r) => r.digit === d && !excluded.includes(r.source.captureId)));
  }
  function json() { return root.WarResultsTemplateMatching.serializeReport(lastReport); }
  function exportFile() { const blob = new Blob([json()], { type: "application/json" }), url = URL.createObjectURL(blob), a = root.document.createElement("a"); a.href = url; a.download = "msf-template-matching-diagnostics.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function updateButton() { $("#runTemplateMatchingButton").disabled = !files.length || !selectedFields().length; }
  function init() {
    const panel = $("#templateMatchingPanel"); if (!panel || panel.dataset.ready) return; panel.dataset.ready = "true";
    root.addEventListener("war-results-capture-batch", (e) => { files = (e.detail || []).filter((x) => x.file).map((x) => ({ file: x.file, name: x.name || x.file.name })); updateButton(); });
    $("#laboratoryFields").addEventListener("change", updateButton);
    $("#runTemplateMatchingButton").addEventListener("click", run);
    $("#copyTemplateMatchingJsonButton").addEventListener("click", async () => { try { await root.navigator.clipboard.writeText(json()); status("Diagnostics JSON copié."); } catch (e) { status(`Copie indisponible : ${e.message}`, true); } });
    $("#exportTemplateMatchingJsonButton").addEventListener("click", exportFile);
    updateButton();
  }
  if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
})(typeof window !== "undefined" ? window : globalThis);
