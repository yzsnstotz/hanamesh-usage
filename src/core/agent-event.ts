import {eventIdForSeat,eventNonceForSeat} from './identity.js';

export interface AgentEvent {deviceId:string;hanaRef:string;action:'use';occurredAt:string;eventId:string;nonce:string;channel:'claude'|'codex';feature:string;success:boolean}
/** C-USAGE proposed hm-agent-v1; old six-field signatures remain untouched. */
export function agentSigningJSON(e:AgentEvent):string {
  if(!/^[A-Za-z0-9_-]{43}$/.test(e.deviceId)|| !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._:-]*$/i.test(e.hanaRef)||e.hanaRef.length>160||e.action!=='use'||!['claude','codex'].includes(e.channel)||!/^(mcp|skill):[A-Za-z0-9][A-Za-z0-9_.:-]{0,154}$/.test(e.feature)||typeof e.success!=='boolean'||new Date(e.occurredAt).toISOString()!==e.occurredAt)throw new Error('AGENT_EVENT_INVALID');
  return JSON.stringify({deviceId:e.deviceId,hanaRef:e.hanaRef,action:e.action,occurredAt:e.occurredAt,eventId:e.eventId,nonce:e.nonce,channel:e.channel,feature:e.feature,success:e.success});
}
export function agentEventForFact(deviceId:string,row:{factId:string;hanaRef:string;occurredAt:string;channel:'claude'|'codex';feature:string;success:boolean}):AgentEvent {
  const eventId=eventIdForSeat(deviceId,'hanamesh-usage',`agent:${row.channel}:${row.factId}`);
  return {deviceId,hanaRef:row.hanaRef,action:'use',occurredAt:row.occurredAt,eventId,nonce:eventNonceForSeat(eventId),channel:row.channel,feature:row.feature,success:row.success};
}
