import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../lib/core/index.js';

let host = null;
try { host = await import('../lib/host/record.js'); } catch {}

class EventGlobal {
  constructor() { this.snapshot={schemaVersion:1,events:[],withdrawal:null,inventory:{last:null}}; }
  get() { return this.snapshot; }
  async set(next) { this.snapshot=structuredClone(next); }
}

test('U09 record seat module is present', () => assert.equal(typeof host?.createRecordSeat, 'function'));

test('U09 record seat returns withheld, recorded, duplicate and rejected dispositions', async () => {
  const store = new core.EventStore(new EventGlobal());
  let consent = 'withheld';
  const record = host.createRecordSeat({
    store,
    getConsent:()=>consent,
    getDeviceId:()=> 'device_A',
    now:()=>Date.parse('2026-09-19T00:00:00.000Z'),
    nonce:()=> 'AQIDBAUGBwgJCgsMDQ4PEA',
    signEvent:event=>({...event,signature:'c2lnbmF0dXJl'}),
  });
  const input={hanaRef:'@hanamesh/app',action:'open',idempotencyKey:'open-1',sourcePlugin:'@hanamesh/dsh-app-host'};
  assert.deepEqual(await record(input), {disposition:'withheld'});
  consent='granted';
  const inserted=await record(input);assert.equal(inserted.disposition,'recorded');assert.match(inserted.eventId,/^[0-9a-f-]{36}$/);
  assert.deepEqual(await record(input), {disposition:'duplicate',eventId:inserted.eventId});
  assert.deepEqual(await record({...input,action:'install'}), {disposition:'rejected',code:'INVALID_RECORD_INPUT'});
  const {idempotencyKey: _omit, ...missing}=input;
  assert.deepEqual(await record(missing), {disposition:'rejected',code:'INVALID_RECORD_INPUT'});
});

test('U09 record seat rejects timestamps outside the 90-day and five-minute window', async () => {
  const store = new core.EventStore(new EventGlobal());
  const record = host.createRecordSeat({store,getConsent:()=> 'granted',getDeviceId:()=> 'device_A',now:()=>Date.parse('2026-09-19T00:00:00.000Z'),nonce:()=> 'AQIDBAUGBwgJCgsMDQ4PEA',signEvent:event=>({...event,signature:'c2lnbmF0dXJl'})});
  const input={hanaRef:'pkg',action:'use',idempotencyKey:'use-1',sourcePlugin:'app-host'};
  assert.equal((await record({...input,occurredAt:'2026-06-01T00:00:00.000Z'})).code,'INVALID_RECORD_INPUT');
  assert.equal((await record({...input,occurredAt:'2026-09-19T00:06:00.000Z'})).code,'INVALID_RECORD_INPUT');
});

test('T6 record seat accepts sourceHanaRef, targetRef and a use receipt; rejects receipts on open and bad shapes', async () => {
  const store = new core.EventStore(new EventGlobal());
  const record = host.createRecordSeat({store,getConsent:()=> 'granted',getDeviceId:()=> 'device_A',now:()=>Date.parse('2026-09-19T00:00:00.000Z'),nonce:()=> 'AQIDBAUGBwgJCgsMDQ4PEA',signEvent:event=>({...event,signature:'c2lnbmF0dXJl'})});
  const use={hanaRef:'@hanamesh/app-vibe',action:'use',idempotencyKey:'use:vibe:2026091900',sourcePlugin:'@hanamesh/dsh-app-host',targetRef:'vibe',receipt:{providerId:'deepseek',model:'deepseek-chat',count:7}};
  const recorded=await record(use);assert.equal(recorded.disposition,'recorded');
  const stored=store.query().events[0];
  assert.deepEqual([stored.sourceHanaRef,stored.targetRef,stored.receipt],[null,'vibe',{providerId:'deepseek',model:'deepseek-chat',count:7}]);
  assert.equal(stored.eventId,core.eventIdForSeat('device_A','@hanamesh/dsh-app-host','use:vibe:2026091900'));
  assert.deepEqual(await record(use),{disposition:'duplicate',eventId:recorded.eventId});
  assert.deepEqual(await record({...use,receipt:{...use.receipt,count:8}}),{disposition:'rejected',code:'EVENT_IDENTITY_CONFLICT'});
  assert.deepEqual(await record({...use,action:'open',idempotencyKey:'open:vibe:1'}),{disposition:'rejected',code:'INVALID_RECORD_INPUT'});
  assert.deepEqual(await record({...use,idempotencyKey:'k2',receipt:{providerId:'deepseek',model:'deepseek-chat'}}),{disposition:'rejected',code:'INVALID_RECORD_INPUT'});
  assert.deepEqual(await record({...use,idempotencyKey:'k3',targetRef:'/Users/x'}),{disposition:'rejected',code:'INVALID_RECORD_INPUT'});
  assert.deepEqual(await record({...use,idempotencyKey:'k4',sourceHanaRef:'owner/repo'}),{disposition:'rejected',code:'INVALID_RECORD_INPUT'});
  // Explicit nulls and a source Hana are fine; the event still signs over the six keys only.
  const open=await record({hanaRef:'@hanamesh/app-vibe',action:'open',idempotencyKey:'open:vibe:1',sourcePlugin:'@hanamesh/dsh-app-host',sourceHanaRef:'@hanamesh/recommender',targetRef:null,receipt:null});
  assert.equal(open.disposition,'recorded');const openEvent=store.query().events[1];assert.equal(openEvent.sourceHanaRef,'@hanamesh/recommender');assert.equal(openEvent.receipt,null);assert.equal(openEvent.signature,'c2lnbmF0dXJl');
});
