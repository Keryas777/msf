// GitHub Actions schedules can start much later than their nominal time.
// Identify the roster campaign from the scheduled cron, never from the
// runner's actual clock hour. No network calls or access to private R2.
const TIMES=Object.freeze({
  "17 4 * * *":{period:"am",hour:4,minute:17}, // early if all manifests are complete
  "47 16 * * *":{period:"pm",hour:16,minute:47}, // early if all manifests are complete
  "40 6 * * *":{period:"am",hour:6,minute:40},
  "47 7 * * *":{period:"am",hour:6,minute:40}, // bounded backup
  "17 10 * * *":{period:"am",hour:6,minute:40}, // later AM recovery
  "40 18 * * *":{period:"pm",hour:18,minute:40},
  "47 19 * * *":{period:"pm",hour:18,minute:40}, // bounded backup
  "17 21 * * *":{period:"pm",hour:18,minute:40}, // later PM recovery
  "23 0 * * *":{period:"pm",hour:0,minute:23,previousDay:true} // after UTC midnight
});
export function resolveRosterSchedule(cron,now=new Date()){
  const item=Object.hasOwn(TIMES,cron)?TIMES[cron]:null;
  if(!item||!(now instanceof Date)||!Number.isFinite(now.getTime()))
    throw Error("Unsupported or invalid R2 roster scheduled event");
  // Anchored to the primary window: if a GitHub run is delayed beyond UTC
  // midnight, the PM window still belongs to the previous UTC collection day.
  const occurrence=new Date(Date.UTC(now.getUTCFullYear(),
    now.getUTCMonth(),now.getUTCDate(),item.hour,item.minute));
  if(now<occurrence)occurrence.setUTCDate(occurrence.getUTCDate()-1);
  // The 00:23 UTC safety net belongs to the previous day's PM campaign.
  // The cron expression, rather than the runner's current hour, selects it.
  if(item.previousDay===true)occurrence.setUTCDate(occurrence.getUTCDate()-1);
  return {day:occurrence.toISOString().slice(0,10),period:item.period};
}
