import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const [html, css, app] = await Promise.all([
  readFile(new URL("../docs/war-admin.html", import.meta.url), "utf8"),
  readFile(new URL("../docs/war-admin.css", import.meta.url), "utf8"),
  readFile(new URL("../docs/war-admin.js", import.meta.url), "utf8")
]);

test("la page charge ses fichiers CSS et JavaScript locaux", () => {
  assert.match(html, /href="\.\/war-admin\.css\?v=1"/);
  assert.match(html, /src="\.\/war-admin\.js\?v=1" defer/);
  assert.match(html, /name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/);
  assert.doesNotMatch(html, /user-scalable=no|maximum-scale=1/);
});

test("les six alliances respectent l’ordre demandé", () => {
  const select = html.match(/<select id="warAlliance"[\s\S]*?<\/select>/)?.[0] || "";
  const options = [...select.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map(
    ([, value, label]) => ({ value, label })
  );

  assert.deepEqual(options, [
    { value: "zeus", label: "Zeus" },
    { value: "athena", label: "Athéna" },
    { value: "kronos", label: "Kronos" },
    { value: "dionysos", label: "Dionysos" },
    { value: "poseidon", label: "Poséidon" },
    { value: "hades", label: "Hadès" }
  ]);
});

test("la date, Zeus et l’état d’attente sont initialisés sans appel automatique", () => {
  assert.match(html, /id="warDate"[^>]*type="date"[^>]*required/);
  assert.match(app, /dateInput\.value = getLocalDateValue\(\)/);
  assert.match(app, /allianceSelect\.value = "zeus"/);
  assert.match(app, /setStatus\("idle", "En attente", "Attente"/);
  assert.equal((app.match(/\bfetch\(/g) || []).length, 1);
  assert.ok(app.indexOf("fetch(API_URL") > app.indexOf("async function handleSubmit"));
  assert.doesNotMatch(html, /auth-(?:guard|session)\.js/);
});

test("l’envoi utilise l’URL absolue et le FormData attendu", () => {
  assert.match(
    app,
    /https:\/\/msf-war-ocr\.deliriousfan7\.workers\.dev\/api\/war\/parse-gemini/
  );
  assert.match(app, /formData\.append\("alliance", alliance\)/);
  assert.match(app, /formData\.append\("war_date", warDate\)/);
  assert.match(app, /formData\.append\("image", file,/);
  assert.match(app, /fetch\(API_URL, \{\s*method: "POST",\s*body: formData\s*\}\)/);
  assert.doesNotMatch(app, /["']Content-Type["']|["']content-type["']/);
});

test("le bouton, les doubles soumissions et l’aperçu sont sécurisés", () => {
  assert.match(html, /id="warSubmit"[\s\S]*?type="submit" disabled/);
  assert.match(app, /submitButton\.disabled = isSubmitting \|\| !dateInput\.value \|\| !getSelectedFile\(\)/);
  assert.match(app, /if \(isSubmitting\) return/);
  assert.match(app, /setSubmitting\(true\)/);
  assert.match(app, /finally \{\s*setSubmitting\(false\)/);
  assert.match(app, /URL\.createObjectURL\(file\)/);
  assert.match(app, /URL\.revokeObjectURL\(previewUrl\)/);
  assert.match(app, /window\.addEventListener\("pagehide", releasePreviewUrl\)/);
});

test("les états et les réponses JSON ou erreurs sont affichés", () => {
  for (const state of ["idle", "sending", "success", "error"]) {
    assert.ok(app.includes(`"${state}"`), state);
  }

  assert.match(app, /JSON\.parse\(responseText\)/);
  assert.match(app, /JSON\.stringify\(data, null, 2\)/);
  assert.match(app, /if \(!response\.ok\)/);
  assert.match(app, /if \(data && data\.ok === false\)/);
  assert.match(app, /Impossible de joindre le Worker/);
});

test("le CSS reste mobile first, tactile et sans débordement horizontal", () => {
  assert.match(css, /overflow-x: hidden/);
  assert.match(css, /min-width: 320px/);
  assert.match(css, /min-height: 50px/);
  assert.match(css, /min-height: 54px/);
  assert.match(css, /white-space: pre-wrap/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /@media \(min-width: 620px\)/);
  assert.match(css, /@media \(min-width: 900px\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test("aucun secret ni moteur métier n’est ajouté au frontend", () => {
  const frontend = `${html}\n${css}\n${app}`;
  const forbiddenSecrets = [
    "GEMINI_API_KEY",
    "GITHUB_TOKEN",
    "GITHUB_OWNER",
    "GITHUB_REPO",
    "GITHUB_BRANCH",
    "CLIENT_SECRET",
    "CLOUDFLARE_API_TOKEN"
  ];

  for (const secret of forbiddenSecrets) {
    assert.equal(frontend.includes(secret), false, secret);
  }

  assert.doesNotMatch(frontend, /war-report-engine|war-report-ranking|score_total|classement final|rédaction automatique/i);
});
