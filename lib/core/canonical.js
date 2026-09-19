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
export function canonicalJSON(input) {
    return JSON.stringify(normalize(input));
}
