const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../../docs');
const app = fs.readFileSync(path.join(root, 'war-results-vision.js'), 'utf8');
const engine = fs.readFileSync(path.join(root, 'war-results-vision-engine.js'), 'utf8');

assert.match(app, /analyzeButton\.addEventListener\("click",\s*\(\)\s*=>\s*\{/,
  'main button must not pass MouseEvent as capture id');
assert.match(app, /typeof oneId === "string" \? oneId : null/,
  'analysis entry point must ignore non-string event arguments');
assert.match(app, /if \(!pending\.length\)[\s\S]{0,250}status\.textContent/,
  'empty selection must show visible feedback');
assert.match(app, /analyzePending\(\)\.catch\(showGlobalError\)/,
  'top-level analysis rejection must be shown in the page');
assert.match(app, /addEventListener\("unhandledrejection"/,
  'unhandled promise failures must be shown in the page');
for (const action of ['analyze-one', 'remove', 'validate', 'export-one']) {
  assert.match(app, new RegExp(`data-action="${action}" data-id="\\$\\{r\\.id\\}"`),
    `${action} button must pass the capture id`);
}
assert.match(app, /Démarrage de l’analyse des captures/);
assert.match(engine, /Chargement du script Tesseract\.js/);
assert.match(engine, /Chargement de Tesseract Core \(ressources WASM\)/);
assert.match(engine, /Chargement du modèle OCR anglais/);
assert.match(engine, /Première lecture OCR \(PSM 6\)/);
assert.match(engine, /Échec du Worker ou du chargement WASM\/modèle OCR/);
console.log('war results vision iOS trigger regression tests: ok');
