/** Real CLI installation and MCP startup in disposable host homes; no model, credentials or production network. */
import {mkdtemp,rm,mkdir,cp,writeFile,readFile,access} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import {installedPlugins} from '../src/agent/inventory.mjs';

const coreTar=resolve(process.argv[2] ?? '');
const root=await mkdtemp(join(tmpdir(),'hm-agent-install-'));
const receipt={scope:'ISOLATED_REAL_CLI_INSTALL_MCP_NOT_MODEL_OR_OWNER',commands:[]};
try {
  const home=join(root,'home'),market=join(root,'market'),plugin=join(market,'plugins/hanamesh-usage');
  for(const path of [home,join(home,'codex'),join(home,'claude'),market,join(market,'plugins')])await mkdir(path,{recursive:true});
  const env={PATH:process.env.PATH,HOME:home,CODEX_HOME:join(home,'codex'),CLAUDE_CONFIG_DIR:join(home,'claude'),HANAMESH_SHARED_HOME:join(home,'shared'),HANAMESH_AGENT_HOME:join(home,'usage'),TMPDIR:root,CI:'1',TERM:'dumb',GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'};
  const run=(program,args,options={})=>{
    const r=spawnSync(program,args,{env,cwd:root,encoding:'utf8',timeout:55000,...options});
    receipt.commands.push({program:program===process.execPath?'node':program,args:args.map(arg=>String(arg).replaceAll(root,'<isolated>')),status:r.status});
    assert.equal(r.status,0,`${program} ${args.join(' ')}\n${r.stdout}\n${r.stderr}`);return r.stdout;
  };
  run(process.execPath,['tools/package-agent.mjs',coreTar,plugin],{cwd:process.cwd()});
  await mkdir(join(market,'.claude-plugin'));
  const target=join(market,'plugins/target');await mkdir(join(target,'.claude-plugin'),{recursive:true});
  await writeFile(join(target,'.claude-plugin/plugin.json'),JSON.stringify({name:'target',version:'1.0.0',description:'Synthetic hook fixture; no model/tool execution'}));
  await writeFile(join(target,'.mcp.json'),JSON.stringify({mcpServers:{probe:{command:'node',args:['-e','process.stdin.resume()']}}}));
  await writeFile(join(market,'.claude-plugin/marketplace.json'),JSON.stringify({name:'hanamesh-g-fixture',owner:{name:'HanaMesh fixture'},plugins:[{name:'hanamesh',source:'./plugins/hanamesh-usage'},{name:'target',source:'./plugins/target'}]}));
  run('git',['init','-b','main',market]);run('git',['-C',market,'add','.']);
  run('git',['-C',market,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','-m','fixture']);
  run('claude',['--version']);run('codex',['--version']);
  run('claude',['plugin','marketplace','add',market]);run('claude',['plugin','install','hanamesh@hanamesh-g-fixture']);
  run('codex',['plugin','marketplace','add',market]);run('codex',['plugin','add','hanamesh@hanamesh-g-fixture']);
  run('claude',['plugin','install','target@hanamesh-g-fixture']);run('codex',['plugin','add','target@hanamesh-g-fixture']);
  const cc=await installedPlugins('claude',env.CLAUDE_CONFIG_DIR),cx=await installedPlugins('codex',env.CODEX_HOME);
  assert(cc.some(row=>row.pluginName==='hanamesh'));assert(cx.some(row=>row.pluginName==='hanamesh'));
  for(const installed of [cc,cx]){
    const root=installed.find(row=>row.pluginName==='hanamesh').root;
    const config=JSON.parse(await readFile(join(root,'.mcp.json'),'utf8')).mcpServers['hanamesh'];
    const input=[{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2024-11-05'}},{jsonrpc:'2.0',id:2,method:'tools/list'},{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'hanamesh_status',arguments:{}}}].map(x=>JSON.stringify(x)).join('\n')+'\n';
    const output=run(config.command,config.args,{cwd:root,input,env:{...env,CLAUDE_PLUGIN_ROOT:root}});
    const replies=output.trim().split('\n').map(line=>JSON.parse(line));
    assert.equal(replies.length,3);assert.equal(replies[1].result.tools[0].annotations.readOnlyHint,true);
    assert.equal(JSON.parse(replies[2].result.content[0].text).consent.state,'withheld');
  }
  await assert.rejects(access(env.HANAMESH_SHARED_HOME));await assert.rejects(access(env.HANAMESH_AGENT_HOME));
  // Invoke the installed hook process with synthetic host payloads. This verifies wiring/privacy, not a real model use.
  const hookRoots=[cc,cx].map(rows=>rows.find(row=>row.pluginName==='hanamesh').root);
  const before=run(process.execPath,[join(hookRoots[0],'lib/agent/hook.mjs')],{input:'not JSON',env:{...env,CLAUDE_PLUGIN_ROOT:hookRoots[0]}});
  assert.equal(before,'');await assert.rejects(access(env.HANAMESH_AGENT_HOME));
  const notice=JSON.parse(run(process.execPath,[join(hookRoots[0],'lib/agent/hook.mjs'),'--event','SessionStart'],{input:'not JSON',env:{...env,CLAUDE_PLUGIN_ROOT:hookRoots[0]}}));
  assert.match(notice.systemMessage,/开启（本人在终端执行）/);assert.ok(notice.systemMessage.includes(join(hookRoots[0],'lib/agent/cli.mjs')));
  assert.equal(run(process.execPath,[join(hookRoots[0],'lib/agent/hook.mjs'),'--event','SessionStart'],{env:{...env,CLAUDE_PLUGIN_ROOT:hookRoots[0]}}),'');
  const agreeLine=notice.systemMessage.split('\n').find(line=>line.endsWith(' agree'));assert.ok(agreeLine);
  run('/bin/sh',['-c',agreeLine]);
  for(const [i,root]of hookRoots.entries())run(process.execPath,[join(root,'lib/agent/hook.mjs')],{env:{...env,CLAUDE_PLUGIN_ROOT:root},input:JSON.stringify({hook_event_name:'PostToolUse',session_id:'fixture-session',tool_use_id:'fixture-call',tool_name:i?'mcp__probe__echo':'mcp__plugin_target_probe__echo',tool_input:{secret:'SYNTHETIC_PRIVATE_INPUT',path:'/private/fixture'},tool_response:{isError:false,text:'SYNTHETIC_PRIVATE_OUTPUT'},transcript_path:'/private/must-not-read'})});
  const local=JSON.parse(run(process.execPath,[join(hookRoots[0],'lib/agent/cli.mjs'),'status']));
  assert.equal(local.counts.local,2);assert.deepEqual(new Set(local.records.map(row=>row.channel)),new Set(['claude','codex']));
  assert.doesNotMatch(JSON.stringify(local.records),/SYNTHETIC_PRIVATE|fixture-session|private\/|transcript/);
  run(process.execPath,[join(hookRoots[0],'lib/agent/cli.mjs'),'withdraw']);
  const after=JSON.parse(run(process.execPath,[join(hookRoots[0],'lib/agent/cli.mjs'),'status']));assert.equal(after.counts.local,0);assert.equal(after.consent.state,'withheld');
  receipt.install={claude:true,codex:true,mcpReadonlyState:true,preConsentUsageWrites:0,sessionNoticeEmitted:true,noticeIsNotDisplayAcknowledgement:true,personalCopyCommand:true};
  receipt.syntheticHooks={bothChannelAttribution:true,minimalLocalProjection:true,withdrawClearsLocal:true,actualModelUse:false};
  console.log(JSON.stringify(receipt,null,2));
}finally{await rm(root,{recursive:true,force:true});}
