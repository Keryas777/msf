// Onglets enrichis de la fiche personnage, sans remplacer la chronologie d'origine.
(() => {
  "use strict";
  const { esc, rankPlayers } = window.LoSPProfileData;
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

  function playerMarkup(row, rank, alliances) {
    const alliance = alliances.find(item => item.key === row.alliance);
    const stats = [];
    if (available(row.level)) stats.push("Niv. " + esc(row.level));
    if (available(row.gear)) stats.push("G" + esc(row.gear));
    if (available(row.yellowStars)) stats.push("★ " + esc(row.yellowStars));
    if (available(row.redStars)) stats.push("🔴 " + esc(row.redStars));
    if (available(row.diamonds) && Number(row.diamonds) > 0) stats.push("◆ " + esc(row.diamonds));
    const iso = [row.isoClass, row.isoColor, available(row.isoMax) ? "niveau " + row.isoMax : ""]
      .filter(Boolean).join(" · ");
    if (iso) stats.push("ISO : " + esc(iso));
    return "<article class=\"profilePlayerRow\"><span class=\"profileRank\">#" + rank +
      "</span><div class=\"profilePlayerInfo\"><strong>" + esc(row.player) + "</strong><span>" +
      esc(alliance?.emoji || "") + " " + esc(alliance?.name || row.alliance) +
      "</span><div class=\"profilePlayerStats\">" + stats.map(badge).join("") +
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
