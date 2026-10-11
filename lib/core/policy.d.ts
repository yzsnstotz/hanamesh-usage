/** Local terminal-event retention; pending events are never evicted by age. */
export declare const DEFAULT_EVENT_RETENTION_DAYS = 90;
export declare const DEFAULT_QUERY_LIMIT = 100;
/** Existing public per-query ceiling, unchanged. */
export declare const MAX_QUERY_LIMIT = 1000;
export declare const DAY_MS: number;
export declare function validateRetentionDays(days: number): void;
export declare function validateQueryLimit(limit: number): void;
