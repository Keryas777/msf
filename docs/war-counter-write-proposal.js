import { canonicalTeamKey, ceilRatioToHundredth } from "./war-counter-matchup-preview.js";

export function normalizeSheetKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[-_‐-‒–—―﹘﹣－]/g, "")
    .replace(/[’'`´]/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function roleFields(role) {
  return role === "def"
    ? { family: "def_family", label: "def_variant", key: "def_key", charPrefix: "def_char" }
    : { family: "atk_family", label: "atk_team", key: "atk_key", charPrefix: "atk_char" };
}

function rowIds(row, prefix) {
  return [1, 2, 3, 4, 5]
    .map((index) => String(row?.[`${prefix}${index}`] || "").trim())
    .filter(Boolean);
}

function uniqueNonEmpty(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function mostFrequent(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"))[0]?.[0] || "";
}

export function suggestTeamSheetKey({ role, ids, teamInfo, rows, nameForId = (id) => id }) {
  const fields = roleFields(role);
  const list = Array.isArray(rows) ? rows : [];
  const compositionKey = canonicalTeamKey(ids);

  const sameCompositionKeys = uniqueNonEmpty(list
    .filter((row) => canonicalTeamKey(rowIds(row, fields.charPrefix)) === compositionKey)
    .map((row) => row[fields.key]));

  if (sameCompositionKeys.length === 1) {
    return { key: sameCompositionKeys[0], source: "composition" };
  }

  const family = String(teamInfo?.family || "").trim();
  const variant = String(teamInfo?.variant || "").trim();
  const sameVariantKeys = uniqueNonEmpty(list
    .filter((row) =>
      String(row?.[fields.family] || "").trim() === family &&
      String(row?.[fields.label] || "").trim() === variant
    )
    .map((row) => row[fields.key]));

  if (sameVariantKeys.length === 1) {
    return { key: sameVariantKeys[0], source: "variant" };
  }

  const classicalKeys = list
    .filter((row) => {
      const rowFamily = String(row?.[fields.family] || "").trim();
      const rowLabel = String(row?.[fields.label] || "").trim().toLowerCase();
      return rowFamily === family && rowLabel.includes("classique") && String(row?.[fields.key] || "").trim();
    })
    .map((row) => String(row[fields.key]).trim());

  let baseKey = mostFrequent(classicalKeys);
  let source = baseKey ? "family" : "generated";
  if (!baseKey) baseKey = normalizeSheetKey(family);

  if (!teamInfo?.exact && Array.isArray(teamInfo?.extraIds) && teamInfo.extraIds.length) {
    const suffix = teamInfo.extraIds
      .map((id) => normalizeSheetKey(nameForId(id)))
      .filter(Boolean)
      .join("");
    return { key: `${baseKey}${suffix}`, source };
  }

  return { key: baseKey || normalizeSheetKey(variant), source };
}

export function buildWriteProposal({ preview, rows, nameForId = (id) => id }) {
  if (!preview?.state || !preview?.comparison) return null;
  const action = preview.comparison.status;
  if (action !== "new" && action !== "improves") return null;

  const state = preview.state;
  const ratio = ceilRatioToHundredth(state.ratio);
  if (!ratio) return null;

  if (action === "improves") {
    return {
      action: "update",
      ratio,
      previousRatio: preview.comparison.existingRatio,
      attackIds: [...state.attackIds],
      defenseIds: [...state.defenseIds],
      attackPower: state.attackPower,
      defensePower: state.defensePower,
      matchingRows: preview.comparison.matches.map((match) => match.index + 2),
      metadata: null
    };
  }

  if (preview.attackTeam?.status !== "resolved" || preview.defenseTeam?.status !== "resolved") {
    return {
      action: "blocked",
      reason: "team-name-unresolved",
      ratio,
      attackIds: [...state.attackIds],
      defenseIds: [...state.defenseIds]
    };
  }

  const defKey = suggestTeamSheetKey({
    role: "def",
    ids: state.defenseIds,
    teamInfo: preview.defenseTeam,
    rows,
    nameForId
  });
  const atkKey = suggestTeamSheetKey({
    role: "atk",
    ids: state.attackIds,
    teamInfo: preview.attackTeam,
    rows,
    nameForId
  });

  return {
    action: "create",
    ratio,
    attackIds: [...state.attackIds],
    defenseIds: [...state.defenseIds],
    attackPower: state.attackPower,
    defensePower: state.defensePower,
    metadata: {
      def_family: preview.defenseTeam.family,
      def_variant: preview.defenseTeam.variant,
      def_key: defKey.key,
      atk_family: preview.attackTeam.family,
      atk_team: preview.attackTeam.variant,
      atk_key: atkKey.key,
      notes: ""
    },
    keySources: {
      def: defKey.source,
      atk: atkKey.source
    }
  };
}
