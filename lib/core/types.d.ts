/** Client usage declaration v1. No host/framework imports in this public DTO. */
export type ValueState = 'reported' | 'estimated' | 'unavailable';
export type ResultState = 'completed' | 'failed' | 'interrupted';
export type RemoteState = 'unknown' | 'stale' | 'revoked' | 'unreachable';
export type ValueSource = 'registry.binding' | 'session.header' | 'session.turn/start' | 'session.turn/end' | 'session.request/context' | 'session.assistant/message' | 'synthetic.fixture';
export type MissingReason = 'not_provided' | 'redacted' | 'binding_unavailable' | 'execution_lineage_not_exposed' | 'not_applicable' | 'route_not_observed' | 'multiple_routes' | 'usage_not_reported' | 'usage_contract_missing' | 'unsupported_terminal_reason' | 'invalid_value';
export type Observation<T> = {
    state: 'reported' | 'estimated';
    value: T;
    source: ValueSource;
    rule: string;
} | {
    state: 'unavailable';
    value: null;
    reason: MissingReason;
};
export interface Usage {
    inputTokens: Observation<number>;
    outputTokens: Observation<number>;
    totalTokens: Observation<number>;
}
export interface Declaration {
    schemaVersion: 1;
    /** Derived from the owning session + turn, never a newly generated execution ID. */
    eventRef: string;
    execution: {
        sessionId: string;
        turn: number;
    };
    executor: {
        id: Observation<string>;
        version: Observation<string>;
        protocolVersion: Observation<string>;
    };
    lineage: {
        parentSession: Observation<string>;
        parentExecution: Observation<string>;
        rootExecution: Observation<string>;
    };
    provider: Observation<string>;
    model: Observation<string>;
    time: {
        startedAt: Observation<number>;
        endedAt: Observation<number>;
    };
    result: Observation<ResultState>;
    terminalReason: 'completed' | 'error' | 'aborted' | 'interrupted' | 'blocked' | 'max-tokens' | 'unsupported';
    /** Only fixed, non-content-bearing error summaries, never raw exception text. */
    error: Observation<string>;
    usage: Usage;
    provenance: {
        source: 'registry-session-log';
        eventType: 'turn/end';
        terminalSeq: number;
        /** The Registry version this record was observed under (recorded, not asserted). */
        registryVersion: string;
        dshVersion: '0.1.5-alpha.1';
        sampleKind: 'runtime_observation' | 'synthetic';
    };
    /** Reserved for later protocol owners; v1 neither populates nor verifies them. */
    evidenceCommitment: null;
    signature: null;
    policyVersion: null;
    redactionPolicyVersion: 'activity-summary-v1';
}
export interface Snapshot {
    schemaVersion: 1;
    records: Declaration[];
}
export interface GlobalPort {
    get(): Snapshot;
    /** MUST resolve only after one complete single-layout snapshot is durable. */
    set(value: Snapshot): Promise<void>;
}
/** Minimal observation input, not a redefinition of any DSH package interface. */
export interface EventObservation {
    type: string;
    seq: number;
    time: number;
    data: unknown;
}
export interface BindingObservation {
    sessionId: string;
    runtime: string;
    driverVersion: string;
    protocolVersion?: string;
}
export interface SessionObservation {
    sessionId: string;
    inheritedEventCount: number;
    events: readonly EventObservation[];
    parentSession?: string;
    binding?: BindingObservation;
    sampleKind: 'runtime_observation' | 'synthetic';
}
export interface Filter {
    executor?: string;
    from?: number;
    to?: number;
    result?: ResultState | 'unavailable';
    source?: 'registry-session-log';
    quality?: ValueState;
    offset?: number;
    limit?: number;
}
export interface Bucket {
    sum: number | null;
    count: number;
}
export interface MetricTotal {
    reported: Bucket;
    estimated: Bucket;
    unavailable: number;
}
export interface QueryResult {
    total: number;
    records: Declaration[];
    aggregate: {
        inputTokens: MetricTotal;
        outputTokens: MetricTotal;
        totalTokens: MetricTotal;
    };
}
