import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function source(path) {
  return readFileSync(new URL('../' + path, import.meta.url), 'utf8');
}

function section(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, 'Function markers must exist');
  return text.slice(start, end);
}

const normalizePlayerKey = value => String(value ?? '')
  .trim().toLowerCase().replace(/[^a-z0-9]/g, '');

function snapshotNormalizer(path) {
  const segment = section(source(path),
    'function copyIfPresent(', 'function buildCandidates(');
  return new Function('normalizePlayerKey',
    segment + '\nreturn normalizePlayerSnapshot;')(normalizePlayerKey);
}

const oldPlayer = {
  player: 'Example',
  chars: {
    SpiderMan: {
      power: 100000, level: 100, gear: 19,
      abilities: { basic: 6, special: 6, ultimate: 5, passive: 4 },
    },
  },
  iso: {},
};

const currentPlayer = {
  player: 'Example',
  chars: {
    SpiderMan: {
      power: 123000, level: 100, gear: 19,
      abilities: { basic: 7, special: 6, ultimate: 5, passive: 4 },
    },
  },
  iso: {},
};

function convert(normalize, player, checkpoint) {
  return normalize(player, 'Example', 'example', 'zeus', checkpoint,
    { file: 'docs/data/rosters_zeus.json', commit: 'abc', committedAt: '2026-10-29T04:00:00Z' });
}

for (const file of ['scripts/snapshot-rosters.mjs', 'scripts/build-roster-history.mjs']) {
  test(file + ': real optional ability levels survive snapshot normalization', () => {
    const normalize = snapshotNormalizer(file);
    const snapshot = convert(normalize, currentPlayer, '2026-11-01');
    assert.deepEqual(snapshot.chars.spiderman.abilities,
      { basic: 7, special: 6, ultimate: 5, passive: 4 });
    assert.equal(snapshot.chars.spiderman.power, 123000);
  });

  test(file + ': missing or invalid abilities do not become zero', () => {
    const normalize = snapshotNormalizer(file);
    const player = {
      chars: {
        SpiderMan: { power: 1, abilities: { basic: 0, special: -1, ultimate: '7', passive: 5 } },
        Ikaris: { power: 2 },
      },
    };
    const snapshot = convert(normalize, player, '2026-11-01');
    assert.deepEqual(snapshot.chars.spiderman.abilities, { basic: 0, passive: 5 });
    assert.ok(!Object.hasOwn(snapshot.chars.ikaris, 'abilities'));
  });
}

function compare(oldSnapshot, newSnapshot) {
  const script = source('docs/evolution.js');
  const numeric = section(script, '  function hasOwn(', '  function isoClassLabel(');
  const diff = section(script, '  function buildChange(', '  function clear(');
  const diffSnapshots = new Function(
    'formatNumber', 'isoDisplay', 'isoMeta', 'characterName', 'characterPortrait',
    numeric + '\n' + diff + '\nreturn diffSnapshots;'
  )(
    n => String(n),
    () => null,
    () => ({ isoClass: '' }),
    key => key,
    () => ''
  );
  return diffSnapshots(oldSnapshot, newSnapshot);
}

test('monthly evolution reports ability level gain alongside actual power gain', () => {
  const normalize = snapshotNormalizer('scripts/snapshot-rosters.mjs');
  const older = convert(normalize, oldPlayer, '2026-11-01');
  const newer = convert(normalize, currentPlayer, '2026-12-01');
  const result = compare(older, newer);
  assert.equal(result.abilityLevels, 1);
  assert.equal(result.powerGain, 23000);
  assert.equal(result.improved, 1);
  assert.equal(result.cards.length, 1);
  assert.deepEqual(result.cards[0].changes.filter(c => c.label.startsWith('Capacité ')), [
    { label: 'Capacité Basique', oldValue: '6', newValue: '7' },
  ]);
});

test('capacity-only progression remains visible even without a power change', () => {
  const result = compare(
    { chars: { spiderman: { power: 100, abilities: { special: 6 } } } },
    { chars: { spiderman: { power: 100, abilities: { special: 7 } } } }
  );
  assert.equal(result.abilityLevels, 1);
  assert.equal(result.powerGain, 0);
  assert.equal(result.improved, 1);
  assert.equal(result.cards[0].changes[0].label, 'Capacité Spéciale');
});

test('missing historical abilities never imply a fictitious upgrade from zero', () => {
  const result = compare(
    { chars: { spiderman: { power: 100 } } },
    { chars: { spiderman: { power: 120, abilities: { basic: 7 } } } }
  );
  assert.equal(result.abilityLevels, 0);
  assert.equal(result.powerGain, 20);
  assert.equal(result.cards[0].changes.length, 0);
});

test('new character shows initial abilities but does not count them as upgrades', () => {
  const result = compare(
    { chars: {} },
    { chars: { spiderman: { power: 100, abilities: { basic: 6, passive: 4 } } } }
  );
  assert.equal(result.unlocked, 1);
  assert.equal(result.abilityLevels, 0);
  assert.deepEqual(result.cards[0].changes.filter(c => c.label.startsWith('Capacité ')), [
    { label: 'Capacité Basique', oldValue: '—', newValue: '6' },
    { label: 'Capacité Passive', oldValue: '—', newValue: '4' },
  ]);
});

test('decreases and unknown values are not reported as upgrades', () => {
  const result = compare(
    { chars: { spiderman: { power: 100, abilities: { basic: 7, special: 5 } } } },
    { chars: { spiderman: { power: 100, abilities: { basic: 6, special: null } } } }
  );
  assert.equal(result.abilityLevels, 0);
  assert.equal(result.improved, 0);
  assert.equal(result.cards.length, 0);
});
