/* Isolated OCR-only strategies for the numeric laboratory. The source crop is
 * fixed by the caller; this module never invokes or changes a locator. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WarResultsOcrExperiment = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STRATEGIES = Object.freeze([
    { id: "reference", label: "Référence actuelle · PSM 7", group: "baseline", psm: 7, prep: "reference", parameters: { scale: 3, smoothing: "high", grayscale: true, contrast: 1.7 } },
    { id: "grayscale", label: "Niveaux de gris · PSM 7", group: "preprocess", psm: 7, prep: "grayscale", parameters: { scale: 3, smoothing: "high", grayscale: true, contrast: 1 } },
    { id: "otsu", label: "Seuillage global Otsu · PSM 7", group: "preprocess", psm: 7, prep: "otsu", parameters: { scale: 3, smoothing: "high", threshold: "Otsu histogram" } },
    { id: "adaptive", label: "Seuillage local · PSM 7", group: "preprocess", psm: 7, prep: "adaptive", parameters: { scale: 3, smoothing: "high", threshold: "local mean - 8", radius: 6 } },
    { id: "tight-crop", label: "Marge horizontale réduite · PSM 7", group: "geometry", psm: 7, prep: "tight-crop", parameters: { horizontalInset: .06, scale: 3, grayscale: true, contrast: 1.7 } },
    { id: "thin-strokes", label: "Amincissement morphologique · PSM 7", group: "preprocess", psm: 7, prep: "thin-strokes", parameters: { scale: 3, threshold: "Otsu", operation: "3×3 erosion" } },
    { id: "psm8", label: "Image de référence · PSM 8", group: "segmentation", psm: 8, prep: "reference", parameters: { scale: 3, smoothing: "high", grayscale: true, contrast: 1.7 } },
    { id: "psm13", label: "Image de référence · PSM 13", group: "segmentation", psm: 13, prep: "reference", parameters: { scale: 3, smoothing: "high", grayscale: true, contrast: 1.7 } },
    { id: "glyphs", label: "Tesseract chiffre par chiffre · PSM 10", group: "glyph", psm: 10, prep: "glyphs", parameters: { glyphPadding: .18, scalePerGlyph: 4, grayscaleContrast: 1.7 } }
  ]);
  const HYBRID_STRATEGY = Object.freeze({id:"psm8-morphology",label:"PSM 8 + vérification morphologique 8/9/5",group:"morphology",psm:8,prep:"reference",parameters:{candidateDigits:[8,9,5]}});
  const ALIGNMENT_STRATEGY = Object.freeze({id:"psm8-glyph-alignment",label:"PSM 8 + alignement OCR/glyphes",group:"alignment",psm:8,prep:"reference",parameters:{blockSymbols:true,physicalGlyphCounts:[3,4,5,6]}});
  const PSM_MODES = Object.freeze([7, 8, 13]);
  const PREPROCESSING_MODES = Object.freeze([
    { id: "reference", label: "Référence sans correction supplémentaire" },
    { id: "grayscale", label: "Niveaux de gris" },
    { id: "otsu", label: "Seuillage global Otsu" },
    { id: "adaptive", label: "Seuillage local adaptatif" },
    { id: "tight-crop", label: "Marge horizontale réduite" },
    { id: "thin-strokes", label: "Amincissement morphologique" }
  ]);
  function buildCombinations(psms, preprocessings) {
    const validPsms = [...new Set((psms || []).map(Number).filter((value) => PSM_MODES.includes(value)))];
    const validPreps = [...new Set((preprocessings || []).filter((value) => PREPROCESSING_MODES.some((mode) => mode.id === value)))];
    return validPreps.flatMap((prep) => validPsms.map((psm) => ({
      id: `combo:${prep}:psm${psm}`,
      label: `PSM ${psm} · ${PREPROCESSING_MODES.find((mode) => mode.id === prep).label}`,
      group: prep === "reference" ? "baseline" : "preprocess", psm, prep, parameters: {}
    })));
  }

  function morphologyFeatures(bitmap, width = 20, height = 24) {
    const ink = (x,y) => bitmap[y*width+x] ? 1 : 0;
    const seen = new Uint8Array(width*height), holes=[];
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const at=y*width+x;if(ink(x,y)||seen[at])continue;
      const queue=[at];seen[at]=1;let area=0,sumY=0,touches=false;
      for(let q=0;q<queue.length;q++){
        const n=queue[q],nx=n%width,ny=(n-nx)/width;area++;sumY+=ny;
        if(nx===0||ny===0||nx===width-1||ny===height-1)touches=true;
        for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
          const xx=nx+dx,yy=ny+dy;if(xx<0||xx>=width||yy<0||yy>=height)continue;
          const next=yy*width+xx;if(!ink(xx,yy)&&!seen[next]){seen[next]=1;queue.push(next);}
        }
      }
      if(!touches&&area>=2)holes.push({area,centroidY:Number((sumY/area).toFixed(3))});
    }
    const rowProjection=Array.from({length:height},(_,y)=>{let n=0;for(let x=0;x<width;x++)n+=ink(x,y);return Number((n/width).toFixed(3));});
    const columnProjection=Array.from({length:width},(_,x)=>{let n=0;for(let y=0;y<height;y++)n+=ink(x,y);return Number((n/height).toFixed(3));});
    const inkCount=bitmap.reduce((n,v)=>n+(v?1:0),0);
    const lowerInk=bitmap.reduce((n,v,i)=>n+(v&&Math.floor(i/width)>=Math.floor(height*.62)?1:0),0);
    const upperHole=holes.some(h=>h.centroidY<height*.56);
    const lowerTail=lowerInk/Math.max(1,inkCount);
    const topBar=Math.max(...rowProjection.slice(1,Math.floor(height*.3)));
    const midBar=Math.max(...rowProjection.slice(Math.floor(height*.38),Math.floor(height*.62)));
    const bottomRight=bitmap.reduce((n,v,i)=>{const x=i%width,y=Math.floor(i/width);return n+(v&&x>=width*.52&&y>=height*.58?1:0);},0)/Math.max(1,inkCount);
    const hypotheses=[
      {digit:"9",score:holes.length===1&&upperHole&&lowerTail>.16?Math.min(.99,.7+lowerTail*.8):0},
      {digit:"8",score:holes.length>=2?Math.min(.99,.84+Math.min(.15,(holes.length-2)*.08)):0},
      {digit:"5",score:holes.length===0&&topBar>.28&&midBar>.25&&bottomRight>.08?Math.min(.94,.58+topBar*.2+midBar*.2+bottomRight*.2):0}
    ].sort((a,b)=>b.score-a.score);
    const margin=hypotheses[0].score-hypotheses[1].score;
    return {holeCount:holes.length,holes,lowerInkRatio:Number(lowerTail.toFixed(3)),upperHole,topBar:Number(topBar.toFixed(3)),midBar:Number(midBar.toFixed(3)),bottomRightInkRatio:Number(bottomRight.toFixed(3)),rowProjection,columnProjection,
      hypotheses:hypotheses.map(x=>({...x,score:Number(x.score.toFixed(3))})),confidence:Number(hypotheses[0].score.toFixed(3)),margin:Number(margin.toFixed(3)),
      classification:hypotheses[0].score>=.78&&margin>=.3?hypotheses[0].digit:null};
  }

  function targetedMorphology(bitmap, width = 20, height = 24) {
    const inkAt=(x,y)=>bitmap[y*width+x]?1:0, foregroundCount=bitmap.reduce((sum,v)=>sum+(v?1:0),0);
    if(!foregroundCount)return {classification:"indeterminate",confidence:0,margin:0,holeCount:0,holes:[],hypotheses:[],exclusionReasons:["empty-glyph"]};
    const seen=new Uint8Array(width*height),holes=[];
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const start=y*width+x;if(inkAt(x,y)||seen[start])continue;
      const queue=[start];seen[start]=1;let area=0,sumX=0,sumY=0,minX=x,maxX=x,minY=y,maxY=y,touchesEdge=false;
      for(let q=0;q<queue.length;q++){
        const at=queue[q],cx=at%width,cy=(at-cx)/width;area++;sumX+=cx;sumY+=cy;minX=Math.min(minX,cx);maxX=Math.max(maxX,cx);minY=Math.min(minY,cy);maxY=Math.max(maxY,cy);
        if(cx===0||cy===0||cx===width-1||cy===height-1)touchesEdge=true;
        for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
          const nx=cx+dx,ny=cy+dy;if(nx<0||ny<0||nx>=width||ny>=height)continue;
          const next=ny*width+nx;if(!inkAt(nx,ny)&&!seen[next]){seen[next]=1;queue.push(next);}
        }
      }
      if(!touchesEdge&&area>=3)holes.push({area,areaRatio:area/(width*height),areaToInkRatio:area/foregroundCount,centroidX:sumX/area/width,centroidY:sumY/area/height,
        bounds:{x:minX/width,y:minY/height,width:(maxX-minX+1)/width,height:(maxY-minY+1)/height}});
    }
    const rows=Array.from({length:height},(_,y)=>{let n=0;for(let x=0;x<width;x++)n+=inkAt(x,y);return n/width;});
    const columns=Array.from({length:width},(_,x)=>{let n=0;for(let y=0;y<height;y++)n+=inkAt(x,y);return n/height;});
    let upper=0,lower=0,lowerLeft=0,lowerRight=0,top=0,mid=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(inkAt(x,y)){
      if(y<height*.42)upper++;else lower++;
      if(y>=height*.58){if(x<width*.5)lowerLeft++;else lowerRight++;}
      if(y>=height*.08&&y<height*.34)top=Math.max(top,rows[y]);
      if(y>=height*.36&&y<height*.66)mid=Math.max(mid,rows[y]);
    }
    const lowerRatio=lower/foregroundCount,rightRatio=lowerRight/foregroundCount,leftRatio=lowerLeft/foregroundCount;
    const compactLoop=holes.length===1&&holes[0].areaRatio>=.025&&holes[0].areaRatio<=.24;
    const upperLoop=compactLoop&&holes[0].centroidY<.45;
    const centeredLargeLoop=holes.length===1&&holes[0].centroidY>=.38&&holes[0].centroidY<=.64&&holes[0].areaRatio>.07;
    const rightTail=rightRatio>=.065&&rightRatio>leftRatio*1.12;
    const hypotheses=[
      {digit:"9",score:Math.min(1,(upperLoop?.3:0)+(compactLoop?.18:0)+(lowerRatio>.16?.14:0)+(rightTail?.25:0)+(lowerRatio>.3?.13:0))},
      {digit:"8",score:holes.length===2&&Math.abs(holes[0].centroidY-holes[1].centroidY)>.2&&holes.every(h=>h.areaRatio>.02)?.9:0},
      {digit:"5",score:holes.length===0&&top>.24&&mid>.2&&rightRatio>=.07&&rightRatio>leftRatio*1.2?.84:0},
      {digit:"other",score:centeredLargeLoop&&!rightTail?.9:(holes.length===0&&top>.2&&mid>.18&&!(rightRatio>leftRatio*1.2)?.82:0)}
    ].sort((a,b)=>b.score-a.score);
    const margin=hypotheses[0].score-(hypotheses[1]?.score||0),classification=hypotheses[0].score>=.76&&margin>=.18?hypotheses[0].digit:"indeterminate";
    const exclusionReasons=[];
    if(holes.length!==1)exclusionReasons.push("nine-requires-one-closed-cavity");
    else if(!upperLoop)exclusionReasons.push(holes[0].areaRatio>.24?"cavity-too-large-or-central":"cavity-not-in-upper-region");
    if(!rightTail)exclusionReasons.push("no-distinct-lower-right-tail");
    if(foregroundCount<Math.max(12,width*height*.025))exclusionReasons.push("insufficient-foreground-evidence");
    return {classification,confidence:Number(hypotheses[0].score.toFixed(3)),margin:Number(margin.toFixed(3)),holeCount:holes.length,holes,
      foregroundCount,upperInkRatio:Number((upper/foregroundCount).toFixed(3)),lowerInkRatio:Number(lowerRatio.toFixed(3)),
      lowerLeftInkRatio:Number(leftRatio.toFixed(3)),lowerRightInkRatio:Number(rightRatio.toFixed(3)),rightTail,
      topBar:Number(top.toFixed(3)),midBar:Number(mid.toFixed(3)),rowProjection:rows.map(v=>Number(v.toFixed(3))),columnProjection:columns.map(v=>Number(v.toFixed(3))),
      hypotheses:hypotheses.map(h=>({...h,score:Number(h.score.toFixed(3))})),exclusionReasons};
  }

  function normalizedBox(box, scaleX=1, scaleY=1) {
    if(!box)return null;
    const x=Number.isFinite(box.x0)?box.x0:Number(box.x),y=Number.isFinite(box.y0)?box.y0:Number(box.y);
    const right=Number.isFinite(box.x1)?box.x1:x+Number(box.width),bottom=Number.isFinite(box.y1)?box.y1:y+Number(box.height);
    if(![x,y,right,bottom].every(Number.isFinite)||right<=x||bottom<=y)return null;
    return {x:x*scaleX,y:y*scaleY,width:(right-x)*scaleX,height:(bottom-y)*scaleY};
  }
  function unionBoxes(boxes) {
    const valid=boxes.filter(Boolean);if(!valid.length)return null;
    const x=Math.min(...valid.map(b=>b.x)),y=Math.min(...valid.map(b=>b.y));
    const right=Math.max(...valid.map(b=>b.x+b.width)),bottom=Math.max(...valid.map(b=>b.y+b.height));
    return {x,y,width:right-x,height:bottom-y};
  }
  function clamp01(value){return Math.max(0,Math.min(1,value));}
  function scoreSpatialGroup(ocrGroup,glyphGroup) {
    const ocrBox=unionBoxes(ocrGroup.map(s=>s._box)),glyphBox=unionBoxes(glyphGroup.map(g=>g.bounds));
    if(!ocrBox||!glyphBox)return {cost:.72,confidence:.28,metrics:{available:false}};
    const ix=Math.max(0,Math.min(ocrBox.x+ocrBox.width,glyphBox.x+glyphBox.width)-Math.max(ocrBox.x,glyphBox.x));
    const iy=Math.max(0,Math.min(ocrBox.y+ocrBox.height,glyphBox.y+glyphBox.height)-Math.max(ocrBox.y,glyphBox.y));
    const overlapX=ix/Math.max(1,Math.min(ocrBox.width,glyphBox.width)),overlapY=iy/Math.max(1,Math.min(ocrBox.height,glyphBox.height));
    const h=Math.max(1,(ocrBox.height+glyphBox.height)/2),centerX=Math.abs((ocrBox.x+ocrBox.width/2)-(glyphBox.x+glyphBox.width/2))/h;
    const centerY=Math.abs((ocrBox.y+ocrBox.height/2)-(glyphBox.y+glyphBox.height/2))/h;
    const widthDelta=Math.min(1,Math.abs(Math.log(Math.max(.01,ocrBox.width/glyphBox.width)))/Math.log(4));
    const confidence=clamp01(.34*overlapX+.16*overlapY+.24*(1-Math.min(1,centerX))+.12*(1-Math.min(1,centerY))+.14*(1-widthDelta));
    const cost=1-confidence+.13*Math.abs(ocrGroup.length-glyphGroup.length);
    return {cost,confidence,metrics:{horizontalOverlap:Number(overlapX.toFixed(3)),verticalOverlap:Number(overlapY.toFixed(3)),
      centerDistanceX:Number(centerX.toFixed(3)),centerDistanceY:Number(centerY.toFixed(3)),widthRatio:Number((ocrBox.width/glyphBox.width).toFixed(3)),ocrBounds:ocrBox,glyphBounds:glyphBox}};
  }
  function alignOcrSymbolsToGlyphs(ocrSymbols,glyphs,options={}) {
    const width=Number(options.width)||1,height=Number(options.height)||1;
    const sx=Number(options.scaleX)||1,sy=Number(options.scaleY)||1;
    const sourceSymbols=(ocrSymbols||[]).map((symbol,index)=>({text:String(symbol.text||""),confidence:Number.isFinite(symbol.confidence)?symbol.confidence:null,
      bbox:symbol.bbox||null,index:Number.isInteger(symbol.index)?symbol.index:index,source:symbol.source||"tesseract-block-symbol",sharedBox:symbol.sharedBox===true}));
    const hasCoordinates=sourceSymbols.length>0&&sourceSymbols.every(s=>normalizedBox(s.bbox,sx,sy));
    const measured=sourceSymbols.map((symbol,index)=>({...symbol,_box:hasCoordinates?normalizedBox(symbol.bbox,sx,sy):{
      x:((index+.12)/Math.max(1,sourceSymbols.length))*width,y:0,width:.76*width/Math.max(1,sourceSymbols.length),height}}));
    const orderedGlyphs=(glyphs||[]).map((glyph,index)=>({index:Number.isInteger(glyph.index)?glyph.index:index+1,bounds:glyph.bounds||glyph.rect})).filter(g=>g.bounds)
      .sort((a,b)=>a.bounds.x-b.bounds.x||a.bounds.y-b.bounds.y);
    const n=measured.length,m=orderedGlyphs.length;
    const states=Array.from({length:n+1},()=>Array.from({length:m+1},()=>[]));states[0][0]=[{cost:0,groups:[]}];
    function push(i,j,candidate){const list=states[i][j];list.push(candidate);list.sort((a,b)=>a.cost-b.cost);const signatures=new Set();states[i][j]=list.filter(item=>{const sig=item.groups.map(g=>`${g.ocrIndices.join("")}:${g.glyphIndices.join("")}`).join("|");if(signatures.has(sig))return false;signatures.add(sig);return true;}).slice(0,3);}
    for(let i=0;i<=n;i++)for(let j=0;j<=m;j++)for(const state of states[i][j]){
      if(i<n)push(i+1,j,{cost:state.cost+.62,groups:[...state.groups,{ocrIndices:[i],glyphIndices:[],relation:"ocr-without-glyph",confidence:0,metrics:{}}]});
      if(j<m)push(i,j+1,{cost:state.cost+.62,groups:[...state.groups,{ocrIndices:[],glyphIndices:[j],relation:"glyph-without-ocr",confidence:0,metrics:{}}]});
      for(let a=1;a<=Math.min(3,n-i);a++)for(let b=1;b<=Math.min(3,m-j);b++){
        if(a>1&&b>1)continue;
        const os=measured.slice(i,i+a),gs=orderedGlyphs.slice(j,j+b),scored=scoreSpatialGroup(os,gs);
        const relation=a===1&&b===1?"one-to-one":a>1&&b===1?"many-ocr-to-one-glyph":a===1&&b>1?"one-ocr-to-many-glyphs":"grouped-many-to-many";
        push(i+a,j+b,{cost:state.cost+scored.cost,groups:[...state.groups,{ocrIndices:Array.from({length:a},(_,k)=>i+k),glyphIndices:Array.from({length:b},(_,k)=>j+k),relation,
          confidence:Number(scored.confidence.toFixed(3)),metrics:scored.metrics}]});
      }
    }
    const finals=states[n][m],best=finals[0],second=finals[1],margin=second?Number((second.cost-best.cost).toFixed(3)):1;
    const quality=best?clamp01(1-best.cost/Math.max(1,Math.max(n,m)*.78)):0;
    const confidence=Number(Math.min(hasCoordinates?1:.55,quality).toFixed(3));
    const groups=(best?.groups||[]).map(group=>({...group,ocrIndices:group.ocrIndices.map(i=>i+1),glyphIndices:group.glyphIndices.map(i=>orderedGlyphs[i].index),
      ocr:group.ocrIndices.map(i=>({index:i+1,text:measured[i].text,bounds:measured[i]._box,source:measured[i].source,confidence:measured[i].confidence})),
      glyphs:group.glyphIndices.map(i=>({index:orderedGlyphs[i].index,bounds:orderedGlyphs[i].bounds}))}));
    const anomalies=groups.filter(g=>g.relation!=="one-to-one").map(g=>({relation:g.relation,ocrIndices:g.ocrIndices,glyphIndices:g.glyphIndices}));
    const ambiguous=Boolean(second&&margin<.035);
    return {source:hasCoordinates?"tesseract-block-symbols":"sequential-fallback",confidence,margin,ambiguous,hasCoordinates,
      ocrCharacters:measured.map((s,i)=>({index:i+1,text:s.text,confidence:s.confidence,bounds:hasCoordinates?normalizedBox(s.bbox,sx,sy):null,source:s.source,sharedBox:s.sharedBox})),
      physicalGlyphs:orderedGlyphs.map(g=>({index:g.index,bounds:g.bounds})),groups,anomalies,
      alternatives:finals.slice(1,3).map(path=>({cost:Number(path.cost.toFixed(3)),groups:path.groups.map(g=>({ocrIndices:g.ocrIndices.map(i=>i+1),glyphIndices:g.glyphIndices.map(i=>orderedGlyphs[i]?.index).filter(Number.isFinite),relation:g.relation}))}))};
  }

  async function readPsm8Morphology(sourceCrop, referenceCrop, worker, digitReader, sharedInitial=null, ocrReused=false) {
    const initial=sharedInitial||await read(worker,referenceCrop,HYBRID_STRATEGY);
    if(!digitReader||typeof digitReader.segment!=="function")return {...initial,strategy:HYBRID_STRATEGY.id,label:HYBRID_STRATEGY.label,ocrReused,morphology:null,proposedCorrection:null,warnings:[...initial.warnings,"morphology-segmenter-unavailable"]};
    const imageData=sourceCrop.getContext("2d",{willReadFrequently:true}).getImageData(0,0,sourceCrop.width,sourceCrop.height);
    const counts=[initial.digitCount,4,3,5,6].filter((n,i,a)=>Number.isInteger(n)&&n>=3&&n<=6&&a.indexOf(n)===i);
    const alternatives=counts.map(count=>{const s=digitReader.segment(imageData,"trophy",count);return {count,reason:s.reason||null,confidence:s.confidence??null,bounds:s.bounds||[],metrics:s.metrics||null,glyphs:s.glyphs||[]};});
    const usable=alternatives.filter(x=>!x.reason&&x.glyphs.length===x.count).sort((a,b)=>(b.confidence||0)-(a.confidence||0));
    const chosen=usable[0]||null;
    const glyphs=(chosen?.glyphs||[]).map((g,index)=>({index:index+1,bounds:g.rect,area:g.area,features:morphologyFeatures(g.bitmap)}));
    let proposedCorrection=null;
    if(initial.digitCount===4&&chosen?.count===4&&initial.digits.length===4){
      const corrected=[...initial.digits];const evidence=[];
      glyphs.forEach((g,i)=>{const current=initial.digits[i],candidate=g.features.classification;
        if(candidate==="9"&&["8","5"].includes(current)){corrected[i]="9";evidence.push({position:i+1,from:current,to:"9",features:g.features});}});
      if(evidence.length&&corrected.join("")!==initial.digits)proposedCorrection={from:initial.digits,to:corrected.join(""),evidence,automatic:false,
        rationale:"Proposition seulement : chaque 9 proposé a une boucle supérieure unique, une projection de pixels dans la partie basse et une marge de score morphologique forte. La lecture OCR initiale reste inchangée."};
    }
    return {...initial,strategy:HYBRID_STRATEGY.id,label:HYBRID_STRATEGY.label,ocrReused,value:initial.value,morphology:{ocrDigitCount:initial.digitCount,segmentationAlternatives:alternatives.map(({glyphs,...x})=>x),selectedCount:chosen?.count||null,glyphs},
      proposedCorrection,warnings:[...initial.warnings,...(!chosen?["morphology-segmentation-uncertain"]:[])]};
  }

  async function readPsm8GlyphAlignment(sourceCrop,referenceCrop,worker,digitReader,sharedInitial=null,ocrReused=false){
    const started=performance.now(),initial=sharedInitial||await read(worker,referenceCrop,ALIGNMENT_STRATEGY,{blocks:true});
    const ocrMs=initial.ms||0;
    if(!digitReader||typeof digitReader.segment!=="function")return {...initial,strategy:ALIGNMENT_STRATEGY.id,label:ALIGNMENT_STRATEGY.label,
      alignment:null,morphologyChecks:[],proposedCorrection:null,decision:"abstain",decisionRationale:"Le segmenteur de glyphes physiques est indisponible.",ocrReused,
      stageTimings:{ocrMs,segmentationMs:0,alignmentMs:0,morphologyMs:0,totalMs:Math.round(performance.now()-started)},warnings:[...initial.warnings,"morphology-segmenter-unavailable"]};
    const imageData=sourceCrop.getContext("2d",{willReadFrequently:true}).getImageData(0,0,sourceCrop.width,sourceCrop.height);
    const ocrCharacters=initial.ocrSymbols?.length===initial.digitCount?initial.ocrSymbols:initial.digits.split("").map((text,index)=>({text,confidence:null,bbox:null,index,source:"normalized-text-fallback",sharedBox:false}));
    const counts=[3,4,5,6],candidates=[];let segmentationElapsed=0,alignmentElapsed=0;
    for(const count of counts){
      const segAt=performance.now(),segmentation=digitReader.segment(imageData,"trophy",count);segmentationElapsed+=performance.now()-segAt;
      if(segmentation.reason||segmentation.glyphs?.length!==count){candidates.push({count,reason:segmentation.reason||"incomplete-segmentation",confidence:segmentation.confidence??null,
        bounds:segmentation.bounds||[],metrics:segmentation.metrics||null,alignment:null,score:0,_segmentation:null});continue;}
      const alignAt=performance.now(),alignment=alignOcrSymbolsToGlyphs(ocrCharacters,segmentation.glyphs.map((g,index)=>({index:index+1,bounds:g.rect})),
        {width:sourceCrop.width,height:sourceCrop.height,scaleX:sourceCrop.width/Math.max(1,referenceCrop.width),scaleY:sourceCrop.height/Math.max(1,referenceCrop.height)});alignmentElapsed+=performance.now()-alignAt;
      const segmentationConfidence=Number.isFinite(segmentation.confidence)?segmentation.confidence:0;
      candidates.push({count,reason:null,confidence:segmentationConfidence,bounds:segmentation.bounds||segmentation.glyphs.map(g=>g.rect),metrics:segmentation.metrics||null,
        alignment,score:Number((.68*alignment.confidence+.32*segmentationConfidence).toFixed(3)),_segmentation:segmentation});
    }
    const ranked=candidates.filter(c=>c._segmentation).sort((a,b)=>b.score-a.score),selected=ranked[0]||null;
    const candidateMargin=selected&&ranked[1]?Number((selected.score-ranked[1].score).toFixed(3)):1;
    const alignment=selected?.alignment||null,anomalies=alignment?.anomalies||[];
    const inspections=[],morphStarted=performance.now();
    if(selected&&alignment){
      for(const group of alignment.groups.filter(g=>g.relation!=="one-to-one")){
        for(const glyphRef of group.glyphs){
          const glyph=selected._segmentation.glyphs[glyphRef.index-1];if(!glyph)continue;
          inspections.push({glyphIndex:glyphRef.index,rect:glyph.rect,relation:group.relation,features:targetedMorphology(glyph.bitmap),ocrIndices:group.ocrIndices});
        }
      }
    }
    const morphologyMs=Math.round(performance.now()-morphStarted);
    let proposedCorrection=null,decision="keep-ocr",decisionRationale="OCR et segmentation ne montrent pas d’anomalie localisée; la lecture PSM 8 est conservée.";
    const manyToOne=alignment?.groups.filter(g=>g.relation==="many-ocr-to-one-glyph")||[];
    const hasOtherAnomaly=anomalies.some(a=>a.relation!=="many-ocr-to-one-glyph");
    if(!selected||!alignment){decision="abstain";decisionRationale="Aucune segmentation physique exploitable ne permet d’établir une correspondance.";}
    else if(!anomalies.length){
      if(selected.count!==initial.digitCount){decision="abstain";decisionRationale="Le nombre de glyphes et le nombre de caractères OCR divergent sans association localisée.";}
    }else if(alignment.ambiguous||!alignment.hasCoordinates){decision="abstain";decisionRationale=alignment.hasCoordinates?
      "Plusieurs alignements spatiaux restent proches; aucune suppression ou fusion de caractère n’est justifiée.":
      "Les coordonnées OCR sont absentes; l’alignement séquentiel reste une hypothèse et ne permet pas de corriger.";}
    else if(manyToOne.length!==1||hasOtherAnomaly||anomalies.length!==1){decision="abstain";decisionRationale="L’anomalie n’est pas isolée à une seule association de plusieurs caractères OCR vers un glyphe.";}
    else {
      const group=alignment.groups.find(g=>g.relation==="many-ocr-to-one-glyph"),inspection=inspections.find(g=>g.glyphIndex===group.glyphIndices[0]);
      const morph=inspection?.features,localAlignment=group?.confidence??0;
      const eligible=group.ocrIndices.length>1&&morph?.classification==="9"&&morph.confidence>=.88&&morph.margin>=.24&&
        selected.confidence>=.65&&alignment.confidence>=.76&&localAlignment>=.82&&candidateMargin>=.055&&
        group.ocrIndices.length<=3&&group.glyphIndices.length===1;
      if(eligible){
        let output="",valid=true;
        for(let i=0;i<ocrCharacters.length;){
          const current=alignment.groups.find(g=>g.ocrIndices[0]===i+1);
          if(!current){valid=false;break;}
          if(current.relation==="many-ocr-to-one-glyph"&&current===group){output+="9";i+=current.ocrIndices.length;}
          else if(current.relation==="one-to-one"&&current.ocrIndices.length===1){output+=ocrCharacters[i].text;i++;}
          else {valid=false;break;}
        }
        if(valid&&/^[0-9]{4}$/.test(output)&&output!==initial.digits){
          proposedCorrection={from:initial.digits,to:output,automatic:false,evidence:{ocrIndices:group.ocrIndices,glyphIndex:group.glyphIndices[0],
            alignmentConfidence:alignment.confidence,groupConfidence:localAlignment,morphology:morph},
            rationale:"Proposition localisée : plusieurs boîtes de caractères OCR recouvrent un seul glyphe physique; ce glyphe présente une morphologie de 9 suffisamment discriminante. Les autres caractères restent inchangés."};
          decision="propose-correction";decisionRationale=proposedCorrection.rationale;
        }else {decision="abstain";decisionRationale="La fusion morphologique ne produit pas une lecture numérique de quatre chiffres en conservant les caractères non suspects.";}
      }else {decision="abstain";decisionRationale=morph?.classification==="other"||morph?.classification==="indeterminate"?
        "Le glyphe suspect n’est pas classé comme 9 avec une confiance et une marge suffisantes; correction refusée.":
        "L’association ou la classification morphologique ne franchit pas les seuils de décision conservateurs.";}
    }
    const alignmentOutput=alignment?{...alignment,coordinateSpace:{width:sourceCrop.width,height:sourceCrop.height,inputWidth:referenceCrop.width,inputHeight:referenceCrop.height},selectedGlyphCount:selected.count,candidateScore:selected.score,candidateMargin,
      segmentationAlternatives:candidates.map(({_segmentation,...c})=>c),suspectGlyphs:inspections}:null;
    const totalMs=Math.round(performance.now()-started);
    return {...initial,strategy:ALIGNMENT_STRATEGY.id,label:ALIGNMENT_STRATEGY.label,ocrReused,value:initial.value,ms:totalMs,ocrMs,preview:referenceCrop.toDataURL("image/jpeg",.78),alignment:alignmentOutput,morphologyChecks:inspections,
      proposedCorrection,decision,decisionRationale,stageTimings:{ocrMs,segmentationMs:Math.round(segmentationElapsed),alignmentMs:Math.round(alignmentElapsed),morphologyMs,totalMs},
      warnings:[...initial.warnings,...(!alignment?["alignment-unavailable"]:[]),...(alignment&&!alignment.hasCoordinates?["ocr-symbol-coordinates-unavailable"]:[])]};
  }
  const MAX_EDGE = 4096;

  function makeCanvas(width, height) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width > MAX_EDGE || height > MAX_EDGE) {
      throw new Error("Dimensions de découpe OCR hors limites.");
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width); canvas.height = Math.round(height);
    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!context) throw new Error("Canvas indisponible pour le comparateur OCR.");
    return { canvas, context };
  }

  function grayAt(data, offset) {
    return .299 * data[offset] + .587 * data[offset + 1] + .114 * data[offset + 2];
  }

  function otsuThreshold(data) {
    const hist = new Uint32Array(256); let total = 0;
    for (let i = 0; i < data.length; i += 4) { hist[Math.max(0, Math.min(255, Math.round(grayAt(data, i))))]++; total++; }
    let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumBackground = 0, weightBackground = 0, bestVariance = -1, threshold = 128;
    for (let i = 0; i < 256; i++) {
      weightBackground += hist[i]; if (!weightBackground) continue;
      const weightForeground = total - weightBackground; if (!weightForeground) break;
      sumBackground += i * hist[i];
      const delta = sumBackground / weightBackground - (sum - sumBackground) / weightForeground;
      const variance = weightBackground * weightForeground * delta * delta;
      if (variance > bestVariance) { bestVariance = variance; threshold = i; }
    }
    return threshold;
  }

  function integralGray(data, width, height) {
    const stride = width + 1, integral = new Float64Array((width + 1) * (height + 1));
    for (let y = 1; y <= height; y++) {
      let row = 0;
      for (let x = 1; x <= width; x++) {
        row += grayAt(data, ((y - 1) * width + x - 1) * 4);
        integral[y * stride + x] = integral[(y - 1) * stride + x] + row;
      }
    }
    return integral;
  }

  function prepCanvas(source, mode, scale = 3) {
    const { canvas, context } = makeCanvas(Math.min(MAX_EDGE, source.width * scale), Math.min(1024, source.height * scale));
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    if (mode === "reference") {
      const image = context.getImageData(0, 0, canvas.width, canvas.height), data = image.data;
      for (let i = 0; i < data.length; i += 4) {
        const value = Math.max(0, Math.min(255, Math.round((grayAt(data, i) - 127.5) * 1.7 + 127.5)));
        data[i] = data[i + 1] = data[i + 2] = value;
      }
      context.putImageData(image, 0, 0);
      return canvas;
    }
    if (mode === "glyphs") return canvas;
    const image = context.getImageData(0, 0, canvas.width, canvas.height), data = image.data;
    const threshold = mode === "otsu" ? otsuThreshold(data) : null;
    const integral = mode === "adaptive" ? integralGray(data, canvas.width, canvas.height) : null;
    const stride = canvas.width + 1, radius = Math.max(3, Math.round(scale * 2));
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4, gray = grayAt(data, i); let value = gray;
      if (mode === "otsu") value = gray >= threshold ? 255 : 0;
      if (mode === "adaptive") {
        const x0 = Math.max(0, x - radius), x1 = Math.min(canvas.width, x + radius + 1);
        const y0 = Math.max(0, y - radius), y1 = Math.min(canvas.height, y + radius + 1);
        const sum = integral[y1 * stride + x1] - integral[y0 * stride + x1] - integral[y1 * stride + x0] + integral[y0 * stride + x0];
        const mean = sum / ((x1 - x0) * (y1 - y0));
        value = gray >= mean - 8 ? 255 : 0;
      }
      data[i] = data[i + 1] = data[i + 2] = Math.round(value);
    }
    context.putImageData(image, 0, 0);
    if (mode === "thin-strokes") {
      const { canvas: eroded, context: erodedContext } = makeCanvas(canvas.width, canvas.height);
      const sourceData = context.getImageData(0, 0, canvas.width, canvas.height), output = erodedContext.createImageData(canvas.width, canvas.height);
      for (let y = 1; y < canvas.height - 1; y++) for (let x = 1; x < canvas.width - 1; x++) {
        const i = (y * canvas.width + x) * 4; let value = 255;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) value = Math.min(value, sourceData.data[((y + dy) * canvas.width + x + dx) * 4]);
        output.data[i] = output.data[i + 1] = output.data[i + 2] = value; output.data[i + 3] = 255;
      }
      erodedContext.putImageData(output, 0, 0); canvas.width = canvas.height = 1; return eroded;
    }
    return canvas;
  }

  function tightCropCanvas(source, inset = .06, scale = 3) {
    const side = Math.max(1, Math.floor(source.width * inset));
    const { canvas, context } = makeCanvas(Math.min(MAX_EDGE, (source.width - side * 2) * scale), Math.min(1024, source.height * scale));
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
    context.drawImage(source, side, 0, source.width - side * 2, source.height, 0, 0, canvas.width, canvas.height);
    const image = context.getImageData(0, 0, canvas.width, canvas.height), data = image.data;
    for (let i = 0; i < data.length; i += 4) { const v = Math.max(0, Math.min(255, Math.round((grayAt(data, i) - 127.5) * 1.7 + 127.5))); data[i] = data[i + 1] = data[i + 2] = v; }
    context.putImageData(image, 0, 0); return canvas;
  }

  function normalizedRead(text) {
    const raw = String(text || "").replace(/\s+/g, " ").trim();
    const digits = raw.replace(/\D/g, "");
    return { raw, digits, value: digits.length === 4 ? digits : "", digitCount: digits.length };
  }

  function extractOcrSymbols(data) {
    const symbols = [];
    let symbolIndex = 0;
    for (const block of Array.isArray(data?.blocks) ? data.blocks : []) {
      for (const paragraph of Array.isArray(block?.paragraphs) ? block.paragraphs : []) {
        for (const line of Array.isArray(paragraph?.lines) ? paragraph.lines : []) {
          for (const word of Array.isArray(line?.words) ? line.words : []) {
            for (const symbol of Array.isArray(word?.symbols) ? word.symbols : []) {
              const text = String(symbol?.text || "");
              const bbox = symbol?.bbox && [symbol.bbox.x0, symbol.bbox.y0, symbol.bbox.x1, symbol.bbox.y1].every(Number.isFinite)
                ? { x0: symbol.bbox.x0, y0: symbol.bbox.y0, x1: symbol.bbox.x1, y1: symbol.bbox.y1 } : null;
              const chars = [...text].filter((char) => /[0-9]/.test(char));
              for (const char of chars) symbols.push({ text: char, confidence: Number.isFinite(symbol?.confidence) ? symbol.confidence : null,
                bbox, symbolIndex, sharedBox: chars.length > 1, source: "tesseract-block-symbol" });
              symbolIndex++;
            }
          }
        }
      }
    }
    return symbols;
  }

  async function read(worker, image, strategy, outputOptions = null) {
    const started = performance.now();
    await worker.setParameters({ tessedit_pageseg_mode: String(strategy.psm), preserve_interword_spaces: "1", tessedit_char_whitelist: "0123456789" });
    const output = outputOptions ? await worker.recognize(image, {}, outputOptions) : await worker.recognize(image);
    const parsed = normalizedRead(output.data?.text);
    return { strategy: strategy.id, label: strategy.label, psm: strategy.psm, preprocessing: strategy.prep, parameters: strategy.parameters,
      tesseditCharWhitelist: "0123456789", preserveInterwordSpaces: "1",
      ...parsed, confidence: Number.isFinite(output.data?.confidence) ? output.data.confidence : null,
      ...(outputOptions?.blocks ? { ocrSymbols: extractOcrSymbols(output.data) } : {}),
      ms: Math.round(performance.now() - started), warnings: parsed.digitCount === 4 ? [] : [parsed.digitCount ? "unexpected-digit-count" : "no-numeric-read"] };
  }

  function failedRead(strategy, error, ms) {
    const detail = String(error?.message || error || "OCR unavailable").slice(0, 180);
    return { strategy: strategy.id, label: strategy.label, psm: strategy.psm, preprocessing: strategy.prep, parameters: strategy.parameters,
      tesseditCharWhitelist: "0123456789", raw: "", digits: "", value: "", digitCount: 0, confidence: null, ms,
      warnings: [`strategy-error:${detail}`] };
  }

  async function readGlyphs(source, worker, digitReader) {
    const started = performance.now();
    if (!digitReader || typeof digitReader.segment !== "function") return { strategy: "glyphs", label: "Tesseract chiffre par chiffre · PSM 10", psm: 10, raw: "", digits: "", value: "", digitCount: 0, confidence: null, ms: 0, warnings: ["segmenter-unavailable"], segmentation: null };
    const imageData = source.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, source.width, source.height);
    const segmentation = digitReader.segment(imageData, "trophy", 4);
    if (segmentation.reason || segmentation.bounds?.length !== 4 || !Number.isFinite(segmentation.confidence) || segmentation.confidence < .24) {
      return { strategy: "glyphs", label: "Tesseract chiffre par chiffre · PSM 10", psm: 10, preprocessing: "color-components; 18% glyph padding; ×4; grayscale contrast 1.7", parameters: { glyphPadding: .18, scalePerGlyph: 4, grayscaleContrast: 1.7 }, tesseditCharWhitelist: "0123456789", raw: "", digits: "", value: "", digitCount: 0,
        confidence: null, ms: Math.round(performance.now() - started), warnings: [segmentation.reason || "uncertain-four-glyph-segmentation"],
        segmentation: { confidence: segmentation.confidence ?? null, bounds: segmentation.bounds || [], warnings: segmentation.warnings || [] } };
    }
    const glyphs = [];
    for (const bounds of segmentation.bounds) {
      const padX = Math.max(2, Math.ceil(bounds.height * .18)), padY = Math.max(2, Math.ceil(bounds.height * .18));
      const { canvas, context } = makeCanvas(Math.min(512, (bounds.width + padX * 2) * 4), Math.min(512, (bounds.height + padY * 2) * 4));
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
      context.drawImage(source, bounds.x, bounds.y, bounds.width, bounds.height, padX * 4, padY * 4, bounds.width * 4, bounds.height * 4);
      const prepared = prepCanvas(canvas, "reference", 1);
      try {
        const result = await read(worker, prepared, { id: "glyph", label: "Glyph · PSM 10", psm: 10, prep: "grayscale" });
        glyphs.push({ bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }, preview: prepared.toDataURL("image/jpeg", .78), ...result });
      } catch (error) {
        glyphs.push({ bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }, raw: "", digits: "", value: "", digitCount: 0, confidence: null,
          ms: 0, warnings: [`strategy-error:${String(error?.message || error).slice(0, 180)}`] });
      } finally { canvas.width = canvas.height = prepared.width = prepared.height = 1; }
    }
    const exactEach = glyphs.length === 4 && glyphs.every((item) => item.digitCount === 1);
    const digits = exactEach ? glyphs.map((item) => item.digits).join("") : "";
    const confidenceValues = glyphs.map((item) => item.confidence).filter(Number.isFinite);
    const warnings = [...(segmentation.warnings || [])];
    if (!exactEach) warnings.push("each-glyph-must-produce-one-digit");
    return { strategy: "glyphs", label: "Tesseract chiffre par chiffre · PSM 10", psm: 10, preprocessing: "color-components; 18% glyph padding; ×4; grayscale contrast 1.7", parameters: { glyphPadding: .18, scalePerGlyph: 4, grayscaleContrast: 1.7 }, tesseditCharWhitelist: "0123456789",
      raw: glyphs.map((item) => item.raw).join(" | "), digits, value: exactEach ? digits : "", digitCount: exactEach ? 4 : glyphs.reduce((sum, item) => sum + item.digitCount, 0),
      confidence: confidenceValues.length ? confidenceValues.reduce((sum, n) => sum + n, 0) / confidenceValues.length : null,
      ms: Math.round(performance.now() - started), warnings: [...new Set(warnings)], glyphs,
      segmentation: { confidence: segmentation.confidence, bounds: segmentation.bounds, warnings: segmentation.warnings || [] } };
  }

  function consensus(reads) {
    const eligible = reads.filter((item) => item?.value && item.digitCount === 4);
    const families = new Map();
    for (const item of eligible) {
      const family = item.strategy === "glyphs" ? "glyph" : item.strategy === "reference" || item.strategy === "psm8" || item.strategy === "psm13" ? "tesseract-layout" : "preprocessing";
      if (!families.has(family)) families.set(family, new Map());
      const counts = families.get(family); counts.set(item.value, (counts.get(item.value) || 0) + 1);
    }
    const votes = new Map();
    for (const counts of families.values()) {
      const rankedFamily = [...counts].sort((a, b) => b[1] - a[1]);
      const familyLeader = rankedFamily[0];
      if (familyLeader && (!rankedFamily[1] || familyLeader[1] > rankedFamily[1][1])) votes.set(familyLeader[0], (votes.get(familyLeader[0]) || 0) + 1);
    }
    const ranked = [...votes].sort((a, b) => b[1] - a[1]);
    const clear = ranked.length && ranked[0][1] >= 2 && (!ranked[1] || ranked[0][1] > ranked[1][1]);
    return { strategy: "consensus", value: clear ? ranked[0][0] : "", votes: Object.fromEntries(votes), families: [...families.keys()],
      warnings: clear ? [] : [eligible.length ? "independent-strategies-disagree" : "no-valid-four-digit-read"] };
  }

  async function compare(sourceCrop, referenceCrop, worker, digitReader, onProgress = () => {}, requestedIds = null) {
    if (!sourceCrop || !referenceCrop || !worker) throw new Error("Découpe fixe ou Worker OCR indisponible.");
    const chosen = Array.isArray(requestedIds) ? [...requestedIds.filter((item) => item && typeof item === "object" && Number.isFinite(item.psm) && typeof item.prep === "string"), ...STRATEGIES.filter((item) => requestedIds.includes(item.id)), ...(requestedIds.includes("psm8-morphology") ? [HYBRID_STRATEGY] : []), ...(requestedIds.includes(ALIGNMENT_STRATEGY.id) ? [ALIGNMENT_STRATEGY] : [])] : STRATEGIES;
    if (!chosen.length) chosen.push(STRATEGIES[0]);
    const started = performance.now(), results = [];
    const needsDetailedPsm8=chosen.some(item=>item.id===ALIGNMENT_STRATEGY.id||item.id===HYBRID_STRATEGY.id);
    const sharesDetailedPsm8=chosen.filter(item=>item.id===ALIGNMENT_STRATEGY.id||item.id===HYBRID_STRATEGY.id||(Number(item.psm)===8&&item.prep==="reference")).length>1;
    let detailedPsm8Promise=null;
    const readDetailedPsm8=(strategy=ALIGNMENT_STRATEGY)=>{
    if(!detailedPsm8Promise)detailedPsm8Promise=read(worker,referenceCrop,strategy,{text:true,blocks:true});
      return detailedPsm8Promise;
    };
    try {
      for (const [index, strategy] of chosen.entries()) {
        onProgress({ strategy: strategy.id, index: index + 1, total: chosen.length });
        if (strategy.id === "psm8-morphology") {
          try { const initial=needsDetailedPsm8?await readDetailedPsm8(strategy):null;results.push(await readPsm8Morphology(sourceCrop, referenceCrop, worker, digitReader,initial,sharesDetailedPsm8)); }
          catch (error) { results.push(failedRead(strategy, error, Math.round(performance.now() - started))); }
        } else if(strategy.id===ALIGNMENT_STRATEGY.id){
          try {const initial=await readDetailedPsm8(strategy);results.push(await readPsm8GlyphAlignment(sourceCrop,referenceCrop,worker,digitReader,initial,sharesDetailedPsm8));}
          catch(error){results.push(failedRead(strategy,error,Math.round(performance.now()-started)));}
        } else if (strategy.id === "glyphs") {
          try { results.push(await readGlyphs(sourceCrop, worker, digitReader)); }
          catch (error) { results.push(failedRead(strategy, error, Math.round(performance.now() - started))); }
        } else {
          const strategyStarted = performance.now();
          let image = null;
          try {
            image = strategy.prep === "reference" ? referenceCrop : strategy.prep === "tight-crop" ? tightCropCanvas(sourceCrop) : prepCanvas(sourceCrop, strategy.prep, 3);
            const isReferencePsm8=Number(strategy.psm)===8&&strategy.prep==="reference";
            const result = isReferencePsm8&&needsDetailedPsm8?await readDetailedPsm8(strategy):await read(worker, image, strategy);
            results.push({ ...result, ocrMs: result.ms, ms: Math.round(performance.now() - strategyStarted), preview: image.toDataURL("image/jpeg", .78) });
          } catch (error) {
            results.push(failedRead(strategy, error, Math.round(performance.now() - strategyStarted)));
          }
          finally { if (image && image !== referenceCrop) image.width = image.height = 1; }
        }
      }
      return { strategies: results, consensus: consensus(results), totalMs: Math.round(performance.now() - started) };
    } finally { /* Caller owns and releases the two frozen source crops. */ }
  }

  return { version: "0.5.0-experimental", strategies: STRATEGIES, hybridStrategy: HYBRID_STRATEGY, alignmentStrategy: ALIGNMENT_STRATEGY,
    psmModes: PSM_MODES, preprocessingModes: PREPROCESSING_MODES, buildCombinations, morphologyFeatures, targetedMorphology,
    extractOcrSymbols, alignOcrSymbolsToGlyphs, prepCanvas, normalizedRead, consensus, compare };
});
