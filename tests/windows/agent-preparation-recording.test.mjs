import test from 'node:test';import assert from 'node:assert/strict';
import {writeFile,readFile,readdir} from 'node:fs/promises';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {windowsFixture} from '../fixtures/windows-agent-runtime.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
for(const channel of ['claude','codex'])test(`native ${channel} preparing Pre/Post preserve original time and become one minimal activity`,async t=>{
 const f=await windowsFixture(t,{channel}),release=await f.lock();await writeFile(join(f.cache,'prepare-state.json'),JSON.stringify({code:'RUNTIME_PREPARING',phase:'download',startedAt:new Date().toISOString()}));
 await f.hook('PreToolUse');await f.hook('PostToolUse');const pending=await f.pending();assert.equal(pending.length,2);assert.equal(pending[0].factId,sha(JSON.stringify([channel,'PRIVATE_SESSION','original-call'])));assert.doesNotMatch(JSON.stringify(pending),/PRIVATE_|password|tool_input|tool_response/);const first=pending.find(p=>p.event==='PreToolUse').occurredAt;
 await release();await f.publish();await f.hook('PreToolUse',{tool_name:'Read',tool_use_id:'unrelated'});const files=await readdir(join(f.agent,'events'));assert.equal(files.length,1);const row=JSON.parse(await readFile(join(f.agent,'events',files[0])));assert.equal(row.occurredAt,first);assert.equal(row.success,true);assert.equal(row.feature,'mcp:echo');assert.equal((await f.pending()).length,0);assert.doesNotMatch(JSON.stringify(row),/PRIVATE_|password/);
});
test('native preparing bridge ignores non-plugin calls and honors explicit local close',async t=>{
 const f=await windowsFixture(t),release=await f.lock();await writeFile(join(f.cache,'prepare-state.json'),JSON.stringify({code:'RUNTIME_PREPARING',phase:'download'}));await f.hook('PreToolUse',{tool_name:'Read'});assert.deepEqual(await f.pending(),[]);await writeFile(join(f.agent,'withdrawal.json'),JSON.stringify({state:'sent'}));await f.hook('PreToolUse');await f.hook('PostToolUse');assert.deepEqual(await f.pending(),[]);await release();
});
