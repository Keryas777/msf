// docs/app.js
(() => {
  const FILES = {
    teams: "./data/teams.json",
    characters: "./data/msf-characters.json",
    joueurs: "./data/joueurs.json",
    rosters: "./data/rosters.json",
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

  // On réutilise ce bloc pour le classement (1 joueur par ligne)
  const playersWrap = qs("#players");
  const playersCount = qs("#playersCount");
  const statusBox = qs("#statusBox");

  let TEAMS = [];
  let CHAR_MAP = new Map(); // normalizeKey(anyKey) -> characterObj
  let ALLIANCE_BY_PLAYER = new Map(); // "Keryas I" -> "Zeus"
  let ROSTERS = []; // [{player, chars:{key:power}}]

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

  function setError(msg) {
    if (!statusBox) return;
    statusBox.textContent = msg || "";
    statusBox.style.display = msg ? "block" : "none";
    statusBox.dataset.type = "error";
  }

  function clearError() {
    if (!statusBox) return;
    statusBox.textContent = "";
    statusBox.style.display = "none";
    statusBox.dataset.type = "ok";
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

  function formatNumber(n) {
    const x = Number(n || 0);
    return x.toLocaleString("fr-FR");
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

  function findCharacterInfo(name) {
    const key = normalizeKey(name);
    return CHAR_MAP.get(key) || null;
  }

  function getRosterKeyForCharacter(charName) {
    // 1) si on a un mapping characterObj, on privilégie ses clés “techniques”
    const info = findCharacterInfo(charName);
    if (info) {
      const candidates = [info.id, info.nameKey, info.nameEn, info.nameFr, charName].filter(Boolean);
      return normalizeKey(candidates[0]); // id/nameKey en premier
    }
    // 2) fallback: normalisation du nom de la team
    return normalizeKey(charName);
  }

  function renderSelectedTeam(teamName) {
    clearNode(portraitsWrap);
    if (teamTitle) teamTitle.textContent = teamName || "—";
    if (!teamName) return;

    const teamObj = TEAMS.find((t) => t.team === teamName);
    if (!teamObj) return;

    // portraits uniquement (sans noms)
    (teamObj.characters || []).forEach((charName) => {
      const info = findCharacterInfo(charName);

      const card = document.createElement("div");
      card.className = "portraitCard";

      const img = document.createElement("img");
      img.className = "portraitImg";
      img.alt = charName;
      img.loading = "lazy";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.src = info?.portraitUrl || "";

      card.appendChild(img);
      portraitsWrap.appendChild(card);
    });
  }

  function computeRanking(teamName) {
    const teamObj = TEAMS.find((t) => t.team === teamName);
    if (!teamObj) return [];

    const rosterKeys = (teamObj.characters || []).map(getRosterKeyForCharacter);

    // Pour accélérer : map player -> chars
    const byPlayer = new Map();
    for (const r of ROSTERS) {
      const p = (r?.player ?? "").toString().trim();
      if (!p) continue;
      byPlayer.set(p, r.chars || {});
    }

    const results = [];
    for (const [player, chars] of byPlayer.entries()) {
      let total = 0;
      for (const k of rosterKeys) {
        const v = Number(chars?.[k] ?? 0);
        total += Number.isFinite(v) ? v : 0;
      }
      results.push({ player, total });
    }

    results.sort((a, b) => b.total - a.total);
    return results;
  }

  function renderRanking(teamName) {
    clearNode(playersWrap);

    if (!teamName) {
      if (playersCount) playersCount.textContent = "0";
      return;
    }

    const ranking = computeRanking(teamName);
    if (playersCount) playersCount.textContent = String(ranking.length || 0);

    for (let i = 0; i < ranking.length; i++) {
      const { player, total } = ranking[i];

      const alliance = (ALLIANCE_BY_PLAYER.get(player) || "").toString().trim();
      const emoji = ALLIANCE_EMOJI[alliance] || "•";

      const row = document.createElement("div");
      row.className = "rankRow";

      const left = document.createElement("div");
      left.className = "rankLeft";

      const pos = document.createElement("div");
      pos.className = "rankPos";
      pos.textContent = String(i + 1);

      const name = document.createElement("div");
      name.className = "rankName";
      name.textContent = `${emoji}${player}`; // PAS d’espace

      left.appendChild(pos);
      left.appendChild(name);

      const right = document.createElement("div");
      right.className = "rankPower";
      right.textContent = formatNumber(total);

      row.appendChild(left);
      row.appendChild(right);
      playersWrap.appendChild(row);
    }
  }

  async function refreshAll() {
    clearError();

    try {
      const [teamsRaw, charsRaw, joueursRaw, rostersRaw] = await Promise.all([
        fetchJson(FILES.teams),
        fetchJson(FILES.characters),
        fetchJson(FILES.joueurs),
        fetchJson(FILES.rosters),
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

      // Characters map (clé -> objet)
      CHAR_MAP = new Map();
      (charsRaw || []).forEach((c) => {
        const keys = [c.id, c.nameKey, c.nameFr, c.nameEn].filter(Boolean);
        keys.forEach((k) => CHAR_MAP.set(normalizeKey(k), c));
      });

      // Joueurs (2 champs seulement : joueur / alliance)
      ALLIANCE_BY_PLAYER = new Map();
      (joueursRaw || []).forEach((r) => {
        const joueur = (r.joueur ?? r.player ?? r.name ?? "").toString().trim();
        const alliance = (r.alliance ?? "").toString().trim();
        if (joueur) ALLIANCE_BY_PLAYER.set(joueur, alliance);
      });

      // Rosters
      ROSTERS = Array.isArray(rostersRaw) ? rostersRaw : [];

      renderTeamOptions();

      // Si rien sélectionné, on prend la 1ère team (confort)
      if (teamSelect && !teamSelect.value && TEAMS.length) {
        teamSelect.value = TEAMS[0].team;
      }

      const selected = teamSelect?.value || "";
      renderSelectedTeam(selected);
      renderRanking(selected);
    } catch (e) {
      console.error(e);
      setError(`Erreur de chargement ❌\n${e.message}`);
      // On nettoie l'affichage si ça casse
      clearNode(portraitsWrap);
      clearNode(playersWrap);
      if (playersCount) playersCount.textContent = "0";
    }
  }

  btnRefresh?.addEventListener("click", refreshAll);

  teamSelect?.addEventListener("change", () => {
    const selected = teamSelect.value || "";
    renderSelectedTeam(selected);
    renderRanking(selected);
  });

  refreshAll();
})();