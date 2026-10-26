import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveRosterSchedule,earlyImportReady} from '../scripts/lib/roster-r2-schedule.mjs';
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


test('late GitHub recovery slots always point at the intended completed campaign',()=>{
  assert.deepEqual(resolveRosterSchedule('17 10 * * *',at('2026-10-25T10:18:00Z')),
    {day:'2026-10-25',period:'am'});
  assert.deepEqual(resolveRosterSchedule('17 21 * * *',at('2026-10-25T21:18:00Z')),
    {day:'2026-10-25',period:'pm'});
  assert.deepEqual(resolveRosterSchedule('23 0 * * *',at('2026-10-26T00:24:00Z')),
    {day:'2026-10-25',period:'pm'});
});
test('late GitHub scheduled triggers preserve previous UTC day after delayed dispatch',()=>{
  assert.deepEqual(resolveRosterSchedule('17 10 * * *',at('2026-10-26T05:55:00Z')),
    {day:'2026-10-25',period:'am'});
  assert.deepEqual(resolveRosterSchedule('17 21 * * *',at('2026-10-26T06:15:00Z')),
    {day:'2026-10-25',period:'pm'});
  assert.deepEqual(resolveRosterSchedule('23 0 * * *',at('2026-10-26T18:30:00Z')),
    {day:'2026-10-25',period:'pm'});
  // A midnight recovery job delayed until just before next midnight should
  // still import the older campaign, never the new day's incomplete PM.
  assert.deepEqual(resolveRosterSchedule('23 0 * * *',at('2026-10-27T00:04:00Z')),
    {day:'2026-10-25',period:'pm'});
});
test('workflow declares each supported scheduled recovery slot in UTC',async()=>{
  const {readFile}=await import('node:fs/promises');
  const workflow=await readFile(new URL('../.github/workflows/pull-rosters-r2.yml',import.meta.url),'utf8');
  for(const cron of ['17 4','40 6','47 7','17 10','47 16','40 18','47 19','17 21','23 0'])
    assert.ok(workflow.includes('cron: "'+cron+' * * *"'));
  assert.match(workflow,/group: main-data-writer/);
  assert.match(workflow,/cancel-in-progress: false/);
  assert.match(workflow,/--schedule=\$SCHEDULE_CRON/);
  assert.match(workflow,/No complete and current R2 roster campaign|scripts\/pull-rosters-r2\.mjs/);
});

test('fast R2 slots use UTC campaign date even when the runner starts late',()=>{
  assert.deepEqual(resolveRosterSchedule('17 4 * * *',at('2026-10-26T04:30:00Z')),
    {day:'2026-10-26',period:'am'});
  assert.deepEqual(resolveRosterSchedule('47 16 * * *',at('2026-10-26T17:00:00Z')),
    {day:'2026-10-26',period:'pm'});
  assert.deepEqual(resolveRosterSchedule('17 4 * * *',at('2026-10-27T02:00:00Z')),
    {day:'2026-10-26',period:'am'});
  assert.deepEqual(resolveRosterSchedule('47 16 * * *',at('2026-10-27T01:00:00Z')),
    {day:'2026-10-26',period:'pm'});
});
test('early imports are all-or-nothing; later backup imports retain partial-coverage rules',()=>{
  assert.equal(earlyImportReady(true,0,6),false);
  assert.equal(earlyImportReady(true,5,6),false);
  assert.equal(earlyImportReady(true,6,6),true);
  assert.equal(earlyImportReady(false,1,6),true);
  assert.equal(earlyImportReady(false,6,6),true);
  for(const count of [-1,7,1.5,NaN])
    assert.throws(()=>earlyImportReady(true,count,6),/Invalid roster completion/);
  assert.throws(()=>earlyImportReady(true,0,0),/Invalid roster completion/);
});
test('fast GitHub slots may run before window closure only with complete R2 data',async()=>{
  const {readFile}=await import('node:fs/promises');
  const workflow=await readFile(new URL('../.github/workflows/pull-rosters-r2.yml',import.meta.url),'utf8');
  const script=await readFile(new URL('../scripts/pull-rosters-r2.mjs',import.meta.url),'utf8');
  assert.match(workflow,/cron: "17 4 \* \* \*"/);
  assert.match(workflow,/cron: "47 16 \* \* \*"/);
  assert.match(workflow,/args\+=\("--early"\)/);
  assert.match(script,/end>Date\.now\(\)&&!early/);
  assert.match(script,/!earlyImportReady\(early,updates\.size,registry\.length\)/);
  assert.match(script,/Later schedules will retry/);
  assert.match(script,/if\(!updates\.size\)throw Error/);
  assert.match(workflow,/group: main-data-writer/);
  assert.match(workflow,/cancel-in-progress: false/);
});
