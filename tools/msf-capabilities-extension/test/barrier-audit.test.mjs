import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function walkFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const p = path.join(dir, entry.name);
    return entry.isDirectory() ? walkFiles(p) : [p];
  });
}

function countMap(map, key) { map.set(key, (map.get(key) || 0) + 1); }
function stable(v) { return JSON.stringify(v); }

test('temporary exhaustive barrier audit', () => {
  const publication = JSON.parse(fs.readFileSync('docs/data/msf-capabilities-explorer/manifest.json', 'utf8'));
  const root = path.join('docs/data/msf-capabilities-explorer', publication.currentPath, 'characters');
  const files = walkFiles(root).filter((p) => p.endsWith('.json'));
  const rows = [];

  for (const file of files) {
    const character = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const ability of character.abilities || []) {
      const contexts = new Map((ability.presentation?.contexts || []).map((c) => [c.id, c]));
      const branches = [];
      for (const phase of ability.presentation?.playerPhases || []) {
        for (const branch of phase.branches || []) branches.push(branch);
      }
      for (const action of ability.actions || []) {
        if (action.mechanicId !== 'barrier') continue;
        const context = contexts.get(action.contextId) || null;
        const branch = branches.find((b) => (b.occurrenceRefs || []).includes(action.sourceActionId || action.id)) || null;
        rows.push({ character, ability, action, context, branch });
      }
    }
  }

  const bySourceType = new Map();
  const fieldCombos = new Map();
  const valueFields = new Map();
  const triggers = new Map();
  const triggerFor = new Map();
  const chance = new Map();
  const modes = new Map();
  const sides = new Map();
  let withConditions = 0;
  let targetPresent = 0;
  let targetAbsent = 0;

  for (const { action, context, branch } of rows) {
    countMap(bySourceType, action.sourceActionType || action.sourceType || 'null');
    const values = action.uninterpretedParameters?.values || {};
    countMap(fieldCombos, Object.keys(values).sort().join('|') || '(none)');
    for (const [k, v] of Object.entries(values)) {
      if (!valueFields.has(k)) valueFields.set(k, new Map());
      countMap(valueFields.get(k), stable(v));
    }
    const trig = branch?.trigger ?? context?.trigger ?? action.trigger ?? null;
    countMap(triggers, stable(trig));
    countMap(triggerFor, stable(context?.triggerFor ?? null));
    countMap(chance, stable(action.chance ?? values.action_pct ?? null));
    for (const m of action.modes || branch?.mode || []) countMap(modes, stable(m));
    for (const s of action.sides || branch?.combatSide || []) countMap(sides, stable(s));
    const conditions = [
      ...(action.conditions || []),
      ...(action.structuredConditions || []),
      ...(branch?.conditions || []),
    ];
    if (conditions.length) withConditions++;
    if (action.target?.present) targetPresent++; else targetAbsent++;
  }

  const printMap = (label, map) => {
    console.log(label);
    for (const [k, v] of [...map.entries()].sort((a,b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))) {
      console.log(`${v}\t${k}`);
    }
  };

  console.log('=== BARRIER AUDIT START ===');
  console.log('TOTAL', rows.length);
  console.log('ABILITIES', new Set(rows.map(r => r.ability.id)).size);
  console.log('CHARACTERS', new Set(rows.map(r => r.character.characterId || r.character.id)).size);
  console.log('TARGET_PRESENT', targetPresent);
  console.log('TARGET_ABSENT', targetAbsent);
  console.log('WITH_CONDITIONS', withConditions);
  printMap('SOURCE_TYPES', bySourceType);
  printMap('FIELD_COMBINATIONS', fieldCombos);
  for (const [field, map] of [...valueFields.entries()].sort()) printMap(`FIELD_VALUES ${field}`, map);
  printMap('TRIGGERS', triggers);
  printMap('TRIGGER_FOR', triggerFor);
  printMap('CHANCE_OR_ACTION_PCT', chance);
  printMap('MODES', modes);
  printMap('SIDES', sides);
  console.log('=== BARRIER AUDIT END ===');

  assert.ok(rows.length > 0);
});
