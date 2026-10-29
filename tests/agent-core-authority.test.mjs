import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {createHash,randomUUID,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {AgentStore,atomicJSON} from '../src/agent/store.mjs';
import {uploadOnce} from '../lib/agent/upload.mjs';
const cli=process.env.HM_TEST_NORMAL_CORE_CLI;if(!cli)throw Error('TEST_NORMAL_CORE026_CLI_REQUIRED');
const hash=s=>createHash('sha256').update(s).digest('hex');
const catalog={plugins:[{channel:'codex',pluginId:'probe@market',hanaRef:'plan-d:probe'}],settings:{backfillWindowDays:30,countUnconfirmedCalls:false}};
const row=(id='old-call',success=true)=>({factId:hash(id),channel:'codex',occurredAt:new Date().toISOString(),disposition:success===null?'unverified':'attributed',pluginId:'probe@market',feature:'skill:probe',success});
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'hm-agent-core-authority-'));t.after(()=>rm(root,{recursive:true,force:true}));const shared=join(root,'shared'),agent=join(shared,'agent/usage');let approved=false;
 // Explicit Identity/Usage onboarding transport fixture. CoreCLI and its device ledger are actual fixed normal0326.
 const server=createServer(async(req,res)=>{let body='';for await(const b of req)body+=b;let result;
  if(req.url==='/v1/identity/devices/challenge')result={nonce:randomBytes(32).toString('base64url'),expiresAt:new Date(Date.now()+300000).toISOString()};
  else if(req.url==='/v1/identity/devices'){const p=JSON.parse(body);result={deviceId:createHash('sha256').update(Buffer.from(p.publicKey,'base64url')).digest('base64url'),principalId:randomUUID()};}
  else{const parts=req.url.split('/'),deviceId=parts[5],consentId=parts[7],active=req.method==='GET'&&approved;result={deviceId,consentId,state:active?'active':'pending',authorization:active?'website':null,agreedAt:active?new Date().toISOString():null,noticeVersion:'hm-agent-usage-v1',includeBackfill:true,binding:active?{accountPrincipalId:'11111111-1111-4111-8111-111111111111',linkedAt:new Date().toISOString()}:null,barrier:'committed'};}
  res.setHeader('content-type','application/json');res.end(JSON.stringify(result));});await new Promise(ok=>server.listen(0,'127.0.0.1',ok));t.after(()=>new Promise(ok=>server.close(ok)));
 const origin='http://127.0.0.1:'+server.address().port,config={sharedHome:shared,serverOrigin:origin,websiteOrigin:origin};
 const call=input=>new Promise((ok,bad)=>{const p=spawn(process.execPath,[cli],{env:{PATH:process.env.PATH,HOME:root,TMPDIR:root},stdio:['pipe','pipe','pipe']});let out='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',()=>{});p.on('error',bad);p.on('close',()=>{try{const v=JSON.parse(out);if(v.error)bad(Error(v.error.code));else ok(v.result);}catch(e){bad(e);}});p.stdin.end(JSON.stringify({config,input}));});
 await call({operation:'prepareOnboarding'});approved=true;assert.equal((await call({operation:'syncOnboarding'})).consent.state,'granted');
 return {root,shared,agent,call,config,store:()=>new AgentStore(agent,{coreCall:call})};
}
test('actual Core decision survives entire Agent payload/seal root loss and reopen',async t=>{const f=await fixture(t),s=f.store(),bad={...row(),remote:{remotePluginId:'p',version:'1.0.0',bundleSha256:'1'.repeat(64),contentSha256:'2'.repeat(64),verified:false},pluginId:'probe@openai-curated-remote',success:null,disposition:'unverified'};await s.record(bad,true);const positive=row('genuinely-new-call');await s.record(positive,true);assert.equal((await s.pending(catalog)).length,1);await rm(f.agent,{recursive:true});const reopened=f.store();await reopened.record(row(),true);assert.deepEqual(await reopened.pending(catalog),[],'Agent loss cannot erase Core first denial');});
test('a spent first-observation token cannot reconstruct missing original time even when never uploaded',async t=>{const f=await fixture(t),s=f.store();await s.record(row('genuinely-new-call'),true);assert.equal((await s.pending(catalog)).length,1);await s.record(row('original-pre',null),true);await rm(f.agent,{recursive:true});const later=f.store();await later.record(row('original-pre'),true);assert.deepEqual(await later.pending(catalog),[],'missing payload cannot become a newly dated invocation');});
test('legacy true/false seals and missing-seal payload migrate once to actual Core, without promotion',async t=>{const f=await fixture(t),s=f.store(),good=row('legacy-good'),denied=row('legacy-denied'),missing=row('legacy-no-seal');await mkdir(s.originDir,{recursive:true});await mkdir(s.dir,{recursive:true});for(const r of [good,denied,missing])await writeFile(join(s.dir,r.factId+'.json'),JSON.stringify(r));for(const [r,admitted]of[[good,true],[denied,false]])await writeFile(join(s.originDir,r.factId+'.json'),JSON.stringify({schemaVersion:1,admitted}));await s.migrateOrigins();await s.migrateOrigins();assert.equal((await f.call({operation:'originObserve',factId:good.factId,admitted:false})).admitted,true);for(const r of[denied,missing])assert.equal((await f.call({operation:'originObserve',factId:r.factId,admitted:true})).admitted,false);assert.deepEqual((await s.pending(catalog)).map(r=>r.factId),[good.factId]);await rm(s.originDir,{recursive:true,force:true});await s.withdraw();await f.store().record(denied,true);assert.deepEqual(await f.store().pending(catalog),[]);});
test('there is no production Agent-only origin authority fallback',async t=>{const root=await mkdtemp(join(tmpdir(),'hm-agent-no-core-'));t.after(()=>rm(root,{recursive:true,force:true}));const s=new AgentStore(root);await assert.rejects(s.record(row(),true),/CORE_AGENT_ORIGIN_CAPABILITY_REQUIRED/);});

// Upload tests require the official rc.14 build. Core CLI is the fixed normal artifact;
// Identity and Usage HTTP responses below are contract doubles, not scoring evidence.
async function sender(t){
 const f=await fixture(t),s=f.store(),posted=[],operations=[];
 const r={agentHome:f.agent,config:f.config,store:s,call:input=>{operations.push(input.operation);return f.call(input);}};
 const fullCatalog={schemaVersion:1,eventProtocol:'hm-agent-v1',generatedAt:new Date().toISOString(),settings:{...catalog.settings,uploadIntervalMs:60000,catalogRefreshMs:300000},plugins:[{...catalog.plugins[0],githubRepo:'fixture/probe',pluginName:'probe',marketplace:'market',mcpServers:[],skills:['probe']}]};
 const request=async(origin,path,init)=>{if(path==='/v1/registry/agent-catalog')return fullCatalog;assert.equal(path,'/v2/usage/events');posted.push(...JSON.parse(init.body));return{accepted:1,duplicates:0,rejected:[],durability:'committed'};};
 return {...f,r,s,posted,operations,request};
}
test('actual normal Core signs both use and install via guarded operation with wire10 unchanged',async t=>{
 const f=await sender(t);await f.s.record(row(),true);await uploadOnce(f.r,{request:f.request});assert.deepEqual(f.posted.map(x=>x.action),['use','install']);assert.equal(f.operations.filter(x=>x==='signAgentEvent').length,2);assert.equal(f.operations.includes('sign'),false);for(const event of f.posted)assert.equal(Object.keys(event).length,10);
});
test('changed local payload after Core consumption is terminal locally and sends neither event',async t=>{
 const f=await sender(t),value=row();await f.s.record(value,true);await uploadOnce(f.r,{request:f.request});assert.equal(f.posted.length,2);f.posted.length=0;
 const changed={...value,occurredAt:new Date(Date.parse(value.occurredAt)-1000).toISOString()};await atomicJSON(join(f.s.dir,value.factId+'.json'),changed);await rm(f.s.installDir,{recursive:true,force:true});
 await uploadOnce(f.r,{request:f.request});assert.deepEqual(f.posted,[]);assert.equal((await f.s.rows())[0].delivery.code,'CORE_ORIGIN_CONSUMED');
});
test('frozen wire is revalidated by actual Core before any POST after an unknown commit',async t=>{
 const f=await sender(t),value=row();await f.s.record(value,true);
 await assert.rejects(uploadOnce(f.r,{request:async(o,p,i)=>{if(p==='/v2/usage/events')throw Error('fixture commit unknown');return f.request(o,p,i);}}),/fixture commit unknown/);
 const [saved]=await f.s.rows();saved.delivery=null;saved.wire.success=false;await atomicJSON(join(f.s.dir,value.factId+'.json'),saved);
 await uploadOnce(f.r,{request:f.request});assert.deepEqual(f.posted,[]);assert.equal((await f.s.rows())[0].delivery.code,'CORE_ORIGIN_CONSUMED');
});
