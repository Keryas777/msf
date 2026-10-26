#!/usr/bin/env node
// WebApp-initiated pull of the existing Roster Service's completed R2 batches.
// GitHub Actions only: no OAuth, Scopely calls or public R2 endpoints.
import fs from 'node:fs/promises';
import {resolveRosterSchedule} from './lib/roster-r2-schedule.mjs';
import {createPrivateR2Reader} from './lib/private-r2-read.mjs';
import {readMapping} from './lib/alliance-r2-history.mjs';
import {rosterWindow,loadRosterCampaign,convertAllianceRosters,keyOf}
  from './lib/roster-r2-import.mjs';

async function json(path){return JSON.parse(await fs.readFile(path,'utf8'));}
function args(argv){
  let day=null,period=null,write=false,early=false,schedule=null;
  for(const arg of argv){
    if(arg==='--write')write=true;
    else if(arg==='--early')early=true;
    else if(/^--date=\d{4}-\d{2}-\d{2}$/.test(arg))day=arg.slice(7);
    else if(/^--period=(am|pm)$/.test(arg))period=arg.slice(9);
    else if(arg.startsWith('--schedule='))schedule=arg.slice('--schedule='.length);
    else throw Error('Usage: [--date=YYYY-MM-DD] [--period=am|pm] [--schedule=CRON] [--write] [--early]');
  }
  if(early&&!['17 4 * * *','47 16 * * *'].includes(schedule))
    throw Error('Early import allowed only for dedicated scheduled trigger');
  const current=new Date();
  if(schedule!==null){
    if(day!==null||period!==null)
      throw Error('Do not combine a scheduled cron with manual campaign overrides');
    const selected=resolveRosterSchedule(schedule,current);
    day=selected.day;period=selected.period;
  }else{
    day??=current.toISOString().slice(0,10);
    period??=current.getUTCHours()>=14?'pm':'am';
  }
  return {day,period,write,early};
}
async function main(){
  const {day,period,write,early}=args(process.argv.slice(2));
  const window=rosterWindow(day,period),end=Date.parse(window.endExclusive);
  // Early scheduled import is allowed only with every current-window R2
  // manifest and every roster file already fully validated below.
  if(end>Date.now()&&!early)throw Error('Current roster campaign window has not finished');
  if(end<Date.now()-6*86400000)throw Error('Campaign window exceeds R2 retention');
  const registry=(await json('docs/data/alliances.json'))
    .filter(a=>a&&a.active!==false);
  const secret=process.env.LOSP_R2_ALLIANCE_MAP_JSON;
  if(!secret)throw Error('Missing private alliance mapping');
  const fp=readMapping(secret,registry);
  const aliases=await json('docs/data/player-aliases.json');
  const r2=createPrivateR2Reader();
  const updates=new Map();
  const skipped=[];
  const existing=new Map();
  for(const alliance of registry){
    const path='docs/data/rosters_'+alliance.key+'.json';
    const rows=await json(path);
    if(!Array.isArray(rows))throw Error('Invalid prior roster for '+alliance.key);
    existing.set(alliance.key,rows);
  }
  for(const alliance of registry){
    // Never treat a staged member batch or a previous campaign as complete.
    const result=await loadRosterCampaign(r2,fp[alliance.key],window);
    if(!result){
      console.log(alliance.key+': no verified complete '+period+' campaign; keep current file');
      skipped.push(alliance.key);
      if(process.env.GITHUB_ACTIONS==='true')
        console.log('::warning title=Roster R2 partiel::'+alliance.key+
          ': aucune campagne '+day+'-'+period+' complète validée dans R2. '+
          'Le roster publié précédemment est conservé.');
      continue;
    }
    const rows=convertAllianceRosters(alliance.key,result.records,
      existing.get(alliance.key),aliases);
    if(rows.length!==result.records.length)throw Error('Unexpected roster count');
    updates.set(alliance.key,rows);
    console.log(alliance.key+': validated '+rows.length+' rosters, completed at '+
      result.capturedAt);
  }
  // Surface precisely WHY a green workflow did not refresh every alliance.
  // The GitHub run may legitimately publish 1/6 without overwriting the
  // older five; do not mistake a green check for a full synchronization.
  if(process.env.GITHUB_STEP_SUMMARY){
    const lines=[
      '## Import LoSP R2 — '+day+' / '+period.toUpperCase(),
      '',
      '**Alliances avec nouvelle campagne validée : '+
        updates.size+'/'+registry.length+'**',
      '',
      '| Alliance | Campagne du jour |',
      '|---|---|',
      ...registry.map(a=>'| '+a.key+' | '+
        (updates.has(a.key)?'✅ Nouvelle archive R2 complète':
          '⚠️ Absente ou incomplète — ancien roster conservé')+' |'),
      '',
      early&&skipped.length?'⏱️ Tentative anticipée : aucune écriture. '+
        'Une ou plusieurs alliances sont encore en collecte ; les anciens fichiers restent inchangés.':
        skipped.length?'⚠️ Import partiel : '+skipped.length+
        ' alliance(s) sans campagne complète dans R2.':'✅ Toutes les alliances actualisées.',
      ''
    ];
    try{await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,lines.join('\n'));}
    catch{console.error('Could not write optional GitHub Actions summary');}
  }
  if(early&&updates.size!==registry.length){
    console.log('Early R2 check: '+updates.size+'/'+registry.length+
      ' alliances complete; no publication until all are verified. '+
      'Later schedules will retry.');
    if(process.env.GITHUB_ACTIONS==='true')
      console.log('::notice title=Attente des rosters R2::'+
        'Collecte encore en cours ('+updates.size+'/'+registry.length+
        '). Aucun fichier publié par cette tentative anticipée.');
    return;
  }
  if(!updates.size)throw Error('No complete and current R2 roster campaign');
  // Reject duplicates even across a mix of updated and retained alliances.
  const global=new Map();
  for(const alliance of registry){
    for(const player of updates.get(alliance.key)||existing.get(alliance.key)){
      const key=keyOf(player.playerKey||player.player);
      if(!key||global.has(key))
        throw Error('Duplicate/ambiguous cross-alliance player: '+key);
      global.set(key,alliance.key);
    }
  }
  console.log('Verified '+updates.size+' of '+registry.length+' alliances; '+
    'other rosters remain untouched.');
  if(!write){console.log('Dry run: no roster files written');return;}
  if(process.env.LOSP_R2_ROSTERS_PUBLICATION_APPROVED!=='true')
    throw Error('Roster import publication disabled pending permissions review');
  // All validation completes before the first write. Write only approved
  // alliance files. The existing merge-rosters.mjs creates rosters.json.
  for(const [key,rows] of updates){
    await fs.writeFile('docs/data/rosters_'+key+'.json',
      JSON.stringify(rows,null,2)+'\n');
  }
}
main().catch(e=>{console.error('Private R2 roster importer:',e.message);process.exitCode=1;});
