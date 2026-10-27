// Public, non-sensitive import checkpoint committed with roster JSON.
// A delayed AM recovery must never overwrite a newer PM campaign.
export const ROSTER_IMPORT_STATE_PATH='.github/roster-r2-import-state.json';
const CAMPAIGN=/^\d{4}-\d{2}-\d{2}-(?:am|pm)$/;
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export function parseRosterImportState(value){
  if(value===null)return {version:1,alliances:{}};
  if(!isObject(value)||value.version!==1||!isObject(value.alliances))
    throw Error('Invalid roster R2 publication checkpoint');
  for(const [key,campaign] of Object.entries(value.alliances)){
    if(!/^[a-z0-9-]+$/.test(key)||typeof campaign!=='string'||
       !CAMPAIGN.test(campaign)||!Number.isFinite(Date.parse(campaign.slice(0,10)+'T00:00:00Z'))||
       new Date(campaign.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10)!==campaign.slice(0,10))
      throw Error('Invalid per-alliance roster R2 campaign checkpoint');
  }
  return value;
}
export function rosterCampaignIsNewer(state,key,campaign){
  if(!CAMPAIGN.test(campaign))throw Error('Invalid roster campaign');
  const last=state.alliances[key];
  return last===undefined||campaign>last;
}
export function advanceRosterImportState(state,keys,campaign){
  if(!CAMPAIGN.test(campaign))throw Error('Invalid roster campaign');
  const next={version:1,alliances:{...state.alliances}};
  for(const key of keys){
    if(!rosterCampaignIsNewer(next,key,campaign))
      throw Error('Roster R2 publication checkpoint cannot move backwards');
    next.alliances[key]=campaign;
  }
  return next;
}
