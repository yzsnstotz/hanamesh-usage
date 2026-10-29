import {join} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {readJSON,atomicJSON} from './store.mjs';

export async function localRecordingEnabled(r,state=null){
 const core=state ?? await r.call({operation:'state'});
 const withdrawal=await readJSON(join(r.agentHome,'withdrawal.json'),null);
 if(withdrawal&&!(withdrawal.state==='sent'&&core.consent.state==='granted'))return false;
 if(core.consent.state==='granted')return true;
 if(core.consent.changedAt!==null)return false;
 if(core.agentProtocolVersion!==2)throw Error('AGENT_CORE_CAPABILITY_REQUIRED');
 return true;
}
export async function refreshOnboarding(r,{link=false}={}){
 let core=await r.call({operation:'state'});
 if(!await localRecordingEnabled(r,core))return {state:'closed'};
 if(core.consent.state==='granted'&&core.consent.authorization==='website'){
  await r.call({operation:'syncOnboarding'});await mkdir(r.agentHome,{recursive:true,mode:0o700});await atomicJSON(join(r.agentHome,'onboarding.json'),{state:'active'});return {state:'active'};
 }
 if(core.agentProtocolVersion!==2)throw Error('AGENT_CORE_CAPABILITY_REQUIRED');
 if(core.consent.consentId){
  const synced=await r.call({operation:'syncOnboarding'});
  if(synced.consent.state==='granted'&&synced.consent.authorization==='website'){await mkdir(r.agentHome,{recursive:true,mode:0o700});await atomicJSON(join(r.agentHome,'onboarding.json'),{state:'active'});return {state:'active'};}
  // A committed device binding stops reminders even if the later usage audit is still pending.
  if(synced.onboarding?.binding){await mkdir(r.agentHome,{recursive:true,mode:0o700});await atomicJSON(join(r.agentHome,'onboarding.json'),{state:'bound-pending-audit'});return {state:'bound-pending-audit'};}
 }
 const cached=await readJSON(join(r.agentHome,'onboarding.json'),null);
 if(!link&&cached?.url)return cached;
 const result=await r.call({operation:'prepareOnboarding'});
 if(typeof result.url!=='string'||typeof result.expiresAt!=='string'||result.deviceId!==core.deviceId&&core.deviceId!==null)throw Error('AGENT_ONBOARDING_UNCONFIRMED');
 const url=new URL(result.url);if(url.origin!==r.config.websiteOrigin||url.pathname!=='/me/bind'||url.searchParams.get('flow')!=='agent')throw Error('AGENT_ONBOARDING_UNCONFIRMED');
 const next={...result,state:'pending'};await mkdir(r.agentHome,{recursive:true,mode:0o700});await atomicJSON(join(r.agentHome,'onboarding.json'),next);return next;
}
