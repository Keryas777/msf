// Post-deployment public HTTP smoke test (no credentials or user sessions).
const base = "https://losp-auth.deliriousfan7.workers.dev";
const get = async(path) => fetch(base + path, {
  method:"GET", redirect:"manual", signal:AbortSignal.timeout(20000),
  headers:{"Cache-Control":"no-cache"}
});
const home=await get("/");
const root=await home.text();
if(home.status!==200 || root.trim()!=="LoSP Auth Worker OK"){
  console.error("ÉCHEC : production ne sert pas le vrai Worker losp-auth",home.status);
  process.exitCode=1;
}else console.log("OK : vrai Worker losp-auth en production");

const login=await get("/login?next=home.html");
const location=login.headers.get("location")||"";
let validLocation=false;
try{
  const target=new URL(location);
  validLocation=target.hostname==="discord.com" && target.pathname.endsWith("/oauth2/authorize") &&
    target.searchParams.get("client_id")==="1498718329953583266" &&
    target.searchParams.get("redirect_uri")===base+"/callback";
}catch{}
if(login.status!==302 || !validLocation){
  console.error("ÉCHEC : l'entrée OAuth Discord ne redirige pas correctement",login.status);
  process.exitCode=1;
}else console.log("OK : connexion OAuth Discord accessible");

for(const path of ["/me","/signed-me"]){
  const response=await get(path);
  const payload=await response.json().catch(()=>null);
  const ok=response.status===401 && payload?.ok===false && payload?.reason==="not_connected";
  if(!ok){
    console.error("ÉCHEC :",path,"doit refuser un visiteur anonyme",response.status);
    process.exitCode=1;
  }else console.log("OK :",path,"refuse un visiteur anonyme");
}
