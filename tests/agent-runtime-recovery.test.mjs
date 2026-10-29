import {copyAgentBootstrap} from './fixtures/agent.mjs';
// Recreate the valid publication boundary, not a cold download or owner profile.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,copyFile,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {root as source} from './fixtures/helpers.mjs';

async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'hm-published-recovery 中文-')),plugin=join(root,'plugin'),shared=join(root,'shared'),agent=join(root,'usage'),cache=join(shared,'runtime',`node-v24.13.1-darwin-${process.arch}`),holders=[];
 t.after(async()=>{for(const child of holders){child.stdin.end();if(child.exitCode===null&&child.signalCode===null)await once(child,'close');}await rm(root,{recursive:true,force:true});});
 await mkdir(join(plugin,'lib'),{recursive:true});await copyAgentBootstrap(plugin);
 for(const name of ['agent','core'])await cp(join(source,'lib',name),join(plugin,'lib',name),{recursive:true});
 await writeFile(join(plugin,'package.json'),'{"type":"module"}');await mkdir(join(cache,'bin'),{recursive:true});await copyFile(process.execPath,join(cache,'bin/node'));
 const recipe=JSON.parse(await readFile(join(plugin,'bin/node-runtime.json'))),target=recipe.architectures[process.arch],digest=createHash('sha256').update(await readFile(join(cache,'bin/node'))).digest('hex');
 await writeFile(join(cache,'archive.sha256'),target.sha256+'\n');await writeFile(join(cache,'node.sha256'),digest+'  bin/node\n');await writeFile(join(cache,'prepare.lock'),'');
 const initial={code:'RUNTIME_PREPARING',phase:'publishing',initialEntry:'session',startedAt:new Date(Date.now()-5000).toISOString(),downloadedBytes:target.bytes,totalBytes:target.bytes,attemptCount:1,pid:99999999};
 await writeFile(join(cache,'prepare-state.json'),JSON.stringify(initial));
 await mkdir(agent);await writeFile(join(agent,'config.json'),JSON.stringify({serverOrigin:'http://127.0.0.1:1',websiteOrigin:'http://127.0.0.1:2',requestTimeoutMs:1000,bootstrapIntervalMs:60000}));
 const state={agentProtocolVersion:2,deviceId:'A'.repeat(43),consent:{state:'withheld',changedAt:null,consentId:null,authorization:null}},core=join(root,'core-fixture.mjs');
 await writeFile(core,`for await(const c of process.stdin){};console.log(JSON.stringify({result:${JSON.stringify(state)}}));`);
 const host=join(root,'claude'),targetPlugin=join(root,'target');await mkdir(join(host,'plugins'),{recursive:true});await mkdir(targetPlugin);
 await writeFile(join(targetPlugin,'.mcp.json'),JSON.stringify({mcpServers:{probe:{command:'FIXTURE'}}}));await writeFile(join(host,'plugins/installed_plugins.json'),JSON.stringify({plugins:{'target@market':[{installPath:targetPlugin}]}}));
 const env={HOME:root,PATH:'/usr/bin:/bin',HANAMESH_SHARED_HOME:shared,HANAMESH_AGENT_HOME:agent,HANAMESH_CORE_AGENT_CLI:core,HANAMESH_AGENT_CHANNEL:'claude',CLAUDE_CONFIG_DIR:host};
 const run=(action,args=[],input='')=>{const r=spawnSync('/bin/sh',[join(plugin,'bin/hm-agent'),action,...args],{env,input,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout?JSON.parse(r.stdout):null;};
 const disk=async()=>JSON.parse(await readFile(join(cache,'prepare-state.json'))),facts=async()=>readdir(join(agent,'events')).catch(error=>{if(error.code==='ENOENT')return [];throw error;});
 const hook=(event,id='after-publication')=>run('hook',['--event',event],JSON.stringify({hook_event_name:event,session_id:'fixture-published-session',source:'startup',tool_use_id:id,tool_name:'mcp__plugin_target_probe__echo',tool_response:{isError:false,content:[]}}));
 async function lock(){const child=spawn('/usr/bin/perl',['-MFcntl=:DEFAULT,:flock','-e',"sysopen my $f,$ARGV[0],O_WRONLY|O_CREAT,0600 or die;flock($f,LOCK_EX) or die;$|=1;print qq(LOCKED\\n);scalar <STDIN>;",join(cache,'prepare.lock')],{env,stdio:['pipe','pipe','pipe']});holders.push(child);child.stderr.resume();const [data]=await once(child.stdout,'data');assert.equal(String(data),'LOCKED\n');return async()=>{child.stdin.end();if(child.exitCode===null&&child.signalCode===null)await once(child,'close');};}
 return {root,cache,agent,initial,run,disk,facts,hook,lock};
}

test('published valid Node with an abandoned PREPARING state recovers before status, new session and actual Pre/Post',async t=>{
 const f=await fixture(t),value=f.run('status');assert.equal(value.runtime.code,'RUNTIME_READY');const recovered=await f.disk();
 assert.equal(recovered.code,'RUNTIME_READY','validated published cache and free lock must reconcile abandoned publication');assert.equal(recovered.phase,'ready');assert.ok(Date.parse(recovered.finishedAt)>=Date.parse(f.initial.startedAt));assert.equal(recovered.attemptCount,1);assert.equal(recovered.downloadedBytes,f.initial.totalBytes);
 f.hook('SessionStart');assert.equal((await f.disk()).attemptCount,1,'reconciliation must not download again');f.hook('PostToolUse','began-before-ready');assert.equal((await f.facts()).length,1,'an actual Post remains a local call');
 f.hook('PreToolUse');f.hook('PostToolUse');assert.equal((await f.facts()).length,2);assert.equal(f.run('status').localCollection.enabled,true);
});

test('an active preparation lock cannot be reclaimed and Node status agrees with hooks until its owner releases it',async t=>{
 const f=await fixture(t),release=await f.lock(),before=await readFile(join(f.cache,'prepare-state.json'),'utf8');
 try{const value=f.run('status');assert.equal(value.runtime.code,'RUNTIME_PREPARING');assert.equal(value.localCollection.enabled,true);f.hook('PreToolUse');f.hook('PostToolUse');assert.equal((await f.facts()).length,1);assert.equal(await readFile(join(f.cache,'prepare-state.json'),'utf8'),before);}finally{await release();}
 f.hook('SessionStart');assert.equal((await f.disk()).code,'RUNTIME_READY');f.hook('PreToolUse');f.hook('PostToolUse');assert.equal((await f.facts()).length,1);
});

test('free preparation lock does not recover an invalid published cache',async t=>{
 const f=await fixture(t);await writeFile(join(f.cache,'node.sha256'),'0'.repeat(64)+'  bin/node\n');
 const r=spawnSync('/bin/sh',[join(f.root,'plugin/bin/hm-agent'),'status'],{env:{HOME:f.root,PATH:'/usr/bin:/bin',HANAMESH_SHARED_HOME:join(f.root,'shared')},encoding:'utf8'});
 assert.notEqual(r.status,0);assert.match(r.stderr,/HANAMESH_NODE_RUNTIME_CHECKSUM_MISMATCH/);assert.equal((await f.disk()).code,'RUNTIME_PREPARING');
});
