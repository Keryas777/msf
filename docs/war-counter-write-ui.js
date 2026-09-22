import {
  buildTeamLabels,
  findMatchingCounters,
  summarizeCounterComparison
} from "./war-counter-matchup-preview.js";
import { buildWriteProposal } from "./war-counter-write-proposal.js";

const WRITE_WORKER_URL = "https://msf-war-counter-write.deliriousfan7.workers.dev";
const LOCAL_SESSION_KEY = "losp_session";
const WRITE_KEY_SESSION_KEY = "losp_war_counter_write_key";

let supportPromise = null;
let activeWrite = null;
let observer = null;
let enhanceScheduled = false;

function parsePowerText(value) {
  const digits = String(value ?? "").replace(/\D+/g, "");
  if (!digits) return 0;
  const number = Number(digits);
  return Number.isSafeInteger(number) && number > 0 ? number : 0;
}

function idsFromKey(value) {
  return String(value || "").split("|").map((id) => id.trim()).filter(Boolean);
}

function readSessionToken() {
  try {
    return localStorage.getItem(LOCAL_SESSION_KEY) || "";
  } catch (_) {
    return "";
  }
}

function readWriteKey() {
  try {
    return sessionStorage.getItem(WRITE_KEY_SESSION_KEY) || "";
  } catch (_) {
    return "";
  }
}

function saveWriteKey(value) {
  try {
    sessionStorage.setItem(WRITE_KEY_SESSION_KEY, value);
  } catch (_) {}
}

function clearWriteKey() {
  try {
    sessionStorage.removeItem(WRITE_KEY_SESSION_KEY);
  } catch (_) {}
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  return response.json();
}

function loadSupportData() {
  if (!supportPromise) {
    supportPromise = Promise.all([
      fetchJson("data/msf-characters.json"),
      fetchJson("data/teams.json"),
      fetchJson("data/war-counters.json")
    ]).then(([characters, teams, counters]) => {
      const byId = new Map();
      for (const character of Array.isArray(characters) ? characters : []) {
        if (character?.id) byId.set(character.id, character);
      }
      return {
        byId,
        teams: Array.isArray(teams) ? teams : [],
        counters: Array.isArray(counters) ? counters : []
      };
    });
  }
  return supportPromise;
}

function displayName(byId, id) {
  const character = byId.get(id);
  return character?.nameKey || character?.nameFr || character?.nameEn || id;
}

function reconstructPreview(summary, support) {
  const attackIds = idsFromKey(summary.dataset.attackKey);
  const defenseIds = idsFromKey(summary.dataset.defenseKey);
  if (!attackIds.length || !defenseIds.length) return null;

  const teamBlocks = [...summary.querySelectorAll(".summary-team")];
  if (teamBlocks.length < 2) return null;
  const attackPower = parsePowerText(teamBlocks[0].querySelector(".summary-power")?.textContent);
  const defensePower = parsePowerText(teamBlocks[1].querySelector(".summary-power")?.textContent);
  if (!attackPower || !defensePower) return null;

  const nameForId = (id) => displayName(support.byId, id);
  const attackTeam = buildTeamLabels(attackIds, support.teams, nameForId);
  const defenseTeam = buildTeamLabels(defenseIds, support.teams, nameForId);
  const matches = findMatchingCounters(support.counters, attackIds, defenseIds);
  const comparison = summarizeCounterComparison(matches, attackPower / defensePower);

  return {
    nameForId,
    state: {
      attackIds,
      defenseIds,
      attackPower,
      defensePower,
      ratio: attackPower / defensePower
    },
    attackTeam,
    defenseTeam,
    comparison
  };
}

function createDialog() {
  let dialog = document.querySelector("#warCounterWriteDialog");
  if (dialog) return dialog;

  dialog = document.createElement("dialog");
  dialog.id = "warCounterWriteDialog";
  dialog.className = "write-dialog";
  dialog.innerHTML = `
    <form method="dialog" class="write-dialog-shell">
      <div class="write-dialog-head">
        <div>
          <p class="eyebrow">Google Sheet · confirmation</p>
          <h2>Enregistrer le contre</h2>
        </div>
        <button class="secondary-button" value="cancel" type="submit">Fermer</button>
      </div>
      <div id="writeDialogSummary" class="write-dialog-summary"></div>
      <div id="writeMetadataFields" class="write-metadata-fields" hidden>
        <p class="write-warning">Vérifie ces valeurs avant l’ajout. Les clés sont proposées automatiquement mais restent modifiables.</p>
        <label>Famille défense<input data-field="def_family" maxlength="120"></label>
        <label>Variante défense<input data-field="def_variant" maxlength="120"></label>
        <label>Clé défense<input data-field="def_key" maxlength="100" autocapitalize="off" autocomplete="off"></label>
        <label>Famille attaque<input data-field="atk_family" maxlength="120"></label>
        <label>Équipe attaque<input data-field="atk_team" maxlength="120"></label>
        <label>Clé attaque<input data-field="atk_key" maxlength="100" autocapitalize="off" autocomplete="off"></label>
        <label class="write-notes">Notes<textarea data-field="notes" maxlength="500" rows="3" placeholder="Facultatif"></textarea></label>
      </div>
      <label class="write-admin-key">
        Clé d’écriture administrateur
        <input id="writeAdminKey" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Conservée seulement jusqu’à la fermeture de cet onglet">
      </label>
      <p id="writeDialogStatus" class="write-dialog-status" role="status" aria-live="polite"></p>
      <div class="write-dialog-actions">
        <button id="confirmSheetWrite" class="primary-button" type="button">Confirmer l’écriture</button>
      </div>
    </form>`;
  document.body.append(dialog);

  dialog.addEventListener("close", () => {
    activeWrite = null;
    const status = dialog.querySelector("#writeDialogStatus");
    if (status) status.textContent = "";
  });
  dialog.querySelector("#confirmSheetWrite")?.addEventListener("click", submitActiveWrite);
  return dialog;
}

function setDialogStatus(message, kind = "") {
  const node = document.querySelector("#writeDialogStatus");
  if (!node) return;
  node.textContent = message;
  node.className = `write-dialog-status${kind ? ` is-${kind}` : ""}`;
}

function metadataFromDialog(dialog) {
  const metadata = {};
  for (const field of ["def_family", "def_variant", "def_key", "atk_family", "atk_team", "atk_key", "notes"]) {
    metadata[field] = String(dialog.querySelector(`[data-field="${field}"]`)?.value || "").trim();
  }
  return metadata;
}

function renderDialogSummary(dialog, proposal, preview) {
  const summary = dialog.querySelector("#writeDialogSummary");
  const metadataFields = dialog.querySelector("#writeMetadataFields");
  const adminKey = dialog.querySelector("#writeAdminKey");
  summary.replaceChildren();

  const title = document.createElement("strong");
  const detail = document.createElement("span");
  const teams = document.createElement("small");

  if (proposal.action === "update") {
    title.textContent = "Améliorer un matchup existant";
    detail.textContent = `Ratio hard ${proposal.previousRatio.toFixed(2).replace(".", ",")} → ${proposal.ratio.toFixed(2).replace(".", ",")}.`;
    teams.textContent = proposal.matchingRows.length > 1
      ? `${proposal.matchingRows.length} classifications seront mises à jour ensemble (lignes ${proposal.matchingRows.join(", ")}).`
      : `La colonne Q de la ligne ${proposal.matchingRows[0]} sera mise à jour.`;
    metadataFields.hidden = true;
  } else {
    title.textContent = "Ajouter un nouveau matchup";
    detail.textContent = `Ratio hard à enregistrer : ${proposal.ratio.toFixed(2).replace(".", ",")}.`;
    teams.textContent = `${preview.defenseTeam.variant} ← défense · ${preview.attackTeam.variant} ← attaque`;
    metadataFields.hidden = false;
    for (const [field, value] of Object.entries(proposal.metadata || {})) {
      const input = dialog.querySelector(`[data-field="${field}"]`);
      if (input) input.value = value;
    }
  }

  if (adminKey) adminKey.value = readWriteKey();
  summary.append(title, detail, teams);
}

function openWriteDialog(button, proposal, preview) {
  const dialog = createDialog();
  activeWrite = { button, proposal, preview };
  renderDialogSummary(dialog, proposal, preview);
  setDialogStatus("Aucune écriture n’est faite avant ta confirmation.");
  dialog.showModal();
}

async function submitActiveWrite() {
  if (!activeWrite) return;
  const dialog = createDialog();
  const confirmButton = dialog.querySelector("#confirmSheetWrite");
  const session = readSessionToken();
  const writeKey = String(dialog.querySelector("#writeAdminKey")?.value || "").trim();

  if (!session) {
    setDialogStatus("Connexion LoSP requise. Connecte-toi avec Discord puis reviens sur cette page.", "error");
    return;
  }
  if (!writeKey) {
    setDialogStatus("La clé d’écriture administrateur est requise.", "error");
    return;
  }

  const { proposal, button } = activeWrite;
  let metadata = proposal.metadata;
  if (proposal.action === "create") {
    metadata = metadataFromDialog(dialog);
    const required = ["def_family", "def_variant", "def_key", "atk_family", "atk_team", "atk_key"];
    const missing = required.filter((field) => !metadata[field]);
    if (missing.length) {
      setDialogStatus(`Champs requis manquants : ${missing.join(", ")}.`, "error");
      return;
    }
  }

  confirmButton.disabled = true;
  setDialogStatus("Vérification du Sheet en direct puis écriture…");

  try {
    const response = await fetch(`${WRITE_WORKER_URL}/api/war-counter-write/apply`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session}`,
        "X-War-Counter-Write-Key": writeKey
      },
      body: JSON.stringify({
        attackIds: proposal.attackIds,
        defenseIds: proposal.defenseIds,
        attackPower: proposal.attackPower,
        defensePower: proposal.defensePower,
        metadata
      })
    });

    let data = null;
    try {
      data = await response.json();
    } catch (_) {}

    if (!response.ok || !data?.ok) {
      if (response.status === 403) clearWriteKey();
      throw new Error(data?.error || data?.message || `Écriture impossible (HTTP ${response.status}).`);
    }

    saveWriteKey(writeKey);

    if (data.changed) {
      const workflowText = data.workflow?.dispatched
        ? " Le rafraîchissement war-counters.json a été déclenché."
        : " Le Sheet est à jour ; le JSON sera rafraîchi par son workflow habituel.";
      setDialogStatus(`${data.message}${workflowText}`, "success");
      button.textContent = "Enregistré ✓";
      button.disabled = true;
      button.classList.add("is-written");
    } else {
      setDialogStatus(`${data.message} Aucune écriture nécessaire.`, "success");
      button.textContent = "Déjà à jour ✓";
      button.disabled = true;
    }
  } catch (error) {
    setDialogStatus(error?.message || "Écriture impossible.", "error");
  } finally {
    confirmButton.disabled = false;
  }
}

async function enhanceSummary(summary) {
  if (!(summary instanceof HTMLElement)) return;
  if (summary.dataset.writeEnhancing === "1") return;
  const sheetState = summary.querySelector(".sheet-state");
  if (!sheetState) return;
  if (summary.querySelector(".sheet-write-button")) return;

  summary.dataset.writeEnhancing = "1";
  try {
    const support = await loadSupportData();
    if (!summary.isConnected || summary.querySelector(".sheet-write-button")) return;
    const preview = reconstructPreview(summary, support);
    if (!preview) return;
    const proposal = buildWriteProposal({
      preview,
      rows: support.counters,
      nameForId: preview.nameForId
    });
    if (!proposal || proposal.action === "blocked") return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "primary-button sheet-write-button";
    button.textContent = proposal.action === "create"
      ? "Préparer l’ajout au Sheet"
      : "Préparer l’amélioration";
    button.addEventListener("click", () => openWriteDialog(button, proposal, preview));
    sheetState.append(button);
  } catch (error) {
    console.warn("[war-counter-write] préparation indisponible:", error);
  } finally {
    delete summary.dataset.writeEnhancing;
  }
}

function scheduleEnhance() {
  if (enhanceScheduled) return;
  enhanceScheduled = true;
  queueMicrotask(() => {
    enhanceScheduled = false;
    document.querySelectorAll(".counter-summary").forEach((summary) => enhanceSummary(summary));
  });
}

export function initWarCounterWriteUi() {
  createDialog();
  scheduleEnhance();
  const root = document.querySelector("#captureResults");
  if (!root || observer) return;
  observer = new MutationObserver(scheduleEnhance);
  observer.observe(root, { childList: true, subtree: true });
}
