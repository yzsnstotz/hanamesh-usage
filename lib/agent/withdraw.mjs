import {join} from 'node:path';
import {mkdir,readdir} from 'node:fs/promises';
import {atomicJSON,readJSON} from './store.mjs';
import {agentLock,senderLock} from './sender-lock.mjs';

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
    // Delete only once the last admitted POST has finished. Otherwise it could arrive after a successful DELETE.
    const result=await r.call({operation:'withdraw'});
    let unknown=[];try{unknown=(await readdir(join(r.agentHome,'inflight'))).filter(name=>/^[a-f0-9]{64}\.json$/.test(name));}catch(error){if(error.code!=='ENOENT')throw error;}
    // A timed-out/killed client may still have an uncommitted server POST. DELETE success is only a snapshot then.
    const next=unknown.length?{state:'unconfirmed',...result,code:'UPLOAD_OUTCOME_UNCONFIRMED',unknownUploads:unknown.length}:{state:'sent',...result};
    await atomicJSON(path,next);return next;
  } catch(error){const next={state:'pending',code:safeCode(error)};await atomicJSON(path,next);return next;}
  finally{await release();}
}
export async function beginWithdrawal(r) {
  await mkdir(r.agentHome,{recursive:true,mode:0o700});
  const release=await agentLock(r.agentHome,'collection',r.config?.requestTimeoutMs ?? 10000);
  if(!release)throw new Error('AGENT_COLLECTION_BUSY');
  try{await r.call({operation:'consent',state:'withheld'});await atomicJSON(join(r.agentHome,'withdrawal.json'),{state:'pending'});await r.store.withdraw();}
  finally{await release();}
  return await finishWithdrawal(r);
}
export async function grantConsent(r) {
  await mkdir(r.agentHome,{recursive:true,mode:0o700});
  const release=await agentLock(r.agentHome,'collection',r.config?.requestTimeoutMs ?? 10000);
  if(!release)throw new Error('AGENT_COLLECTION_BUSY');
  try{const withdrawal=await readJSON(join(r.agentHome,'withdrawal.json'),null);if(withdrawal&&withdrawal.state!=='sent')throw new Error('WITHDRAWAL_PENDING');return await r.call({operation:'consent',state:'granted'});}
  finally{await release();}
}
