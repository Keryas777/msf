#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { createWorker } = require("tesseract.js");

const [cropDir, outputPath] = process.argv.slice(2);
if (!cropDir || !outputPath) throw new Error("Usage: node benchmark-phase3-tessjs.cjs <transient-crops-dir> <output-json>");
const root = __dirname;
const truth = JSON.parse(fs.readFileSync(path.join(root,"ground-truth.json"),"utf8"));
const baseline = JSON.parse(fs.readFileSync(path.join(root,"phase2-benchmark-results.json"),"utf8"));
const baselineById = Object.fromEntries(baseline.captures.map((capture) => [capture.id,capture]));
const jsBaseline = JSON.parse(fs.readFileSync(process.env.WAR_OCR_JS_BASELINE || path.join(root,"tesseractjs-node-results.json"),"utf8"));
const jsBaselineById = Object.fromEntries(jsBaseline.captures.map((capture) => [capture.id,capture]));

(async () => {
  const started = process.hrtime.bigint();
  const worker = await createWorker("eng",1,{
    langPath: process.env.WAR_OCR_TESSDATA_PATH || "/usr/share/tesseract-ocr/5/tessdata",
    gzip:false, cacheMethod:"none"
  });
  const loaded = process.hrtime.bigint();
  await worker.setParameters({tessedit_pageseg_mode:"7",tessedit_char_whitelist:"0123456789"});
  const captures=[]; const times=[];
  try {
    for (const item of truth.captures) {
      const file=path.join(cropDir,`${item.id}.png`);
      const t0=process.hrtime.bigint();
      const result=await worker.recognize(file);
      const elapsed=Number(process.hrtime.bigint()-t0)/1e6; times.push(elapsed);
      const raw=String(result.data.text||"").trim();
      const firstGroup=raw.match(/\d+/)?.[0]||"";
      const cropValue=firstGroup.length>=4?firstGroup.slice(0,4):null;
      const old=jsBaselineById[item.id].fields.opponentTrophies.extracted;
      const cliOld=baselineById[item.id].fields.opponentTrophies.extracted;
      const selected=cropValue||old||null;
      captures.push({id:item.id,expected:item.opponentTrophies,raw,firstGroup,cropValue,cropConfidence:Number.isFinite(result.data?.confidence)?result.data.confidence:null,phase2TesseractJs:old,phase2Cli:cliOld,selected,exact:item.opponentTrophies===null?null:String(item.opponentTrophies)===String(selected||"")});
    }
  } finally { await worker.terminate(); }
  const eligible=captures.filter(x=>x.expected!==null);
  const output={schemaVersion:"1.0.0",engine:`Tesseract.js ${require("tesseract.js/package.json").version} in Node.js ${process.version}; local traineddata; not a browser test`,method:"Same dynamic opponent-trophy crop and gray/contrast 3x pixels as CLI sweep; PSM 7 and numeric whitelist; accept only a 4-digit first group, otherwise retain phase 2 result",measurements:{startupMs:Math.round(Number(loaded-started)/1e6),meanRecognitionMs:Math.round(times.reduce((a,b)=>a+b,0)/times.length),totalRecognitionMs:Math.round(times.reduce((a,b)=>a+b,0)),peakRssMb:Math.round(process.resourceUsage().maxRSS/1024)},cropOnly:{exact:eligible.filter(x=>x.cropValue===String(x.expected)).length,total:eligible.length},hybrid:{exact:eligible.filter(x=>x.exact).length,total:eligible.length},captures};
  fs.writeFileSync(outputPath,JSON.stringify(output,null,2)+"\n");
  console.log(JSON.stringify({measurements:output.measurements,cropOnly:output.cropOnly,hybrid:output.hybrid}));
})().catch((error)=>{console.error(error);process.exitCode=1;});
