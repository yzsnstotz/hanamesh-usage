import { ActivityError, missing, numberValue, object, sourceId, text } from './privacy.js';
export function eventReference(sessionId, turn) {
    sourceId(sessionId);
    if (!Number.isSafeInteger(turn) || turn < 0)
        throw new ActivityError('INVALID_TURN');
    return JSON.stringify([sessionId, 'turn/end', turn]);
}
/** Vocabulary translation only. Unknown/blocked/ceiling outcomes are NOT successes. */
export function terminalResult(reason) {
    const kind = object(reason).kind;
    let value;
    if (kind === 'completed')
        value = 'completed';
    else if (kind === 'error')
        value = 'failed';
    else if (kind === 'aborted' || kind === 'interrupted')
        value = 'interrupted';
    const known = ['completed', 'error', 'aborted', 'interrupted', 'blocked', 'max-tokens'];
    const terminalReason = (typeof kind === 'string' && known.includes(kind) ? kind : 'unsupported');
    return {
        result: value ? { state: 'reported', value, source: 'session.turn/end', rule: 'dsh-terminal-vocabulary-v1' } : missing('unsupported_terminal_reason'),
        terminalReason,
        error: kind === 'error' ? { state: 'reported', value: 'runtime_error_details_withheld', source: 'session.turn/end', rule: 'error-content-withheld-v1' } : missing('not_applicable'),
    };
}
/** Only public request/context metadata is used; mutable Agent.options is not execution history. */
function route(events, startSeq, endSeq) {
    let previous;
    const active = [];
    for (const event of events) {
        if (event.seq > endSeq)
            break;
        if (event.type !== 'request/context')
            continue;
        if (event.seq < startSeq)
            previous = event;
        else
            active.push(event);
    }
    if (previous)
        active.unshift(previous);
    if (active.length === 0)
        return { provider: missing('route_not_observed'), model: missing('route_not_observed') };
    const pairs = new Set(active.map(e => JSON.stringify([object(e.data).provider, object(e.data).model])));
    if (pairs.size !== 1)
        return { provider: missing('multiple_routes'), model: missing('multiple_routes') };
    const context = object(active[0]?.data);
    return { provider: text(context.provider, 'session.request/context'), model: text(context.model, 'session.request/context') };
}
export function projectTerminal(session, end) {
    const sid = sourceId(session.sessionId);
    if (end.type !== 'turn/end' || !Number.isSafeInteger(end.seq) || end.seq < session.inheritedEventCount)
        throw new ActivityError('NOT_OWN_TERMINAL');
    const data = object(end.data);
    if (typeof data.turn !== 'number')
        throw new ActivityError('INVALID_TURN');
    const ref = eventReference(sid, data.turn);
    const binding = session.binding;
    if (binding && binding.sessionId !== sid)
        throw new ActivityError('BINDING_ID_MISMATCH');
    const starts = session.events.filter(e => e.type === 'turn/start' && object(e.data).turn === data.turn && e.seq >= session.inheritedEventCount && e.seq < end.seq);
    const start = starts.at(-1);
    const ownedStart = start?.seq ?? session.inheritedEventCount;
    const usagePresent = session.events.some(e => e.seq >= ownedStart && e.seq <= end.seq && e.type === 'assistant/message' && object(e.data).turn === data.turn && object(e.data).usage !== undefined);
    // TokenUsage lives in dsh-llm, absent from the dispatch's public declarations.
    // Do not guess camelCase/snake_case token field names, invent totals or read stream payloads.
    const usageReason = usagePresent ? 'usage_contract_missing' : 'usage_not_reported';
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
        usage: { inputTokens: missing(usageReason), outputTokens: missing(usageReason), totalTokens: missing(usageReason) },
        provenance: { source: 'registry-session-log', eventType: 'turn/end', terminalSeq: end.seq, registryVersion: '0.1.0-rc.2', dshVersion: '0.1.5-alpha.1', sampleKind: session.sampleKind },
        evidenceCommitment: null, signature: null, policyVersion: null, redactionPolicyVersion: 'activity-summary-v1',
    };
}
