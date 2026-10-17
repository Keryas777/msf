/* LoSP — Challenges : données statiques + portraits officiels, sans dépendance externe. */
(() => {
  "use strict";

  const PATHS = {
    guides: "./data/challenges.json",
    characters: "./data/msf-characters.json",
    guideSources: "./data/challenge-guide-sources.json",
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
    sources: [],
    difficulty: "all",
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
    const unit = event.stageUnit === "cellule" ? "Cellule" : "Étage";
    const result = [];
    for (let index = 1; index <= total; index += 1) {
      const id = String(index);
      result.push(indexed.get(id) || {
        id, title: unit + " " + id, requirement: "Informations à compléter",
        characters: [], alternatives: [], advice: [], pending: true
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
        ? count + " / " + total + " " + (event.stageUnit === "cellule" ? "cellules" : "étages") + " documentés"
        : count ? count + " étapes documentées" : "Guide en cours d'enrichissement";
      content.append(el("small", "", info));
      button.append(content);
      button.addEventListener("click", () => {
        state.selected = event.id;
        state.difficulty = "all";
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


  const VISIBLE_SOURCE_STATES = new Set(["content_checked", "page_checked", "indexed_content"]);
  const GUIDE_FORMATS = { article:"Guide écrit", walkthrough:"Parcours commenté", player_report:"Retour de combat", community_collection:"Solutions communautaires" };
  const GUIDE_EVIDENCE = { walkthrough:"Stratégie détaillée", reported_clear:"Victoire rapportée", historical_playthrough:"Parcours historique", unverified_player_submission:"Solutions non certifiées", recommendation:"Recommandations", guide:"Guide" };

  function relevantSources(event, stage) {
    return state.sources.filter(source => {
      if (source.eventId !== event.id || !VISIBLE_SOURCE_STATES.has(source.verificationStatus)) return false;
      if (state.difficulty !== "all" && source.difficulty && source.difficulty !== state.difficulty) return false;
      const scoped = [...(source.stageIds || []), ...(source.sectionIds || [])].map(String);
      return stage ? scoped.includes(String(stage.id)) : scoped.length === 0;
    });
  }

  function buildGuideGroup(sources, label) {
    if (!sources.length) return null;
    const section = el("section", "challenge-guide-section");
    section.append(el("h4", "", label));
    const list = el("div", "challenge-guide-list");
    for (const source of sources) {
      const a = el("a", "challenge-guide-link");
      a.href = source.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.append(el("span", "challenge-guide-title", source.title + " ↗"));
      const parts = [
        source.author || "Auteur inconnu",
        (source.language || "").toUpperCase(),
        GUIDE_FORMATS[source.format] || "Guide",
        source.difficulty ? "Difficulté : " + source.difficulty : "",
        source.publishedAt ? "Publié : " + source.publishedAt : ""
      ];
      a.append(el("span", "challenge-guide-meta", parts.filter(Boolean).join(" · ")));
      a.append(el("span", "challenge-guide-proof", GUIDE_EVIDENCE[source.evidenceLevel] || "Guide"));
      if (source.verificationStatus === "indexed_content") {
        a.append(el("span", "challenge-guide-verification", "Contenu indexé, lien non testé directement"));
      } else if (source.verificationStatus === "page_checked") {
        a.append(el("span", "challenge-guide-verification", "Contributions individuelles non vérifiées"));
      }
      list.append(a);
    }
    section.append(list);
    return section;
  }

  function renderStage(event, stage, index) {
    const key = event.id + ":" + stage.id;
    const details = el("details", "challenge-stage");
    details.id = "challenge-node-" + event.id + "-" + stage.id;
    details.open = index === 0;
    const summary = el("summary");
    const heading = el("span", "challenge-stage-title");
    heading.append(el("strong", "", stage.title));
    heading.append(el("small", "", stage.requirement || "Aucune restriction indiquée"));
    summary.append(heading);
    if (stage.pending) summary.append(el("span", "challenge-pill challenge-pill--pending", "À compléter"));
    else if (state.progress[key]) summary.append(el("span", "challenge-pill", "✓ Terminé"));
    details.append(summary);

    const body = el("div", "challenge-stage-body");
    if (stage.teamName) body.append(el("p", "challenge-team-name", stage.teamName));
    if (stage.characters.length) {
      const label = stage.compositionKind === "partial"
        ? "Personnages explicitement cités"
        : stage.compositionKind === "base_with_options"
          ? "Formation de base"
          : "Équipe conseillée";
      body.append(el("h4", "", label));
      const team = el("div", "challenge-team");
      for (const id of stage.characters) team.append(makeHero(id));
      body.append(team);
      if (stage.compositionKind === "partial") {
        body.append(el("p", "challenge-roster-note", "Tous les emplacements ne sont pas précisés : aucun membre manquant n'a été inventé."));
      }
    } else {
      body.append(el("p", "challenge-section-note", "Composition non renseignée pour le moment. Ce challenge sera enrichi progressivement."));
    }
    if (stage.additionalCharacters?.length) {
      body.append(el("h4", "", "Renfort cité (prévoir un remplacement)"));
      const additions = el("div", "challenge-alternatives");
      for (const id of stage.additionalCharacters) additions.append(makeHero(id));
      body.append(additions);
    }

    if (stage.alternatives?.length) {
      body.append(el("h4", "", "Autres personnages proposés"));
      const group = el("div", "challenge-alternatives");
      for (const id of stage.alternatives) group.append(makeHero(id));
      body.append(group);
    }
    if (stage.advice?.length) {
      body.append(el("h4", "", "Conseils pratiques"));
      const list = el("ul", "challenge-advice");
      for (const tip of stage.advice) list.append(el("li", "", tip));
      body.append(list);
    }

    const otherSolutions = buildGuideGroup(relevantSources(event, stage), "Autres guides pour cette étape");
    if (otherSolutions) body.append(otherSolutions);

    if (!stage.pending) {
    const line = el("label", "challenge-check-row");
      const check = el("input", "challenge-check");
      check.type = "checkbox";
      check.checked = !!state.progress[key];
      check.addEventListener("change", () => {
        if (check.checked) state.progress[key] = true;
        else delete state.progress[key];
        saveProgress();
        summary.querySelector(".challenge-pill")?.remove();
        if (check.checked) summary.append(el("span", "challenge-pill", "✓ Terminé"));
        const total = ui.detail.querySelector("[data-challenge-progress]");
        if (total) total.textContent = completedCount(event) + " / " + event.stages.length + " terminées";
      });
      line.append(check, el("span", "", "Marquer cette étape comme terminée (sur cet appareil)"));
      body.append(line);
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
    const available = state.sources.filter(source => source.eventId === event.id && VISIBLE_SOURCE_STATES.has(source.verificationStatus));
    if (available.length) {
      const guideDifficulties = [...new Set(available.map(source => source.difficulty).filter(Boolean))];
      if (guideDifficulties.length > 1) {
        const selectRow = el("div", "challenge-guide-filter");
        const label = el("label", "challenge-search-label", "Difficulté des guides");
        label.htmlFor = "challengeGuideDifficulty";
        const select = el("select", "challenge-jump");
        select.id = "challengeGuideDifficulty";
        for (const value of ["all", ...guideDifficulties]) {
          const option = el("option", "", value === "all" ? "Toutes les difficultés" : value);
          option.value = value;
          select.append(option);
        }
        select.value = state.difficulty;
        select.addEventListener("change", () => {
          state.difficulty = select.value;
          renderDetail();
        });
        selectRow.append(label, select);
        ui.detail.append(selectRow);
      }
      const generalGuides = buildGuideGroup(relevantSources(event, null), "Guides généraux et collections");
      if (generalGuides) ui.detail.append(generalGuides);
      const matchedStages = available.filter(source => (source.stageIds || []).length || (source.sectionIds || []).length);
      if (matchedStages.length) {
        ui.detail.append(el("p", "challenge-sources-hint", matchedStages.length + " guide(s) associé(s) à des étapes précises : ouvre une fiche pour les consulter."));
      }
      ui.detail.append(el("p", "challenge-sources-hint", "Les retours de joueurs et les compositions communautaires ne garantissent pas la victoire."));
    }
    if (event.guideNote) ui.detail.append(el("p", "challenge-guide-note", event.guideNote));

    const stages = displayStages(event);
    if (Number.isInteger(event.totalStages) && event.totalStages > 0 && event.stages.length < event.totalStages) {
      ui.detail.append(el("p", "challenge-section-note", event.stages.length + " / " + event.totalStages + " étapes documentées. Les suivantes sont affichées en attente de conseils."));
    }

    if (stages.length) {
      const jumpBar = el("div", "challenge-jump-bar");
      const jumpText = event.type === "dark-dimension"
        ? "Aller directement à un nœud / une section"
        : event.type === "trial"
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
        const option = el("option", "", stage.title + (stage.pending ? " — à compléter" : ""));
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
      const [guides, characters, sourceIndex] = await Promise.all([
        loadJson(PATHS.guides),
        loadJson(PATHS.characters),
        loadJson(PATHS.guideSources).catch(() => ({ sources: [] })),
      ]);
      if (!Array.isArray(guides.events) || !Array.isArray(characters)) {
        throw new Error("Format des données inattendu");
      }
      state.events = guides.events.filter(item => item && item.id && item.title);
      const knownEvents = new Set(state.events.map(item => item.id));
      state.sources = (Array.isArray(sourceIndex.sources) ? sourceIndex.sources : [])
        .filter(source => source && knownEvents.has(source.eventId) && typeof source.url === "string" && source.url.startsWith("https://"));
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
