const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const data = require('../../../docs/war-results-vision-data.js');
const appSource = fs.readFileSync(path.resolve(__dirname, '../../../docs/war-results-vision.js'), 'utf8');
const keys = ['localAlliance','opponentAlliance','localScore','opponentScore','localTrophies','opponentTrophies','result'];
const validValues = {localAlliance:'LoSP Kronos',opponentAlliance:'Opponent',localScore:'500000',opponentScore:'400000',localTrophies:'2750',opponentTrophies:'2650',result:'win'};
const makeFieldData = () => Object.fromEntries(keys.map(key => [key,{value:validValues[key],uncertain:false,confidence:90,source:'test',alternatives:[]} ]));

function makeApp(saved = []) {
  const handlers = {};
  const elements = new Map();
  for (const selector of ['#captureInput','#captureResults','#analyzeButton','#analysisStatus','#analysisProgress','#batchBadge','#validatedSummary','#validatedList','#batchSummary','#batchSummaryText','#clearButton','#exportAllButton','#diagnosticText','#diagnosticLog']) {
    elements.set(selector, { addEventListener(type, fn) { handlers[`${selector}:${type}`] = fn; }, dataset:{}, classList:{add(){},remove(){}}, querySelector(){return {textContent:'',checked:false};} });
  }
  const list = elements.get('#captureResults');
  let html = '';
  Object.defineProperty(list,'innerHTML',{get(){return html;},set(v){html=v;}});
  const status=elements.get('#analysisStatus'), progress=elements.get('#analysisProgress');
  let inputFiles=[];
  Object.defineProperty(elements.get('#captureInput'),'files',{get(){return inputFiles;}});
  const clicks=[];
  const doc = {
    querySelector(selector) { if(!elements.has(selector)) throw new Error(`unexpected selector ${selector}`); return elements.get(selector); },
    createElement(tag) { return {tag,click(){clicks.push(this);}}; }
  };
  const storage = {getItem(){return JSON.stringify(saved);},setItem(_k,v){this.value=v;},removeItem(){this.value='[]';}};
  const engineCalls=[];
  const win={WarResultsVisionData:data,addEventListener(type,fn){handlers[`window:${type}`]=fn;}};
  win.WarResultsVisionEngine={
    async analyze(file){engineCalls.push(file.name);return {fields:makeFieldData(),warnings:[],rawText:'test OCR',metrics:{calls:[],methods:['mock']}};},
    async release(){}
  };
  const context=vm.createContext({window:win,WarResultsVisionData:data,WarResultsVisionEngine:win.WarResultsVisionEngine,document:doc,sessionStorage:storage,crypto:{randomUUID:()=>`capture-${engineCalls.length+1}`},URL:{createObjectURL:()=>`blob:${engineCalls.length}`,revokeObjectURL(){}},Blob,performance:{now:()=>1},confirm:()=>true,setTimeout:()=>{},console,Math,Date});
  vm.runInContext(appSource,context);
  return {handlers,elements,list,status,progress,storage,engineCalls,clicks,setFiles(files){inputFiles=files;},data};
}
function click(app, action, id='capture-1') {
  const button={dataset:{action,id},closest(){return this;},disabled:false};
  app.handlers['#captureResults:click']({target:button});
}

(async()=>{
  const pending=makeApp();
  pending.setFiles([{name:'capture.png',type:'image/png',size:10}]);
  pending.handlers['#captureInput:change']();
  assert.match(pending.list.innerHTML,/data-action="analyze-one" data-id="capture-1"/);
  assert.match(pending.list.innerHTML,/data-action="remove" data-id="capture-1"/);
  assert.match(pending.list.innerHTML,/data-action="validate" data-id="capture-1"/);
  assert.match(pending.list.innerHTML,/data-action="export-one" data-id="capture-1"/);
  click(pending,'analyze-one');
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(pending.engineCalls,['capture.png'],'single-capture analysis button routes to the right image');
  assert.match(pending.list.innerHTML,/À vérifier/,'analysis updates the card state');

  const mainButton=makeApp();
  mainButton.setFiles([{name:'main-button.png',type:'image/png',size:10}]);
  mainButton.handlers['#captureInput:change']();
  mainButton.handlers['#analyzeButton:click']({type:'click'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(mainButton.engineCalls,['main-button.png'],'main button click event does not become a capture id');
  assert.match(mainButton.status.textContent,/Analyse terminée/,'main button shows a completed status');

  const removable=makeApp();
  removable.setFiles([{name:'remove.png',type:'image/png',size:10}]);
  removable.handlers['#captureInput:change']();
  click(removable,'remove');
  assert.equal(removable.list.innerHTML,'','remove action targets and removes its capture');

  const draft={fileName:'review.png',state:'review',output:null,values:validValues,fields:makeFieldData(),date:'2026-11-12',corrected:[],analysis:null,rawText:'',warnings:[]};
  const review=makeApp([draft]);
  const id='capture-1';
  review.handlers['#captureResults:change']({target:{dataset:{confirm:id},checked:true}});
  click(review,'validate',id);
  assert.match(review.list.innerHTML,/Validée localement/,'validation action uses the matching capture id');
  click(review,'export-one',id);
  assert.equal(review.clicks.length,1,'export action reaches the local download handler');
  console.log('war results vision iOS action routing tests: ok');
})().catch(error=>{console.error(error);process.exitCode=1;});
