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
    const entry = scoreLocatorSummary.find((item) => item.id === select.dataset.scoreQuality); if (!entry) return;
    entry.quality = select.value; entry.qualityConfirmedAt = new Date().toISOString(); persistScoreLocatorResults();
  }
  async function copyScoreLocatorJson() {
    const json = JSON.stringify(scoreLocatorPayload(), null, 2);
    try { await navigator.clipboard.writeText(json); $("#scoreLocatorStatus").textContent = "Diagnostics géométriques copiés. Aucune valeur OCR ni image n’est incluse."; }
    catch (_) { const area = document.createElement("textarea"); area.value = json; area.setAttribute("readonly", ""); area.style.position = "fixed"; area.style.opacity = "0"; document.body.appendChild(area); area.select(); const copied = document.execCommand("copy"); area.remove(); $("#scoreLocatorStatus").textContent = copied ? "Diagnostics copiés." : "Copie refusée; utilise le téléchargement JSON."; }
  }
  function exportScoreLocatorJson() { if (scoreLocatorSummary.length) download(scoreLocatorPayload(), `war-results-score-localization-${new Date().toISOString().slice(0, 10)}.json`); }
  function clearScoreLocatorResults() {
    scoreLocatorSummary.splice(0); liveScoreLocator.clear(); sessionStorage.removeItem(SCORE_LOCATOR_KEY);
    scoreLocatorResults.innerHTML = ""; $("#scoreLocatorStatus").textContent = "Diagnostics de localisation des scores effacés."; updateLaboratoryControls();
  }

  async function runRecognitionLaboratory() {
    if (analyzing) return;
    const engine = labEngineSelect.value, fields = selectedLabFields();
    const pending = records.filter((record) => record.file);
    if (!fields.length || !pending.length) { labStatus.textContent = "Charge une capture et sélectionne au moins un champ."; return; }
    analyzing = true; labProgress.hidden = false; labProgress.value = 0; labEngineSelect.disabled = true;
    labFields.querySelectorAll("input,button").forEach((control) => { control.disabled = true; });
    $("#labTrophyLocatorSelect").disabled = true; $("#labTrophyMarginSelect").disabled = true;
    numericLocatorSelect.disabled = true;
    render();
    const desired = pending.flatMap((record) => fields.map((field) => laboratoryRecordKey(engine, field, record)));
    const completed = new Set(laboratorySummary.filter((entry) => !entry.diagnostic?.error).map(WarResultsLocatorComparisonStore.laboratoryRecordKey));
    const total = Math.max(1, desired.filter((key) => !completed.has(key)).length);
    let done = 0;
    try {
      for (const record of pending) {
        const missing = fields.filter((field) => !completed.has(laboratoryRecordKey(engine, field, record)));
        if (!missing.length) { labStatus.textContent = `${record.fileName} : champs déjà traités, aucune relance OCR.`; continue; }
        labStatus.textContent = `${record.fileName} — préparation du moteur ${LAB_ENGINE_LABELS[engine]}…`;
        if (engine === "numeric") {
          const marginPercent = Number($("#labTrophyMarginSelect").value || 18);
          const variantId = $("#labTrophyLocatorSelect").value;
          let result = null, engineError = null;
          try {
            result = await WarResultsVisionEngine.analyzeNumericFields(record.file, missing, (message) => {
              if (message.status) labStatus.textContent = `${record.fileName} — ${message.status}`;
              if (Number.isFinite(message.progress)) labProgress.value = Math.max(labProgress.value, Math.round((done + message.progress) / total * 100));
            }, { variantId, marginPercent, geometryMode: numericLocatorSelect.value });
          } catch (error) { engineError = errorMessage(error); }
          for (const field of missing) {
            const diagnostic = result?.fields?.[field] || { field, ...(engineError ? { error: engineError, uncertain: true, uncertainty: "execution" } : { warning: "zone-not-located", uncertainty: "localisation" }) };
            const entry = { sourceKey: record.fileKey || WarResultsLocatorComparisonStore.fileKey(record.file), file: record.fileName, engine, field,
              variantId: labVariant(engine, field), marginPercent: labMargin(engine, field), diagnostic };
            const key = WarResultsLocatorComparisonStore.laboratoryRecordKey(entry);
            liveLabDiagnostics.set(key, { diagnostic, sourceUrl: record.url, dimensions: result.dimensions });
            saveLaboratoryRecord(entry); done++; labProgress.value = Math.round(done / total * 100); renderLaboratoryResults();
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
        } else {
          for (const field of missing) {
            labStatus.textContent = `${record.fileName} — localisation de ${LABELS[field]}…`;
            try {
              const located = await WarResultsVisionEngine.locateLaboratoryField(record.file, field);
              const fieldDiagnostic = await WarResultsVisionEngine.analyzeField(record.file, field, located.rect, (message) => {
                if (message.status) labStatus.textContent = `${record.fileName} — ${LABELS[field]} : ${message.status}`;
              });
              const diagnostic = { ...fieldDiagnostic, locator: located,
                locatorWarning: located.geometryConfidence === "fallback" ? "proportional-layout-fallback" : null };
              const entry = { sourceKey: record.fileKey || WarResultsLocatorComparisonStore.fileKey(record.file), file: record.fileName, engine, field,
                variantId: "default", marginPercent: 0, diagnostic: { ...diagnostic, locator: located } };
              const key = WarResultsLocatorComparisonStore.laboratoryRecordKey(entry);
              liveLabDiagnostics.set(key, { diagnostic: entry.diagnostic, sourceUrl: record.url, dimensions: located.dimensions });
              saveLaboratoryRecord(entry);
            } catch (error) {
              const entry = { sourceKey: record.fileKey || WarResultsLocatorComparisonStore.fileKey(record.file), file: record.fileName, engine, field,
                variantId: "default", marginPercent: 0, diagnostic: { field, error: errorMessage(error), uncertain: true } };
              saveLaboratoryRecord(entry);
            }
            done++; labProgress.value = Math.round(done / total * 100); renderLaboratoryResults();
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
        }
      }
      labStatus.textContent = `Laboratoire ${LAB_ENGINE_LABELS[engine]} terminé. Aucun autre moteur n’a été lancé; aucune donnée n’a été publiée.`;
    } finally {
      try { await WarResultsVisionEngine.release(); } catch (_) {}
      analyzing = false; labProgress.hidden = true; labEngineSelect.disabled = false;
      labFields.querySelectorAll("input,button").forEach((control) => { control.disabled = false; });
      $("#labTrophyLocatorSelect").disabled = false; $("#labTrophyMarginSelect").disabled = false;
      numericLocatorSelect.disabled = false;
      render(); updateLaboratoryControls();
    }
  }

  function saveLaboratoryRecord(entry) {
    laboratorySummary = WarResultsLocatorComparisonStore.mergeLaboratoryRecords(laboratorySummary, [entry]);
    try { sessionStorage.setItem(LABORATORY_KEY, JSON.stringify(WarResultsLocatorComparisonStore.laboratorySnapshot(laboratorySummary))); }
    catch (_) { labStatus.textContent = "Stockage temporaire saturé ou indisponible. Copie ou télécharge les diagnostics avant de quitter."; }
    updateLaboratoryControls();
  }

  function restoreLaboratory() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(LABORATORY_KEY) || "null");
      if (saved?.diagnostic === "local-war-results-recognition-laboratory" && Array.isArray(saved.records)) {
        laboratorySummary = WarResultsLocatorComparisonStore.mergeLaboratoryRecords([], saved.records);
        labStatus.textContent = `${laboratorySummary.length} diagnostic(s) restauré(s). Réimporte les captures pour reprendre les champs déjà terminés sans relancer leur OCR.`;
      }
    } catch (_) { laboratorySummary = []; }
  }

  function renderLaboratoryResults() {
    labResults.innerHTML = laboratorySummary.map((entry) => {
      const key = WarResultsLocatorComparisonStore.laboratoryRecordKey(entry), live = liveLabDiagnostics.get(key);
      const d = live?.diagnostic || entry.diagnostic || {}, rect = d.rect || d.locator?.rect || d.locator?.selectedRect;
      const box = (item, className) => item ? `<rect class="${className}" x="${Number(item.x)}" y="${Number(item.y)}" width="${Number(item.width)}" height="${Number(item.height)}"/>` : "";
      const original = live?.sourceUrl ? `<details><summary>Inspecter les rectangles sur la capture</summary><p class="muted">Jaune : estimation actuelle · cyan : zone retenue après sélection · vert : découpe finale OCR · rouge : glyphes d’ancrage · violet : candidats concurrents (sélection en trait plein).</p><div class="lab-source-wrap" style="aspect-ratio:${Number(live.dimensions?.width)||16}/${Number(live.dimensions?.height)||9}"><img src="${escapeAttr(live.sourceUrl)}" alt="Capture source ${escapeAttr(entry.file)}"><svg viewBox="0 0 ${Number(live.dimensions?.width)||1600} ${Number(live.dimensions?.height)||900}" preserveAspectRatio="none">${box(d.initialRect,"lab-rect-initial")}${(d.locator?.candidates || []).slice(0,8).map((candidate)=>box(candidate.rect,candidate.selected?"lab-rect-candidate-selected":"lab-rect-candidate")).join("")}${(d.locator?.candidates || []).slice(0,8).map((candidate)=>box(candidate.iconAnchor,"lab-rect-icon-anchor")).join("")}${box(d.correctedRect,"lab-rect-corrected")}${box(rect,"lab-rect-final")}${(d.locator?.anchors || []).map((anchor)=>box(anchor,"lab-rect-anchor")).join("")}</svg></div></details>` : "";
      const crops = live && (d.originalPreview || d.correctedPreview || d.preview) ? `<div class="lab-crop-grid">${d.originalPreview ? `<figure><a href="${escapeAttr(d.originalPreview)}" target="_blank" rel="noopener"><img src="${escapeAttr(d.originalPreview)}" alt="Zone estimée ${escapeAttr(LABELS[entry.field])}"></a><figcaption>Estimation actuelle · toucher pour agrandir</figcaption></figure>` : ""}${d.correctedPreview ? `<figure><a href="${escapeAttr(d.correctedPreview)}" target="_blank" rel="noopener"><img src="${escapeAttr(d.correctedPreview)}" alt="Zone rectifiée ${escapeAttr(LABELS[entry.field])}"></a><figcaption>Zone localisée avant raffinement · toucher pour agrandir</figcaption></figure>` : ""}${d.preview ? `<figure><a href="${escapeAttr(d.preview)}" target="_blank" rel="noopener"><img src="${escapeAttr(d.preview)}" alt="Découpe OCR prétraitée ${escapeAttr(LABELS[entry.field])}"></a><figcaption>Découpe finale envoyée à l’OCR · toucher pour agrandir</figcaption></figure>` : ""}</div>` : "";
      const warnings = [...(Array.isArray(d.warnings) ? d.warnings : []), ...(d.warning ? [d.warning] : []), ...(d.locator?.reason ? [d.locator.reason] : []), ...(d.locatorWarning ? [d.locatorWarning] : []), ...(d.error ? [d.error] : [])];
      const details = { zone_initiale: d.initialRect || null, candidats: d.locator?.candidates || [], candidat_retenu: d.locator?.selectedCandidate || null,
        repères: d.locator?.anchors || [], zone_corrigée: d.correctedRect || null,
        découpe_finale_ocr: rect || null, méthode_localisation: d.locator?.method || d.locatorMethod || null,
        localisateur: d.locator || d.locatorMethod || null, prétraitement: d.preprocessing || null,
        OCR_brut: d.raw ?? null, candidat: d.candidate ?? d.value ?? null, valeur_retenue: d.value ?? null, durée_ms: d.ms ?? null,
        confiance: d.confidence ?? null, incertitude: d.uncertainty || (d.uncertain ? "à vérifier" : null), avertissements: warnings.length ? warnings : d.warning || null,
        diagnostics_moteur: d.identityDiagnostics || d.resultDiagnostics || null };
      const caution = warnings.length || d.uncertain ? `<p class="lab-warning">${escapeHtml(warnings.join(" · ") || "Lecture à vérifier")}${d.uncertainty ? ` · étape : ${escapeHtml(d.uncertainty)}` : ""}</p>` : `<p class="lab-success">Lecture sans avertissement explicite. Vérification humaine recommandée.</p>`;
      const recognized = `<p class="lab-recognized">Valeur retenue : <strong>${escapeHtml(d.value || "—")}</strong>${d.raw ? ` · OCR brut : ${escapeHtml(d.raw)}` : ""}${Number.isFinite(d.ms) ? ` · ${d.ms} ms` : ""}${Number.isFinite(d.confidence) ? ` · confiance ${Math.round(d.confidence)} %` : ""}</p>`;
      return `<article class="lab-result-card"><h3>${escapeHtml(LAB_ENGINE_LABELS[entry.engine] || entry.engine)} · ${escapeHtml(LABELS[entry.field] || entry.field)}</h3><p>${escapeHtml(entry.file || "Capture réimportée")} · variante ${escapeHtml(entry.variantId)}${entry.marginPercent ? ` · marge ${Number(entry.marginPercent)} %` : ""}</p>${recognized}${original}${crops}${caution}<details><summary>Diagnostic détaillé</summary><pre>${escapeHtml(JSON.stringify(details, null, 2))}</pre></details></article>`;
    }).join("");
    updateLaboratoryControls();
  }

  function laboratoryPayload() { return WarResultsLocatorComparisonStore.laboratorySnapshot(laboratorySummary); }
  async function copyLaboratoryJson() {
    if (!laboratorySummary.length) return;
    const json = JSON.stringify(laboratoryPayload(), null, 2);
    try { await navigator.clipboard.writeText(json); labStatus.textContent = "Diagnostics copiés. Les images et découpes ne figurent pas dans le JSON."; }
    catch (_) { const area = document.createElement("textarea"); area.value = json; area.setAttribute("readonly", ""); area.style.position = "fixed"; area.style.opacity = "0"; document.body.appendChild(area); area.select(); const copied = document.execCommand("copy"); area.remove(); labStatus.textContent = copied ? "Diagnostics copiés. Les images et découpes ne figurent pas dans le JSON." : "Copie refusée; télécharge le JSON local."; }
  }
  function exportLaboratoryJson() { if (laboratorySummary.length) download(laboratoryPayload(), `war-results-laboratory-${new Date().toISOString().slice(0, 10)}.json`); }

  function restoreNumericOcrResults() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(NUMERIC_OCR_KEY) || "[]");
      if (Array.isArray(saved)) numericOcrSummary.push(...saved.filter((item) => item && item.captureId && item.field && item.variants).map((item) => ({ ...item, compact: item })));
      if (numericOcrSummary.length) renderNumericOcrResults("Mesures OCR textuelles restaurées. Réimporte les captures pour relancer les lectures ou afficher les découpes.");
    } catch (_) { sessionStorage.removeItem(NUMERIC_OCR_KEY); }
  }

  function compactNumericOcrEntry(entry) {
    const { diagnostic: d } = entry;
    return { captureId: entry.captureId, field: entry.field, dimensions: entry.dimensions, rect: d.rect, initialRect: d.initialRect,
      correctedRect: d.correctedRect, rectFrozen: d.ocrRectFrozen === true,
      variants: (d.ocrComparison?.strategies || []).map((item) => ({ strategy: item.strategy, label: item.label, psm: item.psm, preprocessing: item.preprocessing, raw: item.raw, value: item.value, digits: item.digits, digitCount: item.digitCount, confidence: item.confidence, ms: item.ms, ocrMs: item.ocrMs, warnings: item.warnings, segmentation: item.segmentation, morphology: item.morphology, proposedCorrection: item.proposedCorrection,
        glyphs: item.glyphs?.map((glyph) => ({ bounds: glyph.bounds, raw: glyph.raw, value: glyph.value, digits: glyph.digits,
          digitCount: glyph.digitCount, confidence: glyph.confidence, ms: glyph.ms, warnings: glyph.warnings })) || undefined,
        ocrSymbols: item.ocrSymbols, alignment: item.alignment, morphologyChecks: item.morphologyChecks, decision: item.decision,
        decisionRationale: item.decisionRationale, stageTimings: item.stageTimings, ocrReused: item.ocrReused })),
      consensus: d.ocrComparison?.consensus || null, totalMs: d.ocrComparison?.totalMs ?? null, warning: d.warning || null };
  }

  function initializeOcrCombinations() {
    const psms=[7,8,13], preps=[["reference","Référence sans correction"],["grayscale","Niveaux de gris"],["otsu","Seuillage global Otsu"],["adaptive","Seuillage local adaptatif"],["tight-crop","Marge horizontale réduite"],["thin-strokes","Amincissement morphologique"]];
    $("#ocrCombinationOptions").innerHTML=preps.flatMap(([prep,label])=>psms.map(psm=>{
      const combo={id:`combo:${prep}:psm${psm}`,label:`PSM ${psm} · ${label}`,group:prep==="reference"?"baseline":"preprocess",psm,prep,parameters:{}};
      return `<label><input type="checkbox" value="${escapeAttr(JSON.stringify(combo))}" ${prep==="reference"?"checked":""}> ${escapeHtml(combo.label)}</label>`;
    })).join("");
    updateOcrCombinationCount();
  }
  function updateOcrCombinationCount() {
    const count=document.querySelectorAll("#ocrCombinationOptions input:checked").length+($("#ocrGlyphOption").checked?1:0)+($("#ocrMorphologyOption").checked?1:0)+($("#ocrAlignmentOption").checked?1:0);
    $("#ocrCombinationCount").textContent=`${count} combinaison${count===1?"":"s"} sélectionnée${count===1?"":"s"}`;
  }
  function applyRecommendedOcrPreset() {
    document.querySelectorAll("#ocrCombinationOptions input").forEach(input=>{
      const c=JSON.parse(input.value);
      input.checked=(c.psm===7&&c.prep==="reference")||(c.psm!==7&&["reference","tight-crop","thin-strokes"].includes(c.prep));
    });
    $("#ocrGlyphOption").checked=false;
    $("#ocrMorphologyOption").checked=false;
    $("#ocrAlignmentOption").checked=false;
    updateOcrCombinationCount();
  }

  async function compareNumericOcr() {
    if (analyzing) return;
    const batch = records.filter((record) => record.file);
    const selected = [...document.querySelectorAll("#ocrCombinationOptions input:checked")].map((input) => JSON.parse(input.value));
    if ($("#ocrMorphologyOption").checked) selected.push("psm8-morphology");
    if ($("#ocrAlignmentOption").checked) selected.push("psm8-glyph-alignment");
    if ($("#ocrGlyphOption").checked) selected.push("glyphs");
    if (!batch.length) { $("#numericOcrStatus").textContent = "Charge une ou plusieurs captures dans le laboratoire."; return; }
    if (!selected.length) { $("#numericOcrStatus").textContent = "Sélectionne au moins une stratégie OCR."; return; }
    analyzing = true;
    $("#compareNumericOcrButton").disabled = true;
    $("#numericOcrStatus").textContent = "Localisation fixe des trophées, puis comparaisons OCR séquentielles…";
    try {
      for (const [index, record] of batch.entries()) {
        const fields = ["localTrophies", "opponentTrophies"];
        const result = await WarResultsVisionEngine.analyzeNumericFields(record.file, fields, (message) => {
          if (message.status) $("#numericOcrStatus").textContent = `${record.fileName} — ${message.status}`;
        }, { geometryMode: "pixel-content", variantId: "vertical-recovery-combined", marginPercent: 18, compareOcr: true, ocrStrategies: selected });
        for (const field of fields) {
          const diagnostic = result.fields[field];
          const item = { captureId: `Capture ${index + 1}`, file: record.fileName, field, dimensions: result.dimensions, diagnostic };
          const key = `${record.fileKey || record.fileName}:${field}`;
          const prior = numericOcrSummary.findIndex((entry) => entry.key === key || (entry.captureId === `Capture ${index + 1}` && entry.field === field));
          const stored = { key, ...item, compact: compactNumericOcrEntry(item) };
          if (prior >= 0) numericOcrSummary[prior] = stored; else numericOcrSummary.push(stored);
          try { sessionStorage.setItem(NUMERIC_OCR_KEY, JSON.stringify(numericOcrSummary.map((entry) => entry.compact))); }
          catch (_) { $("#numericOcrStatus").textContent = "Le stockage temporaire est saturé; les résultats restent visibles dans cette page. Exporte le JSON avant de quitter."; }
          renderNumericOcrResults(`${record.fileName} terminé · capture ${index + 1}/${batch.length}. Les rectangles sont figés à 18 %.`);
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
    } finally {
      analyzing = false;
      updateLaboratoryControls();
    }
  }

  function renderNumericOcrResults(statusText) {
    const target = $("#numericOcrResults");
    const tableRows=numericOcrSummary.flatMap(entry=>(entry.diagnostic?.ocrComparison?.strategies||entry.compact?.variants||[]).map(item=>`<tr><td>${escapeHtml(entry.captureId||"Capture")} · ${escapeHtml(LABELS[entry.field]||entry.field)}</td><td>${escapeHtml(item.label||item.strategy)}</td><td>${escapeHtml(item.value||"—")}</td><td>${Number.isFinite(item.digitCount)?item.digitCount:"—"}</td><td>${Number.isFinite(item.confidence)?Math.round(item.confidence)+" %":"—"}</td><td>${Number.isFinite(item.ms)?item.ms+" ms":"—"}</td></tr>`));
    $("#numericOcrTable").innerHTML=tableRows.length?`<div class="numeric-ocr-table-wrap"><table class="numeric-ocr-table"><thead><tr><th>Champ</th><th>Combinaison</th><th>Valeur</th><th>Chiffres</th><th>Confiance</th><th>Durée</th></tr></thead><tbody>${tableRows.join("")}</tbody></table></div>`:"";

    const rows = numericOcrSummary.map((entry) => {
      const d = entry.diagnostic || {}, data = entry.compact || compactNumericOcrEntry(entry);
      const strategies = d.ocrComparison?.strategies || data.variants || [];
      const alignmentPanel=(item)=>{
        const a=item.alignment;if(!a)return "";
        const decisionLabels={"keep-ocr":"Conserver OCR","propose-correction":"Proposition ciblée","abstain":"Abstention"};
        const association=(a.groups||[]).map(g=>`OCR ${g.ocr.map(c=>`${c.index}:${c.text}`).join("+")||"∅"} ↔ glyphes ${g.glyphs.map(x=>x.index).join("+")||"∅"} · ${g.relation} · ${Math.round(g.confidence*100)} %`).join("; ");
        const inspections=(item.morphologyChecks||[]).map(g=>`<li>Glyphe ${g.glyphIndex} · ${g.relation} · classe ${g.features.classification} (${Math.round(g.features.confidence*100)} %, marge ${Math.round(g.features.margin*100)} %) · cavités ${g.features.holeCount} · bas ${Math.round(g.features.lowerInkRatio*100)} % · bas droite ${Math.round(g.features.lowerRightInkRatio*100)} % · exclu 9 : ${escapeHtml(g.features.exclusionReasons.join(", ")||"aucun")}</li>`).join("");
        const width=Number(a.coordinateSpace?.width)||1,height=Number(a.coordinateSpace?.height)||1;
        const overlayRects=[...(a.ocrCharacters||[]).filter(c=>c.bounds).map(c=>`<rect class="ocr-align-symbol" x="${c.bounds.x}" y="${c.bounds.y}" width="${c.bounds.width}" height="${c.bounds.height}"><title>OCR ${escapeHtml(c.index+": "+c.text)}</title></rect>`),...(a.physicalGlyphs||[]).map(g=>`<rect class="ocr-align-glyph" x="${g.bounds.x}" y="${g.bounds.y}" width="${g.bounds.width}" height="${g.bounds.height}"><title>Glyphe ${g.index}</title></rect>`)].join("");
        const overlay=item.preview&&overlayRects?`<details class="ocr-alignment-visual"><summary>Visualiser les rectangles OCR et glyphes</summary><p class="muted">Cyan : caractères OCR · vert : glyphes physiques. Les rectangles sont exprimés dans la découpe source.</p><div class="ocr-alignment-overlay" style="aspect-ratio:${width}/${height}"><img src="${escapeAttr(item.preview)}" alt="Découpe numérique avec rectangles d’alignement"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Rectangles OCR et glyphes superposés">${overlayRects}</svg></div></details>`:"";
        return `<details class="ocr-alignment-details"><summary>Diagnostic alignement OCR/glyphes · ${escapeHtml(decisionLabels[item.decision]||item.decision||"à examiner")}</summary><p>Initial : <strong>${escapeHtml(item.raw||"—")}</strong> · ${item.digitCount} caractère(s) OCR / ${a.selectedGlyphCount??"—"} glyphe(s) physique(s) · source coordonnées : ${escapeHtml(a.source)} · confiance alignement ${Math.round(a.confidence*100)} % · marge segmentation ${Math.round((a.candidateMargin||0)*100)} %${item.ocrReused?" · lecture PSM 8 partagée":""}.</p><p>Associations : ${escapeHtml(association||"aucune")}</p><p>Anomalies : ${escapeHtml(JSON.stringify(a.anomalies||[]))}</p>${inspections?`<ul>${inspections}</ul>`:"<p>Aucun glyphe n’a nécessité de vérification morphologique ciblée.</p>"}<p>Décision : <strong>${escapeHtml(decisionLabels[item.decision]||item.decision||"—")}</strong> · ${escapeHtml(item.decisionRationale||"")}</p>${item.proposedCorrection?`<p class="lab-warning">Proposition ${escapeHtml(item.proposedCorrection.from)} → ${escapeHtml(item.proposedCorrection.to)} · ${escapeHtml(item.proposedCorrection.rationale)}. La lecture initiale n’est pas remplacée.</p>`:""}<p>Temps : OCR ${item.stageTimings?.ocrMs??"—"} ms · segmentation ${item.stageTimings?.segmentationMs??"—"} ms · alignement ${item.stageTimings?.alignmentMs??"—"} ms · morphologie ${item.stageTimings?.morphologyMs??"—"} ms · total ${item.stageTimings?.totalMs??"—"} ms.</p>${overlay}</details>`;
      };
      const family = (item) => `<article class="numeric-ocr-variant"><h4>${escapeHtml(item.label || item.strategy)}</h4>${item.preview ? `<a href="${escapeAttr(item.preview)}" target="_blank" rel="noopener"><img src="${escapeAttr(item.preview)}" alt="Prétraitement ${escapeAttr(item.label || item.strategy)}" loading="lazy"></a>` : ""}<p>Brut : <strong>${escapeHtml(item.raw || "—")}</strong> · valeur à 4 chiffres : ${escapeHtml(item.value || "—")}<br>Chiffres : ${Number.isFinite(item.digitCount) ? item.digitCount : "—"} · confiance : ${Number.isFinite(item.confidence) ? `${Math.round(item.confidence)} %` : "—"} · temps total ${Number.isFinite(item.ms) ? `${item.ms} ms` : "—"}${Number.isFinite(item.ocrMs) ? ` (${item.ocrMs} ms Tesseract)` : ""}<br>PSM ${Number.isFinite(item.psm) ? item.psm : "—"} · ${escapeHtml(item.preprocessing || "—")}${item.warnings?.length ? `<br>Avertissements : ${escapeHtml(item.warnings.join(", "))}` : ""}</p>${item.morphology ? `<p>Segmentation morphologique : ${item.morphology.selectedCount ?? "incertaine"} glyphe(s) retenu(s); lectures OCR ${item.morphology.ocrDigitCount} chiffre(s).</p>${item.morphology.glyphs.map(g=>`<p>Glyphe ${g.index}: boucle(s) ${g.features.holeCount}, bas ${Math.round(g.features.lowerInkRatio*100)} %, barre haute ${Math.round(g.features.topBar*100)} %, barre médiane ${Math.round(g.features.midBar*100)} %; hypothèses ${g.features.hypotheses.map(h=>h.digit+":"+h.score).join(", ")}; ${g.features.classification?"classe morphologique "+g.features.classification:"classe indécise"}.</p>`).join("")}${item.proposedCorrection?`<p class="lab-warning">Correction proposée ${escapeHtml(item.proposedCorrection.from)} → ${escapeHtml(item.proposedCorrection.to)} · ${escapeHtml(item.proposedCorrection.rationale)}</p>`:""}` : ""}${item.glyphs?.length ? `<div class="numeric-glyph-grid">${item.glyphs.map((glyph, i) => `<figure>${glyph.preview ? `<img src="${escapeAttr(glyph.preview)}" alt="Glyphe ${i + 1}" loading="lazy">` : ""}<figcaption>${i + 1}. ${escapeHtml(glyph.raw || "—")} · ${glyph.confidence ?? "—"} %</figcaption></figure>`).join("")}</div>` : ""}${alignmentPanel(item)}</article>`;
      const consensus = d.ocrComparison?.consensus || data.consensus;
      return `<article class="numeric-ocr-card"><h3>${escapeHtml(entry.captureId || "Capture")} · ${escapeHtml(LABELS[entry.field] || entry.field)}</h3><p>Image ${Number(entry.dimensions?.width) || "?"} × ${Number(entry.dimensions?.height) || "?"} · rectangle fixe : ${escapeHtml(JSON.stringify(d.rect || data.rect || null))} · combinaison, marge 18 % · rectangle conservé pour toutes les stratégies : ${data.rectFrozen ? "oui" : "diagnostic restauré"}</p><p>Consensus expérimental : <strong>${escapeHtml(consensus?.value || "lecture divergente")}</strong>${consensus?.warnings?.length ? ` · ${escapeHtml(consensus.warnings.join(", "))}` : ""} · temps total ${Number(d.ocrComparison?.totalMs ?? data.totalMs) || 0} ms</p><div class="numeric-ocr-variant-grid">${strategies.map(family).join("")}</div></article>`;
    }).join("");
    target.innerHTML = rows;
    $("#numericOcrStatus").textContent = statusText || `${numericOcrSummary.length} lecture(s) conservée(s) dans cette session.`;
    $("#clearNumericOcrButton").disabled = !numericOcrSummary.length;
    $("#copyNumericOcrButton").disabled = !numericOcrSummary.length;
    $("#exportNumericOcrButton").disabled = !numericOcrSummary.length;
  }

  function numericOcrPayload() {
    return { schemaVersion: "1.0.0", scope: "numeric-laboratory-only", engine: "Tesseract.js v5 local", locator: "pixel-content + vertical-recovery-combined", marginPercent: 18,
      privacy: "No source image pixels, crops, Base64 data, or expected benchmark values are included.", entries: numericOcrSummary.map((entry) => entry.compact || compactNumericOcrEntry(entry)) };
  }
  async function copyNumericOcrJson() {
    const json = JSON.stringify(numericOcrPayload(), null, 2);
    try { await navigator.clipboard.writeText(json); $("#numericOcrStatus").textContent = "Rapport OCR JSON copié sans images ni valeurs attendues."; }
    catch (_) { const area = document.createElement("textarea"); area.value = json; area.setAttribute("readonly", ""); area.style.position = "fixed"; area.style.opacity = "0"; document.body.appendChild(area); area.select(); const copied = document.execCommand("copy"); area.remove(); $("#numericOcrStatus").textContent = copied ? "Rapport OCR JSON copié sans images ni valeurs attendues." : "Copie refusée; utilise le téléchargement JSON."; }
  }
  function exportNumericOcrJson() { if (numericOcrSummary.length) download(numericOcrPayload(), `war-results-numeric-ocr-${new Date().toISOString().slice(0, 10)}.json`); }
  function clearNumericOcrResults() { numericOcrSummary.splice(0); sessionStorage.removeItem(NUMERIC_OCR_KEY); $("#numericOcrResults").innerHTML = ""; renderNumericOcrResults("Résultats du comparateur OCR effacés."); }

  function cardHtml(r, index) {
    const stateText = { queued: "En attente", analyzing: "Analyse en cours", review: "À vérifier", validated: "Validée localement", error: "Erreur" }[r.state];
    const badgeClass = r.state === "validated" ? "is-ready" : r.state === "error" ? "is-error" : "";
    const dimensions = r.analysis?.metrics?.dimensions;
    const preview = r.url ? `<div class="zone-editor"><p class="muted">Zones détectées — touche une zone pour la sélectionner, déplace-la ou ajuste son coin. Les coordonnées restent celles de l’image originale.</p><div class="zone-source-wrap" style="aspect-ratio:${dimensions?.width || 16}/${dimensions?.height || 9}"><img class="result-preview" src="${r.url}" alt="Aperçu de ${escapeAttr(r.fileName)}" loading="lazy"><svg class="zone-overlay" data-zone-overlay data-id="${r.id}" viewBox="0 0 ${dimensions?.width || 1600} ${dimensions?.height || 900}" preserveAspectRatio="none">${Object.entries(r.analysis?.zones || {}).map(([key,z])=>`<g class="zone-mark ${r.selectedZone===key?"is-selected":""}" data-zone-key="${key}"><rect x="${z.rect.x}" y="${z.rect.y}" width="${z.rect.width}" height="${z.rect.height}"/><circle cx="${z.rect.x+z.rect.width}" cy="${z.rect.y+z.rect.height}" r="${Math.max(8,Math.min(z.rect.width,z.rect.height)*.08)}"/></g>`).join("")}</svg></div><label class="zone-picker">Champ à corriger<select data-zone-select="${r.id}">${FIELDS.map(k=>`<option value="${k}" ${r.selectedZone===(k)?"selected":""}>${LABELS[k]}</option>`).join("")}</select></label><button class="secondary-button" data-action="reread-zone" data-id="${r.id}">Relire la zone sélectionnée</button></div>` : `<p class="result-status">Image à sélectionner de nouveau pour afficher l’aperçu.</p>`;
    const fieldSections = `<section class="zone-fields-group"><h3>Alliance LoSP</h3><div class="zone-fields-grid">${fieldHtml(r, "localAlliance", "text", "Nom de l’alliance", "Nom affiché dans MSF")}${fieldHtml(r, "localScore", "numeric", "Score", "6 chiffres")}${fieldHtml(r, "localTrophies", "numeric", "Trophées", "4 chiffres")}</div></section><section class="zone-fields-group"><h3>Alliance adverse</h3><div class="zone-fields-grid">${fieldHtml(r, "opponentAlliance", "text", "Nom de l’alliance", "Nom original affiché dans MSF")}${fieldHtml(r, "opponentScore", "numeric", "Score", "6 chiffres")}${fieldHtml(r, "opponentTrophies", "numeric", "Trophées", "4 chiffres")}</div></section><section class="zone-fields-group"><h3>Résultat</h3><div class="zone-fields-grid">${fieldHtml(r, "result", "select", "Résultat", "")}</div></section>${fieldHtml(r, "warDate", "date", "Date réelle de la guerre", "Saisie manuelle obligatoire")}`;
    const diag = r.analysis ? `<details class="result-diagnostics"><summary>Diagnostics OCR et couleurs</summary><p>${escapeHtml(JSON.stringify(r.analysis.metrics, null, 2))}</p><pre>${escapeHtml(r.rawText)}</pre></details>` : "";
    return `<article class="capture-card result-card ${r.state === "error" ? "is-error" : ""}" data-id="${r.id}" id="result-${r.id}">
      <div class="result-card-top"><div><h2>Capture ${index + 1} · ${escapeHtml(r.fileName)}</h2><p class="capture-meta">État : <span class="status-chip ${badgeClass}">${stateText}</span></p></div><div class="result-card-actions"><button class="secondary-button" data-action="analyze-one" data-id="${r.id}" ${analyzing || !r.file ? "disabled" : ""}>Relancer l’analyse</button><button class="secondary-button" data-action="remove" data-id="${r.id}" ${r.state === "analyzing" ? "disabled" : ""}>Supprimer</button></div></div>
      ${preview}<p class="result-status" role="status">${escapeHtml(r.error || (r.state === "analyzing" ? "Traitement local en cours…" : r.state === "queued" ? "Prête pour l’analyse." : r.state === "validated" ? "Vérification manuelle confirmée. Fiche locale uniquement." : "Vérifie les propositions et les incertitudes avant de continuer."))}</p>
      <div class="result-fields">${fieldSections}</div>
      <p class="result-status">Clé de rapprochement de l’adversaire : <strong class="match-key-value">${escapeHtml(WarResultsVisionData.toMatchKey(r.values.opponentAlliance) || "—")}</strong> (aucun rapprochement automatique)</p>
      ${diag}
      <label class="result-review"><input type="checkbox" data-confirm="${r.id}" ${r.confirmed ? "checked" : ""}> J’ai comparé les huit champs, y compris la date, à mes informations de guerre.</label>
      <div class="result-card-footer"><button class="primary-button" data-action="validate" data-id="${r.id}" ${r.state === "analyzing" ? "disabled" : ""}>Valider cette fiche localement</button><button class="secondary-button" data-action="export-one" data-id="${r.id}" ${r.state !== "validated" ? "disabled" : ""}>Télécharger cette fiche (.json)</button></div>
    </article>`;
  }

  function fieldHtml(r, key, kind, label, help) {
    if (key === "warDate") return `<label class="result-field" data-field-wrap="warDate"><span>${label} *</span><input data-date="${r.id}" type="date" value="${escapeAttr(r.date)}" aria-label="${label}"><small>${help}</small></label>`;
    const meta = r.fields[key] || {};
    const value = r.values[key] ?? "";
    const state = meta.alternatives?.length ? "conflict" : meta.uncertain && value ? "uncertain" : !value ? "missing" : r.corrected.includes(key) ? "corrected" : "recognized";
    const statusText = { conflict: "Lectures contradictoires — choisis ou corrige", uncertain: "À vérifier — confiance insuffisante ou indices contradictoires", missing: "Valeur absente — saisie manuelle requise", corrected: "Corrigé manuellement", recognized: `${key === "result" ? "Résultat couleur" : key.endsWith("Alliance") ? "Identité OCR" : "Proposition OCR"}${meta.confidence != null ? ` · confiance ${Math.round(meta.confidence)} %` : ""}` }[state];
    let control = kind === "select" ? `<select data-field="${key}" data-id="${r.id}" aria-label="${label}"><option value="">À vérifier</option><option value="win" ${value === "win" ? "selected" : ""}>Victoire LoSP</option><option value="loss" ${value === "loss" ? "selected" : ""}>Défaite LoSP</option></select>` : `<input data-field="${key}" data-id="${r.id}" type="text" value="${escapeAttr(value)}" ${kind === "numeric" ? `inputmode="numeric" pattern="[0-9]*" maxlength="${key.includes("Score") ? 6 : 4}" autocomplete="off"` : `autocomplete="off" autocapitalize="off"`} aria-label="${label}">`;
    const alternatives = meta.alternatives?.length ? `<div class="field-proposals" aria-label="Propositions OCR">${[...new Set(meta.alternatives)].map((v) => `<button type="button" data-action="choose" data-id="${r.id}" data-field="${key}" data-value="${escapeAttr(v)}">Utiliser « ${escapeHtml(v)} »</button>`).join("")}</div>` : "";
    const richSegments = meta.richName?.schemaVersion === 1 && Array.isArray(meta.richName.segments) ? meta.richName.segments : [];
    const richPreview = kind === "text" && key.endsWith("Alliance") && value && !r.corrected.includes(key) && !meta.manuallyEdited && !meta.uncertain && !meta.colorUncertain && richSegments.some((segment) => /^#[0-9a-f]{6}$/i.test(String(segment.color || "")))
      ? `<div class="identity-color-preview" aria-label="Couleurs estimées du nom"><span>Couleurs estimées</span>${richSegments.map((segment) => `<span${/^#[0-9a-f]{6}$/i.test(String(segment.color || "")) ? ` style="color:${segment.color}"` : ""}>${escapeHtml(segment.text || "")}</span>`).join("")}</div>` : "";
    const rereadProposal = meta.ocrProposal ? `<div class="field-proposals"><small>Nouvelle lecture de la zone : ${escapeHtml(meta.ocrProposal)}${meta.ocrProposalConfidence != null ? ` (${Math.round(meta.ocrProposalConfidence)} %)` : ""}</small><button type="button" data-action="accept-reread" data-id="${r.id}" data-field="${key}">Utiliser cette proposition</button></div>` : "";
    const zone = r.analysis?.zones?.[key];
    const evidence = zone ? `<div class="zone-evidence"><div class="zone-crop-comparison"><figure><img src="${zone.sourcePreview || zone.preview}" alt="Découpe originale de ${label}" loading="lazy"><figcaption>Capture originale</figcaption></figure><figure><img src="${zone.preview}" alt="Traitement réellement lu pour ${label}" loading="lazy"><figcaption>Image utilisée par la lecture</figcaption></figure></div><small>Localisation : ${escapeHtml(zone.method)} · ${zone.geometryConfidence || "non évaluée"}<br>Lecture : ${escapeHtml(zone.ocrMethod || "lecture ciblée")} · ${zone.rect.width}×${zone.rect.height} px · disposition ${zone.layout}</small><details><summary>Agrandir les découpes</summary><div class="zone-crop-comparison"><img class="zone-crop-large" src="${zone.sourcePreview || zone.preview}" alt="Découpe originale agrandie ${label}" loading="lazy"><img class="zone-crop-large" src="${zone.preview}" alt="Traitement OCR agrandi ${label}" loading="lazy"></div></details><button type="button" data-action="select-zone" data-id="${r.id}" data-field="${key}">Sélectionner cette zone</button><button type="button" data-action="reread-field" data-id="${r.id}" data-field="${key}">Relancer l’OCR de ce champ</button></div>` : `<small class="zone-not-found">Zone indisponible — vérifie le cadrage avant toute saisie.</small>`;
    return `<div class="result-field is-${state}" data-field-wrap="${key}"><span>${label}</span>${control}${richPreview}<small class="field-state">${statusText}</small>${help ? `<small>${help}</small>` : ""}${alternatives}${rereadProposal}${evidence}</div>`;
  }

  function onEdit(event) {
    const el = event.target;
    const record = records.find((r) => r.id === el.dataset.id || r.id === el.dataset.date || r.id === el.dataset.confirm || r.id === el.dataset.zoneSelect);
    if (!record) return;
    if (el.dataset.field) {
      const key = el.dataset.field;
      record.values[key] = el.value;
      if (!record.corrected.includes(key)) record.corrected.push(key);
      if (record.state === "validated") record.state = "review";
      record.confirmed = false;
      const prior = record.fields[key] || {};
      record.fields[key] = { ...prior, value: el.value, uncertain: false, manuallyEdited: true, alternatives: [] };
      const wrap = el.closest(".result-field");
      wrap.classList.remove("is-missing", "is-uncertain", "is-conflict"); wrap.classList.add("is-corrected");
      wrap.querySelector(".field-state").textContent = "Corrigé manuellement";
      if (key.endsWith("Alliance")) wrap.querySelector(".identity-color-preview")?.remove();
      el.closest(".result-card").querySelector(`[data-confirm="${record.id}"]`).checked = false;
      if (key === "opponentAlliance") el.closest(".result-card").querySelector(".match-key-value").textContent = WarResultsVisionData.toMatchKey(el.value) || "—";
    } else if (el.dataset.date) { record.date = el.value; record.confirmed = false; if (record.state === "validated") record.state = "review"; el.closest(".result-card").querySelector(`[data-confirm="${record.id}"]`).checked = false; }
    else if (el.dataset.confirm) record.confirmed = el.checked;
    else if (el.dataset.zoneSelect) { record.selectedZone = el.value; render(); }
    saveDrafts();
  }

  async function analyzePending(oneId = null) {
    if (analyzing) return;
    try {
      const targetId = typeof oneId === "string" ? oneId : null;
      const pending = records.filter((r) => r.file && (!targetId ? ["queued", "error"].includes(r.state) : r.id === targetId));
      if (!pending.length) {
        status.textContent = targetId
          ? "Cette capture n’est plus disponible pour une nouvelle analyse."
          : "Aucune capture en attente. Sélectionne d’abord une ou plusieurs images.";
        return;
      }
      analyzing = true;
      progress.hidden = false;
      progress.value = 0;
      diagnostics = [];
      status.textContent = `Démarrage de l’analyse (${pending.length} capture${pending.length > 1 ? "s" : ""})…`;
      render();
      let done = 0;
      for (const record of pending) {
        record.state = "analyzing"; record.error = ""; render();
        status.textContent = `Analyse ${done + 1}/${pending.length} : préparation de ${record.fileName}…`;
        try {
          const before = performance.now();
          const result = await WarResultsVisionEngine.analyze(record.file, (message) => {
            if (message.status) status.textContent = `${record.fileName} — ${message.status}`;
            if (Number.isFinite(message.progress)) progress.value = Math.max(progress.value, Math.round((done + message.progress) / pending.length * 100));
          }, record.zoneOverrides || {});
          const previousFields = record.fields || {};
          record.fields = result.fields;
          record.values = Object.fromEntries(FIELDS.map((key) => [key, record.corrected.includes(key) ? record.values[key] : (result.fields[key]?.value || "")]));
          for (const key of record.corrected) if (previousFields[key]?.manuallyEdited) record.fields[key] = previousFields[key];
          record.confirmed = false;
          record.analysis = result;
          record.rawText = result.rawText;
          record.warnings = result.warnings;
          record.state = "review";
          record.error = "";
          diagnostics.push({ file: record.fileName, ...result.metrics, pageElapsedMs: Math.round(performance.now() - before) });
        } catch (error) {
          record.state = "error";
          record.error = errorMessage(error);
          diagnostics.push({ file: record.fileName, error: record.error });
        }
        done++;
        progress.value = Math.round(done / pending.length * 100);
        saveDrafts(); render();
      }
      status.textContent = "Analyse terminée. Vérifie et corrige chaque fiche avant validation locale.";
    } catch (error) {
      const message = `Erreur avant ou pendant le démarrage de l’analyse : ${errorMessage(error)}`;
      status.textContent = message;
      diagnostics.push({ error: message });
      const failed = records.find((r) => r.state === "analyzing");
      if (failed) { failed.state = "error"; failed.error = message; }
      saveDrafts(); render();
    } finally {
      if (analyzing) {
        try { await WarResultsVisionEngine.release(); }
        catch (error) { status.textContent = `Analyse terminée, mais libération du moteur impossible : ${errorMessage(error)}`; }
        analyzing = false;
        progress.hidden = true;
        render();
      }
      updateDiagnostics();
    }
  }

  async function compareTrophyLocators() {
    if (analyzing) return;
    if (labEngineSelect.value !== "numeric") { locatorCompareStatus.textContent = "Sélectionne le moteur Numérique dans le laboratoire pour utiliser le comparateur A/B."; return; }
    const selectedTrophies = selectedLabFields().filter((field) => field === "localTrophies" || field === "opponentTrophies");
    if (!selectedTrophies.length) { locatorCompareStatus.textContent = "Coche au moins un champ de trophées dans le laboratoire numérique."; return; }
    const marginPercent = [0, 18, 30].includes(Number(trophyMarginSelect?.value)) ? Number(trophyMarginSelect.value) : 18;
    const selection = trophyRecoverySelect?.value;
    const variantId = selection === "vertical-recovery-combined" ? "adaptive-vertical-recovery-combined" : selection === "vertical-recovery-icon-aware" ? "adaptive-vertical-recovery-icon-aware" : selection === "vertical-recovery-edge-safe" ? "adaptive-vertical-recovery-edge-safe" : selection === "vertical-recovery" ? "adaptive-vertical-recovery" : "adaptive";
    const variantLabel = variantId === "adaptive-vertical-recovery-combined" ? "Adaptatif + reprise + corrections combinées" : variantId === "adaptive-vertical-recovery-icon-aware" ? "Adaptatif + reprise + rejet d’icône" : variantId === "adaptive-vertical-recovery-edge-safe" ? "Adaptatif + reprise + marge bord" : variantId === "adaptive-vertical-recovery" ? "Adaptatif + reprise verticale" : "Adaptatif sans reprise";
    const verticalRecovery = variantId !== "adaptive";
    const edgeSafePadding = variantId === "adaptive-vertical-recovery-edge-safe" || variantId === "adaptive-vertical-recovery-combined";
    const iconAware = variantId === "adaptive-vertical-recovery-icon-aware" || variantId === "adaptive-vertical-recovery-combined";
    const batch = records.filter((record) => record.file && !locatorComparisonSummary.some((item) => selectedTrophies.every((key) => item.fields?.some((field) => field.field === key)) && item.sourceKey === (record.fileKey || WarResultsLocatorComparisonStore.fileKey(record.file)) && Number(item.marginPercent ?? 18) === marginPercent && (item.variantId || "adaptive") === variantId));
    if (!batch.length) {
      locatorCompareStatus.textContent = records.some((record) => record.file)
        ? "Toutes les captures chargées disposent déjà d’un résultat conservé. Aucune image n’a été retraitée."
        : "Charge une capture avant de lancer la comparaison.";
      return;
    }
    analyzing = true;
    render();
    $("#clearLocatorComparisonButton").disabled = true;
    try {
      for (const [index, record] of batch.entries()) {
        locatorCompareStatus.textContent = `Comparaison ${index + 1}/${batch.length} : ${record.fileName} — chargement OCR local…`;
        try {
          const result = await WarResultsVisionEngine.compareTrophyLocators(record.file, (message) => {
            if (message.status) locatorCompareStatus.textContent = `Comparaison ${index + 1}/${batch.length} : ${record.fileName} — ${message.status}`;
          }, { marginPercent, verticalRecovery, edgeSafePadding, iconAware, fields: selectedTrophies });
          const sourceKey = record.fileKey || WarResultsLocatorComparisonStore.fileKey(record.file);
          const prior = locatorComparisonSummary.find((item) => item.sourceKey === sourceKey && Number(item.marginPercent ?? 18) === marginPercent && (item.variantId || "adaptive") === variantId);
          const fieldsByKey = new Map((prior?.fields || []).map((field) => [field.field, field]));
          for (const field of result.fields || []) fieldsByKey.set(field.field, { ...field, current: { ...field.current, preview: undefined }, adaptive: { ...field.adaptive, preview: undefined } });
          const summary = { file: record.fileName, sourceKey, marginPercent, variantId, variantLabel, metrics: result.metrics, fields: [...fieldsByKey.values()] };
          locatorComparisonSummary = WarResultsLocatorComparisonStore.mergeRecords(locatorComparisonSummary, [summary]);
          saveLocatorComparison();
          locatorComparisonResults.insertAdjacentHTML("beforeend", locatorComparisonHtml(record.fileName, { ...result, variantLabel }));
          locatorCompareStatus.textContent = `Comparaison ${index + 1}/${batch.length} terminée : ${record.fileName}, marge ${marginPercent} % (${result.metrics.totalMs} ms).`;
        } catch (error) {
          const message = errorMessage(error);
          const failed = { file: record.fileName, sourceKey: record.fileKey || WarResultsLocatorComparisonStore.fileKey(record.file), marginPercent, variantId, variantLabel, error: message };
          locatorComparisonSummary = WarResultsLocatorComparisonStore.mergeRecords(locatorComparisonSummary, [failed]);
          saveLocatorComparison();
          locatorComparisonResults.insertAdjacentHTML("beforeend", `<article class="locator-comparison-card is-error"><h3>${escapeHtml(record.fileName)} · ${escapeHtml(variantLabel)} · marge ${marginPercent} %</h3><p>Erreur du diagnostic : ${escapeHtml(message)}</p></article>`);
        }
        updateLocatorComparisonButtons();
      }
      locatorCompareStatus.textContent = `${batch.length} capture(s) traitée(s). Les propositions affichées sont expérimentales et n’ont modifié aucun champ du formulaire.`;
      updateLocatorComparisonButtons();
      updateDiagnostics();
    } finally {
      try { await WarResultsVisionEngine.release(); }
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

