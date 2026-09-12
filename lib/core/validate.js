import { ActivityError, isObject, safeMetadata, sourceId } from './privacy.js';
import { eventReference } from './project.js';
function assert(value) { if (!value)
    throw new ActivityError('INVALID_DECLARATION'); }
function keys(value, names) {
    assert(isObject(value));
    assert(Object.keys(value).sort().join('|') === [...names].sort().join('|'));
}
const reasons = ['not_provided', 'redacted', 'binding_unavailable', 'execution_lineage_not_exposed', 'not_applicable', 'route_not_observed', 'multiple_routes', 'usage_not_reported', 'usage_contract_missing', 'unsupported_terminal_reason', 'invalid_value'];
const sources = ['registry.binding', 'session.header', 'session.turn/start', 'session.turn/end', 'session.request/context', 'session.assistant/message', 'synthetic.fixture'];
function obs(v, kind) {
    assert(isObject(v));
    if (v.state === 'unavailable') {
        keys(v, ['state', 'value', 'reason']);
        assert(v.value === null && reasons.includes(String(v.reason)));
        return;
    }
    keys(v, ['state', 'value', 'source', 'rule']);
    assert(v.state === 'reported' || v.state === 'estimated');
    assert(sources.includes(String(v.source)) && safeMetadata(v.rule));
    if (kind === 'number')
        assert(typeof v.value === 'number' && Number.isSafeInteger(v.value) && v.value >= 0);
    else if (kind === 'result')
        assert(['completed', 'failed', 'interrupted'].includes(String(v.value)) && v.state === 'reported');
    else
        assert(safeMetadata(v.value));
}
export function validateDeclaration(v) {
    keys(v, ['schemaVersion', 'eventRef', 'execution', 'executor', 'lineage', 'provider', 'model', 'time', 'result', 'terminalReason', 'error', 'usage', 'provenance', 'evidenceCommitment', 'signature', 'policyVersion', 'redactionPolicyVersion']);
    assert(v.schemaVersion === 1 && v.redactionPolicyVersion === 'activity-summary-v1');
    keys(v.execution, ['sessionId', 'turn']);
    assert(typeof v.execution.turn === 'number');
    assert(v.eventRef === eventReference(sourceId(v.execution.sessionId), v.execution.turn));
    keys(v.executor, ['id', 'version', 'protocolVersion']);
    for (const item of Object.values(v.executor))
        obs(item, 'text');
    keys(v.lineage, ['parentSession', 'parentExecution', 'rootExecution']);
    for (const item of Object.values(v.lineage))
        obs(item, 'text');
    obs(v.provider, 'text');
    obs(v.model, 'text');
    obs(v.result, 'result');
    obs(v.error, 'text');
    assert(['completed', 'error', 'aborted', 'interrupted', 'blocked', 'max-tokens', 'unsupported'].includes(String(v.terminalReason)));
    const result = v.result;
    const expected = v.terminalReason === 'completed' ? 'completed' : v.terminalReason === 'error' ? 'failed' : ['aborted', 'interrupted'].includes(String(v.terminalReason)) ? 'interrupted' : null;
    assert(expected === null ? result.state === 'unavailable' : result.state === 'reported' && result.value === expected);
    const error = v.error;
    assert(error.state === 'unavailable' || (v.terminalReason === 'error' && error.value === 'runtime_error_details_withheld'));
    keys(v.time, ['startedAt', 'endedAt']);
    obs(v.time.startedAt, 'number');
    obs(v.time.endedAt, 'number');
    const time = v.time;
    if (time.startedAt.state !== 'unavailable' && time.endedAt.state !== 'unavailable')
        assert(time.endedAt.value >= time.startedAt.value);
    keys(v.usage, ['inputTokens', 'outputTokens', 'totalTokens']);
    for (const item of Object.values(v.usage))
        obs(item, 'number');
    keys(v.provenance, ['source', 'eventType', 'terminalSeq', 'registryVersion', 'dshVersion', 'sampleKind']);
    assert(v.provenance.source === 'registry-session-log' && v.provenance.eventType === 'turn/end' && v.provenance.registryVersion === '0.1.0-rc.2' && v.provenance.dshVersion === '0.1.5-alpha.1');
    assert(typeof v.provenance.terminalSeq === 'number' && Number.isSafeInteger(v.provenance.terminalSeq) && v.provenance.terminalSeq >= 0);
    assert(['runtime_observation', 'synthetic'].includes(String(v.provenance.sampleKind)));
    assert(v.evidenceCommitment === null && v.signature === null && v.policyVersion === null);
}
export function validateSnapshot(value) {
    keys(value, ['schemaVersion', 'records']);
    assert(value.schemaVersion === 1 && Array.isArray(value.records));
    const identities = new Set();
    for (const record of value.records) {
        validateDeclaration(record);
        assert(!identities.has(record.eventRef));
        identities.add(record.eventRef);
    }
}
export function isSnapshot(value) {
    try {
        validateSnapshot(value);
        return true;
    }
    catch {
        return false;
    }
}
