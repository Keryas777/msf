// Épreuve cosmique : publication directe par les joueurs, sans serveur lourd.
// GitHub (main) est la source versionnée, avec commit atomique sur ref HEAD.
// Aucun token d'écriture, rôle ou identité ne vient du navigateur.
const ORIGIN = "https://keryas777.github.io";
const REPO = "Keryas777/msf";
const PATH = "docs/data/cosmic-defenses.json";
const AUTH_URL = "https://losp-auth.internal/signed-me";
const API = "https://api.github.com/repos/" + REPO;
const MAX_BODY = 12000;
const HEADERS = { "Cache-Control":"no-store", "Content-Type":"application/json; charset=utf-8" };
const encode = value => {
  const bytes = new TextEncoder().encode(value);
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
};
const decode = data => {
  const binary = atob(String(data || "").replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binary, x => x.charCodeAt(0)));
};
const clean = (v,n) => String(v ?? "").trim().slice(0,n);
function cors(request) {
  const origin = request.headers.get("Origin");
  return {
    "Access-Control-Allow-Origin":origin === ORIGIN ? ORIGIN : "null",
    "Access-Control-Allow-Methods":"GET,POST,OPTIONS",
    "Access-Control-Allow-Headers":"Content-Type, Authorization",
    "Vary":"Origin"
  };
}
function reply(request,payload,status=200) {
  return new Response(JSON.stringify(payload),{status,headers:{...HEADERS,...cors(request)}});
}
class HttpError extends Error {
  constructor(status,code,message){super(message || code);this.status=status;this.code=code;}
}
function token(env) {
  const value=String(env?.GITHUB_TOKEN || "").trim();
  if (!value) throw new HttpError(503,"not_configured","La publication directe n'est pas encore configurée.");
  return value;
}
function authBinding(env) {
  if (typeof env?.LOSP_AUTH?.fetch !== "function") {
    throw new HttpError(503,"auth_not_configured","Connexion Discord indisponible.");
  }
  return env.LOSP_AUTH;
}
async function api(env,path,options={}) {
  const headers = new Headers({
    "Authorization":"Bearer " + token(env),
    "Accept":"application/vnd.github+json",
    "X-GitHub-Api-Version":"2022-11-28",
    "Cache-Control":"no-store",
    ...options.headers
  });
  const res=await fetch(API+path,{
    method:options.method||"GET",headers,
    body:options.body ? JSON.stringify(options.body) : undefined
  });
  if (!res.ok) {
    const retryable=(res.status===409 || res.status===422);
    throw new HttpError(retryable?409:(res.status===401||res.status===403?503:502),
      retryable?"git_conflict":"github_error","Échec du stockage des défenses ("+res.status+").");
  }
  return res.json();
}
async function head(env){
  const ref=await api(env,"/git/ref/heads/main");
  const sha=ref?.object?.sha;
  if(!/^[a-f0-9]{40}$/.test(sha||""))throw new HttpError(502,"bad_ref");
  return sha;
}
async function fileAt(env,path,sha) {
  const content=await api(env,"/contents/"+path+"?ref="+encodeURIComponent(sha));
  if (content.encoding!=="base64"||typeof content.content!=="string") {
    throw new HttpError(502,"invalid_github_blob");
  }
  return JSON.parse(decode(content.content));
}
async function snapshot(env) {
  const sha=await head(env);
  const [config,rows]=await Promise.all([
    fileAt(env,"docs/data/cosmic-config.json",sha),
    fileAt(env,PATH,sha)
  ]);
  if (!/^season-[1-9]\d*$/.test(config?.season?.id || "") ||
      !Array.isArray(rows)) throw new HttpError(503,"invalid_catalog");
  return {sha,season:config.season.id,rows};
}
async function requireDiscord(request,env) {
  const provided=request.headers.get("Authorization")||"";
  if (!/^Bearer v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(provided)) {
    throw new HttpError(401,"signed_login_required",
      "Reconnecte-toi à Discord pour activer la publication sécurisée.");
  }
  let response;
  try {
    response=await authBinding(env).fetch(new Request(AUTH_URL,{
      headers:{Authorization:provided,Accept:"application/json"},method:"GET"
    }));
  } catch {
    throw new HttpError(503,"auth_unavailable","Vérification Discord indisponible.");
  }
  const data=await response.json().catch(()=>null);
  if (!response.ok||data?.ok!==true||data?.signedSession!==true ||
      !/^\d{15,22}$/.test(String(data.id||""))) {
    throw new HttpError(401,"invalid_login","Session Discord non vérifiée. Reconnecte-toi.");
  }
  const name=clean(data.displayName||data.global_name||data.username,80);
  if (!name) throw new HttpError(401,"missing_discord_name");
  return { id:String(data.id),name };
}
function parseRooms(payload,season,knownIds){
  if (!payload||payload.season!==season||!Array.isArray(payload.rooms) ||
      payload.rooms.length<1||payload.rooms.length>6)
    throw new HttpError(400,"invalid_season_or_rooms","Saison différente ou salles invalides.");
  const used=new Set();
  return payload.rooms.map(room=>{
    const id=room?.room;
    if(!Number.isInteger(id)||id<1||id>6||used.has(id)) {
      throw new HttpError(400,"invalid_room","Salle invalide ou en double.");
    }
    used.add(id);
    const chars=room?.characters;
    if (!Array.isArray(chars)||chars.length!==5 ||
        chars.some(c=>typeof c!=="string"||!knownIds.has(c)) ||
        new Set(chars).size!==5) {
      throw new HttpError(400,"invalid_characters","La salle doit contenir cinq personnages jouables différents.");
    }
    if(room.notes != null && (typeof room.notes!=="string"||room.notes.length>250))
      throw new HttpError(400,"invalid_notes","Note trop longue.");
    return {room:id,characters:chars,notes:clean(room.notes,250)};
  });
}
async function playableIds(env,sha){
  // Snapshot figé au commit, pour refuser IDs arbitraires/boss/NPC.
  const rows=await fileAt(env,"docs/data/msf-characters.json",sha);
  if(!Array.isArray(rows))throw new HttpError(503,"characters_unavailable");
  return new Set(rows.filter(row=>row?.player_Character===true && row.id).map(row=>String(row.id)));
}
function mergeRows(rows,season,author,rooms,title){
  const changed=new Set(rooms.map(r=>r.room));
  const isOwned=row=>row?.season===season&&row?.authorDiscordId===author.id &&
    (!row.source || row.source==="Personnel");
  // Les salles du même membre restent sous un seul titre sans changer leurs compositions.
  // Seul l'ID Discord signé détermine la propriété d'une ligne.
  const other=rows.filter(row=>!(isOwned(row)&&changed.has(Number(row.room))))
    .map(row=>isOwned(row)?{...row,title,author:author.name}:row);
  const now=new Date().toISOString();
  const added=rooms.map(r=>({
    season,room:r.room,characters:r.characters,
    authorDiscordId:author.id,author:author.name,source:"Personnel",
    name:"Défense de "+author.name,title,notes:r.notes,
    publishedAt:now
  }));
  if(other.length+added.length>4000)
    throw new HttpError(409,"catalog_full","Catalogue plein : publication suspendue.");
  return [...other,...added];
}
function recentlyPublished(rows,season,id) {
  const cutoff=Date.now()-15000;
  return rows.some(row=>row?.season===season && row?.authorDiscordId===id &&
    Number.isFinite(Date.parse(row.publishedAt)) && Date.parse(row.publishedAt)>cutoff);
}
async function commitRows(env,snapshot,rows) {
  const base=await api(env,"/git/commits/"+snapshot.sha);
  const tree=await api(env,"/git/trees",{
    method:"POST",
    body:{base_tree:base.tree.sha,tree:[{path:PATH,mode:"100644",type:"blob",content:JSON.stringify(rows,null,2)+"\n"}]}
  });
  const commit=await api(env,"/git/commits",{
    method:"POST",
    body:{message:"data(cosmic): joueur publie ses défenses",tree:tree.sha,parents:[snapshot.sha]}
  });
  await api(env,"/git/refs/heads/main",{method:"PATCH",body:{sha:commit.sha,force:false}});
  return commit.sha;
}
async function publish(request,env){
  if(request.headers.get("Origin")!==ORIGIN)
    throw new HttpError(403,"forbidden_origin");
  if(Number(request.headers.get("Content-Length")||0)>MAX_BODY)
    throw new HttpError(413,"payload_too_large");
  const author=await requireDiscord(request,env);
  if(!request.headers.get("Content-Type")?.toLowerCase().includes("application/json"))
    throw new HttpError(415,"json_required");
  const input=await request.text();
  if(input.length>MAX_BODY)throw new HttpError(413,"payload_too_large");
  let payload;
  try{payload=JSON.parse(input);}catch{throw new HttpError(400,"invalid_json");}
  // Une écriture concurrente est retentée sur le HEAD le plus récent ; si la
  // saison a changé dans l'intervalle, aucune publication de l'ancienne saison.
  for(let i=0;i<4;i++){
    const current=await snapshot(env);
    const ids=await playableIds(env,current.sha);
    const rooms=parseRooms(payload,current.season,ids);
    if (payload.title !== undefined &&
        (typeof payload.title !== "string" || payload.title.length > 60))
      throw new HttpError(400,"invalid_title","Titre de défense invalide (60 caractères maximum).");
    const previousTitle=current.rows.find(row=>row?.season===current.season &&
      row?.authorDiscordId===author.id && (!row.source||row.source==="Personnel"))?.title;
    const title=payload.title===undefined
      ? (clean(previousTitle,60)||"Mes défenses")
      : (clean(payload.title,60)||"Mes défenses");
    // Évite les commits inutiles et l'envoi de spam ; 6 salles maximum
    // par compte Discord et au plus une publication toutes les 15 secondes.
    const noChange=rooms.every(room=>current.rows.some(row=>
      row?.season===current.season && row?.authorDiscordId===author.id &&
      row?.source==="Personnel" && Number(row.room)===room.room &&
      JSON.stringify(row.characters)===JSON.stringify(room.characters) &&
      String(row.notes||"")===room.notes && clean(row.title,60)===title
    ));
    if(noChange)return {ok:true,season:current.season,published:rooms.length,unchanged:true};
    if(recentlyPublished(current.rows,current.season,author.id))
      throw new HttpError(429,"slow_down","Attends 15 secondes avant de republier.");
    const next=mergeRows(current.rows,current.season,author,rooms,title);
    try {
      const sha=await commitRows(env,current,next);
      return {ok:true,season:current.season,published:rooms.length,commit:sha};
    }catch(error){
      if(error.code!=="git_conflict"||i===3)throw error;
    }
  }
  throw new HttpError(409,"busy");
}
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(request.method==="OPTIONS")
      return new Response(null,{status:204,headers:cors(request)});
    if(url.pathname==="/health")
      return reply(request,{ok:true,configured:Boolean(env?.GITHUB_TOKEN&&env?.LOSP_AUTH?.fetch)});
    if(url.pathname!=="/api/cosmic-defenses")
      return reply(request,{ok:false,error:"not_found"},404);
    try{
      if(request.method==="GET"){
        const data=await snapshot(env);
        return reply(request,{ok:true,season:data.season,entries:data.rows.filter(
          row=>row?.season===data.season)});
      }
      if(request.method==="POST")return reply(request,await publish(request,env));
      return reply(request,{ok:false,error:"method_not_allowed"},405);
    }catch(error){
      return reply(request,{ok:false,error:error.code||"server_error",
        message:error.status?error.message:"Service de publication temporairement indisponible."},
        error.status||502);
    }
  }
};
