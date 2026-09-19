import { UsageError, exportProjection } from './privacy.js';
import { queryRecords } from './query.js';
import { validateDeclaration, validateSnapshot } from './validate.js';
/** Single-writer, single-domain projection. Counters are derived, never separately committed. */
export class UsageStore {
    global;
    maxRecords;
    tail = Promise.resolve();
    closed = false;
    constructor(global, maxRecords = 5000) {
        this.global = global;
        this.maxRecords = maxRecords;
        if (!Number.isSafeInteger(maxRecords) || maxRecords < 1 || maxRecords > 100000)
            throw new UsageError('INVALID_CAPACITY');
        validateSnapshot(global.get());
    }
    put(value) {
        if (this.closed)
            return Promise.reject(new UsageError('STORE_CLOSED'));
        validateDeclaration(value);
        const input = structuredClone(value); // Take ownership before any asynchronous work.
        const task = this.tail.then(async () => {
            const snapshot = this.global.get();
            validateSnapshot(snapshot);
            const existing = snapshot.records.find(r => r.eventRef === input.eventRef);
            if (existing) {
                if (existing.provenance.terminalSeq !== input.provenance.terminalSeq || existing.terminalReason !== input.terminalReason || JSON.stringify(existing.executor) !== JSON.stringify(input.executor))
                    throw new UsageError('SOURCE_IDENTITY_CONFLICT');
                return 'duplicate'; // Immutable first observation; replay is not new usage.
            }
            if (snapshot.records.length >= this.maxRecords)
                throw new UsageError('CAPACITY_REACHED');
            // ONE global.set publishes the record and its deduplication identity together.
            await this.global.set({ schemaVersion: 1, records: [...snapshot.records, input] });
            return 'inserted';
        });
        this.tail = task.then(() => undefined, () => undefined);
        return task;
    }
    query(filter = {}) {
        if (this.closed)
            throw new UsageError('STORE_CLOSED');
        const snapshot = this.global.get();
        validateSnapshot(snapshot);
        return queryRecords(snapshot.records, filter);
    }
    export(filter = {}) {
        const result = this.query(filter);
        return { ...result, records: result.records.map(exportProjection) };
    }
    async drain() { await this.tail; }
    async close() { this.closed = true; await this.tail; }
}
