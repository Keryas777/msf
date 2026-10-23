#!/usr/bin/env node
// Temporary PRIVATE diagnostic. Logs numeric aggregate information ONLY.
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createPrivateR2Reader} from './lib/private-r2-read.mjs';
import {rosterWindow,loadRosterCampaign,keyOf,resolveAlias} from './lib/roster-r2-import.mjs';
import {readMapping} from './lib/alliance-r2-history.mjs';
const counts=(map,k)=>map.set(k,(map.get(k)||0)+1);
function parse(raw){
  if(typeof raw!=='string')return null;
  const f=raw.split(',');
  if(f.length<12)return null;
  const levels=f.slice(7,12);
  if(!levels.every(s=>/^\d+$/.test(s.trim())))return null;
  const n=levels.map(Number);
  if(n.some(x=>!Number.isSafeInteger(x)||x>30))return null;
  return {levels:n,max:Math.max(...n),isoClass:f[6]};
}
const registry=JSON.parse(await readFile('docs/data/alliances.json','utf8')).filter(x=>x.active!==false);
const mapping=readMapping(process.env.LOSP_R2_ALLIANCE_MAP_JSON,registry);
const aliases=JSON.parse(await readFile('docs/data/player-aliases.json','utf8'));
const r2=createPrivateR2Reader();
const window=rosterWindow('2026-10-23','pm');
for(const alliance of ['poseidon','zeus']){
  const result=await loadRosterCampaign(r2,mapping[alliance],window);
  if(!result){console.log(JSON.stringify({alliance,verifiedCampaign:false}));continue;}
  const old=JSON.parse(execFileSync('git',['show','f4f7bca89a0e8a2a2254c0de4de9258fa996ce23^:docs/data/rosters_'+alliance+'.json'],{encoding:'utf8',maxBuffer:12*1024*1024}));
  const byPlayer=new Map(old.map(row=>[keyOf(row.playerKey||row.player),row]));
  const shapes=new Map(),lengths=new Map(),sample=[],byLength=new Map(),stats={rosters:result.records.length,characters:0,withIsoCsv:0,parseable:0,unparseable:0,withOldCsv:0,oldLess:0,oldSame:0,oldGreater:0};
  for(const member of result.records){
    const playerKey=keyOf(resolveAlias(member.name,aliases));
    const baseline=byPlayer.get(playerKey);
    for(const c of member.characters){
      stats.characters++;
      counts(shapes,c.iso8===null?'null':Array.isArray(c.iso8)?'array':typeof c.iso8);
      if(typeof c.iso8==='string'){stats.withIsoCsv++;counts(lengths,c.iso8.split(',').length);}
      const fields=typeof c.iso8==='string'?c.iso8.split(','):[];
      const n=fields.length;
      const prev=baseline?.chars?.[keyOf(c.id)];
      const row=byLength.get(n)||{total:0,validPrefix:0,knownOld:0,oldZero:0,same:0,increase:0,decrease:0,shortSamples:[]};
      byLength.set(n,row);row.total++;
      const entries=fields.slice(7);
      const validPrefix=n>=8&&n<=12&&entries.every(s=>/^\d+$/.test(s.trim()))&&
        entries.every(s=>Number.isSafeInteger(Number(s))&&Number(s)<=30);
      if(validPrefix){
        row.validPrefix++;
        const mx=Math.max(0,...entries.map(Number));
        if(prev&&Number.isSafeInteger(prev.isoMax)){
          row.knownOld++;
          if(prev.isoMax===0)row.oldZero++;
          if(mx===prev.isoMax)row.same++;
          else if(mx>prev.isoMax)row.increase++;
          else row.decrease++;
          if(n<12&&row.shortSamples.length<3)
            row.shortSamples.push({isoClass:fields[6],levels:entries.map(Number),oldIsoMax:prev.isoMax,prefixMax:mx});
        }
      }else if(prev&&Number.isSafeInteger(prev.isoMax)){
        row.knownOld++;if(prev.isoMax===0)row.oldZero++;
      }
      const p=parse(c.iso8);
      if(!p){stats.unparseable++;continue;}
      stats.parseable++;
      const prev=baseline?.chars?.[keyOf(c.id)];
      if(!prev||!Number.isSafeInteger(prev.isoMax))continue;
      stats.withOldCsv++;
      if(p.max>prev.isoMax)stats.oldLess++;
      else if(p.max===prev.isoMax)stats.oldSame++;
      else stats.oldGreater++;
      if(sample.length<12)sample.push({oldIsoMax:prev.isoMax,apiIsoMax:p.max,apiClass:p.isoClass||null,
        levels:p.levels});
    }
  }
  console.log(JSON.stringify({alliance,verifiedCampaign:true,...stats,iso8Types:Object.fromEntries(shapes),iso8CsvLengths:Object.fromEntries(lengths),byLength:Object.fromEntries(byLength),anonymousSamples:sample}));
}
