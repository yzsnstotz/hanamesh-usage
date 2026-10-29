import {join} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {atomicJSON} from './store.mjs';
import {validateCatalog} from './catalog.mjs';
import {requestJSON} from './runtime.mjs';
/** Public catalog metadata only; attribution uses stable remote ID, never version/content. */
export async function refreshAgentCatalog(r,{now=Date.now(),request=(o,p)=>requestJSON(o,p,{},r.config.requestTimeoutMs)}={}){
 const catalog=r.cachedCatalog&&now-r.cachedCatalog.fetchedAt<r.cachedCatalog.value.settings.catalogRefreshMs?r.cachedCatalog.value:validateCatalog(await request(r.config.serverOrigin,'/v1/registry/agent-catalog'));
 if(r.cachedCatalog?.value===catalog)return catalog;
 await mkdir(r.agentHome,{recursive:true,mode:0o700});await atomicJSON(join(r.agentHome,'catalog.json'),catalog);r.cachedCatalog={value:catalog,fetchedAt:now};return catalog;
}
