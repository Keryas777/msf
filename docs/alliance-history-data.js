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
    if (chart.frequency !== '15-days') return rows;
    const duration = (Number.isSafeInteger(chart.intervalDays) &&
      chart.intervalDays > 0 ? chart.intervalDays : 15) * MS_PER_DAY;
    const sampled = [];
    for (const row of rows) {
      const previous = sampled[sampled.length - 1];
      const newKnownSeason = previous && row.seasonVerified === true &&
        previous.seasonVerified === true &&
        typeof row.seasonId === 'string' && row.seasonId.length > 0 &&
        typeof previous.seasonId === 'string' &&
        row.seasonId !== previous.seasonId;
      if (!previous || newKnownSeason ||
          Date.parse(row.capturedAt) - Date.parse(previous.capturedAt) >= duration)
        sampled.push(row);
    }
    return sampled;
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
          value: validValue(value) ? value : null,
          seasonId: row.seasonVerified && row.seasonId || null,
          seasonVerified: row.seasonVerified === true};
      })
    }));
    return {rows, series, field: chart.field,
      latestAt: rows.length ? rows[rows.length - 1].capturedAt : null};
  }
  // The current standings list always uses the latest AVAILABLE actual reading
  // for each alliance. Graph sampling (e.g. every 15 days) must not make the
  // displayed 'latest' figures stale when newer snapshots exist.
  function rankLatest(snapshots, alliances, chart) {
    const full = prepare(snapshots, alliances, {...chart, frequency: 'all-snapshots'});
    return full.series.map((alliance, index) => {
      const last = [...alliance.points].reverse().find(point => point.value !== null);
      return {
        key: alliance.key, name: alliance.name, emoji: alliance.emoji,
        color: alliance.color, order: index,
        value: last ? last.value : null,
        capturedAt: last ? last.capturedAt : null
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
