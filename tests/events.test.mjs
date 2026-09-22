import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../lib/core/index.js';

test('U05 core exports the usage event contract surface', () => {
  for (const name of ['canonicalJSON','signingJSON','eventIdForSession','eventIdForLoader','eventIdForSeat','createUsageEvent','validateEvent','wireEvent','EventStore','deriveUsageEvent']) {
    assert.equal(typeof core[name], 'function', name);
  }
});

const base = () => ({
  deviceId: 'device_A',
  hanaRef: '@scope/example-plugin',
  action: 'use',
  occurredAt: '2026-09-19T00:00:00.000Z',
  eventId: '018f08f6-2d0c-5b61-8f5f-678f12294e87',
  nonce: 'AQIDBAUGBwgJCgsMDQ4PEA',
  signature: null,
  source: 'session-log',
  sourcePlugin: null,
  evidenceRef: '["session","turn/end",0]',
});

test('U05 canonical JSON sorts the six signed keys and wire event has exactly seven keys', () => {
  const input = base();
  const event = core.createUsageEvent(input);
  core.validateEvent(event);
  const wire = core.wireEvent(event);
  assert.deepEqual(Object.keys(wire), ['deviceId','hanaRef','action','occurredAt','eventId','nonce','signature']);
  const { signature: _signature, ...signed } = wire;
  assert.equal(core.canonicalJSON(signed), '{"action":"use","deviceId":"device_A","eventId":"018f08f6-2d0c-5b61-8f5f-678f12294e87","hanaRef":"@scope/example-plugin","nonce":"AQIDBAUGBwgJCgsMDQ4PEA","occurredAt":"2026-09-19T00:00:00.000Z"}');
  // O1 signing input: fixed key order, six fields (hanamesh-server-usage docs/API.md)
  assert.equal(core.signingJSON(signed), '{"deviceId":"device_A","hanaRef":"@scope/example-plugin","action":"use","occurredAt":"2026-09-19T00:00:00.000Z","eventId":"018f08f6-2d0c-5b61-8f5f-678f12294e87","nonce":"AQIDBAUGBwgJCgsMDQ4PEA"}');
  assert.equal(event.sourceHanaRef, null);
  assert.equal(event.targetRef, null);
});

test('U05 event schema is closed and refuses unsafe Hana references', () => {
  const event = core.createUsageEvent(base());
  assert.throws(() => core.validateEvent({ ...event, prompt: 'secret' }), { code: 'INVALID_USAGE_EVENT' });
  assert.throws(() => core.createUsageEvent({ ...base(), hanaRef: '/Users/example' }), { code: 'INVALID_USAGE_EVENT' });
  assert.throws(() => core.createUsageEvent({ ...base(), action: 'reward' }), { code: 'INVALID_USAGE_EVENT' });
  assert.throws(() => core.createUsageEvent({ ...base(), occurredAt: 'not-a-date' }), { code: 'INVALID_USAGE_EVENT' });
  assert.throws(() => core.createUsageEvent({ ...base(), nonce: '1234567890123456' }), { code: 'INVALID_USAGE_EVENT' });
});

test('U05 event export is rebuilt field by field and preserves exactly the local contract', () => {
  const event = core.createUsageEvent(base());
  assert.deepEqual(core.exportEventProjection(event), event);
  assert.notEqual(core.exportEventProjection(event), event);
});

test('U07 event identities are deterministic UUIDv5 values separated by source semantics', () => {
  const sessionA = core.eventIdForSession('device_A', 'session-1', 4);
  assert.equal(sessionA, core.eventIdForSession('device_A', 'session-1', 4));
  assert.match(sessionA, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(sessionA, core.eventIdForSession('device_A', 'session-1', 5));
  assert.notEqual(core.eventIdForLoader('device_A', 'install', 'pkg', '1.0.0'), core.eventIdForLoader('device_A', 'uninstall', 'pkg', '1.0.0'));
  assert.equal(core.eventIdForSeat('device_A', 'app-host', 'open-1'), core.eventIdForSeat('device_A', 'app-host', 'open-1'));
});

class EventGlobal {
  constructor(snapshot = { schemaVersion:1, events:[], withdrawal:null, inventory:{last:null} }) { this.snapshot = structuredClone(snapshot); this.writes = 0; }
  get() { return this.snapshot; }
  async set(next) { this.writes++; this.snapshot = structuredClone(next); }
}

test('U07 EventStore replays as duplicate without changing nonce and rejects identity conflict', async () => {
  const global = new EventGlobal();
  const store = new core.EventStore(global, 10);
  const event = core.createUsageEvent(base());
  assert.equal(await store.put(event), 'inserted');
  assert.equal(await store.put({ ...event, nonce:'QkJCQkJCQkJCQkJCQkJCQg' }), 'duplicate');
  assert.equal(global.writes, 1);
  assert.equal(store.query().events[0].nonce, event.nonce);
  await assert.rejects(store.put({ ...event, action:'open' }), { code:'EVENT_IDENTITY_CONFLICT' });
});

test('U08 EventStore never evicts pending events at capacity', async () => {
  const store = new core.EventStore(new EventGlobal(), 1);
  const first = core.createUsageEvent(base());
  await store.put(first);
  const second = core.createUsageEvent({ ...base(), eventId:core.eventIdForSeat('device_A','app-host','next'), nonce:'QkJCQkJCQkJCQkJCQkJCQg' });
  await assert.rejects(store.put(second), { code:'EVENTS_CAPACITY_REACHED' });
  assert.equal(store.query().events[0].eventId, first.eventId);
});

test('U08 EventStore prunes only terminal events older than 90 days', async () => {
  const global = new EventGlobal();
  const store = new core.EventStore(global, 1, () => Date.parse('2026-09-19T00:00:00.000Z'));
  const old = core.createUsageEvent(base());
  old.upload = { state:'sent', code:null, attempts:1, sentAt:'2026-06-01T00:00:00.000Z' };
  await store.put(old);
  const current = core.createUsageEvent({ ...base(), eventId:core.eventIdForSeat('device_A','app-host','current'), nonce:'Q0NDQ0NDQ0NDQ0NDQ0NDQw' });
  assert.equal(await store.put(current), 'inserted');
  assert.deepEqual(store.query().events.map(event => event.eventId), [current.eventId]);
});

test('U12 EventStore signs all legacy pending events in one publication', async () => {
  const global=new EventGlobal();const store=new core.EventStore(global);const event=core.createUsageEvent(base());await store.put(event);const before=global.writes;
  assert.equal(await store.signPending(input=>({...input,signature:'c2lnbmF0dXJl'})),1);assert.equal(global.writes,before+1);assert.equal(store.query().events[0].signature,'c2lnbmF0dXJl');
  assert.equal(await store.signPending(input=>input),0);assert.equal(global.writes,before+1);
});

test('U13 EventStore applies accepted, duplicate and rejected batch outcomes atomically', async () => {
  const global=new EventGlobal();const store=new core.EventStore(global);const events=[];
  for(const [index,nonce] of ['AQIDBAUGBwgJCgsMDQ4PEA','QkJCQkJCQkJCQkJCQkJCQg','Q0NDQ0NDQ0NDQ0NDQ0NDQw'].entries()){
    const event=core.createUsageEvent({...base(),eventId:core.eventIdForSeat('device_A','app-host',`batch-${index}`),nonce,signature:'c2lnbmF0dXJl'});events.push(event);await store.put(event);
  }
  const before=global.writes;await store.applyUpload(events.map(event=>event.eventId),{accepted:1,duplicates:1,rejected:[{eventId:events[2].eventId,code:'USAGE_INPUT_INVALID'}],durability:'committed'},'2026-09-19T00:01:00.000Z');
  assert.equal(global.writes,before+1);assert.deepEqual(store.query().events.map(event=>[event.upload.state,event.upload.code,event.upload.attempts]),[['sent',null,1],['duplicate',null,1],['rejected','USAGE_INPUT_INVALID',1]]);
});

test('U15 EventStore withdrawal clears all events in one publication before remote work', async () => {
  const global=new EventGlobal();const store=new core.EventStore(global);await store.put(core.createUsageEvent(base()));const before=global.writes;
  await store.withdrawLocal('2026-09-19T00:02:00.000Z','device_A');assert.equal(global.writes,before+1);assert.equal(store.query().total,0);assert.equal(store.getSnapshot().withdrawal.state,'pending');
  await store.markWithdrawal({state:'sent',deletedEvents:3,lastError:null});assert.equal(store.getSnapshot().withdrawal.attempts,1);assert.equal(store.getSnapshot().withdrawal.deletedEvents,3);
  await store.clearWithdrawal();assert.equal(store.getSnapshot().withdrawal,null);
});

// rc.7 · T6 归因字段与使用回执
const attributed = () => ({ ...base(), sourceHanaRef:'@hanamesh/recommender', targetRef:'vibe-trading', receipt:{ providerId:'deepseek', model:'deepseek-chat', count:12 } });

test('T6 attribution fields default to null and legacy events without a receipt key still validate', () => {
  const event = core.createUsageEvent(base());
  assert.deepEqual([event.sourceHanaRef, event.targetRef, event.receipt], [null, null, null]);
  const { receipt: _omitted, ...legacy } = event;
  assert.doesNotThrow(() => core.validateEvent(legacy));
  assert.equal(core.exportEventProjection(legacy).receipt, null);
  assert.deepEqual(Object.keys(core.wireEvent(legacy)), ['deviceId','hanaRef','action','occurredAt','eventId','nonce','signature']);
});

test('T6 wire event carries the optional keys only when set; the six-key signing input is unchanged', () => {
  const event = core.createUsageEvent(attributed());
  const wire = core.wireEvent(event);
  assert.deepEqual(Object.keys(wire), ['deviceId','hanaRef','action','occurredAt','eventId','nonce','signature','sourceHanaRef','targetRef','receipt']);
  assert.deepEqual(wire.receipt, { providerId:'deepseek', model:'deepseek-chat', count:12 });
  assert.equal(wire.sourceHanaRef, '@hanamesh/recommender'); assert.equal(wire.targetRef, 'vibe-trading');
  const { signature: _s, sourceHanaRef: _a, targetRef: _b, receipt: _c, ...signed } = wire;
  assert.equal(core.signingJSON(signed), core.signingJSON(core.wireEvent(core.createUsageEvent(base()))));
  assert.deepEqual(core.exportEventProjection(event), event);
});

test('T6 receipt is bounded, content-free and only rides on use events', () => {
  assert.throws(() => core.createUsageEvent({ ...attributed(), action:'open' }), { code:'INVALID_USAGE_EVENT' });
  for (const receipt of [{ providerId:'deepseek', model:null }, { providerId:'deepseek', model:null, count:0 }, { providerId:'deepseek', model:null, count:1.5 },
    { providerId:'sk-live', model:null, count:1 }, { providerId:'deepseek', model:'prompt text here', count:1 }, { providerId:'deepseek', model:'x', count:1, prompt:'hi' }, 'deepseek'])
    assert.throws(() => core.createUsageEvent({ ...attributed(), receipt }), { code:'INVALID_USAGE_EVENT' }, JSON.stringify(receipt));
  assert.equal(core.createUsageEvent({ ...attributed(), receipt:{ providerId:'coding-oauth-gateway', model:'openai/gpt-4o', count:1 } }).receipt.model, 'openai/gpt-4o');
  assert.equal(core.createUsageEvent({ ...attributed(), receipt:{ providerId:'anthropic', model:null, count:3 } }).receipt.model, null);
  for (const targetRef of ['/Users/x', 'a b', 'sk-abc', 'x'.repeat(161)]) assert.throws(() => core.createUsageEvent({ ...base(), targetRef }), { code:'INVALID_USAGE_EVENT' }, targetRef);
  for (const sourceHanaRef of ['owner/repo', 'ghp_x', '@Bad/Name!']) assert.throws(() => core.createUsageEvent({ ...base(), sourceHanaRef }), { code:'INVALID_USAGE_EVENT' }, sourceHanaRef);
});

test('T6 EventStore dedup identity includes attribution and receipt', async () => {
  const store = new core.EventStore(new EventGlobal(), 10);
  const event = core.createUsageEvent(attributed());
  assert.equal(await store.put(event), 'inserted');
  assert.equal(await store.put({ ...event, nonce:'QkJCQkJCQkJCQkJCQkJCQg' }), 'duplicate');
  await assert.rejects(store.put({ ...event, receipt:{ ...event.receipt, count:13 } }), { code:'EVENT_IDENTITY_CONFLICT' });
  await assert.rejects(store.put({ ...event, targetRef:'other-app' }), { code:'EVENT_IDENTITY_CONFLICT' });
  await assert.rejects(store.put({ ...event, sourceHanaRef:null }), { code:'EVENT_IDENTITY_CONFLICT' });
  assert.deepEqual(store.query().events[0].receipt, { providerId:'deepseek', model:'deepseek-chat', count:12 });
});

test('T6 legacy snapshot without receipt keys loads and later events coexist', async () => {
  const legacy = core.createUsageEvent(base()); delete legacy.receipt;
  const store = new core.EventStore(new EventGlobal({ schemaVersion:1, events:[legacy], withdrawal:null, inventory:{ last:null } }), 10);
  assert.equal(store.query().total, 1);
  const next = core.createUsageEvent({ ...attributed(), eventId:core.eventIdForSeat('device_A','app-host','next'), nonce:'QkJCQkJCQkJCQkJCQkJCQg' });
  assert.equal(await store.put(next), 'inserted');
  assert.deepEqual(store.query().events.map(e => e.receipt ?? null), [null, next.receipt]);
});
