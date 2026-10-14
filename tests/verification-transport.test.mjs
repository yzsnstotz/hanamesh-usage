import test from 'node:test';
import assert from 'node:assert/strict';
import {mountTransport} from '../lib/host/transport.js';
const base='/api/hanamesh/usage/verification';
const fact={hanaRef:'fixture.ordinary',action:'use',sourcePlugin:'@hanamesh/dsh-app-host',idempotencyKey:'use:source-operation-1',occurredAt:'2026-10-15T00:00:00.007Z',sourceHanaRef:'fixture.origin',targetRef:'registered-app-1',receipt:{providerId:'fixture',model:null,count:1}};
function host({verification=false,throwCode=null}={}){
  const routes=new Map(),disposers=[],calls=[];
  const health={pending:0,recoveryComplete:true,failures:{},consent:'granted',core:'present',deviceId:'If4x36FUomFia_hUBG_SJxt77UtqvkWqWId-9H-XIbk',outbox:{state:'offline',pending:1,sent:0,duplicate:0,rejected:0,lastUploadAt:null,nextAttemptAt:null,lastError:null},derive:{skipped:{consentWithheld:0,executorUnavailable:0,timeUnavailable:0,noDevice:0}},withdrawal:{requestedAt:'2026-10-15T00:00:01.007Z',deviceId:'If4x36FUomFia_hUBG_SJxt77UtqvkWqWId-9H-XIbk',state:'offline',attempts:1,deletedEvents:null,lastError:null},inventory:{available:false,source:'none',lastScanAt:null,detail:null}};
  const recordResult={disposition:'rejected',code:'FACT_TIME_UNAVAILABLE'};
  const observed={state:'processed',code:null,through:7,events:[{eventId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',delivery:'unconfirmed',code:'USAGE_STORAGE_UNAVAILABLE'}],health};
  const api={record:async input=>{calls.push({call:'record',input});if(throwCode)throw Object.assign(new Error('RAW_PRIVATE_ERROR_MUST_NOT_LEAK'),{code:throwCode});return recordResult;},health:()=>{calls.push({call:'health'});return health;},observeCollection:async()=>{calls.push({call:'observeCollection'});return observed;}};
  const ctx={connection:{fetch:{register(route){routes.set(route.path,route);return()=>routes.delete(route.path);}}},effect:fn=>disposers.push(fn())};
  mountTransport(ctx,api,{verification});
  return {routes,calls,api,health,recordResult,observed,close:()=>disposers.forEach(fn=>fn()),async request(path,{method='GET',body}={}){const route=routes.get(new URL(path,'http://127.0.0.1').pathname);if(!route)return new Response('missing',{status:404});return route.fetch(new Request(new URL(path,'http://127.0.0.1'),{method,headers:{'content-type':'application/json'},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})}));}};
}
function enabled(h){assert(h.routes.has(base),'test-only capability route is missing');assert(h.routes.has(`${base}/call`),'editable three-call bridge is missing');}
test('USAGE02-V1 default production transport has no verification capability or callable bridge',async()=>{
  const h=host();try{assert.equal(h.routes.size,9);assert.equal((await h.request(base)).status,404);assert.equal((await h.request(`${base}/call`,{method:'POST',body:{call:'record',input:fact,verification:true}})).status,404);assert.equal(h.calls.length,0);}finally{h.close();}
});
test('USAGE02-V2 enabled routes stay in the existing authenticated Connection registry and release completely',async()=>{
  const h=host({verification:true});try{enabled(h);assert.deepEqual(h.routes.get(base).methods,['GET']);assert.deepEqual(h.routes.get(`${base}/call`).methods,['POST']);assert.equal(h.routes.get(`${base}/call`).requestBody,'buffered');const response=await h.request(base);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),{enabled:true,calls:['record','health','observeCollection'],deviceId:h.health.deviceId});}finally{h.close();}assert.equal(h.routes.size,0);
});
for(const call of ['record','health','observeCollection'])test(`USAGE02-V3 ${call} forwards edited input to this instance and returns its complete actual result`,async()=>{
  const h=host({verification:true});try{enabled(h);const input=call==='record'?structuredClone(fact):null,response=await h.request(`${base}/call`,{method:'POST',body:{call,input}});assert.equal(response.status,200);const actual=await response.json();assert.deepEqual(actual,{call,input,result:call==='record'?h.recordResult:call==='health'?h.health:h.observed,health:h.health});assert(h.calls.some(item=>item.call===call));if(call==='record')assert.deepEqual(h.calls.find(item=>item.call===call).input,fact);assert.doesNotMatch(JSON.stringify(actual),/PASS|RAW_PRIVATE/);}finally{h.close();}
});
test('USAGE02-V4 exact four-field replay is not padded with time, new identity, app metadata or success',async()=>{
  const h=host({verification:true});try{enabled(h);const input=Object.fromEntries(['hanaRef','action','idempotencyKey','sourcePlugin'].map(key=>[key,fact[key]]));const actual=await (await h.request(`${base}/call`,{method:'POST',body:{call:'record',input}})).json();assert.deepEqual(h.calls.find(item=>item.call==='record').input,input);assert.deepEqual(actual.input,input);assert.deepEqual(actual.result,h.recordResult);}finally{h.close();}
});
test('USAGE02-V5 unknown calls, malformed bodies and authority/configuration fields never invoke the service',async()=>{
  const h=host({verification:true});try{enabled(h);for(const body of ['not json',{call:'signRequest',input:null},{call:'record',input:fact,verification:true},{call:'record',input:fact,principalId:'p'},{call:'health',input:{}},{call:'observeCollection',input:{through:999}},{call:'record',input:null}]){const before=h.calls.length,response=await h.request(`${base}/call`,{method:'POST',body});assert.equal(response.status,400);assert.deepEqual(await response.json(),{error:{code:'USAGE_VERIFICATION_INVALID'}});assert.equal(h.calls.length,before);}}finally{h.close();}
});
test('USAGE02-V6 unexpected service Error is bounded and does not serialize stack/message/cause',async()=>{
  const h=host({verification:true,throwCode:'UNKNOWN_ERROR'});try{enabled(h);const response=await h.request(`${base}/call`,{method:'POST',body:{call:'record',input:fact}});assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:{code:'USAGE_UNAVAILABLE'}});}finally{h.close();}
});
test('USAGE02-V7 method mismatch cannot trigger a record or expose the editable bridge',async()=>{
  const h=host({verification:true});try{enabled(h);assert.equal((await h.request(`${base}/call`)).status,405);assert.equal((await h.request(base,{method:'POST',body:{}})).status,405);assert.equal(h.calls.length,0);}finally{h.close();}
});
test('USAGE02-V8 normal development configuration may explicitly enable verification; production cannot',async()=>{
  const {apply}=await import('../lib/host/index.js');const old=process.env.NODE_ENV;
  try{process.env.NODE_ENV='production';await assert.rejects(apply({}, {verification:true}),{code:'INVALID_CONFIG'});process.env.NODE_ENV='development';const effects=[];await assert.doesNotReject(apply({effect:fn=>{effects.push(fn);}}, {verification:true}),'normal development test build must support explicit verification configuration');assert.equal(effects.length,1);}finally{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old;}
});
