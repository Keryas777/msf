// docs/conseils.js
(() => {
  const FILES = {
    recommendations: "./data/team-recommendations.json",
    characters: "./data/msf-characters.json",
  };

  const qs = (s) => document.querySelector(s);

  const modeSelect = qs("#modeSelect");
  const subModeSelect = qs("#subModeSelect");
  const groupSelect = qs("#groupSelect");

  const currentTitle = qs("#currentTitle");
  const currentSubtitle = qs("#currentSubtitle");

  const resultsWrap = qs("#results");
  const resultsCount = qs("#resultsCount");
  const selectionChip = qs("#selectionChip");

  const MODE_LABELS = {
    raids: "Raids",
    guerre: "Guerre",
    epreuve_cosmique: "Épreuve cosmique",
    battleworld: "Battleworld",
    arene: "Arène",
  };

  const SUBMODE_LABELS = {
    annihilation: "Annihilation",
    presentation: "Présentation",
    attaque: "Attaque",
    defense: "Défense",
    zones: "Zones",
    boss: "Boss",
    offense: "Attaque",
  };

  let ITEMS = [];
  let CHAR_MAP = new Map();

  // ---------- Utils ----------
  const bust = (url) => {
    const u = new URL(url, window.location.href);
    u.searchParams.set("v", Date.now().toString());
    return u.toString();
  };

  async function fetchJson(url) {
    const res = await fetch(bust(url), { cache: "no-store" });
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return res.json();
  }

  function clearNode(el) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function toBoolean(value) {
    const v = String(value ?? "").trim().toLowerCase();
    return ["true", "1", "yes", "oui"].includes(v);
  }

  const normalizeKey = (s) =>
    (s ?? "")
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[-_]/g, "")
      .replace(/[’']/g, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  function humanize(value) {
    const s = String(value ?? "").trim();
    if (!s) return "—";
    return s
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .replace(/\b\w/g, (m) => m.toUpperCase());
  }

  function modeLabel(mode) {
    const k = String(mode ?? "").trim();
    return MODE_LABELS[k] || humanize(k);
  }

  function subModeLabel(subMode) {
    const k = String(subMode ?? "").trim();
    return SUBMODE_LABELS[k] || humanize(k);
  }

  function groupLabel(group) {
    return humanize(group);
  }

  function compareNatural(a, b) {
    return String(a ?? "").localeCompare(String(b ?? ""), "fr", {
      numeric: true,
      sensitivity: "base",
    });
  }

  function compareTierOrNatural(a, b) {
    const ORDER = ["S-TIER", "A-TIER", "B-TIER", "C-TIER", "D-TIER"];
    const aa = String(a ?? "").trim().toUpperCase();
    const bb = String(b ?? "").trim().toUpperCase();

    const ia = ORDER.indexOf(aa);
    const ib = ORDER.indexOf(bb);

    if (ia !== -1 || ib !== -1) {
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    }

    return compareNatural(a, b);
  }

  function getTierClass(tier, group) {
    const raw = String(tier || group || "").trim().toUpperCase();

    if (raw.startsWith("S-TIER") || raw.startsWith("A-TIER") || raw === "S" || raw === "A") {
      return "is-green";
    }
    if (raw.startsWith("B-TIER") || raw === "B") {
      return "is-yellow";
    }
    if (raw.startsWith("C-TIER") || raw === "C") {
      return "is-orange";
    }
    if (raw.startsWith("D-TIER") || raw === "D") {
      return "is-red";
    }

    return "is-yellow";
  }

  function getPortrait(name) {
    const c = CHAR_MAP.get(normalizeKey(name));
    return c?.portraitUrl || c?.portrait || c?.iconUrl || "";
  }

  // ---------- Data normalization ----------
  function normalizeItem(r) {
    const layoutType = String(r.layoutType ?? r.layout_type ?? "fixed").trim() || "fixed";

    const fixedCharacters = [r.char_1, r.char_2, r.char_3, r.char_4, r.char_5]
      .map((x) => String(x ?? "").trim())
      .filter(Boolean);

    const coreCharacters = [r.core_1, r.core_2, r.core_3, r.core_4, r.core_5]
      .map((x) => String(x ?? "").trim())
      .filter(Boolean);

    const flexSlots = Number(String(r.flex_slots ?? "").replace(",", ".")) || 0;

    const flexItems = [];
    for (let i = 1; i <= 6; i++) {
      const name = String(r[`flex_${i}`] ?? "").trim();
      const note = String(r[`flex_${i}_note`] ?? "").trim();
      if (!name) continue;
      flexItems.push({ name, note });
    }

    return {
      active: r.active == null ? true : toBoolean(r.active),
      mode: String(r.mode ?? "").trim(),
      subMode: String(r.subMode ?? r.sub_mode ?? "").trim(),
      groupLabel: String(r.groupLabel ?? r.group_label ?? "").trim(),
      subgroupLabel: String(r.subgroupLabel ?? r.subgroup_label ?? "").trim(),
      tier: String(r.tier ?? "").trim(),
      displayOrder: Number(String(r.displayOrder ?? r.display_order ?? "").replace(",", ".")) || 9999,
      layoutType,
      title: String(r.title ?? "").trim(),
      teamName: String(r.teamName ?? r.team_name ?? "").trim(),
      fixedCharacters,
      coreCharacters,
      flexSlots,
      flexItems,
      notes: String(r.notes ?? "").trim(),
      patch: String(r.patch ?? "").trim(),
    };
  }

  function buildCharMap(chars) {
    CHAR_MAP = new Map();
    (Array.isArray(chars) ? chars : []).forEach((c) => {
      [c?.id, c?.nameKey, c?.nameFr, c?.nameEn]
        .filter(Boolean)
        .forEach((k) => {
          const kk = normalizeKey(k);
          if (!kk) return;
          if (!CHAR_MAP.has(kk)) CHAR_MAP.set(kk, c);
        });
    });
  }

  // ---------- Selects ----------
  function getActiveItems() {
    return ITEMS.filter((x) => x.active);
  }

  function getSelectedMode() {
    return String(modeSelect?.value ?? "").trim();
  }

  function getSelectedSubMode() {
    return String(subModeSelect?.value ?? "").trim();
  }

  function getSelectedGroup() {
    return String(groupSelect?.value ?? "").trim();
  }

  function renderModeOptions() {
    if (!modeSelect) return;

    const modes = [...new Set(getActiveItems().map((x) => x.mode).filter(Boolean))];

    const ORDER = ["raids", "guerre", "epreuve_cosmique", "battleworld", "arene"];
    modes.sort((a, b) => {
      const ia = ORDER.indexOf(a);
      const ib = ORDER.indexOf(b);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      return compareNatural(a, b);
    });

    modeSelect.innerHTML = "";

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "— Choisir un mode —";
    modeSelect.appendChild(opt0);

    modes.forEach((mode) => {
      const opt = document.createElement("option");
      opt.value = mode;
      opt.textContent = modeLabel(mode);
      modeSelect.appendChild(opt);
    });
  }

  function renderSubModeOptions() {
    if (!subModeSelect) return;

    const mode = getSelectedMode();
    subModeSelect.innerHTML = "";

    if (!mode) {
      subModeSelect.disabled = true;
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "— Choisir un mode d’abord —";
      subModeSelect.appendChild(opt);
      return;
    }

    const subModes = [
      ...new Set(
        getActiveItems()
          .filter((x) => x.mode === mode)
          .map((x) => x.subMode)
          .filter(Boolean)
      ),
    ].sort(compareNatural);

    subModeSelect.disabled = false;

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "— Tous les sous-modes —";
    subModeSelect.appendChild(opt0);

    subModes.forEach((subMode) => {
      const opt = document.createElement("option");
      opt.value = subMode;
      opt.textContent = subModeLabel(subMode);
      subModeSelect.appendChild(opt);
    });
  }

  function renderGroupOptions() {
    if (!groupSelect) return;

    const mode = getSelectedMode();
    const subMode = getSelectedSubMode();

    groupSelect.innerHTML = "";

    if (!mode) {
      groupSelect.disabled = true;
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "— Choisir un mode d’abord —";
      groupSelect.appendChild(opt);
      return;
    }

    let rows = getActiveItems().filter((x) => x.mode === mode);
    if (subMode) rows = rows.filter((x) => x.subMode === subMode);

    const groups = [...new Set(rows.map((x) => x.groupLabel).filter(Boolean))].sort(compareTierOrNatural);

    groupSelect.disabled = false;

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "— Tous les groupes —";
    groupSelect.appendChild(opt0);

    groups.forEach((group) => {
      const opt = document.createElement("option");
      opt.value = group;
      opt.textContent = groupLabel(group);
      groupSelect.appendChild(opt);
    });
  }

  function setSmartDefaults() {
    if (!modeSelect.value && modeSelect.options.length > 1) {
      modeSelect.value = modeSelect.options[1].value;
    }

    renderSubModeOptions();

    const mode = getSelectedMode();
    if (mode && !subModeSelect.value) {
      const subModes = [...new Set(getActiveItems().filter((x) => x.mode === mode).map((x) => x.subMode).filter(Boolean))];
      if (subModes.length === 1) {
        subModeSelect.value = subModes[0];
      }
    }

    renderGroupOptions();
  }

  function getFilteredItems() {
    const mode = getSelectedMode();
    const subMode = getSelectedSubMode();
    const group = getSelectedGroup();

    let rows = getActiveItems();

    if (mode) rows = rows.filter((x) => x.mode === mode);
    if (subMode) rows = rows.filter((x) => x.subMode === subMode);
    if (group) rows = rows.filter((x) => x.groupLabel === group);

    rows = rows.slice().sort((a, b) => {
      const g = compareTierOrNatural(a.groupLabel, b.groupLabel);
      if (g !== 0) return g;

      const sg = compareNatural(a.subgroupLabel, b.subgroupLabel);
      if (sg !== 0) return sg;

      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;

      const tn = compareNatural(a.teamName, b.teamName);
      if (tn !== 0) return tn;

      return compareNatural(a.title, b.title);
    });

    return rows;
  }

  // ---------- UI helpers ----------
  function createSectionTitle(text, level = 3) {
    const el = document.createElement(level === 4 ? "h4" : "h3");
    el.textContent = text || "—";
    el.style.margin = level === 4 ? "14px 0 8px 0" : "18px 0 10px 0";
    el.style.fontWeight = "900";
    el.style.letterSpacing = ".2px";
    el.style.lineHeight = "1.1";
    el.style.color = "rgba(255,255,255,.95)";
    el.style.fontSize = level === 4 ? "16px" : "18px";
    return el;
  }

  function createPortraitBox(name, { showName = false, note = "", size = 72 } = {}) {
    const outer = document.createElement("div");
    outer.style.width = `${Math.max(size, 72)}px`;
    outer.style.flex = `0 0 ${Math.max(size, 72)}px`;
    outer.style.display = "flex";
    outer.style.flexDirection = "column";
    outer.style.alignItems = "center";
    outer.style.gap = "4px";
    outer.style.minWidth = "0";

    const box = document.createElement("div");
    box.className = "counterPortrait";
    box.style.width = `${size}px`;
    box.style.height = `${size}px`;
    box.style.flex = "0 0 auto";

    const img = document.createElement("img");
    img.className = "counterPortraitImg";
    img.alt = name;
    img.loading = "lazy";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.src = getPortrait(name) || "";

    img.onerror = () => {
      box.innerHTML = "";
      const fallback = document.createElement("div");
      fallback.style.width = "100%";
      fallback.style.height = "100%";
      fallback.style.display = "flex";
      fallback.style.alignItems = "center";
      fallback.style.justifyContent = "center";
      fallback.style.textAlign = "center";
      fallback.style.padding = "4px";
      fallback.style.fontSize = "10px";
      fallback.style.fontWeight = "800";
      fallback.style.lineHeight = "1.1";
      fallback.textContent = name;
      box.appendChild(fallback);
    };

    box.appendChild(img);
    outer.appendChild(box);

    if (showName) {
      const nameEl = document.createElement("div");
      nameEl.textContent = name;
      nameEl.style.fontSize = "11px";
      nameEl.style.fontWeight = "800";
      nameEl.style.lineHeight = "1.15";
      nameEl.style.textAlign = "center";
      nameEl.style.color = "rgba(255,255,255,.92)";
      outer.appendChild(nameEl);
    }

    if (note) {
      const noteEl = document.createElement("div");
      noteEl.textContent = note;
      noteEl.style.fontSize = "11px";
      noteEl.style.fontStyle = "italic";
      noteEl.style.lineHeight = "1.2";
      noteEl.style.textAlign = "center";
      noteEl.style.color = "rgba(255,255,255,.68)";
      outer.appendChild(noteEl);
    }

    return outer;
  }

  function createPortraitRow(names) {
    const wrap = document.createElement("div");
    wrap.className = "counterPortraits";

    names.forEach((name, idx) => {
      const p = document.createElement("div");
      p.className = "counterPortrait";
      p.title = `p${idx + 1}`;

      const img = document.createElement("img");
      img.className = "counterPortraitImg";
      img.alt = name;
      img.loading = "lazy";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.src = getPortrait(name) || "";

      img.onerror = () => {
        p.innerHTML = "";
        const fallback = document.createElement("div");
        fallback.style.width = "100%";
        fallback.style.height = "100%";
        fallback.style.display = "flex";
        fallback.style.alignItems = "center";
        fallback.style.justifyContent = "center";
        fallback.style.textAlign = "center";
        fallback.style.padding = "4px";
        fallback.style.fontSize = "10px";
        fallback.style.fontWeight = "800";
        fallback.style.lineHeight = "1.1";
        fallback.textContent = name;
        p.appendChild(fallback);
      };

      p.appendChild(img);
      wrap.appendChild(p);
    });

    return wrap;
  }

  function makeRecommendationCard(item) {
    const card = document.createElement("div");
    card.className = `counterCard ${getTierClass(item.tier, item.groupLabel)}`.trim();

    const top = document.createElement("div");
    top.className = "counterTop";

    const left = document.createElement("div");
    left.style.minWidth = "0";
    left.style.flex = "1 1 auto";

    const teamName = document.createElement("div");
    teamName.className = "counterName";
    teamName.textContent = item.teamName || "Équipe";

    left.appendChild(teamName);

    if (item.title) {
      const title = document.createElement("div");
      title.className = "counterRatio";
      title.style.marginTop = "4px";
      title.style.fontSize = "12px";
      title.style.lineHeight = "1.2";
      title.textContent = item.title;
      left.appendChild(title);
    }

    const right = document.createElement("div");
    right.className = "counterRight";

    if (item.tier) {
      const chip = document.createElement("div");
      chip.className = "chipCount";
      chip.style.padding = "5px 10px";
      chip.style.fontSize = "12px";
      chip.style.minWidth = "auto";
      chip.textContent = item.tier.toUpperCase();
      right.appendChild(chip);
    }

    top.appendChild(left);
    top.appendChild(right);
    card.appendChild(top);

    if (item.layoutType === "core_flex") {
      if (item.coreCharacters.length) {
        const coreLabel = document.createElement("div");
        coreLabel.textContent = "Cœur";
        coreLabel.style.fontSize = "12px";
        coreLabel.style.fontWeight = "900";
        coreLabel.style.textTransform = "uppercase";
        coreLabel.style.letterSpacing = ".08em";
        coreLabel.style.color = "rgba(255,255,255,.72)";
        coreLabel.style.marginTop = "2px";
        card.appendChild(coreLabel);

        card.appendChild(createPortraitRow(item.coreCharacters));
      }

      if (item.flexItems.length) {
        const flexLabel = document.createElement("div");
        flexLabel.textContent = item.flexSlots > 0
          ? `Compléter avec ${item.flexSlots} parmi :`
          : "Compléter avec :";
        flexLabel.style.fontSize = "12px";
        flexLabel.style.fontWeight = "900";
        flexLabel.style.textTransform = "uppercase";
        flexLabel.style.letterSpacing = ".08em";
        flexLabel.style.color = "rgba(255,255,255,.72)";
        flexLabel.style.marginTop = "4px";
        card.appendChild(flexLabel);

        const flexWrap = document.createElement("div");
        flexWrap.style.display = "flex";
        flexWrap.style.flexWrap = "wrap";
        flexWrap.style.gap = "12px";
        flexWrap.style.alignItems = "flex-start";

        item.flexItems.forEach((f) => {
          flexWrap.appendChild(
            createPortraitBox(f.name, {
              showName: true,
              note: f.note || "",
              size: 68,
            })
          );
        });

        card.appendChild(flexWrap);
      }
    } else {
      const portraits = item.fixedCharacters;
      if (portraits.length) {
        card.appendChild(createPortraitRow(portraits));
      }
    }

    if (item.notes) {
      const note = document.createElement("div");
      note.textContent = item.notes;
      note.setAttribute("aria-label", "Notes");
      note.style.marginTop = "6px";
      note.style.fontSize = "12px";
      note.style.fontStyle = "italic";
      note.style.lineHeight = "1.25";
      note.style.color = "rgba(255,255,255,.70)";
      card.appendChild(note);
    }

    return card;
  }

  function renderSummary(items) {
    const mode = getSelectedMode();
    const subMode = getSelectedSubMode();
    const group = getSelectedGroup();

    if (!mode) {
      currentTitle.textContent = "—";
      currentSubtitle.textContent = "Choisis un mode pour afficher les recommandations.";
      selectionChip.textContent = "—";
      return;
    }

    currentTitle.textContent = modeLabel(mode);

    const parts = [];
    if (subMode) parts.push(subModeLabel(subMode));
    if (group) parts.push(groupLabel(group));

    currentSubtitle.textContent =
      parts.length > 0
        ? parts.join(" • ")
        : "Toutes les recommandations disponibles pour ce mode.";

    selectionChip.textContent = items.length > 0 ? (group ? groupLabel(group) : "Tous") : "—";
  }

  function renderGroupedItems(rows) {
    clearNode(resultsWrap);

    if (!rows.length) {
      resultsWrap.innerHTML = `<p class="subtitle">Aucune recommandation disponible.</p>`;
      return;
    }

    const selectedGroup = getSelectedGroup();

    const groups = [...new Set(rows.map((x) => x.groupLabel).filter(Boolean))];

    // Si un groupe est sélectionné, on n'affiche pas son titre en grand bloc,
    // seulement ses sous-groupes éventuels.
    if (selectedGroup) {
      renderOneGroup(rows, false);
      return;
    }

    // Si plusieurs groupes visibles, on les sépare par titre
    if (groups.length > 1) {
      groups.sort(compareTierOrNatural).forEach((group) => {
        const groupItems = rows.filter((x) => x.groupLabel === group);
        resultsWrap.appendChild(createSectionTitle(groupLabel(group), 3));
        renderOneGroup(groupItems, true);
      });
      return;
    }

    renderOneGroup(rows, false);
  }

  function renderOneGroup(groupItems, insideMultiGroup) {
    const subgroups = [...new Set(groupItems.map((x) => x.subgroupLabel).filter(Boolean))].sort(compareNatural);

    // Items sans sous-groupe
    const noSubgroupItems = groupItems.filter((x) => !x.subgroupLabel);

    noSubgroupItems.forEach((item) => {
      resultsWrap.appendChild(makeRecommendationCard(item));
    });

    if (noSubgroupItems.length && subgroups.length) {
      const spacer = document.createElement("div");
      spacer.style.height = "2px";
      resultsWrap.appendChild(spacer);
    }

    subgroups.forEach((subgroup) => {
      if (!insideMultiGroup || subgroup) {
        resultsWrap.appendChild(createSectionTitle(groupLabel(subgroup), 4));
      }

      const subgroupItems = groupItems.filter((x) => x.subgroupLabel === subgroup);
      subgroupItems.forEach((item) => {
        resultsWrap.appendChild(makeRecommendationCard(item));
      });
    });
  }

  function renderResults() {
    const rows = getFilteredItems();
    if (resultsCount) resultsCount.textContent = String(rows.length);
    renderSummary(rows);
    renderGroupedItems(rows);
  }

  function renderAll() {
    renderGroupOptions();
    renderResults();
  }

  // ---------- Events ----------
  modeSelect?.addEventListener("change", () => {
    if (subModeSelect) subModeSelect.value = "";
    if (groupSelect) groupSelect.value = "";
    renderSubModeOptions();
    renderGroupOptions();
    renderResults();
  });

  subModeSelect?.addEventListener("change", () => {
    if (groupSelect) groupSelect.value = "";
    renderGroupOptions();
    renderResults();
  });

  groupSelect?.addEventListener("change", renderResults);

  // ---------- Boot ----------
  async function boot() {
    const [recommendationsData, chars] = await Promise.all([
      fetchJson(FILES.recommendations),
      fetchJson(FILES.characters),
    ]);

    const rawItems = Array.isArray(recommendationsData?.items)
      ? recommendationsData.items
      : Array.isArray(recommendationsData)
      ? recommendationsData
      : [];

    ITEMS = rawItems.map(normalizeItem).filter((x) => x.active);
    buildCharMap(chars);

    renderModeOptions();
    setSmartDefaults();
    renderResults();
  }

  boot().catch((e) => console.error("[conseils] boot error:", e));
})();
