/* docs/tcp.js
   Page: tcp.html
   Data: ./data/infos.json
   Fix: frame derrière, icon devant
   Alliances: helper commun + fallback local
*/

(() => {
  // ---------- DOM ----------
  const $players = document.getElementById("players");
  const $count = document.getElementById("playersCount");
  const $filters = document.getElementById("allianceFilters");

  if (!$players || !$count || !$filters) {
    console.error("[tcp] Missing DOM elements. Check tcp.html ids.");
    return;
  }

  // ---------- Alliance helpers ----------
  const FALLBACK_ALLIANCES = Object.freeze([
    Object.freeze({ key: "zeus", name: "Zeus", emoji: "⚡", order: 1, aliases: ["LoSP Zeus"] }),
    Object.freeze({ key: "kronos", name: "Kronos", emoji: "⏳", order: 2, aliases: ["LoSP Kronos"] }),
    Object.freeze({ key: "dionysos", name: "Dionysos", emoji: "🍇", order: 3, aliases: ["LoSP Dionysos"] }),
    Object.freeze({ key: "poseidon", name: "Poséidon", emoji: "🔱", order: 4, aliases: ["Poseidon", "LoSP Poséidon", "LoSP Poseidon"] }),
    Object.freeze({ key: "hades", name: "Hadès", emoji: "🔥", order: 5, aliases: ["Hades", "LoSP Hadès", "LoSP Hades"] }),
  ]);

  let knownAlliances = [...FALLBACK_ALLIANCES];
  const allianceFilters = new Map();

  function normalizeFallbackKey(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "")
      .replace(/[-_‐-‒–—―﹘﹣－]/g, "")
      .replace(/[’'`´]/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  function getAllianceApi() {
    return window.LoSPAlliances || null;
  }

  function normalizeAllianceList(rows) {
    return (Array.isArray(rows) ? rows : [])
      .map((alliance) => {
        const key = normalizeFallbackKey(alliance?.key);
        const name = String(alliance?.name ?? alliance?.label ?? key).trim();
        const emoji = String(alliance?.emoji ?? "").trim();
        const order = Number(alliance?.order);

        if (!key) return null;

        return {
          ...alliance,
          key,
          name: name || key,
          emoji,
          order: Number.isFinite(order) ? order : 999,
        };
      })
      .filter(Boolean);
  }

  function mergeWithFallback(rows) {
    const byKey = new Map();

    normalizeAllianceList(rows).forEach((alliance) => {
      byKey.set(alliance.key, alliance);
    });

    FALLBACK_ALLIANCES.forEach((alliance) => {
      if (!byKey.has(alliance.key)) byKey.set(alliance.key, alliance);
    });

    return Array.from(byKey.values()).sort((a, b) => {
      const orderA = Number.isFinite(Number(a.order)) ? Number(a.order) : 999;
      const orderB = Number.isFinite(Number(b.order)) ? Number(b.order) : 999;

      if (orderA !== orderB) return orderA - orderB;
      return String(a.name || a.key).localeCompare(String(b.name || b.key), "fr");
    });
  }

  function allianceKey(value) {
    const api = getAllianceApi();

    if (api?.getAllianceKey) {
      const key = api.getAllianceKey(value);
      if (key) return key;
    }

    const key = normalizeFallbackKey(value);
    const match = FALLBACK_ALLIANCES.find((alliance) => {
      const aliases = [alliance.key, alliance.name, ...(alliance.aliases || [])].map(normalizeFallbackKey);
      return aliases.some((alias) => alias && (key === alias || key.includes(alias)));
    });

    return match ? match.key : key;
  }

  function allianceEmoji(value) {
    const api = getAllianceApi();

    if (api?.getAllianceEmoji) {
      const emoji = api.getAllianceEmoji(value);
      if (emoji && emoji !== "•") return emoji;
    }

    const key = allianceKey(value);
    return knownAlliances.find((alliance) => alliance.key === key)?.emoji || "👤";
  }

  function isAllianceEnabled(key) {
    const filter = allianceFilters.get(key);
    return filter ? filter.checked : true;
  }

  function renderAllianceFilters() {
    $filters.innerHTML = knownAlliances
      .map((alliance) => {
        const keySafe = escapeHtml(alliance.key);
        const emojiSafe = escapeHtml(alliance.emoji || "👤");
        const labelSafe = escapeHtml(alliance.name || alliance.key);

        return `
          <label class="filterToggle">
            <input id="filter-${keySafe}" type="checkbox" data-alliance-key="${keySafe}" checked />
            <span class="fStack">
              <span class="fEmoji">${emojiSafe}</span>
              <span class="fName">${labelSafe}</span>
            </span>
          </label>
        `;
      })
      .join("");

    allianceFilters.clear();
    $filters.querySelectorAll("input[data-alliance-key]").forEach((cb) => {
      allianceFilters.set(cb.dataset.allianceKey, cb);
      cb.addEventListener("change", applyFiltersAndRender);
    });
  }
  // ---------- Formatting ----------
  function formatNumberFR(n) {
    const x = Number(n || 0);
    return x.toLocaleString("fr-FR");
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function safeUrl(u) {
    const s = String(u ?? "").trim();

    if (!s) return "";
    if (/^https?:\/\//i.test(s)) return s;

    return "";
  }

  // ---------- Render ----------
  function render(list) {
    $count.textContent = String(list.length);

    if (!list.length) {
      $players.innerHTML = `
        <div style="color: rgba(255,255,255,.65); padding: 6px 2px; text-align:center;">
          Aucun joueur ne correspond aux filtres.
        </div>
      `;
      return;
    }

    const html = list
      .map((p, idx) => {
        const nameSafe = escapeHtml(p.name);
        const emoji = allianceEmoji(p.alliance);

        const icon = safeUrl(p.icon);
        const frame = safeUrl(p.frame);

        const iconSafe = escapeHtml(icon);
        const frameSafe = escapeHtml(frame);

        const avatarHtml =
          icon || frame
            ? `
              <div class="rankAvatar" aria-hidden="true">
                ${
                  frame
                    ? `<img class="rankAvatarFrame" src="${frameSafe}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
                    : ""
                }
                ${
                  icon
                    ? `<img class="rankAvatarIcon" src="${iconSafe}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
                    : ""
                }
              </div>
            `
            : `<div class="rankAvatar" aria-hidden="true"></div>`;

        return `
          <div class="rankRow">
            <div class="rankLeft">
              <div class="rankNum">${idx + 1}</div>
              ${avatarHtml}
            </div>

            <div class="rankCenter">
              <div class="rankEmoji" aria-label="Alliance">${emoji}</div>
              <div class="rankName" title="${nameSafe}">${nameSafe}</div>
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

    filtered.sort((a, b) => {
      const tcpDiff = (b.tcp || 0) - (a.tcp || 0);

      if (tcpDiff !== 0) return tcpDiff;

      return String(a.name || "").localeCompare(String(b.name || ""), "fr", {
        sensitivity: "base",
      });
    });

    render(filtered);
  }

  // ---------- Init ----------
  async function init() {
    try {
      const api = getAllianceApi();
      const rows = api?.loadAlliances ? await api.loadAlliances() : [];
      knownAlliances = mergeWithFallback(api?.getKnownAlliances ? api.getKnownAlliances() : rows);
      renderAllianceFilters();

      const res = await fetch("./data/infos.json?v=" + Date.now(), {
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();

      if (!Array.isArray(data)) {
        throw new Error("infos.json is not an array");
      }

      allPlayers = data
        .map((p) => ({
          name: String(p?.name ?? "").trim(),
          alliance: String(p?.alliance ?? "").trim(),
          tcp: Number(p?.tcp ?? 0) || 0,
          icon: String(p?.icon ?? "").trim(),
          frame: String(p?.frame ?? "").trim(),
        }))
        .filter((p) => p.name);

      applyFiltersAndRender();
    } catch (err) {
      console.error("[tcp] init error:", err);

      $players.innerHTML = `
        <div style="color: rgba(255,255,255,.75); padding: 10px; text-align:center;">
          ❌ Impossible de charger <code>data/infos.json</code><br>
          <span style="color: rgba(255,255,255,.55); font-size: 13px;">
            ${escapeHtml(err?.message || err)}
          </span>
        </div>
      `;

      $count.textContent = "0";
    }
  }

  init();
})();