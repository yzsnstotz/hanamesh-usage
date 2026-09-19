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
  const record = host.createRecordSeat({store,getConsent:()=> 'granted',getDeviceId:()=> 'device_A',now:()=>Date.parse('2026-09-19T00:00:00.000Z'),nonce:()=> 'AQIDBAUGBwgJCgsMDQ4PEA'});
  const input={hanaRef:'pkg',action:'use',idempotencyKey:'use-1',sourcePlugin:'app-host'};
  assert.equal((await record({...input,occurredAt:'2026-06-01T00:00:00.000Z'})).code,'INVALID_RECORD_INPUT');
  assert.equal((await record({...input,occurredAt:'2026-09-19T00:06:00.000Z'})).code,'INVALID_RECORD_INPUT');
});
