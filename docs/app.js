/* docs/app.js
   - Ne crée PAS de nouveau layout.
   - Remplit les éléments existants (select, bouton, cartes).
   - 5 portraits TOUJOURS sur 1 ligne, SANS scroll horizontal, taille dynamique.
*/

(() => {
  const BASE_PATH = new URL(".", location.href).pathname.replace(/\/$/, "");
  const jsonUrl = (p) => `${BASE_PATH}/data/${p}?t=${Date.now()}`;

  const URL_TEAMS = jsonUrl("teams.json");
  const URL_CHARS = jsonUrl("msf-characters.json");
  const URL_PLAYERS = jsonUrl("joueurs.json"); // si absent, on ignore

  const $ = (sel) => document.querySelector(sel);

  async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
    return res.json();
  }

  const normKey = (s) =>
    String(s ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[-_]/g, "");

  function emojiForAlliance(alliance) {
    const a = String(alliance ?? "").trim().toLowerCase();
    if (a === "zeus") return "⚡️";
    if (a === "dionysos") return "🍇";
    if (a === "poséidon" || a === "poseidon") return "🔱";
    return "•";
  }

  function findTeamSelect() {
    return (
      $("#teamSelect") ||
      $("#team") ||
      $("#selectTeam") ||
      document.querySelector("select")
    );
  }

  function findRefreshBtn() {
    return (
      $("#refreshBtn") ||
      $("#refresh") ||
      $("#btnRefresh") ||
      Array.from(document.querySelectorAll("button")).find((b) =>
        /rafraîchir/i.test(b.textContent || "")
      )
    );
  }

  // Carte équipe : si tu as un ID, c'est le mieux. Sinon, on prend la première "card" qui suit le header.
  function findTeamCard() {
    return (
      $("#teamCard") ||
      $("#teamPreview") ||
      $("#teamBox") ||
      // fallback : première section/div "card-like" assez grosse
      Array.from(document.querySelectorAll("section,div")).find((e) => {
        const cls = (e.className || "").toString();
        const txt = (e.textContent || "").trim();
        return (
          /card|panel|box/i.test(cls) &&
          txt.length < 300 && // évite de choper la liste joueurs
          e.querySelector("select") == null // évite la zone de filtres
        );
      })
    );
  }

  function findPlayersCard() {
    return (
      $("#playersCard") ||
      $("#playersBox") ||
      Array.from(document.querySelectorAll("section,div")).find((e) =>
        (e.textContent || "").includes("Joueurs du groupement")
      ) ||
      Array.from(document.querySelectorAll("section,div")).find((e) =>
        (e.textContent || "").includes("Classement joueurs")
      )
    );
  }

  function renderPlayersInCard(playersCard, players) {
    if (!playersCard) return;

    playersCard.innerHTML = "";

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "baseline";
    header.style.gap = "10px";
    header.style.marginBottom = "10px";

    const hLeft = document.createElement("div");
    hLeft.textContent = "Joueurs du groupement (test)";
    hLeft.style.fontWeight = "800";
    hLeft.style.fontSize = "18px";

    const hRight = document.createElement("div");
    hRight.textContent = String(players.length);
    hRight.style.opacity = ".65";
    hRight.style.fontSize = "13px";

    header.appendChild(hLeft);
    header.appendChild(hRight);

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexWrap = "wrap";
    wrap.style.gap = "8px";
    wrap.style.alignItems = "center";

    const order = { zeus: 1, dionysos: 2, "poséidon": 3, poseidon: 3 };
    const sorted = [...players].sort((a, b) => {
      const aa = (a.alliance || "").toLowerCase();
      const bb = (b.alliance || "").toLowerCase();
      const oa = order[aa] ?? 99;
      const ob = order[bb] ?? 99;
      if (oa !== ob) return oa - ob;
      return String(a.player || "").localeCompare(String(b.player || ""), "fr", {
        sensitivity: "base",
      });
    });

    for (const p of sorted) {
      const emoji = emojiForAlliance(p.alliance);
      const label = `${emoji}${String(p.player ?? "").trim()}`; // emoji collé (sans espace)

      const chip = document.createElement("div");
      chip.textContent = label;
      chip.title = `${p.player} — ${p.alliance}`;
      chip.style.padding = "8px 10px";
      chip.style.borderRadius = "999px";
      chip.style.border = "1px solid rgba(255,255,255,.12)";
      chip.style.background = "rgba(0,0,0,.22)";
      chip.style.whiteSpace = "nowrap";

      wrap.appendChild(chip);
    }

    playersCard.appendChild(header);
    playersCard.appendChild(wrap);
  }

  // Calcule une taille de vignette pour 5 items sur une ligne, sans scroll.
  function computeTileSize(container, gapPx = 10) {
    const rect = container.getBoundingClientRect();
    const w = Math.floor(rect.width);

    // Marges internes de sécurité (padding, bordures, etc.)
    const safe = 8;

    // Largeur disponible pour 5 items + 4 gaps
    const available = Math.max(0, w - safe - gapPx * 4);

    // Taille brute
    let size = Math.floor(available / 5);

    // Clamp (évite trop petit / trop gros)
    size = Math.max(50, Math.min(84, size));

    return size;
  }

  function clearAndSetTeamCard(teamCard, teamObj, portraitsById, namesById) {
    teamCard.innerHTML = "";

    if (!teamObj) {
      teamCard.textContent = "—";
      return;
    }

    const title = document.createElement("div");
    title.textContent = teamObj.team;
    title.style.fontWeight = "800";
    title.style.fontSize = "22px";
    title.style.marginBottom = "12px";

    // Row 5 items, no wrap, no scroll
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.gap = "10px";
    row.style.flexWrap = "nowrap";
    row.style.overflow = "hidden";
    row.style.alignItems = "flex-start";

    // On stocke les nodes pour recalculer la taille sur resize
    const tileNodes = [];

    for (const idOrName of teamObj.characters || []) {
      const key = String(idOrName ?? "").trim();
      const portrait = portraitsById.get(normKey(key));
      const displayName = namesById.get(normKey(key)) || key;

      const tile = document.createElement("div");
      tile.style.display = "flex";
      tile.style.flexDirection = "column";
      tile.style.alignItems = "center";
      tile.style.flex = "0 0 auto";
      tile.style.minWidth = "0"; // important iOS

      const imgWrap = document.createElement("div");
      imgWrap.style.borderRadius = "16px";
      imgWrap.style.overflow = "hidden";
      imgWrap.style.border = "1px solid rgba(255,255,255,.12)";
      imgWrap.style.background = "rgba(255,255,255,.06)";

      if (portrait) {
        const img = document.createElement("img");
        img.src = portrait;
        img.alt = displayName;
        img.loading = "lazy";
        img.decoding = "async";
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "cover";
        imgWrap.appendChild(img);
      } else {
        const q = document.createElement("div");
        q.textContent = "?";
        q.style.width = "100%";
        q.style.height = "100%";
        q.style.display = "flex";
        q.style.alignItems = "center";
        q.style.justifyContent = "center";
        q.style.opacity = ".7";
        q.style.fontSize = "26px";
        imgWrap.appendChild(q);
      }

      const label = document.createElement("div");
      label.textContent = displayName;

      // Empêche le retour à la ligne : on tronque avec …
      label.style.marginTop = "8px";
      label.style.fontSize = "12px";
      label.style.lineHeight = "1.1";
      label.style.textAlign = "center";
      label.style.whiteSpace = "nowrap";
      label.style.overflow = "hidden";
      label.style.textOverflow = "ellipsis";
      label.style.maxWidth = "100%";

      tile.appendChild(imgWrap);
      tile.appendChild(label);
      row.appendChild(tile);

      tileNodes.push({ tile, imgWrap, label });
    }

    teamCard.appendChild(title);
    teamCard.appendChild(row);

    // Applique la taille dynamique
    const applySizes = () => {
      const tileSize = computeTileSize(row, 10);
      const imgSize = tileSize; // carré
      const radius = Math.max(12, Math.floor(tileSize * 0.22));

      for (const n of tileNodes) {
        n.tile.style.width = `${tileSize}px`;
        n.imgWrap.style.width = `${imgSize}px`;
        n.imgWrap.style.height = `${imgSize}px`;
        n.imgWrap.style.borderRadius = `${radius}px`;
      }
    };

    // Appel immédiat + sur resize/orientation
    applySizes();

    // Debounce léger
    let t = null;
    const onResize = () => {
      if (t) clearTimeout(t);
      t = setTimeout(applySizes, 60);
    };

    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("orientationchange", onResize, { passive: true });

    // Bonus : quand les polices/images chargent, la largeur peut bouger un poil
    setTimeout(applySizes, 150);
    setTimeout(applySizes, 400);
  }

  async function init() {
    const teamSelect = findTeamSelect();
    const refreshBtn = findRefreshBtn();
    const teamCard = findTeamCard();
    const playersCard = findPlayersCard();

    if (!teamSelect || !refreshBtn || !teamCard) {
      throw new Error(
        "Je ne trouve pas les éléments de la page (select/bouton/carte équipe). " +
          "Idéalement ajoute des IDs : teamSelect, refreshBtn, teamCard."
      );
    }

    // Teams + Characters obligatoires
    const [teams, chars] = await Promise.all([
      fetchJson(URL_TEAMS),
      fetchJson(URL_CHARS),
    ]);

    // Players optionnel (si le JSON n’existe pas encore, on ignore)
    let players = [];
    try {
      players = await fetchJson(URL_PLAYERS);
    } catch (_) {
      players = [];
    }

    const portraitsById = new Map();
    const namesById = new Map();
    for (const c of chars || []) {
      const id = normKey(c.id || c.nameKey || c.nameEn || c.nameFr);
      if (!id) continue;
      if (c.portraitUrl) portraitsById.set(id, c.portraitUrl);
      const display = c.nameFr || c.nameEn || c.id || c.nameKey;
      if (display) namesById.set(id, display);
    }

    // Populate select
    teamSelect.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "— Choisir une équipe —";
    teamSelect.appendChild(opt0);

    const teamsSorted = [...(teams || [])].sort((a, b) =>
      String(a.team || "").localeCompare(String(b.team || ""), "fr", {
        sensitivity: "base",
      })
    );

    for (const t of teamsSorted) {
      const o = document.createElement("option");
      o.value = t.team;
      o.textContent = t.team;
      teamSelect.appendChild(o);
    }

    // Render players (test) si on a une carte et des données
    if (playersCard && Array.isArray(players) && players.length) {
      renderPlayersInCard(playersCard, players);
    }

    const renderSelected = () => {
      const selectedName = teamSelect.value;
      const teamObj =
        teamsSorted.find((t) => t.team === selectedName) || null;
      clearAndSetTeamCard(teamCard, teamObj, portraitsById, namesById);
    };

    teamSelect.addEventListener("change", renderSelected);
    refreshBtn.addEventListener("click", () => location.reload());

    // Default selection
    if (!teamSelect.value && teamsSorted.length) {
      teamSelect.value = teamsSorted[0].team;
    }
    renderSelected();
  }

  init().catch((err) => {
    console.error(err);
    const teamCard = findTeamCard();
    if (teamCard) {
      teamCard.innerHTML = `<div style="font-weight:800;font-size:18px;margin-bottom:6px;">Erreur</div>
      <div style="opacity:.75;font-size:13px;line-height:1.35;">${String(
        err.message || err
      )}</div>`;
    }
  });
})();