import {copyAgentBootstrap} from './fixtures/agent.mjs';
import test,{before,after} from 'node:test';
import {watch} from 'node:fs';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,writeFile,readFile,readdir,rm,link,stat} from 'node:fs/promises';
import {join,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const shellquote=v=>"'"+v.replaceAll("'","'\"'\"'")+"'";
const perlquote=v=>"'"+v.replaceAll('\\','\\\\').replaceAll("'","\\'")+"'";
let templateRoot,curlTemplate;
before(async()=>{
 templateRoot=await mkdtemp(join(tmpdir(),'hm-runtime-curl-template-'));curlTemplate=join(templateRoot,'fixture-curl');
 // One executable inode per test file; hard links keep the pre-execution scan result.
 await writeFile(curlTemplate,`#!/usr/bin/perl
use strict;use warnings;use JSON::PP;use Time::HiRes qw(time);use File::Copy qw(copy);
exit 0 if (@ARGV && $ARGV[0] eq '--warmup');
my $root=$ENV{HOME};my $json=JSON::PP->new->canonical;
sub event {my($file,$value)=@_;open my $f,'>>',"$root/$file" or die 'FIXTURE_EVENT_REQUIRED';print $f $json->encode($value)."\\n";close $f or die 'FIXTURE_EVENT_CLOSE';}
open my $mode_f,'<',"$root/fixture-mode" or die 'FIXTURE_MODE_REQUIRED';my $mode=<$mode_f>;close $mode_f;
event('downloads',{pid=>$$,startedAt=>int(time()*1000)});
# Controlled barrier, not a fixed download delay. The test releases this exact attempt.
while(!-e "$root/release-$$"){select(undef,undef,undef,0.005);}
my $exit=7;
if($mode ne 'failure'){my $out;while(@ARGV){my $arg=shift @ARGV;$out=shift @ARGV if $arg eq '-o';}die 'FIXTURE_OUTPUT_REQUIRED' unless defined $out;copy("$root/fixture.tar.xz",$out) or die 'FIXTURE_COPY_FAILED';$exit=0;}
event('curl-exits',{pid=>$$,exitedAt=>int(time()*1000)});exit $exit;
`,{mode:0o755});
 const warmed=spawnSync(curlTemplate,['--warmup'],{env:{...process.env,HOME:templateRoot},encoding:'utf8'});assert.equal(warmed.status,0,warmed.stderr);
});
after(async()=>{if(templateRoot)await rm(templateRoot,{recursive:true,force:true});});
// Subscribe before reading: an atomic state rename between the read and the await cannot be lost.
async function eventUntil(directory,read,signal){
 let version=0,wake,fault;const changed=()=>{version++;wake?.();},watcher=watch(directory,changed);watcher.on('error',error=>{fault=error;changed();});signal.addEventListener('abort',changed);
 try{for(;;){signal.throwIfAborted();if(fault)throw fault;const seen=version,value=await read();if(value)return value;await new Promise(resolve=>{wake=resolve;if(version!==seen||signal.aborted)resolve();});wake=undefined;}}
 finally{watcher.close();signal.removeEventListener('abort',changed);}
}
async function fixture(t,mode='failure'){
 const root=await mkdtemp(join(tmpdir(),'hm-background-runtime 中文-'));const plugin=join(root,'plugin'),shared=join(root,'shared');await mkdir(plugin);await copyAgentBootstrap(plugin);
 const curl=join(root,'fixture-curl');await link(curlTemplate,curl);const linked=await stat(curl),template=await stat(curlTemplate);assert.equal(linked.ino,template.ino);assert.equal(linked.dev,template.dev);await writeFile(join(root,'fixture-inode.json'),JSON.stringify({inode:linked.ino,device:linked.dev,templateInode:template.ino,warmedInBefore:true,perRootHardLink:true}));await writeFile(join(root,'fixture-mode'),mode);
 for(const file of await readdir(join(plugin,'bin'))){const p=join(plugin,'bin',file),s=await readFile(p,'utf8');await writeFile(p,file.endsWith('.pl')?s.replaceAll("'/usr/bin/curl'",JSON.stringify(curl)):s.replaceAll('/usr/bin/curl',shellquote(curl)));}
 if(mode!=='failure'){
  const name=`node-v24.13.1-darwin-${process.arch}`,tree=join(root,'archive-tree',name);await mkdir(join(tree,'bin'),{recursive:true});
  // The extracted wrapper is a fresh inode. Measure after its final real --version child exits,
  // so the one-time OS scan is not attributed to the producer's state commit latency.
  await writeFile(join(tree,'bin/node'),`#!/usr/bin/perl\nuse strict;use warnings;use Time::HiRes qw(time);use JSON::PP;\nmy $node=${perlquote(process.execPath)};if(@ARGV==1&&$ARGV[0] eq '--version'){my $status=system {$node} $node,@ARGV;open my $f,'>>',"$ENV{HOME}/node-exits" or die;print $f JSON::PP->new->encode({exitedAt=>int(time()*1000)})."\\n";close $f;exit($status>>8);}exec {$node} $node,@ARGV;\n`,{mode:0o755});await writeFile(join(tree,'LICENSE'),'TEST FIXTURE ONLY');
  const archive=join(root,'fixture.tar.xz');assert.equal(spawnSync('/usr/bin/tar',['-cJf',archive,'-C',join(root,'archive-tree'),name],{env:{...process.env,LC_ALL:'C'}}).status,0);
  const bytes=await readFile(archive),recipePath=join(plugin,'bin/node-runtime.json'),recipe=JSON.parse(await readFile(recipePath));recipe.architectures[process.arch].sha256=mode==='badsha'?'0'.repeat(64):createHash('sha256').update(bytes).digest('hex');recipe.architectures[process.arch].bytes=bytes.length;await writeFile(recipePath,JSON.stringify(recipe));
  await mkdir(join(plugin,'lib/agent'),{recursive:true});await writeFile(join(plugin,'lib/agent/preparation.mjs'),'// Explicit no-activity runtime publication fixture.\n');await writeFile(join(plugin,'lib/agent/cli.mjs'),`import{writeFileSync}from'node:fs';import{createInterface}from'node:readline';writeFileSync(${JSON.stringify(join(root,'takeover-mode'))},process.argv[2]);for await(const line of createInterface({input:process.stdin})){const q=JSON.parse(line);if(q.id!==undefined)console.log(JSON.stringify({jsonrpc:'2.0',id:q.id,result:{content:[{type:'text',text:JSON.stringify({runtime:{code:'RUNTIME_READY'},mode:process.argv[2]})}]}}));}`);
 }
 const env={PATH:'/usr/bin:/bin',HOME:root,HANAMESH_SHARED_HOME:shared,HANAMESH_AGENT_HOME:join(root,'agent'),CLAUDE_CONFIG_DIR:join(root,'claude'),HANAMESH_AGENT_CHANNEL:'claude'};
 let preserve=false;const children=[];t.after(async()=>{if(process.env.HM_RUNTIME_TEST_EVIDENCE){await mkdir(process.env.HM_RUNTIME_TEST_EVIDENCE,{recursive:true});await cp(shared,join(process.env.HM_RUNTIME_TEST_EVIDENCE,basename(root)),{recursive:true}).catch(()=>{});const control=join(process.env.HM_RUNTIME_TEST_EVIDENCE,basename(root),'control');await mkdir(control,{recursive:true});for(const file of await readdir(root))if(/^(?:fixture-inode\.json|downloads|curl-exits|node-exits|terminal-timing-\d+\.json)$/u.test(file))await cp(join(root,file),join(control,file));}for(const p of children)if(p.exitCode===null)p.kill('SIGTERM'); // fixture worker cleanup is limited to its published PID.
  const runtime=join(shared,'runtime');try{for(const d of await readdir(runtime)){const f=join(runtime,d,'prepare-state.json');try{const state=JSON.parse(await readFile(f));if(state.code==='RUNTIME_PREPARING'&&state.pid)try{process.kill(-state.pid,'SIGTERM');}catch{}}catch{}}}catch{}
  await new Promise(r=>setTimeout(r,30));if(preserve){await writeFile(join(root,'.run-state.json'),JSON.stringify({state:'done-failed-fixture',keep:true}));console.error('RUNTIME_FAILED_FIXTURE_RETAINED: '+root);}else await rm(root,{recursive:true,force:true});});
 const launch=(action,args=[],input='')=>new Promise((ok,bad)=>{const start=performance.now(),p=spawn('/bin/sh',[join(plugin,'bin/hm-agent'),action,...args],{env,stdio:['pipe','pipe','pipe']});children.push(p);let stdout='',stderr='';p.stdout.on('data',c=>stdout+=c);p.stderr.on('data',c=>stderr+=c);p.on('error',bad);p.on('close',code=>ok({code,stdout,stderr,ms:performance.now()-start}));p.stdin.on('error',()=>{});p.stdin.end(input);});
 const state=async()=>JSON.parse((await launch('status')).stdout);
 const captureFailure=async({gate='MCP response',limitMs=5000}={})=>{
  preserve=true;let preparation;
  try{preparation=JSON.parse(await readFile(join(shared,'runtime',`node-v24.13.1-darwin-${process.arch}`,'prepare-state.json')));}catch(error){preparation={readError:error.code??'UNKNOWN'};}
  const processes=spawnSync('/bin/ps',['-axo','pid=,ppid=,stat=,etime=,args='],{encoding:'utf8'}).stdout.split('\n').flatMap(line=>{const m=line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(.*)$/);return m?[{pid:Number(m[1]),parent:Number(m[2]),state:m[3],elapsed:m[4],command:m[5]}]:[];});const owned=new Set([preparation.pid,...children.map(p=>p.pid)].filter(Boolean));let changed=true;while(changed){const n=owned.size;for(const p of processes)if(owned.has(p.parent))owned.add(p.pid);changed=owned.size>n;}
  const signalState=spawnSync('/bin/ps',['-o','pid=,ppid=,sigmask=,sig=,wchan=','-p',[...owned].join(',')],{encoding:'utf8'});
  const snapshot={signalState:signalState.stdout,ownedProcesses:processes.filter(p=>owned.has(p.pid)),gate,acceptanceWindowMs:limitMs,failedAt:new Date().toISOString(),preparation,children:children.map(p=>({pid:p.pid,exitCode:p.exitCode,signalCode:p.signalCode}))};
  await writeFile(join(root,'deadline-failure.json'),JSON.stringify(snapshot,null,2));

  console.error('RUNTIME_FIXED_WINDOW_FAILURE: '+JSON.stringify(snapshot));
 };
 const cache=join(shared,'runtime',`node-v24.13.1-darwin-${process.arch}`),raw=async()=>JSON.parse(await readFile(join(cache,'prepare-state.json'),'utf8'));
 const rows=async file=>{try{return(await readFile(join(root,file),'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));}catch(error){if(error.code==='ENOENT')return[];throw error;}};
 const started=number=>eventUntil(root,async()=>{const attempts=await rows('downloads');return attempts[number-1];},t.signal);
 const settle=async(attempt,expected)=>{
  const terminal=eventUntil(cache,async()=>{const value=await raw();return value.code!=='RUNTIME_PREPARING'?value:false;},t.signal);
  await writeFile(join(root,'release-'+attempt.pid),'release this fixture attempt');const value=await terminal;
  try{assert.equal(value.code,expected);const finished=Date.parse(value.finishedAt),exits=await rows(mode==='ready'?'node-exits':'curl-exits'),matching=exits.filter(row=>(mode==='ready'||row.pid===attempt.pid)&&row.exitedAt<=finished);assert.ok(matching.length,'a fixture exit must precede finishedAt');const exited=Math.max(...matching.map(row=>row.exitedAt)),elapsed=finished-exited;assert.ok(elapsed<=1000,`producer terminal commit after fixture exit: ${elapsed}ms`);await writeFile(join(root,`terminal-timing-${attempt.pid}.json`),JSON.stringify({fixturePid:attempt.pid,producerPid:value.pid,code:value.code,fixtureExitedAt:exited,finishedAt:value.finishedAt,elapsedMs:elapsed,limitMs:1000}));return value;}catch(error){await captureFailure({gate:'producer commit after final fixture exit',limitMs:1000});throw error;}
 };
 return{root,plugin,shared,env,launch,state,children,raw,started,settle,event:read=>eventUntil(root,read,t.signal),waitFor:fn=>waitFor(fn,captureFailure)};
}
const waitFor=async(fn,onFailure)=>{const until=performance.now()+5000;for(;;){if(await fn())return;if(performance.now()>until){await onFailure?.();assert.fail('fixture preparation did not settle');}await new Promise(r=>setTimeout(r,40));}};
const ss=id=>JSON.stringify({hook_event_name:'SessionStart',session_id:id,source:'startup',transcript_path:'/DO_NOT_READ_TRANSCRIPT'});
test('missing-runtime SessionStart returns immediately with preparing notice; tool payload is never parsed or persisted',async t=>{
 const f=await fixture(t);const result=await f.launch('hook',['--event','SessionStart'],ss('one'));assert.equal(result.code,0,result.stderr);assert.ok(result.ms<500,'startup must not wait for the blocked fixture download');assert.match(JSON.parse(result.stdout).systemMessage,/正在准备运行环境/);
 const tool=await f.launch('hook',['--event','PostToolUse'],'NOT JSON SECRET_RAW_TOOL_INPUT');assert.equal(tool.code,0,tool.stderr);assert.equal(tool.stdout,'');assert.ok(tool.ms<500);const state=await f.state();assert.equal(state.runtime.code,'RUNTIME_PREPARING');assert.equal(state.runtime.recordingDuringPreparation,true);assert.equal(typeof state.runtime.downloadedBytes,'number');const attempt=await f.started(1);assert.equal((await f.state()).runtime.code,'RUNTIME_PREPARING');await f.settle(attempt,'RUNTIME_DOWNLOAD_FAILED');
});
test('cold MCP completes initialize/list/status below10s and returns named not-ready instead of timing out',async t=>{
 const f=await fixture(t);const p=spawn('/bin/sh',[join(f.plugin,'bin/hm-agent'),'mcp'],{env:f.env,stdio:['pipe','pipe','pipe']});f.children.push(p);let buf='';const replies=[];p.stdout.on('data',c=>{buf+=c;for(;;){const i=buf.indexOf('\n');if(i<0)break;replies.push(JSON.parse(buf.slice(0,i)));buf=buf.slice(i+1);}});let stderr='';p.stderr.on('data',c=>stderr+=c);const start=performance.now();
 p.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2024-11-05'}})+'\n');p.stdin.write(JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list'})+'\n');p.stdin.write(JSON.stringify({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'hanamesh_status',arguments:{}}})+'\n');
 await new Promise((ok,bad)=>{let done=false;const deadline=setTimeout(()=>{done=true;bad(Error('MCP_NO_RESPONSE_WITHIN_1000MS:'+stderr));},1000);const check=()=>{if(done)return;if(replies.length===3){done=true;clearTimeout(deadline);ok();}else setTimeout(check,5);};check();});assert.ok(performance.now()-start<1000);assert.equal(replies[0].result.serverInfo.name,'hanamesh-usage');assert.equal(replies[1].result.tools[0].name,'hanamesh_status');const value=JSON.parse(replies[2].result.content[0].text);assert.equal(value.runtime.code,'RUNTIME_PREPARING');assert.equal(replies[2].result.isError,true);p.stdin.end();const attempt=await f.started(1);assert.equal((await f.state()).runtime.code,'RUNTIME_PREPARING');await f.settle(attempt,'RUNTIME_DOWNLOAD_FAILED');
});
test('failure stays named; ordinary hooks do not retry, same session does not retry, next new session starts exactly once',async t=>{
 const f=await fixture(t);await f.launch('hook',['--event','SessionStart'],ss('first'));const first=await f.started(1);assert.equal((await f.state()).runtime.code,'RUNTIME_PREPARING');await f.settle(first,'RUNTIME_DOWNLOAD_FAILED');let value=await f.state();assert.equal(value.runtime.code,'RUNTIME_DOWNLOAD_FAILED');assert.match(value.runtime.message,/下次.*会话/);
 await f.launch('hook',['--event','PostToolUse'],'SECRET_RAW_RESULT');await f.launch('hook',['--event','SessionStart'],ss('first'));assert.equal((await f.state()).runtime.attemptCount,1);assert.equal((await readFile(join(f.root,'downloads'),'utf8')).trim().split('\n').length,1);
 await f.launch('hook',['--event','SessionStart'],ss('second'));await f.launch('hook',['--event','SessionStart'],ss('second'));const second=await f.started(2);assert.equal((await f.state()).runtime.code,'RUNTIME_PREPARING');await f.settle(second,'RUNTIME_DOWNLOAD_FAILED');assert.equal((await readFile(join(f.root,'downloads'),'utf8')).trim().split('\n').length,2);
});
test('concurrent missing-runtime entrypoints start one detached producer and retain only hashed control metadata',async t=>{
 const f=await fixture(t);await Promise.all(Array.from({length:5},(_,i)=>f.launch('hook',['--event',i?'PostToolUse':'SessionStart'],i?'SECRET_TOOL_PAYLOAD_NOT_JSON':ss('PRIVATE_SESSION_ID'))));const attempt=await f.started(1);assert.equal((await f.state()).runtime.code,'RUNTIME_PREPARING');assert.equal((await readFile(join(f.root,'downloads'),'utf8')).trim().split('\n').length,1);await f.settle(attempt,'RUNTIME_DOWNLOAD_FAILED');
 const all=async dir=>{let out='';for(const d of await readdir(dir,{withFileTypes:true})){const p=join(dir,d.name);out+=d.isDirectory()?await all(p):await readFile(p,'utf8');}return out;};assert.doesNotMatch(await all(f.shared),/SECRET_TOOL_PAYLOAD|PRIVATE_SESSION_ID|DO_NOT_READ_TRANSCRIPT/);
});

test('a detached successful prepare survives MCP close and is reused without another download',async t=>{
 const f=await fixture(t,'ready');const start=await f.launch('hook',['--event','SessionStart'],ss('ready-session'));assert.equal(start.code,0,start.stderr);assert.ok(start.ms<500);const attempt=await f.started(1);assert.equal((await f.state()).runtime.code,'RUNTIME_PREPARING');await f.settle(attempt,'RUNTIME_READY');
 assert.equal((await readFile(join(f.root,'downloads'),'utf8')).trim().split('\n').length,1);const result=await f.launch('mcp',[],JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'hanamesh_status',arguments:{}}})+'\n');assert.equal(result.code,0,result.stderr);assert.equal(JSON.parse(JSON.parse(result.stdout).result.content[0].text).runtime.code,'RUNTIME_READY');assert.equal((await readFile(join(f.root,'downloads'),'utf8')).trim().split('\n').length,1);
});
test('an already-initialized MCP bridge hands off while idle, preserving queued request IDs without another initialize',async t=>{
 const f=await fixture(t,'ready');const p=spawn('/bin/sh',[join(f.plugin,'bin/hm-agent'),'mcp'],{env:f.env,stdio:['pipe','pipe','pipe']});f.children.push(p);let buf='',stderr='';const replies=[];p.stdout.on('data',c=>{buf+=c;for(;;){const i=buf.indexOf('\n');if(i<0)break;replies.push(JSON.parse(buf.slice(0,i)));buf=buf.slice(i+1);}});p.stderr.on('data',c=>stderr+=c);
 p.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2024-11-05'}})+'\n');await f.waitFor(async()=>replies.length===1);const attempt=await f.started(1);assert.equal((await f.state()).runtime.code,'RUNTIME_PREPARING');await f.settle(attempt,'RUNTIME_READY');await f.event(async()=>{try{return(await readFile(join(f.root,'takeover-mode'),'utf8'))==='mcp-ready';}catch(error){if(error.code==='ENOENT')return false;throw error;}});
 for(const id of [2,3])p.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{name:'hanamesh_status',arguments:{}}})+'\n');await f.waitFor(async()=>replies.length===3);assert.deepEqual(replies.map(r=>r.id),[1,2,3]);assert.equal(JSON.parse(replies[2].result.content[0].text).mode,'mcp-ready');p.stdin.end();
});
test('a checksum mismatch is named and never publishes a runtime or falls back to PATH',async t=>{
 const f=await fixture(t,'badsha');await f.launch('hook',['--event','SessionStart'],ss('badsha'));const attempt=await f.started(1);assert.equal((await f.state()).runtime.code,'RUNTIME_PREPARING');await f.settle(attempt,'RUNTIME_ARCHIVE_CHECKSUM_MISMATCH');assert.equal((await f.state()).runtime.code,'RUNTIME_ARCHIVE_CHECKSUM_MISMATCH');await assert.rejects(readFile(join(f.shared,'runtime',`node-v24.13.1-darwin-${process.arch}`,'bin/node')));
});

test('runtime becoming ready during a fragmented MCP request preserves the consumed prefix',async t=>{
 const f=await fixture(t,'ready'),p=spawn('/bin/sh',[join(f.plugin,'bin/hm-agent'),'mcp'],{env:f.env,stdio:['pipe','pipe','pipe']});f.children.push(p);let buf='';const replies=[];p.stdout.on('data',c=>{buf+=c;for(;;){const i=buf.indexOf('\n');if(i<0)break;replies.push(JSON.parse(buf.slice(0,i)));buf=buf.slice(i+1);}});p.stderr.resume();
 p.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{}})+'\n');await f.waitFor(async()=>replies.length===1);
 const request=JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'hanamesh_status',arguments:{}}})+'\n';const attempt=await f.started(1);assert.equal((await f.state()).runtime.code,'RUNTIME_PREPARING');p.stdin.write(request.slice(0,20));await new Promise(r=>setTimeout(r,100));
 await f.settle(attempt,'RUNTIME_READY');await new Promise(r=>setTimeout(r,250));p.stdin.write(request.slice(20));await f.waitFor(async()=>replies.length===2);assert.deepEqual(replies.map(r=>r.id),[1,2]);p.stdin.end();
});
test('an initial MCP attempt that fails before SessionStart consumes that first session budget rather than retrying twice',async t=>{
 const f=await fixture(t);await f.launch('mcp');const first=await f.started(1);assert.equal((await f.state()).runtime.code,'RUNTIME_PREPARING');await f.settle(first,'RUNTIME_DOWNLOAD_FAILED');await f.launch('hook',['--event','SessionStart'],ss('host-first-session'));assert.equal((await f.state()).runtime.attemptCount,1);assert.equal((await readFile(join(f.root,'downloads'),'utf8')).trim().split('\n').length,1);
 await f.launch('hook',['--event','SessionStart'],ss('host-next-session'));const second=await f.started(2);assert.equal((await f.state()).runtime.code,'RUNTIME_PREPARING');await f.settle(second,'RUNTIME_DOWNLOAD_FAILED');
});
