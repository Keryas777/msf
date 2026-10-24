#!/usr/bin/env node
// GitHub Actions ONLY. Pulls already archived AllianceCard responses from
// Cloudflare R2 with read-only credentials; no calls to Scopely or Roster Service.
import fs from 'node:fs/promises';
import {createHash,createHmac} from 'node:crypto';
import {collectionWindow,readMapping,createR2Snapshot,addSnapshotToIndex}
  from './lib/alliance-r2-history.mjs';

const sha=s=>createHash('sha256').update(s).digest('hex');
const hmac=(key,data)=>createHmac('sha256',key).update(data).digest();
const enc=s=>encodeURIComponent(s).replace(/[!'()*]/g,
  c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
const EMPTY_SHA=sha('');
const HEX=/^[a-f0-9]{64}$/;
const NAME=/^[a-z0-9-]{3,64}$/;
function secret(name){const v=process.env[name];if(!v)throw Error('Missing required secret '+name);return v;}
function r2Client(){
  const account=secret('LOSP_R2_ACCOUNT_ID'),access=secret('LOSP_R2_ACCESS_KEY_ID'),
    key=secret('LOSP_R2_SECRET_ACCESS_KEY'),bucket=secret('LOSP_R2_BUCKET');
  if(!/^[0-9a-f]{32}$/.test(account)||!NAME.test(bucket))
    throw Error('Invalid R2 account or bucket configuration');
  const host=account+'.r2.cloudflarestorage.com';
  const endpoint='https://'+host;
  async function get(path='',query=[]){
    const resource='/'+[bucket,...(path?path.split('/'):[])].map(enc).join('/');
    const qs=query.slice().sort(([a,x],[b,y])=>a.localeCompare(b)||x.localeCompare(y))
      .map(([k,v])=>enc(k)+'='+enc(String(v))).join('&');
    const now=new Date(),date=now.toISOString().replace(/[-:]|\.\d{3}/g,'').slice(0,15)+'Z';
    const day=date.slice(0,8);
    const canonical=['GET',resource,qs,'host:'+host+'\n'+
      'x-amz-content-sha256:'+EMPTY_SHA+'\n'+'x-amz-date:'+date+'\n',
      'host;x-amz-content-sha256;x-amz-date',EMPTY_SHA].join('\n');
    const scope=day+'/auto/s3/aws4_request';
    const digest=sha('AWS4-HMAC-SHA256\n'+date+'\n'+scope+'\n'+sha(canonical));
    const signing=hmac(hmac(hmac(hmac('AWS4'+key,day),'auto'),'s3'),'aws4_request');
    const signature=hmac(signing,digest).toString('hex');
    const authorization='AWS4-HMAC-SHA256 Credential='+access+'/'+scope+
      ', SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature='+signature;
    const response=await fetch(endpoint+resource+(qs?'?'+qs:''),{
      method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),
      headers:{'x-amz-date':date,'x-amz-content-sha256':EMPTY_SHA,
        Authorization:authorization}
    });
    if(!response.ok){
      const errorText=await response.text();
      // S3-style error code only; never include private bucket, fingerprints or keys.
      const s3Code=/<Code>([A-Za-z0-9]+)<\/Code>/.exec(errorText)?.[1]||'unspecified';
      throw Error('Private R2 read failed (HTTP '+response.status+', S3 '+s3Code+')');
    }
    const length=Number(response.headers.get('content-length')||0);
    if(length>1000000)throw Error('Unexpectedly large R2 response');
    const body=await response.text();
    if(body.length>1000000)throw Error('Unexpectedly large R2 body');
    return body;
  }
  return {get};
}
const unxml=s=>s.replace(/&amp;/g,'&').replace(/&lt;/g,'<')
  .replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'");
function tag(xml,name){
  const match=new RegExp('<'+name+'>([\\s\\S]*?)<\\/'+name+'>').exec(xml);
  return match?unxml(match[1]):null;
}
function decodeListing(xml){
  if(!xml.includes('<ListBucketResult'))throw Error('Invalid R2 list response');
  const rows=[];
  for(const content of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)){
    const key=tag(content[1],'Key'),modified=tag(content[1],'LastModified');
    if(!key||!modified||!Number.isFinite(Date.parse(modified)))
      throw Error('Invalid R2 listing entry');
    rows.push({key,modified});
  }
  return {rows,truncated:tag(xml,'IsTruncated')==='true',
    cursor:tag(xml,'NextContinuationToken')};
}
const getJson=async path=>JSON.parse(await fs.readFile(path,'utf8'));
const isCard=(key,prefix)=>key.startsWith(prefix)&&
  /\/provider-source\/[0-9a-f-]{36}\/alliance-card\.json$/.test(key);
async function privateCards(r2,fp,window){
  if(!HEX.test(fp))throw Error('Invalid private fingerprint');
  const prefix='roster-batches/v1/'+fp+'/';
  const candidates=[];let token=null,pages=0;
  const lo=Date.parse(window.start)-15*60000,hi=Date.parse(window.endExclusive)+15*60000;
  do{
    if(++pages>40)throw Error('R2 listing too large: refusing partial history');
    const query=[['list-type','2'],['prefix',prefix],['max-keys','1000'],
      ...(token?[['continuation-token',token]]:[])];
    const listing=decodeListing(await r2.get('',query));
    for(const entry of listing.rows){
      if(!isCard(entry.key,prefix))continue;
      const modified=Date.parse(entry.modified);
      if(modified>=lo&&modified<=hi)candidates.push(entry.key);
    }
    if(!listing.truncated)break;
    if(!listing.cursor||listing.cursor===token)throw Error('Invalid R2 listing cursor');
    token=listing.cursor;
  }while(true);
  if(candidates.length>500)throw Error('Too many eligible source documents');
  const rows=[];
  for(const path of candidates){
    let body;
    try{body=JSON.parse(await r2.get(path));}catch{continue;}
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
