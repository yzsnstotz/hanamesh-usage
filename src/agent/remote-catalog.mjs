import {join} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {readJSON,atomicJSON} from './store.mjs';
import {validateCatalog} from './catalog.mjs';
import {createRemoteProof,sameRemote} from './remote-proof.mjs';
import {requestJSON} from './runtime.mjs';

/** Public metadata reads are allowed during local-only collection; this never registers or uploads. */
export async function refreshAgentCatalog(r,{now=Date.now(),request=(o,p)=>requestJSON(o,p,{},r.config.requestTimeoutMs)}={}){
 const catalog=r.cachedCatalog&&now-r.cachedCatalog.fetchedAt<r.cachedCatalog.value.settings.catalogRefreshMs?r.cachedCatalog.value:validateCatalog(await request(r.config.serverOrigin,'/v1/registry/agent-catalog'));
 if(r.cachedCatalog?.value===catalog)return catalog;
 await mkdir(r.agentHome,{recursive:true,mode:0o700});
 const previous=await readJSON(join(r.agentHome,'remote-proofs.json'),{}),proofs={},diagnostics=[];
 for(const entry of catalog.plugins.filter(p=>p.remote)){
  try{
   if(sameRemote(previous[entry.pluginId],entry.remote)){proofs[entry.pluginId]=previous[entry.pluginId];continue;}
   const page=await request(r.config.serverOrigin,`/v1/registry/agent-plugins?hanaRef=${encodeURIComponent(entry.hanaRef)}`);
   const matches=page?.schemaVersion===1&&Array.isArray(page.plugins)?page.plugins.filter(p=>p.pluginId===entry.pluginId&&p.channel===entry.channel):[];
   if(matches.length!==1)throw Error('AGENT_CODEX_REMOTE_PROOF_UNAVAILABLE');
   proofs[entry.pluginId]=await createRemoteProof(entry,matches[0],{request});
  }catch(error){diagnostics.push({pluginId:entry.pluginId,code:/^AGENT_CODEX_REMOTE_[A-Z_]+$/.test(error.message)?error.message:'AGENT_CODEX_REMOTE_PROOF_UNAVAILABLE'});}
 }
 await atomicJSON(join(r.agentHome,'remote-proofs.json'),proofs);
 await atomicJSON(join(r.agentHome,'remote-proof-diagnostics.json'),{diagnostics});
 await atomicJSON(join(r.agentHome,'catalog.json'),catalog);
 r.cachedCatalog={value:catalog,fetchedAt:now};return catalog;
}
