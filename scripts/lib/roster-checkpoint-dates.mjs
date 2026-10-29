// Fixed migration boundary: existing 1st-of-month checkpoints are immutable.
// Weekly checkpoint dates start on Sunday 2026-11-01 at 23:00 Europe/Paris.
export const FIRST_WEEKLY_CHECKPOINT = '2026-11-01';
export const ROSTER_CHECKPOINT_TIMEZONE = 'Europe/Paris';

function localParts(now) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ROSTER_CHECKPOINT_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

export function lastCompletedWeeklyCheckpoint(now = new Date()) {
  const p = localParts(now);
  const localDate = `${p.year}-${p.month}-${p.day}`;
  const sunday = new Date(`${localDate}T00:00:00Z`);
  const weekday = sunday.getUTCDay();
  const daysBack = weekday === 0 && Number(p.hour) >= 23 ? 0 : (weekday || 7);
  sunday.setUTCDate(sunday.getUTCDate() - daysBack);
  return sunday.toISOString().slice(0, 10);
}

export function isWeeklyCheckpoint(checkpoint) {
  return checkpoint >= FIRST_WEEKLY_CHECKPOINT;
}

export function checkpointCutoff(checkpoint) {
  // Git interprets this wall time using TZ=Europe/Paris supplied by the caller.
  return `${checkpoint}T${isWeeklyCheckpoint(checkpoint) ? '23:00:00' : '00:00:00'}`;
}

export function validateCheckpointDate(checkpoint, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkpoint)) {
    throw new Error(`Invalid checkpoint date: ${checkpoint} (expected YYYY-MM-DD)`);
  }
  const d = new Date(`${checkpoint}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== checkpoint) {
    throw new Error(`Invalid calendar date: ${checkpoint}`);
  }

  if (isWeeklyCheckpoint(checkpoint)) {
    if (d.getUTCDay() !== 0) {
      throw new Error(`Weekly checkpoint must be a Sunday: ${checkpoint}`);
    }
    if (checkpoint > lastCompletedWeeklyCheckpoint(now)) {
      throw new Error(`Weekly checkpoint not yet complete at 23:00 Europe/Paris: ${checkpoint}`);
    }
  } else {
    // Legacy monthly checkpoints remain usable for existing synthetic tests
    // and recovery, but cannot be created for arbitrary historical weekdays.
    if (!checkpoint.endsWith('-01')) {
      throw new Error(`Legacy checkpoint must be the first of a month: ${checkpoint}`);
    }
    const p = localParts(now);
    if (checkpoint > `${p.year}-${p.month}-01`) {
      throw new Error(`Future monthly checkpoint: ${checkpoint}`);
    }
  }
  return checkpoint;
}
