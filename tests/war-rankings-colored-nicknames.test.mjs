import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const source = await readFile(new URL("../docs/war-rankings.js", import.meta.url), "utf8");

function mockElement(dataset = {}) {
  return {
    innerHTML: "",
    textContent: "",
    checked: true,
    dataset,
    classList: { toggle() {} },
    setAttribute() {},
    addEventListener() {},
    querySelectorAll() { return []; }
  };
}

async function renderRanking({ members, avatars = [], players, aliases = {} }) {
  const elements = new Map([
    "players",
    "playersCount",
    "rankingTitle",
    "rankingHint",
    "showFormerPlayers"
  ].map((id) => [id, mockElement()]));

  // Keep former members visible so the test can distinguish their grey styling.
  elements.get("showFormerPlayers").checked = true;

  const rangeButton = mockElement({ range: "all" });
  const rankingTab = mockElement({ ranking: "avg_score" });
  const data = {
    "joueurs.json": members,
    "infos.json": avatars,
    "player-aliases.json": { aliases },
    "war-history-lite.json": [{
      alliance: "Dionysos",
      date: "2026-10-09",
      players: players.map((player) => ({ ...player, score_total: player.score_total ?? 55 }))
    }]
  };
  const errors = [];

  const filtersElement = mockElement();
  const document = {
    getElementById(id) { return elements.get(id) ?? null; },
    querySelector(selector) { return selector === ".filters" ? filtersElement : null; },
    querySelectorAll(selector) {
      if (selector === ".rangeChip[data-range]") return [rangeButton];
      if (selector === ".rankingTab") return [rankingTab];
      return [];
    }
  };

  runInNewContext(source, {
    document,
    window: { location: { href: "https://keryas777.github.io/msf/war-rankings.html" } },
    URL,
    fetch: async (url) => {
      const filename = new URL(url).pathname.split("/").pop();
      assert.ok(Object.hasOwn(data, filename), "Unexpected JSON: " + filename);
      return { ok: true, json: async () => data[filename] };
    },
    console: {
      log() {},
      warn() {},
      error(...args) { errors.push(args.map(String).join(" ")); }
    }
  }, { filename: "war-rankings.js" });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(errors, [], "Ranking initialization should succeed");
  return elements.get("players").innerHTML;
}

function findRow(html, name) {
  const rows = [...html.matchAll(/<div class="rankRow([^"]*)">([\s\S]*?)(?=<div class="rankRow|$)/g)];
  const exactName = '<div class="rankName" title="' + name + '">' + name + "</div>";
  const match = rows.find(([, , markup]) => markup.includes(exactName));
  assert.ok(match, "Player row not found: " + name);
  return { classes: match[1], markup: match[2] };
}

test("JAXX is current and gets his avatar even if the roster and avatar names contain MSF color markup", async () => {
  const html = await renderRanking({
    members: [
      { player: "<color=red>JAXX", alliance: "Dionysos" },
      { player: "El_Prince", alliance: "Dionysos" }
    ],
    avatars: [{ name: "<color=red>JAXX", icon: "https://example.com/jaxx.png" }],
    players: [
      { name: "JAXX", score_total: 53.3 },
      { name: "El_Prince", score_total: 53.7 },
      { name: "Ancien", score_total: 50 }
    ]
  });

  const jaxx = findRow(html, "JAXX");
  assert.doesNotMatch(jaxx.classes, /isFormer/);
  assert.match(jaxx.markup, /src="https:\/\/example\.com\/jaxx\.png"/);
  assert.doesNotMatch(findRow(html, "El_Prince").classes, /isFormer/);
  assert.match(findRow(html, "Ancien").classes, /isFormer/);
});

test("hexadecimal, uppercase and closing MSF color tags do not change membership or ordinary names", async () => {
  const html = await renderRanking({
    members: [
      { player: "<color=#FF8800>Alpha</color>", alliance: "Dionysos" },
      { player: "<COLOR=blue>Beta</COLOR>", alliance: "Dionysos" },
      { player: "Gamma", alliance: "Dionysos" }
    ],
    avatars: [{ name: "<COLOR=#00FF00>Beta</color>", icon: "https://example.com/beta.png" }],
    players: [{ name: "Alpha" }, { name: "Beta" }, { name: "Gamma" }]
  });

  for (const name of ["Alpha", "Beta", "Gamma"]) {
    assert.doesNotMatch(findRow(html, name).classes, /isFormer/);
  }
  assert.match(findRow(html, "Beta").markup, /src="https:\/\/example\.com\/beta\.png"/);
});

test("existing aliases still resolve when the canonical roster name has a color tag", async () => {
  const html = await renderRanking({
    members: [{ player: "<color=red>NewName", alliance: "Dionysos" }],
    avatars: [{ name: "<color=red>NewName", icon: "https://example.com/newname.png" }],
    players: [{ name: "OldName" }],
    aliases: { OldName: "NewName" }
  });

  const renamed = findRow(html, "NewName");
  assert.doesNotMatch(renamed.classes, /isFormer/);
  assert.match(renamed.markup, /src="https:\/\/example\.com\/newname\.png"/);
});
