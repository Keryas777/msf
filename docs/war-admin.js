(() => {
  "use strict";

  const API_URL = "https://msf-war-ocr.deliriousfan7.workers.dev/api/war/parse-gemini-draft";
  const IDLE_RESULT = "En attente d’un envoi…";
  const SUBMIT_LABEL = "Lancer la session OCR";
  const QUEUE_DELAY_MIN_MS = 8000;
  const QUEUE_DELAY_MAX_MS = 10000;
  const RETRY_DELAYS_MS = [10000, 30000];
  const MAX_CAPTURES = 6;

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
    manual: "Alliance à confirmer",
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
  const logPanel = document.getElementById("warLog");
  const result = document.getElementById("warResult");

  const testConfig = window.__MSF_WAR_ADMIN_TEST_CONFIG__ || {};
  const session = {
    running: false,
    cancelled: false,
    warDate: "",
    captures: [],
    logs: [],
    abortController: null,
    cancelWait: null
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

  function getAssignedCapture(allianceKey, excludedId) {
    return session.captures.find((capture) => (
      capture.id !== excludedId && capture.alliance === allianceKey
    ));
  }

  function getManualOptions(capture) {
    return ALLIANCES.map((alliance) => {
      const used = Boolean(getAssignedCapture(alliance.key, capture.id));
      return `<option value="${alliance.key}"${used ? " disabled" : ""}>${escapeHtml(alliance.label)}${used ? " — déjà attribuée" : ""}</option>`;
    }).join("");
  }

  function renderCaptureList() {
    if (session.captures.length === 0) {
      captureList.innerHTML = '<p class="warAdminEmpty">Aucune capture dans la file.</p>';
      return;
    }

    captureList.innerHTML = session.captures.map((capture, index) => {
      const allianceLine = capture.alliance
        ? `<p class="warAdminCaptureAlliance">✓ ${escapeHtml(capture.allianceLabel)}</p>`
        : "";
      const candidateLine = !capture.alliance && capture.candidateAlliance
        ? `<p class="warAdminCaptureDetail">Gemini propose ${escapeHtml(getAllianceLabel(capture.candidateAlliance))}, déjà attribuée.</p>`
        : "";
      const manualChoice = capture.needsManual
        ? [
            '<div class="warAdminManualChoice">',
            `<label for="warManualAlliance-${capture.id}">Alliance de cette capture</label>`,
            `<select id="warManualAlliance-${capture.id}" data-capture-id="${capture.id}">`,
            '<option value="">Choisir manuellement…</option>',
            getManualOptions(capture),
            "</select>",
            "</div>"
          ].join("")
        : "";

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
        "</div>",
        "</article>"
      ].join("");
    }).join("");
  }

  function updateQueueSummary() {
    const total = session.captures.length;
    if (!total) {
      queueSummary.textContent = "0 capture";
      return;
    }

    const ready = session.captures.filter((capture) => capture.state === "ready").length;
    const failed = session.captures.filter((capture) => capture.state === "failed").length;
    const manual = session.captures.filter((capture) => capture.needsManual).length;
    const parts = [
      `${total} ${plural(total, "capture", "captures")}`,
      `${ready} ${plural(ready, "brouillon", "brouillons")}`
    ];

    if (manual) parts.push(`${manual} à confirmer`);
    if (failed) parts.push(`${failed} ${plural(failed, "échec", "échecs")}`);
    queueSummary.textContent = parts.join(" · ");
  }

  function getTechnicalPayload() {
    return {
      war_date: session.warDate || dateInput.value || null,
      published: false,
      drafts: session.captures
        .filter((capture) => Boolean(capture.draft))
        .map((capture) => ({
          capture: capture.index + 1,
          assignment_source: capture.assignmentSource,
          draft: capture.draft
        })),
      captures: session.captures.map((capture) => ({
        capture: capture.index + 1,
        file_name: capture.file.name || null,
        state: STATE_LABELS[capture.state] || capture.state,
        attempts: capture.attempts,
        assigned_alliance: capture.alliance || null,
        assigned_alliance_label: capture.allianceLabel || null,
        assignment_source: capture.assignmentSource || null,
        response: capture.response,
        draft: capture.draft
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
      lastError: ""
    }));

    const totalBytes = files.reduce((sum, file) => sum + (Number(file.size) || 0), 0);
    fileMeta.textContent = `${files.length} ${plural(files.length, "capture sélectionnée", "captures sélectionnées")} · ${formatFileSize(totalBytes)}`;
    for (const capture of session.captures) addLog("Capture reçue", capture);
    setStatus(
      "idle",
      `${files.length} ${plural(files.length, "capture prête", "captures prêtes")}`,
      "Prêt",
      "Vérifie la date, puis lance la file OCR. Les alliances seront détectées automatiquement."
    );
    renderSession();
    updateControls();
  }

  function getErrorDetail(data) {
    if (!data || typeof data !== "object") return "";
    return data.error || data.message || data.parsed_json_error || "";
  }

  function getQueueDelayMs() {
    if (Number.isFinite(testConfig.queueDelayMs)) {
      return Math.max(0, testConfig.queueDelayMs);
    }
    return QUEUE_DELAY_MIN_MS + Math.floor(
      Math.random() * (QUEUE_DELAY_MAX_MS - QUEUE_DELAY_MIN_MS + 1)
    );
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
    const countdownStep = Number.isFinite(configuredStep) && configuredStep > 0
      ? configuredStep
      : 1000;

    while (remaining > 0) {
      if (session.cancelled) throw new SessionCancelledError();

      const countdown = messageBuilder(remaining);
      if (!capture.needsManual) {
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
    const existingDraft = data && data.draft && typeof data.draft === "object"
      ? data.draft
      : {};
    const sourcePlayers = Array.isArray(existingDraft.players)
      ? existingDraft.players
      : (Array.isArray(data?.players) ? data.players : []);

    return {
      date: existingDraft.date || data?.war_date || warDate,
      alliance,
      captured_at: existingDraft.captured_at || new Date().toISOString(),
      source: existingDraft.source || data?.model || "",
      players: sourcePlayers.map((player, index) => ({
        rank: index + 1,
        name: player?.name ?? "",
        attack_points: player?.attack_points ?? null,
        attacks: player?.attacks ?? null,
        damage: player?.damage ?? null,
        defense_wins: player?.defense_wins ?? null,
        defense_bonus: player?.defense_bonus ?? null
      }))
    };
  }

  function assignAlliance(capture, alliance, source) {
    capture.alliance = alliance;
    capture.allianceLabel = getAllianceLabel(alliance);
    capture.assignmentSource = source;
    capture.needsManual = false;
    capture.draft = buildDraftForAlliance(capture.response, alliance, session.warDate);
    capture.state = "ready";
    capture.detail = source === "automatic"
      ? "Alliance détectée automatiquement. Brouillon conservé en mémoire."
      : "Alliance confirmée manuellement. Brouillon conservé en mémoire.";
  }

  function requireManualAlliance(capture, candidateAlliance) {
    capture.candidateAlliance = candidateAlliance || "";
    capture.needsManual = true;
    capture.draft = null;
    capture.state = "manual";
    capture.detail = candidateAlliance
      ? "Cette alliance est déjà attribuée à une autre capture."
      : "Gemini n’a pas identifié l’alliance avec suffisamment de certitude.";
  }

  function handleSuccessfulOcr(capture, data) {
    const detectedAlliance = data.detection_confident === false
      ? ""
      : normalizeAlliance(
          data.detected_alliance || data.detected_alliance_label || data.alliance
        );

    if (!detectedAlliance) {
      requireManualAlliance(capture, "");
      addLog("Alliance incertaine : choix manuel demandé uniquement pour cette capture", capture);
      renderSession();
      return;
    }

    const duplicate = getAssignedCapture(detectedAlliance, capture.id);
    if (duplicate) {
      requireManualAlliance(capture, detectedAlliance);
      addLog(`Doublon refusé : ${getAllianceLabel(detectedAlliance)} est déjà attribuée à la capture ${duplicate.index + 1}`, capture);
      renderSession();
      return;
    }

    assignAlliance(capture, detectedAlliance, "automatic");
    addLog(`Alliance détectée : ${capture.allianceLabel}`, capture);
    addLog("Brouillon créé — published = false", capture);
    renderSession();
  }

  async function requestOcr(capture, attempt) {
    setCaptureState(capture, "detecting", `Détection de l’alliance · tentative ${attempt}/3.`);
    setStatus(
      "running",
      "Détection en cours",
      "Détection",
      `Capture ${capture.index + 1}/${session.captures.length} · tentative ${attempt}/3.`
    );
    addLog(`Détection de l’alliance — tentative ${attempt}/3`, capture);
    await Promise.resolve();

    const formData = new FormData();
    formData.append("war_date", session.warDate);
    formData.append("image", capture.file, capture.file.name || `war-${capture.index + 1}.jpg`);

    setCaptureState(capture, "ocr", `Analyse Gemini · tentative ${attempt}/3.`);
    setStatus(
      "running",
      "OCR en cours",
      "Gemini",
      `Capture ${capture.index + 1}/${session.captures.length} · tentative ${attempt}/3.`
    );
    addLog(`Envoi vers Gemini — tentative ${attempt}/3`, capture);

    const controller = new AbortController();
    session.abortController = controller;
    let response;

    try {
      response = await fetch(API_URL, {
        method: "POST",
        body: formData,
        signal: controller.signal
      });
    } catch (error) {
      if (session.cancelled || error?.name === "AbortError") {
        throw new SessionCancelledError();
      }
      throw error;
    } finally {
      if (session.abortController === controller) session.abortController = null;
    }

    const responseText = await response.text();
    let data;

    try {
      data = JSON.parse(responseText);
    } catch (_) {
      data = {
        ok: false,
        published: false,
        http_status: response.status,
        raw_response: responseText || null
      };
      capture.response = data;
      renderSession();
      throw new Error(`Réponse Gemini illisible (HTTP ${response.status})`);
    }

    capture.response = data;
    renderSession();

    if (!response.ok) {
      const statusLabel = response.statusText
        ? `HTTP ${response.status} ${response.statusText}`
        : `HTTP ${response.status}`;
      const detail = getErrorDetail(data);
      throw new Error(detail ? `${statusLabel} — ${detail}` : statusLabel);
    }

    if (data && data.ok === false) {
      throw new Error(getErrorDetail(data) || "Le Worker n’a pas pu terminer l’analyse Gemini.");
    }

    if (!data || data.published !== false) {
      throw new Error("Réponse brouillon invalide : published doit valoir false.");
    }

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
        await waitWithCountdown(
          retryDelay,
          capture,
          (remaining) => `Nouvelle tentative dans ${formatSeconds(remaining)}.`
        );
      }
    }

    return false;
  }

  function updateFinalStatus() {
    const ready = session.captures.filter((capture) => capture.state === "ready").length;
    const failed = session.captures.filter((capture) => capture.state === "failed").length;
    const manual = session.captures.filter((capture) => capture.needsManual).length;

    if (manual || failed) {
      const details = [];
      if (manual) details.push(`${manual} ${plural(manual, "alliance reste", "alliances restent")} à confirmer`);
      if (failed) details.push(`${failed} ${plural(failed, "capture a échoué", "captures ont échoué")}`);
      setStatus(
        "warning",
        "File OCR terminée",
        "À vérifier",
        `${ready} ${plural(ready, "brouillon prêt", "brouillons prêts")}. ${details.join(" ; ")}. Aucune donnée GitHub modifiée.`
      );
      return;
    }

    setStatus(
      "success",
      "Session OCR terminée",
      "Brouillons",
      `${ready} ${plural(ready, "brouillon non publié", "brouillons non publiés")} conservé${ready > 1 ? "s" : ""} en mémoire. Aucune donnée GitHub modifiée.`
    );
  }

  function markSessionCancelled() {
    for (const capture of session.captures) {
      if (["queued", "detecting", "ocr", "waiting"].includes(capture.state)) {
        if (capture.draft && capture.alliance) {
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
          await waitWithCountdown(
            queueDelay,
            capture,
            (remaining) => `Capture suivante dans ${formatSeconds(remaining)}.`
          );
          if (!capture.needsManual) {
            capture.state = "ready";
            capture.detail = "Brouillon conservé en mémoire. File reprise.";
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
        setStatus(
          "cancelled",
          "Session interrompue",
          "Arrêtée",
          "La file est arrêtée. Les brouillons déjà prêts restent disponibles en mémoire."
        );
      } else {
        const message = error instanceof Error ? error.message : "Erreur inattendue";
        addLog(`Erreur de session : ${message}`);
        setStatus(
          "error",
          "Erreur de session",
          "Erreur",
          `${message}. Les brouillons déjà prêts restent disponibles en mémoire.`
        );
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

    const duplicate = getAssignedCapture(alliance, capture.id);
    if (duplicate) {
      capture.detail = `${getAllianceLabel(alliance)} est déjà attribuée à la capture ${duplicate.index + 1}.`;
      addLog(`Choix refusé : ${getAllianceLabel(alliance)} est déjà attribuée`, capture);
      setStatus("warning", "Doublon d’alliance", "À corriger", capture.detail);
      renderSession();
      return;
    }

    assignAlliance(capture, alliance, "manual");
    addLog(`Alliance confirmée manuellement : ${capture.allianceLabel}`, capture);
    addLog("Brouillon créé — published = false", capture);
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
  window.addEventListener("pagehide", handlePageHide);

  if (testConfig.exposeState) {
    window.__MSF_WAR_ADMIN_TEST_API__ = {
      getSnapshot() {
        return JSON.parse(JSON.stringify(getTechnicalPayload()));
      },
      normalizeAlliance
    };
  }
})();
