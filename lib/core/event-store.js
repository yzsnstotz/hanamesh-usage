import { UsageError } from './privacy.js';
import { validateEvent } from './events.js';
const terminal = new Set(['sent', 'duplicate', 'rejected']);
const retentionMs = 90 * 24 * 60 * 60 * 1000;
function identity(event) {
    return JSON.stringify([event.deviceId, event.hanaRef, event.action, event.occurredAt, event.source, event.sourcePlugin, event.evidenceRef]);
}
export function validateEventSnapshot(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        throw new UsageError('INVALID_EVENT_SNAPSHOT');
    const snapshot = value;
    if (Object.keys(snapshot).sort().join('|') !== ['schemaVersion', 'events', 'withdrawal', 'inventory'].sort().join('|') || snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.events))
        throw new UsageError('INVALID_EVENT_SNAPSHOT');
    const ids = new Set();
    for (const event of snapshot.events) {
        validateEvent(event);
        if (ids.has(event.eventId))
            throw new UsageError('INVALID_EVENT_SNAPSHOT');
        ids.add(event.eventId);
    }
    if (snapshot.withdrawal !== null && (typeof snapshot.withdrawal !== 'object' || Array.isArray(snapshot.withdrawal)))
        throw new UsageError('INVALID_EVENT_SNAPSHOT');
    if (snapshot.inventory === null || typeof snapshot.inventory !== 'object' || Array.isArray(snapshot.inventory) || !Object.hasOwn(snapshot.inventory, 'last'))
        throw new UsageError('INVALID_EVENT_SNAPSHOT');
}
export class EventStore {
    global;
    maxEvents;
    now;
    snapshot;
    tail = Promise.resolve();
    constructor(global, maxEvents = 5000, now = Date.now) {
        this.global = global;
        this.maxEvents = maxEvents;
        this.now = now;
        if (!Number.isSafeInteger(maxEvents) || maxEvents < 1 || maxEvents > 100000)
            throw new UsageError('INVALID_CAPACITY');
        validateEventSnapshot(global.get());
        this.snapshot = structuredClone(global.get());
    }
    put(input) {
        validateEvent(input);
        let result = 'duplicate';
        const run = this.tail.then(async () => {
            const existing = this.snapshot.events.find(event => event.eventId === input.eventId);
            if (existing) {
                if (identity(existing) !== identity(input))
                    throw new UsageError('EVENT_IDENTITY_CONFLICT');
                result = 'duplicate';
                return;
            }
            const cutoff = this.now() - retentionMs;
            const retained = this.snapshot.events.filter(event => !(terminal.has(event.upload.state) && event.upload.sentAt !== null && Date.parse(event.upload.sentAt) < cutoff));
            if (retained.length >= this.maxEvents)
                throw new UsageError('EVENTS_CAPACITY_REACHED');
            const next = { ...structuredClone(this.snapshot), events: [...retained, structuredClone(input)] };
            await this.global.set(next);
            this.snapshot = next;
            result = 'inserted';
        });
        this.tail = run.catch(() => { });
        return run.then(() => result);
    }
    query(filter = {}) {
        if (filter.state !== undefined && !terminal.has(filter.state) && filter.state !== 'pending')
            throw new UsageError('INVALID_FILTER');
        const limit = filter.limit ?? 100;
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
            throw new UsageError('INVALID_FILTER');
        let events = this.snapshot.events;
        if (filter.state !== undefined)
            events = events.filter(event => event.upload.state === filter.state);
        if (filter.after !== undefined) {
            const index = events.findIndex(event => event.eventId === filter.after);
            if (index < 0)
                throw new UsageError('INVALID_FILTER');
            events = events.slice(index + 1);
        }
        return { total: events.length, events: structuredClone(events.slice(0, limit)) };
    }
    getSnapshot() { return structuredClone(this.snapshot); }
    async drain() { await this.tail; }
}
