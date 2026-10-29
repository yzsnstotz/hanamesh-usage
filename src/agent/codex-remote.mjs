import {readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readJSON} from './store.mjs';
const run=promisify(execFile),token=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(v);
export async function observeCodex(home,{env=process.env,timeoutMs=10000}={}){
 const result=await run('codex',['plugin','list','--json','-m','openai-curated-remote'],{env:{PATH:env.PATH,HOME:env.HOME,CODEX_HOME:home},timeout:timeoutMs,maxBuffer:16*1024*1024});return JSON.parse(result.stdout);
}
/** Native remote IDs identify plugins across every version, including app connectors. No content proof. */
export async function remotePlugins(home,{observe,env,timeoutMs}={}){
 const plugins=[],diagnostics=[];let state;
 try{state=await (observe??(()=>observeCodex(home,{env,timeoutMs})))();if(!Array.isArray(state?.installed))throw Error('AGENT_CODEX_REMOTE_STATE_UNAVAILABLE');}
 catch{diagnostics.push({pluginId:null,code:'AGENT_CODEX_REMOTE_STATE_UNAVAILABLE'});return {plugins,diagnostics};}
 for(const row of state.installed){
  const id=row.remote_plugin_id??row.source?.id,name=row.name;
  if(typeof id!=='string'||!id||typeof name!=='string'||!name||row.installed===false||row.enabled===false)continue;
  const remote={remotePluginId:id,name},pluginId=row.pluginId??`${name}@openai-curated-remote`,marketplace='openai-curated-remote';
  const base=join(home,'plugins/cache',marketplace,name);let versions=[];
  try{versions=token(name)?(await readdir(base,{withFileTypes:true})).filter(v=>v.isDirectory()):[];}catch(error){if(error.code!=='ENOENT')throw error;}
  if(!versions.length){plugins.push({pluginId,pluginName:name,marketplace,root:null,mcpServers:[name],skills:[],remote});continue;}
  for(const version of versions){
   const root=resolve(base,version.name),mcp=await readJSON(join(root,'.mcp.json'),{});let skills=[];
   try{skills=(await readdir(join(root,'skills'),{withFileTypes:true})).filter(s=>s.isDirectory()&&token(s.name)).map(s=>s.name);}catch(error){if(error.code!=='ENOENT')throw error;}
   const mcpServers=Object.keys(mcp.mcpServers??mcp).filter(token);
   plugins.push({pluginId,pluginName:name,marketplace,root,mcpServers:mcpServers.length?mcpServers:skills.length?[]:[name],skills,remote});
  }
 }
 return {plugins,diagnostics};
}
