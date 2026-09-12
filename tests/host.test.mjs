import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureHost} from './fixtures/host.mjs';

test('T12 FIXTURE: live source flush/read must precede sidecar write',async()=>{
  const h=await fixtureHost();assert.equal(h.api.query().total,1);
  assert(h.log.indexOf('source.flush')<h.log.indexOf('summary.set'));assert(h.log.indexOf('source.read')<h.log.indexOf('summary.set'));
  assert.equal(h.api.health().recoveryComplete,true);await h.close();assert.equal(h.domainCloses,1);assert(h.handleCloses>0);
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
test('DSH session without Registry binding is not mislabeled as Registry execution',async()=>{
  const h=await fixtureHost({bound:false});assert.equal(h.api.query().total,0);assert.equal(h.g.writes,0);await h.close();
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
  const h=await fixtureHost();assert.equal(h.ctx.connection,undefined);assert.equal(h.api.query().total,1);await h.close();await h.close();assert.equal(h.domainCloses,1);
});
