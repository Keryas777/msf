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
  const copyLocatorComparisonButton = $("#copyLocatorComparisonButton");
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
  let zoneDrag = null;

  restoreDrafts();
  restoreLocatorComparison();
  input.addEventListener("change", () => addFiles([...input.files || []]));
  analyzeButton.addEventListener("click", () => {
    status.textContent = "Démarrage de l’analyse des captures…";
    analyzePending().catch(showGlobalError);
  });
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
  }

  function cardHtml(r, index) {
    const stateText = { queued: "En attente", analyzing: "Analyse en cours", review: "À vérifier", validated: "Validée localement", error: "Erreur" }[r.state];
    const badgeClass = r.state === "validated" ? "is-ready" : r.state === "error" ? "is-error" : "";
    const dimensions = r.analysis?.metrics?.dimensions;
    const preview = r.url ? `<div class="zone-editor"><p class="muted">Zones détectées — touche une zone pour la sélectionner, déplace-la ou ajuste son coin. Les coordonnées restent celles de l’image originale.</p><div class="zone-source-wrap" style="aspect-ratio:${dimensions?.width || 16}/${dimensions?.height || 9}"><img class="result-preview" src="${r.url}" alt="Aperçu de ${escapeAttr(r.fileName)}" loading="lazy"><svg class="zone-overlay" data-zone-overlay data-id="${r.id}" viewBox="0 0 ${dimensions?.width || 1600} ${dimensions?.height || 900}" preserveAspectRatio="none">${Object.entries(r.analysis?.zones || {}).map(([key,z])=>`<g class="zone-mark ${r.selectedZone===key?"is-selected":""}" data-zone-key="${key}"><rect x="${z.rect.x}" y="${z.rect.y}" width="${z.rect.width}" height="${z.rect.height}"/><circle cx="${z.rect.x+z.rect.width}" cy="${z.rect.y+z.rect.height}" r="${Math.max(8,Math.min(z.rect.width,z.rect.height)*.08)}"/></g>`).join("")}</svg></div><label class="zone-picker">Champ à corriger<select data-zone-select="${r.id}">${FIELDS.map(k=>`<option value="${k}" ${r.selectedZone===(k)?"selected":""}>${LABELS[k]}</option>`).join("")}</select></label><button class="secondary-button" data-action="reread-zone" data-id="${r.id}">Relire la zone sélectionnée</button></div>` : `<p class="result-status">Image à sélectionner de nouveau pour afficher l’aperçu.</p>`;
    const fieldSections = `<section class="zone-fields-group"><h3>Alliance LoSP</h3><div class="zone-fields-grid">${fieldHtml(r, "localAlliance", "text", "Nom de l’alliance", "Nom affiché dans MSF")}${fieldHtml(r, "localScore", "numeric", "Score", "6 chiffres")}${fieldHtml(r, "localTrophies", "numeric", "Trophées", "4 chiffres")}</div></section><section class="zone-fields-group"><h3>Alliance adverse</h3><div class="zone-fields-grid">${fieldHtml(r, "opponentAlliance", "text", "Nom de l’alliance", "Nom original affiché dans MSF")}${fieldHtml(r, "opponentScore", "numeric", "Score", "6 chiffres")}${fieldHtml(r, "opponentTrophies", "numeric", "Trophées", "4 chiffres")}</div></section><section class="zone-fields-group"><h3>Résultat</h3><div class="zone-fields-grid">${fieldHtml(r, "result", "select", "Résultat", "")}</div></section>${fieldHtml(r, "warDate", "date", "Date réelle de la guerre", "Saisie manuelle obligatoire")}`;
    const diag = r.analysis ? `<details class="result-diagnostics"><summary>Mesures OCR de cette capture</summary><p>${escapeHtml(JSON.stringify(r.analysis.metrics, null, 2))}</p><pre>${escapeHtml(r.rawText)}</pre></details>` : "";
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
    const statusText = { conflict: "Lectures contradictoires — choisis ou corrige", uncertain: "À vérifier — confiance OCR insuffisante ou lecture ciblée", missing: "Valeur absente — saisie manuelle requise", corrected: "Corrigé manuellement", recognized: `Proposition OCR${meta.confidence != null ? ` · confiance ${Math.round(meta.confidence)} %` : ""}` }[state];
    let control = kind === "select" ? `<select data-field="${key}" data-id="${r.id}" aria-label="${label}"><option value="">À vérifier</option><option value="win" ${value === "win" ? "selected" : ""}>Victoire LoSP</option><option value="loss" ${value === "loss" ? "selected" : ""}>Défaite LoSP</option></select>` : `<input data-field="${key}" data-id="${r.id}" type="text" value="${escapeAttr(value)}" ${kind === "numeric" ? `inputmode="numeric" pattern="[0-9]*" maxlength="${key.includes("Score") ? 6 : 4}" autocomplete="off"` : `autocomplete="off" autocapitalize="off"`} aria-label="${label}">`;
    const alternatives = meta.alternatives?.length ? `<div class="field-proposals" aria-label="Propositions OCR">${[...new Set(meta.alternatives)].map((v) => `<button type="button" data-action="choose" data-id="${r.id}" data-field="${key}" data-value="${escapeAttr(v)}">Utiliser « ${escapeHtml(v)} »</button>`).join("")}</div>` : "";
    const rereadProposal = meta.ocrProposal ? `<div class="field-proposals"><small>Nouvelle lecture de la zone : ${escapeHtml(meta.ocrProposal)}${meta.ocrProposalConfidence != null ? ` (${Math.round(meta.ocrProposalConfidence)} %)` : ""}</small><button type="button" data-action="accept-reread" data-id="${r.id}" data-field="${key}">Utiliser cette proposition</button></div>` : "";
    const zone = r.analysis?.zones?.[key];
    const evidence = zone ? `<div class="zone-evidence"><div class="zone-crop-comparison"><figure><img src="${zone.sourcePreview || zone.preview}" alt="Découpe originale de ${label}" loading="lazy"><figcaption>Capture originale</figcaption></figure><figure><img src="${zone.preview}" alt="Traitement réellement lu pour ${label}" loading="lazy"><figcaption>Image utilisée par la lecture</figcaption></figure></div><small>Localisation : ${escapeHtml(zone.method)} · ${zone.geometryConfidence || "non évaluée"}<br>Lecture : ${escapeHtml(zone.ocrMethod || "lecture ciblée")} · ${zone.rect.width}×${zone.rect.height} px · disposition ${zone.layout}</small><details><summary>Agrandir les découpes</summary><div class="zone-crop-comparison"><img class="zone-crop-large" src="${zone.sourcePreview || zone.preview}" alt="Découpe originale agrandie ${label}" loading="lazy"><img class="zone-crop-large" src="${zone.preview}" alt="Traitement OCR agrandi ${label}" loading="lazy"></div></details><button type="button" data-action="select-zone" data-id="${r.id}" data-field="${key}">Sélectionner cette zone</button><button type="button" data-action="reread-field" data-id="${r.id}" data-field="${key}">Relancer l’OCR de ce champ</button></div>` : `<small class="zone-not-found">Zone indisponible — vérifie le cadrage avant toute saisie.</small>`;
    return `<div class="result-field is-${state}" data-field-wrap="${key}"><span>${label}</span>${control}<small class="field-state">${statusText}</small>${help ? `<small>${help}</small>` : ""}${alternatives}${rereadProposal}${evidence}</div>`;
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
    const marginPercent = [0, 18, 30].includes(Number(trophyMarginSelect?.value)) ? Number(trophyMarginSelect.value) : 18;
    const selection = trophyRecoverySelect?.value;
    const variantId = selection === "vertical-recovery-combined" ? "adaptive-vertical-recovery-combined" : selection === "vertical-recovery-icon-aware" ? "adaptive-vertical-recovery-icon-aware" : selection === "vertical-recovery-edge-safe" ? "adaptive-vertical-recovery-edge-safe" : selection === "vertical-recovery" ? "adaptive-vertical-recovery" : "adaptive";
    const variantLabel = variantId === "adaptive-vertical-recovery-combined" ? "Adaptatif + reprise + corrections combinées" : variantId === "adaptive-vertical-recovery-icon-aware" ? "Adaptatif + reprise + rejet d’icône" : variantId === "adaptive-vertical-recovery-edge-safe" ? "Adaptatif + reprise + marge bord" : variantId === "adaptive-vertical-recovery" ? "Adaptatif + reprise verticale" : "Adaptatif sans reprise";
    const verticalRecovery = variantId !== "adaptive";
    const edgeSafePadding = variantId === "adaptive-vertical-recovery-edge-safe" || variantId === "adaptive-vertical-recovery-combined";
    const iconAware = variantId === "adaptive-vertical-recovery-icon-aware" || variantId === "adaptive-vertical-recovery-combined";
    const batch = records.filter((record) => record.file && !locatorComparisonSummary.some((item) => item.fields?.length && item.sourceKey === (record.fileKey || WarResultsLocatorComparisonStore.fileKey(record.file)) && Number(item.marginPercent ?? 18) === marginPercent && (item.variantId || "adaptive") === variantId));
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
          }, { marginPercent, verticalRecovery, edgeSafePadding, iconAware });
          const summary = { file: record.fileName, sourceKey: record.fileKey || WarResultsLocatorComparisonStore.fileKey(record.file), marginPercent, variantId, variantLabel, metrics: result.metrics,
            fields: (result.fields || []).map(({ field, label, current, adaptive, rectDelta }) => ({ field, label, current: { ...current, preview: undefined }, adaptive: { ...adaptive, preview: undefined }, rectDelta })) };
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
      if (record.corrected.includes(field) || current.manuallyEdited) {
        record.fields[field] = { ...current, ocrProposal: proposal.value, ocrProposalConfidence: proposal.confidence, ocrProposalSource: proposal.source };
      } else if (current.alternatives?.length || (current.value && proposal.value && current.value !== proposal.value)) {
        record.fields[field] = { value: "", confidence: null, source: "whole-image-vs-manual-zone-disagreement", uncertain: true, alternatives: [...new Set([...(current.alternatives || []), ...(current.value ? [current.value] : []), ...(proposal.value ? [proposal.value] : [])])] };
        record.values[field] = "";
      } else {
        record.fields[field] = { value: proposal.value, confidence: proposal.confidence, source: proposal.source, uncertain: proposal.uncertain, alternatives: [] };
        record.values[field] = proposal.value;
        if (!proposal.value) record.warnings.push(`${field}_zone_read_empty`);
      }
      record.state = "review"; record.confirmed = false; record.analysis.metrics.lastFieldRead = { field, source: proposal.source, confidence: proposal.confidence, raw: proposal.raw || null, at: new Date().toISOString() };
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
    record.output = WarResultsVisionData.buildRecord(record.values, record.date, { fileName: record.fileName, methods: record.analysis?.metrics?.methods || [], manualCorrections: record.corrected });
    record.state = "validated"; saveDrafts(); render(); status.textContent = "Fiche validée sur cet appareil seulement. Aucune publication n’a eu lieu.";
  }

  function exportValidated() {
    const payload = { schemaVersion: "1.0.0", status: "validated-locally-not-published", records: records.filter(r => r.state === "validated").map(r => r.output) };
    if (!payload.records.length) return;
    download(payload, `msf-war-results-local-${new Date().toISOString().slice(0,10)}.json`);
  }
  function download(data, name) { const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function safeName(name) { return String(name || "capture").replace(/[^\p{L}\p{N}-]+/gu, "-").replace(/^-|-$/g, "").slice(0, 64) || "capture"; }
  function clearSession() { if (!confirm("Effacer les brouillons, les diagnostics A/B et les captures de cette session ?")) return; records.forEach(r => r.url && URL.revokeObjectURL(r.url)); records = []; locatorComparisonSummary = []; locatorComparisonResults.innerHTML = ""; sessionStorage.removeItem(KEY); sessionStorage.removeItem(LOCATOR_COMPARISON_KEY); status.textContent = "Session effacée."; updateLocatorComparisonButtons(); render(); }

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

