import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveRosterSchedule} from '../scripts/lib/roster-r2-schedule.mjs';
const at = value => new Date(value);
test('Primary and fallback crons pick AM or PM by schedule identity',()=>{
  assert.deepEqual(resolveRosterSchedule('40 6 * * *',at('2026-10-24T06:41:00Z')),{day:'2026-10-24',period:'am'});
  assert.deepEqual(resolveRosterSchedule('47 7 * * *',at('2026-10-24T07:49:00Z')),{day:'2026-10-24',period:'am'});
  assert.deepEqual(resolveRosterSchedule('40 18 * * *',at('2026-10-24T18:42:00Z')),{day:'2026-10-24',period:'pm'});
  assert.deepEqual(resolveRosterSchedule('47 19 * * *',at('2026-10-24T19:49:00Z')),{day:'2026-10-24',period:'pm'});
});
test('Delayed morning job does not become a PM run',()=>{
  assert.deepEqual(resolveRosterSchedule('40 6 * * *',at('2026-10-24T09:12:00Z')),{day:'2026-10-24',period:'am'});
  assert.deepEqual(resolveRosterSchedule('47 7 * * *',at('2026-10-24T15:05:00Z')),{day:'2026-10-24',period:'am'});
});
test('Delayed PM job after UTC midnight retains the previous UTC collection day',()=>{
  assert.deepEqual(resolveRosterSchedule('40 18 * * *',at('2026-10-25T01:11:00Z')),{day:'2026-10-24',period:'pm'});
  assert.deepEqual(resolveRosterSchedule('47 19 * * *',at('2026-10-25T02:00:00Z')),{day:'2026-10-24',period:'pm'});
});
test('Unknown cron is rejected instead of choosing a guessed campaign',()=>{
  assert.throws(()=>resolveRosterSchedule('40 6,18 * * *',at('2026-10-24T09:00:00Z')));
  assert.throws(()=>resolveRosterSchedule('* * * * *',at('2026-10-24T09:00:00Z')));
  assert.throws(()=>resolveRosterSchedule('40 6 * * *',new Date(NaN)));
});
