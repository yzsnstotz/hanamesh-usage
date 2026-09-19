function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map(key => [key, normalize((value as Record<string, unknown>)[key])]));
  }
  if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('NON_FINITE_CANONICAL_NUMBER');
  return value;
}

export function canonicalJSON(input: Record<string, unknown>): string {
  return JSON.stringify(normalize(input));
}
