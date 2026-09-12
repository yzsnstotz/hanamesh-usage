import type { Declaration, EventObservation, SessionObservation } from './types.js';
export declare function eventReference(sessionId: string, turn: number): string;
/** Vocabulary translation only. Unknown/blocked/ceiling outcomes are NOT successes. */
export declare function terminalResult(reason: unknown): Pick<Declaration, 'result' | 'terminalReason' | 'error'>;
export declare function projectTerminal(session: SessionObservation, end: EventObservation): Declaration;
