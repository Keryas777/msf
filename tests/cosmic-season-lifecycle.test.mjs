import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rollCosmicSeason } from "../scripts/roll-cosmic-season.mjs";

const makeConfig = (number, startAt) => ({
  schemaVersion: 2,
  season: { id: "season-" + number, number, name: "Nom officiel " + number,
    startAt, firstTrialAt: startAt, sourceUrl: "https://marvelstrikeforce.com/en/updates/example",
    verified: "official-announcement" },
  globalRule: { title: "Globale", rule: "Règle complète vérifiée" },
  rooms: Array.from({length: 6}, (_,i) => ({ id:i+1, label:"Salle " + (i+1), rule:"Règle " + (i+1) })),
  localizationReview: {
    policy: "fr-first", status: "reviewed",
    rules: Object.fromEntries(["global", ...Array.from({length:6},(_,i)=>"room-"+(i+1))].map(key => [key, {
      frenchOfficialChecked: true, frenchTerminologyChecked: true,
      sources: [{contentLanguage:"en",authority:"official",contentVerified:true,url:"https://marvelstrikeforce.com/en/updates/example"}],
      selectedSourceUrl:"https://marvelstrikeforce.com/en/updates/example",
      fallbackExplanation:"Source française indisponible ; termes français contrôlés"
    }]))
  }
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "losp-cosmic-"));
  const dir = join(root, "docs", "data");
  await mkdir(dir, { recursive:true });
  const current = makeConfig(25, "2026-10-14T21:00:00Z");
  const next = makeConfig(26, "2026-12-10T21:00:00Z");
  const counters = [{season:"season-25",room:1,def_family:"A",atk_team:"B"}];
  const defenses = [{season:"season-25",room:1,characters:["a","b","c","d","e"]}];
  for (const [name,value] of Object.entries({
    "cosmic-config.json":current, "cosmic-counters.json":counters,
    "cosmic-defenses.json":defenses, "cosmic-next-season.json":next
  })) await writeFile(join(dir,name),JSON.stringify(value,null,2)+"\n");
  return {root,dir,current,next,counters,defenses};
}
test("before start, never archive or reset data", async t => {
  const x = await fixture();
  t.after(() => rm(x.root,{recursive:true,force:true}));
  assert.equal((await rollCosmicSeason({root:x.root,now:"2026-12-09T21:00:00Z"})).status,"scheduled");
  assert.deepEqual(JSON.parse(await readFile(join(x.dir,"cosmic-counters.json"),"utf8")),x.counters);
});
test("atomic-source rollover archives both datasets and activates empty new season", async t => {
  const x = await fixture();
  t.after(() => rm(x.root,{recursive:true,force:true}));
  const result = await rollCosmicSeason({root:x.root,now:"2026-12-10T21:00:00Z"});
  assert.equal(result.status,"rolled");
  const archive=join(x.dir,"cosmic-archive","season-25");
  assert.deepEqual(JSON.parse(await readFile(join(archive,"cosmic-config.json"),"utf8")),x.current);
  assert.deepEqual(JSON.parse(await readFile(join(archive,"cosmic-counters.json"),"utf8")),x.counters);
  assert.deepEqual(JSON.parse(await readFile(join(archive,"cosmic-defenses.json"),"utf8")),x.defenses);
  assert.equal(JSON.parse(await readFile(join(x.dir,"cosmic-config.json"),"utf8")).season.id,"season-26");
  assert.deepEqual(JSON.parse(await readFile(join(x.dir,"cosmic-counters.json"),"utf8")),[]);
  assert.deepEqual(JSON.parse(await readFile(join(x.dir,"cosmic-defenses.json"),"utf8")),[]);
  assert.equal(JSON.parse(await readFile(join(x.dir,"cosmic-next-season.json"),"utf8")),null);
  assert.equal((await rollCosmicSeason({root:x.root})).status,"no-pending");
});
test("incomplete upcoming rules abort and preserve all old data", async t => {
  const x=await fixture(); t.after(() => rm(x.root,{recursive:true,force:true}));
  const bad={...x.next,rooms:x.next.rooms.slice(0,5)};
  await writeFile(join(x.dir,"cosmic-next-season.json"),JSON.stringify(bad));
  await assert.rejects(rollCosmicSeason({root:x.root,now:"2026-12-12T21:00:00Z"}),/six salles/);
  assert.deepEqual(JSON.parse(await readFile(join(x.dir,"cosmic-defenses.json"),"utf8")),x.defenses);
});
test("existing archive blocks overwrite, protects history", async t => {
  const x=await fixture(); t.after(()=>rm(x.root,{recursive:true,force:true}));
  await mkdir(join(x.dir,"cosmic-archive","season-25"),{recursive:true});
  await assert.rejects(rollCosmicSeason({root:x.root,now:"2026-12-12T21:00:00Z"}),/Archive déjà existante/);
  assert.deepEqual(JSON.parse(await readFile(join(x.dir,"cosmic-counters.json"),"utf8")),x.counters);
});
test("cross-season rows block rollover",async t=>{
  const x=await fixture();t.after(()=>rm(x.root,{recursive:true,force:true}));
  await writeFile(join(x.dir,"cosmic-counters.json"),JSON.stringify([{season:"season-24"}]));
  await assert.rejects(rollCosmicSeason({root:x.root,now:"2026-12-12T21:00:00Z"}),/sans saison active/);
  assert.equal(JSON.parse(await readFile(join(x.dir,"cosmic-config.json"),"utf8")).season.id,"season-25");
});
