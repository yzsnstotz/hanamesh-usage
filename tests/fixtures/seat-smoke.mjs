import assert from 'node:assert/strict';
import * as core from '../../lib/core/index.js';
import {createRecordSeat} from '../../lib/host/record.js';

class MemoryEventGlobal {
  constructor(){this.snapshot={schemaVersion:1,events:[],withdrawal:null,inventory:{last:null}};}
  get(){return this.snapshot;}
  async set(next){this.snapshot=structuredClone(next);}
}

let consent='withheld';
const record=createRecordSeat({
  store:new core.EventStore(new MemoryEventGlobal()),
  getConsent:()=>consent,
  getDeviceId:()=> 'device_FIXTURE',
  now:()=>Date.parse('2026-09-19T00:00:00.000Z'),
  nonce:()=> 'AQIDBAUGBwgJCgsMDQ4PEA',
  signEvent:event=>({...event,signature:'c2lnbmF0dXJl'}),
});
const input={hanaRef:'@hanamesh/app',action:'open',idempotencyKey:'open-1',sourcePlugin:'@hanamesh/dsh-app-host'};
const withheld=await record(input);consent='granted';const recorded=await record(input);const duplicate=await record(input);const rejected=await record({...input,action:'install'});
assert.equal(withheld.disposition,'withheld');assert.equal(recorded.disposition,'recorded');assert.equal(duplicate.eventId,recorded.eventId);assert.deepEqual(rejected,{disposition:'rejected',code:'INVALID_RECORD_INPUT'});
for(const value of [withheld,recorded,{disposition:duplicate.disposition},rejected])process.stdout.write(`${JSON.stringify(value)}\n`);
