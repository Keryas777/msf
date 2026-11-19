import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createAllianceIdentity,
  createDirectoryIndex,
  findByAlias,
  findById,
  findByName,
  normalizeAllianceName,
  searchAll,
  suggestMatches,
  validateDirectory
} from "../docs/alliance-directory.js";

const directory = JSON.parse(await readFile(new URL("../docs/data/alliance-directory.json", import.meta.url), "utf8"));
const intel = JSON.parse(await readFile(new URL("../docs/data/war-intelligence.json", import.meta.url), "utf8"));

test("imports 28 unique alliance identities with a non-empty independent ID", () => {
  validateDirectory(directory);
  assert.equal(directory.alliances.length, 28);
  assert.equal(new Set(directory.alliances.map(item => item.allianceId)).size, 28);
  assert.ok(directory.alliances.every(item => item.allianceId.startsWith("wi-") && item.searchName));
  assert.deepEqual(directory.alliances.map(item => item.name), [
    "GALACTUS", "Questionable Propriety", "H.U.L.K. of S.C.R.U.B.S", "New Age of Pymps",
    "LEGION", "Swords of X", "Rest in Peace", "The Dorks FIWB", "MARINES",
    "M2 God of Hammers", "Knull & Void", "X-Academy", "SOVEREIGN REIGN", "Galaxy Rangers",
    "Green STAR", "ArcAngels", "Lost in The Spiderverse", "WAR DOGS", "NWO PLANET OF APES",
    "Mutant Liberation Front", "Omega Protocol", "THIEVES", "Lords of the Void", "BLADE RUNNER",
    "undying Warriors", "SIGMA Omega Protocol", "Mephisto’s Demons", "DOOM-IMMORTAL"
  ]);
  assert.ok(directory.alliances.every(item => item.observations[0]?.observedAt === null));
  assert.ok(directory.alliances.every(item => !("rank" in item.observations[0].source) && !("row" in item.observations[0].source) && !("captureOrder" in item.observations[0].source)));
});

test("keeps verified existing War Intelligence IDs without duplicating those records", () => {
  const expected = ["MARINES", "Omega protocol", "NWO Planet of Apes", "DA Galaxy Rangers", "ArcAngels", "BLADE RUNNER"];
  const index = createDirectoryIndex(directory);
  for (const name of expected) {
    const current = intel.alliances.find(item => normalizeAllianceName(item.name) === normalizeAllianceName(name));
    assert.ok(current, `existing identity ${name}`);
    const imported = directory.alliances.find(item => item.allianceId === current.id);
    assert.ok(imported, `directory reuses ${name}`);
  }
  assert.equal(new Set(directory.alliances.map(item => item.allianceId)).size, directory.alliances.length);
  assert.equal(findByName(index, "DA Galaxy Rangers")?.name, "Galaxy Rangers");
});

test("preserves Unicode, colored segments and the separation of rich and simple names", () => {
  const index = createDirectoryIndex(directory);
  const voidAlliance = findByName(index, "Lords of the Void");
  assert.equal(voidAlliance.name, "Lords of the Void");
  assert.ok(voidAlliance.richName.segments.map(segment => segment.text).join("").includes("Vøid"));
  assert.ok(voidAlliance.richName.segments.every(segment => /^#[0-9a-f]{6}$/i.test(segment.color)));
  assert.equal(findByName(index, "SOVEREIGN REIGN").richName.segments.length, 1);
});

test("search ignores case, accents, punctuation and known aliases", () => {
  const index = createDirectoryIndex(directory);
  assert.equal(normalizeAllianceName("H.U.L.K. of S.C.R.U.B.S"), "hulkofscrubs");
  assert.equal(findByName(index, "h.u.l.k. OF s.c.r.u.b.s")?.name, "H.U.L.K. of S.C.R.U.B.S");
  assert.equal(findByAlias(index, "DA Galaxy Rangers")?.name, "Galaxy Rangers");
  assert.equal(searchAll(index, "mephistos demons")[0]?.name, "Mephisto’s Demons");
  assert.equal(findByName(index, "legion")?.name, "LEGION");
});

test("does not merge identities on name similarity; suggestions remain proposals", () => {
  const rows = [
    createAllianceIdentity({ name: "Sigma Omega Protocol", allianceId: "wi-test-1" }),
    createAllianceIdentity({ name: "Omega Protocol", allianceId: "wi-test-2" })
  ];
  const index = createDirectoryIndex({ schemaVersion: 1, alliances: rows });
  assert.notEqual(findByName(index, "Omega Protocol").allianceId, findByName(index, "Sigma Omega Protocol").allianceId);
  const proposals = suggestMatches(index, "Omega Protocol");
  assert.ok(proposals.length);
  assert.ok(proposals.every(item => item.status === "proposed-only"));
  assert.equal(index.payload.alliances.length, 2);
});

test("new identities get independent IDs and no fabricated official ID or observation date", () => {
  const first = createAllianceIdentity({ name: "Example Alliance" });
  const second = createAllianceIdentity({ name: "Example Alliance" });
  assert.notEqual(first.allianceId, second.allianceId);
  assert.equal(first.officialAllianceId, null);
  assert.equal(first.firstObservedAt, null);
  assert.equal(first.lastObservedAt, null);
  assert.deepEqual(first.observations, []);
});

test("rejects duplicate internal IDs", () => {
  const duplicate = { schemaVersion: 1, alliances: [
    createAllianceIdentity({ name: "Alpha", allianceId: "same" }),
    createAllianceIdentity({ name: "Beta", allianceId: "same" })
  ] };
  assert.throws(() => validateDirectory(duplicate), /double/);
});
