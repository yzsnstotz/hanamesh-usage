export declare function eventIdForSession(deviceId: string, sessionId: string, turn: number): string;
export declare function eventIdForLoader(deviceId: string, action: 'install' | 'uninstall', hanaRef: string, version: string): string;
export declare function eventIdForSeat(deviceId: string, sourcePlugin: string, idempotencyKey: string): string;
/** Event nonce is identity-scoped, not a request authentication nonce. Same fact,
 * independent buffers: same nonce. Different event id: separate nonce. */
export declare function eventNonceForSeat(eventId: string): string;
