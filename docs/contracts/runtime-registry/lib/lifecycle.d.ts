/**
 * Public-API publication lifecycle extracted from the R4 prototype.
 * Prepare in memory -> reserve sidecar -> build/setup -> commit owner sidecar ->
 * create/flush session medium -> publish. A crash can leave an owner orphan, not
 * a durable DSH session with no owner. No custom session event is appended.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent, AgentHandle } from '@deepseek-ai/dsh-agent';
import { RuntimeBindingStore } from './binding-store.ts';
import type { PublishRequest } from './types.ts';
/** Direct callers are trusted same-process code; drivers normally use DriverServices.publish. */
export declare function publishExternalAgent(hostCtx: Context, bindings: RuntimeBindingStore, request: PublishRequest): Promise<AgentHandle>;
export type { Agent };
