import type { MissingReason, Observation, ValueSource, Declaration } from './types.js';

export class UsageError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'UsageError'; }
}
export function missing<T>(reason: MissingReason): Observation<T> {
  return { state: 'unavailable', value: null, reason };
}
/** Reject, do not truncate: truncation can disguise a secret as valid metadata. */
export function safeMetadata(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 160
    && /^[A-Za-z0-9][A-Za-z0-9._:@/+\-]*$/.test(value)
    && !/(?:sk-|ghp_|github_pat_|xox[baprs]-|eyJ|bearer|private.?key|password|secret|api.?key)/i.test(value)
    && !/(?:https?:|file:|\/Users\/|\/home\/|\/mnt\/|^[A-Za-z]:|@.+\.)/i.test(value)
    && !/^(?:0x)?[0-9a-f]{64}$/i.test(value);
}
export function sourceId(value: unknown): string {
  if (!safeMetadata(value) || value.length > 128 || /[/@+]/.test(value)) throw new UsageError('INVALID_SOURCE_ID');
  return value;
}
export function text(value: unknown, source: ValueSource, reason: MissingReason = 'not_provided'): Observation<string> {
  if (value === undefined || value === null || value === '') return missing(reason);
  return safeMetadata(value)
    ? { state: 'reported', value, source, rule: 'verbatim-safe-metadata-v1' }
    : missing('redacted');
}
export function numberValue(value: unknown, state: 'reported' | 'estimated', source: ValueSource, rule: string): Observation<number> {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return missing('invalid_value');
  return { state, value, source, rule };
}
export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function object(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {};
}
/** Used on BOTH local-view/export paths. No transport accepts unfiltered payloads. */
export function exportProjection(record: Declaration): Declaration {
  // Copy field by field; a later local-only field cannot escape through spreading.
  const observe = <T>(v: Observation<T>): Observation<T> => {
    if (v.state === 'unavailable') return { state: 'unavailable', value: null, reason: v.reason };
    if (!safeMetadata(v.rule) || (typeof v.value === 'string' && !safeMetadata(v.value))) return missing<T>('redacted');
    return { state: v.state, value: v.value, source: v.source, rule: v.rule };
  };
  return {
    schemaVersion: 1,
    eventRef: JSON.stringify([sourceId(record.execution.sessionId), 'turn/end', record.execution.turn]),
    execution: { sessionId: sourceId(record.execution.sessionId), turn: record.execution.turn },
    executor: { id: observe(record.executor.id), version: observe(record.executor.version), protocolVersion: observe(record.executor.protocolVersion) },
    lineage: { parentSession: observe(record.lineage.parentSession), parentExecution: observe(record.lineage.parentExecution), rootExecution: observe(record.lineage.rootExecution) },
    provider: observe(record.provider), model: observe(record.model),
    time: { startedAt: observe(record.time.startedAt), endedAt: observe(record.time.endedAt) },
    result: observe(record.result), terminalReason: record.terminalReason, error: observe(record.error),
    usage: { inputTokens: observe(record.usage.inputTokens), outputTokens: observe(record.usage.outputTokens), totalTokens: observe(record.usage.totalTokens) },
    provenance: { source: 'registry-session-log', eventType: 'turn/end', terminalSeq: record.provenance.terminalSeq, registryVersion: record.provenance.registryVersion, dshVersion: record.provenance.dshVersion, sampleKind: record.provenance.sampleKind },
    evidenceCommitment: null, signature: null, policyVersion: null, redactionPolicyVersion: 'activity-summary-v1',
  };
}
