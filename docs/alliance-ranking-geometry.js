const DEFAULTS = Object.freeze({
  scanX: [0.18, 0.97],
  scanY: [0.24, 0.95],
  borderCoverage: 0.64,
  rowHeight: [0.11, 0.16],
  rowGap: [0.003, 0.018],
  minimumRowConfidence: 0.62
});

export const CUT_SCHEMA_VERSION = 1;

function isBlueBorder(data, offset) {
  const red = data[offset];
  const green = data[offset + 1];
  const blue = data[offset + 2];
  return green >= 58 && blue >= 90 && blue - red >= 22 && green - red >= 15 && blue >= green * 0.75;
}

function getPixelOffset(imageData, x, y) {
  return (y * imageData.width + x) * 4;
}

function findBoundaryGroups(imageData, options) {
  const { width, height, data } = imageData;
  const xStart = Math.floor(width * options.scanX[0]);
  const xEnd = Math.ceil(width * options.scanX[1]);
  const yStart = Math.floor(height * options.scanY[0]);
  const yEnd = Math.ceil(height * options.scanY[1]);
  const minCoverage = (xEnd - xStart) * options.borderCoverage;
  const rows = [];

  for (let y = yStart; y < yEnd; y++) {
    let count = 0;
    for (let x = xStart; x < xEnd; x++) {
      if (isBlueBorder(data, getPixelOffset(imageData, x, y))) count++;
    }
    if (count >= minCoverage) rows.push({ y, coverage: count / (xEnd - xStart) });
  }

  const groups = [];
  for (const row of rows) {
    const current = groups.at(-1);
    if (!current || row.y > current.lastY + 1) {
      groups.push({ firstY: row.y, lastY: row.y, sumY: row.y, strength: row.coverage, samples: 1 });
      continue;
    }
    current.lastY = row.y;
    current.sumY += row.y;
    current.strength += row.coverage;
    current.samples++;
  }
  return groups.map(group => ({
    y: group.sumY / group.samples,
    firstY: group.firstY,
    lastY: group.lastY,
    strength: group.strength / group.samples
  }));
}

function classifyInterval(distance, height, options) {
  if (distance >= height * options.rowHeight[0] && distance <= height * options.rowHeight[1]) return "row";
  if (distance >= height * options.rowGap[0] && distance <= height * options.rowGap[1]) return "gap";
  return null;
}

function findBestSequence(groups, height, options) {
  const candidates = [];
  for (let start = 0; start + 7 < groups.length; start++) {
    for (const first of ["row", "gap"]) {
      const intervals = [];
      let valid = true;
      for (let step = 0; step < 7; step++) {
        const distance = groups[start + step + 1].y - groups[start + step].y;
        const kind = classifyInterval(distance, height, options);
        const expected = step % 2 === 0 ? first : (first === "row" ? "gap" : "row");
        if (kind !== expected) {
          valid = false;
          break;
        }
        intervals.push({ distance, kind });
      }
      if (!valid) continue;

      const rowIntervals = intervals.filter(item => item.kind === "row").map(item => item.distance);
      const gapIntervals = intervals.filter(item => item.kind === "gap").map(item => item.distance);
      const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
      const rowMedian = median(rowIntervals);
      const gapMedian = median(gapIntervals);
      const rowError = rowIntervals.reduce((sum, value) => sum + Math.abs(value - rowMedian), 0) / rowIntervals.length / height;
      const gapError = gapIntervals.reduce((sum, value) => sum + Math.abs(value - gapMedian), 0) / gapIntervals.length / height;
      const meanStrength = groups.slice(start, start + 8).reduce((sum, group) => sum + group.strength, 0) / 8;
      const completeRows = first === "row" ? 4 : 3;
      const confidence = Math.max(0, Math.min(1, meanStrength - rowError * 2 - gapError * 2 - (first === "gap" ? 0.16 : 0)));
      candidates.push({ start, first, rowMedian, intervals, completeRows, confidence, score: completeRows + confidence });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.start - b.start);
  return candidates[0] || null;
}

function selectedGroups(groups, sequence) {
  return groups.slice(sequence.start, sequence.start + 8);
}

function detectHorizontalExtent(imageData, groups, options) {
  const { width, data } = imageData;
  const xStart = Math.floor(width * options.scanX[0]);
  const xEnd = Math.ceil(width * options.scanX[1]);
  const support = new Uint8Array(width);
  for (const group of groups) {
    for (let x = xStart; x < xEnd; x++) {
      let matched = false;
      for (let y = Math.max(group.firstY - 1, 0); y <= Math.min(group.lastY + 1, imageData.height - 1); y++) {
        if (isBlueBorder(data, getPixelOffset(imageData, x, y))) {
          matched = true;
          break;
        }
      }
      if (matched) support[x]++;
    }
  }
  const minimumSupport = 1;
  const runs = [];
  let runStart = -1;
  for (let x = xStart; x <= xEnd; x++) {
    if (x < xEnd && support[x] >= minimumSupport) {
      if (runStart < 0) runStart = x;
    } else if (runStart >= 0) {
      if (x - runStart > width * 0.35) runs.push({ x: runStart, end: x });
      runStart = -1;
    }
  }
  runs.sort((a, b) => (b.end - b.x) - (a.end - a.x));
  const run = runs[0];
  if (!run || run.x / width > 0.35 || run.end / width < 0.8) {
    return { x: 0.283, end: 0.906, confidence: "relative-layout-fallback" };
  }
  return {
    x: Math.max(0, (run.x - 2) / width),
    end: Math.min(1, (run.end + 2) / width),
    confidence: "visual-border"
  };
}

function normalizedBox(x, y, width, height) {
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
    width: Math.max(0, Math.min(1, width)),
    height: Math.max(0, Math.min(1, height))
  };
}

function makeCropBoxes(row) {
  const rowBox = row.rect;
  const y = rowBox.y + rowBox.height * 0.045;
  const height = rowBox.height * 0.91;
  const fields = {
    rank: [0.02, 0.145],
    allianceName: [0.288, 0.829],
    power: [0.836, 0.997]
  };
  return Object.fromEntries(Object.entries(fields).map(([key, [left, right]]) => [
    key,
    normalizedBox(rowBox.x + rowBox.width * left, y, rowBox.width * (right - left), height)
  ]));
}

export function detectRankingRows(imageData, overrides = {}) {
  if (!imageData || !Number.isInteger(imageData.width) || !Number.isInteger(imageData.height) || !imageData.data) {
    throw new TypeError("ImageData avec width, height et data requis.");
  }
  const options = { ...DEFAULTS, ...overrides };
  const groups = findBoundaryGroups(imageData, options);
  const sequence = findBestSequence(groups, imageData.height, options);
  if (!sequence || sequence.confidence < options.minimumRowConfidence) {
    return {
      schemaVersion: CUT_SCHEMA_VERSION,
      image: { width: imageData.width, height: imageData.height },
      rows: [],
      rejected: groups.map(group => ({ y: group.y / imageData.height, reason: "Aucune séquence de quatre lignes complète et régulière." })),
      diagnostics: { status: "no-confident-sequence", candidateBoundaries: groups.length }
    };
  }

  const selected = selectedGroups(groups, sequence);
  const extent = detectHorizontalExtent(imageData, selected, options);
  const height = imageData.height;
  const pairs = [];
  if (sequence.first === "row") {
    for (let row = 0; row < 4; row++) pairs.push([selected[row * 2], selected[row * 2 + 1], false]);
  } else {
    const firstBottom = selected[0];
    pairs.push([{ y: firstBottom.y - sequence.rowMedian, firstY: firstBottom.y - sequence.rowMedian, lastY: firstBottom.y - sequence.rowMedian }, firstBottom, true]);
    for (let row = 0; row < 3; row++) pairs.push([selected[row * 2 + 1], selected[row * 2 + 2], false]);
  }

  const x = extent.x;
  const width = extent.end - extent.x;
  const rows = pairs.map(([top, bottom, inferredTop], index) => {
    const topY = Math.max(0, top.y / height);
    const bottomY = Math.min(1, bottom.y / height);
    const row = {
      rowIndex: index + 1,
      confidence: Math.max(0, Math.min(1, sequence.confidence - (inferredTop ? 0.04 : 0))),
      inferredTop,
      rect: normalizedBox(x, topY, width, bottomY - topY)
    };
    row.crops = makeCropBoxes(row);
    return row;
  });

  const selectedSet = new Set(selected);
  const rejected = groups.filter(group => !selectedSet.has(group)).map(group => ({
    y: group.y / height,
    strength: group.strength,
    reason: group.y / height < 0.34
      ? "Bord du bandeau fixe, hors de la séquence du classement."
      : "Frontière isolée ou ligne partielle, hors de la séquence régulière retenue."
  }));
  return {
    schemaVersion: CUT_SCHEMA_VERSION,
    image: { width: imageData.width, height: imageData.height },
    rows,
    rejected,
    diagnostics: {
      status: "ok",
      boundaryCoverage: selected.reduce((sum, group) => sum + group.strength, 0) / selected.length,
      boundaryExtent: extent.confidence,
      topBoundaryInferred: sequence.first === "gap",
      candidateBoundaries: groups.length
    }
  };
}

export function createIdentityImageInput(sourceCanvas, normalizedCrop) {
  const x = Math.round(normalizedCrop.x * sourceCanvas.width);
  const y = Math.round(normalizedCrop.y * sourceCanvas.height);
  const width = Math.max(1, Math.round(normalizedCrop.width * sourceCanvas.width));
  const height = Math.max(1, Math.round(normalizedCrop.height * sourceCanvas.height));
  const crop = document.createElement("canvas");
  crop.width = width;
  crop.height = height;
  crop.getContext("2d", { willReadFrequently: false }).drawImage(sourceCanvas, x, y, width, height, 0, 0, width, height);
  return new Promise((resolve, reject) => crop.toBlob(blob => {
    if (!blob) return reject(new Error("La découpe n’a pas pu être préparée."));
    resolve({ schemaVersion: CUT_SCHEMA_VERSION, kind: "alliance-name-image", mimeType: blob.type, width, height, blob });
  }, "image/png"));
}
