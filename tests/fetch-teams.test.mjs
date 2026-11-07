import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scriptUrl = new URL("../scripts/fetch-teams.mjs", import.meta.url).href;

function generateFromCsv(csv) {
  const directory = mkdtempSync(join(tmpdir(), "losp-fetch-teams-"));
  try {
    const code = `globalThis.fetch = async () => new Response(${JSON.stringify(csv)}); await import(${JSON.stringify(scriptUrl)});`;
    const run = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
      cwd: directory,
      encoding: "utf8"
    });
    const teams = run.status === 0
      ? JSON.parse(readFileSync(join(directory, "docs/data/teams.json"), "utf8"))
      : null;
    return { run, teams };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("Sheets side becomes optional warRole without changing existing team fields", () => {
  const csv = [
    "team,character1,character2,character3,character4,character5,mode,side",
    "Nightreavers,Dracula,Oath,Morbius,,,Guerre,Attaque",
    "Gamma,Hulk,SheHulk,Brawn,Abomination,RedHulk,Guerre,Défense",
    "Classic,Odin,,,,,Arène,"
  ].join("\n");

  const { run, teams } = generateFromCsv(csv);
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(teams, [
    { team: "Classic", mode: "Arène", characters: ["Odin"] },
    { team: "Gamma", mode: "Guerre", characters: ["Hulk", "SheHulk", "Brawn", "Abomination", "RedHulk"], warRole: "Défense" },
    { team: "Nightreavers", mode: "Guerre", characters: ["Dracula", "Oath", "Morbius"], warRole: "Attaque" }
  ]);
});

test("missing side header is reported rather than silently losing war roles", () => {
  const { run, teams } = generateFromCsv(
    "team,character1,mode\nNightreavers,Dracula,Guerre"
  );
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /Missing header: side/);
  assert.equal(teams, null);
});
