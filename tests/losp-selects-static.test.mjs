import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const pages = [
  "arena", "battleworld", "codex", "conseils", "cosmic-counters",
  "cosmic-defenses", "evenements", "evolution", "evolution-classement",
  "historique-personnages", "index", "iso", "joueur", "mvp", "tcp",
  "war-attack-checker", "war-counters", "war-graphs", "war-history", "war-rankings",
];

test("all selected public pages load the same mobile dropdown assets", () => {
  for (const page of pages) {
    const html = read("docs/" + page + ".html");
    assert.match(html, /href="\.\/losp-selects\.css\?v=1"/, page);
    assert.match(html, /src="\.\/losp-selects\.js\?v=\d+"/, page);
  }
});

test("the enhancer preserves native selects and existing checkbox chips", () => {
  const js = read("docs/losp-selects.js");
  assert.match(js, /select\.insertAdjacentElement\("afterend", host\)/);
  assert.match(js, /select\.multiple/);
  assert.match(js, /state\.select\.dispatchEvent\(new Event\("change", \{ bubbles: true \}\)\)/);
  assert.match(js, /input\[type="checkbox"\]\[data-alliance\]/);
  assert.match(js, /window\.LoSPAlliances\.renderAllianceName\(label, key\)/);
  assert.doesNotMatch(js, /select\.replaceWith\(/);
});

test("ENDGAME two-tone names are read from alliance metadata, not duplicated in UI code", () => {
  const js = read("docs/losp-selects.js");
  const css = read("docs/losp-selects.css");
  const alliances = JSON.parse(read("docs/data/alliances.json"));
  const endgame = alliances.filter((entry) => entry.group === "endgame-revolution");
  assert.equal(endgame.length, 2);
  for (const entry of endgame) {
    assert.deepEqual(entry.displayParts, ["END", "GAME R-évolution"]);
    assert.match(entry.color, /^#[\da-fA-F]{6}$/);
  }
  assert.match(js, /meta\.displayParts\?\.length === 2/);
  assert.match(js, /second\.style\.color = meta\.color/);
  assert.match(css, /\.losp-choice__bicolor \{ gap: 0; \}/);
  assert.doesNotMatch(js, /#ED3946|#F6952C/);
});

test("MARINES name uses its red color in dropdowns and checkbox chips", () => {
  const alliances = JSON.parse(read("docs/data/alliances.json"));
  const marines = alliances.find((alliance) => alliance.key === "marines");
  assert.ok(marines);
  assert.equal(marines.name, "MARINES");
  assert.equal(marines.nameColor, marines.color);
  assert.match(marines.nameColor, /^#[\da-fA-F]{6}$/);
  const helper = read("docs/alliances.js");
  const dropdown = read("docs/losp-selects.js");
  assert.match(helper, /nameColor = String\(alliance\?\.nameColor/);
  assert.match(helper, /target\.style\.color = meta\?\.nameColor \|\| ""/);
  assert.match(dropdown, /if \(meta\.nameColor\) name\.style\.color = meta\.nameColor/);
});

test("evolution ranking chips omit decorative emojis for custom alliance typography", () => {
  const js = read("docs/evolution-classement.js");
  const alliances = JSON.parse(read("docs/data/alliances.json"));
  const special = alliances.filter((alliance) =>
    alliance.key === "marines" || alliance.group === "endgame-revolution"
  );
  assert.equal(special.length, 3);
  assert.ok(special.every((alliance) => alliance.nameColor || alliance.displayParts?.length === 2));
  assert.match(js, /alliance\?\.emoji && !alliance\?\.nameColor && !alliance\?\.displayParts\?\.length/);
  assert.doesNotMatch(js, /alliance\?\.emoji \|\| '👤'/);
  assert.match(js, /name\.style\.color = alliance\.nameColor/);
  assert.match(js, /identity\.appendChild\(name\)/);
  assert.match(js, /check\.textContent = selected \? '✅' : '○'/);
});

test("MARINES has a stylized red italic display name without changing its technical identity", () => {
  const alliances = JSON.parse(read("docs/data/alliances.json"));
  const marines = alliances.find((alliance) => alliance.key === "marines");
  assert.equal(marines.key, "marines");
  assert.equal(marines.name, "MARINES");
  assert.equal(marines.displayName, "MΛЯIΠΣƧ");
  assert.equal(marines.nameItalic, true);
  assert.equal(marines.nameColor, "#E53935");
  assert.ok(marines.aliases.includes("MARINES"));

  const helper = read("docs/alliances.js");
  const dropdown = read("docs/losp-selects.js");
  const evolution = read("docs/evolution-classement.js");
  assert.match(helper, /target\.textContent = meta\?\.displayName \|\| meta\?\.name/);
  assert.match(helper, /target\.style\.fontStyle = meta\?\.nameItalic \? "italic" : ""/);
  assert.match(dropdown, /name\.textContent = meta\.displayName \|\| meta\.name/);
  assert.match(dropdown, /if \(meta\.nameItalic\) name\.style\.fontStyle = "italic"/);
  assert.match(evolution, /name\.textContent = alliance\?\.displayName \|\| alliance\?\.name/);
  assert.match(evolution, /if \(alliance\?\.nameItalic\) name\.style\.fontStyle = 'italic'/);
});