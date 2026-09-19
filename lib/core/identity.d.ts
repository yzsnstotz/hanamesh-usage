export declare function eventIdForSession(deviceId: string, sessionId: string, turn: number): string;
export declare function eventIdForLoader(deviceId: string, action: 'install' | 'uninstall', hanaRef: string, version: string): string;
export declare function eventIdForSeat(deviceId: string, sourcePlugin: string, idempotencyKey: string): string;
