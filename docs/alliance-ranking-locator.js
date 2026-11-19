import {
  CUT_SCHEMA_VERSION,
  createIdentityImageInput,
  detectRankingRows
} from "./alliance-ranking-geometry.js";

const $ = id => document.getElementById(id);
const input = $("captureFiles");
const list = $("captureList");
const status = $("globalStatus");
const exportButton = $("exportJson");
const clearButton = $("clearCaptures");
const captures = [];

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function svgElement(tag, attributes = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, url });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Cette image n’a pas pu être ouverte."));
    };
    image.src = url;
  });
}

function slider(label, key, value, min, max, step, onChange) {
  const wrapper = element("label", "geometryControl");
  const heading = element("span", "geometryControlLabel");
  const name = element("span", "", label);
  const output = element("output", "", `${(value * 100).toFixed(1)} %`);
  heading.append(name, output);
  const range = element("input");
  range.type = "range";
  range.dataset.geometry = key;
  range.min = String(min);
  range.max = String(max);
  range.step = String(step);
  range.value = String(value);
  range.addEventListener("input", () => {
    output.value = `${(Number(range.value) * 100).toFixed(1)} %`;
    onChange(key, Number(range.value));
  });
  wrapper.append(heading, range);
  return wrapper;
}

function drawCapture(capture) {
  const { overlay, sourceCanvas, analysis } = capture;
  overlay.replaceChildren();
  for (const row of analysis.rows) {
    const { x, y, width, height } = row.rect;
    const active = row.rowIndex === capture.activeRow;
    const rect = svgElement("rect", {
      x: x * sourceCanvas.width,
      y: y * sourceCanvas.height,
      width: width * sourceCanvas.width,
      height: height * sourceCanvas.height,
      class: active ? "detectedRow is-active" : "detectedRow",
      "data-row": row.rowIndex
    });
    const label = svgElement("text", {
      x: x * sourceCanvas.width + 8,
      y: y * sourceCanvas.height + Math.max(24, sourceCanvas.height / 28),
      class: "detectedRowLabel",
      "pointer-events": "none"
    });
    label.textContent = String(row.rowIndex);
    overlay.append(rect, label);
  }
}

function drawCrop(canvas, source, box) {
  const x = Math.max(0, Math.round(box.x * source.width));
  const y = Math.max(0, Math.round(box.y * source.height));
  const width = Math.max(1, Math.min(source.width - x, Math.round(box.width * source.width)));
  const height = Math.max(1, Math.min(source.height - y, Math.round(box.height * source.height)));
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(source, x, y, width, height, 0, 0, width, height);
}

function updateRow(capture, row, key, value) {
  const rect = row.rect;
  rect[key] = value;
  if (key === "x") rect.width = Math.min(rect.width, 1 - rect.x);
  if (key === "y") rect.height = Math.min(rect.height, 1 - rect.y);
  if (key === "width") rect.width = Math.min(rect.width, 1 - rect.x);
  if (key === "height") rect.height = Math.min(rect.height, 1 - rect.y);
  row.crops = {
    rank: cropFromRow(rect, 0.02, 0.145),
    allianceName: cropFromRow(rect, 0.288, 0.829),
    power: cropFromRow(rect, 0.836, 0.997)
  };
  const card = capture.rowContainer.children[row.rowIndex - 1];
  for (const range of card?.querySelectorAll("input[data-geometry]") || []) {
    const name = range.dataset.geometry;
    range.value = String(rect[name]);
    if (name === "width") range.max = String(Math.max(Number(range.min), 1 - rect.x));
    if (name === "height") range.max = String(Math.max(Number(range.min), Math.min(0.2, 1 - rect.y)));
    const output = range.closest("label")?.querySelector("output");
    if (output) output.value = `${(rect[name] * 100).toFixed(1)} %`;
  }
  drawCapture(capture);
  for (const [field, canvas] of Object.entries(capture.cropCanvases.get(row.rowIndex))) drawCrop(canvas, capture.sourceCanvas, row.crops[field]);
  updateGeometryReadout(capture, row);
  updateExportState();
}

function cropFromRow(rect, left, right) {
  return {
    x: rect.x + rect.width * left,
    y: rect.y + rect.height * 0.045,
    width: rect.width * (right - left),
    height: rect.height * 0.91
  };
}

function updateGeometryReadout(capture, row) {
  const values = capture.geometryOutputs.get(row.rowIndex);
  if (!values) return;
  values.rect.textContent = Object.values(row.rect).map(value => value.toFixed(4)).join(" · ");
  values.crops.textContent = Object.entries(row.crops).map(([key, box]) => `${key}: ${Object.values(box).map(value => value.toFixed(4)).join(" / ")}`).join("\n");
}

function attachCanvasCorrection(capture) {
  capture.overlay.addEventListener("pointerdown", event => {
    const selectedIndex = Number(event.target.closest?.("[data-row]")?.dataset.row);
    const row = capture.analysis.rows.find(item => item.rowIndex === selectedIndex);
    if (!row) return;
    capture.activeRow = row.rowIndex;
    drawCapture(capture);
    renderRowCards(capture);
  });
}

function renderRowCards(capture) {
  capture.rowContainer.replaceChildren();
  capture.cropCanvases.clear();
  capture.geometryOutputs.clear();
  for (const row of capture.analysis.rows) {
    const card = element("article", `rowCard${capture.activeRow === row.rowIndex ? " is-active" : ""}`);
    card.tabIndex = 0;
    card.addEventListener("click", event => {
      if (event.target.closest(".geometryDetails, input")) return;
      capture.activeRow = row.rowIndex;
      drawCapture(capture);
      renderRowCards(capture);
    });
    const heading = element("header", "rowCardHeading");
    heading.append(element("h3", "", `Ligne ${row.rowIndex}`), element("span", "confidence", `${Math.round(row.confidence * 100)} %${row.inferredTop ? " · haut estimé" : ""}`));
    const crops = element("div", "cropGrid");
    const cropCanvases = {};
    for (const [field, label] of [["rank", "Rang"], ["allianceName", "Nom enrichi"], ["power", "Puissance"]]) {
      const preview = element("figure", `cropPreview cropPreview--${field}`);
      const canvas = element("canvas", "cropCanvas");
      const caption = element("figcaption", "", label);
      preview.append(canvas, caption);
      crops.append(preview);
      cropCanvases[field] = canvas;
      drawCrop(canvas, capture.sourceCanvas, row.crops[field]);
    }
    capture.cropCanvases.set(row.rowIndex, cropCanvases);

    const controls = element("details", "geometryDetails");
    controls.append(element("summary", "", "Corriger les coordonnées"));
    const controlGrid = element("div", "geometryControls");
    for (const [key, label, min, max, step] of [
      ["x", "X", 0, 0.8, 0.001], ["y", "Y", 0, 0.9, 0.001],
      ["width", "Largeur", 0.3, 0.8, 0.001], ["height", "Hauteur", 0.06, 0.2, 0.001]
    ]) controlGrid.append(slider(label, key, row.rect[key], min, max, step, (name, value) => updateRow(capture, row, name, value)));
    const readout = element("div", "coordinateReadout");
    const rectLine = element("p", "");
    const cropLine = element("pre", "");
    readout.append(element("strong", "", "Coordonnées normalisées · x / y / largeur / hauteur"), rectLine, cropLine);
    capture.geometryOutputs.set(row.rowIndex, { rect: rectLine, crops: cropLine });
    controls.append(controlGrid, readout);
    card.append(heading, crops, controls);
    capture.rowContainer.append(card);
    updateGeometryReadout(capture, row);
  }
}

function renderDiagnostics(capture) {
  capture.diagnostics.replaceChildren();
  const { diagnostics, rows, rejected } = capture.analysis;
  capture.diagnostics.append(element("p", "diagnosticSummary", diagnostics.status === "ok"
    ? `${rows.length} lignes retenues · ${rejected.length} frontières rejetées · couverture ${Math.round((diagnostics.boundaryCoverage || 0) * 100)} %`
    : "Aucune séquence suffisamment fiable. Ajuste l’image ou corrige les rectangles manuellement."));
  if (diagnostics.topBoundaryInferred) capture.diagnostics.append(element("p", "diagnosticNote", "Le bord supérieur de la première ligne a été estimé à partir de l’espacement régulier; il reste corrigeable."));
  for (const rejectedLine of rejected) {
    capture.diagnostics.append(element("p", "rejectedLine", `Bord vers ${(rejectedLine.y * 100).toFixed(1)} % — ${rejectedLine.reason}`));
  }
}

async function addCapture(file, index) {
  const loaded = await loadImage(file);
  const sourceCanvas = element("canvas", "sourceCanvas");
  sourceCanvas.width = loaded.image.naturalWidth;
  sourceCanvas.height = loaded.image.naturalHeight;
  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
  sourceContext.drawImage(loaded.image, 0, 0);
  const analysis = detectRankingRows(sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height));
  const overlay = svgElement("svg", {
    class: "sourceOverlay",
    viewBox: `0 0 ${sourceCanvas.width} ${sourceCanvas.height}`,
    preserveAspectRatio: "none",
    "aria-label": "Rectangles détectés; toucher une ligne pour la sélectionner"
  });
  const article = element("article", "captureCard card");
  const heading = element("header", "captureHeading");
  heading.append(element("h2", "", `Capture ${index + 1}`), element("span", "captureDimensions", `${sourceCanvas.width} × ${sourceCanvas.height} px`));
  const diagnostics = element("div", "captureDiagnostics");
  const rowContainer = element("div", "rowCards");
  const viewport = element("div", "sourceViewport");
  viewport.append(sourceCanvas, overlay);
  article.append(heading, viewport, diagnostics, rowContainer);
  list.append(article);

  URL.revokeObjectURL(loaded.url);
  loaded.image.src = "";

  const capture = {
    index: index + 1,
    sourceCanvas,
    overlay,
    analysis,
    activeRow: 1,
    diagnostics,
    rowContainer,
    cropCanvases: new Map(),
    geometryOutputs: new Map()
  };
  captures.push(capture);
  renderDiagnostics(capture);
  drawCapture(capture);
  renderRowCards(capture);
  attachCanvasCorrection(capture);
  updateExportState();
}

function serializeGeometry() {
  return {
    schemaVersion: CUT_SCHEMA_VERSION,
    coordinateSystem: "normalized-0-to-1",
    captures: captures.map(capture => ({
      captureIndex: capture.index,
      image: { ...capture.analysis.image },
      rows: capture.analysis.rows.map(row => ({
        rowIndex: row.rowIndex,
        confidence: row.confidence,
        inferredTop: row.inferredTop,
        rect: { ...row.rect },
        crops: Object.fromEntries(Object.entries(row.crops).map(([key, box]) => [key, { ...box }]))
      })),
      rejected: capture.analysis.rejected.map(item => ({ ...item })),
      diagnostics: { ...capture.analysis.diagnostics }
    }))
  };
}

function updateExportState() {
  exportButton.disabled = captures.length === 0;
  clearButton.disabled = captures.length === 0;
  const rowCount = captures.reduce((sum, capture) => sum + capture.analysis.rows.length, 0);
  status.textContent = captures.length
    ? `${captures.length} capture${captures.length > 1 ? "s" : ""} · ${rowCount} lignes géométriques détectées.`
    : "Aucune capture chargée.";
}

input.addEventListener("change", async () => {
  const files = [...input.files || []].filter(file => file.type.startsWith("image/"));
  if (!files.length) return;
  input.disabled = true;
  status.textContent = `Analyse locale de ${files.length} image${files.length > 1 ? "s" : ""}…`;
  let failed = 0;
  try {
    for (const file of files) {
      const captureIndex = captures.length + failed;
      try {
        await addCapture(file, captureIndex);
      } catch (error) {
        failed++;
        const failure = element("article", "captureCard card");
        failure.append(element("h2", "", `Capture ${captureIndex + 1} non analysée`), element("p", "rejectedLine", error.message || "Image illisible."));
        list.append(failure);
      }
    }
  } catch (error) {
    status.textContent = error.message || "Une image n’a pas pu être analysée.";
  } finally {
    input.disabled = false;
    input.value = "";
    updateExportState();
    if (failed) status.textContent = `${captures.length} capture${captures.length > 1 ? "s" : ""} analysée${captures.length > 1 ? "s" : ""} · ${failed} image${failed > 1 ? "s" : ""} illisible${failed > 1 ? "s" : ""}.`;
  }
});

exportButton.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(serializeGeometry(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = element("a");
  link.href = url;
  link.download = "alliance-ranking-geometry.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

clearButton.addEventListener("click", () => {
  captures.splice(0, captures.length);
  list.replaceChildren();
  updateExportState();
});

// Future identity-engine contract: call this with captureIndex and rowIndex.
window.LoSPAllianceNameCrop = async (captureIndex, rowIndex) => {
  const capture = captures.find(item => item.index === captureIndex);
  const row = capture?.analysis.rows.find(item => item.rowIndex === rowIndex);
  if (!capture || !row) throw new RangeError("Ligne de classement introuvable.");
  return createIdentityImageInput(capture.sourceCanvas, row.crops.allianceName);
};
