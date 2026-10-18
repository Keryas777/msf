#!/usr/bin/env node
// Forward-only, evidence-aware release monitor. Never reconstruct historical dates.
import fs from "node:fs/promises";
import { createHash } from "node:crypto";

export const STATE_PATH = "data/msf-release-monitor/state.json";
export const HISTORY_PATH = "docs/data/msf-release-history.json";
const CATALOG_PATH = "docs/data/msf-characters.json";
const COMBAT_PATH = "data/msf-capabilities/raw/characters.json";
const CORE = /^(basic|special|ultimate|passive)(?:_empower)?$/;
const BALANCE = new Set(["global_stats", "passive_stats", "dynamic_stats", "stat_immunity", "passive_power_mul"]);
const GENERIC = new Set([
  "Hero", "Villain", "City", "Global", "Cosmic", "Bio", "Skill", "Tech", "Mystic",
  "Mutant", "Brawler", "Blaster", "Controller", "Protector", "Support", "Minion",
  "Legendary", "Mythic", "Epic", "Military", "Summon", "Summoned"
]);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  }
  return value;
}

function fingerprint(value) {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

export function takeSnapshot(catalog, combat) {
  if (!Array.isArray(catalog) || !combat || typeof combat !== "object") {
    throw new Error("Missing character catalog or combat data");
  }
  const data = combat.Data || combat;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid combat Data");
  const characters = {};
  const seen = new Set();
  for (const entry of catalog) {
    const id = entry?.id;
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]+$/.test(id) || seen.has(id)) {
      throw new Error("Invalid or duplicate catalog character ID");
    }
    seen.add(id);
    const raw = data[id];
    // Never turn an API-only character without corresponding combat data into a release.
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const traits = [...new Set((Array.isArray(raw.traits) ? raw.traits : [])
      .filter(x => typeof x === "string" && x.length > 0))].sort();
    const fingerprints = {};
    for (const [key, value] of Object.entries(raw)) {
      if (CORE.test(key) || BALANCE.has(key)) fingerprints[key] = fingerprint(value);
    }
    characters[id] = { playable: entry.player_Character === true, traits, fingerprints };
  }
  if (Object.keys(characters).length < 100) throw new Error("Incomplete combat/catalog join: refusing publication");
  return characters;
}

function existingReleases(history) {
  const ids = new Set();
  for (const year of Object.values(history.years || {})) {
    const launch = year.globalLaunchRoster;
    for (const id of launch?.namedCharacterIds || []) ids.add(id);
    for (const list of Object.values(launch?.minionsByFaction || {})) {
      for (const id of list) ids.add(id);
    }
    for (const item of year.individualReleases || []) ids.add(item.characterId);
    for (const team of year.teamEvents || []) {
      for (const id of team.newCharacterIds || []) ids.add(id);
    }
  }
  return ids;
}

function releaseDetail(id, date) {
  return {
    characterId: id, month: date.slice(0, 7),
    observedAt: date, releaseMethod: "automated_catalog_observation",
    confidence: "low", dateConfidence: "unverified",
    notes: [
      "Premiere observation automatique d'un personnage marque player_Character=true.",
      "La date observee n'est PAS une preuve de premiere disponibilite au recrutement."
    ]
  };
}

function reworkDetail(id, date, changed) {
  return {
    characterId: id, month: date.slice(0, 7), observedAt: date,
    changedFields: changed, confidence: "automated_observation",
    notes: ["Changement de kit/statistiques detecte dans combat_data; date de mise en ligne reelle non prouvee."]
  };
}

function label(trait) {
  return trait.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ").trim();
}

function upsertYear(history, year) {
  if (!history.years[year]) {
    history.years[year] = {
      status: "partial", individualReleases: [], individualReworks: [], teamEvents: [],
      validation: { individualReleaseCount: 0, teamEventNewCharacterCount: 0, distinctPlayableReleaseCount: 0, distinctReworkedCharacterCount: 0, duplicatesAcrossReleaseBuckets: [] }
    };
  }
  const record = history.years[year];
  record.individualReleases ||= [];
  record.teamEvents ||= [];
  record.validation ||= {};
  return record;
}

function updateCounts(year) {
  const individual = (year.individualReleases || []).map(x => x.characterId);
  const inTeams = (year.teamEvents || []).flatMap(x => x.newCharacterIds || []);
  const reworked = [
    ...(year.individualReworks || []).map(x => x.characterId),
    ...(year.teamEvents || []).flatMap(x => x.reworkedCharacterIds || [])
  ];
  const all = [...individual, ...inTeams];
  const counts = new Map();
  for (const id of all) counts.set(id, (counts.get(id) || 0) + 1);
  const duplicates = [...counts].filter(([, num]) => num > 1).map(([id]) => id).sort();
  if (duplicates.length) throw new Error("Duplicate release buckets: " + duplicates.join(", "));
  Object.assign(year.validation, {
    individualReleaseCount: individual.length,
    teamEventNewCharacterCount: inTeams.length,
    distinctPlayableReleaseCount: counts.size,
    distinctReworkedCharacterCount: new Set(reworked).size,
    duplicatesAcrossReleaseBuckets: []
  });
}

export function advance(history, previousState, current, timestamp) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(timestamp) ||
      Number.isNaN(Date.parse(timestamp))) throw new Error("Invalid UTC timestamp");
  if (!history?.years || typeof history.years !== "object") throw new Error("Invalid release history");
  const date = timestamp.slice(0, 10);
  if (!previousState) {
    // First run only anchors observation: NEVER import the current roster as fresh releases.
    return {
      history, state: { schemaVersion: 1, trackingStartedAt: timestamp, characters: current },
      summary: { baseline: true, releases: [], reworks: [], teams: [], candidates: [] }
    };
  }
  if (previousState.schemaVersion !== 1 || !previousState.characters ||
      Date.parse(timestamp) < Date.parse(previousState.trackingStartedAt)) {
    throw new Error("Invalid forward-only monitor state");
  }
  const old = previousState.characters;
  const oldKeys = Object.keys(old);
  if (oldKeys.length > 100 && Object.keys(current).length < oldKeys.length * 0.85) {
    throw new Error("Catalog unexpectedly shrank: refusing update");
  }
  const tracked = { ...old, ...current }; // temporary omissions must never reset an ID.
  const releases = [];
  const reworks = [];
  const candidates = [];
  const releasedBefore = existingReleases(history);
  for (const [id, now] of Object.entries(current)) {
    const before = old[id];
    if (now.playable && (!before || !before.playable) && !releasedBefore.has(id)) releases.push(id);
    if (!now.playable || !before?.playable || !now.fingerprints || !before.fingerprints) continue;
    const keys = new Set([...Object.keys(now.fingerprints), ...Object.keys(before.fingerprints)]);
    const changed = [...keys].filter(k => now.fingerprints[k] !== before.fingerprints[k]).sort();
    if (!changed.length) continue;
    const core = changed.filter(k => CORE.test(k)).length;
    const balance = changed.filter(k => BALANCE.has(k)).length;
    const traitsChanged = JSON.stringify(now.traits) !== JSON.stringify(before.traits);
    if (core >= 2 || (core >= 1 && (balance >= 1 || traitsChanged)) || balance >= 2) {
      reworks.push({ id, changed });
    } else {
      candidates.push({ characterId: id, observedAt: timestamp, changedFields: changed, status: "kit_change_not_classified_as_rework" });
    }
  }
  if (releases.length > 25 || reworks.length > 45) throw new Error("Unexpected mass change: refusing update");
  const active = Object.entries(current).filter(([, v]) => v.playable);
  const groups = new Map();
  for (const [id, char] of active) {
    for (const trait of char.traits) {
      if (GENERIC.has(trait)) continue;
      if (!groups.has(trait)) groups.set(trait, []);
      groups.get(trait).push(id);
    }
  }
  const selectedTeams = [];
  const consumedNew = new Set();
  const consumedReworks = new Set();
  const releaseSet = new Set(releases);
  const reworkIds = new Set(reworks.map(x => x.id));
  for (const [trait, members] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    if (members.length < 3 || members.length > 8) continue;
    const priorMembers = Object.entries(old)
      .filter(([, c]) => c.playable && c.traits.includes(trait)).map(([id]) => id);
    const traitAdded = members.filter(id => !old[id]?.traits.includes(trait));
    const memberReworks = members.filter(id => reworkIds.has(id));
    const newMembers = members.filter(id => releaseSet.has(id));
    // One new recruit joining an old faction is not a new team.
    const newFormation = priorMembers.length < 3 && traitAdded.length >= 2;
    const existingTeamOverhaul = memberReworks.length >= 3;
    if (!newFormation && !existingTeamOverhaul) continue;
    if (newMembers.some(id => consumedNew.has(id)) || memberReworks.some(id => consumedReworks.has(id))) continue;
    selectedTeams.push({ trait, members: members.sort(), newMembers, memberReworks });
    newMembers.forEach(id => consumedNew.add(id));
    memberReworks.forEach(id => consumedReworks.add(id));
  }
  const changed = releases.length || reworks.length || candidates.length || selectedTeams.length;
  const nextState = { ...previousState, characters: tracked };
  if (!changed) return { history, state: nextState, summary: { baseline: false, releases, reworks, teams: [], candidates } };
  // Only the year of this detection may be extended. Earlier audited years remain unchanged.
  const yearKey = date.slice(0, 4);
  if (+yearKey < +previousState.trackingStartedAt.slice(0, 4)) throw new Error("Cannot write historical year");
  const year = upsertYear(history, yearKey);
  year.individualReworks ||= [];
  const reworkById = new Map(reworks.map(x => [x.id, x]));
  for (const { trait, members, newMembers, memberReworks } of selectedTeams) {
    const id = "auto-" + trait.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + date.replaceAll("-", "");
    year.teamEvents.push({
      month: date.slice(0, 7), teamId: id, label: label(trait) + " (detection automatique)",
      kind: "team", formationStatus: "observed", teamSize: members.length,
      members, core: [], pool: [],
      newCharacterIds: newMembers, existingCharacterIds: members.filter(x => !newMembers.includes(x)),
      reworkedCharacterIds: memberReworks, announcedNext: [],
      characterReleases: newMembers.map(x => releaseDetail(x, date)),
      reworks: memberReworks.map(x => reworkDetail(x, date, reworkById.get(x).changed)),
      observedAt: timestamp, confidence: "automated_observation", sourceTrait: trait,
      notes: ["Composition deduite des traits du jeu, non necessairement une annonce officielle.", "La date est celle de l'observation, pas une preuve de sortie effective."]
    });
  }
  for (const id of releases) {
    if (consumedNew.has(id)) continue;
    year.individualReleases.push(releaseDetail(id, date));
  }
  for (const item of reworks) {
    if (consumedReworks.has(item.id)) continue;
    year.individualReworks.push(reworkDetail(item.id, date, item.changed));
  }
  // Keep unaudited detections separate from historical auditing metadata.
  year.automatedMonitoring = {
    firstTrackedAt: previousState.trackingStartedAt, lastChangeObservedAt: timestamp,
    dateSemantics: "first_seen_in_sources_not_first_playable_date"
  };
  if (candidates.length) {
    const prior = previousState.unclassifiedChanges || [];
    nextState.unclassifiedChanges = [...prior, ...candidates].slice(-200);
  }
  updateCounts(year);
  return {
    history, state: nextState,
    summary: { baseline: false, releases, reworks: reworks.map(x => x.id), teams: selectedTeams.map(x => x.trait), candidates }
  };
}

export async function run(now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z")) {
  const read = async path => JSON.parse(await fs.readFile(path, "utf8"));
  const [catalog, combat, history] = await Promise.all([
    read(CATALOG_PATH), read(COMBAT_PATH), read(HISTORY_PATH)
  ]);
  let previous = null;
  try { previous = await read(STATE_PATH); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const current = takeSnapshot(catalog, combat);
  const originalHistory = JSON.stringify(history);
  const originalState = previous ? JSON.stringify(previous) : null;
  const result = advance(history, previous, current, now);
  const stateData = JSON.stringify(result.state, null, 2) + "\n";
  const historyData = JSON.stringify(result.history, null, 2) + "\n";
  if (!previous || originalState !== JSON.stringify(result.state)) {
    await fs.mkdir("data/msf-release-monitor", { recursive: true });
    await fs.writeFile(STATE_PATH, stateData);
  }
  if (originalHistory !== JSON.stringify(result.history)) await fs.writeFile(HISTORY_PATH, historyData);
  console.log(JSON.stringify(result.summary));
  return result.summary;
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  run().catch(error => { console.error(error); process.exitCode = 1; });
}
