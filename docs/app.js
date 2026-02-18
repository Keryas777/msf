// docs/app.js
(() => {
  const FILES = {
    teams: "./data/teams.json",
    characters: "./data/msf-characters.json",
    joueurs: "./data/joueurs.json",
  };

  const ALLIANCE_EMOJI = {
    Zeus: "⚡️",
    Dionysos: "🍇",
    Poséidon: "🔱",
    Poseidon: "🔱",
  };

  const qs = (s) => document.querySelector(s);

  const teamSelect = qs("#teamSelect");
  const btnRefresh = qs("#refreshBtn");
  const teamTitle = qs("#teamTitle");
  const portraitsWrap = qs("#portraits");
  const playersWrap = qs("#players");
  const playersCount = qs("#playersCount");
  const statusBox = qs("#statusBox");

  let TEAMS = [];
  let CHAR_MAP = new Map();
  let JOUEURS = [];

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

  // ✅ On n’affiche PLUS les OK, seulement les erreurs
  function setStatus(msg, isError = false) {
    if (!statusBox) return;
    if (!msg || !isError) {
      statusBox.textContent = "";
      statusBox.style.display = "none";
      statusBox.dataset.type = "";
      return;
    }
    statusBox.textContent = msg;
    statusBox.style.display = "block";
    statusBox.dataset.type = "error";
  }

  const normalizeKey = (s) =>
    (s ?? "")
      .toString()
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // enlève accents
      .replace(/\s+/g, "")
      .replace(/[-_]/g, "");

  function clearNode(el) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  // ===== Toast (tap pour nom complet) =====
  let toastTimer = null;
  function showToast(text) {
    if (!text) return;
    let t = qs("#toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast";
      Object.assign(t.style, {
        position: "fixed",
        left: "50%",
        bottom: "18px",
        transform: "translateX(-50%)",
        padding: "10px 14px",
        borderRadius: "999px",
        background: "rgba(0,0,0,0.75)",
        color: "white",
        fontSize: "14px",
        border: "1px solid rgba(255,255,255,0.15)",
        backdropFilter: "blur(10px)",
        zIndex: "9999",
        maxWidth: "90vw",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        opacity: "0",
        transition: "opacity 120ms ease",
      });
      document.body.appendChild(t);
    }
    t.textContent = text;
    requestAnimationFrame(() => (t.style.opacity = "1"));
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.style.opacity = "0"), 900);
  }

  // ===== Taille vignette portraits (0 scroll horizontal, 5 par ligne) =====
  function computeTileSize(containerEl, columns = 5, gap = 10) {
    const w = containerEl?.clientWidth || 360;
    const totalGaps = gap * (columns - 1);
    const size = Math.floor((w - totalGaps) / columns);
    // limites raisonnables iPhone
    return Math.max(52, Math.min(size, 92));
  }

  function applyTileSize(sizePx) {
    document.documentElement.style.setProperty("--tile", `${sizePx}px`);
  }

  function renderTeamOptions() {
    if (!teamSelect) return;
    teamSelect.innerHTML = "";

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "— Choisir une équipe —";
    teamSelect.appendChild(opt0);

    TEAMS.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.team;
      opt.textContent = t.team;
      teamSelect.appendChild(opt);
    });
  }

  function findPortraitFor(name) {
    const key = normalizeKey(name);
    return CHAR_MAP.get(key) || null;
  }

  function renderSelectedTeam(teamName) {
    clearNode(portraitsWrap);
    if (teamTitle) teamTitle.textContent = teamName || "—";
    if (!teamName) return;

    const teamObj = TEAMS.find((t) => t.team === teamName);
    if (!teamObj) return;

    // ✅ Force 5 vignettes sans scroll + pas de crop
    const tile = computeTileSize(portraitsWrap, 5, 10);
    applyTileSize(tile);

    // petits styles inline pour être sûr (peu importe ton CSS)
    portraitsWrap.style.display = "grid";
    portraitsWrap.style.gridTemplateColumns = "repeat(5, minmax(0, 1fr))";
    portraitsWrap.style.gap = "10px";

    (teamObj.characters || []).forEach((charName) => {
      const info = findPortraitFor(charName);

      const card = document.createElement("div");
      card.className = "portraitCard";
      card.addEventListener("click", () => showToast(charName));

      Object.assign(card.style, {
        width: "100%",
        borderRadius: "14px",
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,.10)",
        background: "rgba(20,22,24,.62)",
        boxShadow: "0 6px 16px rgba(0,0,0,.35)",
      });

      const img = document.createElement("img");
      img.className = "portraitImg";
      img.alt = charName;
      img.loading = "lazy";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";

      // ✅ NO CROP : contain + carré
      Object.assign(img.style, {
        width: "100%",
        height: "var(--tile)",
        display: "block",
        objectFit: "contain",
        objectPosition: "center",
        background: "rgba(255,255,255,.03)",
      });

      img.src = info?.portraitUrl || "";

      card.appendChild(img);
      portraitsWrap.appendChild(card);
    });
  }

  // ===== Parsing JOUEURS ultra tolérant =====
  function guessKeysFromObject(obj) {
    const keys = Object.keys(obj || {});
    const norm = keys.map((k) => [k, normalizeKey(k)]);
    const joueurKey =
      norm.find(([, nk]) => nk === "joueur" || nk === "joueurs" || nk.includes("joueur"))?.[0] ||
      norm.find(([, nk]) => nk === "player" || nk.includes("player") || nk.includes("name"))?.[0];

    const allianceKey =
      norm.find(([, nk]) => nk === "alliance" || nk === "alliances" || nk.includes("alliance"))?.[0] ||
      norm.find(([, nk]) => nk.includes("guild") || nk.includes("team"))?.[0];

    return { joueurKey, allianceKey };
  }

  function parseJoueurs(raw) {
    if (!Array.isArray(raw) || raw.length === 0) return [];

    // Cas 1 : tableau d’objets
    if (typeof raw[0] === "object" && !Array.isArray(raw[0])) {
      const { joueurKey, allianceKey } = guessKeysFromObject(raw[0]);
      return raw
        .map((r) => {
          const joueur = (r[joueurKey] ?? r.joueur ?? r.JOUEURS ?? r.Joueurs ?? "").toString().trim();
          const alliance = (r[allianceKey] ?? r.alliance ?? r.ALLIANCES ?? r.Alliances ?? "").toString().trim();
          return { joueur, alliance };
        })
        .filter((x) => x.joueur);
    }

    // Cas 2 : tableau de tableaux (CSV-like)
    if (Array.isArray(raw[0])) {
      const rows = raw;

      // si première ligne = header
      const header = rows[0].map((h) => normalizeKey(h));
      const hasHeader = header.some((h) => h.includes("joueur") || h.includes("alliance"));

      let start = 0;
      let idxJ = 0;
      let idxA = 1;

      if (hasHeader) {
        start = 1;
        idxJ = header.findIndex((h) => h === "joueur" || h === "joueurs" || h.includes("joueur"));
        idxA = header.findIndex((h) => h === "alliance" || h === "alliances" || h.includes("alliance"));
        if (idxJ < 0) idxJ = 0;
        if (idxA < 0) idxA = 1;
      }

      return rows
        .slice(start)
        .map((r) => ({
          joueur: (r[idxJ] ?? "").toString().trim(),
          alliance: (r[idxA] ?? "").toString().trim(),
        }))
        .filter((x) => x.joueur);
    }

    return [];
  }

  function renderPlayers() {
    clearNode(playersWrap);

    const list = Array.isArray(JOUEURS) ? JOUEURS : [];
    if (playersCount) playersCount.textContent = String(list.length || 0);
    if (!playersWrap || !list.length) return;

    // chips responsives sans décalage
    playersWrap.style.display = "flex";
    playersWrap.style.flexWrap = "wrap";
    playersWrap.style.gap = "10px";

    const sorted = [...list].sort((a, b) => {
      const A = (a.alliance || "").toString();
      const B = (b.alliance || "").toString();
      if (A !== B) return A.localeCompare(B, "fr");
      return (a.joueur || "").toString().localeCompare((b.joueur || "").toString(), "fr");
    });

    sorted.forEach((row) => {
      const joueur = (row.joueur ?? "").toString().trim();
      const alliance = (row.alliance ?? "").toString().trim();
      if (!joueur) return;

      const emoji = ALLIANCE_EMOJI[alliance] || "•";

      const chip = document.createElement("div");
      chip.className = "playerChip";
      chip.textContent = `${emoji}${joueur}`; // ✅ PAS d’espace après emoji

      Object.assign(chip.style, {
        display: "inline-flex",
        alignItems: "center",
        gap: "0px",
        padding: "10px 14px",
        borderRadius: "999px",
        border: "1px solid rgba(255,255,255,.12)",
        background: "rgba(0,0,0,.28)",
        boxShadow: "0 6px 16px rgba(0,0,0,.35)",
        color: "rgba(255,255,255,.92)",
        fontWeight: "800",
        letterSpacing: ".2px",
      });

      playersWrap.appendChild(chip);
    });
  }

  async function refreshAll() {
    setStatus("", false);

    try {
      const [teamsRaw, charsRaw, joueursRaw] = await Promise.all([
        fetchJson(FILES.teams),
        fetchJson(FILES.characters),
        fetchJson(FILES.joueurs),
      ]);

      // Teams
      TEAMS = (teamsRaw || [])
        .map((t) => ({
          team: (t.team ?? "").toString().trim(),
          characters: Array.isArray(t.characters)
            ? t.characters.map((c) => (c ?? "").toString().trim()).filter(Boolean)
            : [],
        }))
        .filter((t) => t.team);

      // Characters map
      CHAR_MAP = new Map();
      (charsRaw || []).forEach((c) => {
        const keys = [c.id, c.nameKey, c.nameFr, c.nameEn].filter(Boolean);
        keys.forEach((k) => CHAR_MAP.set(normalizeKey(k), c));
      });

      // Joueurs (tolérant)
      JOUEURS = parseJoueurs(joueursRaw);

      renderTeamOptions();
      renderPlayers();

      const selected = teamSelect?.value || "";
      if (selected) renderSelectedTeam(selected);
    } catch (e) {
      console.error(e);
      setStatus(`Erreur ❌ ${e.message}`, true);
    }
  }

  btnRefresh?.addEventListener("click", refreshAll);
  teamSelect?.addEventListener("change", () => renderSelectedTeam(teamSelect.value));
  window.addEventListener("resize", () => {
    if (teamSelect?.value) renderSelectedTeam(teamSelect.value);
  });

  refreshAll();
})();