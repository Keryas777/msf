// Prépare uniquement une URL de version pour tester le VRAI code losp-auth.
// Ne déploie ni ne modifie le Worker de production.
import { mkdtemp,readFile,writeFile,appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const work=await mkdtemp(join(process.env.RUNNER_TEMP||tmpdir(),"losp-compat-"));
const source=await readFile(new URL("../workers/losp-auth/worker.js",import.meta.url),"utf8");
const groups=await readFile(new URL("../docs/data/access-groups.json",import.meta.url),"utf8");
const importLine='import ACCESS_GROUPS from "../../docs/data/access-groups.json" with { type: "json" };';
if(!source.includes(importLine))throw Error("Le Worker n'importe pas le registre attendu");
const standalone=source.replace(importLine,"const ACCESS_GROUPS = "+groups.trim()+";");
await writeFile(join(work,"worker.js"),standalone,{mode:0o600});
await writeFile(join(work,"wrangler.jsonc"),JSON.stringify({
  name:"losp-auth",
  main:"worker.js",
  compatibility_date:"2026-10-01",
  keep_vars:true,
  observability:{enabled:true},
  secrets:{required:["DISCORD_CLIENT_SECRET","DISCORD_BOT_TOKEN","SESSION_SIGNING_SECRET"]}
},null,2),{mode:0o600});
if(process.env.GITHUB_ENV)
  await appendFile(process.env.GITHUB_ENV,"LOSP_COMPAT_DIR="+work+"\n");
console.log("Version de compatibilité préparée, aucun secret copié.");
