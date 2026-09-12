/** Safe residual: durable source without a summary. Never a summary with no source. */
export declare function commitAfterSource<T>(ensureSourceDurable: () => Promise<void>, commitSummary: () => Promise<T>): Promise<T>;
