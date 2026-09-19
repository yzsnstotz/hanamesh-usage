import { createHash } from 'node:crypto';
import { NS_USAGE } from './pins.js';
function uuidBytes(value) {
    const hex = value.replaceAll('-', '');
    if (!/^[0-9a-f]{32}$/i.test(hex))
        throw new TypeError('INVALID_UUID_NAMESPACE');
    return Buffer.from(hex, 'hex');
}
function uuidv5(name) {
    const bytes = createHash('sha1').update(uuidBytes(NS_USAGE)).update(name, 'utf8').digest().subarray(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function eventIdForSession(deviceId, sessionId, turn) {
    return uuidv5(JSON.stringify([deviceId, 'turn/end', sessionId, turn]));
}
export function eventIdForLoader(deviceId, action, hanaRef, version) {
    return uuidv5(JSON.stringify([deviceId, action, hanaRef, version]));
}
export function eventIdForSeat(deviceId, sourcePlugin, idempotencyKey) {
    return uuidv5(JSON.stringify([deviceId, sourcePlugin, idempotencyKey]));
}
