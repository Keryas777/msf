/* Présentation partagée : la configuration de saison est la seule source de vérité. */
(() => {
  function render(config) {
    const season = config?.season;
    if (!Number.isInteger(season?.number) || season.number < 1 || !Array.isArray(config?.rooms) || config.rooms.length !== 6) {
      throw new Error("Configuration de la saison cosmique invalide");
    }
    document.querySelectorAll("[data-cosmic-season-title]").forEach(node => {
      node.textContent = "Saison " + season.number + " — " + (season.name || "");
    });
    document.querySelectorAll("[data-cosmic-season-dates]").forEach(node => {
      node.textContent = "Défenses ouvertes le " + new Intl.DateTimeFormat("fr-FR", {dateStyle:"long",timeZone:"Europe/Paris"})
        .format(new Date(season.startAt)) + " · Premier combat le " +
        new Intl.DateTimeFormat("fr-FR", {dateStyle:"long",timeZone:"Europe/Paris"})
        .format(new Date(season.firstTrialAt));
    });
    document.querySelectorAll("[data-cosmic-season-rules]").forEach(container => {
      container.replaceChildren();
      const global = document.createElement("p");
      global.className = "cosmicRuleText";
      global.textContent = "RÈGLE GLOBALE — " + (config.globalRule?.title || "") + "\n" + (config.globalRule?.rule || "");
      container.appendChild(global);
      config.rooms.forEach(room => {
        const paragraph = document.createElement("p");
        paragraph.className = "cosmicRuleText";
        paragraph.textContent = room.label + "\n" + room.rule;
        container.appendChild(paragraph);
      });
      if (season.sourceUrl) {
        const a = document.createElement("a");
        a.href = season.sourceUrl;
        a.textContent = "Annonce officielle Scopely";
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        container.appendChild(a);
      }
    });
  }
  window.LoSPCosmicSeasonUi = { render };
  if (document.body.querySelector(".cosmicHubGrid")) {
    fetch("./data/cosmic-config.json", {cache:"no-store"})
      .then(response => { if (!response.ok) throw Error("HTTP " + response.status); return response.json(); })
      .then(render)
      .catch(error => {
        document.querySelectorAll("[data-cosmic-season-title]").forEach(node => {
          node.textContent = "Saison indisponible — " + error.message;
        });
      });
  }
})();
