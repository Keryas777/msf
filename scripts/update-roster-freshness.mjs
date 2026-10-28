// scripts/update-roster-freshness.mjs
// Publish a timestamp only when the merged roster content has actually changed.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROSTERS_FILE = process.env.OUT_FILE || 'docs/data/rosters.json';
const META_FILE = process.env.ROSTER_META_FILE || 'docs/data/rosters-meta.json';

function differsFromHead(file) {
  try {
    execFileSync('git', ['diff', '--quiet', 'HEAD', '--', file], { stdio: 'ignore' });
    return false;
  } catch (error) {
    if (error.status === 1) return true;
    throw error;
  }
}

function lastCommittedAt(file) {
  const value = execFileSync('git', ['log', '-1', '--format=%cI', '--', file], { encoding: 'utf8' }).trim();
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new Error(`No valid commit date for ${file}`);
  }
  return new Date(value).toISOString();
}

async function main() {
  await fs.access(ROSTERS_FILE);
  const changed = differsFromHead(ROSTERS_FILE);

  if (!changed) {
    try {
      const existing = JSON.parse(await fs.readFile(META_FILE, 'utf8'));
      if (existing?.updatedAt && !Number.isNaN(Date.parse(existing.updatedAt))) {
        console.log('[rosters-meta] Unchanged rosters: keeping existing date.');
        return;
      }
    } catch (error) {
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    }
  }

  const updatedAt = changed ? new Date().toISOString() : lastCommittedAt(ROSTERS_FILE);
  await fs.mkdir(path.dirname(META_FILE), { recursive: true });
  await fs.writeFile(META_FILE, JSON.stringify({ updatedAt }, null, 2) + '\n', 'utf8');
  console.log(`[rosters-meta] ${changed ? 'New roster content' : 'Initialized'}: ${updatedAt}`);
}

main().catch(error => {
  console.error('[rosters-meta] Failed:', error);
  process.exitCode = 1;
});
