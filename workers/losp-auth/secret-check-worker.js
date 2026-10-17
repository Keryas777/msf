// Temporary diagnostic: upload to a version URL with 0% production traffic.
const CHECK_KEY="REPLACE_WITH_NONCE";
const EXPIRE_AT=1;
const CLIENT_ID="1498718329953583266";
const GUILD_ID="758717819923333191";
const TEST_MEMBER_ID="300305626926415874";
async function oauth(env){
  if(!env.DISCORD_CLIENT_SECRET)return {ok:false,status:0};
  try{
    const resp=await fetch("https://discord.com/api/v10/oauth2/token",{
      method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({
        client_id:CLIENT_ID,client_secret:env.DISCORD_CLIENT_SECRET,
        grant_type:"client_credentials",scope:"identify"
      })
    });
    const data=await resp.json().catch(()=>({}));
    // Never return or log access_token.
    return {ok:resp.ok&&typeof data.access_token==="string"&&data.access_token.length>0,status:resp.status};
  }catch{return {ok:false,status:0};}
}
async function bot(env){
  if(!env.DISCORD_BOT_TOKEN)return {ok:false,guild:false,status:0,guildStatus:0};
  try{
    const headers={Authorization:"Bot "+env.DISCORD_BOT_TOKEN};
    const resp=await fetch("https://discord.com/api/v10/users/@me",{headers});
    const data=await resp.json().catch(()=>({}));
    if(!resp.ok||data.id!==CLIENT_ID)return {ok:false,guild:false,status:resp.status,guildStatus:0};
    const member=await fetch("https://discord.com/api/v10/guilds/"+GUILD_ID+"/members/"+TEST_MEMBER_ID,{headers});
    return {ok:true,guild:member.ok,status:resp.status,guildStatus:member.status};
  }catch{return {ok:false,guild:false,status:0,guildStatus:0};}
}
async function signing(env){
  if(typeof env.SESSION_SIGNING_SECRET!=="string"||env.SESSION_SIGNING_SECRET.length<32)return false;
  try{
    const key=await crypto.subtle.importKey("raw",
      new TextEncoder().encode(env.SESSION_SIGNING_SECRET),
      {name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);
    const message=new TextEncoder().encode("LoSP-signing-test");
    return crypto.subtle.verify("HMAC",key,
      await crypto.subtle.sign("HMAC",key,message),message);
  }catch{return false;}
}
export default {
  async fetch(request,env){
    if(request.method!=="POST"||new URL(request.url).pathname!=="/__check"||
       Date.now()>EXPIRE_AT||request.headers.get("X-LoSP-Probe")!==CHECK_KEY)
      return new Response("Not found",{status:404});
    const [a,b,c]=await Promise.all([oauth(env),bot(env),signing(env)]);
    return Response.json({
      clientSecret:a.ok,botToken:b.ok,guildAccess:b.guild,sessionSigningSecret:c,
      http:{oauth:a.status,bot:b.status,guild:b.guildStatus},
      ok:a.ok&&b.ok&&b.guild&&c
    },{headers:{"Cache-Control":"no-store"}});
  }
};
