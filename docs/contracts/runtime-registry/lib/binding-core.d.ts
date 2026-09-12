/** Dependency-free ownership logic; the production adapter supplies a DSH domain table. */
import type { SessionId } from '@deepseek-ai/dsh-session';
import type { RuntimeBinding } from './types.ts';
export type BindingState = 'reserving' | 'active';
export interface RuntimeBindingRecord extends RuntimeBinding {
    readonly txId: string;
    readonly state: BindingState;
    readonly boundAt: number;
    readonly committedAt?: number;
}
/** One owner-controlled table. All mutations must pass through this ledger. */
export interface BindingTable {
    get(key: string): RuntimeBindingRecord | undefined;
    put(key: string, value: RuntimeBindingRecord): Promise<void>;
    delete(key: string): Promise<boolean>;
    update(key: string, fn: (current: RuntimeBindingRecord) => RuntimeBindingRecord): Promise<RuntimeBindingRecord>;
    keys(): IterableIterator<string>;
}
export declare class BindingAlreadyOwnedError extends Error {
    readonly sessionId: SessionId;
    readonly existing: RuntimeBindingRecord;
    constructor(sessionId: SessionId, existing: RuntimeBindingRecord);
}
export declare class BindingUnusableError extends Error {
    readonly sessionId: SessionId;
    readonly reason: string;
    constructor(sessionId: SessionId, reason: string);
}
export declare function nonempty(value: unknown, label: string, maxLength?: number): asserts value is string;
/** Snapshot only the published contract; never persist an accidental extra credential field. */
export declare function bindingSnapshot(value: RuntimeBinding): RuntimeBinding;
/** Validate both persisted fields and the table-key/record-identity relationship. */
export declare function recordSnapshot(value: unknown, key?: SessionId): RuntimeBindingRecord;
export declare function assertBindingIdentity(expected: RuntimeBinding, actual: RuntimeBinding): void;
/**
 * In-process serialized ownership. DSH's domain is not CAS or a cross-process lock.
 * One process owns one isolated profile. Crash orphans are NEVER reclaimed merely
 * because the session is absent: an in-flight creator also has no session yet.
 */
export declare class BindingLedger {
    private readonly table;
    private readonly clock;
    private chain;
    constructor(table: BindingTable, clock?: () => number);
    private serialize;
    record(sessionId: SessionId): RuntimeBindingRecord | undefined;
    get(sessionId: SessionId): RuntimeBinding | undefined;
    list(): string[];
    reserve(binding: RuntimeBinding, txId: string): Promise<void>;
    commit(sessionId: SessionId, txId: string, binding?: RuntimeBinding): Promise<void>;
    release(sessionId: SessionId, txId: string): Promise<boolean>;
}
