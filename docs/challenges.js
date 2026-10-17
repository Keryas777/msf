/* LoSP — Challenges : données statiques + portraits officiels, sans dépendance externe. */
(() => {
  "use strict";

  const PATHS = {
    guides: "./data/challenges.json",
    characters: "./data/msf-characters.json",
    strategies: "./data/challenge-strategies.json",
  };
  const STORAGE_KEY = "losp_challenges_progress_v1";
  const CATEGORIES = {
    "dark-dimension": { label: "🌌 Dimension noire", description: "Choisis une dimension noire, puis une section ou mission." },
    tower: { label: "🏰 Tours / Kyln", description: "Choisis une tour ou Kyln, puis un étage ou une cellule." },
    trial: { label: "⚔️ Trials légendaires / Breakers", description: "Choisis un trial, puis une mission et sa composition." },
    event: { label: "🧭 Autres événements PvE", description: "Invasions, sagas et parcours de recrutement." },
  };
  const URL_CATEGORY = new URLSearchParams(location.search).get("category") || "";

  const ui = {
    search: document.getElementById("challengeSearch"),
    list: document.getElementById("challengeList"),
    empty: document.getElementById("challengeEmpty"),
    count: document.getElementById("challengeCount"),
    detail: document.getElementById("challengeDetail"),
  };
  const state = {
    category: URL_CATEGORY,
    query: "",
    selected: new URLSearchParams(location.search).get("guide") || "",
    events: [],
    characters: new Map(),
    progress: readProgress(),
    strategies: new Map(),
  };

  function readProgress() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch {
      return {};
    }
  }

  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
    } catch {
      // Mode privé / stockage bloqué : l'affichage reste fonctionnel.
    }
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }

  function clear(node) {
    node.replaceChildren();
  }

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("fr")
      .trim();
  }

  async function loadJson(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error("Erreur HTTP " + res.status + " : " + path);
    return res.json();
  }

  function makeAvatar(characterId, fallback) {
    const holder = el("span", "challenge-avatar");
    const character = state.characters.get(characterId);
    const url = character && typeof character.portraitUrl === "string" ? character.portraitUrl : "";
    // On reprend exclusivement les portraits du catalogue officiel déjà présent chez LoSP.
    if (url && /^https:\/\/assets\.marvelstrikeforce\.com\/imgs\//.test(url)) {
      const img = el("img");
      img.src = url;
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      img.onerror = () => { img.remove(); holder.textContent = fallback || "★"; };
      holder.append(img);
    } else {
      holder.textContent = fallback || "★";
    }
    return holder;
  }

  function makeHero(characterId) {
    const character = state.characters.get(characterId);
    const figure = el("figure", "challenge-hero");
    figure.append(makeAvatar(characterId, "?"));
    const name = character?.nameKey || character?.nameFr || character?.nameEn || characterId;
    const caption = el("figcaption", "", name);
    figure.append(caption);
    return figure;
  }

  function completedCount(event) {
    return event.stages.filter(stage => state.progress[event.id + ":" + stage.id]).length;
  }

  // Les étages ou cellules à venir restent visibles et accessibles depuis le sélecteur.
  function displayStages(event) {
    const stages = Array.isArray(event.stages) ? event.stages : [];
    const total = Number(event.totalStages);
    if (!Number.isInteger(total) || total <= 0 || total > 100) return stages;
    const indexed = new Map(stages.map(stage => [String(stage.id), stage]));
    const unit = event.stageUnit === "cellule" ? "Cellule" : event.stageUnit === "mission" ? "Mission" : "Étage";
    const result = [];
    for (let index = 1; index <= total; index += 1) {
      const id = String(index);
      result.push(indexed.get(id) || {
        id, title: unit + " " + id, requirement: "Informations à compléter",
        pending: true
      });
    }
    return result.concat(stages.filter(stage => !/^\d+$/.test(String(stage.id)) || Number(stage.id) > total));
  }

  function matchingEvents() {
    return state.events.filter(event => {
      if (event.type !== state.category) return false;
      const text = [event.title, event.summary, event.id].join(" ");
      return normalize(text).includes(normalize(state.query));
    });
  }

  function renderDirectory() {
    clear(ui.list);
    const items = matchingEvents();
    ui.count.textContent = items.length + " guide" + (items.length > 1 ? "s" : "") + " trouvé" + (items.length > 1 ? "s" : "");
    ui.empty.hidden = items.length !== 0;

    for (const event of items) {
      const button = el("button", "challenge-entry");
      button.type = "button";
      button.setAttribute("aria-pressed", String(state.selected === event.id));
      button.setAttribute("aria-label", "Ouvrir le guide : " + event.title);
      button.append(makeAvatar(event.rewardId, event.type === "tower" ? "🏰" : event.type === "trial" ? "⚔" : "🌌"));
      const content = el("span", "challenge-entry-text");
      content.append(el("strong", "", event.title));
      const count = event.stages.length;
      const total = Number.isInteger(event.totalStages) ? event.totalStages : null;
      const info = total
        ? count + " / " + total + " " + (event.stageUnit === "cellule" ? "cellules" : event.stageUnit === "mission" ? "missions" : event.stageUnit === "section" ? "sections" : "étages") + " recensés"
        : count ? count + " étapes recensées" : "Guide en cours d'enrichissement";
      content.append(el("small", "", info));
      button.append(content);
      button.addEventListener("click", () => {
        state.selected = event.id;
        const url = new URL(location.href);
        url.searchParams.set("guide", event.id);
        history.replaceState(null, "", url.pathname + url.search + url.hash);
        renderDirectory();
        renderDetail();
        ui.detail.scrollIntoView({ block: "start", behavior: "auto" });
      });
      ui.list.append(button);
    }
  }


  // Une version = une composition + ses instructions. Ne jamais fusionner deux versions.
  const KIND_LABELS = {
    walkthrough: "Fiche de combat antérieure",
    recommendation: "Recommandation, pas une victoire attestée",
    historical_playthrough: "Parcours historique",
    multi_attempt: "Combat en plusieurs attaques",
    player_report_unverified: "Composition rapportée, non vérifiée",
    reconstructed: "Reconstitution éditoriale",
    unspecified: "Type de stratégie à vérifier"
  };

  function strategyStatus(strategy) {
    if (strategy.provenance?.status === "catalog_match_unverified") {
      return "Correspondance éditoriale trouvée — combat non revérifié";
    }
    return "Origine exacte non établie";
  }

  function strategyBody(strategy) {
    const body = el("div", "challenge-strategy-body");
    const meta = el("p", "challenge-guide-verification",
      (KIND_LABELS[strategy.kind] || "Type à vérifier") + " · " + strategyStatus(strategy));
    body.append(meta);
    if (strategy.difficulty) body.append(el("p", "challenge-guide-meta", "Difficulté annoncée : " + strategy.difficulty));
    if (strategy.teamName) body.append(el("p", "challenge-team-name", strategy.teamName));

    if (strategy.characters.length) {
      body.append(el("h4", "", strategy.characters.length === 5 ? "Composition héritée" : "Personnages identifiés (composition incomplète)"));
      const team = el("div", "challenge-team");
      for (const id of strategy.characters) team.append(makeHero(id));
      body.append(team);
    } else {
      body.append(el("p", "challenge-section-note", "Aucune composition confirmée dans cette version."));
    }
    if (strategy.additionalCharacters?.length) {
      body.append(el("h4", "", "Renforts cités, remplacement non établi"));
      const group = el("div", "challenge-alternatives");
      for (const id of strategy.additionalCharacters) group.append(makeHero(id));
      body.append(group);
    }
    if (strategy.alternatives?.length) {
      body.append(el("h4", "", "Personnages supplémentaires évoqués dans cette version"));
      const group = el("div", "challenge-alternatives");
      for (const id of strategy.alternatives) group.append(makeHero(id));
      body.append(group);
    }
    if (strategy.instructions?.length) {
      body.append(el("h4", "", "Instructions de cette version — à contrôler"));
      const list = el("ul", "challenge-advice");
      for (const tip of strategy.instructions) list.append(el("li", "", tip));
      body.append(list);
    } else {
      body.append(el("p", "challenge-roster-note", "Aucun enchaînement tactique confirmé pour cette composition."));
    }
    if (strategy.notes?.length) {
      body.append(el("h4", "", "Précisions sur cette version"));
      const list = el("ul", "challenge-advice");
      for (const note of strategy.notes) list.append(el("li", "", note));
      body.append(list);
    }
    if (strategy.review?.flags?.includes("expanded_using_current_losp_team_members")) {
      body.append(el("p", "challenge-guide-verification",
        "Attention : certains membres ont été complétés depuis le catalogue LoSP, pas confirmés individuellement par la source."));
    }
    if (strategy.review?.flags?.includes("three_versus_five_team_size_conflict")) {
      body.append(el("p", "challenge-guide-verification",
        "La source présente des restrictions contradictoires sur la taille de l'équipe."));
    }
    return body;
  }

  function renderStrategy(strategy, index, count) {
    const multiple = count > 1;
    const container = el(multiple ? "details" : "section",
      multiple ? "challenge-strategy-variant" : "challenge-strategy-single");
    if (multiple) {
      container.open = index === 0;
      const summary = el("summary");
      const label = el("span", "challenge-strategy-title");
      label.append(el("strong", "", "Version " + (index + 1) + " — " + (strategy.teamName || strategy.label)));
      label.append(el("small", "", strategyStatus(strategy)));
      summary.append(label);
      container.append(summary);
    } else {
      container.append(el("h4", "challenge-strategy-single-title", "Version actuelle — origine à vérifier"));
    }
    container.append(strategyBody(strategy));
    return container;
  }

  function renderStage(event, stage, index) {
    const key = event.id + ":" + stage.id;
    const versions = state.strategies.get(key) || [];
    const hasContent = versions.length > 0;
    const details = el("details", "challenge-stage");
    details.id = "challenge-node-" + event.id + "-" + stage.id;
    details.open = index === 0;
    const summary = el("summary");
    const heading = el("span", "challenge-stage-title");
    heading.append(el("strong", "", stage.title));
    heading.append(el("small", "", stage.requirement || "Restrictions à préciser"));
    summary.append(heading);
    if (!hasContent) summary.append(el("span", "challenge-pill challenge-pill--pending", "À compléter"));
    else {
      if (versions.length > 1) summary.append(el("span", "challenge-versions-count", versions.length + " versions"));
      if (state.progress[key]) summary.append(el("span", "challenge-pill", "✓ Terminé"));
    }
    details.append(summary);
    const body = el("div", "challenge-stage-body");
    if (!hasContent) {
      body.append(el("p", "challenge-section-note", "Aucune stratégie documentée pour cette étape."));
    } else {
      body.append(el("p", "challenge-source-warning",
        "Ces versions proviennent de fiches antérieures non encore réauditées. Les conseils d'une version ne sont pas combinés avec ceux d'une autre."));
      const variants = el("div", "challenge-strategies");
      versions.forEach((strategy, i) => variants.append(renderStrategy(strategy, i, versions.length)));
      body.append(variants);
      const row = el("label", "challenge-check-row");
      const checkbox = el("input", "challenge-check");
      checkbox.type = "checkbox";
      checkbox.checked = !!state.progress[key];
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) state.progress[key] = true;
        else delete state.progress[key];
        saveProgress();
        // Conserver les marqueurs de versions et retirer uniquement l'ancien état Terminé.
        for (const pill of Array.from(summary.querySelectorAll(".challenge-pill"))) pill.remove();
        if (checkbox.checked) summary.append(el("span", "challenge-pill", "✓ Terminé"));
        const total = ui.detail.querySelector("[data-challenge-progress]");
        if (total) total.textContent = completedCount(event) + " / " + event.stages.length + " terminées";
      });
      row.append(checkbox, el("span", "", "Marquer cette étape comme terminée (sur cet appareil)"));
      body.append(row);
    }
    details.append(body);
    return details;
  }

  function renderDetail() {
    clear(ui.detail);
    const event = state.events.find(item => item.id === state.selected);
    if (!event) {
      ui.detail.hidden = true;
      return;
    }
    ui.detail.hidden = false;
    const head = el("div", "challenge-detail-head");
    head.append(makeAvatar(event.rewardId, "🏆"));
    const text = el("div");
    text.append(el("h2", "", event.title), el("p", "", event.summary));
    head.append(text);
    ui.detail.append(head);

    const tags = el("div", "challenge-pills");
    tags.append(el("span", "challenge-pill", CATEGORIES[event.type]?.label || "Challenge"));
    if (event.stages.length) {
      const progressLabel = el("span", "challenge-pill", completedCount(event) + " / " + event.stages.length + " terminées");
      progressLabel.setAttribute("data-challenge-progress", "");
      tags.append(progressLabel);
    }

    ui.detail.append(tags);
    if (event.guideNote) ui.detail.append(el("p", "challenge-guide-note", "Note générale héritée (à contrôler) : " + event.guideNote));

    const stages = displayStages(event);
    if (Number.isInteger(event.totalStages) && event.totalStages > 0 && event.stages.length < event.totalStages) {
      ui.detail.append(el("p", "challenge-section-note", event.stages.length + " / " + event.totalStages + " étapes recensées. Les suivantes sont en attente de stratégies."));
    }

    if (stages.length) {
      const jumpBar = el("div", "challenge-jump-bar");
      const jumpText = event.type === "dark-dimension"
        ? "Aller directement à un nœud / une section"
        : event.stageUnit === "section"
          ? "Aller directement à une section"
          : event.type === "trial" || event.stageUnit === "mission"
            ? "Aller directement à une mission"
          : event.stageUnit === "cellule"
            ? "Aller directement à une cellule"
            : "Aller directement à un étage";
      const label = el("label", "challenge-search-label", jumpText);
      label.htmlFor = "challengeJump";
      const jump = el("select", "challenge-jump");
      jump.id = "challengeJump";
      const placeholder = el("option", "", "Choisir une étape…");
      placeholder.value = "";
      jump.append(placeholder);
      for (const stage of stages) {
        const option = el("option", "", stage.title + (!(state.strategies.get(event.id + ":" + stage.id) || []).length ? " — à compléter" : ""));
        option.value = stage.id;
        jump.append(option);
      }
      jump.addEventListener("change", () => {
        if (!jump.value) return;
        const target = document.getElementById("challenge-node-" + event.id + "-" + jump.value);
        if (target) {
          target.open = true;
          target.scrollIntoView({ block: "start", behavior: "auto" });
        }
        jump.value = "";
      });
      jumpBar.append(label, jump);
      ui.detail.append(jumpBar);
      ui.detail.append(el("h3", "challenge-section-heading", event.type === "dark-dimension" ? "Nœuds et équipes" : event.type === "trial" ? "Missions et équipes" : "Étages, cellules et équipes"));
      stages.forEach((stage, index) => ui.detail.append(renderStage(event, stage, index)));
    } else {
      ui.detail.append(el("p", "challenge-section-note", "Ce challenge est déjà répertorié. Les compositions et instructions seront intégrées au fur et à mesure de leur disponibilité."));
    }
  }

  async function init() {
    try {
      const [guides, characters, strategyIndex] = await Promise.all([
        loadJson(PATHS.guides),
        loadJson(PATHS.characters),
        loadJson(PATHS.strategies),
      ]);
      if (!Array.isArray(guides.events) || !Array.isArray(characters)) {
        throw new Error("Format des données inattendu");
      }
      state.events = guides.events.filter(item => item && item.id && item.title);
      if (!Array.isArray(strategyIndex.strategies) || strategyIndex.schemaVersion !== 1) {
        throw new Error("Catalogue des versions de stratégies invalide");
      }
      const knownEvents = new Map(state.events.map(item => [item.id, item]));
      const seen = new Set();
      for (const strategy of strategyIndex.strategies) {
        const event = knownEvents.get(strategy.eventId);
        if (!event || !event.stages.some(s => String(s.id) === String(strategy.stageId)) ||
            !strategy.id || seen.has(strategy.id) ||
            !Array.isArray(strategy.characters) || !Array.isArray(strategy.instructions)) {
          throw new Error("Version de stratégie incohérente : " + (strategy?.id || "sans ID"));
        }
        seen.add(strategy.id);
        const key = strategy.eventId + ":" + strategy.stageId;
        if (!state.strategies.has(key)) state.strategies.set(key, []);
        state.strategies.get(key).push(strategy);
      }
      // Jamais d'unité PVE / invocation comme portrait suggéré.
      for (const character of characters) {
        if (character?.id && character.player_Character === true) {
          state.characters.set(character.id, character);
        }
      }
      const categoryInfo = CATEGORIES[state.category];
      if (!categoryInfo) {
        location.replace("./challenges.html");
        return;
      }
      document.title = "LoSP — " + categoryInfo.label;
      document.getElementById("challengeCategoryTitle").textContent = categoryInfo.label;
      document.getElementById("challengeCategoryDescription").textContent = categoryInfo.description;
      // Un lien direct vers un guide n'est accepté que dans sa propre catégorie.
      if (!state.events.some(event => event.id === state.selected && event.type === state.category)) state.selected = "";
      renderDirectory();
      renderDetail();
    } catch (error) {
      console.error("Challenges LoSP :", error);
      ui.count.textContent = "Impossible de charger les guides.";
      ui.empty.hidden = false;
      ui.empty.textContent = "Les données ne sont pas disponibles pour le moment. Réessaie avec une connexion réseau.";
    }
  }

  ui.search.addEventListener("input", () => {
    state.query = ui.search.value;
    renderDirectory();
  });
  init();
})();
