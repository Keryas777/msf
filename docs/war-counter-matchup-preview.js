export function canonicalTeamKey(ids) {
  return [...new Set((Array.isArray(ids) ? ids : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
    .join("|");
}

export function ceilRatioToHundredth(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return Math.ceil(number * 100 - 1e-10) / 100;
}

function normalizedTeamRows(teams) {
  const rows = (Array.isArray(teams) ? teams : [])
    .map((team, index) => {
      const name = String(team?.team || "").trim();
      const mode = String(team?.mode || "").trim();
      const characters = [...new Set((Array.isArray(team?.characters) ? team.characters : [])
        .map((id) => String(id || "").trim())
        .filter(Boolean))];
      if (!name || characters.length < 3) return null;
      return {
        index,
        name,
        mode,
        characters,
        key: canonicalTeamKey(characters),
        set: new Set(characters)
      };
    })
    .filter(Boolean);

  const deduped = new Map();
  for (const row of rows) {
    const key = `${row.name}::${row.key}`;
    const existing = deduped.get(key);
    if (!existing || (row.mode === "Guerre" && existing.mode !== "Guerre")) {
      deduped.set(key, row);
    }
  }
  return [...deduped.values()];
}

export function resolveTeamFromDefinitions(ids, teams) {
  const observed = [...new Set((Array.isArray(ids) ? ids : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean))];

  if (observed.length < 3) {
    return { status: "unresolved", exact: false, family: "", extraIds: [], candidates: [] };
  }

  const observedSet = new Set(observed);
  const observedKey = canonicalTeamKey(observed);
  const rows = normalizedTeamRows(teams);

  const exact = rows.filter((row) => row.characters.length === observed.length && row.key === observedKey);
  if (exact.length) {
    const names = [...new Set(exact.map((row) => row.name))];
    return {
      status: names.length === 1 ? "resolved" : "ambiguous",
      exact: true,
      family: names.length === 1 ? names[0] : "",
      extraIds: [],
      candidates: exact.map((row) => ({ team: row.name, mode: row.mode, overlap: observed.length }))
    };
  }

  const scored = rows
    .map((row) => {
      const overlapIds = row.characters.filter((id) => observedSet.has(id));
      return {
        ...row,
        overlap: overlapIds.length,
        extraIds: observed.filter((id) => !row.set.has(id))
      };
    })
    .filter((row) => row.overlap >= 3);

  if (!scored.length) {
    return { status: "unresolved", exact: false, family: "", extraIds: [], candidates: [] };
  }

  const maxOverlap = Math.max(...scored.map((row) => row.overlap));
  const best = scored.filter((row) => row.overlap === maxOverlap);
  const minExtra = Math.min(...best.map((row) => row.extraIds.length));
  const finalists = best.filter((row) => row.extraIds.length === minExtra);
  const names = [...new Set(finalists.map((row) => row.name))];

  if (names.length !== 1) {
    return {
      status: "ambiguous",
      exact: false,
      family: "",
      extraIds: [],
      candidates: finalists.map((row) => ({
        team: row.name,
        mode: row.mode,
        overlap: row.overlap,
        extraIds: row.extraIds
      }))
    };
  }

  const chosen = finalists.find((row) => row.mode === "Guerre") || finalists[0];
  return {
    status: "resolved",
    exact: false,
    family: chosen.name,
    extraIds: chosen.extraIds,
    candidates: finalists.map((row) => ({
      team: row.name,
      mode: row.mode,
      overlap: row.overlap,
      extraIds: row.extraIds
    }))
  };
}

export function buildTeamLabels(ids, teams, nameForId = (id) => id) {
  const resolved = resolveTeamFromDefinitions(ids, teams);
  if (resolved.status !== "resolved") {
    return {
      ...resolved,
      variant: ""
    };
  }

  if (resolved.exact) {
    return {
      ...resolved,
      variant: `${resolved.family} "classique"`
    };
  }

  const extras = resolved.extraIds.map((id) => nameForId(id)).filter(Boolean);
  return {
    ...resolved,
    variant: extras.length
      ? `${resolved.family} + ${extras.join(" + ")}`
      : resolved.family
  };
}

function rowIds(row, prefix) {
  return [1, 2, 3, 4, 5]
    .map((index) => String(row?.[`${prefix}_char${index}`] || "").trim())
    .filter(Boolean);
}

export function findMatchingCounters(rows, attackIds, defenseIds) {
  const attackKey = canonicalTeamKey(attackIds);
  const defenseKey = canonicalTeamKey(defenseIds);

  return (Array.isArray(rows) ? rows : [])
    .map((row, index) => ({ row, index }))
    .filter(({ row }) =>
      canonicalTeamKey(rowIds(row, "atk")) === attackKey &&
      canonicalTeamKey(rowIds(row, "def")) === defenseKey
    );
}

export function summarizeCounterComparison(matches, newRatio) {
  const ratio = ceilRatioToHundredth(newRatio);
  if (!ratio) return { status: "invalid", ratio: null, matches: [] };
  if (!matches.length) return { status: "new", ratio, matches: [] };

  const enriched = matches.map(({ row, index }) => ({
    index,
    defFamily: String(row.def_family || "").trim(),
    defVariant: String(row.def_variant || "").trim(),
    atkFamily: String(row.atk_family || "").trim(),
    atkTeam: String(row.atk_team || "").trim(),
    hardRatio: Number(String(row.min_ratio_hard || "").replace(",", "."))
  }));

  const validRatios = enriched
    .map((item) => item.hardRatio)
    .filter((value) => Number.isFinite(value) && value > 0);

  const uniqueRatios = [...new Set(validRatios.map((value) => value.toFixed(6)))];

  if (!validRatios.length || uniqueRatios.length !== 1) {
    return { status: "conflict", ratio, matches: enriched };
  }

  const existingRatio = validRatios[0];
  let status = "same";
  if (ratio < existingRatio) status = "improves";
  else if (ratio > existingRatio) status = "worse";

  return {
    status,
    ratio,
    existingRatio,
    matches: enriched
  };
}
