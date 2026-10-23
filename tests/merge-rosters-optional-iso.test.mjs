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
          redStars:5,diamonds:0},
        oldchar:{power:4000,level:80,gear:18,isoMax:13,
          yellowStars:6,redStars:6,diamonds:0},
        zerochar:{power:100,level:50,gear:10,isoMax:0,
          yellowStars:3,redStars:3,diamonds:0}
      },iso:{}}
    ];
    const fresher=[
      {alliance:'poseidon',player:'A',playerKey:'a',chars:{
        oldchar:{power:5000,level:81,gear:19,
          yellowStars:6,redStars:6,diamonds:0}
      },iso:{}}
    ];
    await writeFile(join(dir,'rosters_zeus.json'),JSON.stringify(sample));
    await writeFile(join(dir,'rosters_poseidon.json'),JSON.stringify(fresher));
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
  }finally{await rm(dir,{recursive:true,force:true});}
});
