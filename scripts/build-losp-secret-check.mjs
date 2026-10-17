// Generates a one-off diagnostics Version URL payload without copying any secret to GitHub.
import { randomBytes } from "node:crypto";
import { mkdtemp,readFile,writeFile,appendFile } from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
const text=await readFile(new URL("../workers/losp-auth/secret-check-worker.js",import.meta.url),"utf8");
const key=randomBytes(32).toString("hex");
const expiry=Date.now()+15*60*1000;
if(!text.includes('"REPLACE_WITH_NONCE"')||!text.includes("const EXPIRE_AT=1;"))throw Error("Invalid diagnostic template");
const work=await mkdtemp(join(process.env.RUNNER_TEMP||tmpdir(),"losp-check-"));
const code=text.replace('"REPLACE_WITH_NONCE"',JSON.stringify(key))
  .replace("const EXPIRE_AT=1;","const EXPIRE_AT="+expiry+";");
await writeFile(join(work,"worker.js"),code,{mode:0o600});
await writeFile(join(work,"wrangler.jsonc"),JSON.stringify({
  name:"losp-auth",
  main:"worker.js",
  compatibility_date:"2026-10-01",
  keep_vars:true,
  secrets:{required:["DISCORD_CLIENT_SECRET","DISCORD_BOT_TOKEN","SESSION_SIGNING_SECRET"]}
},null,2),{mode:0o600});
await writeFile(join(work,"key"),key,{mode:0o600});
if(process.env.GITHUB_ENV)await appendFile(process.env.GITHUB_ENV,"LOSP_DIAG_DIR="+work+"\n");
console.log("Diagnostic temporaire prêt ; aucune valeur secrète imprimée.");
