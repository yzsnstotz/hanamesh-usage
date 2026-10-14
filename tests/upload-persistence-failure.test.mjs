import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {EventStore,wireEvent} from '../lib/core/index.js';
import {createRecordSeat} from '../lib/host/record.js';
import {signUsageEvent} from '../lib/host/core-link.js';
import {createUsageReporter} from '../lib/host/upload.js';
import {fixtureSigningIdentity,originalFact,localLifecycle,deferred} from './fixtures/local-lifecycle.mjs';

// Q-384 review-stage SOURCE/FIXTURE: actual producer/store/sender; scripted
// receipts are not a real server, and the file port is not native DSH storage.
const unknown=()=>new Response(JSON.stringify({error:{code:'USAGE_STORAGE_UNAVAILABLE',message:'Usage storage is unavailable.',durability:'unconfirmed'}}),{status:503});
const settle=promise=>promise.then(value=>({value}),()=>({rejected:true}));
const plain=snapshot=>snapshot.events.map(wireEvent);
function childEnvironment(overrides){
  const env={...process.env,...overrides};
  // A nested Node --test invocation needs its own TAP runner, not its parent's
  // internal test-worker transport (which otherwise suppresses these tests).
  delete env.NODE_TEST_CONTEXT;
  return env;
}
async function setup(t,{fault='once',response=unknown,file=null,hold=null}={}){
  t.mock.timers.enable({apis:['setTimeout']});
  const identity=fixtureSigningIdentity(),requests=[],writes=[];
  let snapshot={schemaVersion:1,events:[],withdrawal:null,inventory:{last:null}},afterResponse=false,refusals=0,auth=0;
  const global={get:()=>snapshot,set:async next=>{
    writes.push(structuredClone(next));
    if(afterResponse&&(fault==='persistent'||(fault==='once'&&refusals===0))){refusals++;throw new Error('fixture local marker write refused');}
    snapshot=structuredClone(next);if(file)writeFileSync(file,JSON.stringify(snapshot));
  }};
  const store=new EventStore(global),core={getConsent:()=> 'granted',getDeviceId:()=>identity.deviceId,getPublicKey:()=>identity.publicKey,sign:identity.sign,getServerOrigin:()=> 'https://fixture.invalid',signRequest:async()=>({'x-hm-device-id':identity.deviceId,'x-hm-timestamp':String(Date.now()),'x-hm-nonce':`fixture-auth-${++auth}`,'x-hm-signature':'fixture-request-signature'})};
  const record=createRecordSeat({store,getConsent:core.getConsent,getDeviceId:core.getDeviceId,signEvent:event=>signUsageEvent(core,event)});
  assert.equal((await record(originalFact())).disposition,'recorded');
  const before=plain(snapshot),reporter=createUsageReporter({store,link:{get:()=>core},uploadIntervalMs:60000,uploadBatchSize:200,fetchImpl:async(_url,options)=>{
    requests.push({body:options.body,headers:options.headers});
    if(hold){hold.entered.resolve();await hold.release.promise;}
    afterResponse=true;return response();
  }});
  t.after(()=>reporter.stop());
  return {store,reporter,requests,writes,before,snapshot:()=>structuredClone(snapshot),refusals:()=>refusals};
}
function unchanged(f){assert.deepEqual(plain(f.snapshot()),f.before,'local diagnostics never change event identity/time/signature/nonce or wire claims');}

if(!process.env.USAGE_Q384_OBSERVE_CHILD){
  for(const fault of ['once','persistent']){
    test(`Q384 ${fault} marker refusal after explicit unknown is bounded unconfirmed rather than a rejected raw Promise`,async t=>{
      const f=await setup(t,{fault});f.reporter.start();
      assert.deepEqual(await settle(f.reporter.runOnce()),{value:'unconfirmed'});
      assert.equal(f.refusals(),1);assert.equal(f.requests.length,1);
      const health=f.reporter.health();assert.equal(health.state,'unconfirmed');assert.equal(health.lastError,'UPLOAD_STATE_PERSIST_FAILED');assert.equal(health.nextAttemptAt,null);assert.equal(health.lastUploadAt,null);
      assert.deepEqual(f.reporter.delivery(f.store.getSnapshot().events[0]),{eventId:f.store.getSnapshot().events[0].eventId,delivery:'unconfirmed',code:'USAGE_STORAGE_UNAVAILABLE'});
      assert.doesNotMatch(JSON.stringify(health),/fixture local|stack|cause/);unchanged(f);
    });
    test(`Q384 ${fault} failed marker protection survives health/delivery/prune/start and explicit or scheduled work`,async t=>{
      const f=await setup(t,{fault});f.reporter.start();await settle(f.reporter.runOnce());
      for(let i=0;i<3;i++){
        f.reporter.health();f.reporter.delivery(f.store.getSnapshot().events[0]);f.reporter.start();
        await settle(f.reporter.runOnce());
        assert.equal(f.requests.length,1,'reading or restarting the same instance must not release explicit unknown protection');
      }
      assert.equal(f.reporter.health().state,'unconfirmed');
      t.mock.timers.tick(3600000);await f.reporter.drain();assert.equal(f.requests.length,1);unchanged(f);
    });
    test(`Q384 ${fault} marker refusal cannot let an already queued run resubmit the unknown event`,async t=>{
      const hold={entered:deferred(),release:deferred()},f=await setup(t,{fault,hold});f.reporter.start();
      const first=settle(f.reporter.runOnce());await hold.entered.promise;
      const queued=settle(f.reporter.runOnce());hold.release.resolve();await Promise.all([first,queued]);
      assert.equal(f.requests.length,1,'the queued run must see the stop even if durable marker publication failed');
      assert.equal(f.reporter.health().state,'unconfirmed');unchanged(f);
    });
  }

  test('Q384 no POST precedes a durable conservative attempt record; total pre-send write refusal sends nothing',async t=>{
    t.mock.timers.enable({apis:['setTimeout']});
    let snapshot={schemaVersion:1,events:[],withdrawal:null,inventory:{last:null}},reject=false,requests=0,auth=0;
    const store=new EventStore({get:()=>snapshot,set:async next=>{if(reject)throw new Error('fixture admission write refused');snapshot=structuredClone(next);}});
    const identity=fixtureSigningIdentity(),core={getConsent:()=> 'granted',getDeviceId:()=>identity.deviceId,getPublicKey:()=>identity.publicKey,sign:identity.sign,getServerOrigin:()=> 'https://fixture.invalid',signRequest:async()=>{auth++;return {};}};
    const record=createRecordSeat({store,getConsent:core.getConsent,getDeviceId:core.getDeviceId,signEvent:event=>signUsageEvent(core,event)});
    await record(originalFact());const before=plain(snapshot);reject=true;
    const reporter=createUsageReporter({store,link:{get:()=>core},uploadIntervalMs:60000,uploadBatchSize:200,fetchImpl:async()=>{requests++;return unknown();}});t.after(()=>reporter.stop());reporter.start();
    const outcome=await settle(reporter.runOnce());assert.equal(requests,0,'without a durable attempt marker, the request must not enter the transport');assert.equal(auth,0);
    assert.deepEqual(outcome,{value:'stopped'});assert.equal(reporter.health().state,'stopped');assert.equal(reporter.health().lastError,'UPLOAD_STATE_PERSIST_FAILED');
    assert.equal(reporter.delivery(store.getSnapshot().events[0]).delivery,'pending','zero transport attempts is not a formal server unknown');assert.deepEqual(plain(snapshot),before);
  });

  for(const fault of ['once','persistent'])test(`Q384 ${fault} final marker refusal keeps a durable conservative attempt visible to an independent process`,async t=>{
    const dir=mkdtempSync(join(tmpdir(),'usage-q384-restart-'));mkdirSync(join(dir,'dsh'));mkdirSync(join(dir,'tmp'));mkdirSync(join(dir,'profile'));
    const file=join(dir,'events.json'),f=await setup(t,{fault,file});f.reporter.start();await settle(f.reporter.runOnce());f.reporter.stop();
    assert.deepEqual(plain(JSON.parse(readFileSync(file,'utf8'))),f.before);
    const moduleURL=pathToFileURL(join(dir,'readback.test.mjs'));
    const coreURL=new URL('../lib/core/index.js',import.meta.url).href,uploadURL=new URL('../lib/host/upload.js',import.meta.url).href;
    writeFileSync(moduleURL,`import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {EventStore} from ${JSON.stringify(coreURL)};import {createUsageReporter} from ${JSON.stringify(uploadURL)};
test('independent process consumes only persisted attempt state',async t=>{t.mock.timers.enable({apis:['setTimeout']});const snapshot=JSON.parse(readFileSync(${JSON.stringify(file)},'utf8'));let requests=0;const store=new EventStore({get:()=>snapshot,set:async()=>{throw new Error('readback is read-only')}});const reporter=createUsageReporter({store,link:{get:()=>({getConsent:()=> 'granted',getServerOrigin:()=> 'https://fixture.invalid',signRequest:async()=>({})})},uploadIntervalMs:60000,uploadBatchSize:200,fetchImpl:async()=>{requests++;return new Response('{}',{status:503})}});try{reporter.start();await reporter.runOnce().catch(()=>{});assert.equal(requests,0,'restart cannot infer never-sent from a failed final marker write');t.mock.timers.tick(3600000);await reporter.drain();assert.equal(requests,0);assert.equal(reporter.health().state,'unconfirmed');assert.equal(reporter.delivery(store.getSnapshot().events[0]).delivery,'unconfirmed');}finally{reporter.stop();}});`);
    const child=spawnSync(process.execPath,['--test','--test-reporter=tap',fileURLToPath(moduleURL)],{encoding:'utf8',env:childEnvironment({DSH_HOME:join(dir,'dsh'),TMPDIR:join(dir,'tmp')})});
    assert.doesNotMatch(child.stdout+child.stderr,/ERR_MODULE_NOT_FOUND|SyntaxError|ENOTCACHED/);
    assert.equal(child.status,0,child.stdout+child.stderr);assert.match(child.stdout,/# pass 1\b/);unchanged(f);
  });

  test('Q384 crash window after POST starts leaves a readback stop even before its response is known',async t=>{
    const hold={entered:deferred(),release:deferred()},f=await setup(t,{fault:'none',hold});const sending=settle(f.reporter.runOnce());
    await hold.entered.promise;
    // A separate reconstructed store receives only the committed snapshot; no
    // original reporter Set, response, signer handle or pending Promise crosses.
    const snapshot=f.snapshot(),reconstructed=new EventStore({get:()=>snapshot,set:async()=>{throw new Error('readback only');}});let requests=0;
    const second=createUsageReporter({store:reconstructed,link:{get:()=>({getConsent:()=> 'granted',getServerOrigin:()=> 'https://fixture.invalid',signRequest:async()=>({})})},uploadIntervalMs:60000,uploadBatchSize:200,fetchImpl:async()=>{requests++;return unknown();}});
    try{second.start();await settle(second.runOnce());assert.equal(requests,0,'a persisted unresolved attempt must survive the lost response window');t.mock.timers.tick(5000);await second.drain();assert.equal(requests,0);assert.equal(second.delivery(reconstructed.getSnapshot().events[0]).delivery,'unconfirmed');}finally{second.stop();hold.release.resolve();await sending;}
  });

  for(const [label,response,outcome,code] of [
    ['committed',()=>new Response('{"accepted":1,"duplicates":0,"rejected":[],"durability":"committed"}',{status:200}),'uploaded',null],
    ['all-duplicate',()=>new Response('{"accepted":0,"duplicates":1,"rejected":[],"durability":"committed"}',{status:200}),'uploaded',null],
    ['401',()=>new Response('{}',{status:401}),'backoff','UPLOAD_UNAUTHORIZED'],
    ['ordinary-503',()=>new Response('{"error":{"code":"USAGE_EVENT_HOOK_FAILED"}}',{status:503}),'backoff','UPLOAD_UNAVAILABLE'],
    ['malformed-200',()=>new Response('not-json',{status:200}),'backoff','UPLOAD_RESPONSE_INVALID'],
  ])test(`Q384 compatible ${label} receipt clears only its own conservative attempt and preserves established outcome`,async t=>{
    const f=await setup(t,{fault:'none',response});assert.deepEqual(await settle(f.reporter.runOnce()),{value:outcome});
    assert.notEqual(f.reporter.health().state,'unconfirmed');assert.equal(f.reporter.health().lastError,code);unchanged(f);
    if(outcome==='backoff'){
      const snapshot=f.snapshot(),store=new EventStore({get:()=>snapshot,set:async()=>{throw new Error('readback only');}});
      const readback=createUsageReporter({store,link:{get:()=>null},uploadIntervalMs:60000,uploadBatchSize:200});
      try{assert.equal(readback.delivery(store.getSnapshot().events[0]).delivery,'pending','a durably recorded ordinary failure is not a server unknown after restart');assert.notEqual(readback.health().state,'unconfirmed');}finally{readback.stop();}
    }
  });

  for(const fault of ['once','persistent'])test(`Q384 actual observeCollection exposes ${fault} local marker failure and never drops the server unknown`,()=>{
    // Isolate the actual scheduled-Promise rejection in the current RED source.
    // The child uses the real mounted API and TAP, not a substitute observer.
    const dir=mkdtempSync(join(tmpdir(),'usage-q384-observe-'));mkdirSync(join(dir,'dsh'));mkdirSync(join(dir,'tmp'));mkdirSync(join(dir,'profile'));
    const child=spawnSync(process.execPath,['--test','--test-reporter=tap',fileURLToPath(import.meta.url)],{encoding:'utf8',env:childEnvironment({USAGE_Q384_OBSERVE_CHILD:fault,DSH_HOME:join(dir,'dsh'),TMPDIR:join(dir,'tmp')})});
    assert.doesNotMatch(child.stdout+child.stderr,/ERR_MODULE_NOT_FOUND|SyntaxError|ENOTCACHED/);
    assert.equal(child.status,0,child.stdout+child.stderr);assert.match(child.stdout,/# pass 1\b/);
  });
}else{
  test('Q384 mounted observer reports the formal unknown and bounded local write failure',async t=>{
    const fault=process.env.USAGE_Q384_OBSERVE_CHILD;let armed=false,refusals=0;
    const h=await localLifecycle(t,{onRequest:async()=>{armed=true;return unknown();},onWrite:async next=>{if(armed&&next.events.length&&(fault==='persistent'||refusals===0)){refusals++;throw new Error('fixture marker refusal');}}});
    try{
      const result=await h.api.record(originalFact()),before=plain(h.snapshot());h.tickSend();
      const value=await h.api.observeCollection();
      assert.equal(value.state,'failed');assert.equal(value.code,'COLLECTION_FAILED','local persistence failure is not successful processing');
      assert.equal(value.health.outbox.state,'unconfirmed');assert.equal(value.health.outbox.lastError,'UPLOAD_STATE_PERSIST_FAILED');
      const event=value.events.find(event=>event.eventId===result.eventId);assert.equal(event.delivery,'unconfirmed');assert.equal(event.code,'USAGE_STORAGE_UNAVAILABLE');
      assert.doesNotMatch(JSON.stringify(value),/fixture marker|stack|cause/);assert.deepEqual(plain(h.snapshot()),before);
      for(let i=0;i<3;i++){h.api.health();await h.api.observeCollection();}t.mock.timers.tick(3600000);await h.api.drain();assert.equal(h.requests.length,1);
    }finally{await h.close();}
  });
}
