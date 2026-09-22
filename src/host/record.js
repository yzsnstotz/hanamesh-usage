// @ts-check
import { createUsageEvent, eventIdForSeat, safeMetadata, validReceipt, validTargetRef, UsageError } from '../core/index.js';

const hana = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;
/** @param {unknown} value */
const validHana = value => typeof value === 'string' && value.length <= 128 && hana.test(value) && !/(?:sk-|ghp_|secret|password|api.?key)/i.test(value);

/**
 * @param {{
 *   store: import('../core/index.js').EventStore,
 *   getConsent(): 'granted'|'withheld',
 *   getDeviceId(): string|null,
 *   now?(): number,
 *   nonce(): string,
 *   signEvent(event: import('../core/index.js').UsageEvent): import('../core/index.js').UsageEvent,
 * }} options
 */
export function createRecordSeat({store,getConsent,getDeviceId,now=Date.now,nonce,signEvent}) {
  /**
   * rc.7：三个可选归因键。`sourceHanaRef`（来源 Hana，npm 包名）、`targetRef`（目标应用/会话，有界 token）、
   * `receipt {providerId, model|null, count}`（只允许配 `use`）。缺省与 rc.6 完全一致；同 idempotencyKey 但归因/回执不同是 EVENT_IDENTITY_CONFLICT。
   * @param {import('./contracts.js').RecordInput} input @returns {Promise<import('./contracts.js').RecordResult>} */
  return async function record(input) {
    if (getConsent() !== 'granted') return { disposition:'withheld' };
    try {
      if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new UsageError('INVALID_RECORD_INPUT');
      const keys=Object.keys(input);if(keys.some(key=>!['hanaRef','action','occurredAt','idempotencyKey','sourcePlugin','sourceHanaRef','targetRef','receipt'].includes(key))) throw new UsageError('INVALID_RECORD_INPUT');
      const {hanaRef,action,idempotencyKey,sourcePlugin}=input;
      if (!validHana(hanaRef) || !['open','use'].includes(action) || !safeMetadata(idempotencyKey) || idempotencyKey.length > 160 || !validHana(sourcePlugin)) throw new UsageError('INVALID_RECORD_INPUT');
      const sourceHanaRef=input.sourceHanaRef??null,targetRef=input.targetRef??null,receipt=input.receipt??null;
      if ((sourceHanaRef!==null&&!validHana(sourceHanaRef))||(targetRef!==null&&!validTargetRef(targetRef))||(receipt!==null&&(action!=='use'||!validReceipt(receipt)))) throw new UsageError('INVALID_RECORD_INPUT');
      const deviceId=getDeviceId();if(deviceId===null) throw new UsageError('DEVICE_UNAVAILABLE');
      const current=now();const occurredAt=input.occurredAt??new Date(current).toISOString();const time=Date.parse(occurredAt);
      if(!Number.isFinite(time)||new Date(time).toISOString()!==occurredAt||time<current-90*24*60*60*1000||time>current+5*60*1000) throw new UsageError('INVALID_RECORD_INPUT');
      const eventId=eventIdForSeat(deviceId,sourcePlugin,idempotencyKey);
      const event=signEvent(createUsageEvent({eventId,deviceId,hanaRef,action,occurredAt,nonce:nonce(),signature:null,source:'seat',sourcePlugin,evidenceRef:idempotencyKey,sourceHanaRef,targetRef,receipt:receipt===null?null:{providerId:receipt.providerId,model:receipt.model,count:receipt.count}}));
      const disposition=await store.put(event);
      return { disposition:disposition==='inserted'?'recorded':'duplicate',eventId };
    } catch (error) {
      const code=error instanceof UsageError&&['INVALID_RECORD_INPUT','DEVICE_UNAVAILABLE','EVENTS_CAPACITY_REACHED','EVENT_IDENTITY_CONFLICT'].includes(error.code)?error.code:'RECORD_FAILED';
      return { disposition:'rejected',code };
    }
  };
}
