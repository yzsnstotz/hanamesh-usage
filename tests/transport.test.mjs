import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {core,root,record} from './fixtures/helpers.mjs';
const {mountTransport}=await import(pathToFileURL(resolve(root,'lib/host/transport.js')).href);
function fixture({allowExport=false,fail=false}={}){
  const event=core.createUsageEvent({deviceId:'device_A',hanaRef:'pkg',action:'open',occurredAt:'2026-09-19T00:00:00.000Z',eventId:core.eventIdForSeat('device_A','app-host','open-1'),nonce:'AQIDBAUGBwgJCgsMDQ4PEA',signature:null,source:'seat',sourcePlugin:'app-host',evidenceRef:'open-1'});
  const routes=new Map(),effects=[],api={query:filter=>{if(fail)throw Error('sk-SYNTHETIC_SECRET');return core.queryRecords([record()],filter);},export:filter=>{if(!allowExport)throw new core.UsageError('EXPORT_DISABLED');return core.queryRecords([record()],filter);},events:()=>({total:1,events:[event]}),health:()=>({pending:0,recoveryComplete:true,failures:{},consent:'withheld',outbox:{pending:1,sent:0,duplicate:0,rejected:0,lastUploadAt:null}})};
  const ctx={connection:{fetch:{register:r=>{routes.set(r.path,r);return async()=>routes.delete(r.path);}}},effect:fn=>{effects.push(fn());}};
  mountTransport(ctx,api);
  return {routes,close:async()=>{for(const fn of effects)await fn();},request:async(path,method='GET')=>{
    const url=new URL(path,'http://127.0.0.1'),route=routes.get(url.pathname);return await route.fetch(new Request(url,{method}));
  }};
}
test('authenticated exact route registry only; lifecycle removes all routes',async()=>{
  const f=fixture();assert.equal(f.routes.size,5);for(const r of f.routes.values()){assert(r.path.startsWith('/api/'));assert.equal(r.requestBody,'buffered');}await f.close();assert.equal(f.routes.size,0);
});
test('query API uses no-store headers; HTML has distinct unavailable label',async()=>{
  const f=fixture(),r=await f.request('/api/hanamesh/usage?result=completed&limit=1');assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal((await r.json()).total,1);
  const view=await f.request('/api/hanamesh/usage/view');assert.match(view.headers.get('content-security-policy'),/default-src 'none'/);const html=await view.text();assert.match(html,/— unavailable/);assert.match(html,/上报状态/);assert.doesNotMatch(html,/<script/i);
  const events=await f.request('/api/hanamesh/usage/events?state=pending&limit=5');const eventBody=await events.json();assert.equal(eventBody.events[0].hanaRef,'pkg');assert.equal(Object.keys(eventBody.events[0]).length,15);assert.deepEqual([eventBody.events[0].sourceHanaRef,eventBody.events[0].targetRef,eventBody.events[0].receipt],[null,null,null]);
  const health=await f.request('/api/hanamesh/usage/health');assert.equal((await health.json()).consent,'withheld');await f.close();
});
test('unknown, repeated, nonnumeric or out-of-range parameters are rejected',async()=>{
  const f=fixture();for(const q of ['prompt=x','limit=1&limit=2','limit=1e3','from=NaN','offset=-1','result=success','limit=1001'])assert.equal((await f.request('/api/hanamesh/usage?'+q)).status,400,q);await f.close();
});
test('export is POST only and opt-in',async()=>{
  const f=fixture();assert.equal((await f.request('/api/hanamesh/usage/export')).status,405);assert.equal((await f.request('/api/hanamesh/usage/export','POST')).status,403);await f.close();
  const g=fixture({allowExport:true}),r=await g.request('/api/hanamesh/usage/export','POST');assert.equal(r.status,200);assert.match(r.headers.get('content-disposition'),/attachment/);await g.close();
});
test('transport unexpected errors never serialize original Error',async()=>{
  const f=fixture({fail:true}),r=await f.request('/api/hanamesh/usage');assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'USAGE_UNAVAILABLE'});await f.close();
});
