import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  FIRST_WEEKLY_CHECKPOINT, lastCompletedWeeklyCheckpoint,
  checkpointCutoff, validateCheckpointDate,
} from '../scripts/lib/roster-checkpoint-dates.mjs';

function date(iso) { return new Date(iso); }

test('legacy monthly checkpoints remain valid and use their original midnight cutoff', () => {
  assert.equal(validateCheckpointDate('2026-03-01', date('2026-11-08T23:00:00Z')), '2026-03-01');
  assert.equal(checkpointCutoff('2026-10-01'), '2026-10-01T00:00:00');
  assert.equal(FIRST_WEEKLY_CHECKPOINT, '2026-11-01');
});

test('Sunday snapshots use 23:00 Paris, switching correctly between CET and CEST', () => {
  assert.equal(checkpointCutoff('2026-11-01'), '2026-11-01T23:00:00');
  assert.equal(checkpointCutoff('2027-07-04'), '2027-07-04T23:00:00');
  assert.equal(lastCompletedWeeklyCheckpoint(date('2026-11-01T21:59:59Z')), '2026-10-25');
  assert.equal(lastCompletedWeeklyCheckpoint(date('2026-11-01T22:00:00Z')), '2026-11-01');
  assert.equal(lastCompletedWeeklyCheckpoint(date('2027-07-04T20:59:59Z')), '2027-06-27');
  assert.equal(lastCompletedWeeklyCheckpoint(date('2027-07-04T21:00:00Z')), '2027-07-04');
  assert.equal(validateCheckpointDate('2026-11-01', date('2026-11-01T22:00:00Z')), '2026-11-01');
});

test('premature, non-Sunday and bogus dates are rejected', () => {
  const now = date('2026-11-01T21:00:00Z');
  assert.throws(() => validateCheckpointDate('2026-11-01', now), /not yet complete/);
  assert.throws(() => validateCheckpointDate('2026-11-02', date('2026-11-09T23:00:00Z')), /Sunday/);
  assert.throws(() => validateCheckpointDate('2026-11-31', date('2026-12-20T23:00:00Z')), /calendar/);
  assert.throws(() => validateCheckpointDate('2026-09-13', now), /first of a month/);
});

const source = readFileSync(fileURLToPath(new URL('../docs/evolution-periods.js', import.meta.url)), 'utf8');
const browser = { window: {} };
runInNewContext(source, browser);
const { resolveStart } = browser.window.LoSPEvolutionPeriods;

test('legacy monthly comparisons still work', () => {
  const dates = ['2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01'];
  assert.equal(resolveStart(dates, '2026-10-01', '1'), '2026-09-01');
  assert.equal(resolveStart(dates, '2026-10-01', '3'), '2026-07-01');
  assert.equal(resolveStart(dates, '2026-10-01', '12'), null);
  assert.equal(resolveStart(dates, '2026-10-01', '1w'), null);
});

test('weekly and mixed historical checkpoints choose the nearest real snapshot', () => {
  const dates = ['2026-09-01', '2026-10-01', '2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29'];
  assert.equal(resolveStart(dates, '2026-11-08', '1w'), '2026-11-01');
  assert.equal(resolveStart(dates, '2026-11-29', '4w'), '2026-11-01');
  assert.equal(resolveStart(dates, '2026-11-29', '1'), '2026-11-01');
  assert.equal(resolveStart(dates, '2026-11-08', '1'), '2026-10-01');
  assert.equal(resolveStart(dates, '2026-11-01', '1w'), null);
  assert.equal(resolveStart(dates, '2026-11-29', '3'), '2026-09-01');
});

test('periods refuse distant missing checkpoints and month-end overflow', () => {
  assert.equal(resolveStart(['2027-01-31', '2027-02-28', '2027-03-31'], '2027-03-31', '1'), '2027-02-28');
  assert.equal(resolveStart(['2026-10-01', '2026-11-29'], '2026-11-29', '1w'), null);
  assert.equal(resolveStart(['2026-11-08'], '2026-11-08', '1w'), null);
});
