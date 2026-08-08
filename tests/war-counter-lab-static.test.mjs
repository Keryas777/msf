import test from"node:test";import assert from"node:assert/strict";import fs from"node:fs";
const html=fs.readFileSync(new URL("../docs/war-counter-lab.html",import.meta.url),"utf8"),js=fs.readFileSync(new URL("../docs/war-counter-lab.js",import.meta.url),"utf8");
test("laboratoire privé et sans secret",()=>{assert.match(html,/noindex,nofollow/);assert.match(html,/Appels Groq réels/);assert.doesNotMatch(html+js,/GROQ_API_KEY|api\.groq\.com/)});
test("formats et stratégie",()=>{assert.match(html,/image\/jpeg,image\/png,image\/webp/);assert.match(html,/id="strategy"/)});
test("aucun lien de production ajouté",()=>{const index=fs.readFileSync(new URL("../docs/index.html",import.meta.url),"utf8");assert.doesNotMatch(index,/war-counter-lab/)});
