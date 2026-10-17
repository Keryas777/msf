// Test HTTP d'une VERSION non déployée du vrai Worker losp-auth.
// Jeton ancien synthétique seulement, aucun utilisateur n'est déconnecté.
const preview=process.argv[2];
if(!/^https:\/\/[a-z0-9-]+-losp-auth\.[a-z0-9-]+\.workers\.dev\/?$/.test(preview||"")) {
  throw Error("Version URL incorrecte ; arrêt sans toucher la production");
}
const id="300305626926415874"; // compte déjà défini comme fixture dans le Worker public
const token=Buffer.from(JSON.stringify({
  id, username:"Compte de test", role:"member", alliances:["zeus"]
}),"utf8").toString("base64url");
const request=async (path,headers) => {
  const response=await fetch(preview.replace(/\/$/,"")+path,{
    method:"GET",headers,redirect:"manual",signal:AbortSignal.timeout(20000)
  });
  const data=await response.json().catch(()=>null);
  return {status:response.status,data,headers:response.headers};
};
const bearer=await request("/me",{
  Authorization:"Bearer "+token,
  Origin:"https://keryas777.github.io"
});
const bearerOk=bearer.status===200 && bearer.data?.ok===true &&
  bearer.data?.id===id && bearer.data?.signedSession===false &&
  bearer.headers.get("set-cookie")?.startsWith("session=");
console.log((bearerOk?"OK":"ÉCHEC")+": ancienne session localStorage /me (HTTP "+bearer.status+")");
const cookie=await request("/me",{Cookie:"session="+token});
const cookieOk=cookie.status===200 && cookie.data?.ok===true &&
  cookie.data?.signedSession===false;
console.log((cookieOk?"OK":"ÉCHEC")+": ancien cookie /me (HTTP "+cookie.status+")");
const publish=await request("/signed-me",{Authorization:"Bearer "+token});
const publishProtected=publish.status===401 &&
  publish.data?.reason==="signed_session_required";
console.log((publishProtected?"OK":"ÉCHEC")+": publication interdite avec ancien jeton (HTTP "+publish.status+")");
const without=await request("/me",{});
const anonymousDenied=without.status===401 &&
  without.data?.reason==="not_connected";
console.log((anonymousDenied?"OK":"ÉCHEC")+": visiteur non connecté refusé (HTTP "+without.status+")");
if(!bearerOk||!cookieOk||!publishProtected||!anonymousDenied)process.exitCode=1;
