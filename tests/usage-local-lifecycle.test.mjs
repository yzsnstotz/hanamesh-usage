import {createCoreProviderFixture} from '@hanamesh/core/contract/fixtures';
import test from 'node:test';
import assert from 'node:assert/strict';
import {localLifecycle,originalFact,deferred} from './fixtures/local-lifecycle.mjs';
import {fixtureHost} from './fixtures/host.mjs';

// Proposed C-USAGE-LOCAL addition, not an already-published cross-module API.
// Pre-existing locked tests stay unchanged; these review-stage proposals follow Q-364.
function observationPort(api){assert.equal(typeof api.observeCollection,'function','review proposal requires an explicit collection barrier; pending=0 is not completion');}
test('USAGE02-R1 four-field replay uses the persisted original fact and never fabricates a new occurredAt',async t=>{
  const h=await localLifecycle(t);
  try{const fact=originalFact(),first=await h.api.record(fact),before=h.snapshot();assert.equal(first.disposition,'recorded');const {occurredAt,...fourFields}=fact;assert.deepEqual(await h.api.record(fourFields),{disposition:'duplicate',eventId:first.eventId});assert.deepEqual(h.snapshot(),before);}finally{await h.close();}
});
test('USAGE02-R2 a new four-field fact without original time is a bounded gap with no write/sign/upload',async t=>{
  const h=await localLifecycle(t);
  try{const {occurredAt,...input}=originalFact();assert.deepEqual(await h.api.record(input),{disposition:'rejected',code:'FACT_TIME_UNAVAILABLE'});assert.equal(h.snapshot().events.length,0);assert.equal(h.signedInputs.length,0);assert.equal(h.requests.length,0);}finally{await h.close();}
});
test('USAGE02-R3 original time and attribution survive duplicate delivery; changed facts conflict; separate executions stay separate',async t=>{
  const h=await localLifecycle(t);
  try{const fact=originalFact({sourceHanaRef:'fixture.source',targetRef:'original-operation',receipt:{providerId:'fixture',model:null,count:1}});const first=await h.api.record(fact);assert.equal(first.disposition,'recorded');assert.deepEqual(await h.api.record(structuredClone(fact)),{disposition:'duplicate',eventId:first.eventId});
    for(const change of [{hanaRef:'other.app'},{action:'open',receipt:null},{occurredAt:new Date(Date.parse(fact.occurredAt)+1).toISOString()},{sourceHanaRef:'other.source'},{targetRef:'other-operation'},{receipt:{...fact.receipt,count:2}}])assert.deepEqual(await h.api.record({...fact,...change}),{disposition:'rejected',code:'EVENT_IDENTITY_CONFLICT'});
    const second=await h.api.record({...fact,idempotencyKey:'command:second-real-operation:succeeded'});assert.equal(second.disposition,'recorded');assert.notEqual(second.eventId,first.eventId);assert.equal(h.snapshot().events.length,2);assert.equal(h.snapshot().events[0].occurredAt,fact.occurredAt);
  }finally{await h.close();}
});
test('USAGE02-R4 health preserves the full existing no-argument public shape across Core absent/incompatible/present',async()=>{
  for(const coreStatus of ['absent','incompatible','present']){const h=await fixtureHost({bound:false,coreStatus});try{const health=h.api.health();assert.deepEqual(Object.keys(health),['pending','recoveryComplete','failures','consent','core','deviceId','outbox','withdrawal','inventory','filtered']);assert.equal(health.core,coreStatus);assert.equal(health.consent,coreStatus==='present'?'withheld':'unknown');assert.deepEqual(Object.keys(health.outbox),['state','pending','sent','duplicate','rejected','lastUploadAt','nextAttemptAt','lastError','uploadIntervalMs','settings']);assert.equal(health.withdrawal,null);}finally{await h.close();}}
});
test('USAGE02-R5 two independent clients propagate one source fact unchanged under one shared signing handle',async t=>{
  const provider=createCoreProviderFixture({initialConsent:'granted',serverOrigin:'https://fixture.invalid'}),a=await localLifecycle(t,{provider}),b=await localLifecycle(t,{provider,prepareClock:false});
  try{const fact=originalFact(),first=await a.api.record(fact),second=await b.api.record(structuredClone(fact));assert.equal(first.disposition,'recorded');assert.deepEqual(second,first);assert.equal(a.deviceId,b.deviceId);assert.deepEqual(a.snapshot().events,b.snapshot().events);assert.notEqual(a.snapshot().events,b.snapshot().events);assert.deepEqual(a.signedInputs,b.signedInputs);assert.equal(a.snapshot().events[0].occurredAt,fact.occurredAt);}finally{await a.close();await b.close();}
});
test('USAGE02-R6 explicit withheld consent records nothing and the pending observer contract cannot authorize collection',async t=>{
  const h=await localLifecycle(t,{consent:'withheld'});
  try{assert.deepEqual(await h.api.record(originalFact()),{disposition:'withheld'});assert.equal(h.snapshot().events.length,0);assert.equal(h.signedInputs.length,0);assert.equal(h.requests.length,0);}finally{await h.close();}
});
for(const coreStatus of ['absent','incompatible'])test(`USAGE02-R7 ${coreStatus} Core is not misreported as user withholding consent`,async t=>{
  const h=await localLifecycle(t,{coreStatus});
  try{assert.deepEqual(await h.api.record(originalFact()),{disposition:'rejected',code:'CORE_UNAVAILABLE'});assert.equal(h.snapshot().events.length,0);assert.equal(h.requests.length,0);}finally{await h.close();}
});
test('USAGE02-R8 health after release raises only the documented bounded unavailable code',async t=>{
  const h=await localLifecycle(t);
  try{await h.close();assert.throws(()=>h.api.health(),{code:'USAGE_UNAVAILABLE'});}finally{await h.close();}
});
test('USAGE02-R9 used package, collector plugin and registered app remain three distinct declared facts',async t=>{
  const h=await localLifecycle(t);
  try{const input=originalFact({hanaRef:'fixture.ordinary-package',sourcePlugin:'@hanamesh/dsh-app-host',targetRef:'registered-app-1',sourceHanaRef:'fixture.source',receipt:{providerId:'fixture',model:null,count:1}});assert.equal((await h.api.record(input)).disposition,'recorded');const event=h.snapshot().events[0];assert.equal(event.hanaRef,input.hanaRef);assert.equal(event.sourcePlugin,input.sourcePlugin);assert.equal(event.targetRef,input.targetRef);assert.equal(event.sourceHanaRef,input.sourceHanaRef);assert.notEqual(event.hanaRef,event.targetRef);assert.notEqual(event.sourcePlugin,event.hanaRef);assert.equal(event.occurredAt,input.occurredAt);
    for(const extra of [{itemId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},{appId:'registered-app-1'},{packageName:'another-package'}])assert.deepEqual(await h.api.record({...input,...extra}),{disposition:'rejected',code:'INVALID_RECORD_INPUT'});
  }finally{await h.close();}
});
test('USAGE02-C1 observation is separate from health and does not mistake an empty session queue for completed record persistence',async t=>{
  const entered=deferred(),release=deferred();const h=await localLifecycle(t,{onWrite:async next=>{if(next.events.length){entered.resolve();await release.promise;}}});
  let record;
  try{observationPort(h.api);record=h.api.record(originalFact());await entered.promise;assert.equal(h.api.health().pending,0);let finished=false;const observation=h.api.observeCollection().then(value=>{finished=true;return value;});await Promise.resolve();assert.equal(finished,false);release.resolve();const result=await record,observed=await observation;assert.equal(observed.state,'processed');assert.equal(observed.code,null);assert(observed.through>=1);assert(observed.events.some(event=>event.eventId===result.eventId&&event.delivery==='pending'));assert.equal(h.requests.length,0);}finally{release.resolve();await record;await h.close();}
});
test('USAGE02-C2 observation reports persistence failure rather than successful drain or a leaked raw Error',async t=>{
  const h=await localLifecycle(t,{onWrite:async next=>{if(next.events.length)throw new Error('RAW_PRIVATE_FAILURE_MUST_NOT_LEAK');}});
  try{observationPort(h.api);assert.deepEqual(await h.api.record(originalFact()),{disposition:'rejected',code:'RECORD_FAILED'});const observed=await h.api.observeCollection();assert.equal(observed.state,'failed');assert.equal(observed.code,'COLLECTION_FAILED');assert.equal(observed.events.length,0);assert.doesNotMatch(JSON.stringify(observed),/RAW_PRIVATE|stack|\/Users\//);assert.equal(h.requests.length,0);}finally{await h.close();}
});
test('USAGE02-C3 observation captures only work accepted before the call, not a later blocked record',async t=>{
  const release=deferred();let block=false;const h=await localLifecycle(t,{onWrite:async next=>{if(block&&next.events.length>1)await release.promise;}});let later;
  try{observationPort(h.api);const first=await h.api.record(originalFact());const observation=h.api.observeCollection();block=true;later=h.api.record(originalFact({idempotencyKey:'command:later:succeeded'}));const observed=await observation;assert.equal(observed.state,'processed');assert(observed.events.some(event=>event.eventId===first.eventId));assert.equal(observed.events.length,1);release.resolve();await later;}finally{release.resolve();await later;await h.close();}
});
test('USAGE02-D1 local processing is not durable send confirmation; an offline record remains pending',async t=>{
  const h=await localLifecycle(t,{origin:null});
  try{observationPort(h.api);const result=await h.api.record(originalFact());const observed=await h.api.observeCollection();assert.equal(observed.state,'processed');assert.equal(observed.events.find(event=>event.eventId===result.eventId).delivery,'pending');assert.equal(observed.health.outbox.state,'offline');assert.equal(h.requests.length,0);}finally{await h.close();}
});
test('USAGE02-D2 committed accepted receipt confirms sending; duplicate receipt confirms without a new event',async t=>{
  let resultKind='accepted';const h=await localLifecycle(t,{onRequest:async request=>new Response(JSON.stringify({accepted:resultKind==='accepted'?JSON.parse(request.body).length:0,duplicates:resultKind==='duplicate'?JSON.parse(request.body).length:0,rejected:[],durability:'committed'}),{status:200})});
  try{observationPort(h.api);const first=await h.api.record(originalFact());h.tickSend();let observed=await h.api.observeCollection();assert.equal(observed.events.find(event=>event.eventId===first.eventId).delivery,'confirmed');assert.equal(h.requests.length,1);const repeated=await h.api.record(originalFact({occurredAt:h.snapshot().events[0].occurredAt}));assert.equal(repeated.disposition,'duplicate');assert.equal(h.snapshot().events.length,1);assert.equal(h.requests.length,1);
    resultKind='duplicate';const second=await h.api.record(originalFact({idempotencyKey:'command:already-on-server:succeeded'}));t.mock.timers.tick(60000);observed=await h.api.observeCollection();assert.equal(observed.events.find(event=>event.eventId===second.eventId).delivery,'confirmed');assert.equal(observed.health.outbox.duplicate,1);
  }finally{await h.close();}
});
test('USAGE02-D3 formal C-USAGE unknown COMMIT error never becomes confirmed merely because pending is zero',async t=>{
  // C-USAGE §11.5: unknown COMMIT is an error, never an HTTP 200 service receipt.
  const h=await localLifecycle(t,{onRequest:async()=>new Response(JSON.stringify({error:{code:'USAGE_STORAGE_UNAVAILABLE',message:'Usage storage is unavailable.',durability:'unconfirmed'}}),{status:503})});
  try{observationPort(h.api);const result=await h.api.record(originalFact());h.tickSend();const observed=await h.api.observeCollection();const event=observed.events.find(item=>item.eventId===result.eventId);assert.equal(event.delivery,'unconfirmed');assert.notEqual(event.delivery,'confirmed');const sentBefore=h.requests.length;t.mock.timers.tick(3600000);await h.api.drain();assert.equal(h.requests.length,sentBefore,'unknown COMMIT must not cause autonomous retry');}finally{await h.close();}
});
for(const [kind,code,onRequest] of [['auth','UPLOAD_UNAUTHORIZED',async()=>new Response('RAW_PRIVATE_SERVER_FAILURE',{status:401})],['invalid-response','UPLOAD_RESPONSE_INVALID',async()=>new Response('RAW_PRIVATE_SERVER_FAILURE',{status:200})],['transport','UPLOAD_UNAVAILABLE',async()=>{throw new Error('RAW_PRIVATE_SERVER_FAILURE');}]])test(`USAGE02-D4 ${kind} preserves pending with bounded diagnostics`,async t=>{
  const h=await localLifecycle(t,{onRequest});
  try{observationPort(h.api);const result=await h.api.record(originalFact());h.tickSend();const observed=await h.api.observeCollection();assert.equal(observed.events.find(item=>item.eventId===result.eventId).delivery,'pending');assert.equal(observed.health.outbox.lastError,code);assert.doesNotMatch(JSON.stringify(observed),/RAW_PRIVATE/);}finally{await h.close();}
});
test('USAGE02-W1 withdrawal waits for its local work and exposes confirmed deletion; later records and scheduled sends stay withheld',async t=>{
  const h=await localLifecycle(t);
  try{observationPort(h.api);await h.api.record(originalFact());const {changedAt}=await h.setConsent('withheld');const observed=await h.api.observeCollection();assert.equal(observed.state,'processed');assert.equal(observed.health.consent,'withheld');assert.equal(observed.health.withdrawal.requestedAt,changedAt);assert.equal(observed.health.withdrawal.state,'sent');assert.equal(observed.health.withdrawal.deletedEvents,1);assert.equal(h.snapshot().events.length,0);assert.deepEqual(await h.api.record(originalFact({idempotencyKey:'command:after-withdraw:succeeded'})),{disposition:'withheld'});t.mock.timers.tick(60000);assert.deepEqual(h.requests.map(item=>item.method),['DELETE']);}finally{await h.close();}
});
test('USAGE02-W2 offline withdrawal is not confirmed remote deletion and does not invent a deleted count',async t=>{
  const h=await localLifecycle(t,{origin:null});
  try{observationPort(h.api);await h.api.record(originalFact());h.setConsent('withheld');const observed=await h.api.observeCollection();assert.equal(observed.health.withdrawal.state,'offline');assert.equal(observed.health.withdrawal.deletedEvents,null);assert.equal(h.requests.length,0);assert.equal(h.snapshot().events.length,0);}finally{await h.close();}
});
test('USAGE02-W3 failed remote withdrawal remains pending with local events removed and no fictitious deleted count',async t=>{
  const h=await localLifecycle(t,{onRequest:async()=>new Response('RAW_PRIVATE_DELETE_FAILURE',{status:503})});
  try{observationPort(h.api);await h.api.record(originalFact());h.setConsent('withheld');const observed=await h.api.observeCollection();assert.equal(observed.health.withdrawal.state,'pending');assert.equal(observed.health.withdrawal.deletedEvents,null);assert.equal(observed.health.withdrawal.lastError,'WITHDRAW_UNAVAILABLE');assert.equal(h.snapshot().events.length,0);assert.deepEqual(h.requests.map(request=>request.method),['DELETE']);assert.doesNotMatch(JSON.stringify(observed),/RAW_PRIVATE/);}finally{await h.close();}
});
test('USAGE02-C4 released service refuses observation with a bounded unavailable result',async t=>{
  const h=await localLifecycle(t);
  try{observationPort(h.api);await h.close();assert.deepEqual(await h.api.observeCollection(),{state:'failed',code:'USAGE_UNAVAILABLE',through:null,events:[],health:null});}finally{await h.close();}
});
