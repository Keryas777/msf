(() => {
  "use strict";

  const API_URL = "https://msf-war-ocr.deliriousfan7.workers.dev/api/war/parse-gemini-draft";
  const ANALYSIS_API_URL = "https://msf-war-ocr.deliriousfan7.workers.dev/api/war/write-analyses";
  const PUBLICATION_API_URL = "https://msf-war-ocr.deliriousfan7.workers.dev/api/war/publish-report";
  const IDLE_RESULT = "En attente d’un envoi…";
  const SUBMIT_LABEL = "Lancer la session OCR";
  const QUEUE_DELAY_MIN_MS = 8000;
  const QUEUE_DELAY_MAX_MS = 10000;
  const ANALYSIS_QUEUE_DELAY_MS = 30000;
  const RETRY_DELAYS_MS = [10000, 30000];
  const GEMINI_RETRY_MARGIN_MS = 3000;
  const MAX_CAPTURES = 10;
  const DRAFT_VALIDATION = globalThis.MsfWarDraftValidation;
  const REPORT_CALCULATOR = globalThis.MsfWarReportCalculator;
  const REPORT_RANKER = globalThis.MsfWarReportRanker;
  const WAR_ANALYSIS = globalThis.MsfWarAnalysis;

  if (!DRAFT_VALIDATION || !REPORT_CALCULATOR || !REPORT_RANKER || !WAR_ANALYSIS) {
    throw new Error("Les modules locaux de validation, de calcul, de classement et d’analyse sont indisponibles.");
  }

  const {
    EDITABLE_FIELDS,
    buildValidatedDraft,
    classifyDraft,
    classifyRow,
    cloneJson,
    countModifiedFields,
    isRowModified,
    parseEditorRow
  } = DRAFT_VALIDATION;
  const { calculateReport } = REPORT_CALCULATOR;
  const { rankReport } = REPORT_RANKER;
  const { buildAnalysisPayload, mergeAnalyses } = WAR_ANALYSIS;

  const ALLIANCES = [
    { key: "zeus", label: "Zeus" },
    { key: "athena", label: "Athéna" },
    { key: "kronos", label: "Kronos" },
    { key: "dionysos", label: "Dionysos" },
    { key: "poseidon", label: "Poséidon" },
    { key: "hades", label: "Hadès" }
  ];

  const STATE_LABELS = {
    queued: "En attente",
    detecting: "Détection",
    ocr: "OCR en cours",
    waiting: "Attente",
    ready: "Brouillon prêt",
    reviewing: "Vérification en cours",
    correction: "À corriger",
    validated: "OCR validé",
    calculated: "Rapport calculé",
    ranked: "Rapport classé",
    writing: "Rédaction en cours",
    analyzed: "Analyses rédigées",
    publishing: "Publication…",
    published: "Publié",
    publish_error: "Erreur",
    revalidate: "À revalider",
    manual: "Alliance à confirmer",
    merged: "Fragment fusionné",
    failed: "OCR échoué",
    cancelled: "Interrompue"
  };

  const form = document.getElementById("warAdminForm");
  const dateInput = document.getElementById("warDate");
  const imageInput = document.getElementById("warImage");
  const fileMeta = document.getElementById("warFileMeta");
  const submitButton = document.getElementById("warSubmit");
  const cancelButton = document.getElementById("warCancel");
  const statusPanel = document.getElementById("warStatusPanel");
  const statusTitle = document.getElementById("warStatusTitle");
  const statusBadge = document.getElementById("warStatusBadge");
  const statusMessage = document.getElementById("warStatusMessage");
  const queueSummary = document.getElementById("warQueueSummary");
  const captureList = document.getElementById("warCaptureList");
  const reportProgress = document.getElementById("warReportProgress");
  const validatedCount = document.getElementById("warValidatedCount");
  const calculatedCount = document.getElementById("warCalculatedCount");
  const rankedCount = document.getElementById("warRankedCount");
  const analyzedCount = document.getElementById("warAnalyzedCount");
  const publishedCount = document.getElementById("warPublishedCount");
  const calculateReportsButton = document.getElementById("warCalculateReports");
  const rankReportsButton = document.getElementById("warRankReports");
  const writeAnalysesButton = document.getElementById("warWriteAnalyses");
  const publishReportsButton = document.getElementById("warPublishReports");
  const calculateHelp = document.getElementById("warCalculateHelp");
  const logPanel = document.getElementById("warLog");
  const result = document.getElementById("warResult");
  const sessionView = document.getElementById("warSessionView");
  const reviewView = document.getElementById("warReviewView");
  const reviewBackButton = document.getElementById("warReviewBack");
  const reviewBackBottomButton = document.getElementById("warReviewBackBottom");
  const reviewTitle = document.getElementById("warReviewTitle");
  const reviewState = document.getElementById("warReviewState");
  const reviewAlliance = document.getElementById("warReviewAlliance");
  const reviewDate = document.getElementById("warReviewDate");
  const reviewFile = document.getElementById("warReviewFile");
  const reviewTotal = document.getElementById("warReviewTotal");
  const countPlayers = document.getElementById("warCountPlayers");
  const countInactive = document.getElementById("warCountInactive");
  const countVacant = document.getElementById("warCountVacant");
  const countInvalid = document.getElementById("warCountInvalid");
  const reviewStructureError = document.getElementById("warReviewStructureError");
  const sourceTabs = document.getElementById("warSourceTabs");
  const sourceViewport = document.getElementById("warSourceViewport");
  const reviewImage = document.getElementById("warReviewImage");
  const reviewImageNotice = document.getElementById("warReviewImageNotice");
  const zoomOutButton = document.getElementById("warZoomOut");
  const zoomResetButton = document.getElementById("warZoomReset");
  const zoomInButton = document.getElementById("warZoomIn");
  const reviewListPanel = document.getElementById("warReviewListPanel");
  const playerList = document.getElementById("warPlayerList");
  const reviewUnlockButton = document.getElementById("warReviewUnlock");
  const validateDraftButton = document.getElementById("warValidateDraft");
  const validationHelp = document.getElementById("warValidationHelp");
  const editorPanel = document.getElementById("warEditorPanel");
  const editorBackButton = document.getElementById("warEditorBack");
  const editorForm = document.getElementById("warEditorForm");
  const editorContext = document.getElementById("warEditorContext");
  const editorStatus = document.getElementById("warEditorStatus");
  const editorMessages = document.getElementById("warEditorMessages");
  const editorSaveButton = document.getElementById("warEditorSave");
  const editorResetButton = document.getElementById("warEditorReset");
  const editorCancelButton = document.getElementById("warEditorCancel");
  const editorInputs = {
    name: document.getElementById("warEditName"),
    attack_points: document.getElementById("warEditAttackPoints"),
    attacks: document.getElementById("warEditAttacks"),
    damage: document.getElementById("warEditDamage"),
    defense_wins: document.getElementById("warEditDefenseWins"),
    defense_bonus: document.getElementById("warEditDefenseBonus")
  };
  const editorErrors = {
    name: document.getElementById("warEditErrorName"),
    attack_points: document.getElementById("warEditErrorAttackPoints"),
    attacks: document.getElementById("warEditErrorAttacks"),
    damage: document.getElementById("warEditErrorDamage"),
    defense_wins: document.getElementById("warEditErrorDefenseWins"),
    defense_bonus: document.getElementById("warEditErrorDefenseBonus")
  };
  const reportView = document.getElementById("warReportView");
  const reportBackButton = document.getElementById("warReportBack");
  const reportTitle = document.getElementById("warReportTitle");
  const reportStep = document.getElementById("warReportStep");
  const reportState = document.getElementById("warReportState");
  const reportOrder = document.getElementById("warReportOrder");
  const reportAlliance = document.getElementById("warReportAlliance");
  const reportDate = document.getElementById("warReportDate");
  const reportSource = document.getElementById("warReportSource");
  const reportTotalDamage = document.getElementById("warReportTotalDamage");
  const reportPlayerCount = document.getElementById("warReportPlayerCount");
  const reportAvgRef = document.getElementById("warReportAvgRef");
  const reportShareRef = document.getElementById("warReportShareRef");
  const reportMinAttacks = document.getElementById("warReportMinAttacks");
  const reportMinDeviations = document.getElementById("warReportMinDeviations");
  const reportPlayerList = document.getElementById("warReportPlayerList");
  const calculatedJson = document.getElementById("warCalculatedJson");

  const testConfig = window.__MSF_WAR_ADMIN_TEST_CONFIG__ || {};
  const session = {
    running: false,
    cancelled: false,
    warDate: "",
    captures: [],
    logs: [],
    abortController: null,
    cancelWait: null,
    activeCaptureId: "",
    editorRowIndex: null,
    editorBuffer: null,
    reviewReadOnly: false,
    reviewZoom: 2.5,
    reviewSourceIndex: 0,
    sessionScrollY: 0
  };
  let captureSequence = 0;

  class SessionCancelledError extends Error {
    constructor() {
      super("Session interrompue");
      this.name = "SessionCancelledError";
    }
  }

  function padDatePart(value) {
    return String(value).padStart(2, "0");
  }

  function getLocalDateValue() {
    const now = new Date();
    return [
      now.getFullYear(),
      padDatePart(now.getMonth() + 1),
      padDatePart(now.getDate())
    ].join("-");
  }

  function getTimeLabel() {
    const now = new Date();
    return [
      padDatePart(now.getHours()),
      padDatePart(now.getMinutes()),
      padDatePart(now.getSeconds())
    ].join(":");
  }

  function plural(value, singular, pluralValue) {
    return value === 1 ? singular : pluralValue;
  }

  function formatFileSize(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return "taille inconnue";
    if (bytes < 1024) return `${bytes} octet${bytes > 1 ? "s" : ""}`;

    const units = ["Ko", "Mo", "Go"];
    let size = bytes / 1024;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }

    return `${size.toLocaleString("fr-FR", {
      maximumFractionDigits: size >= 10 ? 1 : 2
    })} ${units[unitIndex]}`;
  }

  function formatSeconds(milliseconds) {
    const seconds = Math.ceil(milliseconds / 1000);
    return `${seconds} seconde${seconds > 1 ? "s" : ""}`;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[character]);
  }

  function normalizeAlliance(value) {
    const key = String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "")
      .replace(/[-_]/g, "");

    if (key === "zeus") return "zeus";
    if (key === "athena") return "athena";
    if (key === "kronos" || key === "cronos" || key === "chronos" || key === "lospkronos") return "kronos";
    if (key === "dionysos") return "dionysos";
    if (key === "poseidon") return "poseidon";
    if (key === "hades") return "hades";

    return "";
  }

  function getAllianceLabel(key) {
    return ALLIANCES.find((alliance) => alliance.key === key)?.label || key;
  }

  function getSelectedFiles() {
    return Array.from(imageInput.files || []);
  }

  function setStatus(state, title, badge, message) {
    statusPanel.dataset.state = state;
    statusTitle.textContent = title;
    statusBadge.textContent = badge;
    statusMessage.textContent = message;
  }

  function releaseCaptureUrls() {
    for (const capture of session.captures) {
      if (capture.previewUrl) URL.revokeObjectURL(capture.previewUrl);
    }
  }

  function getManualOptions() {
    return ALLIANCES.map((alliance) => (
      `<option value="${alliance.key}">${escapeHtml(alliance.label)}</option>`
    )).join("");
  }

  function getCaptureActionMarkup(capture) {
    if (!capture.editableDraft) return "";

    const disabled = session.running && !capture.editableDraft ? " disabled" : "";
    if (capture.rankedReport || capture.calculatedReport) {
      return [
        '<div class="warAdminCaptureActions">',
        `<button class="warAdminCaptureAction" type="button" data-action="open-report" data-capture-id="${capture.id}"${disabled}>Voir le rapport ${capture.finalReport ? "analysé" : (capture.rankedReport ? "classé" : "calculé")}</button>`,
        `<button class="warAdminCaptureAction warAdminCaptureActionSecondary" type="button" data-action="open-review" data-capture-id="${capture.id}" data-read-only="true"${disabled}>Voir l’OCR validé</button>`,
        `<button class="warAdminCaptureAction warAdminCaptureActionSecondary" type="button" data-action="modify-review" data-capture-id="${capture.id}"${disabled}>Modifier</button>`,
        "</div>"
      ].join("");
    }

    const actionLabels = {
      ready: "Vérifier",
      reviewing: "Continuer",
      correction: "Corriger",
      revalidate: "Continuer",
      validated: "Voir le brouillon validé"
    };
    const label = actionLabels[capture.state] || "Vérifier le brouillon";
    const readOnly = capture.state === "validated" ? "true" : "false";
    const buttons = [
      `<button class="warAdminCaptureAction" type="button" data-action="open-review" data-capture-id="${capture.id}" data-read-only="${readOnly}"${disabled}>${label}</button>`
    ];

    if (capture.state === "validated") {
      buttons.push(
        `<button class="warAdminCaptureAction warAdminCaptureActionSecondary" type="button" data-action="modify-review" data-capture-id="${capture.id}"${disabled}>Modifier</button>`
      );
    }

    return `<div class="warAdminCaptureActions">${buttons.join("")}</div>`;
  }

  function renderCaptureList() {
    if (session.captures.length === 0) {
      captureList.innerHTML = '<p class="warAdminEmpty">Aucune capture dans la file.</p>';
      return;
    }

    captureList.innerHTML = session.captures.map((capture, index) => {
      const sourceCount = Array.isArray(capture.sources) ? capture.sources.length : 0;
      const allianceLine = capture.alliance
        ? `<p class="warAdminCaptureAlliance">✓ ${escapeHtml(capture.allianceLabel)}${sourceCount > 1 ? ` · ${sourceCount} captures fusionnées` : ""}</p>`
        : "";
      const candidateLine = !capture.alliance && capture.candidateAlliance
        ? `<p class="warAdminCaptureDetail">Gemini propose ${escapeHtml(getAllianceLabel(capture.candidateAlliance))}.</p>`
        : "";
      const manualChoice = capture.needsManual
        ? [
            '<div class="warAdminManualChoice">',
            `<label for="warManualAlliance-${capture.id}">Alliance de cette capture</label>`,
            `<select id="warManualAlliance-${capture.id}" data-capture-id="${capture.id}">`,
            '<option value="">Choisir manuellement…</option>',
            getManualOptions(),
            "</select>",
            "</div>"
          ].join("")
        : "";
      const reviewActions = getCaptureActionMarkup(capture);

      return [
        `<article class="warAdminCaptureCard" data-state="${capture.state}">`,
        `<img class="warAdminCaptureThumb" src="${escapeHtml(capture.previewUrl)}" alt="Aperçu de la capture ${index + 1}" />`,
        '<div class="warAdminCaptureBody">',
        '<div class="warAdminCaptureTopline">',
        `<p class="warAdminCaptureName">${index + 1}. ${escapeHtml(capture.file.name || "Capture sans nom")}</p>`,
        `<span class="warAdminCaptureState">${escapeHtml(STATE_LABELS[capture.state] || capture.state)}</span>`,
        "</div>",
        allianceLine,
        candidateLine,
        `<p class="warAdminCaptureDetail">${escapeHtml(capture.detail)}</p>`,
        manualChoice,
        reviewActions,
        "</div>",
        "</article>"
      ].join("");
    }).join("");
  }

  function getAvailableCaptures() {
    return session.captures.filter((capture) => Boolean(capture.editableDraft));
  }

  function updateQueueSummary() {
    const total = session.captures.length;
    if (!total) {
      queueSummary.textContent = "0 capture";
      return;
    }

    const ready = session.captures.filter((capture) => capture.state === "ready").length;
    const reviewing = session.captures.filter((capture) => capture.state === "reviewing").length;
    const correction = session.captures.filter((capture) => (
      capture.state === "correction" || capture.state === "revalidate"
    )).length;
    const validated = session.captures.filter((capture) => (
      capture.state === "validated" || capture.state === "calculated" || capture.state === "ranked" ||
      capture.state === "writing" || capture.state === "analyzed" || capture.state === "publishing" ||
      capture.state === "published" || capture.state === "publish_error"
    )).length;
    const calculated = session.captures.filter((capture) => Boolean(capture.calculatedReport)).length;
    const ranked = session.captures.filter((capture) => capture.state === "ranked").length;
    const failed = session.captures.filter((capture) => capture.state === "failed").length;
    const manual = session.captures.filter((capture) => capture.needsManual).length;
    const merged = session.captures.filter((capture) => capture.state === "merged").length;
    const parts = [`Prêts ${ready}`, `En cours ${reviewing}`, `À corriger ${correction}`, `Validés ${validated}`];

    if (calculated) parts.push(`Calculés ${calculated}`);
    if (ranked) parts.push(`Classés ${ranked}`);
    const analyzed = session.captures.filter((capture) => Boolean(capture.finalReport)).length;
    if (analyzed) parts.push(`Analysés ${analyzed}`);
    if (merged) parts.push(`Fragments ${merged}`);
    if (manual) parts.push(`À confirmer ${manual}`);
    if (failed) parts.push(`Échecs ${failed}`);
    queueSummary.textContent = parts.join(" · ");
  }

  function isOcrValidatedCapture(capture) {
    if (!capture?.editableDraft || !capture.validatedDraft) return false;
    return validatedDraftMatches(capture, classifyDraft(capture.editableDraft));
  }

  function renderReportProgress() {
    const available = getAvailableCaptures();
    reportProgress.hidden = available.length === 0;
    if (available.length === 0) return;

    const validated = available.filter(isOcrValidatedCapture).length;
    const calculated = available.filter((capture) => isOcrValidatedCapture(capture) && Boolean(capture.calculatedReport)).length;
    const ranked = available.filter((capture) => isOcrValidatedCapture(capture) && Boolean(capture.rankedReport)).length;
    const analyzed = available.filter((capture) => isOcrValidatedCapture(capture) && Boolean(capture.finalReport)).length;
    const published = available.filter((capture) => capture.publication?.state === "published").length;
    const allValidated = validated === available.length;
    const allCalculated = calculated === available.length;
    const allRanked = ranked === available.length;
    const allAnalyzed = analyzed === available.length;

    validatedCount.textContent = String(validated);
    calculatedCount.textContent = String(calculated);
    rankedCount.textContent = String(ranked);
    analyzedCount.textContent = String(analyzed);
    publishedCount.textContent = String(published);
    calculateReportsButton.disabled = session.running || !allValidated || allCalculated;
    calculateReportsButton.textContent = allCalculated ? "Rapports calculés" : "Calculer les rapports";
    rankReportsButton.disabled = session.running || !allCalculated || allRanked;
    rankReportsButton.textContent = allRanked ? "Rapports classés" : "Classer les rapports";
    writeAnalysesButton.disabled = session.running || !allRanked || allAnalyzed;
    writeAnalysesButton.textContent = allAnalyzed ? "Analyses rédigées" : "Rédiger les analyses";
    publishReportsButton.disabled = session.running || !allAnalyzed || published === available.length;
    publishReportsButton.textContent = session.running && allAnalyzed
      ? "Publication…"
      : (published === available.length ? "Publié" : "Publier");

    if (published === available.length) {
      calculateHelp.textContent = `${published} ${plural(published, "rapport publié", "rapports publiés")} sur la branche GitHub de travail.`;
    } else if (allAnalyzed) {
      calculateHelp.textContent = `${analyzed} ${plural(analyzed, "rapport analysé", "rapports analysés")} prêt à publier · ${published} déjà ${plural(published, "publié", "publiés")}.`;
    } else if (allRanked) {
      calculateHelp.textContent = `${validated} ${plural(validated, "OCR validé", "OCR validés")} · ${calculated} ${plural(calculated, "rapport calculé", "rapports calculés")} · ${ranked} ${plural(ranked, "rapport classé", "rapports classés")} · rédaction prête.`;
    } else if (allCalculated) {
      calculateHelp.textContent = "Tous les rapports sont calculés. Le classement déterministe reste local et ne publie rien.";
    } else if (!allValidated) {
      const remaining = available.length - validated;
      calculateHelp.textContent = `${remaining} ${plural(remaining, "brouillon doit encore être validé", "brouillons doivent encore être validés")}.`;
    } else {
      calculateHelp.textContent = "Tous les brouillons OCR disponibles sont validés. Le calcul reste local et ne publie rien.";
    }
  }

  function getTechnicalPayload() {
    const available = getAvailableCaptures();
    return {
      war_date: session.warDate || dateInput.value || null,
      published: available.length > 0 && available.every((capture) => capture.publication?.state === "published"),
      publication: {
        performed: available.some((capture) => capture.publication?.state === "published"),
        state: session.running && available.some((capture) => capture.state === "publishing")
          ? "publishing"
          : (available.length > 0 && available.every((capture) => capture.publication?.state === "published") ? "published" : "pending")
      },
      drafts: available.map((capture) => ({
        capture: capture.index + 1,
        assignment_source: capture.assignmentSource,
        source_count: capture.sources?.length || 1,
        draft: capture.editableDraft
      })),
      reports: available.filter((capture) => Boolean(capture.calculatedReport)).map((capture) => ({
        capture: capture.index + 1,
        alliance: capture.alliance,
        report: capture.calculatedReport
      })),
      ranked_reports: available.filter((capture) => Boolean(capture.rankedReport)).map((capture) => ({
        capture: capture.index + 1,
        alliance: capture.alliance,
        report: capture.rankedReport
      })),
      final_reports: available.filter((capture) => Boolean(capture.finalReport)).map((capture) => ({
        capture: capture.index + 1,
        alliance: capture.alliance,
        report: capture.finalReport
      })),
      captures: session.captures.map((capture) => ({
        capture: capture.index + 1,
        file_name: capture.file.name || null,
        state_key: capture.state,
        state: STATE_LABELS[capture.state] || capture.state,
        attempts: capture.attempts,
        assigned_alliance: capture.alliance || null,
        assigned_alliance_label: capture.allianceLabel || null,
        assignment_source: capture.assignmentSource || null,
        merged_into: capture.mergedIntoId || null,
        sources: capture.sources?.map((source) => ({
          capture_id: source.id,
          file_name: source.fileName,
          ranks: source.players.map((player) => player.rank)
        })) || null,
        response_ocr: capture.response,
        ocr_draft: capture.ocrDraft,
        editable_draft: capture.editableDraft,
        validatedDraft: capture.validatedDraft,
        calculatedReport: capture.calculatedReport,
        rankedReport: capture.rankedReport,
        finalReport: capture.finalReport,
        publication: capture.publication,
        modification_count: capture.ocrDraft && capture.editableDraft
          ? countModifiedFields(capture.ocrDraft, capture.editableDraft)
          : 0
      }))
    };
  }

  function updateTechnicalJson() {
    if (!session.captures.length) {
      result.textContent = IDLE_RESULT;
      return;
    }
    result.textContent = JSON.stringify(getTechnicalPayload(), null, 2);
  }

  function renderSession() {
    renderCaptureList();
    updateQueueSummary();
    renderReportProgress();
    updateTechnicalJson();
  }

  function renderLog() {
    if (!session.logs.length) {
      logPanel.innerHTML = '<li class="warAdminEmpty">Aucune activité.</li>';
      return;
    }

    logPanel.innerHTML = session.logs.map((entry) => [
      '<li class="warAdminLogEntry">',
      `<time class="warAdminLogTime">${entry.time}</time>`,
      `<span>${escapeHtml(entry.message)}</span>`,
      "</li>"
    ].join("")).join("");
    logPanel.scrollTop = logPanel.scrollHeight;
  }

  function addLog(message, capture) {
    const prefix = capture ? `Capture ${capture.index + 1} — ` : "";
    session.logs.push({ time: getTimeLabel(), message: prefix + message });
    renderLog();
  }

  function setCaptureState(capture, state, detail) {
    capture.state = state;
    capture.detail = detail;
    renderSession();
  }

  function updateControls() {
    const selectedCount = getSelectedFiles().length;
    const canSubmit = Boolean(dateInput.value) && selectedCount >= 1 && selectedCount <= MAX_CAPTURES;

    form.setAttribute("aria-busy", String(session.running));
    dateInput.disabled = session.running;
    imageInput.disabled = session.running;
    submitButton.disabled = session.running || !canSubmit;
    cancelButton.disabled = !session.running;
    submitButton.textContent = session.running ? "Session en cours…" : SUBMIT_LABEL;
  }

  function resetCaptureDerivedState(capture) {
    capture.validatedDraft = null;
    capture.calculatedReport = null;
    capture.rankedReport = null;
    capture.finalReport = null;
    capture.publication = { state: "pending", path: null, commit_sha: null, error: null };
  }

  function resetCapturesForRun() {
    for (const capture of session.captures) {
      capture.state = "queued";
      capture.detail = "En attente dans la file locale.";
      capture.attempts = 0;
      capture.alliance = "";
      capture.allianceLabel = "";
      capture.assignmentSource = "";
      capture.candidateAlliance = "";
      capture.needsManual = false;
      capture.response = null;
      capture.draft = null;
      capture.fragmentDraft = null;
      capture.ocrDraft = null;
      capture.editableDraft = null;
      capture.sources = null;
      capture.mergedIntoId = "";
      resetCaptureDerivedState(capture);
      capture.reviewScrollY = 0;
      capture.reportScrollY = 0;
      capture.listScrollY = 0;
      capture.lastError = "";
    }
  }

  function handleImageChange() {
    if (session.running) return;

    releaseCaptureUrls();
    session.captures = [];
    session.logs = [];
    session.warDate = "";
    renderLog();

    const files = getSelectedFiles();

    if (files.length > MAX_CAPTURES) {
      imageInput.value = "";
      fileMeta.textContent = `Sélection refusée : ${files.length} captures. Le maximum est de ${MAX_CAPTURES}.`;
      setStatus("error", "Trop de captures", "Erreur", `Choisis entre 1 et ${MAX_CAPTURES} images.`);
      renderSession();
      updateControls();
      return;
    }

    if (!files.length) {
      fileMeta.textContent = "Aucune capture sélectionnée.";
      setStatus("idle", "En attente", "Attente", "Sélectionne les captures pour préparer la session.");
      renderSession();
      updateControls();
      return;
    }

    session.captures = files.map((file, index) => ({
      id: String(++captureSequence),
      index,
      file,
      previewUrl: URL.createObjectURL(file),
      state: "queued",
      detail: `${formatFileSize(file.size)} · En attente dans la file locale.`,
      attempts: 0,
      alliance: "",
      allianceLabel: "",
      assignmentSource: "",
      candidateAlliance: "",
      needsManual: false,
      response: null,
      draft: null,
      fragmentDraft: null,
      ocrDraft: null,
      editableDraft: null,
      sources: null,
      mergedIntoId: "",
      validatedDraft: null,
      calculatedReport: null,
      rankedReport: null,
      finalReport: null,
      publication: { state: "pending", path: null, commit_sha: null, error: null },
      reviewScrollY: 0,
      reportScrollY: 0,
      listScrollY: 0,
      lastError: ""
    }));

    const totalBytes = files.reduce((sum, file) => sum + (Number(file.size) || 0), 0);
    fileMeta.textContent = `${files.length} ${plural(files.length, "capture sélectionnée", "captures sélectionnées")} · ${formatFileSize(totalBytes)}`;
    for (const capture of session.captures) addLog("Capture reçue", capture);
    setStatus(
      "idle",
      `${files.length} ${plural(files.length, "capture prête", "captures prêtes")}`,
      "Prêt",
      "Vérifie la date, puis lance la file OCR. Les fragments d’une même alliance seront fusionnés par rang."
    );
    renderSession();
    updateControls();
  }

  function getErrorDetail(data) {
    if (!data || typeof data !== "object") return "";
    return data.error || data.message || data.parsed_json_error || "";
  }

  function getQueueDelayMs() {
    if (Number.isFinite(testConfig.queueDelayMs)) return Math.max(0, testConfig.queueDelayMs);
    return QUEUE_DELAY_MIN_MS + Math.floor(Math.random() * (QUEUE_DELAY_MAX_MS - QUEUE_DELAY_MIN_MS + 1));
  }

  function getRetryDelayMs(attempt) {
    if (Array.isArray(testConfig.retryDelaysMs)) {
      return Math.max(0, Number(testConfig.retryDelaysMs[attempt - 1]) || 0);
    }
    return RETRY_DELAYS_MS[attempt - 1];
  }

  function cancellableSleep(milliseconds) {
    if (session.cancelled) return Promise.reject(new SessionCancelledError());
    if (milliseconds <= 0) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        session.cancelWait = null;
        resolve();
      }, milliseconds);

      session.cancelWait = () => {
        clearTimeout(timer);
        session.cancelWait = null;
        reject(new SessionCancelledError());
      };
    });
  }

  async function waitWithCountdown(milliseconds, capture, messageBuilder) {
    let remaining = milliseconds;
    const configuredStep = Number(testConfig.countdownStepMs);
    const countdownStep = Number.isFinite(configuredStep) && configuredStep > 0 ? configuredStep : 1000;

    while (remaining > 0) {
      if (session.cancelled) throw new SessionCancelledError();
      const countdown = messageBuilder(remaining);

      if (!capture.needsManual && !capture.mergedIntoId && session.activeCaptureId !== capture.id) {
        capture.state = "waiting";
        capture.detail = countdown;
      }

      setStatus("waiting", "Temporisation", "Attente", countdown);
      renderSession();
      const step = Math.min(countdownStep, remaining);
      await cancellableSleep(step);
      remaining -= step;
    }
  }

  function buildDraftForAlliance(data, alliance, warDate) {
    const existingDraft = data && data.draft && typeof data.draft === "object" ? data.draft : {};
    const sourcePlayers = Array.isArray(existingDraft.players)
      ? existingDraft.players
      : (Array.isArray(data?.players) ? data.players : []);

    return {
      date: existingDraft.date || data?.war_date || warDate,
      alliance,
      captured_at: existingDraft.captured_at || new Date().toISOString(),
      source: existingDraft.source || data?.model || "",
      players: sourcePlayers.map((player, index) => ({
        rank: Number.isInteger(player?.rank)
          ? player.rank
          : (Number.isInteger(player?.row_index) ? player.row_index : index + 1),
        name: player?.name ?? "",
        attack_points: player?.attack_points ?? null,
        attacks: player?.attacks ?? null,
        damage: player?.damage ?? null,
        defense_wins: player?.defense_wins ?? null,
        defense_bonus: player?.defense_bonus ?? null
      }))
    };
  }

  function createMissingRow(rank) {
    return {
      rank,
      name: "",
      attack_points: null,
      attacks: null,
      damage: null,
      defense_wins: null,
      defense_bonus: null,
      _missing: true,
      _source_count: 0
    };
  }

  function comparableRow(row) {
    return [row.name, ...EDITABLE_FIELDS.filter((field) => field !== "name").map((field) => row[field])];
  }

  function rowsHaveSameValues(left, right) {
    return JSON.stringify(comparableRow(left)) === JSON.stringify(comparableRow(right));
  }

  function getModifiedRows(capture) {
    const modified = new Map();
    const originalByRank = new Map((capture.ocrDraft?.players || []).map((row) => [row.rank, row]));
    for (const row of capture.editableDraft?.players || []) {
      const original = originalByRank.get(row.rank);
      if (original && isRowModified(original, row)) modified.set(row.rank, cloneJson(row));
    }
    return modified;
  }

  function mergeAllianceFragments(alliance) {
    const group = session.captures
      .filter((capture) => capture.alliance === alliance && capture.fragmentDraft)
      .sort((left, right) => left.index - right.index);
    if (!group.length) return null;

    const primary = group[0];
    const modifiedRows = getModifiedRows(primary);
    const byRank = new Map();
    const sources = group.map((capture) => {
      const players = capture.fragmentDraft.players.filter((player) => (
        Number.isInteger(player.rank) && player.rank >= 1 && player.rank <= 24
      ));
      for (const player of players) {
        if (!byRank.has(player.rank)) byRank.set(player.rank, []);
        byRank.get(player.rank).push({ capture, player });
      }
      return {
        id: capture.id,
        index: capture.index,
        fileName: capture.file.name || `Capture ${capture.index + 1}`,
        previewUrl: capture.previewUrl,
        players: cloneJson(players)
      };
    });

    const mergedPlayers = [];
    let conflictCount = 0;
    let missingCount = 0;

    for (let rank = 1; rank <= 24; rank += 1) {
      const entries = byRank.get(rank) || [];
      if (!entries.length) {
        missingCount += 1;
        mergedPlayers.push(createMissingRow(rank));
        continue;
      }

      const merged = cloneJson(entries[0].player);
      merged.rank = rank;
      merged._source_count = entries.length;
      merged._source_capture_ids = entries.map((entry) => entry.capture.id);
      merged._conflict = entries.some((entry) => !rowsHaveSameValues(entries[0].player, entry.player));
      if (merged._conflict) conflictCount += 1;

      if (modifiedRows.has(rank)) {
        mergedPlayers.push(modifiedRows.get(rank));
      } else {
        mergedPlayers.push(merged);
      }
    }

    primary.sources = sources;
    primary.mergedIntoId = "";
    primary.ocrDraft = {
      date: primary.fragmentDraft.date,
      alliance,
      captured_at: primary.fragmentDraft.captured_at,
      source: primary.fragmentDraft.source,
      players: mergedPlayers
    };
    primary.editableDraft = cloneJson(primary.ocrDraft);
    primary.draft = primary.editableDraft;
    resetCaptureDerivedState(primary);

    const summary = classifyDraft(primary.editableDraft);
    primary.state = summary.canValidate ? "ready" : "correction";
    const details = [`${group.length} ${plural(group.length, "capture fusionnée", "captures fusionnées")}`];
    if (conflictCount) details.push(`${conflictCount} ${plural(conflictCount, "conflit", "conflits")}`);
    if (missingCount) details.push(`${missingCount} ${plural(missingCount, "rang absent", "rangs absents")}`);
    primary.detail = `${details.join(" · ")}. Brouillon conservé en mémoire.`;

    for (const capture of group.slice(1)) {
      capture.sources = null;
      capture.ocrDraft = null;
      capture.editableDraft = null;
      capture.draft = null;
      capture.mergedIntoId = primary.id;
      resetCaptureDerivedState(capture);
      capture.state = "merged";
      capture.detail = `Fragment fusionné dans ${primary.allianceLabel}, capture ${primary.index + 1}.`;
    }

    return primary;
  }

  function assignAlliance(capture, alliance, source) {
    capture.alliance = alliance;
    capture.allianceLabel = getAllianceLabel(alliance);
    capture.assignmentSource = source;
    capture.needsManual = false;
    capture.fragmentDraft = buildDraftForAlliance(capture.response, alliance, session.warDate);
    capture.mergedIntoId = "";
    const primary = mergeAllianceFragments(alliance);
    return primary || capture;
  }

  function requireManualAlliance(capture, candidateAlliance) {
    capture.candidateAlliance = candidateAlliance || "";
    capture.needsManual = true;
    capture.draft = null;
    capture.state = "manual";
    capture.detail = candidateAlliance
      ? `Alliance proposée : ${getAllianceLabel(candidateAlliance)}. Confirme le regroupement.`
      : "Gemini n’a pas identifié l’alliance avec suffisamment de certitude.";
  }

  function getActiveCapture() {
    return session.captures.find((capture) => capture.id === session.activeCaptureId) || null;
  }

  function getActionTarget(target) {
    let current = target;
    while (current && current !== document) {
      if (current.dataset && current.dataset.action) return current;
      current = current.parentElement;
    }
    return null;
  }

  function formatDamage(value) {
    return Number.isInteger(value) ? value.toLocaleString("fr-FR") : "—";
  }

  function validatedDraftMatches(capture, summary) {
    if (!capture.validatedDraft || !summary.canValidate) return false;
    try {
      return JSON.stringify(buildValidatedDraft(capture.editableDraft)) === JSON.stringify(capture.validatedDraft);
    } catch (_) {
      return false;
    }
  }

  function refreshCaptureValidationState(capture, opened) {
    if (!capture?.editableDraft) return null;
    const summary = classifyDraft(capture.editableDraft);

    if (validatedDraftMatches(capture, summary)) {
      if (capture.rankedReport) {
        capture.state = "ranked";
        capture.detail = "Rapport classé en mémoire. Publication non effectuée.";
      } else if (capture.calculatedReport) {
        capture.state = "calculated";
        capture.detail = "Rapport calculé en mémoire. Publication non effectuée.";
      } else {
        capture.state = "validated";
        capture.detail = "Brouillon OCR validé. Rapport non calculé.";
      }
      return summary;
    }

    capture.calculatedReport = null;
    capture.rankedReport = null;
    capture.finalReport = null;
    capture.publication = { state: "pending", path: null, commit_sha: null, error: null };

    if (capture.validatedDraft) {
      capture.state = "revalidate";
      capture.detail = "Le brouillon a été modifié depuis sa dernière validation.";
      return summary;
    }

    if (!summary.canValidate) {
      capture.state = "correction";
      capture.detail = summary.structureErrors.length
        ? summary.structureErrors.join(" ")
        : `${summary.counts.invalid} ${plural(summary.counts.invalid, "ligne reste", "lignes restent")} à corriger.`;
      return summary;
    }

    if (opened || capture.state !== "ready") {
      capture.state = "reviewing";
      capture.detail = "Vérification humaine en cours. Le brouillon peut être validé.";
    }
    return summary;
  }

  function getReviewStatusLabel(capture) {
    return STATE_LABELS[capture?.state] || "Brouillon";
  }

  function setReviewZoom(nextZoom) {
    session.reviewZoom = Math.min(2.5, Math.max(0.75, nextZoom));
    reviewImage.style.width = `${Math.round(session.reviewZoom * 100)}%`;
    zoomResetButton.textContent = `${Math.round(session.reviewZoom * 100)} %`;
  }

  function getReviewSources(capture) {
    if (Array.isArray(capture?.sources) && capture.sources.length) return capture.sources;
    if (!capture?.previewUrl) return [];
    return [{
      id: capture.id,
      index: capture.index,
      fileName: capture.file.name || `Capture ${capture.index + 1}`,
      previewUrl: capture.previewUrl,
      players: capture.fragmentDraft?.players || []
    }];
  }

  function renderSourceTabs(capture) {
    const sources = getReviewSources(capture);
    sourceTabs.hidden = sources.length <= 1;
    sourceTabs.innerHTML = sources.map((source, index) => (
      `<button type="button" data-action="select-source" data-source-index="${index}" aria-pressed="${index === session.reviewSourceIndex}">Capture ${index + 1}<span>${escapeHtml(source.fileName)}</span></button>`
    )).join("");
  }

  function renderReviewImage(capture) {
    const sources = getReviewSources(capture);
    if (session.reviewSourceIndex >= sources.length) session.reviewSourceIndex = 0;
    const source = sources[session.reviewSourceIndex];
    const hasImage = Boolean(source?.previewUrl);

    sourceViewport.hidden = !hasImage;
    reviewImageNotice.hidden = hasImage;
    reviewImage.hidden = !hasImage;
    renderSourceTabs(capture);

    if (hasImage) {
      reviewImage.src = source.previewUrl;
      reviewImage.alt = `Capture source ${session.reviewSourceIndex + 1} — ${capture.allianceLabel}`;
      reviewFile.textContent = source.fileName;
      setReviewZoom(session.reviewZoom);
    } else {
      reviewImage.removeAttribute("src");
      reviewFile.textContent = "Capture indisponible";
    }
  }

  function renderPlayerRows(capture, summary) {
    const originalPlayers = capture.ocrDraft?.players || [];
    const readOnlyAttribute = session.reviewReadOnly ? " disabled" : "";

    playerList.innerHTML = capture.editableDraft.players.map((player, index) => {
      const classification = summary.rows[index] || classifyRow(player);
      const modified = isRowModified(originalPlayers[index], player);
      let statusLabel = classification.type === "invalid"
        ? classification.label
        : (modified ? "Modifié" : classification.label);
      if (player._missing === true) statusLabel = "Rang absent";
      else if (player._conflict === true) statusLabel = "Conflit";
      else if (!modified && player._source_count > 1) statusLabel = `Confirmé ×${player._source_count}`;
      const name = player.name || (classification.type === "vacant" ? "Emplacement libre" : "Nom manquant");
      const warning = classification.warnings.length > 0;

      return [
        `<button class="warAdminPlayerRow" type="button" data-action="edit-row" data-row-index="${index}" data-classification="${classification.type}" data-modified="${modified}" data-warning="${warning}" data-conflict="${player._conflict === true}" data-confirmed="${player._source_count > 1 && !player._conflict}"${readOnlyAttribute}>`,
        `<span class="warAdminPlayerRank">${escapeHtml(player.rank)}</span>`,
        '<span class="warAdminPlayerMain">',
        `<span class="warAdminPlayerName">${escapeHtml(name)}</span>`,
        `<span class="warAdminPlayerDamage">Dégâts ${escapeHtml(formatDamage(player.damage))}${warning ? " · ⚠" : ""}</span>`,
        "</span>",
        `<span class="warAdminPlayerStatus">${escapeHtml(statusLabel)}</span>`,
        "</button>"
      ].join("");
    }).join("");
  }

  function renderReview() {
    const capture = getActiveCapture();
    if (!capture?.editableDraft) return;

    const summary = classifyDraft(capture.editableDraft);
    const realPlayers = summary.counts.active + summary.counts.inactive;
    const sources = getReviewSources(capture);

    reviewTitle.textContent = `${capture.allianceLabel} — contrôle OCR`;
    reviewState.textContent = getReviewStatusLabel(capture);
    reviewState.dataset.state = capture.state;
    reviewAlliance.textContent = capture.allianceLabel;
    reviewDate.textContent = capture.editableDraft.date || session.warDate || "—";
    reviewFile.textContent = sources.map((source) => source.fileName).join(" · ") || "Capture sans nom";
    reviewTotal.textContent = String(summary.counts.total);
    countPlayers.textContent = String(realPlayers);
    countInactive.textContent = String(summary.counts.inactive);
    countVacant.textContent = String(summary.counts.vacant);
    countInvalid.textContent = String(summary.counts.invalid);

    reviewStructureError.hidden = summary.structureErrors.length === 0;
    reviewStructureError.textContent = summary.structureErrors.join(" ");
    renderReviewImage(capture);
    renderPlayerRows(capture, summary);

    reviewUnlockButton.hidden = !session.reviewReadOnly;
    validateDraftButton.textContent = capture.state === "revalidate" ? "Revalider ce brouillon" : "Valider ce brouillon";

    if ((["validated", "calculated", "ranked", "analyzed"].includes(capture.state)) && session.reviewReadOnly) {
      validateDraftButton.disabled = true;
      validateDraftButton.textContent = "Brouillon OCR validé";
      validationHelp.textContent = capture.calculatedReport
        ? "Ce brouillon a produit le rapport calculé actuellement conservé en mémoire."
        : "Ce brouillon validé reste modifiable avant le calcul.";
    } else if (isOcrValidatedCapture(capture)) {
      validateDraftButton.disabled = true;
      validateDraftButton.textContent = "Brouillon OCR validé";
      validationHelp.textContent = "Modifie une ligne pour créer une nouvelle version à revalider.";
    } else if (!summary.canValidate) {
      validateDraftButton.disabled = true;
      validationHelp.textContent = summary.structureErrors.length
        ? summary.structureErrors.join(" ")
        : `${summary.counts.invalid} ${plural(summary.counts.invalid, "ligne invalide bloque", "lignes invalides bloquent")} la validation.`;
    } else {
      validateDraftButton.disabled = false;
      validationHelp.textContent = `${realPlayers} ${plural(realPlayers, "joueur sera conservé", "joueurs seront conservés")} ; ${summary.counts.vacant} ${plural(summary.counts.vacant, "place vacante sera exclue", "places vacantes seront exclues")}.`;
    }
  }

  function setEditorFieldValues(buffer) {
    for (const field of EDITABLE_FIELDS) editorInputs[field].value = buffer[field];
  }

  function getEditorResult() {
    const capture = getActiveCapture();
    const row = capture?.editableDraft?.players?.[session.editorRowIndex];
    if (!capture || !row || !session.editorBuffer) return null;
    return parseEditorRow(session.editorBuffer, row.rank);
  }

  function renderEditorValidation() {
    const parsed = getEditorResult();
    if (!parsed) return;

    for (const field of EDITABLE_FIELDS) {
      editorErrors[field].textContent = parsed.fieldErrors[field] || "";
      editorInputs[field].setAttribute("aria-invalid", String(Boolean(parsed.fieldErrors[field])));
    }

    editorStatus.textContent = parsed.classification.label;
    editorStatus.dataset.classification = parsed.classification.type;
    editorSaveButton.disabled = parsed.classification.type === "invalid";

    const messages = [
      ...parsed.classification.errors.map((message) => ({ kind: "error", message })),
      ...parsed.classification.warnings.map((message) => ({ kind: "warning", message }))
    ];
    editorMessages.innerHTML = messages.map((entry) => (
      `<p class="warAdminEditorMessage" data-kind="${entry.kind}">${escapeHtml(entry.message)}</p>`
    )).join("");
  }

  function openEditor(rowIndex) {
    const capture = getActiveCapture();
    const row = capture?.editableDraft?.players?.[rowIndex];
    if (!capture || !row || session.reviewReadOnly) return;

    const sources = getReviewSources(capture);
    const matchingSourceIndex = sources.findIndex((source) => source.players.some((player) => player.rank === row.rank));
    if (matchingSourceIndex >= 0) session.reviewSourceIndex = matchingSourceIndex;

    capture.listScrollY = Number(window.scrollY) || 0;
    session.editorRowIndex = rowIndex;
    session.editorBuffer = Object.fromEntries(EDITABLE_FIELDS.map((field) => [
      field,
      row[field] === null || row[field] === undefined ? "" : String(row[field])
    ]));
    editorContext.textContent = `Ligne ${row.rank} sur ${capture.editableDraft.players.length}`;
    reviewListPanel.hidden = true;
    editorPanel.hidden = false;
    setEditorFieldValues(session.editorBuffer);
    renderEditorValidation();
    renderReviewImage(capture);
  }

  function closeEditor() {
    const capture = getActiveCapture();
    const targetScroll = capture?.listScrollY || 0;
    session.editorRowIndex = null;
    session.editorBuffer = null;
    editorPanel.hidden = true;
    reviewListPanel.hidden = false;
    renderReview();
    if (typeof window.scrollTo === "function") window.scrollTo(0, targetScroll);
  }

  function updateSessionReviewStatus() {
    const available = getAvailableCaptures();
    const validated = available.filter(isOcrValidatedCapture).length;
    const calculated = available.filter((capture) => isOcrValidatedCapture(capture) && Boolean(capture.calculatedReport)).length;
    const ranked = available.filter((capture) => isOcrValidatedCapture(capture) && Boolean(capture.rankedReport)).length;
    const allValidated = available.length > 0 && validated === available.length;
    const allCalculated = available.length > 0 && calculated === available.length;
    const allRanked = available.length > 0 && ranked === available.length;

    if (allRanked && !session.running) {
      setStatus("success", "Rapports classés", "Pré-publication", `${ranked} ${plural(ranked, "rapport classé", "rapports classés")} · publication non effectuée.`);
    } else if (allCalculated && !session.running) {
      setStatus("success", "Rapports calculés", "Pré-publication", `${validated} ${plural(validated, "OCR validé", "OCR validés")} · ${calculated} ${plural(calculated, "rapport calculé", "rapports calculés")} · publication en attente.`);
    } else if (allValidated && !session.running) {
      setStatus("success", "Validation OCR terminée", "OCR validé", "Tous les brouillons OCR disponibles sont validés.");
    } else if (available.length > 0 && !session.running) {
      const correction = available.filter((capture) => capture.state === "correction" || capture.state === "revalidate").length;
      const reviewing = available.filter((capture) => capture.state === "reviewing").length;
      const ready = available.filter((capture) => capture.state === "ready").length;
      const parts = [];
      if (ready) parts.push(`${ready} ${plural(ready, "brouillon prêt", "brouillons prêts")}`);
      if (reviewing) parts.push(`${reviewing} en cours de vérification`);
      if (correction) parts.push(`${correction} à corriger ou revalider`);
      setStatus("warning", "Validation OCR en cours", "À vérifier", `${parts.join(" ; ")}. Aucune donnée GitHub modifiée.`);
    }
    renderSession();
  }

  function openReview(captureId, readOnly) {
    const capture = session.captures.find((item) => item.id === captureId);
    if (!capture?.editableDraft) return;

    session.sessionScrollY = Number(window.scrollY) || 0;
    session.activeCaptureId = capture.id;
    session.reviewReadOnly = Boolean(readOnly && ["validated", "calculated", "ranked", "analyzed"].includes(capture.state));
    session.reviewZoom = 2.5;
    session.reviewSourceIndex = 0;
    session.editorRowIndex = null;
    session.editorBuffer = null;
    refreshCaptureValidationState(capture, true);
    sessionView.hidden = true;
    reviewView.hidden = false;
    reportView.hidden = true;
    reviewListPanel.hidden = false;
    editorPanel.hidden = true;
    renderReview();
    renderSession();
    if (typeof window.scrollTo === "function") window.scrollTo(0, capture.reviewScrollY || 0);
  }

  function closeReview() {
    const capture = getActiveCapture();
    if (capture?.editableDraft) {
      capture.reviewScrollY = Number(window.scrollY) || 0;
      refreshCaptureValidationState(capture, true);
    }
    session.activeCaptureId = "";
    session.editorRowIndex = null;
    session.editorBuffer = null;
    reviewView.hidden = true;
    sessionView.hidden = false;
    updateSessionReviewStatus();
    if (typeof window.scrollTo === "function") window.scrollTo(0, session.sessionScrollY);
  }

  function formatCalculatedNumber(value, maximumFractionDigits = 0) {
    return Number.isFinite(value) ? value.toLocaleString("fr-FR", { maximumFractionDigits }) : "—";
  }

  function formatScore(value) {
    return Number.isFinite(value) ? value.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : "—";
  }

  function renderCalculatedPlayers(report) {
    reportPlayerList.innerHTML = report.report.players.map((player) => [
      '<details class="warAdminReportPlayer">',
      "<summary>",
      `<span class="warAdminPlayerRank">${escapeHtml(player.rank || player.original_rank)}</span>`,
      '<span class="warAdminPlayerMain">',
      `<span class="warAdminPlayerName">${escapeHtml(player.name)}</span>`,
      `<span class="warAdminPlayerDamage">Dégâts ${escapeHtml(formatCalculatedNumber(player.damage))} · Part ${escapeHtml(formatCalculatedNumber(player.damage_share_pct, 2))} %</span>`,
      "</span>",
      `<span class="warAdminReportPlayerScore">${escapeHtml(formatScore(player.score_total))} / 100</span>`,
      "</summary>",
      '<dl class="warAdminReportMetrics">',
      `<div><dt>Attaques</dt><dd>${escapeHtml(player.attacks)} · ${escapeHtml(player.successful_attacks)} réussies · ${escapeHtml(player.misses)} ratés</dd></div>`,
      `<div><dt>Dégâts / attaque</dt><dd>${escapeHtml(formatCalculatedNumber(player.avg_damage))}</dd></div>`,
      `<div><dt>Activité</dt><dd>${escapeHtml(formatScore(player.score_activity))} / 25</dd></div>`,
      `<div><dt>Efficacité</dt><dd>${escapeHtml(formatScore(player.score_efficiency))} / 25</dd></div>`,
      `<div><dt>Impact</dt><dd>${escapeHtml(formatScore(player.score_impact))} / 35</dd></div>`,
      `<div><dt>Défense</dt><dd>${escapeHtml(formatScore(player.score_defense))} / 15</dd></div>`,
      `<div><dt>Seuil attaques</dt><dd>${player.min_attacks_ok ? "Atteint" : "Non atteint"}</dd></div>`,
      `<div><dt>Seuil déviations</dt><dd>${player.min_deviations_ok ? "Atteint" : "Non atteint"}</dd></div>`,
      player.analysis ? `<div class="warAdminReportAnalysis"><dt>Analyse</dt><dd>${escapeHtml(player.analysis)}</dd></div>` : "",
      "</dl>",
      "</details>"
    ].join("")).join("");
  }

  function renderReport(capture) {
    const report = capture?.finalReport || capture?.rankedReport || capture?.calculatedReport;
    if (!report?.report) return;

    const summary = report.report.summary;
    const isAnalyzed = Boolean(capture.finalReport);
    const isRanked = Boolean(capture.rankedReport);
    reportTitle.textContent = `${capture.allianceLabel} — rapport ${isAnalyzed ? "analysé" : (isRanked ? "classé" : "calculé")}`;
    reportStep.textContent = isAnalyzed ? "Rédaction IA" : (isRanked ? "Classement local" : "Calcul local");
    reportState.dataset.state = isAnalyzed ? "analyzed" : (isRanked ? "ranked" : "calculated");
    reportState.textContent = isAnalyzed ? "Analyses rédigées" : (isRanked ? "Rapport classé" : "Rapport calculé");
    reportOrder.textContent = isRanked ? "Classement déterministe" : "Ordre OCR préservé";
    reportAlliance.textContent = capture.allianceLabel;
    reportDate.textContent = report.date || session.warDate || "—";
    reportSource.textContent = report.source || "—";
    reportTotalDamage.textContent = formatCalculatedNumber(summary.total_damage);
    reportPlayerCount.textContent = String(summary.player_count);
    reportAvgRef.textContent = formatCalculatedNumber(summary.avg_ref);
    reportShareRef.textContent = `${formatCalculatedNumber(summary.share_ref * 100, 2)} %`;
    reportMinAttacks.textContent = String(summary.minimum_attacks);
    reportMinDeviations.textContent = String(summary.minimum_deviations);
    renderCalculatedPlayers(report);
    calculatedJson.textContent = JSON.stringify(report, null, 2);
  }

  function openReport(captureId) {
    const capture = session.captures.find((item) => item.id === captureId);
    if ((!capture?.finalReport && !capture?.rankedReport && !capture?.calculatedReport) || session.running) return;
    session.sessionScrollY = Number(window.scrollY) || 0;
    session.activeCaptureId = capture.id;
    sessionView.hidden = true;
    reviewView.hidden = true;
    reportView.hidden = false;
    renderReport(capture);
    if (typeof window.scrollTo === "function") window.scrollTo(0, capture.reportScrollY || 0);
  }

  function closeReport() {
    const capture = getActiveCapture();
    if (capture) capture.reportScrollY = Number(window.scrollY) || 0;
    session.activeCaptureId = "";
    reportView.hidden = true;
    sessionView.hidden = false;
    updateSessionReviewStatus();
    if (typeof window.scrollTo === "function") window.scrollTo(0, session.sessionScrollY);
  }

  function handleCaptureListClick(event) {
    const actionTarget = getActionTarget(event.target);
    if (!actionTarget || actionTarget.disabled) return;
    if (actionTarget.dataset.action === "open-report") openReport(actionTarget.dataset.captureId);
    else if (actionTarget.dataset.action === "open-review") openReview(actionTarget.dataset.captureId, actionTarget.dataset.readOnly === "true");
    else if (actionTarget.dataset.action === "modify-review") openReview(actionTarget.dataset.captureId, false);
  }

  function handleSourceTabsClick(event) {
    const actionTarget = getActionTarget(event.target);
    if (!actionTarget || actionTarget.dataset.action !== "select-source") return;
    const index = Number(actionTarget.dataset.sourceIndex);
    if (!Number.isInteger(index)) return;
    session.reviewSourceIndex = index;
    const capture = getActiveCapture();
    if (capture) renderReviewImage(capture);
  }

  function handlePlayerListClick(event) {
    const actionTarget = getActionTarget(event.target);
    if (!actionTarget || actionTarget.dataset.action !== "edit-row") return;
    const rowIndex = Number(actionTarget.dataset.rowIndex);
    if (Number.isInteger(rowIndex)) openEditor(rowIndex);
  }

  function handleEditorInput(event) {
    const field = event.target?.name;
    if (!session.editorBuffer || !EDITABLE_FIELDS.includes(field)) return;
    session.editorBuffer[field] = event.target.value;
    renderEditorValidation();
  }

  function handleEditorSubmit(event) {
    event.preventDefault();
    const capture = getActiveCapture();
    const parsed = getEditorResult();
    if (!capture || !parsed || parsed.classification.type === "invalid") {
      renderEditorValidation();
      return;
    }

    const rowIndex = session.editorRowIndex;
    const previous = capture.editableDraft.players[rowIndex];
    capture.editableDraft.players[rowIndex] = cloneJson(parsed.row);
    capture.draft = capture.editableDraft;
    if (!isRowModified(previous, parsed.row)) {
      closeEditor();
      return;
    }

    refreshCaptureValidationState(capture, true);
    addLog(`Ligne ${parsed.row.rank} modifiée`, capture);
    closeEditor();
    updateSessionReviewStatus();
  }

  function handleEditorReset() {
    const capture = getActiveCapture();
    const rowIndex = session.editorRowIndex;
    const original = capture?.ocrDraft?.players?.[rowIndex];
    if (!capture || !original || !Number.isInteger(rowIndex)) return;
    capture.editableDraft.players[rowIndex] = cloneJson(original);
    capture.draft = capture.editableDraft;
    refreshCaptureValidationState(capture, true);
    addLog(`Ligne ${original.rank} restaurée aux valeurs OCR`, capture);
    closeEditor();
    updateSessionReviewStatus();
  }

  function handleValidateDraft() {
    const capture = getActiveCapture();
    if (!capture?.editableDraft || session.reviewReadOnly) return;
    const summary = classifyDraft(capture.editableDraft);
    if (!summary.canValidate) {
      refreshCaptureValidationState(capture, true);
      renderReview();
      return;
    }

    capture.validatedDraft = buildValidatedDraft(capture.editableDraft);
    capture.calculatedReport = null;
    capture.rankedReport = null;
    capture.finalReport = null;
    capture.publication = { state: "pending", path: null, commit_sha: null, error: null };
    capture.state = "validated";
    capture.detail = "Brouillon OCR validé. Rapport non calculé.";
    session.reviewReadOnly = true;
    addLog("Brouillon OCR validé — aucun calcul ni publication", capture);
    renderReview();
    updateSessionReviewStatus();
  }

  function handleCalculateReports() {
    if (session.running) return;
    const available = getAvailableCaptures();
    if (available.length === 0 || !available.every(isOcrValidatedCapture)) {
      renderSession();
      return;
    }

    const errors = [];
    for (const capture of available) {
      if (capture.calculatedReport) continue;
      try {
        capture.calculatedReport = calculateReport(capture.validatedDraft);
        capture.state = "calculated";
        capture.detail = "Rapport calculé en mémoire. Publication non effectuée.";
        addLog("Rapport calculé localement — publication non effectuée", capture);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erreur de calcul inconnue";
        errors.push(`${capture.allianceLabel} : ${message}`);
        addLog(`Calcul du rapport échoué : ${message}`, capture);
      }
    }

    if (errors.length > 0) {
      setStatus("error", "Calcul incomplet", "Erreur", `${errors.join(" ")} Aucun rapport n’a été publié.`);
      renderSession();
      return;
    }
    updateSessionReviewStatus();
  }

  function handleRankReports() {
    if (session.running) return;
    const available = getAvailableCaptures();
    if (available.length === 0 || !available.every((capture) => isOcrValidatedCapture(capture) && Boolean(capture.calculatedReport))) {
      renderSession();
      return;
    }

    const errors = [];
    for (const capture of available) {
      if (capture.rankedReport) continue;
      try {
        capture.rankedReport = rankReport(capture.calculatedReport);
        capture.finalReport = null;
        capture.publication = { state: "pending", path: null, commit_sha: null, error: null };
        capture.state = "ranked";
        capture.detail = "Rapport classé en mémoire. Publication non effectuée.";
        addLog("Rapport classé localement — publication non effectuée", capture);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erreur de classement inconnue";
        errors.push(`${capture.allianceLabel} : ${message}`);
        addLog(`Classement du rapport échoué : ${message}`, capture);
      }
    }
    if (errors.length > 0) setStatus("error", "Classement incomplet", "Erreur", errors.join(" "));
    renderSession();
  }

  async function requestAnalyses(capture, attempt) {
    capture.state = "writing";
    capture.detail = `Rédaction IA · tentative ${attempt}/3.`;
    addLog(`Rédaction des analyses — tentative ${attempt}/3`, capture);
    renderSession();

    const controller = new AbortController();
    session.abortController = controller;
    let response;
    try {
      response = await fetch(ANALYSIS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildAnalysisPayload(capture.rankedReport)),
        signal: controller.signal
      });
    } catch (error) {
      if (session.cancelled || error?.name === "AbortError") throw new SessionCancelledError();
      throw error;
    } finally {
      if (session.abortController === controller) session.abortController = null;
    }

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (_) {
      throw new Error(`Réponse IA illisible (HTTP ${response.status})`);
    }

    if (!response.ok) {
      const error = new Error(getErrorDetail(data) || `HTTP ${response.status}`);
      const retryAfterSeconds = Number(data?.retry_after_seconds);
      if (
        (data?.code === "GROQ_RATE_LIMIT" || data?.code === "GEMINI_RATE_LIMIT") &&
        Number.isFinite(retryAfterSeconds) &&
        retryAfterSeconds > 0
      ) {
        error.retryAfterMs = Math.ceil(retryAfterSeconds * 1000) + GEMINI_RETRY_MARGIN_MS;
      }
      throw error;
    }
    return data;
  }

  async function processAnalyses(capture) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await requestAnalyses(capture, attempt);
        capture.finalReport = mergeAnalyses(capture.rankedReport, response);
        capture.state = "analyzed";
        capture.detail = "Analyses validées et fusionnées en mémoire. Publication non effectuée.";
        addLog("Analyses validées et fusionnées — publication non effectuée", capture);
        renderSession();
        return true;
      } catch (error) {
        if (error instanceof SessionCancelledError || session.cancelled) throw error;
        const message = error instanceof Error ? error.message : "Erreur IA inconnue";
        addLog(`Tentative ${attempt}/3 échouée : ${message}`, capture);
        if (attempt === 3) {
          capture.state = "ranked";
          capture.detail = `Rédaction échouée après trois tentatives. ${message}`;
          return false;
        }
        const retryDelay = Number.isFinite(error?.retryAfterMs) ? Math.max(0, error.retryAfterMs) : getRetryDelayMs(attempt);
        addLog(`Attente ${formatSeconds(retryDelay)} avant la tentative ${attempt + 1}`, capture);
        await waitWithCountdown(retryDelay, capture, (remaining) => `Nouvelle tentative dans ${formatSeconds(remaining)}.`);
      }
    }
    return false;
  }

  async function handleWriteAnalyses() {
    if (session.running) return;
    const available = getAvailableCaptures();
    if (!available.length || !available.every((capture) => Boolean(capture.rankedReport))) return;
    const pending = available.filter((capture) => !capture.finalReport);
    if (!pending.length) {
      renderSession();
      return;
    }

    session.running = true;
    session.cancelled = false;
    setStatus("running", "Rédaction IA en cours", "Groq", "Traitement alliance par alliance.");
    updateControls();
    renderSession();

    try {
      for (let index = 0; index < pending.length; index += 1) {
        if (session.cancelled) throw new SessionCancelledError();
        const capture = pending[index];
        await processAnalyses(capture);
        if (index < pending.length - 1 && !session.cancelled) {
          const delay = ANALYSIS_QUEUE_DELAY_MS;
          addLog(`Temporisation ${formatSeconds(delay)} avant l’alliance suivante`, capture);
          await waitWithCountdown(delay, capture, (remaining) => `Alliance suivante dans ${formatSeconds(remaining)}.`);
        }
      }
      setStatus("success", "Analyses terminées", "Prêt", "Les rapports finaux restent uniquement en mémoire.");
    } catch (error) {
      if (error instanceof SessionCancelledError) {
        for (const capture of pending) {
          if (capture.state === "writing") {
            capture.state = "ranked";
            capture.detail = "Rédaction interrompue. Rapport classé conservé en mémoire.";
          }
        }
        setStatus("cancelled", "Rédaction interrompue", "Arrêtée", "Les analyses déjà terminées restent en mémoire.");
      } else {
        setStatus("error", "Erreur de rédaction", "Erreur", error instanceof Error ? error.message : "Erreur inconnue");
      }
    } finally {
      session.running = false;
      session.abortController = null;
      session.cancelWait = null;
      updateControls();
      renderSession();
    }
  }

  async function publishFinalReport(capture) {
    capture.state = "publishing";
    capture.detail = "Publication GitHub en cours sur la branche de travail.";
    capture.publication = { state: "publishing", path: null, commit_sha: null, error: null };
    addLog("Publication…", capture);
    renderSession();

    const controller = new AbortController();
    session.abortController = controller;
    try {
      const response = await fetch(PUBLICATION_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(capture.finalReport),
        signal: controller.signal
      });
      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (error) {
        throw new Error(`Réponse de publication illisible (HTTP ${response.status})`);
      }
      if (!response.ok || data?.published !== true) throw new Error(getErrorDetail(data) || `HTTP ${response.status}`);
      capture.publication = { state: "published", path: data.path || null, commit_sha: data.commit_sha || null, error: null };
      capture.state = "published";
      capture.detail = `Publié sur la branche de travail : ${data.path}.`;
      addLog(`Publié — ${data.path}`, capture);
      renderSession();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur de publication inconnue";
      capture.publication = { state: "error", path: null, commit_sha: null, error: message };
      capture.state = "publish_error";
      capture.detail = `Publication échouée. ${message}`;
      addLog(`Erreur de publication : ${message}`, capture);
      renderSession();
      return false;
    } finally {
      if (session.abortController === controller) session.abortController = null;
    }
  }

  async function handlePublishReports() {
    if (session.running) return;
    const available = getAvailableCaptures();
    if (!available.length || !available.every((capture) => Boolean(capture.finalReport))) {
      renderSession();
      return;
    }

    session.running = true;
    session.cancelled = false;
    setStatus("running", "Publication en cours", "Publication…", "Écriture GitHub strictement alliance par alliance.");
    updateControls();
    renderSession();
    let published = 0;
    let errors = 0;
    for (const capture of available) {
      if (capture.publication?.state === "published") {
        published += 1;
        continue;
      }
      const succeeded = await publishFinalReport(capture);
      if (succeeded) published += 1;
      else errors += 1;
    }
    session.running = false;
    session.cancelled = false;
    if (errors > 0) {
      setStatus("error", "Publication terminée avec erreur", "Erreur", `${published} ${plural(published, "rapport publié", "rapports publiés")} · ${errors} ${plural(errors, "échec conservé", "échecs conservés")}.`);
    } else {
      setStatus("success", "Publication terminée", "Publié", `${published} ${plural(published, "rapport publié", "rapports publiés")} sur la branche GitHub de travail.`);
    }
    updateControls();
    renderSession();
  }

  function handleReviewUnlock() {
    const capture = getActiveCapture();
    if (!capture?.validatedDraft) return;
    session.reviewReadOnly = false;
    renderReview();
  }

  function handleZoom(delta) {
    setReviewZoom(session.reviewZoom + delta);
  }

  function handleSuccessfulOcr(capture, data) {
    const detectedAlliance = data.detection_confident === false
      ? ""
      : normalizeAlliance(data.detected_alliance || data.detected_alliance_label || data.alliance);

    if (!detectedAlliance) {
      requireManualAlliance(capture, "");
      addLog("Alliance incertaine : choix manuel demandé uniquement pour cette capture", capture);
      renderSession();
      return;
    }

    const primary = assignAlliance(capture, detectedAlliance, "automatic");
    addLog(`Alliance détectée : ${capture.allianceLabel}`, capture);
    if (primary.id !== capture.id) {
      addLog(`Fragment fusionné avec la capture ${primary.index + 1}`, capture);
    } else {
      addLog("Brouillon fusionné créé — published = false", capture);
    }
    renderSession();
  }

  async function requestOcr(capture, attempt) {
    setCaptureState(capture, "detecting", `Détection de l’alliance · tentative ${attempt}/3.`);
    setStatus("running", "Détection en cours", "Détection", `Capture ${capture.index + 1}/${session.captures.length} · tentative ${attempt}/3.`);
    addLog(`Détection de l’alliance — tentative ${attempt}/3`, capture);
    await Promise.resolve();

    const formData = new FormData();
    formData.append("war_date", session.warDate);
    formData.append("image", capture.file, capture.file.name || `war-${capture.index + 1}.jpg`);

    setCaptureState(capture, "ocr", `Analyse Gemini · tentative ${attempt}/3.`);
    setStatus("running", "OCR en cours", "Gemini", `Capture ${capture.index + 1}/${session.captures.length} · tentative ${attempt}/3.`);
    addLog(`Envoi vers Gemini — tentative ${attempt}/3`, capture);

    const controller = new AbortController();
    session.abortController = controller;
    let response;
    try {
      response = await fetch(API_URL, { method: "POST", body: formData, signal: controller.signal });
    } catch (error) {
      if (session.cancelled || error?.name === "AbortError") throw new SessionCancelledError();
      throw error;
    } finally {
      if (session.abortController === controller) session.abortController = null;
    }

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (_) {
      data = { ok: false, published: false, http_status: response.status, raw_response: responseText || null };
      capture.response = data;
      renderSession();
      throw new Error(`Réponse Gemini illisible (HTTP ${response.status})`);
    }

    capture.response = data;
    renderSession();
    if (!response.ok) {
      const statusLabel = response.statusText ? `HTTP ${response.status} ${response.statusText}` : `HTTP ${response.status}`;
      const detail = getErrorDetail(data);
      throw new Error(detail ? `${statusLabel} — ${detail}` : statusLabel);
    }
    if (data && data.ok === false) throw new Error(getErrorDetail(data) || "Le Worker n’a pas pu terminer l’analyse Gemini.");
    if (!data || data.published !== false) throw new Error("Réponse brouillon invalide : published doit valoir false.");
    addLog("Réponse Gemini reçue", capture);
    return data;
  }

  async function processCapture(capture) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      capture.attempts = attempt;
      try {
        const data = await requestOcr(capture, attempt);
        handleSuccessfulOcr(capture, data);
        return true;
      } catch (error) {
        if (error instanceof SessionCancelledError || session.cancelled) throw error;
        capture.lastError = error instanceof Error ? error.message : "Erreur Gemini inconnue";
        addLog(`Tentative ${attempt}/3 échouée : ${capture.lastError}`, capture);
        if (attempt === 3) {
          setCaptureState(capture, "failed", `Trois tentatives échouées. ${capture.lastError}`);
          addLog("OCR échoué après trois tentatives ; poursuite automatique de la file", capture);
          return false;
        }
        const retryDelay = getRetryDelayMs(attempt);
        addLog(`Attente ${formatSeconds(retryDelay)} avant la tentative ${attempt + 1}`, capture);
        await waitWithCountdown(retryDelay, capture, (remaining) => `Nouvelle tentative dans ${formatSeconds(remaining)}.`);
      }
    }
    return false;
  }

  function updateFinalStatus() {
    const available = getAvailableCaptures();
    const ready = available.filter((capture) => capture.state === "ready").length;
    const validated = available.filter((capture) => capture.state === "validated").length;
    const failed = session.captures.filter((capture) => capture.state === "failed").length;
    const manual = session.captures.filter((capture) => capture.needsManual).length;

    if (available.length > 0 && validated === available.length) {
      setStatus("success", "Validation OCR terminée", "OCR validé", "Tous les brouillons OCR disponibles sont validés.");
      return;
    }

    if (manual || failed) {
      const details = [];
      if (manual) details.push(`${manual} ${plural(manual, "alliance reste", "alliances restent")} à confirmer`);
      if (failed) details.push(`${failed} ${plural(failed, "capture a échoué", "captures ont échoué")}`);
      setStatus("warning", "File OCR terminée", "À vérifier", `${ready} ${plural(ready, "brouillon prêt", "brouillons prêts")} à vérifier. ${details.join(" ; ")}. Aucune donnée GitHub modifiée.`);
      return;
    }

    const corrections = available.filter((capture) => capture.state === "correction").length;
    setStatus(
      "warning",
      "Session OCR terminée",
      "À vérifier",
      `${ready} ${plural(ready, "brouillon non publié est prêt", "brouillons non publiés sont prêts")} ; ${corrections} à compléter ou corriger. Aucune donnée GitHub modifiée.`
    );
  }

  function markSessionCancelled() {
    for (const capture of session.captures) {
      if (["queued", "detecting", "ocr", "waiting"].includes(capture.state)) {
        if (capture.editableDraft && capture.alliance) {
          capture.state = "ready";
          capture.detail = "Brouillon conservé après interruption de la session.";
        } else {
          capture.state = "cancelled";
          capture.detail = "Cette capture n’a pas été terminée.";
        }
      }
    }
    renderSession();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (session.running) return;
    const files = getSelectedFiles();
    const warDate = dateInput.value;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(warDate)) {
      setStatus("error", "Date manquante", "Erreur", "Choisis une date de guerre valide avant l’envoi.");
      updateControls();
      return;
    }
    if (files.length < 1 || files.length > MAX_CAPTURES) {
      setStatus("error", "Captures invalides", "Erreur", `Sélectionne entre 1 et ${MAX_CAPTURES} images.`);
      updateControls();
      return;
    }
    if (session.captures.length !== files.length) handleImageChange();

    resetCapturesForRun();
    session.logs = [];
    session.warDate = warDate;
    session.cancelled = false;
    session.running = true;
    renderLog();
    for (const capture of session.captures) addLog("Capture reçue", capture);
    addLog(`Session lancée pour la guerre du ${warDate}`);
    setStatus("running", "File OCR en cours", "OCR", "Préparation de la première capture.");
    renderSession();
    updateControls();

    try {
      for (let index = 0; index < session.captures.length; index += 1) {
        if (session.cancelled) throw new SessionCancelledError();
        const capture = session.captures[index];
        const succeeded = await processCapture(capture);
        const hasNext = index < session.captures.length - 1;

        if (succeeded && hasNext && !session.cancelled) {
          const queueDelay = getQueueDelayMs();
          addLog(`Attente ${formatSeconds(queueDelay)} avant la capture ${index + 2}`, capture);
          await waitWithCountdown(queueDelay, capture, (remaining) => `Capture suivante dans ${formatSeconds(remaining)}.`);
          if (!capture.needsManual && !capture.mergedIntoId && session.activeCaptureId !== capture.id) {
            const summary = capture.editableDraft ? classifyDraft(capture.editableDraft) : null;
            capture.state = summary?.canValidate ? "ready" : "correction";
            capture.detail = capture.editableDraft
              ? "Brouillon fusionné conservé en mémoire. File reprise."
              : capture.detail;
          }
          addLog("Temporisation terminée ; reprise de la file", capture);
          renderSession();
        }
      }
      addLog("File OCR terminée — aucun brouillon publié");
      updateFinalStatus();
    } catch (error) {
      if (error instanceof SessionCancelledError) {
        markSessionCancelled();
        setStatus("cancelled", "Session interrompue", "Arrêtée", "La file est arrêtée. Les brouillons déjà prêts restent disponibles en mémoire.");
      } else {
        const message = error instanceof Error ? error.message : "Erreur inattendue";
        addLog(`Erreur de session : ${message}`);
        setStatus("error", "Erreur de session", "Erreur", `${message}. Les brouillons déjà prêts restent disponibles en mémoire.`);
      }
    } finally {
      session.running = false;
      session.abortController = null;
      session.cancelWait = null;
      updateControls();
      renderSession();
    }
  }

  function handleCancel() {
    if (!session.running || session.cancelled) return;
    session.cancelled = true;
    addLog("Interruption demandée par l’utilisateur");
    setStatus("cancelled", "Interruption en cours", "Arrêt", "La requête ou la temporisation active est annulée.");
    if (session.abortController) session.abortController.abort();
    if (session.cancelWait) session.cancelWait();
  }

  function handleManualAlliance(event) {
    const target = event.target;
    const captureId = target && target.dataset ? target.dataset.captureId : "";
    const alliance = normalizeAlliance(target?.value);
    if (!captureId || !alliance) return;
    const capture = session.captures.find((item) => item.id === captureId);
    if (!capture || !capture.needsManual || !capture.response) return;

    const primary = assignAlliance(capture, alliance, "manual");
    addLog(`Alliance confirmée manuellement : ${capture.allianceLabel}`, capture);
    if (primary.id !== capture.id) addLog(`Fragment fusionné avec la capture ${primary.index + 1}`, capture);
    else addLog("Brouillon fusionné créé — published = false", capture);
    renderSession();
    if (!session.running) updateFinalStatus();
  }

  function handlePageHide() {
    session.cancelled = true;
    if (session.abortController) session.abortController.abort();
    if (session.cancelWait) session.cancelWait();
    releaseCaptureUrls();
  }

  dateInput.value = getLocalDateValue();
  sessionView.hidden = false;
  reviewView.hidden = true;
  reportView.hidden = true;
  setStatus("idle", "En attente", "Attente", "Sélectionne les captures pour préparer la session.");
  result.textContent = IDLE_RESULT;
  renderCaptureList();
  renderLog();
  updateQueueSummary();
  updateControls();

  dateInput.addEventListener("input", updateControls);
  imageInput.addEventListener("change", handleImageChange);
  form.addEventListener("submit", handleSubmit);
  cancelButton.addEventListener("click", handleCancel);
  captureList.addEventListener("change", handleManualAlliance);
  captureList.addEventListener("click", handleCaptureListClick);
  sourceTabs.addEventListener("click", handleSourceTabsClick);
  reviewBackButton.addEventListener("click", closeReview);
  reviewBackBottomButton.addEventListener("click", closeReview);
  calculateReportsButton.addEventListener("click", handleCalculateReports);
  rankReportsButton.addEventListener("click", handleRankReports);
  writeAnalysesButton.addEventListener("click", handleWriteAnalyses);
  publishReportsButton.addEventListener("click", handlePublishReports);
  playerList.addEventListener("click", handlePlayerListClick);
  reviewUnlockButton.addEventListener("click", handleReviewUnlock);
  validateDraftButton.addEventListener("click", handleValidateDraft);
  editorForm.addEventListener("input", handleEditorInput);
  editorForm.addEventListener("submit", handleEditorSubmit);
  editorBackButton.addEventListener("click", closeEditor);
  editorCancelButton.addEventListener("click", closeEditor);
  editorResetButton.addEventListener("click", handleEditorReset);
  zoomOutButton.addEventListener("click", () => handleZoom(-0.25));
  zoomResetButton.addEventListener("click", () => setReviewZoom(2.5));
  zoomInButton.addEventListener("click", () => handleZoom(0.25));
  reportBackButton.addEventListener("click", closeReport);
  window.addEventListener("pagehide", handlePageHide);

  if (testConfig.exposeState) {
    window.__MSF_WAR_ADMIN_TEST_API__ = {
      getSnapshot() {
        return JSON.parse(JSON.stringify(getTechnicalPayload()));
      },
      normalizeAlliance,
      openReview(captureId, readOnly) {
        openReview(captureId, readOnly);
      }
    };
  }
})();
