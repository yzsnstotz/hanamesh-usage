import {join} from 'node:path';
import {mkdir,rm} from 'node:fs/promises';
import {agentEventForFact,agentInstallEventForFact,agentSigningJSON} from '../core/agent-event.js';
import {atomicJSON,readJSON} from './store.mjs';
import {requestJSON} from './runtime.mjs';
import {refreshAgentCatalog} from './remote-catalog.mjs';

export async function uploadOnce(r,{now=Date.now(),request=(origin,path,init)=>requestJSON(origin,path,init,r.config.requestTimeoutMs)}={}) {
  let state=await r.call({operation:'state'});
  if(state.consent.state==='granted'&&state.consent.authorization==='website'){await r.call({operation:'syncOnboarding'});state=await r.call({operation:'state'});}
  if(state.consent.state!=='granted'||state.consent.authorization!=='website')return {state:'withheld',code:'CONSENT_WITHHELD'};
  if(!r.config.serverOrigin)return {state:'offline',code:'SERVER_ORIGIN_UNAVAILABLE'};
  // No downgrade: missing endpoint/protocol means stopped, never send new bytes to v1.
  const catalog=await refreshAgentCatalog(r,{now,request});
  await mkdir(r.agentHome,{recursive:true,mode:0o700});
  await atomicJSON(join(r.agentHome,'catalog.json'),catalog);
  await r.store.prune(now);
  const pending=await r.store.pending(catalog,now),eligible=await r.store.eligible(catalog,now);
  if(eligible.length===0)return {state:'idle',code:null,settings:catalog.settings};
  await r.call({operation:'register'});
  const device=await r.call({operation:'state'});
  const consentId=device.consent.consentId;
  if(device.consent.state!=='granted'||device.consent.authorization!=='website'||consentId!==state.consent.consentId||typeof consentId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(consentId))throw new Error('AGENT_CONSENT_INVALID');
  const active=async()=>{const current=await r.call({operation:'state'});if(current.consent.state!=='granted'||current.consent.authorization!=='website'||current.consent.consentId!==consentId||current.deviceId!==device.deviceId)throw new Error('AGENT_CONSENT_CHANGED');};
  const send=async(wire,mark,key)=>{
    const body=JSON.stringify([wire]),path='/v2/usage/events';
    const headers=await r.call({operation:'signRequest',method:'POST',path,body});await active();
    await mark({state:'unconfirmed',code:'UPLOAD_ATTEMPT_UNCONFIRMED'});
    const inflight=join(r.agentHome,'inflight');await mkdir(inflight,{recursive:true,mode:0o700});const marker=join(inflight,`${key}.json`);
    await atomicJSON(marker,{eventId:wire.eventId});
    const result=await request(r.config.serverOrigin,path,{method:'POST',headers:{...headers,origin:r.config.serverOrigin,'content-type':'application/json'},body});
    if(result?.durability!=='committed'||Object.keys(result).sort().join('|')!=='accepted|duplicates|durability|rejected'||!Number.isSafeInteger(result.accepted)||!Number.isSafeInteger(result.duplicates)||!Array.isArray(result.rejected)||result.accepted+result.duplicates+result.rejected.length!==1||result.accepted<0||result.duplicates<0)throw Error('AGENT_UPLOAD_RESPONSE_INVALID');
    if(result.rejected.length&&result.rejected[0].eventId!==wire.eventId)throw Error('AGENT_UPLOAD_RESPONSE_INVALID');
    const rejection=result.rejected[0],code=rejection?(/^[A-Z][A-Z0-9_]{0,79}$/.test(rejection.code)?rejection.code:'REJECTION_UNREADABLE'):null;
    await mark({state:rejection?'rejected':result.duplicates?'duplicate':'sent',code});await rm(marker,{force:true});
  };
  for(const row of pending) {
    const entry=(await r.store.rows()).find(item=>item.factId===row.factId);
    await active();
    if(!entry)throw new Error('AGENT_FACT_CHANGED');
    let wire=entry.wire;
    if(wire && (wire.deviceId!==device.deviceId||wire.hanaRef!==row.hanaRef||!wire.nonce.startsWith(`g${consentId}.`)))throw new Error('AGENT_ATTRIBUTION_CHANGED');
    if(!wire) {
      const event=agentEventForFact(device.deviceId,{...entry,hanaRef:row.hanaRef},consentId);
      const {signature}=await r.call({operation:'sign',message:agentSigningJSON(event)});
      wire={...event,signature};
      wire=await r.store.freezeWire(row.factId,wire);
    }
    await send(wire,delivery=>r.store.mark(row.factId,delivery),row.factId);
  }
  const firstByHana=new Map();
  for(const row of eligible.sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt)||a.factId.localeCompare(b.factId)))if(!firstByHana.has(row.hanaRef))firstByHana.set(row.hanaRef,row);
  for(const row of firstByHana.values()){
    await active();
    const event=agentInstallEventForFact(device.deviceId,row,consentId),existing=await r.store.installState(event.eventId);
    if(existing?.delivery)continue; // No automatic replay after an unknown commit or a terminal decision.
    let wire=existing?.wire;
    if(!wire){const {signature}=await r.call({operation:'sign',message:agentSigningJSON(event)});wire=await r.store.freezeInstall(row.factId,{...event,signature});}
    if(wire)await send(wire,delivery=>r.store.markInstall(wire.eventId,delivery),wire.eventId);
  }
  return {state:'idle',code:null,bound:true,websiteOrigin:r.config.websiteOrigin,settings:catalog.settings};
}
