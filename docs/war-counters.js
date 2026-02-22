// docs/war-counters.js
(() => {
  const FILES = {
    warCounters: "./data/war-counters.json",
    joueurs: "./data/joueurs.json",
    characters: "./data/msf-characters.json",
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
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function parseNumberLoose(x) {
    if (x == null) return 0;
    const s = String(x).trim();
    if (!s) return 0;
    return Number(s.replace(/[^\d]/g, "")) || 0;
  }

  const normalizeKey = (s) =>
    (s ?? "")
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[-_]/g, "")
      .replace(/[’']/g, "");

  // ---------- Data ----------
  let WAR = [];
  let JOUEURS = [];
  let PLAYERS_BY_ALLIANCE = new Map();

  let CHARS = [];
  let CHAR_BY_KEY = new Map(); // normalized (id/nameKey/fr/en) -> char

  // ---------- Parsing ----------
  function normalizeWarRow(r) {
    const atk_chars = [
      r.atk_char1,
      r.atk_char2,
      r.atk_char3,
      r.atk_char4,
      r.atk_char5,
    ].map((x) => (x || "").toString().trim()); // on garde les vides

    return {
      def_family: (r.def_family || "").toString().trim(),
      def_variant: (r.def_variant || "").toString().trim(),
      def_key: (r.def_key || "").toString().trim(),

      def_chars: [
        r.def_char1,
        r.def_char2,
        r.def_char3,
        r.def_char4,
        r.def_char5,
      ]
        .map((x) => (x || "").toString().trim())
        .filter(Boolean),

      atk_team: (r.atk_team || "").toString().trim(),
      atk_chars,

      min_ratio_ok: parseNumberLoose(r.min_ratio_ok),
      min_ratio_safe: parseNumberLoose(r.min_ratio_safe),
      notes: (r.notes || "").toString().trim(),
    };
  }

  function isRealCounterRow(r) {
    // ✅ "un counter existe" si au moins un champ atk est rempli
    if ((r.atk_team || "").trim()) return true;
    return Array.isArray(r.atk_chars) && r.atk_chars.some((c) => (c || "").trim());
  }

  function buildPlayersByAlliance() {
    PLAYERS_BY_ALLIANCE = new Map();
    for (const j of JOUEURS) {
      const a = (j.alliance || "").toString().trim();
      const p = (j.player || "").toString().trim();
      if (!a || !p) continue;
      if (!PLAYERS_BY_ALLIANCE.has(a)) PLAYERS_BY_ALLIANCE.set(a, []);
      PLAYERS_BY_ALLIANCE.get(a).push({ alliance: a, player: p });
    }
  }

  // ---------- Characters (portraits) ----------
  function buildCharIndex() {
    CHAR_BY_KEY = new Map();
    for (const c of CHARS) {
      const keys = [c?.id, c?.nameKey, c?.nameFr, c?.nameEn].filter(Boolean);
      for (const k of keys) {
        const kk = normalizeKey(k);
        if (!kk) continue;
        if (!CHAR_BY_KEY.has(kk)) CHAR_BY_KEY.set(kk, c);
      }
    }
  }

  function findChar(name) {
    const kk = normalizeKey(name);
    if (!kk) return null;
    return CHAR_BY_KEY.get(kk) || null;
  }

  function getPortraitUrl(name) {
    const c = findChar(name);
    return c?.portraitUrl || c?.portrait || c?.iconUrl || "";
  }

  // ---------- Selects ----------
  function renderAllianceOptions() {
    allianceSelect.innerHTML = "";

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "— Choisir une alliance —";
    allianceSelect.appendChild(opt0);

    const ORDER = ["Zeus", "Dionysos", "Poséidon", "Poseidon"];
    const alliances = [...new Set(JOUEURS.map((j) => (j.alliance || "").toString().trim()).filter(Boolean))];

    alliances
      .sort((a, b) => {
        const ia = ORDER.indexOf(a);
        const ib = ORDER.indexOf(b);
        if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
        return a.localeCompare(b, "fr");
      })
      .forEach((a) => {
        const opt = document.createElement("option");
        opt.value = a;
        opt.textContent = `${ALLIANCE_EMOJI[a] || "•"} ${a}`.trim();
        allianceSelect.appendChild(opt);
      });
  }

  function renderPlayerOptions() {
    const alliance = (allianceSelect.value || "").trim();
    playerSelect.innerHTML = "";

    if (!alliance) {
      playerSelect.disabled = true;
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "— Choisir une alliance d’abord —";
      playerSelect.appendChild(opt);
      return;
    }

    playerSelect.disabled = false;

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "— Choisir un joueur —";
    playerSelect.appendChild(opt0);

    const players = (PLAYERS_BY_ALLIANCE.get(alliance) || []).slice().sort((a, b) =>
      a.player.localeCompare(b.player, "fr")
    );

    players.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.player;
      opt.textContent = p.player;
      playerSelect.appendChild(opt);
    });
  }

  function renderDefFamilyOptions() {
    defFamilySelect.innerHTML = "";

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "— Choisir une famille —";
    defFamilySelect.appendChild(opt0);

    const families = [...new Set(WAR.map((r) => r.def_family).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "fr")
    );

    families.forEach((f) => {
      const opt = document.createElement("option");
      opt.value = f;
      opt.textContent = f;
      defFamilySelect.appendChild(opt);
    });
  }

  function renderDefVariantOptions() {
    const fam = (defFamilySelect.value || "").trim();
    defVariantSelect.innerHTML = "";

    const opt0 = document.createElement("option");
    opt0.value = "";

    if (!fam) {
      opt0.textContent = "— Choisir une famille d’abord —";
      defVariantSelect.appendChild(opt0);
      defVariantSelect.disabled = true;
      return;
    }

    defVariantSelect.disabled = false;
    opt0.textContent = "— Choisir une variante —";
    defVariantSelect.appendChild(opt0);

    const variants = WAR.filter((r) => r.def_family === fam).map((r) => r.def_variant).filter(Boolean);

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
    return WAR.find((r) => r.def_family === fam && r.def_variant === vari) || null;
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

    row.def_chars.forEach((name) => {
      const card = document.createElement("div");
      card.className = "portraitCard";
      card.title = name;

      const img = document.createElement("img");
      img.className = "portraitImg";
      img.alt = name;
      img.loading = "lazy";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.src = getPortraitUrl(name) || "";

      // fallback si portrait manquant
      img.onerror = () => {
        img.remove();
        const t = document.createElement("div");
        t.className = "portraitFallback";
        t.textContent = name;
        card.appendChild(t);
      };

      card.appendChild(img);
      defPortraits.appendChild(card);
    });
  }

  function renderResults() {
    clearNode(resultsWrap);

    const defRow = getSelectedDefRow();
    const player = (playerSelect.value || "").trim();
    playerChip.textContent = player || "—";

    if (!defRow) {
      resultsCount.textContent = "0";
      return;
    }
    if (!player) {
      resultsCount.textContent = "0";
      const hint = document.createElement("p");
      hint.className = "subtitle";
      hint.textContent = "Choisis un joueur pour afficher les counters disponibles.";
      resultsWrap.appendChild(hint);
      return;
    }

    const rows = WAR
      .filter((r) => r.def_family === defRow.def_family && r.def_variant === defRow.def_variant)
      .filter(isRealCounterRow); // ✅ LE FIX

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

      const left = document.createElement("div");
      left.className = "rankLeft";

      const name = document.createElement("div");
      name.className = "rankName";
      name.textContent = r.atk_team || "Counter";

      left.appendChild(name);
      div.appendChild(left);

      resultsWrap.appendChild(div);
    });
  }

  function renderAll() {
    renderDefenseHeader();
    renderResults();
  }

  // ---------- Events ----------
  allianceSelect?.addEventListener("change", () => {
    renderPlayerOptions();
    playerChip.textContent = "—";
    renderAll();
  });

  playerSelect?.addEventListener("change", renderAll);

  defFamilySelect?.addEventListener("change", () => {
    defVariantSelect.value = "";
    renderDefVariantOptions();
    renderAll();
  });

  defVariantSelect?.addEventListener("change", renderAll);

  enemyPowerInput?.addEventListener("input", renderResults);

  // ---------- Boot ----------
  async function boot() {
    const [warRaw, joueursRaw, charsRaw] = await Promise.all([
      fetchJson(FILES.warCounters),
      fetchJson(FILES.joueurs),
      fetchJson(FILES.characters),
    ]);

    WAR = Array.isArray(warRaw) ? warRaw.map(normalizeWarRow) : [];
    JOUEURS = Array.isArray(joueursRaw) ? joueursRaw : [];

    CHARS = Array.isArray(charsRaw) ? charsRaw : [];
    buildCharIndex();

    buildPlayersByAlliance();

    renderAllianceOptions();
    renderPlayerOptions();
    renderDefFamilyOptions();
    renderDefVariantOptions();

    defVariantSelect.disabled = true;
    resultsCount.textContent = "0";
    defTitle.textContent = "—";
    playerChip.textContent = "—";
  }

  boot().catch((e) => console.error("[war-counters] boot error:", e));
})();