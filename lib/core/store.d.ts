import type { Declaration, Filter, GlobalPort, QueryResult } from './types.js';
/** Single-writer, single-domain projection. Counters are derived, never separately committed. */
export declare class UsageStore {
    private readonly global;
    private readonly maxRecords;
    private tail;
    private closed;
    constructor(global: GlobalPort, maxRecords?: number);
    put(value: Declaration): Promise<'inserted' | 'duplicate'>;
    query(filter?: Filter): QueryResult;
    export(filter?: Filter): QueryResult;
    drain(): Promise<void>;
    close(): Promise<void>;
}
