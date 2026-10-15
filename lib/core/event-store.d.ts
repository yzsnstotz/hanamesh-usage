import { type UsageEvent, type UploadState } from './events.js';
export interface WithdrawalState {
    requestedAt: string;
    deviceId: string;
    state: 'pending' | 'sent' | 'offline' | 'unconfirmed';
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
/** Local storage admission DTO; public declarations stay independent of dev-only contracts. */
/** C-USAGE per-item host rejection, stored as `USAGE_EVENT_HOST_REJECTED[:REASON]`. */
export declare function isHostRejection(code: string | null): boolean;
export interface IngestBatchResult {
    accepted: number;
    duplicates: number;
    rejected: readonly {
        eventId: string;
        code: string;
        reason?: {
            code?: string;
            need?: string;
        };
    }[];
    durability: 'committed' | 'pending-host-commit';
}
export declare function validateEventSnapshot(value: unknown): asserts value is EventSnapshot;
export declare class EventStore {
    private readonly global;
    private readonly maxEvents;
    private readonly now;
    private readonly eventRetentionDays;
    private readonly queryLimit;
    private snapshot;
    private tail;
    constructor(global: EventGlobalPort, maxEvents?: number, now?: () => number, eventRetentionDays?: number, queryLimit?: number);
    private commit;
    put(input: UsageEvent): Promise<'inserted' | 'duplicate'>;
    signPending(signer: (event: UsageEvent) => UsageEvent): Promise<number>;
    /** `dropPendingLoader`: never-sent loader install/uninstall events for these package names are removed in the same
     *  commit (an inventory source migration retracting records that were never valid user installs). */
    updateInventory(scannedAt: string, items: InventoryItem[], inputs: UsageEvent[], dropPendingLoader?: readonly string[]): Promise<{
        inserted: string[];
        duplicates: number;
        dropped: number;
    }>;
    applyUpload(eventIds: string[], result: IngestBatchResult, sentAt: string): Promise<void>;
    /** A host-rejected event (USAGE_EVENT_HOST_REJECTED) was not stored by the server; on an explicit user resend it goes
     *  back to pending with its original signed bytes. Never used by the automatic sender. Returns how many were reopened. */
    reopenHostRejected(eventIds: string[]): Promise<number>;
    /** Conservative send intent uses the existing local diagnostic slot only.
     * Neither the signed event nor its attempt count changes at admission. */
    markUploadIntent(eventIds: string[], pending?: boolean): Promise<void>;
    markAttempts(eventIds: string[], code?: string | null, clearCode?: boolean): Promise<void>;
    /** A one-shot user selection may revisit unknown rows, but keeps their
     * durable stop marker. No automatic sender uses this admission method. */
    markResendIntent(eventIds: string[]): Promise<void>;
    /** Record one explicit failed attempt atomically; an ordinary new failure
     * cannot erase a pre-existing unknown outcome from an earlier request. */
    markResendFailure(eventIds: string[], previousUnknown: ReadonlyMap<string, string>): Promise<void>;
    withdrawLocal(requestedAt: string, deviceId: string): Promise<void>;
    markWithdrawal(input: {
        state: 'pending' | 'sent' | 'offline' | 'unconfirmed';
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
