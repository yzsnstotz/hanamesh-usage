import {runtime} from './runtime.mjs';
import {drainPreparation} from './preparation.mjs';
import {projectHook,hookCallIdentity,hookOutcome} from './project.mjs';
import {installedPlugins} from './inventory.mjs';
import {agentLock} from './sender-lock.mjs';
import {mkdir} from 'node:fs/promises';
import {firstConsentNotice} from './notice.mjs';
import {localRecordingEnabled} from './onboarding.mjs';
import {join} from 'node:path';
import {atomicJSON} from './store.mjs';
try{
 const r=await runtime();
 const event=process.argv[process.argv.indexOf('--event')+1];
 await drainPreparation(r);
 const chunks=[];for await(const chunk of process.stdin)chunks.push(Buffer.from(chunk));
 const payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 if(payload.hook_event_name!==event)throw Error('AGENT_HOOK_EVENT_MISMATCH');
 const tool=payload.tool_name,command=payload.tool_input?.cmd??payload.tool_input?.command;
 if(event!=='SessionStart'&&!(typeof tool==='string'&&tool.startsWith('mcp__'))&&tool!=='Skill'&&!(r.host.channel==='codex'&&['Bash','exec_command','functions.exec_command'].includes(tool)&&typeof command==='string'&&/SKILL\.md['"]?\s*$/.test(command)))process.exit(0);
 const state=await r.call({operation:'state'});
 if(!await localRecordingEnabled(r,state))process.exitCode=0;
 else{
  if(event==='SessionStart')await firstConsentNotice(r,undefined,{payload});
  else{
   const {channel,home}=r.host;if(!home)throw Error('AGENT_HOST_HOME_REQUIRED');
   const diagnostics=[];
   const installed=await installedPlugins(channel,home,{diagnostics,remote:{env:r.env,timeoutMs:r.config.requestTimeoutMs}});
   const row=projectHook(payload,channel,installed);
   const identity=hookCallIdentity(payload,channel);
   if(row){await mkdir(r.agentHome,{recursive:true,mode:0o700});const release=await agentLock(r.agentHome,'collection',r.config.requestTimeoutMs);if(!release)throw Error('AGENT_COLLECTION_BUSY');
    try{if(await localRecordingEnabled(r)){
     if(channel==='codex')await atomicJSON(join(r.agentHome,'remote-inventory-diagnostics.json'),{diagnostics});
     if(identity)await r.store.observe(identity,row,true,{outcome:hookOutcome(payload,channel)});
    }}finally{await release();}}
  }
 }
}catch(error){process.stderr.write(`HanaMesh: ${/^[A-Z][A-Z0-9_]{0,79}$/.test(error.message)?error.message:'AGENT_HOOK_FAILED'}；请在插件hm-setup或hanamesh_status查看状态。\n`);process.exitCode=1;}
