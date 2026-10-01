import { registerManualWarCounterTeam } from "./war-counter-write-team-source.js?v=2";

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

function savedField(saved, side, field) {
  return String(saved?.[`${side}${field}`] || "").trim();
}

function hasSavedSide(saved, side) {
  return Boolean(savedField(saved, side, "Family") || savedField(saved, side, "Variant"));
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
          <p class="eyebrow">War Counters · classement personnalisé</p>
          <h2>Classer l’équipe manquante</h2>
        </div>
        <button class="secondary-button" value="cancel" type="submit">Fermer</button>
      </div>
      <p class="write-warning">Renseigne séparément la famille principale et la variante. Exemple : famille « Gamma », variante « Gamma + Méphisto + Apocalypse ».</p>
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
    const familyLabel = document.createElement("label");
    familyLabel.textContent = `Famille ${sideLabel(side)}`;

    const familyInput = document.createElement("input");
    familyInput.dataset.manualTeamFamily = side;
    familyInput.maxLength = 120;
    familyInput.autocomplete = "off";
    familyInput.placeholder = side === "attack" ? "Ex. Secret Warriors" : "Ex. Gamma";
    familyInput.value = savedField(saved, side, "Family");
    familyLabel.append(familyInput);

    const variantLabel = document.createElement("label");
    variantLabel.textContent = `Variante ${sideLabel(side)}`;

    const variantInput = document.createElement("input");
    variantInput.dataset.manualTeamVariant = side;
    variantInput.maxLength = 120;
    variantInput.autocomplete = "off";
    variantInput.placeholder = side === "attack"
      ? "Ex. Secret Warriors + …"
      : "Ex. Gamma + Méphisto + Apocalypse";
    variantInput.value = savedField(saved, side, "Variant");

    const detail = document.createElement("small");
    detail.className = "muted";
    detail.textContent = sideCharactersText(summary, side);

    variantLabel.append(variantInput, detail);
    root.append(familyLabel, variantLabel);
  }
}

function openManualDialog(summary) {
  const key = matchupKey(summary);
  const saved = manualSelections.get(key) || null;
  const currentlyUnresolved = unresolvedSides(summary);
  const savedSides = ["attack", "defense"].filter((side) => hasSavedSide(saved, side));
  const sides = [...new Set([...currentlyUnresolved, ...savedSides])];

  if (!sides.length) return;

  const dialog = createDialog();
  activeContext = { summary, key, sides };
  renderDialogFields(dialog, summary, sides, saved);
  setDialogStatus("La famille alimente le premier niveau de classement ; la variante est le libellé précis du matchup.");
  dialog.showModal();
  dialog.querySelector("input")?.focus();
}

function updateSummaryTeamName(summary, side, variant) {
  const block = teamBlocks(summary)[side];
  const node = block?.querySelector(".summary-team-name");
  if (!node) return;
  node.textContent = variant;
  node.classList.remove("is-warning");
}

function applySavedLabels(summary, saved) {
  for (const side of ["attack", "defense"]) {
    const variant = savedField(saved, side, "Variant");
    if (variant) updateSummaryTeamName(summary, side, variant);
  }
}

async function saveActiveManualTeams() {
  if (!activeContext) return;
  const dialog = createDialog();
  const button = dialog.querySelector("#saveManualTeam");
  const values = {};

  for (const side of activeContext.sides) {
    const familyInput = dialog.querySelector(`[data-manual-team-family="${side}"]`);
    const variantInput = dialog.querySelector(`[data-manual-team-variant="${side}"]`);
    const family = String(familyInput?.value || "").trim();
    const variant = String(variantInput?.value || "").trim();

    if (!family) {
      setDialogStatus(`La famille ${sideLabel(side)} est requise.`, "error");
      familyInput?.focus();
      return;
    }
    if (!variant) {
      setDialogStatus(`La variante ${sideLabel(side)} est requise.`, "error");
      variantInput?.focus();
      return;
    }
    values[side] = { family, variant };
  }

  button.disabled = true;
  setDialogStatus("Enregistrement du classement pour cette analyse…");

  try {
    const { summary, key, sides } = activeContext;
    const previous = manualSelections.get(key) || {};
    const next = { ...previous };

    for (const side of sides) {
      const { family, variant } = values[side];
      await registerManualWarCounterTeam({
        family,
        variant,
        characters: sideIds(summary, side),
        mode: "Guerre"
      });
      next[`${side}Family`] = family;
      next[`${side}Variant`] = variant;
      updateSummaryTeamName(summary, side, variant);
    }

    manualSelections.set(key, next);
    renderManualControl(summary);
    setDialogStatus("Classement renseigné. Ce contre est maintenant inclus dans le lot.", "success");
    setTimeout(() => dialog.close(), 350);
  } catch (error) {
    setDialogStatus(error?.message || "Impossible d’enregistrer ce classement.", "error");
  } finally {
    button.disabled = false;
  }
}

function renderManualControl(summary) {
  if (!(summary instanceof HTMLElement)) return;
  const key = matchupKey(summary);
  if (!summary.dataset.attackKey || !summary.dataset.defenseKey) return;

  const saved = manualSelections.get(key) || null;
  if (saved) applySavedLabels(summary, saved);
  const unresolved = unresolvedSides(summary);
  const sheetState = summary.querySelector(".sheet-state");
  if (!sheetState) return;

  const existing = sheetState.querySelector(`.${MANUAL_BOX_CLASS}`);
  if (!saved && !unresolved.length) {
    existing?.remove();
    return;
  }

  const signature = saved
    ? `saved:${saved.attackFamily || ""}:${saved.attackVariant || ""}:${saved.defenseFamily || ""}:${saved.defenseVariant || ""}`
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
    title.textContent = "Famille et variante renseignées manuellement ✓";
    const labels = [];
    if (hasSavedSide(saved, "attack")) {
      labels.push(`attaque : ${saved.attackFamily} → ${saved.attackVariant}`);
    }
    if (hasSavedSide(saved, "defense")) {
      labels.push(`défense : ${saved.defenseFamily} → ${saved.defenseVariant}`);
    }
    detail.textContent = `${labels.join(" · ")}. Le contre sera inclus dans l’écriture groupée.`;
    button.textContent = "Modifier le classement";
  } else {
    const labels = unresolved.map(sideLabel).join(" et ");
    title.textContent = "Classement d’équipe requis avant l’écriture";
    detail.textContent = `L’équipe ${labels} n’est pas déterminée dans teams.json. Renseigne sa famille et sa variante pour inclure ce contre dans le lot.`;
    button.textContent = unresolved.length > 1 ? "Classer les équipes" : "Classer l’équipe";
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
