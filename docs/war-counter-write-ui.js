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
let activeBatch = null;
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

function canonicalIds(ids) {
  return [...new Set((Array.isArray(ids) ? ids : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
    .join("|");
}

function matchupKey(attackIds, defenseIds) {
  return `${canonicalIds(attackIds)}>>${canonicalIds(defenseIds)}`;
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

function createBatchDialog() {
  let dialog = document.querySelector("#warCounterBatchWriteDialog");
  if (dialog) return dialog;

  dialog = document.createElement("dialog");
  dialog.id = "warCounterBatchWriteDialog";
  dialog.className = "write-dialog";
  dialog.innerHTML = `
    <form method="dialog" class="write-dialog-shell">
      <div class="write-dialog-head">
        <div>
          <p class="eyebrow">Google Sheet · lot</p>
          <h2>Enregistrer les contres</h2>
        </div>
        <button class="secondary-button" value="cancel" type="submit">Fermer</button>
      </div>
      <div id="batchWriteDialogSummary" class="write-dialog-summary"></div>
      <p class="write-warning batch-write-warning">Le lot reprend l’état actuel de toutes les captures. Vérifie les personnages, les camps et les puissances avant de confirmer.</p>
      <div id="batchWritePreview" class="batch-write-preview"></div>
      <label class="write-admin-key">
        Clé d’écriture administrateur
        <input id="batchWriteAdminKey" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Saisie une seule fois pour tout le lot">
      </label>
      <p id="batchWriteDialogStatus" class="write-dialog-status" role="status" aria-live="polite"></p>
      <div class="write-dialog-actions">
        <button id="confirmBatchSheetWrite" class="primary-button" type="button">Confirmer le lot</button>
      </div>
    </form>`;
  document.body.append(dialog);

  dialog.addEventListener("close", () => {
    activeBatch = null;
    const status = dialog.querySelector("#batchWriteDialogStatus");
    if (status) status.textContent = "";
  });
  const confirmButton = dialog.querySelector("#confirmBatchSheetWrite");
  confirmButton?.addEventListener("click", () => {
    if (confirmButton.dataset.mode === "close") {
      dialog.close();
      return;
    }
    submitBatchWrite();
  });
  return dialog;
}

function setDialogStatus(message, kind = "") {
  const node = document.querySelector("#writeDialogStatus");
  if (!node) return;
  node.textContent = message;
  node.className = `write-dialog-status${kind ? ` is-${kind}` : ""}`;
}

function setBatchDialogStatus(message, kind = "") {
  const node = document.querySelector("#batchWriteDialogStatus");
  if (!node) return;
  node.textContent = message;
  node.className = `write-dialog-status${kind ? ` is-${kind}` : ""}`;
}

function setBatchActionButton(dialog, mode = "submit") {
  const button = dialog.querySelector("#confirmBatchSheetWrite");
  if (!button) return;
  button.dataset.mode = mode;
  button.disabled = false;
  button.textContent = mode === "close" ? "Fermer" : "Confirmer le lot";
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

function openWriteDialog(summaryNode, button, proposal, preview) {
  const dialog = createDialog();
  activeWrite = { summaryNode, button, proposal, preview };
  renderDialogSummary(dialog, proposal, preview);
  setDialogStatus("Aucune écriture n’est faite avant ta confirmation.");
  dialog.showModal();
}

function markSummaryProcessed(summary, status = "done") {
  if (!(summary instanceof HTMLElement)) return;
  summary.dataset.sheetWriteDone = "1";
  const button = summary.querySelector(".sheet-write-button");
  if (!button) return;
  button.disabled = true;
  button.classList.add("is-written");
  button.textContent = status === "same" || status === "worse"
    ? "Déjà à jour ✓"
    : "Enregistré ✓";
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

  const { proposal, summaryNode } = activeWrite;
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
    markSummaryProcessed(summaryNode, data.status);

    if (data.changed) {
      const workflowText = data.workflow?.dispatched
        ? " Le rafraîchissement war-counters.json a été déclenché."
        : " Le Sheet est à jour ; le JSON sera rafraîchi par son workflow habituel.";
      setDialogStatus(`${data.message}${workflowText}`, "success");
    } else {
      setDialogStatus(`${data.message} Aucune écriture nécessaire.`, "success");
    }
    await refreshBatchPanel();
  } catch (error) {
    setDialogStatus(error?.message || "Écriture impossible.", "error");
  } finally {
    confirmButton.disabled = false;
  }
}

function proposalPayload(proposal) {
  return {
    attackIds: [...proposal.attackIds],
    defenseIds: [...proposal.defenseIds],
    attackPower: proposal.attackPower,
    defensePower: proposal.defensePower,
    metadata: proposal.action === "create" ? { ...proposal.metadata } : null
  };
}

async function collectBatchEntries() {
  const support = await loadSupportData();
  const summaries = [...document.querySelectorAll(".counter-summary")];
  const entries = [];
  let blocked = 0;

  for (const summary of summaries) {
    if (summary.dataset.sheetWriteDone === "1") continue;
    const preview = reconstructPreview(summary, support);
    if (!preview) continue;
    const proposal = buildWriteProposal({
      preview,
      rows: support.counters,
      nameForId: preview.nameForId
    });
    if (!proposal) continue;
    if (proposal.action === "blocked") {
      blocked += 1;
      continue;
    }
    entries.push({
      summary,
      preview,
      proposal,
      key: matchupKey(proposal.attackIds, proposal.defenseIds)
    });
  }

  return { summaries, entries, blocked };
}

function groupBatchEntries(entries) {
  const grouped = new Map();
  for (const entry of entries) {
    const existing = grouped.get(entry.key);
    if (!existing) {
      grouped.set(entry.key, { ...entry, summaries: [entry.summary], sourceCount: 1 });
      continue;
    }

    existing.sourceCount += 1;
    existing.summaries.push(entry.summary);
    if (entry.proposal.ratio < existing.proposal.ratio) {
      existing.proposal = entry.proposal;
      existing.preview = entry.preview;
      existing.summary = entry.summary;
    }
  }
  return [...grouped.values()];
}

function batchCounts(groups) {
  return {
    total: groups.length,
    create: groups.filter((entry) => entry.proposal.action === "create").length,
    update: groups.filter((entry) => entry.proposal.action === "update").length,
    duplicates: groups.reduce((sum, entry) => sum + Math.max(0, entry.sourceCount - 1), 0)
  };
}

async function refreshBatchPanel() {
  const panel = document.querySelector("#sheetBatchPanel");
  const badge = document.querySelector("#sheetBatchBadge");
  const text = document.querySelector("#sheetBatchSummary");
  const button = document.querySelector("#sheetBatchButton");
  if (!panel || !badge || !text || !button) return;

  try {
    const collection = await collectBatchEntries();
    if (!collection.summaries.length) {
      panel.hidden = true;
      return;
    }

    panel.hidden = false;
    const groups = groupBatchEntries(collection.entries);
    const counts = batchCounts(groups);

    if (!counts.total) {
      badge.textContent = collection.blocked ? `${collection.blocked} à corriger` : "À jour";
      text.textContent = collection.blocked
        ? `${collection.blocked} contre(s) ne peuvent pas encore être préparés. Corrige leur composition avant l’écriture.`
        : "Aucun nouveau matchup ni meilleure valeur à envoyer au Sheet.";
      button.disabled = true;
      button.textContent = "Aucune écriture nécessaire";
      return;
    }

    badge.textContent = `${counts.total} prêt${counts.total > 1 ? "s" : ""}`;
    const parts = [];
    if (counts.create) parts.push(`${counts.create} nouveau${counts.create > 1 ? "x" : ""}`);
    if (counts.update) parts.push(`${counts.update} amélioration${counts.update > 1 ? "s" : ""}`);
    if (counts.duplicates) parts.push(`${counts.duplicates} doublon${counts.duplicates > 1 ? "s" : ""} regroupé${counts.duplicates > 1 ? "s" : ""}`);
    if (collection.blocked) parts.push(`${collection.blocked} à corriger`);
    text.textContent = `${parts.join(" · ")}. Vérifie les captures puis enregistre tout le lot en une seule fois.`;
    button.disabled = false;
    button.textContent = `Enregistrer ${counts.total} contre${counts.total > 1 ? "s" : ""} dans Sheets`;
  } catch (error) {
    panel.hidden = false;
    badge.textContent = "Indisponible";
    text.textContent = "La préparation du lot est momentanément indisponible.";
    button.disabled = true;
    console.warn("[war-counter-write] lot indisponible:", error);
  }
}

function renderBatchDialog(dialog, groups, blocked) {
  const summary = dialog.querySelector("#batchWriteDialogSummary");
  const preview = dialog.querySelector("#batchWritePreview");
  const adminKey = dialog.querySelector("#batchWriteAdminKey");
  const counts = batchCounts(groups);
  summary.replaceChildren();
  preview.replaceChildren();

  const title = document.createElement("strong");
  title.textContent = `${counts.total} matchup${counts.total > 1 ? "s" : ""} unique${counts.total > 1 ? "s" : ""} à traiter`;
  const detail = document.createElement("span");
  detail.textContent = `${counts.create} nouveau${counts.create > 1 ? "x" : ""} · ${counts.update} amélioration${counts.update > 1 ? "s" : ""}`;
  const extra = document.createElement("small");
  const extras = [];
  if (counts.duplicates) extras.push(`${counts.duplicates} capture${counts.duplicates > 1 ? "s" : ""} en doublon regroupée${counts.duplicates > 1 ? "s" : ""} automatiquement sur le meilleur ratio`);
  if (blocked) extras.push(`${blocked} contre${blocked > 1 ? "s" : ""} non résolu${blocked > 1 ? "s" : ""} ignoré${blocked > 1 ? "s" : ""}`);
  extra.textContent = extras.length ? extras.join(" · ") : "Le Worker relira le Sheet et revérifiera chaque matchup avant toute écriture.";
  summary.append(title, detail, extra);

  const list = document.createElement("ul");
  list.className = "batch-write-list";
  groups.slice(0, 12).forEach((entry) => {
    const item = document.createElement("li");
    const ratio = entry.proposal.ratio.toFixed(2).replace(".", ",");
    item.textContent = `${entry.preview.defenseTeam.variant} ← ${entry.preview.attackTeam.variant} · ${ratio}`;
    list.append(item);
  });
  preview.append(list);
  if (groups.length > 12) {
    const more = document.createElement("p");
    more.className = "muted batch-write-more";
    more.textContent = `+ ${groups.length - 12} autre${groups.length - 12 > 1 ? "s" : ""} matchup${groups.length - 12 > 1 ? "s" : ""}`;
    preview.append(more);
  }

  if (adminKey) adminKey.value = readWriteKey();
}

async function openBatchDialog() {
  const collection = await collectBatchEntries();
  const groups = groupBatchEntries(collection.entries);
  if (!groups.length) {
    await refreshBatchPanel();
    return;
  }

  const dialog = createBatchDialog();
  activeBatch = { groups, blocked: collection.blocked };
  renderBatchDialog(dialog, groups, collection.blocked);
  setBatchActionButton(dialog, "submit");
  setBatchDialogStatus("Une seule confirmation et une seule saisie de clé pour tout le lot.");
  dialog.showModal();
}

function batchResultMessage(summary, workflow) {
  const parts = [];
  if (summary.created) parts.push(`${summary.created} créé${summary.created > 1 ? "s" : ""}`);
  if (summary.updated) parts.push(`${summary.updated} amélioré${summary.updated > 1 ? "s" : ""}`);
  if (summary.same) parts.push(`${summary.same} déjà identique${summary.same > 1 ? "s" : ""}`);
  if (summary.worse) parts.push(`${summary.worse} déjà meilleur${summary.worse > 1 ? "s" : ""}`);
  if (summary.conflicts) parts.push(`${summary.conflicts} conflit${summary.conflicts > 1 ? "s" : ""}`);
  if (summary.duplicates) parts.push(`${summary.duplicates} doublon${summary.duplicates > 1 ? "s" : ""} regroupé${summary.duplicates > 1 ? "s" : ""}`);
  const refresh = workflow?.dispatched
    ? " Rafraîchissement de war-counters.json déclenché."
    : "";
  return `${parts.join(" · ") || "Aucune modification"}.${refresh}`;
}

async function submitBatchWrite() {
  const dialog = createBatchDialog();
  const confirmButton = dialog.querySelector("#confirmBatchSheetWrite");
  const session = readSessionToken();
  const writeKey = String(dialog.querySelector("#batchWriteAdminKey")?.value || "").trim();

  if (!session) {
    setBatchDialogStatus("Connexion LoSP requise. Connecte-toi avec Discord puis reviens sur cette page.", "error");
    return;
  }
  if (!writeKey) {
    setBatchDialogStatus("La clé d’écriture administrateur est requise.", "error");
    return;
  }

  const collection = await collectBatchEntries();
  const groups = groupBatchEntries(collection.entries);
  if (!groups.length) {
    setBatchDialogStatus("Plus aucun contre à enregistrer.", "success");
    await refreshBatchPanel();
    setBatchActionButton(dialog, "close");
    return;
  }
  activeBatch = { groups, blocked: collection.blocked };

  let completed = false;
  confirmButton.dataset.mode = "submitting";
  confirmButton.disabled = true;
  confirmButton.textContent = "Écriture en cours…";
  setBatchDialogStatus(`Vérification en direct puis écriture de ${groups.length} matchup${groups.length > 1 ? "s" : ""}…`);

  try {
    const response = await fetch(`${WRITE_WORKER_URL}/api/war-counter-write/apply-batch`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session}`,
        "X-War-Counter-Write-Key": writeKey
      },
      body: JSON.stringify({
        items: groups.map((entry) => proposalPayload(entry.proposal))
      })
    });

    let data = null;
    try {
      data = await response.json();
    } catch (_) {}

    if (!response.ok || !data?.ok) {
      if (response.status === 403) clearWriteKey();
      throw new Error(data?.error || data?.message || `Écriture du lot impossible (HTTP ${response.status}).`);
    }

    saveWriteKey(writeKey);
    const groupsByKey = new Map(groups.map((entry) => [entry.key, entry]));
    const terminalStatuses = new Set(["created", "updated", "same", "worse"]);
    for (const result of Array.isArray(data.results) ? data.results : []) {
      if (!terminalStatuses.has(result.status)) continue;
      const group = groupsByKey.get(result.key);
      group?.summaries?.forEach((summary) => markSummaryProcessed(summary, result.status));
    }

    const kind = data.summary?.conflicts ? "error" : "success";
    setBatchDialogStatus(batchResultMessage(data.summary || {}, data.workflow), kind);
    await refreshBatchPanel();
    completed = true;
  } catch (error) {
    setBatchDialogStatus(error?.message || "Écriture du lot impossible.", "error");
  } finally {
    setBatchActionButton(dialog, completed ? "close" : "submit");
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
      ? "Écrire ce contre seul"
      : "Appliquer cette amélioration seule";
    button.addEventListener("click", () => openWriteDialog(summary, button, proposal, preview));
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
  queueMicrotask(async () => {
    enhanceScheduled = false;
    const summaries = [...document.querySelectorAll(".counter-summary")];
    await Promise.all(summaries.map((summary) => enhanceSummary(summary)));
    await refreshBatchPanel();
  });
}

export function initWarCounterWriteUi() {
  createDialog();
  createBatchDialog();
  document.querySelector("#sheetBatchButton")?.addEventListener("click", openBatchDialog);
  scheduleEnhance();
  const root = document.querySelector("#captureResults");
  if (!root || observer) return;
  observer = new MutationObserver(scheduleEnhance);
  observer.observe(root, { childList: true, subtree: true });
}
