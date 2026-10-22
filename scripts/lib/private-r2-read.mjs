// Private Cloudflare R2 S3 read-only access for GitHub Actions.
// No credentials or object keys are returned to the public browser.
import {createHash,createHmac} from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest('hex');
const mac=(key,v)=>createHmac('sha256',key).update(v).digest();
const encode=s=>encodeURIComponent(s).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
const EMPTY=hash('');
export function createPrivateR2Reader(env=process.env,fetchImpl=fetch){
  const account=env.LOSP_R2_ACCOUNT_ID,keyId=env.LOSP_R2_ACCESS_KEY_ID;
  const secret=env.LOSP_R2_SECRET_ACCESS_KEY,bucket=env.LOSP_R2_BUCKET;
  if(!/^[a-f0-9]{32}$/.test(account||'')||!/^[a-z0-9-]{3,64}$/.test(bucket||'')||
    !keyId||!secret)throw Error('Missing/invalid private R2 read-only credentials');
  const host=account+'.r2.cloudflarestorage.com';
  async function getText(objectKey,maxBytes=3100000){
    if(!/^[a-z0-9A-Z/_\-.]{1,512}$/.test(objectKey||'')||objectKey.includes('..'))
      throw Error('Unsafe private R2 object path');
    const uri='/'+[bucket,...objectKey.split('/')].map(encode).join('/');
    const amzDate=new Date().toISOString().replace(/[-:]|\.\d{3}/g,'');
    const shortDate=amzDate.slice(0,8);
    const signedHeaders='host;x-amz-content-sha256;x-amz-date';
    const canonical=['GET',uri,'','host:'+host+'\n'+
      'x-amz-content-sha256:'+EMPTY+'\n'+'x-amz-date:'+amzDate+'\n',
      signedHeaders,EMPTY].join('\n');
    const scope=shortDate+'/auto/s3/aws4_request';
    const stringToSign=['AWS4-HMAC-SHA256',amzDate,scope,hash(canonical)].join('\n');
    const signing=mac(mac(mac(mac('AWS4'+secret,shortDate),'auto'),'s3'),'aws4_request');
    const sig=mac(signing,stringToSign).toString('hex');
    const headers={
      Authorization:'AWS4-HMAC-SHA256 Credential='+keyId+'/'+scope+
        ', SignedHeaders='+signedHeaders+', Signature='+sig,
      'x-amz-content-sha256':EMPTY,'x-amz-date':amzDate
    };
    const res=await fetchImpl('https://'+host+uri,{
      method:'GET',headers,signal:AbortSignal.timeout(20000),redirect:'error'
    });
    if(res.status===404)return null;
    if(!res.ok)throw Error('Private R2 read failed (HTTP '+res.status+')');
    if(Number(res.headers.get('content-length')||0)>maxBytes)
      throw Error('Private R2 object too large');
    const text=await res.text();
    if(text.length>maxBytes)throw Error('Private R2 response too large');
    return text;
  }
  return {
    async getJSON(key,maxBytes){
      const raw=await getText(key,maxBytes);
      if(raw===null)return null;
      try{return JSON.parse(raw);}catch{throw Error('Invalid private R2 JSON');}
    }
  };
}
