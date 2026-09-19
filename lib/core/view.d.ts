import type { QueryResult } from './types.js';
import type { UsageEvent } from './events.js';
export declare function escapeHtml(value: unknown): string;
/** Server-rendered, script-free local review view. */
export declare function renderUsage(query: QueryResult, eventQuery?: {
    total: number;
    events: UsageEvent[];
}, health?: Record<string, unknown>): string;
