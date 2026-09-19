import { createUsageEvent } from './events.js';
import { eventIdForSession } from './identity.js';
export function deriveUsageEvent(input, context) {
    if (context.deviceId === null)
        return { event: null, skipped: 'noDevice' };
    if (context.consent !== 'granted')
        return { event: null, skipped: 'consentWithheld' };
    if (input.executor.id.state !== 'reported')
        return { event: null, skipped: 'executorUnavailable' };
    const observedTime = input.time.endedAt.state === 'reported' ? input.time.endedAt.value
        : input.time.startedAt.state === 'reported' ? input.time.startedAt.value : null;
    if (observedTime === null)
        return { event: null, skipped: 'timeUnavailable' };
    return {
        event: createUsageEvent({
            eventId: eventIdForSession(context.deviceId, input.execution.sessionId, input.execution.turn),
            deviceId: context.deviceId,
            hanaRef: input.executor.id.value,
            action: 'use',
            occurredAt: new Date(observedTime).toISOString(),
            nonce: context.nonce(),
            signature: null,
            source: 'session-log',
            sourcePlugin: null,
            evidenceRef: input.eventRef,
        }),
        skipped: null,
    };
}
