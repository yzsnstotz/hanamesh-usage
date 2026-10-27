import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {join,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const shellquote=v=>"'"+v.replaceAll("'","'\"'\"'")+"'";
async function fixture(t,mode='failure'){
 const root=await mkdtemp(join(tmpdir(),'hm-background-runtime 中文-'));const plugin=join(root,'plugin'),shared=join(root,'shared');await mkdir(plugin);await cp(join(process.env.USAGE_TEST_ROOT??process.cwd(),'agent/bin'),join(plugin,'bin'),{recursive:true});
 const curl=join(root,'fixture-curl');await writeFile(curl,`#!/bin/sh\nprintf 'started\\n' >> ${shellquote(join(root,'downloads'))}\nsleep 2\nexit 7\n`,{mode:0o755});
 for(const file of await readdir(join(plugin,'bin'))){const p=join(plugin,'bin',file),s=await readFile(p,'utf8');await writeFile(p,file.endsWith('.pl')?s.replaceAll("'/usr/bin/curl'",JSON.stringify(curl)):s.replaceAll('/usr/bin/curl',shellquote(curl)));}
 if(mode!=='failure'){
  const name=`node-v24.13.1-darwin-${process.arch}`,tree=join(root,'archive-tree',name);await mkdir(join(tree,'bin'),{recursive:true});
  await writeFile(join(tree,'bin/node'),`#!/bin/sh\nexec ${shellquote(process.execPath)} "$@"\n`,{mode:0o755});await writeFile(join(tree,'LICENSE'),'TEST FIXTURE ONLY');
  const archive=join(root,'fixture.tar.xz');assert.equal(spawnSync('/usr/bin/tar',['-cJf',archive,'-C',join(root,'archive-tree'),name],{env:{...process.env,LC_ALL:'C'}}).status,0);
  const bytes=await readFile(archive),recipePath=join(plugin,'bin/node-runtime.json'),recipe=JSON.parse(await readFile(recipePath));recipe.architectures[process.arch].sha256=mode==='badsha'?'0'.repeat(64):createHash('sha256').update(bytes).digest('hex');recipe.architectures[process.arch].bytes=bytes.length;await writeFile(recipePath,JSON.stringify(recipe));
  await writeFile(curl,`#!/bin/sh\nprintf 'started\\n' >> ${shellquote(join(root,'downloads'))}\nsleep 0.35\nwhile [ "$#" -gt 0 ]; do case "$1" in -o) out=$2; shift 2 ;; *) shift ;; esac; done\n/bin/cp ${shellquote(archive)} "$out"\n`,{mode:0o755});
  await mkdir(join(plugin,'lib/agent'),{recursive:true});await writeFile(join(plugin,'lib/agent/cli.mjs'),`import{writeFileSync}from'node:fs';import{createInterface}from'node:readline';writeFileSync(${JSON.stringify(join(root,'takeover-mode'))},process.argv[2]);for await(const line of createInterface({input:process.stdin})){const q=JSON.parse(line);if(q.id!==undefined)console.log(JSON.stringify({jsonrpc:'2.0',id:q.id,result:{content:[{type:'text',text:JSON.stringify({runtime:{code:'RUNTIME_READY'},mode:process.argv[2]})}]}}));}`);
 }
 const env={PATH:'/usr/bin:/bin',HOME:root,HANAMESH_SHARED_HOME:shared,HANAMESH_AGENT_HOME:join(root,'agent'),CLAUDE_CONFIG_DIR:join(root,'claude'),HANAMESH_AGENT_CHANNEL:'claude'};
 const children=[];t.after(async()=>{if(process.env.HM_RUNTIME_TEST_EVIDENCE){await mkdir(process.env.HM_RUNTIME_TEST_EVIDENCE,{recursive:true});await cp(shared,join(process.env.HM_RUNTIME_TEST_EVIDENCE,basename(root)),{recursive:true}).catch(()=>{});}for(const p of children)if(p.exitCode===null)p.kill('SIGTERM'); // fixture worker cleanup is limited to its published PID.
  const runtime=join(shared,'runtime');try{for(const d of await readdir(runtime)){const f=join(runtime,d,'prepare-state.json');try{const state=JSON.parse(await readFile(f));if(state.code==='RUNTIME_PREPARING'&&state.pid)try{process.kill(-state.pid,'SIGTERM');}catch{}}catch{}}}catch{}
  await new Promise(r=>setTimeout(r,30));await rm(root,{recursive:true,force:true});});
 const launch=(action,args=[],input='')=>new Promise((ok,bad)=>{const start=performance.now(),p=spawn('/bin/sh',[join(plugin,'bin/hm-agent'),action,...args],{env,stdio:['pipe','pipe','pipe']});children.push(p);let stdout='',stderr='';p.stdout.on('data',c=>stdout+=c);p.stderr.on('data',c=>stderr+=c);p.on('error',bad);p.on('close',code=>ok({code,stdout,stderr,ms:performance.now()-start}));p.stdin.on('error',()=>{});p.stdin.end(input);});
 const state=async()=>JSON.parse((await launch('status')).stdout);
 return{root,plugin,shared,env,launch,state,children};
}
const waitFor=async(fn)=>{const until=performance.now()+5000;for(;;){if(await fn())return;if(performance.now()>until)assert.fail('fixture preparation did not settle');await new Promise(r=>setTimeout(r,40));}};
const ss=id=>JSON.stringify({hook_event_name:'SessionStart',session_id:id,source:'startup',transcript_path:'/DO_NOT_READ_TRANSCRIPT'});
test('missing-runtime SessionStart returns immediately with preparing notice; tool payload is never parsed or persisted',async t=>{
 const f=await fixture(t);const result=await f.launch('hook',['--event','SessionStart'],ss('one'));assert.equal(result.code,0,result.stderr);assert.ok(result.ms<500,'startup must not wait for fixture2s download');assert.match(JSON.parse(result.stdout).systemMessage,/正在准备运行环境/);
 const tool=await f.launch('hook',['--event','PostToolUse'],'NOT JSON SECRET_RAW_TOOL_INPUT');assert.equal(tool.code,0,tool.stderr);assert.equal(tool.stdout,'');assert.ok(tool.ms<500);const state=await f.state();assert.equal(state.runtime.code,'RUNTIME_PREPARING');assert.equal(state.runtime.recordingDuringPreparation,false);assert.equal(typeof state.runtime.downloadedBytes,'number');
});
test('cold MCP completes initialize/list/status below10s and returns named not-ready instead of timing out',async t=>{
 const f=await fixture(t);const p=spawn('/bin/sh',[join(f.plugin,'bin/hm-agent'),'mcp'],{env:f.env,stdio:['pipe','pipe','pipe']});f.children.push(p);let buf='';const replies=[];p.stdout.on('data',c=>{buf+=c;for(;;){const i=buf.indexOf('\n');if(i<0)break;replies.push(JSON.parse(buf.slice(0,i)));buf=buf.slice(i+1);}});let stderr='';p.stderr.on('data',c=>stderr+=c);const start=performance.now();
 p.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2024-11-05'}})+'\n');p.stdin.write(JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list'})+'\n');p.stdin.write(JSON.stringify({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'hanamesh_status',arguments:{}}})+'\n');
 await new Promise((ok,bad)=>{let done=false;const deadline=setTimeout(()=>{done=true;bad(Error('MCP_NO_RESPONSE_WITHIN_1000MS:'+stderr));},1000);const check=()=>{if(done)return;if(replies.length===3){done=true;clearTimeout(deadline);ok();}else setTimeout(check,5);};check();});assert.ok(performance.now()-start<1000);assert.equal(replies[0].result.serverInfo.name,'hanamesh-usage');assert.equal(replies[1].result.tools[0].name,'hanamesh_status');const value=JSON.parse(replies[2].result.content[0].text);assert.equal(value.runtime.code,'RUNTIME_PREPARING');assert.equal(replies[2].result.isError,true);p.stdin.end();
});
test('failure stays named; ordinary hooks do not retry, same session does not retry, next new session starts exactly once',async t=>{
 const f=await fixture(t);await f.launch('hook',['--event','SessionStart'],ss('first'));await waitFor(async()=> (await f.state()).runtime.code!=='RUNTIME_PREPARING');let value=await f.state();assert.equal(value.runtime.code,'RUNTIME_DOWNLOAD_FAILED');assert.match(value.runtime.message,/下次.*会话/);
 await f.launch('hook',['--event','PostToolUse'],'SECRET_RAW_RESULT');await f.launch('hook',['--event','SessionStart'],ss('first'));assert.equal((await f.state()).runtime.attemptCount,1);assert.equal((await readFile(join(f.root,'downloads'),'utf8')).trim().split('\n').length,1);
 await f.launch('hook',['--event','SessionStart'],ss('second'));await f.launch('hook',['--event','SessionStart'],ss('second'));await waitFor(async()=>{try{return (await readFile(join(f.root,'downloads'),'utf8')).trim().split('\n').length===2;}catch{return false;}});assert.equal((await readFile(join(f.root,'downloads'),'utf8')).trim().split('\n').length,2);
});
test('concurrent missing-runtime entrypoints start one detached producer and retain only hashed control metadata',async t=>{
 const f=await fixture(t);await Promise.all(Array.from({length:5},(_,i)=>f.launch('hook',['--event',i?'PostToolUse':'SessionStart'],i?'SECRET_TOOL_PAYLOAD_NOT_JSON':ss('PRIVATE_SESSION_ID'))));await waitFor(async()=>{try{return (await readFile(join(f.root,'downloads'),'utf8')).includes('started');}catch{return false;}});assert.equal((await readFile(join(f.root,'downloads'),'utf8')).trim().split('\n').length,1);
 const all=async dir=>{let out='';for(const d of await readdir(dir,{withFileTypes:true})){const p=join(dir,d.name);out+=d.isDirectory()?await all(p):await readFile(p,'utf8');}return out;};assert.doesNotMatch(await all(f.shared),/SECRET_TOOL_PAYLOAD|PRIVATE_SESSION_ID|DO_NOT_READ_TRANSCRIPT/);
});

test('a detached successful prepare survives MCP close and is reused without another download',async t=>{
 const f=await fixture(t,'ready');const start=await f.launch('hook',['--event','SessionStart'],ss('ready-session'));assert.equal(start.code,0,start.stderr);assert.ok(start.ms<500);await waitFor(async()=>{try{return JSON.parse(await readFile(join(f.shared,'runtime',`node-v24.13.1-darwin-${process.arch}`,'prepare-state.json'))).code==='RUNTIME_READY';}catch{return false;}});
 assert.equal((await readFile(join(f.root,'downloads'),'utf8')).trim().split('\n').length,1);const result=await f.launch('mcp',[],JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'hanamesh_status',arguments:{}}})+'\n');assert.equal(result.code,0,result.stderr);assert.equal(JSON.parse(JSON.parse(result.stdout).result.content[0].text).runtime.code,'RUNTIME_READY');assert.equal((await readFile(join(f.root,'downloads'),'utf8')).trim().split('\n').length,1);
});
test('an already-initialized MCP bridge hands off while idle, preserving queued request IDs without another initialize',async t=>{
 const f=await fixture(t,'ready');const p=spawn('/bin/sh',[join(f.plugin,'bin/hm-agent'),'mcp'],{env:f.env,stdio:['pipe','pipe','pipe']});f.children.push(p);let buf='',stderr='';const replies=[];p.stdout.on('data',c=>{buf+=c;for(;;){const i=buf.indexOf('\n');if(i<0)break;replies.push(JSON.parse(buf.slice(0,i)));buf=buf.slice(i+1);}});p.stderr.on('data',c=>stderr+=c);
 p.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2024-11-05'}})+'\n');await waitFor(async()=>replies.length===1);await waitFor(async()=>{try{return(await readFile(join(f.root,'takeover-mode'),'utf8'))==='mcp-ready';}catch{return false;}});
 for(const id of [2,3])p.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{name:'hanamesh_status',arguments:{}}})+'\n');await waitFor(async()=>replies.length===3);assert.deepEqual(replies.map(r=>r.id),[1,2,3]);assert.equal(JSON.parse(replies[2].result.content[0].text).mode,'mcp-ready');p.stdin.end();
});
test('a checksum mismatch is named and never publishes a runtime or falls back to PATH',async t=>{
 const f=await fixture(t,'badsha');await f.launch('hook',['--event','SessionStart'],ss('badsha'));await waitFor(async()=>(await f.state()).runtime.code!=='RUNTIME_PREPARING');assert.equal((await f.state()).runtime.code,'RUNTIME_ARCHIVE_CHECKSUM_MISMATCH');await assert.rejects(readFile(join(f.shared,'runtime',`node-v24.13.1-darwin-${process.arch}`,'bin/node')));
});

test('runtime becoming ready during a fragmented MCP request preserves the consumed prefix',async t=>{
 const f=await fixture(t,'ready'),p=spawn('/bin/sh',[join(f.plugin,'bin/hm-agent'),'mcp'],{env:f.env,stdio:['pipe','pipe','pipe']});f.children.push(p);let buf='';const replies=[];p.stdout.on('data',c=>{buf+=c;for(;;){const i=buf.indexOf('\n');if(i<0)break;replies.push(JSON.parse(buf.slice(0,i)));buf=buf.slice(i+1);}});p.stderr.resume();
 p.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{}})+'\n');await waitFor(async()=>replies.length===1);
 const request=JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'hanamesh_status',arguments:{}}})+'\n';p.stdin.write(request.slice(0,20));await new Promise(r=>setTimeout(r,100));
 await waitFor(async()=>{try{return JSON.parse(await readFile(join(f.shared,'runtime',`node-v24.13.1-darwin-${process.arch}`,'prepare-state.json'))).code==='RUNTIME_READY';}catch{return false;}});await new Promise(r=>setTimeout(r,250));p.stdin.write(request.slice(20));await waitFor(async()=>replies.length===2);assert.deepEqual(replies.map(r=>r.id),[1,2]);p.stdin.end();
});
test('an initial MCP attempt that fails before SessionStart consumes that first session budget rather than retrying twice',async t=>{
 const f=await fixture(t);await f.launch('mcp');await waitFor(async()=>(await f.state()).runtime.code==='RUNTIME_DOWNLOAD_FAILED');await f.launch('hook',['--event','SessionStart'],ss('host-first-session'));assert.equal((await f.state()).runtime.attemptCount,1);assert.equal((await readFile(join(f.root,'downloads'),'utf8')).trim().split('\n').length,1);
 await f.launch('hook',['--event','SessionStart'],ss('host-next-session'));await waitFor(async()=>{try{return(await readFile(join(f.root,'downloads'),'utf8')).trim().split('\n').length===2;}catch{return false;}});
});
