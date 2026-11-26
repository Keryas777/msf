const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../../../");

function loadExperiment() {
  const canvases = [];
  function makeCanvas() {
    const canvas = { width: 1, height: 1, toDataURL: () => "data:image/jpeg;base64,TEST" };
    const context = {
      drawImage() {}, putImageData() {},
      getImageData(_x, _y, width, height) { return { width, height, data: new Uint8ClampedArray(width * height * 4).fill(180) }; }
    };
    canvas.getContext = () => context;
    canvases.push(canvas);
    return canvas;
  }
  const module = { exports: {} };
  const sandbox = { module, document: { createElement: makeCanvas }, performance: { now: () => 10 }, Uint8Array, Uint8ClampedArray, Float64Array, Map, Math, Number, String, Object, Array, Error };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(root, "docs/war-results-ocr-experiment.js"), "utf8"), sandbox, { filename: "war-results-ocr-experiment.js" });
  return { api: module.exports, canvases };
}

test("OCR strategies retain the current reference and add isolated preprocess and PSM modes", () => {
  const { api } = loadExperiment();
  assert.deepEqual(Array.from(api.strategies, (item) => item.id), ["reference", "grayscale", "otsu", "adaptive", "tight-crop", "thin-strokes", "psm8", "psm13", "glyphs"]);
  assert.equal(api.strategies[0].psm, 7);
  assert.equal(api.strategies.find((item) => item.id === "psm8").psm, 8);
  assert.equal(api.strategies.find((item) => item.id === "psm13").psm, 13);
});

test("numeric parsing rejects incomplete and extra-character reads without repairing them", () => {
  const { api } = loadExperiment();
  assert.deepEqual(JSON.parse(JSON.stringify(api.normalizedRead("014"))), { raw: "014", digits: "014", value: "", digitCount: 3 });
  assert.deepEqual(JSON.parse(JSON.stringify(api.normalizedRead("28938"))), { raw: "28938", digits: "28938", value: "", digitCount: 5 });
});

test("consensus counts independent strategy families rather than near-duplicate PSM reads", () => {
  const { api } = loadExperiment();
  const result = api.consensus([
    { strategy: "reference", value: "1111", digitCount: 4 },
    { strategy: "psm8", value: "1111", digitCount: 4 },
    { strategy: "grayscale", value: "2222", digitCount: 4 },
    { strategy: "otsu", value: "2222", digitCount: 4 },
    { strategy: "glyphs", value: "2222", digitCount: 4 }
  ]);
  assert.equal(result.value, "2222");
  assert.equal(result.votes["1111"], 1);
  assert.equal(result.votes["2222"], 2);
  assert.equal(api.consensus([{ strategy: "reference", value: "1111", digitCount: 4 }, { strategy: "psm8", value: "2222", digitCount: 4 }]).value, "");
});

test("uncertain character segmentation is reported and never padded into four digits", async () => {
  const { api } = loadExperiment();
  const source = { width: 40, height: 20, getContext: () => ({ getImageData: () => ({ width: 40, height: 20, data: new Uint8ClampedArray(40 * 20 * 4) }) }) };
  let calls = 0;
  const worker = { setParameters: async () => {}, recognize: async () => { calls++; return { data: { text: "8", confidence: 90 } }; } };
  const result = await api.compare(source, { width: 120, height: 60, toDataURL: () => "data:image/jpeg;base64,REF" }, worker,
    { segment: () => ({ reason: "ambiguous-component-run", confidence: .1, bounds: [] }) }, () => {}, ["reference", "glyphs"]);
  assert.equal(result.strategies.find((item) => item.strategy === "glyphs").value, "");
  assert.ok(result.strategies.find((item) => item.strategy === "glyphs").warnings.includes("ambiguous-component-run"));
  assert.equal(calls, 1);
});

test("per-glyph OCR preserves four positions and rejects a glyph that returns multiple digits", async () => {
  const { api } = loadExperiment();
  const source = { width: 40, height: 20, getContext: () => ({ getImageData: () => ({ width: 40, height: 20, data: new Uint8ClampedArray(40 * 20 * 4) }) }) };
  let currentPsm = "7", ordinal = 0;
  const worker = { setParameters: async ({ tessedit_pageseg_mode }) => { currentPsm = tessedit_pageseg_mode; }, recognize: async () => ({ data: { text: currentPsm === "10" ? (++ordinal === 2 ? "19" : "7") : "1234", confidence: 80 } }) };
  const segments = { segment: () => ({ confidence: .9, bounds: [0, 1, 2, 3].map((x) => ({ x, y: 2, width: 4, height: 8 })) }) };
  const result = await api.compare(source, { width: 120, height: 60, toDataURL: () => "data:image/jpeg;base64,REF" }, worker, segments, () => {}, ["glyphs"]);
  const glyphRead = result.strategies.find((item) => item.strategy === "glyphs");
  assert.equal(glyphRead.glyphs.length, 4);
  assert.equal(glyphRead.digitCount, 5);
  assert.equal(glyphRead.value, "");
  assert.ok(glyphRead.warnings.includes("each-glyph-must-produce-one-digit"));
});

test("all selected OCR reads receive the same frozen crop while preprocessing gets separate canvases", async () => {
  const { api, canvases } = loadExperiment();
  const source = { width: 40, height: 20, getContext: () => ({ getImageData: () => ({ width: 40, height: 20, data: new Uint8ClampedArray(40 * 20 * 4).fill(200) }) }) };
  const reference = { width: 120, height: 60, toDataURL: () => "data:image/jpeg;base64,REF" };
  const images = [], psms = [];
  const worker = { setParameters: async ({ tessedit_pageseg_mode }) => psms.push(tessedit_pageseg_mode), recognize: async (image) => { images.push(image); return { data: { text: "1111", confidence: 75 } }; } };
  await api.compare(source, reference, worker, null, () => {}, ["reference", "grayscale", "psm8"]);
  assert.equal(images[0], reference);
  assert.notEqual(images[1], reference);
  assert.equal(images[2], reference);
  assert.deepEqual(psms, ["7", "7", "8"]);
  assert.ok(canvases.length >= 1);
});

test("an OCR worker error is retained as a failed strategy without inventing a value", async () => {
  const { api } = loadExperiment();
  const source = { width: 20, height: 10, getContext: () => ({ getImageData: () => ({ width: 20, height: 10, data: new Uint8ClampedArray(20 * 10 * 4) }) }) };
  const worker = { setParameters: async () => {}, recognize: async () => { throw new Error("worker interrupted"); } };
  const result = await api.compare(source, { width: 60, height: 30, toDataURL: () => "data:image/jpeg;base64,REF" }, worker, null, () => {}, ["reference", "psm8"]);
  assert.equal(result.strategies.length, 2);
  assert.ok(result.strategies.every((item) => item.value === "" && item.digitCount === 0));
  assert.ok(result.strategies.every((item) => item.warnings[0].startsWith("strategy-error:")));
});

test("the five historical trophy locator variants remain in the laboratory", () => {
  const html = fs.readFileSync(path.join(root, "docs/war-results-vision.html"), "utf8");
  for (const id of ["adaptive", "vertical-recovery", "vertical-recovery-edge-safe", "vertical-recovery-icon-aware", "vertical-recovery-combined"]) assert.match(html, new RegExp(`value="${id}"`));
});

test("the OCR comparator remains numeric-lab-only and does not embed private expected values", () => {
  const engine = fs.readFileSync(path.join(root, "docs/war-results-vision-engine.js"), "utf8");
  const ui = fs.readFileSync(path.join(root, "docs/war-results-vision.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "docs/war-results-vision.html"), "utf8");
  assert.match(engine, /options\.compareOcr/);
  assert.match(engine, /ocrRectFrozen: true/);
  assert.match(ui, /variantId: "vertical-recovery-combined", marginPercent: 18, compareOcr: true/);
  assert.match(html, /Copier le rapport OCR JSON/);
  assert.doesNotMatch(`${engine}\n${ui}\n${html}`, /expectedTrophies|benchmarkExpected|privateBenchmarkValues/i);
});

test("combination builder crosses selected PSM and preprocessing modes without chaining", () => {
 const {api}=loadExperiment(), combos=api.buildCombinations([8,13],["reference","tight-crop","thin-strokes"]);
 assert.equal(combos.length,6);
 assert.deepEqual(JSON.parse(JSON.stringify(combos.map(x=>[x.psm,x.prep]))),[[8,"reference"],[13,"reference"],[8,"tight-crop"],[13,"tight-crop"],[8,"thin-strokes"],[13,"thin-strokes"]]);
 assert.ok(combos.every(x=>!x.prep.includes("+")));
});
test("recommended seven-read set focuses corrections on PSM 8 and 13", () => {
 const {api}=loadExperiment();
 const combos=[...api.buildCombinations([7],["reference"]),...api.buildCombinations([8,13],["tight-crop","thin-strokes"]),...api.buildCombinations([8,13],["reference"])];
 assert.equal(combos.length,7);
 assert.deepEqual(combos.map(x=>x.id),["combo:reference:psm7","combo:tight-crop:psm8","combo:tight-crop:psm13","combo:thin-strokes:psm8","combo:thin-strokes:psm13","combo:reference:psm8","combo:reference:psm13"]);
});
test("numeric lab UI exposes preset, count, independent combinations and exports", () => {
 const html=fs.readFileSync(path.join(root,"docs/war-results-vision.html"),"utf8");
 for(const id of ["ocrCombinationOptions","applyRecommendedOcrPreset","ocrCombinationCount","ocrGlyphOption","ocrMorphologyOption","ocrAlignmentOption","copyNumericOcrButton","exportNumericOcrButton"]) assert.match(html,new RegExp(id));
 assert.match(html,/war-results-ocr-experiment\.js\?v=0\.5\.0-glyph-alignment/);
 assert.match(html,/war-results-vision\.js\?v=5\.3-score-color-diagnostics/);
 assert.match(html,/war-results-vision\.css\?v=6\.6-score-color-diagnostics/);
});

test("combined OCR results keep the existing session key, details and JSON export actions", () => {
 const ui=fs.readFileSync(path.join(root,"docs/war-results-vision.js"),"utf8");
 assert.match(ui,/sessionStorage\.setItem\(NUMERIC_OCR_KEY/);
 assert.match(ui,/copyNumericOcrJson/);
 assert.match(ui,/exportNumericOcrJson/);
 assert.match(ui,/variants: \(d\.ocrComparison\?\.strategies/);
});
test("all three lab engines and the OCR result controls live inside the unified experimental panel", () => {
 const html=fs.readFileSync(path.join(root,"docs/war-results-vision.html"),"utf8");
 const start=html.indexOf('id="recognitionLabTitle"'), end=html.indexOf('<section id="batchSummary"');
 assert.ok(start>=0&&end>start);
 const lab=html.slice(start,end);
 for(const text of ["identity","numeric","result","Scores et trophées","Localisation et découpe","Reconnaissance OCR","Résultats détaillés, diagnostics et exports"]) assert.ok(lab.includes(text),text);
});

test("morphology features distinguish a two-loop 8 from a single-loop 9 without auto-correction", () => {
 const {api}=loadExperiment();
 const ring=(two)=>{const a=new Uint8Array(20*24);for(let y=2;y<22;y++)for(let x=3;x<17;x++){if(x===3||x===16||y===2||y===21)a[y*20+x]=1;if(two&&(y===11||y===12))a[y*20+x]=1;}return a;};
 const f8=api.morphologyFeatures(ring(true)),f9=api.morphologyFeatures(ring(false));
 assert.equal(f8.holeCount,2);assert.equal(f8.classification,"8");
 assert.equal(f9.holeCount,1);assert.ok(f9.upperHole);assert.equal(f9.classification,"9");
});
test("hybrid strategy runs PSM 8 and keeps the OCR value unchanged while recording morphology", async () => {
 const {api}=loadExperiment();
 const image={width:40,height:20,getContext:()=>({getImageData:()=>({width:40,height:20,data:new Uint8ClampedArray(40*20*4)})})};
 const worker={setParameters:async p=>assert.equal(p.tessedit_pageseg_mode,"8"),recognize:async()=>({data:{text:"2580",confidence:96}})};
 const reader={segment:(_data,_category,count)=>count===4?{confidence:.9,bounds:[],glyphs:[0,1,2,3].map(()=>({rect:{x:0,y:0,width:5,height:8},area:20,bitmap:new Uint8Array(480)}))}:{reason:"ambiguous-component-run",bounds:[],glyphs:[]}};
 const result=await api.compare(image,{width:40,height:20,toDataURL:()=>"data:image/jpeg;base64,ref"},worker,reader,()=>{},["psm8-morphology"]);
 const hybrid=result.strategies[0];assert.equal(hybrid.value,"2580");assert.equal(hybrid.psm,8);assert.equal(hybrid.morphology.selectedCount,4);assert.equal(hybrid.proposedCorrection,null);
});
test("JSON diagnostics retain combination ID, morphology evidence and proposal explanation", () => {
 const ui=fs.readFileSync(path.join(root,"docs/war-results-vision.js"),"utf8");
 const engine=fs.readFileSync(path.join(root,"docs/war-results-ocr-experiment.js"),"utf8");
 assert.ok(ui.includes("proposedCorrection: item.proposedCorrection"));assert.ok(ui.includes("morphology: item.morphology"));
 assert.ok(ui.includes("alignment: item.alignment"));assert.ok(ui.includes("decisionRationale: item.decisionRationale"));
 assert.match(ui,/ocrMorphologyOption/);assert.match(ui,/ocrAlignmentOption/);assert.match(engine,/automatic:false/);
 for(const field of ["ocrSymbols","alignment","morphologyChecks","decision","decisionRationale","stageTimings","ocrReused"]) assert.ok(ui.includes(`${field}: item.${field}`),`JSON export persists ${field}`);
 assert.match(ui,/sessionStorage\.setItem\(NUMERIC_OCR_KEY, JSON\.stringify\(numericOcrSummary\.map\(\(entry\) => entry\.compact\)\)\)/);
});

function simpleGlyphs(){return [0,1,2,3].map((_,i)=>({index:i+1,bounds:{x:i*20,y:2,width:12,height:20}}));}
function makeSymbolsForSplit(splitAt){
 const out=[];let index=0;
 for(let glyph=0;glyph<4;glyph++){
  const x=glyph*20;
  if(glyph===splitAt){out.push({text:"8",index:index++,bbox:{x0:x,y0:2,x1:x+6,y1:22}},{text:"9",index:index++,bbox:{x0:x+6,y0:2,x1:x+12,y1:22}});}
  else out.push({text:String((glyph+1)%10),index:index++,bbox:{x0:x,y0:2,x1:x+12,y1:22}});
 }
 return out;
}
function digitBitmap(kind){
 const a=new Uint8Array(20*24),put=(x,y)=>{if(x>=0&&x<20&&y>=0&&y<24)a[y*20+x]=1;};
 if(kind==="9"){for(let y=2;y<=12;y++)for(let x=4;x<=15;x++)if(x===4||x===15||y===2||y===12)put(x,y);for(let y=12;y<22;y++)put(15,y);}
 if(kind==="0"){for(let y=2;y<=21;y++)for(let x=4;x<=15;x++)if(x===4||x===15||y===2||y===21)put(x,y);}
 if(kind==="8"){for(let y=2;y<=21;y++)for(let x=4;x<=15;x++)if(x===4||x===15||y===2||y===11||y===12||y===21)put(x,y);}
 if(kind==="5"){for(let x=4;x<=15;x++){put(x,2);put(x,11);}for(let y=2;y<=11;y++)put(4,y);for(let y=11;y<=19;y++)put(15,y);for(let x=8;x<=15;x++)put(x,21);for(let y=19;y<=21;y++)put(15,y);}
 if(kind==="2"){for(let x=4;x<=15;x++){put(x,2);put(x,11);put(x,21);}for(let i=0;i<9;i++){put(14-i,3+i);put(5+i,12+i);}}
 return a;
}
function pixelImage(width,height){return {width,height,getContext:()=>({getImageData:()=>({width,height,data:new Uint8ClampedArray(width*height*4)})})};}
function blockFor(symbols){return [{paragraphs:[{lines:[{words:[{symbols}]}]}]}];}
function scaledSymbols(symbols,factor=3){return symbols.map(s=>({...s,bbox:{x0:s.bbox.x0*factor,y0:s.bbox.y0*factor,x1:s.bbox.x1*factor,y1:s.bbox.y1*factor}}));}

test("Tesseract block output yields digit symbols, confidence and individual boxes",()=>{
 const {api}=loadExperiment(),symbols=api.extractOcrSymbols({blocks:blockFor([{text:"2",confidence:88,bbox:{x0:4,y0:2,x1:8,y1:16}},{text:"9",confidence:91,bbox:{x0:9,y0:2,x1:13,y1:16}}])});
 assert.deepEqual(JSON.parse(JSON.stringify(symbols.map(s=>[s.text,s.confidence,s.bbox.x0,s.bbox.x1]))),[["2",88,4,8],["9",91,9,13]]);
});
test("four OCR characters and four physical glyphs align one-to-one",()=>{
 const {api}=loadExperiment(),result=api.alignOcrSymbolsToGlyphs(makeSymbolsForSplit(-1),simpleGlyphs(),{width:80,height:24});
 assert.equal(result.groups.length,4);assert.ok(result.groups.every(g=>g.relation==="one-to-one"));assert.equal(result.anomalies.length,0);assert.ok(result.confidence>.75);
});
test("five OCR characters map to four glyphs for splits at the beginning, middle and end",()=>{
 const {api}=loadExperiment();for(const splitAt of [0,2,3]){const result=api.alignOcrSymbolsToGlyphs(makeSymbolsForSplit(splitAt),simpleGlyphs(),{width:80,height:24});
  assert.equal(result.anomalies.length,1);assert.equal(result.anomalies[0].relation,"many-ocr-to-one-glyph");assert.deepEqual(result.anomalies[0].glyphIndices,[splitAt+1]);assert.equal(result.ambiguous,false);}
});
test("three OCR characters can align one character to two physical glyphs",()=>{
 const {api}=loadExperiment(),result=api.alignOcrSymbolsToGlyphs([
  {text:"1",bbox:{x0:0,y0:2,x1:32,y1:22}},{text:"2",bbox:{x0:40,y0:2,x1:52,y1:22}},{text:"3",bbox:{x0:60,y0:2,x1:72,y1:22}}
 ],simpleGlyphs(),{width:80,height:24});
 assert.ok(result.anomalies.some(a=>a.relation==="one-ocr-to-many-glyphs"));
});
test("missing OCR boxes use a low-confidence sequential fallback",()=>{
 const {api}=loadExperiment(),result=api.alignOcrSymbolsToGlyphs(makeSymbolsForSplit(2).map(s=>({...s,bbox:null})),simpleGlyphs(),{width:80,height:24});
 assert.equal(result.source,"sequential-fallback");assert.equal(result.hasCoordinates,false);assert.ok(result.confidence<=.55);
});
test("overlapping OCR boxes remain ambiguous",()=>{
 const {api}=loadExperiment(),symbols=Array.from({length:5},(_,i)=>({text:String(i),bbox:{x0:30,y0:2,x1:42,y1:22}}));
 assert.equal(api.alignOcrSymbolsToGlyphs(symbols,simpleGlyphs(),{width:80,height:24}).ambiguous,true);
});
test("targeted morphology distinguishes 8, 9 and 5 and rejects 0 and 2 as 9",()=>{
 const {api}=loadExperiment(),read=kind=>api.targetedMorphology(digitBitmap(kind));
 assert.equal(read("8").classification,"8");assert.equal(read("9").classification,"9");assert.equal(read("5").classification,"5");
 assert.equal(read("0").classification,"other");assert.equal(read("2").classification,"other");
});
test("weak glyph evidence is indeterminate rather than defaulting to 9",()=>{
 const {api}=loadExperiment(),result=api.targetedMorphology(new Uint8Array(20*24));assert.equal(result.classification,"indeterminate");assert.equal(result.confidence,0);
});
test("localized PSM 8 alignment proposes a morphology-supported merge without mutating the OCR read",async()=>{
 const {api}=loadExperiment(),source=pixelImage(80,24),symbols=scaledSymbols([
  {text:"3",confidence:78,bbox:{x0:0,y0:2,x1:10,y1:22}},{text:"4",confidence:78,bbox:{x0:20,y0:2,x1:30,y1:22}},
  {text:"8",confidence:78,bbox:{x0:40,y0:2,x1:45,y1:22}},{text:"9",confidence:78,bbox:{x0:45,y0:2,x1:50,y1:22}},{text:"6",confidence:78,bbox:{x0:60,y0:2,x1:70,y1:22}}
 ]);
 const worker={calls:0,setParameters:async()=>{},recognize:async(_image,_options,output)=>{worker.calls++;assert.deepEqual(JSON.parse(JSON.stringify(output)),{text:true,blocks:true});return {data:{text:"34896",confidence:78,blocks:blockFor(symbols)}};}};
 const reader={segment:(_data,_category,count)=>count===4?{confidence:1,glyphs:simpleGlyphs().map((g,i)=>({rect:g.bounds,bitmap:i===2?digitBitmap("9"):digitBitmap("0")}))}:{reason:"no-coherent-run",confidence:.1,glyphs:[]}};
 const result=await api.compare(source,{width:240,height:72,toDataURL:()=>"data:image/jpeg;base64,ref"},worker,reader,()=>{},["psm8-glyph-alignment"]),item=result.strategies[0];
 assert.equal(worker.calls,1);assert.equal(item.raw,"34896");assert.equal(item.value,"");assert.equal(item.proposedCorrection.to,"3496");assert.equal(item.decision,"propose-correction");assert.equal(item.proposedCorrection.automatic,false);assert.deepEqual(item.alignment.anomalies[0].ocrIndices,[3,4]);
});
test("the PSM 8 read is shared between the reference strategy and alignment",async()=>{
 const {api}=loadExperiment(),source=pixelImage(80,24),symbols=scaledSymbols(makeSymbolsForSplit(2));
 const worker={calls:0,setParameters:async()=>{},recognize:async()=>{worker.calls++;return {data:{text:"34896",confidence:78,blocks:blockFor(symbols)}};}};
 const reader={segment:(_data,_category,count)=>count===4?{confidence:1,glyphs:simpleGlyphs().map(g=>({rect:g.bounds,bitmap:digitBitmap("0")}))}:{reason:"no-run",glyphs:[]}};
 const baseline={id:"combo:reference:psm8",psm:8,prep:"reference",label:"PSM 8 · Référence"};
 const result=await api.compare(source,{width:240,height:72,toDataURL:()=>"data:image/jpeg;base64,ref"},worker,reader,()=>{},[baseline,"psm8-glyph-alignment"]);
 assert.equal(worker.calls,1);assert.equal(result.strategies[0].strategy,baseline.id);assert.equal(result.strategies[1].ocrReused,true);
});
test("coherent OCR and segmentation keep the existing four-digit value",async()=>{
 const {api}=loadExperiment(),source=pixelImage(80,24),symbols=scaledSymbols(makeSymbolsForSplit(-1));
 const worker={setParameters:async()=>{},recognize:async()=>({data:{text:"1234",confidence:95,blocks:blockFor(symbols)}})};
 const reader={segment:(_data,_category,count)=>count===4?{confidence:1,glyphs:simpleGlyphs().map(g=>({rect:g.bounds,bitmap:digitBitmap("9")}))}:{reason:"no-run",glyphs:[]}};
 const result=await api.compare(source,{width:240,height:72,toDataURL:()=>"data:image/jpeg;base64,ref"},worker,reader,()=>{},["psm8-glyph-alignment"]),item=result.strategies[0];
 assert.equal(item.value,"1234");assert.equal(item.proposedCorrection,null);assert.equal(item.decision,"keep-ocr");
});
test("coordinate-free anomalies and a centered 0 morphology abstain",async()=>{
 const {api}=loadExperiment(),source=pixelImage(80,24),symbols=makeSymbolsForSplit(2).map(s=>({...s,bbox:null}));
 const worker={setParameters:async()=>{},recognize:async()=>({data:{text:"34896",confidence:99,blocks:blockFor(symbols)}})};
 const reader={segment:(_data,_category,count)=>count===4?{confidence:1,glyphs:simpleGlyphs().map(g=>({rect:g.bounds,bitmap:digitBitmap("0")}))}:{reason:"no-run",glyphs:[]}};
 const result=await api.compare(source,{width:240,height:72,toDataURL:()=>"data:image/jpeg;base64,ref"},worker,reader,()=>{},["psm8-glyph-alignment"]),item=result.strategies[0];
 assert.equal(item.proposedCorrection,null);assert.equal(item.decision,"abstain");assert.ok(item.warnings.includes("ocr-symbol-coordinates-unavailable"));
});
test("contradictory 8 morphology never authorizes merging OCR characters",async()=>{
 const {api}=loadExperiment(),source=pixelImage(80,24),symbols=scaledSymbols(makeSymbolsForSplit(2));
 const worker={setParameters:async()=>{},recognize:async()=>({data:{text:"34896",confidence:99,blocks:blockFor(symbols)}})};
 const reader={segment:(_data,_category,count)=>count===4?{confidence:1,glyphs:simpleGlyphs().map((g,i)=>({rect:g.bounds,bitmap:i===2?digitBitmap("8"):digitBitmap("0")}))}:{reason:"no-run",glyphs:[]}};
 const result=await api.compare(source,{width:240,height:72,toDataURL:()=>"data:image/jpeg;base64,ref"},worker,reader,()=>[],["psm8-glyph-alignment"]),item=result.strategies[0];
 assert.equal(item.morphologyChecks[0].features.classification,"8");assert.equal(item.proposedCorrection,null);assert.equal(item.decision,"abstain");
});
