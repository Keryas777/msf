/* LoSP — Challenges : données statiques + portraits officiels, sans dépendance externe. */
(() => {
  "use strict";

  const PATHS = {
    guides: "./data/challenges.json",
    characters: "./data/msf-characters.json",
  };
  const STORAGE_KEY = "losp_challenges_progress_v1";
  const CATEGORIES = [
    { id: "all", label: "Tous" },
    { id: "tower", label: "🏰 Tours" },
    { id: "trial", label: "⚔️ Trials / Breakers" },
    { id: "dark-dimension", label: "🌌 Dimension noire" },
  ];

  const ui = {
    tabs: document.getElementById("challengeTabs"),
    search: document.getElementById("challengeSearch"),
    list: document.getElementById("challengeList"),
    empty: document.getElementById("challengeEmpty"),
    count: document.getElementById("challengeCount"),
    detail: document.getElementById("challengeDetail"),
    credit: document.getElementById("challengesCredit"),
  };
  const state = {
    category: "all",
    query: "",
    selected: new URLSearchParams(location.search).get("guide") || "",
    events: [],
    characters: new Map(),
    progress: readProgress(),
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
    holder.textContent = fallback || "★";

    // On reprend exclusivement les portraits du catalogue officiel déjà présent chez LoSP.
    if (url && /^https:\/\/assets\.marvelstrikeforce\.com\/imgs\//.test(url)) {
      const img = el("img");
      img.src = url;
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      img.onerror = () => { img.remove(); };
      holder.append(img);
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

  function renderTabs() {
    clear(ui.tabs);
    for (const category of CATEGORIES) {
      const button = el("button", "challenge-tab", category.label);
      button.type = "button";
      button.setAttribute("aria-pressed", String(state.category === category.id));
      button.addEventListener("click", () => {
        state.category = category.id;
        renderTabs();
        renderDirectory();
      });
      ui.tabs.append(button);
    }
  }

  function matchingEvents() {
    return state.events.filter(event => {
      if (state.category !== "all" && event.type !== state.category) return false;
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
      content.append(el("small", "", count ? count + " missions / sections détaillées" : "Référence à enrichir"));
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

  function renderStage(event, stage, index) {
    const key = event.id + ":" + stage.id;
    const details = el("details", "challenge-stage");
    details.open = index === 0;
    const summary = el("summary");
    const heading = el("span", "challenge-stage-title");
    heading.append(el("strong", "", stage.title));
    heading.append(el("small", "", stage.requirement || "Aucune restriction indiquée"));
    summary.append(heading);
    if (state.progress[key]) summary.append(el("span", "challenge-pill", "✓ Terminé"));
    details.append(summary);

    const body = el("div", "challenge-stage-body");
    if (stage.characters.length) {
      body.append(el("h4", "", "Équipe conseillée"));
      const team = el("div", "challenge-team");
      for (const id of stage.characters) team.append(makeHero(id));
      body.append(team);
    } else {
      body.append(el("p", "challenge-section-note", "Composition encore à documenter : consulter le guide d'origine."));
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
    });
    line.append(check, el("span", "", "Marquer cette étape comme terminée (sur cet appareil)"));
    body.append(line);
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
    tags.append(el("span", "challenge-pill", CATEGORIES.find(c => c.id === event.type)?.label || "Challenge"));
    if (event.stages.length) {
      tags.append(el("span", "challenge-pill", completedCount(event) + " / " + event.stages.length + " terminées"));
    }
    ui.detail.append(tags);

    if (typeof event.sourceUrl === "string" && event.sourceUrl.startsWith("https://www.marvel.church/")) {
      const link = el("a", "challenge-source", "Lire le guide original sur Marvel Church ↗");
      link.href = event.sourceUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      ui.detail.append(link);
    }
    if (event.stages.length) {
      ui.detail.append(el("h3", "challenge-section-heading", "Étages, missions et compositions"));
      event.stages.forEach((stage, index) => ui.detail.append(renderStage(event, stage, index)));
    } else {
      ui.detail.append(el("p", "challenge-section-note", "Ce guide est référencé dans le catalogue. Les équipes détaillées et les tactiques en français n'ont pas encore été intégrées : utilise le lien source en attendant."));
    }
  }

  async function init() {
    try {
      const [guides, characters] = await Promise.all([
        loadJson(PATHS.guides),
        loadJson(PATHS.characters),
      ]);
      if (!Array.isArray(guides.events) || !Array.isArray(characters)) {
        throw new Error("Format des données inattendu");
      }
      state.events = guides.events.filter(item => item && item.id && item.title);
      // Jamais d'unité PVE / invocation comme portrait suggéré.
      for (const character of characters) {
        if (character?.id && character.player_Character === true) {
          state.characters.set(character.id, character);
        }
      }
      ui.credit.textContent = "Sélection LoSP · Sources : Marvel Church · Données éditées le " + (guides.updatedAt || "—") + ". Guides communautaires non officiels.";
      renderTabs();
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
