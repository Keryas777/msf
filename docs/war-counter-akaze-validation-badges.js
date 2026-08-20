const STORAGE_KEY = "warCounterAkazeValidationTruthV1";

const input = document.querySelector("#akazeValidationInput");
const resultsNode = document.querySelector("#akazeValidationResults");
const summaryNode = document.querySelector("#akazeValidationSummary");

let selected = [];
let historySummary = null;

function readTruthStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
}

async function fingerprint(file) {
  const buffer = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function savedCount(hash) {
  const slots = readTruthStore()[hash]?.slots;
  if (!slots || typeof slots !== "object") return 0;
  return Object.values(slots).filter((slot) => slot?.characterId).length;
}

function stateLabel(count) {
  if (count >= 10) return "✅ Déjà validée (10/10)";
  if (count > 0) return `🟡 Déjà connue (${count}/10)`;
  return "🆕 Nouvelle capture";
}

function ensureHistorySummary() {
  if (historySummary || !summaryNode) return;
  historySummary = document.createElement("p");
  historySummary.id = "akazeValidationHistorySummary";
  historySummary.setAttribute("role", "status");
  summaryNode.insertAdjacentElement("afterend", historySummary);
}

function annotate() {
  ensureHistorySummary();
  if (!selected.length) {
    if (historySummary) historySummary.textContent = "";
    return;
  }

  const sections = [...resultsNode.querySelectorAll(".validation-capture")];
  const counts = { validated: 0, partial: 0, fresh: 0 };

  selected.forEach((entry, index) => {
    const count = savedCount(entry.hash);
    if (count >= 10) counts.validated += 1;
    else if (count > 0) counts.partial += 1;
    else counts.fresh += 1;

    const section = sections[index];
    if (!section) return;
    const header = section.querySelector(".validation-capture-head");
    if (!header) return;

    let badge = header.querySelector("[data-akaze-history-badge]");
    if (!badge) {
      badge = document.createElement("p");
      badge.dataset.akazeHistoryBadge = "true";
      const title = header.querySelector("h3");
      if (title) title.insertAdjacentElement("afterend", badge);
      else header.prepend(badge);
    }
    badge.textContent = stateLabel(count);
  });

  if (historySummary) {
    historySummary.textContent = `Historique local : ${counts.validated} déjà validée(s) · ${counts.partial} partiellement connue(s) · ${counts.fresh} nouvelle(s).`;
  }
}

async function refreshSelection() {
  const files = [...(input?.files || [])];
  selected = await Promise.all(files.map(async (file) => ({
    name: file.name,
    hash: await fingerprint(file)
  })));
  annotate();
}

input?.addEventListener("change", () => {
  refreshSelection().catch((error) => console.warn("Impossible de classer les captures du benchmark.", error));
});

resultsNode && new MutationObserver(() => annotate()).observe(resultsNode, { childList: true, subtree: true });

window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY) annotate();
});
