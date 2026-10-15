#!/usr/bin/env node
// Disposable local fake-provider probe of the app-bundled Codex CLI. No external model or profiles.
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,readFile,rm,appendFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline';
const self=fileURLToPath(import.meta.url);
const callKey=x=>typeof x==='string'?createHash('sha256').update(x).digest('hex').slice(0,16):null;
if(process.argv[2]==='--fixture') {
 const send=x=>process.stdout.write(JSON.stringify(x)+'\n');
 for await(const line of createInterface({input:process.stdin})) {
  let x;try{x=JSON.parse(line);}catch{continue;}
  if(x.id===undefined)continue;
  let result;
  if(x.method==='initialize')result={protocolVersion:x.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}};
  else if(x.method==='tools/list')result={tools:['success','failure'].map(name=>({name,inputSchema:{type:'object',properties:{},additionalProperties:false}}))};
  else if(x.method==='tools/call'){await appendFile(process.env.PROBE_FIXTURE_LOG,JSON.stringify({name:x.params.name})+'\n');result={content:[{type:'text',text:'disposable fixture'}],isError:x.params.name==='failure'};}
  else result={};
  send({jsonrpc:'2.0',id:x.id,result});
 }
} else if(process.argv[2]==='--hook') {
 let raw='';for await(const c of process.stdin)raw+=c;
 const x=JSON.parse(raw),r=x.tool_response;
 const row={event:x.hook_event_name,toolName:x.tool_name??null,hasToolUseId:typeof x.tool_use_id==='string',callKey:callKey(x.tool_use_id),hasSessionId:typeof x.session_id==='string',responseType:r===null?'null':typeof r,responseKeys:r&&typeof r==='object'?Object.keys(r).sort():[],isError:r?.isError??null,is_error:r?.is_error??null,errorPresent:r?.error!=null};
 await appendFile(process.env.PROBE_HOOK_LOG,JSON.stringify(row)+'\n');
} else {
 const root=await mkdtemp(join(tmpdir(),'hm-session-g-host-'));
 let child,server,timer;const requests=[];let stdout='',stderr='',exitCode=null;
 const receipt={probe:'bundled-host-code-mode-inner-hooks',hostVersion:null,method:'Real bundled CLI dispatch with deterministic loopback Responses SSE and local fixture MCP; hooks are host-generated, not injected.',hostBinary:'/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex',externalModelCalls:0,requests,hooks:[],fixtureCalls:[]};
 try {
  for(const n of ['codex','claude','shared','agent'])await mkdir(join(root,n));
  const env={PATH:`${dirname(process.execPath)}:/usr/bin:/bin`,HOME:root,CODEX_HOME:join(root,'codex'),CLAUDE_CONFIG_DIR:join(root,'claude'),HANAMESH_SHARED_HOME:join(root,'shared'),HANAMESH_AGENT_HOME:join(root,'agent'),TMPDIR:root,LANG:'C',PROBE_HOOK_LOG:join(root,'hooks.jsonl'),PROBE_FIXTURE_LOG:join(root,'fixture.jsonl')};
  const version=spawnSync(receipt.hostBinary,['--version'],{cwd:root,env,encoding:'utf8',timeout:10000});if(version.status!==0)throw new Error('BUNDLED_HOST_VERSION_UNAVAILABLE');receipt.hostVersion=version.stdout.trim().replace(/^codex-cli /,'');
  server=createServer(async(req,res)=>{
   let raw='';for await(const c of req)raw+=c;
   let body;try{body=JSON.parse(raw);}catch{body={};}
   const flatten=t=>(t??[]).flatMap(x=>x.type==='namespace'?(x.tools??[]).map(y=>({name:x.name+'.'+y.name,type:y.type})): [{name:x.name,type:x.type}]);
   requests.push({path:req.url,...(requests.length===0?{probeToolNames:flatten(body.tools).filter(x=>x.name==='exec'||x.name?.startsWith('mcp__fixture'))}:{}),inputTypes:(body.input??[]).map(x=>x.type)});
   if(!req.url?.endsWith('/responses')){res.writeHead(404);res.end();return;}
   const index=requests.length;
   const code='const a = await tools.mcp__fixture__success({}); text(a); const b = await tools.mcp__fixture__failure({}); text(b);';
   const item=index===2?{type:'function_call',id:'fc_probe_failure',call_id:'call_probe_direct_failure',name:'failure',namespace:'mcp__fixture',arguments:'{}'}:index===3?{type:'function_call',id:'fc_probe_success',call_id:'call_probe_direct_success',name:'success',namespace:'mcp__fixture',arguments:'{}'}:index===1?{type:'custom_tool_call',id:'ctc_probe',call_id:'call_probe',name:'exec',input:code}:{type:'message',id:'msg_probe',role:'assistant',status:'completed',content:[{type:'output_text',text:'Probe finished.'}]};
   const response={id:`resp_${index}`,object:'response',created_at:1,status:'completed',model:'probe',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2}};
   res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'});
   for(const [type,data] of [['response.created',{response:{...response,status:'in_progress',output:[]}}],['response.output_item.done',{output_index:0,item}],['response.completed',{response}]])res.write(`event: ${type}\ndata: ${JSON.stringify({type,...data})}\n\n`);
   res.end();
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  const q=JSON.stringify;
  const config=`model = "probe"\nmodel_provider = "probe"\napproval_policy = "never"\nsandbox_mode = "danger-full-access"\n[features]\ncode_mode = true\ncode_mode_host = true\nhooks = true\n[model_providers.probe]\nname = "Disposable local fixture"\nbase_url = "http://127.0.0.1:${port}/v1"\nwire_api = "responses"\nrequires_openai_auth = false\nsupports_websockets = false\n[mcp_servers.fixture]\ncommand = ${q(process.execPath)}\nargs = [${q(self)}, "--fixture"]\nenv = { PROBE_FIXTURE_LOG = ${q(env.PROBE_FIXTURE_LOG)} }\n`;
  await writeFile(join(root,'codex','config.toml'),config);
  const hookCommand=`${q(process.execPath)} ${q(self)} --hook`;
  await writeFile(join(root,'codex','hooks.json'),JSON.stringify({hooks:Object.fromEntries(['PreToolUse','PostToolUse','PostToolUseFailure'].map(event=>[event,[{matcher:'.*',hooks:[{type:'command',command:hookCommand}]}]]))}));
  child=spawn(receipt.hostBinary,['exec','--skip-git-repo-check','--ephemeral','--ignore-rules','--dangerously-bypass-hook-trust','--json','Run the disposable fixture probe.'],{cwd:root,env,stdio:['ignore','pipe','pipe'],detached:true});
  child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);
  timer=setTimeout(()=>{receipt.timedOut=true;try{process.kill(-child.pid,'SIGKILL');}catch{}},25000);
  exitCode=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});clearTimeout(timer);
  const lines=async p=>{try{return(await readFile(p,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);}catch{return[];}};
  receipt.hooks=await lines(env.PROBE_HOOK_LOG);receipt.fixtureCalls=await lines(env.PROBE_FIXTURE_LOG);
  receipt.exitCode=exitCode;receipt.stdoutEvents=stdout.trim().split('\n').filter(Boolean).map(line=>{try{const x=JSON.parse(line);return{type:x.type,itemType:x.item?.type,itemStatus:x.item?.status,message:(x.error?.message??x.message??x.item?.message)?.replaceAll(root,'<TEMP>').replaceAll('/private'+root,'<TEMP>'),tool:x.item?.tool,resultKeys:x.item?.result?Object.keys(x.item.result).sort():undefined,isError:x.item?.result?.isError,error:x.item?.error};}catch{return{unparsed:true};}});
  receipt.stderr=stderr.slice(-12000).replaceAll(root,'<TEMP>');
  receipt.checks={nestedAndDirectCallsReachedFixture:receipt.fixtureCalls.map(x=>x.name).join(',')==='success,failure,failure,success',preHooks:receipt.hooks.filter(x=>x.event==='PreToolUse').length,postSuccessHooks:receipt.hooks.filter(x=>x.event==='PostToolUse'&&x.toolName==='mcp__fixture__success'&&x.isError===false).length,postFailureHooks:receipt.hooks.filter(x=>x.event==='PostToolUse'&&x.toolName==='mcp__fixture__failure').length,hostCompletedCalls:receipt.stdoutEvents.filter(x=>x.itemType==='mcp_tool_call'&&x.itemStatus==='completed').length,hostFailedCalls:receipt.stdoutEvents.filter(x=>x.itemType==='mcp_tool_call'&&x.itemStatus==='failed').length,outerExecHooks:receipt.hooks.filter(x=>x.toolName==='exec'||x.toolName==='functions.exec').length};
 } catch(error){receipt.error=String(error);}
 finally {
  if(timer)clearTimeout(timer);if(child){try{process.kill(-child.pid,'SIGKILL');}catch{}}
  if(server)await new Promise(resolve=>server.close(resolve));
  await rm(root,{recursive:true,force:true});let groupExists=false;if(child?.pid){await new Promise(resolve=>setTimeout(resolve,25));try{process.kill(-child.pid,0);groupExists=true;}catch{}}receipt.cleanup={tempRootRemoved:true,childProcessGroupTerminated:!groupExists,localProviderClosed:!server?.listening};
 }
 const out=process.argv[2]??join(dirname(self),'session-g-inner-hook-probe.json');await writeFile(out,JSON.stringify(receipt,null,2)+'\n');process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
}
