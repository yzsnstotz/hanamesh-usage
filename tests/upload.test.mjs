import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {root} from './fixtures/helpers.mjs';

const core=await import(pathToFileURL(resolve(root,'lib/core/index.js')).href);
let host=null;try{host=await import(pathToFileURL(resolve(root,'lib/host/upload.js')).href);}catch{}
class EventGlobal{constructor(){this.snapshot={schemaVersion:1,events:[],withdrawal:null,inventory:{last:null}};}get(){return this.snapshot;}async set(next){this.snapshot=structuredClone(next);}}
function nonce(index){const bytes=Buffer.alloc(16);bytes.writeUInt32BE(index,12);return bytes.toString('base64url');}
async function fixture({count=3,consent='granted',origin='https://usage.example',respond}={}){
  const store=new core.EventStore(new EventGlobal(),5000);const events=[];
  for(let i=0;i<count;i++){const event=core.createUsageEvent({deviceId:'device_FIXTURE',hanaRef:`p${String(i).padEnd(119,'x')}`,action:'use',occurredAt:'2026-09-19T00:00:00.000Z',eventId:core.eventIdForSeat('device_FIXTURE','app-host',`use-${i}`),nonce:nonce(i),signature:Buffer.alloc(64,i).toString('base64url'),source:'seat',sourcePlugin:'app-host',evidenceRef:`use-${i}`});events.push(event);await store.put(event);}
  let currentConsent=consent,currentOrigin=origin;const requests=[];
  const linked={get:()=>({getConsent:()=>currentConsent,getDeviceId:()=> 'device_FIXTURE',getServerOrigin:()=>currentOrigin,signRequest:async input=>({'x-hm-device-id':'device_FIXTURE','x-hm-timestamp':'1','x-hm-nonce':'request-nonce','x-hm-signature':'request-signature'}),sign:()=>new Uint8Array(64)})};
  const fetchImpl=async(url,options)=>{requests.push({url:String(url),options});return respond?respond(requests.length,url,options):new Response(JSON.stringify({accepted:count,duplicates:0,rejected:[],durability:'committed'}),{status:200,headers:{'content-type':'application/json'}});};
  const reporter=host?.createUsageReporter({store,link:linked,uploadIntervalMs:60000,uploadBatchSize:200,fetchImpl,now:()=>Date.parse('2026-09-19T00:01:00.000Z')});
  return {store,events,requests,reporter,setConsent:value=>{currentConsent=value;},setOrigin:value=>{currentOrigin=value;}};
}

test('U13 upload reporter module is present',()=>assert.equal(typeof host?.createUsageReporter,'function'));
test('U13 accepted, duplicate and rejected outcomes become terminal in one batch',async()=>{
  const f=await fixture({respond:async()=>new Response(JSON.stringify({accepted:1,duplicates:1,rejected:[{eventId:f.events[2].eventId,code:'USAGE_INPUT_INVALID'}],durability:'pending-host-commit'}),{status:200})});
  const result=await f.reporter.runOnce();assert.equal(result,'uploaded');assert.equal(f.requests.length,1);const body=JSON.parse(f.requests[0].options.body);assert.ok(Array.isArray(body));assert.equal(body.length,3);assert(body.every(event=>Object.keys(event).length===7));assert.equal(f.requests[0].options.headers.origin,'https://usage.example');
  assert.deepEqual(f.store.query().events.map(event=>event.upload.state),['sent','duplicate','rejected']);assert.equal(f.reporter.health().sent,1);assert.equal(f.reporter.health().duplicate,1);assert.equal(f.reporter.health().rejected,1);
});
test('U14 401 and 5xx retain pending events, increment attempts and expose only bounded errors',async()=>{
  for(const [status,code] of [[401,'UPLOAD_UNAUTHORIZED'],[503,'UPLOAD_UNAVAILABLE']]){const f=await fixture({respond:async()=>new Response('sk-SYNTHETIC_RESPONSE_SECRET',{status})});assert.equal(await f.reporter.runOnce(),'backoff');const event=f.store.query().events[0];assert.equal(event.upload.state,'pending');assert.equal(event.upload.attempts,1);assert.equal(f.reporter.health().lastError,code);assert.doesNotMatch(JSON.stringify(f.store.getSnapshot())+JSON.stringify(f.reporter.health()),/SYNTHETIC|sk-/);}
});
test('U14 64KiB limit halves a large batch and offline origin sends nothing',async()=>{
  const large=await fixture({count:200,respond:async(_n,_url,options)=>{const body=JSON.parse(options.body);return new Response(JSON.stringify({accepted:body.length,duplicates:0,rejected:[],durability:'committed'}),{status:200});}});await large.reporter.runOnce();const bytes=Buffer.byteLength(large.requests[0].options.body);assert(bytes<=65536);assert(large.store.query({state:'pending',limit:1000}).total>0);
  const offline=await fixture({origin:null});assert.equal(await offline.reporter.runOnce(),'offline');assert.equal(offline.requests.length,0);assert.equal(offline.reporter.health().state,'offline');
});
test('U16 withheld consent performs zero requests across repeated triggers',async()=>{const f=await fixture({consent:'withheld'});for(let i=0;i<5;i++)assert.equal(await f.reporter.runOnce(),'withheld');assert.equal(f.requests.length,0);});

test('T6 attributed events upload the optional keys verbatim while plain events keep seven keys',async()=>{
  const f=await fixture({count:1,respond:async()=>new Response(JSON.stringify({accepted:2,duplicates:0,rejected:[],durability:'committed'}),{status:200})});
  const attributed=core.createUsageEvent({deviceId:'device_FIXTURE',hanaRef:'@hanamesh/app-vibe',action:'use',occurredAt:'2026-09-19T00:00:00.000Z',eventId:core.eventIdForSeat('device_FIXTURE','app-host','use:vibe:2026091900'),nonce:nonce(9),signature:Buffer.alloc(64,9).toString('base64url'),source:'seat',sourcePlugin:'app-host',evidenceRef:'use:vibe:2026091900',targetRef:'vibe',receipt:{providerId:'deepseek',model:'deepseek-chat',count:4}});
  await f.store.put(attributed);
  assert.equal(await f.reporter.runOnce(),'uploaded');const body=JSON.parse(f.requests[0].options.body);assert.equal(body.length,2);
  assert.deepEqual(Object.keys(body[0]),['deviceId','hanaRef','action','occurredAt','eventId','nonce','signature']);
  assert.deepEqual(Object.keys(body[1]),['deviceId','hanaRef','action','occurredAt','eventId','nonce','signature','targetRef','receipt']);
  assert.deepEqual(body[1].receipt,{providerId:'deepseek',model:'deepseek-chat',count:4});assert.equal(body[1].targetRef,'vibe');assert.equal('sourceHanaRef' in body[1],false);
  assert.deepEqual(f.store.query().events.map(event=>event.upload.state),['sent','sent']);
});
