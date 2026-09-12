import type { Declaration, Filter, GlobalPort, QueryResult } from './types.js';
import { ActivityError, exportProjection } from './privacy.js';
import { queryRecords } from './query.js';
import { validateDeclaration, validateSnapshot } from './validate.js';

/** Single-writer, single-domain projection. Counters are derived, never separately committed. */
export class ActivityStore {
  private tail: Promise<void> = Promise.resolve();
  private closed = false;
  constructor(private readonly global: GlobalPort, private readonly maxRecords = 5000) {
    if (!Number.isSafeInteger(maxRecords) || maxRecords < 1 || maxRecords > 100000) throw new ActivityError('INVALID_CAPACITY');
    validateSnapshot(global.get());
  }
  put(value: Declaration): Promise<'inserted' | 'duplicate'> {
    if (this.closed) return Promise.reject(new ActivityError('STORE_CLOSED'));
    validateDeclaration(value);
    const input = structuredClone(value); // Take ownership before any asynchronous work.
    const task = this.tail.then(async () => {
      const snapshot = this.global.get();
      validateSnapshot(snapshot);
      const existing = snapshot.records.find(r => r.eventRef === input.eventRef);
      if (existing) {
        if (existing.provenance.terminalSeq !== input.provenance.terminalSeq || existing.terminalReason !== input.terminalReason || JSON.stringify(existing.executor) !== JSON.stringify(input.executor)) throw new ActivityError('SOURCE_IDENTITY_CONFLICT');
        return 'duplicate' as const; // Immutable first observation; replay is not new usage.
      }
      if (snapshot.records.length >= this.maxRecords) throw new ActivityError('CAPACITY_REACHED');
      // ONE global.set publishes the record and its deduplication identity together.
      await this.global.set({ schemaVersion: 1, records: [...snapshot.records, input] });
      return 'inserted' as const;
    });
    this.tail = task.then(() => undefined, () => undefined);
    return task;
  }
  query(filter: Filter = {}): QueryResult {
    if (this.closed) throw new ActivityError('STORE_CLOSED');
    const snapshot = this.global.get(); validateSnapshot(snapshot);
    return queryRecords(snapshot.records, filter);
  }
  export(filter: Filter = {}): QueryResult {
    const result = this.query(filter);
    return { ...result, records: result.records.map(exportProjection) };
  }
  async drain(): Promise<void> { await this.tail; }
  async close(): Promise<void> { this.closed = true; await this.tail; }
}
