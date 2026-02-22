// docs/war-counters.js
(() => {
  const FILES = {
    warCounters: "./data/war-counters.json",
    joueurs: "./data/joueurs.json",
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
    const res = await fetch(bust(url), { cache: "no-store" });
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return res.json();
  }

  function clearNode(el) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function parseNumberLoose(x) {
    if (x == null) return 0;
    const s = String(x).trim();
    if (!s) return 0;
    return Number(s.replace(/[^\d]/g, "")) || 0;
  }

  // ---------- Data ----------
  let WAR = [];
  let JOUEURS = [];
  let PLAYERS_BY_ALLIANCE = new Map();

  // ---------- Helpers (FIX) ----------
  // Une ligne est un "vrai counter" si:
  // - soit atk_team est renseigné
  // - soit au moins un atk_char est renseigné
  function isRealCounterRow(r) {
    const hasTeam = !!(r.atk_team && r.atk_team.trim());
    const hasAnyAtkChar = Array.isArray(r.atk_chars) && r.atk_chars.some((c) => (c || "").trim());
    return hasTeam || hasAnyAtkChar;
  }

  // ---------- Parsing ----------
  function normalizeWarRow(r) {
    const atkChars = [
      r.atk_char1,
      r.atk_char2,
      r.atk_char3,
      r.atk_char4,
      r.atk_char5,
    ].map((x) => (x == null ? "" : String(x)).trim());

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
        .map((x) => (x == null ? "" : String(x)).trim())
        .filter(Boolean),

      atk_team: (r.atk_team || "").trim(),

      // IMPORTANT : on garde les cases vides (défense sans contre possible)
      atk_chars: atkChars,

      min_ratio_ok: parseNumberLoose(r.min_ratio_ok),
      min_ratio_safe: parseNumberLoose(r.min_ratio_safe),

      notes: (r.notes || "").trim(),
    };
  }

  function buildPlayersByAlliance() {
    PLAYERS_BY_ALLIANCE = new Map();
    for (const j of JOUEURS) {
      const a = (j.alliance || "").trim();
      const p = (j.player || "").trim();
      if (!a || !p) continue;

      if (!PLAYERS_BY_ALLIANCE.has(a)) PLAYERS_BY_ALLIANCE.set(a, []);
      PLAYERS_BY_ALLIANCE.get(a).push({ alliance: a, player: p });
    }
  }

  // ---------- Selects ----------
  function renderAllianceOptions() {
    allianceSelect.innerHTML = "<option value=''>Alliance</option>";

    const alliances = [...new Set(JOUEURS.map((j) => (j.alliance || "").trim()).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b, "fr")
    );

    alliances.forEach((a) => {
      const opt = document.createElement("option");
      opt.value = a;
      opt.textContent = a;
      allianceSelect.appendChild(opt);
    });
  }

  function renderPlayerOptions() {
    const alliance = (allianceSelect.value || "").trim();
    playerSelect.innerHTML = "<option value=''>Joueur</option>";

    if (!alliance) return;

    const players = (PLAYERS_BY_ALLIANCE.get(alliance) || [])
      .slice()
      .sort((a, b) => a.player.localeCompare(b.player, "fr"));

    players.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.player;
      opt.textContent = p.player;
      playerSelect.appendChild(opt);
    });
  }

  function renderDefFamilyOptions() {
    const families = [...new Set(WAR.map((r) => (r.def_family || "").trim()).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b, "fr")
    );

    defFamilySelect.innerHTML = "<option value=''>Famille</option>";

    families.forEach((f) => {
      const opt = document.createElement("option");
      opt.value = f;
      opt.textContent = f;
      defFamilySelect.appendChild(opt);
    });

    // reset dépendants
    defVariantSelect.innerHTML = "<option value=''>Variante</option>";
  }

  function renderDefVariantOptions() {
    const fam = (defFamilySelect.value || "").trim();

    defVariantSelect.innerHTML = "<option value=''>Variante</option>";
    if (!fam) return;

    const variants = WAR.filter((r) => (r.def_family || "").trim() === fam)
      .map((r) => (r.def_variant || "").trim())
      .filter(Boolean);

    [...new Set(variants)]
      .sort((a, b) => a.localeCompare(b, "fr"))
      .forEach((v) => {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v;
        defVariantSelect.appendChild(opt);
      });
  }

  function getSelectedDefRow() {
    const fam = (defFamilySelect.value || "").trim();
    const vari = (defVariantSelect.value || "").trim();
    if (!fam || !vari) return null;

    return (
      WAR.find(
        (r) => (r.def_family || "").trim() === fam && (r.def_variant || "").trim() === vari
      ) || null
    );
  }

  // ---------- UI ----------
  function renderDefenseHeader() {
    clearNode(defPortraits);

    const row = getSelectedDefRow();
    if (!row) {
      defTitle.textContent = "—";
      return;
    }

    defTitle.textContent = row.def_variant || row.def_family || "Défense";

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
    const player = (playerSelect.value || "").trim();

    if (playerChip) playerChip.textContent = player || "—";

    if (!row || !player) {
      resultsCount.textContent = "0";
      return;
    }

    // ✅ FIX: on ne garde que les vrais counters (team ou au moins 1 atk_char)
    const rows = WAR
      .filter(
        (r) =>
          (r.def_family || "").trim() === (row.def_family || "").trim() &&
          (r.def_variant || "").trim() === (row.def_variant || "").trim()
      )
      .filter(isRealCounterRow);

    // Aucun counter réel => message
    if (!rows.length) {
      resultsCount.textContent = "0";

      const empty = document.createElement("p");
      empty.className = "subtitle";
      empty.textContent = "Aucun counter renseigné pour cette défense.";
      resultsWrap.appendChild(empty);
      return;
    }

    resultsCount.textContent = String(rows.length);

    rows.forEach((r) => {
      const div = document.createElement("div");
      div.className = "rankRow";

      // Affiche un libellé correct même si atk_team est vide
      const label =
        (r.atk_team || "").trim() ||
        r.atk_chars.filter((c) => (c || "").trim()).join(" • ") ||
        "Counter";

      div.textContent = label;
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

    WAR = (Array.isArray(warRaw) ? warRaw : []).map(normalizeWarRow);
    JOUEURS = Array.isArray(joueursRaw) ? joueursRaw : [];

    buildPlayersByAlliance();

    renderAllianceOptions();
    renderPlayerOptions();
    renderDefFamilyOptions();

    // init UI
    if (playerChip) playerChip.textContent = "—";
    resultsCount.textContent = "0";
    defTitle.textContent = "—";
  }

  boot().catch((e) => console.error(e));
})();