import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {root} from './fixtures/helpers.mjs';

const core=await import(pathToFileURL(resolve(root,'lib/core/index.js')).href);
const host=await import(pathToFileURL(resolve(root,'lib/host/upload.js')).href);
class EventGlobal{constructor(){this.snapshot={schemaVersion:1,events:[],withdrawal:null,inventory:{last:null}};}get(){return this.snapshot;}async set(next){this.snapshot=structuredClone(next);}}
const NOW=Date.parse('2026-10-08T00:00:00.000Z');
const row=(i)=>({deviceId:'device_FIXTURE',eventId:`00000000-0000-5000-8000-00000000000${i}`,nonce:'n',principalId:'p',hanaRef:'dsh-update-notifier',action:'use',occurredAt:'2026-10-07T00:00:0'+i+'.000Z',receivedAt:'2026-10-07T00:00:1'+i+'.000Z',signature:'s'});
function fixture({respond,origin='https://usage.example',deviceId='device_FIXTURE',consent='granted'}={}){
  const store=new core.EventStore(new EventGlobal(),5000);const requests=[],signed=[];
  const link={get:()=>({getConsent:()=>consent,getDeviceId:()=>deviceId,getServerOrigin:()=>origin,signRequest:async input=>{signed.push(input);return {'x-hm-device-id':deviceId,'x-hm-timestamp':'1','x-hm-nonce':`nonce-${signed.length}`,'x-hm-signature':'sig'};},sign:()=>new Uint8Array(64)})};
  const fetchImpl=async(url,options)=>{requests.push({url:new URL(String(url)),options});return respond(requests.length,new URL(String(url)),options);};
  const reporter=host.createUsageReporter({store,link,uploadIntervalMs:60000,uploadBatchSize:200,fetchImpl,now:()=>NOW});
  return {store,requests,signed,reporter};
}
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});

test('R1 remote readback pages the device-signed public route to the end and never writes local state',async()=>{
  const f=fixture({respond:n=>n===1?json({items:[row(1),row(2)],nextAfter:'cursor-1',window:{}}):json({items:[row(3)],nextAfter:null,window:{}})});
  const before=structuredClone(f.store.getSnapshot());
  const result=await f.reporter.readRemote();
  assert.equal(result.state,'available');assert.equal(result.total,3);assert.equal(result.deviceId,'device_FIXTURE');
  assert.deepEqual(result.events.map(e=>e.eventId),[row(1).eventId,row(2).eventId,row(3).eventId]);
  assert.deepEqual(Object.keys(result.events[0]),['eventId','hanaRef','action','occurredAt','receivedAt']);
  assert.equal(f.requests.length,2);
  for(const [i,request] of f.requests.entries()){
    assert.equal(request.options.method,'GET');assert.equal(request.url.pathname,'/v1/usage/me/devices/device_FIXTURE/events');
    assert.equal(request.options.headers.origin,'https://usage.example');assert.equal(request.options.headers['x-hm-nonce'],`nonce-${i+1}`);
    assert.equal(request.url.searchParams.get('limit'),'200');
    // 90-day server window ending 5 minutes ahead; exact millisecond ISO strings.
    assert.equal(request.url.searchParams.get('to'),'2026-10-08T00:05:00.000Z');assert.equal(request.url.searchParams.get('from'),'2026-07-10T00:05:00.000Z');
  }
  assert.equal(f.requests[0].url.searchParams.get('after'),null);assert.equal(f.requests[1].url.searchParams.get('after'),'cursor-1');
  // Identity signs the path only; the query string is not part of the signature preimage.
  assert.deepEqual(f.signed,[{method:'GET',path:'/v1/usage/me/devices/device_FIXTURE/events',body:null},{method:'GET',path:'/v1/usage/me/devices/device_FIXTURE/events',body:null}]);
  assert.deepEqual(f.store.getSnapshot(),before);
});
test('R2 an empty server page is an actual zero, distinct from unknown',async()=>{
  const f=fixture({respond:()=>json({items:[],nextAfter:null,window:{}})});
  assert.deepEqual(await f.reporter.readRemote(),{state:'available',deviceId:'device_FIXTURE',total:0,events:[],code:null,httpStatus:200,checkedAt:'2026-10-08T00:00:00.000Z'});
});
test('R3 refusal, outage and malformed bodies are unknown with bounded codes, never zero',async()=>{
  for(const [respond,code,status] of [
    [()=>json({error:{code:'USAGE_DEVICE_MISMATCH'}},403),'REMOTE_UNAUTHORIZED',403],
    [()=>json({error:{code:'USAGE_AUTH_REQUIRED'}},401),'REMOTE_UNAUTHORIZED',401],
    [()=>new Response('sk-SYNTHETIC_SECRET',{status:503}),'REMOTE_UNAVAILABLE',503],
    [()=>{throw new TypeError('fetch failed');},'REMOTE_UNAVAILABLE',null],
    [()=>json({items:'x',nextAfter:null}),'REMOTE_RESPONSE_INVALID',200],
    [n=>n===1?json({items:[row(1)],nextAfter:'c'}):json({},500),'REMOTE_UNAVAILABLE',500],
  ]){
    const f=fixture({respond});const result=await f.reporter.readRemote();
    assert.equal(result.state,'unknown');assert.equal(result.total,null);assert.deepEqual(result.events,[]);assert.equal(result.code,code);assert.equal(result.httpStatus,status);
    assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC|sk-/);
  }
});
test('R4 no server origin or no device is reported, not guessed',async()=>{
  const offline=fixture({origin:null,respond:()=>assert.fail('no request')});
  assert.deepEqual(await offline.reporter.readRemote(),{state:'offline',deviceId:'device_FIXTURE',total:null,events:[],code:'SERVER_ORIGIN_UNAVAILABLE',httpStatus:null,checkedAt:'2026-10-08T00:00:00.000Z'});
  const nodevice=fixture({deviceId:'',respond:()=>assert.fail('no request')});
  const result=await nodevice.reporter.readRemote();assert.equal(result.state,'unknown');assert.equal(result.code,'DEVICE_UNAVAILABLE');assert.equal(nodevice.requests.length,0);
});
test('R5 remote readback is only on the authenticated exact registry, GET-only and query-free',async()=>{
  const {mountTransport}=await import(pathToFileURL(resolve(root,'lib/host/transport.js')).href);
  const routes=new Map(),disposers=[];let calls=0;
  const snapshot={state:'unknown',deviceId:'device_FIXTURE',total:null,events:[],code:'REMOTE_UNAVAILABLE',httpStatus:503,checkedAt:'2026-10-08T00:00:00.000Z'};
  mountTransport({connection:{fetch:{register:route=>{routes.set(route.path,route);return ()=>routes.delete(route.path);}}},effect:fn=>disposers.push(fn())},{remote:async()=>{calls++;return snapshot;}});
  const route=routes.get('/api/hanamesh/usage/panel/remote');assert(route);assert.deepEqual(route.methods,['GET']);
  const call=(suffix='',method='GET')=>route.fetch(new Request('http://127.0.0.1/api/hanamesh/usage/panel/remote'+suffix,{method}));
  assert.equal((await call('','POST')).status,405);assert.equal((await call('?deviceId=other')).status,400);assert.equal(calls,0);
  const response=await call();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),snapshot);assert.equal(calls,1);
  for(const dispose of disposers)dispose();
});
