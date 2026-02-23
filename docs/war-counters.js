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
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  const normalizeKey = (s) =>
    (s ?? "")
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[-_]/g, "")
      .replace(/[’']/g, "");

  const parseNumber = (x) => Number(String(x ?? "").replace(/[^\d]/g, "")) || 0;

  function formatThousandsDot(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return "0";
    return Math.trunc(num)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  // ✅ LIVE formatting helpers (enemy power)
  function formatThousandsDotFromDigits(digitsStr) {
    const s = String(digitsStr || "").replace(/[^\d]/g, "");
    if (!s) return "";
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }
  function getEnemyPowerDigits() {
    return Number(String(enemyPowerInput?.value || "").replace(/[^\d]/g, "")) || 0;
  }

  // ---------- DATA ----------
  let WAR = [];
  let JOUEURS = [];
  let ROSTERS = new Map(); // playerKey -> { charKey -> power }
  let PLAYERS_BY_ALLIANCE = new Map(); // alliance -> [{alliance,player}]
  let CHAR_MAP = new Map(); // charKey -> charObj

  // ---------- PARSING ----------
  function normalizeWarRow(r) {
    return {
      def_family: (r.def_family ?? "").toString().trim(),
      def_variant: (r.def_variant ?? "").toString().trim(),
      def_key: (r.def_key ?? "").toString().trim(),

      def_chars: [r.def_char1, r.def_char2, r.def_char3, r.def_char4, r.def_char5]
        .map((x) => (x ?? "").toString().trim())
        .filter(Boolean),

      atk_team: (r.atk_team ?? "").toString().trim(),

      // IMPORTANT : on garde les cases vides
      atk_chars: [r.atk_char1, r.atk_char2, r.atk_char3, r.atk_char4, r.atk_char5].map((x) =>
        (x ?? "").toString().trim()
      ),

      min_ok: parseNumber(r.min_ratio_ok),
      min_safe: parseNumber(r.min_ratio_safe),

      notes: (r.notes ?? "").toString().trim(),
    };
  }

  function isRealCounter(r) {
    if ((r.atk_team || "").trim()) return true;
    return Array.isArray(r.atk_chars) && r.atk_chars.some((c) => (c || "").trim());
  }

  // ---------- CHAR ----------
  function buildCharMap(chars) {
    CHAR_MAP = new Map();
    (Array.isArray(chars) ? chars : []).forEach((c) => {
      [c?.id, c?.nameKey, c?.nameFr, c?.nameEn].filter(Boolean).forEach((k) => {
        const kk = normalizeKey(k);
        if (!kk) return;
        if (!CHAR_MAP.has(kk)) CHAR_MAP.set(kk, c);
      });
    });
  }

  function getPortrait(name) {
    const c = CHAR_MAP.get(normalizeKey(name));
    return c?.portraitUrl || c?.portrait || c?.iconUrl || "";
  }

  // ---------- ROSTER ----------
  function buildRosterMap(data) {
    ROSTERS = new Map();
    (Array.isArray(data) ? data : []).forEach((r) => {
      const player = (r.player ?? "").toString().trim();
      if (!player) return;

      const map = {};
      const chars = r.chars && typeof r.chars === "object" ? r.chars : {};
      Object.entries(chars).forEach(([k, v]) => {
        const kk = normalizeKey(k);
        if (!kk) return;
        map[kk] = typeof v === "object" ? Number(v.power) || 0 : Number(v) || 0;
      });

      ROSTERS.set(normalizeKey(player), map);
    });
  }

  function getPlayerPower(player, chars) {
    const roster = ROSTERS.get(normalizeKey(player));
    if (!roster) return 0;

    return (Array.isArray(chars) ? chars : [])
      .filter((c) => (c || "").trim())
      .reduce((sum, c) => sum + (roster[normalizeKey(c)] || 0), 0);
  }

  // ---------- SELECTS ----------
  function buildPlayersByAlliance() {
    PLAYERS_BY_ALLIANCE = new Map();
    (Array.isArray(JOUEURS) ? JOUEURS : []).forEach((j) => {
      const a = (j.alliance ?? "").toString().trim();
      const p = (j.player ?? "").toString().trim();
      if (!a || !p) return;
      if (!PLAYERS_BY_ALLIANCE.has(a)) PLAYERS_BY_ALLIANCE.set(a, []);
      PLAYERS_BY_ALLIANCE.get(a).push({ alliance: a, player: p });
    });
  }

  function renderAllianceOptions() {
    if (!allianceSelect) return;
    allianceSelect.innerHTML = "";

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "— Choisir une alliance —";
    allianceSelect.appendChild(opt0);

    const ORDER = ["Zeus", "Dionysos", "Poséidon", "Poseidon"];
    const alliances = [...new Set(JOUEURS.map((j) => (j.alliance ?? "").toString().trim()).filter(Boolean))];

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
    if (!playerSelect) return;

    const a = (allianceSelect?.value ?? "").trim();
    playerSelect.innerHTML = "";

    if (!a) {
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

    const players = (PLAYERS_BY_ALLIANCE.get(a) || []).slice().sort((x, y) => x.player.localeCompare(y.player, "fr"));

    players.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.player;
      opt.textContent = p.player;
      playerSelect.appendChild(opt);
    });
  }

  function renderDefFamilyOptions() {
    if (!defFamilySelect) return;
    defFamilySelect.innerHTML = "";

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "— Choisir une famille —";
    defFamilySelect.appendChild(opt0);

    const families = [...new Set(WAR.map((r) => r.def_family).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));

    families.forEach((f) => {
      const opt = document.createElement("option");
      opt.value = f;
      opt.textContent = f;
      defFamilySelect.appendChild(opt);
    });
  }

  function renderDefVariantOptions() {
    if (!defVariantSelect) return;

    const fam = (defFamilySelect?.value ?? "").trim();
    defVariantSelect.innerHTML = "";

    const opt0 = document.createElement("option");
    opt0.value = "";

    if (!fam) {
      opt0.textContent = "— Choisir une famille d’abord —";
      defVariantSelect.appendChild(opt0);
      defVariantSelect.disabled = true;
      defVariantSelect.value = "";
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

  function getSelectedDef() {
    const fam = (defFamilySelect?.value ?? "").trim();
    const vari = (defVariantSelect?.value ?? "").trim();
    if (!fam || !vari) return null;
    return WAR.find((r) => r.def_family === fam && r.def_variant === vari) || null;
  }

  // ---------- UI ----------
  function renderDefense() {
    clearNode(defPortraits);

    const row = getSelectedDef();
    if (!row) {
      if (defTitle) defTitle.textContent = "—";
      return;
    }

    if (defTitle) defTitle.textContent = row.def_variant || row.def_family || "Défense";

    row.def_chars.forEach((name) => {
      const card = document.createElement("div");
      card.className = "portraitCard";
      card.title = name;

      const img = document.createElement("img");
      img.src = getPortrait(name) || "";
      img.className = "portraitImg";
      img.alt = name;
      img.loading = "lazy";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";

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

  function getClass(ratio, r) {
    const ok = Number(r.min_ok) || 0;
    const safe = Number(r.min_safe) || 0;

    if (!ok && !safe) return ratio >= 1 ? "is-orange" : "is-red";

    if (safe && ratio >= safe) return "is-green";
    if (ok && ratio >= ok) return "is-orange";
    return "is-red";
  }

  function makeCounterCard({ teamName, power, ratio, cls, portraits, enemy }) {
    const row = document.createElement("div");
    row.className = "rankRow";

    const left = document.createElement("div");
    left.className = "rankLeft";

    const name = document.createElement("div");
    name.className = "rankName";
    name.textContent = teamName || "Counter";
    left.appendChild(name);

    const bars = document.createElement("div");
    bars.className = "rankBars";

    const bar = document.createElement("span");
    bar.className = `rankBar ${cls}`.trim();
    bar.title = cls.replace("is-", "").toUpperCase();
    bars.appendChild(bar);

    const right = document.createElement("div");
    right.className = "rankPower";
    right.textContent = enemy > 0 ? `${formatThousandsDot(power)}  x${ratio.toFixed(2)}` : `${formatThousandsDot(power)}`;

    row.appendChild(left);
    row.appendChild(bars);
    row.appendChild(right);

    // ✅ mini portraits (classes dédiées + NO CROP via object-fit contain)
    const wrap = document.createElement("div");
    wrap.className = "counterPortraits";

    portraits.forEach((src, idx) => {
      const cardP = document.createElement("div");
      cardP.className = "counterPortrait";

      const img = document.createElement("img");
      img.className = "counterPortraitImg";
      img.alt = `p${idx + 1}`;
      img.loading = "lazy";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.src = src || "";

      // ✅ anti-crop “au cas où” (même si ton CSS change)
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.objectFit = "contain";
      img.style.objectPosition = "center";
      img.style.display = "block";

      cardP.appendChild(img);
      wrap.appendChild(cardP);
    });

    const block = document.createElement("div");
    block.appendChild(row);
    block.appendChild(wrap);

    return block;
  }

  function renderResults() {
    clearNode(resultsWrap);

    const def = getSelectedDef();
    const player = (playerSelect?.value ?? "").trim();
    const enemy = getEnemyPowerDigits();

    if (playerChip) playerChip.textContent = player || "—";

    if (!def) {
      if (resultsCount) resultsCount.textContent = "0";
      return;
    }

    if (!player) {
      if (resultsCount) resultsCount.textContent = "0";
      const hint = document.createElement("p");
      hint.className = "subtitle";
      hint.textContent = "Choisis un joueur pour afficher les counters disponibles.";
      resultsWrap.appendChild(hint);
      return;
    }

    const rows = WAR.filter((r) => r.def_family === def.def_family && r.def_variant === def.def_variant).filter(isRealCounter);

    if (!rows.length) {
      if (resultsCount) resultsCount.textContent = "0";
      resultsWrap.innerHTML = `<p class="subtitle">Aucun counter renseigné</p>`;
      return;
    }

    if (resultsCount) resultsCount.textContent = String(rows.length);

    rows.forEach((r) => {
      const atkList = (r.atk_chars || []).filter((c) => (c || "").trim());
      const power = getPlayerPower(player, atkList);

      const ratio = enemy > 0 ? power / enemy : 1;
      const cls = enemy > 0 ? getClass(ratio, r) : "is-orange";

      const portraits = atkList.map((c) => getPortrait(c)).filter(Boolean);

      resultsWrap.appendChild(
        makeCounterCard({
          teamName: r.atk_team || "Counter",
          power,
          ratio,
          cls,
          portraits,
          enemy,
        })
      );
    });
  }

  function renderAll() {
    renderDefense();
    renderResults();
  }

  // ---------- EVENTS ----------
  allianceSelect?.addEventListener("change", () => {
    renderPlayerOptions();
    if (playerChip) playerChip.textContent = "—";
    renderAll();
  });

  playerSelect?.addEventListener("change", renderAll);

  defFamilySelect?.addEventListener("change", () => {
    if (defVariantSelect) defVariantSelect.value = "";
    renderDefVariantOptions();
    renderAll();
  });

  defVariantSelect?.addEventListener("change", renderAll);

  // ✅ LIVE formatting (remplace l'ancien "input -> renderResults")
  enemyPowerInput?.addEventListener("input", () => {
    if (!enemyPowerInput) return;

    const prevLen = enemyPowerInput.value.length;
    const prevPos = enemyPowerInput.selectionStart ?? prevLen;

    const digits = String(enemyPowerInput.value || "").replace(/[^\d]/g, "");
    enemyPowerInput.value = formatThousandsDotFromDigits(digits);

    const newLen = enemyPowerInput.value.length;
    const delta = newLen - prevLen;
    const newPos = Math.max(0, Math.min(newLen, prevPos + delta));
    enemyPowerInput.setSelectionRange(newPos, newPos);

    renderResults();
  });

  // ---------- BOOT ----------
  async function boot() {
    const [war, joueurs, chars, rosters] = await Promise.all([
      fetchJson(FILES.warCounters),
      fetchJson(FILES.joueurs),
      fetchJson(FILES.characters),
      fetchJson(FILES.rosters),
    ]);

    WAR = Array.isArray(war) ? war.map(normalizeWarRow) : [];
    JOUEURS = Array.isArray(joueurs) ? joueurs : [];

    buildCharMap(chars);
    buildRosterMap(rosters);
    buildPlayersByAlliance();

    renderAllianceOptions();
    renderPlayerOptions();
    renderDefFamilyOptions();
    renderDefVariantOptions();

    if (defVariantSelect) defVariantSelect.disabled = true;
    if (resultsCount) resultsCount.textContent = "0";
    if (defTitle) defTitle.textContent = "—";
    if (playerChip) playerChip.textContent = "—";
  }

  boot().catch((e) => console.error("[war-counters] boot error:", e));
})();