import test from "node:test";
import assert from "node:assert/strict";
import { characterModeSignals, generateTeamCandidates } from "../scripts/generate-teams-candidates.mjs";

const ids = (...indexes) => indexes.map(index => "Hero" + index);
function fixture() {
  const catalog = [];
  const combat = { Data: {} };
  for (let n = 0; n < 105; n++) {
    const id = "Hero" + n;
    catalog.push({ id, player_Character: n !== 104 });
    combat.Data[id] = {
      traits: ["Hero", "Global", "Skill"],
      basic: { actions: [{ action: "attack" }] },
      special: { actions: [] },
      ultimate: { actions: [] },
      passive: { actions: [] }
    };
  }
  const trait = (name, indexes) => {
    for (const n of indexes) combat.Data["Hero" + n].traits.push(name);
  };
  const mode = (n, value, side) => {
    const condition = { mode: value };
    if (side) condition.combat_side = side;
    combat.Data["Hero" + n].passive.actions.push({ action: "stat_modifier", only_if: condition });
  };
  trait("TeamAlpha", [0, 1, 2, 3, 4]);
  [0, 1, 2].forEach(n => mode(n, "RAID"));
  mode(3, "AVA");
  trait("TeamBeta", [5, 6, 7, 8, 9]);
  [5, 6, 7].forEach(n => mode(n, "AVA", "offense"));
  [8, 9].forEach(n => mode(n, "AVA", "defense"));
  trait("TeamPool", [10, 11, 12, 13, 14, 15]);
  [10, 11].forEach(n => mode(n, "BATTLEWORLD"));
  trait("TeamMulti", [20, 21, 22, 23, 24]);
  [20, 21, 22, 23, 24].forEach(n => { mode(n, "RAID"); mode(n, "BATTLEWORLD"); });
  trait("Vampire", [60, 61, 62, 63]);
  trait("NotPlayable", [100, 101, 104]);
  trait("TooLarge", [30, 31, 32, 33, 34, 35, 36, 37, 38]);
  return { catalog, combat };
}
const reference = [
  { team: "Équipe A", mode: "Raid", characters: ids(0, 1, 2, 3, 4) },
  { team: "Équipe B", mode: "Guerre", characters: ids(5, 6, 7, 8, 9) },
  { team: "Pool réduit", mode: "Battleworld", characters: ids(10, 11, 12, 13, 14) },
  { team: "Multi B", mode: "Battleworld", characters: ids(20, 21, 22, 23, 24) },
  { team: "Multi R", mode: "Raid", characters: ids(20, 21, 22, 23, 24) }
];

test("only explicit mode conditions are evidence; raw combat-side on its own is insufficient", () => {
  const signals = characterModeSignals({
    special: { actions: [{ only_if: { or: [
      { mode: "RAID" },
      { mode: "AVA", combat_side: "offense" }
    ] } }, { only_if: { combat_side: "defense" } }] }
  });
  assert.deepEqual([...signals.modes].sort(), ["Guerre", "Raid"]);
  assert.deepEqual(signals.sides.Guerre, { offense: true, defense: false });
});

test("uses playable character traits, emits only sufficiently-supported modes, and preserves up to eight members", () => {
  const { catalog, combat } = fixture();
  const { teams, audit } = generateTeamCandidates(catalog, combat, reference);
  assert.deepEqual(audit.summary, {
    playableCharacters: 104, candidateGroups: 5, generatedRows: 4,
    unresolvedGroups: 2, referenceRows: 5,
    referenceExactCompositions: 4, referenceExactGenerated: 4
  });
  assert.deepEqual(teams.find(row => row.team === "Team Alpha"), {
    team: "Team Alpha", mode: "Raid", characters: ids(0, 1, 2, 3, 4)
  });
  assert.equal(teams.filter(row => row.team === "Team Multi").length, 2);
  assert.equal(teams.some(row => row.team === "Team Pool"), false);
  assert.equal(teams.some(row => row.team === "Not Playable"), false);
  assert.equal(teams.some(row => row.team === "Too Large"), false);
  const pool = audit.groups.find(group => group.trait === "TeamPool");
  assert.equal(pool.characters.length, 6);
  assert.equal(pool.reviewReason, "insufficient_mode_evidence");
  assert.equal(audit.referenceMissing.length, 1);
  assert.equal(audit.referenceMissing[0].team, "Pool réduit");
  assert.deepEqual(audit.groups.find(group => group.trait === "TeamBeta").warSideSignals, {
    offense: 3, defense: 2
  });
});

test("reference names and modes never affect the generated catalogue; generation is stable", () => {
  const { catalog, combat } = fixture();
  const a = generateTeamCandidates(catalog, combat, reference);
  const changed = reference.map(row => ({ ...row, team: "Révisé", mode: "Divers" }));
  const b = generateTeamCandidates(catalog, combat, changed);
  assert.deepEqual(a.teams, b.teams);
  assert.deepEqual(a.teams, generateTeamCandidates(catalog, combat, reference).teams);
  assert.ok(b.audit.referenceMissing.length > a.audit.referenceMissing.length);
});

test("identical formations do not generate duplicate rows under two overlapping traits", () => {
  const { catalog, combat } = fixture();
  for (let n = 0; n < 5; n++) combat.Data["Hero" + n].traits.push("TeamAlias");
  const { teams, audit } = generateTeamCandidates(catalog, combat, []);
  assert.equal(teams.filter(row => row.mode === "Raid" &&
    row.characters.join("|") === ids(0, 1, 2, 3, 4).join("|")).length, 1);
  assert.equal(audit.groups.filter(group => group.trait === "TeamAlpha" || group.trait === "TeamAlias").length, 2);
});

test("cannot silently publish an incomplete or invalid source", () => {
  const { catalog, combat } = fixture();
  assert.throws(() => generateTeamCandidates(catalog.slice(0, 30), combat, reference), /Incomplete/);
  catalog[0].id = "../../bad";
  assert.throws(() => generateTeamCandidates(catalog, combat, reference), /Invalid/);
  assert.throws(() => generateTeamCandidates([], combat, null), /Invalid reference teams/);
});
