import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const ALLIANCE_KEYS = [
  "zeus",
  "athena",
  "kronos",
  "dionysos",
  "poseidon",
  "hades",
];

async function writeJson(file, value) {
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function runScript(script, env) {
  return execFileAsync(process.execPath, [script], {
    cwd: REPO_ROOT,
    env: { ...process.env, ...env },
  });
}

function infoRow(name, alliance) {
  return {
    name,
    alliance,
    tcp: 1,
    war_mvp: 2,
    icon: "",
    frame: "",
  };
}

function rosterRow(player, alliance) {
  return {
    player,
    playerKey: player.toLowerCase(),
    alliance,
    chars: {},
    iso: {},
  };
}

test("merge-infos handles all six sources, including empty and populated Athéna", async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "msf-infos-"));
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }));

  for (const key of ALLIANCE_KEYS) {
    await writeJson(path.join(dataDir, `infos_${key}.json`), []);
  }

  await writeJson(path.join(dataDir, "infos_zeus.json"), [infoRow("Zeus Player", "Zeus")]);
  await writeJson(path.join(dataDir, "infos_hades.json"), [infoRow("Hades Player", "Hadès")]);

  const outFile = path.join(dataDir, "infos.json");
  const joueursFile = path.join(dataDir, "joueurs.json");
  const env = {
    DATA_DIR: dataDir,
    OUT_FILE: outFile,
    JOUEURS_OUT_FILE: joueursFile,
  };

  const firstRun = await runScript("scripts/merge-infos.mjs", env);
  for (const key of ALLIANCE_KEYS) {
    assert.match(firstRun.stdout, new RegExp(`infos_${key}\\.json`));
  }

  assert.deepEqual(
    (await fs.readFile(outFile, "utf8")).trim(),
    JSON.stringify(
      [infoRow("Zeus Player", "Zeus"), infoRow("Hades Player", "Hadès")],
      null,
      2
    )
  );

  const firstBytes = await fs.readFile(outFile, "utf8");
  await runScript("scripts/merge-infos.mjs", env);
  assert.equal(await fs.readFile(outFile, "utf8"), firstBytes);

  await writeJson(path.join(dataDir, "infos_athena.json"), [
    infoRow("Athena Player", "Athéna"),
  ]);
  await runScript("scripts/merge-infos.mjs", env);

  const infos = JSON.parse(await fs.readFile(outFile, "utf8"));
  const joueurs = JSON.parse(await fs.readFile(joueursFile, "utf8"));

  assert.deepEqual(
    infos.map((row) => row.alliance),
    ["Zeus", "Athéna", "Hadès"]
  );
  assert.equal(infos.filter((row) => row.alliance === "Athéna").length, 1);
  assert.equal(infos.filter((row) => row.alliance === "Hadès").length, 1);
  assert.equal(
    new Set(joueurs.map((row) => `${row.player}\0${row.alliance}`)).size,
    joueurs.length
  );
});

test("merge-rosters handles all six sources deterministically without dropping Hadès", async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "msf-rosters-"));
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }));

  for (const key of ALLIANCE_KEYS) {
    await writeJson(path.join(dataDir, `rosters_${key}.json`), []);
  }

  await writeJson(path.join(dataDir, "rosters_zeus.json"), [
    rosterRow("Zeus Player", "zeus"),
  ]);
  await writeJson(path.join(dataDir, "rosters_hades.json"), [
    rosterRow("Hades Player", "hades"),
  ]);

  const outFile = path.join(dataDir, "rosters.json");
  const env = {
    DATA_DIR: dataDir,
    OUT_FILE: outFile,
  };

  const firstRun = await runScript("scripts/merge-rosters.mjs", env);
  for (const key of ALLIANCE_KEYS) {
    assert.match(firstRun.stdout, new RegExp(`rosters_${key}\\.json`));
  }

  let rosters = JSON.parse(await fs.readFile(outFile, "utf8"));
  assert.equal(rosters.some((row) => row.alliance === "hades"), true);
  assert.equal(rosters.some((row) => row.alliance === "athena"), false);

  const firstBytes = await fs.readFile(outFile, "utf8");
  await runScript("scripts/merge-rosters.mjs", env);
  assert.equal(await fs.readFile(outFile, "utf8"), firstBytes);

  await writeJson(path.join(dataDir, "rosters_athena.json"), [
    rosterRow("Athena Player", "athena"),
  ]);
  await runScript("scripts/merge-rosters.mjs", env);

  rosters = JSON.parse(await fs.readFile(outFile, "utf8"));
  assert.equal(rosters.filter((row) => row.alliance === "athena").length, 1);
  assert.equal(rosters.filter((row) => row.alliance === "hades").length, 1);
  assert.equal(new Set(rosters.map((row) => row.playerKey)).size, rosters.length);
});
