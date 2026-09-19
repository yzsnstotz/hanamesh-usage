import type { Declaration } from './types.js';
import { type UsageEvent } from './events.js';
export interface DeriveContext {
    deviceId: string | null;
    consent: 'granted' | 'withheld';
    nonce(): string;
}
export type DeriveSkip = 'consentWithheld' | 'executorUnavailable' | 'timeUnavailable' | 'noDevice';
export type DeriveResult = {
    event: UsageEvent;
    skipped: null;
} | {
    event: null;
    skipped: DeriveSkip;
};
export declare function deriveUsageEvent(input: Declaration, context: DeriveContext): DeriveResult;
