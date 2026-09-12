import type { MissingReason, Observation, ValueSource, Declaration } from './types.js';
export declare class ActivityError extends Error {
    readonly code: string;
    constructor(code: string);
}
export declare function missing<T>(reason: MissingReason): Observation<T>;
/** Reject, do not truncate: truncation can disguise a secret as valid metadata. */
export declare function safeMetadata(value: unknown): value is string;
export declare function sourceId(value: unknown): string;
export declare function text(value: unknown, source: ValueSource, reason?: MissingReason): Observation<string>;
export declare function numberValue(value: unknown, state: 'reported' | 'estimated', source: ValueSource, rule: string): Observation<number>;
export declare function isObject(value: unknown): value is Record<string, unknown>;
export declare function object(value: unknown): Record<string, unknown>;
/** Used on BOTH local-view/export paths. No transport accepts unfiltered payloads. */
export declare function exportProjection(record: Declaration): Declaration;
