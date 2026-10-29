/** Real native installation + nonblocking bootstrap in disposable homes; synthetic hooks, no model/account/production requests. */
import {mkdtemp,mkdir,writeFile,readFile,readdir,access,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {installedPlugins} from '../src/agent/inventory.mjs';
const coreTar=resolve(process.argv[2]??'');
const root=await mkdtemp(join(tmpdir(),'hm-agent-install-'));
const home=join(root,'home'),shared=join(home,'shared'),agent=join(home,'usage');
const stateFile=join(shared,'runtime',`node-v24.13.1-darwin-${process.arch}`,'prepare-state.json');
const receipt={scope:'ISOLATED_NATIVE_INSTALL_AND_BOOTSTRAP_SYNTHETIC_HOOKS_NOT_MODEL_UI_OR_OWNER',commands:[]};
let completed=false;
await writeFile(join(root,'.run-state.json'),JSON.stringify({state:'active',keep:true,purpose:receipt.scope}));
const env={PATH:process.env.PATH,HOME:home,CODEX_HOME:join(home,'codex'),CLAUDE_CONFIG_DIR:join(home,'claude'),HANAMESH_SHARED_HOME:shared,HANAMESH_AGENT_HOME:agent,TMPDIR:root,CI:'1',TERM:'dumb',GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'};
const run=(program,args,options={})=>{
 const start=Date.now(),result=spawnSync(program,args,{env,cwd:root,encoding:'utf8',timeout:55000,...options});const index=receipt.commands.length;
 receipt.commands.push({program:program===process.execPath?'node':program,args:args.map(x=>String(x).replaceAll(root,'<isolated>')),status:result.status,elapsedMs:Date.now()-start});
 console.log(result.stdout??'');console.error(result.stderr??'');
 const prefix=join(root,String(index));return writeFile(prefix+'.stdout',result.stdout??'').then(()=>writeFile(prefix+'.stderr',result.stderr??'')).then(()=>{assert.equal(result.status,0,`${program} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);return {stdout:result.stdout,stderr:result.stderr,elapsedMs:Date.now()-start};});
};
try{
 for(const p of [env.CODEX_HOME,env.CLAUDE_CONFIG_DIR,agent,join(root,'market/plugins')])await mkdir(p,{recursive:true});
 // Explicit offline endpoint pair before any potential host startup. Never default to production in tests.
 await writeFile(join(agent,'config.json'),JSON.stringify({serverOrigin:'http://127.0.0.1:1',websiteOrigin:'http://127.0.0.1:2',bootstrapIntervalMs:60000,requestTimeoutMs:10000}));
 const market=join(root,'market'),plugin=join(market,'plugins/hanamesh-usage');
 await run(process.execPath,['tools/package-agent.mjs',coreTar,plugin],{cwd:process.cwd()});
 await mkdir(join(market,'.claude-plugin'));await mkdir(join(market,'.agents/plugins'),{recursive:true});
 const target=join(market,'plugins/target');await mkdir(join(target,'.claude-plugin'),{recursive:true});
 await writeFile(join(target,'.claude-plugin/plugin.json'),JSON.stringify({name:'target',version:'1.0.0',description:'Synthetic hook fixture, no model or tool execution'}));await writeFile(join(target,'.mcp.json'),JSON.stringify({mcpServers:{probe:{command:'node',args:['-e','process.stdin.resume()']}}}));
 await writeFile(join(market,'.claude-plugin/marketplace.json'),JSON.stringify({name:'hanamesh-g-fixture',owner:{name:'HanaMesh fixture'},plugins:[{name:'hanamesh',source:'./plugins/hanamesh-usage'},{name:'target',source:'./plugins/target'}]}));
 await writeFile(join(market,'.agents/plugins/marketplace.json'),JSON.stringify({name:'hanamesh-g-fixture',interface:{displayName:'HanaMesh fixture'},plugins:[{name:'hanamesh',source:{source:'local',path:'./plugins/hanamesh-usage'},policy:{installation:'AVAILABLE',authentication:'ON_INSTALL'}},{name:'target',source:{source:'local',path:'./plugins/target'},policy:{installation:'AVAILABLE',authentication:'ON_INSTALL'}}]}));
 await run('git',['init','-b','main',market]);await run('git',['-C',market,'add','.']);await run('git',['-C',market,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','-m','fixture']);
 await run('claude',['--version']);await run('codex',['--version']);
 await run('claude',['plugin','marketplace','add',market]);await run('claude',['plugin','install','hanamesh@hanamesh-g-fixture']);await run('claude',['plugin','install','target@hanamesh-g-fixture']);
 await run('codex',['plugin','marketplace','add',market]);await run('codex',['plugin','add','hanamesh@hanamesh-g-fixture']);await run('codex',['plugin','add','target@hanamesh-g-fixture']);
 const hosts=[await installedPlugins('claude',env.CLAUDE_CONFIG_DIR),await installedPlugins('codex',env.CODEX_HOME)];const roots=hosts.map(rows=>{const own=rows.filter(r=>r.pluginName==='hanamesh');assert.equal(own.length,1);return own[0].root;});
 await assert.rejects(access(stateFile),'native installation must leave the runtime cache empty for the cold test');
 const coldHook=await run('/bin/sh',[join(roots[0],'bin/hm-agent'),'hook','--event','SessionStart'],{env:{...env,HANAMESH_AGENT_CHANNEL:'claude'},input:JSON.stringify({hook_event_name:'SessionStart',session_id:'fixture-cold-start',source:'startup'})});assert.ok(coldHook.elapsedMs<1000,'cold SessionStart must return within1s, not wait for download');assert.match(JSON.parse(coldHook.stdout).systemMessage,/正在准备运行环境/);receipt.coldSessionStartMs=coldHook.elapsedMs;
 const progressSamples=[];
 for(const root of roots){const descriptor=JSON.parse(await readFile(join(root,'.mcp.json'))).mcpServers.hanamesh;const input=[{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2024-11-05'}},{jsonrpc:'2.0',id:2,method:'tools/list'},{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'hanamesh_status',arguments:{}}}].map(x=>JSON.stringify(x)).join('\n')+'\n';const result=await run(descriptor.command,descriptor.args,{cwd:root,input,env:{...env,CLAUDE_PLUGIN_ROOT:root}});assert.ok(result.elapsedMs<10000,'MCP startup/readonly probe exceeds default10s budget');const replies=result.stdout.trim().split('\n').map(x=>JSON.parse(x));assert.equal(replies.length,3);assert.equal(replies[1].result.tools[0].annotations.readOnlyHint,true);const status=JSON.parse(replies[2].result.content[0].text);assert.ok(['RUNTIME_PREPARING','RUNTIME_READY'].includes(status.runtime.code));receipt.commands.at(-1).runtimeCode=status.runtime.code;}
 const hook=(channel,event,payload)=>run('/bin/sh',[join(roots[channel==='codex'?1:0],'bin/hm-agent'),'hook','--event',event],{env:{...env,HANAMESH_AGENT_CHANNEL:channel},input:payload});
 const initial=JSON.parse(await readFile(stateFile));if(initial.code==='RUNTIME_PREPARING'){const result=await hook('claude','PostToolUse',JSON.stringify({hook_event_name:'PostToolUse',session_id:'fixture-preparing',tool_use_id:'preparing-only',tool_name:'Read',tool_input:{secret:'SYNTHETIC_PREPARING_CONTENT'}}));assert.ok(result.elapsedMs<1000);assert.equal(result.stdout,'');await assert.rejects(access(join(agent,'events')));}
 const deadline=Date.now()+300000;let phase;
 for(;;){phase=JSON.parse(await readFile(stateFile));if(!progressSamples.length||progressSamples.at(-1).downloadedBytes!==phase.downloadedBytes)progressSamples.push({code:phase.code,phase:phase.phase,downloadedBytes:phase.downloadedBytes,totalBytes:phase.totalBytes,observedAt:new Date().toISOString()});if(phase.code!=='RUNTIME_PREPARING')break;assert.ok(Date.now()<deadline,'background producer did not complete within independent300s acceptance window');await delay(200);}
 assert.equal(phase.code,'RUNTIME_READY',JSON.stringify(phase));await writeFile(join(root,'progress-samples.json'),JSON.stringify(progressSamples,null,2));receipt.preparation={code:phase.code,downloadedBytes:phase.downloadedBytes,totalBytes:phase.totalBytes,startedAt:phase.startedAt,finishedAt:phase.finishedAt,attemptCount:phase.attemptCount,noHostTimeoutIncrease:true,preparingWindowRecorded:false};
 const start={hook_event_name:'SessionStart',session_id:'fixture-fresh-main',source:'startup'};const notice=await hook('claude','SessionStart',JSON.stringify(start));assert.match(JSON.parse(notice.stdout).systemMessage,/已开启本机/);assert.match(JSON.parse(notice.stdout).systemMessage,/绑定链接尚未就绪/);
 const base={session_id:'fixture-hook-session',tool_use_id:'fixture-call',tool_input:{secret:'SYNTHETIC_PRIVATE_INPUT'},tool_response:{isError:false,text:'SYNTHETIC_PRIVATE_OUTPUT'},transcript_path:'/private/must-not-read'};
 for(const channel of ['claude','codex']){const tool_name=channel==='claude'?'mcp__plugin_target_probe__echo':'mcp__probe__echo';await hook(channel,'PostToolUse',JSON.stringify({...base,tool_use_id:'began-before-ready',tool_name,hook_event_name:'PostToolUse'}));for(const hook_event_name of ['PreToolUse','PostToolUse'])await hook(channel,hook_event_name,JSON.stringify({...base,tool_name,hook_event_name}));}
 const status=JSON.parse((await run('/bin/sh',[join(roots[0],'bin/hm-agent'),'status'])).stdout);assert.equal(status.counts.local,2);assert.equal(status.consent.state,'withheld');assert.deepEqual(new Set(status.records.map(r=>r.channel)),new Set(['claude','codex']));assert.doesNotMatch(JSON.stringify(status.records),/SYNTHETIC_PRIVATE|fixture-hook-session|private\/|transcript/);receipt.syntheticHooks={bothChannelsRecordedAfterReady:true,latePreparationPostNotBackfilled:true,minimalProjection:true,uploadConsent:'withheld',actualModelUse:false};
 await run('/bin/sh',[join(roots[0],'bin/hm-agent'),'withdraw']);const after=JSON.parse((await run('/bin/sh',[join(roots[0],'bin/hm-agent'),'status'])).stdout);assert.equal(after.counts.local,0);assert.equal(after.consent.state,'withheld');assert.equal(after.withdrawal.state,'pending');receipt.withdrawal={localCleared:true,remoteBarrier:'PENDING_OFFLINE_NOT_PASS'};
 completed=true;console.log(JSON.stringify(receipt,null,2));
}finally{
 if(!completed){try{const s=JSON.parse(await readFile(stateFile));if(s.code==='RUNTIME_PREPARING'&&s.pid){process.kill(-s.pid,'SIGTERM');await delay(250);}}catch{}}
 try{console.error('VERIFICATION_EVIDENCE: '+JSON.stringify({...receipt,completed,temporaryDirectory:root}));}
 finally{await rm(root,{recursive:true,force:true});}
}
