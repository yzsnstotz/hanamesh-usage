import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../lib/core/index.js';

test('U05 core exports the usage event contract surface', () => {
  for (const name of ['canonicalJSON','eventIdForSession','eventIdForLoader','eventIdForSeat','createUsageEvent','validateEvent','wireEvent','EventStore','deriveUsageEvent']) {
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
