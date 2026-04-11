(() => {
  const FILES = {
    warCounters: "./data/war-counters.json",
    joueurs: "./data/joueurs.json",
    characters: "./data/msf-characters.json",
    rosters: "./data/rosters.json",
  };

  const ALLIANCE_EMOJI = {
    Zeus: "⚡️",
    Dionysos: "🍇",
    "Poséidon": "🔱",
    Poseidon: "🔱",
  };

  const qs = (s) => document.querySelector(s);

  const allianceSelect = qs("#allianceSelect");
  const playerSelect = qs("#playerSelect");

  const atkFamilySelect = qs("#atkFamilySelect");
  const atkTeamSelect = qs("#atkTeamSelect");

  const atkTitle = qs("#atkTitle");
  const atkPortraits = qs("#atkPortraits");

  const resultsWrap = qs("#results");
  const resultsCount = qs("#resultsCount");
  const playerChip = qs("#playerChip");

  // ---------- utils ----------
  const bust = (url) => {
    const u = new URL(url, window.location.href);
    u.searchParams.set("v", Date.now());
    return u.toString();
  };

  async function fetchJson(url) {
    const res = await fetch(bust(url), { cache: "no-store" });
    return res.json();
  }

  const normalizeKey = (s) =>
    (s ?? "")
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[-_‐-‒–—―﹘﹣－]/g, "")
      .replace(/[’'`´]/g, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  function formatThousandsDot(n) {
    return Math.trunc(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function clearNode(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  // ---------- DATA ----------
  let WAR = [];
  let JOUEURS = [];
  let ROSTERS = new Map();
  let CHAR_MAP = new Map();
  let PLAYERS_BY_ALLIANCE = new Map();

  function buildCharMap(chars) {
    CHAR_MAP = new Map();
    chars.forEach((c) => {
      [c.id, c.nameKey, c.nameFr, c.nameEn].forEach((k) => {
        if (!k) return;
        CHAR_MAP.set(normalizeKey(k), c);
      });
    });
  }

  function getPortrait(name) {
    return CHAR_MAP.get(normalizeKey(name))?.portraitUrl || "";
  }

  function buildRosterMap(data) {
    ROSTERS = new Map();

    data.forEach((r) => {
      const key = normalizeKey(r.player);
      const map = {};

      Object.entries(r.chars || {}).forEach(([k, v]) => {
        map[normalizeKey(k)] =
          typeof v === "object" ? Number(v.power) || 0 : Number(v) || 0;
      });

      ROSTERS.set(key, map);
    });
  }

  function getTeamPower(player, chars) {
    const roster = ROSTERS.get(normalizeKey(player));
    if (!roster) return 0;

    return chars.reduce((sum, c) => {
      return sum + (roster[normalizeKey(c)] || 0);
    }, 0);
  }

  // ---------- SELECTS ----------
  function buildPlayersByAlliance() {
    PLAYERS_BY_ALLIANCE = new Map();

    JOUEURS.forEach((j) => {
      if (!PLAYERS_BY_ALLIANCE.has(j.alliance))
        PLAYERS_BY_ALLIANCE.set(j.alliance, []);

      PLAYERS_BY_ALLIANCE.get(j.alliance).push(j.player);
    });
  }

  function renderAllianceOptions() {
    allianceSelect.innerHTML = `<option value="">— Alliance —</option>`;

    [...new Set(JOUEURS.map((j) => j.alliance))].forEach((a) => {
      const opt = document.createElement("option");
      opt.value = a;
      opt.textContent = `${ALLIANCE_EMOJI[a] || ""} ${a}`;
      allianceSelect.appendChild(opt);
    });
  }

  function renderPlayerOptions() {
    playerSelect.innerHTML = `<option value="">— Joueur —</option>`;

    const list = PLAYERS_BY_ALLIANCE.get(allianceSelect.value) || [];

    list.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p;
      opt.textContent = p;
      playerSelect.appendChild(opt);
    });
  }

  function renderAtkFamilies() {
    atkFamilySelect.innerHTML = `<option value="">— Famille —</option>`;

    const families = [...new Set(WAR.map((r) => r.atk_family).filter(Boolean))];

    families.sort().forEach((f) => {
      const opt = document.createElement("option");
      opt.value = f;
      opt.textContent = f;
      atkFamilySelect.appendChild(opt);
    });
  }

  function renderAtkTeams() {
    atkTeamSelect.innerHTML = `<option value="">— Variante —</option>`;

    const fam = atkFamilySelect.value;

    WAR.filter((r) => r.atk_family === fam)
      .map((r) => r.atk_team)
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort()
      .forEach((t) => {
        const opt = document.createElement("option");
        opt.value = t;
        opt.textContent = t;
        atkTeamSelect.appendChild(opt);
      });
  }

  // ---------- UI ----------
  function renderAttack() {
    clearNode(atkPortraits);

    const row = WAR.find((r) => r.atk_team === atkTeamSelect.value);
    if (!row) return;

    atkTitle.textContent = row.atk_team;

    row.atk_chars.forEach((c) => {
      if (!c) return;

      const img = document.createElement("img");
      img.src = getPortrait(c);
      img.className = "portraitImg";
      atkPortraits.appendChild(img);
    });
  }

  function renderResults() {
    clearNode(resultsWrap);

    const player = playerSelect.value;
    const row = WAR.find((r) => r.atk_team === atkTeamSelect.value);

    if (!player || !row) return;

    const atkChars = row.atk_chars.filter(Boolean);
    const power = getTeamPower(player, atkChars);

    const results = WAR.map((r) => {
      const ratio = power / (r.min_ok * 1000000 || 1); // simplifié

      return { r, ratio, power };
    })
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 20);

    resultsCount.textContent = results.length;
    playerChip.textContent = player;

    results.forEach(({ r }) => {
      const div = document.createElement("div");
      div.className = "counterCard";

      div.textContent = r.def_team || r.def_variant;

      resultsWrap.appendChild(div);
    });
  }

  // ---------- EVENTS ----------
  allianceSelect.addEventListener("change", () => {
    renderPlayerOptions();
  });

  atkFamilySelect.addEventListener("change", () => {
    renderAtkTeams();
  });

  atkTeamSelect.addEventListener("change", () => {
    renderAttack();
    renderResults();
  });

  playerSelect.addEventListener("change", renderResults);

  // ---------- BOOT ----------
  async function boot() {
    const [war, joueurs, chars, rosters] = await Promise.all([
      fetchJson(FILES.warCounters),
      fetchJson(FILES.joueurs),
      fetchJson(FILES.characters),
      fetchJson(FILES.rosters),
    ]);

    WAR = war;
    JOUEURS = joueurs;

    buildCharMap(chars);
    buildRosterMap(rosters);
    buildPlayersByAlliance();

    renderAllianceOptions();
    renderAtkFamilies();
  }

  boot();
})();
