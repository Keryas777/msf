import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(
  new URL("../docs/war-admin-report-ranker.js", import.meta.url),
  "utf8"
);

const context = vm.createContext({
  globalThis: {}
});

vm.runInContext(source, context, {
  filename: "war-admin-report-ranker.js"
});

const { rankReport } =
  context.globalThis.MsfWarReportRanker;

const plain = (value) =>
  JSON.parse(JSON.stringify(value));

function player(name, originalRank, scores) {
  return {
    original_rank: originalRank,
    name,
    damage: 1000 + originalRank,
    score_total: scores[0],
    score_impact: scores[1],
    score_efficiency: scores[2],
    score_activity: scores[3],
    score_defense: 15,
    untouched_fraction: 1.23456789012345
  };
}

function fixture() {
  return {
    date: "2026-08-03",
    alliance: "zeus",
    report: {
      summary: {
        total_damage: 123456789,
        avg_ref: 123.456789012345
      },
      players: [
        player(
          "Rang source",
          1,
          [80, 30, 20, 20]
        ),
        player(
          "Activité",
          5,
          [80, 30, 20, 21]
        ),
        player(
          "Efficacité",
          4,
          [80, 30, 21, 1]
        ),
        player(
          "Impact",
          3,
          [80, 31, 1, 1]
        ),
        player(
          "Score total",
          2,
          [81, 1, 1, 1]
        ),
        player(
          "Dernier départage",
          6,
          [80, 30, 20, 20]
        )
      ]
    }
  };
}

test("le tri applique tous les départages dans l’ordre exact", () => {
  const ranked = plain(rankReport(fixture()));

  assert.deepEqual(
    ranked.report.players.map(({ name }) => name),
    [
      "Score total",
      "Impact",
      "Efficacité",
      "Activité",
      "Rang source",
      "Dernier départage"
    ]
  );
});

test("rank et report.ranking suivent exactement le même ordre et le score_total existant", () => {
  const ranked = plain(rankReport(fixture()));

  assert.deepEqual(
    ranked.report.players.map(({ rank }) => rank),
    [1, 2, 3, 4, 5, 6]
  );

  assert.deepEqual(
    ranked.report.ranking,
    ranked.report.players.map(
      ({ rank, name, score_total }) => ({
        rank,
        name,
        score: score_total
      })
    )
  );

  assert.deepEqual(
    Object.keys(ranked.report.ranking[0]),
    ["rank", "name", "score"]
  );
});

test("aucune clé ou valeur existante ne change hors ordre des joueurs et ajout de rank/ranking", () => {
  const input = fixture();
  const before = structuredClone(input);
  const ranked = plain(rankReport(input));

  assert.deepEqual(
    input,
    before,
    "le rapport calculé source ne doit pas être muté"
  );

  assert.deepEqual(
    ranked.report.summary,
    before.report.summary
  );

  for (const actual of ranked.report.players) {
    const expected = before.report.players.find(
      ({ name }) => name === actual.name
    );

    const withoutRank = Object.fromEntries(
      Object.entries(actual).filter(
        ([key]) => key !== "rank"
      )
    );

    assert.deepEqual(withoutRank, expected);

    assert.equal(
      actual.untouched_fraction,
      expected.untouched_fraction
    );

    assert.equal("tags" in actual, false);
    assert.equal("analysis" in actual, false);
  }
});

test("le classement est entièrement local et refuse un contrat incomplet", () => {
  assert.equal(
    (source.match(/\bfetch\(/g) || []).length,
    0
  );

  assert.doesNotMatch(
    source,
    /github|gemini|analysis|tags/i
  );

  assert.throws(
    () => rankReport(null),
    /objet JSON/
  );

  assert.throws(
    () => rankReport({ report: {} }),
    /report\.players/
  );
});