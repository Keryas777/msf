import test from "node:test";
import assert from "node:assert/strict";
import {
  __resetWarCounterTeamSourceForTests,
  configureWarCounterTeamSource,
  createSharedWarCounterTeamsResponse,
  loadSharedWarCounterTeams,
  registerManualWarCounterTeam
} from "../docs/war-counter-write-team-source.js";
import { buildTeamLabels } from "../docs/war-counter-matchup-preview.js";

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

test("un classement manuel remplace la définition exacte et conserve famille plus variante", async () => {
  configureFixture([
    { team: "Ancien nom", mode: "Guerre", characters: ["A", "B", "C", "D", "E"] },
    { team: "Autre ambigu", mode: "Raid", characters: ["E", "D", "C", "B", "A"] },
    { team: "À conserver", mode: "Guerre", characters: ["X", "Y", "Z"] }
  ]);

  await registerManualWarCounterTeam({
    family: "Gamma",
    variant: "Gamma + Méphisto + Apocalypse",
    characters: ["E", "D", "C", "B", "A"]
  });

  const teams = await loadSharedWarCounterTeams();
  const exact = teams.filter((row) =>
    [...row.characters].sort().join("|") === ["A", "B", "C", "D", "E"].join("|")
  );

  assert.equal(exact.length, 1);
  assert.equal(exact[0].team, "Gamma");
  assert.equal(exact[0].mode, "Guerre");
  assert.equal(exact[0].__warCounterManual, true);
  assert.equal(exact[0].__warCounterManualVariant, "Gamma + Méphisto + Apocalypse");

  const labels = buildTeamLabels(["A", "B", "C", "D", "E"], teams);
  assert.equal(labels.status, "resolved");
  assert.equal(labels.family, "Gamma");
  assert.equal(labels.variant, "Gamma + Méphisto + Apocalypse");
  assert.equal(labels.manual, true);
  assert.ok(teams.some((row) => row.team === "À conserver"));
});

test("refuse une famille vide, une variante vide ou une composition invalide", async () => {
  configureFixture([]);
  await assert.rejects(
    registerManualWarCounterTeam({ family: "", variant: "Variante", characters: ["A", "B", "C"] }),
    /Famille d’équipe requise/
  );
  await assert.rejects(
    registerManualWarCounterTeam({ family: "Gamma", variant: "", characters: ["A", "B", "C"] }),
    /Variante d’équipe requise/
  );
  await assert.rejects(
    registerManualWarCounterTeam({ family: "Gamma", variant: "Gamma variante", characters: ["A", "B"] }),
    /Composition d’équipe invalide/
  );
});
