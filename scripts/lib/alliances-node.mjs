import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_ALLIANCES_FILE = path.resolve(__dirname, '../../docs/data/alliances.json');

// Fallbacks de compatibilité historique des scripts de génération.
// Ces aliases complètent alliances.json sans modifier la source de vérité.
const HISTORICAL_COMPATIBILITY_ALIASES = [
  ['Cronos', 'kronos'],
  ['Chronos', 'kronos'],
  ['LoSPKronos', 'kronos'],
  ['Posseidon', 'poseidon'],
  ['Hades', 'hades'],
  ['Hadès', 'hades'],
];

let defaultRegistry;

function normalizeLookupValue(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’`´]/g, '')
    .replace(/[-_]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '');
}

function hasValidOrder(value) {
  if (value === null || value === undefined || value === '') return false;
  return Number.isFinite(Number(value));
}

function compareAlliances(left, right) {
  const leftOrder = left.order !== undefined ? left.order : Number.POSITIVE_INFINITY;
  const rightOrder = right.order !== undefined ? right.order : Number.POSITIVE_INFINITY;
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  return left.name.localeCompare(right.name, 'fr', { sensitivity: 'base' });
}

function readAllianceFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new TypeError(`Alliance registry must be an array: ${filePath}`);
  }
  return parsed;
}

export function loadAllianceRegistry(options = {}) {
  const filePath = options.filePath ? path.resolve(options.filePath) : DEFAULT_ALLIANCES_FILE;
  if (!options.filePath && defaultRegistry) return defaultRegistry;

  const seenKeys = new Set();
  const alliances = [];

  for (const entry of readAllianceFile(filePath)) {
    const key = normalizeLookupValue(entry?.key);
    if (!key || seenKeys.has(key)) continue;

    seenKeys.add(key);
    const hasOrder = hasValidOrder(entry.order);
    alliances.push({
      key,
      name: String(entry.name ?? entry.key ?? key),
      emoji: entry.emoji ?? '',
      color: entry.color ?? '',
      order: hasOrder ? Number(entry.order) : undefined,
      aliases: Array.isArray(entry.aliases) ? entry.aliases.filter((alias) => alias !== null && alias !== undefined) : [],
      hasOrder,
    });
  }

  alliances.sort(compareAlliances);

  const normalizedAlliances = alliances.map(({ hasOrder: _hasOrder, ...alliance }) => ({
    ...alliance,
    aliases: Array.from(new Set(alliance.aliases.map(normalizeLookupValue).filter(Boolean))),
  }));

  const allianceByKey = new Map();
  const aliasToKey = new Map();
  const orderByKey = new Map();
  const labelByKey = new Map();

  for (const alliance of normalizedAlliances) {
    allianceByKey.set(alliance.key, alliance);
    labelByKey.set(alliance.key, alliance.name);
    if (alliance.order !== undefined) orderByKey.set(alliance.key, alliance.order);

    const aliases = [alliance.key, alliance.name, ...alliance.aliases];
    for (const alias of aliases) {
      const normalizedAlias = normalizeLookupValue(alias);
      if (normalizedAlias && !aliasToKey.has(normalizedAlias)) {
        aliasToKey.set(normalizedAlias, alliance.key);
      }
    }
  }

  for (const [alias, key] of HISTORICAL_COMPATIBILITY_ALIASES) {
    const normalizedAlias = normalizeLookupValue(alias);
    if (normalizedAlias && allianceByKey.has(key) && !aliasToKey.has(normalizedAlias)) {
      aliasToKey.set(normalizedAlias, key);
    }
  }

  const registry = {
    alliances: normalizedAlliances,
    knownKeys: normalizedAlliances.map((alliance) => alliance.key),
    allianceByKey,
    aliasToKey,
    orderByKey,
    labelByKey,
  };

  if (!options.filePath) defaultRegistry = registry;
  return registry;
}

export function normalizeAllianceKey(value) {
  const lookupKey = normalizeLookupValue(value);
  if (!lookupKey) return '';
  return loadAllianceRegistry().aliasToKey.get(lookupKey) ?? '';
}

export function getAllianceLabel(value) {
  const key = normalizeAllianceKey(value);
  if (!key) return '';
  return loadAllianceRegistry().labelByKey.get(key) ?? '';
}

export function getAllianceMeta(value) {
  const key = normalizeAllianceKey(value);
  if (!key) return null;
  return loadAllianceRegistry().alliances.find((alliance) => alliance.key === key) ?? null;
}

export function sortAllianceKeys(keys) {
  const registry = loadAllianceRegistry();
  return [...keys].sort((left, right) => {
    const leftMeta = registry.allianceByKey.get(left);
    const rightMeta = registry.allianceByKey.get(right);
    if (!leftMeta && !rightMeta) return String(left).localeCompare(String(right), 'fr', { sensitivity: 'base' });
    if (!leftMeta) return 1;
    if (!rightMeta) return -1;
    return compareAlliances(leftMeta, rightMeta);
  });
}
