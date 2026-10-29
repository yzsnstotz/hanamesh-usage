import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {root} from './fixtures/helpers.mjs';
const {projectHook}=await import(pathToFileURL(join(root,'lib/agent/project.mjs')).href);
const {AgentStore}=await import(pathToFileURL(join(root,'lib/agent/store.mjs')).href);const {agentEventForFact,agentSigningJSON}=await import(pathToFileURL(join(root,'lib/core/agent-event.js')).href);
const installed=[{pluginId:'target@market',pluginName:'target',mcpServers:['probe'],skills:[]}];
const payload={session_id:'disposable-session',tool_use_id:'call',tool_name:'mcp__probe__echo',tool_input:{secret:'DO_NOT_PERSIST'},transcript_path:'/must-not-read'};
const now=Date.parse('2026-10-15T10:00:00.000Z');
const catalog={plugins:[{channel:'codex',pluginId:'target@market',hanaRef:'hana-target'}],settings:{backfillWindowDays:30,countUnconfirmedCalls:false}};
const pre=()=>projectHook({...payload,hook_event_name:'PreToolUse'},'codex',installed,now);
const post=()=>projectHook({...payload,hook_event_name:'PostToolUse',tool_response:{content:[],isError:false}},'codex',installed,now+100);
async function fixture(t){const root=await mkdtemp(join(tmpdir(),'hm-g-agent-'));t.after(()=>rm(root,{recursive:true,force:true}));return new AgentStore(root);}
test('G real host hook shape: Pre unknown and Post same call identity; missing result never means success',()=>{
 const a=pre(),b=post();assert.ok(a);assert.equal(a.success,null);assert.equal(a.disposition,'unverified');assert.equal(b.success,true);assert.equal(a.factId,b.factId);
 for(const response of [undefined,null,{},'not a result',{isError:'true',content:[]},{isError:null,content:[]},{exit_code:'0'}])assert.equal(projectHook({...payload,hook_event_name:'PostToolUse',tool_response:response},'codex',installed,now).success,null);
 assert.equal(projectHook({...payload,hook_event_name:'PostToolUse',tool_response:{isError:true,content:[]}},'codex',installed,now).success,false);
 assert.doesNotMatch(JSON.stringify([a,b]),/DO_NOT_PERSIST|must-not-read|disposable-session/);
});
test('G one attempt promotes before freeze, unknown result follows the configured policy',async t=>{
 const store=await fixture(t);await store.record(pre(),true);assert.equal((await store.pending(catalog,now+1000)).length,0);
 assert.equal((await store.pending({...catalog,settings:{...catalog.settings,countUnconfirmedCalls:true}},now+1000)).length,1);
 assert.equal(await store.record(post(),true),'promoted');let rows=await store.rows();assert.equal(rows.length,1);assert.equal(rows[0].success,true);assert.equal(rows[0].occurredAt,new Date(now).toISOString());
 await store.record(pre(),true);assert.equal((await store.rows())[0].success,true);

});
test('G frozen unknown event remains byte-identical after late success and cannot earn a second event',async t=>{
 const store=await fixture(t);await store.record(pre(),true);const wire={success:null,feature:'mcp:echo',channel:'codex',occurredAt:new Date(now).toISOString(),signature:'fixture'};
 await store.freezeWire(pre().factId,wire);await store.mark(pre().factId,{state:'sent'});assert.equal(await store.record(post(),true),'observed');
 const [row]=await store.rows();assert.equal(row.success,null);assert.equal(row.observedSuccess,true);assert.deepEqual(row.wire,wire);assert.equal(row.delivery.state,'sent');assert.equal((await store.pending({...catalog,settings:{...catalog.settings,countUnconfirmedCalls:true}},now+1000)).length,0);
});
test('G a stale unknown projection cannot freeze over an already confirmed call',async t=>{
 const store=await fixture(t);await store.record(pre(),true);await store.record(post(),true);await assert.rejects(store.freezeWire(pre().factId,{success:null,channel:'codex',feature:'mcp:echo',occurredAt:new Date(now).toISOString()}),/AGENT_FACT_CHANGED/);
});
test('G nine-field signature preserves null and binds consent epoch in nonce',()=>{
 const consentId='11111111-1111-4111-8111-111111111111';const row={factId:'a'.repeat(64),hanaRef:'hana-target',channel:'codex',feature:'mcp:echo',occurredAt:new Date(now).toISOString(),success:null};
 const e=agentEventForFact('A'.repeat(43),row,consentId);assert.match(e.nonce,new RegExp('^g'+consentId+'\\.'));assert.equal(JSON.parse(agentSigningJSON(e)).success,null);assert.equal(Object.keys(JSON.parse(agentSigningJSON(e))).length,9);
 assert.throws(()=>agentEventForFact('A'.repeat(43),row,null),/AGENT_CONSENT_INVALID/);
 assert.throws(()=>agentEventForFact('A'.repeat(43),row,'11111111-1111-1111-8111-111111111111'),/AGENT_CONSENT_INVALID/);
});
test('G independent store objects in one process serialize a Pre/Post race without losing promotion',async t=>{
 const a=await fixture(t),b=new AgentStore(a.root);await Promise.all([a.record(pre(),true),b.record(post(),true)]);const rows=await a.rows();assert.equal(rows.length,1);assert.equal(rows[0].success,true);
});
