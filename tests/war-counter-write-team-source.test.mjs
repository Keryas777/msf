import test from "node:test";
import assert from "node:assert/strict";
import {
  __resetWarCounterTeamSourceForTests,
  configureWarCounterTeamSource,
  createSharedWarCounterTeamsResponse,
  loadSharedWarCounterTeams,
  registerManualWarCounterTeam
} from "../docs/war-counter-write-team-source.js";

test.afterEach(() => {
  __resetWarCounterTeamSourceForTests();
});

function configureFixture(rows) {
  const source = structuredClone(rows);
  configureWarCounterTeamSource({
    url: "https://example.test/data/teams.json",
    fetchImpl: async () => new Response(JSON.stringify(source), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })
  });
}

test("les consommateurs de teams.json partagent le même tableau mutable", async () => {
  configureFixture([{ team: "Alpha", mode: "Guerre", characters: ["A", "B", "C"] }]);

  const first = await (await createSharedWarCounterTeamsResponse()).json();
  const second = await (await createSharedWarCounterTeamsResponse()).json();
  const direct = await loadSharedWarCounterTeams();

  assert.strictEqual(first, second);
  assert.strictEqual(second, direct);
});

test("un nom manuel remplace toute définition exacte concurrente de la même composition", async () => {
  configureFixture([
    { team: "Ancien nom", mode: "Guerre", characters: ["A", "B", "C", "D", "E"] },
    { team: "Autre ambigu", mode: "Raid", characters: ["E", "D", "C", "B", "A"] },
    { team: "À conserver", mode: "Guerre", characters: ["X", "Y", "Z"] }
  ]);

  await registerManualWarCounterTeam({
    name: "Nom choisi",
    characters: ["E", "D", "C", "B", "A"]
  });

  const teams = await loadSharedWarCounterTeams();
  const exact = teams.filter((row) =>
    [...row.characters].sort().join("|") === ["A", "B", "C", "D", "E"].join("|")
  );

  assert.equal(exact.length, 1);
  assert.equal(exact[0].team, "Nom choisi");
  assert.equal(exact[0].mode, "Guerre");
  assert.equal(exact[0].__warCounterManual, true);
  assert.ok(teams.some((row) => row.team === "À conserver"));
});

test("refuse un nom vide ou une composition invalide", async () => {
  configureFixture([]);
  await assert.rejects(
    registerManualWarCounterTeam({ name: "", characters: ["A", "B", "C"] }),
    /Nom d’équipe requis/
  );
  await assert.rejects(
    registerManualWarCounterTeam({ name: "Test", characters: ["A", "B"] }),
    /Composition d’équipe invalide/
  );
});
