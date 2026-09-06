// scripts/build-roster-evolution-summaries.mjs
// Génère un petit agrégat par checkpoint pour le classement d'évolution du groupement.

import fs from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || 'docs/data';
const HISTORY_DIR = process.env.HISTORY_DIR || path.join(DATA_DIR, 'roster-history');
const INDEX_FILE = path.join(HISTORY_DIR, 'index.json');
const GROUP_DIR = path.join(HISTORY_DIR, 'group');

function parseArgs(argv) {
  const options = { write: false, checkpoint: '' };
  for (const arg of argv) {
    if (arg === '--write') options.write = true;
    else if (arg === '--dry-run') options.write = false;
    else if (arg.startsWith('--checkpoint=')) options.checkpoint = arg.slice('--checkpoint='.length);
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/build-roster-evolution-summaries.mjs [--write] [--checkpoint=YYYY-MM-01]');
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.checkpoint && !/^\d{4}-\d{2}-01$/.test(options.checkpoint)) {
    throw new Error(`Invalid checkpoint: ${options.checkpoint}`);
  }
  return options;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

function totalPower(snapshot) {
  return Object.values(snapshot?.chars || {}).reduce((sum, char) => {
    const power = Number(char?.power);
    return Number.isFinite(power) && power > 0 ? sum + power : sum;
  }, 0);
}

async function buildCheckpoint(index, checkpoint) {
  const players = [];
  for (const [playerKey, entry] of Object.entries(index.players || {})) {
    if (!Array.isArray(entry?.checkpoints) || !entry.checkpoints.includes(checkpoint)) continue;

    const file = path.join(HISTORY_DIR, 'players', playerKey, `${checkpoint}.json`);
    let snapshot;
    try {
      snapshot = await readJson(file);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }

    players.push({
      player: snapshot.player || entry.name || playerKey,
      playerKey,
      alliance: snapshot.alliance || entry.currentAlliance || '',
      totalPower: totalPower(snapshot),
    });
  }

  players.sort((a, b) => a.player.localeCompare(b.player, 'fr', { sensitivity: 'base' }));
  return { version: 1, checkpoint, players };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const index = await readJson(INDEX_FILE);
  const checkpoints = (index.checkpoints || [])
    .map((entry) => entry?.date)
    .filter(Boolean)
    .filter((date) => !options.checkpoint || date === options.checkpoint)
    .sort();

  if (!checkpoints.length) throw new Error('No matching roster-history checkpoint found.');

  console.log(`[roster-evolution] Mode: ${options.write ? 'WRITE' : 'DRY-RUN'}`);

  for (const checkpoint of checkpoints) {
    const summary = await buildCheckpoint(index, checkpoint);
    console.log(`[roster-evolution] ${checkpoint}: ${summary.players.length} players`);
    if (!options.write) continue;

    await fs.mkdir(GROUP_DIR, { recursive: true });
    await fs.writeFile(
      path.join(GROUP_DIR, `${checkpoint}.json`),
      `${JSON.stringify(summary, null, 2)}\n`,
      'utf8',
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
