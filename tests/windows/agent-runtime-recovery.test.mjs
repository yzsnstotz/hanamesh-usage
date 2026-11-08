import test from 'node:test';import assert from 'node:assert/strict';import{writeFile,readFile,readdir}from'node:fs/promises';import{join}from'node:path';
import {windowsFixture} from '../fixtures/windows-agent-runtime.mjs';
const initial={code:'RUNTIME_PREPARING',phase:'publishing',attemptCount:1,totalBytes:100,downloadedBytes:100,startedAt:new Date(Date.now()-5000).toISOString()};
test('native valid published Node reconciles abandoned preparing state before status and actual Pre/Post',async t=>{
 const f=await windowsFixture(t);await f.publish(initial);const r=await f.launch('status');assert.equal(r.code,0,r.stderr);assert.equal(JSON.parse(r.stdout).runtime.code,'RUNTIME_READY');const recovered=await f.disk();assert.equal(recovered.code,'RUNTIME_READY');assert.equal(recovered.attemptCount,1);await f.hook('PostToolUse',{tool_use_id:'before-ready'});await f.hook('PreToolUse');await f.hook('PostToolUse');assert.equal((await readdir(join(f.agent,'events'))).length,2);
});
test('native active OS preparation lease cannot be reclaimed by status or hooks',async t=>{
 const f=await windowsFixture(t);await f.publish(initial);const release=await f.lock(),before=await readFile(join(f.cache,'prepare-state.json'),'utf8');try{const r=await f.launch('status');assert.equal(JSON.parse(r.stdout).runtime.code,'RUNTIME_PREPARING');await f.hook('PreToolUse');await f.hook('PostToolUse');assert.equal(await readFile(join(f.cache,'prepare-state.json'),'utf8'),before);}finally{await release()}await f.hook('PreToolUse');assert.equal((await f.disk()).code,'RUNTIME_READY');
});
test('native free lease never reconciles a corrupt published executable',async t=>{
 const f=await windowsFixture(t);await f.publish(initial);await writeFile(join(f.cache,'node.sha256'),'0'.repeat(64)+'  node.exe\n');const r=await f.launch('status');assert.notEqual(r.code,0);assert.match(r.stderr,/HANAMESH_NODE_RUNTIME_CHECKSUM_MISMATCH/);assert.equal((await f.disk()).code,'RUNTIME_PREPARING');
});
