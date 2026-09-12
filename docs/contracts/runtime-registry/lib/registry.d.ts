/** Narrow public AgentRegistry extension; the stock AgentLoop still owns its single factory. */
import type { Context } from '@deepseek-ai/cordis';
import { AgentRegistry, type AgentHandle, type CreateAgentOptions, type ResumeAgentOptions } from '@deepseek-ai/dsh-agent';
import type { SessionId } from '@deepseek-ai/dsh-session';
import { RuntimeBindingStore } from './binding-store.ts';
import { BindingUnusableError } from './binding-core.ts';
import { type RuntimeBinding, type RuntimeDriver } from './types.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        hanameshRuntimes: HanaMeshRuntimeRegistry;
    }
}
/** Missing ownership never permits an automatic runtime guess. */
export type UnboundSessionPolicy = 'refuse';
export interface HanaMeshRegistryConfig {
    readonly presetRuntimes?: Readonly<Record<string, string>>;
    readonly unboundSessions?: UnboundSessionPolicy;
}
export declare class HanaMeshRuntimeRegistry {
    private readonly ctx;
    private readonly drivers;
    constructor(ctx: Context);
    register(driver: RuntimeDriver): () => void;
    get(id: string): RuntimeDriver | undefined;
    list(): string[];
}
export declare class MissingRuntimeDriverError extends Error {
    readonly sessionId: SessionId;
    readonly runtime: string;
    constructor(sessionId: SessionId, runtime: string);
}
export declare class UnboundSessionError extends Error {
    readonly sessionId: SessionId;
    constructor(sessionId: SessionId);
}
export declare class SessionOperationInProgressError extends Error {
    readonly sessionId: SessionId;
    constructor(sessionId: SessionId);
}
export declare class HanaMeshAgentRegistry extends AgentRegistry {
    private readonly presetRuntimes;
    private readonly operations;
    readonly bindings: RuntimeBindingStore;
    constructor(ctx: Context, config?: HanaMeshRegistryConfig);
    private operation;
    private runtimeForCreate;
    private driverServices;
    create(options: CreateAgentOptions): Promise<AgentHandle>;
    resume(options: ResumeAgentOptions): Promise<AgentHandle>;
    readBinding(sessionId: SessionId): Promise<RuntimeBinding | undefined>;
}
export { BindingUnusableError };
export default HanaMeshAgentRegistry;
