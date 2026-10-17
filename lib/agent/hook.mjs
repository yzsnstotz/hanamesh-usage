import {runtime} from './runtime.mjs';
import {projectHook} from './project.mjs';
import {installedPlugins} from './inventory.mjs';
import {agentLock} from './sender-lock.mjs';
import {mkdir} from 'node:fs/promises';
import {firstConsentNotice} from './notice.mjs';

try {
  const r=await runtime();const state=await r.call({operation:'state'});
  // The installation supplies a fixed event argument; withheld hooks never parse raw stdin.
  const event=process.argv[process.argv.indexOf('--event')+1];
  if(event==='SessionStart') {
    await firstConsentNotice(r);
  } else if(state.consent.state==='granted') {
    const chunks=[];for await(const chunk of process.stdin)chunks.push(Buffer.from(chunk));
    const payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const {channel,home:hostHome}=r.host;
    if(!hostHome)throw new Error('AGENT_HOST_HOME_REQUIRED');
    const installed=await installedPlugins(channel,hostHome);
    const row=projectHook(payload,channel,installed);
    if(row){
      await mkdir(r.agentHome,{recursive:true,mode:0o700});
      const release=await agentLock(r.agentHome,'collection',r.config.requestTimeoutMs);
      if(!release)throw new Error('AGENT_COLLECTION_BUSY');
      try{const current=await r.call({operation:'state'});if(current.consent.state==='granted'&&current.consent.changedAt===state.consent.changedAt&&current.consent.consentId===state.consent.consentId)await r.store.record(row,true);}
      finally{await release();}
    }
  }
} catch(error) {process.stderr.write(`HanaMesh: ${/^[A-Z][A-Z0-9_]{0,79}$/.test(error.message)?error.message:'AGENT_HOOK_FAILED'}；请运行 hanamesh_status 查看前置条件。\n`);process.exitCode=1;}
