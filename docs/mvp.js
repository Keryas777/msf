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
    { key: "poseidon", name: "Poséidon", emoji: "🔱", color: "#0073ff", order: 5, aliases: ["Poseidon", "LoSP Poséidon", "LoSP Poseidon"] },
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

  function allianceColor(value) {
    const key = allianceKey(value);
    const color = window.LoSPAlliances?.getAllianceMeta?.(key)?.color
      || fallbackByKey.get(key)?.color || "";
    return /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : "#b5c6e3";
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
      if (!key || seen.has(key) || !window.LoSPAccess?.isAllianceAllowed(key)) return;

      seen.add(key);
      merged.push({ ...alliance, key });
    }

    if (Array.isArray(alliances)) {
      alliances.forEach(addAlliance);
    }

    FALLBACK_ALLIANCES.forEach(addAlliance);

    return merged;
  }

  function updateFilterSummary() {
    const summary = document.getElementById("allianceFilterSummaryText");
    if (!summary) return;
    const selected = knownAlliances.filter((alliance) => isAllianceEnabled(allianceKey(alliance.key)));
    summary.textContent = selected.length === knownAlliances.length
      ? "Toutes les alliances"
      : selected.length === 0
        ? "Aucune alliance sélectionnée"
        : selected.length === 1
          ? selected[0].name
          : selected.length + " alliances sélectionnées";
  }

  function renderAllianceFilters() {
    if (!$allianceFilters) return;

    $allianceFilters.innerHTML = knownAlliances
      .map((alliance) => {
        const key = allianceKey(alliance.key);
        const id = `filterAlliance${key.charAt(0).toUpperCase()}${key.slice(1)}`;
        const emojiSafe = alliance.nameColor || (alliance.displayParts?.length === 2 && alliance.group !== "losp")
          ? ""
          : escapeHtml(allianceEmoji(key));

        return `
          <label class="filterToggle" data-alliance-name-lines="two">
            <input id="${escapeHtml(id)}" type="checkbox" data-alliance-key="${escapeHtml(key)}" checked />
            <span class="fStack">
              <span class="fEmoji">${emojiSafe}</span>
              <span class="fName">${escapeHtml(allianceLabel(key))}</span>
            </span>
          </label>
        `;
      })
      .join("");

    filterInputs.clear();
    $allianceFilters.querySelectorAll("input[data-alliance-key]").forEach((input) => {
      window.LoSPAlliances?.renderAllianceName?.(input.closest("label")?.querySelector(".fName"), input.dataset.allianceKey);
      filterInputs.set(input.dataset.allianceKey, input);
      input.addEventListener("change", () => { updateFilterSummary(); applyFilters(); });
    });
    updateFilterSummary();
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

    if (!list.length) {
      $players.textContent = "Aucun joueur ne correspond aux filtres.";
      return;
    }
    $players.innerHTML = list
      .map((p, i) => {
        const icon = safeUrl(p.icon);
        const frame = safeUrl(p.frame);

        return `
          <article class="rankRow">
            <div class="rankLeft">
              <strong class="rankNum">#${i + 1}</strong>
              <div class="rankAvatar">
                ${frame ? `<img class="rankAvatarFrame" src="${escapeHtml(frame)}" alt="">` : ""}
                ${icon ? `<img class="rankAvatarIcon" src="${escapeHtml(icon)}" alt="">` : ""}
              </div>
            </div>

            <div class="rankCenter">
              <strong class="rankName">${escapeHtml(p.name)}</strong>
              <small class="rankAlliance" style="--alliance-color:${allianceColor(p.alliance)}">${escapeHtml(allianceEmoji(p.alliance))} ${escapeHtml(allianceLabel(p.alliance))}</small>
            </div>

            <div class="rankPower">${formatNumberFR(p.war_mvp)}</div>
          </article>
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
    if (window.LoSP_AUTH_READY) await window.LoSP_AUTH_READY;
    if (window.LoSPAlliances?.loadAlliances) {
      knownAlliances = await window.LoSPAlliances.loadAlliances();
    }

    knownAlliances = mergeWithFallbackAlliances(knownAlliances);
    renderAllianceFilters();

    const { rows: data, warning } = await window.LoSPRankingInfos.load();
    const notice = document.getElementById("rankingsDataNotice");
    if (notice) {
      notice.hidden = !warning;
      notice.textContent = warning;
    }

    allPlayers = (Array.isArray(data) ? data : []).filter(p => window.LoSPAccess?.isAllianceAllowed(p?.alliance)).map((p) => ({
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
    $players.textContent = error?.message || "Impossible de charger le classement MVP.";
  });
})();
