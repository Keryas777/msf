// docs/war-counters.js
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
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  const normalizeKey = (s) =>
    (s ?? "")
      .toString()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[-_]/g, "");

  const parseNumber = (x) =>
    Number(String(x || "").replace(/[^\d]/g, "")) || 0;

  // ---------- DATA ----------
  let WAR = [];
  let JOUEURS = [];
  let ROSTERS = new Map();
  let PLAYERS_BY_ALLIANCE = new Map();
  let CHAR_MAP = new Map();

  // ---------- PARSING ----------
  function normalizeWarRow(r) {
    return {
      def_family: r.def_family?.trim(),
      def_variant: r.def_variant?.trim(),
      def_chars: [
        r.def_char1,
        r.def_char2,
        r.def_char3,
        r.def_char4,
        r.def_char5,
      ].filter(Boolean),

      atk_team: r.atk_team?.trim(),

      atk_chars: [
        r.atk_char1,
        r.atk_char2,
        r.atk_char3,
        r.atk_char4,
        r.atk_char5,
      ].map((x) => x?.trim() || ""),

      min_ok: parseNumber(r.min_ratio_ok),
      min_safe: parseNumber(r.min_ratio_safe),
    };
  }

  function isRealCounter(r) {
    return r.atk_team || r.atk_chars.some((c) => c);
  }

  // ---------- CHAR ----------
  function buildCharMap(chars) {
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

  // ---------- ROSTER ----------
  function buildRosterMap(data) {
    data.forEach((r) => {
      const map = {};
      Object.entries(r.chars || {}).forEach(([k, v]) => {
        map[normalizeKey(k)] = typeof v === "object" ? v.power : v;
      });
      ROSTERS.set(normalizeKey(r.player), map);
    });
  }

  function getPlayerPower(player, chars) {
    const roster = ROSTERS.get(normalizeKey(player));
    if (!roster) return 0;

    return chars.reduce((sum, c) => {
      return sum + (roster[normalizeKey(c)] || 0);
    }, 0);
  }

  // ---------- SELECTS ----------
  function renderAllianceOptions() {
    allianceSelect.innerHTML = `<option value="">Alliance</option>`;

    [...new Set(JOUEURS.map((j) => j.alliance))].forEach((a) => {
      const opt = document.createElement("option");
      opt.value = a;
      opt.textContent = `${ALLIANCE_EMOJI[a] || ""} ${a}`;
      allianceSelect.appendChild(opt);
    });
  }

  function renderPlayerOptions() {
    const a = allianceSelect.value;
    playerSelect.innerHTML = `<option value="">Joueur</option>`;

    (PLAYERS_BY_ALLIANCE.get(a) || []).forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.player;
      opt.textContent = p.player;
      playerSelect.appendChild(opt);
    });
  }

  function renderDefFamilyOptions() {
    defFamilySelect.innerHTML = `<option value="">Famille</option>`;
    [...new Set(WAR.map((r) => r.def_family))].forEach((f) => {
      defFamilySelect.appendChild(new Option(f, f));
    });
  }

  function renderDefVariantOptions() {
    const fam = defFamilySelect.value;
    defVariantSelect.innerHTML = `<option value="">Variante</option>`;

    WAR.filter((r) => r.def_family === fam).forEach((r) => {
      defVariantSelect.appendChild(new Option(r.def_variant, r.def_variant));
    });
  }

  function getSelectedDef() {
    return WAR.find(
      (r) =>
        r.def_family === defFamilySelect.value &&
        r.def_variant === defVariantSelect.value
    );
  }

  // ---------- UI ----------
  function renderDefense() {
    clearNode(defPortraits);
    const row = getSelectedDef();
    if (!row) return;

    defTitle.textContent = row.def_variant;

    row.def_chars.forEach((c) => {
      const img = document.createElement("img");
      img.src = getPortrait(c);
      img.className = "portraitImg";
      defPortraits.appendChild(img);
    });
  }

  function getClass(ratio, r) {
    if (ratio >= r.min_safe) return "is-green";
    if (ratio >= r.min_ok) return "is-orange";
    return "is-red";
  }

  function renderResults() {
    clearNode(resultsWrap);

    const def = getSelectedDef();
    const player = playerSelect.value;
    const enemy = parseNumber(enemyPowerInput.value);

    if (!def || !player) return;

    const rows = WAR.filter(
      (r) =>
        r.def_family === def.def_family &&
        r.def_variant === def.def_variant &&
        isRealCounter(r)
    );

    if (!rows.length) {
      resultsWrap.innerHTML =
        `<p class="subtitle">Aucun counter renseigné</p>`;
      return;
    }

    rows.forEach((r) => {
      const power = getPlayerPower(player, r.atk_chars);
      const ratio = enemy ? power / enemy : 0;

      const div = document.createElement("div");
      div.className = `counterCard ${getClass(ratio, r)}`;

      div.innerHTML = `
        <div class="counterTop">
          <div class="counterName">${r.atk_team}</div>
          <div class="counterPower">${power.toLocaleString()}</div>
        </div>
        <div class="counterPortraits">
          ${r.atk_chars
            .filter(Boolean)
            .map(
              (c) => `<img src="${getPortrait(c)}" class="portraitMini">`
            )
            .join("")}
        </div>
      `;

      resultsWrap.appendChild(div);
    });

    resultsCount.textContent = rows.length;
  }

  function renderAll() {
    renderDefense();
    renderResults();
  }

  // ---------- EVENTS ----------
  allianceSelect.onchange = () => {
    renderPlayerOptions();
    renderAll();
  };
  playerSelect.onchange = renderAll;
  defFamilySelect.onchange = () => {
    renderDefVariantOptions();
    renderAll();
  };
  defVariantSelect.onchange = renderAll;
  enemyPowerInput.oninput = renderResults;

  // ---------- BOOT ----------
  async function boot() {
    const [war, joueurs, chars, rosters] = await Promise.all([
      fetchJson(FILES.warCounters),
      fetchJson(FILES.joueurs),
      fetchJson(FILES.characters),
      fetchJson(FILES.rosters),
    ]);

    WAR = war.map(normalizeWarRow);
    JOUEURS = joueurs;

    buildCharMap(chars);
    buildRosterMap(rosters);

    JOUEURS.forEach((j) => {
      if (!PLAYERS_BY_ALLIANCE.has(j.alliance))
        PLAYERS_BY_ALLIANCE.set(j.alliance, []);
      PLAYERS_BY_ALLIANCE.get(j.alliance).push(j);
    });

    renderAllianceOptions();
    renderPlayerOptions();
    renderDefFamilyOptions();
  }

  boot();
})();