import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const ui = fs.readFileSync(new URL("../docs/war-counter-write-ui.js", import.meta.url), "utf8");
const entry = fs.readFileSync(new URL("../docs/war-counter-lab-entry.js", import.meta.url), "utf8");
const stability = fs.readFileSync(new URL("../docs/war-counter-lab-stability.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../docs/war-counter-lab.html", import.meta.url), "utf8");

test("le navigateur écrit uniquement via le Worker dédié", () => {
  assert.match(ui, /msf-war-counter-write\.deliriousfan7\.workers\.dev/);
  assert.match(ui, /\/api\/war-counter-write\/apply/);
  assert.match(ui, /\/api\/war-counter-write\/apply-batch/);
  assert.match(ui, /X-War-Counter-Write-Key/);
  assert.doesNotMatch(ui + entry + html, /GOOGLE_PRIVATE_KEY|GOOGLE_SERVICE_ACCOUNT_EMAIL|sheets\.googleapis\.com/);
});

test("la clé d'écriture n'est conservée qu'en sessionStorage", () => {
  assert.match(ui, /sessionStorage\.getItem\(WRITE_KEY_SESSION_KEY\)/);
  assert.match(ui, /sessionStorage\.setItem\(WRITE_KEY_SESSION_KEY/);
  assert.doesNotMatch(ui, /localStorage\.setItem\(WRITE_KEY_SESSION_KEY/);
});

test("la confirmation d'écriture groupée est chargée autour du moteur Vision", () => {
  assert.match(entry, /war-counter-lab\.js\?v=r7-vertical-1/);
  assert.match(entry, /war-counter-write-ui\.js\?v=r2/);
  assert.match(entry, /war-counter-write-auth\.js\?v=2/);
  assert.match(entry, /war-counter-lab-stability\.js\?v=1/);
  assert.match(entry, /installWarCounterLabStability\(\)/);
  assert.match(entry, /initWarCounterWriteUi\(\)/);
  assert.match(html, /war-counter-write\.css\?v=r2/);
  assert.match(html, /id="sheetBatchPanel"/);
  assert.match(html, /id="sheetBatchButton"/);
  assert.match(html, /war-counter-lab-entry\.js\?v=r7-entry-14/);
});

test("la vérification reste stable pendant que les captures suivantes sont analysées", () => {
  assert.match(stability, /root\.replaceChildren\s*=\s*\(/);
  assert.match(stability, /root\.append\s*=\s*\(/);
  assert.match(stability, /normalizedCardMarkup/);
  assert.match(stability, /SCROLLER_SELECTOR/);
  assert.match(stability, /scrollLeft/);
  assert.match(stability, /preventScroll:\s*true/);
});

test("Vision protège le travail contre le pull-to-refresh et le rechargement accidentel", () => {
  assert.match(html, /overscroll-behavior-y:\s*none/);
  assert.match(stability, /touchmove/);
  assert.match(stability, /passive:\s*false/);
  assert.match(stability, /event\.preventDefault\(\)/);
  assert.match(stability, /beforeunload/);
  assert.match(stability, /event\.returnValue\s*=\s*""/);
});

test("le lot est regroupé côté navigateur et reste revérifié côté Worker", () => {
  assert.match(ui, /groupBatchEntries/);
  assert.match(ui, /apply-batch/);
  assert.match(ui, /Une seule confirmation et une seule saisie de clé pour tout le lot/);
});
