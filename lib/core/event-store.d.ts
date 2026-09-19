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
export interface IngestBatchResult {
    accepted: number;
    duplicates: number;
    rejected: {
        eventId: string;
        code: string;
    }[];
    durability: 'committed' | 'pending-host-commit';
}
export declare function validateEventSnapshot(value: unknown): asserts value is EventSnapshot;
export declare class EventStore {
    private readonly global;
    private readonly maxEvents;
    private readonly now;
    private snapshot;
    private tail;
    constructor(global: EventGlobalPort, maxEvents?: number, now?: () => number);
    private commit;
    put(input: UsageEvent): Promise<'inserted' | 'duplicate'>;
    signPending(signer: (event: UsageEvent) => UsageEvent): Promise<number>;
    updateInventory(scannedAt: string, items: InventoryItem[], inputs: UsageEvent[]): Promise<{
        inserted: string[];
        duplicates: number;
    }>;
    applyUpload(eventIds: string[], result: IngestBatchResult, sentAt: string): Promise<void>;
    markAttempts(eventIds: string[]): Promise<void>;
    withdrawLocal(requestedAt: string, deviceId: string): Promise<void>;
    markWithdrawal(input: {
        state: 'pending' | 'sent' | 'offline';
        deletedEvents: number | null;
        lastError: string | null;
    }): Promise<void>;
    clearWithdrawal(): Promise<void>;
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
