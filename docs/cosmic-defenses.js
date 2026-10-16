// Épreuve cosmique : consultation publique (JSON) et propositions locales à partager.
(() => {
  const DATA = {
    config: "./data/cosmic-config.json",
    defenses: "./data/cosmic-defenses.json",
    characters: "./data/msf-characters.json"
  };
  const DRAFT_KEY = "losp:cosmic-defense-draft:v1";
  const publishedNode = document.getElementById("publishedDefenses");
  const publishedStatus = document.getElementById("publishedStatus");
  const proposalsNode = document.getElementById("proposalRooms");
  const proposalStatus = document.getElementById("proposalStatus");
  const proposalAuthor = document.getElementById("proposalAuthor");
  const proposalSource = document.getElementById("proposalSource");
  const shareButton = document.getElementById("proposalShare");
  const shareFallback = document.getElementById("proposalFallback");
  const datalist = document.getElementById("cosmicCharacters");

  let rooms = [];
  let charactersById = new Map();
  let aliases = new Map();

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
      const data = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      return data && typeof data === "object" ? data : {};
    } catch (_) { return {}; }
  }
  function saveDraft() {
    const state = {
      author: proposalAuthor.value,
      source: proposalSource.value,
      rooms: {}
    };
    for (const room of rooms) {
      const node = proposalsNode.querySelector('[data-cosmic-room="' + room.id + '"]');
      if (!node) continue;
      state.rooms[room.id] = {
        characters: [...node.querySelectorAll("[data-cosmic-character]")].map(el => el.value),
        note: node.querySelector("[data-cosmic-note]")?.value || ""
      };
    }
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(state)); } catch (_) {}
    shareFallback.hidden = true;
  }
  function fillAuthorFromSession(session) {
    if (proposalAuthor.value.trim()) return;
    const name = session?.displayName || session?.global_name || session?.username;
    if (name) { proposalAuthor.value = String(name).slice(0, 80); saveDraft(); }
  }
  function buildCharacterCatalogue(rows) {
    charactersById = new Map();
    aliases = new Map();
    datalist.replaceChildren();
    const seenLabels = new Set();
    for (const item of Array.isArray(rows) ? rows : []) {
      if (item?.player_Character !== true || !item.id) continue;
      const id = String(item.id);
      const name = String(item.nameKey || item.nameFr || item.nameEn || id);
      const character = { id, name, portrait: item.portraitUrl || item.portrait || "" };
      charactersById.set(id, character);
      for (const value of [id, name, item.nameFr, item.nameEn]) {
        const key = normalize(value);
        if (!key) continue;
        // En cas d'alias ambigu, exiger l'identifiant interne exact.
        if (aliases.has(key) && aliases.get(key)?.id !== id) aliases.set(key, null);
        else if (!aliases.has(key)) aliases.set(key, character);
      }
      if (!seenLabels.has(name)) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.label = id;
        datalist.appendChild(opt);
        seenLabels.add(name);
      }
    }
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
  function renderPublished(defenses) {
    publishedNode.replaceChildren();
    const list = Array.isArray(defenses) ? defenses : [];
    let count = 0;
    for (const room of rooms) {
      const section = make("section", "cosmicRoom");
      section.appendChild(make("h3", "", room.label));
      if (room.rule) section.appendChild(make("p", "cosmicRoomRule", room.rule));
      const entries = list.filter(d => Number(d?.room) === room.id && Array.isArray(d.characters)
        && d.characters.length === 5 && new Set(d.characters).size === 5);
      if (!entries.length) section.appendChild(make("p", "cosmicEmpty", "Aucune défense publiée dans cette salle."));
      for (const entry of entries) {
        count++;
        const card = make("article", "cosmicDefense");
        card.appendChild(make("p", "cosmicDefenseTitle", safeText(entry.name || "Composition proposée", 120)));
        const portraits = make("div", "cosmicPortraits");
        for (const id of entry.characters) portraits.appendChild(portrait(id));
        card.appendChild(portraits);
        const credit = [entry.source && "Source : " + safeText(entry.source, 100),
          entry.author && "Proposé par : " + safeText(entry.author, 80)].filter(Boolean).join(" · ");
        if (credit) card.appendChild(make("p", "cosmicDefenseMeta", credit));
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
    publishedStatus.textContent = count
      ? count + " composition(s) publiée(s)."
      : "Aucune composition validée pour le moment. Tu peux déjà préparer et partager tes défenses.";
  }
  function renderProposals() {
    proposalsNode.replaceChildren();
    const draft = loadDraft();
    proposalAuthor.value = safeText(draft.author, 80);
    proposalSource.value = safeText(draft.source, 160);
    for (const room of rooms) {
      const state = draft.rooms?.[room.id] || {};
      const section = make("section", "cosmicRoom");
      section.dataset.cosmicRoom = String(room.id);
      section.appendChild(make("h3", "", room.label));
      if (room.rule) section.appendChild(make("p", "cosmicRoomRule", room.rule));
      const inputs = make("div", "cosmicInputs");
      for (let i = 0; i < 5; i++) {
        const input = make("input", "select");
        input.type = "text";
        input.setAttribute("list", "cosmicCharacters");
        input.dataset.cosmicCharacter = String(i);
        input.placeholder = "Personnage " + (i + 1);
        input.autocomplete = "off";
        input.maxLength = 90;
        input.setAttribute("aria-label", room.label + " — personnage " + (i + 1));
        const stored = safeText(state.characters?.[i], 90);
        input.value = charactersById.get(stored)?.name || stored;
        inputs.appendChild(input);
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
    }
  }
  function buildSubmission() {
    const author = safeText(proposalAuthor.value, 80);
    if (!author) throw new Error("Indique ton pseudo avant de partager.");
    const selectedRooms = [];
    for (const room of rooms) {
      const section = proposalsNode.querySelector('[data-cosmic-room="' + room.id + '"]');
      const values = [...section.querySelectorAll("[data-cosmic-character]")].map(input => input.value.trim());
      const filled = values.filter(Boolean).length;
      if (!filled) continue;
      if (filled !== 5) throw new Error(room.label + " : complète les 5 personnages ou laisse cette salle vide.");
      const resolved = values.map(resolveCharacter);
      if (resolved.some(value => !value)) throw new Error(room.label + " : un personnage n'est pas reconnu dans le catalogue MSF.");
      const ids = resolved.map(value => value.id);
      if (new Set(ids).size !== 5) throw new Error(room.label + " : un personnage est sélectionné plusieurs fois.");
      selectedRooms.push({
        room: room.id,
        label: room.label,
        characters: ids,
        notes: safeText(section.querySelector("[data-cosmic-note]")?.value, 250)
      });
    }
    if (!selectedRooms.length) throw new Error("Renseigne au moins une salle complète.");
    return {
      schemaVersion: 1,
      mode: "cosmic-crucible",
      author,
      source: safeText(proposalSource.value, 160) || "Proposition personnelle",
      rooms: selectedRooms
    };
  }
  function shareMessage(submission) {
    const result = ["🌌 Épreuve cosmique — proposition de défenses",
      "Auteur : " + submission.author, "Source : " + submission.source, ""];
    for (const room of submission.rooms) {
      result.push("🛡️ " + room.label + " :");
      result.push(room.characters.map(id => charactersById.get(id)?.name || id).join(" · "));
      if (room.notes) result.push("Note : " + room.notes);
      result.push("");
    }
    result.push("Proposition à vérifier avant publication dans la Web-app LoSP.");
    return result.join("\n");
  }
  async function shareSubmission() {
    shareFallback.hidden = true;
    let message;
    try { message = shareMessage(buildSubmission()); }
    catch (error) { proposalStatus.textContent = error.message; return; }
    saveDraft();
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Défenses Épreuve cosmique — LoSP", text: message });
        proposalStatus.textContent = "Partage lancé. La publication nécessite encore une validation.";
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard indisponible");
      await navigator.clipboard.writeText(message);
      proposalStatus.textContent = "Proposition copiée. Colle-la dans Discord et envoie-la pour validation.";
      return;
    } catch (_) {
      shareFallback.value = message;
      shareFallback.hidden = false;
      shareFallback.focus();
      shareFallback.select();
      proposalStatus.textContent = "Copie le texte ci-dessous et envoie-le sur Discord pour validation.";
    }
  }
  async function boot() {
    try {
      const [config, published, chars] = await Promise.all([
        fetchJson(DATA.config), fetchJson(DATA.defenses), fetchJson(DATA.characters)
      ]);
      const configRooms = Array.isArray(config?.rooms) ? config.rooms : [];
      rooms = configRooms
        .filter(r => Number.isInteger(r?.id) && r.id >= 1 && r.id <= 6)
        .slice(0, 6)
        .map(r => ({ id: r.id, label: safeText(r.label, 80) || "Salle " + r.id,
          rule: safeText(r.rule, 800) }));
      if (rooms.length !== 6 || new Set(rooms.map(r => r.id)).size !== 6)
        throw new Error("Configuration des six salles invalide.");
      buildCharacterCatalogue(chars);
      renderPublished(published);
      renderProposals();
      fillAuthorFromSession(window.LoSP_SESSION);
      window.addEventListener("losp:auth-ready", event => fillAuthorFromSession(event.detail));
      proposalsNode.addEventListener("input", saveDraft);
      proposalAuthor.addEventListener("input", saveDraft);
      proposalSource.addEventListener("input", saveDraft);
      shareButton.addEventListener("click", shareSubmission);
      proposalStatus.textContent = "Sélectionne des personnages puis partage ta composition.";
    } catch (error) {
      publishedStatus.textContent = "Impossible de charger les défenses : " + error.message;
      proposalStatus.textContent = "Le formulaire n'est pas disponible.";
      shareButton.disabled = true;
    }
  }
  boot();
})();
