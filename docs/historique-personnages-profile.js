// Onglets enrichis de la fiche personnage, sans remplacer la chronologie d'origine.
(() => {
  "use strict";
  const { esc, rankPlayers, presentIso } = window.LoSPProfileData;
  const codex = window.LoSPProfileCodex;
  const numberFr = new Intl.NumberFormat("fr-FR");
  const downloads = new Map();
  let current = null, token = 0;

  function fetchData(file) {
    if (!downloads.has(file)) {
      downloads.set(file, fetch("./data/" + file, { cache: "no-store" })
        .then(response => {
          if (!response.ok) throw new Error(file + ": HTTP " + response.status);
          return response.json();
        }).catch(error => { downloads.delete(file); throw error; }));
    }
    return downloads.get(file);
  }
  const alive = state => current === state && state.token === token && state.root.isConnected;
  const available = value => value !== null && value !== undefined && value !== "";
  const badge = text => "<span>" + text + "</span>";
  // Étoiles vectorielles : couleur contrôlée par CSS, sans rendu emoji propre à iOS.
  const starIcon = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true" focusable="false">' +
    '<path fill="currentColor" stroke="none" d="M12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26Z"/></svg>';
  function starBadge(value, kind) {
    const name = kind === "yellow" ? "jaunes" : "rouges";
    return '<span class="profileStarBadge profileStarBadge--' + kind +
      '" aria-label="' + esc(value) + ' étoiles ' + name + '">' +
      starIcon + esc(value) + '</span>';
  }

  function playerMarkup(row, rank, alliances) {
    const alliance = alliances.find(item => item.key === row.alliance);
    const stats = [];
    if (available(row.level)) stats.push(badge("Niv. " + esc(row.level)));
    if (available(row.gear)) stats.push(badge("G" + esc(row.gear)));
    if (available(row.yellowStars)) stats.push(starBadge(row.yellowStars, "yellow"));
    if (available(row.redStars)) stats.push(starBadge(row.redStars, "red"));
    if (available(row.diamonds) && Number(row.diamonds) > 0) {
      stats.push(badge("◆ " + esc(row.diamonds)));
    }
    // Tolère un ancien module de données encore en cache (Safari/PWA) : ne pas masquer le classement.
    const iso = typeof presentIso === "function"
      ? presentIso(row.isoClass, row.isoColor, row.isoMax)
      : null;
    if (iso) {
      const coloredDot = iso.colorKey
        ? '<span class="profileIsoDot profileIsoDot--' + iso.colorKey + '" aria-hidden="true"></span>'
        : '';
      const level = iso.level !== null ? " " + esc(iso.level) : "";
      const description = ["ISO", iso.classLabel,
        iso.colorLabel ? iso.colorLabel + (iso.level !== null ? " niveau " + iso.level : "") : ""]
        .filter(Boolean).join(" · ");
      stats.push('<span class="profileIsoBadge" aria-label="' + esc(description) +
        '">ISO : ' + esc(iso.classLabel) + coloredDot + level + '</span>');
    }
    return "<article class=\"profilePlayerRow\"><span class=\"profileRank\">#" + rank +
      "</span><div class=\"profilePlayerInfo\"><strong>" + esc(row.player) + "</strong><span>" +
      esc(alliance?.emoji || "") + " " + esc(alliance?.name || row.alliance) +
      "</span><div class=\"profilePlayerStats\">" + stats.join("") +
      "</div></div><strong class=\"profilePower\">" + numberFr.format(row.power) + "</strong></article>";
  }

  function displayRanking(state) {
    if (!alive(state) || !state.ranking) return;
    const filtered = state.ranking.filter(row => state.selected.has(row.alliance));
    state.root.querySelector("#profile-player-count").textContent =
      filtered.length + " personnage" + (filtered.length === 1 ? "" : "s") + " classé" +
      (filtered.length === 1 ? "" : "s");
    state.root.querySelector("#profile-player-list").innerHTML = !state.selected.size
      ? "<p class=\"detailEmpty\">Coche au moins une alliance.</p>"
      : !filtered.length ? "<p class=\"detailEmpty\">Aucun personnage détenu dans les alliances sélectionnées.</p>"
      : filtered.map((row, i) => playerMarkup(row, i + 1, state.alliances)).join("");
    state.root.querySelector("#profile-toggle-all").textContent =
      state.selected.size === state.alliances.length ? "Tout décocher" : "Tout cocher";
  }

  async function loadRanking(state) {
    if (!alive(state) || state.ranking || state.loadingRanking) return;
    state.loadingRanking = true;
    try {
      const [allianceData, players, aliases, rosters] = await Promise.all([
        fetchData("alliances.json"), fetchData("joueurs.json"),
        fetchData("player-aliases.json"), fetchData("rosters.json")
      ]);
      if (!alive(state)) return;
      state.alliances = (Array.isArray(allianceData) ? allianceData : [])
        .filter(a => a?.key && a.active !== false)
        .sort((a, b) => Number(a.order || 999) - Number(b.order || 999));
      state.selected = new Set(state.alliances.map(a => a.key));
      state.ranking = rankPlayers(state.record.id, rosters, players, aliases, state.alliances);
      const filters = state.root.querySelector("#profile-alliance-filters");
      filters.innerHTML = state.alliances.map(a =>
        "<label class=\"profileFilterToggle\"><input type=\"checkbox\" data-alliance=\"" +
        esc(a.key) + "\" checked><span class=\"profileFilterStack\"><span>" +
        esc(a.emoji || "👤") + "</span><strong>" + esc(a.name) +
        "</strong></span></label>").join("");
      filters.addEventListener("change", event => {
        if (!event.target.matches("input[data-alliance]")) return;
        const key = event.target.dataset.alliance;
        if (event.target.checked) state.selected.add(key); else state.selected.delete(key);
        displayRanking(state);
      });
      state.root.querySelector("#profile-toggle-all").addEventListener("click", () => {
        const all = state.selected.size === state.alliances.length;
        state.selected = new Set(all ? [] : state.alliances.map(a => a.key));
        filters.querySelectorAll("input[data-alliance]").forEach(input => {
          input.checked = state.selected.has(input.dataset.alliance);
        });
        displayRanking(state);
      });
      state.root.querySelector("#profile-player-filters").hidden = false;
      displayRanking(state);
    } catch (error) {
      if (alive(state)) {
        console.warn("[personnages] Classement LoSP :", error);
        state.root.querySelector("#profile-player-count").textContent = "Classement indisponible";
        state.root.querySelector("#profile-player-list").innerHTML =
          "<p class=\"detailEmpty\">Impossible de charger les rosters. Ferme puis rouvre la fiche pour réessayer.</p>";
      }
    } finally {
      state.loadingRanking = false;
    }
  }

  function selectTab(state, name) {
    if (!alive(state)) return;
    state.root.querySelectorAll("[data-profile-tab]").forEach(button => {
      const active = button.dataset.profileTab === name;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    state.root.querySelectorAll("[data-profile-panel]").forEach(panel => {
      panel.hidden = panel.dataset.profilePanel !== name;
    });
    if (name === "players") loadRanking(state);
  }

  async function loadCodex(state) {
    try {
      const shard = await codex.getShard(state.record.id);
      if (!alive(state)) return;
      state.root.querySelector("#profile-identity-traits").innerHTML = codex.renderTraits(shard);
      state.root.querySelector("#profile-abilities-content").innerHTML = codex.renderAbilities(shard);
    } catch (error) {
      if (!alive(state)) return;
      console.warn("[personnages] Codex :", error);
      state.root.querySelector("#profile-identity-traits").innerHTML =
        "<p class=\"detailEmpty\">Tags officiels indisponibles actuellement.</p>";
      state.root.querySelector("#profile-abilities-content").innerHTML =
        "<p class=\"detailEmpty\">Capacités indisponibles actuellement. Réessaie en rouvrant la fiche.</p>";
    }
  }

  function attach(record, root) {
    close();
    if (!record || !root) return;
    const hero = root.querySelector(".detailHero");
    const facts = root.querySelector(".detailGrid");
    const historySection = root.querySelector(".detailSection");
    if (!hero || !facts || !historySection) return;
    const state = { record, root, token: ++token, ranking: null, loadingRanking: false };
    current = state;
    const release = record.release?.temporal?.label || "Date non encore auditée";
    const tabs = document.createElement("div");
    tabs.className = "profileTabs";
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "Rubriques du personnage");
    tabs.innerHTML = [
      ["identity", "Identité"], ["players", "Joueurs"],
      ["abilities", "Capacités"], ["history", "Historique"]
    ].map(([id, text]) => "<button type=\"button\" role=\"tab\" data-profile-tab=\"" +
      id + "\" aria-controls=\"profile-panel-" + id + "\" aria-selected=\"false\">" +
      text + "</button>").join("");

    const container = document.createElement("div");
    container.innerHTML =
      "<section class=\"profilePanel\" id=\"profile-panel-identity\" role=\"tabpanel\" data-profile-panel=\"identity\">" +
      "<div class=\"profileIdentitySummary\"><div><span>Sortie jouable</span><strong>" + esc(release) +
      "</strong></div><div><span>Reworks documentés</span><strong>" +
      numberFr.format(record.reworks?.length || 0) + "</strong></div></div>" +
      "<h3>Tags officiels</h3><div id=\"profile-identity-traits\" class=\"profileTraitGroups\">" +
      "<p class=\"detailEmpty\">Chargement des tags…</p></div>" +
      "<p class=\"profileSmallNote\">Les dates reflètent uniquement les années auditées. " +
      "L'équipement unique sera intégré lorsqu'une source officielle fiable aura été identifiée.</p>" +
      "<a class=\"profileCodexLink\" href=\"" + codex.link("character", record.id) +
      "\">Fiche technique dans le Codex →</a></section>" +
      "<section class=\"profilePanel\" id=\"profile-panel-players\" role=\"tabpanel\" data-profile-panel=\"players\" hidden>" +
      "<h3>Classement LoSP</h3><p class=\"profileSmallNote\">Membres actuels du groupement, par puissance décroissante, d'après leurs derniers rosters disponibles.</p>" +
      "<div id=\"profile-player-filters\" hidden><div class=\"profileFiltersTitle\"><strong>Filtrer les alliances</strong>" +
      "<button type=\"button\" id=\"profile-toggle-all\">Tout décocher</button></div>" +
      "<div id=\"profile-alliance-filters\" class=\"profileAllianceFilters\" role=\"group\" aria-label=\"Filtrer par alliance\"></div></div>" +
      "<div id=\"profile-player-count\" class=\"profilePlayerCount\" aria-live=\"polite\"></div>" +
      "<div id=\"profile-player-list\" class=\"profilePlayerList\"><p class=\"detailEmpty\">Chargement des rosters…</p></div></section>" +
      "<section class=\"profilePanel\" id=\"profile-panel-abilities\" role=\"tabpanel\" data-profile-panel=\"abilities\" hidden>" +
      "<h3>Capacités</h3><p class=\"profileSmallNote\">Descriptions officielles françaises au niveau maximum publié. " +
      "Les mécaniques déjà interprétées restent consultables dans le Codex.</p>" +
      "<div id=\"profile-abilities-content\"><p class=\"detailEmpty\">Chargement des capacités…</p></div></section>" +
      "<section class=\"profilePanel\" id=\"profile-panel-history\" role=\"tabpanel\" data-profile-panel=\"history\" hidden></section>";

    hero.after(tabs, container);
    container.querySelector("#profile-panel-history").append(facts, historySection);
    tabs.addEventListener("click", event => {
      const button = event.target.closest("button[data-profile-tab]");
      if (button) selectTab(state, button.dataset.profileTab);
    });
    tabs.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      const buttons = [...tabs.querySelectorAll("button[data-profile-tab]")];
      const index = buttons.indexOf(document.activeElement);
      if (index < 0) return;
      event.preventDefault();
      const next = buttons[(index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length];
      next.focus();
      selectTab(state, next.dataset.profileTab);
    });
    selectTab(state, "identity");
    loadCodex(state);
  }

  function close() {
    current = null;
    ++token; // Annule logiquement les chargements asynchrones des anciennes fiches.
  }

  window.LoSPCharacterProfiles = Object.freeze({ attach, close });
})();
