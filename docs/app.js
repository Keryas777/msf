/* docs/app.js
   - Ne crée PAS de nouveau layout.
   - Réutilise les éléments existants (select, bouton, cartes).
*/

(() => {
  const BASE_PATH = new URL(".", location.href).pathname.replace(/\/$/, "");
  const jsonUrl = (p) => `${BASE_PATH}/data/${p}?t=${Date.now()}`;

  const URL_TEAMS = jsonUrl("teams.json");
  const URL_CHARS = jsonUrl("msf-characters.json");
  const URL_PLAYERS = jsonUrl("joueurs.json");

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
      document.querySelector("select") // fallback: le 1er select de la page
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

  // Carte "aperçu équipe" : on prend la première grosse carte avec un "—" visible
  function findTeamCard() {
    return (
      $("#teamCard") ||
      $("#teamPreview") ||
      $("#teamBox") ||
      Array.from(document.querySelectorAll("section,div")).find((e) =>
        (e.textContent || "").trim() === "—"
      )
    );
  }

  // Carte "Classement joueurs" : on cherche un bloc qui contient ce texte
  function findPlayersCard() {
    return (
      $("#playersCard") ||
      $("#playersBox") ||
      Array.from(document.querySelectorAll("section,div")).find((e) =>
        (e.textContent || "").includes("Classement joueurs")
      )
    );
  }

  function clearAndSetTeamCard(teamCard, teamObj, portraitsById, namesById) {
    // On écrase le contenu de la carte (ça remplace le "—")
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

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.gap = "10px";
    row.style.flexWrap = "wrap";
    row.style.alignItems = "flex-start";

    for (const idOrName of teamObj.characters || []) {
      const key = String(idOrName ?? "").trim();
      const portrait = portraitsById.get(normKey(key));
      const displayName = namesById.get(normKey(key)) || key;

      const card = document.createElement("div");
      card.style.display = "flex";
      card.style.flexDirection = "column";
      card.style.alignItems = "center";
      card.style.width = "78px";

      const imgWrap = document.createElement("div");
      imgWrap.style.width = "74px";
      imgWrap.style.height = "74px";
      imgWrap.style.borderRadius = "16px";
      imgWrap.style.overflow = "hidden";
      imgWrap.style.border = "1px solid rgba(255,255,255,.12)";
      imgWrap.style.background = "rgba(255,255,255,.06)";

      if (portrait) {
        const img = document.createElement("img");
        img.src = portrait;
        img.alt = displayName;
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
      label.style.marginTop = "8px";
      label.style.fontSize = "13px";
      label.style.lineHeight = "1.1";
      label.style.textAlign = "center";
      label.style.wordBreak = "break-word";

      card.appendChild(imgWrap);
      card.appendChild(label);
      row.appendChild(card);
    }

    teamCard.appendChild(title);
    teamCard.appendChild(row);
  }

  function renderPlayersInCard(playersCard, players) {
    // On garde le titre "Classement joueurs" existant si possible,
    // mais on remplace le contenu "À venir" par notre liste test.
    // Stratégie : on vide tout, puis on reconstruit un mini header + chips.
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
      return String(a.player || "").localeCompare(String(b.player || ""), "fr", { sensitivity: "base" });
    });

    for (const p of sorted) {
      const emoji = emojiForAlliance(p.alliance);
      const label = `${emoji}${String(p.player ?? "").trim()}`; // emoji collé

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

  async function init() {
    const teamSelect = findTeamSelect();
    const refreshBtn = findRefreshBtn();
    const teamCard = findTeamCard();
    const playersCard = findPlayersCard();

    if (!teamSelect || !refreshBtn || !teamCard || !playersCard) {
      throw new Error(
        "Je ne trouve pas les éléments de la page (select/bouton/cartes). " +
          "Dis-moi si ton index.html a des IDs (teamSelect, refreshBtn, teamCard, playersCard)."
      );
    }

    const [teams, chars, players] = await Promise.all([
      fetchJson(URL_TEAMS),
      fetchJson(URL_CHARS),
      fetchJson(URL_PLAYERS),
    ]);

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
      String(a.team || "").localeCompare(String(b.team || ""), "fr", { sensitivity: "base" })
    );

    for (const t of teamsSorted) {
      const o = document.createElement("option");
      o.value = t.team;
      o.textContent = t.team;
      teamSelect.appendChild(o);
    }

    // Render players (test) in the existing "Classement joueurs" card
    renderPlayersInCard(playersCard, players || []);

    const renderSelected = () => {
      const selectedName = teamSelect.value;
      const teamObj = teamsSorted.find((t) => t.team === selectedName) || null;
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
    // Affiche l’erreur dans la carte du haut si possible
    const teamCard = findTeamCard();
    if (teamCard) {
      teamCard.innerHTML = `<div style="font-weight:800;font-size:18px;margin-bottom:6px;">Erreur</div>
      <div style="opacity:.75;font-size:13px;line-height:1.35;">${String(err.message || err)}</div>`;
    }
  });
})();