import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const ui = fs.readFileSync(new URL("../docs/war-counter-write-ui.js", import.meta.url), "utf8");
const entry = fs.readFileSync(new URL("../docs/war-counter-lab-entry.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../docs/war-counter-lab.html", import.meta.url), "utf8");

test("le navigateur écrit uniquement via le Worker dédié", () => {
  assert.match(ui, /msf-war-counter-write\.deliriousfan7\.workers\.dev/);
  assert.match(ui, /\/api\/war-counter-write\/apply/);
  assert.match(ui, /X-War-Counter-Write-Key/);
  assert.doesNotMatch(ui + entry + html, /GOOGLE_PRIVATE_KEY|GOOGLE_SERVICE_ACCOUNT_EMAIL|sheets\.googleapis\.com/);
});

test("la clé d'écriture n'est conservée qu'en sessionStorage", () => {
  assert.match(ui, /sessionStorage\.getItem\(WRITE_KEY_SESSION_KEY\)/);
  assert.match(ui, /sessionStorage\.setItem\(WRITE_KEY_SESSION_KEY/);
  assert.doesNotMatch(ui, /localStorage\.setItem\(WRITE_KEY_SESSION_KEY/);
});

test("la confirmation d'écriture est chargée autour du moteur Vision", () => {
  assert.match(entry, /war-counter-lab\.js\?v=r7-entry-8/);
  assert.match(entry, /war-counter-write-ui\.js\?v=r1/);
  assert.match(entry, /initWarCounterWriteUi\(\)/);
  assert.match(html, /war-counter-write\.css\?v=r1/);
});
