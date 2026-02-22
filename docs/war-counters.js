// docs/war-counters.js
(() => {
  const FILES = {
    warCounters: "./data/war-counters.json",
    characters: "./data/msf-characters.json",
    joueurs: "./data/joueurs.json",
    rosters: "./data/rosters.json",
  };

  const qs = (s) => document.querySelector(s);

  const allianceSelect = qs("#allianceSelect");
  const playerSelect = qs("#playerSelect");
  const defFamilySelect = qs("#defFamilySelect");
  const defVariantSelect = qs("#defVariantSelect");
  const enemyPowerInput = qs("#enemyPower");

  const defTitle = qs("#defTitle");
  const defPortraits = qs("#defPortraits");

  const resultsWrap = qs("#results");
  const resultsCount = qs("#resultsCount");
  const playerChip = qs("#playerChip");

  // ---------- Utils ----------
  const bust = (url) => {
    const u = new URL(url, window.location.href);
    u.searchParams.set("v", Date.now().toString());
    return u.toString();
  };

  async function fetchJson(url) {
    const res = await fetch(bust(url));
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return res.json();
  }

  const normalizeKey = (s) =>
    (s ?? "")
      .toString()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[-_]/g, "");

  function clearNode(el) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function parseNumberLoose(x) {
    if (!x) return 0;
    return Number(String(x).replace(/[^\d]/g, "")) || 0;
  }

  // ---------- Data ----------
  let WAR = [];
  let JOUEURS = [];
  let PLAYERS_BY_ALLIANCE = new Map();

  // ---------- Parsing ----------
  function normalizeWarRow(r) {
    return {
      def_family: (r.def_family || "").trim(),
      def_variant: (r.def_variant || "").trim(),
      def_key: (r.def_key || "").trim(),

      def_chars: [
        r.def_char1,
        r.def_char2,
        r.def_char3,
        r.def_char4,
        r.def_char5,
      ]
        .map((x) => (x || "").trim())
        .filter(Boolean),

      atk_team: (r.atk_team || "").trim(),

      // 🔥 IMPORTANT → on garde même vide
      atk_chars: [
        r.atk_char1,
        r.atk_char2,
        r.atk_char3,
        r.atk_char4,
        r.atk_char5,
      ].map((x) => (x || "").trim()),

      min_ratio_ok: parseNumberLoose(r.min_ratio_ok),
      min_ratio_safe: parseNumberLoose(r.min_ratio_safe),

      notes: (r.notes || "").trim(),
    };
  }

  function buildPlayersByAlliance() {
    PLAYERS_BY_ALLIANCE = new Map();

    for (const j of JOUEURS) {
      if (!PLAYERS_BY_ALLIANCE.has(j.alliance)) {
        PLAYERS_BY_ALLIANCE.set(j.alliance, []);
      }
      PLAYERS_BY_ALLIANCE.get(j.alliance).push(j);
    }
  }

  // ---------- Selects ----------
  function renderAllianceOptions() {
    allianceSelect.innerHTML = "<option value=''>Alliance</option>";

    const alliances = [...new Set(JOUEURS.map((j) => j.alliance))];

    alliances.forEach((a) => {
      const opt = document.createElement("option");
      opt.value = a;
      opt.textContent = a;
      allianceSelect.appendChild(opt);
    });
  }

  function renderPlayerOptions() {
    const alliance = allianceSelect.value;
    playerSelect.innerHTML = "<option value=''>Joueur</option>";

    if (!alliance) return;

    const players = PLAYERS_BY_ALLIANCE.get(alliance) || [];

    players.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.player;
      opt.textContent = p.player;
      playerSelect.appendChild(opt);
    });
  }

  function renderDefFamilyOptions() {
    const families = [...new Set(WAR.map((r) => r.def_family))];

    defFamilySelect.innerHTML = "<option value=''>Famille</option>";

    families.forEach((f) => {
      const opt = document.createElement("option");
      opt.value = f;
      opt.textContent = f;
      defFamilySelect.appendChild(opt);
    });
  }

  function renderDefVariantOptions() {
    const fam = defFamilySelect.value;

    defVariantSelect.innerHTML = "<option value=''>Variante</option>";

    const variants = WAR.filter((r) => r.def_family === fam).map(
      (r) => r.def_variant
    );

    [...new Set(variants)].forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      defVariantSelect.appendChild(opt);
    });
  }

  function getSelectedDefRow() {
    return WAR.find(
      (r) =>
        r.def_family === defFamilySelect.value &&
        r.def_variant === defVariantSelect.value
    );
  }

  // ---------- UI ----------
  function renderDefenseHeader() {
    clearNode(defPortraits);

    const row = getSelectedDefRow();
    if (!row) return;

    defTitle.textContent = row.def_variant;

    row.def_chars.forEach((c) => {
      const el = document.createElement("div");
      el.className = "portraitCard";
      el.textContent = c;
      defPortraits.appendChild(el);
    });
  }

  function renderResults() {
    clearNode(resultsWrap);

    const row = getSelectedDefRow();
    const player = playerSelect.value;

    if (!row || !player) {
      resultsCount.textContent = "0";
      return;
    }

    const rows = WAR.filter(
      (r) =>
        r.def_family === row.def_family &&
        r.def_variant === row.def_variant
    );

    // 🔥 CAS IMPORTANT
    if (!rows.length || rows.every((r) => r.atk_chars.every((c) => !c))) {
      resultsCount.textContent = "0";

      const empty = document.createElement("p");
      empty.className = "subtitle";
      empty.textContent = "Aucun counter renseigné pour cette défense.";

      resultsWrap.appendChild(empty);
      return;
    }

    resultsCount.textContent = rows.length;

    rows.forEach((r) => {
      const div = document.createElement("div");
      div.className = "rankRow";
      div.textContent = r.atk_team || "Counter";

      resultsWrap.appendChild(div);
    });
  }

  function renderAll() {
    renderDefenseHeader();
    renderResults();
  }

  // ---------- Events ----------
  allianceSelect.addEventListener("change", () => {
    renderPlayerOptions();
    renderAll();
  });

  playerSelect.addEventListener("change", renderAll);

  defFamilySelect.addEventListener("change", () => {
    renderDefVariantOptions();
    renderAll();
  });

  defVariantSelect.addEventListener("change", renderAll);

  enemyPowerInput.addEventListener("input", renderResults);

  // ---------- Boot ----------
  async function boot() {
    const [warRaw, joueursRaw] = await Promise.all([
      fetchJson(FILES.warCounters),
      fetchJson(FILES.joueurs),
    ]);

    WAR = warRaw.map(normalizeWarRow);
    JOUEURS = joueursRaw;

    buildPlayersByAlliance();

    renderAllianceOptions();
    renderPlayerOptions();
    renderDefFamilyOptions();
  }

  boot();
})();