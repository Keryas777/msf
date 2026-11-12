(() => {
  "use strict";
  const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const toMatchKey = (value) => clean(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
  function validate(fields, date) {
    const problems = [];
    if (!clean(fields.localAlliance)) problems.push("localAlliance:missing");
    if (!clean(fields.opponentAlliance)) problems.push("opponentAlliance:missing_or_uncertain");
    if (toMatchKey(fields.localAlliance) && toMatchKey(fields.localAlliance) === toMatchKey(fields.opponentAlliance)) problems.push("alliances:duplicate");
    for (const key of ["localScore", "opponentScore"]) if (!/^\d{6}$/.test(String(fields[key] || ""))) problems.push(`${key}:invalid`);
    for (const key of ["localTrophies", "opponentTrophies"]) if (!/^\d{4}$/.test(String(fields[key] || ""))) problems.push(`${key}:invalid`);
    if (!/^(win|loss)$/.test(fields.result || "")) problems.push("result:missing");
    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date || "") ? new Date(`${date}T00:00:00Z`) : null;
    if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) problems.push("warDate:required_or_invalid");
    if (fields.localScore && fields.localScore === fields.localTrophies || fields.opponentScore && fields.opponentScore === fields.opponentTrophies) problems.push("numbers:score_trophy_confusion");
    if (/^\d{6}$/.test(fields.localScore || "") && /^\d{6}$/.test(fields.opponentScore || "") && fields.localScore !== fields.opponentScore && ((Number(fields.localScore) > Number(fields.opponentScore)) !== (fields.result === "win"))) problems.push("result:score_conflict");
    return { valid: problems.length === 0, problems };
  }
  function buildRecord(fields, date, provenance = {}) {
    const validation = validate(fields, date);
    if (!validation.valid) throw new Error(`Fiche invalide : ${validation.problems.join(", ")}`);
    return {
      schemaVersion: "1.0.0",
      status: "validated-locally-not-published",
      warDate: date,
      localAllianceId: null,
      localAllianceName: clean(fields.localAlliance),
      opponentAllianceOriginal: clean(fields.opponentAlliance),
      opponentAllianceMatchKey: toMatchKey(fields.opponentAlliance),
      localScore: Number(fields.localScore),
      opponentScore: Number(fields.opponentScore),
      localTrophies: Number(fields.localTrophies),
      opponentTrophies: Number(fields.opponentTrophies),
      result: fields.result,
      provenance: {
        source: "local-screenshot-ocr",
        sourceFileName: provenance.fileName || null,
        methods: provenance.methods || [],
        manualCorrections: provenance.manualCorrections || [],
        validatedAt: new Date().toISOString(),
        publication: "none"
      }
    };
  }
  if (typeof window !== "undefined") window.WarResultsVisionData = { clean, toMatchKey, validate, buildRecord };
  if (typeof module === "object" && module.exports) module.exports = { clean, toMatchKey, validate, buildRecord };
})();
