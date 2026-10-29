import {readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {readJSON} from './store.mjs';
import {projectHook} from './project.mjs';
import {installedPlugins} from './inventory.mjs';
import {localRecordingEnabled} from './onboarding.mjs';
import {agentLock} from './sender-lock.mjs';
/** The Node-free hook retains selectors only, never tool arguments/results or raw session IDs. */
export function projectPreparation(item,installed){
 const payload={hook_event_name:item.event,session_id:'preparation',tool_call_id:item.factId,tool_name:item.toolName,tool_input:{},...(typeof item.success==='boolean'?{tool_response:{isError:!item.success}}:{})};
 if(item.skill)payload.tool_input.skill=item.skill;
 if(item.skillPathHash){const paths=installed.flatMap(p=>p.skills.map(s=>`${p.root}/skills/${s}/SKILL.md`));const path=paths.find(p=>createHash('sha256').update(p).digest('hex')===item.skillPathHash);if(!path)return null;payload.tool_input.cmd=`cat ${path}`;}
 const row=projectHook(payload,item.channel,installed,Date.parse(item.occurredAt));return row?{...row,factId:item.factId}:null;
}
export async function drainPreparation(r,{now=Date.now()}={}){
 const dir=join(r.agentHome,'preparation');let names;try{names=await readdir(dir);}catch(error){if(error.code==='ENOENT')return;throw error;}
 if(!names.length||!await localRecordingEnabled(r))return;
 const release=await agentLock(r.agentHome,'collection',r.config.requestTimeoutMs);if(!release)throw Error('AGENT_COLLECTION_BUSY');
 try{
  if(!await localRecordingEnabled(r))return;
  const items=await Promise.all(names.filter(n=>/^[a-f0-9]{64}-(PreToolUse|PostToolUse|PostToolUseFailure)\.json$/.test(n)).map(async name=>({name,item:await readJSON(join(dir,name),null)})));
  items.sort((a,b)=>a.item.occurredAt.localeCompare(b.item.occurredAt)||(a.item.event==='PreToolUse'?-1:1));
  const inventories=new Map();
  for(const {name,item}of items){
   if(Date.parse(item.occurredAt)<now-30*86400000){await rm(join(dir,name));continue;}
   if(!inventories.has(item.channel)){const {hostContext}=await import('./runtime.mjs');const host=hostContext({...r.env,HANAMESH_AGENT_CHANNEL:item.channel});inventories.set(item.channel,await installedPlugins(item.channel,host.home,{remote:{env:r.env}}));}
   const row=projectPreparation(item,inventories.get(item.channel));if(!row)continue;
   await r.store.record(row,true);await rm(join(dir,name));
  }
 }finally{await release();}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const {runtime}=await import('./runtime.mjs');try{await drainPreparation(await runtime());}catch(error){process.stderr.write((/^[A-Z][A-Z0-9_]{0,79}$/.test(error.message)?error.message:'AGENT_PREPARATION_FAILED')+'\n');process.exitCode=1;}}
