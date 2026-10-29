import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,chmod,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {AgentStore} from '../src/agent/store.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const hookPath=fileURLToPath(new URL('../src/agent/hook.mjs',import.meta.url));
async function fixture(t,mode,countUnconfirmedCalls){
 const home=await mkdtemp(join(tmpdir(),'hm-call-origin-'));t.after(()=>rm(home,{recursive:true,force:true}));
 const agent=join(home,'agent'),cx=join(home,'codex'),shared=join(home,'shared'),bin=join(home,'bin');
 for(const p of [agent,cx,shared,bin])await mkdir(p,{recursive:true});
 const id='origin-probe@openai-curated-remote',version='1.0.0',remotePluginId='Plugin_origin-probe';
 const root=join(cx,'plugins/cache/openai-curated-remote/origin-probe',version);
 const content={'.codex-plugin/plugin.json':JSON.stringify({name:'origin-probe',version}),'skills/probe/SKILL.md':'# Public origin probe fixture\n'};
 const files=Object.entries(content).sort(([a],[b])=>a<b?-1:1).map(([path,bytes])=>({path,mode:'100644',sha256:sha(bytes)}));
 const remote={remotePluginId,version,bundleSha256:'3'.repeat(64),contentSha256:sha(JSON.stringify(files.map(f=>[f.path,f.mode,f.sha256])))};
 for(const [path,bytes]of Object.entries(content)){await mkdir(join(root,path,'..'),{recursive:true});await writeFile(join(root,path),bytes);}
 await writeFile(join(root,'../.codex-remote-plugin-install.json'),JSON.stringify({schema_version:1,remote_plugin_id:remotePluginId}));
 const native={installed:[{pluginId:id,name:'origin-probe',marketplaceName:'openai-curated-remote',version,installed:true,enabled:mode!=='disabled',source:{source:'remote',id:remotePluginId}}]};
 const nativePath=join(home,'native-state.json');await writeFile(nativePath,JSON.stringify(native));
 await writeFile(join(bin,'codex'),`#!${process.execPath}\nimport{readFileSync}from'node:fs';const a=JSON.stringify(process.argv.slice(2));if(a==='["--version"]')console.log('codex-cli 0.165.0');else if(a==='["plugin","list","--json","-m","openai-curated-remote"]')console.log(readFileSync(${JSON.stringify(nativePath)},'utf8'));else process.exit(2);\n`);await chmod(join(bin,'codex'),0o755);
 // Explicit Core state fixture: this source-level hook test does not register/sign/upload or claim a real backend.
 const core=join(home,'core-state.mjs');await writeFile(core,"let s='';for await(const b of process.stdin)s+=b;const q=JSON.parse(s);if(q.input.operation!=='state')process.exit(2);console.log(JSON.stringify({result:{agentProtocolVersion:2,deviceId:'A'.repeat(43),consent:{state:'granted',authorization:'website',consentId:'11111111-1111-4111-8111-111111111111',changedAt:null}}}));\n");
 await writeFile(join(agent,'config.json'),JSON.stringify({serverOrigin:'http://127.0.0.1:1',websiteOrigin:'http://127.0.0.1:2',bootstrapIntervalMs:60000,requestTimeoutMs:10000}));
 const entry={hanaRef:'11111111-1111-4111-8111-111111111111',githubRepo:'fixture/origin',channel:'codex',pluginId:id,pluginName:'origin-probe',marketplace:'openai-curated-remote',mcpServers:[],skills:['probe'],remote};
 const catalog={schemaVersion:1,eventProtocol:'hm-agent-v1',generatedAt:new Date().toISOString(),settings:{uploadIntervalMs:60000,catalogRefreshMs:300000,backfillWindowDays:30,countUnconfirmedCalls},plugins:[entry]};
 await writeFile(join(agent,'catalog.json'),JSON.stringify(catalog));await writeFile(join(agent,'remote-proofs.json'),JSON.stringify({[id]:{...remote,files}}));
 const env={PATH:bin+':/usr/bin:/bin',HOME:home,CODEX_HOME:cx,HANAMESH_SHARED_HOME:shared,HANAMESH_AGENT_HOME:agent,HANAMESH_AGENT_CHANNEL:'codex',HANAMESH_CORE_AGENT_CLI:core,TMPDIR:home};
 const input={tool_name:'exec_command',tool_input:{cmd:`cat ${root}/skills/probe/SKILL.md`},tool_response:{exit_code:0},session_id:'same-original-session',tool_call_id:'same-original-call'};
 async function hook(event,fresh=false){
  const payload={...input,hook_event_name:event,...(fresh?{tool_call_id:'genuinely-new-call'}:{})};
  const result=await new Promise((resolve,reject)=>{const p=spawn(process.execPath,[hookPath,'--event',event],{env,stdio:['pipe','pipe','pipe']});let stdout='',stderr='';p.stdout.on('data',b=>stdout+=b);p.stderr.on('data',b=>stderr+=b);p.on('error',reject);p.on('close',code=>resolve({code,stdout,stderr}));p.stdin.end(JSON.stringify(payload));});
  assert.equal(result.code,0,result.stderr);
 }
 return {home,agent,shared,root,native,nativePath,content,catalog,store:new AgentStore(agent),hook,oldId:sha(JSON.stringify(['codex',input.session_id,input.tool_call_id]))};
}
for(const unknown of [false,true])for(const mode of ['retention-hook-prune','retention-pre-post','orphan-post','disabled'])test(`actual source hook never re-admits an old call across ${mode} (unknown=${unknown})`,async t=>{
 const f=await fixture(t,mode,unknown);
 if(mode!=='disabled')await writeFile(join(f.root,'skills/probe/SKILL.md'),'incorrect original installed content');
 await f.hook('PreToolUse');await f.hook('PostToolUse');
 const first=await f.store.rows(),diagnostics=JSON.parse(await readFile(join(f.agent,'remote-inventory-diagnostics.json')));
 if(mode!=='disabled'){
  assert.equal(first.length,1);assert.equal(first[0].remote.verified,false);assert.equal(diagnostics.diagnostics[0].code,'AGENT_CODEX_REMOTE_CONTENT_MISMATCH');
  const now=Date.now(),oldAt=new Date(now-31*86400000).toISOString();
  await writeFile(join(f.store.dir,first[0].factId+'.json'),JSON.stringify({...first[0],occurredAt:oldAt}));
  const prep=join(f.shared,'runtime',`node-v24.13.1-darwin-${process.arch}`,'prepare-state.json');await mkdir(join(prep,'..'),{recursive:true});await writeFile(prep,JSON.stringify({code:'RUNTIME_READY',finishedAt:new Date(now-32*86400000).toISOString()}));
  if(mode!=='retention-hook-prune'){await f.store.prune(now);assert.deepEqual(await f.store.rows(),[],'30-day activity rows must actually be removed');}
  await writeFile(join(f.root,'skills/probe/SKILL.md'),f.content['skills/probe/SKILL.md']);if(mode==='retention-pre-post')await f.hook('PreToolUse');await f.hook('PostToolUse');
 }else{
  assert.deepEqual(first,[],'disabled installation has no attributed activity row');assert.equal(diagnostics.diagnostics[0].code,'AGENT_CODEX_REMOTE_DISABLED');
  f.native.installed[0].enabled=true;await writeFile(f.nativePath,JSON.stringify(f.native));await f.hook('PreToolUse');await f.hook('PostToolUse');
 }
 const replayEligible=await f.store.eligible(f.catalog);
 // Always exercise the genuinely new call before asserting the negative, including on the first RED run.
 await f.hook('PreToolUse',true);await f.hook('PostToolUse',true);
 const afterFresh=await f.store.eligible(f.catalog);assert.ok(afterFresh.some(r=>r.factId!==f.oldId&&r.success===true),'a genuinely new call must remain eligible');
 assert.equal(replayEligible.some(r=>r.factId===f.oldId),false,'an old call identity must not become new when its activity row disappears or never existed');
});
for(const unknown of [false,true])test(`a pristine orphan Post never admits an invocation (unknown=${unknown})`,async t=>{
 const f=await fixture(t,'enabled',unknown);
 await f.hook('PostToolUse');
 const orphanEligible=await f.store.eligible(f.catalog);
 // Exercise a distinct, genuinely observed invocation even when the mutant admits the orphan.
 await f.hook('PreToolUse',true);await f.hook('PostToolUse',true);
 assert.ok((await f.store.eligible(f.catalog)).some(r=>r.factId!==f.oldId&&r.success===true),'a genuinely new Pre/Post remains eligible');
 assert.equal(orphanEligible.some(r=>r.factId===f.oldId),false,'Post without any prior Pre cannot establish the first call origin');
});
