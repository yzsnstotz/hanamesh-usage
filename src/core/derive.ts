import type { Declaration } from './types.js';
import { createUsageEvent, type UsageEvent } from './events.js';
import { eventIdForSession } from './identity.js';

export interface DeriveContext {
  deviceId: string | null;
  consent: 'granted' | 'withheld' | 'unknown';
  nonce(): string;
}
export type DeriveSkip = 'consentWithheld' | 'executorUnavailable' | 'timeUnavailable' | 'noDevice';
export type DeriveResult = { event: UsageEvent; skipped: null } | { event: null; skipped: DeriveSkip };

export function deriveUsageEvent(input: Declaration, context: DeriveContext): DeriveResult {
  if (context.deviceId === null) return { event:null, skipped:'noDevice' };
  if (context.consent !== 'granted') return { event:null, skipped:'consentWithheld' };
  if (input.executor.id.state !== 'reported') return { event:null, skipped:'executorUnavailable' };
  const observedTime = input.time.endedAt.state === 'reported' ? input.time.endedAt.value
    : input.time.startedAt.state === 'reported' ? input.time.startedAt.value : null;
  if (observedTime === null) return { event:null, skipped:'timeUnavailable' };
  return {
    event:createUsageEvent({
      eventId:eventIdForSession(context.deviceId, input.execution.sessionId, input.execution.turn),
      deviceId:context.deviceId,
      hanaRef:input.executor.id.value,
      action:'use',
      occurredAt:new Date(observedTime).toISOString(),
      nonce:context.nonce(),
      signature:null,
      source:'session-log',
      sourcePlugin:null,
      evidenceRef:input.eventRef,
    }),
    skipped:null,
  };
}
