(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WarResultRecognition = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const FIELDS = ["localAlliance", "opponentAlliance", "localScore", "opponentScore", "localTrophies", "opponentTrophies", "result"];
  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const toSearchKey = (value) => clean(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
  const exactName = (value) => clean(value).normalize("NFKC").toLocaleLowerCase();
  const text = (w) => clean(w.text);
  const box = (w) => w.bbox || { x0: w.x0 ?? w.left ?? 0, y0: w.y0 ?? w.top ?? 0, x1: w.x1 ?? ((w.left || 0) + (w.width || 0)), y1: w.y1 ?? ((w.top || 0) + (w.height || 0)) };
  const midX = (w) => (box(w).x0 + box(w).x1) / 2;
  const midY = (w) => (box(w).y0 + box(w).y1) / 2;
  const confidence = (w) => Math.max(0, Math.min(100, Number(w.confidence ?? w.conf ?? 0)));
  const validWord = (w) => text(w) && confidence(w) >= 15;
  const numeric = (w) => /^\d+$/.test(text(w)) ? text(w) : "";
  const evidence = (value, words, source) => ({ value, confidence: words.length ? Math.round(words.reduce((sum, w) => sum + confidence(w), 0) / words.length) : null, source, uncertain: !value || words.length === 0 || words.some((w) => confidence(w) < 55) });

  function parseTsv(tsv, offset = { x: 0, y: 0 }, scale = 1) {
    const lines = String(tsv || "").split(/\r?\n/);
    if (!lines.length) return [];
    const standard = ["level", "page_num", "block_num", "par_num", "line_num", "word_num", "left", "top", "width", "height", "conf", "text"];
    const first = lines[0].split("\t");
    const hasHeader = first[0] === "level";
    const headers = hasHeader ? first : standard;
    const index = Object.fromEntries(headers.map((name, i) => [name, i]));
    return lines.slice(hasHeader ? 1 : 0).flatMap((line) => {
      const cols = line.split("\t");
      if (Number(cols[index.level]) !== 5 || !cols[index.text]) return [];
      const left = offset.x + Number(cols[index.left] || 0) / scale;
      const top = offset.y + Number(cols[index.top] || 0) / scale;
      const width = Number(cols[index.width] || 0) / scale;
      const height = Number(cols[index.height] || 0) / scale;
      return [{ text: cols[index.text], confidence: Number(cols[index.conf] || 0), bbox: { x0: left, y0: top, x1: left + width, y1: top + height } }];
    });
  }

  function groupRows(words, tolerance) {
    const rows = [];
    for (const word of words.filter(validWord).sort((a, b) => midY(a) - midY(b) || midX(a) - midX(b))) {
      let row = rows.find((candidate) => Math.abs(candidate.y - midY(word)) <= tolerance);
      if (!row) { row = { y: midY(word), words: [] }; rows.push(row); }
      row.words.push(word);
      row.y = row.words.reduce((sum, item) => sum + midY(item), 0) / row.words.length;
    }
    return rows.map((row) => ({ ...row, words: row.words.sort((a, b) => midX(a) - midX(b)) }));
  }

  function candidateFromRow(row, side, width, digits) {
    const sideWords = row.words.filter((w) => (side === "left" ? midX(w) < width * 0.49 : midX(w) > width * 0.51));
    const candidates = [];
    for (const word of sideWords) {
      const value = numeric(word);
      if (value.length === digits) candidates.push({ value, words: [word] });
    }
    if (candidates.length) return candidates.sort((a, b) => confidence(b.words[0]) - confidence(a.words[0]))[0];
    const fragments = sideWords.map((w) => ({ word: w, value: numeric(w) })).filter((part) => part.value.length > 0 && part.value.length <= digits);
    for (let start = 0; start < fragments.length; start++) {
      let value = "", selected = [];
      for (let i = start; i < fragments.length && i < start + 4; i++) {
        value += fragments[i].value; selected.push(fragments[i].word);
        if (value.length === digits) candidates.push({ value, words: selected });
        if (value.length >= digits) break;
      }
    }
    return candidates.sort((a, b) => b.words.reduce((s, w) => s + confidence(w), 0) - a.words.reduce((s, w) => s + confidence(w), 0))[0] || null;
  }

  function findLabelRow(rows, label) {
    return rows.filter((row) => row.words.some((w) => toSearchKey(text(w)).includes(label))).sort((a, b) => b.words.filter((w) => toSearchKey(text(w)).includes(label)).reduce((s,w)=>s+confidence(w),0) - a.words.filter((w) => toSearchKey(text(w)).includes(label)).reduce((s,w)=>s+confidence(w),0))[0] || null;
  }

  function allianceFields(words, width, height) {
    const rows = groupRows(words, height * 0.028);
    const lospRow = rows.filter((r) => r.words.some((w) => toSearchKey(text(w)) === "losp")).sort((a,b)=>Math.max(...b.words.map(confidence))-Math.max(...a.words.map(confidence)))[0];
    if (!lospRow) return { localAlliance: evidence("", [], "top-header"), opponentAlliance: evidence("", [], "top-header") };
    const losp = lospRow.words.find((w) => toSearchKey(text(w)) === "losp");
    const localParts = lospRow.words.filter((w) => midX(w) > box(losp).x1 - width * 0.006 && midX(w) < width * 0.48 && w !== losp);
    let localWords = localParts.filter(validWord).sort((a,b)=>midX(a)-midX(b));
    const knownLocal = ["Zeus", "Dionysos", "Poseidon", "Athena", "Kronos"];
    const localPool = [...safeWordsFromRows(rows)];
    const knownHit = localPool.filter((w) => knownLocal.some((name) => toSearchKey(text(w)) === toSearchKey(name)) && midX(w) > width * 0.20 && midX(w) < width * 0.49 && midY(w) < height * 0.24).sort((a,b)=>confidence(b)-confidence(a))[0];
    if (knownHit) localWords = [knownHit];
    const opponentWords = lospRow.words.filter((w) => midX(w) > width * 0.62 && validWord(w) && /\p{L}/u.test(text(w)));
    const opponentValue = opponentWords.map(text).join(" ");
    const opponentEvidence = evidence(opponentValue, opponentWords, "same-row-right-side");
    if (/[A-Z]@[A-Z]|[$|]/i.test(opponentValue)) opponentEvidence.uncertain = true;
    return {
      localAlliance: evidence(localWords.map(text).join(" "), localWords, "same-row-after-LoSP"),
      opponentAlliance: opponentEvidence
    };
  }

  function safeWordsFromRows(rows) { return rows.flatMap((row) => row.words); }

  function numericField(words, labelRow, width, height, digits, source) {
    if (!labelRow) return evidence("", [], source);
    const rowTolerance = height * 0.028;
    const nearest = groupRows(words, rowTolerance).filter((row) => Math.abs(row.y - labelRow.y) <= height * 0.035).sort((a,b)=>Math.abs(a.y-labelRow.y)-Math.abs(b.y-labelRow.y))[0];
    const candidate = nearest && candidateFromRow(nearest, source === "score-row" ? "left" : "left", width, digits);
    return candidate ? evidence(candidate.value, candidate.words, source) : evidence("", [], source);
  }

  function extract(words, width, height, options = {}) {
    const safeWords = Array.isArray(words) ? words : [];
    const rows = groupRows(safeWords, height * 0.028);
    const pointsRow = findLabelRow(rows, "points");
    const trophyAnchor = rows.filter((r) => r.words.some((w) => toSearchKey(text(w)) === "losp")).sort((a,b)=>Math.max(...b.words.map(confidence))-Math.max(...a.words.map(confidence)))[0];
    const alliances = allianceFields(safeWords, width, height);
    const scoreAt = (side) => {
      if (!pointsRow) return evidence("", [], "points-row");
      const row = rows.filter((r) => Math.abs(r.y - pointsRow.y) <= height * 0.035).sort((a,b)=>Math.abs(a.y-pointsRow.y)-Math.abs(b.y-pointsRow.y))[0];
      const candidate = row && candidateFromRow(row, side, width, 6);
      return candidate ? evidence(candidate.value, candidate.words, "points-row") : evidence("", [], "points-row");
    };
    const trophyAt = (side) => {
      if (!trophyAnchor) return evidence("", [], "trophy-header-row");
      const trophyY = trophyAnchor.y + height * 0.075;
      const row = rows.filter((r) => Math.abs(r.y - trophyY) <= height * 0.045).sort((a,b)=>Math.abs(a.y-trophyY)-Math.abs(b.y-trophyY))[0];
      if (!row) return evidence("", [], "trophy-header-row");
      // On this result layout the trophy total precedes the +/- change. Keep
      // only the leftmost numeric glyph group in each alliance half so a
      // misread delta such as "0750" cannot become the opponent total.
      const totalZone = row.words.filter((w) => side === "left"
        ? midX(w) > width * 0.12 && midX(w) < width * 0.31
        : midX(w) > width * 0.58 && midX(w) < width * 0.69);
      const totalRow = { ...row, words: totalZone };
      const candidate = candidateFromRow(totalRow, side, width, 4);
      if (candidate) return evidence(candidate.value, candidate.words, "trophy-header-row");
      // Some captures have one stray glyph joined to the four digit total.
      // Offer a visibly uncertain candidate; it is never accepted as verified.
      const joined = totalZone.find((w) => /^9\d{4}$/.test(text(w)));
      if (side === "left" && joined) return { ...evidence(text(joined).slice(1), [joined], "trophy-header-joined-glyph"), uncertain: true };
      return evidence("", [], "trophy-header-row");
    };
    const colorResult = options.colorResult || null;
    const localScore = scoreAt("left");
    const opponentScore = scoreAt("right");
    const localTrophies = trophyAt("left");
    const opponentTrophies = trophyAt("right");
    let result = evidence(colorResult || "", [], "title-color");
    const warnings = [];
    const parseNumber = (x) => /^\d+$/.test(x.value) ? Number(x.value) : null;
    const ls = parseNumber(localScore), os = parseNumber(opponentScore);
    if (ls === null || os === null) warnings.push("score_missing_or_invalid");
    if (ls !== null && os !== null && colorResult && ((ls > os) !== (colorResult === "win"))) warnings.push("score_result_conflict");
    if (localScore.value && localScore.value === localTrophies.value || opponentScore.value && opponentScore.value === opponentTrophies.value) warnings.push("score_trophy_confusion_possible");
    if (!alliances.opponentAlliance.value || alliances.opponentAlliance.uncertain) warnings.push("opponent_alliance_uncertain");
    if (localScore.uncertain || opponentScore.uncertain || localTrophies.uncertain || opponentTrophies.uncertain) warnings.push("numeric_value_uncertain");
    if (!colorResult) warnings.push("result_color_uncertain");
    const fields = { ...alliances, localScore, opponentScore, localTrophies, opponentTrophies, result };
    const suggestions = Object.fromEntries(FIELDS.map((field) => [field, fields[field].value]));
    const originalOpponentName = clean(alliances.opponentAlliance.value);
    return { fields, suggestions, opponentName: { original: originalOpponentName, matchKey: toSearchKey(originalOpponentName), uncertain: alliances.opponentAlliance.uncertain }, warnings, needsManualReview: true };
  }

  function validate(fields, imageWidth, imageHeight, options = {}) {
    const problems = [];
    for (const field of ["localScore", "opponentScore", "localTrophies", "opponentTrophies"]) {
      const value = String(fields[field] ?? "").replace(/[\s,]/g, "");
      const expectedLength = field.includes("Score") ? 6 : 4;
      if (!new RegExp(`^\\d{${expectedLength}}$`).test(value)) problems.push(`${field}:invalid`);
    }
    if (!clean(fields.localAlliance)) problems.push("localAlliance:missing");
    if (!clean(fields.opponentAlliance)) problems.push("opponentAlliance:missing_or_uncertain");
    if (clean(fields.localAlliance) && clean(fields.opponentAlliance) && toSearchKey(fields.localAlliance) === toSearchKey(fields.opponentAlliance)) problems.push("alliances:duplicate_or_inverted");
    if (!["win", "loss"].includes(fields.result)) problems.push("result:missing");
    const localScore = Number(String(fields.localScore || "").replace(/\D/g, ""));
    const opponentScore = Number(String(fields.opponentScore || "").replace(/\D/g, ""));
    const localTrophies = Number(String(fields.localTrophies || "").replace(/\D/g, ""));
    const opponentTrophies = Number(String(fields.opponentTrophies || "").replace(/\D/g, ""));
    if (localScore && localTrophies && localScore === localTrophies || opponentScore && opponentTrophies && opponentScore === opponentTrophies) problems.push("numbers:score_trophy_confusion");
    if (Number.isFinite(localScore) && Number.isFinite(opponentScore) && localScore !== opponentScore && ((localScore > opponentScore) !== (fields.result === "win"))) problems.push("result:score_conflict");
    if (options.colorResult && fields.result && options.colorResult !== fields.result) problems.push("result:color_conflict");
    if (options.confidence && FIELDS.some((field) => options.confidence[field] != null && options.confidence[field] < 45)) problems.push("field:low_confidence");
    if (imageWidth < 1 || imageHeight < 1) problems.push("image:invalid_dimensions");
    return { valid: problems.length === 0, problems };
  }

  return { FIELDS, parseTsv, extract, validate, toSearchKey };
});
