/**
 * HanaMesh external-runtime contracts: the driver face, the durable runtime
 * binding, and the lifecycle that publishes it.
 *
 * Nothing here imports a DSH internal path. Every DSH type comes from a
 * published package root export.
 *
 * @module @hanamesh/dsh-agent-registry/types
 */
import type { Context } from '@deepseek-ai/cordis';
import type { AgentHandle, CreateAgentOptions, ResumeAgentOptions } from '@deepseek-ai/dsh-agent';
import type { SessionId } from '@deepseek-ai/dsh-session';
/** The reserved runtime id for the unmodified upstream AgentLoop. */
export declare const NATIVE_RUNTIME = "native";
/**
 * Observation quality of a usage figure. Recorded verbatim so an estimate can
 * never be read back as a settled provider figure (AEP 3 / 6 rule).
 */
export type UsageObservationQuality = 'provider_reported' | 'runtime_reported' | 'estimated' | 'unavailable';
/**
 * The durable binding between one DSH Session and the external runtime that
 * owns its execution. Written before session persistence into a storage-domain sidecar;
 * read back on cold resume BEFORE any factory is consulted.
 *
 * Deliberately does NOT carry secrets: `authRef` is a reference to a
 * credential the runtime resolves itself, never the credential.
 */
export interface RuntimeBinding {
    /** The DSH session id this binding belongs to. */
    readonly sessionId: SessionId;
    /** Registered runtime/driver id (`native` is reserved for upstream AgentLoop). */
    readonly runtime: string;
    /** Driver implementation version, for resume-compatibility decisions. */
    readonly driverVersion: string;
    /** The external runtime's own session/thread identity, when it has one. */
    readonly externalSessionId?: string;
    /** Absolute workspace the external runtime was started in. */
    readonly workspace?: string;
    /** Non-secret reference to the authorization the runtime resolves itself. */
    readonly authRef?: string;
    /** External protocol/product version observed at handshake. */
    readonly protocolVersion?: string;
}
declare module '@deepseek-ai/dsh-agent' {
    interface CreateAgentOptions {
        /**
         * Explicit runtime selection for programmatic callers. Product UI paths
         * select through the agent preset instead; this never travels in the
         * model `provider` field.
         */
        readonly hanameshRuntime?: string;
    }
}
/** Facilities a driver receives to publish through the inherited registry. */
export interface DriverServices {
    /** Host context owning the registry service. */
    readonly hostCtx: Context;
    /** The durable binding sidecar, for drivers that update their binding. */
    readonly bindings: import('./binding-store.ts').RuntimeBindingStore;
    /** Write the binding and publish the agent through the ordered boundary. */
    readonly publish: PublishExternalAgent;
}
/** The ordered publication helper shared by every HanaMesh driver. */
export type PublishExternalAgent = (request: PublishRequest) => Promise<AgentHandle>;
/** One external agent's publication request. */
export interface PublishRequest {
    /** Caller context that structurally owns the lifecycle. */
    readonly ownerCtx: Context;
    /** Shared agent/session identity. */
    readonly sessionId: SessionId;
    /** `startup` for a fresh create, `resume` for a persisted load. */
    readonly source: 'startup' | 'resume';
    /** The binding recorded durably before publication. */
    readonly binding: RuntimeBinding;
    /** Fresh-session metadata; ignored on resume. */
    readonly meta?: CreateAgentOptions['meta'];
    /** Live parent Agent for runtime ownership. */
    readonly parentAgent?: CreateAgentOptions['parentAgent'];
    /** Caller cancellation for the creation window. */
    readonly signal?: AbortSignal;
    /** Caller composition callback, awaited while the agent is unpublished. */
    readonly setup?: CreateAgentOptions['setup'] | ResumeAgentOptions['setup'];
    /**
     * Construct the driver's Agent over the prepared scope and session.
     * Called after the session exists and before setup runs.
     */
    readonly buildAgent: BuildExternalAgent;
}
/** Inputs handed to a driver when it constructs its Agent. */
export interface BuildAgentInput {
    /** The agent-scoped context; agent-local registrations unwind on disposal. */
    readonly agentCtx: Context;
    /** The prepared, unpublished session. */
    readonly session: unknown;
    /** Shared identity. */
    readonly sessionId: SessionId;
    /** Fused abort: caller cancel, owner unload, or driver teardown. */
    readonly signal: AbortSignal;
}
/** Builds the driver's own Agent implementation. */
export type BuildExternalAgent = (input: BuildAgentInput) => Promise<ExternalAgent> | ExternalAgent;
/**
 * What a driver's Agent must provide beyond the upstream `Agent` face: the
 * teardown the lifecycle owner drives on disposal.
 */
export interface ExternalAgent {
    /** The live Agent, satisfying the unmodified upstream runtime face. */
    readonly agent: import('@deepseek-ai/dsh-agent').Agent;
    /** Stop the external runtime and reach quiescence. */
    shutdown(): Promise<void>;
}
/** One registered external runtime driver. */
export interface RuntimeDriver {
    /** Stable runtime id used in bindings and preset mappings. */
    readonly id: string;
    /** Driver implementation version recorded in every binding it writes. */
    readonly version: string;
    /**
     * Create a fresh external session.
     * @throws when the external runtime cannot start; nothing is published.
     */
    createAgent(options: CreateAgentOptions, services: DriverServices): Promise<AgentHandle>;
    /**
     * Reattach to the external session named by a persisted binding.
     * @throws when the runtime cannot reattach. Never falls back to native.
     */
    resume(options: ResumeAgentOptions, binding: RuntimeBinding, services: DriverServices): Promise<AgentHandle>;
}
