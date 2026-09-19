import {resolve} from 'node:path';
import {core,record,session} from '../fixtures/helpers.mjs';
import {FileGlobal,atomicJson,readJson} from './medium.mjs';
const [mode,dir,point]=process.argv.slice(2);
const summary=resolve(dir,'summary.json'),source=resolve(dir,'source.json'),events=resolve(dir,'events.json');
async function eventGlobal(stage){
  let snapshot=await readJson(events,{schemaVersion:1,events:[],withdrawal:null,inventory:{last:null}});
  return {get:()=>snapshot,set:async next=>{await atomicJson(events,next,stage);snapshot=structuredClone(next);}};
}
function pause(label){
  if(!process.send)throw Error('IPC_REQUIRED_FOR_INJECTION');
  process.send({type:'pause',label});
  // A real OS SIGKILL must stop this process. No catch/finally/throw simulates a crash.
  return new Promise(()=>{setInterval(()=>{},1000);});
}
if(mode==='group'){
  const global=await FileGlobal.open(summary,stage=>stage===point?pause(stage):Promise.resolve());
  await new core.UsageStore(global).put(record());throw Error('INJECTION_WAS_NOT_REACHED');
}else if(mode==='event-group'){
  const global=await eventGlobal(stage=>stage===point?pause(stage):Promise.resolve());
  const declaration=record();const derived=core.deriveUsageEvent(declaration,{deviceId:'device_FIXTURE',consent:'granted',nonce:()=> 'AQIDBAUGBwgJCgsMDQ4PEA'});
  if(derived.event===null)throw Error('FIXTURE_DERIVE_FAILED');
  await new core.EventStore(global).put(derived.event);throw Error('INJECTION_WAS_NOT_REACHED');
}else if(mode==='boundary'){
  let writes=0;
  const after=async()=>{writes++;if(writes===1)await pause('between-first-and-second-durable-side');};
  const store=new core.UsageStore(await FileGlobal.open(summary));
  await core.commitAfterSource(async()=>{await atomicJson(source,session());await after();},async()=>{await store.put(record());await after();});
  throw Error('INJECTION_WAS_NOT_REACHED');
}else if(mode==='event-boundary'){
  const declaration=record();const store=new core.UsageStore(await FileGlobal.open(summary));await store.put(declaration);await pause('between-declaration-and-event');
}else if(mode==='inspect'){
  const raw=await readJson(source,null),store=new core.UsageStore(await FileGlobal.open(summary)),q=store.query(),eventStore=new core.EventStore(await eventGlobal()),eventQuery=eventStore.query();
  console.log(JSON.stringify({sourcePresent:raw!==null,summaryCount:q.total,hasIdentity:q.records.every(r=>r.eventRef===core.eventReference(r.execution.sessionId,r.execution.turn)),records:q.records,eventCount:eventQuery.total,eventIdentityComplete:eventQuery.events.every(e=>typeof e.eventId==='string'&&typeof e.nonce==='string')}));
}else if(mode==='recover'){
  const input=await readJson(source,null),store=new core.UsageStore(await FileGlobal.open(summary));
  if(input){const r=core.projectTerminal(input,input.events.at(-1));await store.put(r);await store.put(r);}
  console.log(JSON.stringify({total:store.query().total}));
}else throw Error('UNKNOWN_MODE');
