/* docs/war-rankings.js */
(() => {
  const $players = document.getElementById("players");
  const $count = document.getElementById("playersCount");
  const $rankingTitle = document.getElementById("rankingTitle");
  const $rankingHint = document.getElementById("rankingHint");
  const $minWarsSelect = document.getElementById("minWarsSelect");
  const tabs = Array.from(document.querySelectorAll(".rankingTab"));

  const filters = {
    zeus: document.getElementById("filterZeus"),
    dionysos: document.getElementById("filterDionysos"),
    poseidon: document.getElementById("filterPoseidon"),
    kronos: document.getElementById("filterKronos"),
  };

  const EMOJI = { zeus: "⚡", dionysos: "🍇", poseidon: "🔱", kronos: "⏳" };
  const LABEL = { zeus: "Zeus", dionysos: "Dionysos", poseidon: "Poséidon", kronos: "Kronos" };

  const RANKINGS = {
    avg_score: {
      title: "⭐ Meilleure note moyenne",
      hint: "Moyenne du score total par guerre.",
      field: "avg_score",
      order: "desc",
      main: (p) => `${fmt(p.avg_score, 1)}/100`,
      sub: (p) => `${p.wars_played} guerre${p.wars_played > 1 ? "s" : ""} • meilleur ${fmt(p.best_score, 0)}`,
    },
    success_rate: {
      title: "🎯 Meilleur taux de réussite",
      hint: "Attaques réussies divisées par attaques tentées.",
      field: "success_rate",
      order: "desc",
      main: (p) => `${fmt(p.success_rate, 1)} %`,
      sub: (p) => `${p.total_successful_attacks}/${p.total_attacks} attaques réussies`,
    },
    miss_rate: {
      title: "❌ Moins de ratés par attaque",
      hint: "Ratio de ratés par attaque tentée. Le plus bas est le meilleur.",
      field: "miss_rate",
      order: "asc",
      main: (p) => `${fmt(p.miss_rate, 1)} %`,
      sub: (p) => `${p.total_misses} raté${p.total_misses > 1 ? "s" : ""} / ${p.total_attacks} attaques`,
    },
    avg_impact: {
      title: "🔥 Meilleur impact moyen",
      hint: "Moyenne du score d’impact offensif par guerre.",
      field: "avg_impact",
      order: "desc",
      main: (p) => `${fmt(p.avg_impact, 1)}/35`,
      sub: (p) => `${compact(p.avg_damage_per_war)} dégâts moyens / guerre`,
    },
    avg_defense: {
      title: "🛡️ Meilleure contribution défensive",
      hint: "Moyenne du score défense par guerre.",
      field: "avg_defense",
      order: "desc",
      main: (p) => `${fmt(p.avg_defense, 1)}/15`,
      sub: (p) => `${p.defense_wins} victoire${p.defense_wins > 1 ? "s" : ""} déf. • ${p.deviations} déviation${p.deviations > 1 ? "s" : ""}`,
    },
    avg_activity: {
      title: "⚔️ Meilleure activité moyenne",
      hint: "Moyenne du score d’activité par guerre.",
      field: "avg_activity",
      order: "desc",
      main: (p) => `${fmt(p.avg_activity, 1)}/25`,
      sub: (p) => `${fmt((p.total_attacks || 0) / Math.max(1, p.wars_played || 1), 1)} attaques / guerre`,
    },
  };

  let allPlayers = [];
  let currentRanking = "avg_score";

  function normAlliance(a) {
    const n = String(a ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (n.includes("zeus")) return "zeus";
    if (n.includes("dionysos")) return "dionysos";
    if (n.includes("poseidon")) return "poseidon";
    if (n.includes("kronos") || n.includes("cronos") || n.includes("chronos")) return "kronos";
    return "";
  }

  function fmt(value, decimals = 1) {
    return Number(value || 0).toLocaleString("fr-FR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  function compact(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n) || n <= 0) return "0";
    if (n >= 1_000_000_000) return `${String(Math.round((n / 1_000_000_000) * 10) / 10).replace(".", ",")} Md`;
    if (n >= 1_000_000) return `${String(Math.round((n / 1_000_000) * 10) / 10).replace(".", ",")} M`;
    if (n >= 1_000) return `${Math.round(n / 1_000)} k`;
    return String(Math.round(n));
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function enabled(key) {
    if (!key) return true;
    return filters[key]?.checked !== false;
  }

  function sortRows(rows, config) {
    const dir = config.order === "asc" ? 1 : -1;
    return rows.sort((a, b) => {
      const va = Number(a[config.field] || 0);
      const vb = Number(b[config.field] || 0);
      if (va !== vb) return (va - vb) * dir;
      if ((b.wars_played || 0) !== (a.wars_played || 0)) return (b.wars_played || 0) - (a.wars_played || 0);
      if ((b.total_attacks || 0) !== (a.total_attacks || 0)) return (b.total_attacks || 0) - (a.total_attacks || 0);
      return String(a.name || "").localeCompare(String(b.name || ""), "fr", { sensitivity: "base" });
    });
  }

  function render(rows) {
    const config = RANKINGS[currentRanking];
    $rankingTitle.textContent = config.title;
    $rankingHint.textContent = config.hint;
    $count.textContent = String(rows.length);

    if (!rows.length) {
      $players.innerHTML = `<div class="emptyState">Aucun joueur ne correspond aux filtres ou au minimum de guerres sélectionné.</div>`;
      return;
    }

    $players.innerHTML = rows.map((p, i) => {
      const key = normAlliance(p.alliance);
      const emoji = EMOJI[key] || "👤";
      const alliance = LABEL[key] || "Alliance";
      return `
        <div class="rankRow">
          <div class="rankLeft">
            <div class="rankNum">${i + 1}</div>
            <div class="rankAvatar" aria-hidden="true"><span class="rankAvatarEmoji">${emoji}</span></div>
          </div>
          <div class="rankCenter">
            <div class="rankMainLine">
              <div class="rankEmoji" aria-label="${esc(alliance)}">${emoji}</div>
              <div class="rankName" title="${esc(p.name)}">${esc(p.name)}</div>
            </div>
            <div class="rankMeta">${esc(alliance)} • ${p.wars_played} guerre${p.wars_played > 1 ? "s" : ""}</div>
          </div>
          <div class="rankPower">
            <div>${esc(config.main(p))}</div>
            <div class="rankSubValue">${esc(config.sub(p))}</div>
          </div>
        </div>`;
    }).join("");
  }

  function apply() {
    const minWars = Number($minWarsSelect.value || 1);
    const config = RANKINGS[currentRanking];
    const rows = allPlayers.filter((p) => {
      const key = normAlliance(p.alliance);
      if (!enabled(key)) return false;
      if (Number(p.wars_played || 0) < minWars) return false;
      if ((currentRanking === "success_rate" || currentRanking === "miss_rate") && Number(p.total_attacks || 0) <= 0) return false;
      return true;
    });
    render(sortRows(rows, config));
  }

  function setRanking(key) {
    if (!RANKINGS[key]) return;
    currentRanking = key;
    tabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.ranking === key));
    apply();
  }

  async function init() {
    try {
      const res = await fetch("./data/war-stats.json?v=" + Date.now(), { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error("war-stats.json is not an array");

      allPlayers = data.map((p) => ({ ...p, alliance: normAlliance(p.alliance), name: String(p.name || "").trim() })).filter((p) => p.name);

      Object.values(filters).forEach((cb) => cb?.addEventListener("change", apply));
      $minWarsSelect.addEventListener("change", apply);
      tabs.forEach((tab) => tab.addEventListener("click", () => setRanking(tab.dataset.ranking)));
      setRanking(currentRanking);
    } catch (error) {
      console.error("[war-rankings] init error:", error);
      $players.innerHTML = `<div class="emptyState">❌ Impossible de charger <code>data/war-stats.json</code><br><span style="color: rgba(255,255,255,.55); font-size: 13px;">${esc(error?.message || error)}</span></div>`;
      $count.textContent = "0";
    }
  }

  init();
})();
