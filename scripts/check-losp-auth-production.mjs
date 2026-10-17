// Vérification APRÈS propagation Cloudflare, sans session ni secret utilisateur.
// Une mise en production Wrangler peut être confirmée avant que tous les edges
// ne servent déjà la nouvelle version : ne pas annoncer un faux échec immédiat.
const base = "https://losp-auth.deliriousfan7.workers.dev";
const attemptLimit = 16;
const waitMs = 8000;
const get = async path => fetch(base + path, {
  method:"GET", redirect:"manual", signal:AbortSignal.timeout(12000),
  headers:{"Cache-Control":"no-cache"}
});
async function checkOnce() {
  const problems=[];
  const rootResponse=await get("/");
  const body=await rootResponse.text();
  if(rootResponse.status!==200 || body.trim()!=="LoSP Auth Worker OK") {
    problems.push("racine="+rootResponse.status);
  }
  const login=await get("/login?next=home.html");
  let validLogin=false;
  try {
    const target=new URL(login.headers.get("location") || "");
    validLogin=login.status===302 &&
      target.hostname==="discord.com" &&
      target.pathname.endsWith("/oauth2/authorize") &&
      target.searchParams.get("client_id")==="1498718329953583266" &&
      target.searchParams.get("redirect_uri")===base+"/callback";
  } catch {}
  if(!validLogin) problems.push("login="+login.status);
  for(const path of ["/me","/signed-me"]) {
    const response=await get(path);
    const payload=await response.json().catch(()=>null);
    if(response.status!==401 || payload?.ok!==false ||
       payload?.reason!=="not_connected") {
      problems.push(path+"="+response.status);
    }
  }
  return problems;
}
for(let attempt=1;attempt<=attemptLimit;attempt++) {
  let problems;
  try { problems=await checkOnce(); }
  catch(error) { problems=[error?.message || "network_error"]; }
  if(problems.length===0) {
    console.log("OK : véritable losp-auth en production, OAuth et contrôles 401 conformes.");
    process.exit(0);
  }
  console.log("Propagation en cours, tentative "+attempt+"/"+attemptLimit+" : "+problems.join(", "));
  if(attempt<attemptLimit) await new Promise(resolve=>setTimeout(resolve,waitMs));
}
console.error("ÉCHEC : la production n'a pas convergé vers le vrai Worker après plusieurs vérifications.");
process.exitCode=1;
