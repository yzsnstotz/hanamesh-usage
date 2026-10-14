import test from 'node:test';
import assert from 'node:assert/strict';
import {deliveryFixture,json} from './fixtures/signed-delivery.mjs';
import {core} from './fixtures/helpers.mjs';
import {fixtureHost} from './fixtures/host.mjs';
import {renderUsagePanel,projectUsagePanel} from '../lib/host/panel.js';

test('S06-P01 signed original fact and explicit replay keep event bytes but refresh HTTP nonce',async t=>{
  const f=deliveryFixture(t,(_request,n)=>n===1?json({error:{code:'USAGE_STORAGE_UNAVAILABLE',message:'Usage storage is unavailable.',durability:'unconfirmed'}},503):json({accepted:0,duplicates:1,rejected:[],durability:'committed'}));
  const first=await f.record(f.input('command:original:succeeded'));
  assert.equal(first.disposition,'recorded');
  assert.deepEqual(await f.record(f.input('command:original:succeeded')),{disposition:'duplicate',eventId:first.eventId});
  assert.equal(f.store.query().total,1);
  assert.notEqual(await f.reporter.runOnce(),'uploaded');
  // Explicit user replay after an unconfirmed receipt; the contract substitute
  // responds duplicate. This proves client byte preservation, not server dedup.
  assert.equal(await f.reporter.runOnce(),'uploaded');
  assert.equal(f.requests[0].options.body,f.requests[1].options.body);
  assert.notEqual(f.requests[0].options.headers['x-hm-nonce'],f.requests[1].options.headers['x-hm-nonce']);
  assert.equal(f.reporter.health().duplicate,1);
});

test('S06-P01b legal committed ingestion has a visible receipt and independently verified signature',async t=>{
  const f=deliveryFixture(t,()=>json({accepted:1,duplicates:0,rejected:[],durability:'committed'}));
  await f.record(f.input('legal')); assert.equal(await f.reporter.runOnce(),'uploaded');
  assert.equal(f.reporter.health().sent,1); assert.equal(f.reporter.health().lastError,null);
  const health={consent:'granted',core:'present',deviceId:f.service.getDeviceId(),outbox:f.reporter.health(),failures:{}};
  const panel=projectUsagePanel(health,f.store.query().events,f.service,{identity:false,receiver:false});
  assert.equal(panel.events[0].signature.state,'success');
  assert.match(renderUsagePanel(panel),/fixture\.app/);
});

test('S06-P02 HTTP pending-host-commit is not a durable upload receipt',async t=>{
  const f=deliveryFixture(t,()=>json({accepted:1,duplicates:0,rejected:[],durability:'pending-host-commit'}));
  await f.record(f.input('pending-commit')); const outcome=await f.reporter.runOnce();
  assert.notEqual(outcome,'uploaded','a service-only pending result must not be displayed as uploaded');
  assert.equal(f.reporter.health().sent,0); assert.equal(f.reporter.health().duplicate,0);
  assert.equal(f.reporter.health().lastError,'UPLOAD_RESPONSE_INVALID');
});

test('S06-P03 mixed counts never identify first/duplicate events by array position',async t=>{
  const states=[];
  for(const reverse of [false,true]){
    const f=deliveryFixture(t,()=>json({accepted:1,duplicates:1,rejected:[],durability:'committed'}));
    for(const key of reverse?['b','a']:['a','b']) await f.record(f.input(key));
    assert.equal(await f.reporter.runOnce(),'uploaded');
    states.push(f.store.query().events.map(e=>[e.evidenceRef,e.upload.state]).sort());
  }
  assert.deepEqual(states[0],states[1],'counts have no per-event accepted/duplicate association');
});

test('S06-P04 unknown POST commit stays visible and schedules no automatic replay',async t=>{
  const f=deliveryFixture(t,()=>json({error:{code:'USAGE_STORAGE_UNAVAILABLE',message:'Usage storage is unavailable.',durability:'unconfirmed'}},503));
  await f.record(f.input('unknown-post')); await f.reporter.runOnce();
  const health=f.reporter.health();
  assert.equal(health.state,'unconfirmed'); assert.equal(health.lastError,'USAGE_STORAGE_UNAVAILABLE');
  assert.equal(health.nextAttemptAt,null); assert.equal(health.sent,0); assert.equal(f.store.query().total,1);
});

test('S06-P05 event rejection is associated by eventId and remains visible with no raw error',async t=>{
  let rejected;
  const f=deliveryFixture(t,()=>json({accepted:1,duplicates:0,rejected:[{eventId:rejected,code:'USAGE_EVENT_CONFLICT'}],durability:'committed'}));
  await f.record(f.input('ok')); rejected=(await f.record(f.input('conflict'))).eventId;
  await f.reporter.runOnce();
  const event=f.store.query().events.find(e=>e.eventId===rejected);
  assert.equal(event.upload.state,'rejected'); assert.equal(event.upload.code,'USAGE_EVENT_CONFLICT');
});

test('S06-P06 consent withdrawal persists clear before bodyless DELETE and accepts confirmed counts',async t=>{
  for(const deletedEvents of [2,0]){
  let f;
  f=deliveryFixture(t,request=>{
    assert.equal(request.options.method,'DELETE'); assert.equal(request.options.body,undefined);
    assert.equal(f.global.snapshot.events.length,0); assert.equal(f.global.snapshot.withdrawal.deletedEvents,null);
    return json({deletedEvents});
  });
  await f.record(f.input('before-withdraw')); f.setConsent('withheld');
  assert.equal(await f.reporter.withdraw('2026-10-15T00:00:01.000Z'),'sent');
  assert.deepEqual(await f.record(f.input('after-withdraw')),{disposition:'withheld'});
  await f.reporter.runOnce(); assert.equal(f.requests.length,1); assert.equal(f.store.query().total,0);
  assert.equal(f.store.getSnapshot().withdrawal.deletedEvents,deletedEvents);
  }
});

test('S06-P07 unknown DELETE commit is not deleted/zero and never schedules automatic retry',async t=>{
  const f=deliveryFixture(t,()=>json({error:{code:'USAGE_STORAGE_UNAVAILABLE',message:'Usage storage is unavailable.',durability:'unconfirmed'}},503));
  await f.record(f.input('unknown-delete')); f.setConsent('withheld');
  await f.reporter.withdraw('2026-10-15T00:00:01.000Z');
  const withdrawal=f.store.getSnapshot().withdrawal;
  assert.equal(withdrawal.state,'unconfirmed'); assert.equal(withdrawal.deletedEvents,null);
  assert.equal(withdrawal.lastError,'USAGE_STORAGE_UNAVAILABLE'); assert.equal(f.reporter.health().nextAttemptAt,null);
  assert.equal(f.store.query().total,0);
});

test('S06-P08 invalid deletion counts and public refusals remain failures, never successful zero',async t=>{
  for(const [body,status] of [[{deletedEvents:null},200],[{deletedEvents:-1},200],[{deletedEvents:0.5},200],[{error:{code:'USAGE_NOT_FOUND',message:'Summary not found.'}},404],[{error:{code:'USAGE_FORBIDDEN',message:'Forbidden.'}},403]]){
    const f=deliveryFixture(t,()=>json(body,status)); await f.record(f.input('delete-failure')); f.setConsent('withheld');
    await f.reporter.withdraw('2026-10-15T00:00:01.000Z');
    const withdrawal=f.store.getSnapshot().withdrawal;
    assert.notEqual(withdrawal.state,'sent'); assert.equal(withdrawal.deletedEvents,null);
    assert.equal(typeof withdrawal.lastError,'string'); assert.equal(f.store.query().total,0);
    assert.doesNotMatch(JSON.stringify(withdrawal),/Summary not found|Forbidden\./);
  }
});

test('S06-P09 device readback passes opaque cursor through an empty page and displays original facts',async t=>{
  let sent, window;
  const cursor='MjAyNi0xMC0xNVQwMDowMDowMC4wMDdaCg';
  const f=deliveryFixture(t,request=>{
    assert.equal(request.options.method,'GET'); assert.equal(request.options.body,undefined);
    window={from:request.url.searchParams.get('from'),to:request.url.searchParams.get('to')};
    return request.url.searchParams.has('after')?json({items:[{...sent,principalId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',receivedAt:'2026-10-15T00:00:01.009Z'}],nextAfter:null,window}):json({items:[],nextAfter:cursor,window});
  });
  await f.record(f.input('readback')); sent=core.wireEvent(f.store.getSnapshot().events[0]);
  const writes=f.global.writes,remote=await f.reporter.readRemote();
  assert.equal(remote.state,'available'); assert.equal(remote.total,1);
  assert.equal(remote.events[0].eventId,sent.eventId); assert.equal(remote.events[0].occurredAt,sent.occurredAt);
  assert.equal(f.requests[1].url.searchParams.get('after'),cursor); assert.equal(f.global.writes,writes);
});

test('S06-P10 malformed public readback never displays known zero or invented facts',async t=>{
  for(const body of [{items:[],nextAfter:null}, {items:[],nextAfter:null,window:{from:'wrong',to:'wrong'}}]){
    const f=deliveryFixture(t,()=>json(body)); const remote=await f.reporter.readRemote();
    assert.equal(remote.state,'unknown'); assert.equal(remote.total,null); assert.equal(remote.code,'REMOTE_RESPONSE_INVALID');
  }
});

test('S06-P11 mounted consent callback stops new collection and keeps original change time',async()=>{
  const h=await fixtureHost({consent:'granted'});
  try{
    await h.api.record({hanaRef:'fixture.app',sourcePlugin:'fixture.app',action:'use',idempotencyKey:'before',occurredAt:new Date().toISOString()});
    const changedAt=new Date().toISOString(); h.setConsent('withheld',changedAt); await h.api.drain();
    assert.equal(h.api.events().total,0); assert.equal(h.api.health().withdrawal.requestedAt,changedAt);
    assert.equal(h.api.health().withdrawal.deletedEvents,null); assert.equal(h.api.health().withdrawal.state,'offline');
    assert.deepEqual(await h.api.record({hanaRef:'fixture.app',sourcePlugin:'fixture.app',action:'use',idempotencyKey:'after',occurredAt:changedAt}),{disposition:'withheld'});
  }finally{await h.close();}
});

test('S06-P12 visible Usage panel shows unconfirmed withdrawal and bounded cause',async t=>{
  const f=deliveryFixture(t,()=>json({error:{code:'USAGE_STORAGE_UNAVAILABLE',message:'Usage storage is unavailable.',durability:'unconfirmed'}},503));
  await f.record(f.input('panel-withdraw')); f.setConsent('withheld'); await f.reporter.withdraw('2026-10-15T00:00:01.000Z');
  const health={consent:'withheld',core:'present',deviceId:f.service.getDeviceId(),outbox:f.reporter.health(),failures:{},withdrawal:f.store.getSnapshot().withdrawal};
  const panel=projectUsagePanel(health,[],f.service,{identity:false,receiver:false});
  const html=renderUsagePanel(panel);
  assert.match(html,/撤回/); assert.match(html,/USAGE_STORAGE_UNAVAILABLE/); assert.match(html,/unconfirmed|未确认/);
  assert.doesNotMatch(html,/Usage storage is unavailable\./);
});
