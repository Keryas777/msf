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
  const portraitState = { key: null, token: 0 };
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
      ["instructions", "Instructions de combat"],
      ["notes", "Précisions"],
      ["warnings", "Points à vérifier"]
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

  // Le catalogue peut référencer une image PVE non servie par le CDN.
  // Préserver sa priorité, puis essayer la version jouable du même personnage.
  function getBossPortraitCandidates(boss) {
    const urls = [];
    const seen = new Set();
    const addUrl = url => {
      if (!validHttpsImage(url) || seen.has(url)) return;
      seen.add(url);
      urls.push(url);
    };
    if (!boss) return urls;

    addUrl(boss.portraitUrl);
    const id = String(boss.characterId || "").trim();
    const ids = [
      id,
      ...(Array.isArray(boss.portraitFallbackCharacterIds) ? boss.portraitFallbackCharacterIds : []),
      id.startsWith("PVE_Boss_") ? id.slice("PVE_Boss_".length) : ""
    ];

    ids.forEach(candidateId => {
      const character = charMap && charMap.get(String(candidateId || "").trim().toLowerCase());
      if (character) addUrl(character.portraitUrl);
    });
    return urls;
  }

  function renderBossPortrait() {
    const boss = guide && guide.boss;
    const candidates = getBossPortraitCandidates(boss);
    const key = String(guide && guide.id) + "|" + candidates.join("|");
    if (portraitState.key === key) return; // Ne pas recharger sur un changement d'onglet.

    portraitState.key = key;
    const token = ++portraitState.token;
    bossPortrait.alt = "Portrait de " + ((boss && boss.name) || selectedEntry.name);

    let index = 0;
    const tryNext = () => {
      if (token !== portraitState.token) return;
      const url = candidates[index++];
      if (!url) {
        bossPortrait.onload = null;
        bossPortrait.onerror = null;
        bossPortrait.removeAttribute("src");
        bossPortrait.hidden = true;
        bossPortraitFallback.hidden = false;
        return;
      }

      bossPortrait.hidden = true;
      bossPortraitFallback.hidden = false;
      bossPortrait.onload = () => {
        if (token !== portraitState.token || bossPortrait.getAttribute("src") !== url) return;
        bossPortrait.hidden = false;
        bossPortraitFallback.hidden = true;
      };
      bossPortrait.onerror = () => {
        if (token === portraitState.token && bossPortrait.getAttribute("src") === url) {
          tryNext();
        }
      };
      bossPortrait.src = url;
    };
    tryNext();
  }

  function makeMissionDetails(item, open) {
    const details = el("details", "bw-node");
    details.open = Boolean(open);
    const summary = el("summary");
    const name = el("span", "bw-node-title");
    name.append(el("strong", "", item.title || item.id || "Mission"));
    const written = ["mechanics", "objectives", "strategy", "instructions"].some(field => validList(item[field]).length) ||
      (Array.isArray(item.teams) && item.teams.length > 0);
    name.append(el("small", "", written ? "Conseils et stratégie" : "À documenter"));
    summary.append(name);
    details.append(summary);
    const body = el("div", "bw-node-body");
    if (!renderFields(body, item)) {
      body.append(el("p", "bw-note", "Aucune information renseignée pour cette mission."));
    }
    details.append(body);
    return details;
  }

  function renderMissionGroup(label, items, note, openFirst) {
    if (!Array.isArray(items) || !items.length) return;
    const group = el("section", "bw-mission-group");
    const heading = el("h3", "bw-mission-heading", label + " (" + items.length + ")");
    group.append(heading);
    if (note) group.append(el("p", "bw-group-note", note));
    items.forEach((item, i) => group.append(makeMissionDetails(item, openFirst && i === 0)));
    content.append(group);
  }

  function renderOverview() {
    const overview = guide.overview;
    if (!overview) return;
    const details = el("details", "bw-node bw-overview");
    const summary = el("summary");
    const label = el("span", "bw-node-title");
    label.append(el("strong", "", overview.title || "Préparation générale"));
    label.append(el("small", "", "Déblocages, jetons, affaiblissements et récompenses"));
    summary.append(label);
    details.append(summary);
    const body = el("div", "bw-node-body");
    sectionList(body, "Présentation", overview.introduction);
    sectionList(body, "Déblocage des missions et clés Bonus", overview.progression, true);
    sectionList(body, "Jetons permanents", overview.tokens);
    if (Array.isArray(overview.eliteDebuffs)) {
      overview.eliteDebuffs.forEach(effect => sectionList(body, effect.title, effect.levels));
    }
    sectionList(body, "Récompenses", overview.rewards);
    sectionList(body, "Points à vérifier", overview.warnings);
    sourcesSection(body, overview.sources);
    details.append(body);
    content.append(details);
  }

  function renderZone() {
    const zone = (guide.zones || []).find(value => value && value.id === activeTab);
    if (!zone) {
      content.append(el("section", "card bw-empty", "Cette zone n'est pas encore configurée."));
      return;
    }
    const intro = el("section", "card bw-intro");
    intro.append(el("h2", "", zone.title || "Zone"));
    intro.append(el("p", "", "3 Standard · 1 mini-boss · 3 Élite · 2 Bonus"));
    validList(zone.notes).forEach(note => intro.append(el("p", "bw-zone-note", note)));
    content.append(intro);

    renderMissionGroup("Missions Standard", zone.nodes, "Débloquer le mini-boss en terminant les trois missions.", true);
    if (zone.miniboss) {
      renderMissionGroup("Mini-boss", [zone.miniboss], "Le vaincre débloque les missions Élite et donne une clé Bonus.", false);
    }
    renderMissionGroup("Missions Élite", zone.eliteMissions, "Chaque Élite terminée affaiblit le Destructeur au jour 4.", false);
    renderMissionGroup("Missions Bonus", zone.bonusMissions, "Donnent des jetons de renforcement permanents. Certaines nécessitent plusieurs clés.", false);
  }

  function renderBoss() {
    const intro = el("section", "card bw-intro");
    intro.append(el("h2", "", "Boss — " + (guide.boss.name || selectedEntry.name)));
    intro.append(el("p", "", "Mécaniques, Rage, compositions utilisées et déroulement du combat."));
    content.append(intro);

    const tactics = el("section", "card bw-boss-tactics");
    tactics.append(el("h3", "bw-section-title", "Objectifs et équipes"));
    sectionList(tactics, "Objectifs", guide.boss.objectives);
    sectionList(tactics, "Stratégie générale", guide.boss.strategy);
    sectionList(tactics, "Instructions", guide.boss.instructions, true);
    teamsSection(tactics, guide.boss.teams);
    content.append(tactics);

    // Les mécaniques et la préparation détaillées restent disponibles sans occuper
    // immédiatement tout l'écran d'un joueur qui cherche une composition.
    const details = el("details", "bw-node bw-boss-mechanics");
    const summary = el("summary");
    const label = el("span", "bw-node-title");
    label.append(el("strong", "", "Mécaniques complètes du Destructeur"));
    label.append(el("small", "", "Immunités, Rage, invocations, dégâts et restrictions"));
    summary.append(label);
    details.append(summary);
    const body = el("div", "bw-node-body");
    sectionList(body, "Traits", guide.boss.traits);
    if (guide.boss.baseSpeed != null) sectionList(body, "Vitesse de base", [String(guide.boss.baseSpeed)]);
    sectionList(body, "Invocations / ennemis", guide.boss.enemies);
    sectionList(body, "Capacités et passifs", guide.boss.mechanics);
    sectionList(body, "Erreurs à éviter", guide.boss.avoid);
    sectionList(body, "Précisions", guide.boss.notes);
    sectionList(body, "Points à vérifier", guide.boss.warnings);
    sourcesSection(body, guide.boss.sources);
    details.append(body);
    content.append(details);
    renderOverview();
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
    portraitState.key = null;
    portraitState.token++;
    bossPortrait.onload = null;
    bossPortrait.onerror = null;
    bossPortrait.removeAttribute("src");
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
      const validMissionGroups = !Array.isArray(data.zones) || data.zones.every(zone =>
        (!Object.prototype.hasOwnProperty.call(zone, "miniboss") || (zone.miniboss && typeof zone.miniboss === "object")) &&
        (!Object.prototype.hasOwnProperty.call(zone, "eliteMissions") || (Array.isArray(zone.eliteMissions) && zone.eliteMissions.length === 3)) &&
        (!Object.prototype.hasOwnProperty.call(zone, "bonusMissions") || (Array.isArray(zone.bonusMissions) && zone.bonusMissions.length === 2))
      );
      if (data.id !== entry.id || !validZones || !validMissionGroups ||
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
