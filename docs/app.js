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

  // cache-bust (GitHub Pages cache + Safari)
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

  // normalize fort : minuscules + accents supprimés + tout sauf alnum
  const normalizeKey = (s) => {
    return (s ?? "")
      .toString()
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // diacritiques
      .replace(/[^a-z0-9]/g, ""); // retire espaces, tirets, underscores, parenthèses, etc.
  };

  function clearNode(el) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  // ---- toast simple (tap sur portrait = nom complet)
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
    toastTimer = setTimeout(() => (t.style.opacity = "0"), 950);
  }

  // ---- layout : 5 portraits / ligne, taille calculée, 0 scroll horizontal
  function applyPortraitGridSizing() {
    if (!portraitsWrap) return;
    const cols = 5;
    const gap = 10; // doit matcher ton CSS (portraits { gap: 10px })
    const w = portraitsWrap.clientWidth || 360;
    const tile = Math.floor((w - gap * (cols - 1)) / cols);

    // clamp pour éviter trop petit / trop gros
    const size = Math.max(56, Math.min(tile, 92));

    portraitsWrap.style.display = "grid";
    portraitsWrap.style.gap = `${gap}px`;
    portraitsWrap.style.gridTemplateColumns = `repeat(${cols}, ${size}px)`;
    portraitsWrap.style.justifyContent = "space-between";
  }

  // ---- data helpers
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
    const k = normalizeKey(name);
    return CHAR_MAP.get(k) || null;
  }

  function buildCharacterMap(charsRaw) {
    const map = new Map();

    (Array.isArray(charsRaw) ? charsRaw : []).forEach((c) => {
      const keys = [c?.id, c?.nameKey, c?.nameFr, c?.nameEn].filter(Boolean);
      keys.forEach((k) => map.set(normalizeKey(k), c));

      // bonus : si nameFr contient des espaces/parenthèses, on ajoute une version “compact”
      if (c?.nameFr) map.set(normalizeKey(c.nameFr), c);
      if (c?.nameEn) map.set(normalizeKey(c.nameEn), c);
    });

    return map;
  }

  function renderSelectedTeam(teamName) {
    clearNode(portraitsWrap);
    if (teamTitle) teamTitle.textContent = teamName || "—";
    if (!teamName) return;

    const teamObj = TEAMS.find((t) => t.team === teamName);
    if (!teamObj) return;

    applyPortraitGridSizing();

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

      // IMPORTANT: si portrait introuvable, on met une vignette neutre plutôt que src=""
      if (info?.portraitUrl) {
        img.src = info.portraitUrl;
      } else {
        img.src =
          "data:image/svg+xml;charset=utf-8," +
          encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
              <rect width="100%" height="100%" fill="#141618"/>
              <text x="50%" y="52%" font-family="system-ui,Segoe UI,Roboto" font-size="22" fill="rgba(255,255,255,.55)" text-anchor="middle">?</text>
            </svg>`
          );
      }

      const label = document.createElement("div");
      // ✅ classe qui match ton CSS
      label.className = "portraitName";
      // on affiche un nom court, mais le tap donnera le complet via toast
      label.textContent = charName;

      card.appendChild(img);
      card.appendChild(label);
      portraitsWrap.appendChild(card);
    });
  }

  function extractRows(maybe) {
    if (Array.isArray(maybe)) return maybe;
    if (maybe && Array.isArray(maybe.rows)) return maybe.rows;
    if (maybe && Array.isArray(maybe.data)) return maybe.data;
    return [];
  }

  function renderPlayers() {
    clearNode(playersWrap);

    if (playersCount) playersCount.textContent = String(JOUEURS.length || 0);
    if (!playersWrap || !JOUEURS.length) return;

    // tri stable par alliance puis joueur (FR)
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

      // version “propre” (CSS-friendly)
      const e = document.createElement("span");
      e.className = "emoji";
      e.textContent = emoji;

      const n = document.createElement("span");
      n.className = "name";
      n.textContent = joueur;

      chip.appendChild(e);
      chip.appendChild(n);

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
      TEAMS = extractRows(teamsRaw)
        .map((t) => ({
          team: (t.team ?? t.Team ?? "").toString().trim(),
          characters: Array.isArray(t.characters)
            ? t.characters.map((c) => (c ?? "").toString().trim()).filter(Boolean)
            : // tolère aussi character1..character5 si jamais
              ["character1", "character2", "character3", "character4", "character5"]
                .map((k) => (t[k] ?? "").toString().trim())
                .filter(Boolean),
        }))
        .filter((t) => t.team);

      // Characters map (blindé)
      CHAR_MAP = buildCharacterMap(extractRows(charsRaw));

      // Joueurs
      JOUEURS = extractRows(joueursRaw).map((r) => ({
        joueur: r.joueur ?? r.JOUEURS ?? r.Joueur ?? r.JOUEUR ?? "",
        alliance: r.alliance ?? r.ALLIANCES ?? r.Alliance ?? r.ALLIANCE ?? "",
      })).filter(r => (r.joueur ?? "").toString().trim());

      renderTeamOptions();
      renderPlayers();

      const selected = teamSelect?.value || "";
      if (selected) renderSelectedTeam(selected);

      setStatus("OK ✅ Données chargées (teams / joueurs / personnages).", false);
    } catch (e) {
      console.error(e);
      setStatus(`Erreur ❌ ${e.message}`, true);
    }
  }

  btnRefresh?.addEventListener("click", refreshAll);
  teamSelect?.addEventListener("change", () => renderSelectedTeam(teamSelect.value));
  window.addEventListener("resize", () => {
    applyPortraitGridSizing();
  });

  refreshAll();
})();