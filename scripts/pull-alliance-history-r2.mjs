#!/usr/bin/env node
// GitHub Actions ONLY. Pulls already archived AllianceCard responses from
// Cloudflare R2 with read-only credentials; no calls to Scopely or Roster Service.
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createPrivateR2Reader} from './lib/private-r2-read.mjs';
import {createHash,createHmac} from 'node:crypto';
import {collectionWindow,readMapping,createR2Snapshot,addSnapshotToIndex}
  from './lib/alliance-r2-history.mjs';

function secret(name){const v=process.env[name];if(!v)throw Error('Missing required secret '+name);return v;}
function r2Client(){
  const account=secret('LOSP_R2_ACCOUNT_ID');
  const access=secret('LOSP_R2_ACCESS_KEY_ID');
  const key=secret('LOSP_R2_SECRET_ACCESS_KEY');
  const bucket=secret('LOSP_R2_BUCKET');
  const endpoint='https://'+account+'.r2.cloudflarestorage.com';
  // Use the exact GET signer already exercised by the roster import.
  const reader=createPrivateR2Reader();
  function list(prefix,token=null){
    if(!/^roster-batches\/v1\/[a-f0-9]{64}\/$/.test(prefix)||
      (token!==null&&(typeof token!=='string'||token.length>4096)))
      throw Error('Invalid private R2 listing request');
    const args=['s3api','list-objects-v2','--bucket',bucket,
      '--endpoint-url',endpoint,'--prefix',prefix,'--max-keys','1000',
      '--no-paginate','--output','json',
      ...(token?['--continuation-token',token]:[])];
    let output;
    try{
      output=execFileSync('aws',args,{
        encoding:'utf8',maxBuffer:3_000_000,timeout:30000,
        stdio:['ignore','pipe','pipe'],
        env:{...process.env,AWS_ACCESS_KEY_ID:access,
          AWS_SECRET_ACCESS_KEY:key,AWS_DEFAULT_REGION:'auto',
          AWS_EC2_METADATA_DISABLED:'true'}
      });
    }catch{throw Error('Private R2 ListObjectsV2 failed');}
    let parsed;
    try{parsed=JSON.parse(output);}catch{throw Error('Invalid R2 list response');}
    if(!Array.isArray(parsed.Contents??[])||(parsed.Contents||[]).length>1000||
      typeof parsed.IsTruncated!=='boolean')
      throw Error('Invalid R2 list response');
    const rows=(parsed.Contents||[]).map(x=>{
      if(typeof x?.Key!=='string'||!x.Key.startsWith(prefix)||
        typeof x.LastModified!=='string'||
        !Number.isFinite(Date.parse(x.LastModified)))
        throw Error('Invalid R2 listing entry');
      return {key:x.Key,modified:x.LastModified};
    });
    return {rows,truncated:parsed.IsTruncated,
      cursor:typeof parsed.NextContinuationToken==='string'?
        parsed.NextContinuationToken:null};
  }

  return {list,getJSON:reader.getJSON};
}
const getJson=async path=>JSON.parse(await fs.readFile(path,'utf8'));
const isCard=(key,prefix)=>key.startsWith(prefix)&&
  /\/provider-source\/[0-9a-f-]{36}\/alliance-card\.json$/.test(key);
async function privateCards(r2,fp,window){
  if(!HEX.test(fp))throw Error('Invalid private fingerprint');
  const prefix='roster-batches/v1/'+fp+'/';
  const candidates=[];let token=null,pages=0;
  let totalListed=0,totalCards=0,latestCardModified=null;
  const lo=Date.parse(window.start)-15*60000,hi=Date.parse(window.endExclusive)+15*60000;
  do{
    if(++pages>40)throw Error('R2 listing too large: refusing partial history');
    const listing=r2.list(prefix,token);
    for(const entry of listing.rows){
      totalListed++;
      if(!isCard(entry.key,prefix))continue;
      totalCards++;
      if(!latestCardModified||entry.modified>latestCardModified)
        latestCardModified=entry.modified;
      const modified=Date.parse(entry.modified);
      if(modified>=lo&&modified<=hi)candidates.push(entry.key);
    }
    if(!listing.truncated)break;
    if(!listing.cursor||listing.cursor===token)throw Error('Invalid R2 listing cursor');
    token=listing.cursor;
  }while(true);
  console.log('Private R2 source scan (aggregate):',JSON.stringify({
    totalListed,totalCards,eligible:candidates.length,latestCardModified,pages
  }));
  if(candidates.length>500)throw Error('Too many eligible source documents');
  const rows=[];
  for(const path of candidates){
    let body;
    try{body=await r2.getJSON(path,1000000);}catch{continue;}
    if(body?.allianceFingerprint===fp)rows.push(body);
  }
  return rows;
}
async function main(){
  const args=process.argv.slice(2);
  if(args.some(x=>x!=='--write'&&!/^--date=\d{4}-\d{2}-\d{2}$/.test(x)))
    throw Error('Usage: --date=YYYY-MM-DD [--write]');
  const write=args.includes('--write');
  const now=new Date();
  const dateArg=args.find(x=>x.startsWith('--date='));
  const day=dateArg?dateArg.slice(7):now.toISOString().slice(0,10);
  const config=await getJson('docs/data/alliance-standings/config.json');
  const registry=await getJson('docs/data/alliances.json');
  const index=await getJson('docs/data/alliance-standings/index.json');
  const window=collectionWindow(day,config);
  if(Date.parse(window.endExclusive)>now.getTime())
    throw Error('Collection sampling window has not yet ended');
  if(Date.parse(window.endExclusive)<now.getTime()-6*86400000)
    throw Error('Requested sampling window is outside the expected R2 retention');
  if(index.snapshots.some(x=>x.collectionDayUtc===day)){
    console.log('Idempotent: collection day already indexed:',day);return;
  }
  const map=readMapping(secret('LOSP_R2_ALLIANCE_MAP_JSON'),registry);
  const r2=r2Client();
  const sources=new Map();
  for(const alliance of registry.filter(a=>a.active!==false)){
    const rows=await privateCards(r2,map[alliance.key],window);
    sources.set(alliance.key,rows);
    console.log('Private source candidates for',alliance.key+':',rows.length);
  }
  const snapshot=createR2Snapshot({window,registry,map,sources});
  const result=addSnapshotToIndex(index,snapshot);
  if(!result.updated){console.log('Idempotent: capture already exists');return;}
  console.log('Validated',snapshot.alliances.length,'alliances for',day,
    'latest capturedAt',snapshot.capturedAt,
    'season verified?',snapshot.seasonVerified);
  if(!write){console.log('Dry run: no files created or modified');return;}
  if(process.env.LOSP_R2_HISTORY_PUBLICATION_APPROVED!=='true')
    throw Error('R2 import publication not approved; no file written');
  const output='docs/data/alliance-standings/'+result.file;
  await fs.writeFile(output,JSON.stringify(snapshot,null,2)+'\n',{flag:'wx'});
  await fs.writeFile('docs/data/alliance-standings/index.json',
    JSON.stringify(result.index,null,2)+'\n');
  console.log('Published sanitized snapshot and index (no private identifiers)');
}
main().catch(error=>{console.error('Alliance R2 import:',error.message);process.exitCode=1;});
