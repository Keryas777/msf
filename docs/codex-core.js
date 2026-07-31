const SEARCH_GROUP_ORDER = ["characters", "mechanics", "abilities", "related"];

export const SEARCH_GROUP_LABELS = Object.freeze({
  characters: "Personnages",
  mechanics: "Mécaniques",
  abilities: "Capacités",
  related: "Invocations et entités liées",
});

export const PROOF_ORDER = Object.freeze([
  "normalized",
  "preserved_uninterpreted",
  "official_text_only",
]);

export const ABILITY_TYPE_ORDER = Object.freeze({
  basic: 10,
  basic_empower: 11,
  special: 20,
  special_empower: 21,
  ultimate: 30,
  ultimate_empower: 31,
  passive: 40,
  passive_empower: 41,
});

export const FILTER_DEFAULTS = Object.freeze({
  playable: true,
  type: "all",
  mode: "all",
  chance: "all",
  side: "all",
  sort: "relevance",
});

const ALLOWED_VIEWS = new Set([
  "home",
  "characters",
  "mechanics",
  "character",
  "entity",
  "ability",
  "effect",
  "mechanic",
  "operation",
  "search",
]);

const ALLOWED_TYPES = new Set(["all", "basic", "special", "ultimate", "passive", "empowered"]);
const ALLOWED_MODES = new Set(["all", "war", "raid", "crucible", "battleworld"]);
const ALLOWED_CHANCES = new Set(["all", "100", "less"]);
const ALLOWED_SIDES = new Set(["all", "attack", "defense"]);
const ALLOWED_SORTS = new Set(["relevance", "az"]);

const MODE_LABELS = Object.freeze({
  war: "Guerre",
  raid: "Raid",
  crucible: "Épreuve",
  battleworld: "Battleworld",
});

const SIDE_LABELS = Object.freeze({
  attack: "Attaque",
  defense: "Défense",
});

const frenchCollator = new Intl.Collator("fr", {
  sensitivity: "base",
  ignorePunctuation: true,
  numeric: true,
});

function foldCharacters(value, compact = false) {
  const source = String(value ?? "");
  const output = [];
  const map = [];
  let previousWasSpace = true;

  Array.from(source).forEach((character, sourceIndex) => {
    const folded = character
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("fr-FR");

    Array.from(folded).forEach((unit) => {
      if (/[\p{L}\p{N}]/u.test(unit)) {
        output.push(unit);
        map.push(sourceIndex);
        previousWasSpace = false;
        return;
      }

      if (!compact && !previousWasSpace) {
        output.push(" ");
        map.push(sourceIndex);
        previousWasSpace = true;
      }
    });
  });

  while (output[output.length - 1] === " ") {
    output.pop();
    map.pop();
  }

  return { value: output.join(""), map };
}

export function normalizeSearch(value) {
  return foldCharacters(value).value;
}

export function compactSearch(value) {
  return foldCharacters(value, true).value;
}

function searchableValue(value) {
  return {
    normal: normalizeSearch(value),
    compact: compactSearch(value),
  };
}

function valuesEqual(left, right) {
  return Boolean(right.normal) && (left.normal === right.normal || left.compact === right.compact);
}

function startsWithValue(left, right) {
  return Boolean(right.normal) &&
    (left.normal.startsWith(right.normal) || left.compact.startsWith(right.compact));
}

function wordStartsWithValue(left, right) {
  if (!right.normal) return false;
  return left.normal.split(" ").some((word) => word.startsWith(right.normal));
}

function containsValue(left, right) {
  return Boolean(right.normal) &&
    (left.normal.includes(right.normal) || left.compact.includes(right.compact));
}

function stringTerms(value) {
  if (!Array.isArray(value)) return [];
  return value.map((term) => String(term ?? "").trim()).filter(Boolean);
}

export function prepareSearchRecords(records) {
  return (Array.isArray(records) ? records : []).map((record, sourceIndex) => ({
    ...record,
    __sourceIndex: sourceIndex,
    __search: {
      label: searchableValue(record.label),
      aliases: stringTerms(record.aliases).map((original) => ({
        original,
        value: searchableValue(original),
      })),
      sourceName: searchableValue(record.sourceName),
      sourceTerms: stringTerms(record.sourceTerms).map((original) => ({
        original,
        value: searchableValue(original),
      })),
      parent: searchableValue(record.parentLabel),
    },
  }));
}

function matchPreparedRecord(record, query) {
  const search = record.__search || prepareSearchRecords([record])[0].__search;

  if (valuesEqual(search.label, query)) {
    return { score: 1000, kind: "name", term: record.label };
  }

  const exactAlias = search.aliases.find((alias) => valuesEqual(alias.value, query));
  if (exactAlias) {
    return { score: 900, kind: "alias", term: exactAlias.original };
  }

  if (valuesEqual(search.sourceName, query)) {
    return { score: 800, kind: "sourceName", term: record.sourceName };
  }

  const exactSourceTerm = search.sourceTerms.find((term) => valuesEqual(term.value, query));
  if (exactSourceTerm) {
    return { score: 790, kind: "sourceTerm", term: exactSourceTerm.original };
  }

  if (startsWithValue(search.label, query)) {
    return { score: 700, kind: "name", term: record.label };
  }

  if (wordStartsWithValue(search.label, query)) {
    return { score: 600, kind: "name", term: record.label };
  }

  if (containsValue(search.label, query)) {
    return { score: 500, kind: "name", term: record.label };
  }

  const partialAlias = search.aliases.find(
    (alias) => startsWithValue(alias.value, query) || containsValue(alias.value, query)
  );
  if (partialAlias) {
    return { score: 490, kind: "alias", term: partialAlias.original };
  }

  if (startsWithValue(search.sourceName, query) || containsValue(search.sourceName, query)) {
    return { score: 480, kind: "sourceName", term: record.sourceName };
  }

  const partialSourceTerm = search.sourceTerms.find(
    (term) => startsWithValue(term.value, query) || containsValue(term.value, query)
  );
  if (partialSourceTerm) {
    return { score: 470, kind: "sourceTerm", term: partialSourceTerm.original };
  }

  if (
    record.parentLabel &&
    (valuesEqual(search.parent, query) ||
      startsWithValue(search.parent, query) ||
      wordStartsWithValue(search.parent, query) ||
      containsValue(search.parent, query))
  ) {
    return { score: 400, kind: "parent", term: record.parentLabel };
  }

  return null;
}

export function rankSearchRecords(records, rawQuery, limit = Infinity) {
  const query = searchableValue(rawQuery);
  if (query.compact.length < 2) return [];

  const prepared = records?.[0]?.__search ? records : prepareSearchRecords(records);
  const ranked = [];

  prepared.forEach((record) => {
    const match = matchPreparedRecord(record, query);
    if (!match) return;
    ranked.push({ ...record, match, searchScore: match.score });
  });

  ranked.sort((left, right) => {
    if (right.searchScore !== left.searchScore) return right.searchScore - left.searchScore;
    const leftGroup = SEARCH_GROUP_ORDER.indexOf(left.resultGroup);
    const rightGroup = SEARCH_GROUP_ORDER.indexOf(right.resultGroup);
    if (leftGroup !== rightGroup) return leftGroup - rightGroup;
    const parent = frenchCollator.compare(left.parentLabel || "", right.parentLabel || "");
    if (parent) return parent;
    const label = frenchCollator.compare(left.label || "", right.label || "");
    if (label) return label;
    return left.__sourceIndex - right.__sourceIndex;
  });

  return ranked.slice(0, Math.max(0, limit));
}

export function groupSearchResults(records) {
  const groups = [];
  SEARCH_GROUP_ORDER.forEach((id) => {
    const results = (records || []).filter((record) => record.resultGroup === id);
    if (results.length) groups.push({ id, label: SEARCH_GROUP_LABELS[id], results });
  });
  return groups;
}

export function getSearchMatchMessage(match) {
  if (!match?.term) return "";
  if (match.kind === "alias") return `Trouvé via l’alias “${match.term}”`;
  if (match.kind === "sourceName") return `Trouvé via le nom source “${match.term}”`;
  if (match.kind === "sourceTerm") return `Trouvé via le terme source “${match.term}”`;
  if (match.kind === "parent") return `Capacité de ${match.term}`;
  return "";
}

export function highlightSegments(label, rawQuery) {
  const source = String(label ?? "");
  if (!source || compactSearch(rawQuery).length < 2) return [{ text: source, match: false }];

  for (const compact of [false, true]) {
    const sourceFolded = foldCharacters(source, compact);
    const query = foldCharacters(rawQuery, compact).value;
    const start = sourceFolded.value.indexOf(query);
    if (start < 0 || !query) continue;
    const mappedStart = sourceFolded.map[start];
    const mappedEnd = sourceFolded.map[start + query.length - 1] + 1;
    return [
      { text: source.slice(0, mappedStart), match: false },
      { text: source.slice(mappedStart, mappedEnd), match: true },
      { text: source.slice(mappedEnd), match: false },
    ].filter((part) => part.text);
  }

  return [{ text: source, match: false }];
}

function safeChoice(value, allowed, fallback) {
  return allowed.has(value) ? value : fallback;
}

export function parseRoute(search = "") {
  const params = search instanceof URLSearchParams
    ? new URLSearchParams(search)
    : new URLSearchParams(String(search).replace(/^\?/, ""));
  const requestedView = params.get("view") || "home";
  const invalid = !ALLOWED_VIEWS.has(requestedView);

  return {
    view: invalid ? "home" : requestedView,
    requestedView,
    invalid,
    id: params.get("id") || "",
    operation: params.get("operation") || "",
    q: params.get("q") || "",
    filters: {
      playable: params.get("playable") !== "0",
      type: safeChoice(params.get("type") || "all", ALLOWED_TYPES, "all"),
      mode: safeChoice(params.get("mode") || "all", ALLOWED_MODES, "all"),
      chance: safeChoice(params.get("chance") || "all", ALLOWED_CHANCES, "all"),
      side: safeChoice(params.get("side") || "all", ALLOWED_SIDES, "all"),
      sort: safeChoice(params.get("sort") || "relevance", ALLOWED_SORTS, "relevance"),
    },
  };
}

export function buildCodexHref(route = {}, base = "./codex.html") {
  const params = new URLSearchParams();
  const view = ALLOWED_VIEWS.has(route.view) ? route.view : "home";
  if (view !== "home") params.set("view", view);
  if (route.id) params.set("id", route.id);
  if (route.operation) params.set("operation", route.operation);
  if (route.q) params.set("q", route.q);

  const filters = route.filters || {};
  if (filters.playable === false) params.set("playable", "0");
  if (filters.type && filters.type !== FILTER_DEFAULTS.type) params.set("type", filters.type);
  if (filters.mode && filters.mode !== FILTER_DEFAULTS.mode) params.set("mode", filters.mode);
  if (filters.chance && filters.chance !== FILTER_DEFAULTS.chance) params.set("chance", filters.chance);
  if (filters.side && filters.side !== FILTER_DEFAULTS.side) params.set("side", filters.side);
  if (filters.sort && filters.sort !== FILTER_DEFAULTS.sort) params.set("sort", filters.sort);

  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export function recordHref(record) {
  return buildCodexHref({ view: record?.view || "home", id: record?.id || "" });
}

export function routeBucket(id) {
  const match = String(id ?? "").match(/^[a-z]+_([0-9a-f])/i);
  return match ? match[1].toLowerCase() : "";
}

export function baseAbilityType(type) {
  return String(type || "").replace(/_empower$/, "");
}

export function getModeLabel(mode) {
  return MODE_LABELS[mode] || "";
}

export function getSideLabel(side) {
  return SIDE_LABELS[side] || "";
}

function normalizedListIncludes(values, expected) {
  const normalizedExpected = normalizeSearch(expected);
  return (values || []).some((value) => normalizeSearch(value) === normalizedExpected);
}

export function filterMechanicResults(records, rawFilters = FILTER_DEFAULTS) {
  const filters = { ...FILTER_DEFAULTS, ...(rawFilters || {}) };
  const modeLabel = getModeLabel(filters.mode);
  const sideLabel = getSideLabel(filters.side);

  return (Array.isArray(records) ? records : []).filter((record) => {
    if (filters.playable && !record.playable) return false;

    if (filters.type === "empowered" && !record.isEmpowered) return false;
    if (
      filters.type !== "all" &&
      filters.type !== "empowered" &&
      baseAbilityType(record.abilityType) !== filters.type
    ) {
      return false;
    }

    if (filters.mode !== "all") {
      const explicitMode = normalizedListIncludes(record.modes, modeLabel);
      if (!explicitMode && !record.hasUnrestrictedMode) return false;
    }

    if (filters.chance !== "all" && record.chanceCategory !== filters.chance) return false;

    if (filters.side !== "all") {
      const explicitSide = normalizedListIncludes(record.sides, sideLabel);
      const unrestrictedSide = !record.sides?.length;
      if (!explicitSide && !unrestrictedSide) return false;
    }

    return true;
  });
}

function chanceSortValue(category) {
  if (category === "100") return 0;
  if (category === "less") return 1;
  return 2;
}

function alphabeticResultSort(left, right) {
  const character = frenchCollator.compare(left.characterName || "", right.characterName || "");
  if (character) return character;
  const leftType = left.abilityTypeOrder ?? ABILITY_TYPE_ORDER[left.abilityType] ?? 99;
  const rightType = right.abilityTypeOrder ?? ABILITY_TYPE_ORDER[right.abilityType] ?? 99;
  if (leftType !== rightType) return leftType - rightType;
  return frenchCollator.compare(left.abilityName || "", right.abilityName || "");
}

export function sortMechanicResults(records, rawFilters = FILTER_DEFAULTS) {
  const filters = { ...FILTER_DEFAULTS, ...(rawFilters || {}) };
  const modeLabel = getModeLabel(filters.mode);
  const result = [...(Array.isArray(records) ? records : [])];

  result.sort((left, right) => {
    if (filters.sort === "az") return alphabeticResultSort(left, right);

    if (filters.mode === "all") {
      const leftMode = left.hasUnrestrictedMode ? 0 : 1;
      const rightMode = right.hasUnrestrictedMode ? 0 : 1;
      if (leftMode !== rightMode) return leftMode - rightMode;
    } else {
      const leftMode = normalizedListIncludes(left.modes, modeLabel)
        ? 0
        : left.hasUnrestrictedMode
          ? 1
          : 2;
      const rightMode = normalizedListIncludes(right.modes, modeLabel)
        ? 0
        : right.hasUnrestrictedMode
          ? 1
          : 2;
      if (leftMode !== rightMode) return leftMode - rightMode;
    }

    const chance = chanceSortValue(left.chanceCategory) - chanceSortValue(right.chanceCategory);
    if (chance) return chance;
    return alphabeticResultSort(left, right);
  });

  return result;
}

export function uniqueEvidence(values) {
  const set = new Set(Array.isArray(values) ? values : [values]);
  return PROOF_ORDER.filter((evidence) => set.has(evidence));
}

export function mechanicInitials(label) {
  const words = normalizeSearch(label).split(" ").filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toLocaleUpperCase("fr-FR");
  return `${words[0][0]}${words[1][0]}`.toLocaleUpperCase("fr-FR");
}

export function formatFrenchDate(isoDate) {
  const date = new Date(isoDate);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}
