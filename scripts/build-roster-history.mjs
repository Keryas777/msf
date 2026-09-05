// scripts/build-roster-history.mjs
// Reconstruit des snapshots mensuels de roster à partir de l'historique Git.
// Dry-run par défaut. Utiliser --write pour écrire docs/data/roster-history/.

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadAllianceRegistry } from './lib/alliances-node.mjs';

const ROOT_DIR = process.cwd();
const DATA_DIR = process.env.DATA_DIR || 'docs/data';
const HISTORY_DIR = process.env.HISTORY_DIR || path.join(DATA_DIR, 'roster-history');
const ALIASES_FILE = process.env.PLAYER_ALIASES_FILE || path.join(DATA_DIR, 'player-aliases.json');
const DEFAULT_FROM = process.env.ROSTER_HISTORY_FROM || '2026-04-01';
const DEFAULT_TO = process.env.ROSTER_HISTORY_TO || firstDayOfCurrentMonth();
const GIT_TZ = process.env.ROSTER_HISTORY_TZ || 'Europe/Paris';

function firstDayOfCurrentMonth() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function parseArgs(argv) {
  const options = {
    from: DEFAULT_FROM,
    to: DEFAULT_TO,
    write: false,
  };

  for (const arg of argv) {
    if (arg === '--write') {
      options.write = true;
      continue;
    }
    if (arg === '--dry-run') {
      options.write = false;
      continue;
    }
    if (arg.startsWith('--from=')) {
      options.from = arg.slice('--from='.length);
      continue;
    }
    if (arg.startsWith('--to=')) {
      options.to = arg.slice('--to='.length);
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  assertCheckpointDate(options.from, '--from');
  assertCheckpointDate(options.to, '--to');
  if (options.from > options.to) {
    throw new Error(`--from (${options.from}) must be <= --to (${options.to})`);
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/build-roster-history.mjs [options]\n\nOptions:\n  --from=YYYY-MM-01   First checkpoint (default: ${DEFAULT_FROM})\n  --to=YYYY-MM-01     Last checkpoint (default: current month)\n  --write              Write snapshots and index.json\n  --dry-run            Analyse only (default)\n  -h, --help           Show this help\n\nEnvironment:\n  DATA_DIR              Data directory (default: docs/data)\n  HISTORY_DIR           Output directory (default: docs/data/roster-history)\n  PLAYER_ALIASES_FILE   Alias JSON path\n  ROSTER_HISTORY_TZ     Git cutoff timezone (default: Europe/Paris)\n`);
}

function assertCheckpointDate(value, label) {
  if (!/^\d{4}-\d{2}-01$/.test(value)) {
    throw new Error(`${label} must use YYYY-MM-01, got: ${value}`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} is not a valid date: ${value}`);
  }
}

function listMonthlyCheckpoints(from, to) {
  const checkpoints = [];
  let cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);

  while (cursor <= end) {
    checkpoints.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }

  return checkpoints;
}

function normalizePlayerKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
    .replace(/[-_]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function normalizeAliasLookup(value) {
  return String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’'`´]/g, '')
    .replace(/\s+/g, ' ');
}

async function loadPlayerAliases() {
  try {
    const raw = await fs.readFile(ALIASES_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const source = parsed?.aliases && typeof parsed.aliases === 'object' ? parsed.aliases : {};
    const map = new Map();

    for (const [alias, canonical] of Object.entries(source)) {
      const key = normalizeAliasLookup(alias);
      const value = String(canonical ?? '').trim();
      if (key && value && !map.has(key)) map.set(key, value);
    }

    return map;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      console.warn(`[roster-history] Alias file missing: ${ALIASES_FILE} -> continuing without aliases`);
      return new Map();
    }
    throw error;
  }
}

function resolveCanonicalPlayerName(player, aliasMap) {
  let current = String(player ?? '').trim();
  const seen = new Set();

  for (let i = 0; i < 10; i += 1) {
    const lookup = normalizeAliasLookup(current);
    if (!lookup || seen.has(lookup)) break;
    seen.add(lookup);

    const next = aliasMap.get(lookup);
    if (!next) break;
    current = next;
  }

  return current;
}

function runGit(args, options = {}) {
  return execFileSync('git', args, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', options.allowFailure ? 'ignore' : 'pipe'],
    env: { ...process.env, TZ: GIT_TZ },
  }).trim();
}

function assertFullGitHistory() {
  runGit(['rev-parse', '--is-inside-work-tree']);
  const shallow = runGit(['rev-parse', '--is-shallow-repository']);
  if (shallow === 'true') {
    throw new Error('Git history is shallow. Re-run checkout with fetch-depth: 0 before rebuilding roster history.');
  }
}

function findSourceRevision(file, checkpoint) {
  let line = '';
  try {
    line = runGit([
      'log',
      '-1',
      '--format=%H%x09%cI',
      `--before=${checkpoint}T00:00:00`,
      '--',
      file,
    ]);
  } catch {
    return null;
  }

  if (!line) return null;
  const [commit, committedAt] = line.split('\t');
  if (!commit || !committedAt) return null;

  let content = '';
  try {
    content = runGit(['show', `${commit}:${file}`]);
  } catch {
    return null;
  }

  let rows;
  try {
    rows = JSON.parse(content);
  } catch (error) {
    throw new Error(`Invalid JSON in ${file} at ${commit}: ${error.message}`);
  }
  if (!Array.isArray(rows)) {
    throw new Error(`${file} at ${commit} is not a JSON array`);
  }

  return { file, commit, committedAt, rows };
}

function copyIfPresent(target, source, field) {
  if (Object.prototype.hasOwnProperty.call(source, field)) {
    target[field] = source[field];
  }
}

function normalizePlayerSnapshot(row, canonicalName, playerKey, allianceKey, checkpoint, source) {
  const chars = {};
  const sourceChars = row?.chars && typeof row.chars === 'object' ? row.chars : {};

  for (const [rawCharKey, rawChar] of Object.entries(sourceChars)) {
    if (!rawChar || typeof rawChar !== 'object') continue;
    const charKey = normalizePlayerKey(rawCharKey);
    if (!charKey) continue;

    const char = {};
    for (const field of ['power', 'level', 'gear', 'isoMax', 'yellowStars', 'redStars', 'diamonds']) {
      copyIfPresent(char, rawChar, field);
    }
    chars[charKey] = char;
  }

  const iso = {};
  const sourceIso = row?.iso && typeof row.iso === 'object' ? row.iso : {};
  for (const [rawCharKey, rawIso] of Object.entries(sourceIso)) {
    if (!rawIso || typeof rawIso !== 'object') continue;
    const charKey = normalizePlayerKey(rawCharKey);
    if (!charKey) continue;

    const value = {};
    copyIfPresent(value, rawIso, 'isoClass');
    copyIfPresent(value, rawIso, 'isoColor');
    if (Object.keys(value).length) iso[charKey] = value;
  }

  return {
    player: canonicalName,
    playerKey,
    alliance: allianceKey,
    checkpoint,
    source: {
      file: source.file,
      commit: source.commit,
      committedAt: source.committedAt,
    },
    chars,
    iso,
  };
}

function buildCandidates(checkpoint, sourceRevisions, aliasMap, warnings) {
  const candidatesByPlayer = new Map();

  for (const source of sourceRevisions) {
    const seenInSource = new Map();

    for (const row of source.rows) {
      const rawPlayer = String(row?.player ?? '').trim();
      if (!rawPlayer) continue;

      const canonicalName = resolveCanonicalPlayerName(rawPlayer, aliasMap);
      const playerKey = normalizePlayerKey(row?.playerKey || canonicalName);
      if (!playerKey) continue;

      if (seenInSource.has(playerKey)) {
        warnings.push({
          type: 'duplicate-in-source',
          checkpoint,
          playerKey,
          alliance: source.alliance,
          sourceFile: source.file,
          sourceCommit: source.commit,
          players: [seenInSource.get(playerKey), rawPlayer],
        });
        continue;
      }
      seenInSource.set(playerKey, rawPlayer);

      const candidate = normalizePlayerSnapshot(
        row,
        canonicalName,
        playerKey,
        source.alliance,
        checkpoint,
        source,
      );

      if (!candidatesByPlayer.has(playerKey)) candidatesByPlayer.set(playerKey, []);
      candidatesByPlayer.get(playerKey).push(candidate);
    }
  }

  return candidatesByPlayer;
}

function chooseCandidate(checkpoint, playerKey, candidates, warnings) {
  if (candidates.length === 1) return candidates[0];

  const sorted = [...candidates].sort((a, b) => {
    const timeDiff = Date.parse(b.source.committedAt) - Date.parse(a.source.committedAt);
    if (timeDiff !== 0) return timeDiff;
    return b.source.commit.localeCompare(a.source.commit);
  });

  const newestTime = Date.parse(sorted[0].source.committedAt);
  const newest = sorted.filter((candidate) => Date.parse(candidate.source.committedAt) === newestTime);

  if (newest.length === 1) {
    warnings.push({
      type: 'multi-alliance-resolved',
      checkpoint,
      playerKey,
      selectedAlliance: newest[0].alliance,
      selectedCommittedAt: newest[0].source.committedAt,
      candidates: sorted.map((candidate) => ({
        alliance: candidate.alliance,
        committedAt: candidate.source.committedAt,
        commit: candidate.source.commit,
      })),
    });
    return newest[0];
  }

  warnings.push({
    type: 'multi-alliance-ambiguous',
    checkpoint,
    playerKey,
    candidates: newest.map((candidate) => ({
      alliance: candidate.alliance,
      committedAt: candidate.source.committedAt,
      commit: candidate.source.commit,
    })),
  });
  return null;
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function buildIndex(checkpoints, snapshotsByCheckpoint) {
  const players = {};
  const checkpointEntries = [];

  for (const checkpoint of checkpoints) {
    const snapshots = snapshotsByCheckpoint.get(checkpoint) ?? [];
    checkpointEntries.push({ date: checkpoint, players: snapshots.length });

    for (const snapshot of snapshots) {
      if (!players[snapshot.playerKey]) {
        players[snapshot.playerKey] = {
          name: snapshot.player,
          currentAlliance: snapshot.alliance,
          checkpoints: [],
        };
      }
      const entry = players[snapshot.playerKey];
      entry.name = snapshot.player;
      entry.currentAlliance = snapshot.alliance;
      entry.checkpoints.push(checkpoint);
    }
  }

  return {
    version: 1,
    checkpoints: checkpointEntries,
    players: Object.fromEntries(
      Object.entries(players).sort(([a], [b]) => a.localeCompare(b, 'fr', { sensitivity: 'base' })),
    ),
  };
}

function printReport(options, checkpoints, sourceMatrix, snapshotsByCheckpoint, warnings) {
  console.log(`\n[roster-history] Mode: ${options.write ? 'WRITE' : 'DRY-RUN'}`);
  console.log(`[roster-history] Range: ${options.from} -> ${options.to}`);
  console.log(`[roster-history] Timezone: ${GIT_TZ}`);

  for (const checkpoint of checkpoints) {
    const sources = sourceMatrix.get(checkpoint) ?? [];
    const snapshots = snapshotsByCheckpoint.get(checkpoint) ?? [];
    console.log(`\n${checkpoint}: ${snapshots.length} players`);
    for (const source of sources) {
      console.log(`  - ${source.alliance}: ${source.rows.length} players @ ${source.committedAt} (${source.commit.slice(0, 8)})`);
    }
  }

  const resolved = warnings.filter((warning) => warning.type === 'multi-alliance-resolved');
  const ambiguous = warnings.filter((warning) => warning.type === 'multi-alliance-ambiguous');
  const duplicates = warnings.filter((warning) => warning.type === 'duplicate-in-source');

  console.log(`\n[roster-history] Cross-alliance resolved by freshest source: ${resolved.length}`);
  for (const item of resolved) {
    console.log(`  ✓ ${item.checkpoint} ${item.playerKey} -> ${item.selectedAlliance} (${item.selectedCommittedAt})`);
  }

  console.log(`[roster-history] Ambiguous cross-alliance collisions: ${ambiguous.length}`);
  for (const item of ambiguous) {
    console.warn(`  ! ${item.checkpoint} ${item.playerKey}: ${item.candidates.map((candidate) => candidate.alliance).join(', ')}`);
  }

  console.log(`[roster-history] Duplicate canonical players inside one source: ${duplicates.length}`);
  for (const item of duplicates) {
    console.warn(`  ! ${item.checkpoint} ${item.alliance} ${item.playerKey}: ${item.players.join(' / ')}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assertFullGitHistory();

  const registry = loadAllianceRegistry();
  const aliasMap = await loadPlayerAliases();
  const checkpoints = listMonthlyCheckpoints(options.from, options.to);
  const warnings = [];
  const sourceMatrix = new Map();
  const snapshotsByCheckpoint = new Map();

  for (const checkpoint of checkpoints) {
    const revisions = [];

    for (const alliance of registry.knownKeys) {
      const file = path.posix.join(DATA_DIR.replaceAll('\\', '/'), `rosters_${alliance}.json`);
      const revision = findSourceRevision(file, checkpoint);
      if (!revision) continue;
      revisions.push({ ...revision, alliance });
    }

    sourceMatrix.set(checkpoint, revisions);

    const candidatesByPlayer = buildCandidates(checkpoint, revisions, aliasMap, warnings);
    const snapshots = [];

    for (const [playerKey, candidates] of candidatesByPlayer) {
      const selected = chooseCandidate(checkpoint, playerKey, candidates, warnings);
      if (selected) snapshots.push(selected);
    }

    snapshots.sort((a, b) => a.player.localeCompare(b.player, 'fr', { sensitivity: 'base' }));
    snapshotsByCheckpoint.set(checkpoint, snapshots);
  }

  printReport(options, checkpoints, sourceMatrix, snapshotsByCheckpoint, warnings);

  if (!options.write) {
    console.log(`\n[roster-history] Dry-run complete. Re-run with --write to create ${HISTORY_DIR}.`);
    return;
  }

  for (const checkpoint of checkpoints) {
    for (const snapshot of snapshotsByCheckpoint.get(checkpoint) ?? []) {
      const file = path.join(HISTORY_DIR, 'players', snapshot.playerKey, `${checkpoint}.json`);
      await writeJson(file, snapshot);
    }
  }

  const index = buildIndex(checkpoints, snapshotsByCheckpoint);
  await writeJson(path.join(HISTORY_DIR, 'index.json'), index);

  const report = {
    version: 1,
    range: { from: options.from, to: options.to },
    warnings,
  };
  await writeJson(path.join(HISTORY_DIR, 'backfill-report.json'), report);

  console.log(`\n[roster-history] Wrote history to ${HISTORY_DIR}`);
}

main().catch((error) => {
  console.error('❌ roster-history fatal:', error?.stack || error);
  process.exit(1);
});
