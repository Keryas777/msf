// /docs/evolution.js
(() => {
  const FILES = {
    alliances: "./data/alliances.json",
    rosters: "./data/rosters.json",
    characters: "./data/msf-characters.json",
    historyIndex: "./data/roster-history/index.json",
    aliases: "./data/player-aliases.json",
  };

  const qs = (selector) => document.querySelector(selector);
  const allianceSelect = qs("#allianceSelect");
  const playerSelect = qs("#playerSelect");
  const periodSelect = qs("#periodSelect");
  const endSelect = qs("#endSelect");
  const startSelect = qs("#startSelect");
  const startField = qs("#startField");
  const summaryCard = qs("#summaryCard");
  const summaryPlayer = qs("#summaryPlayer");
  const summaryDates = qs("#summaryDates");
  const summaryPower = qs("#summaryPower");
  const summaryUnlocked = qs("#summaryUnlocked");
  const summaryImproved = qs("#summaryImproved");
  const summaryDetails = qs("#summaryDetails");
  const loadingState = qs("#loadingState");
  const emptyState = qs("#emptyState");
  const evolutionList = qs("#evolutionList");

  const state = {
    alliances: [],
    rosters: [],
    characters: [],
    historyIndex: null,
    aliases: new Map(),
    charMap: new Map(),
    selectedAlliance: "",
    selectedPlayerKey: "",
  };

  let bootReady = false;
  let userChangedSelection = false;

  function bust(url) {
    const u = new URL(url, window.location.href);
    u.searchParams.set("v", Date.now().toString());
    return u.toString();
  }

  async function fetchJson(url) {
    const response = await fetch(bust(url), { cache: "no-store" });
    if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
    return response.json();
  }

  function normalizeKey(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  function normalizeAliasLookup(value) {
    return String(value ?? "")
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[’'`´]/g, "")
      .replace(/\s+/g, " ");
  }

  function buildAliasMap(payload) {
    state.aliases = new Map();
    const aliases = payload?.aliases && typeof payload.aliases === "object" ? payload.aliases : {};
    for (const [alias, canonical] of Object.entries(aliases)) {
      const key = normalizeAliasLookup(alias);
      const value = String(canonical ?? "").trim();
      if (key && value && !state.aliases.has(key)) state.aliases.set(key, value);
    }
  }

  function canonicalPlayerName(value) {
    let current = String(value ?? "").trim();
    const seen = new Set();
    for (let i = 0; i < 10; i += 1) {
      const key = normalizeAliasLookup(current);
      if (!key || seen.has(key)) break;
      seen.add(key);
      const next = state.aliases.get(key);
      if (!next) break;
      current = next;
    }
    return current;
  }

  function getRosterPlayerKey(roster) {
    const rawName = roster?.player || roster?.name || roster?.playerKey || "";
    const canonical = canonicalPlayerName(rawName);
    return normalizeKey(canonical || roster?.playerKey || rawName);
  }

  function activeAlliances() {
    return state.alliances
      .filter((alliance) => alliance?.active !== false)
      .sort((a, b) => Number(a?.order ?? 999) - Number(b?.order ?? 999));
  }

  function allianceMeta(key) {
    return state.alliances.find((a) => normalizeKey(a?.key) === normalizeKey(key)) || null;
  }

  function resolveAllianceKey(value) {
    const wanted = normalizeKey(value);
    if (!wanted) return "";

    for (const alliance of activeAlliances()) {
      const candidates = [alliance?.key, alliance?.name, ...(Array.isArray(alliance?.aliases) ? alliance.aliases : [])];
      if (candidates.some((candidate) => normalizeKey(candidate) === wanted)) {
        return String(alliance.key || "");
      }
    }
    return "";
  }

  function allianceLabel(key) {
    const alliance = allianceMeta(key);
    if (!alliance) return key || "—";
    return `${alliance.name || alliance.key}${alliance.emoji ? ` ${alliance.emoji}` : ""}`;
  }

  function playersForAlliance(allianceKey) {
    const wanted = normalizeKey(allianceKey);
    return state.rosters
      .filter((roster) => normalizeKey(roster?.alliance) === wanted)
      .map((roster) => ({
        key: getRosterPlayerKey(roster),
        label: canonicalPlayerName(roster?.player || roster?.name || roster?.playerKey || ""),
      }))
      .filter((player) => player.key && player.label && state.historyIndex?.players?.[player.key])
      .sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));
  }

  function sessionPlayerNames(player) {
    if (!player || typeof player !== "object") return [];
    return [
      player.name,
      player.player,
      player.playerName,
      player.player_name,
      player.pseudo,
      player.displayName,
      player.display_name,
      player.global_name,
      player.username,
      player.playerKey,
      player.player_key,
    ]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean);
  }

  function findPlayerInAlliance(allianceKey, names) {
    if (!allianceKey || !Array.isArray(names) || !names.length) return null;
    const wanted = new Set();
    for (const name of names) {
      wanted.add(normalizeKey(name));
      wanted.add(normalizeKey(canonicalPlayerName(name)));
    }
    return playersForAlliance(allianceKey).find((player) => wanted.has(player.key) || wanted.has(normalizeKey(player.label))) || null;
  }

  function applyDiscordDefault(session = window.LoSP_SESSION) {
    if (!bootReady || userChangedSelection || !session || session.ok !== true) return false;

    if (Array.isArray(session.players)) {
      for (const sessionPlayer of session.players) {
        const allianceKey = resolveAllianceKey(sessionPlayer?.alliance || sessionPlayer?.alliance_label);
        const player = findPlayerInAlliance(allianceKey, sessionPlayerNames(sessionPlayer));
        if (allianceKey && player) {
          selectPlayer(allianceKey, player.key);
          return true;
        }
      }
    }

    const names = [
      session.displayName,
      session.display_name,
      session.global_name,
      session.username,
      session.name,
      session.player,
      session.playerName,
      session.playerKey,
    ]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean);

    const preferred = [
      session.primaryAlliance,
      ...(Array.isArray(session.alliances) ? session.alliances : []),
    ]
      .map(resolveAllianceKey)
      .filter(Boolean);

    for (const allianceKey of [...new Set(preferred)]) {
      const player = findPlayerInAlliance(allianceKey, names);
      if (player) {
        selectPlayer(allianceKey, player.key);
        return true;
      }
    }

    for (const alliance of activeAlliances()) {
      const player = findPlayerInAlliance(alliance.key, names);
      if (player) {
        selectPlayer(alliance.key, player.key);
        return true;
      }
    }

    return false;
  }

  function selectPlayer(allianceKey, playerKey) {
    state.selectedAlliance = allianceKey;
    allianceSelect.value = allianceKey;
    state.selectedPlayerKey = playerKey;
    populatePlayerSelect();
    if ([...playerSelect.options].some((option) => option.value === playerKey)) {
      playerSelect.value = playerKey;
      state.selectedPlayerKey = playerKey;
      refreshCheckpointControls();
    }
  }

  function buildCharacterMap() {
    state.charMap = new Map();
    for (const character of state.characters) {
      for (const value of [character?.id, character?.nameKey, character?.nameFr, character?.nameEn]) {
        const key = normalizeKey(value);
        if (key && !state.charMap.has(key)) state.charMap.set(key, character);
      }
    }
  }

  function characterInfo(charKey) {
    return state.charMap.get(normalizeKey(charKey)) || null;
  }

  function characterName(charKey) {
    const info = characterInfo(charKey);
    return String(info?.nameFr || info?.nameKey || info?.nameEn || info?.id || charKey || "Personnage");
  }

  function characterPortrait(charKey) {
    return characterInfo(charKey)?.portraitUrl || "";
  }

  function checkpointLabel(date) {
    const d = new Date(`${date}T12:00:00Z`);
    if (Number.isNaN(d.getTime())) return date;
    return new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(d);
  }

  function formatNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    return Math.trunc(n).toLocaleString("fr-FR").replace(/[\u202f\u00a0 ]/g, ".");
  }

  function monthOffset(checkpoint, months) {
    const date = new Date(`${checkpoint}T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() - months);
    return date.toISOString().slice(0, 10);
  }

  function getHistoryEntry(playerKey) {
    return state.historyIndex?.players?.[playerKey] || null;
  }

  function availableCheckpoints(playerKey) {
    const entry = getHistoryEntry(playerKey);
    return Array.isArray(entry?.checkpoints) ? [...entry.checkpoints].sort() : [];
  }

  function canUsePeriod(endCheckpoint, period) {
    return availableCheckpoints(state.selectedPlayerKey).includes(monthOffset(endCheckpoint, period));
  }

  function populateAllianceSelect() {
    allianceSelect.innerHTML = "";
    for (const alliance of activeAlliances()) {
      const players = playersForAlliance(alliance.key);
      if (!players.length) continue;
      const option = document.createElement("option");
      option.value = alliance.key;
      option.textContent = `${alliance.name || alliance.key}${alliance.emoji ? ` ${alliance.emoji}` : ""}`;
      allianceSelect.appendChild(option);
    }

    state.selectedAlliance = allianceSelect.value || "";
    populatePlayerSelect();
  }

  function populatePlayerSelect() {
    const players = playersForAlliance(state.selectedAlliance);
    const previous = state.selectedPlayerKey;
    playerSelect.innerHTML = "";

    for (const player of players) {
      const option = document.createElement("option");
      option.value = player.key;
      option.textContent = player.label;
      playerSelect.appendChild(option);
    }

    if (players.some((player) => player.key === previous)) playerSelect.value = previous;
    state.selectedPlayerKey = playerSelect.value || "";
    refreshCheckpointControls();
  }

  function refreshCheckpointControls() {
    const checkpoints = availableCheckpoints(state.selectedPlayerKey);
    const period = periodSelect.value;
    startField.hidden = period !== "custom";
    endSelect.innerHTML = "";

    const eligibleEnds = period === "custom"
      ? checkpoints.slice(1)
      : checkpoints.filter((checkpoint) => canUsePeriod(checkpoint, Number(period)));

    for (const checkpoint of eligibleEnds) {
      const option = document.createElement("option");
      option.value = checkpoint;
      option.textContent = checkpointLabel(checkpoint);
      endSelect.appendChild(option);
    }

    if (eligibleEnds.length) endSelect.value = eligibleEnds[eligibleEnds.length - 1];
    refreshStartSelect();
  }

  function refreshStartSelect() {
    const period = periodSelect.value;
    const end = endSelect.value;
    const checkpoints = availableCheckpoints(state.selectedPlayerKey);
    startSelect.innerHTML = "";

    if (period !== "custom" || !end) {
      compareSelected();
      return;
    }

    for (const checkpoint of checkpoints.filter((checkpoint) => checkpoint < end)) {
      const option = document.createElement("option");
      option.value = checkpoint;
      option.textContent = checkpointLabel(checkpoint);
      startSelect.appendChild(option);
    }

    if (startSelect.options.length) startSelect.value = startSelect.options[0].value;
    compareSelected();
  }

  function selectedRange() {
    const end = endSelect.value;
    if (!end) return null;
    if (periodSelect.value === "custom") {
      return startSelect.value ? { start: startSelect.value, end } : null;
    }
    return { start: monthOffset(end, Number(periodSelect.value)), end };
  }

  async function fetchSnapshot(playerKey, checkpoint) {
    return fetchJson(`./data/roster-history/players/${encodeURIComponent(playerKey)}/${checkpoint}.json`);
  }

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object || {}, key);
  }

  function numericIncrease(oldValue, newValue) {
    const oldNumber = Number(oldValue);
    const newNumber = Number(newValue);
    if (!Number.isFinite(oldNumber) || !Number.isFinite(newNumber)) return null;
    return newNumber > oldNumber ? newNumber - oldNumber : null;
  }

  function isoClassLabel(value) {
    const key = String(value || "").trim().toLowerCase();
    const labels = {
      striker: "Striker",
      raider: "Raider",
      skirmisher: "Skirmisher",
      fortifier: "Fortifier",
      healer: "Healer",
    };
    if (!key) return "";
    return labels[key] || key.charAt(0).toUpperCase() + key.slice(1);
  }

  function isoTierFromMax(isoMax) {
    const value = Math.trunc(Number(isoMax));
    if (!Number.isFinite(value) || value <= 0) return null;

    const tiers = ["Vert", "Bleu", "Violet", "Orange"];
    const tierIndex = Math.floor((value - 1) / 5);
    const level = ((value - 1) % 5) + 1;

    if (tierIndex < 0 || tierIndex >= tiers.length) {
      return { color: "ISO", level: value };
    }

    return { color: tiers[tierIndex], level };
  }

  function isoMeta(snapshot, charKey) {
    const iso = snapshot?.iso?.[charKey] || {};
    return {
      isoClass: String(iso?.isoClass || "").trim().toLowerCase(),
      isoColor: String(iso?.isoColor || "").trim().toLowerCase(),
    };
  }

  function isoDisplay(snapshot, charKey, char, includeClass = false) {
    if (!char || !hasOwn(char, "isoMax")) return null;
    const meta = isoMeta(snapshot, charKey);
    const tier = isoTierFromMax(char.isoMax);
    if (!tier) return null;
    const className = includeClass ? isoClassLabel(meta.isoClass) : "";
    return [className, tier.color, tier.level].filter((value) => value !== "" && value !== null).join(" ");
  }

  function buildChange(label, oldValue, newValue) {
    return { label, oldValue: String(oldValue), newValue: String(newValue) };
  }

  function diffSnapshots(oldSnapshot, newSnapshot) {
    const oldChars = oldSnapshot?.chars || {};
    const newChars = newSnapshot?.chars || {};
    const cards = [];
    let levels = 0;
    let gears = 0;
    let diamonds = 0;
    let isoLevels = 0;
    let powerGain = 0;
    let unlocked = 0;
    let improved = 0;

    for (const [charKey, current] of Object.entries(newChars)) {
      if (!current || typeof current !== "object") continue;
      const before = oldChars[charKey];
      const isUnlocked = !before;
      const changes = [];
      let charPowerGain = 0;

      if (isUnlocked) {
        unlocked += 1;
        if (hasOwn(current, "level")) changes.push(buildChange("Niveau", "—", formatNumber(current.level)));
        if (hasOwn(current, "gear")) changes.push(buildChange("Équipement", "—", `G${current.gear}`));
        if (hasOwn(current, "yellowStars")) changes.push(buildChange("Étoiles jaunes", "—", `${current.yellowStars} ★`));
        if (hasOwn(current, "redStars")) changes.push(buildChange("Étoiles rouges", "—", `${current.redStars} ★`));
        if (hasOwn(current, "diamonds")) changes.push(buildChange("Diamants", "—", `${current.diamonds} 💎`));
        const iso = isoDisplay(newSnapshot, charKey, current, true);
        if (iso) changes.push(buildChange("ISO", "—", iso));
        if (hasOwn(current, "power")) {
          changes.push(buildChange("Puissance", "—", formatNumber(current.power)));
          charPowerGain = Number(current.power) || 0;
          powerGain += Math.max(0, charPowerGain);
        }
      } else {
        const levelGain = numericIncrease(before.level, current.level);
        if (levelGain) {
          levels += levelGain;
          changes.push(buildChange("Niveau", formatNumber(before.level), formatNumber(current.level)));
        }

        const gearGain = numericIncrease(before.gear, current.gear);
        if (gearGain) {
          gears += gearGain;
          changes.push(buildChange("Équipement", `G${before.gear}`, `G${current.gear}`));
        }

        for (const [field, label, suffix] of [
          ["yellowStars", "Étoiles jaunes", " ★"],
          ["redStars", "Étoiles rouges", " ★"],
          ["diamonds", "Diamants", " 💎"],
        ]) {
          if (!hasOwn(before, field) || !hasOwn(current, field)) continue;
          const gain = numericIncrease(before[field], current[field]);
          if (!gain) continue;
          if (field === "diamonds") diamonds += gain;
          changes.push(buildChange(label, `${before[field]}${suffix}`, `${current[field]}${suffix}`));
        }

        if (hasOwn(before, "isoMax") && hasOwn(current, "isoMax")) {
          const isoGain = numericIncrease(before.isoMax, current.isoMax);
          const oldMeta = isoMeta(oldSnapshot, charKey);
          const newMeta = isoMeta(newSnapshot, charKey);
          const classChanged = Boolean(oldMeta.isoClass && newMeta.isoClass && oldMeta.isoClass !== newMeta.isoClass);

          if (isoGain) isoLevels += isoGain;
          if (isoGain || classChanged) {
            const oldIso = isoDisplay(oldSnapshot, charKey, before, classChanged);
            const newIso = isoDisplay(newSnapshot, charKey, current, classChanged);
            if (oldIso && newIso) changes.push(buildChange("ISO", oldIso, newIso));
          }
        }

        const powerDelta = numericIncrease(before.power, current.power);
        if (powerDelta) {
          charPowerGain = powerDelta;
          powerGain += powerDelta;
        }

        if (changes.length || charPowerGain > 0) improved += 1;
      }

      if (!changes.length && charPowerGain <= 0) continue;

      cards.push({
        charKey,
        name: characterName(charKey),
        portrait: characterPortrait(charKey),
        unlocked: isUnlocked,
        powerGain: charPowerGain,
        changes,
      });
    }

    cards.sort((a, b) => {
      if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
      if (a.powerGain !== b.powerGain) return b.powerGain - a.powerGain;
      return a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
    });

    return { cards, unlocked, improved, powerGain, levels, gears, diamonds, isoLevels };
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function createPortrait(card) {
    if (!card.portrait) {
      const fallback = document.createElement("div");
      fallback.className = "evolutionPortraitFallback";
      fallback.textContent = card.name.charAt(0).toUpperCase();
      return fallback;
    }

    const image = document.createElement("img");
    image.className = "evolutionPortrait";
    image.src = card.portrait;
    image.alt = "";
    image.loading = "lazy";
    image.addEventListener("error", () => {
      image.style.visibility = "hidden";
    });
    return image;
  }

  function renderCards(cards) {
    clear(evolutionList);

    for (const card of cards) {
      const article = document.createElement("article");
      article.className = `card evolutionCard${card.unlocked ? " evolutionCard--unlocked" : ""}`;

      const top = document.createElement("div");
      top.className = "evolutionCardTop";
      top.appendChild(createPortrait(card));

      const titleWrap = document.createElement("div");
      const title = document.createElement("h2");
      title.className = "evolutionCardTitle";
      title.textContent = card.name;
      titleWrap.appendChild(title);
      if (card.unlocked) {
        const tag = document.createElement("span");
        tag.className = "evolutionCardTag";
        tag.textContent = "🆕 Personnage débloqué";
        titleWrap.appendChild(tag);
      }
      top.appendChild(titleWrap);

      const power = document.createElement("div");
      power.className = "evolutionCardPower";
      power.textContent = card.powerGain > 0 ? `+${formatNumber(card.powerGain)}` : "";
      top.appendChild(power);
      article.appendChild(top);

      if (card.changes.length) {
        const changes = document.createElement("div");
        changes.className = "evolutionChanges";
        for (const change of card.changes) {
          const row = document.createElement("div");
          row.className = "evolutionChange";

          const label = document.createElement("span");
          label.className = "evolutionChangeLabel";
          label.textContent = change.label;

          const value = document.createElement("span");
          value.className = "evolutionChangeValue";
          const oldValue = document.createElement("span");
          oldValue.textContent = change.oldValue;
          const arrow = document.createElement("span");
          arrow.className = "evolutionArrow";
          arrow.textContent = "→";
          const newValue = document.createElement("span");
          newValue.className = "evolutionNewValue";
          newValue.textContent = change.newValue;
          value.append(oldValue, arrow, newValue);

          row.append(label, value);
          changes.appendChild(row);
        }
        article.appendChild(changes);
      }

      evolutionList.appendChild(article);
    }
  }

  function renderSummary(diff, oldSnapshot, newSnapshot, range) {
    summaryCard.hidden = false;
    summaryPlayer.textContent = `${newSnapshot.player || oldSnapshot.player || state.selectedPlayerKey} — ${allianceLabel(newSnapshot.alliance)}`;
    summaryDates.textContent = `Du ${checkpointLabel(range.start)} au ${checkpointLabel(range.end)}`;
    summaryPower.textContent = diff.powerGain > 0 ? `+${formatNumber(diff.powerGain)}` : "+0";
    summaryUnlocked.textContent = formatNumber(diff.unlocked);
    summaryImproved.textContent = formatNumber(diff.improved);

    const details = [];
    if (diff.levels) details.push(`${formatNumber(diff.levels)} niveau${diff.levels > 1 ? "x" : ""} gagné${diff.levels > 1 ? "s" : ""}`);
    if (diff.gears) details.push(`${formatNumber(diff.gears)} amélioration${diff.gears > 1 ? "s" : ""} de Gear`);
    if (diff.diamonds) details.push(`${formatNumber(diff.diamonds)} diamant${diff.diamonds > 1 ? "s" : ""} gagné${diff.diamonds > 1 ? "s" : ""}`);
    if (diff.isoLevels) details.push(`${formatNumber(diff.isoLevels)} niveau${diff.isoLevels > 1 ? "x" : ""} ISO gagné${diff.isoLevels > 1 ? "s" : ""}`);
    summaryDetails.textContent = details.join(" · ");
  }

  async function compareSelected() {
    const range = selectedRange();
    clear(evolutionList);
    summaryCard.hidden = true;
    emptyState.hidden = true;

    if (!state.selectedPlayerKey || !range) {
      loadingState.hidden = true;
      emptyState.hidden = false;
      emptyState.textContent = "Pas assez de checkpoints pour cette période.";
      return;
    }

    loadingState.hidden = false;
    loadingState.textContent = "Comparaison en cours…";

    try {
      const [oldSnapshot, newSnapshot] = await Promise.all([
        fetchSnapshot(state.selectedPlayerKey, range.start),
        fetchSnapshot(state.selectedPlayerKey, range.end),
      ]);
      const diff = diffSnapshots(oldSnapshot, newSnapshot);
      renderSummary(diff, oldSnapshot, newSnapshot, range);
      renderCards(diff.cards);
      loadingState.hidden = true;

      if (!diff.cards.length) {
        emptyState.hidden = false;
        emptyState.textContent = "Aucune amélioration détectée entre ces deux checkpoints.";
      }
    } catch (error) {
      console.error(error);
      loadingState.hidden = true;
      emptyState.hidden = false;
      emptyState.textContent = "Impossible de charger cette comparaison pour le moment.";
    }
  }

  function bindEvents() {
    allianceSelect.addEventListener("change", () => {
      userChangedSelection = true;
      state.selectedAlliance = allianceSelect.value;
      state.selectedPlayerKey = "";
      populatePlayerSelect();
    });

    playerSelect.addEventListener("change", () => {
      userChangedSelection = true;
      state.selectedPlayerKey = playerSelect.value;
      refreshCheckpointControls();
    });

    periodSelect.addEventListener("change", refreshCheckpointControls);
    endSelect.addEventListener("change", refreshStartSelect);
    startSelect.addEventListener("change", compareSelected);
  }

  window.addEventListener("losp:auth-ready", (event) => {
    if (bootReady) applyDiscordDefault(event.detail);
  });

  async function boot() {
    try {
      const [alliances, rosters, characters, historyIndex, aliases] = await Promise.all([
        fetchJson(FILES.alliances),
        fetchJson(FILES.rosters),
        fetchJson(FILES.characters),
        fetchJson(FILES.historyIndex),
        fetchJson(FILES.aliases),
      ]);

      state.alliances = Array.isArray(alliances) ? alliances : [];
      state.rosters = Array.isArray(rosters) ? rosters : [];
      state.characters = Array.isArray(characters) ? characters : [];
      state.historyIndex = historyIndex || {};
      buildAliasMap(aliases);
      buildCharacterMap();
      bindEvents();
      populateAllianceSelect();
      bootReady = true;
      applyDiscordDefault(window.LoSP_SESSION);
    } catch (error) {
      console.error(error);
      loadingState.hidden = true;
      emptyState.hidden = false;
      emptyState.textContent = "Impossible de charger les données d’évolution.";
    }
  }

  boot();
})();
