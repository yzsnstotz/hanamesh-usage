import type { Declaration, EventObservation, Observation, ResultState, SessionObservation } from './types.js';
import { DSH_VERSION, REGISTRY_VERSION } from './pins.js';
import type { TokenUsage } from '@deepseek-ai/dsh-llm';
import { ActivityError, missing, numberValue, object, sourceId, text } from './privacy.js';

export function eventReference(sessionId: string, turn: number): string {
  sourceId(sessionId);
  if (!Number.isSafeInteger(turn) || turn < 0) throw new ActivityError('INVALID_TURN');
  return JSON.stringify([sessionId, 'turn/end', turn]);
}
/** Vocabulary translation only. Unknown/blocked/ceiling outcomes are NOT successes. */
export function terminalResult(reason: unknown): Pick<Declaration, 'result' | 'terminalReason' | 'error'> {
  const kind = object(reason).kind;
  let value: ResultState | undefined;
  if (kind === 'completed') value = 'completed';
  else if (kind === 'error') value = 'failed';
  else if (kind === 'aborted' || kind === 'interrupted') value = 'interrupted';
  const known = ['completed', 'error', 'aborted', 'interrupted', 'blocked', 'max-tokens'];
  const terminalReason = (typeof kind === 'string' && known.includes(kind) ? kind : 'unsupported') as Declaration['terminalReason'];
  return {
    result: value ? { state: 'reported', value, source: 'session.turn/end', rule: 'dsh-terminal-vocabulary-v1' } : missing('unsupported_terminal_reason'),
    terminalReason,
    error: kind === 'error' ? { state: 'reported', value: 'runtime_error_details_withheld', source: 'session.turn/end', rule: 'error-content-withheld-v1' } : missing('not_applicable'),
  };
}

/** Only public request/context metadata is used; mutable Agent.options is not execution history. */
function route(events: readonly EventObservation[], startSeq: number, endSeq: number): { provider: Observation<string>; model: Observation<string> } {
  let previous: EventObservation | undefined;
  const active: EventObservation[] = [];
  for (const event of events) {
    if (event.seq > endSeq) break;
    if (event.type !== 'request/context') continue;
    if (event.seq < startSeq) previous = event;
    else active.push(event);
  }
  if (previous) active.unshift(previous);
  if (active.length === 0) return { provider: missing('route_not_observed'), model: missing('route_not_observed') };
  const pairs = new Set(active.map(e => JSON.stringify([object(e.data).provider, object(e.data).model])));
  if (pairs.size !== 1) return { provider: missing('multiple_routes'), model: missing('multiple_routes') };
  const context = object(active[0]?.data);
  return { provider: text(context.provider, 'session.request/context'), model: text(context.model, 'session.request/context') };
}

/** Each assistant/message is one completed provider call in the pinned DSH contract. */
function tokenUsage(events: readonly EventObservation[], startSeq: number, endSeq: number, turn: number): Declaration['usage'] {
  const payloads = events.filter(e => e.seq >= startSeq && e.seq <= endSeq && e.type === 'assistant/message'
    && object(e.data).turn === turn && object(e.data).usage !== undefined).map(e => object(e.data).usage);
  if (payloads.length === 0) return { inputTokens: missing('usage_not_reported'), outputTokens: missing('usage_not_reported'), totalTokens: missing('usage_not_reported') };
  const fields = ['inputTokens','outputTokens','totalTokens'] as const satisfies readonly (keyof TokenUsage)[];
  const sum = (field: typeof fields[number]): Observation<number> => {
    let total = 0;
    for (const payload of payloads) {
      const value = object(payload)[field];
      if (field === 'totalTokens' && value === undefined) return missing('not_provided');
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || !Number.isSafeInteger(total + value)) return missing('invalid_value');
      total += value;
    }
    return numberValue(total, 'reported', 'session.assistant/message', 'dsh-token-usage-sum-v1');
  };
  return { inputTokens: sum('inputTokens'), outputTokens: sum('outputTokens'), totalTokens: sum('totalTokens') };
}

export function projectTerminal(session: SessionObservation, end: EventObservation): Declaration {
  const sid = sourceId(session.sessionId);
  if (end.type !== 'turn/end' || !Number.isSafeInteger(end.seq) || end.seq < session.inheritedEventCount) throw new ActivityError('NOT_OWN_TERMINAL');
  const data = object(end.data);
  if (typeof data.turn !== 'number') throw new ActivityError('INVALID_TURN');
  const ref = eventReference(sid, data.turn);
  const binding = session.binding;
  if (binding && binding.sessionId !== sid) throw new ActivityError('BINDING_ID_MISMATCH');
  const starts = session.events.filter(e => e.type === 'turn/start' && object(e.data).turn === data.turn && e.seq >= session.inheritedEventCount && e.seq < end.seq);
  const start = starts.at(-1);
  const ownedStart = start?.seq ?? session.inheritedEventCount;
  const usage = tokenUsage(session.events, ownedStart, end.seq, data.turn);
  return {
    schemaVersion: 1, eventRef: ref, execution: { sessionId: sid, turn: data.turn },
    executor: {
      id: binding ? text(binding.runtime, 'registry.binding') : missing('binding_unavailable'),
      version: binding ? text(binding.driverVersion, 'registry.binding') : missing('binding_unavailable'),
      protocolVersion: binding ? text(binding.protocolVersion, 'registry.binding') : missing('binding_unavailable'),
    },
    lineage: {
      parentSession: text(session.parentSession, 'session.header', 'not_applicable'),
      parentExecution: missing(session.parentSession ? 'execution_lineage_not_exposed' : 'not_applicable'),
      rootExecution: missing(session.parentSession ? 'execution_lineage_not_exposed' : 'not_applicable'),
    },
    ...route(session.events, ownedStart, end.seq),
    time: { startedAt: start ? numberValue(start.time, 'reported', 'session.turn/start', 'unix-epoch-ms') : missing('not_provided'), endedAt: numberValue(end.time, 'reported', 'session.turn/end', 'unix-epoch-ms') },
    ...terminalResult(data.reason),
    usage,
    provenance: { source: 'registry-session-log', eventType: 'turn/end', terminalSeq: end.seq, registryVersion: REGISTRY_VERSION, dshVersion: DSH_VERSION, sampleKind: session.sampleKind },
    evidenceCommitment: null, signature: null, policyVersion: null, redactionPolicyVersion: 'activity-summary-v1',
  };
}
