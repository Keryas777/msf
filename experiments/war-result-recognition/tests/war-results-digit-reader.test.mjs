import assert from 'node:assert/strict';
await import('../../../docs/war-results-digit-reader.js');
const reader=globalThis.WarResultsDigitReader;
assert.equal(typeof reader.segment,'function');
assert.equal(typeof reader.classify,'function');

const blank={width:80,height:32,data:new Uint8ClampedArray(80*32*4)};
assert.equal(reader.segment(blank,'score',4).reason,'too-few-components');
assert.equal(reader.classify(blank,'score',4,{category:'score',prototypes:[],missingDigits:['0']}).reason,'too-few-components');
assert.equal(reader.classify(blank,'score',4,null).reason,'model-unavailable');

const rows={
  '0':['01110','10001','10011','10101','11001','10001','01110'],
  '1':['00100','01100','00100','00100','00100','00100','01110'],
  '2':['01110','10001','00001','00010','00100','01000','11111'],
  '4':['00010','00110','01010','10010','11111','00010','00010']
};
function synthetic(scale=1,margin=6){
  const unit=2, rowsTall=7*unit*scale,cell=5*unit*scale,gap=2*unit*scale;
  const width=margin*2+4*cell+3*gap,height=margin*2+rowsTall;
  const data=new Uint8ClampedArray(width*height*4);
  const order=['0','1','2','4'];
  order.forEach((digit,n)=>rows[digit].forEach((line,y)=>[...line].forEach((bit,x)=>{
    if(bit!=='1')return;
    for(let yy=0;yy<unit*scale;yy++)for(let xx=0;xx<unit*scale;xx++){
      const px=margin+n*(cell+gap)+x*unit*scale+xx,py=margin+y*unit*scale+yy,i=(py*width+px)*4;
      data[i]=250;data[i+1]=220;data[i+2]=80;data[i+3]=255;
    }
  })));
  return {width,height,data};
}
for(const [scale,margin] of [[1,6],[1,17],[2,10],[3,4]]){
  const result=reader.segment(synthetic(scale,margin),'score',4);
  assert.equal(result.glyphs.length,4,`four components after scale ${scale} and margin ${margin}`);
  assert.ok(result.bounds.every(b=>b.x>=margin),`bounds remain in source-image coordinates`);
}

function joinedGlyphFixture(){
  const width=84,height=28,data=new Uint8ClampedArray(width*height*4);
  function rect(x0,y0,w,h){for(let y=y0;y<y0+h;y++)for(let x=x0;x<x0+w;x++){const i=(y*width+x)*4;data[i]=250;data[i+1]=220;data[i+2]=80;data[i+3]=255;}}
  rect(4,7,9,14);rect(22,7,9,14);
  rect(40,7,10,14);rect(54,7,10,14);rect(50,13,4,1); // two touching glyphs with a narrow ink bridge
  return {width,height,data};
}
const joined=reader.segment(joinedGlyphFixture(),'score',4);
assert.equal(joined.glyphs.length,4,'overwide connected ink is separated at a detected low-ink valley');
assert.ok(joined.bounds[2].width<20&&joined.bounds[3].width<20,'split boxes follow the detected valley, not equal field divisions');
assert.ok(reader.segment(synthetic(1,0),'score',4).warnings.includes('glyph-touches-crop-edge'),'a clipped crop edge is surfaced as an uncertainty');

const components=reader.components(Uint8Array.from([1,1,0,0,1,1,0,0,1,1]),5,2);
assert.equal(components.length,2,'connected component count is based on ink connectivity');
console.log('War Results adaptive segmentation tests: OK');
