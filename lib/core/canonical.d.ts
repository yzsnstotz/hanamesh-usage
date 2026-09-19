/** O1 usage server signing input (hanamesh-server-usage docs/API.md): keys strictly in this order, only the six signed fields. */
export declare function signingJSON(event: {
    deviceId: string;
    hanaRef: string;
    action: string;
    occurredAt: string;
    eventId: string;
    nonce: string;
}): string;
export declare function canonicalJSON(input: Record<string, unknown>): string;
