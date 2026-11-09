#!/usr/bin/env node
// Project existing GitHub archives into one append-only season history.
// This never calls Scopely or R2 and never invents absent ranks.
import fs from 'node:fs/promises';
import {HISTORY_FILE,mergeSeasonHistory,projectRankSnapshots}
  from './lib/season-history.mjs';

const read=async path=>JSON.parse(await fs.readFile(path,'utf8'));
async function main(){
  const write=process.argv.includes('--write');
  if(process.argv.some(arg=>arg!=='--write'))throw Error('Usage: [--write]');
  const base='docs/data/alliance-standings/';
  const [history,index,legacy,config]=await Promise.all([
    read(HISTORY_FILE),read(base+'index.json'),
    read(base+'guest-season-history.json'),read(base+'config.json')]);
  if(legacy.version!==1||legacy.kind!=='losp-guest-season-results'||
     !Array.isArray(legacy.results))throw Error('Invalid legacy guest archive');
  const snapshots=await Promise.all(index.snapshots.map(async entry=>{
    if(!/^snapshots\/\d{4}-\d\d-\d\dT\d{9}Z\.json$/.test(entry.file))
      throw Error('Unsafe snapshot filename');
    const row=await read(base+entry.file);
    if(row.capturedAt!==entry.capturedAt||
       row.kind!=='losp-alliance-standings-snapshot')
      throw Error('Invalid indexed snapshot');
    return row;
  }));
  const rows=[...projectRankSnapshots(index,snapshots,config.rankingSeasons),
    ...legacy.results];
  const {history:merged,added}=mergeSeasonHistory(history,rows);
  if(write&&added)await fs.writeFile(HISTORY_FILE,
    JSON.stringify(merged,null,2)+'\n');
  console.log((write?'Archived':'Dry run:'),added,
    'new alliance-season results; total',merged.results.length);
}
main().catch(error=>{console.error('Unified season history:',error.message);
  process.exitCode=1;});
