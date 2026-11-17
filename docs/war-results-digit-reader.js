/* Experimental, local-only glyph segmenter/classifier for MSF war results. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WarResultsDigitReader = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const W = 20, H = 24;

  function ink(r, g, b, category) {
    if (category === "score") return r > 125 && g > 105 && b < 190 && r > b * 1.12 && g > b * .95;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    return max > 145 && min > 105 && max - min < 115 && b >= r * .76 && r >= g * .62;
  }

  function foreground(imageData, category) {
    const {width,height,data}=imageData, mask=new Uint8Array(width*height);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=(y*width+x)*4; mask[y*width+x]=ink(data[i],data[i+1],data[i+2],category)?1:0;
    }
    return mask;
  }

  function components(mask,width,height) {
    const seen=new Uint8Array(mask.length),out=[],stack=[];
    for(let start=0;start<mask.length;start++){
      if(!mask[start]||seen[start])continue;
      let minX=width,minY=height,maxX=-1,maxY=-1,area=0;
      stack.push(start);seen[start]=1;
      while(stack.length){
        const at=stack.pop(),x=at%width,y=(at-x)/width; area++;
        minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
          if(!dx&&!dy)continue;const nx=x+dx,ny=y+dy;
          if(nx<0||nx>=width||ny<0||ny>=height)continue;
          const n=ny*width+nx;if(mask[n]&&!seen[n]){seen[n]=1;stack.push(n);}
        }
      }
      out.push({x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1,area});
    }
    return out;
  }

  function median(values){if(!values.length)return 0;const a=[...values].sort((x,y)=>x-y);return a[Math.floor(a.length/2)];}
  function splitWideComponents(mask,width,components){
    const out=[];
    for(const c of components){
      if(c.width/Math.max(1,c.height)<1.35){out.push(c);continue;}
      const projection=[];let peak=0;
      for(let x=c.x;x<c.x+c.width;x++){let n=0;for(let y=c.y;y<c.y+c.height;y++)n+=mask[y*width+x];projection.push(n);peak=Math.max(peak,n);}
      let cut=-1,val=Infinity;const lo=Math.ceil(c.width*.24),hi=Math.floor(c.width*.76);
      for(let x=lo;x<=hi;x++)if(projection[x]<val){val=projection[x];cut=x;}
      if(cut<0||val>Math.max(1,peak*.68)||cut<c.height*.22||c.width-cut<c.height*.22){out.push(c);continue;}
      for(const [start,end] of [[0,cut],[cut,c.width]]){
        let minY=c.y+c.height,maxY=c.y-1,area=0;
        for(let x=c.x+start;x<c.x+end;x++)for(let y=c.y;y<c.y+c.height;y++)if(mask[y*width+x]){minY=Math.min(minY,y);maxY=Math.max(maxY,y);area++;}
        if(area>=Math.max(5,c.height*.12)&&maxY>=minY)out.push({x:c.x+start,y:minY,width:end-start,height:maxY-minY+1,area,splitFrom:{x:c.x,y:c.y,width:c.width,height:c.height}});
      }
    }
    return out;
  }
  function normalize(mask,width,height){
    let minX=width,minY=height,maxX=-1,maxY=-1;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(mask[y*width+x]){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
    if(maxX<minX)return null;
    const bw=maxX-minX+1,bh=maxY-minY+1,scale=Math.min((W-4)/bw,(H-4)/bh),rw=Math.max(1,Math.round(bw*scale)),rh=Math.max(1,Math.round(bh*scale));
    const ox=Math.floor((W-rw)/2),oy=Math.floor((H-rh)/2),out=new Uint8Array(W*H);
    for(let y=0;y<rh;y++)for(let x=0;x<rw;x++){const sx=minX+Math.min(bw-1,Math.floor(x/scale)),sy=minY+Math.min(bh-1,Math.floor(y/scale));out[(oy+y)*W+ox+x]=mask[sy*width+sx]?1:0;}
    return out;
  }

  /*
   * Find a coherent horizontal run of connected glyph components. Component
   * boundaries come from actual color-mask connectivity; they are not evenly
   * divided. Enumerating runs lets the icon/bracket/noise in a crop be rejected.
   */
  function segment(imageData, category, count) {
    const {width,height}=imageData||{};
    if(!width||!height||!Number.isInteger(count)||count<1)return {glyphs:[],reason:"invalid-input",components:[]};
    const mask=foreground(imageData,category),rawComponents=components(mask,width,height),all=splitWideComponents(mask,width,rawComponents);
    const substantial=all.filter(c=>c.area>=Math.max(8,height*.22)&&c.height>=height*.18&&c.width<=c.height*1.8);
    if(substantial.length<count)return {glyphs:[],reason:"too-few-components",components:all};
    const heights=substantial.map(c=>c.height),refH=median(heights);
    // Keep glyph-sized components; cup icons and small highlights often have
    // different baselines/heights, while broken glyph fragments can still join
    // the run when their position and vertical extent agree.
    const candidates=substantial.filter(c=>c.height>=Math.max(height*.17,refH*.48)&&c.height<=refH*1.65)
      .sort((a,b)=>a.x-b.x||a.y-b.y);
    let best=null;
    for(let start=0;start+count<=candidates.length;start++){
      const run=candidates.slice(start,start+count),left=run[0].x,right=Math.max(...run.map(c=>c.x+c.width));
      const hs=run.map(c=>c.height),tops=run.map(c=>c.y),bottoms=run.map(c=>c.y+c.height),areas=run.map(c=>c.area);
      const hmed=median(hs),baseMed=median(bottoms),topMed=median(tops);
      const hVar=hs.reduce((s,h)=>s+Math.abs(h-hmed)/Math.max(1,hmed),0)/count;
      const baseline=bottoms.reduce((s,b)=>s+Math.abs(b-baseMed)/Math.max(1,hmed),0)/count;
      const topVar=tops.reduce((s,t)=>s+Math.abs(t-topMed)/Math.max(1,hmed),0)/count;
      const span=right-left,perChar=span/count/Math.max(1,hmed);
      const gaps=[];for(let i=1;i<run.length;i++)gaps.push(run[i].x-(run[i-1].x+run[i-1].width));
      const gapVar=gaps.length?gaps.reduce((s,g)=>s+Math.abs(g-median(gaps))/Math.max(1,hmed),0)/gaps.length:0;
      const totalArea=areas.reduce((s,a)=>s+a,0),areaPerHeight=totalArea/(count*hmed*hmed);
      // Penalize implausible width, inconsistent baselines, and irregular runs;
      // prefer dense, tall components without imposing a fixed glyph width.
      const widthPenalty=Math.max(0,.5-perChar,perChar-1.55);
      const score=2.2*hVar+1.8*baseline+1.0*topVar+.5*gapVar+.45*widthPenalty-.12*Math.log1p(totalArea)-.38*Math.min(areaPerHeight,1.8);
      if(!best||score<best.score)best={run,score,confidence:Math.max(0,Math.min(1,1-score)),metrics:{heightVariation:hVar,baselineVariation:baseline,spacingVariation:gapVar,meanWidthRatio:perChar}};
    }
    if(!best||best.confidence<.24)return {glyphs:[],reason:"ambiguous-component-run",confidence:best?.confidence??0,components:all,candidates};
    const glyphs=best.run.map(c=>{
      const cell=new Uint8Array(c.width*c.height);
      for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)cell[y*c.width+x]=mask[(c.y+y)*width+c.x+x];
      return {bitmap:normalize(cell,c.width,c.height),rect:{x:c.x,y:c.y,width:c.width,height:c.height},area:c.area};
    });
    const bounds=best.run.map(c=>({x:c.x,y:c.y,width:c.width,height:c.height,area:c.area}));
    const warnings=bounds.some(b=>b.x===0||b.y===0||b.x+b.width>=width||b.y+b.height>=height)?["glyph-touches-crop-edge"]:[];
    return {glyphs,reason:null,warnings,confidence:best.confidence,metrics:best.metrics,components:all,candidates,bounds};
  }

  function similarity(a,b){
    // Dice overlap rewards foreground shape and ignores the large shared blank
    // background that made binary pixel accuracy misleading. Small translations
    // absorb antialiasing and one-pixel normalization differences.
    let best=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      let intersection=0,ac=0,bc=0;
      for(let y=0;y<H;y++)for(let x=0;x<W;x++){
        const av=a[y*W+x];if(av)ac++;
        const xx=x-dx,yy=y-dy,bv=xx>=0&&xx<W&&yy>=0&&yy<H?b[yy*W+xx]:0;
        if(bv)bc++;if(av&&bv)intersection++;
      }
      const dice=(2*intersection)/(ac+bc||1);if(dice>best)best=dice;
    }
    return best;
  }
  function classify(imageData,category,count,model,options={}){
    const segmented=segment(imageData,category,count),digits=[],threshold=Number(options.threshold??.79),marginMin=Number(options.margin??.035);
    if(!model||model.category!==category||!Array.isArray(model.prototypes))return {value:null,reason:"model-unavailable",digits:[],segmentation:segmented};
    if(segmented.glyphs.length!==count)return {value:null,reason:segmented.reason||"glyph-segmentation",digits:[],segmentation:segmented};
    for(const glyph of segmented.glyphs){
      const vector=glyph.bitmap;
      const ranked=model.prototypes.map(p=>({digit:String(p.digit),score:Math.max(...p.samples.map(s=>similarity(vector,s.bitmap)))})).sort((a,b)=>b.score-a.score);
      const margin=ranked[0].score-(ranked[1]?.score??0);digits.push({digit:ranked[0].digit,score:ranked[0].score,margin,top:ranked.slice(0,3)});
    }
    const minScore=Math.min(...digits.map(d=>d.score)),minMargin=Math.min(...digits.map(d=>d.margin));
    if(segmented.warnings?.length)return {value:null,candidate:digits.map(d=>d.digit).join(""),reason:segmented.warnings[0],minScore,minMargin,digits,segmentation:segmented};
    if(model.missingDigits?.length)return {value:null,candidate:digits.map(d=>d.digit).join(""),reason:"incomplete-class-set",missingDigits:model.missingDigits,minScore,minMargin,digits,segmentation:segmented};
    if(minScore<threshold)return {value:null,reason:"low-similarity",minScore,minMargin,digits,segmentation:segmented};
    if(minMargin<marginMin)return {value:null,reason:"ambiguous-glyph",minScore,minMargin,digits,segmentation:segmented};
    return {value:digits.map(d=>d.digit).join(""),reason:null,minScore,minMargin,digits,segmentation:segmented};
  }
  return {version:"0.2.0-experimental",foreground,components,segment,classify};
});
