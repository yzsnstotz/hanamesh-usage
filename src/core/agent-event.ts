import {eventIdForSeat,eventNonceForSeat} from './identity.js';

export interface AgentEvent {deviceId:string;hanaRef:string;action:'install'|'use';occurredAt:string;eventId:string;nonce:string;channel:'claude'|'codex';feature:string;success:boolean|null;remotePluginId?:string;remotePluginName?:string}
/** C-USAGE proposed hm-agent-v1; old six-field signatures remain untouched. */
export function agentSigningJSON(e:AgentEvent):string {
  if(!/^[A-Za-z0-9_-]{43}$/.test(e.deviceId)|| !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._:-]*$/i.test(e.hanaRef)||e.hanaRef.length>160||!['install','use'].includes(e.action)||!['claude','codex'].includes(e.channel)||!/^(mcp|skill):[A-Za-z0-9][A-Za-z0-9_.:-]{0,154}$/.test(e.feature)||(e.success!==null&&typeof e.success!=='boolean')||new Date(e.occurredAt).toISOString()!==e.occurredAt)throw new Error('AGENT_EVENT_INVALID');
  if((e.remotePluginId!==undefined||e.remotePluginName!==undefined)&&(typeof e.remotePluginId!=='string'||!e.remotePluginId||typeof e.remotePluginName!=='string'||!e.remotePluginName))throw new Error('AGENT_EVENT_INVALID');
  return JSON.stringify({deviceId:e.deviceId,hanaRef:e.hanaRef,action:e.action,occurredAt:e.occurredAt,eventId:e.eventId,nonce:e.nonce,channel:e.channel,feature:e.feature,success:e.success,...(e.remotePluginId===undefined?{}:{remotePluginId:e.remotePluginId,remotePluginName:e.remotePluginName})});
}
export function agentEventForFact(deviceId:string,row:{factId:string;hanaRef:string;occurredAt:string;channel:'claude'|'codex';feature:string;success:boolean|null;remote?:{remotePluginId:string;name:string}},consentId:string):AgentEvent {
  if(typeof consentId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(consentId))throw new Error('AGENT_CONSENT_INVALID');
  const eventId=eventIdForSeat(deviceId,'hanamesh-usage',`agent:${row.channel}:${row.factId}`);
  return {deviceId,hanaRef:row.hanaRef,action:'use',occurredAt:row.occurredAt,eventId,nonce:`g${consentId}.${eventNonceForSeat(eventId)}`,channel:row.channel,feature:row.feature,success:row.success,...(row.remote?{remotePluginId:row.remote.remotePluginId,remotePluginName:row.remote.name}:{})};
}

/** One install fact per device/Hana across Claude/Codex. Outcome and original call time are never invented. */
export function agentInstallEventForFact(deviceId:string,row:{hanaRef:string;occurredAt:string;channel:'claude'|'codex';feature:string;success:boolean|null;remote?:{remotePluginId:string;name:string}},consentId:string):AgentEvent {
 if(typeof consentId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(consentId))throw new Error('AGENT_CONSENT_INVALID');
 const eventId=eventIdForSeat(deviceId,'hanamesh-usage',`agent-install:${row.hanaRef}`);
 return {deviceId,hanaRef:row.hanaRef,action:'install',occurredAt:row.occurredAt,eventId,nonce:`g${consentId}.${eventNonceForSeat(eventId)}`,channel:row.channel,feature:row.feature,success:row.success,...(row.remote?{remotePluginId:row.remote.remotePluginId,remotePluginName:row.remote.name}:{})};
}
