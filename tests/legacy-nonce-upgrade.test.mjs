import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,verify} from 'node:crypto';
import {core,root} from './fixtures/helpers.mjs';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {sharedSettingsResponse} from './fixtures/shared-settings.mjs';
const pair=generateKeyPairSync('ed25519');
const legacyNonce=byte=>Buffer.alloc(16,byte).toString('base64url');
function event(index,state='sent',byte=255){
 const row=core.createUsageEvent({deviceId:'a'.repeat(43),hanaRef:'fixture-upgrade',action:'open',occurredAt:'2026-10-01T00:00:00.000Z',eventId:`00000000-0000-4000-8000-${String(index).padStart(12,'0')}`,nonce:'new-valid-nonce',signature:null,source:'loader',sourcePlugin:null,evidenceRef:'fixture-upgrade@0.0.1'});
 row.nonce=legacyNonce(byte);delete row.receipt;
 const signed={deviceId:row.deviceId,hanaRef:row.hanaRef,action:row.action,occurredAt:row.occurredAt,eventId:row.eventId,nonce:row.nonce};
 row.signature=sign(null,Buffer.from(core.signingJSON(signed)),pair.privateKey).toString('base64url');
 row.upload={state,code:state==='rejected'?'UPLOAD_HTTP_400':null,attempts:1,sentAt:state==='sent'||state==='duplicate'?'2026-10-01T00:00:01.000Z':null};return row;
}
const snapshot=events=>({schemaVersion:1,events,withdrawal:null,inventory:{last:null}});
const signedBytes=row=>Buffer.from(core.signingJSON({deviceId:row.deviceId,hanaRef:row.hanaRef,action:row.action,occurredAt:row.occurredAt,eventId:row.eventId,nonce:row.nonce}));
test('historical sent/rejected/duplicate nonce values reopen unchanged and retain original valid signatures',()=>{
 const original=snapshot([event(1,'sent'),event(2,'rejected',248),event(3,'duplicate')]);const before=structuredClone(original);
 assert.doesNotThrow(()=>core.validateEventSnapshot(original));
 const store=new core.EventStore({get:()=>original,set:async()=>assert.fail('reading must not write')});
 assert.deepEqual(store.getSnapshot(),before);
 for(const row of store.query({limit:10}).events){const projected=core.exportEventProjection(row);assert.equal(projected.nonce,before.events.find(e=>e.eventId===row.eventId).nonce);assert.ok(verify(null,signedBytes(projected),pair.publicKey,Buffer.from(projected.signature,'base64url')));}
 assert.deepEqual(original,before);
});
test('legacy read compatibility never admits historical nonce into new event creation or wire upload',()=>{
 const old=event(1);core.validateEventSnapshot(snapshot([old]));
 assert.throws(()=>core.validateEvent(old),{code:'INVALID_USAGE_EVENT'});
 assert.throws(()=>core.wireEvent(old),{code:'INVALID_USAGE_EVENT'});
 assert.throws(()=>core.createUsageEvent({...old}),{code:'INVALID_USAGE_EVENT'});
 for(const nonce of ['_short','-not-canonical-random',legacyNonce(255)+'=',legacyNonce(255).slice(0,-1)+'x'])assert.throws(()=>core.validateEventSnapshot(snapshot([{...old,nonce}])),{code:'INVALID_USAGE_EVENT'});
 assert.throws(()=>core.validateEventSnapshot(snapshot([{...old,prompt:'must-never-be-stored'}])),{code:'INVALID_USAGE_EVENT'});
});
test('unsupported legacy pending events are retained with visible local rejection, terminal history untouched',()=>{
 const old=snapshot([event(1,'sent'),event(2,'rejected'),event(3,'pending'),event(4,'pending',248)]);const next=core.retireLegacyPendingNonces(old);
 assert.deepEqual(next.events.slice(0,2),old.events.slice(0,2));assert.deepEqual(old.events.slice(2).map(e=>e.upload.state),['pending','pending']);
 for(const row of next.events.slice(2)){assert.equal(row.upload.state,'rejected');assert.equal(row.upload.code,'LEGACY_NONCE_UNSUPPORTED');assert.equal(row.nonce,old.events.find(e=>e.eventId===row.eventId).nonce);assert.ok(verify(null,signedBytes(row),pair.publicKey,Buffer.from(row.signature,'base64url')));}
 assert.equal(core.retireLegacyPendingNonces(next),next,'idempotent no-write path');
});

test('explicit resend leaves legacy host rejection terminal and newer events still upload',async()=>{
 const {createUsageReporter}=await import(pathToFileURL(join(root,'lib/host/upload.js')).href);
 const old=event(21,'rejected');old.upload.code='USAGE_EVENT_HOST_REJECTED:FIXTURE_REASON';
 let stored=snapshot([old]),writes=0,uploads=0;
 const store=new core.EventStore({get:()=>stored,set:async value=>{writes++;stored=structuredClone(value);}});
 assert.equal(await store.reopenHostRejected([old.eventId]),0);
 assert.equal(writes,0);assert.deepEqual(store.getSnapshot().events[0],old);
 const linked={get:()=>({getConsent:()=> 'granted',getDeviceId:()=>old.deviceId,getServerOrigin:()=> 'https://usage.example',signRequest:async()=>({})})};
 const reporter=createUsageReporter({store,link:linked,uploadIntervalMs:60000,uploadBatchSize:200,now:()=>Date.parse('2026-10-01T00:01:00.000Z'),fetchImpl:async(url,options)=>{const policy=sharedSettingsResponse(url,options);if(policy)return policy;uploads++;const batch=JSON.parse(options.body);return new Response(JSON.stringify({accepted:batch.length,duplicates:0,rejected:[],durability:'committed'}),{status:200});}});
 try{
  assert.equal((await reporter.resend([old.eventId])).code,'RESEND_EVENT_UNAVAILABLE');assert.equal(uploads,0);
  const fresh=core.createUsageEvent({...old,eventId:'00000000-0000-4000-8000-000000000022',nonce:'new-valid-nonce'});await store.put(fresh);
  assert.equal(await reporter.runOnce(),'uploaded');assert.equal(uploads,1);
  assert.deepEqual(store.getSnapshot().events.find(row=>row.eventId===old.eventId),old);
  assert.equal(store.getSnapshot().events.find(row=>row.eventId===fresh.eventId).upload.state,'sent');
 }finally{reporter.stop();}
});

test('production apply waits for legacy-pending disposition durability before publishing the service',async()=>{
 const {apply}=await import(pathToFileURL(join(root,'lib/host/index.js')).href);let stored=snapshot([event(9,'pending')]),release,entered,provided=false;const begun=new Promise(r=>entered=r),barrier=new Promise(r=>release=r);const disposers=[];
 const ctx={get:()=>undefined,on:()=>()=>{},effect:async fn=>{const dispose=await fn();disposers.push(dispose);return dispose;},inject:()=>({dispose(){}}),provide(name,value){provided=true;ctx[name]=value;},loader:{entries:()=>[]},sessions:{list:()=>[]},sessionPersistence:{list:async()=>[]},storage:{domain:{open:async spec=>{const summary=spec.name==='hanamesh_usage';assert.equal(spec.global.schema.safeParse(summary?{schemaVersion:1,records:[]}:stored).success,true);return{global:{get:()=>summary?{schemaVersion:1,records:[]}:stored,set:async value=>{entered();await barrier;stored=value;}},close:async()=>{}};}}}};
 const boot=apply(ctx);await begun;assert.equal(provided,false);release();await boot;assert.equal(ctx.hanameshUsage.events().events[0].upload.code,'LEGACY_NONCE_UNSUPPORTED');for(const dispose of disposers.reverse())await dispose();
});
test('failed migration persistence rejects startup and closes both domains without publishing',async()=>{
 const {apply}=await import(pathToFileURL(join(root,'lib/host/index.js')).href);let provided=false,closed=0;const stored=snapshot([event(10,'pending')]);const ctx={get:()=>undefined,on:()=>()=>{},effect:fn=>fn(),provide(){provided=true;},storage:{domain:{open:async spec=>({global:{get:()=>spec.name==='hanamesh_usage'?{schemaVersion:1,records:[]}:stored,set:async()=>{throw Error('fixture disk unavailable');}},close:async()=>{closed++;}})}}};
 await assert.rejects(apply(ctx),/fixture disk unavailable/);assert.equal(provided,false);assert.equal(closed,2);assert.equal(stored.events[0].upload.state,'pending');
});
