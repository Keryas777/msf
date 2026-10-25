#!/usr/bin/env node
// GitHub Actions ONLY: import existing private Worker rank snapshots from R2.
// This script makes ZERO Scopely calls, never touches rosters or trophy history.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {readMapping} from './lib/alliance-r2-history.mjs';
import {mondaySeason,scheduledMonday,alreadyImported,
  publicSeasonSnapshot,addSeasonToIndex} from './lib/alliance-season-ranks-r2.mjs';

const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
function secret(key){const value=process.env[key];if(!value)throw Error('Missing '+key);return value;}
function awsArguments(){
  const account=secret('LOSP_R2_ACCOUNT_ID');
  const endpoint='https://'+account+'.r2.cloudflarestorage.com';
  const bucket=secret('LOSP_R2_BUCKET');
  const env={...process.env,
    AWS_ACCESS_KEY_ID:secret('LOSP_R2_ACCESS_KEY_ID'),
    AWS_SECRET_ACCESS_KEY:secret('LOSP_R2_SECRET_ACCESS_KEY'),
    AWS_DEFAULT_REGION:'auto',AWS_EC2_METADATA_DISABLED:'true'};
  return {bucket,endpoint,env};
}
function aws(args,credentials){
  try{
    return execFileSync('aws',['s3api',...args,
      '--bucket',credentials.bucket,'--endpoint-url',credentials.endpoint],{
      encoding:'utf8',maxBuffer:1000000,timeout:25000,
      stdio:['ignore','pipe','pipe'],env:credentials.env});
  }catch{throw Error('Private season ranks R2 read failed');}
}
async function privateCaptures(day){
  const credentials=awsArguments();
  const prefix='roster-batches/v1/season-ranks/captures/'+day+'T';
  const result=JSON.parse(aws(['list-objects-v2','--prefix',prefix,
    '--max-keys','200','--output','json','--no-paginate'],credentials));
  if(result.IsTruncated===true||!Array.isArray(result.Contents??[])||
     (result.Contents||[]).length>200)
    throw Error('Too many season rank captures: refusing partial list');
  const keys=(result.Contents||[]).map(row=>row.Key).filter(key=>
    typeof key==='string'&&key.startsWith(prefix)&&
    /^roster-batches\/v1\/season-ranks\/captures\/\d{4}-\d\d-\d\dT[0-9TZ.-]+[0-9a-f-]{36}\.json$/.test(key)).sort();
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'losp-ranks-'));
  const snapshots=[];
  try{
    for(let i=0;i<keys.length;i++){
      const tmp=path.join(folder,'capture-'+i+'.json');
      aws(['get-object','--key',keys[i],tmp,'--output','json'],credentials);
      const raw=await fs.readFile(tmp,'utf8');
      if(raw.length>120000)continue;
      try{snapshots.push(JSON.parse(raw));}catch{}
    }
  }finally{await fs.rm(folder,{recursive:true,force:true});}
  return snapshots.sort((a,b)=>String(a.capturedAt).localeCompare(String(b.capturedAt)));
}
async function main(){
  const args=process.argv.slice(2);
  if(args.some(arg=>arg!=='--write'&&!/^--date=\d{4}-\d\d-\d\d$/.test(arg)&&
      !arg.startsWith('--schedule=')))
    throw Error('Usage: [--write] [--date=YYYY-MM-DD | --schedule=CRON]');
  const dateArg=args.find(x=>x.startsWith('--date='));
  const cronArg=args.find(x=>x.startsWith('--schedule='));
  if(dateArg&&cronArg)throw Error('Use either --date or --schedule');
  const now=new Date();
  const day=dateArg?dateArg.slice(7):
    cronArg?scheduledMonday(cronArg.slice(11),now):now.toISOString().slice(0,10);
  const [config,registry,index]=await Promise.all([
    read('docs/data/alliance-standings/config.json'),
    read('docs/data/alliances.json'),
    read('docs/data/alliance-standings/index.json')]);
  const season=mondaySeason(day,config);
  if(!season){console.log('Not a season rollover Monday:',day);return;}
  if(now<Date.parse(season.availableAfter))throw Error('Season still unpublished');
  if(now-Date.parse(day+'T00:00:00.000Z')>6*86400000)
    throw Error('R2 source outside expected 7-day retention');
  if(alreadyImported(index,season.seasonId)){
    console.log('Idempotent: season already indexed:',season.seasonId);return;
  }
  const mapping=readMapping(secret('LOSP_R2_ALLIANCE_MAP_JSON'),registry);
  const captures=await privateCaptures(day);
  let published=null;
  for(const capture of captures){
    try{published=publicSeasonSnapshot(capture,registry,mapping,season);break;}
    catch{/* Ignore incomplete snapshots; never synthesize missing ranks. */}
  }
  if(!published)throw Error('No complete authorized season rank snapshot for '+day);
  const added=addSeasonToIndex(index,published,season);
  if(!added.updated)return;
  if(!args.includes('--write')){
    console.log('Dry run:',season.seasonId,'with',published.alliances.length,'alliances');return;
  }
  if(process.env.LOSP_R2_HISTORY_PUBLICATION_APPROVED!=='true')
    throw Error('Publication not approved');
  const dest='docs/data/alliance-standings/'+added.file;
  await fs.writeFile(dest,JSON.stringify(published,null,2)+'\n',{flag:'wx'});
  await fs.writeFile('docs/data/alliance-standings/index.json',
    JSON.stringify(added.index,null,2)+'\n');
  console.log('Published rank-only season snapshot',season.seasonId,
    'for',published.alliances.length,'alliances');
}
main().catch(err=>{console.error('Season-ranks R2 import:',err.message);process.exitCode=1;});
