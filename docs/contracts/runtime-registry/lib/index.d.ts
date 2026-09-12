/**
 * HanaMesh agent registry plugin. Replaces the `agent` composition row so
 * `ctx.agents` is a narrow extension of the published `AgentRegistry`, and
 * provides `ctx.hanameshRuntimes` for external runtime drivers.
 *
 * The upstream `dsh-agent-loop` row stays loaded and unmodified: it still
 * constructs its own AgentLoop and still owns the single agent factory.
 *
 * @module @hanamesh/dsh-agent-registry
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { type HanaMeshRegistryConfig } from './registry.ts';
export * from './types.ts';
export { publishExternalAgent } from './lifecycle.ts';
export { RuntimeBindingStore, runtimeBindingDomainSpec, runtimeBindingRecord, BindingAlreadyOwnedError, BindingUnusableError } from './binding-store.ts';
export { HanaMeshAgentRegistry, HanaMeshRuntimeRegistry, MissingRuntimeDriverError, UnboundSessionError, SessionOperationInProgressError, type HanaMeshRegistryConfig, } from './registry.ts';
export declare const name = "hanamesh-agent-registry";
/** Plugin configuration. */
export type Config = HanaMeshRegistryConfig;
export declare const Config: z<Config>;
/**
 * Mount the runtime registry and the `agents` service.
 * @param ctx - the plugin context.
 * @param config - preset-to-runtime routing.
 */
export declare function apply(ctx: Context, config: Config): void;
