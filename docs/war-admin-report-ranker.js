(() => {
  "use strict";

  function cloneValue(value) {
    if (Array.isArray(value)) return value.map(cloneValue);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]));
    }
    return value;
  }

  function descending(left, right, key) {
    return right[key] - left[key];
  }

  function comparePlayers(left, right) {
    return descending(left, right, "score_total")
      || descending(left, right, "score_impact")
      || descending(left, right, "score_efficiency")
      || descending(left, right, "score_activity")
      || left.original_rank - right.original_rank;
  }

  function rankReport(calculatedReport) {
    if (!calculatedReport || typeof calculatedReport !== "object" || Array.isArray(calculatedReport)) {
      throw new TypeError("Le rapport calculé doit être un objet JSON.");
    }
    if (!calculatedReport.report || !Array.isArray(calculatedReport.report.players)) {
      throw new TypeError("Le rapport calculé doit contenir report.players.");
    }

    const rankedReport = cloneValue(calculatedReport);
    rankedReport.report.players.sort(comparePlayers);
    rankedReport.report.players.forEach((player, index) => {
      player.rank = index + 1;
    });
    rankedReport.report.ranking = rankedReport.report.players.map((player) => ({
      rank: player.rank,
      name: player.name,
      score: player.score_total
    }));
    return rankedReport;
  }

  globalThis.MsfWarReportRanker = Object.freeze({
    comparePlayers,
    rankReport
  });
})();
