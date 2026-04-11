// docs/war-attack-checker.js
(() => {
  const FILES = {
    warCounters: "./data/war-counters.json",
    warSeasonRules: "./data/war-season-rules.json",
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
  const atkVariantSelect = qs("#atkVariantSelect");

  const atkTitle = qs("#atkTitle");
  const atkPortraits = qs("#atkPortraits");

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
      .replace(/[-_‐-‒–—―﹘﹣－]/g, "")
      .replace(/[’'`´]/g, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  function formatThousandsDot(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return "0";
    return Math.trunc(num)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function formatCompactFR(n) {
    const num = Number(n);
    if (!Number.isFinite(num) || num <= 0) return "0";

    if (num >= 1_000_000) {
      const v = Math.round((num / 1_000_000) * 10) / 10;
      return `${String(v).replace(".", ",")} M`;
    }
    if (num >= 1_000) {
      const v = Math.round(num / 1_000);
      return `${v} k`;
    }
    return String(Math.round(num));
  }

  // ---------- DATA ----------
  let WAR = [];
  let JOUEURS = [];
  let ROSTERS = new Map();
  let PLAYERS_BY_ALLIANCE = new Map();
  let CHAR_MAP = new Map();
  let WAR_SEASON_RULES = {
    defaultMultiplier: 1.17,
    rules: [],
  };

  // ---------- PARSING ----------
  function normalizeWarRow(r) {
    return {
      atk_family: (r.atk_family ?? "").toString().trim(),
      atk_team: (r.atk_team ?? "").toString().trim(),
      atk_key: (r.atk_key ?? "").toString().trim(),

      atk_chars: [r.atk_char1, r.atk_char2, r.atk_char3, r.atk_char4, r.atk_char5].map((x) =>
        (x ?? "").toString().trim()
      ),

      def_family: (r.def_family ?? "").toString().trim(),
      def_variant: (r.def_variant ?? "").toString().trim(),
      def_key: (r.def_key ?? "").toString().trim(),

      def_chars: [r.def_char1, r.def_char2, r.def_char3, r.def_char4, r.def_char5]
        .map((x) => (x ?? "").toString().trim())
        .filter(Boolean),

      min_hard: parseFloat(String(r.min_ratio_hard ?? "").replace(",", ".")) || 0,
      min_ok: parseFloat(String(r.min_ratio_ok ?? "").replace(",", ".")) || 0,
      min_safe: parseFloat(String(r.min_ratio_safe ?? "").replace(",", ".")) || 0,

      notes: (r.notes ?? "").toString().trim(),
    };
  }

  function isRealDefense(r) {
    return Boolean((r.def_variant || "").trim() || (r.def_family || "").trim());
  }

  function normalizeSeasonRules(data) {
    const defaultMultiplier = Number(data?.defaultMultiplier) || 1.17;

    const rules = Array.isArray(data?.rules)
      ? data.rules
          .filter((r) => r && r.active !== false)
          .map((r) => ({
            active: true,
            ruleKey: (r.ruleKey ?? "").toString().trim(),
            label: (r.label ?? "").toString().trim(),
            multiplier: Number(r.multiplier) || defaultMultiplier,
            requiredCount: Number(r.requiredCount) || 5,
            membersNormalized: new Set(
              (Array.isArray(r.members) ? r.members : [])
                .map((m) => normalizeKey(m))
                .filter(Boolean)
            ),
          }))
      : [];

    return {
      defaultMultiplier,
      rules,
    };
  }

  // ---------- CHAR ----------
  function buildCharMap(chars) {
    CHAR_MAP = new Map();

    (Array.isArray(chars) ? chars : []).forEach((c) => {
      [c?.id, c?.nameKey, c?.nameFr, c?.nameEn]
        .filter(Boolean)
        .forEach((k) => {
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

      const playerKey = normalizeKey(player);
      if (!playerKey) return;

      const map = {};
      const chars = r.chars && typeof r.chars === "object" ? r.chars : {};

      Object.entries(chars).forEach(([k, v]) => {
        const kk = normalizeKey(k);
        if (!kk) return;
        map[kk] = typeof v === "object" ? Number(v.power) || 0 : Number(v) || 0;
      });

      ROSTERS.set(playerKey, map);
    });
  }

  function getPlayerRawPower(player, chars) {
    const playerKey = normalizeKey(player);
    const roster = ROSTERS.get(playerKey);

    if (!roster) return 0;

    return (Array.isArray(chars) ? chars : [])
      .filter((c) => (c || "").trim())
      .reduce((sum, c) => {
        const charKey = normalizeKey(c);
        return sum + (roster[charKey] || 0);
      }, 0);
  }

  function getMatchingSeasonRule(teamMembers) {
    const selected = (Array.isArray(teamMembers) ? teamMembers : [])
      .filter((c) => (c || "").trim())
      .map((c) => normalizeKey(c));

    if (!selected.length) return null;

    const rules = Array.isArray(WAR_SEASON_RULES?.rules) ? WAR_SEASON_RULES.rules : [];

    for (const rule of rules) {
      const requiredCount = Number(rule.requiredCount) || 5;
      if (selected.length !== requiredCount) continue;

      const matchCount = selected.filter((member) => rule.membersNormalized.has(member)).length;

      if (matchCount === requiredCount) {
        return rule;
      }
    }

    return null;
  }

  function getWarAdjustedPower(player, teamMembers) {
    const rawPower = getPlayerRawPower(player, teamMembers);
    const defaultMultiplier = Number(WAR_SEASON_RULES?.defaultMultiplier) || 1.17;
    const matchedRule = getMatchingSeasonRule(teamMembers);
    const multiplier = matchedRule
      ? Number(matchedRule.multiplier) || defaultMultiplier
      : defaultMultiplier;

    return Math.round(rawPower * multiplier);
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
    const alliances = [
      ...new Set(JOUEURS.map((j) => (j.alliance ?? "").toString().trim()).filter(Boolean)),
    ];

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

    const players = (PLAYERS_BY_ALLIANCE.get(a) || [])
      .slice()
      .sort((x, y) => x.player.localeCompare(y.player, "fr"));

    players.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.player;
      opt.textContent = p.player;
      playerSelect.appendChild(opt);
    });
  }

  function renderAtkFamilyOptions() {
    if (!atkFamilySelect) return;
    atkFamilySelect.innerHTML = "";

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "— Choisir une team générique —";
    atkFamilySelect.appendChild(opt0);

    const families = [...new Set(WAR.map((r) => r.atk_family).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "fr")
    );

    families.forEach((f) => {
      const opt = document.createElement("option");
      opt.value = f;
      opt.textContent = f;
      atkFamilySelect.appendChild(opt);
    });
  }

  function renderAtkVariantOptions() {
    if (!atkVariantSelect) return;

    const fam = (atkFamilySelect?.value ?? "").trim();
    atkVariantSelect.innerHTML = "";

    const opt0 = document.createElement("option");
    opt0.value = "";

    if (!fam) {
      opt0.textContent = "— Choisir une team générique d’abord —";
      atkVariantSelect.appendChild(opt0);
      atkVariantSelect.disabled = true;
      atkVariantSelect.value = "";
      return;
    }

    atkVariantSelect.disabled = false;
    opt0.textContent = "— Choisir une variante —";
    atkVariantSelect.appendChild(opt0);

    const variants = WAR.filter((r) => r.atk_family === fam)
      .map((r) => r.atk_team)
      .filter(Boolean);

    [...new Set(variants)]
      .sort((a, b) => a.localeCompare(b, "fr"))
      .forEach((v) => {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v;
        atkVariantSelect.appendChild(opt);
      });
  }

  function getSelectedAtk() {
    const fam = (atkFamilySelect?.value ?? "").trim();
    const vari = (atkVariantSelect?.value ?? "").trim();
    if (!fam || !vari) return null;

    return (
      WAR.find(
        (r) =>
          normalizeKey(r.atk_family) === normalizeKey(fam) &&
          normalizeKey(r.atk_team) === normalizeKey(vari)
      ) || null
    );
  }

  // ---------- UI ----------
  function renderAttack() {
    clearNode(atkPortraits);

    const row = getSelectedAtk();
    if (!row) {
      if (atkTitle) atkTitle.textContent = "—";
      return;
    }

    if (atkTitle) atkTitle.textContent = row.atk_team || row.atk_family || "Attaque";

    row.atk_chars.forEach((name) => {
      if (!name) return;

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
      atkPortraits.appendChild(card);
    });
  }

  function getClass(ratio, r) {
    const hard = Number(r.min_hard) || 0;
    const ok = Number(r.min_ok) || 0;
    const safe = Number(r.min_safe) || 0;

    if (!hard && !ok && !safe) return ratio >= 1 ? "is-yellow" : "is-red";

    if (safe && ratio >= safe) return "is-green";
    if (ok && ratio >= ok) return "is-yellow";
    if (hard && ratio >= hard) return "is-orange";
    return "is-red";
  }

  function classRank(cls) {
    if (cls === "is-green") return 0;
    if (cls === "is-yellow") return 1;
    if (cls === "is-orange") return 2;
    return 3;
  }

  function computeRecommendation(enemyPower, row, teamPower) {
    const enemy = Number(enemyPower) || 0;
    const ok = Number(row?.min_ok) || 0;

    if (enemy <= 0 || ok <= 0) {
      return {
        show: false,
        recommended: 0,
        delta: 0,
        line1: "",
        line2: "",
      };
    }

    const recommended = enemy * ok;
    const delta = teamPower - recommended;

    const recTxt = formatCompactFR(recommended);
    const absTxt = formatCompactFR(Math.abs(delta));

    const line1 = `Recommandé : ${recTxt} mini`;
    const line2 = delta >= 0 ? `✅ ${absTxt} de marge` : `🚫 + ${absTxt} mini. requis`;

    return { show: true, recommended, delta, line1, line2 };
  }

  function makeCounterCard({ teamName, power, cls, portraits, row, notes }) {
    const card = document.createElement("div");
    card.className = `counterCard ${cls}`.trim();

    const top = document.createElement("div");
    top.className = "counterTop";

    const left = document.createElement("div");
    left.className = "counterName";
    left.textContent = teamName || "Défense";

    const right = document.createElement("div");
    right.className = "counterRight";

    const pow = document.createElement("div");
    pow.className = "counterPower";
    pow.textContent = formatThousandsDot(power);
    right.appendChild(pow);

    const ratioLine = document.createElement("div");
    ratioLine.className = "counterRatio";

    if (Number(row?.min_safe) > 0) {
      ratioLine.textContent = `Safe : x${String(row.min_safe).replace(".", ",")}`;
    } else if (Number(row?.min_ok) > 0) {
      ratioLine.textContent = `Ok : x${String(row.min_ok).replace(".", ",")}`;
    } else if (Number(row?.min_hard) > 0) {
      ratioLine.textContent = `Hard : x${String(row.min_hard).replace(".", ",")}`;
    } else {
      ratioLine.textContent = "—";
    }

    right.appendChild(ratioLine);

    top.appendChild(left);
    top.appendChild(right);

    const wrap = document.createElement("div");
    wrap.className = "counterPortraits";

    portraits.forEach((src, idx) => {
      const p = document.createElement("div");
      p.className = "counterPortrait";
      p.title = `p${idx + 1}`;

      const img = document.createElement("img");
      img.className = "counterPortraitImg";
      img.alt = `p${idx + 1}`;
      img.loading = "lazy";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.src = src || "";

      p.appendChild(img);
      wrap.appendChild(p);
    });

    card.appendChild(top);
    card.appendChild(wrap);

    const noteText = (notes ?? "").toString().trim();
    if (noteText) {
      const note = document.createElement("div");
      note.textContent = noteText;
      note.setAttribute("aria-label", "Notes");
      note.style.marginTop = "6px";
      note.style.fontSize = "12px";
      note.style.fontStyle = "italic";
      note.style.lineHeight = "1.25";
      note.style.color = "rgba(255,255,255,.70)";
      card.appendChild(note);
    }

    return card;
  }

  function renderResults() {
    clearNode(resultsWrap);

    const atk = getSelectedAtk();
    const player = (playerSelect?.value ?? "").trim();

    if (!atk) {
      if (resultsCount) resultsCount.textContent = "0";
      if (playerChip) playerChip.textContent = "—";
      return;
    }

    if (!player) {
      if (resultsCount) resultsCount.textContent = "0";
      if (playerChip) playerChip.textContent = "—";
      const hint = document.createElement("p");
      hint.className = "subtitle";
      hint.textContent = "Choisis un joueur pour afficher les défenses battables.";
      resultsWrap.appendChild(hint);
      return;
    }

    const atkChars = (atk.atk_chars || []).filter((c) => (c || "").trim());
    const power = getWarAdjustedPower(player, atkChars);

    if (playerChip) playerChip.textContent = `${player} • ${formatCompactFR(power)}`;

    const baseRows = WAR.filter(
      (r) =>
        normalizeKey(r.atk_family) === normalizeKey(atk.atk_family) &&
        normalizeKey(r.atk_team) === normalizeKey(atk.atk_team)
    ).filter(isRealDefense);

    if (!baseRows.length) {
      if (resultsCount) resultsCount.textContent = "0";
      resultsWrap.innerHTML = `<p class="subtitle">Aucune défense renseignée pour cette attaque.</p>`;
      return;
    }

    const seenDefs = new Set();
    const rows = [];

    baseRows.forEach((r) => {
      const defUniqueKey = [
        normalizeKey(r.def_family),
        normalizeKey(r.def_variant),
        normalizeKey(r.def_chars.join("|")),
      ].join("::");

      if (seenDefs.has(defUniqueKey)) return;
      seenDefs.add(defUniqueKey);

      const targetRatio = Number(r.min_ok) || Number(r.min_hard) || 1;
      const virtualEnemyPower = targetRatio > 0 ? power / targetRatio : power;
      const ratio = virtualEnemyPower > 0 ? power / virtualEnemyPower : 0;
      const cls = getClass(ratio, r);

      rows.push({
        r,
        power,
        ratio,
        cls,
        sortRatio: targetRatio,
      });
    });

    rows.sort((a, b) => {
      const ra = classRank(a.cls);
      const rb = classRank(b.cls);
      if (ra !== rb) return ra - rb;

      if (a.sortRatio !== b.sortRatio) return a.sortRatio - b.sortRatio;

      const na = (a.r.def_variant || a.r.def_family || "").toString();
      const nb = (b.r.def_variant || b.r.def_family || "").toString();
      return na.localeCompare(nb, "fr", { sensitivity: "base" });
    });

    if (resultsCount) resultsCount.textContent = String(rows.length);

    rows.forEach(({ r, power, cls }) => {
      const portraits = (r.def_chars || []).map((c) => getPortrait(c)).filter(Boolean);

      resultsWrap.appendChild(
        makeCounterCard({
          teamName: r.def_variant || r.def_family || "Défense",
          power,
          cls,
          portraits,
          row: r,
          notes: r.notes || "",
        })
      );
    });
  }

  function renderAll() {
    renderAttack();
    renderResults();
  }

  // ---------- EVENTS ----------
  allianceSelect?.addEventListener("change", () => {
    renderPlayerOptions();
    renderAll();
  });

  playerSelect?.addEventListener("change", renderAll);

  atkFamilySelect?.addEventListener("change", () => {
    if (atkVariantSelect) atkVariantSelect.value = "";
    renderAtkVariantOptions();
    renderAll();
  });

  atkVariantSelect?.addEventListener("change", renderAll);

  // ---------- BOOT ----------
  async function boot() {
    const [war, warSeasonRules, joueurs, chars, rosters] = await Promise.all([
      fetchJson(FILES.warCounters),
      fetchJson(FILES.warSeasonRules),
      fetchJson(FILES.joueurs),
      fetchJson(FILES.characters),
      fetchJson(FILES.rosters),
    ]);

    WAR = Array.isArray(war) ? war.map(normalizeWarRow) : [];
    WAR_SEASON_RULES = normalizeSeasonRules(warSeasonRules);
    JOUEURS = Array.isArray(joueurs) ? joueurs : [];

    buildCharMap(chars);
    buildRosterMap(rosters);
    buildPlayersByAlliance();

    renderAllianceOptions();
    renderPlayerOptions();
    renderAtkFamilyOptions();
    renderAtkVariantOptions();

    if (atkVariantSelect) atkVariantSelect.disabled = true;
    if (resultsCount) resultsCount.textContent = "0";
    if (atkTitle) atkTitle.textContent = "—";
    if (playerChip) playerChip.textContent = "—";
  }

  boot().catch((e) => console.error("[war-attack-checker] boot error:", e));
})();