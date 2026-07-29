(() => {
  const $players = document.getElementById("players");
  const $count = document.getElementById("playersCount");
  const $allianceFilters = document.getElementById("allianceFilters");

  if (!$players || !$count) {
    console.error("[mvp] Missing DOM elements.");
    return;
  }

  const FALLBACK_ALLIANCES = [
    { key: "zeus", name: "Zeus", emoji: "⚡️", color: "#F8FF00", order: 1, aliases: ["LoSP Zeus"] },
    { key: "athena", name: "Athéna", emoji: "🦉", color: "#F28C28", order: 2, aliases: ["Athena", "LoSP Athéna", "LoSP Athena"] },
    { key: "kronos", name: "Kronos", emoji: "⏳", color: "#E10D17", order: 3, aliases: ["LoSP Kronos"] },
    { key: "dionysos", name: "Dionysos", emoji: "🍇", color: "#93328E", order: 4, aliases: ["LoSP Dionysos"] },
    { key: "poseidon", name: "Poséidon", emoji: "🔱", color: "#0000FF", order: 5, aliases: ["Poseidon", "LoSP Poséidon", "LoSP Poseidon"] },
    { key: "hades", name: "Hadès", emoji: "🔥", color: "#1EA164", order: 6, aliases: ["Hades", "LoSP Hadès", "LoSP Hades"] },
  ];

  const fallbackByKey = new Map(FALLBACK_ALLIANCES.map((alliance) => [alliance.key, alliance]));
  let knownAlliances = FALLBACK_ALLIANCES;
  const filterInputs = new Map();

  function normalizeAlliance(a) {
    return String(a ?? "")
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function fallbackAllianceKey(a) {
    const n = normalizeAlliance(a);

    if (n.includes("zeus")) return "zeus";
    if (n.includes("athena")) return "athena";
    if (n.includes("kronos")) return "kronos";
    if (n.includes("dionysos")) return "dionysos";
    if (n.includes("poseidon")) return "poseidon";
    if (n.includes("hades")) return "hades";

    return "";
  }

  function allianceKey(a) {
    return window.LoSPAlliances?.getAllianceKey?.(a) || fallbackAllianceKey(a);
  }

  function allianceEmoji(a) {
    const key = allianceKey(a);
    return window.LoSPAlliances?.getAllianceMeta?.(key)?.emoji || fallbackByKey.get(key)?.emoji || "👤";
  }

  function allianceLabel(a) {
    const key = allianceKey(a);
    return window.LoSPAlliances?.getAllianceMeta?.(key)?.name || fallbackByKey.get(key)?.name || String(a ?? "").trim();
  }

  function isAllianceEnabled(key) {
    const input = filterInputs.get(key);
    return !input || input.checked;
  }

  function mergeWithFallbackAlliances(alliances) {
    const merged = [];
    const seen = new Set();

    function addAlliance(alliance) {
      const key = allianceKey(alliance?.key || alliance?.name);
      if (!key || seen.has(key)) return;

      seen.add(key);
      merged.push({ ...alliance, key });
    }

    if (Array.isArray(alliances)) {
      alliances.forEach(addAlliance);
    }

    FALLBACK_ALLIANCES.forEach(addAlliance);

    return merged;
  }

  function renderAllianceFilters() {
    if (!$allianceFilters) return;

    $allianceFilters.innerHTML = knownAlliances
      .map((alliance) => {
        const key = allianceKey(alliance.key);
        const id = `filterAlliance${key.charAt(0).toUpperCase()}${key.slice(1)}`;

        return `
          <label class="filterToggle">
            <input id="${escapeHtml(id)}" type="checkbox" data-alliance-key="${escapeHtml(key)}" checked />
            <span class="fStack">
              <span class="fEmoji">${escapeHtml(allianceEmoji(key))}</span>
              <span class="fName">${escapeHtml(allianceLabel(key))}</span>
            </span>
          </label>
        `;
      })
      .join("");

    filterInputs.clear();
    $allianceFilters.querySelectorAll("input[data-alliance-key]").forEach((input) => {
      filterInputs.set(input.dataset.allianceKey, input);
      input.addEventListener("change", applyFilters);
    });
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
              <div class="rankEmoji">${escapeHtml(allianceEmoji(p.alliance))}</div>
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
    if (window.LoSPAlliances?.loadAlliances) {
      knownAlliances = await window.LoSPAlliances.loadAlliances();
    }

    knownAlliances = mergeWithFallbackAlliances(knownAlliances);
    renderAllianceFilters();

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

    applyFilters();
  }

  init().catch((error) => {
    console.error("[mvp] init error:", error);
    $players.innerHTML = `<p class="subtitle">Impossible de charger le classement MVP.</p>`;
  });
})();
