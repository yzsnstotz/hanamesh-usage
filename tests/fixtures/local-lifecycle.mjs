// Test-only host/storage/transport. No product client, service, key file or network.
import {generateKeyPairSync,createHash,sign} from 'node:crypto';
import {mountUsage} from '../../lib/host/mount.js';
export function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
export const originalFact=(overrides={})=>({hanaRef:'fixture.app',action:'use',sourcePlugin:'fixture.app',idempotencyKey:'command:original-source-operation:succeeded',occurredAt:new Date(Date.now()-1000).toISOString(),...overrides});
export function fixtureSigningIdentity(){
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  const raw=publicKey.export({format:'der',type:'spki'}).subarray(-32);
  return {deviceId:createHash('sha256').update(raw).digest('base64url'),publicKey:raw.toString('base64url'),sign:bytes=>new Uint8Array(sign(null,bytes,privateKey))};
}
export async function localLifecycle(t,{consent='granted',coreStatus='present',origin='https://fixture.invalid',onWrite,onRequest,identity=fixtureSigningIdentity(),prepareClock=true}={}){
  if(prepareClock)t.mock.timers.enable({apis:['setTimeout']});
  const {deviceId}=identity;
  const listeners=new Set(),handlers=new Map(),requests=[],signedInputs=[];
  let current=consent,events={schemaVersion:1,events:[],withdrawal:null,inventory:{last:null}},records={schemaVersion:1,records:[]},auth=0;
  const service={protocolVersion:'1',getConsent:()=>current,getDeviceId:()=>deviceId,getPublicKey:()=>identity.publicKey,sign(bytes){signedInputs.push(new Uint8Array(bytes));return identity.sign(bytes);},async signRequest(input){return {'x-hm-device-id':deviceId,'x-hm-timestamp':String(Date.now()),'x-hm-nonce':`fixture-request-${++auth}`,'x-hm-signature':'fixture-request-signature'};},getServerOrigin:()=>origin,getSession:()=>({protocolVersion:'1',deviceId,registration:'unregistered',principalId:null,bound:null,serverReachable:null,checkedAt:null,reason:null}),onConsentChange(fn){listeners.add(fn);return()=>listeners.delete(fn);}};
  t.mock.method(globalThis,'fetch',async(url,options)=>{const request={method:options.method,url:String(url),headers:options.headers,body:options.body};requests.push(request);if(onRequest)return onRequest(request);return new Response(JSON.stringify(options.method==='DELETE'?{deletedEvents:1}:{accepted:JSON.parse(options.body).length,duplicates:0,rejected:[],durability:'committed'}),{status:200});});
  const ctx={loader:{entries:()=>[].values()},get:()=>undefined,on(name,fn){handlers.set(name,fn);return()=>handlers.delete(name);},inject:()=>({dispose:async()=>{}}),provide(){},sessions:{list:()=>[],get:()=>undefined},sessionPersistence:{list:async()=>[]}};
  const link={status:()=>coreStatus,get:()=>coreStatus==='present'?service:null,onChange:()=>()=>{},close(){}};
  const mounted=mountUsage(ctx,null,{global:{get:()=>records,set:async value=>{records=structuredClone(value);}},close:async()=>{}},{global:{get:()=>events,set:async value=>{if(onWrite)await onWrite(value);events=structuredClone(value);}},close:async()=>{}},{maxRecords:5000,maxEvents:5000,maxPending:128,allowExport:false,uploadIntervalMs:60000,uploadBatchSize:200,inventoryIntervalMs:300000,panelTestSupply:{identity:false,receiver:false},eventRetentionDays:90,queryLimit:100},link);
  await mounted.ready;
  return {...mounted,requests,signedInputs,deviceId,tickSend:()=>t.mock.timers.tick(5000),setConsent(state,changedAt=new Date().toISOString()){current=state;for(const fn of listeners)fn(state,changedAt);},snapshot:()=>structuredClone(events)};
}
