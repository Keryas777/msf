const normalize=value=>String(value??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[\s_-]+/g,"").replace(/[^a-z0-9]/g,"");
function ownedChars(roster,catalog){if(!roster||!roster.chars||typeof roster.chars!=="object"||Array.isArray(roster.chars))return null;const idx=new Map();for(const c of catalog||[]){if(!c?.id)continue;for(const k of [c.id,c.nameKey,...(c.rosterAliases||[])])if(k){const key=normalize(k);if(idx.has(key)&&idx.get(key)?.id!==c.id)idx.set(key,null);else if(!idx.has(key))idx.set(key,c)}}const out=[];for(const [key,progress]of Object.entries(roster.chars)){const c=idx.get(normalize(key));if(c&&progress&&typeof progress==="object")out.push({id:c.id,tags:Array.isArray(c.tags)?c.tags:null,progress})}return out}
function rewardProgress(dimension,owned,catalog){const id=dimension?.completionRule?.characterId;if(!id)return null;const c=(catalog||[]).find(x=>x?.id===id);if(!c)return null;const keys=new Set([c.id,c.nameKey,...(c.rosterAliases||[])].filter(Boolean).map(normalize));return owned.find(x=>keys.has(normalize(x.id)))?.progress||null}
function evaluateAlternativeRequirement(req,owned){
  const need=Number(req.minCharacters);
  if(!Number.isSafeInteger(need)||need<1||!Array.isArray(req.alternatives)||!req.alternatives.length)return "unknown";
  let yes=0,unknown=0;
  for(const c of owned){
    let matched=false,uncertain=false;
    for(const f of req.alternatives){
      const any=Array.isArray(f.tagIds)?f.tagIds:[];
      const all=Array.isArray(f.allTagIds)?f.allTagIds:[];
      const except=Array.isArray(f.excludeTagIds)?f.excludeTagIds:[];
      if((any.length||all.length||except.length)&&!Array.isArray(c.tags)){
        uncertain=true;continue;
      }
      if(any.length&&!any.some(t=>c.tags.includes(t)))continue;
      if(all.length&&!all.every(t=>c.tags.includes(t)))continue;
      if(except.some(t=>c.tags.includes(t)))continue;
      const gear=Number(c.progress?.gear);
      if(f.minGear!=null&&!Number.isFinite(gear)){uncertain=true;continue;}
      if(f.minGear!=null&&gear<Number(f.minGear))continue;
      matched=true;break;
    }
    if(matched)yes++;else if(uncertain)unknown++;
  }
  return yes>=need?"true":yes+unknown>=need?"unknown":"false";
}
function nodeState(node,owned){if(Array.isArray(node?.requirement?.alternatives))return evaluateAlternativeRequirement(node.requirement,owned);const req=node?.requirement;if(!req||!Array.isArray(req.groups)||!req.groups.length)return"unknown";let uncertain=false;for(const g of req.groups){const need=Number(g.minCharacters);if(!Number.isSafeInteger(need)||need<1||!Array.isArray(g.tagIds)||!g.tagIds.length){uncertain=true;continue}const possible=owned.filter(c=>!Array.isArray(c.tags)||g.tagIds.some(t=>c.tags.includes(t)));let yes=0,unknown=0;for(const c of possible){if(!Array.isArray(c.tags)){unknown++;continue}if(!g.tagIds.some(t=>c.tags.includes(t))||(g.excludeTagIds||[]).some(t=>c.tags.includes(t)))continue;let pass=true,uncertainProgress=false;for(const [field,prop]of [["minLevel","level"],["minGear","gear"],["minIsoTier","isoMax"]])if(g[field]!=null){const n=Number(c.progress[prop]);if(!Number.isFinite(n)){uncertainProgress=true;break}if(n<Number(g[field])){pass=false;break}}if(pass)yes++;else if(uncertainProgress)unknown++}if(yes<need&&yes+unknown>=need)uncertain=true;else if(yes<need)return"false"}return uncertain?"unknown":"true"}
export function evaluateDimension({dimension,roster,catalog,firstClearObservedAt=null}){const owned=ownedChars(roster,catalog);if(!owned)return{status:"unavailable",completed:false,consecutive:null,prepared:null,percent:null,nodeStates:[]};const nodes=[...(dimension.nodes||[])].sort((a,b)=>a.order-b.order);const nodeStates=nodes.map(n=>({id:n.id,state:nodeState(n,owned)}));const reward=rewardProgress(dimension,owned,catalog);const tiers=dimension?.completionRule?.tiers;const passages=reward?(Array.isArray(tiers)&&tiers.length?tiers.reduce((best,tier)=>Number(reward.yellowStars)>=tier.minYellowStars&&Number(reward.redStars)>=tier.minRedStars?Math.max(best,tier.passages):best,0):1):0;const completed=passages>0;if(completed)return{status:"completed",completed:true,passages,firstClearObservedAt:typeof firstClearObservedAt==="string"&&Number.isFinite(Date.parse(firstClearObservedAt))?firstClearObservedAt:null,firstClearDays:firstClearDurationDays(dimension?.launchDate,firstClearObservedAt),consecutive:nodes.length,prepared:nodes.length,percent:100,nodeStates};let consecutive=0,blockedByUnknown=false;for(const n of nodeStates){if(n.state==="unknown"){blockedByUnknown=true;break}if(n.state==="false")break;consecutive++}const unknown=nodeStates.some(n=>n.state==="unknown");return{status:unknown?"indeterminate":"theoretical",completed:false,consecutive:blockedByUnknown?null:consecutive,prepared:unknown?null:nodeStates.filter(n=>n.state==="true").length,percent:blockedByUnknown||!nodes.length?null:Math.round(consecutive/nodes.length*100),nodeStates}}
export function firstClearDurationDays(launchDate,observedAt){if(typeof launchDate!=="string"||typeof observedAt!=="string"||!/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(launchDate)||!/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(observedAt))return null;const start=Date.parse(launchDate),end=Date.parse(observedAt);return Number.isFinite(start)&&Number.isFinite(end)&&end>=start?Math.floor((end-start)/86400000):null}
export function compareResults(a,b){if(a.completed!==b.completed)return a.completed?-1:1;if(a.completed&&b.completed&&(a.passages||1)!==(b.passages||1))return (b.passages||1)-(a.passages||1);if(a.completed&&b.completed){const aKnown=Number.isFinite(Date.parse(a.firstClearObservedAt)),bKnown=Number.isFinite(Date.parse(b.firstClearObservedAt));if(aKnown!==bKnown)return aKnown?-1:1;if(aKnown&&bKnown&&Date.parse(a.firstClearObservedAt)!==Date.parse(b.firstClearObservedAt))return Date.parse(a.firstClearObservedAt)-Date.parse(b.firstClearObservedAt)}for(const k of ["consecutive","prepared"])if(Number.isFinite(a[k])&&Number.isFinite(b[k])&&a[k]!==b[k])return b[k]-a[k];return 0}
export function rankResults(rows){const canRank=rows.filter(x=>x.result?.completed||(Number.isFinite(x.result?.consecutive)&&Number.isFinite(x.result?.prepared))).sort((a,b)=>compareResults(a.result,b.result));let rank=0,prev=null;canRank.forEach((row,i)=>{if(!prev||compareResults(prev,row.result)!==0)rank=i+1;row.rank=rank;prev=row.result});return{ranked:canRank,indeterminate:rows.filter(x=>!canRank.includes(x))}}
export const normalizeRosterCharacterKey=normalize;