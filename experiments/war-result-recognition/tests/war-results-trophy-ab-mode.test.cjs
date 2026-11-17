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
console.log("War Results Vision trophy A/B diagnostic wiring tests: OK");
