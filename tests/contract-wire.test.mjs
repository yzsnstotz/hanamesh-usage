import test from 'node:test';
import assert from 'node:assert/strict';
import {createUsageEvent, wireEvent} from '../lib/core/index.js';
const input = overrides => ({deviceId:'If4x36FUomFia_hUBG_SJxt77UtqvkWqWId-9H-XIbk',hanaRef:'sample-plugin',action:'use',
  occurredAt:'2026-10-08T00:00:00.000Z',eventId:'0f8fad5b-d9cb-469f-a165-70867728950e',
  nonce:'nFixtureNonce0001',signature:null,source:'seat',sourcePlugin:'sample-plugin',evidenceRef:'use:1',...overrides});
test('published event nonce is a token, independent of the producer entropy encoding',()=>{
  assert.equal(wireEvent(createUsageEvent(input({}))).nonce,'nFixtureNonce0001');
});
test('local stub device ids cannot enter the public wire event',()=>{
  const event=createUsageEvent(input({deviceId:'device_P2_STANDIN',nonce:'nAQIDBAUGBwgJCgsMDQ4PEA'}));
  assert.throws(()=>wireEvent(event),{code:'INVALID_USAGE_EVENT'});
});

test('mixed signed batch with a local stub sends nothing and keeps every event pending',async()=>{
  const {EventStore}=await import('../lib/core/index.js');
  const {createUsageReporter}=await import('../lib/host/upload.js');
  let writes=0;let snapshot={schemaVersion:1,events:[],withdrawal:null,inventory:{last:null}};
  const store=new EventStore({get:()=>snapshot,set:async next=>{writes++;snapshot=structuredClone(next);}});
  const signature=Buffer.alloc(64).toString('base64url');
  await store.put(createUsageEvent(input({signature})));
  await store.put(createUsageEvent(input({deviceId:'device_P2_STANDIN',eventId:'7c9e6679-7425-40de-944b-e07fc1f90ae7',signature})));
  let signatures=0,requests=0;
  const reporter=createUsageReporter({store,link:{get:()=>({getConsent:()=> 'granted',getServerOrigin:()=> 'https://usage.example',
    signRequest:async()=>{signatures++;return {};}})},uploadIntervalMs:60000,uploadBatchSize:200,
    fetchImpl:async()=>{requests++;throw new Error('MUST_NOT_SEND');}});
  const before=writes;assert.equal(await reporter.runOnce(),'stopped');assert.equal(writes,before);
  reporter.stop();
  assert.equal(signatures,0);assert.equal(requests,0);
  assert.equal(reporter.health().lastError,'UPLOAD_EVENT_INVALID');
  assert.deepEqual(store.query().events.map(event=>event.upload.state),['pending','pending']);
});
