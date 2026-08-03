import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(
  new URL("../docs/war-admin-report-calculator.js", import.meta.url),
  "utf8"
);

const context = vm.createContext({ console });

vm.runInContext(source, context, {
  filename: "war-admin-report-calculator.js"
});

const calculator = context.MsfWarReportCalculator;

function player(overrides = {}) {
  return {
    rank: 1,
    name: "Joueur",
    attack_points: 12000,
    attacks: 14,
    damage: 1_200_000_000,
    defense_wins: 2,
    defense_bonus: 1,
    ...overrides
  };
}

function draft(alliance = "zeus", players = [player()]) {
  return {
    date: "2026-08-03",
    alliance,
    captured_at: "2026-08-03T12:00:00.000Z",
    source: "gemini-test",
    players
  };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertNear(actual, expected, label) {
  const tolerance = Math.max(
    1e-12,
    Math.abs(expected) * 1e-14
  );

  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: ${actual} ≠ ${expected}`
  );
}

function volumeFactor(attacks, minimumAttacks) {
  if (attacks <= 0 || minimumAttacks <= 0) {
    return 0;
  }

  return Math.min(
    1,
    Math.sqrt(attacks / minimumAttacks)
  );
}

test("les six profils d’alliance appliquent les seuils actuels", () => {
  assert.deepEqual(plain(calculator.ALLIANCE_RULES), {
    zeus: {
      minimum_attacks: 11,
      minimum_deviations: 2
    },
    athena: {
      minimum_attacks: 11,
      minimum_deviations: 2
    },
    kronos: {
      minimum_attacks: 10,
      minimum_deviations: 1
    },
    dionysos: {
      minimum_attacks: 10,
      minimum_deviations: 1
    },
    poseidon: {
      minimum_attacks: 10,
      minimum_deviations: 0
    },
    hades: {
      minimum_attacks: 10,
      minimum_deviations: 0
    }
  });
});

test("le moteur conserve le validatedDraft, ne le mute pas et ajoute uniquement report", () => {
  const input = draft("athena", [
    player(),
    player({
      rank: 2,
      name: "Deuxième"
    })
  ]);

  const before = plain(input);
  const output = plain(calculator.calculateReport(input));

  assert.deepEqual(input, before);

  assert.deepEqual(
    Object.fromEntries(
      Object.entries(output).filter(([key]) => key !== "report")
    ),
    before
  );

  assert.deepEqual(
    Object.keys(output.report),
    ["summary", "players"]
  );

  assert.deepEqual(
    Object.keys(output.report.summary),
    [
      "total_damage",
      "player_count",
      "avg_ref",
      "share_ref",
      "minimum_attacks",
      "minimum_deviations"
    ]
  );

  assert.deepEqual(
    Object.keys(output.report.players[0]),
    [
      "original_rank",
      "name",
      "attacks",
      "attack_points",
      "damage",
      "defense_wins",
      "deviations",
      "successful_attacks",
      "misses",
      "damage_attacks",
      "avg_damage",
      "damage_share",
      "damage_share_pct",
      "score_activity",
      "score_efficiency",
      "score_impact",
      "score_defense",
      "score_total_raw",
      "score_total",
      "min_attacks_ok",
      "min_deviations_ok"
    ]
  );

  assert.equal("ranking" in output.report, false);
  assert.equal("rank" in output.report.players[0], false);
  assert.equal("tags" in output.report.players[0], false);
  assert.equal("analysis" in output.report.players[0], false);

  assert.deepEqual(
    output.report.players.map(({ original_rank }) => original_rank),
    [1, 2]
  );
});

test("activité et efficacité brute conservent leurs barèmes lorsque le seuil d’attaques est atteint", () => {
  const attacks = [14, 13, 12, 11];

  const activityDraft = draft(
    "zeus",
    attacks.map((value, index) =>
      player({
        rank: index + 1,
        name: `Activité ${value}`,
        attacks: value,
        attack_points: value * 1000,
        damage: 100_000_000
      })
    )
  );

  assert.deepEqual(
    plain(
      calculator
        .calculateReport(activityDraft)
        .report.players
        .map((entry) => entry.score_activity)
    ),
    [25, 21, 17, 13]
  );

  const misses = [0, 1, 2, 3, 4, 5, 6];

  const efficiencyDraft = draft(
    "zeus",
    misses.map((value, index) =>
      player({
        rank: index + 1,
        name: `Efficacité ${value}`,
        attacks: 14,
        attack_points: (14 - value) * 1000,
        damage: 100_000_000
      })
    )
  );

  assert.deepEqual(
    plain(
      calculator
        .calculateReport(efficiencyDraft)
        .report.players
        .map((entry) => entry.score_efficiency)
    ),
    [25, 21, 16, 11, 7, 4, 0]
  );
});

test("l’efficacité et l’impact sont pondérés progressivement par le volume d’attaques", () => {
  const input = draft("zeus", [
    player({
      rank: 1,
      name: "Une attaque",
      attacks: 1,
      attack_points: 1000,
      damage: 180_000_000,
      defense_wins: 0,
      defense_bonus: 0
    }),
    player({
      rank: 2,
      name: "Référence A",
      attacks: 14,
      attack_points: 14000,
      damage: 1_400_000_000,
      defense_wins: 0,
      defense_bonus: 0
    }),
    player({
      rank: 3,
      name: "Référence B",
      attacks: 14,
      attack_points: 14000,
      damage: 1_300_000_000,
      defense_wins: 0,
      defense_bonus: 0
    }),
    player({
      rank: 4,
      name: "Référence C",
      attacks: 14,
      attack_points: 14000,
      damage: 1_200_000_000,
      defense_wins: 0,
      defense_bonus: 0
    })
  ]);

  const output = plain(calculator.calculateReport(input));
  const oneAttack = output.report.players[0];
  const factor = Math.sqrt(1 / 11);

  const rawImpactAverage = Math.min(
    24.5,
    24.5 * (
      (180_000_000 / 1) /
      output.report.summary.avg_ref
    )
  );

  const rawImpactShare = Math.min(
    10.5,
    10.5 * (
      oneAttack.damage_share /
      output.report.summary.share_ref
    )
  );

  const rawImpact = Math.min(
    35,
    rawImpactAverage + rawImpactShare
  );

  assertNear(
    oneAttack.score_efficiency,
    25 * factor,
    "efficacité pondérée"
  );

  assertNear(
    oneAttack.score_impact,
    rawImpact * factor,
    "impact pondéré"
  );

  assert.equal(oneAttack.score_activity, 0);
  assert.equal(oneAttack.score_defense, 0);

  assertNear(
    oneAttack.score_total_raw,
    (25 + rawImpact) * factor,
    "total pondéré"
  );

  assert.ok(
    oneAttack.score_total < 25,
    "une seule attaque réussie ne doit pas produire une note moyenne"
  );
});

test("la pondération atteint 100 % dès que le minimum d’attaques est atteint", () => {
  for (const [alliance, rules] of Object.entries(
    plain(calculator.ALLIANCE_RULES)
  )) {
    const output = plain(
      calculator.calculateReport(
        draft(alliance, [
          player({
            attacks: rules.minimum_attacks,
            attack_points: rules.minimum_attacks * 1000
          })
        ])
      )
    );

    const calculated = output.report.players[0];

    assert.equal(
      calculated.score_efficiency,
      25,
      `${alliance}.score_efficiency`
    );

    assert.equal(
      calculated.score_impact,
      35,
      `${alliance}.score_impact`
    );
  }
});

test("les attaques réussies utilisent floor et les attaques de dégâts utilisent ceil puis le plafond", () => {
  const output = plain(
    calculator.calculateReport(
      draft("dionysos", [
        player({
          rank: 1,
          name: "Partiel",
          attack_points: 10500,
          attacks: 14,
          damage: 1_100_000_000
        }),
        player({
          rank: 2,
          name: "Plafonné",
          attack_points: 12000,
          attacks: 10,
          damage: 1_000_000_000
        })
      ])
    )
  );

  assert.deepEqual(
    output.report.players.map(
      ({
        successful_attacks,
        misses,
        damage_attacks,
        avg_damage
      }) => ({
        successful_attacks,
        misses,
        damage_attacks,
        avg_damage
      })
    ),
    [
      {
        successful_attacks: 10,
        misses: 4,
        damage_attacks: 11,
        avg_damage: 100_000_000
      },
      {
        successful_attacks: 12,
        misses: -2,
        damage_attacks: 10,
        avg_damage: 100_000_000
      }
    ]
  );
});

test("les références Top 3 utilisent les moyennes non arrondies", () => {
  const input = draft("kronos", [
    player({
      rank: 1,
      name: "A",
      attack_points: 2500,
      attacks: 3,
      damage: 100
    }),
    player({
      rank: 2,
      name: "B",
      attack_points: 3500,
      attacks: 4,
      damage: 101
    }),
    player({
      rank: 3,
      name: "C",
      attack_points: 4500,
      attacks: 5,
      damage: 102
    }),
    player({
      rank: 4,
      name: "D",
      attack_points: 5000,
      attacks: 5,
      damage: 1
    })
  ]);

  const output = plain(calculator.calculateReport(input));

  const rawAverages = [
    100 / 3,
    101 / 4,
    102 / 5
  ];

  const expectedReference =
    rawAverages.reduce((sum, value) => sum + value, 0) / 3;

  const roundedReference =
    output.report.players
      .slice(0, 3)
      .reduce((sum, entry) => sum + entry.avg_damage, 0) / 3;

  assert.equal(
    output.report.summary.avg_ref,
    expectedReference
  );

  assert.notEqual(
    output.report.summary.avg_ref,
    roundedReference
  );

  assert.deepEqual(
    output.report.players.map(({ avg_damage }) => avg_damage),
    [33, 25, 20, 0]
  );
});

test("un joueur sans attaque reçoit uniquement son score défensif", () => {
  const output = plain(
    calculator.calculateReport(
      draft("zeus", [
        player({
          name: "Inactif défensif",
          attack_points: 0,
          attacks: 0,
          damage: 0,
          defense_wins: 5,
          defense_bonus: 3
        })
      ])
    )
  );

  const calculated = output.report.players[0];

  assert.equal(calculated.successful_attacks, 0);
  assert.equal(calculated.misses, 0);
  assert.equal(calculated.damage_attacks, 0.1);
  assert.equal(calculated.avg_damage, 0);
  assert.equal(calculated.damage_share, 0);
  assert.equal(calculated.score_activity, 0);
  assert.equal(calculated.score_efficiency, 0);
  assert.equal(calculated.score_impact, 0);
  assert.equal(calculated.score_defense, 15);
  assert.equal(calculated.score_total_raw, 15);
  assert.equal(calculated.score_total, 15);
});

test("une alliance sans joueur ou sans dégâts reste calculable sans division par zéro", () => {
  const empty = plain(
    calculator.calculateReport(draft("hades", []))
  );

  assert.deepEqual(empty.report.summary, {
    total_damage: 0,
    player_count: 0,
    avg_ref: 0,
    share_ref: 0,
    minimum_attacks: 10,
    minimum_deviations: 0
  });

  assert.deepEqual(empty.report.players, []);

  const zero = plain(
    calculator.calculateReport(
      draft("poseidon", [
        player({
          attack_points: 0,
          attacks: 0,
          damage: 0,
          defense_wins: 0,
          defense_bonus: 0
        })
      ])
    )
  );

  assert.equal(
    zero.report.players[0].damage_share_pct,
    0
  );

  assert.equal(
    zero.report.summary.share_ref,
    0
  );
});

test("les structures non validées et les rapports déjà enrichis sont refusés", () => {
  assert.throws(
    () => calculator.calculateReport(null),
    /objet JSON/
  );

  assert.throws(
    () => calculator.calculateReport(draft("inconnue")),
    /Alliance non prise en charge/
  );

  assert.throws(
    () =>
      calculator.calculateReport(
        draft("zeus", [player({ damage: -1 })])
      ),
    /entier positif/
  );

  assert.throws(
    () =>
      calculator.calculateReport(
        draft("zeus", [player({ name: "" })])
      ),
    /doit avoir un nom/
  );

  assert.throws(
    () =>
      calculator.calculateReport({
        ...draft(),
        report: {}
      }),
    /déjà contenir de rapport/
  );
});

test("les rapports historiques conservent les métriques brutes mais appliquent la nouvelle pondération", async () => {
  const alliances = [
    "zeus",
    "dionysos",
    "kronos",
    "poseidon",
    "hades"
  ];

  const unchangedFloatFields = new Set([
    "damage_share"
  ]);

  const replacedScoreFields = new Set([
    "score_efficiency",
    "score_impact",
    "score_total_raw",
    "score_total"
  ]);

  for (const alliance of alliances) {
    const historical = JSON.parse(
      await readFile(
        new URL(
          `../docs/data/war/2026-07-07/${alliance}.json`,
          import.meta.url
        ),
        "utf8"
      )
    );

    const input = {
      date: historical.date,
      alliance: historical.alliance,
      captured_at: historical.captured_at,
      source: historical.source,
      players: historical.players.filter(
        (entry) => entry.name.trim() !== ""
      )
    };

    const before = plain(input);
    const output = plain(
      calculator.calculateReport(input)
    );

    const historicalByRank = new Map(
      historical.report.players
        .filter((entry) => entry.name.trim() !== "")
        .map((entry) => [
          entry.original_rank,
          entry
        ])
    );

    const minimumAttacks =
      calculator.ALLIANCE_RULES[alliance].minimum_attacks;

    assert.deepEqual(
      input,
      before,
      `${alliance} ne doit pas être muté`
    );

    assert.equal(
      output.report.summary.total_damage,
      historical.report.summary.total_damage,
      alliance
    );

    assert.equal(
      output.report.summary.player_count,
      input.players.length,
      alliance
    );

    assertNear(
      output.report.summary.avg_ref,
      historical.report.summary.avg_ref,
      `${alliance}.avg_ref`
    );

    assertNear(
      output.report.summary.share_ref,
      historical.report.summary.share_ref,
      `${alliance}.share_ref`
    );

    for (const actual of output.report.players) {
      const expected = historicalByRank.get(
        actual.original_rank
      );

      assert.ok(
        expected,
        `${alliance} rang ${actual.original_rank}`
      );

      const factor = volumeFactor(
        actual.attacks,
        minimumAttacks
      );

      for (const [field, value] of Object.entries(actual)) {
        if (replacedScoreFields.has(field)) {
          continue;
        }

        if (
          field === "min_deviations_ok" &&
          alliance === "zeus"
        ) {
          assert.equal(
            value,
            actual.deviations >= 2,
            `${alliance}.${actual.original_rank}.${field}`
          );
        } else if (unchangedFloatFields.has(field)) {
          assertNear(
            value,
            expected[field],
            `${alliance}.${actual.original_rank}.${field}`
          );
        } else {
          assert.equal(
            value,
            expected[field],
            `${alliance}.${actual.original_rank}.${field}`
          );
        }
      }

      const expectedEfficiency =
        expected.score_efficiency * factor;

      const expectedImpact =
        expected.score_impact * factor;

      const expectedTotalRaw =
        expected.score_activity +
        expectedEfficiency +
        expectedImpact +
        expected.score_defense;

      assertNear(
        actual.score_efficiency,
        expectedEfficiency,
        `${alliance}.${actual.original_rank}.score_efficiency`
      );

      assertNear(
        actual.score_impact,
        expectedImpact,
        `${alliance}.${actual.original_rank}.score_impact`
      );

      assertNear(
        actual.score_total_raw,
        expectedTotalRaw,
        `${alliance}.${actual.original_rank}.score_total_raw`
      );

      assert.equal(
        actual.score_total,
        Math.round(expectedTotalRaw),
        `${alliance}.${actual.original_rank}.score_total`
      );
    }
  }
});