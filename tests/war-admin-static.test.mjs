import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const [html, css, app] = await Promise.all([
  readFile(new URL("../docs/war-admin.html", import.meta.url), "utf8"),
  readFile(new URL("../docs/war-admin.css", import.meta.url), "utf8"),
  readFile(new URL("../docs/war-admin.js", import.meta.url), "utf8")
]);

test("la page charge la Phase C locale sans bloquer le zoom", () => {
  assert.match(html, /href="\.\/war-admin\.css\?v=2"/);
  assert.match(html, /src="\.\/war-admin\.js\?v=2" defer/);
  assert.match(html, /name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/);
  assert.doesNotMatch(html, /user-scalable=no|maximum-scale=1/);
  assert.doesNotMatch(html, /auth-(?:guard|session)\.js/);
});

test("l’utilisateur choisit une date et de une à six images, jamais l’alliance", () => {
  assert.match(html, /id="warDate"[^>]*type="date"[^>]*required/);
  assert.match(html, /id="warImage"[\s\S]*?type="file"[\s\S]*?accept="image\/\*"[\s\S]*?multiple/);
  assert.match(html, /1 à 6 images/);
  assert.match(html, /une capture maximum par alliance/i);
  assert.doesNotMatch(html, /id="warAlliance"|name="alliance"/);
  assert.match(app, /const MAX_CAPTURES = 6/);
  assert.match(app, /files\.length > MAX_CAPTURES/);
  assert.match(app, /dateInput\.value = getLocalDateValue\(\)/);
});

test("les six alliances et leurs variantes restent normalisées dans l’ordre demandé", () => {
  const allianceBlock = app.slice(
    app.indexOf("const ALLIANCES = ["),
    app.indexOf("const STATE_LABELS")
  );
  const entries = [...allianceBlock.matchAll(/\{ key: "([^"]+)", label: "([^"]+)" \}/g)]
    .map(([, key, label]) => ({ key, label }));

  assert.deepEqual(entries, [
    { key: "zeus", label: "Zeus" },
    { key: "athena", label: "Athéna" },
    { key: "kronos", label: "Kronos" },
    { key: "dionysos", label: "Dionysos" },
    { key: "poseidon", label: "Poséidon" },
    { key: "hades", label: "Hadès" }
  ]);
  assert.match(app, /key === "kronos" \|\| key === "cronos" \|\| key === "chronos" \|\| key === "lospkronos"/);
  assert.match(app, /normalize\("NFD"\)/);
});

test("la file n’envoie qu’une image à la fois vers la route brouillon", () => {
  assert.match(
    app,
    /const API_URL = "https:\/\/msf-war-ocr\.deliriousfan7\.workers\.dev\/api\/war\/parse-gemini-draft"/
  );
  assert.equal((app.match(/\bfetch\(/g) || []).length, 1);
  assert.match(app, /for \(let index = 0; index < session\.captures\.length; index \+= 1\)/);
  assert.match(app, /const succeeded = await processCapture\(capture\)/);
  assert.doesNotMatch(app, /Promise\.all\([^)]*processCapture|session\.captures\.map\([^)]*fetch/);
  assert.match(app, /formData\.append\("war_date", session\.warDate\)/);
  assert.match(app, /formData\.append\("image", capture\.file,/);
  assert.doesNotMatch(app, /formData\.append\("alliance"/);
  assert.match(app, /data\.published !== false/);
  assert.doesNotMatch(app, /\/api\/war\/parse-gemini"/);
});

test("les temporisations et les trois tentatives suivent le contrat", () => {
  assert.match(app, /const QUEUE_DELAY_MIN_MS = 8000/);
  assert.match(app, /const QUEUE_DELAY_MAX_MS = 10000/);
  assert.match(app, /const RETRY_DELAYS_MS = \[10000, 30000\]/);
  assert.match(app, /for \(let attempt = 1; attempt <= 3; attempt \+= 1\)/);
  assert.match(app, /getRetryDelayMs\(attempt\)/);
  assert.match(app, /await waitWithCountdown\(/);
  assert.match(app, /poursuite automatique de la file/);
  assert.match(app, /new AbortController\(\)/);
  assert.match(app, /session\.abortController\.abort\(\)/);
  assert.match(app, /clearTimeout\(timer\)/);
});

test("les doublons et les détections incertaines déclenchent un choix manuel local", () => {
  assert.match(app, /data\.detected_alliance \|\| data\.detected_alliance_label \|\| data\.alliance/);
  assert.match(app, /getAssignedCapture\(detectedAlliance, capture\.id\)/);
  assert.match(app, /requireManualAlliance\(capture, detectedAlliance\)/);
  assert.match(app, /Alliance incertaine : choix manuel demandé uniquement pour cette capture/);
  assert.match(app, /Choix refusé : .* est déjà attribuée/);
  assert.match(app, /assignmentSource = source/);
  assert.match(app, /source === "automatic"/);
  assert.match(app, /assignAlliance\(capture, alliance, "manual"\)/);
});

test("la liste, le journal et les états sont principaux, le JSON est repliable", () => {
  assert.match(html, /id="warCaptureList"/);
  assert.match(html, /id="warLog"[\s\S]*?aria-live="polite"/);
  assert.match(html, /<details id="warTechnicalPanel"/);
  assert.match(html, /<summary>JSON technique complet<\/summary>/);
  assert.match(html, /id="warResult"/);

  for (const label of [
    "En attente",
    "Détection",
    "OCR en cours",
    "Attente",
    "Brouillon prêt",
    "OCR échoué"
  ]) {
    assert.ok(app.includes(`"${label}"`), label);
  }

  assert.match(app, /getTimeLabel\(\)/);
  assert.match(app, /Réponse Gemini reçue/);
  assert.match(app, /Brouillon créé — published = false/);
  assert.match(app, /JSON\.stringify\(getTechnicalPayload\(\), null, 2\)/);
});

test("le CSS reste mobile first, tactile et lisible à 320 px", () => {
  assert.match(css, /overflow-x: hidden/);
  assert.match(css, /min-width: 320px/);
  assert.match(css, /min-height: 50px/);
  assert.match(css, /min-height: 54px/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /grid-template-columns: 74px minmax\(0, 1fr\)/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(css, /white-space: pre-wrap/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /@media \(min-width: 620px\)/);
  assert.match(css, /@media \(min-width: 900px\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test("aucun secret, appel GitHub ou moteur métier n’est ajouté au frontend", () => {
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

  assert.doesNotMatch(frontend, /api\.github\.com|upsertFileToGitHub|export_payload/);
  assert.doesNotMatch(frontend, /war-report-engine|war-report-ranking|score_total|classement final|rédaction automatique/i);
});
