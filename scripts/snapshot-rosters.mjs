// scripts/snapshot-rosters.mjs
// Ajoute un checkpoint hebdomadaire (ou conserve les anciens mensuels) sans reconstruire l'historique.
// Dry-run par défaut. Utiliser --write pour écrire le nouveau checkpoint et mettre à jour index.json.

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadAllianceRegistry } from './lib/alliances-node.mjs';
import {
  FIRST_WEEKLY_CHECKPOINT, ROSTER_CHECKPOINT_TIMEZONE,
  lastCompletedWeeklyCheckpoint, isWeeklyCheckpoint, checkpointCutoff,
  validateCheckpointDate,
} from './lib/roster-checkpoint-dates.mjs';

const ROOT_DIR = process.cwd();
const DATA_DIR = process.env.DATA_DIR || 'docs/data';
const HISTORY_DIR = process.env.HISTORY_DIR || path.join(DATA_DIR, 'roster-history');
const INDEX_FILE = path.join(HISTORY_DIR, 'index.json');
const ALIASES_FILE = process.env.PLAYER_ALIASES_FILE || path.join(DATA_DIR, 'player-aliases.json');
const ALLIANCES_FILE = process.env.ALLIANCES_FILE || path.join(DATA_DIR, 'alliances.json');
const GIT_TZ = process.env.ROSTER_HISTORY_TZ || ROSTER_CHECKPOINT_TIMEZONE;
const GIT_MAX_BUFFER = 64 * 1024 * 1024;

function parseArgs(argv) {
  const options = { checkpoint: lastCompletedWeeklyCheckpoint(), write: false };
  for (const arg of argv) {
    if (arg === '--write') options.write = true;
    else if (arg === '--dry-run') options.write = false;
    else if (arg.startsWith('--checkpoint=')) {
      options.checkpoint = arg.slice('--checkpoint='.length);
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/snapshot-rosters.mjs [--checkpoint=YYYY-MM-DD] [--write|--dry-run]');
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  validateCheckpointDate(options.checkpoint);
  return options;
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
      console.warn(`[roster-snapshot] Alias file missing: ${ALIASES_FILE} -> continuing without aliases`);
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

async function loadActiveAllianceKeys(registry) {
  const raw = await fs.readFile(ALLIANCES_FILE, 'utf8');
  const entries = JSON.parse(raw);
  if (!Array.isArray(entries)) {
    throw new TypeError(`Alliance registry must be an array: ${ALLIANCES_FILE}`);
  }

  const activeByKey = new Map(
    entries.map((entry) => [String(entry?.key ?? '').trim().toLowerCase(), entry?.active !== false]),
  );
  return registry.knownKeys.filter((key) => activeByKey.get(key) !== false);
}

function runGit(args, options = {}) {
  return execFileSync('git', args, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    maxBuffer: GIT_MAX_BUFFER,
    stdio: ['ignore', 'pipe', options.allowFailure ? 'ignore' : 'pipe'],
    env: { ...process.env, TZ: GIT_TZ },
  }).trim();
}

function assertFullGitHistory() {
  runGit(['rev-parse', '--is-inside-work-tree']);
  const shallow = runGit(['rev-parse', '--is-shallow-repository']);
  if (shallow === 'true') {
    throw new Error('Git history is shallow. Re-run checkout with fetch-depth: 0 before snapshotting roster history.');
  }
}

function findSourceRevision(file, checkpoint) {
  let line = '';
  try {
    line = runGit(['log', '-1', '--format=%H%x09%cI', `--before=${checkpointCutoff(checkpoint)}`, '--', file]);
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
  if (Object.prototype.hasOwnProperty.call(source, field)) target[field] = source[field];
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
    // Optional progression captured since PR #410; do not invent older levels.
    const observed = rawChar.abilities;
    if (observed && typeof observed === 'object' && !Array.isArray(observed)) {
      const abilities = {};
      for (const field of ['basic', 'special', 'ultimate', 'passive']) {
        const value = observed[field];
        if (Number.isSafeInteger(value) && value >= 0) abilities[field] = value;
      }
      if (Object.keys(abilities).length) char.abilities = abilities;
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

async function loadIndex() {
  let raw;
  try {
    raw = await fs.readFile(INDEX_FILE, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`Missing ${INDEX_FILE}. Run the retroactive history builder first.`);
    }
    throw error;
  }

  const index = JSON.parse(raw);
  if (!Array.isArray(index?.checkpoints) || !index?.players || typeof index.players !== 'object') {
    throw new Error(`Invalid roster history index: ${INDEX_FILE}`);
  }
  return index;
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function mergeIndex(index, checkpoint, snapshots) {
  const next = structuredClone(index);
  next.version = next.version || 1;
  next.checkpoints.push(isWeeklyCheckpoint(checkpoint)
    ? { date: checkpoint, players: snapshots.length, cadence: 'weekly', cutoffLocalTime: '23:00', timezone: GIT_TZ }
    : { date: checkpoint, players: snapshots.length });
  next.checkpoints.sort((a, b) => String(a.date).localeCompare(String(b.date)));

  for (const snapshot of snapshots) {
    if (!next.players[snapshot.playerKey]) {
      next.players[snapshot.playerKey] = {
        name: snapshot.player,
        currentAlliance: snapshot.alliance,
        checkpoints: [],
      };
    }
    const entry = next.players[snapshot.playerKey];
    entry.name = snapshot.player;
    entry.currentAlliance = snapshot.alliance;
    if (!entry.checkpoints.includes(checkpoint)) entry.checkpoints.push(checkpoint);
    entry.checkpoints.sort();
  }

  next.players = Object.fromEntries(
    Object.entries(next.players).sort(([a], [b]) => a.localeCompare(b, 'fr', { sensitivity: 'base' })),
  );
  return next;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (GIT_TZ !== ROSTER_CHECKPOINT_TIMEZONE) {
    throw new Error('Roster checkpoint timezone must remain Europe/Paris');
  }
  assertFullGitHistory();

  const index = await loadIndex();
  const alreadyExists = index.checkpoints.some((entry) => entry?.date === options.checkpoint);
  if (alreadyExists && options.write) {
    console.log(`[roster-snapshot] Checkpoint ${options.checkpoint} already exists -> no-op.`);
    return;
  }

  const registry = loadAllianceRegistry();
  const activeAllianceKeys = await loadActiveAllianceKeys(registry);
  const aliasMap = await loadPlayerAliases();
  const warnings = [];
  const revisions = [];

  for (const alliance of activeAllianceKeys) {
    const file = path.posix.join(DATA_DIR.replaceAll('\\', '/'), `rosters_${alliance}.json`);
    const revision = findSourceRevision(file, options.checkpoint);
    if (!revision) continue;
    revisions.push({ ...revision, alliance });
  }

  const candidatesByPlayer = buildCandidates(options.checkpoint, revisions, aliasMap, warnings);
  const snapshots = [];
  for (const [playerKey, candidates] of candidatesByPlayer) {
    const selected = chooseCandidate(options.checkpoint, playerKey, candidates, warnings);
    if (selected) snapshots.push(selected);
  }
  snapshots.sort((a, b) => a.player.localeCompare(b.player, 'fr', { sensitivity: 'base' }));

  console.log(`\n[roster-snapshot] Mode: ${options.write ? 'WRITE' : 'DRY-RUN'}`);
  console.log(`[roster-snapshot] Checkpoint: ${options.checkpoint}`);
  console.log(`[roster-snapshot] Active alliances: ${activeAllianceKeys.join(', ')}`);
  console.log(`[roster-snapshot] Players: ${snapshots.length}`);
  for (const source of revisions) {
    console.log(`  - ${source.alliance}: ${source.rows.length} players @ ${source.committedAt} (${source.commit.slice(0, 8)})`);
  }

  const resolved = warnings.filter((warning) => warning.type === 'multi-alliance-resolved');
  const ambiguous = warnings.filter((warning) => warning.type === 'multi-alliance-ambiguous');
  const duplicates = warnings.filter((warning) => warning.type === 'duplicate-in-source');
  console.log(`[roster-snapshot] Cross-alliance resolved: ${resolved.length}`);
  for (const item of resolved) {
    console.log(`  ✓ ${item.playerKey} -> ${item.selectedAlliance} (${item.selectedCommittedAt})`);
  }
  console.log(`[roster-snapshot] Ambiguous collisions: ${ambiguous.length}`);
  console.log(`[roster-snapshot] Duplicate canonical players inside one source: ${duplicates.length}`);

  if (ambiguous.length || duplicates.length) {
    throw new Error('Roster snapshot contains ambiguous or duplicate player identities; refusing to write.');
  }

  if (!options.write) {
    console.log(`[roster-snapshot] Dry-run complete${alreadyExists ? ' (checkpoint already exists in index)' : ''}.`);
    return;
  }

  for (const snapshot of snapshots) {
    const file = path.join(HISTORY_DIR, 'players', snapshot.playerKey, `${options.checkpoint}.json`);
    try {
      await fs.access(file);
      throw new Error(`Refusing to overwrite existing snapshot: ${file}`);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    await writeJson(file, snapshot);
  }

  const nextIndex = mergeIndex(index, options.checkpoint, snapshots);
  await writeJson(INDEX_FILE, nextIndex);
  console.log(`[roster-snapshot] Wrote ${snapshots.length} snapshots and updated ${INDEX_FILE}.`);
}

main().catch((error) => {
  console.error('❌ roster-snapshot fatal:', error?.stack || error);
  process.exit(1);
});
