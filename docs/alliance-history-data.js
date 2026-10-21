// Pure selectors shared by the static graphs; no external requests or dependencies.
(function (root) {
  'use strict';
  const MS_PER_DAY = 86400000;
  const validDate = value => typeof value === 'string' &&
    Number.isFinite(Date.parse(value));
  const validValue = value => Number.isSafeInteger(value) && value >= 0;
  function chooseSnapshots(input, chart) {
    const sorted = (Array.isArray(input) ? input : [])
      .filter(row => validDate(row && row.capturedAt))
      .slice().sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
    const rows = [];
    const seen = new Set();
    for (const row of sorted) {
      if (seen.has(row.capturedAt)) continue;
      seen.add(row.capturedAt);
      rows.push(row);
    }
    if (chart.frequency !== 'per-season') return rows;
    // The provider ranks refer to the PREVIOUS completed season.
    // Group by confirmed season ID, never by elapsed capture days.
    // If a second capture occurs within the same season, keep its newest
    // verified values, with preference for complete captures.
    const bySeason = new Map();
    const legacy = [];
    for (const row of rows) {
      const known = row.seasonVerified === true &&
        typeof row.seasonId === 'string' && row.seasonId.length > 0;
      if (!known) {
        // Legacy unidentified data: retain separately, never infer its season.
        legacy.push(row);
        continue;
      }
      const prev = bySeason.get(row.seasonId);
      if (!prev || row.coverage?.completeSessionScan === true ||
          prev.coverage?.completeSessionScan !== true)
        bySeason.set(row.seasonId, row);
    }
    const selected = [...bySeason.values(), ...legacy];
    return selected.sort((a,b) => {
      const when = row => aValidSeasonEnd(row) ?
        row.rankingSeason.endExclusiveAt : row.capturedAt;
      return when(a).localeCompare(when(b));
    });
  }
  function aValidSeasonEnd(row) {
    return row?.seasonVerified === true &&
      validDate(row?.rankingSeason?.endExclusiveAt);
  }
  function prepare(snapshots, alliances, chart) {
    const rows = chooseSnapshots(snapshots, chart);
    const possible = Array.isArray(alliances) ? alliances : [];
    // No hardcoded alliance count: the registry is the source of identities.
    const existing = new Set();
    for (const row of rows)
      for (const alliance of (row.alliances || []))
        if (typeof alliance.key === 'string') existing.add(alliance.key);
    const members = possible.filter(a => a && a.active !== false &&
      typeof a.key === 'string' && existing.has(a.key))
      .slice().sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    const series = members.map(alliance => ({
      key: alliance.key, name: alliance.name || alliance.key,
      emoji: alliance.emoji || '', color: alliance.color || '#ffffff',
      points: rows.map(row => {
        const source = (row.alliances || []).find(a => a.key === alliance.key);
        const value = source && source[chart.field];
        return {capturedAt: row.capturedAt,
          plotAt: chart.frequency === 'per-season' && aValidSeasonEnd(row) ?
            row.rankingSeason.endExclusiveAt : row.capturedAt,
          seasonStartAt: aValidSeasonEnd(row) ? row.rankingSeason.startAt : null,
          value: validValue(value) ? value : null,
          seasonId: row.seasonVerified && row.seasonId || null,
          seasonVerified: row.seasonVerified === true};
      })
    }));
    return {rows, series, field: chart.field,
      latestAt: rows.length ? rows[rows.length - 1].capturedAt : null};
  }
  // The summary and graph use the SAME selected seasonal data.
  // For trophies this is every captured measurement; for ranks one
  // representative reading per identified completed season.
  function rankLatest(snapshots, alliances, chart) {
    const full = prepare(snapshots, alliances, chart);
    return full.series.map((alliance, index) => {
      const last = [...alliance.points].reverse().find(point => point.value !== null);
      return {
        key: alliance.key, name: alliance.name, emoji: alliance.emoji,
        color: alliance.color, order: index,
        value: last ? last.value : null,
        capturedAt: last ? last.capturedAt : null,
        seasonStartAt: last ? last.seasonStartAt : null,
        seasonEndAt: last && chart.frequency === 'per-season' ?
          last.plotAt : null
      };
    }).sort((a, b) => {
      if (a.value === null) return b.value === null ? a.order - b.order : 1;
      if (b.value === null) return -1;
      if (a.value !== b.value)
        return chart.higherIsBetter ? b.value - a.value : a.value - b.value;
      return a.order - b.order;
    });
  }
  root.LoSPStandingsSeries = Object.freeze({chooseSnapshots, prepare, rankLatest});
})(window);
