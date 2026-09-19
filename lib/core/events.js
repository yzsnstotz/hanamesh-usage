import { UsageError, isObject, safeMetadata } from './privacy.js';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const base64url = /^[A-Za-z0-9_-]+$/;
const hana = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;
const exact = (value, names) => Object.keys(value).sort().join('|') === [...names].sort().join('|');
function validHanaRef(value) { return typeof value === 'string' && value.length <= 128 && hana.test(value) && !/(?:sk-|ghp_|github_pat_|secret|password|api.?key)/i.test(value); }
function validIso(value) {
    if (typeof value !== 'string')
        return false;
    const time = Date.parse(value);
    return Number.isFinite(time) && new Date(time).toISOString() === value;
}
function validNonce(value) {
    if (typeof value !== 'string' || !base64url.test(value))
        return false;
    const bytes = Buffer.from(value, 'base64url');
    return bytes.length === 16 && bytes.toString('base64url') === value;
}
function validEvidence(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 160 && !/[\u0000-\u001f]/.test(value)
        && !/(?:sk-|ghp_|github_pat_|xox[baprs]-|bearer|private.?key|password|secret|api.?key|https?:|file:|\/Users\/|\/home\/|\/mnt\/)/i.test(value);
}
function invalid() { throw new UsageError('INVALID_USAGE_EVENT'); }
export function validateEvent(input) {
    if (!isObject(input) || !exact(input, ['schemaVersion', 'eventId', 'deviceId', 'hanaRef', 'action', 'occurredAt', 'nonce', 'signature', 'sourceHanaRef', 'targetRef', 'source', 'sourcePlugin', 'evidenceRef', 'upload']))
        invalid();
    if (input.schemaVersion !== 1 || typeof input.eventId !== 'string' || !uuid.test(input.eventId))
        invalid();
    if (typeof input.deviceId !== 'string' || input.deviceId.length < 8 || input.deviceId.length > 160 || !base64url.test(input.deviceId))
        invalid();
    if (!validHanaRef(input.hanaRef) || !['install', 'open', 'use', 'uninstall'].includes(String(input.action)))
        invalid();
    if (!validIso(input.occurredAt) || !validNonce(input.nonce))
        invalid();
    if (input.signature !== null && (typeof input.signature !== 'string' || !base64url.test(input.signature)))
        invalid();
    if (input.sourceHanaRef !== null || input.targetRef !== null || !['session-log', 'loader', 'seat'].includes(String(input.source)))
        invalid();
    if (input.sourcePlugin !== null && !validHanaRef(input.sourcePlugin))
        invalid();
    if (input.evidenceRef !== null && !validEvidence(input.evidenceRef))
        invalid();
    if (!isObject(input.upload) || !exact(input.upload, ['state', 'code', 'attempts', 'sentAt']))
        invalid();
    if (!['pending', 'sent', 'duplicate', 'rejected'].includes(String(input.upload.state)) || (input.upload.code !== null && !safeMetadata(input.upload.code)) || !Number.isSafeInteger(input.upload.attempts) || Number(input.upload.attempts) < 0 || (input.upload.sentAt !== null && !validIso(input.upload.sentAt)))
        invalid();
}
export function createUsageEvent(input) {
    const event = { schemaVersion: 1, ...input, sourceHanaRef: null, targetRef: null, upload: { state: 'pending', code: null, attempts: 0, sentAt: null } };
    validateEvent(event);
    return structuredClone(event);
}
export function wireEvent(input) {
    validateEvent(input);
    return { deviceId: input.deviceId, hanaRef: input.hanaRef, action: input.action, occurredAt: input.occurredAt, eventId: input.eventId, nonce: input.nonce, signature: input.signature };
}
/** Rebuild every locally exposed field so later private additions cannot leak by spread. */
export function exportEventProjection(input) {
    validateEvent(input);
    return {
        schemaVersion: 1,
        eventId: input.eventId,
        deviceId: input.deviceId,
        hanaRef: input.hanaRef,
        action: input.action,
        occurredAt: input.occurredAt,
        nonce: input.nonce,
        signature: input.signature,
        sourceHanaRef: null,
        targetRef: null,
        source: input.source,
        sourcePlugin: input.sourcePlugin,
        evidenceRef: input.evidenceRef,
        upload: { state: input.upload.state, code: input.upload.code, attempts: input.upload.attempts, sentAt: input.upload.sentAt },
    };
}
