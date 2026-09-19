import { type UsageEvent, type UploadState } from './events.js';
export interface WithdrawalState {
    requestedAt: string;
    deviceId: string;
    state: 'pending' | 'sent' | 'offline';
    attempts: number;
    deletedEvents: number | null;
    lastError: string | null;
}
export interface InventoryItem {
    hanaRef: string;
    version: string;
    entryId: string;
    disabled: boolean;
}
export interface EventSnapshot {
    schemaVersion: 1;
    events: UsageEvent[];
    withdrawal: WithdrawalState | null;
    inventory: {
        last: {
            scannedAt: string;
            items: InventoryItem[];
        } | null;
    };
}
export interface EventGlobalPort {
    get(): EventSnapshot;
    set(value: EventSnapshot): Promise<void>;
}
export declare function validateEventSnapshot(value: unknown): asserts value is EventSnapshot;
export declare class EventStore {
    private readonly global;
    private readonly maxEvents;
    private readonly now;
    private snapshot;
    private tail;
    constructor(global: EventGlobalPort, maxEvents?: number, now?: () => number);
    put(input: UsageEvent): Promise<'inserted' | 'duplicate'>;
    query(filter?: {
        state?: UploadState;
        limit?: number;
        after?: string;
    }): {
        total: number;
        events: UsageEvent[];
    };
    getSnapshot(): EventSnapshot;
    drain(): Promise<void>;
}
