import { UsageError, isObject, safeMetadata } from './privacy.js';

export type Action = 'install' | 'open' | 'use' | 'uninstall';
export type UploadState = 'pending' | 'sent' | 'duplicate' | 'rejected';
/** rc.7 使用回执：应用 × 供应商 × 模型 × 次数；不记内容。只允许挂在 `use` 事件上。 */
export interface UsageReceipt { providerId: string; model: string | null; count: number }
export interface UsageEvent {
  schemaVersion: 1;
  eventId: string;
  deviceId: string;
  hanaRef: string;
  action: Action;
  occurredAt: string;
  nonce: string;
  signature: string | null;
  /** rc.7 归因：来源 Hana（npm 包名 / registry id），缺省 null。 */
  sourceHanaRef: string | null;
  /** rc.7 归因：目标应用 / 会话引用（有界 token），缺省 null。 */
  targetRef: string | null;
  /** rc.7 使用回执；rc.6 及更早的本地事件没有这个键，读取时视为 null。 */
  receipt?: UsageReceipt | null;
  source: 'session-log' | 'loader' | 'seat';
  sourcePlugin: string | null;
  evidenceRef: string | null;
  upload: { state: UploadState; code: string | null; attempts: number; sentAt: string | null };
}
/** 上线形状：七个必备键，加上仅在非 null 时出现的三个可选归因键（O1 `POST /v1/usage/events`）。 */
export type WireUsageEvent = Pick<UsageEvent, 'deviceId'|'hanaRef'|'action'|'occurredAt'|'eventId'|'nonce'|'signature'>
  & { sourceHanaRef?: string; targetRef?: string; receipt?: UsageReceipt };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const base64url = /^[A-Za-z0-9_-]+$/;
const hana = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;
/** O1 server `token()`：有界 ASCII 引用，不含路径、空白或 secret 前缀。 */
const targetToken = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const providerToken = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;
const modelToken = /^[A-Za-z0-9][A-Za-z0-9_.:/@+-]{0,127}$/;
const secretLike = /(?:^sk-|^sk_|^bearer[.:-]|ghp_|github_pat_|xox[baprs]-|secret|password|api.?key|private.?key)/i;
const REQUIRED_KEYS = ['schemaVersion','eventId','deviceId','hanaRef','action','occurredAt','nonce','signature','sourceHanaRef','targetRef','source','sourcePlugin','evidenceRef','upload'];
const OPTIONAL_KEYS = ['receipt'];
const exact = (value: Record<string, unknown>, names: string[]) => Object.keys(value).sort().join('|') === [...names].sort().join('|');
function exactWithOptional(value: Record<string, unknown>, required: string[], optional: string[]): boolean {
  const keys = Object.keys(value);
  return required.every(name => keys.includes(name)) && keys.every(name => required.includes(name) || optional.includes(name));
}
function validHanaRef(value: unknown): value is string { return typeof value === 'string' && value.length <= 128 && hana.test(value) && !/(?:sk-|ghp_|github_pat_|secret|password|api.?key)/i.test(value); }
export function validTargetRef(value: unknown): value is string { return typeof value === 'string' && targetToken.test(value) && !secretLike.test(value); }
export function validReceipt(value: unknown): value is UsageReceipt {
  if (!isObject(value) || !exact(value, ['providerId','model','count'])) return false;
  if (typeof value.providerId !== 'string' || !providerToken.test(value.providerId) || secretLike.test(value.providerId)) return false;
  if (value.model !== null && (typeof value.model !== 'string' || !modelToken.test(value.model) || secretLike.test(value.model))) return false;
  return typeof value.count === 'number' && Number.isSafeInteger(value.count) && value.count >= 1 && value.count <= 2147483647;
}
function validIso(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}
function validNonce(value: unknown): value is string {
  if (typeof value !== 'string' || !base64url.test(value)) return false;
  const bytes = Buffer.from(value, 'base64url');
  return bytes.length === 16 && bytes.toString('base64url') === value;
}
function validEvidence(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 160 && !/[\u0000-\u001f]/.test(value)
    && !/(?:sk-|ghp_|github_pat_|xox[baprs]-|bearer|private.?key|password|secret|api.?key|https?:|file:|\/Users\/|\/home\/|\/mnt\/)/i.test(value);
}
function invalid(): never { throw new UsageError('INVALID_USAGE_EVENT'); }

export function validateEvent(input: unknown): asserts input is UsageEvent {
  if (!isObject(input) || !exactWithOptional(input, REQUIRED_KEYS, OPTIONAL_KEYS)) invalid();
  if (input.schemaVersion !== 1 || typeof input.eventId !== 'string' || !uuid.test(input.eventId)) invalid();
  if (typeof input.deviceId !== 'string' || input.deviceId.length < 8 || input.deviceId.length > 160 || !base64url.test(input.deviceId)) invalid();
  if (!validHanaRef(input.hanaRef) || !['install','open','use','uninstall'].includes(String(input.action))) invalid();
  if (!validIso(input.occurredAt) || !validNonce(input.nonce)) invalid();
  if (input.signature !== null && (typeof input.signature !== 'string' || !base64url.test(input.signature))) invalid();
  if (input.sourceHanaRef !== null && !validHanaRef(input.sourceHanaRef)) invalid();
  if (input.targetRef !== null && !validTargetRef(input.targetRef)) invalid();
  if (Object.hasOwn(input, 'receipt') && input.receipt !== null && (input.action !== 'use' || !validReceipt(input.receipt))) invalid();
  if (!['session-log','loader','seat'].includes(String(input.source))) invalid();
  if (input.sourcePlugin !== null && !validHanaRef(input.sourcePlugin)) invalid();
  if (input.evidenceRef !== null && !validEvidence(input.evidenceRef)) invalid();
  if (!isObject(input.upload) || !exact(input.upload, ['state','code','attempts','sentAt'])) invalid();
  if (!['pending','sent','duplicate','rejected'].includes(String(input.upload.state)) || (input.upload.code !== null && !safeMetadata(input.upload.code)) || !Number.isSafeInteger(input.upload.attempts) || Number(input.upload.attempts) < 0 || (input.upload.sentAt !== null && !validIso(input.upload.sentAt))) invalid();
}

export type CreateUsageEventInput = Omit<UsageEvent,'schemaVersion'|'sourceHanaRef'|'targetRef'|'receipt'|'upload'>
  & { sourceHanaRef?: string | null; targetRef?: string | null; receipt?: UsageReceipt | null };
export function createUsageEvent(input: CreateUsageEventInput): UsageEvent {
  const { sourceHanaRef = null, targetRef = null, receipt = null, ...rest } = input;
  const event: UsageEvent = { schemaVersion:1, ...rest, sourceHanaRef, targetRef, receipt, upload:{state:'pending',code:null,attempts:0,sentAt:null} };
  validateEvent(event);
  return structuredClone(event);
}

/** 只在非 null 时带上三个可选归因键；服务端把它们纳入内容 digest，但不纳入六键签名。 */
export function wireEvent(input: UsageEvent): WireUsageEvent {
  validateEvent(input);
  const receipt = input.receipt ?? null;
  return {
    deviceId:input.deviceId, hanaRef:input.hanaRef, action:input.action, occurredAt:input.occurredAt, eventId:input.eventId, nonce:input.nonce, signature:input.signature,
    ...(input.sourceHanaRef === null ? {} : { sourceHanaRef:input.sourceHanaRef }),
    ...(input.targetRef === null ? {} : { targetRef:input.targetRef }),
    ...(receipt === null ? {} : { receipt:{ providerId:receipt.providerId, model:receipt.model, count:receipt.count } }),
  };
}

/** Rebuild every locally exposed field so later private additions cannot leak by spread. */
export function exportEventProjection(input: UsageEvent): UsageEvent {
  validateEvent(input);
  const receipt = input.receipt ?? null;
  return {
    schemaVersion:1,
    eventId:input.eventId,
    deviceId:input.deviceId,
    hanaRef:input.hanaRef,
    action:input.action,
    occurredAt:input.occurredAt,
    nonce:input.nonce,
    signature:input.signature,
    sourceHanaRef:input.sourceHanaRef,
    targetRef:input.targetRef,
    receipt:receipt === null ? null : { providerId:receipt.providerId, model:receipt.model, count:receipt.count },
    source:input.source,
    sourcePlugin:input.sourcePlugin,
    evidenceRef:input.evidenceRef,
    upload:{state:input.upload.state,code:input.upload.code,attempts:input.upload.attempts,sentAt:input.upload.sentAt},
  };
}
