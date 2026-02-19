(() => {
  const FILES = {
    teams: "./data/teams.json",
    characters: "./data/msf-characters.json",
    joueurs: "./data/joueurs.json",
    rosters: "./data/rosters.json",
  };

  const ALLIANCE_EMOJI = {
    zeus: "⚡",
    dionysos: "🍇",
    poséidon: "🔱",
    poseidon: "🔱",
  };

  const qs = (s) => document.querySelector(s);

  const teamSelect = qs("#teamSelect");
  const btnRefresh = qs("#refreshBtn");
  const teamTitle = qs("#teamTitle");
  const portraitsWrap = qs("#portraits");
  const playersWrap = qs("#players");
  const playersCount = qs("#playersCount");

  let TEAMS = [];
  let JOUEURS = [];
  let ROSTERS = [];
  let CHAR_MAP = new Map();

  /* -------------------------------------------------- */
  /* Helpers                                            */
  /* -------------------------------------------------- */

  const bust = (url) => {
    const u = new URL(url, window.location.href);
    u.searchParams.set("v", Date.now());
    return u.toString();
  };

  async function fetchJson(url) {
    const res = await fetch(bust(url), { cache: "no-store" });
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return res.json();
  }

  // Normalisation "forte" pour matcher quasiment tout
  const normalizeKey = (s) =>
    (s || "")
      .toString()
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // accents
      .replace(/['".’]/g, "")          // apostrophes/quotes
      .replace(/[^a-z0-9]+/g, "")      // espaces, tirets, underscores, etc.
      .trim();

  const formatPower = (n) => Number(n || 0).toLocaleString("de-DE"); // 1.234.567

  function clear(el) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function addCharKey(key, obj) {
    const k = normalizeKey(key);
    if (!k) return;
    if (!CHAR_MAP.has(k)) CHAR_MAP.set(k, obj);
  }

  function buildCharMap(charsRaw) {
    CHAR_MAP = new Map();

    (charsRaw || []).forEach((c) => {
      // On essaie d’enregistrer un max de variantes
      [
        c.nameKey,
        c.id,
        c.name,
        c.nameEn,
        c.nameFr,
        c.slug,
        c.key,
      ]
        .filter(Boolean)
        .forEach((k) => addCharKey(k, c));

      // Bonus: si portraitUrl existe, on tente aussi le nom de fichier (souvent = key)
      if (c.portraitUrl) {
        const file = c.portraitUrl.split("/").pop() || "";
        const base = file.replace(/\.(png|jpg|jpeg|webp)$/i, "");
        addCharKey(base, c);
      }
    });
  }

  function findCharInfo(nameOrKey) {
    const k = normalizeKey(nameOrKey);
    return CHAR_MAP.get(k) || null;
  }

  /* -------------------------------------------------- */
  /* Chargement                                         */
  /* -------------------------------------------------- */

  async function refreshAll() {
    try {
      const [teamsRaw, charsRaw, joueursRaw, rostersRaw] = await Promise.all([
        fetchJson(FILES.teams),
        fetchJson(FILES.characters),
        fetchJson(FILES.joueurs),
        fetchJson(FILES.rosters),
      ]);

      TEAMS = teamsRaw || [];
      JOUEURS = joueursRaw || [];
      ROSTERS = rostersRaw || [];

      buildCharMap(charsRaw);

      renderTeamOptions();

      const selected = teamSelect?.value || "";
      if (selected) renderTeam(selected);

      renderPlayersRanking(); // dépend de teamSelect + TEAMS + ROSTERS

    } catch (e) {
      console.error(e);
    }
  }

  /* -------------------------------------------------- */
  /* Teams                                              */
  /* -------------------------------------------------- */

  function renderTeamOptions() {
    if (!teamSelect) return;

    teamSelect.innerHTML = `<option value="">— Choisir —</option>`;
    TEAMS.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.team;
      opt.textContent = t.team;
      teamSelect.appendChild(opt);
    });
  }

  function renderTeam(teamName) {
    clear(portraitsWrap);
    if (teamTitle) teamTitle.textContent = teamName || "—";
    if (!teamName) return;

    const teamObj = TEAMS.find((t) => t.team === teamName);
    if (!teamObj) return;

    (teamObj.characters || []).forEach((charName) => {
      const info = findCharInfo(charName);

      const card = document.createElement("div");
      card.className = "portraitCard";

      const img = document.createElement("img");
      img.className = "portraitImg";
      img.alt = charName;
      img.loading = "lazy";

      // Si pas trouvé, on met une image vide (évite l’ALT qui s’affiche en gros)
      // + et on ajoute une classe "missing" si tu veux styliser plus tard
      if (info?.portraitUrl) {
        img.src = info.portraitUrl;
      } else {
        img.src = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="; // pixel transparent
        card.classList.add("missing");
      }

      card.appendChild(img);
      portraitsWrap.appendChild(card);
    });
  }

  /* -------------------------------------------------- */
  /* Ranking                                            */
  /* -------------------------------------------------- */

  function renderPlayersRanking() {
    clear(playersWrap);

    const selectedTeam = teamSelect?.value || "";
    if (!selectedTeam) {
      if (playersCount) playersCount.textContent = "0";
      return;
    }

    const teamObj = TEAMS.find((t) => t.team === selectedTeam);
    if (!teamObj) {
      if (playersCount) playersCount.textContent = "0";
      return;
    }

    if (!ROSTERS?.length) {
      if (playersCount) playersCount.textContent = "0";
      return;
    }

    const ranking = [];

    // Pour chaque joueur, somme des 5 persos (les clés roster sont des nameKey)
    ROSTERS.forEach((playerRoster) => {
      let total = 0;

      (teamObj.characters || []).forEach((charDisplayName) => {
        // On retrouve d'abord le perso via CHAR_MAP, puis on prend sa vraie clé roster (nameKey)
        const info = findCharInfo(charDisplayName);
        const rosterKey = info?.nameKey ? normalizeKey(info.nameKey) : normalizeKey(charDisplayName);

        total += Number(playerRoster?.chars?.[rosterKey] || 0);
      });

      ranking.push({ player: playerRoster.player, power: total });
    });

    ranking.sort((a, b) => b.power - a.power);
    if (playersCount) playersCount.textContent = String(ranking.length);

    const list = document.createElement("div");
    list.className = "rankList";

    ranking.forEach((r, index) => {
      const joueurRow = JOUEURS.find((j) => normalizeKey(j.player) === normalizeKey(r.player));
      const allianceKey = normalizeKey(joueurRow?.alliance);
      const emoji = ALLIANCE_EMOJI[allianceKey] || "•";

      const row = document.createElement("div");
      row.className = "rankRow";

      const left = document.createElement("div");
      left.className = "rankLeft";

      const num = document.createElement("div");
      num.className = "rankNum";
      num.textContent = index + 1;

      const name = document.createElement("div");
      name.className = "rankName";
      name.textContent = `${emoji} ${r.player}`;

      const power = document.createElement("div");
      power.className = "rankPower";
      power.textContent = formatPower(r.power);

      left.appendChild(num);
      left.appendChild(name);

      row.appendChild(left);
      row.appendChild(power);

      list.appendChild(row);
    });

    playersWrap.appendChild(list);
  }

  /* -------------------------------------------------- */

  btnRefresh?.addEventListener("click", refreshAll);

  teamSelect?.addEventListener("change", () => {
    renderTeam(teamSelect.value);
    renderPlayersRanking();
  });

  refreshAll();
})();