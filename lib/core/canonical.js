function normalize(value) {
    if (Array.isArray(value))
        return value.map(normalize);
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])]));
    }
    if (typeof value === 'number' && !Number.isFinite(value))
        throw new TypeError('NON_FINITE_CANONICAL_NUMBER');
    return value;
}
/** O1 usage server signing input (hanamesh-server-usage docs/API.md): keys strictly in this order, only the six signed fields. */
export function signingJSON(event) {
    return JSON.stringify({ deviceId: event.deviceId, hanaRef: event.hanaRef, action: event.action, occurredAt: event.occurredAt, eventId: event.eventId, nonce: event.nonce });
}
export function canonicalJSON(input) {
    return JSON.stringify(normalize(input));
}
