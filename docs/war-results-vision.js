Warning: truncated output (original token count: 24526)
Total output lines: 983

(() => {
  "use strict";
  const $ = (selector) => document.querySelector(selector);
  const input = $("#captureInput"), list = $("#captureResults"), analyzeButton = $("#analyzeButton");
  const compareLocatorsButton = $("#compareTrophyLocatorsButton");
  const trophyMarginSelect = $("#trophyMarginSelect");
  const trophyRecoverySelect = $("#trophyRecoverySelect");
  const locatorCompareStatus = $("#locatorCompareStatus");
  const locatorComparisonResults = $("#locatorComparisonResults");
  const exportLocatorComparisonButton = $("#exportLocatorComparisonButton");
  const labEngineSelect = $("#labEngineSelect"), labFields = $("#laboratoryFields"), labResults = $("#labResults");
  const labStatus = $("#labStatus"), labProgress = $("#labProgress"), runLabButton = $("#runRecognitionLabButton");
  const LABORATORY_KEY = "msf-war-results-laboratory-v1";
  const TROPHY_VARIANTS = ["adaptive", "vertical-recovery", "vertical-recovery-edge-safe", "vertical-recovery-icon-aware", "vertical-recovery-combined"];
  const numericLocatorSelect = $("#labNumericLocatorSelect");
  const scoreLocatorButton = $("#compareScoreLocatorsButton"), scoreLocatorResults = $("#scoreLocatorResults");
  const SCORE_LOCATOR_KEY = "msf-war-results-score-locator-lab-v1";
  const scoreLocatorSummary = [];
  const liveScoreLocator = new Map();
  const LAB_FIELDS = { identity: ["localAlliance", "opponentAlliance"], numeric: ["localScore", "opponentScore", "localTrophies", "opponentTrophies"], result: ["result"] };
  const LAB_ENGINE_LABELS = { identity: "Identité", numeric: "Numérique", result: "Résultat" };
  const copyLocatorComparisonButton = $("#copyLocatorComparisonButton");
  const numericOcrSummary = [];
  const NUMERIC_OCR_KEY = "msf-war-results-numeric-ocr-v1";
  const status = $("#analysisStatus"), progress = $("#analysisProgress"), badge = $("#batchBadge");
  const KEY = "msf-war-results-vision-drafts-v1";
  const LOCATOR_COMPARISON_KEY = "msf-war-results-locator-ab-v2";
  const LEGACY_LOCATOR_COMPARISON_KEY = "msf-war-results-locator-ab-v1";
  const FIELDS = ["localAlliance", "opponentAlliance", "localScore", "opponentScore", "localTrophies", "opponentTrophies", "result"];
  const LABELS = { localAlliance: "Alliance LoSP", opponentAlliance: "Alliance adverse", localScore: "Score LoSP", opponentScore: "Score adverse", localTrophies: "Trophées LoSP", opponentTrophies: "Trophées adverses", result: "Résultat", warDate: "Date réelle de la guerre" };
  let records = [];
  let analyzing = false;
  let loadMs = null;
  let diagnostics = [];
  let locatorComparisonSummary = [];
  let laboratorySummary = [];
  const liveLabDiagnostics = new Map();
  let zoneDrag = null;

  restoreDrafts();
  restoreLocatorComparison();
  restoreLaboratory();
  restoreNumericOcrResults();
  restoreScoreLocatorResults();
  renderLaboratoryFields();
  input.addEventListener("change", () => addFiles([...input.files || []]));
  analyzeButton.addEventListener("click", () => {
    status.textContent = "Démarrage de l’analyse des captures…";
    analyzePending().catch(showGlobalError);
  });
  labEngineSelect.addEventListener("change", renderLaboratoryFields);
  labFields.addEventListener("change", updateLaboratoryControls);
  labFields.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-lab-select]"); if (!button) return;
    const selection = button.dataset.labSelect;
    const values = selection === "all" ? (LAB_FIELDS[labEngineSelect.value] || [])
      : selection === "scores" ? ["localScore", "opponentScore"] : ["localTrophies", "opponentTrophies"];
    labFields.querySelectorAll("input[data-lab-field]").forEach((input) => { input.checked = values.includes(input.dataset.labField); });
    updateLaboratoryControls();
  });
  runLabButton.addEventListener("click", () => runRecognitionLaboratory().catch(showGlobalError));
  $("#copyLabJsonButton").addEventListener("click", () => copyLaboratoryJson().catch(showGlobalError));
  $("#exportLabJsonButton").addEventListener("click", exportLaboratoryJson);
  scoreLocatorButton.addEventListener("click", () => compareScoreLocators().catch(showGlobalError));
  $("#copyScoreLocatorJsonButton").addEventListener("click", () => copyScoreLocatorJson().catch(showGlobalError));
  $("#exportScoreLocatorJsonButton").addEventListener("click", exportScoreLocatorJson);
  $("#clearScoreLocatorResultsButton").addEventListener("click", clearScoreLocatorResults);
  scoreLocatorResults.addEventListener("change", onScoreQualityChange);
  window.addEventListener("war-results-capture-batch", (event) => restoreScoreLocatorPreviews(event.detail || []));
  $("#compareNumericOcrButton").addEventListener("click", () => compareNumericOcr().catch(showGlobalError));
  initializeOcrCombinations();
  $("#ocrCombinationOptions").addEventListener("change", updateOcrCombinationCount);
  $("#ocrGlyphOption").addEventListener("change", updateOcrCombinationCount);
  $("#ocrMorphologyOption").addEventListener("change", updateOcrCombinationCount);
  $("#ocrAlignmentOption").addEventListener("change", updateOcrCombinationCount);
  $("#applyRecommendedOcrPreset").addEventListener("click", applyRecommendedOcrPreset);
  $("#clearNumericOcrButton").addEventListener("click", clearNumericOcrResults);
  $("#copyNumericOcrButton").addEventListener("click", () => copyNumericOcrJson().catch(showGlobalError));
  $("#exportNumericOcrButton").addEventListener("click", exportNumericOcrJson);
  window.addEventListener("error", (event) => {
    showGlobalError(event.error || event.message || "Erreur JavaScript non détaillée.");
  });
  window.addEventListener("unhandledrejection", (event) => {
    showGlobalError(event.reason || "Promesse OCR rejetée sans détail.");
  });
  $("#clearButton").addEventListener("click", clearSession);
  compareLocatorsButton.addEventListener("click", () => compareTrophyLocators().catch(showGlobalError));
  $("#clearLocatorComparisonButton").addEventListener("click", () => {
    locatorComparisonResults.innerHTML = "";
    locatorComparisonSummary = [];
    sessionStorage.removeItem(LOCATOR_COMPARISON_KEY);
    sessionStorage.removeItem(LEGACY_LOCATOR_COMPARISON_KEY);
    locatorCompareStatus.textContent = "Diagnostic comparatif effacé.";
    $("#clearLocatorComparisonButton").disabled = true;
    exportLocatorComparisonButton.disabled = true;
    copyLocatorComparisonButton.disabled = true;
  });
  exportLocatorComparisonButton.addEventListener("click", () => {
    if (locatorComparisonSummary.length) download(locatorComparisonPayload(), `war-results-locator-ab-${new Date().toISOString().slice(0, 10)}.json`);
  });
  copyLocatorComparisonButton.addEventListener("click", () => copyLocatorComparisonJson().catch(showGlobalError));
  $("#exportAllButton").addEventListener("click", exportValidated);
  list.addEventListener("input", onEdit);
  list.addEventListener("change", onEdit);
  list.addEventListener("click", onAction);
  list.addEventListener("pointerdown", onZonePointerDown);
  list.addEventListener("pointermove", onZonePointerMove);
  list.addEventListener("pointerup", onZonePointerUp);
  list.addEventListener("pointercancel", onZonePointerUp);
  render();
  renderLaboratoryResults();
  renderScoreLocatorResults();

  function makeFieldState() { return Object.fromEntries(FIELDS.map((key) => [key, { value: "", uncertain: true, source: "not-read", confidence: null, alternatives: [] }])); }
  function addFiles(files) {
    const accepted = files.filter((file) => /^image\/(png|jpeg)$/.test(file.type));
    const ignored = files.length - accepted.length;
    let duplicates = 0;
    for (const file of accepted) {
      if (records.some((r) => r.file && r.fileName === file.name && r.file.size === file.size && r.file.lastModified === file.lastModified)) { duplicates++; continue; }
      records.push({ id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`, file, fileName: file.name, fileKey: WarResultsLocatorComparisonStore.fileKey(file), url: URL.createObjectURL(file), state: "queued", values: Object.fromEntries(FIELDS.map((k) => [k, ""])), fields: makeFieldState(), date: "", corrected: [], zoneOverrides: {}, confirmed: false, error: "", analysis: null, rawText: "", warnings: [] });
    }
    input.value = "";
    if (!accepted.length && files.length) status.textContent = "Format ignoré. Sélectionne une image PNG ou JPEG.";
    else status.textContent = `${accepted.length - duplicates} capture(s) ajoutée(s). Les fichiers restent dans le navigateur.${duplicates ? ` ${duplicates} doublon(s) ignoré(s).` : ""}${ignored ? ` ${ignored} format(s) ignoré(s).` : ""}`;
    render(); saveDrafts();
    publishCaptureBatch();
  }
  function publishCaptureBatch() {
    if (typeof window.dispatchEvent !== "function" || typeof CustomEvent !== "function") return;
    window.dispatchEvent(new CustomEvent("war-results-capture-batch", { detail: records.filter((record) => record.file).map((record) => ({ file: record.file, name: record.fileName })) }));
  }

  function render() {
    list.innerHTML = records.map((record, index) => cardHtml(record, index)).join("");
    analyzeButton.disabled = analyzing || !records.some((r) => ["queued", "error"].includes(r.state) && r.file);
    compareLocatorsButton.disabled = analyzing || !records.some((r) => r.file);
    badge.textContent = !records.length ? "Aucune capture" : `${records.length} capture${records.length > 1 ? "s" : ""}`;
    const validated = records.filter((r) => r.state === "validated");
    $("#validatedSummary").hidden = !validated.length;
    $("#validatedList").innerHTML = validated.map((r) => `<div class="validated-row">${escapeHtml(r.fileName)} — ${escapeHtml(r.date)} — ${escapeHtml(r.values.localAlliance)} ${escapeHtml(r.values.localScore)} / ${escapeHtml(r.values.opponentAlliance)} ${escapeHtml(r.values.opponentScore)} (${r.values.result === "win" ? "victoire" : "défaite"})</div>`).join("");
    const summary = $("#batchSummary");
    summary.hidden = !records.length;
    $("#batchSummaryText").textContent = records.length ? `${records.filter(r=>r.state==="validated").length} validée(s) localement · ${records.filter(r=>r.state==="review").length} à vérifier · ${records.filter(r=>r.state==="error").length} en erreur` : "";
    updateLaboratoryControls();
  }

  function renderLaboratoryFields() {
    const engine = LAB_FIELDS[labEngineSelect.value] ? labEngineSelect.value : "numeric";
    const fields = LAB_FIELDS[engine];
    const quick = engine === "numeric" ? `<div class="lab-quick-select"><button type="button" data-lab-select="all">4 champs</button><button type="button" data-lab-select="scores">2 scores</button><button type="button" data-lab-select="trophies">2 trophées</button></div>` : "";
    labFields.innerHTML = `${quick}<div class="lab-checkbox-grid">${fields.map((field) => `<label><input type="checkbox" data-lab-field="${field}" ${engine === "numeric" || engine === "identity" || engine === "result" ? "checked" : ""}><span>${escapeHtml(LABELS[field])}</span></label>`).join("")}</div>`;
    $("#labNumericOptions").hidden = engine !== "numeric";
    $("#scoreLocatorLab").hidden = engine !== "numeric";
    runLabButton.textContent = `Lancer le moteur ${LAB_ENGINE_LABELS[engine]}`;
    updateLaboratoryControls();
  }

  function selectedLabFields() {
    return [...labFields.querySelectorAll("input[data-lab-field]:checked")].map((input) => input.dataset.labField);
  }

  function labVariant(engine, field) {
    if (engine !== "numeric") return "default";
    const locator = numericLocatorSelect?.value === "pixel-content" ? "pixel-content:" : "";
    if (!field.endsWith("Trophies")) return locator ? "pixel-content" : "score-proportional";
    return `${locator}${TROPHY_VARIANTS.includes($("#labTrophyLocatorSelect").value) ? $("#labTrophyLocatorSelect").value : "adaptive"}`;
  }

  function labMargin(engine, field) {
    return engine === "numeric" && field.endsWith("Trophies") ? Number($("#labTrophyMarginSelect").value || 18) : 0;
  }

  function laboratoryRecordKey(engine, field, record) {
    return WarResultsLocatorComparisonStore.laboratoryRecordKey({ sourceKey: record.fileKey || WarResultsLocatorComparisonStore.fileKey(record.file), engine,
      field, variantId: labVariant(engine, field), marginPercent: labMargin(engine, field) });
  }

  function updateLaboratoryControls() {
    const fields = selectedLabFields();
    runLabButton.disabled = analyzing || !fields.length || !records.some((record) => record.file);
    $("#copyLabJsonButton").disabled = !laboratorySummary.length;
    $("#exportLabJsonButton").disabled = !laboratorySummary.length;
    scoreLocatorButton.disabled = analyzing || labEngineSelect.value !== "numeric" || !fields.some((field) => field === "localScore" || field === "opponentScore") || !records.some((record) => record.file);
    $("#copyScoreLocatorJsonButton").disabled = !scoreLocatorSummary.length;
    $("#exportScoreLocatorJsonButton").disabled = !scoreLocatorSummary.length;
    $("#clearScoreLocatorResultsButton").disabled = !scoreLocatorSummary.length;
    $("#compareNumericOcrButton").disabled = analyzing || !records.some((record) => record.file);
    $("#clearNumericOcrButton").disabled = !numericOcrSummary.length;
    $("#copyNumericOcrButton").disabled = !numericOcrSummary.length;
    $("#exportNumericOcrButton").disabled = !numericOcrSummary.length;
  }

  async function compareScoreLocators() {
    if (analyzing) return;
    const fields = selectedLabFields().filter((field) => field === "localScore" || field === "opponentScore");
    const pending = records.filter((record) => record.file);
    if (!fields.length || !pending.length) { $("#scoreLocatorStatus").textContent = "Sélectionne Score LoSP, Score adverse ou les deux et charge une capture."; return; }
    analyzing = true; scoreLocatorButton.disabled = true; labEngineSelect.disabled = true;
    $("#scoreLocatorStatus").textContent = "Comparaison géométrique en cours. Aucun OCR n’est exécuté.";
    for (let i = 0; i < pending.length; i++) {
      const record = pending[i];
      try {
        const result = await WarResultsVisionEngine.compareScoreLocators(record.file, fields, (message) => {
          if (message.status) $("#scoreLocatorStatus").textContent = `${record.fileName} — ${message.status}`;
        });
        for (const field of fields) {
          const diagnostic = result.fields[field], sourceKey = record.fileKey || WarResultsLocatorComparisonStore.fileKey(record.file);
          const id = `${sourceKey}:${field}`, previous = scoreLocatorSummary.find((entry) => entry.id === id);
          const entry = { id, captureId: sourceKey, file: record.fileName, field, dimensions: result.dimensions,
            layout: result.layout, layoutMethod: diagnostic.layoutMethod, anchorsFound: diagnostic.anchorsFound,
            baseline: { method: "proportional-current", rect: diagnostic.proportionalRect },
            experimental: { method: diagnostic.method, initialRegion: diagnostic.initialRegion, searchRegion: diagnostic.searchRegion,
              finalRect: diagnostic.finalRect, cropDimensions: diagnostic.cropDimensions, componentCount: diagnostic.componentCount,
              glyphCount: diagnostic.glyphCount, glyphs: diagnostic.glyphs, selected: diagnostic.selected,
              candidates: diagnostic.candidates, parameters: diagnostic.parameters, extensions: diagnostic.extensions,
              diagnostics: diagnostic.diagnostics, warnings: diagnostic.warnings, localized: diagnostic.localized,
              reason: diagnostic.reason, elapsedMs: diagnostic.elapsedMs },
            quality: previous?.quality || "pending", comparedAt: new Date().toISOString() };
          const position = scoreLocatorSummary.findIndex((item) => item.id === id);
          if (position >= 0) scoreLocatorSummary.splice(position, 1, entry); else scoreLocatorSummary.push(entry);
          liveScoreLocator.set(id, { sourceUrl: record.url, proportionalPreview: diagnostic.proportionalPreview,
            experimentalPreview: diagnostic.experimentalPreview, dimensions: result.dimensions });
          persistScoreLocatorResults(); renderScoreLocatorResults();
        }
      } catch (error) {
        const sourceKey = record.fileKey || WarResultsLocatorComparisonStore.fileKey(record.file);
        for (const field of fields) {
          const id = `${sourceKey}:${field}`, previous = scoreLocatorSummary.find((entry) => entry.id === id);
          const entry = { id, captureId: sourceKey, file: record.fileName, field, dimensions: null,
            baseline: { method: "proportional-current", rect: null }, experimental: { method: "score-localization-experiment",
              localized: false, reason: errorMessage(error), warnings: ["execution-error"], elapsedMs: null }, quality: previous?.quality || "pending", comparedAt: new Date().toISOString() };
          const position = scoreLocatorSummary.findIndex((item) => item.id === id);
          if (position >= 0) scoreLocatorSummary.splice(position, 1, entry); else scoreLocatorSummary.push(entry);
          persistScoreLocatorResults(); renderScoreLocatorResults();
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    $("#scoreLocatorStatus").textContent = `${fields.length * pending.length} comparaison(s) géométrique(s) enregistrée(s). Vérifie les images et renseigne la qualité de chaque découpe; aucune lecture OCR n’a été exécutée.`;
    analyzing = false; labEngineSelect.disabled = false; render(); updateLaboratoryControls();
  }

  function scoreLocatorPayload() {
    return { schemaVersion: "1.0.0", scope: "score-localization-only", recognition: "none",
      privacy: "No source pixels, image crops, or OCR values are included.", entries: scoreLocatorSummary.map(({ id, ...entry }) => entry) };
  }
  function persistScoreLocatorResults() {
    try { sessionStorage.setItem(SCORE_LOCATOR_KEY, JSON.stringify(scoreLocatorPayload())); }
    catch (_) { $("#scoreLocatorStatus").textContent = "Stockage temporaire indisponible; copie ou télécharge les diagnostics avant de quitter."; }
  }
  function restoreScoreLocatorResults() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(SCORE_LOCATOR_KEY) || "null");
      if (saved?.scope === "score-localization-only" && Array.isArray(saved.entries)) {
        scoreLocatorSummary.push(...saved.entries.map((entry) => ({ ...entry, id: `${entry.captureId}:${entry.field}` })));
        $("#scoreLocatorStatus").textContent = `${scoreLocatorSummary.length} diagnostic(s) restauré(s). Réimporte les captures pour retrouver les aperçus.`;
      }
    } catch (_) { scoreLocatorSummary.splice(0); }
  }
  async function restoreScoreLocatorPreviews(files) {
    for (const item of files) {
      const file = item?.file, sourceKey = file && WarResultsLocatorComparisonStore.fileKey(file);
      const entries = scoreLocatorSummary.filter((entry) => entry.captureId === sourceKey);
      if (!file || !entries.length) continue;
      let bitmap;
      try {
        bitmap = await createImageBitmap(file);
        const cropPreview = (rect) => {
          if (!rect) return "";
          const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(rect.width)); canvas.height = Math.max(1, Math.round(rect.height));
          canvas.getContext("2d").drawImage(bitmap, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
          const url = canvas.toDataURL("image/jpeg", .9); canvas.width = canvas.height = 1; return url;
        };
        const record = records.find((entry) => entry.fileKey === sourceKey);
        for (const entry of entries) liveScoreLocator.set(entry.id, { sourceUrl: record?.url || URL.createObjectURL(file),
          proportionalPreview: cropPreview(entry.baseline?.rect), experimentalPreview: cropPreview(entry.experimental?.finalRect),
          dimensions: entry.dimensions || { width: bitmap.width, height: bitmap.height } });
      } catch (_) { /* The stored JSON diagnostics remain usable if preview restoration fails. */ }
      finally { bitmap?.close?.(); }
    }
    renderScoreLocatorResults();
  }
  function renderScoreLocatorResults() {
    scoreLocatorResults.innerHTML = scoreLocatorSummary.map((entry) => {
      const live = liveScoreLocator.get(entry.id), exp = entry.experimental || {}, baseline = entry.baseline || {};
      const box = (r, cls) => r ? `<rect class="score-locator-${cls}" x="${Number(r.x)}" y="${Number(r.y)}" width="${Number(r.width)}" height="${Number(r.height)}"/>` : "";
      const image = live?.sourceUrl && entry.dimensions ? `<details><summary>Voir les deux localisations sur la capture</summary><p class="muted">Jaune : zone proportionnelle actuelle · cyan : recherche expérimentale · vert : découpe finale · rouge : limites des composantes retenues · violet : groupe candidat concurrent.</p><div class="score-locator-source" style="aspect-ratio:${entry.dimensions.width}/${entry.dimensions.height}"><img src="${escapeAttr(live.sourceUrl)}" alt="Capture originale ${escapeAttr(entry.file)}"><svg viewBox="0 0 ${entry.dimensions.width} ${entry.dimensions.height}" preserveAspectRatio="none">${box(baseline.rect,"baseline")}${box(exp.searchRegion,"search")}${box(exp.finalRect,"final")}${(exp.glyphs || []).map((g) => box(g,"glyph")).join("")}${(exp.candidates || []).slice(1,5).map((candidate) => box(candidate.rect,"candidate")).join("")}</svg></div></details>` : `<p class="muted">Réimporte cette capture pour restaurer les aperçus visuels.</p>`;
      const crops = live ? `<div class="score-locator-crops"><figure><img src="${escapeAttr(live.proportionalPreview || "")}" alt="Découpe proportionnelle actuelle"><figcaption>Actuelle · ${escapeHtml(JSON.stringify(baseline.rect || null))}</figcaption></figure><figure>${live.experimentalPreview ? `<img src="${escapeAttr(live.experimentalPreview)}" alt="Découpe expérimentale du score">` : `<div class="score-locator-missing">Aucune découpe fiable</div>`}<figcaption>Expérimentale · ${escapeHtml(JSON.stringify(exp.cropDimensions || null))}</figcaption></figure></div>` : "";
      const quality = `<label class="score-locator-quality">Qualité visuelle de la découpe expérimentale<select data-score-quality="${escapeAttr(entry.id)}"><option value="pending" ${entry.quality === "pending" ? "selected" : ""}>À vérifier</option><option value="good" ${entry.quality === "good" ? "selected" : ""}>Complète, sans contamination notable</option><option value="bad" ${entry.quality === "bad" ? "selected" : ""}>Chiffre coupé ou contamination</option><option value="uncertain" ${entry.quality === "uncertain" ? "selected" : ""}>Incertaine</option></select></label>`;
      const details = { baseline: baseline, experimental: exp, quality: entry.quality };
      return `<article class="score-locator-card"><h4>${escapeHtml(entry.file)} · ${escapeHtml(LABELS[entry.field] || entry.field)}</h4><p>${entry.dimensions ? `${entry.dimensions.width} × ${entry.dimensions.height}px` : "Dimensions indisponibles"} · ${escapeHtml(entry.layoutMethod || "mise en page indisponible")} · localisation ${exp.localized ? "candidate trouvée" : "incertaine"} · ${exp.elapsedMs ?? "—"} ms</p>${image}${crops}${quality}${(exp.warnings || []).length ? `<p class="lab-warning">${escapeHtml(exp.warnings.join(" · "))}</p>` : ""}<details><summary>Paramètres et limites détectées</summary><pre>${escapeHtml(JSON.stringify(details, null, 2))}</pre></details></article>`;
    }).join("");
    $("#copyScoreLocatorJsonButton").disabled = !scoreLocatorSummary.length;
    $("#exportScoreLocatorJsonButton").disabled = !scoreLocatorSummary.length;
    $("#clearScoreLocatorResultsButton").disabled = !scoreLocatorSummary.length;
  }
  function onScoreQualityChange(event) {
    const select = event.target.closest("select[data-score-quality]"); if (!select) return;
    c…12526 tokens truncated…t WarResultsVisionEngine.release(); }
      catch (error) { locatorCompareStatus.textContent += ` Libération OCR : ${errorMessage(error)}`; }
      analyzing = false;
      $("#clearLocatorComparisonButton").disabled = !locatorComparisonResults.childElementCount;
      render();
    }
  }

  function locatorComparisonPayload() {
    return WarResultsLocatorComparisonStore.snapshot(locatorComparisonSummary);
  }

  function updateLocatorComparisonButtons() {
    const hasRecords = locatorComparisonSummary.length > 0;
    const hasFields = locatorComparisonSummary.some((item) => item.fields?.length);
    exportLocatorComparisonButton.disabled = !hasFields;
    copyLocatorComparisonButton.disabled = !hasRecords;
    $("#clearLocatorComparisonButton").disabled = !hasRecords;
  }

  function saveLocatorComparison() {
    try {
      sessionStorage.setItem(LOCATOR_COMPARISON_KEY, WarResultsLocatorComparisonStore.stringify(locatorComparisonSummary));
    } catch (_) {
      locatorCompareStatus.textContent = "Stockage temporaire indisponible ou saturé. Les résultats restent visibles; copie ou télécharge le JSON avant de quitter la page.";
    }
  }

  function restoreLocatorComparison() {
    try {
      const current = sessionStorage.getItem(LOCATOR_COMPARISON_KEY);
      const legacy = !current ? sessionStorage.getItem(LEGACY_LOCATOR_COMPARISON_KEY) : null;
      const saved = JSON.parse(current || legacy || "null");
      if (!saved || saved.diagnostic !== "local-tesseractjs-trophy-locator-ab" || !Array.isArray(saved.records)) return;
      locatorComparisonSummary = WarResultsLocatorComparisonStore.mergeRecords([], saved.records);
      if (legacy && locatorComparisonSummary.length) {
        sessionStorage.setItem(LOCATOR_COMPARISON_KEY, WarResultsLocatorComparisonStore.stringify(locatorComparisonSummary));
        sessionStorage.removeItem(LEGACY_LOCATOR_COMPARISON_KEY);
      }
      for (const item of locatorComparisonSummary) {
        if (item.fields?.length) {
          const report = { fields: item.fields, metrics: item.metrics || {}, variantLabel: item.variantLabel || "Adaptatif sans reprise" };
          locatorComparisonResults.insertAdjacentHTML("beforeend", locatorComparisonHtml(item.file, report));
        } else if (item.error) {
          locatorComparisonResults.insertAdjacentHTML("beforeend", `<article class="locator-comparison-card is-error"><h3>${escapeHtml(item.file || "Capture")} · ${escapeHtml(item.variantLabel || "Adaptatif sans reprise")} · marge ${Number(item.marginPercent ?? 18)} %</h3><p>Erreur du diagnostic : ${escapeHtml(item.error)}</p></article>`);
        }
      }
      if (locatorComparisonSummary.length) locatorCompareStatus.textContent = `${locatorComparisonSummary.length} résultat(s) A/B restauré(s) depuis le stockage temporaire de cette session. Réimporte les captures pour reprendre sans retraiter celles-ci.`;
      updateLocatorComparisonButtons();
    } catch (_) {
      sessionStorage.removeItem(LOCATOR_COMPARISON_KEY);
      sessionStorage.removeItem(LEGACY_LOCATOR_COMPARISON_KEY);
    }
  }

  async function copyLocatorComparisonJson() {
    if (!locatorComparisonSummary.length) return;
    const json = WarResultsLocatorComparisonStore.stringify(locatorComparisonSummary);
    try {
      await navigator.clipboard.writeText(json);
      locatorCompareStatus.textContent = "JSON A/B copié dans le presse-papiers.";
    } catch (_) {
      const area = document.createElement("textarea");
      area.value = json; area.setAttribute("readonly", "");
      area.style.position = "fixed"; area.style.opacity = "0";
      document.body.appendChild(area); area.select();
      const copied = document.execCommand("copy"); area.remove();
      locatorCompareStatus.textContent = copied ? "JSON A/B copié dans le presse-papiers." : "Copie automatique refusée par le navigateur. Le JSON reste téléchargeable.";
    }
  }

  function locatorComparisonHtml(fileName, result) {
    const metrics = result.metrics || {};
    const rectText = (rect) => rect ? `x=${rect.x}, y=${rect.y}, l=${rect.width}, h=${rect.height}` : "zone absente";
    const variantHtml = (item, label) => {
      const segmentation = item.segmentation || {};
      const icon = item.iconRejection || segmentation.iconRejection || { requested: false, applied: false, reason: "indisponible" };
      return `<section class="locator-comparison-variant"><h4>${label}</h4>${item.preview ? `<img src="${escapeAttr(item.preview)}" alt="Image réellement transmise à Tesseract pour ${label} de ${escapeAttr(fileName)}" loading="lazy"><small>Entrée Tesseract : agrandie ×3, niveaux de gris, contraste ×1,7</small>` : `<p>Découpe OCR indisponible${item.reason ? ` — ${escapeHtml(item.reason)}` : ""}</p>`}${item.sourcePreview ? `<details><summary>Voir la découpe à la résolution source</summary><img class="locator-source-crop" src="${escapeAttr(item.sourcePreview)}" alt="Découpe source non prétraitée pour ${label}" loading="lazy"></details>` : ""}<p>OCR : <strong>${escapeHtml(item.value || "—")}</strong>${item.raw ? ` · brut : ${escapeHtml(item.raw)}` : ""}<br>Confiance Tesseract : ${Number.isFinite(item.confidence) ? `${Math.round(item.confidence)} %` : "non fournie"} · durée : ${Number.isFinite(item.ms) ? `${item.ms} ms` : "—"}<br>Rectangle initial : ${escapeHtml(rectText(item.initialRect || item.rect))}<br>Rectangle final : ${escapeHtml(rectText(item.finalRect || item.rect))}<br>Marge : ${Number.isFinite(item.requestedMarginPercent ?? item.marginPercent) ? `${item.requestedMarginPercent ?? item.marginPercent} % demandée · ${Number.isFinite(item.appliedMarginPercent) ? `${item.appliedMarginPercent} % appliquée` : "non appliquée"}` : "géométrie d’origine"}<br>Composantes : ${Number.isFinite(item.componentsDetected ?? segmentation.componentCount) ? item.componentsDetected ?? segmentation.componentCount : "non mesurées"} · glyphes retenus : ${Number.isFinite(segmentation.glyphs) ? `${segmentation.glyphs}/4` : "non disponibles"}<br>Rejet d’icône : ${icon.applied ? `oui (${icon.excludedComponentCount} composante(s) exclue(s))` : `non (${escapeHtml(icon.reason || "aucune exclusion")})`}<br>Bord du recadrage : ${item.edgeWarning || segmentation.edgeWarning ? "glyphe au bord" : "aucun avertissement"}<br>Reprise verticale : ${item.verticalRecovery ? `oui (${escapeHtml(JSON.stringify(item.verticalRecovery))})` : "non"}${segmentation.reason ? `<br>Segmentation : ${escapeHtml(segmentation.reason)}` : ""}${segmentation.warnings?.length ? `<br>Avertissements : ${escapeHtml(segmentation.warnings.join(", "))}` : ""}</p></section>`;
    };
    const overlay = result.preview && result.dimensions ? `<div class="locator-source-overview" style="aspect-ratio:${Number(result.dimensions.width)}/${Number(result.dimensions.height)}"><img src="${escapeAttr(result.preview)}" alt="Capture originale avec zones trophées détectées pour ${escapeAttr(fileName)}" loading="lazy"><svg viewBox="0 0 ${Number(result.dimensions.width)} ${Number(result.dimensions.height)}" preserveAspectRatio="none" role="img" aria-label="Rectangles des deux localisateurs"><g>${(result.fields || []).map((field) => [
      field.current?.rect && `<rect class="locator-box-current" x="${field.current.rect.x}" y="${field.current.rect.y}" width="${field.current.rect.width}" height="${field.current.rect.height}"><title>${escapeHtml(field.label)} — actuel</title></rect>`,
      field.adaptive?.rect && `<rect class="locator-box-adaptive" x="${field.adaptive.rect.x}" y="${field.adaptive.rect.y}" width="${field.adaptive.rect.width}" height="${field.adaptive.rect.height}"><title>${escapeHtml(field.label)} — adaptatif</title></rect>`,
      ...(field.current?.segmentation?.glyphRects || []).map((glyph, index) => `<rect class="locator-glyph-current" x="${glyph.x}" y="${glyph.y}" width="${glyph.width}" height="${glyph.height}"><title>${escapeHtml(field.label)} — glyphe actuel ${index + 1}</title></rect>`),
      ...(field.adaptive?.segmentation?.glyphRects || []).map((glyph, index) => `<rect class="locator-glyph-adaptive" x="${glyph.x}" y="${glyph.y}" width="${glyph.width}" height="${glyph.height}"><title>${escapeHtml(field.label)} — glyphe adaptatif ${index + 1}</title></rect>`)
    ].filter(Boolean).join("")).join("")}</g></svg></div><p class="locator-legend"><span>Bleu : rectangle actuel</span><span>Orange : rectangle adaptatif</span><span>Turquoise : glyphes actuels</span><span>Vert : glyphes adaptatifs</span></p>` : `<p class="muted">Capture source non restaurée. Les images restent uniquement dans l’onglet actif; le JSON ne contient que les mesures.</p>`;
    const fieldsHtml = (result.fields || []).map((field) => `<section class="locator-comparison-card"><h3>${escapeHtml(field.label)}</h3><p>Écart de rectangle (adaptatif − actuel) : ${escapeHtml(field.rectDelta ? JSON.stringify(field.rectDelta) : "non calculé")}</p><div class="locator-comparison-pair">${variantHtml(field.current, "Localisateur actuel")}${variantHtml(field.adaptive, "Localisateur adaptatif expérimental")}</div></section>`).join("");
    return `<article class="locator-comparison-card"><h3>${escapeHtml(fileName)} — ${escapeHtml(result.variantLabel || "Adaptatif sans reprise")} — marge ${Number(result.fields?.[0]?.adaptive?.marginPercent ?? result.marginPercent ?? 18)} %</h3><p>${escapeHtml(metrics.engine || "Tesseract.js")} · total ${Number(metrics.totalMs) || 0} ms · chargement moteur ${Number(metrics.workerLoadMs) || 0} ms · ${Number(metrics.dimensions?.width) || 0}×${Number(metrics.dimensions?.height) || 0} px</p><p>Ancrages : ${escapeHtml(JSON.stringify(metrics.anchorsFound || {}))} · disposition : ${escapeHtml(metrics.layout || "inconnue")}</p>${overlay}${fieldsHtml}<details><summary>Temps des appels Tesseract</summary><pre>${escapeHtml(JSON.stringify(metrics.calls || [], null, 2))}</pre></details></article>`;
  }

  function onAction(event) {
    const button = event.target.closest("button[data-action]"); if (!button) return;
    const record = records.find((r) => r.id === button.dataset.id); if (!record) return;
    const action = button.dataset.action;
    if (action === "remove") { if (record.url) URL.revokeObjectURL(record.url); records = records.filter((r) => r !== record); saveDrafts(); render(); return; }
    if (action === "analyze-one") { if (record.corrected.length && !confirm("Relancer l’OCR mettra à jour les propositions et conservera les valeurs corrigées manuellement. Continuer ?")) return; status.textContent = `Relance de l’analyse de ${record.fileName}…`; analyzePending(record.id).catch(showGlobalError); return; }
    if (action === "choose") {
      record.values[button.dataset.field] = button.dataset.value;
      record.fields[button.dataset.field] = { ...record.fields[button.dataset.field], value: button.dataset.value, alternatives: [], uncertain: true, manuallyEdited: true };
      if (!record.corrected.includes(button.dataset.field)) record.corrected.push(button.dataset.field);
      record.state = "review"; record.confirmed = false; saveDrafts(); render(); return;
    }
    if (action === "accept-reread") {
      const field = button.dataset.field, proposal = record.fields[field]?.ocrProposal;
      if (!proposal) return;
      record.values[field] = proposal;
      record.fields[field] = { ...record.fields[field], value: proposal, alternatives: [], uncertain: true, manuallyEdited: true, ocrProposal: "" };
      if (!record.corrected.includes(field)) record.corrected.push(field);
      record.state = "review"; record.confirmed = false; saveDrafts(); render(); return;
    }
    if (action === "select-zone") { record.selectedZone = button.dataset.field; saveDrafts(); render(); setTimeout(() => document.querySelector(`#result-${record.id} .zone-source-wrap`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0); return; }
    if (action === "reread-field") { readOneField(record, button.dataset.field, record.analysis?.zones?.[button.dataset.field]?.rect); return; }
    if (action === "reread-zone") { readOneField(record, record.selectedZone || "localAlliance", record.analysis?.zones?.[record.selectedZone || "localAlliance"]?.rect); return; }
    if (action === "validate") { validateRecord(record); return; }
    if (action === "export-one") { download(record.output, `${safeName(record.fileName)}-war-result.json`); }
  }

  async function readOneField(record, field, rect) {
    if (!record.file || !rect || !FIELDS.includes(field) || analyzing) {
      status.textContent = "Cette zone n’est pas disponible. Analyse de nouveau l’image ou sélectionne une autre capture.";
      return;
    }
    analyzing = true; record.error = ""; status.textContent = `Nouvelle lecture de ${LABELS[field]} depuis sa découpe…`; render();
    try {
      const proposal = await WarResultsVisionEngine.analyzeField(record.file, field, rect, (message) => { status.textContent = `${record.fileName} — ${LABELS[field]} : ${message.status || "lecture OCR locale…"}`; });
      const current = record.fields[field] || {};
      const zone = record.analysis.zones[field] || {};
      record.analysis.zones[field] = { ...zone, rect: proposal.rect, sourcePreview: proposal.sourcePreview, preview: proposal.preview, method: "manual-zone", ocrMethod: proposal.source, geometryConfidence: "manually-adjusted", layout: record.analysis.metrics.layout };
      record.zoneOverrides = { ...(record.zoneOverrides || {}), [field]: proposal.rect };
      if (proposal.identityDiagnostics) {
        record.analysis.identity = record.analysis.identity || {};
        record.analysis.identity[field] = { text: proposal.value, normalizedName: proposal.normalizedName, confidence: proposal.confidence, uncertain: proposal.uncertain, colorUncertain: proposal.colorUncertain,
          alternatives: proposal.alternatives || [], symbols: proposal.symbols || [], richName: proposal.richName || null, uncertainty: proposal.identityUncertainty || [], diagnostics: proposal.identityDiagnostics };
        record.analysis.metrics.engines = record.analysis.metrics.engines || {};
        record.analysis.metrics.engines.identity = record.analysis.metrics.engines.identity || {};
        record.analysis.metrics.engines.identity[field] = proposal.identityDiagnostics;
      }
      if (proposal.resultDiagnostics) {
        record.analysis.metrics.engines = record.analysis.metrics.engines || {};
        record.analysis.metrics.engines.result = proposal.resultDiagnostics;
      }
      if (record.corrected.includes(field) || current.manuallyEdited) {
        record.fields[field] = { ...current, ocrProposal: proposal.value, ocrProposalConfidence: proposal.confidence, ocrProposalSource: proposal.source };
      } else if (current.alternatives?.length || (current.value && proposal.value && current.value !== proposal.value)) {
        record.fields[field] = { value: "", confidence: null, source: "whole-image-vs-manual-zone-disagreement", uncertain: true, alternatives: [...new Set([...(current.alternatives || []), ...(current.value ? [current.value] : []), ...(proposal.value ? [proposal.value] : [])])] };
        record.values[field] = "";
      } else {
        record.fields[field] = { value: proposal.value, confidence: proposal.confidence, source: proposal.source, uncertain: proposal.uncertain, colorUncertain: proposal.colorUncertain, alternatives: [],
          ...(proposal.richName ? { richName: proposal.richName, normalizedName: proposal.normalizedName, symbols: proposal.symbols || [], identityUncertainty: proposal.identityUncertainty || [] } : {}),
          ...(proposal.resultDiagnostics ? { resultDiagnostics: proposal.resultDiagnostics } : {}) };
        record.values[field] = proposal.value;
        if (!proposal.value) record.warnings.push(`${field}_zone_read_empty`);
      }
      record.state = "review"; record.confirmed = false; record.analysis.metrics.lastFieldRead = { field, source: proposal.source, confidence: proposal.confidence, raw: proposal.raw || null,
        specializedDiagnostics: proposal.identityDiagnostics || proposal.resultDiagnostics || null, at: new Date().toISOString() };
      status.textContent = proposal.value ? `Nouvelle proposition ${LABELS[field]} : ${proposal.value}${proposal.uncertain ? " — à vérifier" : ""}.` : `Aucune lecture fiable pour ${LABELS[field]}. La valeur manuelle est conservée.`;
    } catch (error) {
      record.error = `OCR ciblé ${LABELS[field]} : ${errorMessage(error)}`;
      status.textContent = record.error;
    } finally { analyzing = false; saveDrafts(); render(); }
  }

  function zonePoint(event, svg) {
    const rect = svg.getBoundingClientRect(), view = svg.viewBox.baseVal;
    return WarResultRecognition.displayPointToImage(event.clientX, event.clientY, rect, view.width, view.height);
  }
  function onZonePointerDown(event) {
    const svg = event.target.closest?.("svg[data-zone-overlay]");
    const mark = event.target.closest?.(".zone-mark");
    if (!svg || !mark) return;
    const record = records.find((item) => item.id === svg.dataset.id);
    const field = mark.dataset.zoneKey;
    if (!record || !record.analysis?.zones?.[field]) return;
    event.preventDefault();
    record.selectedZone = field;
    const point = zonePoint(event, svg), rect = { ...record.analysis.zones[field].rect };
    zoneDrag = { svg, record, field, mode: event.target.tagName.toLowerCase() === "circle" ? "resize" : "move", start: point, rect };
    try { svg.setPointerCapture(event.pointerId); } catch (_) { /* iOS may omit capture in embedded browsing contexts */ }
    mark.classList.add("is-selected");
  }
  function onZonePointerMove(event) {
    if (!zoneDrag) return;
    const { svg, rect } = zoneDrag, point = zonePoint(event, svg);
    if (!point) return;
    const dx = point.x - zoneDrag.start.x, dy = point.y - zoneDrag.start.y;
    const bounds = svg.viewBox.baseVal;
    const next = WarResultRecognition.adjustZoneRect(rect, dx, dy, zoneDrag.mode, bounds.width, bounds.height);
    const group = svg.querySelector(`[data-zone-key="${zoneDrag.field}"]`), box = group.querySelector("rect"), handle = group.querySelector("circle");
    box.setAttribute("x", next.x); box.setAttribute("y", next.y); box.setAttribute("width", next.width); box.setAttribute("height", next.height);
    handle.setAttribute("cx", next.x + next.width); handle.setAttribute("cy", next.y + next.height);
    zoneDrag.next = next;
  }
  function onZonePointerUp() {
    if (!zoneDrag) return;
    const { record, field, next } = zoneDrag; zoneDrag = null;
    if (!next) { record.selectedZone = field; render(); return; }
    record.zoneOverrides = { ...(record.zoneOverrides || {}), [field]: next };
    if (!record.analysis.zones[field]) record.analysis.zones[field] = {};
    record.analysis.zones[field].rect = next;
    record.selectedZone = field;
    saveDrafts(); render();
    readOneField(record, field, next);
  }

  function validateRecord(record) {
    if (!record.confirmed) { status.textContent = "Coche la confirmation après avoir comparé la fiche à la guerre."; return; }
    const check = WarResultsVisionData.validate(record.values, record.date);
    if (!check.valid) { status.textContent = `Validation bloquée : ${check.problems.map((p) => p.replaceAll(":", " — ")).join(" · ")}`; record.state = "review"; render(); return; }
    const alliancePresentation = Object.fromEntries(["localAlliance", "opponentAlliance"].filter((key) => !record.corrected.includes(key) && !record.fields[key]?.colorUncertain && record.fields[key]?.richName).map((key) => [key, record.fields[key].richName]));
    record.output = WarResultsVisionData.buildRecord(record.values, record.date, { fileName: record.fileName, methods: record.analysis?.metrics?.methods || [], manualCorrections: record.corrected, alliancePresentation });
    record.state = "validated"; saveDrafts(); render(); status.textContent = "Fiche validée sur cet appareil seulement. Aucune publication n’a eu lieu.";
  }

  function exportValidated() {
    const payload = { schemaVersion: "1.0.0", status: "validated-locally-not-published", records: records.filter(r => r.state === "validated").map(r => r.output) };
    if (!payload.records.length) return;
    download(payload, `msf-war-results-local-${new Date().toISOString().slice(0,10)}.json`);
  }
  function download(data, name) { const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function safeName(name) { return String(name || "capture").replace(/[^\p{L}\p{N}-]+/gu, "-").replace(/^-|-$/g, "").slice(0, 64) || "capture"; }
  function clearSession() { if (!confirm("Effacer les brouillons, le laboratoire, les diagnostics A/B et les captures de cette session ?")) return; records.forEach(r => r.url && URL.revokeObjectURL(r.url)); records = []; publishCaptureBatch(); locatorComparisonSummary = []; laboratorySummary = []; numericOcrSummary.splice(0); liveLabDiagnostics.clear(); locatorComparisonResults.innerHTML = ""; labResults.innerHTML = ""; $("#numericOcrResults").innerHTML = ""; sessionStorage.removeItem(KEY); sessionStorage.removeItem(LOCATOR_COMPARISON_KEY); sessionStorage.removeItem(LEGACY_LOCATOR_COMPARISON_KEY); sessionStorage.removeItem(LABORATORY_KEY); sessionStorage.removeItem(NUMERIC_OCR_KEY); status.textContent = "Session effacée."; updateLocatorComparisonButtons(); updateLaboratoryControls(); render(); }

  function saveDrafts() {
    try { sessionStorage.setItem(KEY, JSON.stringify(records.map(r => ({ fileName: r.fileName, state: r.state, output: r.output || null, values: r.values, fields: r.fields, date: r.date, corrected: r.corrected, zoneOverrides: r.zoneOverrides || {}, confirmed: false, analysis: r.analysis ? { metrics: r.analysis.metrics, warnings: r.analysis.warnings } : null, rawText: r.rawText, warnings: r.warnings })))); }
    catch (_) { status.textContent = "Espace de brouillon temporaire saturé; les données restent dans cette page. N’efface pas la page avant export local."; }
  }
  function restoreDrafts() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY) || "[]");
      for (const s of saved) records.push({ ...s, id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`, file: null, url: "", state: s.state === "analyzing" ? "review" : s.state, confirmed: false, error: "" });
      if (saved.length) status.textContent = "Brouillons textuels restaurés; aucune image n’a été stockée. Réimporte l’image pour afficher l’aperçu ou relancer l’OCR.";
    } catch (_) { sessionStorage.removeItem(KEY); }
  }
  function errorMessage(error) {
    const message = error instanceof Error ? error.message : String(error ?? "Erreur inconnue.");
    return message.slice(0, 500) || "Erreur inconnue.";
  }
  function showGlobalError(error) {
    status.textContent = `Erreur de l’interface OCR : ${errorMessage(error)}`;
    diagnostics.push({ error: errorMessage(error) });
    updateDiagnostics();
  }
  function updateDiagnostics() {
    const ms = diagnostics.flatMap(d => d.calls || []).map(c => c.ms);
    $("#diagnosticText").textContent = diagnostics.length ? `${diagnostics.length} capture(s) mesurée(s). Temps OCR par appel : ${ms.length ? `${Math.min(...ms)}–${Math.max(...ms)} ms` : "aucun"}. Ces valeurs proviennent de ce navigateur et de cet appareil; elles ne prouvent pas les performances iOS/Android.` : "Aucune analyse exécutée.";
    $("#diagnosticLog").textContent = diagnostics.length ? JSON.stringify(diagnostics, null, 2) : "";
  }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function escapeAttr(value) { return escapeHtml(value); }
})();

