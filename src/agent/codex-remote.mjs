import {lstat,readdir,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {REMOTE_MARKET,remoteVersion,sameRemote,staticPath,sha256} from './remote-proof.mjs';
const run=promisify(execFile),name=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(v);
const issue=code=>{throw Error(code);};
async function regular(root,path,directory=false){
 if(!staticPath(path))issue('AGENT_CODEX_REMOTE_PATH_INVALID');
 let current=root;
 if(!(await lstat(root)).isDirectory())issue('AGENT_CODEX_REMOTE_PATH_INVALID');
 const parts=path.split('/');
 for(let i=0;i<parts.length;i++){
  current=join(current,parts[i]);const stat=await lstat(current);
  if(i<parts.length-1||directory){if(!stat.isDirectory())issue('AGENT_CODEX_REMOTE_PATH_INVALID');}
  else if(!stat.isFile())issue('AGENT_CODEX_REMOTE_PATH_INVALID');
 }return current;
}
export async function observeCodex(home,{env=process.env,timeoutMs=10000}={}){
 const childEnv={PATH:env.PATH,HOME:env.HOME,CODEX_HOME:home};
 // Use the host's native read-only command. The Agent never opens auth/config credentials.
 try{
  const v=await run('codex',['--version'],{env:childEnv,timeout:timeoutMs,maxBuffer:16*1024*1024});
  const cliVersion=/^codex-cli (\S+)\s*$/.exec(v.stdout)?.[1];
  if(cliVersion!=='0.165.0')issue('AGENT_CODEX_REMOTE_CLI_UNSUPPORTED');
  const r=await run('codex',['plugin','list','--json','-m',REMOTE_MARKET],{env:childEnv,timeout:timeoutMs,maxBuffer:16*1024*1024});
  return {cliVersion,...JSON.parse(r.stdout)};
 }catch(error){if(error.message==='AGENT_CODEX_REMOTE_CLI_UNSUPPORTED')throw error;issue('AGENT_CODEX_REMOTE_STATE_UNAVAILABLE');}
}
async function installedContent(root,proof){
 if(!Array.isArray(proof.files)||!proof.files.length||proof.files.length>4096)issue('AGENT_CODEX_REMOTE_PROOF_UNAVAILABLE');
 const expected=new Map(proof.files.map(f=>[f.path,f]));
 if(expected.size!==proof.files.length||sha256(JSON.stringify(proof.files.map(f=>[f.path,f.mode,f.sha256])))!==proof.contentSha256)issue('AGENT_CODEX_REMOTE_PROOF_INVALID');
 const visit=async(prefix='')=>{
  for(const f of await readdir(join(root,prefix),{withFileTypes:true})){
   const path=prefix+f.name;
   if(f.isDirectory()){if(![...expected.keys()].some(p=>p.startsWith(path+'/')))issue('AGENT_CODEX_REMOTE_CONTENT_MISMATCH');await visit(path+'/');}
   else if(!f.isFile()||!expected.has(path))issue('AGENT_CODEX_REMOTE_CONTENT_MISMATCH');
  }
 };
 await visit();
 for(const f of proof.files){
  const path=await regular(root,f.path),stat=await lstat(path);
  if(((stat.mode&0o111)?'100755':'100644')!==f.mode)issue('AGENT_CODEX_REMOTE_CONTENT_MISMATCH');
  const digest=sha256(await readFile(path));
  if(digest!==f.sha256&&(f.path!=='.codex-plugin/plugin.json'||digest!==f.formattedSha256))issue('AGENT_CODEX_REMOTE_CONTENT_MISMATCH');
 }
}
/** Failed remote verification stays local and can never become eligible via unknown-result policy. */
export async function remotePlugins(home,{catalog,proofs={},observe,env,timeoutMs}={}){
 const plugins=[],diagnostics=[],market='plugins/cache/'+REMOTE_MARKET;
 const diagnostic=(pluginId,code)=>diagnostics.push({pluginId,code});
 let dirs;
 try{const root=await regular(home,market,true);dirs=(await readdir(root,{withFileTypes:true})).filter(f=>name(f.name));}
 catch(error){if(error.code!=='ENOENT')diagnostic(null,'AGENT_CODEX_REMOTE_PATH_INVALID');return {plugins,diagnostics};}
 if(!dirs.length)return {plugins,diagnostics};
 let state;
 try{state=await (observe??(()=>observeCodex(home,{env,timeoutMs})))();if(state?.cliVersion!=='0.165.0')issue('AGENT_CODEX_REMOTE_CLI_UNSUPPORTED');if(!Array.isArray(state.installed))issue('AGENT_CODEX_REMOTE_STATE_SCHEMA_UNKNOWN');}
 catch(error){diagnostic(null,/^AGENT_CODEX_REMOTE_[A-Z_]+$/.test(error.message)?error.message:'AGENT_CODEX_REMOTE_STATE_UNAVAILABLE');return {plugins,diagnostics};}
 for(const dir of dirs){
  const pluginId=`${dir.name}@${REMOTE_MARKET}`;
  const entries=catalog?.plugins?.filter(p=>p.channel==='codex'&&p.pluginId===pluginId&&p.remote);
  let entry,selected,verified=false,code=null;
  try{
   if(entries?.length!==1)issue('AGENT_CODEX_REMOTE_CATALOG_UNAVAILABLE');entry=entries[0];
   const marker=JSON.parse(await readFile(await regular(home,`${market}/${dir.name}/.codex-remote-plugin-install.json`),'utf8'));
   if(marker?.schema_version!==1)issue('AGENT_CODEX_REMOTE_SCHEMA_UNKNOWN');
   if(typeof marker.remote_plugin_id!=='string'||marker.remote_plugin_id.trim()!==entry.remote.remotePluginId)issue('AGENT_CODEX_REMOTE_ID_MISMATCH');
   const rows=state.installed.filter(p=>p.pluginId===pluginId);
   if(rows.length!==1)issue('AGENT_CODEX_REMOTE_STATE_AMBIGUOUS');selected=rows[0];
   if(selected.name!==entry.pluginName||selected.marketplaceName!==REMOTE_MARKET||selected.source?.source!=='remote'||selected.source.id!==entry.remote.remotePluginId||!remoteVersion(selected.version))issue('AGENT_CODEX_REMOTE_STATE_SCHEMA_UNKNOWN');
   if(selected.installed!==true||selected.enabled!==true)issue('AGENT_CODEX_REMOTE_DISABLED');
   if(selected.version!==entry.remote.version)issue('AGENT_CODEX_REMOTE_VERSION_UNVERIFIED');
   await regular(home,`${market}/${dir.name}/${selected.version}`,true);
   if(!sameRemote(proofs[pluginId],entry.remote))issue('AGENT_CODEX_REMOTE_PROOF_UNAVAILABLE');
   await installedContent(join(home,market,dir.name,selected.version),proofs[pluginId]);verified=true;
  }catch(error){code=/^AGENT_CODEX_REMOTE_[A-Z_]+$/.test(error.message)?error.message:'AGENT_CODEX_REMOTE_INSTALLATION_UNREADABLE';diagnostic(pluginId,code);}
  // Only an official enabled installation with a matching marker/id/version participates in attribution.
  // Unknown schemas, disabled installs and identity errors cannot shadow existing local plugins.
  if((entry&&selected&&['AGENT_CODEX_REMOTE_PROOF_UNAVAILABLE','AGENT_CODEX_REMOTE_CONTENT_MISMATCH','AGENT_CODEX_REMOTE_PROOF_INVALID'].includes(code))||verified){
   plugins.push({pluginId,pluginName:entry.pluginName,marketplace:REMOTE_MARKET,root:resolve(home,market,dir.name,selected.version),skills:entry.skills,mcpServers:entry.mcpServers,remote:{...entry.remote,verified,code}});
  }
 }
 return {plugins,diagnostics};
}
