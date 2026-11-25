const PLANNER_ORIGIN="https://losp-roster-service.deliriousfan7.workers.dev";

export function isPlannerOwner(session){
  return globalThis.window?.LoSPAccess?.isLoSPOwnerAdmin?.(session)===true;
}

export function isPlannerLinkVisible(realSession,viewSession){
  if(viewSession?.previewMode===true)return false;
  return isPlannerOwner(realSession||viewSession);
}

export function plannerUrlForEvent(eventId){
  const id=String(eventId??"").trim();
  if(!/^[A-Za-z0-9_.:-]{1,160}$/.test(id))return null;
  const url=new URL("/admin/events-planner",PLANNER_ORIGIN);
  url.searchParams.set("eventId",id);
  return url.toString();
}

function ownerView(){
  return isPlannerLinkVisible(window.LoSP_REAL_SESSION,window.LoSP_SESSION);
}

function syncLinks(){
  const owner=ownerView();
  for(const card of document.querySelectorAll(".ev-card[data-event-id]")){
    const existing=card.querySelector(".planner-owner-link");
    const href=owner?plannerUrlForEvent(card.dataset.eventId):null;
    if(!href){existing?.remove();continue;}
    const copy=card.querySelector(".ev-card-copy");if(!copy)continue;
    const link=existing||document.createElement("a");
    link.className="planner-owner-link";link.href=href;link.textContent="Planifier avec mon roster";
    link.setAttribute("aria-label","Planifier cet événement avec mon roster");
    if(!existing)copy.append(link);
  }
}

function start(){
  if(location.hostname!=="keryas777.github.io"||!location.pathname.endsWith("/evenements.html"))return;
  window.addEventListener("losp:auth-ready",syncLinks);
  if(window.LoSP_AUTH_READY&&typeof window.LoSP_AUTH_READY.then==="function")window.LoSP_AUTH_READY.then(syncLinks).catch(()=>{});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",syncLinks,{once:true});
  const target=document.querySelector(".ev-page")||document.documentElement;
  new MutationObserver(syncLinks).observe(target,{childList:true,subtree:true});
  syncLinks();
}

if(typeof window!=="undefined"&&typeof document!=="undefined")start();
