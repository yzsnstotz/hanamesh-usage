export interface AgentEvent {
    deviceId: string;
    hanaRef: string;
    action: 'use';
    occurredAt: string;
    eventId: string;
    nonce: string;
    channel: 'claude' | 'codex';
    feature: string;
    success: boolean;
}
/** C-USAGE proposed hm-agent-v1; old six-field signatures remain untouched. */
export declare function agentSigningJSON(e: AgentEvent): string;
export declare function agentEventForFact(deviceId: string, row: {
    factId: string;
    hanaRef: string;
    occurredAt: string;
    channel: 'claude' | 'codex';
    feature: string;
    success: boolean;
}): AgentEvent;
