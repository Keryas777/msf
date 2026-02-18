// docs/app.js
(() => {
  const FILES = {
    teams: "./data/teams.json",
    characters: "./data/msf-characters.json",
    joueurs: "./data/joueurs.json",
  };

  const ALLIANCE_EMOJI = { Zeus: "⚡️", Dionysos: "🍇", Poséidon: "🔱", Poseidon: "🔱" };
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

  function setStatus(msg, isError = false) {
    if (!statusBox) return;
    statusBox.textContent = msg || "";
    statusBox.style.display = msg ? "block" : "none";
    statusBox.dataset.type = isError ? "error" : "ok";
  }

  const normalizeKey = (s) =>
    (s ?? "")
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[-_]/g, "");

  function clearNode(el) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function computeTileSize(containerEl, columns = 5, gap = 12) {
    const w = containerEl?.clientWidth || 360;
    const totalGaps = gap * (columns - 1);
    const size = Math.floor((w - totalGaps) / columns);
    return Math.max(58, Math.min(size, 92));
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

  let toastTimer = null;
  function showToast(text) {
    if (!text) return;
    let t = qs("#toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast";
      t.style.position = "fixed";
      t.style.left = "50%";
      t.style.bottom = "18px";
      t.style.transform = "translateX(-50%)";
      t.style.padding = "10px 14px";
      t.style.borderRadius = "999px";
      t.style.background = "rgba(0,0,0,0.75)";
      t.style.color = "white";
      t.style.fontSize = "14px";
      t.style.border = "1px solid rgba(255,255,255,0.15)";
      t.style.backdropFilter = "blur(10px)";
      t.style.zIndex = "9999";
      t.style.maxWidth = "90vw";
      t.style.whiteSpace = "nowrap";
      t.style.overflow = "hidden";
      t.style.textOverflow = "ellipsis";
      t.style.opacity = "0";
      t.style.transition = "opacity 120ms ease";
      document.body.appendChild(t);
    }
    t.textContent = text;
    requestAnimationFrame(() => (t.style.opacity = "1"));
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.style.opacity = "0"), 900);
  }

  function renderSelectedTeam(teamName) {
    clearNode(portraitsWrap);
    if (teamTitle) teamTitle.textContent = teamName || "—";
    if (!teamName) return;

    const teamObj = TEAMS.find((t) => t.team === teamName);
    if (!teamObj) return;

    applyTileSize(computeTileSize(portraitsWrap, 5, 12));

    (teamObj.characters || []).forEach((charName) => {
      const info = findPortraitFor(charName);

      const card = document.createElement("div");
      card.className = "portraitCard";
      card.addEventListener("click", () => showToast(charName));

      const img = document.createElement("img");
      img.className = "portraitImg";
      img.alt = charName;
      img.loading = "lazy";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.src = info?.portraitUrl || "";

      const label = document.createElement("div");
      label.className = "portraitLabel";
      label.textContent = charName;

      card.appendChild(img);
      card.appendChild(label);
      portraitsWrap.appendChild(card);
    });
  }

  function renderPlayers() {
    clearNode(playersWrap);
    if (playersCount) playersCount.textContent = String(JOUEURS.length || 0);

    if (!JOUEURS.length) return;

    const sorted = [...JOUEURS].sort((a, b) => {
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
      chip.textContent = `${emoji}${joueur}`; // PAS d’espace
      playersWrap.appendChild(chip);
    });
  }

  async function refreshAll() {
    setStatus("Chargement…");

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

      // Joueurs
      JOUEURS = (joueursRaw || []).map((r) => ({
        joueur: r.joueur ?? r.JOUEURS ?? "",
        alliance: r.alliance ?? r.ALLIANCES ?? "",
      }));

      renderTeamOptions();
      renderPlayers();

      const selected = teamSelect?.value || "";
      if (selected) renderSelectedTeam(selected);

      setStatus(
        `OK ✅\nteams.json / joueurs.json / msf-characters.json chargés depuis ./data/`,
        false
      );
    } catch (e) {
      console.error(e);
      setStatus(`Erreur ❌\n${e.message}`, true);
    }
  }

  btnRefresh?.addEventListener("click", refreshAll);
  teamSelect?.addEventListener("change", () => renderSelectedTeam(teamSelect.value));
  window.addEventListener("resize", () => applyTileSize(computeTileSize(portraitsWrap, 5, 12)));

  refreshAll();
})();