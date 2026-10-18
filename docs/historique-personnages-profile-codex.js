// Chargement à la demande du shard individuel du Codex MSF.
(() => {
  "use strict";
  const root = "./data/msf-capabilities-explorer/";
  const { esc, groupTraits } = window.LoSPProfileData;
  const cache = new Map();
  let manifestPromise = null;
  const safeImage = value => {
    try {
      const url = new URL(String(value || ""));
      return url.protocol === "https:" ? url.href : "";
    } catch (_) { return ""; }
  };
  function fetchJson(url) {
    return fetch(url, { cache: "no-store" }).then(response => {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.json();
    });
  }
  async function getShard(id) {
    if (!/^[a-z0-9_-]+$/i.test(id)) throw new Error("ID invalide");
    if (!manifestPromise) {
      manifestPromise = fetchJson(root + "manifest.json").then(manifest => {
        const path = manifest?.currentPath || "";
        if (manifest?.artifactType !== "msf_capabilities_explorer_publication" ||
            !/^generations\/sha256-[0-9a-f]+\/$/i.test(path)) {
          throw new Error("Manifeste Codex invalide");
        }
        return path;
      }).catch(error => { manifestPromise = null; throw error; });
    }
    const folder = await manifestPromise;
    if (!cache.has(id)) {
      cache.set(id, fetchJson(root + folder + "characters/" + id + ".json").then(shard => {
        if (shard?.character?.id !== id || !Array.isArray(shard.abilities)) {
          throw new Error("Fiche Codex invalide");
        }
        return shard;
      }).catch(error => { cache.delete(id); throw error; }));
    }
    return cache.get(id);
  }
  function link(view, id) {
    return "./codex.html?view=" + encodeURIComponent(view) + "&id=" + encodeURIComponent(id);
  }
  function renderTraits(shard) {
    const groups = groupTraits(shard.character);
    return groups.length ? groups.map(group =>
      "<section class=\"profileTagGroup" + (group.title === "Équipes et autres tags" ? " profileTagGroup--wide" : "") + "\"><h4>" + esc(group.title) + "</h4><div class=\"profileTags\">" +
      group.labels.map(label => "<span class=\"profileTag\">" + esc(label) + "</span>").join("") +
      "</div></section>").join("") : "<p class=\"detailEmpty\">Aucun tag publié.</p>";
  }
  function abilityMarkup(ability) {
    const image = safeImage(ability.iconUrl);
    const icon = image ? "<img src=\"" + esc(image) + "\" alt=\"\" loading=\"lazy\" decoding=\"async\">"
      : "<span aria-hidden=\"true\">✦</span>";
    const text = ability.officialText ?
      "<p class=\"profileAbilityText\">" + esc(ability.officialText).replace(/\r?\n/g, "<br>") + "</p>" :
      "<p class=\"detailEmpty\">Texte officiel indisponible dans cette génération.</p>";
    const level = ability.maxLevel != null ? " · Niveau max. " + esc(ability.maxLevel) : "";
    const seeMore = /^[a-z0-9_-]+$/i.test(String(ability.id || ""))
      ? "<a class=\"profileCodexLink\" href=\"" + link("ability", ability.id) +
        "\">Mécaniques et détails dans le Codex →</a>" : "";
    return "<article class=\"profileAbility\"><div class=\"profileAbilityTop\"><span class=\"profileAbilityIcon\">" +
      icon + "</span><div><h4>" + esc(ability.name || ability.typeLabel || "Capacité") +
      "</h4><span>" + esc(ability.typeLabel || ability.type || "") + level +
      "</span></div></div>" + text + seeMore + "</article>";
  }
  function renderAbilities(shard) {
    return shard.abilities.length
      ? shard.abilities.map(abilityMarkup).join("")
      : "<p class=\"detailEmpty\">Aucune capacité publiée pour ce personnage.</p>";
  }
  window.LoSPProfileCodex = Object.freeze({ getShard, link, renderTraits, renderAbilities });
})();
