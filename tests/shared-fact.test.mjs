import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createCoreProviderFixture,createCoreSharedIdentityFixture,coreCanonicalRequest,verifyCoreSignature} from '@hanamesh/api-contracts/core';
import {createUsageProviderFixture,eventDigest,verifyEventSignature} from '@hanamesh/api-contracts/usage';
import {identityDeviceRequestHeaders} from '@hanamesh/api-contracts/identity';
const root=process.env.USAGE_TEST_ROOT??resolve(new URL('..',import.meta.url).pathname);
const {EventStore,wireEvent}=await import(pathToFileURL(resolve(root,'lib/core/index.js')));
const {createRecordSeat}=await import(pathToFileURL(resolve(root,'lib/host/record.js')));
const {signUsageEvent}=await import(pathToFileURL(resolve(root,'lib/host/core-link.js')));
const {createUsageReporter}=await import(pathToFileURL(resolve(root,'lib/host/upload.js')));
const NOW=Date.parse('2026-10-11T00:00:00.000Z');
const fact={hanaRef:'fixture.hana',action:'use',sourcePlugin:'fixture.hana',idempotencyKey:'command:source-operation-1:succeeded',occurredAt:new Date(NOW).toISOString(),sourceHanaRef:'fixture.source',targetRef:'source-operation-1',receipt:{providerId:'fixture',model:null,count:1}};
function buffer(core){
  let snapshot={schemaVersion:1,events:[],withdrawal:null,inventory:{last:null}};
  const port={get:()=>snapshot,set:async value=>{snapshot=structuredClone(value);}};
  const store=new EventStore(port,5000,()=>NOW);
  const record=createRecordSeat({store,getConsent:()=>core.getConsent(),getDeviceId:()=>core.getDeviceId(),now:()=>NOW,signEvent:event=>signUsageEvent(core,event)});
  return {store,record,port};
}
async function setup(){
  const server=await createUsageProviderFixture();
  // Only synthetic signing handles cross this fixture adapter. No private key is read or copied.
  const base=createCoreProviderFixture({deviceId:server.key.deviceId,initialConsent:'granted',serverOrigin:'https://usage.example'}).service;
  let clock=NOW;
  const seed={...base,getPublicKey:()=>server.key.publicKey,sign:bytes=>Buffer.from(server.key.sign(new TextDecoder().decode(bytes)),'base64url'),signRequest:async input=>identityDeviceRequestHeaders(server.key,{method:input.method,path:input.path,body:input.body===null?'':new TextDecoder().decode(input.body)},clock++)};
  const shared=createCoreSharedIdentityFixture();
  const a=shared.createProvider({existingIdentity:seed,initialConsent:'granted',serverOrigin:'https://usage.example'}).service;
  const b=shared.createProvider({initialConsent:'granted',serverOrigin:'https://usage.example'}).service;
  assert.notEqual(a,b);assert.equal(a.getDeviceId(),b.getDeviceId());assert.equal(a.getPublicKey(),b.getPublicKey());
  return {server,a,b};
}
function transport(server,calls,{loseFirstReceipt=false}={}){
  return async(url,options)=>{
    const body=options.body,headers=options.headers,input=JSON.parse(body);
    const request={method:options.method,path:url.pathname,bodyHash:createHash('sha256').update(body).digest('hex'),headers};
    const result=await server.service.ingestEvents(request,input);
    calls.push({body,headers,result});
    if(loseFirstReceipt&&calls.length===1)throw new Error('FIXTURE_ACK_LOST');
    return new Response(JSON.stringify(result),{status:200});
  };
}
test('Q18 two independent buffers sign the same source fact with equal digest; C-USAGE accepts then duplicates',async()=>{
  const {server,a,b}=await setup(),left=buffer(a),right=buffer(b),calls=[];
  assert.notEqual(left.port,right.port);
  const x=await left.record(fact),y=await right.record(structuredClone(fact));
  assert.equal(x.disposition,'recorded');assert.deepEqual(y,x);
  const e1=wireEvent(left.store.query().events[0]),e2=wireEvent(right.store.query().events[0]);
  assert.equal(e1.nonce,e2.nonce,'same fact must retain the same event nonce across clients');
  assert.equal(eventDigest(e1),eventDigest(e2));
  for(const event of [e1,e2])assert.equal(verifyEventSignature(event,a.getPublicKey()),true);
  const reporters=[left,right].map((client,index)=>createUsageReporter({store:client.store,link:{get:()=>[a,b][index]},uploadIntervalMs:60000,uploadBatchSize:200,now:()=>NOW,fetchImpl:transport(server,calls)}));
  try{for(const reporter of reporters)assert.equal(await reporter.runOnce(),'uploaded');}finally{reporters.forEach(r=>r.stop());}
  assert.deepEqual(calls.map(c=>c.result),[{accepted:1,duplicates:0,rejected:[],durability:'committed'},{accepted:0,duplicates:1,rejected:[],durability:'committed'}]);
  assert.notEqual(calls[0].headers['x-hm-nonce'],calls[1].headers['x-hm-nonce']);
  assert.notEqual(calls[0].headers['x-hm-timestamp'],calls[1].headers['x-hm-timestamp']);
  for(const call of calls)assert(verifyCoreSignature(a.getPublicKey(),coreCanonicalRequest({method:'POST',path:'/v1/usage/events',body:new TextEncoder().encode(call.body)},call.headers['x-hm-timestamp'],call.headers['x-hm-nonce']),Buffer.from(call.headers['x-hm-signature'],'base64url')));
  const contribution=await server.service.getContributions({deviceRequest:server.request('GET','/v1/usage/me/contributions')},server.window);
  assert.equal(contribution.sources.events,1);
});
test('Q18 an accepted event with a lost receipt retries its original nonce after buffer restart, with fresh HTTP auth',async()=>{
  const {server,a}=await setup(),client=buffer(a),calls=[];await client.record(fact);
  const options={link:{get:()=>a},uploadIntervalMs:60000,uploadBatchSize:200,now:()=>NOW,fetchImpl:transport(server,calls,{loseFirstReceipt:true})};
  const first=createUsageReporter({...options,store:client.store});
  try{assert.equal(await first.runOnce(),'backoff');}finally{first.stop();}
  const restarted=new EventStore(client.port,5000,()=>NOW),second=createUsageReporter({...options,store:restarted});
  try{assert.equal(await second.runOnce(),'uploaded');}finally{second.stop();}
  assert.equal(calls[0].body,calls[1].body);assert.notEqual(calls[0].headers['x-hm-nonce'],calls[1].headers['x-hm-nonce']);
  assert.equal(calls[1].result.duplicates,1);assert.equal(restarted.query().events[0].upload.state,'duplicate');
});
test('Q18 different device or source keys remain independent; same key with different facts conflicts locally and in C-USAGE',async()=>{
  const {server,a,b}=await setup(),left=buffer(a),right=buffer(b);await left.record(fact);await right.record({...fact,action:'open',receipt:null});
  assert.deepEqual(await left.record({...fact,occurredAt:new Date(NOW+1).toISOString()}),{disposition:'rejected',code:'EVENT_IDENTITY_CONFLICT'});
  assert.deepEqual(await left.record({...fact,receipt:{...fact.receipt,count:2}}),{disposition:'rejected',code:'EVENT_IDENTITY_CONFLICT'});
  const send=async event=>server.service.ingestEvents(server.request('POST','/v1/usage/events',[event]),[event]);
  const original=wireEvent(left.store.query().events[0]);assert.equal((await send(original)).accepted,1);
  const conflict=wireEvent(right.store.query().events[0]);assert.equal(conflict.eventId,original.eventId);
  assert.equal(verifyEventSignature(conflict,b.getPublicKey()),true);
  assert.deepEqual((await send(conflict)).rejected,[{eventId:original.eventId,code:'USAGE_EVENT_CONFLICT'}]);
  await left.record({...fact,idempotencyKey:'command:source-operation-2:succeeded'});
  const other=wireEvent(left.store.query().events[1]);assert.notEqual(other.eventId,original.eventId);assert.notEqual(other.nonce,original.nonce);assert.equal((await send(other)).accepted,1);
  const differentSigner=createCoreProviderFixture({initialConsent:'granted'}).service;
  const differentKey={publicKey:differentSigner.getPublicKey(),deviceId:createHash('sha256').update(Buffer.from(differentSigner.getPublicKey(),'base64url')).digest('base64url'),sign:message=>Buffer.from(differentSigner.sign(new TextEncoder().encode(message))).toString('base64url')};
  const challenge=await server.identity.deviceRegistration.createChallenge('register');
  await server.identity.deviceRegistration.registerDevice({publicKey:differentKey.publicKey,nonce:challenge.nonce,signature:differentKey.sign(challenge.nonce+differentKey.publicKey)});
  const otherDevice=buffer({...differentSigner,getDeviceId:()=>differentKey.deviceId});await otherDevice.record(fact);
  const deviceEvent=wireEvent(otherDevice.store.query().events[0]);assert.notEqual(deviceEvent.eventId,original.eventId);assert.notEqual(deviceEvent.nonce,original.nonce);
  assert.equal(verifyEventSignature(deviceEvent,differentKey.publicKey),true);
  const body=JSON.stringify([deviceEvent]);
  assert.equal((await server.service.ingestEvents({method:'POST',path:'/v1/usage/events',bodyHash:createHash('sha256').update(body).digest('hex'),headers:identityDeviceRequestHeaders(differentKey,{method:'POST',path:'/v1/usage/events',body},NOW)},[deviceEvent])).accepted,1);
  const changedNonce=server.event({...original,nonce:'changed.event.nonce'});
  assert.deepEqual((await send(changedNonce)).rejected,[{eventId:original.eventId,code:'USAGE_EVENT_CONFLICT'}]);
  const nonceReuse=server.event({nonce:original.nonce});assert.deepEqual((await send(nonceReuse)).rejected,[{eventId:nonceReuse.eventId,code:'USAGE_NONCE_REUSED'}]);
});
test('Q18 missing source timestamp or stable fact key is an explicit input gap, never synthesized from local time',async()=>{
  const {a}=await setup(),client=buffer(a);
  for(const key of ['occurredAt','idempotencyKey','sourcePlugin']){const input={...fact};delete input[key];assert.deepEqual(await client.record(input),{disposition:'rejected',code:'INVALID_RECORD_INPUT'},key);}
  assert.equal(client.store.query().total,0);
});
