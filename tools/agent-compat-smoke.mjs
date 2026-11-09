/** Exercise candidate manifest commands and real MCP sender ticks against a loopback tripwire. No model/account. */
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
const plugin=resolve(process.argv[2]),profiles=resolve(process.argv[3]??dirname(plugin));
const root=await mkdtemp(join(tmpdir(),'hm-px4-smoke-')),children=new Set(),requests=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const server=createServer(async(req,res)=>{
  let text='';for await(const c of req)text+=c;
  const path=req.url,method=req.method;requests.push({path,method});
  let body,status=200;
  if(path==='/v1/registry/agent-catalog')body={schemaVersion:1,eventProtocol:'hm-agent-v1',generatedAt:new Date().toISOString(),
    plugins:['claude','codex'].map(channel=>({channel,hanaRef:'hana-target',pluginId:'target@px2-local',pluginName:'target',marketplace:'px2-local',githubRepo:'fixture/target',mcpServers:['probe'],skills:['demo']})),
    settings:{uploadIntervalMs:60000,catalogRefreshMs:300000,backfillWindowDays:30,countUnconfirmedCalls:false}};
  else if(path==='/v1/identity/devices/challenge')body={nonce:'fixture-'+requests.length,expiresAt:new Date(Date.now()+60000).toISOString()};
  else if(path==='/v1/identity/devices')body={deviceId:createHash('sha256').update(Buffer.from(JSON.parse(text).publicKey,'base64url')).digest('base64url'),principalId:'fixture-principal'};
  else if(/^\/v2\/usage\/me\/devices\/[^/]+\/consents\/[^/]+(?:\/onboarding)?$/.test(path)){
    const p=path.split('/'),deviceId=p[5],consentId=p[7];
    body=method==='DELETE'?{deletedEvents:0,consentId,state:'withdrawn',barrier:'committed'}:
      {deviceId,consentId,state:'pending',authorization:null,noticeVersion:'hm-agent-usage-v1',includeBackfill:true,agreedAt:null,binding:null,barrier:'committed'};
  } else if(path==='/v2/usage/events')body={accepted:1,duplicates:0,rejected:[],durability:'committed'};
  else {status=404;body={error:{code:'FIXTURE_UNEXPECTED_ENDPOINT'}};}
  res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));
});
const usagePosts=()=>requests.filter(r=>r.method==='POST'&&r.path==='/v2/usage/events').length;
let failure;
try {
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const origin=`http://127.0.0.1:${server.address().port}`;
  // Explicit isolated loopback configuration precedes every entry, including the first status.
  const env={PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,COMSPEC:process.env.COMSPEC,PATHEXT:process.env.PATHEXT,OS:process.env.OS,
    TEMP:root,TMP:root,TMPDIR:root,HOME:root,USERPROFILE:root,APPDATA:join(root,'appdata'),LOCALAPPDATA:join(root,'local'),
    HANAMESH_SHARED_HOME:join(root,'shared'),HANAMESH_AGENT_HOME:join(root,'agent'),
    CLAUDE_CONFIG_DIR:join(profiles,'claude'),CODEX_HOME:join(profiles,'codex'),CLAUDE_PLUGIN_ROOT:plugin,PLUGIN_ROOT:plugin,LANG:'C',LC_ALL:'C'};
  await mkdir(env.HANAMESH_AGENT_HOME,{recursive:true});
  await writeFile(join(env.HANAMESH_AGENT_HOME,'config.json'),JSON.stringify({serverOrigin:origin,websiteOrigin:origin,bootstrapIntervalMs:60000,requestTimeoutMs:10000}));
  const start=(command,args,extra={},shell=false)=>{
    const child=spawn(command,args,{env:{...env,...extra},cwd:plugin,stdio:['pipe','pipe','pipe'],shell});children.add(child);child.once('close',()=>children.delete(child));child.stdin.on('error',()=>{});return child;
  };
  const run=(command,args,input='',extra={},shell=false)=>new Promise((ok,bad)=>{
    const child=start(command,args,extra,shell);let stdout='',stderr='';
    const timer=setTimeout(()=>{child.kill();bad(Error('SMOKE_COMMAND_DEADLINE: '+command));},120000);
    child.stdout.on('data',c=>stdout+=c);child.stderr.on('data',c=>stderr+=c);child.once('error',bad);
    child.once('close',code=>{clearTimeout(timer);try{assert.equal(code,0,`${command}: ${stderr}`);ok(stdout);}catch(e){bad(e);}});child.stdin.end(input);
  });
  const launch=(action,...args)=>process.platform==='win32'
    ?run('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(plugin,'bin/hm-agent.ps1'),action,...args])
    :run('/bin/sh',[join(plugin,'bin/hm-agent'),action,...args]);
  await launch('status');
  const platform=`${process.platform==='win32'?'win':process.platform}-${process.arch}`;
  const preparation=join(env.HANAMESH_SHARED_HOME,`runtime/node-v24.13.1-${platform}/prepare-state.json`),deadline=Date.now()+240000;
  for(;;){
    // Windows File.Replace briefly holds the state file unshared; the product readers treat EBUSY/EACCES as
    // not-yet-readable on win32 (src/agent/runtime.mjs, hm-agent.ps1 Read-State), and so does this poll.
    let state;try{state=JSON.parse(await readFile(preparation));}catch(e){if(e.code!=='ENOENT'&&!(process.platform==='win32'&&['EBUSY','EACCES'].includes(e.code)))throw e;}
    if(state?.code==='RUNTIME_READY')break;
    if(state&&state.code!=='RUNTIME_PREPARING')throw Error('PX4_RUNTIME_PREPARATION:'+state.code);
    assert.ok(Date.now()<deadline,'automatic fixed runtime preparation deadline');await delay(200);
  }
  const hooks={};
  for(const channel of ['claude','codex'])hooks[channel]=JSON.parse(await readFile(join(plugin,'hooks',channel==='claude'?'hooks.json':'codex.json'))).hooks;
  let hookCount=0;
  const hook=async(channel,event,id,tool=true)=>{
    const tool_name=tool?(channel==='claude'?'mcp__plugin_target_probe__echo':'mcp__probe__echo'):'Read';
    const payload={session_id:'px4-private-session',transcript_path:join(root,'must-not-read'),cwd:root,hook_event_name:event,source:'resume',
      tool_use_id:id,tool_name,tool_input:{secret:'PX4_PRIVATE_SENTINEL'},tool_response:{content:[{type:'text',text:'PX4_PRIVATE_SENTINEL'}],isError:false}};
    for(const group of hooks[channel][event]??[])for(const h of group.hooks){
      const extra={HANAMESH_AGENT_CHANNEL:channel};
      const output=process.platform==='win32'&&channel==='codex'?await run(h.commandWindows,[],JSON.stringify(payload),extra,true):
        await run(process.platform==='win32'?'bash':'/bin/sh',['-c',h.command],JSON.stringify(payload),extra);
      assert.equal(output,'',`${channel} resume/ordinary hooks stay silent`);hookCount++;
    }
  };
  const recordCalls=async(prefix)=>{
    for(const channel of ['claude','codex']){
      await hook(channel,'SessionStart',prefix,false);
      await hook(channel,'PreToolUse',prefix+'-pair');await hook(channel,'PostToolUse',prefix+'-pair');
      await hook(channel,'PostToolUse',prefix+'-post-only');
      await hook(channel,'PostToolUseFailure',prefix+'-irrelevant',false);
    }
  };
  await recordCalls('before');
  const status=JSON.parse(await launch('status'));
  assert.equal(status.counts.local,4,'two real attributable calls per channel before website consent');
  assert.equal(status.consent.state,'withheld');assert.equal(status.localCollection.enabled,true);
  assert.equal(status.counts.sent,0);assert.equal(status.counts.unconfirmed,0);
  assert.deepEqual(new Set(status.records.map(r=>r.channel)),new Set(['claude','codex']));
  for(const row of status.records){assert.equal(row.feature,'mcp:echo');assert.equal(row.success,true);assert.equal(row.pluginId,'target@px2-local');}
  assert.doesNotMatch(JSON.stringify(status.records),/PX4_PRIVATE|px4-private|must-not-read|transcript|tool_input|tool_response/);
  const senderPath=join(env.HANAMESH_AGENT_HOME,'sender.json');let ticks=0;
  const mcp=async(channel,closed=false)=>{
    const descriptor=JSON.parse(await readFile(join(plugin,channel==='claude'?'.mcp.json':'codex.mcp.json'))).mcpServers.hanamesh;
    let before;try{before=JSON.parse(await readFile(senderPath));}catch(e){if(e.code!=='ENOENT')throw e;}
    const child=start(descriptor.command,descriptor.args.map(a=>a.replaceAll('${CLAUDE_PLUGIN_ROOT}',plugin)),{HANAMESH_AGENT_CHANNEL:channel});
    let output='',stderr='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>stderr+=c);
    const exited=once(child,'close');
    const until=Date.now()+30000;
    try{
      child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2024-11-05'}})+'\n');
      for(;;){
        const initialized=output.split(/\r?\n/).filter(Boolean).map(x=>JSON.parse(x)).some(r=>r.id===1&&r.result?.serverInfo);
        let sender;try{sender=JSON.parse(await readFile(senderPath));}catch(e){if(e.code!=='ENOENT')throw e;}
        // Normal runs observe the persisted result written only after uploadOnce returns.
        if(initialized&&!closed&&sender?.checkedAt!==before?.checkedAt&&sender?.code==='CONSENT_WITHHELD'){ticks++;break;}
        // Closed sender returns before uploadOnce; await its shutdown to prove that tick finished.
        if(initialized&&closed)break;
        assert.equal(child.exitCode,null,stderr);assert.ok(Date.now()<until,'MCP initialize/sender tick deadline: '+stderr);await delay(20);
      }
      child.stdin.end();const [code]=await Promise.race([exited,delay(30000).then(()=>{throw Error('MCP_SHUTDOWN_DEADLINE')})]);assert.equal(code,0,stderr);
      assert.equal(usagePosts(),0,'usage POST before website consent');
      if(closed){const after=JSON.parse(await readFile(senderPath));assert.deepEqual(after,before,'closed tick cannot enter uploadOnce');}
    }finally{if(child.exitCode===null)child.kill();}
  };
  for(const channel of ['claude','codex'])await mcp(channel);
  assert.ok(requests.some(r=>r.path==='/v1/registry/agent-catalog'),'real sender must read public catalog');
  assert.ok(requests.some(r=>r.path.endsWith('/onboarding')),'real Core preparation reaches loopback');
  const pending=JSON.parse(await launch('status'));assert.equal(pending.counts.local,4);assert.equal(pending.counts.sent,0);assert.equal(pending.counts.unconfirmed,0);
  await launch('withdraw');await recordCalls('closed');
  for(const channel of ['claude','codex'])await mcp(channel,true); // fresh process restart after local close
  const closed=JSON.parse(await launch('status'));assert.equal(closed.localCollection.enabled,false);assert.equal(closed.counts.local,0);
  assert.equal(closed.counts.sent,0);assert.equal(closed.counts.unconfirmed,0);assert.equal(usagePosts(),0,'usage POST after explicit close and restart');
  const files=async dir=>{let all=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);all.push(...e.isDirectory()?await files(p):[p]);}return all;};
  // Inspect only Usage's own minimal records, never Core identity/key storage.
  for(const file of await files(env.HANAMESH_AGENT_HOME))assert.ok(!(await readFile(file)).includes(Buffer.from('PX4_PRIVATE_SENTINEL')),`raw field persisted: ${file}`);
  console.log(JSON.stringify({platform:process.platform,arch:process.arch,hooks:hookCount,consent:'withheld',localBeforeWebsiteConsent:4,closedLocal:0,senderTicks:ticks,usagePosts:usagePosts(),allowedRequests:requests.length}));
} catch(error){failure=error;throw error;}finally{
  for(const child of children){child.stdin.end();child.kill();}
  await Promise.all([...children].map(p=>p.exitCode===null?once(p,'close'):Promise.resolve()));
  server.closeAllConnections();await new Promise(r=>server.close(r));
  try{await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});}catch(error){if(!failure)throw error;}
}
