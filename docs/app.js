(() => {
  const FILES = {
    teams: "./data/teams.json",
    characters: "./data/msf-characters.json",
    joueurs: "./data/joueurs.json",
    rosters: "./data/rosters.json",
  };

  const qs = (s) => document.querySelector(s);

  const teamSelect = qs("#teamSelect");
  const teamTitle = qs("#teamTitle");
  const portraitsWrap = qs("#portraits");
  const playersWrap = qs("#players");
  const playersCount = qs("#playersCount");

  // Filtres
  const filterZeus = qs("#filterZeus");
  const filterDionysos = qs("#filterDionysos");
  const filterPoseidon = qs("#filterPoseidon");

  let TEAMS = [];
  let JOUEURS = [];
  let ROSTERS = [];
  let CHAR_MAP = new Map();

  /* ---------------- Helpers ---------------- */

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

  const normalizeKey = (s) =>
    (s || "")
      .toString()
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/['".’]/g, "")
      .replace(/[^a-z0-9]+/g, "")
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

      if (c.portraitUrl) {
        const file = c.portraitUrl.split("/").pop() || "";
        const base = file.replace(/\.(png|jpg|jpeg|webp)$/i, "");
        addCharKey(base, c);
      }
    });
  }

  function findCharInfo(nameOrKey) {
    return CHAR_MAP.get(normalizeKey(nameOrKey)) || null;
  }

  function allianceEmoji(alliance) {
    const a = normalizeKey(alliance);
    if (a === "zeus") return "⚡";
    if (a === "dionysos") return "🍇";
    if (a === "poseidon" || a === "posedion" || a === "posedidon" || a === "posedon") return "🔱";
    return "•";
  }

  function isAllianceAllowed(alliance) {
    const a = normalizeKey(alliance);
    if (a === "zeus") return !!filterZeus?.checked;
    if (a === "dionysos") return !!filterDionysos?.checked;
    if (a === "poseidon" || a === "posedion" || a === "posedidon" || a === "posedon") return !!filterPoseidon?.checked;
    return true; // évite de “perdre” un joueur si valeur imprévue
  }

  /* ---------------- Render Teams ---------------- */

  function renderTeamOptions() {
    if (!teamSelect) return;

    // tri alphabétique FR
    const sorted = [...TEAMS].sort((a, b) =>
      (a.team || "").localeCompare((b.team || ""), "fr", { sensitivity: "base" })
    );

    teamSelect.innerHTML = `<option value="">— Choisir —</option>`;
    sorted.forEach((t) => {
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
      img.alt = "";
      img.loading = "lazy";

      if (info?.portraitUrl) {
        img.src = info.portraitUrl;
      } else {
        img.src = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
      }

      card.appendChild(img);
      portraitsWrap.appendChild(card);
    });
  }

  /* ---------------- Ranking ---------------- */

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

    // Index JOUEURS par nom normalisé
    const joueursByName = new Map();
    (JOUEURS || []).forEach((j) => {
      const key = normalizeKey(j.player);
      if (key) joueursByName.set(key, j);
    });

    const ranking = [];

    ROSTERS.forEach((playerRoster) => {
      const playerName = playerRoster.player || "";
      const j = joueursByName.get(normalizeKey(playerName));
      const alliance = j?.alliance || "";

      // Filtre d’alliance
      if (!isAllianceAllowed(alliance)) return;

      let total = 0;

      (teamObj.characters || []).forEach((charDisplayName) => {
        const info = findCharInfo(charDisplayName);
        const rosterKey = info?.nameKey ? normalizeKey(info.nameKey) : normalizeKey(charDisplayName);
        total += Number(playerRoster?.chars?.[rosterKey] || 0);
      });

      ranking.push({ player: playerName, alliance, power: total });
    });

    ranking.sort((a, b) => b.power - a.power);
    if (playersCount) playersCount.textContent = String(ranking.length);

    const list = document.createElement("div");
    list.className = "rankList";

    ranking.forEach((r, idx) => {
      const row = document.createElement("div");
      row.className = "rankRow";

      const left = document.createElement("div");
      left.className = "rankLeft";

      const num = document.createElement("div");
      num.className = "rankNum";
      num.textContent = idx + 1;

      const name = document.createElement("div");
      name.className = "rankName";
      name.textContent = `${allianceEmoji(r.alliance)} ${r.player}`;

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

  /* ---------------- Load ---------------- */

  async function loadAll() {
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

      renderPlayersRanking();
    } catch (e) {
      console.error(e);
      if (playersCount) playersCount.textContent = "0";
    }
  }

  /* ---------------- Events ---------------- */

  teamSelect?.addEventListener("change", () => {
    renderTeam(teamSelect.value);
    renderPlayersRanking();
  });

  const onFilterChange = () => renderPlayersRanking();
  filterZeus?.addEventListener("change", onFilterChange);
  filterDionysos?.addEventListener("change", onFilterChange);
  filterPoseidon?.addEventListener("change", onFilterChange);

  loadAll();
})();