import { UsageError } from './privacy.js';
import { safeMetadata } from './privacy.js';
import { validateEvent } from './events.js';
import { DEFAULT_EVENT_RETENTION_DAYS, DEFAULT_QUERY_LIMIT, DAY_MS, validateRetentionDays, validateQueryLimit } from './policy.js';
const terminal = new Set(['sent', 'duplicate', 'rejected']);
/** 去重身份：rc.7 起把归因两字段与回执纳入；同 eventId 不同归因/回执是 EVENT_IDENTITY_CONFLICT。 */
function identity(event) {
    const receipt = event.receipt ?? null;
    return JSON.stringify([event.deviceId, event.hanaRef, event.action, event.occurredAt, event.source, event.sourcePlugin, event.evidenceRef, event.sourceHanaRef, event.targetRef, receipt === null ? null : [receipt.providerId, receipt.model, receipt.count]]);
}
function validIso(value) { const time = typeof value === 'string' ? Date.parse(value) : NaN; return Number.isFinite(time) && new Date(time).toISOString() === value; }
/** Public Core identities are hashes, not prose/credential metadata. The full
 * canonical base64url alphabet includes leading '-'/'_' and secret-like hash
 * substrings. Keep previously admitted local fixture identifiers unchanged. */
function validDeviceId(value) {
    return typeof value === 'string' && (/^[A-Za-z0-9_-]{43}$/.test(value)
        && Buffer.from(value, 'base64url').toString('base64url') === value || safeMetadata(value));
}
function validateWithdrawal(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        throw new UsageError('INVALID_EVENT_SNAPSHOT');
    const item = value;
    if (Object.keys(item).sort().join('|') !== ['requestedAt', 'deviceId', 'state', 'attempts', 'deletedEvents', 'lastError'].sort().join('|') || !validIso(item.requestedAt) || !validDeviceId(item.deviceId) || !['pending', 'sent', 'offline', 'unconfirmed'].includes(String(item.state)) || !Number.isSafeInteger(item.attempts) || Number(item.attempts) < 0 || (item.deletedEvents !== null && (!Number.isSafeInteger(item.deletedEvents) || Number(item.deletedEvents) < 0)) || (item.lastError !== null && !safeMetadata(item.lastError)))
        throw new UsageError('INVALID_EVENT_SNAPSHOT');
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
    if (snapshot.withdrawal !== null)
        validateWithdrawal(snapshot.withdrawal);
    if (snapshot.inventory === null || typeof snapshot.inventory !== 'object' || Array.isArray(snapshot.inventory) || !Object.hasOwn(snapshot.inventory, 'last'))
        throw new UsageError('INVALID_EVENT_SNAPSHOT');
}
export class EventStore {
    global;
    maxEvents;
    now;
    eventRetentionDays;
    queryLimit;
    snapshot;
    tail = Promise.resolve();
    constructor(global, maxEvents = 5000, now = Date.now, eventRetentionDays = DEFAULT_EVENT_RETENTION_DAYS, queryLimit = DEFAULT_QUERY_LIMIT) {
        this.global = global;
        this.maxEvents = maxEvents;
        this.now = now;
        this.eventRetentionDays = eventRetentionDays;
        this.queryLimit = queryLimit;
        validateRetentionDays(eventRetentionDays);
        validateQueryLimit(queryLimit);
        if (!Number.isSafeInteger(maxEvents) || maxEvents < 1 || maxEvents > 100000)
            throw new UsageError('INVALID_CAPACITY');
        validateEventSnapshot(global.get());
        this.snapshot = structuredClone(global.get());
    }
    async commit(next) {
        validateEventSnapshot(next);
        await this.global.set(next);
        this.snapshot = next;
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
            const cutoff = this.now() - this.eventRetentionDays * DAY_MS;
            const retained = this.snapshot.events.filter(event => !(terminal.has(event.upload.state) && event.upload.sentAt !== null && Date.parse(event.upload.sentAt) < cutoff));
            if (retained.length >= this.maxEvents)
                throw new UsageError('EVENTS_CAPACITY_REACHED');
            const next = { ...structuredClone(this.snapshot), events: [...retained, structuredClone(input)] };
            await this.commit(next);
            result = 'inserted';
        });
        this.tail = run.catch(() => { });
        return run.then(() => result);
    }
    signPending(signer) {
        let count = 0;
        const run = this.tail.then(async () => {
            const events = this.snapshot.events.map(event => {
                if (event.upload.state !== 'pending' || event.signature !== null)
                    return structuredClone(event);
                const signed = signer(structuredClone(event));
                validateEvent(signed);
                if (identity(signed) !== identity(event) || signed.eventId !== event.eventId || signed.nonce !== event.nonce || signed.upload.state !== event.upload.state || signed.signature === null)
                    throw new UsageError('CORE_SIGNATURE_INVALID');
                count++;
                return structuredClone(signed);
            });
            if (count > 0)
                await this.commit({ ...structuredClone(this.snapshot), events });
        });
        this.tail = run.catch(() => { });
        return run.then(() => count);
    }
    updateInventory(scannedAt, items, inputs) {
        const inserted = [];
        let duplicates = 0;
        const run = this.tail.then(async () => {
            if (!validIso(scannedAt))
                throw new UsageError('INVALID_INVENTORY');
            const seenItems = new Set();
            for (const item of items) {
                if (item === null || typeof item !== 'object' || Object.keys(item).sort().join('|') !== ['hanaRef', 'version', 'entryId', 'disabled'].sort().join('|') || typeof item.hanaRef !== 'string' || !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(item.hanaRef) || typeof item.version !== 'string' || !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(item.version) || !safeMetadata(item.entryId) || typeof item.disabled !== 'boolean' || seenItems.has(item.entryId))
                    throw new UsageError('INVALID_INVENTORY');
                seenItems.add(item.entryId);
            }
            const cutoff = this.now() - this.eventRetentionDays * DAY_MS;
            const events = this.snapshot.events.filter(event => !(terminal.has(event.upload.state) && event.upload.sentAt !== null && Date.parse(event.upload.sentAt) < cutoff));
            for (const input of inputs) {
                validateEvent(input);
                const existing = events.find(event => event.eventId === input.eventId);
                if (existing) {
                    if (identity(existing) !== identity(input))
                        throw new UsageError('EVENT_IDENTITY_CONFLICT');
                    duplicates++;
                    continue;
                }
                if (events.length >= this.maxEvents)
                    throw new UsageError('EVENTS_CAPACITY_REACHED');
                events.push(structuredClone(input));
                inserted.push(input.eventId);
            }
            const next = { ...structuredClone(this.snapshot), events, inventory: { last: { scannedAt, items: structuredClone(items) } } };
            await this.commit(next);
        });
        this.tail = run.catch(() => { });
        return run.then(() => ({ inserted, duplicates }));
    }
    applyUpload(eventIds, result, sentAt) {
        const run = this.tail.then(async () => {
            if (!validIso(sentAt) || !Number.isSafeInteger(result.accepted) || result.accepted < 0 || !Number.isSafeInteger(result.duplicates) || result.duplicates < 0 || result.durability !== 'committed' || !Array.isArray(result.rejected) || new Set(eventIds).size !== eventIds.length)
                throw new UsageError('INVALID_UPLOAD_RESULT');
            const rejected = new Map();
            for (const item of result.rejected) {
                if (!item || typeof item !== 'object' || !eventIds.includes(item.eventId) || rejected.has(item.eventId) || !safeMetadata(item.code))
                    throw new UsageError('INVALID_UPLOAD_RESULT');
                // C-USAGE per-item host reason ({code, need}): keep the more specific reason code when it is a safe token.
                const reason = item.reason?.code;
                rejected.set(item.eventId, typeof reason === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(reason) && safeMetadata(reason) ? reason : item.code);
            }
            const remaining = eventIds.filter(id => !rejected.has(id));
            if (result.accepted + result.duplicates !== remaining.length)
                throw new UsageError('INVALID_UPLOAD_RESULT');
            // Mixed counts identify no individual membership. `sent` means confirmed
            // ingestion here; label duplicate only when every non-rejected row is one.
            const duplicates = new Set(result.accepted === 0 ? remaining : []), sent = new Set(result.accepted === 0 ? [] : remaining);
            const found = new Set();
            const events = this.snapshot.events.map(event => {
                if (!eventIds.includes(event.eventId))
                    return structuredClone(event);
                if (event.upload.state !== 'pending')
                    throw new UsageError('INVALID_UPLOAD_RESULT');
                found.add(event.eventId);
                const state = rejected.has(event.eventId) ? 'rejected' : sent.has(event.eventId) ? 'sent' : duplicates.has(event.eventId) ? 'duplicate' : 'pending';
                return { ...structuredClone(event), upload: { state, code: rejected.get(event.eventId) ?? null, attempts: event.upload.attempts + 1, sentAt } };
            });
            if (found.size !== eventIds.length)
                throw new UsageError('INVALID_UPLOAD_RESULT');
            await this.commit({ ...structuredClone(this.snapshot), events });
        });
        this.tail = run.catch(() => { });
        return run;
    }
    /** Conservative send intent uses the existing local diagnostic slot only.
     * Neither the signed event nor its attempt count changes at admission. */
    markUploadIntent(eventIds, pending = true) {
        const run = this.tail.then(async () => {
            const ids = new Set(eventIds);
            let found = 0;
            if (ids.size !== eventIds.length)
                throw new UsageError('INVALID_UPLOAD_RESULT');
            const events = this.snapshot.events.map(event => {
                if (!ids.has(event.eventId))
                    return structuredClone(event);
                if (event.upload.state !== 'pending' || event.upload.code === 'USAGE_STORAGE_UNAVAILABLE')
                    throw new UsageError('INVALID_UPLOAD_RESULT');
                found++;
                return { ...structuredClone(event), upload: { ...event.upload, code: pending ? 'UPLOAD_ATTEMPT_UNCONFIRMED' : null } };
            });
            if (found !== ids.size)
                throw new UsageError('INVALID_UPLOAD_RESULT');
            if (found > 0)
                await this.commit({ ...structuredClone(this.snapshot), events });
        });
        this.tail = run.catch(() => { });
        return run;
    }
    markAttempts(eventIds, code = null, clearCode = false) {
        const run = this.tail.then(async () => {
            if (code !== null && !safeMetadata(code))
                throw new UsageError('INVALID_UPLOAD_RESULT');
            const ids = new Set(eventIds);
            let found = 0;
            const events = this.snapshot.events.map(event => ids.has(event.eventId) ? (found++, { ...structuredClone(event), upload: { ...event.upload, ...(code === null && !clearCode ? {} : { code }), attempts: event.upload.attempts + 1 } }) : structuredClone(event));
            if (found !== ids.size)
                throw new UsageError('INVALID_UPLOAD_RESULT');
            if (found > 0)
                await this.commit({ ...structuredClone(this.snapshot), events });
        });
        this.tail = run.catch(() => { });
        return run;
    }
    /** A one-shot user selection may revisit unknown rows, but keeps their
     * durable stop marker. No automatic sender uses this admission method. */
    markResendIntent(eventIds) {
        const run = this.tail.then(async () => {
            const ids = new Set(eventIds);
            let found = 0;
            if (ids.size !== eventIds.length || this.snapshot.withdrawal !== null)
                throw new UsageError('INVALID_UPLOAD_RESULT');
            const events = this.snapshot.events.map(event => {
                if (!ids.has(event.eventId))
                    return structuredClone(event);
                if (event.upload.state !== 'pending')
                    throw new UsageError('INVALID_UPLOAD_RESULT');
                found++;
                const code = event.upload.code === 'USAGE_STORAGE_UNAVAILABLE' ? event.upload.code : 'UPLOAD_ATTEMPT_UNCONFIRMED';
                return { ...structuredClone(event), upload: { ...event.upload, code } };
            });
            if (found !== ids.size)
                throw new UsageError('INVALID_UPLOAD_RESULT');
            await this.commit({ ...structuredClone(this.snapshot), events });
        });
        this.tail = run.catch(() => { });
        return run;
    }
    /** Record one explicit failed attempt atomically; an ordinary new failure
     * cannot erase a pre-existing unknown outcome from an earlier request. */
    markResendFailure(eventIds, previousUnknown) {
        const run = this.tail.then(async () => {
            const ids = new Set(eventIds);
            let found = 0;
            const events = this.snapshot.events.map(event => {
                if (!ids.has(event.eventId))
                    return structuredClone(event);
                if (event.upload.state !== 'pending')
                    throw new UsageError('INVALID_UPLOAD_RESULT');
                found++;
                return { ...structuredClone(event), upload: { ...event.upload, code: previousUnknown.get(event.eventId) ?? null, attempts: event.upload.attempts + 1 } };
            });
            if (found !== ids.size)
                throw new UsageError('INVALID_UPLOAD_RESULT');
            await this.commit({ ...structuredClone(this.snapshot), events });
        });
        this.tail = run.catch(() => { });
        return run;
    }
    withdrawLocal(requestedAt, deviceId) {
        const run = this.tail.then(async () => { if (!validIso(requestedAt) || !validDeviceId(deviceId))
            throw new UsageError('INVALID_WITHDRAWAL'); await this.commit({ ...structuredClone(this.snapshot), events: [], withdrawal: { requestedAt, deviceId, state: 'pending', attempts: 0, deletedEvents: null, lastError: null } }); });
        this.tail = run.catch(() => { });
        return run;
    }
    markWithdrawal(input) {
        const run = this.tail.then(async () => { const current = this.snapshot.withdrawal; if (current === null)
            throw new UsageError('INVALID_WITHDRAWAL'); const next = { ...structuredClone(current), ...input, attempts: current.attempts + 1 }; await this.commit({ ...structuredClone(this.snapshot), withdrawal: next }); });
        this.tail = run.catch(() => { });
        return run;
    }
    clearWithdrawal() {
        const run = this.tail.then(async () => { if (this.snapshot.withdrawal !== null)
            await this.commit({ ...structuredClone(this.snapshot), withdrawal: null }); });
        this.tail = run.catch(() => { });
        return run;
    }
    query(filter = {}) {
        if (filter.state !== undefined && !terminal.has(filter.state) && filter.state !== 'pending')
            throw new UsageError('INVALID_FILTER');
        const limit = filter.limit ?? this.queryLimit;
        validateQueryLimit(limit);
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
