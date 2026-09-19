import { MemoryGlobal, session, root } from './helpers.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const {mountUsage}=await import(pathToFileURL(resolve(root,'lib/host/mount.js')).href);
/** Strictly a FIXTURE of the documented calls, not Cordis/Registry/DSH itself. */
export async function fixtureHost({live=true,participated=true,persisted=true,bound=true,snapshot,allowExport=false,inheritedEventCount=0,throwRead=false,consent='withheld',deviceId='device_A'}={}) {
  const input=session({inheritedEventCount}), log=[], handlers=new Map(), g=new MemoryGlobal(snapshot),eg=new MemoryGlobal({schemaVersion:1,events:[],withdrawal:null,inventory:{last:null}});
  const originalSet=g.set.bind(g);g.set=async next=>{log.push('summary.set');await originalSet(next);};
  const originalEventSet=eg.set.bind(eg);eg.set=async next=>{log.push('event.set');await originalEventSet(next);};
  const s={id:input.sessionId,header:{id:input.sessionId},inheritedEventCount, snapshotEvents:()=>structuredClone(input.events),isOwnSeq:seq=>seq>=inheritedEventCount};
  let closes=0,handleCloses=0;
  const ctx={
    on(name,fn){handlers.set(name,fn);return ()=>handlers.delete(name);},
    provide(name,value){ctx[name]=value;},
    inject(names,fn){log.push('optional-connection');return ()=>{};},
    sessions:{get:id=>live&&id===s.id?s:undefined,list:()=>live?[s]:[],flush:async()=>{log.push('source.flush');return participated;}},
    sessionPersistence:{list:async()=>[{header:s.header}],flush:async()=>{log.push('cold.flush');},open:async(id,mode)=>{
      if(mode!=='read')throw Error('UNAUTHORIZED_WRITE_HANDLE');
      log.push('source.open.read');
      return {header:s.header,inheritedEventCount, read:async(offset=0,length=Infinity)=>{log.push('source.read');if(throwRead)throw Error('sk-SYNTHETIC_ERROR_MUST_NOT_LOG');return {events:persisted?structuredClone(input.events.slice(offset,offset+length)):[]};},close:async()=>{handleCloses++;log.push('source.close');}};
    }},
  };
  const registry={readBinding:async()=>bound?input.binding:undefined};
  const domain={global:g,close:async()=>{closes++;}},eventDomain={global:eg,close:async()=>{closes++;}};
  const mounted=mountUsage(ctx,registry,domain,eventDomain,{maxRecords:5000,maxPending:128,allowExport,maxEvents:5000,uploadIntervalMs:60000,uploadBatchSize:200,inventoryIntervalMs:300000},{getConsent:()=>consent,getDeviceId:()=>deviceId,nonce:()=> 'AQIDBAUGBwgJCgsMDQ4PEA'});
  await mounted.ready;
  return {...mounted,log,g,eg,input,s,ctx,handlers,get domainCloses(){return closes;},get handleCloses(){return handleCloses;}};
}
