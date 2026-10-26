import test from 'node:test';
import assert from 'node:assert/strict';
import {projectHook} from '../src/agent/project.mjs';

// R2 C4 toolUseResult from Claude CLI 2.1.310; no prompt, args or output text is retained.
const installed=[{pluginId:'frontend-design@claude-code-plugins',pluginName:'frontend-design',root:'/fixture/frontend-design',mcpServers:['echo'],skills:['frontend-design']}];
const payload={hook_event_name:'PostToolUse',session_id:'fixture-r2-skill-session',tool_use_id:'toolu_0164BzHEhGzZqk5iqauskRZm',tool_name:'Skill',tool_input:{skill:'frontend-design:frontend-design'}};
for(const success of [true,false])test(`Claude Skill explicit success=${success} is an attributed boolean result`,()=>{
 const row=projectHook({...payload,tool_response:{success,commandName:'frontend-design:frontend-design'}},'claude',installed);
 assert.equal(row.success,success);assert.equal(row.disposition,'attributed');assert.equal(row.pluginId,installed[0].pluginId);assert.equal(row.feature,'skill:frontend-design');
 assert.deepEqual(Object.keys(row),['factId','channel','occurredAt','disposition','pluginId','feature','success']);
});
test('Skill metadata without a boolean result remains unverified',()=>{
 for(const value of [undefined,null,'true',1,{}]){
  const row=projectHook({...payload,tool_response:{success:value,commandName:'frontend-design:frontend-design'}},'claude',installed);
  assert.equal(row.success,null);assert.equal(row.disposition,'unverified');
 }
});
test('pre-tool and failure events retain their existing result semantics',()=>{
 const response={success:true,commandName:'frontend-design:frontend-design'};
 assert.equal(projectHook({...payload,hook_event_name:'PreToolUse',tool_response:response},'claude',installed).success,null);
 assert.equal(projectHook({...payload,hook_event_name:'PostToolUseFailure',tool_response:response},'claude',installed).success,false);
 assert.equal(projectHook({...payload,tool_response:{...response,error:'fixture-error'}},'claude',installed).success,false);
});
test('explicit success on other tools and Codex does not establish a Skill result',()=>{
 assert.equal(projectHook({...payload,tool_name:'mcp__plugin_frontend-design_echo__probe',tool_response:{success:true,commandName:'frontend-design:frontend-design'}},'claude',installed).success,null);
 assert.equal(projectHook({...payload,tool_response:{success:true,commandName:'frontend-design:frontend-design'}},'codex',installed).success,null);
});
