(() => {
  "use strict";
  const $ = (selector) => document.querySelector(selector);
  const input = $("#captureInput"), list = $("#captureResults"), analyzeButton = $("#analyzeButton");
  const status = $("#analysisStatus"), progress = $("#analysisProgress"), badge = $("#batchBadge");
  const KEY = "msf-war-results-vision-drafts-v1";
  const FIELDS = ["localAlliance", "opponentAlliance", "localScore", "opponentScore", "localTrophies", "opponentTrophies", "result"];
  const LABELS = { localAlliance: "Alliance LoSP", opponentAlliance: "Alliance adverse", localScore: "Score LoSP", opponentScore: "Score adverse", localTrophies: "Trophées LoSP", opponentTrophies: "Trophées adverses", result: "Résultat", warDate: "Date réelle de la guerre" };
  let records = [];
  let analyzing = false;
  let loadMs = null;
  let diagnostics = [];

  restoreDrafts();
  input.addEventListener("change", () => addFiles([...input.files || []]));
  analyzeButton.addEventListener("click", analyzePending);
  $("#clearButton").addEventListener("click", clearSession);
  $("#exportAllButton").addEventListener("click", exportValidated);
  list.addEventListener("input", onEdit);
  list.addEventListener("change", onEdit);
  list.addEventListener("click", onAction);
  render();

  function makeFieldState() { return Object.fromEntries(FIELDS.map((key) => [key, { value: "", uncertain: true, source: "not-read", confidence: null, alternatives: [] }])); }
  function addFiles(files) {
    const accepted = files.filter((file) => /^image\/(png|jpeg)$/.test(file.type));
    const ignored = files.length - accepted.length;
    for (const file of accepted) records.push({ id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`, file, fileName: file.name, url: URL.createObjectURL(file), state: "queued", values: Object.fromEntries(FIELDS.map((k) => [k, ""])), fields: makeFieldState(), date: "", corrected: [], confirmed: false, error: "", analysis: null, rawText: "", warnings: [] });
    input.value = "";
    if (!accepted.length && files.length) status.textContent = "Format ignoré. Sélectionne une image PNG ou JPEG.";
    else status.textContent = `${accepted.length} capture(s) ajoutée(s). Les fichiers restent dans le navigateur.${ignored ? ` ${ignored} format(s) ignoré(s).` : ""}`;
    render(); saveDrafts();
  }

  function render() {
    list.innerHTML = records.map((record, index) => cardHtml(record, index)).join("");
    analyzeButton.disabled = analyzing || !records.some((r) => ["queued", "error"].includes(r.state) && r.file);
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
    const fields = [
      fieldHtml(r, "localAlliance", "text", "Alliance LoSP", "Nom affiché dans MSF"),
      fieldHtml(r, "localScore", "numeric", "Score LoSP", "6 chiffres"),
      fieldHtml(r, "localTrophies", "numeric", "Trophées LoSP", "4 chiffres"),
      fieldHtml(r, "opponentAlliance", "text", "Alliance adverse", "Nom original affiché dans MSF"),
      fieldHtml(r, "opponentScore", "numeric", "Score adverse", "6 chiffres"),
      fieldHtml(r, "opponentTrophies", "numeric", "Trophées adverses", "4 chiffres"),
      fieldHtml(r, "result", "select", "Résultat", ""),
      `<label class="result-field" data-field-wrap="warDate"><span>Date réelle de la guerre *</span><input data-date="${r.id}" type="date" value="${escapeAttr(r.date)}" aria-label="Date réelle de la guerre"></label>`
    ].join("");
    const preview = r.url ? `<img class="result-preview" src="${r.url}" alt="Aperçu de ${escapeAttr(r.fileName)}" loading="lazy">` : `<p class="result-status">Image à sélectionner de nouveau pour afficher l’aperçu.</p>`;
    const diag = r.analysis ? `<details class="result-diagnostics"><summary>Mesures OCR de cette capture</summary><p>${escapeHtml(JSON.stringify(r.analysis.metrics, null, 2))}</p><pre>${escapeHtml(r.rawText)}</pre></details>` : "";
    return `<article class="capture-card result-card ${r.state === "error" ? "is-error" : ""}" data-id="${r.id}" id="result-${r.id}">
      <div class="result-card-top"><div><h2>Capture ${index + 1} · ${escapeHtml(r.fileName)}</h2><p class="capture-meta">État : <span class="status-chip ${badgeClass}">${stateText}</span></p></div><div class="result-card-actions"><button class="secondary-button" data-action="analyze-one" ${analyzing || !r.file ? "disabled" : ""}>Relancer l’analyse</button><button class="secondary-button" data-action="remove" ${r.state === "analyzing" ? "disabled" : ""}>Supprimer</button></div></div>
      ${preview}<p class="result-status" role="status">${escapeHtml(r.error || (r.state === "analyzing" ? "Traitement local en cours…" : r.state === "queued" ? "Prête pour l’analyse." : r.state === "validated" ? "Vérification manuelle confirmée. Fiche locale uniquement." : "Vérifie les propositions et les incertitudes avant de continuer."))}</p>
      <div class="result-fields">${fields}</div>
      <p class="result-status">Clé de rapprochement de l’adversaire : <strong class="match-key-value">${escapeHtml(WarResultsVisionData.toMatchKey(r.values.opponentAlliance) || "—")}</strong> (aucun rapprochement automatique)</p>
      ${diag}
      <label class="result-review"><input type="checkbox" data-confirm="${r.id}" ${r.confirmed ? "checked" : ""}> J’ai comparé les huit champs, y compris la date, à mes informations de guerre.</label>
      <div class="result-card-footer"><button class="primary-button" data-action="validate" ${r.state === "analyzing" ? "disabled" : ""}>Valider cette fiche localement</button><button class="secondary-button" data-action="export-one" ${r.state !== "validated" ? "disabled" : ""}>Télécharger cette fiche (.json)</button></div>
    </article>`;
  }

  function fieldHtml(r, key, kind, label, help) {
    const meta = r.fields[key] || {};
    const value = r.values[key] ?? "";
    const state = meta.alternatives?.length ? "conflict" : meta.uncertain && value ? "uncertain" : !value ? "missing" : r.corrected.includes(key) ? "corrected" : "recognized";
    const statusText = { conflict: "Lectures contradictoires — choisis ou corrige", uncertain: "À vérifier — confiance OCR insuffisante ou lecture ciblée", missing: "Valeur absente — saisie manuelle requise", corrected: "Corrigé manuellement", recognized: `Proposition OCR${meta.confidence != null ? ` · confiance ${Math.round(meta.confidence)} %` : ""}` }[state];
    let control = kind === "select" ? `<select data-field="${key}" data-id="${r.id}"><option value="">À vérifier</option><option value="win" ${value === "win" ? "selected" : ""}>Victoire LoSP</option><option value="loss" ${value === "loss" ? "selected" : ""}>Défaite LoSP</option></select>` : `<input data-field="${key}" data-id="${r.id}" type="text" value="${escapeAttr(value)}" ${kind === "numeric" ? `inputmode="numeric" pattern="[0-9]*" maxlength="${key.includes("Score") ? 6 : 4}" autocomplete="off"` : `autocomplete="off" autocapitalize="off"`} aria-label="${label}">`;
    const alternatives = meta.alternatives?.length ? `<div class="field-proposals" aria-label="Propositions OCR">${[...new Set(meta.alternatives)].map((v) => `<button type="button" data-action="choose" data-id="${r.id}" data-field="${key}" data-value="${escapeAttr(v)}">Utiliser « ${escapeHtml(v)} »</button>`).join("")}</div>` : "";
    return `<label class="result-field is-${state}" data-field-wrap="${key}"><span>${label}</span>${control}<small class="field-state">${statusText}</small>${help ? `<small>${help}</small>` : ""}${alternatives}</label>`;
  }

  function onEdit(event) {
    const el = event.target;
    const record = records.find((r) => r.id === el.dataset.id || r.id === el.dataset.date || r.id === el.dataset.confirm);
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
    saveDrafts();
  }

  async function analyzePending(oneId = null) {
    if (analyzing) return;
    const pending = records.filter((r) => r.file && ["queued", "error"].includes(r.state) && (!oneId || r.id === oneId));
    if (!pending.length) return;
    analyzing = true; progress.hidden = false; progress.value = 0; analyzeButton.disabled = true;
    diagnostics = [];
    try {
      let done = 0;
      for (const record of pending) {
        record.state = "analyzing"; record.error = ""; render();
        status.textContent = `Analyse ${done + 1}/${pending.length} : ${record.fileName}`;
        try {
          const before = performance.now();
          const result = await WarResultsVisionEngine.analyze(record.file, (message) => {
            if (message.status) status.textContent = `${record.fileName} — ${message.status}`;
            if (Number.isFinite(message.progress)) progress.value = Math.round((done + message.progress) / pending.length * 100);
          });
          record.fields = result.fields;
          record.values = Object.fromEntries(FIELDS.map((key) => [key, result.fields[key]?.value || ""]));
          record.corrected = [];
          record.confirmed = false;
          record.analysis = result;
          record.rawText = result.rawText;
          record.warnings = result.warnings;
          record.state = "review";
          record.error = "";
          diagnostics.push({ file: record.fileName, ...result.metrics, pageElapsedMs: Math.round(performance.now() - before) });
        } catch (error) {
          record.state = "error"; record.error = error.message || "Échec de cette capture.";
          diagnostics.push({ file: record.fileName, error: record.error });
        }
        done++; progress.value = Math.round(done / pending.length * 100); saveDrafts(); render();
      }
      status.textContent = "Analyse terminée. Vérifie et corrige chaque fiche avant validation locale.";
    } finally {
      try { await WarResultsVisionEngine.release(); } catch (_) {}
      analyzing = false; progress.hidden = true; render(); updateDiagnostics();
    }
  }

  function onAction(event) {
    const button = event.target.closest("button[data-action]"); if (!button) return;
    const record = records.find((r) => r.id === button.dataset.id); if (!record) return;
    const action = button.dataset.action;
    if (action === "remove") { if (record.url) URL.revokeObjectURL(record.url); records = records.filter((r) => r !== record); saveDrafts(); render(); return; }
    if (action === "analyze-one") { analyzePending(record.id); return; }
    if (action === "choose") {
      record.values[button.dataset.field] = button.dataset.value;
      record.fields[button.dataset.field] = { ...record.fields[button.dataset.field], value: button.dataset.value, alternatives: [], uncertain: true };
      if (!record.corrected.includes(button.dataset.field)) record.corrected.push(button.dataset.field);
      record.state = "review"; record.confirmed = false; saveDrafts(); render(); return;
    }
    if (action === "validate") { validateRecord(record); return; }
    if (action === "export-one") { download(record.output, `${safeName(record.fileName)}-war-result.json`); }
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
  function clearSession() { if (!confirm("Effacer les brouillons textuels locaux et les captures de cette session ?")) return; records.forEach(r => r.url && URL.revokeObjectURL(r.url)); records = []; sessionStorage.removeItem(KEY); status.textContent = "Session effacée."; render(); }

  function saveDrafts() {
    try { sessionStorage.setItem(KEY, JSON.stringify(records.map(r => ({ fileName: r.fileName, state: r.state, output: r.output || null, values: r.values, fields: r.fields, date: r.date, corrected: r.corrected, confirmed: false, analysis: r.analysis ? { metrics: r.analysis.metrics, warnings: r.analysis.warnings } : null, rawText: r.rawText, warnings: r.warnings })))); }
    catch (_) { status.textContent = "Espace de brouillon temporaire saturé; les données restent dans cette page. N’efface pas la page avant export local."; }
  }
  function restoreDrafts() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY) || "[]");
      for (const s of saved) records.push({ ...s, id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`, file: null, url: "", state: s.state === "analyzing" ? "review" : s.state, confirmed: false, error: "" });
      if (saved.length) status.textContent = "Brouillons textuels restaurés; aucune image n’a été stockée. Réimporte l’image pour afficher l’aperçu ou relancer l’OCR.";
    } catch (_) { sessionStorage.removeItem(KEY); }
  }
  function updateDiagnostics() {
    const ms = diagnostics.flatMap(d => d.calls || []).map(c => c.ms);
    $("#diagnosticText").textContent = diagnostics.length ? `${diagnostics.length} capture(s) mesurée(s). Temps OCR par appel : ${ms.length ? `${Math.min(...ms)}–${Math.max(...ms)} ms` : "aucun"}. Ces valeurs proviennent de ce navigateur et de cet appareil; elles ne prouvent pas les performances iOS/Android.` : "Aucune analyse exécutée.";
    $("#diagnosticLog").textContent = diagnostics.length ? JSON.stringify(diagnostics, null, 2) : "";
  }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function escapeAttr(value) { return escapeHtml(value); }
})();
