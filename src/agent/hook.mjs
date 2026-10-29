import {runtime} from './runtime.mjs';
import {projectHook} from './project.mjs';
import {installedPlugins} from './inventory.mjs';
import {agentLock} from './sender-lock.mjs';
import {mkdir} from 'node:fs/promises';
import {firstConsentNotice} from './notice.mjs';
import {localRecordingEnabled} from './onboarding.mjs';
import {join} from 'node:path';
import {readJSON,atomicJSON} from './store.mjs';
try{
 const r=await runtime(),state=await r.call({operation:'state'});
 const event=process.argv[process.argv.indexOf('--event')+1];
 const preparation=await r.runtimePreparation();
 if((preparation&&preparation.code!=='RUNTIME_READY')||!await localRecordingEnabled(r,state))process.exitCode=0;
 else{
  const chunks=[];for await(const chunk of process.stdin)chunks.push(Buffer.from(chunk));
  const payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(payload.hook_event_name!==event)throw Error('AGENT_HOOK_EVENT_MISMATCH');
  if(event==='SessionStart')await firstConsentNotice(r,undefined,{payload});
  else{
   const {channel,home}=r.host;if(!home)throw Error('AGENT_HOST_HOME_REQUIRED');
   const diagnostics=[];let catalog=null,proofs={};
   if(channel==='codex')try{catalog=await readJSON(join(r.agentHome,'catalog.json'),null);proofs=await readJSON(join(r.agentHome,'remote-proofs.json'),{});}catch{diagnostics.push({pluginId:null,code:'AGENT_CODEX_REMOTE_PROOF_UNAVAILABLE'});}
   const installed=await installedPlugins(channel,home,{diagnostics,remote:{catalog,proofs,env:r.env,timeoutMs:r.config.requestTimeoutMs}});
   const row=projectHook(payload,channel,installed);
   if(row||channel==='codex'){await mkdir(r.agentHome,{recursive:true,mode:0o700});const release=await agentLock(r.agentHome,'collection',r.config.requestTimeoutMs);if(!release)throw Error('AGENT_COLLECTION_BUSY');
    try{if(await localRecordingEnabled(r)){
     if(channel==='codex')await atomicJSON(join(r.agentHome,'remote-inventory-diagnostics.json'),{diagnostics});
     if(row){const prior=(await r.store.rows()).find(v=>v.factId===row.factId);const beganAfterPreparation=!preparation||event==='PreToolUse'||(prior&&Date.parse(prior.occurredAt)>=Date.parse(preparation.finishedAt));if(beganAfterPreparation){await r.store.prune();await r.store.record(row,true);}}
    }}finally{await release();}}
  }
 }
}catch(error){process.stderr.write(`HanaMesh: ${/^[A-Z][A-Z0-9_]{0,79}$/.test(error.message)?error.message:'AGENT_HOOK_FAILED'}；请在插件hm-setup或hanamesh_status查看状态。\n`);process.exitCode=1;}
