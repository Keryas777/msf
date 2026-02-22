// docs/war-counters.js
(() => {
  const FILES = {
    warCounters: "./data/war-counters.json",
    teams: "./data/teams.json",
    characters: "./data/msf-characters.json",
    joueurs: "./data/joueurs.json",
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

  const normalizeKey = (s) =>
    (s ?? "")
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[-_]/g, "")
      .replace(/[’']/g, "");

  function clearNode(el) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function formatThousandsDot(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return "0";
    return Math.trunc(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function parseNumberLoose(x) {
    if (x == null) return 0;
    if (typeof x === "number") return Number.isFinite(x) ? x : 0;
    const s = String(x).replace(/\s/g, "").replace(/\./g, "").replace(/,/g, ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  // ---------- Data ----------
  let WAR = []; // rows
  let CHARS = [];
  let CHAR_MAP = new Map(); // alias -> best char
  let CHAR_MULTI = new Map(); // alias -> [chars]
  let JOUEURS = [];
  let PLAYERS_BY_ALLIANCE = new Map();

  let ROSTER_MAP = new Map(); // playerKey -> { charKey -> raw }
  // raw = number OR {power, level, gear, isoMax}

  // ---------- Character disambiguation (comme app.js) ----------
  function isVariantId(id) {
    const s = (id ?? "").toString();
    if (!s) return false;
    return /(_props|_bbminn|_npc|_event|_raid|_trial|_campaign|_boss)$/i.test(s);
  }

  function scoreCharacterMatch(c, queryKey) {
    const id = (c?.id ?? "").toString();
    const nameKey = (c?.nameKey ?? "").toString();

    const idKey = normalizeKey(id);
    const nameKeyKey = normalizeKey(nameKey);

    let score = 0;
    if (idKey && idKey === queryKey) score += 1000;
    if (nameKeyKey && nameKeyKey === queryKey) score += 900;
    if (isVariantId(id)) score -= 200;
    if (id && id.length <= 18) score += 10;
    return score;
  }

  function findCharacterInfo(name) {
    const raw = (name ?? "").toString().trim();
    if (!raw) return null;
    const key = normalizeKey(raw);
    if (!key) return null;

    const list = CHAR_MULTI.get(key);
    if (Array.isArray(list) && list.length) {
      let best = list[0];
      let bestScore = -Infinity;
      for (const c of list) {
        const sc = scoreCharacterMatch(c, key);
        if (sc > bestScore) {
          bestScore = sc;
          best = c;
        }
      }
      return best || null;
    }
    return CHAR_MAP.get(key) || null;
  }

  // ---------- Roster readers ----------
  function readCharPower(val) {
    if (val == null) return 0;
    if (typeof val === "number") return Number.isFinite(val) ? val : 0;
    if (typeof val === "string") {
      const n = Number(val);
      return Number.isFinite(n) ? n : 0;
    }
    if (typeof val === "object") {
      const n = Number(val.power);
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  }

  function getPlayerRoster(playerName) {
    return ROSTER_MAP.get(normalizeKey(playerName)) || null;
  }

  // Lookup robuste : essaye (id/nameKey) puis fallback sur le texte brut
  function lookupCharRawInRoster(rosterObj, charName) {
    if (!rosterObj) return null;

    const info = findCharacterInfo(charName);
    const key1 = normalizeKey(
      info?.id || info?.nameKey || info?.nameEn || info?.nameFr || charName
    );
    const key2 = normalizeKey(charName);

    return rosterObj[key1] ?? rosterObj[key2] ?? null;
  }

  function sumTeamPowerForPlayer(playerName, charNames) {
    const roster = getPlayerRoster(playerName);
    if (!roster) return { sum: 0, perChar: [] };

    let sum = 0;
    const perChar = [];

    for (const cn of charNames) {
      const raw = lookupCharRawInRoster(roster, cn);
      const present = raw !== undefined && raw !== null;
      const p = present ? readCharPower(raw) : 0;
      sum += Number.isFinite(p) ? p : 0;
      perChar.push({ name: cn, present, power: p });
    }

    return { sum, perChar };
  }

  // ---------- WarCounters parsing ----------
  function normalizeWarRow(r) {
    // tolérance à des noms de colonnes légèrement différents
    const mode = (r.mode ?? r.Mode ?? "Guerre").toString().trim();

    const def_family = (r.def_family ?? r.defFamily ?? "").toString().trim();
    const def_variant = (r.def_variant ?? r.defVariant ?? "").toString().trim();
    const def_key = (r.def_key ?? r.defKey ?? "").toString().trim();

    const atk_team = (r.atk_team ?? r.atkTeam ?? "").toString().trim();
    const atk_key = (r.atk_key ?? r.atkKey ?? "").toString().trim();

    const def_chars = [
      r.def_char1, r.def_char2, r.def_char3, r.def_char4, r.def_char5,
    ]
      .map((x) => (x ?? "").toString().trim())
      .filter(Boolean);

    const atk_chars = [
      r.atk_char1, r.atk_char2, r.atk_char3, r.atk_char4, r.atk_char5,
    ]
      .map((x) => (x ?? "").toString().trim())
      .filter(Boolean);

    const min_ok = parseNumberLoose(r.min_ratio_ok ?? r.minOk ?? r.ratio_ok);
    const min_safe = parseNumberLoose(r.min_ratio_safe ?? r.minSafe ?? r.ratio_safe);

    const notes = (r.notes ?? r.note ?? "").toString().trim();

    return {
      mode,
      def_family,
      def_variant,
      def_key,
      def_chars,
      atk_team,
      atk_key,
      atk_chars,
      min_ratio_ok: min_ok || 0,
      min_ratio_safe: min_safe || 0,
      notes,
    };
  }

  // ---------- Select rendering ----------
  function buildPlayersByAlliance() {
    PLAYERS_BY_ALLIANCE = new Map();
    for (const j of JOUEURS) {
      const a = (j.alliance || "").trim();
      if (!a) continue;
      if (!PLAYERS_BY_ALLIANCE.has(a)) PLAYERS_BY_ALLIANCE.set(a, []);
      PLAYERS_BY_ALLIANCE.get(a).push(j);
    }
  }

  function renderAllianceOptions() {
    allianceSelect.innerHTML = "";

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "— Choisir une alliance —";
    allianceSelect.appendChild(opt0);

    const ORDER = ["Zeus", "Dionysos", "Poséidon", "Poseidon"];
    const alliances = Array.from(
      new Set(JOUEURS.map((j) => (j.alliance || "").trim()).filter(Boolean))
    );

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

    allianceSelect.value = "";
  }

  function renderPlayerOptions() {
    const alliance = (allianceSelect?.value || "").trim();

    playerSelect.innerHTML = "";
    if (!alliance) {
      playerSelect.disabled = true;
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "— Choisir une alliance d’abord —";
      playerSelect.appendChild(opt);
      playerSelect.value = "";
      return;
    }

    const list = (PLAYERS_BY_ALLIANCE.get(alliance) || [])
      .slice()
      .sort((a, b) => a.player.localeCompare(b.player, "fr"));

    playerSelect.disabled = false;

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "— Choisir un joueur —";
    playerSelect.appendChild(opt0);

    list.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.player;
      opt.textContent = p.player;
      playerSelect.appendChild(opt);
    });

    playerSelect.value = "";
  }

  function renderDefFamilyOptions() {
    defFamilySelect.innerHTML = "";

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "— Choisir une famille —";
    defFamilySelect.appendChild(opt0);

    const families = Array.from(
      new Set(WAR.map((r) => (r.def_family || "").trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, "fr"));

    families.forEach((f) => {
      const opt = document.createElement("option");
      opt.value = f;
      opt.textContent = f;
      defFamilySelect.appendChild(opt);
    });

    defFamilySelect.value = "";
  }

  function renderDefVariantOptions() {
    const fam = (defFamilySelect?.value || "").trim();
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

    const variants = WAR.filter((r) => (r.def_family || "").trim() === fam)
      .map((r) => (r.def_variant || "").trim())
      .filter(Boolean);

    Array.from(new Set(variants))
      .sort((a, b) => a.localeCompare(b, "fr"))
      .forEach((v) => {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v;
        defVariantSelect.appendChild(opt);
      });

    defVariantSelect.value = "";
  }

  function getSelectedDefRow() {
    const fam = (defFamilySelect?.value || "").trim();
    const vari = (defVariantSelect?.value || "").trim();
    if (!fam || !vari) return null;
    return (
      WAR.find(
        (r) => (r.def_family || "").trim() === fam && (r.def_variant || "").trim() === vari
      ) || null
    );
  }

  // ---------- UI rendering ----------
  function renderDefenseHeader() {
    clearNode(defPortraits);

    const row = getSelectedDefRow();
    if (!row) {
      defTitle.textContent = "—";
      return;
    }

    defTitle.textContent = row.def_variant || row.def_family || "Défense";

    for (const cn of row.def_chars) {
      const info = findCharacterInfo(cn);

      const card = document.createElement("div");
      card.className = "portraitCard";

      const img = document.createElement("img");
      img.className = "portraitImg";
      img.alt = cn;
      img.loading = "lazy";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.src = info?.portraitUrl || "";
      card.appendChild(img);

      defPortraits.appendChild(card);
    }
  }

  function makeResultCard({ atk_team, atk_chars, atkPower, ratio, verdict, notes }) {
    const wrapper = document.createElement("div");
    wrapper.className = "rankRow"; // on réutilise le style “row” existant

    const left = document.createElement("div");
    left.className = "rankLeft";

    const title = document.createElement("div");
    title.className = "rankName";
    title.style.fontWeight = "900";
    title.textContent = atk_team || "Counter";

    left.appendChild(title);

    // mini barres = “verdict”
    const bars = document.createElement("div");
    bars.className = "rankBars";
    bars.style.marginLeft = "auto";

    const bar = document.createElement("span");
    bar.className = `rankBar is-${verdict === "SAFE" ? "green" : verdict === "OK" ? "orange" : "red"}`;
    bar.title = verdict;
    bar.dataset.tip = verdict;
    bars.appendChild(bar);

    // Power + ratio
    const right = document.createElement("div");
    right.className = "rankPower";
    right.style.textAlign = "right";
    right.innerHTML = `${formatThousandsDot(atkPower)}<br><span style="opacity:.75;font-weight:800;font-size:12px;">x${ratio.toFixed(
      2
    )}</span>`;

    wrapper.appendChild(left);
    wrapper.appendChild(bars);
    wrapper.appendChild(right);

    // portraits en dessous
    const grid = document.createElement("div");
    grid.className = "portraits";
    grid.style.marginTop = "10px";

    for (const cn of atk_chars) {
      const info = findCharacterInfo(cn);
      const card = document.createElement("div");
      card.className = "portraitCard";

      const img = document.createElement("img");
      img.className = "portraitImg";
      img.alt = cn;
      img.loading = "lazy";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.src = info?.portraitUrl || "";
      card.appendChild(img);

      grid.appendChild(card);
    }

    const notesEl = document.createElement("div");
    notesEl.style.marginTop = "8px";
    notesEl.style.color = "rgba(255,255,255,.70)";
    notesEl.style.fontSize = "13px";
    notesEl.style.lineHeight = "1.25";
    notesEl.textContent = notes ? `📝 ${notes}` : "";

    const block = document.createElement("div");
    block.style.marginBottom = "12px";
    block.appendChild(wrapper);
    block.appendChild(grid);
    if (notes) block.appendChild(notesEl);

    return block;
  }

  function computeVerdict(ratio, row) {
    const ok = Number(row.min_ratio_ok || 0);
    const safe = Number(row.min_ratio_safe || 0);

    // Si pas de seuil renseigné => on met OK par défaut dès que ratio>=1
    if (!ok && !safe) return ratio >= 1 ? "OK" : "NO";

    if (safe && ratio >= safe) return "SAFE";
    if (ok && ratio >= ok) return "OK";
    return "NO";
  }

  function renderResults() {
    clearNode(resultsWrap);

    const player = (playerSelect?.value || "").trim();
    const enemyPower = parseNumberLoose(enemyPowerInput?.value);

    const defRow = getSelectedDefRow();

    playerChip.textContent = player ? player : "—";

    if (!defRow) {
      resultsCount.textContent = "0";
      return;
    }
    if (!player) {
      resultsCount.textContent = "0";
      const hint = document.createElement("div");
      hint.style.color = "rgba(255,255,255,.75)";
      hint.style.fontWeight = "800";
      hint.textContent = "Choisis un joueur pour afficher les counters disponibles.";
      resultsWrap.appendChild(hint);
      return;
    }

    // Toutes les lignes qui matchent la défense sélectionnée
    const matches = WAR.filter((r) => r.def_key && r.def_key === defRow.def_key);

    // Si def_key pas rempli => fallback sur famille+variante
    const rows =
      matches.length > 0
        ? matches
        : WAR.filter(
            (r) =>
              (r.def_family || "").trim() === (defRow.def_family || "").trim() &&
              (r.def_variant || "").trim() === (defRow.def_variant || "").trim()
          );

    const computed = rows
      .map((r) => {
        const { sum: atkPower } = sumTeamPowerForPlayer(player, r.atk_chars);
        const ratio = enemyPower > 0 ? atkPower / enemyPower : 0;
        const verdict = enemyPower > 0 ? computeVerdict(ratio, r) : "OK";
        return { row: r, atkPower, ratio, verdict };
      })
      .sort((a, b) => {
        // Tri: verdict SAFE > OK > NO, puis ratio desc
        const prio = (v) => (v === "SAFE" ? 2 : v === "OK" ? 1 : 0);
        const d = prio(b.verdict) - prio(a.verdict);
        if (d !== 0) return d;
        return b.ratio - a.ratio;
      });

    resultsCount.textContent = String(computed.length);

    // Si pas de puissance saisie, on affiche quand même (sans ratio)
    if (!enemyPower || enemyPower <= 0) {
      const hint = document.createElement("div");
      hint.style.color = "rgba(255,255,255,.70)";
      hint.style.fontSize = "13px";
      hint.style.marginBottom = "10px";
      hint.textContent =
        "Astuce : saisis la puissance de la défense adverse pour afficher x1.05 / x1.15 et le verdict OK/SAFE.";
      resultsWrap.appendChild(hint);
    }

    computed.forEach(({ row, atkPower, ratio, verdict }) => {
      resultsWrap.appendChild(
        makeResultCard({
          atk_team: row.atk_team,
          atk_chars: row.atk_chars,
          atkPower,
          ratio: enemyPower > 0 ? ratio : 1,
          verdict: enemyPower > 0 ? verdict : "OK",
          notes: row.notes,
        })
      );
    });
  }

  function renderAll() {
    renderDefenseHeader();
    renderResults();
  }

  // ---------- Events ----------
  function onAllianceChange() {
    renderPlayerOptions();
    playerChip.textContent = "—";
    renderAll();
  }

  function onPlayerChange() {
    renderAll();
  }

  function onDefFamilyChange() {
    renderDefVariantOptions();
    renderAll();
  }

  function onDefVariantChange() {
    renderAll();
  }

  function onEnemyPowerInput() {
    renderResults();
  }

  // ---------- Boot ----------
  async function boot() {
    const [warRaw, charsRaw, joueursRaw, rostersRaw] = await Promise.all([
      fetchJson(FILES.warCounters),
      fetchJson(FILES.characters),
      fetchJson(FILES.joueurs),
      fetchJson(FILES.rosters),
    ]);

    // Characters
    CHARS = Array.isArray(charsRaw) ? charsRaw : [];
    CHAR_MAP = new Map();
    CHAR_MULTI = new Map();

    CHARS.forEach((c) => {
      const keys = [c.id, c.nameKey, c.nameFr, c.nameEn].filter(Boolean);
      keys.forEach((k) => {
        const kk = normalizeKey(k);
        if (!kk) return;

        if (!CHAR_MULTI.has(kk)) CHAR_MULTI.set(kk, []);
        CHAR_MULTI.get(kk).push(c);

        const existing = CHAR_MAP.get(kk);
        if (!existing) {
          CHAR_MAP.set(kk, c);
        } else {
          const scNew = scoreCharacterMatch(c, kk);
          const scOld = scoreCharacterMatch(existing, kk);
          if (scNew > scOld) CHAR_MAP.set(kk, c);
        }
      });
    });

    // Joueurs
    JOUEURS = (joueursRaw || [])
      .map((r) => ({
        player: (r.player ?? r.joueur ?? r.JOUEURS ?? "").toString().trim(),
        alliance: (r.alliance ?? r.ALLIANCES ?? "").toString().trim(),
      }))
      .filter((r) => r.player);

    buildPlayersByAlliance();

    // Rosters -> map
    const rostersArr = Array.isArray(rostersRaw) ? rostersRaw : [];
    ROSTER_MAP = new Map();
    for (const r of rostersArr) {
      const p = (r.player ?? "").toString().trim();
      if (!p) continue;

      const normChars = {};
      const chars = r.chars && typeof r.chars === "object" ? r.chars : {};
      for (const [k, v] of Object.entries(chars)) {
        normChars[normalizeKey(k)] = v;
      }
      ROSTER_MAP.set(normalizeKey(p), normChars);
    }

    // War rows
    const warArr = Array.isArray(warRaw) ? warRaw : [];
    WAR = warArr.map(normalizeWarRow).filter((r) => r.def_family && r.def_variant);

    // Render selects
    renderAllianceOptions();
    renderPlayerOptions();
    renderDefFamilyOptions();
    renderDefVariantOptions();

    // defaults
    defVariantSelect.disabled = true;
    playerChip.textContent = "—";
    resultsCount.textContent = "0";
    defTitle.textContent = "—";
  }

  allianceSelect?.addEventListener("change", onAllianceChange);
  playerSelect?.addEventListener("change", onPlayerChange);
  defFamilySelect?.addEventListener("change", onDefFamilyChange);
  defVariantSelect?.addEventListener("change", onDefVariantChange);
  enemyPowerInput?.addEventListener("input", onEnemyPowerInput);

  boot().catch((e) => console.error(e));
})();
