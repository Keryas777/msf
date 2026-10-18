import test from "node:test";
import assert from "node:assert/strict";
import { takeSnapshot, advance } from "../scripts/update-msf-release-history.mjs";

const timestamp = "2026-10-18T15:00:00Z";
const makeSources = () => {
  const catalog = [];
  const combat = { Data: {} };
  for (let n = 0; n < 105; n++) {
    const id = "Hero" + n;
    catalog.push({ id, player_Character: n < 100 });
    combat.Data[id] = {
      traits: ["Hero", "Global", "Skill"],
      basic: { actions: [{ action: "attack", amount: n }] },
      special: { actions: [{ action: "heal", amount: n }] },
      passive: { actions: [] },
      ultimate: { actions: [] },
      global_stats: []
    };
  }
  return { catalog, combat };
};
const makeHistory = () => ({
  years: {
    2025: { status: "partial", auditedThrough: "2025-09-30", individualReleases: [], teamEvents: [] },
    2026: {
      status: "partial", auditedThrough: "2026-10-05",
      individualReleases: [], teamEvents: [], validation: { distinctPlayableReleaseCount: 0 }
    }
  }
});
const bootstrap = (sources = makeSources(), history = makeHistory()) => {
  const data = takeSnapshot(sources.catalog, sources.combat);
  const result = advance(history, null, data, timestamp);
  return { sources, history, data, state: result.state, result };
};

test("bootstrap anchors snapshot without backfilling 100 pre-existing players", () => {
  const { result, history, state } = bootstrap();
  assert.equal(result.summary.baseline, true);
  assert.equal(state.trackingStartedAt, timestamp);
  assert.equal(history.years["2026"].individualReleases.length, 0);
  assert.equal(history.years["2026"].teamEvents.length, 0);
});

test("true transition is observed; false PVE/NPC and already released IDs excluded", () => {
  const { sources, history, state } = bootstrap();
  sources.catalog[100].player_Character = true;
  sources.combat.Data.Hero101.traits.push("PVE");
  const next = takeSnapshot(sources.catalog, sources.combat);
  const original2025 = JSON.stringify(history.years["2025"]);
  const result = advance(history, state, next, "2026-10-19T08:00:00Z");
  assert.deepEqual(result.summary.releases, ["Hero100"]);
  assert.equal(history.years["2026"].individualReleases[0].characterId, "Hero100");
  assert.equal(history.years["2026"].individualReleases[0].dateConfidence, "unverified");
  assert.equal(history.years["2026"].auditedThrough, "2026-10-05");
  assert.equal(JSON.stringify(history.years["2025"]), original2025);
  const again = advance(history, result.state, next, "2026-10-20T08:00:00Z");
  assert.deepEqual(again.summary.releases, []);
  assert.equal(history.years["2026"].individualReleases.length, 1);
});

test("confirmed historical release is not imported again on new catalog transition", () => {
  const { sources, history, state } = bootstrap();
  history.years["2025"].individualReleases.push({ characterId: "Hero100", month: "2025-05" });
  sources.catalog[100].player_Character = true;
  const r = advance(history, state, takeSnapshot(sources.catalog, sources.combat), "2026-10-19T08:00:00Z");
  assert.deepEqual(r.summary.releases, []);
});

test("meaningful kit change becomes individual rework, tiny change only candidate", () => {
  const { sources, history, state } = bootstrap();
  sources.combat.Data.Hero1.basic.actions[0].amount = 999;
  sources.combat.Data.Hero2.basic.actions[0].amount = 999;
  sources.combat.Data.Hero2.global_stats = [{ stat: "max_hp_pct", delta: 100 }];
  const r = advance(history, state, takeSnapshot(sources.catalog, sources.combat), "2026-10-19T08:00:00Z");
  assert.deepEqual(r.summary.reworks, ["Hero2"]);
  assert.equal(history.years["2026"].individualReworks[0].characterId, "Hero2");
  assert.equal(r.summary.candidates[0].characterId, "Hero1");
  assert.equal(history.years["2026"].validation.distinctReworkedCharacterCount, 1);
});

test("new coherent team trait creates a single team event and assigns new recruit once", () => {
  const { sources, history, state } = bootstrap();
  for (let n = 95; n <= 100; n++) sources.combat.Data["Hero" + n].traits.push("AlphaGuard");
  sources.catalog[100].player_Character = true;
  const r = advance(history, state, takeSnapshot(sources.catalog, sources.combat), "2026-10-19T08:00:00Z");
  assert.deepEqual(r.summary.teams, ["AlphaGuard"]);
  assert.equal(history.years["2026"].teamEvents.length, 1);
  const team = history.years["2026"].teamEvents[0];
  assert.deepEqual(team.newCharacterIds, ["Hero100"]);
  assert.equal(team.members.length, 6);
  assert.equal(history.years["2026"].individualReleases.length, 0);
  assert.equal(history.years["2026"].validation.distinctPlayableReleaseCount, 1);
});

test("one recruit joining existing faction is not an invented new team", () => {
  const { sources, history, state } = bootstrap();
  for (let n = 0; n < 5; n++) sources.combat.Data["Hero" + n].traits.push("AlphaGuard");
  const older = takeSnapshot(sources.catalog, sources.combat);
  const initial = advance(history, null, older, timestamp);
  sources.catalog[100].player_Character = true;
  sources.combat.Data.Hero100.traits.push("AlphaGuard");
  const r = advance(history, initial.state, takeSnapshot(sources.catalog, sources.combat), "2026-10-19T08:00:00Z");
  assert.deepEqual(r.summary.teams, []);
  assert.deepEqual(r.summary.releases, ["Hero100"]);
});

test("fail closed on suspicious catalog shrink and invalid identifiers", () => {
  const { sources, history, state } = bootstrap();
  sources.catalog = sources.catalog.slice(0, 50);
  assert.throws(() => advance(history, state, takeSnapshot(sources.catalog, sources.combat), "2026-10-19T08:00:00Z"), /Incomplete|shrank/);
  sources.catalog[0].id = "../../danger";
  assert.throws(() => takeSnapshot(sources.catalog, sources.combat), /Invalid/);
});

test("year rollover creates only future partial year", () => {
  const { sources, history, state } = bootstrap();
  sources.catalog[100].player_Character = true;
  const frozen = JSON.stringify(history.years["2026"]);
  advance(history, state, takeSnapshot(sources.catalog, sources.combat), "2027-01-02T08:00:00Z");
  assert.equal(JSON.stringify(history.years["2026"]), frozen);
  assert.equal(history.years["2027"].status, "partial");
  assert.equal(history.years["2027"].individualReleases[0].month, "2027-01");
});
