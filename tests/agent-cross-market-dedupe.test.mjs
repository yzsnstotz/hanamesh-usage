// FIXTURE hook shapes; actual projector/store, no model, upload or scoring claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {projectHook} from '../src/agent/project.mjs';
import {AgentStore} from '../src/agent/store.mjs';
const installed=marketplace=>[{pluginId:`frontend-design@${marketplace}`,pluginName:'frontend-design',root:'/fixture/frontend',mcpServers:[],skills:['frontend-design']}];
const payload={hook_event_name:'PostToolUse',session_id:'fixture-same-call',tool_use_id:'fixture-call',tool_name:'Skill',tool_input:{skill:'frontend-design:frontend-design'},tool_response:{success:true}};
test('one invocation observed under two marketplace IDs owns only one record and signed event',async()=>{
 const root=await mkdtemp(join(tmpdir(),'hm-i-market-dedupe-'));
 try{
  const store=new AgentStore(root),now=Date.now();
  const builtin=projectHook(payload,'claude',installed('anthropic-plugin-directory'),now);
  const canonical=projectHook(payload,'claude',installed('claude-plugins-official'),now);
  assert.equal(builtin.factId,canonical.factId);assert.notEqual(builtin.pluginId,canonical.pluginId);
  assert.equal(await store.record(builtin,true),'recorded');
  const wire={...builtin,eventId:'one-signed-event',nonce:'same-nonce',signature:'fixture',hanaRef:'one-hana'};
  assert.deepEqual(await store.freezeWire(builtin.factId,wire),wire);
  assert.equal(await store.record(canonical,true),'duplicate');
  const rows=await store.rows();assert.equal(rows.length,1);assert.equal(rows[0].pluginId,builtin.pluginId);assert.deepEqual(rows[0].wire,wire);
  const plugins=[...installed('anthropic-plugin-directory'),...installed('claude-plugins-official')].map(p=>({...p,channel:'claude',hanaRef:'one-hana'}));
  const pending=await store.pending({plugins,settings:{backfillWindowDays:1,countUnconfirmedCalls:false}},now);assert.equal(pending.length,1);
  assert.equal(projectHook({...payload,tool_use_id:'different-call'},'claude',installed('claude-plugins-official'),now).factId===builtin.factId,false);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('ambiguous simultaneous market installations do not produce two attributable records',()=>{
 const result=projectHook(payload,'claude',[...installed('anthropic-plugin-directory'),...installed('claude-plugins-official')]);
 assert.equal(result.disposition,'ambiguous');assert.equal(result.pluginId,null);
});
