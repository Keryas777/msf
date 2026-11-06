// Optional, signed Discord -> MSF identity lookup shared by both war tools.
// Never rely on decoded local session claims to authorize an identity.
(()=>{
  "use strict";
  const URL="https://losp-roster-service.deliriousfan7.workers.dev/api/secure/player-links";
  const SIGNED=/^v1\.[A-Za-z0-9_-]{12,4096}\.[A-Za-z0-9_-]{40,80}$/;
  const ALLIANCE=/^[a-z][a-z0-9-]{1,63}$/;
  const clean=s=>String(s||"").trim();
  async function load(){
    if(window.LoSP_AUTH_READY)await window.LoSP_AUTH_READY;
    if(window.LoSP_SESSION?.ok!==true||window.LoSP_SESSION?.previewMode)
      return [];
    let token="";
    try{token=localStorage.getItem("losp_session")||"";}catch{}
    if(!SIGNED.test(token))return [];
    try{
      const response=await fetch(URL,{
        method:"GET",mode:"cors",cache:"no-store",
        headers:{Authorization:"Bearer "+token}
      });
      if(!response.ok)return [];
      const data=await response.json();
      if(data?.status!=="ok"||!Array.isArray(data.links)||
         data.links.length>100)return [];
      const allowed=new Set(window.LoSP_SESSION.allowedAlliances||[]);
      return data.links.filter(x=>
        x&&ALLIANCE.test(x.alliance||"")&&allowed.has(x.alliance)&&
        typeof x.player==="string"&&x.player.trim()&&x.player.length<=120)
        .map(x=>({alliance:x.alliance,player:clean(x.player)}));
    }catch{return [];} // Existing manual selection remains available offline.
  }
  window.LoSPIdentityLinks=Object.freeze({load});
})();
