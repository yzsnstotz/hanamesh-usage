import test from 'node:test';import assert from 'node:assert/strict';
import {writeFile,readFile,readdir,mkdir} from 'node:fs/promises';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {windowsFixture} from '../fixtures/windows-agent-runtime.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
for(const profile of ['claude','codex','codex-default'])test(`native ${profile} preparing Pre/Post preserve original time and become one minimal activity`,async t=>{
 const channel=profile==='claude'?'claude':'codex',f=await windowsFixture(t,{channel,defaultProfile:profile==='codex-default'}),release=await f.lock();await writeFile(join(f.cache,'prepare-state.json'),JSON.stringify({code:'RUNTIME_PREPARING',phase:'download',startedAt:new Date().toISOString()}));
 await f.hook('PreToolUse');await f.hook('PostToolUse');const pending=await f.pending();assert.equal(pending.length,2);assert.equal(pending[0].factId,sha(JSON.stringify([channel,'PRIVATE_SESSION','original-call'])));assert.doesNotMatch(JSON.stringify(pending),/PRIVATE_|password|tool_input|tool_response/);const first=pending.find(p=>p.event==='PreToolUse').occurredAt;
 await release();await f.publish();await f.hook('PreToolUse',{tool_name:'Read',tool_use_id:'unrelated'});const files=await readdir(join(f.agent,'events'));assert.equal(files.length,1);const row=JSON.parse(await readFile(join(f.agent,'events',files[0])));assert.equal(row.occurredAt,first);assert.equal(row.success,true);assert.equal(row.feature,'mcp:echo');assert.equal((await f.pending()).length,0);assert.doesNotMatch(JSON.stringify(row),/PRIVATE_|password/);
});
test('native preparing bridge ignores non-plugin calls and honors explicit local close',async t=>{
 const f=await windowsFixture(t),release=await f.lock();await writeFile(join(f.cache,'prepare-state.json'),JSON.stringify({code:'RUNTIME_PREPARING',phase:'download'}));await f.hook('PreToolUse',{tool_name:'Read'});assert.deepEqual(await f.pending(),[]);await writeFile(join(f.agent,'withdrawal.json'),JSON.stringify({state:'sent'}));await f.hook('PreToolUse');await f.hook('PostToolUse');assert.deepEqual(await f.pending(),[]);await release();
});

test('native Codex skill path separators and case survive preparation without storing the path',async t=>{
 const f=await windowsFixture(t,{channel:'codex'}),release=await f.lock();
 const skill=join(f.host,'plugins/cache/market/target/1.0/skills/demo');await mkdir(skill,{recursive:true});await writeFile(join(skill,'SKILL.md'),'FIXTURE ONLY');
 await writeFile(join(f.cache,'prepare-state.json'),JSON.stringify({code:'RUNTIME_PREPARING',phase:'download'}));
 const cmd=`cat "${join(skill,'SKILL.md').toUpperCase()}"`,extra={tool_name:'exec_command',tool_input:{cmd},tool_response:{exit_code:0}};
 await f.hook('PreToolUse',extra);await f.hook('PostToolUse',extra);const pending=await f.pending();assert.equal(pending.length,2);assert.doesNotMatch(JSON.stringify(pending),/PRIVATE_|SKILL|hm-native|tool_input/);
 await release();await f.publish();await f.hook('PreToolUse',{tool_name:'Read'});const files=await readdir(join(f.agent,'events'));assert.equal(files.length,1);const row=JSON.parse(await readFile(join(f.agent,'events',files[0])));assert.equal(row.feature,'skill:demo');assert.equal(row.success,true);assert.equal((await f.pending()).length,0);
});
