import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {filterVisibleRosters, createMapLayout} from "../docs/dimensions-noires-view.mjs";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const dimensions = JSON.parse(await read("../docs/data/dark-dimensions.json"));
const dd9 = dimensions.dimensions.find((item) => item.key === "dd9");

test("alliance filter combines selected alliances and applies the shared access check", () => {
  const rows = [
    {alliance: "LoSP Zeus", player: "Z"},
    {alliance: "Guest Red", player: "R"},
    {alliance: "Guest Orange", player: "O"},
    {alliance: "Hidden", player: "H"},
  ];
  const keys = new Map([
    ["LoSP Zeus", "zeus"],
    ["Guest Red", "guest-red"],
    ["Guest Orange", "guest-orange"],
    ["Hidden", "hidden"],
  ]);
  const permitted = new Set(["zeus", "guest-red"]);
  const resolve = (value) => keys.get(value) || "";
  const allowed = (key) => permitted.has(key);
  assert.deepEqual(
    filterVisibleRosters(rows, new Set(["zeus", "guest-red", "hidden"]), resolve, allowed)
      .map((row) => row.player),
    ["Z", "R"]
  );
  assert.deepEqual(
    filterVisibleRosters(rows, new Set(["guest-red"]), resolve, allowed)
      .map((row) => row.player),
    ["R"]
  );
  assert.deepEqual(filterVisibleRosters(rows, new Set(), resolve, allowed), []);
});

test("DD9 map geometry keeps existing room and connection coordinates inside the viewBox", () => {
  const layout = createMapLayout(dd9.map);
  assert.ok(layout);
  assert.equal(layout.width, 340);
  assert.equal(layout.height, 598);
  assert.deepEqual(layout.position("A1"), {x: 65, y: 561});
  assert.deepEqual(layout.position("A9"), {x: 65, y: 65});
  assert.deepEqual(layout.position("E9"), {x: 303.4, y: 65});
  assert.deepEqual(layout.gridPosition("A1"), {column: 2, row: 10});
  assert.deepEqual(layout.gridPosition("E9"), {column: 6, row: 2});
  assert.equal(layout.position("F9"), null);

  for (const [startId, endId] of dd9.map.visualEdges) {
    const start = layout.position(startId);
    const end = layout.position(endId);
    assert.ok(start && end, startId + " → " + endId + " remains mapped");
    for (const point of [start, end]) {
      assert.ok(point.x >= 0 && point.x <= layout.width);
      assert.ok(point.y >= 0 && point.y <= layout.height);
    }
  }
});

test("map layout scales from each map's own dimensions", () => {
  const map = {
    columns: ["A", "B", "C", "D", "E", "F", "G", "H"],
    rows: Array.from({length: 14}, (_, index) => index + 1),
    startId: "A1",
    combatNodeIds: ["H14"],
    portalIds: [],
    visualEdges: [["A1", "H14"]],
  };
  const layout = createMapLayout(map);
  assert.equal(layout.width, 518.8);
  assert.equal(layout.height, 908);
  assert.deepEqual(layout.position("A1"), {x: 65, y: 871});
  assert.deepEqual(layout.position("H14"), {x: 482.2, y: 65});
  assert.ok(layout.columnTracks.split(" ").length === 10);
  assert.ok(layout.rowTracks.split(" ").length === 16);
});

test("page exposes two accessible in-page tabs and no global player search", async () => {
  const html = await read("../docs/dimensions-noires.html");
  const js = await read("../docs/dimensions-noires.js");
  const css = await read("../docs/dimensions-noires.css");
  assert.match(html, /role="tablist"/);
  assert.match(html, /id="tab-ranking"[^>]*role="tab"[^>]*aria-selected="true"/);
  assert.match(html, /id="tab-individual"[^>]*role="tab"[^>]*aria-selected="false"/);
  assert.match(html, /id="panel-ranking"[^>]*role="tabpanel"/);
  assert.match(html, /id="panel-individual"[^>]*role="tabpanel"[^>]*hidden/);
  assert.match(html, /id="alliance-chips"/);
  assert.match(html, /id="player-select"/);
  assert.doesNotMatch(html, /id="search"/);
  assert.match(js, /ArrowLeft/);
  assert.match(js, /ArrowRight/);
  assert.match(js, /activateTab\("individual", true\)/);
  assert.match(js, /LoSPRosterLoader\.loadMany/);
  assert.match(css, /\.map-frame\s*\{[^}]*overflow:\s*hidden/s);
  assert.doesNotMatch(css, /\.map\s*\{[^}]*min-width:\s*340px/s);
});
