import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

test('merged rosters preserve real ISO measurements and omit unknown values',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'losproster-iso-'));
  try{
    const sample=[
      {alliance:'zeus',player:'A',playerKey:'a',chars:{
        newchar:{power:5000,level:95,gear:19,yellowStars:5,
          redStars:5,diamonds:0,abilities:{basic:4,special:3}},
        oldchar:{power:4000,level:80,gear:18,isoMax:13,
          yellowStars:6,redStars:6,diamonds:0,
          abilities:{basic:7,special:6,passive:5}},
        zerochar:{power:100,level:50,gear:10,isoMax:0,
          yellowStars:3,redStars:3,diamonds:0}
      },iso:{}}
    ];
    const fresher=[
      {alliance:'zeus',player:'A',playerKey:'a',chars:{
        oldchar:{power:5000,level:81,gear:19,
          yellowStars:6,redStars:6,diamonds:0,abilities:{special:7,ultimate:7}}
      },iso:{}}
    ];
    await writeFile(join(dir,'rosters_zeus.json'),JSON.stringify([...sample,...fresher]));
    const script=fileURLToPath(new URL('../scripts/merge-rosters.mjs',import.meta.url));
    const result=spawnSync(process.execPath,[script],{
      env:{...process.env,DATA_DIR:dir,OUT_FILE:join(dir,'rosters.json')},
      cwd:fileURLToPath(new URL('..',import.meta.url)),encoding:'utf8'
    });
    assert.equal(result.status,0,result.stderr);
    const data=JSON.parse(await readFile(join(dir,'rosters.json'),'utf8'));
    assert.equal(data.length,1);
    assert.equal(data[0].chars.newchar.power,5000);
    assert.equal(Object.hasOwn(data[0].chars.newchar,'isoMax'),false,
      'Do not fabricate ISO 0 for new characters lacking this API field');
    assert.equal(data[0].chars.oldchar.power,5000);
    assert.equal(data[0].chars.oldchar.isoMax,13,
      'A later record without ISO must preserve prior measured ISO');
    assert.equal(data[0].chars.zerochar.isoMax,0,
      'A genuine ISO value of 0 must remain distinguishable from unknown');
    assert.deepEqual(data[0].chars.oldchar.abilities,
      {basic:7,special:7,ultimate:7,passive:5},
      'Higher-power record must retain known ability levels if omitted');
    assert.deepEqual(data[0].chars.newchar.abilities,{basic:4,special:3});
    assert.equal(Object.hasOwn(data[0].chars.zerochar,'abilities'),false);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('same nickname across LoSP and two guest alliances remains independent',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'losproster-guest-'));
  try{
    const rows=[
      {alliance:'zeus',player:'Same',playerKey:'same',
        chars:{blob:{power:100,level:90}},iso:{}},
      {alliance:'endgame-revolution-red',player:'Same',playerKey:'same',
        chars:{blob:{power:200,level:100}},iso:{}},
      {alliance:'endgame-revolution-orange',player:'Same',playerKey:'same',
        chars:{blob:{power:300,level:110}},iso:{}},
    ];
    for(const row of rows)
      await writeFile(join(dir,'rosters_'+row.alliance+'.json'),JSON.stringify([row]));
    const script=fileURLToPath(new URL('../scripts/merge-rosters.mjs',import.meta.url));
    const run=spawnSync(process.execPath,[script],{
      env:{...process.env,DATA_DIR:dir,OUT_FILE:join(dir,'rosters.json')},
      cwd:fileURLToPath(new URL('..',import.meta.url)),encoding:'utf8'
    });
    assert.equal(run.status,0,run.stderr);
    const merged=JSON.parse(await readFile(join(dir,'rosters.json'),'utf8'));
    assert.equal(merged.length,3);
    const actual=new Map(merged.map(r=>[r.alliance,r.chars.blob.power]));
    for(const row of rows)assert.equal(actual.get(row.alliance),row.chars.blob.power);
  }finally{await rm(dir,{recursive:true,force:true});}
});
