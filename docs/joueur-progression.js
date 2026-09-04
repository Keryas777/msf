(() => {
  const RULES_URL = "./data/player-progression-rules.json";

  const cardEl = document.querySelector("#playerProgressionCard");
  const listEl = document.querySelector("#playerProgressionList");
  const emptyEl = document.querySelector("#playerProgressionEmpty");
  const toggleEl = document.querySelector("#playerProgressionToggle");

  if (!cardEl || !listEl || !emptyEl || !toggleEl) return;

  const state = {
    rules: [],
    roster: null,
    showAll: false,
  };

  function bust(url) {
    const u = new URL(url, window.location.href);
    u.searchParams.set("v", Date.now().toString());
    return u.toString();
  }

  function normalizeKey(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  function findRosterChar(roster, character) {
    if (!roster?.chars || typeof roster.chars !== "object") return null;

    const wanted = normalizeKey(character);
    if (!wanted) return null;

    for (const [key, value] of Object.entries(roster.chars)) {
      if (normalizeKey(key) === wanted) return value || null;
    }

    return null;
  }

  function hasUsableStarData(roster) {
    if (!roster?.chars || typeof roster.chars !== "object") return false;

    return Object.values(roster.chars).some((char) => {
      return (
        Number(char?.yellowStars || 0) > 0 ||
        Number(char?.redStars || 0) > 0 ||
        Number(char?.diamonds || 0) > 0
      );
    });
  }

  function isOwned(char) {
    if (!char) return false;

    return (
      Number(char.power || 0) > 0 ||
      Number(char.yellowStars || 0) > 0 ||
      Number(char.redStars || 0) > 0 ||
      Number(char.diamonds || 0) > 0
    );
  }

  function meetsRequirements(char, requirements) {
    if (!char || !requirements || typeof requirements !== "object") return false;

    return Object.entries(requirements).every(([field, minimum]) => {
      return Number(char?.[field] || 0) >= Number(minimum || 0);
    });
  }

  function requirementLabel(requirements) {
    const parts = [];

    if (requirements?.yellowStars) parts.push(`${requirements.yellowStars}Y`);
    if (requirements?.redStars) parts.push(`${requirements.redStars}R`);
    if (requirements?.diamonds) parts.push(`${requirements.diamonds}D`);

    return parts.join(" / ");
  }

  function evaluateRules() {
    const roster = state.roster;
    const rows = [];

    state.rules.forEach((content) => {
      let previousComplete = false;

      (content.steps || []).forEach((step) => {
        const char = findRosterChar(roster, step.character);
        const complete = meetsRequirements(char, step.requirements);
        const inProgress = !complete && (previousComplete || isOwned(char));

        if (complete || inProgress) {
          rows.push({
            contentLabel: content.label,
            stepLabel: step.label,
            character: step.character,
            requirements: step.requirements || {},
            status: complete ? "complete" : "in-progress",
          });
        }

        previousComplete = complete;
      });
    });

    return rows;
  }

  function buildRow(row) {
    const item = document.createElement("div");
    item.className = `playerProgressionRow is-${row.status}`;

    const status = document.createElement("span");
    status.className = "playerProgressionStatus";
    status.textContent = row.status === "complete" ? "✅" : "🔄";
    status.setAttribute("aria-hidden", "true");

    const main = document.createElement("div");
    main.className = "playerProgressionMain";

    const title = document.createElement("div");
    title.className = "playerProgressionTitle";
    title.textContent = `${row.contentLabel} — ${row.stepLabel}`;

    const meta = document.createElement("div");
    meta.className = "playerProgressionMeta";
    meta.textContent = requirementLabel(row.requirements);

    main.appendChild(title);
    if (meta.textContent) main.appendChild(meta);

    item.appendChild(status);
    item.appendChild(main);

    return item;
  }

  function render() {
    listEl.replaceChildren();

    if (!state.roster) {
      toggleEl.hidden = true;
      emptyEl.hidden = false;
      emptyEl.textContent = "Roster introuvable pour ce joueur.";
      return;
    }

    if (!hasUsableStarData(state.roster)) {
      toggleEl.hidden = true;
      emptyEl.hidden = false;
      emptyEl.textContent = "Progression indisponible jusqu’à la prochaine mise à jour du roster.";
      return;
    }

    const rows = evaluateRules();
    const visibleRows = state.showAll
      ? rows
      : rows.filter((row) => row.status === "in-progress");

    toggleEl.hidden = rows.length === 0;
    toggleEl.textContent = state.showAll ? "Voir en cours" : "Voir tout";
    toggleEl.setAttribute("aria-expanded", state.showAll ? "true" : "false");

    if (!visibleRows.length) {
      emptyEl.hidden = false;
      emptyEl.textContent = state.showAll
        ? "Aucune progression détectable dans ce roster."
        : "Aucune étape en cours détectable.";
      return;
    }

    emptyEl.hidden = true;
    visibleRows.forEach((row) => listEl.appendChild(buildRow(row)));
  }

  toggleEl.addEventListener("click", () => {
    state.showAll = !state.showAll;
    render();
  });

  window.addEventListener("losp:player-profile-render", (event) => {
    state.roster = event.detail?.roster || null;
    render();
  });

  fetch(bust(RULES_URL), { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`${RULES_URL} -> HTTP ${response.status}`);
      return response.json();
    })
    .then((rules) => {
      state.rules = Array.isArray(rules) ? rules : [];
      render();
    })
    .catch((error) => {
      console.error(error);
      toggleEl.hidden = true;
      emptyEl.hidden = false;
      emptyEl.textContent = "Progression indisponible.";
    });
})();
