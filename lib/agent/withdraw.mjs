import {join} from 'node:path';
import {mkdir,readdir,rm} from 'node:fs/promises';
import {atomicJSON,readJSON} from './store.mjs';
import {agentLock,senderLock} from './sender-lock.mjs';

const latestPending=value=>({consentId:value.consentId ?? null});
const safeCode=error=>/^[A-Z][A-Z0-9_]{0,79}$/.test(error.message)?error.message:'AGENT_WITHDRAWAL_FAILED';
export async function finishWithdrawal(r) {
  const path=join(r.agentHome,'withdrawal.json');
  const current=await readJSON(path,null);if(current?.state!=='pending')return current;
  const collection=await agentLock(r.agentHome,'collection',r.config?.requestTimeoutMs ?? 10000);
  if(!collection)throw new Error('AGENT_COLLECTION_BUSY');
  let live;
  try{live=await readJSON(path,null);if(live?.state==='pending')await r.store.withdraw();}finally{await collection();}
  if(live?.state!=='pending')return live;
  const release=await senderLock(r.agentHome);
  if(!release)return {state:'pending',localDeleted:true,code:'UPLOAD_IN_PROGRESS'};
  try {
    const latest=await readJSON(path,null);if(latest?.state!=='pending')return latest;
    // Server tombstones the grant under the same lock as activation and ingest.
    const result=await r.call({operation:'withdraw'});
    let unknown=[];try{unknown=(await readdir(join(r.agentHome,'inflight'))).filter(name=>/^(?:[a-f0-9]{64}|[a-f0-9-]{36})\.json$/.test(name));}catch(error){if(error.code!=='ENOENT')throw error;}
    const committed=result&&Object.keys(result).sort().join('|')==='barrier|consentId|deletedEvents|state'&&result.barrier==='committed'&&result.state==='withdrawn'&&typeof latest.consentId==='string'&&result.consentId===latest.consentId&&Number.isSafeInteger(result.deletedEvents)&&result.deletedEvents>=0;
    let noDevice=false;
    if(result?.barrier==='no-device'&&unknown.length===0&&result.deletedEvents===0&&result.consentId===latest.consentId){const state=await r.call({operation:'state'});noDevice=state.deviceId===null&&state.consent.state==='withheld'&&state.consent.consentId===latest.consentId;}
    if(!committed&&!noDevice)throw new Error('AGENT_WITHDRAWAL_UNCONFIRMED');
    // A committed barrier also covers independent/late uploads; their local markers may now be removed.
    await rm(join(r.agentHome,'inflight'),{recursive:true,force:true});
    const next={state:'sent',deletedEvents:result.deletedEvents,consentId:result.consentId,barrier:result.barrier};
    await atomicJSON(path,next);return next;
  } catch(error){const next={...latestPending(current),state:'pending',code:safeCode(error)};await atomicJSON(path,next);return next;}
  finally{await release();}
}
export async function beginWithdrawal(r) {
  await mkdir(r.agentHome,{recursive:true,mode:0o700});
  const release=await agentLock(r.agentHome,'collection',r.config?.requestTimeoutMs ?? 10000);
  if(!release)throw new Error('AGENT_COLLECTION_BUSY');
  try{const stopped=await r.call({operation:'consent',state:'withheld'});await atomicJSON(join(r.agentHome,'withdrawal.json'),{state:'pending',consentId:stopped.consent.consentId});await r.store.withdraw();await rm(join(r.agentHome,'onboarding.json'),{force:true});}
  finally{await release();}
  return await finishWithdrawal(r);
}
export async function grantConsent(r) {
  await mkdir(r.agentHome,{recursive:true,mode:0o700});
  const release=await agentLock(r.agentHome,'collection',r.config?.requestTimeoutMs ?? 10000);
  if(!release)throw new Error('AGENT_COLLECTION_BUSY');
  try{const withdrawal=await readJSON(join(r.agentHome,'withdrawal.json'),null);if(withdrawal&&withdrawal.state!=='sent')throw new Error('WITHDRAWAL_PENDING');const core=await r.call({operation:'state'});if(core.consent.state!=='granted')throw Error('CORE_AGENT_WEB_CONSENT_REQUIRED');return await r.call({operation:'consent',state:'granted'});}
  finally{await release();}
}
