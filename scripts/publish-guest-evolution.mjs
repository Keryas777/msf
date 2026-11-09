// Export approved cumulative guest Evolution archives from private R2 to GitHub Pages.
// Dry-run by default. This script never calls Scopely and never publishes raw archives.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createPrivateR2Reader} from './lib/private-r2-read.mjs';

const ROOT='webapp-evolution/v1/';
const APPROVALS='roster-sync/v1/approved-guest-alliances.json';
const CAMPAIGNS='roster-batches/v1/';
const MAX_ARCHIVE=15000000,MAX_INDEX=1500000,MAX_INFOS=200000;
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const KEY=/^[a-z][a-z0-9-]{1,63}$/;
const FP=/^[a-f0-9]{64}$/;
const PLAYER=/^g_[a-z][a-z0-9-]{1,63}__[a-z0-9]{1,140}$/;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9]/g,'');
const safeDate=s=>DAY.test(s||'')&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&
  new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s&&
  new Date(s+'T00:00:00Z').getUTCDay()===0;
const rootDir=process.env.DATA_DIR||'docs/data';
const outDir=path.join(rootDir,'roster-history','guests');
const isMain=import.meta.url===pathToFileURL(process.argv[1]||'').href;
const args=isMain?process.argv.slice(2):[];
const write=args.includes('--write');
if(isMain&&args.some(x=>!['--write','--dry-run','--help','-h'].includes(x)))
  throw Error('Usage: node scripts/publish-guest-evolution.mjs [--dry-run|--write]');
if(isMain&&(args.includes('--help')||args.includes('-h'))){
  console.log('Usage: node scripts/publish-guest-evolution.mjs [--dry-run|--write]');
  process.exit(0);
}
if(isMain&&write&&process.env.LOSP_R2_GUEST_EVOLUTION_PUBLICATION_APPROVED!=='true')
  throw Error('Public guest Evolution publication is disabled pending explicit authorization.');

export function validateApprovals(record,alliances){
  if(!object(record)||record.version!==1||!Array.isArray(record.alliances))
    throw Error('Guest approval registry is invalid.');
  const canonical=new Map((Array.isArray(alliances)?alliances:[])
    .filter(a=>a&&KEY.test(a.key||'')).map(a=>[a.key,a]));
  const seenFp=new Set(),seenKey=new Set(),approved=[];
  for(const row of record.alliances){
    if(!object(row)||!FP.test(row.fingerprint||'')||seenFp.has(row.fingerprint)||
       Object.keys(row).some(k=>!['fingerprint','allianceKey'].includes(k)))
      throw Error('Guest approval entry is invalid.');
    seenFp.add(row.fingerprint);
    if(!row.allianceKey)continue;
    if(!KEY.test(row.allianceKey)||seenKey.has(row.allianceKey))
      throw Error('Guest alliance binding is invalid.');
    seenKey.add(row.allianceKey);
    const meta=canonical.get(row.allianceKey);
    if(meta&&meta.active!==false&&meta.group&&meta.group!=='losp')
      approved.push({fingerprint:row.fingerprint,key:row.allianceKey});
  }
  return approved;
}
export function validateConsent(source,fp,now=Date.now()){
  if(!object(source)||source.version!==1||source.kind!=='alliance-infos-campaign'||
     source.allianceFingerprint!==fp||!Array.isArray(source.rows)||
     source.rows.length>100||!Number.isFinite(Date.parse(source.capturedAt))||
     Date.parse(source.capturedAt)>now||Date.parse(source.capturedAt)<now-7*86400000||
     !(Date.parse(source.expiresAt)>now))return null;
  const sharers=new Set(),seen=new Set();
  for(const row of source.rows){
    const name=norm(row?.name);
    if(!name||name.length>140||seen.has(name)||typeof row.rosterShare!=='boolean')
      return null;
    seen.add(name);
    if(row.rosterShare)sharers.add(name);
  }
  return {sharers,source};
}
export function validateIndex(index,fp,key){
  if(!object(index))throw Error('Cumulative R2 index is absent or not a JSON object.');
  if(index.version!==1)throw Error('Cumulative R2 index has an unsupported version.');
  if(index.fingerprint!==fp)throw Error('Cumulative R2 index fingerprint does not match the approved archive.');
  if(index.allianceKey!==key)throw Error('Cumulative R2 index allianceKey does not match the canonical alliance binding.');
  if(!Array.isArray(index.checkpoints)||index.checkpoints.length>1000)
    throw Error('Cumulative R2 index checkpoints must be an array of at most 1000 records.');
  const dates=new Set();
  for(const c of index.checkpoints){
    if(!safeDate(c?.date)||dates.has(c.date)||
       !Number.isFinite(Date.parse(c.sourceCapturedAt))||
       !Array.isArray(c.players)||c.players.length>40||
       c.players.some(n=>typeof n!=='string'||!norm(n))||
       new Set(c.players.map(norm)).size!==c.players.length)
      throw Error('Cumulative R2 index checkpoint is invalid.');
    dates.add(c.date);
  }
  return index;
}
export function validateSnapshot(snapshot,fp,key,record){
  if(!object(snapshot)||snapshot.version!==1||snapshot.fingerprint!==fp||
     snapshot.allianceKey!==key||snapshot.date!==record.date||
     !safeDate(snapshot.date)||snapshot.sourceCapturedAt!==record.sourceCapturedAt||
     !Array.isArray(snapshot.players)||snapshot.players.length>40)
    throw Error('Cumulative R2 checkpoint is invalid.');
  const expected=new Set(record.players.map(norm)),seen=new Set();
  for(const row of snapshot.players){
    const id='g_'+key+'__'+norm(row?.player);
    const name=norm(row?.player);
    if(!PLAYER.test(id)||row.alliance!==key||!object(row.chars)||!object(row.iso)||
       seen.has(name)||!expected.has(name))throw Error('Checkpoint player data is inconsistent.');
    seen.add(name);
  }
  if(seen.size!==expected.size)throw Error('Checkpoint player list does not match its index.');
  return snapshot;
}
export function publicAsset(value){
  return typeof value==='string'&&value.length<=320&&
    /^https:\/\/assets\.marvelstrikeforce\.com\/imgs\/[A-Za-z0-9_.%-]+$/.test(value)?value:'';
}
export function publicInfos(rows,key,consent){
  return rows.filter(r=>consent.sharers.has(norm(r.name)))
    .map(r=>({name:r.name,alliance:key,
      ...(publicAsset(r.icon)?{icon:publicAsset(r.icon)}:{}),
      ...(publicAsset(r.frame)?{frame:publicAsset(r.frame)}:{})}));
}
export async function writeInfosOnly(outputDir,key,infos){
  const file=path.join(outputDir,key,'infos.json');
  const encoded=JSON.stringify(infos,null,2)+'\n';
  let prior;
  try{prior=await fs.readFile(file,'utf8');}
  catch(error){if(error?.code!=='ENOENT')throw error;}
  if(prior===encoded)return false;
  await fs.mkdir(path.dirname(file),{recursive:true});
  const staged=file+'.tmp-'+process.pid;
  try{
    await fs.writeFile(staged,encoded,'utf8');
    await fs.rename(staged,file);
  }catch(error){
    await fs.rm(staged,{force:true});
    throw error;
  }
  return true;
}
export function assertOperationalResult(approvedCount,validatedCount){
  if(approvedCount>0&&validatedCount===0)
    throw Error('No approved guest alliance passed validation; export is not operational.');
}
function publicSnapshot(snapshot,key,consent){
  const players=snapshot.players.filter(p=>consent.sharers.has(norm(p.player)));
  return {version:1,checkpoint:snapshot.date,players:players.map(p=>{
    const playerKey='g_'+key+'__'+norm(p.player);
    return {player:p.player,playerKey,alliance:key,checkpoint:snapshot.date,
      source:{capturedAt:snapshot.sourceCapturedAt},chars:p.chars,iso:p.iso};
  })};
}
function totalPower(snapshot){
  return Object.values(snapshot.chars).reduce((sum,c)=>{
    const n=Number(c?.power);return Number.isFinite(n)&&n>0?sum+n:sum;
  },0);
}
async function latestConsent(r2,fp,now){
  const base=Date.parse(new Date(now).toISOString().slice(0,10)+'T00:00:00Z');
  for(let delta=0;delta<=7;delta++){
    const day=new Date(base-delta*86400000).toISOString().slice(0,10);
    for(const period of ['pm','am']){
      const campaign=day+'-'+period;
      let source;
      try{source=await r2.getJSON(CAMPAIGNS+fp+'/campaigns/'+campaign+'-infos.json',MAX_INFOS);}
      catch(error){
        const status=Number(/HTTP (\\d{3})/.exec(String(error?.message||''))?.[1]||0);
        if(status>=500||error?.name==='AbortError'||error instanceof TypeError)throw error;
        return null;
      }
      if(source===null)continue;
      if(source.campaign!==campaign)return null;
      return validateConsent(source,fp,now);
    }
  }
  return null;
}
async function readTree(r2,alliance,consent,now){
  const {fingerprint:fp,key}=alliance;
  const index=validateIndex(await r2.getJSON(ROOT+fp+'/index.json',MAX_INDEX),fp,key);
  const files=new Map(),groupByDate=new Map(),indexPlayers={};
  const allowed=consent.sharers;
  for(const record of index.checkpoints){
    const source=await r2.getJSON(ROOT+fp+'/checkpoints/'+record.date+'.json',MAX_ARCHIVE);
    if(!source)throw Error('Indexed checkpoint is missing: '+record.date);
    const raw=validateSnapshot(source,fp,key,record);
    const snapshot=publicSnapshot(raw,key,consent);
    if(!snapshot.players.length)continue;
    const groupPlayers=[];
    for(const player of snapshot.players){
      const id=player.playerKey;
      const entry=indexPlayers[id]||(indexPlayers[id]={
        name:player.player,currentAlliance:key,checkpoints:[]});
      entry.checkpoints.push(record.date);
      const archived=raw.players.find(p=>norm(p.player)===norm(player.player));
      groupPlayers.push({player:player.player,playerKey:id,alliance:key,
        totalPower:totalPower(archived)});
      files.set(path.join('players',id,record.date+'.json'),player);
    }
    groupPlayers.sort((a,b)=>a.player.localeCompare(b.player,'fr',{sensitivity:'base'}));
    files.set(path.join('group',record.date+'.json'),{
      version:1,checkpoint:record.date,players:groupPlayers});
    groupByDate.set(record.date,groupPlayers.length);
  }
  const indexOut={version:1,players:indexPlayers,
    checkpoints:[...groupByDate].map(([date,players])=>({date,players}))
      .sort((a,b)=>a.date.localeCompare(b.date))};
  files.set('index.json',indexOut);
  // Publish only portrait fields needed by the optional ranking decoration.
  const infos=publicInfos(consent.source.rows,key,consent);
  files.set('infos.json',infos);
  return files;
}
async function readJson(file){return JSON.parse(await fs.readFile(file,'utf8'));}
async function readOptionalJson(file){
  try{return await readJson(file);}
  catch(error){if(error?.code==='ENOENT')return null;throw error;}
}
async function writeJsonIfChanged(file,value){
  const encoded=JSON.stringify(value,null,2)+'\n';
  let prior;
  try{prior=await fs.readFile(file,'utf8');}
  catch(error){if(error?.code!=='ENOENT')throw error;}
  if(prior===encoded)return false;
  await fs.mkdir(path.dirname(file),{recursive:true});
  await fs.writeFile(file,encoded,'utf8');
  return true;
}
export async function pruneLegacyGuestHistory(dataDir,guestKeys,consentByAlliance){
  const history=path.join(dataDir,'roster-history');
  const canShare=(alliance,name)=>{
    if(!guestKeys.has(alliance)||!consentByAlliance.has(alliance))return true;
    const authorization=consentByAlliance.get(alliance);
    // Only affirmative revocation or a verified rosterShare set can change
    // legacy public files. Missing/unverifiable consent is not proof of revoke.
    if(authorization===false)return false;
    return authorization instanceof Set?authorization.has(norm(name)):true;
  };
  const removed={indexPlayers:0,groupRows:0,playerFiles:0};
  const groupDir=path.join(history,'group');
  const groups=await fs.readdir(groupDir,{withFileTypes:true}).catch(error=>
    error?.code==='ENOENT'?[]:Promise.reject(error));
  const groupCounts=new Map();
  for(const entry of groups){
    if(!entry.isFile()||!entry.name.endsWith('.json'))continue;
    const file=path.join(groupDir,entry.name),group=await readJson(file);
    if(!Array.isArray(group?.players))continue;
    const players=group.players.filter(row=>canShare(row?.alliance,row?.player));
    const date=entry.name.slice(0,-5);
    groupCounts.set(date,players.length);
    removed.groupRows+=group.players.length-players.length;
    if(players.length!==group.players.length)
      await writeJsonIfChanged(file,{...group,players});
  }
  async function visitPlayers(dir){
    const entries=await fs.readdir(dir,{withFileTypes:true}).catch(error=>
      error?.code==='ENOENT'?[]:Promise.reject(error));
    for(const entry of entries){
      const file=path.join(dir,entry.name);
      if(entry.isDirectory()){await visitPlayers(file);continue;}
      if(!entry.isFile()||!entry.name.endsWith('.json'))continue;
      const snapshot=await readJson(file);
      if(guestKeys.has(snapshot?.alliance)&&
         consentByAlliance.has(snapshot.alliance)&&
         !canShare(snapshot.alliance,snapshot.player)){
        await fs.rm(file,{force:true});
        removed.playerFiles++;
      }
    }
  }
  await visitPlayers(path.join(history,'players'));
  const indexFile=path.join(history,'index.json');
  const index=await readOptionalJson(indexFile);
  if(index&&object(index)&&object(index.players)&&Array.isArray(index.checkpoints)){
    for(const [id,entry] of Object.entries(index.players)){
      if(guestKeys.has(entry?.currentAlliance)&&
         consentByAlliance.has(entry.currentAlliance)&&
         !canShare(entry.currentAlliance,entry.name)){
        delete index.players[id];
        removed.indexPlayers++;
      }
    }
    index.checkpoints=index.checkpoints.map(checkpoint=>{
      const count=groupCounts.get(checkpoint?.date);
      return Number.isSafeInteger(count)?{...checkpoint,players:count}:checkpoint;
    });
    await writeJsonIfChanged(indexFile,index);
  }
  return removed;
}
async function writeAlliance(key,files){
  await fs.mkdir(outDir,{recursive:true});
  const base=path.join(outDir,key),suffix='.tmp-'+process.pid;
  const staged=base+suffix,backup=base+'.bak-'+process.pid;
  await fs.rm(staged,{recursive:true,force:true});
  await fs.rm(backup,{recursive:true,force:true});
  try{
    for(const [relative,value] of files){
      const file=path.join(staged,relative);
      await fs.mkdir(path.dirname(file),{recursive:true});
      await fs.writeFile(file,JSON.stringify(value,null,2)+'\n','utf8');
    }
    try{await fs.rename(base,backup);}catch(error){if(error?.code!=='ENOENT')throw error;}
    try{await fs.rename(staged,base);}
    catch(error){
      try{await fs.rename(backup,base);}catch{}
      throw error;
    }
    await fs.rm(backup,{recursive:true,force:true});
  }catch(error){
    await fs.rm(staged,{recursive:true,force:true});
    throw error;
  }
}
async function main(){
  const now=Date.now(),r2=createPrivateR2Reader();
  const [rawApprovals,registry]=await Promise.all([
    r2.getJSON(APPROVALS,200000),readJson(path.join(rootDir,'alliances.json'))]);
  const approved=validateApprovals(rawApprovals,registry);
  const guestKeys=new Set(registry.filter(a=>a&&KEY.test(a.key||"")&&
    a.group&&a.group!=="losp").map(a=>a.key));
  const approvedKeys=new Set(approved.map(a=>a.key));
  // An absent approval is an explicit alliance revocation. For an approved
  // alliance, missing R2 history/receipts leave legacy files untouched.
  const legacyConsent=new Map([...guestKeys].map(key=>[
    key,approvedKeys.has(key)?null:false]));
  const prior=await fs.readdir(outDir,{withFileTypes:true}).catch(e=>
    e.code==='ENOENT'?[]:Promise.reject(e));
  const revoked=prior.filter(x=>x.isDirectory()&&!approvedKeys.has(x.name)).map(x=>x.name);
  const purge=new Set(revoked),ready=new Map(),failed=[],supplementalInfos=new Map();
  for(const alliance of approved){
    try{
      const consent=await latestConsent(r2,alliance.fingerprint,now);
      if(!consent){
        purge.add(alliance.key);
        console.warn(alliance.key+': no recent verifiable rosterShare receipt; existing public files will be removed.');
        continue;
      }
      legacyConsent.set(alliance.key,consent.sharers);
      try{
        ready.set(alliance.key,await readTree(r2,alliance,consent,now));
        console.log(alliance.key+': '+ready.get(alliance.key).size+' validated JSON files');
      }catch(error){
        // Portrait metadata is independently consent-checked and may decorate
        // an already-published legacy checkpoint while R2 history is unavailable.
        supplementalInfos.set(alliance.key,publicInfos(consent.source.rows,alliance.key,consent));
        throw error;
      }
    }catch(error){
      // A validated receipt remains authoritative even if archive export fails;
      // an unavailable receipt leaves the initialized null state unchanged.
      failed.push({key:alliance.key,reason:String(error?.message||'export failed')});
      console.error(alliance.key+': '+String(error?.message||'export failed'));
    }
  }
  const summary='Approved: '+approved.length+'; validated: '+ready.size+
    '; failed closed: '+failed.length+'; revoked: '+revoked.length;
  console.log(summary);
  const details=failed.map(item=>'- '+item.key+': '+item.reason).join('\n');
  const report=['## Guest Evolution export','',summary,'',
    ready.size===0&&approved.length>0?
      '**Aucune alliance validée : aucun export opérationnel.**':
      ready.size>0?'Validation terminée.':'Aucune alliance invitée approuvée.',
    '',details||'- Aucun échec.','',
    write?'Publication autorisée par configuration.':'Dry-run : aucun fichier public modifié.'].join('\n');
  if(process.env.GITHUB_STEP_SUMMARY)
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,report+'\n','utf8');
  assertOperationalResult(approved.length,ready.size);
  if(!write){console.log('Dry run: no public files changed.');return;}
  // Keep the legacy shared archive in sync with verified guest consent without touching LoSP rows.
  const legacyRemoved=await pruneLegacyGuestHistory(rootDir,guestKeys,legacyConsent);
  console.log('Legacy guest history removed for consent: '+JSON.stringify(legacyRemoved));
  // A revocation is actionable even when a different alliance has a temporary R2 error.
  for(const key of purge)await fs.rm(path.join(outDir,key),{recursive:true,force:true});
  for(const [key,files] of ready)await writeAlliance(key,files);
  for(const [key,infos] of supplementalInfos)
    if(!purge.has(key))await writeInfosOnly(outDir,key,infos);
  // Remove old checkpoint files only inside alliances whose current consent was verified.
  // writeAlliance replaces that single alliance directory atomically at the workflow scope.
}
if(isMain)
  main().catch(error=>{console.error('Guest Evolution publisher:',error.message);process.exitCode=1;});
