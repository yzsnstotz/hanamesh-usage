// Real local backend, not a simulated provider. Start one with the hanamesh-server README command
// (`pnpm dev:local --port <port> --docker-context colima --postgres-image pgvector/pgvector:pg17 --fixture local-stage1`)
// and run: HANAMESH_TEST_SERVER_ORIGIN=http://127.0.0.1:<port> node --test tests/local-server.test.mjs
// Without the variable these tests are skipped and say so; they never fall back to a fake server.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCoreFake} from './fixtures/core-fake.mjs';
const core=await import('../lib/core/index.js');
const {createRecordSeat}=await import('../lib/host/record.js');
const {signUsageEvent}=await import('../lib/host/core-link.js');
const {createUsageReporter}=await import('../lib/host/upload.js');

const ORIGIN=process.env.HANAMESH_TEST_SERVER_ORIGIN??null;
const skip=ORIGIN===null?'HANAMESH_TEST_SERVER_ORIGIN is not set: start the local backend (hanamesh-server README) to run these':false;
/** In the local-stage1 catalog snapshot (hanamesh-server scripts/dev-catalog-snapshot.json). */
const CATALOGUED='dsh-no-long-sit';
/** Not in that snapshot. */
const UNCATALOGUED='hanamesh-usage';

async function post(path,body){
  const response=await fetch(new URL(path,ORIGIN),{method:'POST',headers:{origin:ORIGIN,'content-type':'application/json'},body:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};
}
/** C-IDENTITY device registration: challenge {purpose:register}, then sign utf8(nonce + publicKey). */
async function registeredDevice(){
  const fake=createCoreFake({initialConsent:'granted',serverOrigin:ORIGIN});
  const challenge=await post('/v1/identity/devices/challenge',{purpose:'register'});
  assert.equal(challenge.status,200,JSON.stringify(challenge.body));
  const publicKey=fake.service.getPublicKey();
  const signature=Buffer.from(fake.service.sign(new TextEncoder().encode(challenge.body.nonce+publicKey))).toString('base64url');
  const registered=await post('/v1/identity/devices',{publicKey,nonce:challenge.body.nonce,signature,label:{hostname:'usage-test',os:'test',shell:'dsh'}});
  assert.equal(registered.status,201,JSON.stringify(registered.body));
  assert.equal(registered.body.deviceId,fake.service.getDeviceId());
  return fake;
}
function buffer(service,initial){
  let snapshot=initial??{schemaVersion:1,events:[],withdrawal:null,inventory:{last:null}};
  const port={get:()=>snapshot,set:async value=>{snapshot=structuredClone(value);}};
  const store=new core.EventStore(port);
  const record=createRecordSeat({store,getConsent:()=>service.getConsent(),getDeviceId:()=>service.getDeviceId(),signEvent:event=>signUsageEvent(service,event)});
  const reporter=createUsageReporter({store,link:{get:()=>service},uploadIntervalMs:60000,uploadBatchSize:200});
  return {store,record,reporter,snapshot:()=>structuredClone(snapshot)};
}
const fact=(hanaRef,action,key)=>({hanaRef,action,sourcePlugin:hanaRef,idempotencyKey:key,occurredAt:new Date(Date.now()-1000).toISOString()});

test('local backend: signed events are accepted, a replay is a duplicate, the server lists them, withdrawal deletes them',{skip},async()=>{
  const fake=await registeredDevice(),client=buffer(fake.service);
  try{
    assert.equal((await client.record(fact(CATALOGUED,'use','command:it-1:succeeded'))).disposition,'recorded');
    assert.equal((await client.record(fact(CATALOGUED,'open','page:it-1:presented'))).disposition,'recorded');
    const beforeUpload=client.snapshot();
    assert.equal(await client.reporter.runOnce(),'uploaded',JSON.stringify(client.reporter.health()));
    assert.deepEqual(client.store.query().events.map(event=>event.upload.state),['sent','sent']);

    // Same signed events again (as after a lost receipt): fresh request headers, no new server rows.
    const replay=buffer(fake.service,beforeUpload);
    try{
      assert.equal(await replay.reporter.runOnce(),'uploaded',JSON.stringify(replay.reporter.health()));
      assert.deepEqual(replay.store.query().events.map(event=>event.upload.state),['duplicate','duplicate']);
    }finally{replay.reporter.stop();}

    const remote=await client.reporter.readRemote();
    assert.equal(remote.state,'available',JSON.stringify(remote));
    assert.equal(remote.total,2);
    assert.deepEqual(remote.events.map(event=>event.action).sort(),['open','use']);

    const withdrawn=await client.reporter.withdraw(new Date().toISOString(),fake.service.getDeviceId());
    assert.equal(client.store.getSnapshot().events.length,0,'local records are removed');
    assert.equal(client.store.getSnapshot().withdrawal?.state,'sent',JSON.stringify({withdrawn,withdrawal:client.store.getSnapshot().withdrawal}));
    assert.equal(client.store.getSnapshot().withdrawal?.deletedEvents,2);
    const after=await client.reporter.readRemote();
    assert.equal(after.state,'available');assert.equal(after.total,0);
  }finally{client.reporter.stop();}
});

test('local backend: an uncatalogued plugin is rejected per item with a reason, the rest of the batch is written',
  {skip,todo:skip?false:'C-USAGE per-item host reason is being added by Session A2 (planned shape: rejected[].reason {code,need}); until it lands the whole batch is answered 503'},async()=>{
  const fake=await registeredDevice(),client=buffer(fake.service);
  try{
    await client.record(fact(CATALOGUED,'use','command:it-2:succeeded'));
    await client.record(fact(UNCATALOGUED,'open','page:it-2:presented'));
    assert.equal(await client.reporter.runOnce(),'uploaded',JSON.stringify(client.reporter.health()));
    const rows=Object.fromEntries(client.store.query().events.map(event=>[event.hanaRef,event.upload]));
    assert.equal(rows[CATALOGUED].state,'sent');
    assert.equal(rows[UNCATALOGUED].state,'rejected');
    assert.equal(rows[UNCATALOGUED].code,'USAGE_POINTS_HANA_REF_UNRESOLVED');
  }finally{client.reporter.stop();}
});
