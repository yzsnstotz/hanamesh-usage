import {sharedSettingsResponse} from './fixtures/shared-settings.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createCoreProviderFixture,coreCanonicalRequest,verifyCoreSignature} from '@hanamesh/core/contract/fixtures';
import {capturingFetch} from './fixtures/capturing-fetch.mjs';
const root=process.env.USAGE_TEST_ROOT??resolve(new URL('..',import.meta.url).pathname);
const {EventStore,wireEvent,signingJSON}=await import(pathToFileURL(resolve(root,'lib/core/index.js')));
const {createRecordSeat}=await import(pathToFileURL(resolve(root,'lib/host/record.js')));
const {signUsageEvent}=await import(pathToFileURL(resolve(root,'lib/host/core-link.js')));
const {createUsageReporter}=await import(pathToFileURL(resolve(root,'lib/host/upload.js')));
const NOW=Date.parse('2026-10-11T00:00:00.000Z');
const fact={hanaRef:'fixture.hana',action:'use',sourcePlugin:'fixture.hana',idempotencyKey:'command:source-operation-1:succeeded',occurredAt:new Date(NOW).toISOString(),sourceHanaRef:'fixture.source',targetRef:'source-operation-1',receipt:{providerId:'fixture',model:null,count:1}};
function buffer(core){
  const effects={writes:0,signs:0};
  let snapshot={schemaVersion:1,events:[],withdrawal:null,inventory:{last:null}};
  const port={get:()=>snapshot,set:async value=>{effects.writes++;snapshot=structuredClone(value);}};
  const store=new EventStore(port,5000,()=>NOW);
  const record=createRecordSeat({store,getConsent:()=>core.getConsent(),getDeviceId:()=>core.getDeviceId(),now:()=>NOW,signEvent:event=>{effects.signs++;return signUsageEvent(core,event);}});
  return {store,record,port,effects};
}
// Client side only. Server acceptance/dedupe/conflict/nonce-reuse belong to the real-backend integration test.
async function setup(){
  const {service}=createCoreProviderFixture({initialConsent:'granted',serverOrigin:'https://usage.example'});
  const a=service,b=Object.freeze({...service});
  assert.notEqual(a,b);assert.equal(a.getDeviceId(),b.getDeviceId());assert.equal(a.getPublicKey(),b.getPublicKey());
  return {a,b};
}
const verifyEventSignature=(event,publicKey)=>{const {signature,...fields}=wireEvent(event);return verifyCoreSignature(publicKey,new TextEncoder().encode(signingJSON(fields)),Buffer.from(signature,'base64url'));};
const verifyRequest=(publicKey,call)=>verifyCoreSignature(publicKey,coreCanonicalRequest({method:'POST',path:new URL(call.url).pathname,body:new TextEncoder().encode(call.body)},call.headers['x-hm-timestamp'],call.headers['x-hm-nonce']),Buffer.from(call.headers['x-hm-signature'],'base64url'));
test('Q18 two independent buffers sign the same source fact identically; each request carries its own fresh auth',async()=>{
  const {a,b}=await setup(),left=buffer(a),right=buffer(b),calls=[];
  assert.notEqual(left.port,right.port);
  const x=await left.record(fact),y=await right.record(structuredClone(fact));
  assert.equal(x.disposition,'recorded');assert.deepEqual(y,x);
  const e1=wireEvent(left.store.query().events[0]),e2=wireEvent(right.store.query().events[0]);
  assert.equal(e1.nonce,e2.nonce,'same fact must retain the same event nonce across clients');
  assert.deepEqual(e1,e2);
  for(const event of [e1,e2])assert.equal(verifyEventSignature(event,a.getPublicKey()),true);
  const reporters=[left,right].map((client,index)=>createUsageReporter({store:client.store,link:{get:()=>[a,b][index]},uploadIntervalMs:60000,uploadBatchSize:200,now:()=>NOW,fetchImpl:capturingFetch(calls)}));
  try{for(const reporter of reporters)assert.equal(await reporter.runOnce(),'uploaded');}finally{reporters.forEach(r=>r.stop());}
  assert.equal(calls.length,2);assert.equal(calls[0].body,calls[1].body);
  for(const call of calls){assert.equal(call.method,'POST');assert.equal(call.url,'https://usage.example/v1/usage/events');assert.equal(call.headers['x-hm-device-id'],a.getDeviceId());}
  assert.notEqual(calls[0].headers['x-hm-nonce'],calls[1].headers['x-hm-nonce']);
  for(const call of calls)assert(Number.isSafeInteger(Number(call.headers['x-hm-timestamp'])));
  for(const call of calls)assert(verifyRequest(a.getPublicKey(),call));
});
test('Q18 an event with a lost receipt retries its original body after buffer restart, with fresh HTTP auth',async()=>{
  const {a}=await setup(),client=buffer(a),calls=[];await client.record(fact);
  const options={link:{get:()=>a},uploadIntervalMs:60000,uploadBatchSize:200,now:()=>NOW,fetchImpl:capturingFetch(calls,{failFirst:true})};
  const first=createUsageReporter({...options,store:client.store});
  try{assert.equal(await first.runOnce(),'backoff');}finally{first.stop();}
  assert.equal(client.store.query().events[0].upload.state,'pending');
  const restarted=new EventStore(client.port,5000,()=>NOW),second=createUsageReporter({...options,store:restarted});
  try{assert.equal(await second.runOnce(),'uploaded');}finally{second.stop();}
  assert.equal(calls.length,2);assert.equal(calls[0].body,calls[1].body);
  assert.notEqual(calls[0].headers['x-hm-nonce'],calls[1].headers['x-hm-nonce']);
  for(const call of calls)assert(Number.isSafeInteger(Number(call.headers['x-hm-timestamp'])));
  for(const call of calls)assert(verifyRequest(a.getPublicKey(),call));
});
test('Q18 different device or source keys remain independent; same key with different facts conflicts locally',async()=>{
  const {a,b}=await setup(),left=buffer(a),right=buffer(b);await left.record(fact);await right.record({...fact,action:'open',receipt:null});
  assert.deepEqual(await left.record({...fact,occurredAt:new Date(NOW+1).toISOString()}),{disposition:'rejected',code:'EVENT_IDENTITY_CONFLICT'});
  assert.deepEqual(await left.record({...fact,receipt:{...fact.receipt,count:2}}),{disposition:'rejected',code:'EVENT_IDENTITY_CONFLICT'});
  const original=wireEvent(left.store.query().events[0]);
  const conflict=wireEvent(right.store.query().events[0]);assert.equal(conflict.eventId,original.eventId);assert.notDeepEqual(conflict,original);
  assert.equal(verifyEventSignature(conflict,b.getPublicKey()),true);
  await left.record({...fact,idempotencyKey:'command:source-operation-2:succeeded'});
  const other=wireEvent(left.store.query().events[1]);assert.notEqual(other.eventId,original.eventId);assert.notEqual(other.nonce,original.nonce);
  assert.equal(verifyEventSignature(other,a.getPublicKey()),true);
  const differentSigner=createCoreProviderFixture({initialConsent:'granted'}).service;
  assert.notEqual(differentSigner.getDeviceId(),a.getDeviceId());
  const otherDevice=buffer(differentSigner);await otherDevice.record(fact);
  const deviceEvent=wireEvent(otherDevice.store.query().events[0]);assert.notEqual(deviceEvent.eventId,original.eventId);assert.notEqual(deviceEvent.nonce,original.nonce);
  assert.equal(verifyEventSignature(deviceEvent,differentSigner.getPublicKey()),true);
  assert.equal(verifyEventSignature(deviceEvent,a.getPublicKey()),false);
});
test('Q18 missing source timestamp on a new stable fact is FACT_TIME_UNAVAILABLE, never synthesized from local time',async()=>{
  const {a}=await setup(),client=buffer(a);
  const {occurredAt,...input}=fact;
  assert.deepEqual(await client.record(input),{disposition:'rejected',code:'FACT_TIME_UNAVAILABLE'});
  assert.equal(client.store.query().total,0);
  assert.deepEqual(client.effects,{writes:0,signs:0});
});

for(const key of ['idempotencyKey','sourcePlugin'])test(`Q376 missing ${key} is INVALID_RECORD_INPUT, not a timestamp gap`,async()=>{
  const {a}=await setup(),client=buffer(a),input={...fact};delete input[key];
  assert.deepEqual(await client.record(input),{disposition:'rejected',code:'INVALID_RECORD_INPUT'});
  assert.equal(client.store.query().total,0);assert.deepEqual(client.effects,{writes:0,signs:0});
});

test('Q376 malformed stable keys and source plugins remain invalid before any write or sign',async()=>{
  const {a}=await setup(),client=buffer(a);
  for(const change of [{idempotencyKey:''},{idempotencyKey:42},{sourcePlugin:''},{sourcePlugin:'not a package'},{occurredAt:'invalid-time'}]){
    assert.deepEqual(await client.record({...fact,...change}),{disposition:'rejected',code:'INVALID_RECORD_INPUT'});
  }
  assert.equal(client.store.query().total,0);assert.deepEqual(client.effects,{writes:0,signs:0});
});

test('Q376 persisted replay without time keeps all declared attribution and the original signature nonce and time',async()=>{
  const {a}=await setup(),client=buffer(a),first=await client.record(fact);
  assert.equal(first.disposition,'recorded');
  const before=structuredClone(client.port.get()),effects={...client.effects};
  const {occurredAt,...replay}=fact;
  assert.deepEqual(await client.record(replay),{disposition:'duplicate',eventId:first.eventId});
  assert.deepEqual(client.port.get(),before);assert.deepEqual(client.effects,effects);
});

test('Q376 four-field replay is duplicate only when original optional attribution was null',async()=>{
  const {a}=await setup(),client=buffer(a);
  const plain={...fact,sourceHanaRef:null,targetRef:null,receipt:null};
  const first=await client.record(plain),before=structuredClone(client.port.get()),effects={...client.effects};
  assert.equal(first.disposition,'recorded');
  const replay={hanaRef:plain.hanaRef,action:plain.action,sourcePlugin:plain.sourcePlugin,idempotencyKey:plain.idempotencyKey};
  assert.deepEqual(await client.record(replay),{disposition:'duplicate',eventId:first.eventId});
  assert.deepEqual(client.port.get(),before);assert.deepEqual(client.effects,effects);
});

for(const optional of ['sourceHanaRef','targetRef','receipt'])test(`Q376 omitted non-null ${optional} conflicts instead of being silently restored on replay`,async()=>{
  const {a}=await setup(),client=buffer(a);await client.record(fact);
  const before=structuredClone(client.port.get());
  const {occurredAt,...replay}=fact;delete replay[optional];
  assert.deepEqual(await client.record(replay),{disposition:'rejected',code:'EVENT_IDENTITY_CONFLICT'});
  assert.deepEqual(client.port.get(),before);
  const four={hanaRef:fact.hanaRef,action:fact.action,sourcePlugin:fact.sourcePlugin,idempotencyKey:fact.idempotencyKey};
  assert.deepEqual(await client.record(four),{disposition:'rejected',code:'EVENT_IDENTITY_CONFLICT'});
});

// Q-376 preserves the current local admission subset. Wire's <=160 is not permission to enlarge it.
for(const field of ['hanaRef','sourceHanaRef','sourcePlugin'])for(const length of [128,129,160,161,214])test(`Q376 ${field} local package-form length ${length} has no truncation or implicit wire expansion`,async()=>{
  const {a}=await setup(),client=buffer(a),name='P'.repeat(length),calls=[];
  const result=await client.record({...fact,[field]:name});
  if(length===128){
    assert.equal(result.disposition,'recorded');assert.equal(client.store.query().events[0][field],name);
  }else{
    assert.deepEqual(result,{disposition:'rejected',code:'INVALID_RECORD_INPUT'});
    assert.deepEqual(client.effects,{writes:0,signs:0});
    const reporter=createUsageReporter({store:client.store,link:{get:()=>a},uploadIntervalMs:60000,uploadBatchSize:200,now:()=>NOW,fetchImpl:async(url,options)=>{const policy=sharedSettingsResponse(url,options);if(policy)return policy;calls.push(true);throw new Error('MUST_NOT_SEND');}});
    try{assert.equal(await reporter.runOnce(),'idle');assert.equal(calls.length,0);}finally{reporter.stop();}
  }
});

test('Q376 package and publicly supplied directory identity are preserved independently from collector and registered app',async()=>{
  const {a}=await setup(),client=buffer(a);
  // Synthetic public source declaration only: these names are not proof of a live catalogue mapping.
  const declared=[{hanaRef:'@Fixture/Ordinary.Package',appId:'registered-app-1'},
    {hanaRef:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',appId:'registered-app-2'}];
  for(const [index,item] of declared.entries()){
    const input={...fact,hanaRef:item.hanaRef,targetRef:item.appId,sourcePlugin:'@hanamesh/dsh-app-host',idempotencyKey:`command:declared-source-${index}:succeeded`};
    assert.equal((await client.record(input)).disposition,'recorded');
    const event=client.store.query().events.find(event=>event.evidenceRef===input.idempotencyKey);
    assert.equal(event.hanaRef,item.hanaRef);assert.equal(event.sourcePlugin,input.sourcePlugin);assert.equal(event.targetRef,item.appId);
  }
  for(const bad of ['catalog:item','not a package','/private/path','ghp_synthetic']){
    const before=client.effects.writes;
    assert.deepEqual(await client.record({...fact,hanaRef:bad}),{disposition:'rejected',code:'INVALID_RECORD_INPUT'});
    assert.equal(client.effects.writes,before);
  }
});

test('Q376 absent or unmappable native package owner cannot produce a usage event or send',async()=>{
  const {commandPackage}=await import(pathToFileURL(resolve(root,'lib/host/command-source.js')));
  const {a}=await setup(),client=buffer(a),calls=[];
  const source={entryId:'public-entry',moduleName:'fixture/commands'};
  const entry={id:source.entryId,options:{name:source.moduleName},parent:{tree:{ctx:{baseUrl:'file:///fixture-profile/cordis.yml'}}}};
  for(const found of [null,{name:'fixture.app',version:'1.0.0',manifest:{name:'other.app',version:'1.0.0'}}]){
    const notes=[],name=commandPackage({loader:{entries:()=>[entry]},get:()=>({packageOf:()=>found})},source,code=>notes.push(code));
    assert.equal(name,null);assert.deepEqual(notes,['COMMAND_SOURCE_OWNER_INVALID']);
    if(name!==null)await client.record({...fact,hanaRef:name});
  }
  assert.deepEqual(await client.record({...fact,hanaRef:undefined}),{disposition:'rejected',code:'INVALID_RECORD_INPUT'});
  assert.deepEqual(client.effects,{writes:0,signs:0});
  const reporter=createUsageReporter({store:client.store,link:{get:()=>a},uploadIntervalMs:60000,uploadBatchSize:200,now:()=>NOW,fetchImpl:async(url,options)=>{const policy=sharedSettingsResponse(url,options);if(policy)return policy;calls.push(true);throw new Error('MUST_NOT_SEND');}});
  try{assert.equal(await reporter.runOnce(),'idle');assert.equal(calls.length,0);}finally{reporter.stop();}
});
