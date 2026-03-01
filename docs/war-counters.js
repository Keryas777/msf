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
    while (el?.firstChild) el.removeChild(el.firstChild);
  }

  const normalizeKey = (s) =>
    (s ?? "")
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[-_]/g, "")
      .replace(/[’']/g, "");

  function formatThousandsDot(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return "0";
    return Math.trunc(num)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function digitsOnly(s) {
    return String(s || "").replace(/[^\d]/g, "");
  }

  function formatThousandsDotFromDigits(d) {
    const s = digitsOnly(d);
    if (!s) return "";
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function enemyPowerDigitsValue() {
    return Number(digitsOnly(enemyPowerInput?.value || "")) || 0;
  }

  // ---------- DATA ----------
  let WAR = [];
  let JOUEURS = [];
  let ROSTERS = new Map();
  let PLAYERS_BY_ALLIANCE = new Map();
  let CHAR_MAP = new Map();

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

      atk_chars: [r.atk_char1, r.atk_char2, r.atk_char3, r.atk_char4, r.atk_char5].map(
        (x) => (x ?? "").toString().trim()
      ),

      // ✅ NOUVEAU : 3 seuils
      min_hard: parseFloat(String(r.min_ratio_hard ?? "").replace(",", ".")) || 0,
      min_ok: parseFloat(String(r.min_ratio_ok ?? "").replace(",", ".")) || 0,
      min_safe: parseFloat(String(r.min_ratio_safe ?? "").replace(",", ".")) || 0,

      notes: (r.notes ?? "").toString().trim(),
    };
  }

  function isRealCounter(r) {
    return (r.atk_team || "").trim() || r.atk_chars.some((c) => c);
  }

  // ---------- CLASSIFICATION 4 ÉTATS ----------
  function getClass(ratio, r) {
    const hard = Number(r.min_hard) || 0;
    const ok = Number(r.min_ok) || 0;
    const safe = Number(r.min_safe) || 0;

    if (ratio >= safe) return "is-green";   // ✅ OK
    if (ratio >= ok) return "is-yellow";    // ⚠️ Prudence
    if (ratio >= hard) return "is-orange";  // 🟠 Dur
    return "is-red";                        // 🚫 Impossible
  }

  function classRank(cls) {
    return {
      "is-green": 0,
      "is-yellow": 1,
      "is-orange": 2,
      "is-red": 3,
    }[cls] ?? 99;
  }

  // ---------- UI ----------
  function makeCounterCard({ teamName, power, ratio, cls, portraits, enemy, notes }) {
    const card = document.createElement("div");
    card.className = `counterCard ${cls}`;

    const top = document.createElement("div");
    top.className = "counterTop";

    const left = document.createElement("div");
    left.className = "counterName";
    left.textContent = teamName || "Counter";

    const right = document.createElement("div");
    right.className = "counterRight";

    const pow = document.createElement("div");
    pow.className = "counterPower";
    pow.textContent = formatThousandsDot(power);
    right.appendChild(pow);

    if (enemy > 0) {
      const rr = document.createElement("div");
      rr.className = "counterRatio";
      rr.textContent = `x${ratio.toFixed(2)}`;
      right.appendChild(rr);
    }

    top.append(left, right);

    const wrap = document.createElement("div");
    wrap.className = "counterPortraits";

    portraits.forEach((src) => {
      const p = document.createElement("div");
      p.className = "counterPortrait";

      const img = document.createElement("img");
      img.className = "counterPortraitImg";
      img.src = src || "";

      p.appendChild(img);
      wrap.appendChild(p);
    });

    card.append(top, wrap);

    if (notes) {
      const note = document.createElement("div");
      note.textContent = notes;
      note.style.marginTop = "6px";
      note.style.fontSize = "12px";
      note.style.fontStyle = "italic";
      note.style.color = "rgba(255,255,255,.7)";
      card.appendChild(note);
    }

    return card;
  }

  // ---------- RENDER ----------
  function renderResults() {
    clearNode(resultsWrap);

    const def = getSelectedDef();
    const player = (playerSelect?.value ?? "").trim();
    const enemy = enemyPowerDigitsValue();

    if (!def || !player) return;

    const rows = WAR.filter(
      (r) => r.def_family === def.def_family && r.def_variant === def.def_variant
    )
      .filter(isRealCounter)
      .map((r) => {
        const atkList = r.atk_chars.filter((c) => c);
        const power = getPlayerPower(player, atkList);
        const ratio = enemy > 0 ? power / enemy : 0;
        const cls = getClass(ratio, r);

        return { r, atkList, power, ratio, cls };
      });

    // ✅ TRI PAR NIVEAU DE RISQUE
    rows.sort((a, b) => {
      const rA = classRank(a.cls);
      const rB = classRank(b.cls);

      if (rA !== rB) return rA - rB;
      return b.ratio - a.ratio;
    });

    rows.forEach(({ r, atkList, power, ratio, cls }) => {
      const portraits = atkList.map((c) => getPortrait(c));

      resultsWrap.appendChild(
        makeCounterCard({
          teamName: r.atk_team,
          power,
          ratio,
          cls,
          portraits,
          enemy,
          notes: r.notes,
        })
      );
    });

    resultsCount.textContent = rows.length;
  }

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
    buildPlayersByAlliance();

    renderAllianceOptions();
    renderPlayerOptions();
    renderDefFamilyOptions();
    renderDefVariantOptions();
  }

  boot();
})();