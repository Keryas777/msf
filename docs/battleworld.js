// Guide Battleworld LoSP : seule source éditoriale = docs/data/battleworld/*.json
(() => {
  "use strict";

  const select = document.getElementById("bw-guide-select");
  const title = document.getElementById("bw-guide-title");
  const status = document.getElementById("bw-guide-status");
  const meta = document.getElementById("bw-guide-meta");
  const content = document.getElementById("bw-content");
  const errorBox = document.getElementById("bw-error");
  const tabBar = document.querySelector(".bw-tabs");
  const tabs = Array.from(document.querySelectorAll(".bw-tab"));
  const bossPortrait = document.getElementById("bw-boss-portrait");
  const bossPortraitFallback = document.getElementById("bw-boss-portrait-fallback");

  let index = null;
  let guide = null;
  let selectedEntry = null;
  let activeTab = "zone-1";
  let charMap = null;
  let charMapPromise = null;
  const failedPortraitUrls = new Set();
  let serial = 0;

  function el(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined && value !== null) node.textContent = String(value);
    return node;
  }

  function validList(value) {
    return Array.isArray(value) ? value.filter(item => typeof item === "string" && item.trim()) : [];
  }

  function clear(node) {
    node.replaceChildren();
  }

  async function readJson(path) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    return response.json();
  }

  function loading(message) {
    clear(content);
    content.setAttribute("aria-busy", "true");
    content.append(el("section", "card bw-empty", message));
    errorBox.hidden = true;
  }

  function failure(message, retry) {
    clear(content);
    content.removeAttribute("aria-busy");
    content.append(el("section", "card bw-empty", "Les données ne sont pas disponibles pour le moment."));
    errorBox.hidden = false;
    clear(errorBox);
    errorBox.append(el("span", "", message));
    const button = el("button", "bw-retry", "Réessayer");
    button.type = "button";
    button.addEventListener("click", retry);
    errorBox.append(button);
  }

  function sectionList(parent, label, values, ordered) {
    const rows = validList(values);
    if (!rows.length) return false;
    const section = el("section", "bw-section");
    section.append(el("h3", "", label));
    const list = el(ordered ? "ol" : "ul");
    rows.forEach(value => list.append(el("li", "", value)));
    section.append(list);
    parent.append(section);
    return true;
  }

  function sourcesSection(parent, items) {
    if (!Array.isArray(items)) return false;
    const safe = items.filter(item => {
      if (!item || typeof item.url !== "string") return false;
      try {
        const url = new URL(item.url);
        return url.protocol === "https:";
      } catch (_error) {
        return false;
      }
    });
    if (!safe.length) return false;
    const section = el("section", "bw-section");
    section.append(el("h3", "", "Sources"));
    const list = el("ul");
    safe.forEach(item => {
      const li = el("li");
      const link = el("a", "bw-link", item.label || item.url);
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      li.append(link);
      list.append(li);
    });
    section.append(list);
    parent.append(section);
    return true;
  }

  function characterCard(id) {
    const entry = charMap && charMap.get(id.toLowerCase());
    const label = (entry && (entry.nameFr || entry.nameKey || entry.nameEn)) || id;
    const box = el("div", "bw-character");
    if (entry && typeof entry.portraitUrl === "string" && entry.portraitUrl.startsWith("https://")) {
      const image = el("img");
      image.src = entry.portraitUrl;
      image.alt = label;
      image.loading = "lazy";
      image.decoding = "async";
      box.append(image);
    } else {
      box.append(el("span", "bw-character-icon", "✦"));
    }
    box.append(el("span", "", label));
    return box;
  }

  function teamsSection(parent, teams) {
    if (!Array.isArray(teams)) return false;
    const rows = teams.filter(team => team && typeof team.title === "string" && team.title.trim());
    if (!rows.length) return false;

    const section = el("section", "bw-section");
    section.append(el("h3", "", "Équipes recommandées"));
    const list = el("div", "bw-teams");

    rows.forEach(team => {
      const card = el("article", "bw-team");
      card.append(el("h4", "", team.title));
      if (team.phase) card.append(el("p", "bw-team-phase", team.phase));
      const members = validList(team.characters);
      if (members.length) {
        const portraits = el("div", "bw-characters");
        members.forEach(id => portraits.append(characterCard(id)));
        card.append(portraits);
      }
      sectionList(card, "Conditions / prérequis", team.requirements);
      sectionList(card, "Déroulement du combat", team.steps, true);
      sectionList(card, "Alternatives", team.alternatives);
      sectionList(card, "Notes", team.notes);
      sourcesSection(card, team.sources);
      list.append(card);
    });
    section.append(list);
    parent.append(section);
    return true;
  }

  function renderFields(parent, item) {
    if (!item || typeof item !== "object") return false;
    let found = false;
    [
      ["restrictions", "Restrictions"],
      ["enemies", "Ennemis"],
      ["mechanics", "Mécaniques"],
      ["objectives", "Objectifs"],
      ["strategy", "Stratégie"],
      ["avoid", "À éviter"],
      ["instructions", "Instructions de combat"]
    ].forEach(([field, label]) => {
      found = sectionList(parent, label, item[field], field === "instructions") || found;
    });
    found = teamsSection(parent, item.teams) || found;
    found = sourcesSection(parent, item.sources) || found;
    return found;
  }


  // Les boss disposent d'un ID PVE exact dans les JSON, indépendant des personnages jouables.
  // On charge le catalogue une seule fois pour les portraits des boss et des équipes.
  function loadCharacterCatalog() {
    if (!charMapPromise) {
      charMapPromise = readJson("./data/msf-characters.json").then(rows => {
        if (!Array.isArray(rows)) throw new Error("Catalogue personnages invalide");
        charMap = new Map(
          rows.filter(row => row && typeof row.id === "string")
            .map(row => [row.id.toLowerCase(), row])
        );
        return charMap;
      }).catch(error => {
        charMapPromise = null; // Permet de réessayer au prochain changement de boss.
        throw error;
      });
    }
    return charMapPromise;
  }

  function validHttpsImage(url) {
    if (typeof url !== "string") return false;
    try {
      return new URL(url).protocol === "https:";
    } catch (_error) {
      return false;
    }
  }

  function renderBossPortrait() {
    const boss = guide && guide.boss;
    const characterId = String((boss && boss.characterId) || "").trim().toLowerCase();
    const character = characterId && charMap ? charMap.get(characterId) : null;
    const overrideUrl = boss && boss.portraitUrl;
    const url = validHttpsImage(overrideUrl)
      ? overrideUrl
      : (character && validHttpsImage(character.portraitUrl) ? character.portraitUrl : "");

    if (!url || failedPortraitUrls.has(url)) {
      bossPortrait.hidden = true;
      bossPortraitFallback.hidden = false;
      bossPortrait.removeAttribute("src");
      return;
    }

    bossPortrait.alt = "Portrait de " + ((boss && boss.name) || selectedEntry.name);
    bossPortrait.onerror = () => {
      failedPortraitUrls.add(url);
      if (bossPortrait.getAttribute("src") === url) {
        bossPortrait.hidden = true;
        bossPortraitFallback.hidden = false;
      }
    };
    if (bossPortrait.getAttribute("src") !== url) bossPortrait.src = url;
    bossPortrait.hidden = false;
    bossPortraitFallback.hidden = true;
  }

  function renderZone() {
    const zone = (guide.zones || []).find(value => value && value.id === activeTab);
    if (!zone) {
      content.append(el("section", "card bw-empty", "Cette zone n'est pas encore configurée."));
      return;
    }
    const intro = el("section", "card bw-intro");
    intro.append(el("h2", "", zone.title || "Zone"));
    intro.append(el("p", "", "Sélectionne un node pour consulter les restrictions, les équipes et les consignes."));
    content.append(intro);

    zone.nodes.forEach((node, i) => {
      const details = el("details", "bw-node");
      if (i === 0) details.open = true;
      const summary = el("summary");
      const name = el("span", "bw-node-title");
      name.append(el("strong", "", node.title || "Node " + (i + 1)));
      const indicator = validList(node.strategy).length || validList(node.instructions).length ||
        validList(node.mechanics).length || (Array.isArray(node.teams) && node.teams.length)
        ? "Guide en cours de rédaction" : "À compléter";
      name.append(el("small", "", indicator));
      summary.append(name);
      details.append(summary);
      const body = el("div", "bw-node-body");
      if (!renderFields(body, node)) {
        body.append(el("p", "bw-note", "Aucune stratégie renseignée pour ce node."));
      }
      details.append(body);
      content.append(details);
    });
  }

  function renderBoss() {
    const intro = el("section", "card bw-intro");
    intro.append(el("h2", "", "Boss — " + (guide.boss.name || selectedEntry.name)));
    intro.append(el("p", "", "Mécaniques, erreurs à éviter, compositions conseillées et déroulement du combat."));
    content.append(intro);
    const card = el("section", "card");
    if (!renderFields(card, guide.boss)) {
      card.append(el("p", "bw-empty", "Les stratégies contre ce boss sont à compléter. Aucune équipe n'est encore validée dans ce guide."));
    }
    content.append(card);
  }

  function render() {
    if (!guide || !selectedEntry || !index) return;
    // Sans zones dans le JSON, le guide historique est exclusivement consacré au boss.
    const hasZones = Array.isArray(guide.zones) && guide.zones.length === 3;
    if (!hasZones) activeTab = "boss";
    tabBar.hidden = !hasZones;
    clear(content);
    content.removeAttribute("aria-busy");
    title.textContent = selectedEntry.name;
    renderBossPortrait();
    const current = selectedEntry.id === index.activeGuideId;
    status.textContent = current ? "Boss actuel" : "Archives";
    const details = [];
    details.push(guide.status === "draft" ? "Guide en préparation" : "Guide publié");
    if (guide.patch) details.push("Patch " + guide.patch);
    if (guide.lastVerified) details.push("Vérifié le " + guide.lastVerified);
    meta.textContent = details.join(" · ") + (current ? "" : " · Ancien boss");
    tabs.forEach(tab => {
      const active = tab.dataset.tab === activeTab;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
      tab.tabIndex = active ? 0 : -1;
    });
    if (activeTab === "boss") renderBoss();
    else renderZone();
  }

  async function loadGuide(id) {
    const entry = index && index.guides.find(item => item.id === id);
    if (!entry || !/^[a-z0-9-]+\.json$/.test(entry.file)) {
      failure("Guide inconnu ou chemin de données invalide.", () => loadIndex());
      return;
    }
    const requestId = ++serial;
    select.value = entry.id;
    guide = null;
    selectedEntry = entry;
    bossPortrait.hidden = true;
    bossPortraitFallback.hidden = false;
    tabBar.hidden = true;
    loading("Ouverture du guide " + entry.name + "…");
    try {
      const data = await readJson("./data/battleworld/" + entry.file);
      if (serial !== requestId) return;
      const validZones = !Object.prototype.hasOwnProperty.call(data, "zones") ||
        (Array.isArray(data.zones) && data.zones.length === 3 &&
         data.zones.every((zone, i) =>
           zone.id === "zone-" + (i + 1) &&
           Array.isArray(zone.nodes) && zone.nodes.length === 3));
      if (data.id !== entry.id || !validZones ||
          !data.boss || typeof data.boss !== "object") {
        throw new Error("Structure des zones ou du boss invalide");
      }
      guide = data;
      render();
      try {
        await loadCharacterCatalog();
        if (serial !== requestId) return;
        render(); // Le portrait du boss est désormais disponible même sans équipe renseignée.
      } catch (err) {
        console.warn("Portraits Battleworld indisponibles", err);
      }
    } catch (err) {
      if (serial !== requestId) return;
      console.error("Chargement Battleworld", err);
      failure("Impossible de charger le guide : " + err.message, () => loadGuide(entry.id));
    }
  }

  async function loadIndex() {
    loading("Chargement du catalogue des boss…");
    try {
      const data = await readJson("./data/battleworld/index.json");
      if (!Array.isArray(data.guides) || !data.guides.length ||
          !data.guides.some(entry => entry.id === data.activeGuideId)) {
        throw new Error("Index Battleworld invalide");
      }
      index = data;
      clear(select);
      data.guides.forEach(entry => {
        const option = el("option", "", entry.name + (entry.id === data.activeGuideId ? " — Actuel" : ""));
        option.value = entry.id;
        select.append(option);
      });
      select.disabled = false;
      await loadGuide(data.activeGuideId);
    } catch (err) {
      console.error("Index Battleworld", err);
      failure("Impossible de charger la liste des boss : " + err.message, loadIndex);
    }
  }

  select.addEventListener("change", () => {
    activeTab = "zone-1";
    loadGuide(select.value);
  });

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      activeTab = tab.dataset.tab;
      if (guide) render();
    });
    tab.addEventListener("keydown", event => {
      if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      let next = tabs.indexOf(tab);
      if (event.key === "ArrowRight") next = (next + 1) % tabs.length;
      if (event.key === "ArrowLeft") next = (next + tabs.length - 1) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      tabs[next].focus();
      tabs[next].click();
    });
  });

  loadIndex();
})();
