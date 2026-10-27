export interface AgentEvent {
    deviceId: string;
    hanaRef: string;
    action: 'install' | 'use';
    occurredAt: string;
    eventId: string;
    nonce: string;
    channel: 'claude' | 'codex';
    feature: string;
    success: boolean | null;
}
/** C-USAGE proposed hm-agent-v1; old six-field signatures remain untouched. */
export declare function agentSigningJSON(e: AgentEvent): string;
export declare function agentEventForFact(deviceId: string, row: {
    factId: string;
    hanaRef: string;
    occurredAt: string;
    channel: 'claude' | 'codex';
    feature: string;
    success: boolean | null;
}, consentId: string): AgentEvent;
/** One install fact per device/Hana across Claude/Codex. Outcome and original call time are never invented. */
export declare function agentInstallEventForFact(deviceId: string, row: {
    hanaRef: string;
    occurredAt: string;
    channel: 'claude' | 'codex';
    feature: string;
    success: boolean | null;
}, consentId: string): AgentEvent;
