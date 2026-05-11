(() => {
  const $players = document.getElementById("players");
  const $count = document.getElementById("playersCount");

  const $filterZeus = document.getElementById("filterZeus");
  const $filterDionysos = document.getElementById("filterDionysos");
  const $filterPoseidon = document.getElementById("filterPoseidon");
  const $filterKronos = document.getElementById("filterKronos");

  if (!$players || !$count) {
    console.error("[mvp] Missing DOM elements.");
    return;
  }

  const ALLIANCE_EMOJI = {
    zeus: "⚡",
    dionysos: "🍇",
    poseidon: "🔱",
    kronos: "⏳",
  };

  function normalizeAlliance(a) {
    return String(a ?? "")
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function allianceKey(a) {
    const n = normalizeAlliance(a);

    if (n.includes("zeus")) return "zeus";
    if (n.includes("dionysos")) return "dionysos";
    if (n.includes("poseidon")) return "poseidon";
    if (n.includes("kronos")) return "kronos";

    return "";
  }

  function allianceEmoji(a) {
    const k = allianceKey(a);
    return ALLIANCE_EMOJI[k] || "👤";
  }

  function isAllianceEnabled(key) {
    if (key === "zeus") return !$filterZeus || $filterZeus.checked;
    if (key === "dionysos") return !$filterDionysos || $filterDionysos.checked;
    if (key === "poseidon") return !$filterPoseidon || $filterPoseidon.checked;
    if (key === "kronos") return !$filterKronos || $filterKronos.checked;

    return true;
  }

  function formatNumberFR(n) {
    return Number(n || 0).toLocaleString("fr-FR");
  }

  function safeUrl(u) {
    return /^https?:\/\//i.test(u || "") ? u : "";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function render(list) {
    $count.textContent = list.length;

    $players.innerHTML = list
      .map((p, i) => {
        const icon = safeUrl(p.icon);
        const frame = safeUrl(p.frame);

        return `
          <div class="rankRow">
            <div class="rankLeft">
              <div class="rankNum">${i + 1}</div>
              <div class="rankAvatar">
                ${frame ? `<img class="rankAvatarFrame" src="${escapeHtml(frame)}" alt="">` : ""}
                ${icon ? `<img class="rankAvatarIcon" src="${escapeHtml(icon)}" alt="">` : ""}
              </div>
            </div>

            <div class="rankCenter">
              <div class="rankEmoji">${allianceEmoji(p.alliance)}</div>
              <div class="rankName">${escapeHtml(p.name)}</div>
            </div>

            <div class="rankPower">${formatNumberFR(p.war_mvp)}</div>
          </div>
        `;
      })
      .join("");
  }

  let allPlayers = [];

  function applyFilters() {
    const filtered = allPlayers.filter((p) => {
      return isAllianceEnabled(allianceKey(p.alliance));
    });

    filtered.sort((a, b) => {
      if (b.war_mvp !== a.war_mvp) return b.war_mvp - a.war_mvp;
      return String(a.name || "").localeCompare(String(b.name || ""), "fr", {
        sensitivity: "base",
      });
    });

    render(filtered);
  }

  async function init() {
    const res = await fetch("./data/infos.json?v=" + Date.now(), {
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`[mvp] infos.json HTTP ${res.status}`);
    }

    const data = await res.json();

    allPlayers = (Array.isArray(data) ? data : []).map((p) => ({
      name: p.name,
      alliance: p.alliance,
      war_mvp: Number(p.war_mvp || 0),
      icon: p.icon,
      frame: p.frame,
    }));

    [$filterZeus, $filterDionysos, $filterPoseidon, $filterKronos]
      .filter(Boolean)
      .forEach((cb) => cb.addEventListener("change", applyFilters));

    applyFilters();
  }

  init().catch((error) => {
    console.error("[mvp] init error:", error);
    $players.innerHTML = `<p class="subtitle">Impossible de charger le classement MVP.</p>`;
  });
})();