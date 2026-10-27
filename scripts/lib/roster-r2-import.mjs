// Pure validation and conversion for pre-existing private R2 roster campaigns.
// No Scopely calls and no private account or alliance IDs in public JSON.
export const FP=/^[a-f0-9]{64}$/;
const RUN=/^[a-f0-9-]{36}$/;
const stamp=s=>typeof s==='string'&&Number.isFinite(Date.parse(s))?Date.parse(s):NaN;
const num=x=>Number.isSafeInteger(x)&&x>=0;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export const keyOf=s=>String(s??'').trim().toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const cleanName=name=>String(name||'').replace(/<#[0-9a-fA-F]{6}>/g,'').trim();

export function rosterWindow(day,period){
  if(!/^\d{4}-\d\d-\d\d$/.test(day)||!['am','pm'].includes(period)||
    !Number.isFinite(Date.parse(day+'T00:00:00Z'))||
    new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day)
    throw Error('Invalid UTC roster campaign');
  const from=period==='am'?'02:00:00':'14:00:00';
  const to=period==='am'?'06:00:00':'18:00:00';
  return {day,period,campaign:day+'-'+period,
    start:day+'T'+from+'.000Z',endExclusive:day+'T'+to+'.000Z'};
}
export function validManifestAndProgress(progress,manifest,fp,window,now=Date.now()){
  if(!FP.test(fp)||!object(progress)||!object(manifest)||
    progress.version!==1||manifest.version!==1||
    progress.fingerprint!==fp||manifest.fingerprint!==fp||
    !RUN.test(progress.runId)||manifest.runId!==progress.runId||
    progress.campaign!==window.campaign||
    progress.membershipDigest!==manifest.membershipDigest||
    !FP.test(manifest.membershipDigest)||progress.selfCompleted!==true||
    manifest.includesPersonal!==true||
    !Number.isInteger(progress.completed)||progress.completed<0||
    progress.completed!==progress.totalEligible||
    manifest.coMembers!==progress.completed||
    manifest.total!==progress.completed+1||
    !num(progress.observedMembers)||
    manifest.observedMembers!==progress.observedMembers||
    manifest.observedMembers<manifest.total||manifest.observedMembers>100||
    !Number.isFinite(stamp(manifest.capturedAt))||
    stamp(manifest.capturedAt)<stamp(window.start)||
    stamp(manifest.capturedAt)>=stamp(window.endExclusive)||
    stamp(manifest.expiresAt)<=now||
    stamp(progress.expiresAt)<=now||
    manifest.expiresAt!==progress.expiresAt)
    return false;
  // Older manifests without coverage fields represented full sharing.
  // New authorized-only manifests attest ONLY the rosters actually collected.
  // A missing consent must be explicit, never silently treated as a player.
  const omitted=manifest.observedMembers-manifest.total;
  if(manifest.coverage===undefined)
    return omitted===0&&manifest.notSharedCount===undefined;
  if(manifest.coverage==='all-members')
    return omitted===0&&manifest.notSharedCount===0;
  return manifest.coverage==='authorized-only'&&omitted>0&&
    num(manifest.notSharedCount)&&manifest.notSharedCount===omitted;
}
export function validateRosterRecord(row,fp,runId,index,window,now=Date.now()){
  if(!object(row)||row.version!==1||row.allianceFingerprint!==fp||
    row.runId!==runId||row.memberIndex!==index||
    row.kind!==(index==='self'?'private-staged-personal-roster':'private-staged-microbatch')||
    typeof row.name!=='string'||!cleanName(row.name)||
    row.name.length>140||
    typeof row.volatileMemberId!=='string'||!row.volatileMemberId||
    row.volatileMemberId.length>256||
    stamp(row.capturedAt)<stamp(window.start)||
    stamp(row.capturedAt)>=stamp(window.endExclusive)||
    stamp(row.expiresAt)<=now||
    !Array.isArray(row.characters)||row.characters.length<1||
    row.characters.length>800)
    throw Error('Invalid or stale private roster record');
  const seen=new Set();
  for(const c of row.characters){
    if(!object(c)||typeof c.id!=='string'||!/^[A-Za-z0-9:_-]{1,180}$/.test(c.id)||
      seen.has(c.id)||!num(c.power))
      throw Error('Invalid/duplicate character in private roster');
    seen.add(c.id);
  }
  return row;
}
export function validateCampaignMembers(records,expected){
  if(records.length!==expected)throw Error('Incomplete authorized roster campaign');
  const names=new Set(),ids=new Set();
  for(const row of records){
    const n=keyOf(cleanName(row.name));
    if(!n||names.has(n)||ids.has(row.volatileMemberId))
      throw Error('Duplicate/ambiguous roster member');
    names.add(n);ids.add(row.volatileMemberId);
  }
  return records;
}
export async function loadRosterCampaign(r2,fp,window,now=Date.now()){
  if(!FP.test(fp))throw Error('Invalid alliance fingerprint');
  const root='roster-batches/v1/'+fp+'/';
  // Prefer a durable, self-contained receipt for the requested UTC
  // campaign. The current progress/latest pointers are overwritten as soon
  // as a newer AM/PM campaign starts, so they cannot support late retries.
  const receipt=await r2.getJSON(root+'campaigns/'+window.campaign+'.json',64000);
  let progress,manifest;
  if(receipt!==null){
    // Fail closed on a malformed receipt. Never silently fall back to a
    // different campaign or mark a corrupt archive as complete.
    if(!object(receipt)||receipt.version!==1||
       receipt.campaign!==window.campaign||
       !object(receipt.progress)||!object(receipt.manifest))
      throw Error('Invalid private R2 campaign completion receipt');
    ({progress,manifest}=receipt);
  }else{
    // Compatibility with pre-upgrade captures, only when their mutable
    // pointers STILL refer to this exact campaign.
    [progress,manifest]=await Promise.all([
      r2.getJSON(root+'progress.json',32000),
      r2.getJSON(root+'latest-complete.json',32000)
    ]);
  }
  if(!validManifestAndProgress(progress,manifest,fp,window,now))return null;
  const rootRun=root+manifest.runId+'/';
  const records=[];
  for(let i=0;i<manifest.coMembers;i++){
    const row=await r2.getJSON(rootRun+'member-'+i+'.json',3100000);
    if(!row)return null;
    records.push(validateRosterRecord(row,fp,manifest.runId,i,window,now));
  }
  const self=await r2.getJSON(rootRun+'member-self.json',3100000);
  if(!self)return null;
  records.push(validateRosterRecord(self,fp,manifest.runId,'self',window,now));
  validateCampaignMembers(records,manifest.total);
  return {window,records,capturedAt:manifest.capturedAt};
}
export function resolveAlias(name,aliases){
  let value=cleanName(name);
  const entries=object(aliases?.aliases)?aliases.aliases:{};
  const map=new Map(Object.entries(entries).map(([a,b])=>[keyOf(a),b]));
  const seen=new Set();
  for(let i=0;i<10;i++){
    const key=keyOf(value);
    if(seen.has(key))throw Error('Cyclic player alias');
    seen.add(key);
    const next=map.get(key);
    if(typeof next!=='string'||!next.trim())break;
    const canonical=cleanName(next);
    // Display-only alias variants can normalize to their own target
    // (e.g. "⚔️Zabuza⚔️" -> "Zabuza"). This is a terminal mapping,
    // not an identity cycle. Keep the canonical spelling and stop.
    if(keyOf(canonical)===key){
      value=canonical;
      break;
    }
    value=canonical;
  }
  return value;
}
// Scopely's statsFormat=csv ISO field is a trimmed CSV string:
// [0..5] additional ISO fields, [6] active class, [7..11] the five
// class levels (Striker, Fortifier, Healer, Skirmisher, Raider).
// Trailing levels are omitted by the provider, not assumed present.
// Require at least one explicitly reported class level before inferring ISO.
function isoFromProviderCsv(iso8){
  if(typeof iso8!=='string')return null;
  const fields=iso8.split(',');
  if(fields.length<8||fields.length>12)return null;
  const isoClass=fields[6].trim().toLowerCase();
  if(!['striker','fortifier','healer','skirmisher','raider'].includes(isoClass))
    return null;
  const levels=fields.slice(7).map(s=>s.trim());
  if(!levels.every(s=>/^\d+$/.test(s)&&Number.isSafeInteger(Number(s))))
    return null;
  return {isoMax:Math.max(...levels.map(Number)),isoClass};
}
export function convertCharacter(raw,prior){
  const key=keyOf(raw.id);
  if(!key||!num(raw.power))throw Error('Invalid character');
  const level=raw.level,gear=raw.gearTier??raw.gear;
  const yellow=raw.activeYellow??raw.yellowStars;
  const activeRed=raw.activeRed;
  // ActiveRed represents 1–7 red stars followed by diamond tiers.
  const red=activeRed??raw.redStars;
  const diamond=activeRed===undefined?raw.diamonds:Math.max(0,activeRed-7);
  const validCore=[level,gear,yellow,red,diamond].every(num);
  if(!prior&&!validCore)return null; // Unknown core fields must never become invented zeros.
  const value={...(prior||{})};
  value.power=raw.power;
  if(num(level))value.level=level;
  if(num(gear))value.gear=gear;
  if(num(yellow))value.yellowStars=yellow;
  if(num(red)){value.redStars=Math.min(red,7);value.diamonds=num(diamond)?diamond:0;}
  // Preserve known CSV measurements, but use actual reported ISO class
  // levels to detect newer progress. Never infer ISO 0 from absent levels.
  const csvIso=isoFromProviderCsv(raw.iso8);
  if(csvIso)value.isoMax=num(value.isoMax)?
    Math.max(value.isoMax,csvIso.isoMax):csvIso.isoMax;
  else if(!prior&&num(raw.isoMax))value.isoMax=raw.isoMax;
  return {key,value,isoClass:csvIso?.isoClass??
    (typeof raw.iso8?.activeClass==='string'?raw.iso8.activeClass:
    typeof raw.iso8?.class==='string'?raw.iso8.class:null),
    isoColor:typeof raw.iso8?.matrixColor==='string'?raw.iso8.matrixColor:null};
}
export function convertAllianceRosters(alliance,records,priorRows,aliases){
  if(typeof alliance!=='string'||!keyOf(alliance)||!Array.isArray(priorRows)||
    !Array.isArray(records)||records.length===0)
    throw Error('Invalid alliance roster inputs');
  const existing=new Map();
  for(const row of priorRows){
    if(!object(row)||typeof row.player!=='string')throw Error('Invalid previous roster row');
    const k=keyOf(row.playerKey||resolveAlias(row.player,aliases));
    if(!k||existing.has(k))throw Error('Ambiguous previous player identity');
    existing.set(k,row);
  }
  const rows=[],keys=new Set();
  for(const member of records){
    const named=resolveAlias(member.name,aliases),pkey=keyOf(named);
    if(!pkey||keys.has(pkey))throw Error('Ambiguous incoming player identity');
    keys.add(pkey);
    const old=existing.get(pkey);
    const player=old?.player||named;
    const chars={...(old?.chars||{})},iso={...(old?.iso||{})};
    const sourceCharIds=new Set();
    for(const raw of member.characters){
      const ckey=keyOf(raw.id);
      if(sourceCharIds.has(ckey))throw Error('Duplicate normalized character identity');
      sourceCharIds.add(ckey);
      const translated=convertCharacter(raw,chars[ckey]);
      if(!translated)continue; // e.g. new character lacking ISO matrix details
      chars[ckey]=translated.value;
      if(translated.isoClass!==null||translated.isoColor!==null){
        const priorIso=iso[ckey]||{};
        iso[ckey]={
          isoClass:translated.isoClass??priorIso.isoClass??'',
          isoColor:translated.isoColor??priorIso.isoColor??''
        };
      }
    }
    if(Object.keys(chars).length===0)throw Error('Member has no convertible characters');
    rows.push({alliance,player,playerKey:old?.playerKey||pkey,chars,iso});
  }
  return rows.sort((a,b)=>a.playerKey.localeCompare(b.playerKey,'fr'));
}
