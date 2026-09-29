import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {root} from './fixtures/helpers.mjs';
import {fixtureHost} from './fixtures/host.mjs';
import http from 'node:http';
const core=await import(pathToFileURL(resolve(root,'lib/core/index.js')).href);
const {createUsageReporter}=await import(pathToFileURL(resolve(root,'lib/host/upload.js')).href);

class EventGlobal{constructor(){this.snapshot={schemaVersion:1,events:[],withdrawal:null,inventory:{last:null}};this.log=[];}get(){return this.snapshot;}async set(next){this.log.push(this.snapshot.events.length>0&&next.events.length===0&&next.withdrawal?'local-clear':'set');this.snapshot=structuredClone(next);}}
async function fixture({origin='https://usage.example',responses=[200]}={}){
  const global=new EventGlobal(),store=new core.EventStore(global);await store.put(core.createUsageEvent({deviceId:'device_FIXTURE',hanaRef:'pkg',action:'use',occurredAt:'2026-09-19T00:00:00.000Z',eventId:core.eventIdForSeat('device_FIXTURE','app-host','use-1'),nonce:'AQIDBAUGBwgJCgsMDQ4PEA',signature:'c2lnbmF0dXJl',source:'seat',sourcePlugin:'app-host',evidenceRef:'use-1'}));
  const requests=[];let n=0,currentOrigin=origin,currentConsent='withheld';const service={getConsent:()=>currentConsent,getDeviceId:()=> 'device_FIXTURE',getServerOrigin:()=>currentOrigin,signRequest:async()=>({'x-hm-device-id':'device_FIXTURE','x-hm-timestamp':'1','x-hm-nonce':'nonce','x-hm-signature':'signature'})};
  const reporter=createUsageReporter({store,link:{get:()=>service},uploadIntervalMs:60000,uploadBatchSize:200,fetchImpl:async(url,options)=>{requests.push({url:String(url),method:options.method});global.log.push('remote-delete');const status=responses[Math.min(n++,responses.length-1)];return new Response(status===200?'{"deletedEvents":1}':'sk-SYNTHETIC_ERROR',{status});},now:()=>Date.parse('2026-09-19T00:02:00.000Z')});
  return {global,store,requests,reporter,setOrigin:value=>{currentOrigin=value;},setConsent:value=>{currentConsent=value;}};
}
test('U15 withdrawal clears locally before DELETE and success is never resent',async()=>{const f=await fixture();assert.equal(await f.reporter.withdraw('2026-09-19T00:02:00.000Z'),'sent');assert.deepEqual(f.global.log.slice(-3),['local-clear','remote-delete','set']);assert.equal(f.requests.length,1);assert.equal(f.store.query().total,0);assert.equal(f.store.getSnapshot().withdrawal.state,'sent');assert.equal(await f.reporter.withdraw('2026-09-19T00:02:00.000Z'),'sent');assert.equal(f.requests.length,1);});
test('U15 failed withdrawal retries, then stops after the first success',async()=>{const f=await fixture({responses:[503,200]});assert.equal(await f.reporter.withdraw('2026-09-19T00:02:00.000Z'),'backoff');assert.equal(f.store.getSnapshot().withdrawal.state,'pending');assert.equal(await f.reporter.retryWithdrawal(),'sent');assert.equal(await f.reporter.retryWithdrawal(),'sent');assert.equal(f.requests.length,2);assert.equal(f.store.getSnapshot().withdrawal.attempts,2);});
test('U15 offline withdrawal only clears local state',async()=>{const f=await fixture({origin:null});assert.equal(await f.reporter.withdraw('2026-09-19T00:02:00.000Z'),'offline');assert.equal(f.requests.length,0);assert.equal(f.store.getSnapshot().withdrawal.state,'offline');});

test('U15 mounted restart restores a persisted pending deletion while consent stays withheld',async()=>{
  const requests=[];const server=http.createServer((req,res)=>{requests.push(req.method);res.setHeader('content-type','application/json');res.end('{"deletedEvents":3}');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let h;
  try{h=await fixtureHost({serverOrigin:`http://127.0.0.1:${server.address().port}`,eventSnapshot:{schemaVersion:1,events:[],inventory:{last:null},withdrawal:{requestedAt:'2026-09-19T00:02:00.000Z',deviceId:'device_A',state:'pending',attempts:1,deletedEvents:null,lastError:'WITHDRAW_UNAVAILABLE'}}});
    await h.api.drain();assert.equal(h.api.health().withdrawal.state,'sent');assert.equal(h.api.health().withdrawal.attempts,2);assert.deepEqual(requests,['DELETE']);assert.equal(h.api.health().consent,'withheld');
  }finally{await h?.close();await new Promise(resolve=>server.close(resolve));}
});

test('U15 regrant preserves a failed pending deletion until the remote delete succeeds',async()=>{
  const f=await fixture({responses:[503,503,200]});
  try{await f.reporter.withdraw('2026-09-19T00:02:00.000Z');await f.reporter.grant();assert.equal(f.store.getSnapshot().withdrawal?.state,'pending');assert.equal(f.requests.length,2);await f.reporter.retryWithdrawal();assert.equal(f.store.getSnapshot().withdrawal.state,'sent');assert.equal(f.requests.length,3);}finally{f.reporter.stop();}
});

test('U15 missing origin after a failed remote delete cannot downgrade its durable obligation to offline',async()=>{
  const f=await fixture({responses:[503]});try{await f.reporter.withdraw();f.setOrigin(null);await f.reporter.grant();assert.equal(f.store.getSnapshot().withdrawal?.state,'pending');assert.equal(f.requests.length,1);}finally{f.reporter.stop();}
});

test('U15 failed regrant blocks new uploads; successful retry resumes them with granted consent',async()=>{
  const f=await fixture({responses:[503,503,200]});try{await f.reporter.withdraw();f.setConsent('granted');await f.reporter.grant();assert.equal(await f.reporter.runOnce(),'backoff');assert.equal(f.requests.length,2);await f.reporter.retryWithdrawal();assert.equal(f.store.getSnapshot().withdrawal,null);assert.equal(f.reporter.health().state,'idle');assert.equal(f.requests.length,3);}finally{f.reporter.stop();}
});
