/* docs/app.js
   MSF – Classement Inter-Alliances (Équipes MSF)
   - Teams from Google Sheets -> docs/data/teams.json
   - Characters portraits -> docs/data/msf-characters.json
   - Players/alliance -> docs/data/joueurs.json
*/

(() => {
  // ---------- Robust base path (works even if repo name changes) ----------
  const BASE_PATH = new URL(".", location.href).pathname.replace(/\/$/, ""); // "/msf" typically

  const jsonUrl = (p) => `${BASE_PATH}/data/${p}?t=${Date.now()}`; // cache-busting

  const URL_TEAMS = jsonUrl("teams.json");
  const URL_CHARS = jsonUrl("msf-characters.json");
  const URL_PLAYERS = jsonUrl("joueurs.json");

  // ---------- Helpers ----------
  const $ = (sel) => document.querySelector(sel);

  function el(tag, attrs = {}, children = []) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k === "html") n.innerHTML = v;
      else if (k === "style") n.setAttribute("style", v);
      else n.setAttribute(k, v);
    }
    for (const c of children) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    return n;
  }

  async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
    return res.json();
  }

  function normalizeKey(s) {
    return String(s ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[-_]/g, "");
  }

  function emojiForAlliance(alliance) {
    const a = String(alliance ?? "").trim().toLowerCase();
    if (a === "zeus") return "⚡️";
    if (a === "dionysos") return "🍇";
    if (a === "poséidon" || a === "poseidon") return "🔱";
    return "•";
  }

  // ---------- Build / find UI ----------
  function ensureUI() {
    // Try existing IDs first (if you already have them in index.html)
    let teamSelect = $("#teamSelect") || $("#team") || $("#selectTeam");
    let refreshBtn = $("#refreshBtn") || $("#refresh") || $("#btnRefresh");
    let teamCard = $("#teamCard") || $("#teamPreview") || $("#teamBox");
    let playersCard = $("#playersCard") || $("#playersBox");

    // If missing, create a minimal structure into body (won't break existing layout)
    const root = $("#app") || $("main") || document.body;

    if (!teamSelect) {
      teamSelect = el("select", {
        id: "teamSelect",
        style:
          "width:100%;padding:12px 14px;border-radius:14px;background:rgba(0,0,0,.25);color:#fff;border:1px solid rgba(255,255,255,.12);",
      });
    }
    if (!refreshBtn) {
      refreshBtn = el("button", {
        id: "refreshBtn",
        text: "Rafraîchir",
        style:
          "margin-top:10px;padding:10px 16px;border-radius:14px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff;",
      });
    }
    if (!teamCard) {
      teamCard = el("section", {
        id: "teamCard",
        style:
          "margin-top:14px;padding:14px;border-radius:18px;border:1px solid rgba(255,255,255,.10);background:rgba(0,0,0,.18);backdrop-filter: blur(10px);",
      });
    }
    if (!playersCard) {
      playersCard = el("section", {
        id: "playersCard",
        style:
          "margin-top:14px;padding:14px;border-radius:18px;border:1px solid rgba(255,255,255,.10);background:rgba(0,0,0,.18);backdrop-filter: blur(10px);",
      });
    }

    // If we created them, mount them (only if not already in DOM)
    if (!teamSelect.isConnected || !refreshBtn.isConnected || !teamCard.isConnected || !playersCard.isConnected) {
      // Put them in a small panel if your HTML doesn't already provide it
      const panel = el("section", {
        id: "dynamicPanel",
        style:
          "max-width:920px;margin:0 auto;padding:14px;display:grid;grid-template-columns:1fr;gap:12px;",
      });

      const controls = el("section", {
        style:
          "padding:14px;border-radius:18px;border:1px solid rgba(255,255,255,.10);background:rgba(0,0,0,.18);backdrop-filter: blur(10px);",
      });

      controls.appendChild(el("div", { style: "color:rgba(255,255,255,.7);font-size:13px;margin-bottom:6px;", text: "Équipe" }));
      controls.appendChild(teamSelect);
      controls.appendChild(refreshBtn);

      panel.appendChild(controls);
      panel.appendChild(teamCard);
      panel.appendChild(playersCard);

      root.appendChild(panel);
    }

    return { teamSelect, refreshBtn, teamCard, playersCard };
  }

  // ---------- Rendering ----------
  function renderTeam(teamCard, teamObj, portraitsById, namesById) {
    teamCard.innerHTML = "";

    if (!teamObj) {
      teamCard.appendChild(el("div", { text: "—", style: "color:#fff;opacity:.7;font-size:16px;" }));
      return;
    }

    const title = el("div", {
      text: teamObj.team,
      style: "color:#fff;font-weight:800;font-size:22px;margin-bottom:12px;",
    });

    const row = el("div", {
      style: "display:flex;gap:10px;flex-wrap:wrap;align-items:flex-start;",
    });

    for (const idOrName of teamObj.characters || []) {
      const key = String(idOrName ?? "").trim();
      const portrait = portraitsById.get(normalizeKey(key));
      const displayName = namesById.get(normalizeKey(key)) || key;

      const img = el("img", {
        src: portrait || "",
        alt: displayName,
        style:
          "width:74px;height:74px;object-fit:cover;border-radius:16px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);",
      });

      // fallback if portrait missing
      if (!portrait) {
        img.removeAttribute("src");
        img.setAttribute(
          "style",
          img.getAttribute("style") +
            "display:flex;align-items:center;justify-content:center;"
        );
      }

      const label = el("div", {
        text: displayName,
        style:
          "margin-top:8px;color:#fff;font-size:13px;opacity:.9;max-width:74px;line-height:1.15;word-break:break-word;",
      });

      const card = el("div", { style: "display:flex;flex-direction:column;align-items:center;" }, [
        portrait ? img : el("div", { style: "width:74px;height:74px;border-radius:16px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;color:#fff;opacity:.7;font-size:26px;", text: "?" }),
        label,
      ]);

      row.appendChild(card);
    }

    teamCard.appendChild(title);
    teamCard.appendChild(row);
  }

  function renderPlayers(playersCard, players) {
    playersCard.innerHTML = "";

    const header = el("div", {
      style: "display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:10px;",
    }, [
      el("div", { text: "Joueurs du groupement (test)", style: "color:#fff;font-weight:800;font-size:18px;" }),
      el("div", { text: `${players.length}`, style: "color:rgba(255,255,255,.6);font-size:13px;" }),
    ]);

    // Sort by alliance then name (nice to scan)
    const order = { zeus: 1, dionysos: 2, "poséidon": 3, poseidon: 3 };
    const sorted = [...players].sort((a, b) => {
      const aa = (a.alliance || "").toLowerCase();
      const bb = (b.alliance || "").toLowerCase();
      const oa = order[aa] ?? 99;
      const ob = order[bb] ?? 99;
      if (oa !== ob) return oa - ob;
      return String(a.player || "").localeCompare(String(b.player || ""), "fr", { sensitivity: "base" });
    });

    const wrap = el("div", {
      style: "display:flex;flex-wrap:wrap;gap:8px;align-items:center;",
    });

    for (const p of sorted) {
      const emoji = emojiForAlliance(p.alliance);
      const label = `${emoji}${String(p.player ?? "").trim()}`; // NO SPACE after emoji
      const chip = el("div", {
        text: label,
        style:
          "padding:8px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.22);color:#fff;font-size:14px;line-height:1;white-space:nowrap;",
        title: `${p.player} — ${p.alliance}`,
      });
      wrap.appendChild(chip);
    }

    playersCard.appendChild(header);
    playersCard.appendChild(wrap);
  }

  // ---------- Main ----------
  async function init() {
    const { teamSelect, refreshBtn, teamCard, playersCard } = ensureUI();

    // Load all JSON in parallel
    const [teams, chars, players] = await Promise.all([
      fetchJson(URL_TEAMS),
      fetchJson(URL_CHARS),
      fetchJson(URL_PLAYERS),
    ]);

    // Build maps for portraits + names
    const portraitsById = new Map();
    const namesById = new Map();

    for (const c of chars || []) {
      const id = normalizeKey(c.id || c.nameKey || c.nameEn || c.nameFr);
      if (!id) continue;
      if (c.portraitUrl) portraitsById.set(id, c.portraitUrl);
      const display = c.nameFr || c.nameEn || c.id || c.nameKey;
      if (display) namesById.set(id, display);
    }

    // Populate team select
    teamSelect.innerHTML = "";
    const opt0 = el("option", { value: "", text: "— Choisir une équipe —" });
    teamSelect.appendChild(opt0);

    const teamsSorted = [...(teams || [])].sort((a, b) =>
      String(a.team || "").localeCompare(String(b.team || ""), "fr", { sensitivity: "base" })
    );

    for (const t of teamsSorted) {
      teamSelect.appendChild(el("option", { value: t.team, text: t.team }));
    }

    // Render players list (independent of selected team for now)
    renderPlayers(playersCard, players || []);

    function renderSelected() {
      const selectedName = teamSelect.value;
      const teamObj = (teamsSorted || []).find((t) => t.team === selectedName) || null;
      renderTeam(teamCard, teamObj, portraitsById, namesById);
    }

    teamSelect.addEventListener("change", renderSelected);
    refreshBtn.addEventListener("click", () => location.reload());

    // Auto-select first team if none selected (optional)
    if (!teamSelect.value && teamsSorted.length) {
      teamSelect.value = teamsSorted[0].team;
    }
    renderSelected();
  }

  // Show a friendly error in UI
  function showError(err) {
    console.error(err);
    const { teamCard, playersCard } = ensureUI();
    teamCard.innerHTML = "";
    playersCard.innerHTML = "";

    teamCard.appendChild(
      el("div", {
        text: "Erreur de chargement",
        style: "color:#fff;font-weight:800;font-size:18px;margin-bottom:6px;",
      })
    );
    teamCard.appendChild(
      el("div", {
        text: String(err?.message || err),
        style: "color:rgba(255,255,255,.7);font-size:13px;line-height:1.35;",
      })
    );
    playersCard.appendChild(
      el("div", {
        text: "Astuce : vérifie que data/joueurs.json existe bien sur le site.",
        style: "color:rgba(255,255,255,.65);font-size:13px;",
      })
    );
  }

  init().catch(showError);
})();