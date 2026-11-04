import {sharedSettingsResponse} from './shared-settings.mjs';
import assert from 'node:assert/strict';
import {createPublicKey, createHash, verify} from 'node:crypto';
import {createCoreProviderFixture} from '@hanamesh/core/contract/fixtures';
import {mkdtempSync, mkdirSync, rmSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {core, root} from './helpers.mjs';

const load = name => import(pathToFileURL(resolve(root, `lib/host/${name}.js`)).href);
const {createUsageReporter} = await load('upload');
const {createRecordSeat} = await load('record');
const {signUsageEvent} = await load('core-link');
export const NOW = Date.parse('2026-10-15T00:00:02.000Z');
export const json = (body, status=200) => new Response(JSON.stringify(body), {status});

// SOURCE/FIXTURE only: scripted public receipts, no server dedup/database/Identity implementation.
export function deliveryFixture(t, respond, {origin='https://usage.example'}={}) {
  const parent = process.env.USAGE_CARD_TEST_TMP ?? resolve(root, '../tmp');
  mkdirSync(parent, {recursive:true});
  const dir = mkdtempSync(join(parent, 'signed-delivery-'));
  const dshHome = join(dir, 'dsh-home');
  mkdirSync(join(dshHome, 'profiles', 'j2s3'), {recursive:true});
  const provider=createCoreProviderFixture({initialConsent:'granted',serverOrigin:origin});
  const raw=Buffer.from(provider.service.getPublicKey(),'base64url');
  const publicKey=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),raw]),format:'der',type:'spki'});
  const deviceId=provider.service.getDeviceId();
  const global = {
    snapshot:{schemaVersion:1, events:[], withdrawal:null, inventory:{last:null}}, writes:0,
    get(){return structuredClone(this.snapshot);},
    async set(next){this.writes++; this.snapshot=structuredClone(next);},
  };
  const store = new core.EventStore(global, 5000, ()=>NOW);
  const requests = [], eventSignatures=[];
  // Observe raw event-signing calls; identity, consent and all signatures remain Core-owned.
  // The scripted remote scenario starts after device registration; Core's public session shape is retained.
  const service = {...provider.service,getSession:()=>({...provider.service.getSession(),registration:'registered'}),sign(bytes){eventSignatures.push(Buffer.from(bytes));return provider.service.sign(bytes);}};
  const fetchImpl = async (url, options) => {const policy=sharedSettingsResponse(url,options);if(policy)return policy;
    const request={url:new URL(url), options}; requests.push(request);
    // Independent verifier uses the actual transmitted bytes, not the candidate canonical helper.
    const h=options.headers, bytes=Buffer.from(options.body??'');
    const preimage=`${options.method}|${request.url.pathname}|${h['x-hm-timestamp']}|${h['x-hm-nonce']}|${createHash('sha256').update(bytes).digest('hex')}`;
    assert.equal(h['x-hm-device-id'],deviceId);
    assert.equal(verify(null,Buffer.from(preimage),publicKey,Buffer.from(h['x-hm-signature'],'base64url')),true,'HTTP signature covers actual sent bytes');
    if(options.method==='POST') for(const event of JSON.parse(options.body)){
      const six={deviceId:event.deviceId,hanaRef:event.hanaRef,action:event.action,occurredAt:event.occurredAt,eventId:event.eventId,nonce:event.nonce};
      assert.equal(verify(null,Buffer.from(JSON.stringify(six)),publicKey,Buffer.from(event.signature,'base64url')),true,'event signature uses the published six-key UTF8 encoding');
      assert.equal(event.deviceId,deviceId);
      assert(Object.keys(event).every(k=>['deviceId','hanaRef','action','occurredAt','eventId','nonce','signature','sourceHanaRef','targetRef','receipt'].includes(k)));
    }
    return respond(request, requests.length);
  };
  const makeReporter=(targetStore=store)=>createUsageReporter({store:targetStore,link:{get:()=>service},uploadIntervalMs:60000,uploadBatchSize:200,fetchImpl,now:()=>NOW});
  const reporter=makeReporter();
  const record=createRecordSeat({store,getConsent:service.getConsent,getDeviceId:service.getDeviceId,now:()=>NOW,signEvent:event=>signUsageEvent(service,event)});
  t.after(()=>{reporter.stop(); rmSync(dir,{recursive:true,force:true});});
  const input = key => ({hanaRef:'fixture.app',sourcePlugin:'fixture.app',action:'use',occurredAt:'2026-10-15T00:00:00.007Z',idempotencyKey:key,targetRef:'original-session',receipt:{providerId:'fixture',model:null,count:1}});
  return {dir,dshHome,store,global,service,requests,reporter,makeReporter,fetchImpl,eventSignatures,record,input,setConsent:value=>provider.setConsent(value)};
}

// Real module mount with documented host ports only. It shares the independent
// byte verifier above; neither the user entry nor its results are fabricated.
export async function mountedDeliveryFixture(t,{onRequest,onWrite,origin='https://usage.example'}={}){
  t.mock.timers.enable({apis:['setTimeout']});
  const f=deliveryFixture(t,(request,n)=>onRequest?.(request,n)??json({accepted:JSON.parse(request.options.body).length,duplicates:0,rejected:[],durability:'committed'}),{origin});
  const requests=[];
  if(onWrite){const set=f.global.set.bind(f.global);f.global.set=async next=>{await onWrite(next);await set(next);};}
  t.mock.method(globalThis,'fetch',async(url,options)=>{const policy=sharedSettingsResponse(url,options);if(policy)return policy;requests.push({method:options.method,url:String(url),headers:options.headers,body:options.body});return f.fetchImpl(url,options);});
  const ctx={loader:{entries:()=>[].values()},get:name=>name==='pluginManager'?{listBundles:async()=>[]}:undefined,on:()=>()=>{},inject:()=>({dispose:async()=>{}}),provide(){},sessions:{list:()=>[],get:()=>undefined},sessionPersistence:{list:async()=>[]}};
  let records={schemaVersion:1,records:[]};
  const {mountUsage}=await load('mount');
  const mounted=mountUsage(ctx,{global:{get:()=>records,set:async value=>{records=structuredClone(value);}},close:async()=>{}},{global:f.global,close:async()=>{}},{maxRecords:5000,maxEvents:5000,maxPending:128,allowExport:false,uploadIntervalMs:60000,uploadBatchSize:200,inventoryIntervalMs:300000,eventRetentionDays:90,queryLimit:100}, {status:()=> 'present',get:()=>f.service,onChange:()=>()=>{},close(){}});
  await mounted.ready;
  t.after(()=>mounted.close());
  return {...mounted,requests,eventSignatures:f.eventSignatures,makeReporter:f.makeReporter,requestCount:()=>f.requests.length,tickSend:()=>t.mock.timers.tick(5000),snapshot:()=>f.global.get(),setConsent:state=>f.setConsent(state)};
}
