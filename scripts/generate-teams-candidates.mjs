#!/usr/bin/env node
// Candidate catalogue only: NEVER replace docs/data/teams.json automatically.
import fs from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GENERIC, takeSnapshot } from "./update-msf-release-history.mjs";

const MODE_NAMES = Object.freeze({
  AVA: "Guerre", WAR: "Guerre",
  RAID: "Raid",
  TOURNAMENT: "Epreuve", CRUCIBLE: "Epreuve",
  BATTLEWORLD: "Battleworld"
});
const SIDES = new Set(["offense", "defense"]);
const MIN_TEAM_SIZE = 3;
const MAX_TEAM_SIZE = 8;
const OUTPUT_PATH = "docs/data/teams-generated.json";
const AUDIT_PATH = "data/msf-teams/teams-audit.json";

function keyOfMembers(ids) {
  return [...new Set(ids)].sort().join("\u0000");
}

function normalizedMode(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function humanizeTrait(value) {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ").trim();
}

// Count independent characters, not raw actions: a character may repeat a mode
// dozens of times in the same kit. Only explicit mode fields are evidence.
export function characterModeSignals(character) {
  const modes = new Set();
  const sides = { Guerre: { offense: false, defense: false } };
  const walk = node => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const value of node) walk(value);
      return;
    }
    const mode = typeof node.mode === "string" ? MODE_NAMES[node.mode.toUpperCase()] : null;
    if (mode) {
      modes.add(mode);
      if (mode === "Guerre" && SIDES.has(node.combat_side)) {
        sides.Guerre[node.combat_side] = true;
      }
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === "object") walk(value);
    }
  };
  walk(character);
  return { modes, sides };
}

function sortedModes(a, b) {
  const order = ["Arène", "Battleworld", "Epreuve", "Guerre", "Raid"];
  return order.indexOf(a) - order.indexOf(b);
}

export function generateTeamCandidates(catalog, combat, referenceTeams = []) {
  if (!Array.isArray(referenceTeams)) throw new Error("Invalid reference teams");
  // Reuse the validated playable/traits join from the release monitor.
  const snapshot = takeSnapshot(catalog, combat);
  const source = combat.Data || combat;
  const playable = Object.entries(snapshot).filter(([, item]) => item.playable);
  if (playable.length < 100) throw new Error("Incomplete playable catalogue");

  const traits = new Map();
  const signals = new Map();
  for (const [id, entry] of playable) {
    signals.set(id, characterModeSignals(source[id]));
    for (const trait of entry.traits) {
      if (GENERIC.has(trait)) continue;
      if (!traits.has(trait)) traits.set(trait, new Set());
      traits.get(trait).add(id);
    }
  }

  const groups = [];
  const candidates = [];
  for (const [trait, ids] of [...traits.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (ids.size < MIN_TEAM_SIZE || ids.size > MAX_TEAM_SIZE) continue;
    const characters = [...ids].sort();
    const counts = { Raid: 0, Guerre: 0, Battleworld: 0, Epreuve: 0 };
    const sideCounts = { offense: 0, defense: 0 };
    for (const id of characters) {
      const signal = signals.get(id);
      for (const mode of signal.modes) counts[mode] += 1;
      if (signal.modes.has("Guerre")) {
        for (const side of SIDES) if (signal.sides.Guerre[side]) sideCounts[side] += 1;
      }
    }
    const threshold = Math.max(2, Math.ceil(characters.length / 2));
    const strongModes = Object.keys(counts).filter(mode => counts[mode] >= threshold).sort(sortedModes);
    const group = {
      trait, characters, modeSignals: counts,
      warSideSignals: sideCounts, threshold,
      suggestedModes: strongModes,
      reviewReason: strongModes.length ? (strongModes.length > 1 ? "multiple_modes" : null) : "insufficient_mode_evidence"
    };
    groups.push(group);
    for (const mode of strongModes) {
      candidates.push({ team: humanizeTrait(trait), mode, characters });
    }
  }
  candidates.sort((a, b) =>
    sortedModes(a.mode, b.mode) ||
    a.team.localeCompare(b.team, "fr") ||
    keyOfMembers(a.characters).localeCompare(keyOfMembers(b.characters))
  );
  // Do not emit duplicate compositions for a given mode under multiple traits.
  const seen = new Set();
  const generated = candidates.filter(row => {
    const key = normalizedMode(row.mode) + "|" + keyOfMembers(row.characters);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Reference data are used ONLY for comparison, never for inferred membership,
  // the name of a team, or its mode.
  const emittedKeys = new Set(generated.map(row =>
    normalizedMode(row.mode) + "|" + keyOfMembers(row.characters)
  ));
  const familyKeys = new Set(groups.map(group => keyOfMembers(group.characters)));
  const referenceAudit = referenceTeams.map(row => {
    if (!row || typeof row.team !== "string" || typeof row.mode !== "string" ||
        !Array.isArray(row.characters)) throw new Error("Invalid reference team");
    const members = keyOfMembers(row.characters);
    const exactComposition = familyKeys.has(members);
    const exactGenerated = emittedKeys.has(normalizedMode(row.mode) + "|" + members);
    const closest = groups.map(group => {
      const other = new Set(group.characters);
      const common = row.characters.filter(id => other.has(id)).length;
      return { trait: group.trait, overlap: common, traitSize: group.characters.length };
    }).filter(item => item.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap || a.trait.localeCompare(b.trait))[0] || null;
    return {
      team: row.team, mode: row.mode,
      characters: row.characters,
      exactComposition, exactGenerated, closest
    };
  });
  const summary = {
    playableCharacters: playable.length,
    candidateGroups: groups.length,
    generatedRows: generated.length,
    unresolvedGroups: groups.filter(group => !group.suggestedModes.length).length,
    referenceRows: referenceAudit.length,
    referenceExactCompositions: referenceAudit.filter(row => row.exactComposition).length,
    referenceExactGenerated: referenceAudit.filter(row => row.exactGenerated).length
  };
  return {
    teams: generated,
    audit: {
      schemaVersion: 1,
      note: "Diagnostic only. Game-mode signals indicate conditional bonuses, not guaranteed optimal team use. No automatic replacement of teams.json.",
      summary,
      groups,
      referenceMissing: referenceAudit.filter(row => !row.exactGenerated),
      referenceMatched: referenceAudit.filter(row => row.exactGenerated).map(({ team, mode }) => ({ team, mode }))
    }
  };
}

export async function run() {
  const read = async path => JSON.parse(await fs.readFile(path, "utf8"));
  const [catalog, combat, reference] = await Promise.all([
    read("docs/data/msf-characters.json"),
    read("data/msf-capabilities/raw/characters.json"),
    read("docs/data/teams.json")
  ]);
  const { teams, audit } = generateTeamCandidates(catalog, combat, reference);
  await fs.mkdir("docs/data", { recursive: true });
  await fs.mkdir("data/msf-teams", { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(teams, null, 2) + "\n");
  await fs.writeFile(AUDIT_PATH, JSON.stringify(audit, null, 2) + "\n");
  console.log(JSON.stringify(audit.summary, null, 2));
  console.log("Candidates: " + OUTPUT_PATH + " | audit: " + AUDIT_PATH);
  return audit.summary;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch(error => { console.error(error); process.exitCode = 1; });
}
