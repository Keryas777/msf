import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const html=fs.readFileSync(new URL("../docs/war-counter-lab.html",import.meta.url),"utf8");
const root=fs.readFileSync(new URL("../docs/index.html",import.meta.url),"utf8");
test("laboratoire privé et absent de l'accueil",()=>{assert.match(html,/noindex,nofollow/);assert.doesNotMatch(root,/war-counter-lab\.html/);});
test("formats upload et compteur Groq",()=>{assert.match(html,/image\/jpeg,image\/png,image\/webp/);assert.match(html,/Appels Groq réels/);});
