((root, factory) => {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MsfWarAnalysis = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  "use strict";

  const ANALYSIS_KEYS = ["rank", "name", "analysis"];

  function cloneValue(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function hasExactKeys(value, expectedKeys) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const keys = Object.keys(value).sort();
    return keys.length === expectedKeys.length
      && keys.every((key, index) => key === [...expectedKeys].sort()[index]);
  }

  function validateAnalysesResponse(response, rankedReport) {
    if (!hasExactKeys(response, ["analyses"])) {
      throw new Error("La réponse IA doit contenir uniquement la clé analyses.");
    }
    const players = rankedReport?.report?.players;
    if (!Array.isArray(players) || !Array.isArray(response.analyses)) {
      throw new Error("Le rapport classé ou la liste des analyses est invalide.");
    }
    if (response.analyses.length !== players.length) {
      throw new Error("Le nombre d’analyses ne correspond pas au nombre de joueurs.");
    }

    const expectedByRank = new Map(players.map((player) => [player.rank, player.name]));
    const seenRanks = new Set();
    const seenNames = new Set();

    for (const entry of response.analyses) {
      if (!hasExactKeys(entry, ANALYSIS_KEYS)) {
        throw new Error("Chaque analyse doit contenir uniquement rank, name et analysis.");
      }
      if (!Number.isInteger(entry.rank) || expectedByRank.get(entry.rank) !== entry.name) {
        throw new Error("Une analyse référence un rang ou un nom inconnu.");
      }
      if (seenRanks.has(entry.rank) || seenNames.has(entry.name)) {
        throw new Error("La réponse IA contient un joueur en doublon.");
      }
      if (typeof entry.analysis !== "string" || entry.analysis.trim() === "") {
        throw new Error("Une analyse est vide.");
      }
      seenRanks.add(entry.rank);
      seenNames.add(entry.name);
    }

    return response.analyses.map((entry) => ({
      rank: entry.rank,
      name: entry.name,
      analysis: entry.analysis.trim()
    }));
  }

  function mergeAnalyses(rankedReport, response) {
    const analyses = validateAnalysesResponse(response, rankedReport);
    const analysisByRank = new Map(analyses.map((entry) => [entry.rank, entry]));
    const finalReport = cloneValue(rankedReport);
    finalReport.report.players = finalReport.report.players.map((player) => ({
      ...player,
      analysis: analysisByRank.get(player.rank).analysis
    }));
    return finalReport;
  }

  function buildAnalysisPayload(rankedReport) {
    if (!rankedReport?.report?.summary || !Array.isArray(rankedReport.report.ranking)
      || !Array.isArray(rankedReport.report.players)) {
      throw new Error("Le rapport doit être classé avant la rédaction.");
    }
    return {
      alliance: rankedReport.alliance,
      date: rankedReport.date,
      report: {
        summary: cloneValue(rankedReport.report.summary),
        ranking: cloneValue(rankedReport.report.ranking),
        players: cloneValue(rankedReport.report.players)
      }
    };
  }

  return { buildAnalysisPayload, mergeAnalyses, validateAnalysesResponse };
});
