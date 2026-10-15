import test from 'node:test';
import assert from 'node:assert/strict';
import {EventStore} from '../lib/core/index.js';
import {createUsageReporter} from '../lib/host/upload.js';
const settings={version:2,uploadIntervalMs:6000,catalogRefreshMs:1000,backfillWindowDays:30,countUnconfirmedCalls:false,channelWeights:{dsh:1,claude:1,codex:1}};
function fixture(t,fetchImpl){
 let snapshot={schemaVersion:1,events:[],withdrawal:null,inventory:{last:null}},consent='granted',now=0;const store=new EventStore({get:()=>snapshot,set:async x=>{snapshot=structuredClone(x);}});
 const core={getConsent:()=>consent,getDeviceId:()=> 'A'.repeat(43),getServerOrigin:()=> 'https://fixture.invalid',signRequest:async()=>({})};
 const reporter=createUsageReporter({store,link:{get:()=>core},uploadIntervalMs:999999,uploadBatchSize:200,fetchImpl,now:()=>now});t.after(()=>reporter.stop());return {reporter,setConsent:x=>consent=x,setNow:x=>now=x};
}
test('G DSH fetches shared settings only after consent, reports actual interval and schedules by it',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let requests=0;const f=fixture(t,async(url,init)=>{assert.equal(new URL(url).pathname,'/v1/usage/settings');assert.equal(init.method,'GET');requests++;return Response.json(settings);});
 f.setConsent('withheld');assert.equal(await f.reporter.runOnce(),'withheld');assert.equal(requests,0);f.setConsent('granted');f.reporter.start();f.setNow(5000);t.mock.timers.tick(5000);await f.reporter.drain();await Promise.resolve();
 assert.equal(requests,1);assert.equal(f.reporter.health().uploadIntervalMs,6000);assert.equal(f.reporter.health().settings.version,2);
 f.setNow(10999);t.mock.timers.tick(5999);await f.reporter.drain();assert.equal(requests,1);f.setNow(11000);t.mock.timers.tick(1);await f.reporter.drain();assert.equal(requests,2);
});
test('G DSH missing or malformed shared settings never claims the old interval is effective',async t=>{
 for(const response of [new Response('{}',{status:503}),Response.json({...settings,countUnconfirmedCalls:'yes'}),Response.json({...settings,version:0}),Response.json({...settings,channelWeights:{dsh:1,claude:1,codex:-1}})]){
  const f=fixture(t,async()=>response);assert.equal(await f.reporter.runOnce(),'backoff');assert.match(f.reporter.health().lastError,/^USAGE_SETTINGS_/);assert.equal(f.reporter.health().uploadIntervalMs,null);assert.equal(f.reporter.health().settings,null);
 }
});
