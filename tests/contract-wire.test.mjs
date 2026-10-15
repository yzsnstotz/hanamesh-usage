import test from 'node:test';
import assert from 'node:assert/strict';
import {createUsageEvent, wireEvent} from '../lib/core/index.js';
const input = overrides => ({deviceId:'If4x36FUomFia_hUBG_SJxt77UtqvkWqWId-9H-XIbk',hanaRef:'sample-plugin',action:'use',
  occurredAt:'2026-10-08T00:00:00.000Z',eventId:'0f8fad5b-d9cb-469f-a165-70867728950e',
  nonce:'nFixtureNonce0001',signature:null,source:'seat',sourcePlugin:'sample-plugin',evidenceRef:'use:1',...overrides});
test('published event nonce is a token, independent of the producer entropy encoding',()=>{
  assert.equal(wireEvent(createUsageEvent(input({}))).nonce,'nFixtureNonce0001');
});
test('local stub device ids cannot enter the public wire event',()=>{
  const event=createUsageEvent(input({deviceId:'device_P2_STANDIN',nonce:'nAQIDBAUGBwgJCgsMDQ4PEA'}));
  assert.throws(()=>wireEvent(event),{code:'INVALID_USAGE_EVENT'});
});

test('mixed signed batch with a local stub sends nothing and keeps every event pending',async()=>{
  const {EventStore}=await import('../lib/core/index.js');
  const {createUsageReporter}=await import('../lib/host/upload.js');
  let writes=0;let snapshot={schemaVersion:1,events:[],withdrawal:null,inventory:{last:null}};
  const store=new EventStore({get:()=>snapshot,set:async next=>{writes++;snapshot=structuredClone(next);}});
  const signature=Buffer.alloc(64).toString('base64url');
  await store.put(createUsageEvent(input({signature})));
  await store.put(createUsageEvent(input({deviceId:'device_P2_STANDIN',eventId:'7c9e6679-7425-40de-944b-e07fc1f90ae7',signature})));
  let signatures=0,requests=0;
  const reporter=createUsageReporter({store,link:{get:()=>({getConsent:()=> 'granted',getServerOrigin:()=> 'https://usage.example',
    signRequest:async()=>{signatures++;return {};}})},uploadIntervalMs:60000,uploadBatchSize:200,
    fetchImpl:async()=>{requests++;throw new Error('MUST_NOT_SEND');}});
  const before=writes;assert.equal(await reporter.runOnce(),'stopped');assert.equal(writes,before);
  reporter.stop();
  assert.equal(signatures,0);assert.equal(requests,0);
  assert.equal(reporter.health().lastError,'UPLOAD_EVENT_INVALID');
  assert.deepEqual(store.query().events.map(event=>event.upload.state),['pending','pending']);
});

// C-CORE (consumer) and C-USAGE-LOCAL (provider). No sibling module is installed: Core is the in-repo
// Ed25519 test double; the C-USAGE-LOCAL expectations below are written out from the contract.
const {coreHandshakeCases,createCoreFake,verifyCoreSignature,RFC8032_TEST1}=await import('./fixtures/core-fake.mjs');
const {createHash}=await import('node:crypto');
// C-USAGE-LOCAL record eventId: UUIDv5(namespace, JSON [deviceId, sourcePlugin, idempotencyKey]).
const USAGE_EVENT_NAMESPACE='6aa7b4d1-88f5-4f96-89e2-cf5ffca77c2d';
const usageRecordEventId=(deviceId,sourcePlugin,idempotencyKey)=>{
  const b=createHash('sha1').update(Buffer.from(USAGE_EVENT_NAMESPACE.replaceAll('-',''),'hex')).update(JSON.stringify([deviceId,sourcePlugin,idempotencyKey]),'utf8').digest().subarray(0,16);
  b[6]=(b[6]&0x0f)|0x50;b[8]=(b[8]&0x3f)|0x80;const h=b.toString('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
};
const USAGE_RECORD_CODES=['INVALID_RECORD_INPUT','DEVICE_UNAVAILABLE','EVENTS_CAPACITY_REACHED','EVENT_IDENTITY_CONFLICT','RECORD_FAILED'];
const usageLocalHealth=(core,consent,deviceId,outboxState)=>({pending:0,recoveryComplete:true,failures:{},consent,core,deviceId,
  outbox:{state:outboxState,pending:0,sent:0,duplicate:0,rejected:0,lastUploadAt:null,nextAttemptAt:null,lastError:null},
  withdrawal:null,
  inventory:{available:false,source:'none',lastScanAt:null,lastError:null,failureKind:null,unreadable:0,detail:null},filtered:{commands:0,pages:0}});
const usageLocal={
  input:{hanaRef:'@hanamesh/example-app',action:'open',idempotencyKey:'page:fixture-1',sourcePlugin:'@hanamesh/dsh-app-host'},
  results:{withheld:{disposition:'withheld'},duplicate:{disposition:'duplicate'},
    EVENT_IDENTITY_CONFLICT:{disposition:'rejected',code:'EVENT_IDENTITY_CONFLICT'},INVALID_RECORD_INPUT:{disposition:'rejected',code:'INVALID_RECORD_INPUT'}},
  health:usageLocalHealth('present','granted',RFC8032_TEST1.deviceId,'idle'),
  healthCoreAbsent:usageLocalHealth('absent','unknown',null,'stopped'),
};
const {duckCore,signUsageEvent}=await import('../lib/host/core-link.js');
const {signingJSON}=await import('../lib/core/index.js');
const {fixtureHost}=await import('./fixtures/host.mjs');

test('Q18 C-USAGE-LOCAL APIC-13 handoff replays the already persisted fact with every attribution field',async()=>{
  const {createUsageLocalQ18Examples}=await import('../test/fixtures/usage-local-q18.mjs');
  const examples=await createUsageLocalQ18Examples();
  assert.match(examples.label,/FIXTURE/);
  assert.equal(examples.results.recorded.disposition,'recorded');
  assert.deepEqual(examples.results.duplicate,{...examples.results.recorded,disposition:'duplicate'});
  assert.deepEqual(examples.results.conflict,{disposition:'rejected',code:'EVENT_IDENTITY_CONFLICT'});
  assert.deepEqual(examples.results.gap,{...examples.results.recorded,disposition:'duplicate'});
  assert.deepEqual(examples.results.withheld,{disposition:'withheld'});
});

test('Q376 provider separates new missing-time facts from persisted attribution conflicts',async()=>{
  const h=await fixtureHost({bound:false,consent:'granted'});
  try{
    const fact={hanaRef:'fixture.app',action:'use',sourcePlugin:'fixture.collector',idempotencyKey:'command:original:succeeded',occurredAt:new Date().toISOString(),targetRef:'registered-app',receipt:{providerId:'fixture',model:null,count:1}};
    const first=await h.api.record(fact);assert.equal(first.disposition,'recorded');
    const {occurredAt,...replay}=fact;
    assert.deepEqual(await h.api.record({...replay,idempotencyKey:'command:new:succeeded'}),{disposition:'rejected',code:'FACT_TIME_UNAVAILABLE'});
    assert.deepEqual(await h.api.record({...replay,targetRef:'other-app'}),{disposition:'rejected',code:'EVENT_IDENTITY_CONFLICT'});
    assert.deepEqual(await h.api.record(replay),{disposition:'duplicate',eventId:first.eventId});
    assert.equal(h.api.events().total,1);assert.equal(h.api.events().events[0].occurredAt,fact.occurredAt);
  }finally{await h.close();}
});

test('C-CORE consumer: duckCore classifies every published handshake case like the contract',()=>{
  const cases=coreHandshakeCases();
  assert(cases.length>=13);
  for(const {id,value,expected} of cases){
    const linked=duckCore(value);
    assert.equal(linked.status,expected.status,id);
    assert.equal(linked.core===null,expected.status!=='present',id);
  }
});

test('C-CORE consumer: usage events signed through Core verify with its public key',async()=>{
  const fixture=createCoreFake({seed:RFC8032_TEST1.seed,initialConsent:'granted'});
  const linked=duckCore(fixture.service);assert.equal(linked.status,'present');
  const deviceId=linked.core.getDeviceId();assert.equal(deviceId,RFC8032_TEST1.deviceId);assert.equal(linked.core.getPublicKey(),RFC8032_TEST1.publicKey);
  const event=signUsageEvent(linked.core,createUsageEvent(input({deviceId})));
  const {signature,...six}=wireEvent(event);
  assert(verifyCoreSignature(linked.core.getPublicKey(),new TextEncoder().encode(signingJSON(six)),Buffer.from(signature,'base64url')));
  assert.equal(verifyCoreSignature(linked.core.getPublicKey(),new TextEncoder().encode(signingJSON({...six,action:'open'})),Buffer.from(signature,'base64url')),false);
  assert.equal(linked.core.getConsent(),'granted');
  assert.equal(linked.core.getSession().deviceId,deviceId);
});

// Same keys at every level. A member that is null on either side is a nullable member (string|null, object|null): the example cannot fix its type.
const sameShape=(actual,expected,path='health')=>{
  if(actual===null||expected===null)return;
  if(typeof expected!=='object'||Array.isArray(expected)||path.endsWith('.failures'))return assert.equal(typeof actual,typeof expected,path);
  assert.deepEqual(Object.keys(actual),Object.keys(expected),path);
  for(const key of Object.keys(expected))sameShape(actual[key],expected[key],`${path}.${key}`);
};

test('C-USAGE-LOCAL provider: record returns the published dispositions, eventId and codes',async()=>{
  const examples=usageLocal;
  const deviceId='If4x36FUomFia_hUBG_SJxt77UtqvkWqWId-9H-XIbk';
  const h=await fixtureHost({consent:'withheld',deviceId});
  try{
    const call={...examples.input,occurredAt:new Date().toISOString()};
    assert.deepEqual(await h.api.record(call),examples.results.withheld);
    h.setConsent('granted');
    const recorded=await h.api.record(call);
    assert.deepEqual(recorded,{disposition:'recorded',eventId:usageRecordEventId(deviceId,call.sourcePlugin,call.idempotencyKey)});
    assert.deepEqual(await h.api.record(call),{...examples.results.duplicate,eventId:recorded.eventId});
    assert.deepEqual(await h.api.record({...call,hanaRef:'@hanamesh/other-app'}),examples.results.EVENT_IDENTITY_CONFLICT);
    assert.deepEqual(await h.api.record({...call,action:'install'}),examples.results.INVALID_RECORD_INPUT);
    for(const code of ['EVENT_IDENTITY_CONFLICT','INVALID_RECORD_INPUT'])assert(USAGE_RECORD_CODES.includes(code));
  }finally{await h.close();}
});

test('C-USAGE-LOCAL provider: health has the published HealthSnapshot shape, core present and absent',async()=>{
  const examples=usageLocal;
  for(const [coreStatus,expected] of [['present',examples.health],['absent',examples.healthCoreAbsent]]){
    const h=await fixtureHost({coreStatus,consent:'granted'});
    try{
      const health=h.api.health();
      sameShape(health,expected);
      assert.equal(health.core,expected.core);assert.equal(health.consent,expected.consent);
      assert.equal(health.deviceId===null,expected.deviceId===null);
    }finally{await h.close();}
  }
});
