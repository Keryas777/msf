// Pure selectors shared by the static graphs; no external requests or dependencies.
(function (root) {
  'use strict';
  const MS_PER_DAY = 86400000;
  const validDate = value => typeof value === 'string' &&
    Number.isFinite(Date.parse(value));
  const validValue = value => Number.isSafeInteger(value) && value >= 0;
  const isoDay = ms => new Date(ms).toISOString().slice(0, 10);
  // A completed season is inferred from a known UTC boundary, not from
  // 14 days since the OAuth capture. Scopely does not return season IDs.
  // The release delay prevents attributing newly ended seasons before
  // the provider is expected to have published their final standings.
  function resolveRankingSeason(capturedAt, calendar) {
    if (!validDate(capturedAt) || !calendar ||
        !validDate(calendar.referenceEndExclusiveAt) ||
        !Number.isSafeInteger(calendar.cycleDays) ||
        calendar.cycleDays < 1 || calendar.cycleDays > 60 ||
        !Number.isSafeInteger(calendar.publicationDelayMinutes) ||
        calendar.publicationDelayMinutes < 0 ||
        calendar.publicationDelayMinutes > 2880) return null;
    const cycleMs = calendar.cycleDays * MS_PER_DAY;
    const anchor = Date.parse(calendar.referenceEndExclusiveAt);
    const observed = Date.parse(capturedAt) - calendar.publicationDelayMinutes * 60000;
    const periods = Math.floor((observed - anchor) / cycleMs);
    const end = anchor + periods * cycleMs;
    const start = end - cycleMs;
    if (!Number.isFinite(end) || !Number.isFinite(start)) return null;
    return {
      seasonId: isoDay(start) + '/' + isoDay(end),
      startAt: new Date(start).toISOString(),
      endExclusiveAt: new Date(end).toISOString(),
      identification: 'schedule-derived',
      timezone: calendar.timezone || 'Europe/Paris'
    };
  }
  function chooseSnapshots(input, chart, calendar) {
    const sorted = (Array.isArray(input) ? input : [])
      .filter(row => validDate(row && row.capturedAt))
      .slice().sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
    const rows = [];
    const seen = new Set();
    for (const raw of sorted) {
      if (seen.has(raw.capturedAt)) continue;
      seen.add(raw.capturedAt);
      if (chart.frequency !== 'per-season' || raw.seasonVerified === true) {
        rows.push(raw);
        continue;
      }
      const computed = resolveRankingSeason(raw.capturedAt, calendar);
      if (!computed) {
        // If a calendar was supplied but is invalid, never assign an
        // unidentified season to a date in the season graphs.
        if (!calendar) rows.push(raw);
        continue;
      }
      rows.push({
        ...raw,
        seasonId: computed.seasonId,
        rankingSeason: {
          startAt: computed.startAt,
          endExclusiveAt: computed.endExclusiveAt,
          identification: computed.identification,
          timezone: computed.timezone
        },
        seasonDerived: true,
        seasonVerified: false
      });
    }
    if (chart.frequency !== 'per-season') return rows;
    const bySeason = new Map();
    const legacy = [];
    for (const row of rows) {
      const known = (row.seasonVerified === true || row.seasonDerived === true) &&
        typeof row.seasonId === 'string' && row.seasonId.length > 0 &&
        validDate(row.rankingSeason?.endExclusiveAt);
      if (!known) {
        // Legacy without a calendar: do not pretend dates are known seasons.
        legacy.push(row);
        continue;
      }
      const prev = bySeason.get(row.seasonId);
      // Prefer complete captures, then verified attribution, then newest.
      const quality = item => (item.coverage?.completeSessionScan === true ? 2 : 0) +
        (item.seasonVerified === true ? 1 : 0);
      if (!prev || quality(row) >= quality(prev)) bySeason.set(row.seasonId, row);
    }
    const selected = [...bySeason.values(), ...legacy];
    return selected.sort((a, b) => {
      const when = row => validDate(row.rankingSeason?.endExclusiveAt) &&
        (row.seasonVerified === true || row.seasonDerived === true) ?
        row.rankingSeason.endExclusiveAt : row.capturedAt;
      return when(a).localeCompare(when(b));
    });
  }
  function aValidSeasonEnd(row) {
    return (row?.seasonVerified === true || row?.seasonDerived === true) &&
      validDate(row?.rankingSeason?.endExclusiveAt);
  }
  function prepare(snapshots, alliances, chart, calendar) {
    const rows = chooseSnapshots(snapshots, chart, calendar);
    const possible = Array.isArray(alliances) ? alliances : [];
    // No hardcoded alliance count: the registry is the source of identities.
    const existing = new Set();
    for (const row of rows)
      for (const alliance of (row.alliances || []))
        if (typeof alliance.key === 'string') existing.add(alliance.key);
    // For a selected season snapshot, keep its confirmed values. A newly
    // tracked alliance may have its first REAL rank only in a later capture
    // of that same completed season: fill just that missing alliance.
    // Never backfill earlier seasons or manufacture absent metrics.
    const seasonAdditions = new Map();
    if(chart.frequency === 'per-season' && calendar){
      const candidates = (Array.isArray(snapshots) ? snapshots : [])
        .filter(row => validDate(row?.capturedAt))
        .slice().sort((a,b)=>a.capturedAt.localeCompare(b.capturedAt));
      for(const capture of candidates){
        const seasonId = capture.seasonVerified === true &&
          typeof capture.seasonId === 'string' ? capture.seasonId :
          resolveRankingSeason(capture.capturedAt,calendar)?.seasonId;
        if(!seasonId)continue;
        if(!seasonAdditions.has(seasonId))seasonAdditions.set(seasonId,new Map());
        const additions=seasonAdditions.get(seasonId);
        for(const source of capture.alliances || []){
          if(typeof source.key === 'string' && validValue(source[chart.field]))
            additions.set(source.key,{source,capturedAt:capture.capturedAt});
        }
      }
    }
    const members = possible.filter(a => a && a.active !== false &&
      typeof a.key === 'string' && existing.has(a.key))
      .slice().sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    const series = members.map(alliance => ({
      key: alliance.key, name: alliance.name || alliance.key,
      emoji: alliance.emoji || '', color: alliance.color || '#ffffff',
      points: rows.map(row => {
        const direct = (row.alliances || []).find(a => a.key === alliance.key);
        const fallback = !direct && chart.frequency === 'per-season' ?
          seasonAdditions.get(row.seasonId)?.get(alliance.key):null;
        const source = direct || fallback?.source;
        const value = source && source[chart.field];
        return {capturedAt: fallback?.capturedAt || row.capturedAt,
          plotAt: chart.frequency === 'per-season' && aValidSeasonEnd(row) ?
            row.rankingSeason.endExclusiveAt : row.capturedAt,
          seasonStartAt: aValidSeasonEnd(row) ? row.rankingSeason.startAt : null,
          value: validValue(value) ? value : null,
          seasonId: aValidSeasonEnd(row) ? row.seasonId : null,
          seasonVerified: !fallback && row.seasonVerified === true,
          seasonDerived: Boolean(fallback) || row.seasonDerived === true};
      })
    }));
    return {rows, series, field: chart.field,
      latestAt: rows.length ? rows[rows.length - 1].capturedAt : null};
  }
  // Summary and graph intentionally share the same selected season/captures.
  function rankLatest(snapshots, alliances, chart, calendar) {
    const full = prepare(snapshots, alliances, chart, calendar);
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
  root.LoSPStandingsSeries = Object.freeze({
    chooseSnapshots, prepare, rankLatest, resolveRankingSeason
  });
})(window);
