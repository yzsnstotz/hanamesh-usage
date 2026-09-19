import { UsageError } from './privacy.js';
import { validateEvent, type UsageEvent, type UploadState } from './events.js';

export interface WithdrawalState {
  requestedAt: string;
  deviceId: string;
  state: 'pending' | 'sent' | 'offline';
  attempts: number;
  deletedEvents: number | null;
  lastError: string | null;
}
export interface InventoryItem { hanaRef: string; version: string; entryId: string; disabled: boolean }
export interface EventSnapshot {
  schemaVersion: 1;
  events: UsageEvent[];
  withdrawal: WithdrawalState | null;
  inventory: { last: { scannedAt: string; items: InventoryItem[] } | null };
}
export interface EventGlobalPort { get(): EventSnapshot; set(value: EventSnapshot): Promise<void> }

const terminal = new Set<UploadState>(['sent','duplicate','rejected']);
const retentionMs = 90 * 24 * 60 * 60 * 1000;
function identity(event: UsageEvent): string {
  return JSON.stringify([event.deviceId,event.hanaRef,event.action,event.occurredAt,event.source,event.sourcePlugin,event.evidenceRef]);
}
export function validateEventSnapshot(value: unknown): asserts value is EventSnapshot {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new UsageError('INVALID_EVENT_SNAPSHOT');
  const snapshot = value as Record<string, unknown>;
  if (Object.keys(snapshot).sort().join('|') !== ['schemaVersion','events','withdrawal','inventory'].sort().join('|') || snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.events)) throw new UsageError('INVALID_EVENT_SNAPSHOT');
  const ids = new Set<string>();
  for (const event of snapshot.events) { validateEvent(event); if (ids.has(event.eventId)) throw new UsageError('INVALID_EVENT_SNAPSHOT'); ids.add(event.eventId); }
  if (snapshot.withdrawal !== null && (typeof snapshot.withdrawal !== 'object' || Array.isArray(snapshot.withdrawal))) throw new UsageError('INVALID_EVENT_SNAPSHOT');
  if (snapshot.inventory === null || typeof snapshot.inventory !== 'object' || Array.isArray(snapshot.inventory) || !Object.hasOwn(snapshot.inventory,'last')) throw new UsageError('INVALID_EVENT_SNAPSHOT');
}

export class EventStore {
  private snapshot: EventSnapshot;
  private tail: Promise<void> = Promise.resolve();
  constructor(private readonly global: EventGlobalPort, private readonly maxEvents = 5000, private readonly now: () => number = Date.now) {
    if (!Number.isSafeInteger(maxEvents) || maxEvents < 1 || maxEvents > 100000) throw new UsageError('INVALID_CAPACITY');
    validateEventSnapshot(global.get());
    this.snapshot = structuredClone(global.get());
  }
  put(input: UsageEvent): Promise<'inserted'|'duplicate'> {
    validateEvent(input);
    let result: 'inserted'|'duplicate' = 'duplicate';
    const run = this.tail.then(async () => {
      const existing = this.snapshot.events.find(event => event.eventId === input.eventId);
      if (existing) {
        if (identity(existing) !== identity(input)) throw new UsageError('EVENT_IDENTITY_CONFLICT');
        result = 'duplicate'; return;
      }
      const cutoff = this.now() - retentionMs;
      const retained = this.snapshot.events.filter(event => !(terminal.has(event.upload.state) && event.upload.sentAt !== null && Date.parse(event.upload.sentAt) < cutoff));
      if (retained.length >= this.maxEvents) throw new UsageError('EVENTS_CAPACITY_REACHED');
      const next: EventSnapshot = { ...structuredClone(this.snapshot), events:[...retained, structuredClone(input)] };
      await this.global.set(next);
      this.snapshot = next;
      result = 'inserted';
    });
    this.tail = run.catch(() => {});
    return run.then(() => result);
  }
  query(filter: {state?: UploadState; limit?: number; after?: string} = {}): {total:number; events:UsageEvent[]} {
    if (filter.state !== undefined && !terminal.has(filter.state) && filter.state !== 'pending') throw new UsageError('INVALID_FILTER');
    const limit = filter.limit ?? 100;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new UsageError('INVALID_FILTER');
    let events = this.snapshot.events;
    if (filter.state !== undefined) events = events.filter(event => event.upload.state === filter.state);
    if (filter.after !== undefined) { const index = events.findIndex(event => event.eventId === filter.after); if (index < 0) throw new UsageError('INVALID_FILTER'); events = events.slice(index + 1); }
    return { total:events.length, events:structuredClone(events.slice(0,limit)) };
  }
  getSnapshot(): EventSnapshot { return structuredClone(this.snapshot); }
  async drain(): Promise<void> { await this.tail; }
}
