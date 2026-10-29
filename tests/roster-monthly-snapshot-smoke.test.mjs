// End-to-end rehearsal against the real monthly script and a real published
// roster, entirely within a disposable Git repository (never production).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync,
  readdirSync, existsSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const snapshotScript = fileURLToPath(new URL('../scripts/snapshot-rosters.mjs', import.meta.url));
const summaryScript = fileURLToPath(new URL('../scripts/build-roster-evolution-summaries.mjs', import.meta.url));
const sourceRoster = fileURLToPath(new URL('../docs/data/rosters_hades.json', import.meta.url));
const sourceAlliances = fileURLToPath(new URL('../docs/data/alliances.json', import.meta.url));
const checkpoint = '2026-10-01'; // Synthetic historical checkpoint: future dates are refused.
const env = {
  ...process.env,
  DATA_DIR: 'docs/data',
  ROSTER_HISTORY_TZ: 'Europe/Paris',
  TZ: 'Europe/Paris',
};

function run(command, args, cwd, overrides = {}) {
  const res = spawnSync(command, args, {
    cwd, encoding: 'utf8', env: { ...env, ...overrides },
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(res.status, 0,
    command + ' ' + args.join(' ') + '\n' + res.stdout + '\n' + res.stderr);
  return res.stdout;
}

test('real monthly snapshot script preserves ability levels, writes summary, and is idempotent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'losp-roster-snapshot-rehearsal-'));
  try {
    const data = join(dir, 'docs', 'data');
    const history = join(data, 'roster-history');
    mkdirSync(history, { recursive: true });
    copyFileSync(sourceAlliances, join(data, 'alliances.json'));
    copyFileSync(sourceRoster, join(data, 'rosters_hades.json'));
    writeFileSync(join(history, 'index.json'), JSON.stringify({
      version: 1, checkpoints: [], players: {},
    }, null, 2));

    const published = JSON.parse(readFileSync(sourceRoster, 'utf8'));
    assert.ok(Array.isArray(published) && published.length > 0);
    const sourceChars = Object.values(published[0].chars || {});
    const withLevels = sourceChars.filter(c =>
      ['basic', 'special', 'ultimate', 'passive']
        .every(k => Number.isSafeInteger(c?.abilities?.[k])));
    assert.ok(withLevels.length > 0, 'The real source must contain ability levels');

    // Git metadata must precede the synthetic checkpoint for the actual git-log
    // cutoff selection to find the roster. Never commit anything to the real repo.
    run('git', ['init', '-q'], dir);
    run('git', ['config', 'user.email', 'snapshot-fixture@example.invalid'], dir);
    run('git', ['config', 'user.name', 'LoSP snapshot rehearsal'], dir);
    run('git', ['add', '.'], dir);
    run('git', ['commit', '-qm', 'Synthetic baseline for snapshot rehearsal'], dir, {
      GIT_AUTHOR_DATE: '2026-09-30T12:00:00+02:00',
      GIT_COMMITTER_DATE: '2026-09-30T12:00:00+02:00',
    });

    const initialIndex = readFileSync(join(history, 'index.json'), 'utf8');
    const dryLog = run(process.execPath,
      [snapshotScript, '--checkpoint=' + checkpoint, '--dry-run'], dir);
    assert.match(dryLog, /Mode: DRY-RUN/);
    assert.match(dryLog, /Players: [1-9]\d*/);
    assert.equal(readFileSync(join(history, 'index.json'), 'utf8'), initialIndex);
    assert.ok(!existsSync(join(history, 'players')), 'Dry-run must not write snapshots');

    // Writing is permitted only to the disposable directory, not the live history.
    const writeLog = run(process.execPath,
      [snapshotScript, '--checkpoint=' + checkpoint, '--write'], dir);
    assert.match(writeLog, /Mode: WRITE/);
    const keys = readdirSync(join(history, 'players'));
    assert.ok(keys.length > 0, 'At least one player snapshot should be produced');
    const snapshotFile = join(history, 'players', keys[0], checkpoint + '.json');
    const snapshot = JSON.parse(readFileSync(snapshotFile, 'utf8'));
    const savedChars = Object.values(snapshot.chars || {});
    const savedWithLevels = savedChars.filter(c =>
      ['basic', 'special', 'ultimate', 'passive']
        .every(k => Number.isSafeInteger(c?.abilities?.[k])));
    assert.ok(savedWithLevels.length > 0, 'Abilities must survive real snapshot writing');
    assert.equal(savedWithLevels.length, withLevels.length);
    assert.deepEqual(
      savedChars.find(c => c.abilities)?.abilities,
      sourceChars.find(c => c.abilities)?.abilities
    );

    const index = JSON.parse(readFileSync(join(history, 'index.json'), 'utf8'));
    assert.ok(index.checkpoints.some(row => row.date === checkpoint));
    assert.ok(index.players[keys[0]].checkpoints.includes(checkpoint));

    const summaryLog = run(process.execPath,
      [summaryScript, '--checkpoint=' + checkpoint, '--write'], dir);
    assert.match(summaryLog, /Mode: WRITE/);
    const summary = JSON.parse(readFileSync(join(history, 'group', checkpoint + '.json'), 'utf8'));
    assert.equal(summary.checkpoint, checkpoint);
    assert.ok(summary.players.some(row => row.playerKey === keys[0]));

    const snapshotBeforeRerun = readFileSync(snapshotFile, 'utf8');
    const second = run(process.execPath,
      [snapshotScript, '--checkpoint=' + checkpoint, '--write'], dir);
    assert.match(second, /already exists -> no-op/);
    assert.equal(readFileSync(snapshotFile, 'utf8'), snapshotBeforeRerun);
    assert.equal(root.length > 0, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
