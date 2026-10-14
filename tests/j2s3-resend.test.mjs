import test from 'node:test';
import assert from 'node:assert/strict';
import {mountedDeliveryFixture,json} from './fixtures/signed-delivery.mjs';
import {originalFact,deferred} from './fixtures/local-lifecycle.mjs';
import {mountTransport} from '../lib/host/transport.js';
import {core} from './fixtures/helpers.mjs';
const path='/api/hanamesh/usage/events/resend';
const unknown=()=>json({error:{code:'USAGE_STORAGE_UNAVAILABLE',message:'Usage storage is unavailable.',durability:'unconfirmed'}},503);
function publicEntry(api){assert.equal(typeof api.resendEvents,'function','normal hanameshUsage.resendEvents user-intent entry is missing; runOnce must remain protected');return input=>api.resendEvents(input);}
async function unresolved(h,keys=['a']){
  const ids=[];for(const key of keys)ids.push((await h.api.record(originalFact({idempotencyKey:`source:${key}`,targetRef:'original-session',receipt:{providerId:'fixture',model:null,count:1}}))).eventId);
  h.tickSend();await h.api.observeCollection();return ids;
}

test('S06-R01 normal public entry retries only selected original unknown with new HTTP nonce',async t=>{
  const h=await mountedDeliveryFixture(t,{onRequest:(_r,n)=>n===1?unknown():json({accepted:0,duplicates:1,rejected:[],durability:'committed'})});
  try{
    const ids=await unresolved(h,['a','b']),resend=publicEntry(h.api),before=JSON.parse(h.requests[0].body),signs=h.eventSignatures.length;
    const result=await resend({eventIds:[ids[1]]});
    assert.equal(result.state,'processed');assert.deepEqual(result.events,[{eventId:ids[1],delivery:'confirmed',code:null}]);
    assert.equal(h.requests.length,2);assert.deepEqual(JSON.parse(h.requests[1].body),[before.find(e=>e.eventId===ids[1])]);
    assert.equal(h.requests[0].body,JSON.stringify(before),'original fixture batch uses the actual compact wire encoding');
    assert.equal(h.requests[1].body,JSON.stringify([before.find(e=>e.eventId===ids[1])]),'selected event bytes and property order remain original');
    assert.notEqual(h.requests[0].headers['x-hm-nonce'],h.requests[1].headers['x-hm-nonce']);
    assert.equal(h.eventSignatures.length,signs,'resend cannot re-sign or regenerate source facts');
    const observed=await h.api.observeCollection();assert.equal(observed.events.find(e=>e.eventId===ids[0]).delivery,'unconfirmed');
    t.mock.timers.tick(3600000);await h.api.drain();assert.equal(h.requests.length,2,'one selection grants no future retry');
  }finally{await h.close();}
});

test('S06-R02 repeated unknown after user entry consumes intent once and keeps stop protection',async t=>{
  const h=await mountedDeliveryFixture(t,{onRequest:unknown});
  try{
    const [id]=await unresolved(h),resend=publicEntry(h.api),original=h.requests[0].body;
    const result=await resend({eventIds:[id]});assert.equal(result.events[0].delivery,'unconfirmed');assert.equal(h.requests[1].body,original);
    t.mock.timers.tick(3600000);await h.api.drain();await h.api.observeCollection();assert.equal(h.requests.length,2);
    await h.close();const snapshot=h.snapshot(),store=new core.EventStore({get:()=>snapshot,set:async()=>assert.fail('restart must be read-only until new intent')});
    const restarted=h.makeReporter(store);
    try{restarted.start();assert.equal(await restarted.runOnce(),'unconfirmed');t.mock.timers.tick(3600000);await restarted.drain();assert.equal(h.requestCount(),2,'no reusable user intent survives restart');}finally{restarted.stop();}
  }finally{await h.close();}
});

test('S06-R03 user entry refuses malformed selection and current withdrawn consent without HTTP',async t=>{
  const h=await mountedDeliveryFixture(t,{origin:null});
  try{
    const resend=publicEntry(h.api);
    for(const input of [{eventIds:[]},{eventIds:['bad']},{eventIds:[],force:true},null]){
      const result=await resend(input);assert.equal(result.state,'rejected');assert.equal(result.code,'RESEND_INPUT_INVALID');
    }
    const result=await h.api.record(originalFact());h.setConsent('withheld');await h.api.observeCollection();
    const reply=await resend({eventIds:[result.eventId]});assert(['withheld','rejected'].includes(reply.state));assert.equal(h.requests.length,0);
  }finally{await h.close();}
});

test('S06-R04 user entry cannot bypass local persistence failure protection',async t=>{
  let armed=false;
  const h=await mountedDeliveryFixture(t,{onRequest:()=>{armed=true;return unknown();},onWrite:()=>{if(armed)throw Error('PRIVATE_SYNTHETIC_STORAGE_ERROR');}});
  try{
    const [id]=await unresolved(h),resend=publicEntry(h.api);assert.equal(h.requests.length,1);
    const result=await resend({eventIds:[id]});assert.equal(result.state,'rejected');assert.equal(result.code,'UPLOAD_STATE_PERSIST_FAILED');
    assert.equal(h.requests.length,1);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_SYNTHETIC|stack|cause/);
  }finally{await h.close();}
});

test('S06-R05 queued user selection rechecks a withdrawal before starting HTTP',async t=>{
  const gate=deferred(),entered=deferred();let block=false;
  const h=await mountedDeliveryFixture(t,{onRequest:r=>r.options.method==='DELETE'?json({deletedEvents:1}):unknown(),onWrite:async()=>{if(block){entered.resolve();await gate.promise;}}});
  let later;
  try{
    const [id]=await unresolved(h),resend=publicEntry(h.api);block=true;
    later=h.api.record(originalFact({idempotencyKey:'source:later'}));await entered.promise;
    const attempt=resend({eventIds:[id]});h.setConsent('withheld');block=false;gate.resolve();await later;
    const result=await attempt;assert(['withheld','rejected'].includes(result.state));await h.api.observeCollection();
    assert.equal(h.requests.filter(r=>r.method==='POST').length,1,'queued intent does not override newer withdrawal');
  }finally{block=false;gate.resolve();await later;await h.close();}
});

test('S06-R06 normal authenticated Connection route forwards exact selection and rejects intent/config overrides',async()=>{
  const routes=new Map(),disposers=[],calls=[],answer={state:'processed',code:null,events:[],health:null};
  mountTransport({connection:{fetch:{register:r=>{routes.set(r.path,r);return()=>routes.delete(r.path);}}},effect:fn=>disposers.push(fn())},{resendEvents:async input=>{calls.push(input);return answer;}});
  try{
    const route=routes.get(path);assert(route,'normal user route is missing');assert.deepEqual(route.methods,['POST']);
    const input={eventIds:['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']};
    const request=(body,method='POST',query='',type='application/json')=>route.fetch(new Request('http://127.0.0.1'+path+query,{method,headers:{'content-type':type},...(method==='GET'?{}:{body:JSON.stringify(body)})}));
    const reply=await request(input);assert.equal(reply.status,200);assert.equal(reply.headers.get('cache-control'),'no-store');assert.deepEqual(await reply.json(),answer);assert.deepEqual(calls,[input]);
    for(const bad of [{...input,force:true},{...input,authorized:true},{...input,principalId:'p'},{}])assert.equal((await request(bad)).status,400);
    assert.equal((await request(input,'POST','?force=true')).status,400);assert.equal((await request(input,'POST','','text/plain')).status,400);assert.equal((await request(input,'GET')).status,405);assert.equal(calls.length,1);
  }finally{disposers.forEach(fn=>fn());}
});
