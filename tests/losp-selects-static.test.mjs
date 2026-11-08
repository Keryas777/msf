import { Script } from "node:vm";
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
    assert.match(html, /href="\.\/losp-selects\.css\?v=\d+"/, page);
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
    assert.deepEqual(entry.displayParts, ["END", "GΔME R-évolution"]);
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
  assert.match(js, /!alliance\?\.displayParts\?\.length \|\| alliance\.group === 'losp'/);
  assert.doesNotMatch(js, /alliance\?\.emoji \|\| '👤'/);
  assert.match(js, /name\.style\.color = alliance\.nameColor/);
  assert.match(js, /identity\.appendChild\(name\)/);
  assert.match(js, /check\.textContent = selected \? '✅' : '○'/);
});

test("MARINES keeps its stylized red display name without italic or skew", () => {
  const alliances = JSON.parse(read("docs/data/alliances.json"));
  const marines = alliances.find((alliance) => alliance.key === "marines");
  assert.equal(marines.key, "marines");
  assert.equal(marines.name, "MARINES");
  assert.equal(marines.displayName, "MΛЯIΠΣƧ");
  assert.equal(Object.hasOwn(marines, "nameItalic"), false);
  assert.equal(marines.nameColor, "#E53935");
  assert.ok(marines.aliases.includes("MARINES"));

  const helper = read("docs/alliances.js");
  const dropdown = read("docs/losp-selects.js");
  const evolution = read("docs/evolution-classement.js");
  assert.match(helper, /target\.textContent = meta\?\.displayName \|\| meta\?\.name/);
  assert.match(dropdown, /name\.textContent = meta\.displayName \|\| meta\.name/);
  assert.match(evolution, /name\.textContent = alliance\?\.displayName \|\| alliance\?\.name/);
  for (const script of [helper, dropdown, evolution]) {
    assert.doesNotMatch(script, /nameItalic|skewX\(-7deg\)/);
  }
});

test("LoSP bicolor labels keep emojis; ENDGAME and MARINES remain unchanged", () => {
  const dropdown = read("docs/losp-selects.js");
  const dropdownCss = read("docs/losp-selects.css");
  const evolution = read("docs/evolution-classement.js");
  const evolutionCss = read("docs/evolution-classement.css");
  const metadata = JSON.parse(read("docs/data/alliances.json"));

  const losp = metadata.filter((alliance) => alliance.group === "losp");
  assert.equal(losp.length, 6);
  assert.ok(losp.every((alliance) => alliance.displayParts?.[0] === "LoSP "));
  assert.ok(losp.every((alliance) => alliance.emoji && alliance.color));
  assert.match(dropdown, /meta\.group === "losp" && meta\.emoji/);
  assert.match(dropdown, /meta\.displayParts\?\.length === 2 && meta\.group !== "losp"/);
  assert.match(dropdown, /toggle\.classList\.toggle\("losp-alliance-chip", meta\.group === "losp"\)/);
  assert.match(dropdownCss, /\.filterToggle\.losp-alliance-chip \.fStack/);
  assert.match(evolution, /alliance\.group === 'losp'/);
  assert.match(evolutionCss, /\.evolutionAllianceChipIdentity--losp/);

  const marines = metadata.find((alliance) => alliance.key === "marines");
  assert.equal(marines.displayName, "MΛЯIΠΣƧ");
  assert.equal(marines.nameColor, "#E53935");
  const endgame = metadata.filter((alliance) => alliance.group === "endgame-revolution");
  assert.deepEqual(endgame.map((alliance) => alliance.displayParts), [
    ["END", "GΔME R-évolution"],
    ["END", "GΔME R-évolution"],
  ]);
});

test("historical character profile also renders bicolor LoSP chips without emoji placeholders", () => {
  const js = read("docs/historique-personnages-profile.js");
  const css = read("docs/historique-personnages-profile.css");
  assert.match(js, /a\.group === "losp"/);
  assert.match(js, /meta\.displayParts\[0\]/);
  assert.match(js, /meta\.displayParts\[1\]/);
  assert.match(js, /meta\.group === "losp"\) prefix\.style\.whiteSpace = "pre"/);
  assert.match(js, /name\.textContent = meta\?\.displayName \|\| meta\?\.name/);
  assert.match(css, /\.profileFilterToggle\.is-losp \.profileFilterStack/);
  assert.match(css, /\.profileFilterStack>span:empty\{display:none\}/);
});

test("MSF nickname color parser compiles and renders both supported tags", () => {
  const source = read("docs/losp-selects.js");
  assert.doesNotThrow(() => new Script(source));
  const start = source.indexOf("  function playerColorLabel(");
  const end = source.indexOf("\n  function optionLabel(", start);
  assert.ok(start >= 0 && end > start);
  const parse = new Function("document", source.slice(start, end) + "\nreturn playerColorLabel;");
  const document = { createElement: () => ({ textContent: "", style: {} }) };
  const render = parse(document);
  for (const [raw, label, color] of [
    ["<#FF0000>Caps", "Caps", "#FF0000"],
    ["<color=red>JAXX", "JAXX", "red"],
    ["<color=red>JAXX</color>", "JAXX", "red"],
  ]) {
    const container = { appendChild(node) { this.child = node; } };
    render(container, raw);
    assert.equal(container.child.textContent, label);
    assert.equal(container.child.style.color.toLowerCase(), color.toLowerCase());
  }
});
