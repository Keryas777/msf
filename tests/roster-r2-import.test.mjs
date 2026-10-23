import test from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {rosterWindow,validManifestAndProgress,loadRosterCampaign,
  convertAllianceRosters,convertCharacter,keyOf,resolveAlias} from '../scripts/lib/roster-r2-import.mjs';
import {createPrivateR2Reader} from '../scripts/lib/private-r2-read.mjs';

const fp='a'.repeat(64),digest='b'.repeat(64);
const runId='01234567-89ab-cdef-0123-456789abcdef';
const day='2026-10-23',now=Date.parse('2026-10-23T18:40:00Z');
const window=rosterWindow(day,'pm');
const progress={version:1,fingerprint:fp,runId,campaign:day+'-pm',
  membershipDigest:digest,completed:1,totalEligible:1,observedMembers:2,
  selfCompleted:true,expiresAt:'2026-10-29T16:00:00Z'};
const manifest={version:1,fingerprint:fp,runId,membershipDigest:digest,
  capturedAt:'2026-10-23T17:30:00Z',expiresAt:progress.expiresAt,
  total:2,coMembers:1,observedMembers:2,includesPersonal:true};
const chars=[{id:'SpiderMan',power:3000000,level:110,gearTier:21,
  activeYellow:7,activeRed:9,iso8:{activeClass:'raider'}},
  {id:'NewCharacter',power:1000,level:50,gearTier:10,
    activeYellow:5,activeRed:5,iso8:{class:'striker'}}];
const row=(index,name,id)=>({
  version:1,kind:index==='self'?'private-staged-personal-roster':'private-staged-microbatch',
  allianceFingerprint:fp,runId,memberIndex:index,name,
  volatileMemberId:id,capturedAt:'2026-10-23T17:22:00Z',
  expiresAt:progress.expiresAt,characters:chars
});
function fixture(p=progress,m=manifest,members=[row(0,'Keryas I','volatile1'),
  row('self','Second Player','volatile2')]){
  const root='roster-batches/v1/'+fp+'/';
  const map=new Map([
    [root+'progress.json',p],[root+'latest-complete.json',m],
    [root+runId+'/member-0.json',members[0]],
    [root+runId+'/member-self.json',members[1]]
  ]);
  return {getJSON:async k=>map.get(k)||null};
}
test('roster campaign windows are strictly UTC and distinct',()=>{
  assert.equal(window.start,'2026-10-23T14:00:00.000Z');
  assert.equal(window.endExclusive,'2026-10-23T18:00:00.000Z');
  assert.equal(rosterWindow(day,'am').start,'2026-10-23T02:00:00.000Z');
  assert.throws(()=>rosterWindow('2026-02-30','am'));
  assert.throws(()=>rosterWindow(day,'invalid'));
});
test('only current completed same-campaign manifests are usable',async()=>{
  assert.equal(validManifestAndProgress(progress,manifest,fp,window,now),true);
  const good=await loadRosterCampaign(fixture(),fp,window,now);
  assert.equal(good.records.length,2);
  assert.equal(good.records[0].name,'Keryas I');
  assert.equal(good.capturedAt,manifest.capturedAt);
  assert.equal(await loadRosterCampaign(fixture({...progress,campaign:day+'-am'}),fp,window,now),null);
  assert.equal(await loadRosterCampaign(fixture({...progress,completed:0}),fp,window,now),null);
  assert.equal(await loadRosterCampaign(fixture(progress,{...manifest,runId:'0'.repeat(36)}),fp,window,now),null);
  assert.equal(await loadRosterCampaign(fixture(progress,{...manifest,observedMembers:3}),fp,window,now),null);
  const earlier={...manifest,capturedAt:'2026-10-23T05:50:00Z'};
  assert.equal(await loadRosterCampaign(fixture(progress,earlier),fp,window,now),null);
  const missing=fixture();
  missing.getJSON=async k=>k.endsWith('/member-0.json')?null:
    fixture().getJSON(k);
  assert.equal(await loadRosterCampaign(missing,fp,window,now),null);
});
test('partial or duplicated roster data refuses publication',async()=>{
  const bad=[row(0,'Keryas I','id-1'),row('self','Keryas I','id-2')];
  await assert.rejects(loadRosterCampaign(fixture(progress,manifest,bad),fp,window,now),
    /Duplicate\/ambiguous/);
  const badChar=row(0,'Keryas I','id-1');
  badChar.characters=[{id:'SpiderMan',power:-1}];
  await assert.rejects(loadRosterCampaign(fixture(progress,manifest,[badChar,
    row('self','Second','id-2')]),fp,window,now),/Invalid\/duplicate character/);
});
test('character conversion takes API stars, preserves known ISO matrix fields',()=>{
  const old={power:1,level:100,gear:20,isoMax:15,
    yellowStars:7,redStars:7,diamonds:0};
  const result=convertCharacter(chars[0],old);
  assert.equal(result.key,'spiderman');
  assert.deepEqual(result.value,{power:3000000,level:110,gear:21,
    isoMax:15,yellowStars:7,redStars:7,diamonds:2});
  assert.equal(result.isoClass,'raider');
  assert.equal(convertCharacter(chars[1],undefined),null);
  assert.equal(convertCharacter({...chars[1],isoMax:12},undefined).value.isoMax,12);
});
test('alliance transform reuses historical player keys and does not invent ISO levels',()=>{
  const prior=[{alliance:'zeus',player:'Keryas I',playerKey:'keryasi',
    chars:{spiderman:{power:100,level:100,gear:20,isoMax:15,
      yellowStars:7,redStars:7,diamonds:0}},
    iso:{spiderman:{isoClass:'striker',isoColor:'orange'}}},
    {alliance:'zeus',player:'Second Player',playerKey:'secondplayer',
      chars:{spiderman:{power:120,level:100,gear:20,isoMax:10}},
      iso:{spiderman:{isoClass:'raider',isoColor:'purple'}}}];
  const result=convertAllianceRosters('zeus',[row(0,'Keryas I','id1'),
    row('self','Second Player','id2')],prior,{aliases:{}});
  assert.equal(result.length,2);
  assert.equal(result[0].playerKey,'keryasi');
  assert.equal(result[0].chars.spiderman.power,3000000);
  assert.equal(result[0].chars.spiderman.diamonds,2);
  assert.equal(result[0].chars.spiderman.isoMax,15);
  assert.equal(result[0].iso.spiderman.isoClass,'raider');
  assert.equal(result[0].iso.spiderman.isoColor,'orange');
  assert.equal(Object.hasOwn(result[0].chars,'newcharacter'),false);
  assert.equal(result[1].chars.spiderman.isoMax,10);
  assert.equal(keyOf('Améline67'),'ameline67');
  assert.equal(keyOf('Lord Fanfan'),'lordfanfan');
});
test('R2 credentials remain in Actions, requests are signed and read-only',async()=>{
  const env={LOSP_R2_ACCOUNT_ID:'a'.repeat(32),
    LOSP_R2_ACCESS_KEY_ID:'TEST_READ_ONLY',
    LOSP_R2_SECRET_ACCESS_KEY:'FAKE_SECRET',
    LOSP_R2_BUCKET:'losp-roster-sessions'};
  let called=false;
  const reader=createPrivateR2Reader(env,async(url,options)=>{
    called=true;
    assert.equal(options.method,'GET');
    assert.ok(options.headers.Authorization.startsWith('AWS4-HMAC-SHA256'));
    assert.match(url,/roster-batches\/v1\/.*/);
    return new Response(JSON.stringify({status:'ok'}),{status:200});
  });
  assert.deepEqual(await reader.getJSON('roster-batches/v1/test.json'),{status:'ok'});
  assert.equal(called,true);
  await assert.rejects(reader.getJSON('../oauth-captains/v1/test.json'),/Unsafe/);
});

test('canonical no-op alias is not a cycle, but genuine conflicting loops still fail',()=>{
  const source=JSON.parse(readFileSync(new URL('../docs/data/player-aliases.json',import.meta.url),'utf8'));
  assert.equal(resolveAlias('⚔️Zabuza⚔️',source),'Zabuza');
  assert.equal(resolveAlias('Zabuuza',source),'Zabuza');
  assert.equal(resolveAlias('Zabuzα',source),'Zabuza');
  assert.equal(resolveAlias('Ttt!Le Fléau !!',source),'Ttt!!Le Fléau !!');
  assert.equal(resolveAlias('Zabuza',source),'Zabuza');
  assert.equal(resolveAlias('Nouveau Joueur',source),'Nouveau Joueur');
  assert.throws(()=>resolveAlias('First',{aliases:{First:'Second',Second:'First'}}),
    /Cyclic player alias/);
});
