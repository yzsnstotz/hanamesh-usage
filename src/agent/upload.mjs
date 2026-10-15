import {join} from 'node:path';
import {mkdir,rm} from 'node:fs/promises';
import {agentEventForFact,agentSigningJSON} from '../core/agent-event.js';
import {atomicJSON,readJSON} from './store.mjs';
import {requestJSON} from './runtime.mjs';
import {validateCatalog} from './catalog.mjs';

export async function uploadOnce(r,{now=Date.now(),request=(origin,path,init)=>requestJSON(origin,path,init,r.config.requestTimeoutMs)}={}) {
  const state=await r.call({operation:'state'});
  if(state.consent.state!=='granted')return {state:'withheld',code:'CONSENT_WITHHELD'};
  if(!r.config.serverOrigin)return {state:'offline',code:'SERVER_ORIGIN_UNAVAILABLE'};
  // No downgrade: missing endpoint/protocol means stopped, never send new bytes to v1.
  const catalog= r.cachedCatalog && now-r.cachedCatalog.fetchedAt<r.cachedCatalog.value.settings.catalogRefreshMs ? r.cachedCatalog.value : validateCatalog(await request(r.config.serverOrigin,'/v1/registry/agent-catalog'));
  if(r.cachedCatalog?.value!==catalog)r.cachedCatalog={value:catalog,fetchedAt:now};
  await mkdir(r.agentHome,{recursive:true,mode:0o700});
  await atomicJSON(join(r.agentHome,'catalog.json'),catalog);
  const pending=await r.store.pending(catalog,now);
  if(pending.length===0)return {state:'idle',code:null,settings:catalog.settings};
  await r.call({operation:'register'});
  const device=await r.call({operation:'state'});
  const from=new Date(now-86400000).toISOString(),to=new Date(now).toISOString();
  const path=`/v1/usage/me/contributions?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const readHeaders=await r.call({operation:'signRequest',method:'GET',path,body:null});
  const contributions=await request(r.config.serverOrigin,path,{headers:readHeaders});
  if(typeof contributions.bound!=='boolean')throw new Error('AGENT_BINDING_UNAVAILABLE');
  // Unbound devices may upload (pending points); the user sees the website binding entry explicitly.
  for(const row of pending) {
    const entry=(await r.store.rows()).find(item=>item.factId===row.factId);
    let wire=entry.wire;
    if(wire && (wire.deviceId!==device.deviceId||wire.hanaRef!==row.hanaRef))throw new Error('AGENT_ATTRIBUTION_CHANGED');
    if(!wire) {
      const event=agentEventForFact(device.deviceId,row);
      const {signature}=await r.call({operation:'sign',bytes:Buffer.from(agentSigningJSON(event)).toString('base64')});
      wire={...event,signature};
      await r.store.freezeWire(row.factId,wire);
    }
    const body=JSON.stringify([wire]),path='/v2/usage/events';
    const headers=await r.call({operation:'signRequest',method:'POST',path,body});
    if((await r.call({operation:'state'})).consent.state!=='granted')return {state:'withheld',code:'CONSENT_WITHHELD'};
    // Persist intent before the request. A crash/unknown commit cannot silently trigger an automatic replay.
    await r.store.mark(row.factId,{state:'unconfirmed',code:'UPLOAD_ATTEMPT_UNCONFIRMED'});
    const inflight=join(r.agentHome,'inflight');await mkdir(inflight,{recursive:true,mode:0o700});
    const marker=join(inflight,`${row.factId}.json`);
    await atomicJSON(marker,{eventId:wire.eventId});
    const result=await request(r.config.serverOrigin,path,{method:'POST',headers:{...headers,origin:r.config.serverOrigin,'content-type':'application/json'},body});
    if(result?.durability!=='committed'||Object.keys(result).sort().join('|')!=='accepted|duplicates|durability|rejected'||!Number.isSafeInteger(result.accepted)||!Number.isSafeInteger(result.duplicates)||!Array.isArray(result.rejected)||result.accepted+result.duplicates+result.rejected.length!==1||result.accepted<0||result.duplicates<0)throw new Error('AGENT_UPLOAD_RESPONSE_INVALID');
    if(result.rejected.length && result.rejected[0].eventId!==wire.eventId)throw new Error('AGENT_UPLOAD_RESPONSE_INVALID');
    const rejection=result.rejected[0];
    const code=rejection ? (/^[A-Z][A-Z0-9_]{0,79}$/.test(rejection.code)?rejection.code:'REJECTION_UNREADABLE') : null;
    await r.store.mark(row.factId,{state:rejection?'rejected':result.duplicates?'duplicate':'sent',code});
    await rm(marker,{force:true});
  }
  return {state:'idle',code:null,bound:contributions.bound,websiteOrigin:r.config.websiteOrigin,settings:catalog.settings};
}
