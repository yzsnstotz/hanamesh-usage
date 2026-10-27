import {runtime} from './runtime.mjs';
import {projectHook} from './project.mjs';
import {installedPlugins} from './inventory.mjs';
import {agentLock} from './sender-lock.mjs';
import {mkdir} from 'node:fs/promises';
import {firstConsentNotice} from './notice.mjs';
import {localRecordingEnabled} from './onboarding.mjs';
try{
 const r=await runtime(),state=await r.call({operation:'state'});
 const event=process.argv[process.argv.indexOf('--event')+1];
 if(!await localRecordingEnabled(r,state))process.exitCode=0;
 else{
  const chunks=[];for await(const chunk of process.stdin)chunks.push(Buffer.from(chunk));
  const payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(payload.hook_event_name!==event)throw Error('AGENT_HOOK_EVENT_MISMATCH');
  if(event==='SessionStart')await firstConsentNotice(r,undefined,{payload});
  else{
   const {channel,home}=r.host;if(!home)throw Error('AGENT_HOST_HOME_REQUIRED');
   const row=projectHook(payload,channel,await installedPlugins(channel,home));
   if(row){await mkdir(r.agentHome,{recursive:true,mode:0o700});const release=await agentLock(r.agentHome,'collection',r.config.requestTimeoutMs);if(!release)throw Error('AGENT_COLLECTION_BUSY');
    try{if(await localRecordingEnabled(r)){await r.store.prune();await r.store.record(row,true);}}finally{await release();}}
  }
 }
}catch(error){process.stderr.write(`HanaMesh: ${/^[A-Z][A-Z0-9_]{0,79}$/.test(error.message)?error.message:'AGENT_HOOK_FAILED'}；请在插件hm-setup或hanamesh_status查看状态。\n`);process.exitCode=1;}
