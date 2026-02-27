/* docs/tcp.js
   Page: tcp.html
   Data: ./data/infos.json
*/

(() => {
  // ---------- DOM ----------
  const $players = document.getElementById("players");
  const $count = document.getElementById("playersCount");

  const $filterZeus = document.getElementById("filterZeus");
  const $filterDionysos = document.getElementById("filterDionysos");
  const $filterPoseidon = document.getElementById("filterPoseidon");

  if (!$players || !$count || !$filterZeus || !$filterDionysos || !$filterPoseidon) {
    console.error("[tcp] Missing DOM elements. Check tcp.html ids.");
    return;
  }

  // ---------- Alliance helpers ----------
  // ⚠️ Ajuste si tes noms d’alliances dans l’onglet Joueurs sont différents
  const ALLIANCE_EMOJI = {
    zeus: "⚡",
    dionysos: "🍇",
    "dionyso": "🍇",
    poseidon: "🔱",
    "poséidon": "🔱",
    "poséidon": "🔱", // cas accent combiné
  };

  function normalizeAlliance(a) {
    return String(a ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function allianceKey(a) {
    const n = normalizeAlliance(a);
    if (n.includes("zeus")) return "zeus";
    if (n.includes("dionysos")) return "dionysos";
    if (n.includes("poséidon") || n.includes("poseidon")) return "poseidon";
    return ""; // inconnu / vide
  }

  function allianceEmoji(a) {
    const k = allianceKey(a);
    return k ? ALLIANCE_EMOJI[k] : "👤";
  }

  function isAllianceEnabled(key) {
    if (key === "zeus") return $filterZeus.checked;
    if (key === "dionysos") return $filterDionysos.checked;
    if (key === "poseidon") return $filterPoseidon.checked;
    // si alliance inconnue, on l’affiche par défaut (ou change à false si tu préfères)
    return true;
  }

  // ---------- Formatting ----------
  function formatNumberFR(n) {
    const x = Number(n || 0);
    return x.toLocaleString("fr-FR");
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function safeUrl(u) {
    const s = String(u ?? "").trim();
    if (!s) return "";
    // permet http/https uniquement
    if (/^https?:\/\//i.test(s)) return s;
    return "";
  }

  // ---------- Render ----------
  function render(list) {
    $count.textContent = String(list.length);

    if (!list.length) {
      $players.innerHTML = `<div style="color: rgba(255,255,255,.65); padding: 6px 2px; text-align:center;">
        Aucun joueur ne correspond aux filtres.
      </div>`;
      return;
    }

    const html = list
      .map((p, idx) => {
        const name = escapeHtml(p.name);
        const emoji = allianceEmoji(p.alliance);

        const icon = safeUrl(p.icon);
        const frame = safeUrl(p.frame);

        // Avatar: si on n’a pas d’URL, on met un fallback simple
        const avatarHtml =
          icon || frame
            ? `<div class="rankAvatar">
                ${icon ? `<img class="rankAvatarIcon" src="${icon}" alt="" loading="lazy" decoding="async">` : ""}
                ${frame ? `<img class="rankAvatarFrame" src="${frame}" alt="" loading="lazy" decoding="async">` : ""}
              </div>`
            : `<div class="rankAvatar" aria-hidden="true"></div>`;

        return `
          <div class="rankRow">
            <div class="rankLeft">
              <div class="rankNum">${idx + 1}</div>
              ${avatarHtml}
            </div>

            <div class="rankCenter">
              <div class="rankEmoji" aria-label="Alliance">${emoji}</div>
              <div class="rankName" title="${name}">${name}</div>
            </div>

            <div class="rankPower">${formatNumberFR(p.tcp)}</div>
          </div>
        `;
      })
      .join("");

    $players.innerHTML = html;
  }

  // ---------- Data / State ----------
  let allPlayers = [];

  function applyFiltersAndRender() {
    const filtered = allPlayers.filter((p) => {
      const key = allianceKey(p.alliance);
      return isAllianceEnabled(key);
    });

    // tri TCP desc
    filtered.sort((a, b) => (b.tcp || 0) - (a.tcp || 0));

    render(filtered);
  }

  // ---------- Init ----------
  async function init() {
    try {
      const res = await fetch("./data/infos.json?v=" + Date.now(), { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (!Array.isArray(data)) throw new Error("infos.json is not an array");

      // normalise/minimise surprises
      allPlayers = data
        .map((p) => ({
          name: String(p?.name ?? "").trim(),
          alliance: String(p?.alliance ?? "").trim(),
          tcp: Number(p?.tcp ?? 0) || 0,
          icon: String(p?.icon ?? "").trim(),
          frame: String(p?.frame ?? "").trim(),
        }))
        .filter((p) => p.name);

      // listeners
      [$filterZeus, $filterDionysos, $filterPoseidon].forEach((cb) => {
        cb.addEventListener("change", applyFiltersAndRender);
      });

      applyFiltersAndRender();
    } catch (err) {
      console.error("[tcp] init error:", err);
      $players.innerHTML = `<div style="color: rgba(255,255,255,.75); padding: 10px; text-align:center;">
        ❌ Impossible de charger <code>data/infos.json</code><br>
        <span style="color: rgba(255,255,255,.55); font-size: 13px;">${escapeHtml(err?.message || err)}</span>
      </div>`;
      $count.textContent = "0";
    }
  }

  init();
})();
