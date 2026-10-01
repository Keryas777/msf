import { registerManualWarCounterTeam } from "./war-counter-write-team-source.js?v=1";

const MANUAL_BOX_CLASS = "manual-team-resolution";
const manualSelections = new Map();
let observer = null;
let activeContext = null;

function idsFromKey(value) {
  return String(value || "").split("|").map((id) => id.trim()).filter(Boolean);
}

function matchupKey(summary) {
  return `${summary.dataset.attackKey || ""}>>${summary.dataset.defenseKey || ""}`;
}

function teamBlocks(summary) {
  const blocks = [...summary.querySelectorAll(".summary-team")];
  return {
    attack: blocks[0] || null,
    defense: blocks[1] || null
  };
}

function unresolvedSides(summary) {
  if (!summary.querySelector(".sheet-state.is-new")) return [];
  const blocks = teamBlocks(summary);
  const sides = [];
  if (blocks.attack?.querySelector(".summary-team-name.is-warning")) sides.push("attack");
  if (blocks.defense?.querySelector(".summary-team-name.is-warning")) sides.push("defense");
  return sides;
}

function sideLabel(side) {
  return side === "attack" ? "attaque" : "défense";
}

function sideIds(summary, side) {
  return idsFromKey(side === "attack" ? summary.dataset.attackKey : summary.dataset.defenseKey);
}

function sideCharactersText(summary, side) {
  const blocks = teamBlocks(summary);
  return blocks[side]?.querySelector(".summary-characters")?.textContent?.trim() || "";
}

function createDialog() {
  let dialog = document.querySelector("#warCounterManualTeamDialog");
  if (dialog) return dialog;

  dialog = document.createElement("dialog");
  dialog.id = "warCounterManualTeamDialog";
  dialog.className = "write-dialog";
  dialog.innerHTML = `
    <form method="dialog" class="write-dialog-shell">
      <div class="write-dialog-head">
        <div>
          <p class="eyebrow">War Counters · équipe personnalisée</p>
          <h2>Nommer l’équipe manquante</h2>
        </div>
        <button class="secondary-button" value="cancel" type="submit">Fermer</button>
      </div>
      <p class="write-warning">Ce nom sert uniquement à classer ce nouveau matchup dans War Counters. La composition reconnue ne sera pas modifiée.</p>
      <div id="manualTeamFields" class="write-metadata-fields"></div>
      <p id="manualTeamStatus" class="write-dialog-status" role="status" aria-live="polite"></p>
      <div class="write-dialog-actions">
        <button id="saveManualTeam" class="primary-button" type="button">Valider pour le lot</button>
      </div>
    </form>`;
  document.body.append(dialog);

  dialog.addEventListener("close", () => {
    activeContext = null;
    const status = dialog.querySelector("#manualTeamStatus");
    if (status) status.textContent = "";
  });
  dialog.querySelector("#saveManualTeam")?.addEventListener("click", saveActiveManualTeams);
  return dialog;
}

function setDialogStatus(message, kind = "") {
  const node = document.querySelector("#manualTeamStatus");
  if (!node) return;
  node.textContent = message;
  node.className = `write-dialog-status${kind ? ` is-${kind}` : ""}`;
}

function renderDialogFields(dialog, summary, sides, saved) {
  const root = dialog.querySelector("#manualTeamFields");
  root.replaceChildren();

  for (const side of sides) {
    const label = document.createElement("label");
    label.textContent = `Nom de l’équipe ${sideLabel(side)}`;

    const input = document.createElement("input");
    input.dataset.manualTeamSide = side;
    input.maxLength = 120;
    input.autocomplete = "off";
    input.placeholder = side === "attack" ? "Ex. Secret Warriors + …" : "Ex. Cabale + Méphisto";
    input.value = side === "attack" ? (saved?.attackName || "") : (saved?.defenseName || "");

    const detail = document.createElement("small");
    detail.className = "muted";
    detail.textContent = sideCharactersText(summary, side);

    label.append(input, detail);
    root.append(label);
  }
}

function openManualDialog(summary) {
  const key = matchupKey(summary);
  const saved = manualSelections.get(key) || null;
  const currentlyUnresolved = unresolvedSides(summary);
  const sides = saved
    ? [saved.attackName ? "attack" : null, saved.defenseName ? "defense" : null].filter(Boolean)
    : currentlyUnresolved;

  if (!sides.length) return;

  const dialog = createDialog();
  activeContext = { summary, key, sides };
  renderDialogFields(dialog, summary, sides, saved);
  setDialogStatus("Renseigne un nom clair : il sera utilisé comme famille et variante dans le Sheet.");
  dialog.showModal();
  dialog.querySelector("input")?.focus();
}

function updateSummaryTeamName(summary, side, name) {
  const block = teamBlocks(summary)[side];
  const node = block?.querySelector(".summary-team-name");
  if (!node) return;
  node.textContent = `${name} "classique"`;
  node.classList.remove("is-warning");
}

async function saveActiveManualTeams() {
  if (!activeContext) return;
  const dialog = createDialog();
  const button = dialog.querySelector("#saveManualTeam");
  const values = {};

  for (const input of dialog.querySelectorAll("[data-manual-team-side]")) {
    const side = input.dataset.manualTeamSide;
    const value = String(input.value || "").trim();
    if (!value) {
      setDialogStatus(`Le nom de l’équipe ${sideLabel(side)} est requis.`, "error");
      input.focus();
      return;
    }
    values[side] = value;
  }

  button.disabled = true;
  setDialogStatus("Enregistrement du nom pour cette analyse…");

  try {
    const { summary, key, sides } = activeContext;
    const previous = manualSelections.get(key) || {};
    const next = { ...previous };

    for (const side of sides) {
      const name = values[side];
      await registerManualWarCounterTeam({
        name,
        characters: sideIds(summary, side),
        mode: "Guerre"
      });
      if (side === "attack") next.attackName = name;
      else next.defenseName = name;
      updateSummaryTeamName(summary, side, name);
    }

    manualSelections.set(key, next);
    renderManualControl(summary);
    setDialogStatus("Équipe renseignée. Ce contre est maintenant inclus dans le lot.", "success");
    setTimeout(() => dialog.close(), 350);
  } catch (error) {
    setDialogStatus(error?.message || "Impossible d’enregistrer ce nom.", "error");
  } finally {
    button.disabled = false;
  }
}

function renderManualControl(summary) {
  if (!(summary instanceof HTMLElement)) return;
  const key = matchupKey(summary);
  if (!summary.dataset.attackKey || !summary.dataset.defenseKey) return;

  const saved = manualSelections.get(key) || null;
  const unresolved = unresolvedSides(summary);
  const sheetState = summary.querySelector(".sheet-state");
  if (!sheetState) return;

  const existing = sheetState.querySelector(`.${MANUAL_BOX_CLASS}`);
  if (!saved && !unresolved.length) {
    existing?.remove();
    return;
  }

  const signature = saved
    ? `saved:${saved.attackName || ""}:${saved.defenseName || ""}`
    : `missing:${unresolved.join(",")}`;
  if (existing?.dataset.signature === signature) return;

  const box = document.createElement("div");
  box.className = MANUAL_BOX_CLASS;
  box.dataset.signature = signature;

  const title = document.createElement("strong");
  const detail = document.createElement("span");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary-button";

  if (saved) {
    title.textContent = "Nom d’équipe renseigné manuellement ✓";
    const labels = [];
    if (saved.attackName) labels.push(`attaque : ${saved.attackName}`);
    if (saved.defenseName) labels.push(`défense : ${saved.defenseName}`);
    detail.textContent = `${labels.join(" · ")}. Le contre sera inclus dans l’écriture groupée.`;
    button.textContent = "Modifier le nom";
  } else {
    const labels = unresolved.map(sideLabel).join(" et ");
    title.textContent = "Nom d’équipe requis avant l’écriture";
    detail.textContent = `L’équipe ${labels} n’est pas déterminée dans teams.json. Donne-lui un nom pour inclure ce contre dans le lot.`;
    button.textContent = unresolved.length > 1 ? "Nommer les équipes" : "Nommer l’équipe";
  }

  button.addEventListener("click", () => openManualDialog(summary));
  box.append(title, detail, button);
  if (existing) existing.replaceWith(box);
  else sheetState.append(box);
}

function enhanceAll() {
  document.querySelectorAll(".counter-summary").forEach((summary) => renderManualControl(summary));
}

export function initWarCounterManualTeamUi() {
  createDialog();
  enhanceAll();
  const root = document.querySelector("#captureResults");
  if (!root || observer) return;
  observer = new MutationObserver(() => queueMicrotask(enhanceAll));
  observer.observe(root, { childList: true, subtree: true });
}
