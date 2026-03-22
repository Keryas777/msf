// docs/conseils.js
(() => {
  const FILES = {
    recommendations: "./data/team-recommendations.json",
    characters: "./data/msf-characters.json",
  };

  const qs = (s) => document.querySelector(s);

  const modeSelect = qs("#modeSelect");
  const secondarySelect = qs("#secondarySelect");

  const secondaryField = qs("#secondaryField");
  const secondaryLabel = qs("#secondaryLabel");

  const currentTitle = qs("#currentTitle");
  const currentSubtitle = qs("#currentSubtitle");

  const resultsWrap = qs("#results");

  const MODE_LABELS = {
    raid: "Raid",
    raids: "Raids",
    guerre: "Guerre",
    epreuvecosmique: "Épreuve cosmique",
    battleworld: "Battleworld",
    arene: "Arène",
  };

  const SUBMODE_LABELS = {
    annihilation: "Annihilation",
    presentation: "Présentation",
    attaque: "Attaque",
    defense: "Défense",
    boss: "Boss",
    zones: "Zones",
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
    const k = normalizeKey(mode);
    return MODE_LABELS[k] || humanize(mode);
  }

  function subModeLabel(subMode) {
    const k = normalizeKey(subMode);
    return SUBMODE_LABELS[k] || humanize(subMode);
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
      modeKey: normalizeKey(r.mode ?? ""),

      subMode: String(r.subMode ?? r.sub_mode ?? "").trim(),
      subModeKey: normalizeKey(r.subMode ?? r.sub_mode ?? ""),

      groupLabel: String(r.groupLabel ?? r.group_label ?? "").trim(),
      groupKey: normalizeKey(r.groupLabel ?? r.group_label ?? ""),
      groupOrder: Number(String(r.groupOrder ?? r.group_order ?? "").replace(",", ".")) || 9999,

      subgroupLabel: String(r.subgroupLabel ?? r.subgroup_label ?? "").trim(),
      subgroupKey: normalizeKey(r.subgroupLabel ?? r.subgroup_label ?? ""),
      subgroupOrder: Number(String(r.subgroupOrder ?? r.subgroup_order ?? "").replace(",", ".")) || 9999,

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

  // ---------- Data access ----------
  function getActiveItems() {
    return ITEMS.filter((x) => x.active);
  }

  function getSelectedMode() {
    return String(modeSelect?.value ?? "").trim();
  }

  function getSelectedModeKey() {
    return normalizeKey(getSelectedMode());
  }

  function getSelectedSecondary() {
    return String(secondarySelect?.value ?? "").trim();
  }

  function getSelectedSecondaryKey() {
    return normalizeKey(getSelectedSecondary());
  }

  function getModeConfig(modeKey) {
    switch (modeKey) {
      case "guerre":
        return {
          secondaryLabel: "Type",
          secondaryOptions: ["attaque", "defense"],
          placeholder: "— Choisir attaque ou défense —",
        };

      case "epreuvecosmique":
        return {
          secondaryLabel: "Type",
          secondaryOptions: ["attaque", "defense"],
          placeholder: "— Choisir attaque ou défense —",
        };

      case "arene":
        return {
          secondaryLabel: "Type",
          secondaryOptions: ["attaque", "defense"],
          placeholder: "— Choisir attaque ou défense —",
        };

      case "battleworld":
        return {
          secondaryLabel: "Zone / Type",
          secondaryOptions: ["Zone 1", "Zone 2", "Zone 3", "Boss"],
          placeholder: "— Choisir une zone ou Boss —",
        };

      case "raid":
      case "raids":
        return {
          secondaryLabel: "Type de raid",
          secondaryOptions: [],
          placeholder: "— Choisir un type de raid —",
        };

      default:
        return null;
    }
  }

  function modeRequiresSecondary(modeKey) {
    return Boolean(getModeConfig(modeKey));
  }

  function itemMatchesSecondary(item, modeKey, selectedSecondary) {
    if (!selectedSecondary) return true;

    const selectedSecondaryKey = normalizeKey(selectedSecondary);

    if (modeKey === "battleworld") {
      if (selectedSecondaryKey === "boss") {
        return item.subModeKey === "boss";
      }
      return item.groupKey === selectedSecondaryKey;
    }

    if (
      modeKey === "guerre" ||
      modeKey === "epreuvecosmique" ||
      modeKey === "arene" ||
      modeKey === "raid" ||
      modeKey === "raids"
    ) {
      return item.subModeKey === selectedSecondaryKey;
    }

    return true;
  }

  function getSecondaryOptionsForMode(modeKey) {
    const cfg = getModeConfig(modeKey);
    if (!cfg) return [];

    if (modeKey === "raid" || modeKey === "raids") {
      return [
        ...new Set(
          getActiveItems()
            .filter((x) => x.modeKey === modeKey)
            .map((x) => x.subMode)
            .filter(Boolean)
        ),
      ].sort(compareNatural);
    }

    return cfg.secondaryOptions.slice();
  }

  // ---------- Selects ----------
  function renderModeOptions() {
    if (!modeSelect) return;

    const modes = [...new Set(getActiveItems().map((x) => x.mode).filter(Boolean))];

    const ORDER = ["raid", "raids", "guerre", "epreuvecosmique", "battleworld", "arene"];
    modes.sort((a, b) => {
      const ia = ORDER.indexOf(normalizeKey(a));
      const ib = ORDER.indexOf(normalizeKey(b));
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      return compareNatural(a, b);
    });

    modeSelect.innerHTML = "";

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "— Choisir un mode de jeu —";
    modeSelect.appendChild(opt0);

    modes.forEach((mode) => {
      const opt = document.createElement("option");
      opt.value = mode;
      opt.textContent = modeLabel(mode);
      modeSelect.appendChild(opt);
    });
  }

  function renderSecondaryField() {
    const modeKey = getSelectedModeKey();

    if (!secondaryField || !secondaryLabel || !secondarySelect) return;

    secondarySelect.innerHTML = "";

    if (!modeKey) {
      secondaryField.style.display = "none";
      secondarySelect.disabled = true;
      return;
    }

    const cfg = getModeConfig(modeKey);
    const options = getSecondaryOptionsForMode(modeKey);

    if (!cfg || !options.length) {
      secondaryField.style.display = "none";
      secondarySelect.disabled = true;
      return;
    }

    secondaryField.style.display = "";
    secondaryLabel.textContent = cfg.secondaryLabel;
    secondarySelect.disabled = false;

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = cfg.placeholder;
    secondarySelect.appendChild(opt0);

    options.forEach((value) => {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = modeKey === "battleworld" ? value : subModeLabel(value);
      secondarySelect.appendChild(opt);
    });
  }

  function setSmartDefaults() {
    renderModeOptions();
    renderSecondaryField();
  }

  function sortRows(rows) {
    return rows.slice().sort((a, b) => {
      if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;

      const g = compareTierOrNatural(a.groupLabel, b.groupLabel);
      if (g !== 0) return g;

      if (a.subgroupOrder !== b.subgroupOrder) return a.subgroupOrder - b.subgroupOrder;

      const sg = compareNatural(a.subgroupLabel, b.subgroupLabel);
      if (sg !== 0) return sg;

      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;

      const tn = compareNatural(a.teamName, b.teamName);
      if (tn !== 0) return tn;

      return compareNatural(a.title, b.title);
    });
  }

  function getFilteredItems() {
    const mode = getSelectedMode();
    const modeKey = getSelectedModeKey();
    const secondary = getSelectedSecondary();

    if (!mode || !modeKey) {
      return [];
    }

    if (modeRequiresSecondary(modeKey) && !secondary) {
      return [];
    }

    let rows = getActiveItems().filter((x) => x.modeKey === modeKey);
    rows = rows.filter((x) => itemMatchesSecondary(x, modeKey, secondary));

    return sortRows(rows);
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
        flexLabel.textContent =
          item.flexSlots > 0 ? `Compléter avec ${item.flexSlots} parmi :` : "Compléter avec :";
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
      if (item.fixedCharacters.length) {
        card.appendChild(createPortraitRow(item.fixedCharacters));
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

  function renderSummary() {
    const mode = getSelectedMode();
    const modeKey = getSelectedModeKey();
    const secondary = getSelectedSecondary();

    if (!mode || !modeKey) {
      currentTitle.textContent = "—";
      currentSubtitle.textContent = "Choisis un mode de jeu pour afficher les recommandations.";
      return;
    }

    currentTitle.textContent = modeLabel(mode);

    if (modeRequiresSecondary(modeKey) && !secondary) {
      const cfg = getModeConfig(modeKey);
      currentSubtitle.textContent = cfg?.placeholder
        ? cfg.placeholder.replace(/^—\s*|\s*—$/g, "")
        : "Choisis un second filtre pour afficher les recommandations.";
      return;
    }

    if (modeKey === "battleworld") {
      currentSubtitle.textContent =
        normalizeKey(secondary) === "boss"
          ? "Recommandations Battleworld pour les Boss."
          : `Recommandations Battleworld pour ${secondary}.`;
      return;
    }

    currentSubtitle.textContent = `${subModeLabel(secondary)} • ${modeLabel(mode)}`;
  }

  function renderRowsWithSections(rows) {
    clearNode(resultsWrap);

    const modeKey = getSelectedModeKey();
    const secondary = getSelectedSecondary();

    if (!modeKey) return;
    if (modeRequiresSecondary(modeKey) && !secondary) return;

    if (!rows.length) {
      resultsWrap.innerHTML = `<p class="subtitle">Aucune recommandation disponible.</p>`;
      return;
    }

    if (modeKey === "guerre") {
      const groups = [...new Set(rows.map((x) => x.groupLabel).filter(Boolean))].sort((a, b) => {
        const rowA = rows.find((x) => x.groupLabel === a);
        const rowB = rows.find((x) => x.groupLabel === b);
        const oa = rowA?.groupOrder ?? 9999;
        const ob = rowB?.groupOrder ?? 9999;
        if (oa !== ob) return oa - ob;
        return compareTierOrNatural(a, b);
      });

      groups.forEach((group) => {
        resultsWrap.appendChild(createSectionTitle(group, 3));

        const groupRows = sortRows(rows.filter((x) => x.groupLabel === group));
        groupRows.forEach((item) => resultsWrap.appendChild(makeRecommendationCard(item)));
      });
      return;
    }

    if (modeKey === "epreuvecosmique") {
      const groups = [...new Set(rows.map((x) => x.groupLabel).filter(Boolean))].sort((a, b) => {
        const rowA = rows.find((x) => x.groupLabel === a);
        const rowB = rows.find((x) => x.groupLabel === b);
        const oa = rowA?.groupOrder ?? 9999;
        const ob = rowB?.groupOrder ?? 9999;
        if (oa !== ob) return oa - ob;
        return compareNatural(a, b);
      });

      groups.forEach((group) => {
        resultsWrap.appendChild(createSectionTitle(group, 3));

        const groupRows = sortRows(rows.filter((x) => x.groupLabel === group));
        groupRows.forEach((item) => resultsWrap.appendChild(makeRecommendationCard(item)));
      });
      return;
    }

    if (modeKey === "battleworld") {
      const subgroups = [...new Set(rows.map((x) => x.subgroupLabel).filter(Boolean))].sort((a, b) => {
        const rowA = rows.find((x) => x.subgroupLabel === a);
        const rowB = rows.find((x) => x.subgroupLabel === b);
        const oa = rowA?.subgroupOrder ?? 9999;
        const ob = rowB?.subgroupOrder ?? 9999;
        if (oa !== ob) return oa - ob;
        return compareNatural(a, b);
      });

      const noSubgroup = sortRows(rows.filter((x) => !x.subgroupLabel));
      noSubgroup.forEach((item) => resultsWrap.appendChild(makeRecommendationCard(item)));

      if (noSubgroup.length && subgroups.length) {
        const spacer = document.createElement("div");
        spacer.style.height = "2px";
        resultsWrap.appendChild(spacer);
      }

      subgroups.forEach((subgroup) => {
        resultsWrap.appendChild(createSectionTitle(subgroup, 4));

        const subgroupRows = sortRows(rows.filter((x) => x.subgroupLabel === subgroup));
        subgroupRows.forEach((item) => resultsWrap.appendChild(makeRecommendationCard(item)));
      });
      return;
    }

    if (modeKey === "arene") {
      sortRows(rows).forEach((item) => resultsWrap.appendChild(makeRecommendationCard(item)));
      return;
    }

    if (modeKey === "raid" || modeKey === "raids") {
      const groups = [...new Set(rows.map((x) => x.groupLabel).filter(Boolean))].sort((a, b) => {
        const rowA = rows.find((x) => x.groupLabel === a);
        const rowB = rows.find((x) => x.groupLabel === b);
        const oa = rowA?.groupOrder ?? 9999;
        const ob = rowB?.groupOrder ?? 9999;
        if (oa !== ob) return oa - ob;
        return compareNatural(a, b);
      });

      if (groups.length <= 1) {
        const groupRows = sortRows(rows);

        const subgroupMap = [...new Set(groupRows.map((x) => x.subgroupLabel).filter(Boolean))];
        if (!subgroupMap.length) {
          groupRows.forEach((item) => resultsWrap.appendChild(makeRecommendationCard(item)));
          return;
        }

        const orderedSubgroups = subgroupMap.sort((a, b) => {
          const rowA = groupRows.find((x) => x.subgroupLabel === a);
          const rowB = groupRows.find((x) => x.subgroupLabel === b);
          const oa = rowA?.subgroupOrder ?? 9999;
          const ob = rowB?.subgroupOrder ?? 9999;
          if (oa !== ob) return oa - ob;
          return compareNatural(a, b);
        });

        const noSubgroup = sortRows(groupRows.filter((x) => !x.subgroupLabel));
        noSubgroup.forEach((item) => resultsWrap.appendChild(makeRecommendationCard(item)));

        if (noSubgroup.length && orderedSubgroups.length) {
          const spacer = document.createElement("div");
          spacer.style.height = "2px";
          resultsWrap.appendChild(spacer);
        }

        orderedSubgroups.forEach((subgroup) => {
          resultsWrap.appendChild(createSectionTitle(subgroup, 4));
          const subgroupRows = sortRows(groupRows.filter((x) => x.subgroupLabel === subgroup));
          subgroupRows.forEach((item) => resultsWrap.appendChild(makeRecommendationCard(item)));
        });

        return;
      }

      groups.forEach((group) => {
        resultsWrap.appendChild(createSectionTitle(group, 3));

        const groupRows = sortRows(rows.filter((x) => x.groupLabel === group));
        const subgroupMap = [...new Set(groupRows.map((x) => x.subgroupLabel).filter(Boolean))];

        if (!subgroupMap.length) {
          groupRows.forEach((item) => resultsWrap.appendChild(makeRecommendationCard(item)));
          return;
        }

        const orderedSubgroups = subgroupMap.sort((a, b) => {
          const rowA = groupRows.find((x) => x.subgroupLabel === a);
          const rowB = groupRows.find((x) => x.subgroupLabel === b);
          const oa = rowA?.subgroupOrder ?? 9999;
          const ob = rowB?.subgroupOrder ?? 9999;
          if (oa !== ob) return oa - ob;
          return compareNatural(a, b);
        });

        const noSubgroup = sortRows(groupRows.filter((x) => !x.subgroupLabel));
        noSubgroup.forEach((item) => resultsWrap.appendChild(makeRecommendationCard(item)));

        if (noSubgroup.length && orderedSubgroups.length) {
          const spacer = document.createElement("div");
          spacer.style.height = "2px";
          resultsWrap.appendChild(spacer);
        }

        orderedSubgroups.forEach((subgroup) => {
          resultsWrap.appendChild(createSectionTitle(subgroup, 4));
          const subgroupRows = sortRows(groupRows.filter((x) => x.subgroupLabel === subgroup));
          subgroupRows.forEach((item) => resultsWrap.appendChild(makeRecommendationCard(item)));
        });
      });
      return;
    }

    sortRows(rows).forEach((item) => resultsWrap.appendChild(makeRecommendationCard(item)));
  }

  function renderResults() {
    const rows = getFilteredItems();
    renderSummary();
    renderRowsWithSections(rows);
  }

  // ---------- Events ----------
  modeSelect?.addEventListener("change", () => {
    if (secondarySelect) secondarySelect.value = "";
    renderSecondaryField();
    renderResults();
  });

  secondarySelect?.addEventListener("change", renderResults);

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

    setSmartDefaults();
    renderResults();
  }

  boot().catch((e) => console.error("[conseils] boot error:", e));
})();