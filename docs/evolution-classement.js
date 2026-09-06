// /docs/evolution-classement.js
(() => {
  const FILES = {
    alliances: './data/alliances.json',
    historyIndex: './data/roster-history/index.json',
    infos: './data/infos.json',
  };

  const qs = (s) => document.querySelector(s);
  const periodSelect = qs('#periodSelect');
  const endSelect = qs('#endSelect');
  const startSelect = qs('#startSelect');
  const startField = qs('#startField');
  const allianceFilters = qs('#allianceFilters');
  const summaryCard = qs('#summaryCard');
  const summaryDates = qs('#summaryDates');
  const summaryCount = qs('#summaryCount');
  const loadingState = qs('#loadingState');
  const emptyState = qs('#emptyState');
  const rankingList = qs('#rankingList');

  const state = {
    alliances: [],
    historyIndex: null,
    infosByPlayer: new Map(),
    selectedAlliances: new Set(),
    allRows: [],
    currentRange: null,
  };

  function bust(url) {
    const u = new URL(url, window.location.href);
    u.searchParams.set('v', Date.now().toString());
    return u.toString();
  }

  async function fetchJson(url) {
    const response = await fetch(bust(url), { cache: 'no-store' });
    if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
    return response.json();
  }

  function normalizeKey(value) {
    return String(value ?? '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  function allianceKey(value) {
    return String(value ?? '').trim().toLowerCase();
  }

  function formatNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return Math.trunc(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function checkpointLabel(date) {
    const d = new Date(`${date}T12:00:00Z`);
    if (Number.isNaN(d.getTime())) return date;
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(d);
  }

  function monthOffset(checkpoint, months) {
    const date = new Date(`${checkpoint}T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() - months);
    return date.toISOString().slice(0, 10);
  }

  function checkpoints() {
    return (state.historyIndex?.checkpoints || [])
      .map((entry) => entry?.date)
      .filter(Boolean)
      .sort();
  }

  function canUsePeriod(end, months) {
    return checkpoints().includes(monthOffset(end, months));
  }

  function allianceLabel(key) {
    const meta = state.alliances.find((a) => allianceKey(a?.key) === allianceKey(key));
    if (!meta) return key || '—';
    return `${meta.emoji ? `${meta.emoji} ` : ''}${meta.name || meta.key}`;
  }

  function selectedRange() {
    const end = endSelect.value;
    if (!end) return null;
    if (periodSelect.value === 'custom') {
      return startSelect.value ? { start: startSelect.value, end } : null;
    }
    return { start: monthOffset(end, Number(periodSelect.value)), end };
  }

  function refreshControls() {
    const all = checkpoints();
    const period = periodSelect.value;
    startField.hidden = period !== 'custom';
    endSelect.innerHTML = '';

    const eligible = period === 'custom'
      ? all.slice(1)
      : all.filter((checkpoint) => canUsePeriod(checkpoint, Number(period)));

    for (const checkpoint of eligible) {
      const option = document.createElement('option');
      option.value = checkpoint;
      option.textContent = checkpointLabel(checkpoint);
      endSelect.appendChild(option);
    }

    if (eligible.length) endSelect.value = eligible[eligible.length - 1];
    refreshStart();
  }

  function refreshStart() {
    startSelect.innerHTML = '';
    const end = endSelect.value;

    if (periodSelect.value !== 'custom' || !end) {
      loadRanking();
      return;
    }

    for (const checkpoint of checkpoints().filter((checkpoint) => checkpoint < end)) {
      const option = document.createElement('option');
      option.value = checkpoint;
      option.textContent = checkpointLabel(checkpoint);
      startSelect.appendChild(option);
    }

    if (startSelect.options.length) startSelect.value = startSelect.options[0].value;
    loadRanking();
  }

  async function fetchGroup(checkpoint) {
    return fetchJson(`./data/roster-history/group/${checkpoint}.json`);
  }

  function buildInfoMap(infos) {
    state.infosByPlayer = new Map();
    for (const info of Array.isArray(infos) ? infos : []) {
      const key = normalizeKey(info?.name);
      if (key && !state.infosByPlayer.has(key)) state.infosByPlayer.set(key, info);
    }
  }

  function playerInfo(row) {
    return state.infosByPlayer.get(normalizeKey(row.player)) || state.infosByPlayer.get(normalizeKey(row.playerKey)) || null;
  }

  function buildRows(oldSummary, newSummary) {
    const oldByKey = new Map((oldSummary?.players || []).map((row) => [row.playerKey, row]));
    const rows = [];

    for (const current of newSummary?.players || []) {
      const before = oldByKey.get(current.playerKey);
      if (!before) continue;

      const oldPower = Number(before.totalPower);
      const newPower = Number(current.totalPower);
      if (!Number.isFinite(oldPower) || !Number.isFinite(newPower)) continue;

      rows.push({
        player: current.player || before.player || current.playerKey,
        playerKey: current.playerKey,
        alliance: current.alliance || before.alliance || '',
        oldPower,
        newPower,
        gain: newPower - oldPower,
      });
    }

    rows.sort((a, b) => {
      if (a.gain !== b.gain) return b.gain - a.gain;
      return a.player.localeCompare(b.player, 'fr', { sensitivity: 'base' });
    });
    return rows;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function setAllianceChipState(button, selected) {
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    const check = button.querySelector('.evolutionAllianceChipCheck');
    if (check) check.textContent = selected ? '✅' : '○';
  }

  function renderAllianceFilters() {
    clear(allianceFilters);
    state.selectedAlliances = new Set();

    const alliances = state.alliances
      .slice()
      .sort((a, b) => Number(a?.order ?? 999) - Number(b?.order ?? 999));

    for (const alliance of alliances) {
      const key = allianceKey(alliance?.key);
      if (!key) continue;
      state.selectedAlliances.add(key);

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'evolutionAllianceChip is-active';
      button.dataset.alliance = key;
      button.setAttribute('aria-pressed', 'true');
      button.setAttribute('aria-label', `Afficher ${alliance?.name || key}`);

      const check = document.createElement('span');
      check.className = 'evolutionAllianceChipCheck';
      check.textContent = '✅';

      const identity = document.createElement('span');
      identity.className = 'evolutionAllianceChipIdentity';

      const emoji = document.createElement('span');
      emoji.className = 'evolutionAllianceChipEmoji';
      emoji.textContent = alliance?.emoji || '👤';

      const name = document.createElement('span');
      name.className = 'evolutionAllianceChipName';
      name.textContent = alliance?.name || alliance?.key || key;

      identity.append(emoji, name);
      button.append(check, identity);

      button.addEventListener('click', () => {
        const selected = state.selectedAlliances.has(key);
        if (selected) state.selectedAlliances.delete(key);
        else state.selectedAlliances.add(key);
        setAllianceChipState(button, !selected);
        renderCurrentRanking();
      });

      allianceFilters.appendChild(button);
    }
  }

  function createPlayerVisual(info, playerName) {
    const visual = document.createElement('div');
    visual.className = 'evolutionRankingVisual';

    if (info?.icon) {
      const icon = document.createElement('img');
      icon.className = 'evolutionRankingIcon';
      icon.src = info.icon;
      icon.alt = '';
      icon.loading = 'lazy';
      icon.decoding = 'async';
      visual.appendChild(icon);
    } else {
      const fallback = document.createElement('span');
      fallback.className = 'evolutionRankingIconFallback';
      fallback.textContent = String(playerName || '?').charAt(0).toUpperCase();
      visual.appendChild(fallback);
    }

    if (info?.frame) {
      const frame = document.createElement('img');
      frame.className = 'evolutionRankingFrame';
      frame.src = info.frame;
      frame.alt = '';
      frame.loading = 'lazy';
      frame.decoding = 'async';
      visual.appendChild(frame);
    }

    return visual;
  }

  function render(rows, range) {
    clear(rankingList);
    summaryCard.hidden = false;
    summaryDates.textContent = `Du ${checkpointLabel(range.start)} au ${checkpointLabel(range.end)}`;
    summaryCount.textContent = `${formatNumber(rows.length)} joueur${rows.length > 1 ? 's' : ''} comparable${rows.length > 1 ? 's' : ''}`;

    rows.forEach((row, index) => {
      const link = document.createElement('a');
      link.className = 'card evolutionRankingRow';

      const currentAlliance = state.historyIndex?.players?.[row.playerKey]?.currentAlliance || row.alliance;
      const params = new URLSearchParams({
        alliance: currentAlliance,
        playerKey: row.playerKey,
        period: periodSelect.value,
        end: range.end,
      });
      if (periodSelect.value === 'custom') params.set('start', range.start);
      link.href = `./evolution.html?${params.toString()}`;

      const rank = document.createElement('div');
      rank.className = 'evolutionRankingRank';
      rank.textContent = String(index + 1);

      const info = playerInfo(row);
      const visual = createPlayerVisual(info, row.player);

      const identity = document.createElement('div');
      identity.className = 'evolutionRankingIdentity';
      const player = document.createElement('div');
      player.className = 'evolutionRankingPlayer';
      player.textContent = row.player;
      const alliance = document.createElement('div');
      alliance.className = 'evolutionRankingAlliance';
      alliance.textContent = allianceLabel(row.alliance);
      identity.append(player, alliance);

      const gain = document.createElement('div');
      gain.className = 'evolutionRankingGain';
      gain.textContent = `${row.gain >= 0 ? '+' : ''}${formatNumber(row.gain)} TCP`;
      const total = document.createElement('span');
      total.className = 'evolutionRankingTotal';
      total.textContent = `${formatNumber(row.oldPower)} → ${formatNumber(row.newPower)}`;
      gain.appendChild(total);

      link.append(rank, visual, identity, gain);
      rankingList.appendChild(link);
    });
  }

  function renderCurrentRanking() {
    if (!state.currentRange) return;

    const rows = state.allRows.filter((row) => state.selectedAlliances.has(allianceKey(row.alliance)));
    render(rows, state.currentRange);
    loadingState.hidden = true;

    if (!rows.length) {
      emptyState.hidden = false;
      emptyState.textContent = state.selectedAlliances.size
        ? 'Aucun joueur comparable pour les alliances sélectionnées.'
        : 'Aucune alliance sélectionnée.';
    } else {
      emptyState.hidden = true;
    }
  }

  async function loadRanking() {
    const range = selectedRange();
    clear(rankingList);
    summaryCard.hidden = true;
    emptyState.hidden = true;
    state.allRows = [];
    state.currentRange = range;

    if (!range) {
      loadingState.hidden = true;
      emptyState.hidden = false;
      emptyState.textContent = 'Pas assez de checkpoints pour cette période.';
      return;
    }

    loadingState.hidden = false;
    loadingState.textContent = 'Chargement du classement…';

    try {
      const [before, current] = await Promise.all([
        fetchGroup(range.start),
        fetchGroup(range.end),
      ]);
      state.allRows = buildRows(before, current);
      renderCurrentRanking();
    } catch (error) {
      console.error(error);
      loadingState.hidden = true;
      emptyState.hidden = false;
      emptyState.textContent = 'Le classement n’est pas encore disponible pour cette période.';
    }
  }

  function bindEvents() {
    periodSelect.addEventListener('change', refreshControls);
    endSelect.addEventListener('change', refreshStart);
    startSelect.addEventListener('change', loadRanking);
  }

  async function boot() {
    try {
      const [alliances, historyIndex, infos] = await Promise.all([
        fetchJson(FILES.alliances),
        fetchJson(FILES.historyIndex),
        fetchJson(FILES.infos),
      ]);
      state.alliances = Array.isArray(alliances) ? alliances : [];
      state.historyIndex = historyIndex || {};
      buildInfoMap(infos);
      renderAllianceFilters();
      bindEvents();
      refreshControls();
    } catch (error) {
      console.error(error);
      loadingState.hidden = true;
      emptyState.hidden = false;
      emptyState.textContent = 'Impossible de charger les données d’évolution.';
    }
  }

  boot();
})();
