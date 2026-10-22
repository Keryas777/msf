// Épreuve cosmique : consultation des données publiées et écriture sécurisée.
(() => {
  const IS_PROPOSE = document.body?.dataset?.cosmicView === "propose";
  const PUBLISH_WORKER = "https://msf-cosmic-defenses.deliriousfan7.workers.dev";
  let publishConfigured = false;
  let signedSession = false;
  let publishing = false;
  const DATA = {
    config: "./data/cosmic-config.json",
    defenses: "./data/cosmic-defenses.json",
    characters: "./data/msf-characters.json"
  };
  const LEGACY_DRAFT_KEY = "losp:cosmic-defense-draft:v1";
  let DRAFT_KEY = LEGACY_DRAFT_KEY;
  let COSMIC_SEASON_ID = "";
  const publishedNode = document.getElementById("publishedDefenses");
  const publishedStatus = document.getElementById("publishedStatus");
  const publishedDefenseSelect = document.getElementById("publishedDefenseSelect");
  let publishedEntries = [];
  const proposalsNode = document.getElementById("proposalRooms");
  const proposalStatus = document.getElementById("proposalStatus");
  const proposalAuthorDisplay = document.getElementById("proposalAuthorDisplay");
  const proposalTitle = document.getElementById("proposalTitle");
  const shareButton = document.getElementById("proposalShare");
  const publishedLink = document.getElementById("proposalPublishedLink");
  const shareFallback = document.getElementById("proposalFallback");


  let rooms = [];
  let charactersById = new Map();
  let aliases = new Map();
  let characterList = [];
  let discordAuthor = "";

  const normalize = (value) => String(value || "").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
  const make = (tag, className = "", text = "") => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  };
  const safeText = (value, limit = 500) => String(value || "").trim().slice(0, limit);
  async function fetchJson(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error("Chargement impossible : " + path);
    return res.json();
  }
  function loadDraft() {
    try {
      let raw = localStorage.getItem(DRAFT_KEY);
      // Migration unique des anciens brouillons lorsque la saison 25 est active.
      if (!raw && COSMIC_SEASON_ID === "season-25") raw = localStorage.getItem(LEGACY_DRAFT_KEY);
      const data = JSON.parse(raw || "null");
      return data && typeof data === "object" ? data : {};
    } catch (_) { return {}; }
  }
  function saveDraft() {
    const state = { title: safeText(proposalTitle?.value, 60), rooms: {} };
    for (const room of rooms) {
      const node = proposalsNode.querySelector('[data-cosmic-room="' + room.id + '"]');
      if (!node) continue;
      state.rooms[room.id] = {
        characters: [...node.querySelectorAll("[data-cosmic-character]")].map(input =>
          input.dataset.selectedId || input.value.trim()
        ),
        note: node.querySelector("[data-cosmic-note]")?.value || ""
      };
    }
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(state)); } catch (_) {}
    if (shareFallback) shareFallback.hidden = true;
  }
  function fillAuthorFromSession(session) {
    // Seules les données de la session vérifiée par auth-guard.js font foi.
    const name = session?.ok === true
      ? (session.displayName || session.global_name || session.username || "")
      : "";
    discordAuthor = safeText(name, 80);
    proposalAuthorDisplay.textContent = discordAuthor || "Identification Discord en cours…";
    const localToken = (() => {
      try { return localStorage.getItem("losp_session") || ""; } catch { return ""; }
    })();
    signedSession = session?.signedSession === true && /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(localToken);
    if (shareButton) shareButton.disabled = !discordAuthor || !signedSession || !publishConfigured || publishing;
    if (proposalStatus && discordAuthor && !signedSession) {
      proposalStatus.textContent = "Pour publier directement, reconnecte-toi à Discord avec la connexion sécurisée.";
    }
  }
    function buildCharacterCatalogue(rows) {
    charactersById = new Map();
    aliases = new Map();
    characterList = [];
    for (const item of Array.isArray(rows) ? rows : []) {
      if (item?.player_Character !== true || !item.id) continue;
      const id = String(item.id);
      const name = String(item.nameKey || item.nameFr || item.nameEn || id);
      const character = { id, name, portrait: item.portraitUrl || item.portrait || "" };
      charactersById.set(id, character);
      characterList.push(character);
      for (const value of [id, name, item.nameFr, item.nameEn]) {
        const key = normalize(value);
        if (!key) continue;
        if (aliases.has(key) && aliases.get(key)?.id !== id) aliases.set(key, null);
        else if (!aliases.has(key)) aliases.set(key, character);
      }
    }
    characterList.sort((a,b) => a.name.localeCompare(b.name,"fr",{sensitivity:"base"}));
  }
    function resolveCharacter(value) {
    const text = String(value || "").trim();
    return charactersById.get(text) || aliases.get(normalize(text)) || null;
  }
  function portrait(characterId) {
    const data = charactersById.get(String(characterId || "")) || resolveCharacter(characterId);
    const box = make("div", "cosmicPortrait");
    box.title = data?.name || String(characterId || "");
    if (data?.portrait) {
      const img = make("img");
      img.src = data.portrait;
      img.alt = data.name;
      img.loading = "lazy";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.onerror = () => { img.remove(); box.appendChild(make("span", "", data.name)); };
      box.appendChild(img);
    } else {
      box.appendChild(make("span", "", data?.name || String(characterId || "?")));
    }
    return box;
  }
  function renderPublished() {
    publishedNode.replaceChildren();
    const catalog = window.LoSPCosmicDefenseCatalog;
    const groupId = publishedDefenseSelect.value;
    const list = catalog.entriesForGroup(publishedEntries, groupId);
    let count = 0;
    for (const room of rooms) {
      const section = make("section", "cosmicRoom");
      section.appendChild(make("h3", "", room.label));
      if (room.rule) section.appendChild(make("p", "cosmicRoomRule", "Règle de la salle : " + room.rule));
      const entries = catalog.sortedForDisplay(list.filter(d => Number(d.room) === room.id));
      if (!entries.length) section.appendChild(make("p", "cosmicEmpty", "Aucune défense publiée dans cette salle."));
      for (const entry of entries) {
        count++;
        const card = make("article", "cosmicDefense");
        const presentation = catalog.presentationFor(entry);
        if (presentation.label) {
          card.appendChild(make("span", "cosmicDefenseTier cosmicDefenseTier--" + presentation.key, presentation.label));
        }
        card.appendChild(make("h4", "cosmicDefenseTeam", safeText(presentation.team, 120)));
        const portraits = make("div", "cosmicPortraits");
        for (const id of entry.characters) portraits.appendChild(portrait(id));
        card.appendChild(portraits);
        card.appendChild(make("p", "cosmicDefenseMeta", "Source : " + safeText(catalog.displaySource(entry), 100)));
        if (entry.notes) card.appendChild(make("p", "cosmicDefenseMeta", safeText(entry.notes)));
        if (entry.sourceUrl) {
          try {
            const url = new URL(entry.sourceUrl);
            if (url.protocol === "https:") {
              const link = make("a", "", "Consulter la source");
              link.href = url.href;
              link.rel = "noopener noreferrer";
              link.target = "_blank";
              const meta = make("p", "cosmicDefenseMeta");
              meta.appendChild(link);
              card.appendChild(meta);
            }
          } catch (_) {}
        }
        section.appendChild(card);
      }
      publishedNode.appendChild(section);
    }
    const selectedName = publishedDefenseSelect.selectedOptions[0]?.textContent || "";
    publishedStatus.textContent = count
      ? count + " composition(s) publiée(s)" + (groupId ? " — " + selectedName : "") + "."
      : "Aucune composition validée pour cette sélection. Tu peux préparer et partager tes défenses.";
  }

  function initPublishedSelector(defenses) {
    const catalog = window.LoSPCosmicDefenseCatalog;
    if (!catalog) throw new Error("Catalogue des défenses introuvable");
    publishedEntries = catalog.activeEntries(defenses, COSMIC_SEASON_ID);
    publishedDefenseSelect.replaceChildren();

    const all = document.createElement("option");
    all.value = "";
    all.textContent = "Toutes les défenses publiées";
    publishedDefenseSelect.appendChild(all);

    const groups = catalog.groupsFor(publishedEntries);
    const sections = [
      { kind: "player", label: "Défenses des joueurs" },
      { kind: "source", label: "Guides et autres sources" }
    ];
    for (const category of sections) {
      const members = groups.filter(group => group.kind === category.kind);
      if (!members.length) continue;
      const optgroup = document.createElement("optgroup");
      optgroup.label = category.label;
      for (const group of members) {
        const option = document.createElement("option");
        option.value = group.id;
        option.textContent = group.label + " (" + group.count + ")";
        optgroup.appendChild(option);
      }
      publishedDefenseSelect.appendChild(optgroup);
    }
    publishedDefenseSelect.disabled = !groups.length;
    publishedDefenseSelect.value = "";
    renderPublished();
  }
  function renderSelectedPortraits(section) {
    const row = section.querySelector("[data-cosmic-portraits]");
    if (!row) return;
    row.replaceChildren();
    [...section.querySelectorAll("[data-cosmic-character]")].forEach((input, index) => {
      const selected = charactersById.get(input.dataset.selectedId || "");
      if (selected) {
        const tile = portrait(selected.id);
        const removeButton = make("button", "cosmicPortraitRemove", "×");
        removeButton.type = "button";
        removeButton.title = "Retirer " + selected.name;
        removeButton.setAttribute("aria-label",
          "Retirer " + selected.name + " de cette salle, emplacement " + (index + 1));
        removeButton.addEventListener("click", () => {
          // Ne touche qu'à l'emplacement correspondant, puis persiste le brouillon.
          input.value = "";
          input.dataset.selectedId = "";
          closeSuggestions();
          renderSelectedPortraits(section);
          saveDraft();
        });
        tile.appendChild(removeButton);
        row.appendChild(tile);
      } else {
        const slot = make("div", "cosmicPortrait cosmicPortrait--empty");
        slot.appendChild(make("span", "", String(index + 1)));
        row.appendChild(slot);
      }
    });
  }
  function closeSuggestions(except = null) {
    document.querySelectorAll(".cosmicSuggestions").forEach(panel => {
      if (panel === except) return;
      panel.hidden = true;
      panel.replaceChildren();
      panel.previousElementSibling?.setAttribute("aria-expanded", "false");
    });
  }
  function showSuggestions(input) {
    const panel = input.parentElement.querySelector(".cosmicSuggestions");
    if (!panel) return;
    panel.replaceChildren();
    const query = normalize(input.value);
    if (!query) {
      panel.hidden = true;
      input.setAttribute("aria-expanded", "false");
      return;
    }
    closeSuggestions(panel);
    const matches = characterList
      .filter(character => normalize(character.name).startsWith(query))
      .slice(0, 24);
    if (!matches.length) {
      panel.hidden = true;
      input.setAttribute("aria-expanded", "false");
      return;
    }
    const section = input.closest(".cosmicRoom");
    for (const character of matches) {
      const button = make("button", "cosmicSuggestion", character.name);
      button.type = "button";
      button.setAttribute("role", "option");
      button.dataset.characterId = character.id;
      // Évite la perte du focus de l'input avant le clic dans Safari/Chrome.
      button.addEventListener("pointerdown", event => event.preventDefault());
      button.addEventListener("click", () => {
        const inputs = [...section.querySelectorAll("[data-cosmic-character]")];
        if (inputs.some(other => other !== input && other.dataset.selectedId === character.id)) {
          proposalStatus.textContent = character.name + " est déjà sélectionné dans cette salle.";
          return;
        }
        input.value = character.name;
        input.dataset.selectedId = character.id;
        panel.replaceChildren();
        panel.hidden = true;
        input.setAttribute("aria-expanded", "false");
        proposalStatus.textContent = "";
        renderSelectedPortraits(section);
        saveDraft();
      });
      panel.appendChild(button);
    }
    panel.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }
  function renderProposals() {
    proposalsNode.replaceChildren();
    const draft = loadDraft();
    if (proposalTitle) proposalTitle.value = safeText(draft.title, 60);
    for (const room of rooms) {
      const state = draft.rooms?.[room.id] || {};
      const section = make("section", "cosmicRoom");
      section.dataset.cosmicRoom = String(room.id);
      section.appendChild(make("h3", "", room.label));
      if (room.rule) section.appendChild(make("p", "cosmicRoomRule", "Règle de la salle : " + room.rule));
      const portraits = make("div", "cosmicPortraits cosmicSelectedPortraits");
      portraits.dataset.cosmicPortraits = "1";
      portraits.setAttribute("aria-label", "Portraits des cinq personnages de " + room.label);
      section.appendChild(portraits);
      const inputs = make("div", "cosmicInputs");
      for (let i = 0; i < 5; i++) {
        const wrap = make("div", "cosmicInputWrap");
        const input = make("input", "select");
        input.type = "text";
        input.dataset.cosmicCharacter = String(i);
        input.placeholder = "Personnage " + (i + 1);
        input.autocomplete = "off";
        input.maxLength = 90;
        input.setAttribute("aria-label", room.label + " — personnage " + (i + 1));
        input.setAttribute("role", "combobox");
        input.setAttribute("aria-autocomplete", "list");
        input.setAttribute("aria-expanded", "false");
        const saved = safeText(state.characters?.[i], 90);
        const character = charactersById.get(saved) || resolveCharacter(saved);
        input.value = character?.name || saved;
        input.dataset.selectedId = character?.id || "";
        const suggestions = make("div", "cosmicSuggestions");
        suggestions.id = "cosmic-suggestions-" + room.id + "-" + i;
        suggestions.setAttribute("role", "listbox");
        suggestions.hidden = true;
        input.setAttribute("aria-controls", suggestions.id);
        input.addEventListener("input", () => {
          input.dataset.selectedId = "";
          renderSelectedPortraits(section);
          showSuggestions(input);
          saveDraft();
        });
        input.addEventListener("focus", () => showSuggestions(input));
        input.addEventListener("keydown", event => {
          if (event.key === "Escape") {
            suggestions.hidden = true;
            input.setAttribute("aria-expanded", "false");
          }
        });
        input.addEventListener("blur", () => {
          // Le clic tactile sur la suggestion doit pouvoir aboutir avant fermeture.
          setTimeout(() => {
            suggestions.hidden = true;
            input.setAttribute("aria-expanded", "false");
          }, 170);
        });
        wrap.append(input, suggestions);
        inputs.appendChild(wrap);
      }
      section.appendChild(inputs);
      const note = make("input", "select cosmicRoomNote");
      note.type = "text";
      note.dataset.cosmicNote = "1";
      note.placeholder = "Note / stratégie pour cette salle (facultatif)";
      note.maxLength = 250;
      note.setAttribute("aria-label", room.label + " — note");
      note.value = safeText(state.note, 250);
      section.appendChild(note);
      proposalsNode.appendChild(section);
      renderSelectedPortraits(section);
    }
  }
    function buildSubmission() {
    // Aucune valeur d'auteur ne provient des champs ou de localStorage.
    const author = discordAuthor;
    if (!author) throw new Error("La session Discord doit être validée avant le partage.");
    const selectedRooms = [];
    for (const room of rooms) {
      const section = proposalsNode.querySelector('[data-cosmic-room="' + room.id + '"]');
      const inputs = [...section.querySelectorAll("[data-cosmic-character]")];
      const attempted = inputs.some(input => input.value.trim() || input.dataset.selectedId);
      if (!attempted) continue;
      const ids = inputs.map(input => input.dataset.selectedId || "");
      if (ids.some(id => !charactersById.has(id))) {
        throw new Error(room.label + " : sélectionne les 5 personnages dans les suggestions.");
      }
      if (new Set(ids).size !== 5) {
        throw new Error(room.label + " : un personnage est sélectionné plusieurs fois.");
      }
      selectedRooms.push({
        room: room.id,
        label: room.label,
        characters: ids,
        notes: safeText(section.querySelector("[data-cosmic-note]")?.value, 250)
      });
    }
    if (!selectedRooms.length) throw new Error("Renseigne au moins une salle complète.");
    return { schemaVersion: 1, mode: "cosmic-crucible", season: COSMIC_SEASON_ID,
      title: safeText(proposalTitle?.value, 60), author, rooms: selectedRooms };
  }
    async function publishSubmission() {
    if (publishing) return;
    let submission;
    try { submission = buildSubmission(); }
    catch (error) { proposalStatus.textContent = error.message; return; }
    const session = (() => {
      try { return localStorage.getItem("losp_session") || ""; } catch { return ""; }
    })();
    if (!signedSession || !session.startsWith("v1.")) {
      proposalStatus.textContent = "Reconnecte-toi à Discord pour publier en toute sécurité.";
      return;
    }
    publishing = true;
    shareButton.disabled = true;
    if (publishedLink) publishedLink.hidden = true;
    proposalStatus.textContent = "Publication en cours…";
    try {
      const response = await fetch(PUBLISH_WORKER + "/api/cosmic-defenses", {
        method:"POST",mode:"cors",cache:"no-store",credentials:"omit",
        headers:{"Content-Type":"application/json","Authorization":"Bearer " + session},
        body:JSON.stringify({
          season:submission.season,
          title:submission.title,
          rooms:submission.rooms.map(room => ({
            room:room.room,characters:room.characters,notes:room.notes
          }))
        })
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        const reason = result?.message || "Publication impossible. Réessaie un peu plus tard.";
        throw Error(reason);
      }
      // Le serveur a confirmé le commit GitHub. Ne pas effacer le brouillon :
      // le joueur doit pouvoir republier ses salles en conservant la saisie.
      proposalStatus.textContent = result.published + " salle(s) publiée(s) avec succès ! Les autres joueurs peuvent maintenant les consulter.";
      if (publishedLink) publishedLink.hidden = false;
    } catch (error) {
      proposalStatus.textContent = "Aucune publication confirmée : " +
        (error?.message || "réseau indisponible") + " Ton brouillon est conservé.";
    } finally {
      publishing = false;
      shareButton.disabled = !discordAuthor || !signedSession || !publishConfigured;
    }
  }
  async function checkPublishService() {
    try {
      const response = await fetch(PUBLISH_WORKER + "/health", {cache:"no-store"});
      const health = await response.json();
      publishConfigured = response.ok && health?.configured === true;
    } catch { publishConfigured = false; }
    fillAuthorFromSession(window.LoSP_SESSION);
    if (!publishConfigured) {
      proposalStatus.textContent = "Publication directe en cours de configuration. Ton brouillon reste enregistré.";
    }
  }
  async function loadPublishedLive(expectedSeason) {
    try {
      const response = await fetch(PUBLISH_WORKER + "/api/cosmic-defenses", {
        cache:"no-store",mode:"cors",credentials:"omit"
      });
      if (!response.ok) throw Error("live_unavailable");
      const data = await response.json();
      if (!data?.ok || !Array.isArray(data.entries)) throw Error("invalid_live_data");
      if (data.season !== expectedSeason) {
        throw Error("sync_season");
      }
      return data.entries;
    } catch (error) {
      if (error?.message === "sync_season") {
        throw Error("La nouvelle saison est en cours de synchronisation. Réessaie dans quelques minutes.");
      }
      // En cas d'indisponibilité, afficher l'ancien JSON en avertissant du
      // caractère potentiellement incomplet de la copie GitHub Pages.
      const stored = await fetchJson(DATA.defenses);
      if (publishedStatus) publishedStatus.dataset.fallback = "true";
      return stored;
    }
  }
  async function boot() {
    try {
      const config = await fetchJson(DATA.config);
      const [published, chars] = await Promise.all([
        IS_PROPOSE ? Promise.resolve([]) : loadPublishedLive(config?.season?.id),
        fetchJson(DATA.characters)
      ]);
      const configRooms = Array.isArray(config?.rooms) ? config.rooms : [];
      rooms = configRooms
        .filter(r => Number.isInteger(r?.id) && r.id >= 1 && r.id <= 6)
        .slice(0, 6)
        .map(r => ({ id: r.id, label: safeText(r.label, 80) || "Salle " + r.id,
          rule: safeText(r.rule, 800) }));
      if (rooms.length !== 6 || new Set(rooms.map(r => r.id)).size !== 6)
        throw new Error("Configuration des six salles invalide.");
      COSMIC_SEASON_ID = config?.season?.id || "";
      if (!/^season-[1-9][0-9]*$/.test(COSMIC_SEASON_ID)) throw new Error("Identifiant de saison invalide");
      DRAFT_KEY = LEGACY_DRAFT_KEY + ":" + COSMIC_SEASON_ID;
      window.LoSPCosmicSeasonUi?.render(config);
      buildCharacterCatalogue(chars);
      if (IS_PROPOSE) {
        // Conserve les brouillons locaux de cette saison et tous les comportements
        // déjà validés (sélection, portraits, croix, notes, partage Discord).
        renderProposals();
        fillAuthorFromSession(window.LoSP_SESSION);
        window.addEventListener("losp:auth-ready", event => fillAuthorFromSession(event.detail));
        proposalsNode.addEventListener("input", event => {
          if (event.target.matches("[data-cosmic-note]")) saveDraft();
        });
        proposalTitle?.addEventListener("input", saveDraft);
        document.addEventListener("pointerdown", event => {
          if (!event.target.closest(".cosmicInputWrap")) closeSuggestions();
        });
        shareButton.addEventListener("click", publishSubmission);
        proposalStatus.textContent = "Tape les premières lettres d’un personnage puis sélectionne-le dans la liste.";
        checkPublishService();
      } else {
        initPublishedSelector(published);
        publishedDefenseSelect.addEventListener("change", renderPublished);
        if (publishedStatus?.dataset.fallback) {
          const notice = document.createElement("p");
          notice.className = "cosmicFeedback";
          notice.textContent = "Lecture provisoire du catalogue GitHub Pages : des publications récentes peuvent manquer.";
          publishedNode.parentElement.insertBefore(notice, publishedNode);
        }
      }
    } catch (error) {
      if (publishedStatus) publishedStatus.textContent = "Impossible de charger les défenses : " + error.message;
      if (proposalStatus) proposalStatus.textContent = "Le formulaire n'est pas disponible.";
      if (shareButton) shareButton.disabled = true;
    }
  }
  boot();
})();
