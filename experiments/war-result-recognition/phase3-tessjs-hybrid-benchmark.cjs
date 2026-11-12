#!/usr/bin/env node
const fs=require('node:fs');
const path=require('node:path');
const dir=__dirname;
const baseline=JSON.parse(fs.readFileSync(process.env.WAR_OCR_JS_BASELINE || path.join(dir,'tesseractjs-node-results.json'),'utf8'));
const crop=JSON.parse(fs.readFileSync(process.env.WAR_OCR_TESSJS_CROP_RESULTS || path.join(dir,'phase3-tessjs-results.json'),'utf8'));
const truth=JSON.parse(fs.readFileSync(path.join(dir,'ground-truth.json'),'utf8'));
const cropBy=Object.fromEntries(crop.captures.map(x=>[x.id,x]));
const fields=['localAlliance','opponentAlliance','localScore','opponentScore','localTrophies','opponentTrophies','result'];
function equal(a,b){
  if(a===null||a===undefined)return null;
  if(typeof a==='string')return a.normalize('NFKC').replace(/[’‘]/g,"'").trim().replace(/\s+/g,' ').toLocaleLowerCase()===String(b||'').normalize('NFKC').replace(/[’‘]/g,"'").trim().replace(/\s+/g,' ').toLocaleLowerCase();
  return String(a)===String(b||'');
}
const baseBy=Object.fromEntries(baseline.captures.map(x=>[x.id,x]));
const captures=[];
for(const item of truth.captures){
  const old=baseBy[item.id].fields;const proposed={};
  for(const field of fields){
    const before=old[field];let extracted=before.extracted;let source='phase2-tesseractjs7-dual-full-frame';let alternatives=null;let confidence=before.confidence;
    if(field==='opponentTrophies'){
      const c=cropBy[item.id];
      if(c.cropValue){
        extracted=c.cropValue;source='tesseractjs7-local-gray-contrast-3x-psm7';confidence=c.cropConfidence;
        if(before.extracted&&before.extracted!==extracted)alternatives=[before.extracted,extracted];
      }
    }
    const want=item[field];const exact=equal(want,extracted);
    proposed[field]={expected:want,extracted:extracted||null,exact,confidence,source,alternatives,manualCorrectionRequired:want===null||exact!==true||confidence!==null&&confidence<55,manualValidationRequired:true};
  }
  captures.push({id:item.id,split:item.split,fields:proposed});
}
const summary={};
for(const split of ['train','holdout','all']){
  const rows=captures.filter(x=>split==='all'||x.split===split);const out={};
  for(const field of fields){const vals=rows.map(r=>r.fields[field]).filter(x=>x.expected!==null);out[field]={exact:vals.filter(x=>x.exact===true).length,total:vals.length};}
  out.overall={exact:Object.values(out).reduce((s,x)=>s+x.exact,0),total:Object.values(out).reduce((s,x)=>s+x.total,0)};out.overall.percent=Number((100*out.overall.exact/out.overall.total).toFixed(1));summary[split]=out;
}
const report={schemaVersion:'1.0.0',engine:baseline.engine,metric:'strict expected value equality after field attribution; contaminated historical holdouts',method:'Baseline Tesseract.js 7 dual full-frame output, replacing only opponentTrophies when the local PSM 7 crop yields a first numeric group of at least four digits; take its first four. Short reads retain the previous candidate. Conflicting method outputs are retained as alternatives and still require manual verification.',measurements:crop.measurements,corpus:crop.corpus,baseline:{fieldSummary:baseline.fieldSummary,eligibleExact:baseline.eligibleExact},summary,captures};
const outPath=process.env.WAR_OCR_TESSJS_HYBRID_OUTPUT || path.join(dir,'phase3-tessjs-hybrid-benchmark-results.json');fs.writeFileSync(outPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({summary,measurements:report.measurements,output:outPath}));
