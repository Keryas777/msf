(() => {
  "use strict";

  const ALLIANCE_RULES = Object.freeze({
    zeus: Object.freeze({ minimum_attacks: 11, minimum_deviations: 2 }),
    athena: Object.freeze({ minimum_attacks: 11, minimum_deviations: 2 }),
    kronos: Object.freeze({ minimum_attacks: 10, minimum_deviations: 1 }),
    dionysos: Object.freeze({ minimum_attacks: 10, minimum_deviations: 1 }),
    poseidon: Object.freeze({ minimum_attacks: 10, minimum_deviations: 0 }),
    hades: Object.freeze({ minimum_attacks: 10, minimum_deviations: 0 })
  });

  const PLAYER_NUMERIC_FIELDS = [
    "rank",
    "attack_points",
    "attacks",
    "damage",
    "defense_wins",
    "defense_bonus"
  ];

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function assertValidatedDraft(draft) {
    if (!draft || typeof draft !== "object" || Array.isArray(draft)) {
      throw new TypeError("Le brouillon validé doit être un objet JSON.");
    }

    if (Object.prototype.hasOwnProperty.call(draft, "report")) {
      throw new Error("Le brouillon validé ne doit pas déjà contenir de rapport.");
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date || "")) {
      throw new Error("La date du brouillon validé est invalide.");
    }

    if (!Object.prototype.hasOwnProperty.call(ALLIANCE_RULES, draft.alliance)) {
      throw new Error(
        `Alliance non prise en charge : ${draft.alliance || "inconnue"}.`
      );
    }

    if (
      typeof draft.captured_at !== "string" ||
      typeof draft.source !== "string"
    ) {
      throw new Error("Les métadonnées du brouillon validé sont invalides.");
    }

    if (!Array.isArray(draft.players)) {
      throw new Error("La liste des joueurs du brouillon validé est invalide.");
    }

    for (const [index, player] of draft.players.entries()) {
      if (!player || typeof player !== "object" || Array.isArray(player)) {
        throw new Error(`Le joueur ${index + 1} est invalide.`);
      }

      if (typeof player.name !== "string" || player.name.trim() === "") {
        throw new Error(`Le joueur ${index + 1} doit avoir un nom.`);
      }

      for (const field of PLAYER_NUMERIC_FIELDS) {
        if (!Number.isSafeInteger(player[field]) || player[field] < 0) {
          throw new Error(
            `Le champ ${field} du joueur ${index + 1} doit être un entier positif ou 0.`
          );
        }
      }

      if (player.rank < 1) {
        throw new Error(`Le rang du joueur ${index + 1} est invalide.`);
      }
    }
  }

  function averageTopThree(values) {
    if (values.length === 0) return 0;

    const top = [...values]
      .sort((left, right) => right - left)
      .slice(0, 3);

    return top.reduce((sum, value) => sum + value, 0) / top.length;
  }

  function roundToTwo(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  function getActivityScore(attacks) {
    if (attacks >= 14) return 25;
    if (attacks === 13) return 21;
    if (attacks === 12) return 17;
    if (attacks === 11) return 13;
    if (attacks === 10) return 8;
    if (attacks === 9) return 4;
    return 0;
  }

  function getEfficiencyScore(misses) {
    if (misses <= 0) return 25;
    if (misses === 1) return 21;
    if (misses === 2) return 16;
    if (misses === 3) return 11;
    if (misses === 4) return 7;
    if (misses === 5) return 4;
    return 0;
  }

  function getDefenseWinsScore(defenseWins) {
    if (defenseWins >= 5) return 9;
    if (defenseWins === 4) return 7;
    if (defenseWins === 3) return 6;
    if (defenseWins === 2) return 4;
    if (defenseWins === 1) return 2;
    return 0;
  }

  function getDeviationsScore(deviations) {
    if (deviations >= 3) return 6;
    if (deviations === 2) return 4;
    if (deviations === 1) return 2;
    return 0;
  }

  /*
   * L’efficacité et l’impact deviennent progressivement plus fiables
   * à mesure que le joueur participe à la guerre.
   *
   * Une belle attaque isolée conserve donc une valeur, mais elle ne peut
   * plus être évaluée comme une guerre complète.
   */
  function getVolumeFactor(attacks, minimumAttacks) {
    if (
      !Number.isFinite(attacks) ||
      !Number.isFinite(minimumAttacks) ||
      attacks <= 0 ||
      minimumAttacks <= 0
    ) {
      return 0;
    }

    return Math.min(1, Math.sqrt(attacks / minimumAttacks));
  }

  function buildBaseMetrics(player, totalDamage) {
    const noAttack = player.attacks <= 0 || player.attack_points <= 0;

    const successfulAttacks = noAttack
      ? 0
      : Math.min(
          player.attacks,
          Math.round(player.attack_points / 918)
        );

    const misses = noAttack
      ? 0
      : player.attacks - successfulAttacks;

    let damageAttacks = noAttack
      ? 0.1
      : Math.ceil(player.attack_points / 1000);

    if (damageAttacks > player.attacks) {
      damageAttacks = player.attacks;
    }

    if (damageAttacks <= 0) {
      damageAttacks = 0.1;
    }

    const rawAverageDamage = player.damage / damageAttacks;
    const damageShare = totalDamage > 0
      ? player.damage / totalDamage
      : 0;

    return {
      player,
      noAttack,
      successfulAttacks,
      misses,
      damageAttacks,
      rawAverageDamage,
      averageDamage: Math.round(rawAverageDamage),
      damageShare,
      damageSharePercent: roundToTwo(damageShare * 100)
    };
  }

  function calculateReport(validatedDraft) {
    assertValidatedDraft(validatedDraft);

    const input = cloneJson(validatedDraft);
    const rules = ALLIANCE_RULES[input.alliance];

    const totalDamage = input.players.reduce(
      (sum, player) => sum + player.damage,
      0
    );

    const metrics = input.players.map((player) =>
      buildBaseMetrics(player, totalDamage)
    );

    const averageReference = averageTopThree(
      metrics.map((entry) => entry.rawAverageDamage)
    );

    const shareReference = averageTopThree(
      metrics.map((entry) => entry.damageShare)
    );

    const players = metrics.map((entry) => {
      const { player } = entry;

      const scoreActivity = entry.noAttack
        ? 0
        : getActivityScore(player.attacks);

      const rawEfficiencyScore = entry.noAttack
        ? 0
        : getEfficiencyScore(entry.misses);

      const rawImpactAverage =
        entry.noAttack || averageReference === 0
          ? 0
          : Math.min(
              24.5,
              24.5 * (entry.rawAverageDamage / averageReference)
            );

      const rawImpactShare =
        entry.noAttack || shareReference === 0
          ? 0
          : Math.min(
              10.5,
              10.5 * (entry.damageShare / shareReference)
            );

      const rawImpactScore = entry.noAttack
        ? 0
        : Math.min(35, rawImpactAverage + rawImpactShare);

      const volumeFactor = entry.noAttack
        ? 0
        : getVolumeFactor(player.attacks, rules.minimum_attacks);

      const scoreEfficiency = rawEfficiencyScore * volumeFactor;
      const scoreImpact = rawImpactScore * volumeFactor;

      const scoreDefense =
        getDefenseWinsScore(player.defense_wins) +
        getDeviationsScore(player.defense_bonus);

      const scoreTotalRaw =
        scoreActivity +
        scoreEfficiency +
        scoreImpact +
        scoreDefense;

      return {
        original_rank: player.rank,
        name: player.name,
        attacks: player.attacks,
        attack_points: player.attack_points,
        damage: player.damage,
        defense_wins: player.defense_wins,
        deviations: player.defense_bonus,
        successful_attacks: entry.successfulAttacks,
        misses: entry.misses,
        damage_attacks: entry.damageAttacks,
        avg_damage: entry.averageDamage,
        damage_share: entry.damageShare,
        damage_share_pct: entry.damageSharePercent,
        score_activity: scoreActivity,
        score_efficiency: scoreEfficiency,
        score_impact: scoreImpact,
        score_defense: scoreDefense,
        score_total_raw: scoreTotalRaw,
        score_total: Math.round(scoreTotalRaw),
        min_attacks_ok: player.attacks >= rules.minimum_attacks,
        min_deviations_ok:
          player.defense_bonus >= rules.minimum_deviations
      };
    });

    return {
      ...input,
      report: {
        summary: {
          total_damage: totalDamage,
          player_count: input.players.length,
          avg_ref: averageReference,
          share_ref: shareReference,
          minimum_attacks: rules.minimum_attacks,
          minimum_deviations: rules.minimum_deviations
        },
        players
      }
    };
  }

  globalThis.MsfWarReportCalculator = Object.freeze({
    ALLIANCE_RULES,
    calculateReport
  });
})();