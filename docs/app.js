(() => {
  const FILES = {
    teams: "./data/teams.json",
    characters: "./data/msf-characters.json",
    joueurs: "./data/joueurs.json",
    rosters: "./data/rosters.json"
  };

  const ALLIANCE_EMOJI = {
    zeus: "⚡",
    dionysos: "🍇",
    poséidon: "🔱",
    poseidon: "🔱"
  };

  const qs = (s) => document.querySelector(s);

  const teamSelect   = qs("#teamSelect");
  const btnRefresh   = qs("#refreshBtn");
  const teamTitle    = qs("#teamTitle");
  const portraitsWrap = qs("#portraits");
  const playersWrap   = qs("#players");
  const playersCount  = qs("#playersCount");

  let TEAMS = [];
  let CHAR_MAP = new Map();
  let JOUEURS = [];
  let ROSTERS = [];

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

  const normalize = (s) =>
    (s || "")
      .toString()
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const formatPower = (n) =>
    Number(n || 0).toLocaleString("de-DE"); // <-- séparateur avec points

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  /* -------------------------------------------------- */
  /* Chargement                                         */
  /* -------------------------------------------------- */

  async function refreshAll() {
    try {
      const [teamsRaw, charsRaw, joueursRaw, rostersRaw] =
        await Promise.all([
          fetchJson(FILES.teams),
          fetchJson(FILES.characters),
          fetchJson(FILES.joueurs),
          fetchJson(FILES.rosters)
        ]);

      TEAMS = teamsRaw || [];
      JOUEURS = joueursRaw || [];
      ROSTERS = rostersRaw || [];

      CHAR_MAP = new Map();
      (charsRaw || []).forEach((c) => {
        if (c.nameKey) {
          CHAR_MAP.set(normalize(c.nameKey), c);
        }
      });

      renderTeamOptions();
      renderPlayersRanking();

      const selected = teamSelect?.value;
      if (selected) renderTeam(selected);

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
    teamTitle.textContent = teamName;

    const teamObj = TEAMS.find(t => t.team === teamName);
    if (!teamObj) return;

    teamObj.characters.forEach(char => {
      const key = normalize(char);
      const info = CHAR_MAP.get(key);

      const card = document.createElement("div");
      card.className = "portraitCard";

      const img = document.createElement("img");
      img.className = "portraitImg";
      img.src = info?.portraitUrl || "";
      img.alt = char;
      img.loading = "lazy";

      card.appendChild(img);
      portraitsWrap.appendChild(card);
    });
  }

  /* -------------------------------------------------- */
  /* Ranking                                            */
  /* -------------------------------------------------- */

  function renderPlayersRanking() {
    clear(playersWrap);

    if (!ROSTERS.length) return;

    const selectedTeam = teamSelect?.value;
    if (!selectedTeam) return;

    const teamObj = TEAMS.find(t => t.team === selectedTeam);
    if (!teamObj) return;

    const ranking = [];

    ROSTERS.forEach(playerRoster => {
      let total = 0;

      teamObj.characters.forEach(char => {
        const key = normalize(char);
        total += playerRoster.chars?.[key] || 0;
      });

      ranking.push({
        player: playerRoster.player,
        power: total
      });
    });

    ranking.sort((a, b) => b.power - a.power);

    playersCount.textContent = ranking.length;

    const list = document.createElement("div");
    list.className = "rankList";

    ranking.forEach((r, index) => {

      const joueur = JOUEURS.find(j =>
        normalize(j.player) === normalize(r.player)
      );

      const allianceKey = normalize(joueur?.alliance);
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