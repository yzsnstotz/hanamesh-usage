/** Native Windows bridge fixtures. No POSIX launcher, signals, Perl, real account or network. */
import {mkdtemp,mkdir,cp,copyFile,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import {watch} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {after} from 'node:test';
const sha=b=>createHash('sha256').update(b).digest('hex');
const q=v=>"'"+v.replaceAll("'","''")+"'";
const platform='win-'+process.arch,source=resolve(process.env.USAGE_TEST_ROOT??'.');
const psArgs=['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass'];
let templatePromise;
async function template(){
 if(!templatePromise)templatePromise=(async()=>{
  const root=await mkdtemp(join(tmpdir(),'hm-native-template-')),name='node-v24.13.1-'+platform,tree=join(root,'tree',name),archive=join(root,'node.zip');
  await mkdir(tree,{recursive:true});await copyFile(process.execPath,join(tree,'node.exe'));await writeFile(join(tree,'LICENSE'),'NATIVE TEST FIXTURE ONLY');
  const r=spawnSync('powershell.exe',[...psArgs,'-Command',`Add-Type -AssemblyName System.IO.Compression;Add-Type -AssemblyName System.IO.Compression.FileSystem;$z=[IO.Compression.ZipFile]::Open(${q(archive)},[IO.Compression.ZipArchiveMode]::Create);try{foreach($f in @('node.exe','LICENSE')){[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($z,(${q(tree)}+'/'+$f),('${name}/'+$f))|Out-Null}}finally{$z.Dispose()}`],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);
  const bytes=await readFile(archive);return{root,archive,sha256:sha(bytes),bytes:bytes.length};
 })();return templatePromise;
}
after(async()=>{if(templatePromise){const t=await templatePromise;await rm(t.root,{recursive:true,force:true,maxRetries:5,retryDelay:100});}});
export async function until(dir,read,timeoutMs=30000){
 const stop=AbortSignal.timeout(timeoutMs);let wake,version=0;const changed=()=>{version++;wake?.();},w=watch(dir,changed);stop.addEventListener('abort',changed);
 try{for(;;){stop.throwIfAborted();const n=version,value=await read();if(value)return value;await new Promise(r=>{wake=r;if(n!==version||stop.aborted)r()});wake=null;}}finally{w.close();stop.removeEventListener('abort',changed)}
}
export async function windowsFixture(t,{mode='failure',ready=false,channel='claude'}={}){
 const root=await mkdtemp(join(tmpdir(),'hm-native-中文-')),plugin=join(root,'plugin with spaces'),shared=join(root,'shared'),agent=join(root,'agent'),host=join(root,channel),cache=join(shared,'runtime/node-v24.13.1-'+platform),children=[];
 await cp(join(source,'agent'),plugin,{recursive:true});await mkdir(join(plugin,'lib'),{recursive:true});
 for(const name of ['agent','core'])await cp(join(source,'lib',name),join(plugin,'lib',name),{recursive:true});
 await writeFile(join(plugin,'package.json'),'{"type":"module"}');await mkdir(cache,{recursive:true});await mkdir(agent);await writeFile(join(agent,'config.json'),JSON.stringify({serverOrigin:'http://127.0.0.1:1',websiteOrigin:'http://127.0.0.1:2',requestTimeoutMs:1000,bootstrapIntervalMs:60000}));await mkdir(join(host,'plugins'),{recursive:true});
 const target=join(root,'target');await mkdir(target);await writeFile(join(target,'.mcp.json'),JSON.stringify({mcpServers:{probe:{command:'FIXTURE'}}}));
 if(channel==='claude')await writeFile(join(host,'plugins/installed_plugins.json'),JSON.stringify({plugins:{'target@market':[{installPath:target}]}}));
 else{const dir=join(host,'plugins/cache/market/target/1.0');await mkdir(dir,{recursive:true});await copyFile(join(target,'.mcp.json'),join(dir,'.mcp.json'));await writeFile(join(host,'config.toml'),'[plugins."target@market"]\nenabled=true\n');}
 const core=join(root,'core-fixture.mjs');await writeFile(core,`for await(const c of process.stdin){};console.log(JSON.stringify({result:{agentProtocolVersion:2,deviceId:null,consent:{state:'withheld',changedAt:null,consentId:null,authorization:null}}}));`);
 const env={...process.env,HOME:root,USERPROFILE:root,TEMP:root,TMP:root,HANAMESH_SHARED_HOME:shared,HANAMESH_AGENT_HOME:agent,HANAMESH_CORE_AGENT_CLI:core,HANAMESH_AGENT_CHANNEL:channel,CLAUDE_CONFIG_DIR:host,CODEX_HOME:host,CLAUDE_PLUGIN_ROOT:plugin,PLUGIN_ROOT:plugin};
 const recipePath=join(plugin,'bin/node-runtime.json'),recipe=JSON.parse(await readFile(recipePath));
 const zip=await template();await copyFile(zip.archive,join(root,'fixture.zip'));recipe.platforms[platform]={archiveFormat:'zip',sha256:mode==='badsha'?'0'.repeat(64):zip.sha256,bytes:zip.bytes};await writeFile(recipePath,JSON.stringify(recipe));
 await writeFile(join(root,'fixture-mode'),mode);
 await writeFile(join(root,'download.ps1'),`param([string]$Destination)\n$ErrorActionPreference='Stop'\n$r=$env:HOME\n[IO.File]::AppendAllText((Join-Path $r 'downloads'),(@{pid=$PID;startedAt=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json -Compress)+[Environment]::NewLine)\nwhile(!(Test-Path -LiteralPath (Join-Path $r ('release-'+$PID)))){Start-Sleep -Milliseconds 20}\nif([IO.File]::ReadAllText((Join-Path $r 'fixture-mode')) -eq 'failure'){throw 'RUNTIME_DOWNLOAD_FAILED'}\n[IO.File]::Copy((Join-Path $r 'fixture.zip'),$Destination,$false)\n`,'utf8');
 let script=await readFile(join(plugin,'bin/hm-agent.ps1'),'utf8');script=script.replace(/      Invoke-WebRequest[^\n]+/,`      & ${q(join(root,'download.ps1'))} "$scratch/node.zip"`);await writeFile(join(plugin,'bin/hm-agent.ps1'),script,'utf8');
 const launch=(action,args=[],input='')=>new Promise((ok,bad)=>{
  const start=performance.now(),p=spawn('powershell.exe',[...psArgs,'-File',join(plugin,'bin/hm-agent.ps1'),action,...args],{env,stdio:['pipe','pipe','pipe']});children.push(p);let stdout='',stderr='';p.stdout.on('data',c=>stdout+=c);p.stderr.on('data',c=>stderr+=c);p.on('error',bad);const timer=setTimeout(()=>{p.kill('SIGTERM');bad(Error('NATIVE_LAUNCH_TIMEOUT: action='+action+' exited='+p.exitCode+' stdout='+stdout+' stderr='+stderr));},20000);p.on('close',code=>{clearTimeout(timer);ok({code,stdout,stderr,ms:performance.now()-start})});p.stdin.on('error',()=>{});p.stdin.end(input);
 });
 const rows=async file=>{try{return(await readFile(join(root,file),'utf8')).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse)}catch(e){if(e.code==='ENOENT')return[];throw e}};
 const disk=async()=>JSON.parse(await readFile(join(cache,'prepare-state.json')));
 const started=n=>until(root,async()=>{const a=await rows('downloads');return a[n-1]});
 const settle=async(attempt,expected)=>{const done=until(cache,async()=>{const s=await disk();return s.code!=='RUNTIME_PREPARING'?s:false});await writeFile(join(root,'release-'+attempt.pid),'release');const result=await done;if(result.code!==expected)throw Error(JSON.stringify(result));return result;};
 const pending=async()=>{let names;try{names=await readdir(join(agent,'preparation'))}catch(e){if(e.code==='ENOENT')return[];throw e}return Promise.all(names.map(async n=>JSON.parse(await readFile(join(agent,'preparation',n)))))};
 const base={session_id:'PRIVATE_SESSION',tool_use_id:'original-call',tool_name:channel==='claude'?'mcp__plugin_target_probe__echo':'mcp__probe__echo',tool_input:{password:'PRIVATE_INPUT'},tool_response:{isError:false,content:[{type:'text',text:'PRIVATE_OUTPUT'}]}};
 const hook=async(event,extra={})=>{const r=await launch('hook',['--event',event],JSON.stringify({...base,hook_event_name:event,...extra}));if(r.code!==0)throw Error(r.stderr);return r;};
 const publish=async(state={code:'RUNTIME_READY',phase:'ready'})=>{await copyFile(process.execPath,join(cache,'node.exe'));await writeFile(join(cache,'node.sha256'),sha(await readFile(process.execPath))+'  node.exe\n');await writeFile(join(cache,'archive.sha256'),recipe.platforms[platform].sha256+'\n');await writeFile(join(cache,'prepare-state.json'),JSON.stringify(state));};
 const lock=async()=>{
  const code=`$f=[IO.File]::Open(${q(join(cache,'prepare.lock'))},[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None);[Console]::Out.WriteLine('LOCKED');[Console]::In.ReadLine()|Out-Null;$f.Dispose()`;
  const p=spawn('powershell.exe',[...psArgs,'-Command',code],{env,stdio:['pipe','pipe','pipe']});children.push(p);p.stdin.on('error',()=>{});p.stderr.resume();await once(p.stdout,'data');let released=false;return async()=>{if(released)return;released=true;p.stdin.end();if(p.exitCode===null)await once(p,'close');};
 };
 t.after(async()=>{try{let s;try{s=await disk()}catch{}if(s?.code==='RUNTIME_PREPARING'&&s.pid)try{process.kill(s.pid,'SIGTERM')}catch{}for(const p of children){if(p.exitCode===null){p.stdin.end();p.kill('SIGTERM')}}await Promise.all(children.filter(p=>p.exitCode===null&&p.signalCode===null).map(p=>once(p,'close').catch(()=>{})));}finally{await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});}});
 if(ready)await publish();
 return{root,plugin,shared,agent,host,cache,env,recipe,launch,hook,base,publish,lock,disk,rows,started,settle,pending,children,psArgs};
}
