(() => {
  const $players = document.getElementById("players");
  const $count = document.getElementById("playersCount");

  const $filterZeus = document.getElementById("filterZeus");
  const $filterDionysos = document.getElementById("filterDionysos");
  const $filterPoseidon = document.getElementById("filterPoseidon");

  if (!$players || !$count) {
    console.error("[mvp] Missing DOM elements.");
    return;
  }

  const ALLIANCE_EMOJI = {
    zeus: "⚡",
    dionysos: "🍇",
    poseidon: "🔱",
  };

  function normalizeAlliance(a) {
    return String(a ?? "").toLowerCase().trim();
  }

  function allianceKey(a) {
    const n = normalizeAlliance(a);
    if (n.includes("zeus")) return "zeus";
    if (n.includes("dionysos")) return "dionysos";
    if (n.includes("poseidon") || n.includes("poséidon")) return "poseidon";
    return "";
  }

  function allianceEmoji(a) {
    const k = allianceKey(a);
    return ALLIANCE_EMOJI[k] || "👤";
  }

  function isAllianceEnabled(key) {
    if (key === "zeus") return $filterZeus.checked;
    if (key === "dionysos") return $filterDionysos.checked;
    if (key === "poseidon") return $filterPoseidon.checked;
    return true;
  }

  function formatNumberFR(n) {
    return Number(n || 0).toLocaleString("fr-FR");
  }

  function safeUrl(u) {
    return /^https?:\/\//i.test(u || "") ? u : "";
  }

  function render(list) {
    $count.textContent = list.length;

    $players.innerHTML = list.map((p, i) => {
      const icon = safeUrl(p.icon);
      const frame = safeUrl(p.frame);

      return `
        <div class="rankRow">
          <div class="rankLeft">
            <div class="rankNum">${i + 1}</div>
            <div class="rankAvatar">
              ${frame ? `<img class="rankAvatarFrame" src="${frame}">` : ""}
              ${icon ? `<img class="rankAvatarIcon" src="${icon}">` : ""}
            </div>
          </div>

          <div class="rankCenter">
            <div class="rankEmoji">${allianceEmoji(p.alliance)}</div>
            <div class="rankName">${p.name}</div>
          </div>

          <div class="rankPower">${formatNumberFR(p.war_mvp)}</div>
        </div>
      `;
    }).join("");
  }

  let allPlayers = [];

  function applyFilters() {
    const filtered = allPlayers.filter(p => {
      return isAllianceEnabled(allianceKey(p.alliance));
    });

    filtered.sort((a, b) => b.war_mvp - a.war_mvp);
    render(filtered);
  }

  async function init() {
    const res = await fetch("./data/infos.json?v=" + Date.now());
    const data = await res.json();

    allPlayers = data.map(p => ({
      name: p.name,
      alliance: p.alliance,
      war_mvp: Number(p.war_mvp || 0),
      icon: p.icon,
      frame: p.frame
    }));

    [$filterZeus, $filterDionysos, $filterPoseidon].forEach(cb =>
      cb.addEventListener("change", applyFilters)
    );

    applyFilters();
  }

  init();
})();
