import test from 'node:test';import assert from 'node:assert/strict';
import {projectHook} from '../src/agent/project.mjs';
const installed=[{pluginId:'target@hanamesh',pluginName:'target',root:'/isolated/target',mcpServers:['echo'],skills:[]}];
const payload={hook_event_name:'PostToolUse',session_id:'native-session',tool_use_id:'native-call',tool_name:'mcp__plugin_target_echo__echo'};
test('Claude native successful MCP content blocks establish success without retaining their text',()=>{
 const row=projectHook({...payload,tool_response:[{type:'text',text:'private-tool-result'}]},'claude',installed);
 assert.equal(row.success,true);assert.equal(row.disposition,'attributed');assert.doesNotMatch(JSON.stringify(row),/private-tool-result|native-session|native-call/);
});
test('empty, malformed, non-MCP and pre-tool arrays never establish success',()=>{
 for(const response of [[],[null],[{}],[{type:3}],'text'])assert.equal(projectHook({...payload,tool_response:response},'claude',installed).success,null);
 assert.equal(projectHook({...payload,hook_event_name:'PreToolUse',tool_response:[{type:'text'}]},'claude',installed).success,null);
 assert.equal(projectHook({...payload,hook_event_name:'PostToolUseFailure',tool_response:[{type:'text'}]},'claude',installed).success,false);
});
