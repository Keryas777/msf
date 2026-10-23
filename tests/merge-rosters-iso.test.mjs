import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

test('merge-rosters never invents ISO level zero for a newly collected API character',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'losp-roster-iso-'));
  try{
    const rows=[
      {player:'New Player',playerKey:'newplayer',alliance:'zeus',chars:{
        newcharacter:{power:1200,level:51,gear:10,yellowStars:5,redStars:5,diamonds:0},
        existing:{power:1800,level:61,gear:12,isoMax:15,yellowStars:6,redStars:6,diamonds:0},
        noiso:{power:900,level:40,gear:8,yellowStars:4,redStars:4,diamonds:0},
        untrained:{power:500,level:30,gear:6,isoMax:0,yellowStars:3,redStars:0,diamonds:0}
      },iso:{}}
    ];
    writeFileSync(path.join(dir,'rosters_zeus.json'),JSON.stringify(rows));
    const dest=path.join(dir,'combined.json');
    execFileSync(process.execPath,['scripts/merge-rosters.mjs'],{
      cwd:new URL('..',import.meta.url),
      env:{...process.env,DATA_DIR:dir,OUT_FILE:dest},
      encoding:'utf8'
    });
    const merged=JSON.parse(readFileSync(dest,'utf8'));
    assert.equal(merged.length,1);
    const chars=merged[0].chars;
    assert.equal(chars.newcharacter.power,1200);
    assert.equal(Object.hasOwn(chars.newcharacter,'isoMax'),false);
    assert.equal(chars.existing.isoMax,15);
    assert.equal(Object.hasOwn(chars.noiso,'isoMax'),false);
    assert.equal(chars.untrained.isoMax,0,
      'An explicitly reported ISO zero must remain valid');
  }finally{rmSync(dir,{recursive:true,force:true});}
});
