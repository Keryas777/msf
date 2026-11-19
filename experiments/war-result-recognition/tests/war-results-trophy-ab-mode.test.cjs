const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../../..");
const html = fs.readFileSync(path.join(root, "docs/war-results-vision.html"), "utf8");
const engine = fs.readFileSync(path.join(root, "docs/war-results-vision-engine.js"), "utf8");
const app = fs.readFileSync(path.join(root, "docs/war-results-vision.js"), "utf8");

if (!html.includes('id="compareTrophyLocatorsButton"') || !html.includes('id="locatorComparisonResults"')) {
  throw new Error("The diagnostic comparison controls are missing from War Results Vision.");
}
if (html.indexOf("war-results-trophy-locator-experiment.js") > html.indexOf("war-results-vision-engine.js")) {
  throw new Error("The experimental locator must load before the comparison engine.");
}
if (!engine.includes("async function compareTrophyLocators") || !engine.includes("TROPHY_LOCATOR.locateBand")) {
  throw new Error("The engine does not compare the adaptive trophy ROI.");
}
if (!engine.includes('tessedit_pageseg_mode: String(psm)') || !engine.includes('"0123456789"')) {
  throw new Error("The comparison must use the page's local Tesseract worker and numeric whitelist.");
}
if (!app.includes("compareTrophyLocators()") || !app.includes("locatorComparisonHtml")) {
  throw new Error("The diagnostic control is not connected to a visible comparison report.");
}
const locator = fs.readFileSync(path.join(root, "docs/war-results-trophy-locator-experiment.js"), "utf8");
const store = fs.readFileSync(path.join(root, "docs/war-results-locator-comparison-store.js"), "utf8");
if (!html.includes(`id="trophyMarginSelect"`) || !html.includes(`<option value="18" selected>18 %</option>`)) throw new Error("Margin selector defaults are incorrect.");
if (!locator.includes("minimumPaddingPixels") || !locator.includes("Math.max(minimumPaddingPixels")) throw new Error("Zero-percent padding is not supported.");
if (!store.includes("record.marginPercent ?? 18")) throw new Error("Stored records are not separated by margin.");
if (!app.includes("LEGACY_LOCATOR_COMPARISON_KEY") || !app.includes("Number(item.marginPercent ?? 18) === marginPercent")) throw new Error("Resume does not distinguish margin variants.");
console.log("War Results Vision trophy margin comparison tests: OK");

if (!app.includes("Number(item.marginPercent ?? 18) === marginPercent")) throw new Error("Resume does not separate completed results by selected margin.");
if (!app.includes("}, { marginPercent, verticalRecovery, edgeSafePadding, iconAware });")) throw new Error("The selected margin and experimental locator options are not passed to the comparison.");
if (!app.includes("sourceKey: record.fileKey || WarResultsLocatorComparisonStore.fileKey(record.file), marginPercent")) throw new Error("Results do not persist the selected margin.");
if (!app.includes("if (legacy && locatorComparisonSummary.length)")) throw new Error("Legacy results are not migrated into the v2 session store.");

if (!app.includes("sessionStorage.setItem(LOCATOR_COMPARISON_KEY, WarResultsLocatorComparisonStore.stringify(locatorComparisonSummary))")) throw new Error("Migrated results are not persisted for reload recovery.");
if (!app.includes("locator-source-overview") || !app.includes("locator-glyph-adaptive")) throw new Error("The A/B view must show source-image rectangles and segmented glyphs.");
if (!app.includes("Image réellement transmise à Tesseract")) throw new Error("The view must distinguish the OCR input crop from the unprocessed source crop.");
if (!engine.includes("translateBoundsToSource(observed.bounds || [], origin)")) throw new Error("Glyph diagnostics are not converted into original-image coordinates.");
if (!engine.includes('trophyLocatorDefault: "adaptive+vertical-recovery"') || !engine.includes('paddingByGlyphHeight: 0.18, minimumPaddingPixels: 2')) throw new Error("Normal analysis must default to adaptive vertical recovery at an 18% glyph margin.");
if (!engine.includes('method: "manual-override"') || !engine.includes('method: "existing-zone-fallback"')) throw new Error("Manual trophy corrections and existing-zone fallback must remain available.");
if (!html.includes('<option value="vertical-recovery" selected>')) throw new Error("The comparator should open on the confirmed Safari variant.");
if (!html.includes('<option value="vertical-recovery-combined">Adaptatif + reprise + corrections combinées</option>')) throw new Error("The combined experimental variant is missing from the official comparator.");
if (!app.includes('selection === "vertical-recovery-combined" ? "adaptive-vertical-recovery-combined"')) throw new Error("The combined variant must have a stable, distinct identifier.");
if (!app.includes('variantId === "adaptive-vertical-recovery-combined"') || !app.includes('variantId === "adaptive-vertical-recovery-combined";')) throw new Error("The combined variant must independently enable edge safety and icon-aware segmentation.");
for (const field of ["initialRect", "finalRect", "requestedMarginPercent", "appliedMarginPercent", "componentsDetected", "edgeWarning", "iconRejection", "verticalRecovery"]) {
  if (!engine.includes(field)) throw new Error(`Exportable diagnostics are missing ${field}.`);
}
if (!engine.includes('trophyLocatorDefault: "adaptive+vertical-recovery"')) throw new Error("The normal OCR default must remain unchanged.");
if (!engine.includes('edgeSafePaddingByGlyphHeight: 0.3') || !engine.includes('), iconAware };')) throw new Error("The comparator must pass both independent mechanisms to the combined variant.");

