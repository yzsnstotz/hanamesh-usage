import {sharedSettingsResponse} from './shared-settings.mjs';
// Test-only host/storage/transport. No product client, service, key file or network.
import {createCoreProviderFixture} from '@hanamesh/core/contract/fixtures';
import {mountUsage} from '../../lib/host/mount.js';
export function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
export const originalFact=(overrides={})=>({hanaRef:'fixture.app',action:'use',sourcePlugin:'fixture.app',idempotencyKey:'command:original-source-operation:succeeded',occurredAt:new Date(Date.now()-1000).toISOString(),...overrides});
export async function localLifecycle(t,{consent='granted',coreStatus='present',origin='https://fixture.invalid',onWrite,onRequest,provider=createCoreProviderFixture({initialConsent:consent,serverOrigin:origin}),prepareClock=true}={}){
  if(prepareClock)t.mock.timers.enable({apis:['setTimeout']});
  const deviceId=provider.service.getDeviceId();
  const handlers=new Map(),requests=[],signedInputs=[];
  let events={schemaVersion:1,events:[],withdrawal:null,inventory:{last:null}},records={schemaVersion:1,records:[]};
  // Script only the registered observation; Core supplies the identity, consent and signatures.
  const service={...provider.service,getSession:()=>({...provider.service.getSession(),registration:'registered'}),sign(bytes){signedInputs.push(new Uint8Array(bytes));return provider.service.sign(bytes);}};
  t.mock.method(globalThis,'fetch',async(url,options)=>{const policy=sharedSettingsResponse(url,options);if(policy)return policy;const request={method:options.method,url:String(url),headers:options.headers,body:options.body};requests.push(request);if(onRequest)return onRequest(request);return new Response(JSON.stringify(options.method==='DELETE'?{deletedEvents:1}:{accepted:JSON.parse(options.body).length,duplicates:0,rejected:[],durability:'committed'}),{status:200});});
  const ctx={loader:{entries:()=>[].values()},get:name=>name==='pluginManager'?{listBundles:async()=>[]}:undefined,on(name,fn){handlers.set(name,fn);return()=>handlers.delete(name);},inject:()=>({dispose:async()=>{}}),provide(){},sessions:{list:()=>[],get:()=>undefined},sessionPersistence:{list:async()=>[]}};
  const link={status:()=>coreStatus,get:()=>coreStatus==='present'?service:null,onChange:()=>()=>{},close(){}};
  const mounted=mountUsage(ctx,{global:{get:()=>records,set:async value=>{records=structuredClone(value);}},close:async()=>{}},{global:{get:()=>events,set:async value=>{if(onWrite)await onWrite(value);events=structuredClone(value);}},close:async()=>{}},{maxRecords:5000,maxEvents:5000,maxPending:128,allowExport:false,uploadIntervalMs:60000,uploadBatchSize:200,inventoryIntervalMs:300000,eventRetentionDays:90,queryLimit:100},link);
  await mounted.ready;
  return {...mounted,requests,signedInputs,deviceId,tickSend:()=>t.mock.timers.tick(5000),setConsent:state=>provider.setConsent(state),snapshot:()=>structuredClone(events)};
}
