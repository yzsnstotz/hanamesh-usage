import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {join} from 'node:path';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {windowsFixture} from '../fixtures/windows-agent-runtime.mjs';
const ss=id=>({session_id:id,source:'startup'});
async function mcp(f){
 const p=spawn('powershell.exe',[...f.psArgs,'-File',join(f.plugin,'bin/hm-agent.ps1'),'mcp'],{env:f.env,stdio:['pipe','pipe','pipe']});f.children.push(p);p.stdin.on('error',()=>{});let buf='',stderr='';const replies=[];let notify=()=>{};
 p.stderr.on('data',c=>stderr+=c);p.stdout.on('data',c=>{buf+=c;for(;;){const at=buf.indexOf('\n');if(at<0)break;replies.push(JSON.parse(buf.slice(0,at)));buf=buf.slice(at+1)}notify()});
 const wait=n=>new Promise((ok,bad)=>{const timer=setTimeout(()=>bad(Error('NATIVE_MCP_NO_REPLY: '+stderr)),10000);notify=()=>{if(replies.length>=n){clearTimeout(timer);ok()}};notify()});
 const send=(id,method,params={})=>p.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
 return{p,replies,wait,send};
}
test('native missing-runtime SessionStart is nonblocking, preserves only controls and never parses invalid tool content',async t=>{
 const f=await windowsFixture(t),r=await f.hook('SessionStart',ss('one'));assert.ok(r.ms<10000,'Windows native cold shell gate (待追认), never wait for download');assert.match(JSON.parse(r.stdout).systemMessage,/正在准备/);
 const invalid=await f.launch('hook',['--event','PostToolUse'],'NOT JSON PRIVATE_CONTENT');assert.equal(invalid.code,0,invalid.stderr);assert.equal(invalid.stdout,'');const attempt=await f.started(1);await f.settle(attempt,'RUNTIME_DOWNLOAD_FAILED');
 assert.equal((await f.disk()).attemptCount,1);
});
test('native cold MCP initialize/list/status responds below10s with named readiness',async t=>{
 const f=await windowsFixture(t),c=await mcp(f),start=performance.now();c.send(1,'initialize',{protocolVersion:'2024-11-05'});c.send(2,'tools/list');c.send(3,'tools/call',{name:'hanamesh_status',arguments:{}});await c.wait(3);assert.ok(performance.now()-start<10000);assert.equal(c.replies[0].result.serverInfo.name,'hanamesh-usage');assert.equal(c.replies[1].result.tools[0].name,'hanamesh_status');assert.equal(JSON.parse(c.replies[2].result.content[0].text).runtime.code,'RUNTIME_PREPARING');assert.equal(c.replies[2].result.isError,true);c.p.stdin.end();const attempt=await f.started(1);await f.settle(attempt,'RUNTIME_DOWNLOAD_FAILED');
});
test('native failed preparation retries once on the next new session, never ordinary or repeated sessions',async t=>{
 const f=await windowsFixture(t);await f.hook('SessionStart',ss('first'));await f.settle(await f.started(1),'RUNTIME_DOWNLOAD_FAILED');await f.hook('PostToolUse');await f.hook('SessionStart',ss('first'));assert.equal((await f.disk()).attemptCount,1);
 await f.hook('SessionStart',ss('second'));await f.hook('SessionStart',ss('second'));await f.settle(await f.started(2),'RUNTIME_DOWNLOAD_FAILED');assert.equal((await f.rows('downloads')).length,2);
});
test('native concurrent entrypoints own one producer and retain no raw session, transcript or tool body',async t=>{
 const f=await windowsFixture(t);await Promise.all(Array.from({length:5},(_,i)=>f.hook(i?'PostToolUse':'SessionStart',i?{tool_name:'Read'}:{...ss('PRIVATE_SESSION'),transcript_path:'PRIVATE_TRANSCRIPT'})));await f.settle(await f.started(1),'RUNTIME_DOWNLOAD_FAILED');assert.equal((await f.rows('downloads')).length,1);
 const all=async dir=>{let out='';for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);out+=e.isDirectory()?await all(p):await readFile(p,'utf8')}return out};assert.doesNotMatch(await all(f.shared),/PRIVATE_SESSION|PRIVATE_TRANSCRIPT|PRIVATE_INPUT|PRIVATE_OUTPUT/);
});
test('native detached successful prepare survives the caller and published runtime is reused',async t=>{
 const f=await windowsFixture(t,{mode:'ready'});await f.hook('SessionStart',ss('ready'));await f.settle(await f.started(1),'RUNTIME_READY');const r=await f.launch('status');assert.equal(r.code,0,r.stderr);assert.equal(JSON.parse(r.stdout).runtime.code,'RUNTIME_READY');assert.equal((await f.rows('downloads')).length,1);
});
test('native checksum mismatch remains named without executable publication or PATH fallback',async t=>{
 const f=await windowsFixture(t,{mode:'badsha'});await f.hook('SessionStart',ss('badsha'));await f.settle(await f.started(1),'RUNTIME_ARCHIVE_CHECKSUM_MISMATCH');await assert.rejects(readFile(join(f.cache,'node.exe')));assert.equal((await f.rows('downloads')).length,1);
});
test('native initialized MCP takes over without another initialize and keeps queued request IDs',async t=>{
 const f=await windowsFixture(t,{mode:'ready'}),c=await mcp(f);c.send(1,'initialize');await c.wait(1);await f.settle(await f.started(1),'RUNTIME_READY');for(const id of [2,3])c.send(id,'tools/call',{name:'hanamesh_status',arguments:{}});await c.wait(3);assert.deepEqual(c.replies.map(v=>v.id),[1,2,3]);assert.equal(JSON.parse(c.replies[2].result.content[0].text).runtime.code,'RUNTIME_READY');c.p.stdin.end();
});
test('native ready publication during a fragmented MCP line never loses the consumed prefix',async t=>{
 const f=await windowsFixture(t,{mode:'ready'}),c=await mcp(f);c.send(1,'initialize');await c.wait(1);const line=JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'hanamesh_status',arguments:{}}})+'\n';c.p.stdin.write(line.slice(0,20));await f.settle(await f.started(1),'RUNTIME_READY');c.p.stdin.write(line.slice(20));await c.wait(2);assert.deepEqual(c.replies.map(v=>v.id),[1,2]);c.p.stdin.end();
});
test('native first non-session failure consumes the first SessionStart attempt budget',async t=>{
 const f=await windowsFixture(t);await f.launch('status');await f.settle(await f.started(1),'RUNTIME_DOWNLOAD_FAILED');await f.hook('SessionStart',ss('first'));assert.equal((await f.disk()).attemptCount,1);await f.hook('SessionStart',ss('next'));await f.settle(await f.started(2),'RUNTIME_DOWNLOAD_FAILED');
});
