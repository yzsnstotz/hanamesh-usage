import test from 'node:test';
import assert from 'node:assert/strict';
import { EventStore, createUsageEvent, eventIdForSeat } from '../lib/core/index.js';

const device = '_'.padEnd(43, 'A');
const otherDevice = '-'.padEnd(43, 'B');
const at = '2026-10-03T00:00:00.000Z';
const now = () => Date.parse(at);
const nonce = Buffer.alloc(16, 1).toString('base64url');
const signature = Buffer.alloc(64, 2).toString('base64url');
class MemoryGlobal {
  constructor(snapshot) { this.value = structuredClone(snapshot); this.writes = 0; }
  get() { return structuredClone(this.value); }
  async set(value) { this.writes++; this.value = structuredClone(value); }
}
function event(key, overrides = {}) {
  return createUsageEvent({
    deviceId:device, hanaRef:'@hanamesh/example', action:'use', occurredAt:'2026-10-02T00:00:00.000Z',
    eventId:eventIdForSeat(device,'app-host',key), nonce, signature,
    source:'seat',sourcePlugin:'app-host',evidenceRef:key,...overrides,
  });
}
function rejected(input, code='USAGE_INPUT_INVALID') {
  return {...input,upload:{state:'rejected',code,attempts:1,sentAt:'2026-10-02T00:01:00.000Z'}};
}
function fixture(events, withdrawal=null) {
  const global=new MemoryGlobal({schemaVersion:1,events,withdrawal,inventory:{last:null}});
  return {global,store:new EventStore(global,5000,now)};
}

test('P05 RED: only valid original signed same-device historical rejection requeues in one write',async()=>{
  const target=rejected(event('target'));
  const wrongCode=rejected(event('code'),'USAGE_SIGNATURE_INVALID');
  const other=rejected(event('other',{deviceId:otherDevice,eventId:eventIdForSeat(otherDevice,'app-host','other')}));
  const old=rejected(event('old',{occurredAt:'2026-01-01T00:00:00.000Z'}));
  const future=rejected(event('future',{occurredAt:'2026-10-03T00:05:01.000Z'}));
  const invalidSignature=rejected(event('bad-signature',{signature:Buffer.alloc(64,3).toString('base64url')}));
  const alreadySent={...event('sent'),upload:{state:'sent',code:null,attempts:1,sentAt:at}};
  const {global,store}=fixture([target,wrongCode,other,old,future,invalidSignature,alreadySent]);
  const before=structuredClone(global.value);
  assert.equal(await store.recoverRejectedDeviceId(device,input=>input.signature===signature),1);
  assert.equal(global.writes,1);
  const after=store.getSnapshot();
  assert.deepEqual(after.events[0],{...target,upload:{state:'pending',code:null,attempts:1,sentAt:null}});
  assert.deepEqual(after.events.slice(1),before.events.slice(1));
  assert.equal(await store.recoverRejectedDeviceId(device,input=>input.signature===signature),0);
  assert.equal(global.writes,1);
  const restarted=new EventStore(global,5000,now);
  assert.equal(await restarted.recoverRejectedDeviceId(device,input=>input.signature===signature),0);
  assert.equal(global.writes,1);
});

test('P05 RED: wrong device shape, withdrawal, callback failure and storage failure all leave old events rejected',async()=>{
  const target=rejected(event('target'));
  const {global,store}=fixture([target]);
  await assert.rejects(store.recoverRejectedDeviceId('device_A',()=>true));
  await assert.rejects(store.recoverRejectedDeviceId(device,()=>{throw Error('private');}));
  assert.equal(global.writes,0);
  const withdrawn=fixture([target],{requestedAt:at,deviceId:'device_A',state:'sent',attempts:1,deletedEvents:1,lastError:null});
  await assert.rejects(withdrawn.store.recoverRejectedDeviceId(device,()=>true));
  assert.equal(withdrawn.global.writes,0);
  global.set=async()=>{throw Error('disk unavailable');};
  await assert.rejects(store.recoverRejectedDeviceId(device,()=>true));
  assert.deepEqual(store.getSnapshot().events,[target]);
});
