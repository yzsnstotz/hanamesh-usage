import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {AgentStore} from '../src/agent/store.mjs';
import {hookCallIdentity,projectHook,hookOutcome} from '../src/agent/project.mjs';
const plugin={pluginId:'probe@local',pluginName:'probe',skills:['hello'],mcpServers:[]};
const payload={hook_event_name:'PreToolUse',tool_name:'Skill',tool_input:{skill:'probe:hello'},session_id:'PRIVATE_SESSION_ID',tool_call_id:'PRIVATE_CALL_ID'};
const catalog={plugins:[{channel:'codex',pluginId:plugin.pluginId,hanaRef:'probe'}],settings:{backfillWindowDays:30,countUnconfirmedCalls:false}};
async function fixture(t){const root=await mkdtemp(join(tmpdir(),'hm-call-seal-'));t.after(()=>rm(root,{recursive:true,force:true}));return new AgentStore(root);}
test('unattributed first observation seals an identity without retaining raw call selectors',async t=>{
 const store=await fixture(t),id=hookCallIdentity(payload,'codex');await store.observe(id,null,true);
 assert.deepEqual(await store.rows(),[]);const files=await readdir(store.originDir);assert.deepEqual(files,[id.factId+'.json']);
 const marker=JSON.parse(await readFile(join(store.originDir,files[0])));assert.deepEqual(marker,{schemaVersion:1,admitted:false});assert.doesNotMatch(JSON.stringify(marker)+files[0],/PRIVATE_|probe|occurredAt|feature/);
 await store.record(projectHook({...payload,hook_event_name:'PostToolUse',tool_response:{isError:false}},'codex',[plugin]),true);assert.deepEqual(await store.pending(catalog),[]);
});
test('expired admitted payload cannot be reconstructed even after reopening the store',async t=>{
 const store=await fixture(t),now=Date.now(),row=projectHook({...payload,hook_event_name:'PostToolUse',tool_response:{isError:false}},'codex',[plugin],now-31*86400000);
 await store.record(row,true);await store.prune(now);assert.deepEqual(await store.rows(),[]);
 const fresh=new AgentStore(store.root);assert.equal(await fresh.record({...row,occurredAt:new Date(now).toISOString()},true),'duplicate');assert.deepEqual(await fresh.pending(catalog,now),[]);
});
test('ordinary withdrawal deletes activity while retaining the spent opaque identity',async t=>{
 const store=await fixture(t),row=projectHook({...payload,hook_event_name:'PostToolUse',tool_response:{isError:false}},'codex',[plugin]);
 await store.record(row,true);await store.withdraw();assert.deepEqual(await store.rows(),[]);
 assert.equal(await store.record(row,true),'duplicate');assert.deepEqual(await store.pending(catalog),[]);assert.deepEqual(await store.origin(row.factId),{schemaVersion:1,admitted:true});
});
test('late result completes only the verified original invocation, not later inventory',async t=>{
 const store=await fixture(t),now=Date.now(),id=hookCallIdentity(payload,'codex',now-1000),pre=projectHook(payload,'codex',[plugin],now-1000);
 await store.observe(id,pre,true);const post={...payload,hook_event_name:'PostToolUse',tool_response:{isError:false}};
 assert.equal(projectHook(post,'codex',[]),null);assert.equal(await store.observe(hookCallIdentity(post,'codex'),null,true,{allowNew:false,outcome:hookOutcome(post,'codex')}),'promoted');
 const [row]=await store.rows();assert.equal(row.occurredAt,pre.occurredAt);assert.equal(row.pluginId,pre.pluginId);assert.equal(row.success,true);assert.equal((await store.pending(catalog)).length,1);
});
test('orphan Post cannot mint a new origin while a genuinely new Pre/Post can',async t=>{
 const store=await fixture(t),post={...payload,hook_event_name:'PostToolUse',tool_response:{isError:false}};
 await store.observe(hookCallIdentity(post,'codex'),projectHook(post,'codex',[plugin]),true,{allowNew:false,outcome:true});assert.deepEqual(await store.pending(catalog),[]);
 const next={...payload,tool_call_id:'new-call'};await store.observe(hookCallIdentity(next,'codex'),projectHook(next,'codex',[plugin]),true);
 const end={...next,hook_event_name:'PostToolUse',tool_response:{isError:false}};await store.observe(hookCallIdentity(end,'codex'),projectHook(end,'codex',[plugin]),true,{allowNew:false,outcome:true});assert.equal((await store.pending(catalog)).length,1);
});
test('legacy payload without an origin is unavailable, not proof from current installation',async t=>{
 const store=await fixture(t),row=projectHook({...payload,hook_event_name:'PostToolUse',tool_response:{isError:false}},'codex',[plugin]);
 await mkdir(store.dir,{recursive:true});await writeFile(join(store.dir,row.factId+'.json'),JSON.stringify(row));assert.deepEqual(await store.pending(catalog),[]);
 assert.equal(await store.record(row,true),'origin-unavailable');assert.deepEqual(await store.pending(catalog),[]);
});
test('malformed origin proof fails closed instead of reconstructing eligibility',async t=>{
 const store=await fixture(t),row=projectHook({...payload,hook_event_name:'PostToolUse',tool_response:{isError:false}},'codex',[plugin]);
 await store.record(row,true);await writeFile(join(store.originDir,row.factId+'.json'),JSON.stringify({schemaVersion:2,admitted:true}));
 await assert.rejects(store.pending(catalog),/AGENT_CALL_ORIGIN_INVALID/);await assert.rejects(store.record(row,true),/AGENT_CALL_ORIGIN_INVALID/);
});
for(const cleanup of ['prune','withdraw'])test(`legacy payload cleanup ${cleanup} preserves a denied identity before deleting activity`,async t=>{
 const store=await fixture(t),now=Date.now(),row=projectHook({...payload,hook_event_name:'PostToolUse',tool_response:{isError:false}},'codex',[plugin],now-31*86400000);
 await mkdir(store.dir,{recursive:true});await writeFile(join(store.dir,row.factId+'.json'),JSON.stringify(row));
 await store[cleanup](now);assert.deepEqual(await store.rows(),[]);
 assert.equal(await store.record({...row,occurredAt:new Date(now).toISOString()},true),'duplicate');assert.deepEqual(await store.pending(catalog,now),[]);
});
