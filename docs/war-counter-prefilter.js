const clampByte=value=>Math.max(0,Math.min(255,Math.round(value)));

function resizeRgba(data,width,height,targetWidth,targetHeight){
  const out=new Uint8ClampedArray(targetWidth*targetHeight*4);
  for(let ty=0;ty<targetHeight;ty++)for(let tx=0;tx<targetWidth;tx++){
    const sx=Math.min(width-1,Math.floor((tx+.5)*width/targetWidth));
    const sy=Math.min(height-1,Math.floor((ty+.5)*height/targetHeight));
    const source=(sy*width+sx)*4,target=(ty*targetWidth+tx)*4;
    out[target]=data[source];out[target+1]=data[source+1];out[target+2]=data[source+2];out[target+3]=data[source+3];
  }
  return out;
}

export function signatureFromImageData(imageData){
  if(!imageData?.data||!imageData.width||!imageData.height)throw new Error('ImageData invalide.');
  const rgba32=resizeRgba(imageData.data,imageData.width,imageData.height,32,32);
  const rgba16=resizeRgba(rgba32,32,32,16,16);
  const rgba4=resizeRgba(rgba32,32,32,4,4);
  const g=[];for(let i=0;i<rgba16.length;i+=4)g.push(clampByte(.299*rgba16[i]+.587*rgba16[i+1]+.114*rgba16[i+2]));
  const c=[];for(let i=0;i<rgba4.length;i+=4)c.push(rgba4[i],rgba4[i+1],rgba4[i+2]);
  const e=[];for(let y=0;y<16;y++)for(let x=0;x<16;x++){
    const a=g[y*16+x],b=g[y*16+Math.min(15,x+1)],d=g[Math.min(15,y+1)*16+x];
    e.push(Math.min(255,Math.abs(a-b)+Math.abs(a-d)));
  }
  return{g,c,e};
}

function normalizedMae(a,b){
  if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length||!a.length)return 1;
  let total=0;for(let i=0;i<a.length;i++)total+=Math.abs(a[i]-b[i]);
  return total/(a.length*255);
}

export function signatureDistance(a,b){
  return .45*normalizedMae(a?.e,b?.e)+.35*normalizedMae(a?.g,b?.g)+.20*normalizedMae(a?.c,b?.c);
}

export function rankPortraitSignatures(variants,references,limit=20){
  if(!Array.isArray(variants)||!variants.length||!Array.isArray(references))throw new Error('Signatures invalides.');
  return references.map(reference=>{
    const score=Math.min(...variants.map(variant=>signatureDistance(variant,reference)));
    return{id:reference.id,name:reference.n||reference.name||reference.id,portraitUrl:reference.u||null,score};
  }).sort((a,b)=>a.score-b.score||a.id.localeCompare(b.id)).slice(0,Math.max(1,limit));
}

export function prefilterMetrics(slots,truth,topN=20){
  const expected=new Map((truth||[]).map(item=>[item.slot,item.characterId]));
  let evaluated=0,hits=0;
  for(const slot of slots||[]){
    const id=expected.get(slot.slot);if(!id)continue;evaluated++;
    if((slot.localCandidates||[]).slice(0,topN).some(candidate=>candidate.id===id))hits++;
  }
  return{evaluated,hits,topN};
}
