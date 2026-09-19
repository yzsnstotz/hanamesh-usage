export type Action = 'install' | 'open' | 'use' | 'uninstall';
export type UploadState = 'pending' | 'sent' | 'duplicate' | 'rejected';
export interface UsageEvent {
    schemaVersion: 1;
    eventId: string;
    deviceId: string;
    hanaRef: string;
    action: Action;
    occurredAt: string;
    nonce: string;
    signature: string | null;
    sourceHanaRef: null;
    targetRef: null;
    source: 'session-log' | 'loader' | 'seat';
    sourcePlugin: string | null;
    evidenceRef: string | null;
    upload: {
        state: UploadState;
        code: string | null;
        attempts: number;
        sentAt: string | null;
    };
}
export type WireUsageEvent = Pick<UsageEvent, 'deviceId' | 'hanaRef' | 'action' | 'occurredAt' | 'eventId' | 'nonce' | 'signature'>;
export declare function validateEvent(input: unknown): asserts input is UsageEvent;
export declare function createUsageEvent(input: Omit<UsageEvent, 'schemaVersion' | 'sourceHanaRef' | 'targetRef' | 'upload'>): UsageEvent;
export declare function wireEvent(input: UsageEvent): WireUsageEvent;
/** Rebuild every locally exposed field so later private additions cannot leak by spread. */
export declare function exportEventProjection(input: UsageEvent): UsageEvent;
