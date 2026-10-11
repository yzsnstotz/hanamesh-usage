import { UsageError } from './privacy.js';

/** Local terminal-event retention; pending events are never evicted by age. */
export const DEFAULT_EVENT_RETENTION_DAYS = 90;
export const DEFAULT_QUERY_LIMIT = 100;
/** Existing public per-query ceiling, unchanged. */
export const MAX_QUERY_LIMIT = 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;
export function validateRetentionDays(days: number): void {
  if (!Number.isSafeInteger(days) || days < 1 || !Number.isSafeInteger(days * DAY_MS)) throw new UsageError('INVALID_RETENTION');
}
export function validateQueryLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_QUERY_LIMIT) throw new UsageError('INVALID_FILTER');
}
