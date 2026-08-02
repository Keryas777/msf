(() => {
  "use strict";

  const API_URL = "https://msf-war-ocr.deliriousfan7.workers.dev/api/war/parse-gemini-draft";
  const IDLE_RESULT = "En attente d’un envoi…";
  const SUBMIT_LABEL = "Envoyer l’image au Worker";

  const form = document.getElementById("warAdminForm");
  const dateInput = document.getElementById("warDate");
  const allianceSelect = document.getElementById("warAlliance");
  const imageInput = document.getElementById("warImage");
  const previewPanel = document.getElementById("warPreviewPanel");
  const previewImage = document.getElementById("warPreview");
  const fileMeta = document.getElementById("warFileMeta");
  const submitButton = document.getElementById("warSubmit");
  const statusPanel = document.getElementById("warStatusPanel");
  const statusTitle = document.getElementById("warStatusTitle");
  const statusBadge = document.getElementById("warStatusBadge");
  const statusMessage = document.getElementById("warStatusMessage");
  const result = document.getElementById("warResult");

  let previewUrl = "";
  let isSubmitting = false;

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

  function getSelectedFile() {
    return imageInput.files && imageInput.files[0] ? imageInput.files[0] : null;
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

  function releasePreviewUrl() {
    if (!previewUrl) return;
    URL.revokeObjectURL(previewUrl);
    previewUrl = "";
  }

  function setStatus(state, title, badge, message) {
    statusPanel.dataset.state = state;
    statusTitle.textContent = title;
    statusBadge.textContent = badge;
    statusMessage.textContent = message;
  }

  function updateSubmitAvailability() {
    submitButton.disabled = isSubmitting || !dateInput.value || !getSelectedFile();
  }

  function setSubmitting(submitting) {
    isSubmitting = submitting;
    form.setAttribute("aria-busy", String(submitting));
    dateInput.disabled = submitting;
    allianceSelect.disabled = submitting;
    imageInput.disabled = submitting;
    submitButton.textContent = submitting ? "Envoi en cours…" : SUBMIT_LABEL;
    updateSubmitAvailability();
  }

  function getErrorDetail(data) {
    if (!data || typeof data !== "object") return "";
    return data.error || data.message || data.parsed_json_error || "";
  }

  function handleImageChange() {
    releasePreviewUrl();

    const file = getSelectedFile();

    if (!file) {
      previewImage.removeAttribute("src");
      previewPanel.hidden = true;
      fileMeta.textContent = "";
      result.textContent = IDLE_RESULT;
      setStatus("idle", "En attente", "Attente", "Sélectionne une image pour préparer l’envoi.");
      updateSubmitAvailability();
      return;
    }

    previewUrl = URL.createObjectURL(file);
    previewImage.src = previewUrl;
    previewPanel.hidden = false;
    fileMeta.textContent = `${file.name || "Capture sans nom"} · ${formatFileSize(file.size)}`;
    result.textContent = IDLE_RESULT;
    setStatus("idle", "Prêt à envoyer", "Attente", "Vérifie la date et l’alliance, puis lance l’envoi.");
    updateSubmitAvailability();
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (isSubmitting) return;

    const file = getSelectedFile();
    const warDate = dateInput.value;
    const alliance = allianceSelect.value;

    if (!warDate) {
      setStatus("error", "Date manquante", "Erreur", "Choisis une date de guerre avant l’envoi.");
      updateSubmitAvailability();
      return;
    }

    if (!file) {
      setStatus("error", "Image manquante", "Erreur", "Sélectionne une capture avant l’envoi.");
      updateSubmitAvailability();
      return;
    }

    const formData = new FormData();
    formData.append("alliance", alliance);
    formData.append("war_date", warDate);
    formData.append("image", file, file.name || "war.jpg");

    setSubmitting(true);
    setStatus("sending", "Envoi en cours", "Envoi", "La capture est en cours d’analyse par le Worker.");
    result.textContent = `Envoi de ${file.name || "la capture"} (${formatFileSize(file.size)})…`;

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        body: formData
      });

      const responseText = await response.text();
      let data;

      try {
        data = JSON.parse(responseText);
      } catch (_) {
        result.textContent = responseText || "Réponse vide du Worker.";
        setStatus(
          "error",
          "Réponse illisible",
          "Erreur",
          `Le Worker a répondu en HTTP ${response.status}, mais sans JSON valide.`
        );
        return;
      }

      result.textContent = JSON.stringify(data, null, 2);

      if (!response.ok) {
        const statusLabel = response.statusText
          ? `HTTP ${response.status} ${response.statusText}`
          : `HTTP ${response.status}`;
        const detail = getErrorDetail(data);
        setStatus(
          "error",
          "Échec de l’envoi",
          "Erreur",
          detail ? `${statusLabel} — ${detail}` : statusLabel
        );
        return;
      }

      if (data && data.ok === false) {
        setStatus(
          "error",
          "Erreur du Worker",
          "Erreur",
          getErrorDetail(data) || "Le Worker n’a pas pu terminer l’analyse."
        );
        return;
      }

      const allianceLabel = allianceSelect.options[allianceSelect.selectedIndex]?.text || alliance;
      setStatus(
        "success",
        "OCR terminé",
        "Brouillon",
        `Brouillon non publié pour ${allianceLabel}, guerre du ${warDate}. Aucune donnée GitHub modifiée.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur réseau inconnue";
      result.textContent = `Erreur : ${message}`;
      setStatus(
        "error",
        "Envoi impossible",
        "Erreur",
        `Impossible de joindre le Worker. ${message}`
      );
    } finally {
      setSubmitting(false);
    }
  }

  dateInput.value = getLocalDateValue();
  allianceSelect.value = "zeus";
  setStatus("idle", "En attente", "Attente", "Sélectionne une image pour préparer l’envoi.");
  result.textContent = IDLE_RESULT;
  updateSubmitAvailability();

  dateInput.addEventListener("input", updateSubmitAvailability);
  imageInput.addEventListener("change", handleImageChange);
  form.addEventListener("submit", handleSubmit);
  window.addEventListener("pagehide", releasePreviewUrl);
})();
