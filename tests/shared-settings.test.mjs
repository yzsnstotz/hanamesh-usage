import test from 'node:test';
import assert from 'node:assert/strict';
import {EventStore,createUsageEvent} from '../lib/core/index.js';
import {createUsageReporter} from '../lib/host/upload.js';
const settings={version:2,uploadIntervalMs:6000,catalogRefreshMs:1000,backfillWindowDays:30,countUnconfirmedCalls:false,channelWeights:{dsh:1,claude:1,codex:1}};
function fixture(t,fetchImpl){
 let snapshot={schemaVersion:1,events:[],withdrawal:null,inventory:{last:null}},consent='granted',now=0;const store=new EventStore({get:()=>snapshot,set:async x=>{snapshot=structuredClone(x);}});
 const core={getConsent:()=>consent,getDeviceId:()=> 'A'.repeat(43),getServerOrigin:()=> 'https://fixture.invalid',signRequest:async()=>({})};
 const reporter=createUsageReporter({store,link:{get:()=>core},uploadIntervalMs:999999,uploadBatchSize:200,fetchImpl,now:()=>now});t.after(()=>reporter.stop());return {reporter,store,setConsent:x=>consent=x,setNow:x=>now=x};
}
test('G DSH fetches shared settings only after consent, reports actual interval and schedules by it',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let requests=0;const f=fixture(t,async(url,init)=>{assert.equal(new URL(url).pathname,'/v1/usage/settings');assert.equal(init.method,'GET');requests++;return Response.json(settings);});
 f.setConsent('withheld');assert.equal(await f.reporter.runOnce(),'withheld');assert.equal(requests,0);f.setConsent('granted');f.reporter.start();f.setNow(5000);t.mock.timers.tick(5000);await f.reporter.drain();await Promise.resolve();
 assert.equal(requests,1);assert.equal(f.reporter.health().uploadIntervalMs,6000);assert.equal(f.reporter.health().settings.version,2);
 f.setNow(10999);t.mock.timers.tick(5999);await f.reporter.drain();assert.equal(requests,1);f.setNow(11000);t.mock.timers.tick(1);await f.reporter.drain();assert.equal(requests,2);
});
test('old backend settings 404 preserves all pending signed facts and attempts, then resumes after upgrade',async t=>{
 let available=false,posts=0;const f=fixture(t,async(url)=>{if(new URL(url).pathname==='/v1/usage/settings')return available?Response.json(settings):Response.json({error:{code:'NOT_FOUND'}},{status:404});posts++;return Response.json({accepted:7,duplicates:0,rejected:[],durability:'committed'});});
 for(let i=0;i<7;i++)await f.store.put(createUsageEvent({deviceId:'A'.repeat(43),hanaRef:'fixture-plugin',action:'open',occurredAt:'1970-01-01T00:00:00.000Z',eventId:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,nonce:'fixture-valid-'+i,signature:Buffer.alloc(64).toString('base64url'),source:'loader',sourcePlugin:null,evidenceRef:'fixture-upgrade'}));
 const before=f.store.getSnapshot();assert.equal(await f.reporter.runOnce(),'backoff');assert.equal(f.reporter.health().lastError,'USAGE_SETTINGS_HTTP_404');assert.equal(f.reporter.health().nextAttemptAt,'1970-01-01T00:01:00.000Z');assert.deepEqual(f.store.getSnapshot(),before);assert.equal(posts,0);
 available=true;f.setNow(60000);assert.equal(await f.reporter.runOnce(),'uploaded');assert.equal(posts,1);for(const row of f.store.getSnapshot().events){assert.equal(row.upload.state,'sent');assert.equal(row.upload.attempts,1);const old=before.events.find(x=>x.eventId===row.eventId);assert.equal(row.nonce,old.nonce);assert.equal(row.signature,old.signature);}
});
test('G DSH missing or malformed shared settings never claims the old interval is effective',async t=>{
 for(const response of [new Response('{}',{status:503}),Response.json({...settings,countUnconfirmedCalls:'yes'}),Response.json({...settings,version:0}),Response.json({...settings,channelWeights:{dsh:1,claude:1,codex:-1}})]){
  const f=fixture(t,async()=>response);assert.equal(await f.reporter.runOnce(),'backoff');assert.match(f.reporter.health().lastError,/^USAGE_SETTINGS_/);assert.equal(f.reporter.health().uploadIntervalMs,null);assert.equal(f.reporter.health().settings,null);
 }
});
