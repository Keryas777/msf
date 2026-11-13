import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
test("la consultation utilise les relevés publiés et ne contient aucun plan fictif",async()=>{
  const [html,js,data]=await Promise.all([read("docs/renseignements-guerre.html"),read("docs/renseignements-guerre.js"),read("docs/data/war-intelligence.json")]);
  assert.doesNotMatch(js,/Alliance de test|test-a|test-b/);
  assert.match(js,/\/api\/war-intelligence/);assert.match(html,/admin-renseignements-guerre\.html/);
  assert.deepEqual(JSON.parse(data),{schemaVersion:1,alliances:[],observations:[]});
  assert.equal((js.match(/data-mode="(overview|emitted|received)"/g)||[]).length,0);
});
test("l’administration réutilise la carte publique, vérifie le propriétaire et contrôle les positions",async()=>{
  const [html,admin,renderer,worker]=await Promise.all([read("docs/admin-renseignements-guerre.html"),read("docs/admin-renseignements-guerre.js"),read("docs/renseignements-guerre.js"),read("workers/msf-cosmic-defenses/worker.js")]);
  assert.match(html,/data-war-intel-admin="true"/);assert.match(html,/renseignements-guerre\.js/);
  assert.match(admin,/session\.role==="admin"/);assert.match(admin,/String\(session\.id\|\|""\)===OWNER_ID/);
  assert.match(admin,/losp-war-intel-draft-v1/);assert.match(admin,/intelDuplicate/);
  assert.match(renderer,/editHandler\(selected/);assert.match(renderer,/rich\?\.schemaVersion\s*===\s*1/);
  assert.match(worker,/owner\.role!=="admin"\|\|owner\.id!==WAR_INTEL_OWNER_ID/);
  assert.match(worker,/invalid_or_duplicate_room/);assert.match(worker,/existingIndex=data\.observations\.findIndex/);
  assert.match(worker,/action==="delete"/);assert.doesNotMatch(worker,/supersedesId|revision:|withdrawnObservationIds/);
  assert.match(admin,/publication à cette date remplacera ce relevé/);assert.match(admin,/Supprimer définitivement/);
  assert.match(renderer,/observations\.filter\(item => item\.allianceId === allianceSelect\.value\)/);
});
test("les trois modes de carte, les triangles et la version PWA restent présents",async()=>{
  const [html,css,sw]=await Promise.all([read("docs/admin-renseignements-guerre.html"),read("docs/renseignements-guerre.css"),read("docs/sw.js")]);
  for(const mode of ["overview","emitted","received"])assert.match(html,new RegExp('data-mode="'+mode+'"'));
  assert.match(css,/intelInfluenceTriangle/);assert.match(css,/intelUnknown/);
  assert.match(sw,/losp-v26/);assert.match(sw,/admin-renseignements-guerre\.html/);
});
