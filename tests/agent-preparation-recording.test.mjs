import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,copyFile,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const source=resolve(process.env.USAGE_TEST_ROOT??'.'),agentSource=process.env.USAGE_TEST_ROOT?'lib/agent':'src/agent';
import {createHash} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function fixture(t,channel){
 const root=await mkdtemp(join(tmpdir(),'hm-preparing-record-')),plugin=join(root,'plugin'),shared=join(root,'shared'),agent=join(shared,'agent/usage'),host=join(root,channel),cache=join(shared,'runtime',`node-v24.13.1-darwin-${process.arch}`);
 await mkdir(join(plugin,'lib'),{recursive:true});await cp(join(source,'agent/bin'),join(plugin,'bin'),{recursive:true});await cp(join(source,agentSource),join(plugin,'lib/agent'),{recursive:true});await writeFile(join(plugin,'package.json'),'{"type":"module"}');await mkdir(join(cache,'bin'),{recursive:true});await mkdir(agent,{recursive:true});await mkdir(join(host,'plugins'),{recursive:true});
 const target=join(root,'target');await mkdir(target);await writeFile(join(target,'.mcp.json'),JSON.stringify({mcpServers:{probe:{command:'FIXTURE'}}}));
 if(channel==='claude')await writeFile(join(host,'plugins/installed_plugins.json'),JSON.stringify({plugins:{'target@market':[{installPath:target}]}}));
 else{const cacheRoot=join(host,'plugins/cache/market/target/1.0');await mkdir(cacheRoot,{recursive:true});await copyFile(join(target,'.mcp.json'),join(cacheRoot,'.mcp.json'));await writeFile(join(host,'config.toml'),'[plugins."target@market"]\nenabled=true\n');}
 const core=join(root,'core.mjs');await writeFile(core,`for await(const c of process.stdin){};console.log(JSON.stringify({result:{agentProtocolVersion:2,deviceId:null,consent:{state:'withheld',changedAt:null,consentId:null,authorization:null}}}));`);
 const env={HOME:root,PATH:'/usr/bin:/bin',HANAMESH_SHARED_HOME:shared,HANAMESH_AGENT_HOME:agent,HANAMESH_CORE_AGENT_CLI:core,HANAMESH_AGENT_CHANNEL:channel,CODEX_HOME:host,CLAUDE_CONFIG_DIR:host};
 await writeFile(join(cache,'prepare-state.json'),JSON.stringify({code:'RUNTIME_PREPARING',phase:'download',startedAt:new Date().toISOString()}));
 const lock=spawn('/usr/bin/perl',['-MFcntl=:DEFAULT,:flock','-e',"sysopen my $f,$ARGV[0],O_WRONLY|O_CREAT,0600 or die;flock($f,LOCK_EX) or die;$|=1;print qq(LOCKED\\n);scalar <STDIN>;",join(cache,'prepare.lock')],{stdio:['pipe','pipe','pipe']});lock.stderr.resume();const [locked]=await once(lock.stdout,'data');assert.equal(String(locked),'LOCKED\n');
 let released=false;const release=async()=>{if(released)return;released=true;lock.stdin.end();if(lock.exitCode===null)await once(lock,'close');};t.after(async()=>{await release();await rm(root,{recursive:true,force:true});});
 const base={session_id:'PRIVATE_SESSION',tool_use_id:'original-call',tool_name:channel==='claude'?'mcp__plugin_target_probe__echo':'mcp__probe__echo',tool_input:{password:'PRIVATE_INPUT'},tool_response:{isError:false,content:[{type:'text',text:'PRIVATE_OUTPUT'}]}};
 const hook=(event,extra={})=>{const p=spawnSync('/bin/sh',[join(plugin,'bin/hm-agent'),'hook','--event',event],{env,input:JSON.stringify({...base,hook_event_name:event,...extra}),encoding:'utf8'});assert.equal(p.status,0,p.stderr);};
 const pending=async()=>{const names=await readdir(join(agent,'preparation')).catch(e=>e.code==='ENOENT'?[]:Promise.reject(e));return Promise.all(names.map(async n=>JSON.parse(await readFile(join(agent,'preparation',n)))));};
 const publish=async()=>{await release();await copyFile(process.execPath,join(cache,'bin/node'));const recipe=JSON.parse(await readFile(join(plugin,'bin/node-runtime.json')));await writeFile(join(cache,'archive.sha256'),recipe.architectures[process.arch].sha256+'\n');await writeFile(join(cache,'node.sha256'),sha(await readFile(process.execPath))+'  bin/node\n');await writeFile(join(cache,'prepare-state.json'),JSON.stringify({code:'RUNTIME_READY',finishedAt:new Date().toISOString()}));};
 return{root,agent,hook,pending,publish,base};
}
for(const channel of ['claude','codex'])test(`actual Node-free ${channel} Pre/Post retain original time then become one minimal activity after publication`,async t=>{
 const f=await fixture(t,channel);f.hook('PreToolUse');f.hook('PostToolUse');const pending=await f.pending();assert.equal(pending.length,2);assert.equal(pending[0].factId,sha(JSON.stringify([channel,'PRIVATE_SESSION','original-call'])));assert.doesNotMatch(JSON.stringify(pending),/PRIVATE_|password|tool_input|tool_response/);const first=pending.find(p=>p.event==='PreToolUse').occurredAt;
 await f.publish();f.hook('PreToolUse',{tool_use_id:'unrelated-read',tool_name:'Read'});const files=await readdir(join(f.agent,'events'));assert.equal(files.length,1);const row=JSON.parse(await readFile(join(f.agent,'events',files[0])));assert.equal(row.occurredAt,first);assert.equal(row.success,true);assert.equal(row.feature,'mcp:echo');assert.equal((await f.pending()).length,0);assert.doesNotMatch(JSON.stringify(row),/PRIVATE_|password/);
});
test('Node-free preparation ignores non-plugin Read and respects an explicit local close',async t=>{
 const f=await fixture(t,'claude');f.hook('PreToolUse',{tool_name:'Read'});assert.deepEqual(await f.pending(),[]);await writeFile(join(f.agent,'withdrawal.json'),JSON.stringify({state:'sent'}));f.hook('PreToolUse');f.hook('PostToolUse');assert.deepEqual(await f.pending(),[]);
});
