import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureHost} from './fixtures/host.mjs';
import {core} from './fixtures/helpers.mjs';

test('T12 FIXTURE: live source flush/read must precede sidecar write',async()=>{
  const h=await fixtureHost();assert.equal(h.api.query().total,1);
  assert(h.log.indexOf('source.flush')<h.log.indexOf('summary.set'));assert(h.log.indexOf('source.read')<h.log.indexOf('summary.set'));
  assert.equal(h.api.health().recoveryComplete,true);await h.close();assert.equal(h.domainCloses,2);assert(h.handleCloses>0);
});
test('live listener absence never creates a falsely durable summary',async()=>{
  const h=await fixtureHost({participated:false});assert.equal(h.api.query().total,0);assert.equal(h.api.health().recoveryComplete,false);assert(h.api.health().failures.NO_DURABILITY_LISTENER>0);await h.close();
});
test('source read missing terminal refuses publication',async()=>{
  const h=await fixtureHost({persisted:false});assert.equal(h.api.query().total,0);assert(h.api.health().failures.SOURCE_NOT_DURABLE>0);await h.close();
});
test('source error produces only bounded code diagnostics, not raw credentials',async()=>{
  const h=await fixtureHost({throwRead:true});assert.equal(h.api.query().total,0);assert.doesNotMatch(JSON.stringify(h.api.health()),/SYNTHETIC|sk-/);assert(h.api.health().failures.OBSERVATION_FAILED>0);await h.close();
});
test('cold replay is read-only, flushes source and deduplicates second reconciliation',async()=>{
  const h=await fixtureHost({live:false});assert.equal(h.api.query().total,1);assert(h.log.indexOf('cold.flush')<h.log.indexOf('summary.set'));
  await h.api.reconcile();assert.equal(h.api.query().total,1);assert.equal(h.g.writes,1);await h.close();
});
test('U02 DSH session without Registry binding is recorded with honest unavailable executor',async()=>{
  const h=await fixtureHost({bound:false});assert.equal(h.api.query().total,1);assert.equal(h.g.writes,1);
  assert.equal(h.api.query().records[0].executor.id.reason,'binding_unavailable');await h.close();
});
test('fork inherited end is skipped on both live and cold paths',async()=>{
  for(const live of [true,false]){const h=await fixtureHost({live,inheritedEventCount:3});assert.equal(h.api.query().total,0);await h.close();}
});
test('T08 FIXTURE: replayed session/event notifications do not inflate counts',async()=>{
  const h=await fixtureHost();for(let n=0;n<20;n++)h.handlers.get('session/event')(h.s,h.input.events.at(-1));await h.api.drain();assert.equal(h.api.query().total,1);assert.equal(h.g.writes,1);await h.close();assert.equal(h.handlers.size,0);
});
test('export defaults disabled; enabling local policy exposes only projected record',async()=>{
  const disabled=await fixtureHost();assert.throws(()=>disabled.api.export(),{code:'EXPORT_DISABLED'});await disabled.close();
  const enabled=await fixtureHost({allowExport:true});assert.equal(enabled.api.export().total,1);assert.doesNotMatch(JSON.stringify(enabled.api.export()),/SYNTHETIC_ERROR/);await enabled.close();
});
test('T11 FIXTURE ONLY: no connection/cloud module is required for local service',async()=>{
  const h=await fixtureHost();assert.equal(h.ctx.connection,undefined);assert.equal(h.api.query().total,1);await h.close();await h.close();assert.equal(h.domainCloses,2);
});

test('U06 source declaration commits before its derived event',async()=>{
  const h=await fixtureHost({consent:'granted'});assert.equal(h.api.query().total,1);assert.equal(h.api.events().total,1);
  assert(h.log.indexOf('summary.set')<h.log.lastIndexOf('event.set'));assert.equal(h.api.events().events[0].action,'use');await h.close();
});

test('U06 derivation failure is bounded and never rolls back the Declaration',async()=>{
  const h=await fixtureHost({consent:'granted',deviceId:'bad'});assert.equal(h.api.query().total,1);assert.equal(h.api.events().total,0);
  assert.equal(h.api.health().failures.DERIVE_FAILED,1);assert.equal(h.api.health().recoveryComplete,true);await h.close();
});

test('U09 mounted service exposes the record seat while withheld remains event-free',async()=>{
  const h=await fixtureHost();assert.equal(h.api.events().total,0);
  assert.deepEqual(await h.api.record({hanaRef:'pkg',action:'open',idempotencyKey:'open-1',sourcePlugin:'app-host'}),{disposition:'withheld'});await h.close();
});

test('U11 absent and incompatible core never block local Declaration recording',async()=>{
  for(const coreStatus of ['absent','incompatible']){const h=await fixtureHost({coreStatus,consent:'granted'});assert.equal(h.api.query().total,1);assert.equal(h.api.events().total,0);const health=h.api.health();assert.equal(health.core,coreStatus);assert.equal(health.consent,'unknown');assert.equal(health.deviceId,null);assert.equal(health.derive.skipped.noDevice,1);await h.close();}
});

test('U11 late core attachment signs legacy pending events and starts from the current consent',async()=>{
  const event=core.createUsageEvent({deviceId:'device_A',hanaRef:'pkg',action:'use',occurredAt:'2026-09-19T00:00:00.000Z',eventId:core.eventIdForSeat('device_A','app-host','legacy'),nonce:'AQIDBAUGBwgJCgsMDQ4PEA',signature:null,source:'seat',sourcePlugin:'app-host',evidenceRef:'legacy'});
  const h=await fixtureHost({coreStatus:'absent',consent:'granted',eventSnapshot:{schemaVersion:1,events:[event],withdrawal:null,inventory:{last:null}}});assert.equal(h.api.events().events[0].signature,null);h.attachCore();await h.api.drain();assert.equal(Buffer.from(h.api.events().events[0].signature,'base64url').length,64);assert.equal(h.api.health().core,'present');assert.equal(h.api.health().consent,'granted');await h.close();
});

test('U17 health exposes the complete bounded field table',async()=>{
  const h=await fixtureHost();const health=h.api.health();assert.deepEqual(Object.keys(health),['pending','recoveryComplete','failures','consent','core','deviceId','outbox','derive','withdrawal','inventory']);assert.deepEqual(Object.keys(health.outbox),['state','pending','sent','duplicate','rejected','lastUploadAt','nextAttemptAt','lastError']);assert.deepEqual(Object.keys(health.derive.skipped),['consentWithheld','executorUnavailable','timeUnavailable','noDevice']);await h.close();
});
