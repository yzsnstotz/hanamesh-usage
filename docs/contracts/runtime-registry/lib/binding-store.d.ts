import { z } from 'zod';
import { defineDomain } from '@deepseek-ai/dsh-storage-domain';
import type { Context } from '@deepseek-ai/cordis';
import type { SessionId } from '@deepseek-ai/dsh-session';
import type { RuntimeBinding } from './types.ts';
import { type RuntimeBindingRecord } from './binding-core.ts';
export { BindingAlreadyOwnedError, BindingUnusableError } from './binding-core.ts';
export type { BindingState, RuntimeBindingRecord } from './binding-core.ts';
/** Schema rejects malformed state instead of making missing ownership mean native. */
export declare const runtimeBindingRecord: z.ZodType<RuntimeBindingRecord>;
/**
 * v3 uses a single full-unit publication. It deliberately does NOT declare v1/v2
 * compatible: their layout/audit fields need an explicit, separately reviewed
 * offline migration. Never silently reopen old per-record state as single.
 */
export declare const runtimeBindingDomainSpec: ReturnType<typeof defineDomain>;
export declare class RuntimeBindingStore {
    private readonly ctx;
    private ledger;
    private opening;
    private closed;
    constructor(ctx: Context);
    static newTransactionId(): string;
    private requireLedger;
    /** Third argument is retained for source compatibility, but automatic orphan takeover is disabled. */
    reserve(binding: RuntimeBinding, txId: string, _isOrphan?: (existing: RuntimeBindingRecord) => Promise<boolean>): Promise<void>;
    commit(sessionId: SessionId, txId: string, binding?: RuntimeBinding): Promise<void>;
    release(sessionId: SessionId, txId: string): Promise<boolean>;
    record(sessionId: SessionId): Promise<RuntimeBindingRecord | undefined>;
    get(sessionId: SessionId): Promise<RuntimeBinding | undefined>;
    list(): Promise<string[]>;
    /** @deprecated Legacy adoption cannot establish provenance. Use a reviewed offline migration. */
    adoptAsNative(_sessionId: SessionId): Promise<RuntimeBinding>;
}
