(() => {
  "use strict";

  const NUMERIC_FIELDS = [
    "attack_points",
    "attacks",
    "damage",
    "defense_wins",
    "defense_bonus"
  ];

  const EDITABLE_FIELDS = ["name", ...NUMERIC_FIELDS];

  const FIELD_LABELS = {
    name: "Nom",
    attack_points: "Points d’attaque",
    attacks: "Attaques",
    damage: "Dégâts",
    defense_wins: "Victoires en défense",
    defense_bonus: "Bonus de défense"
  };

  const NUMERIC_LIMITS = {
    attack_points: { min: 0, max: 15000 },
    attacks: { min: 0, max: 14 },
    damage: { min: 0, max: 30000000000 },
    defense_wins: { min: 0, max: 20 },
    defense_bonus: { min: 0, max: 10 }
  };

  const CLASSIFICATIONS = {
    active: { label: "Valide", isPlayer: true },
    inactive: { label: "Inactif", isPlayer: true },
    vacant: { label: "Emplacement libre", isPlayer: false },
    invalid: { label: "À corriger", isPlayer: false }
  };

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function cloneJson(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function getTrimmedName(row) {
    return typeof row?.name === "string" ? row.name.trim() : "";
  }

  function validateRank(row) {
    return Number.isInteger(row?.rank) && row.rank >= 1 && row.rank <= 24
      ? []
      : ["Rang source invalide : une valeur de 1 à 24 est attendue."];
  }

  function validateStoredInteger(field, value) {
    const label = FIELD_LABELS[field];
    const limits = NUMERIC_LIMITS[field];

    if (value === null) return [];
    if (!Number.isInteger(value)) return [`${label} doit être un entier.`];
    if (value < limits.min) return [`${label} ne peut pas être négatif.`];
    if (value > limits.max) {
      return [`${label} dépasse la limite autorisée (${limits.max.toLocaleString("fr-FR")}).`];
    }
    return [];
  }

  function getCertainWarnings(row, classificationType) {
    if (classificationType === "vacant") return [];

    const warnings = [];
    if (row.damage === null) warnings.push("Dégâts absents : vérification obligatoire.");
    if (Number.isInteger(row.attacks) && row.attacks > 0 && row.damage === 0) {
      warnings.push("Attaques supérieures à 0 avec 0 dégât.");
    }
    if (Number.isInteger(row.attack_points) && row.attack_points > 0 && row.damage === 0) {
      warnings.push("Points d’attaque supérieurs à 0 avec 0 dégât.");
    }

    for (const field of NUMERIC_FIELDS) {
      const value = row[field];
      const limits = NUMERIC_LIMITS[field];
      if (Number.isInteger(value) && (value < limits.min || value > limits.max)) {
        warnings.push(`${FIELD_LABELS[field]} hors limites.`);
      }
    }

    return unique(warnings);
  }

  function classifyRow(row) {
    if (!isRecord(row)) {
      return {
        type: "invalid",
        label: CLASSIFICATIONS.invalid.label,
        isPlayer: false,
        errors: ["Structure de ligne incohérente."],
        warnings: []
      };
    }

    const errors = validateRank(row);
    const name = getTrimmedName(row);

    if (row._missing === true) {
      errors.push("Cette ligne n’apparaît dans aucune capture source.");
    }
    if (row._conflict === true) {
      errors.push("Les captures source contiennent des valeurs différentes pour cette ligne.");
    }
    if (typeof row.name !== "string") errors.push("Nom invalide.");

    for (const field of NUMERIC_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(row, field)) {
        errors.push(`${FIELD_LABELS[field]} absent de la structure.`);
        continue;
      }
      errors.push(...validateStoredInteger(field, row[field]));
    }

    const allNull = NUMERIC_FIELDS.every((field) => row[field] === null);
    const allZero = NUMERIC_FIELDS.every((field) => row[field] === 0);
    const allValidIntegers = NUMERIC_FIELDS.every((field) => {
      const value = row[field];
      const limits = NUMERIC_LIMITS[field];
      return Number.isInteger(value) && value >= limits.min && value <= limits.max;
    });

    let type = "invalid";

    if (!name) {
      if (allNull && errors.length === 0) {
        type = "vacant";
      } else {
        errors.push("Un nom est requis dès qu’une statistique est renseignée.");
      }
    } else if (!allValidIntegers) {
      for (const field of NUMERIC_FIELDS) {
        if (row[field] === null) errors.push(`${FIELD_LABELS[field]} est requis pour un joueur.`);
      }
    } else {
      type = allZero ? "inactive" : "active";
    }

    const finalErrors = unique(errors);
    if (finalErrors.length > 0) type = "invalid";

    return {
      type,
      label: CLASSIFICATIONS[type].label,
      isPlayer: CLASSIFICATIONS[type].isPlayer,
      errors: finalErrors,
      warnings: getCertainWarnings(row, type)
    };
  }

  function parseIntegerInput(field, rawValue) {
    const text = String(rawValue ?? "").trim();
    const label = FIELD_LABELS[field];
    const limits = NUMERIC_LIMITS[field];

    if (text === "") return { value: null, error: "" };
    if (!/^\d+$/.test(text)) {
      return { value: null, error: `${label} doit être un entier positif ou 0.` };
    }

    const value = Number(text);
    if (!Number.isSafeInteger(value)) {
      return { value: null, error: `${label} est trop grand pour être enregistré précisément.` };
    }
    if (value < limits.min || value > limits.max) {
      return {
        value,
        error: `${label} doit être compris entre ${limits.min.toLocaleString("fr-FR")} et ${limits.max.toLocaleString("fr-FR")}.`
      };
    }

    return { value, error: "" };
  }

  function parseEditorRow(buffer, rank) {
    const row = {
      rank,
      name: typeof buffer?.name === "string" ? buffer.name.trim() : ""
    };
    const fieldErrors = {};

    for (const field of NUMERIC_FIELDS) {
      const parsed = parseIntegerInput(field, buffer?.[field]);
      row[field] = parsed.value;
      fieldErrors[field] = parsed.error;
    }

    if (buffer?.name !== undefined && typeof buffer.name !== "string") {
      fieldErrors.name = "Le nom doit être du texte.";
    } else {
      fieldErrors.name = "";
    }

    const classification = classifyRow(row);
    const parseErrors = Object.values(fieldErrors).filter(Boolean);
    if (parseErrors.length > 0) {
      classification.type = "invalid";
      classification.label = CLASSIFICATIONS.invalid.label;
      classification.isPlayer = false;
      classification.errors = unique([...parseErrors, ...classification.errors]);
    }

    return { row, fieldErrors, classification };
  }

  function classifyDraft(draft) {
    const players = Array.isArray(draft?.players) ? draft.players : [];
    const rows = players.map((player, index) => ({
      index,
      rank: player?.rank ?? null,
      ...classifyRow(player)
    }));
    const counts = {
      total: players.length,
      active: rows.filter((row) => row.type === "active").length,
      inactive: rows.filter((row) => row.type === "inactive").length,
      vacant: rows.filter((row) => row.type === "vacant").length,
      invalid: rows.filter((row) => row.type === "invalid").length
    };
    const structureErrors = [];

    if (players.length !== 24) {
      structureErrors.push(`Le brouillon contient ${players.length} lignes au lieu de 24.`);
    }

    const ranks = players
      .map((player) => player?.rank)
      .filter((rank) => Number.isInteger(rank));
    const uniqueRanks = new Set(ranks);

    if (uniqueRanks.size !== ranks.length) {
      structureErrors.push("Le brouillon contient des rangs en doublon.");
    }

    const missingRanks = [];
    for (let rank = 1; rank <= 24; rank += 1) {
      if (!uniqueRanks.has(rank)) missingRanks.push(rank);
    }
    if (missingRanks.length > 0) {
      structureErrors.push(`Rangs absents : ${missingRanks.join(", ")}.`);
    }

    return {
      rows,
      counts,
      structureErrors,
      canValidate: counts.invalid === 0 && structureErrors.length === 0
    };
  }

  function rowEquals(left, right) {
    if (!left || !right || left.rank !== right.rank) return false;
    return EDITABLE_FIELDS.every((field) => left[field] === right[field]);
  }

  function isRowModified(originalRow, currentRow) {
    return !rowEquals(originalRow, currentRow);
  }

  function countModifiedFields(originalDraft, currentDraft) {
    const originalPlayers = Array.isArray(originalDraft?.players) ? originalDraft.players : [];
    const currentPlayers = Array.isArray(currentDraft?.players) ? currentDraft.players : [];
    const length = Math.max(originalPlayers.length, currentPlayers.length);
    let count = 0;

    for (let index = 0; index < length; index += 1) {
      const original = originalPlayers[index];
      const current = currentPlayers[index];
      if (!original || !current) {
        count += 1;
        continue;
      }
      if (original.rank !== current.rank) count += 1;
      for (const field of EDITABLE_FIELDS) {
        if (original[field] !== current[field]) count += 1;
      }
    }

    return count;
  }

  function buildValidatedDraft(draft) {
    const summary = classifyDraft(draft);
    if (!summary.canValidate) {
      throw new Error("Le brouillon contient encore des lignes invalides.");
    }

    return {
      date: draft.date,
      alliance: draft.alliance,
      captured_at: draft.captured_at,
      source: draft.source,
      players: draft.players
        .filter((player) => classifyRow(player).type !== "vacant")
        .map((player) => ({
          rank: player.rank,
          name: player.name,
          attack_points: player.attack_points,
          attacks: player.attacks,
          damage: player.damage,
          defense_wins: player.defense_wins,
          defense_bonus: player.defense_bonus
        }))
    };
  }

  const api = Object.freeze({
    CLASSIFICATIONS,
    EDITABLE_FIELDS,
    FIELD_LABELS,
    NUMERIC_FIELDS,
    NUMERIC_LIMITS,
    buildValidatedDraft,
    classifyDraft,
    classifyRow,
    cloneJson,
    countModifiedFields,
    isRowModified,
    parseEditorRow,
    parseIntegerInput
  });

  globalThis.MsfWarDraftValidation = api;
})();
