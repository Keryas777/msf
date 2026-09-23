import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWriteProposal,
  normalizeSheetKey,
  suggestTeamSheetKey
} from "../docs/war-counter-write-proposal.js";

test("normalise une clé Sheet comme le frontend War Counters", () => {
  assert.equal(normalizeSheetKey("Conclave de l'Ombre"), "conclavedelombre");
  assert.equal(normalizeSheetKey("Incroyables Avengers"), "incroyablesavengers");
});

test("réutilise la clé classique existante d'une famille", () => {
  const rows = [{
    def_family: "Incroyables Avengers",
    def_variant: 'Incroyables Avengers "classique"',
    def_key: "incroyablesavengers",
    def_char1: "A", def_char2: "B", def_char3: "C", def_char4: "D", def_char5: "E"
  }];
  const result = suggestTeamSheetKey({
    role: "def",
    ids: ["A", "B", "C", "D", "X"],
    teamInfo: {
      family: "Incroyables Avengers",
      variant: "Incroyables Avengers + Xavier",
      exact: false,
      extraIds: ["X"]
    },
    rows,
    nameForId: (id) => id === "X" ? "Xavier" : id
  });
  assert.equal(result.key, "incroyablesavengersxavier");
  assert.equal(result.source, "family");
});

test("proposition d'amélioration ne prépare aucune métadonnée de nouvelle ligne", () => {
  const preview = {
    state: {
      attackIds: ["A1", "A2", "A3", "A4", "A5"],
      defenseIds: ["D1", "D2", "D3", "D4", "D5"],
      attackPower: 9_000_000,
      defensePower: 10_000_000,
      ratio: 0.9
    },
    comparison: {
      status: "improves",
      existingRatio: 1,
      matches: [
        { index: 39 },
        { index: 121 }
      ]
    }
  };
  const proposal = buildWriteProposal({ preview, rows: [] });
  assert.equal(proposal.action, "update");
  assert.deepEqual(proposal.matchingRows, [41, 123]);
  assert.equal(proposal.metadata, null);
});

test("nouveau matchup prépare les six métadonnées et le ratio plafonné", () => {
  const preview = {
    state: {
      attackIds: ["A1", "A2", "A3", "A4", "A5"],
      defenseIds: ["D1", "D2", "D3", "D4", "D5"],
      attackPower: 13_505_260,
      defensePower: 12_702_649,
      ratio: 13_505_260 / 12_702_649
    },
    attackTeam: {
      status: "resolved",
      exact: true,
      family: "Insidious Six + Bouffon vert (Classique)",
      variant: 'Insidious Six + Bouffon vert (Classique) "classique"',
      extraIds: []
    },
    defenseTeam: {
      status: "resolved",
      exact: true,
      family: "Incroyables Avengers",
      variant: 'Incroyables Avengers "classique"',
      extraIds: []
    },
    comparison: { status: "new", matches: [] }
  };
  const proposal = buildWriteProposal({ preview, rows: [] });
  assert.equal(proposal.action, "create");
  assert.equal(proposal.ratio, 1.07);
  assert.equal(proposal.metadata.def_family, "Incroyables Avengers");
  assert.equal(proposal.metadata.atk_family, "Insidious Six + Bouffon vert (Classique)");
  assert.ok(proposal.metadata.def_key);
  assert.ok(proposal.metadata.atk_key);
});

test("n'écrit pas automatiquement un nouveau matchup si le nom d'équipe est ambigu", () => {
  const preview = {
    state: {
      attackIds: ["A", "B", "C"],
      defenseIds: ["D", "E", "F"],
      attackPower: 100,
      defensePower: 100,
      ratio: 1
    },
    attackTeam: { status: "ambiguous" },
    defenseTeam: { status: "resolved", family: "Def", variant: "Def", exact: false, extraIds: [] },
    comparison: { status: "new", matches: [] }
  };
  const proposal = buildWriteProposal({ preview, rows: [] });
  assert.equal(proposal.action, "blocked");
});
