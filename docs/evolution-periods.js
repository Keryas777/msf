// Date-based period resolver shared by individual Evolution and group ranking.
// No fixed monthly date assumptions: both historical and Sunday checkpoints work.
(() => {
  const DAY = 86400000;
  const MONTH_PERIODS = new Set(['1', '3', '6', '12']);

  function validDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(value + 'T00:00:00Z'));
  }

  function targetDate(end, period) {
    const date = new Date(end + 'T00:00:00Z');
    if (period === '1w' || period === '4w') {
      date.setUTCDate(date.getUTCDate() - (period === '1w' ? 7 : 28));
    } else if (MONTH_PERIODS.has(period)) {
      // Clamp month ends (e.g. March 31 -> February 28), no JS overflow.
      const day = date.getUTCDate();
      date.setUTCDate(1);
      date.setUTCMonth(date.getUTCMonth() - Number(period));
      const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
      date.setUTCDate(Math.min(day, lastDay));
    } else {
      return null;
    }
    return date.toISOString().slice(0, 10);
  }

  function resolveStart(checkpoints, end, period) {
    if (!validDate(end) || !Array.isArray(checkpoints)) return null;
    const target = targetDate(end, String(period));
    if (!target) return null;
    const earlier = [...new Set(checkpoints.filter(validDate))]
      .filter(date => date < end).sort();
    if (!earlier.length || target < earlier[0]) return null;

    const desired = Date.parse(target + 'T00:00:00Z');
    let best = null;
    let distance = Infinity;
    for (const candidate of earlier) {
      const delta = Math.abs(Date.parse(candidate + 'T00:00:00Z') - desired);
      // In a tie, prefer the older checkpoint rather than a shorter interval.
      if (delta < distance) {
        best = candidate;
        distance = delta;
      }
    }

    const tolerance = period === '1w' ? 3 * DAY :
      period === '4w' ? 7 * DAY : 16 * DAY;
    return distance <= tolerance ? best : null;
  }

  window.LoSPEvolutionPeriods = Object.freeze({ resolveStart });
})();
