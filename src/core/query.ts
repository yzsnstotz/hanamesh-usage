import type { Declaration, Filter, MetricTotal, Observation, QueryResult, RemoteState } from './types.js';
import { ActivityError } from './privacy.js';

export function metricTotal(values: readonly Observation<number>[]): MetricTotal {
  const result: MetricTotal = { reported: { sum: null, count: 0 }, estimated: { sum: null, count: 0 }, unavailable: 0 };
  for (const value of values) {
    if (value.state === 'unavailable') { result.unavailable += 1; continue; }
    const bucket = result[value.state];
    const sum = (bucket.sum ?? 0) + value.value;
    if (!Number.isSafeInteger(sum)) throw new ActivityError('AGGREGATE_OVERFLOW');
    bucket.sum = sum; bucket.count += 1;
  }
  return result;
}
export function validateFilter(filter: Filter): void {
  if (Object.keys(filter).some(k => !['executor','from','to','result','source','quality','offset','limit'].includes(k))) throw new ActivityError('INVALID_FILTER');
  if (filter.executor !== undefined && (typeof filter.executor !== 'string' || filter.executor.length > 160)) throw new ActivityError('INVALID_FILTER');
  for (const value of [filter.from,filter.to,filter.offset,filter.limit]) if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) throw new ActivityError('INVALID_FILTER');
  if (filter.limit !== undefined && (filter.limit < 1 || filter.limit > 1000)) throw new ActivityError('INVALID_FILTER');
  if (filter.from !== undefined && filter.to !== undefined && filter.from > filter.to) throw new ActivityError('INVALID_FILTER');
  if (filter.result !== undefined && !['completed','failed','interrupted','unavailable'].includes(filter.result)) throw new ActivityError('INVALID_FILTER');
  if (filter.quality !== undefined && !['reported','estimated','unavailable'].includes(filter.quality)) throw new ActivityError('INVALID_FILTER');
  if (filter.source !== undefined && filter.source !== 'registry-session-log') throw new ActivityError('INVALID_FILTER');
}
export function queryRecords(records: readonly Declaration[], filter: Filter = {}): QueryResult {
  validateFilter(filter);
  const matched = records.filter(r => {
    const end = r.time.endedAt;
    if (filter.executor !== undefined && (r.executor.id.state === 'unavailable' || r.executor.id.value !== filter.executor)) return false;
    if (filter.result !== undefined && (r.result.state === 'unavailable' ? 'unavailable' : r.result.value) !== filter.result) return false;
    if (filter.source !== undefined && r.provenance.source !== filter.source) return false;
    if (filter.quality !== undefined && !Object.values(r.usage).some(v => v.state === filter.quality)) return false;
    if (filter.from !== undefined && (end.state === 'unavailable' || end.value < filter.from)) return false;
    if (filter.to !== undefined && (end.state === 'unavailable' || end.value > filter.to)) return false;
    return true;
  }).sort((a,b) => {
    const av = a.time.endedAt.state === 'unavailable' ? -1 : a.time.endedAt.value;
    const bv = b.time.endedAt.state === 'unavailable' ? -1 : b.time.endedAt.value;
    return bv - av || a.eventRef.localeCompare(b.eventRef);
  });
  const offset = filter.offset ?? 0;
  return {
    total: matched.length,
    records: structuredClone(matched.slice(offset, offset + (filter.limit ?? 100))),
    aggregate: {
      inputTokens: metricTotal(matched.map(r => r.usage.inputTokens)),
      outputTokens: metricTotal(matched.map(r => r.usage.outputTokens)),
      totalTokens: metricTotal(matched.map(r => r.usage.totalTokens)),
    },
  };
}
export function formatObservation(value: Observation<unknown>): string {
  if (value.state === 'unavailable') return `— unavailable (${value.reason})`;
  return `${String(value.value)} ${value.state}`;
}
export function remoteLabel(state: RemoteState): string {
  const labels: Record<RemoteState,string> = { unknown: 'unknown · 未知', stale: 'stale · 已过期', revoked: 'revoked · 已撤回', unreachable: 'unreachable · 无法连接' };
  if (!Object.hasOwn(labels, state)) throw new ActivityError('INVALID_REMOTE_STATE');
  return labels[state];
}
