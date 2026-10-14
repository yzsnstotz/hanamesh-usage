import test from 'node:test';
import assert from 'node:assert/strict';
import {EventStore,createUsageEvent,eventIdForSeat,signingJSON} from '../lib/core/index.js';
import {createUsageReporter} from '../lib/host/upload.js';
// These DTOs and exact bytes follow the formally appended C-USAGE v0 §2/3/11,
// not the historical api-contracts package or a simulated provider algorithm.
const deviceId='If4x36FUomFia_hUBG_SJxt77UtqvkWqWId-9H-XIbk';
async function fixture(t,{status=503,body={error:{code:'USAGE_STORAGE_UNAVAILABLE',message:'Usage storage is unavailable.',durability:'unconfirmed'}}}={}){
  t.mock.timers.enable({apis:['setTimeout']});let snapshot={schemaVersion:1,events:[],withdrawal:null,inventory:{last:null}},requests=0;
  const store=new EventStore({get:()=>snapshot,set:async next=>{snapshot=structuredClone(next);}});
  const event=createUsageEvent({deviceId,hanaRef:'@test/app',action:'use',occurredAt:new Date().toISOString(),eventId:eventIdForSeat(deviceId,'fixture','use-1'),nonce:'event_nonce_0001',signature:Buffer.alloc(64).toString('base64url'),source:'seat',sourcePlugin:'fixture',evidenceRef:'use-1'});await store.put(event);
  const core={getConsent:()=> 'granted',getDeviceId:()=>deviceId,getServerOrigin:()=> 'https://fixture.invalid',signRequest:async()=>({'x-hm-device-id':deviceId,'x-hm-timestamp':String(Date.now()),'x-hm-nonce':'fixture-new-request-nonce','x-hm-signature':'fixture-request-signature'})};
  const reporter=createUsageReporter({store,link:{get:()=>core},uploadIntervalMs:60000,uploadBatchSize:200,fetchImpl:async()=>{requests++;return new Response(JSON.stringify(body),{status});}});
  return {store,reporter,requests:()=>requests};
}
test('USAGE02-S1 event encoding matches the formal six-key UTF8 vector; optional claims do not silently enter this signature',()=>{
  const input={deviceId:'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',hanaRef:'@test/app',action:'use',occurredAt:'2026-10-14T10:00:00.000Z',eventId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',nonce:'event_nonce_0001',sourceHanaRef:'@test/source',targetRef:'registered-app',receipt:{providerId:'fixture',model:null,count:1}};
  const expected='{"deviceId":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","hanaRef":"@test/app","action":"use","occurredAt":"2026-10-14T10:00:00.000Z","eventId":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","nonce":"event_nonce_0001"}';
  assert.deepEqual(Buffer.from(signingJSON(input),'utf8'),Buffer.from(expected,'utf8'));
});
test('USAGE02-S2 unknown COMMIT remains unconfirmed and never schedules automatic resubmission',async t=>{
  const f=await fixture(t);try{f.reporter.start();assert.equal(await f.reporter.runOnce(),'unconfirmed');assert.equal(f.reporter.health().state,'unconfirmed');assert.equal(f.reporter.health().lastError,'USAGE_STORAGE_UNAVAILABLE');assert.equal(f.store.query().events[0].upload.state,'pending');const count=f.requests();t.mock.timers.tick(3600000);await f.reporter.drain();assert.equal(f.requests(),count);}finally{f.reporter.stop();}
});
test('USAGE02-S3 HTTP200 cannot legitimize a service-only pending-host-commit result',async t=>{
  const f=await fixture(t,{status:200,body:{accepted:1,duplicates:0,rejected:[],durability:'pending-host-commit'}});try{assert.equal(await f.reporter.runOnce(),'backoff');assert.equal(f.reporter.health().lastError,'UPLOAD_RESPONSE_INVALID');assert.equal(f.store.query().events[0].upload.state,'pending');}finally{f.reporter.stop();}
});
test('USAGE02-S4 an ordinary 503 without the formal unknown marker is not claimed to be unconfirmed',async t=>{
  const f=await fixture(t,{body:{error:{code:'USAGE_EVENT_HOOK_FAILED',message:'The host rejected the accepted usage events.'}}});try{assert.equal(await f.reporter.runOnce(),'backoff');assert.notEqual(f.reporter.health().state,'unconfirmed');assert.equal(f.store.query().events[0].upload.state,'pending');}finally{f.reporter.stop();}
});
test('USAGE02-S5 final DELETE count must be a number; null is not a successful zero',async t=>{
  const f=await fixture(t,{status:200,body:{deletedEvents:null}});try{assert.equal(await f.reporter.withdraw(),'backoff');assert.equal(f.store.getSnapshot().withdrawal.deletedEvents,null);assert.equal(f.store.getSnapshot().withdrawal.state,'pending');}finally{f.reporter.stop();}
});
test('USAGE02-S6 unknown DELETE COMMIT is not successful deletion and never automatically retries',async t=>{
  const f=await fixture(t);try{assert.equal(await f.reporter.withdraw(),'unconfirmed');assert.equal(f.store.getSnapshot().withdrawal.state,'unconfirmed');assert.equal(f.store.getSnapshot().withdrawal.deletedEvents,null);const count=f.requests();t.mock.timers.tick(3600000);await f.reporter.drain();assert.equal(f.requests(),count);}finally{f.reporter.stop();}
});
