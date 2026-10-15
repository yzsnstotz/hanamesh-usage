import type { Filter, QueryResult, UploadState, UsageEvent, UsageReceipt } from '../core/index.js';
import type {} from '@deepseek-ai/dsh-agent';
import type {} from '@deepseek-ai/dsh-session-persistence';
export interface Config {
  maxRecords?: number;
  maxPending?: number;
  allowExport?: boolean;
  maxEvents?: number;
  uploadIntervalMs?: number;
  uploadBatchSize?: number;
  inventoryIntervalMs?: number;
  /** Terminal events only, default 90 days; pending events remain until sent/withdrawn. */
  eventRetentionDays?: number;
  /** Default for declaration/event queries (1–1000), default 100; caller limit overrides. */
  queryLimit?: number;
  /** Display provenance only; does not supply identities or produce facts. */
  panelTestSupply?: PanelTestSupply;
  /** Explicit test/development build entry; always disabled in production. */
  verification?: boolean;
}
export interface PanelTestSupply { identity:boolean; receiver:boolean }
export interface PanelEvent {
  eventId:string; deviceId:string; hanaRef:string; action:UsageEvent['action']; occurredAt:string;
  source:UsageEvent['source']; sourcePlugin:string|null; evidenceRef:string|null;
  signature:{state:'success'|'failure'|'unknown';code:string|null}; upload:UsageEvent['upload'];
}
export interface UsagePolicy {eventRetentionDays:number;queryLimit:number;maxQueryLimit:number}
export interface PanelSnapshot {
  policy:UsagePolicy;
  subject:{deviceId:string|null;principalId:string|null;reason:string|null};
  testSupply:PanelTestSupply;consent:HealthSnapshot['consent'];core:HealthSnapshot['core'];
  total:number;events:PanelEvent[];outbox:HealthSnapshot['outbox'];failures:Record<string,number>;
  withdrawal:HealthSnapshot['withdrawal'];
}
/** rc.7：`sourceHanaRef` / `targetRef` / `receipt` 可选；`receipt` 只允许配 `action:'use'`。 */
export interface RecordInput { hanaRef:string; action:'open'|'use'; occurredAt?:string; idempotencyKey:string; sourcePlugin:string; sourceHanaRef?:string|null; targetRef?:string|null; receipt?:UsageReceipt|null }
export interface RecordResult { disposition:'recorded'|'duplicate'|'withheld'|'rejected'; eventId?:string; code?:string }
export interface HealthSnapshot {
  pending:number;
  recoveryComplete:boolean;
  failures:Record<string,number>;
  consent:'granted'|'withheld'|'unknown';
  core:'present'|'absent'|'incompatible';
  deviceId:string|null;
  outbox:{state:'idle'|'uploading'|'backoff'|'offline'|'stopped'|'unconfirmed';pending:number;sent:number;duplicate:number;rejected:number;lastUploadAt:string|null;nextAttemptAt:string|null;lastError:string|null};
  withdrawal:{requestedAt:string;deviceId:string;state:'pending'|'sent'|'offline'|'unconfirmed';attempts:number;deletedEvents:number|null;lastError:string|null}|null;
  inventory:{available:boolean;source:'plugin-manager'|'none';lastScanAt:string|null;detail:{package:string;serviceKey:string;methods:string[]}|null};
}
export interface RemoteEvent { eventId:string; hanaRef:string; action:UsageEvent['action']; occurredAt:string; receivedAt:string }
/** This device's server records, read through the public device-signed route. `total` is null unless `state` is available. */
export interface RemoteSnapshot {
  state:'available'|'unknown'|'offline'; deviceId:string|null; total:number|null; events:RemoteEvent[];
  code:'CORE_UNAVAILABLE'|'DEVICE_UNAVAILABLE'|'SERVER_ORIGIN_UNAVAILABLE'|'REMOTE_UNAUTHORIZED'|'REMOTE_UNAVAILABLE'|'REMOTE_RESPONSE_INVALID'|null;
  httpStatus:number|null; checkedAt:string;
}
export interface UsageService {
  resendEvents(input:ResendEventsInput):Promise<ResendEventsResult>;
  observeCollection(): Promise<CollectionObservation>;
  /** Read-only, user-triggered: never writes local state and never collects. */
  remote(): Promise<RemoteSnapshot>;
  query(filter?: Filter): QueryResult;
  export(filter?: Filter): QueryResult;
  events(filter?: {state?: UploadState; limit?: number; after?: string}): {total:number;events:UsageEvent[]};
  record(input: RecordInput): Promise<RecordResult>;
  health(): HealthSnapshot;
  panel(): PanelSnapshot;
  drain(): Promise<void>;
  reconcile(): Promise<void>;
}
export interface ResendEventsInput {readonly eventIds:readonly string[]}
export interface ResendEventsResult {
  state:'processed'|'withheld'|'rejected';
  code:null|'RESEND_INPUT_INVALID'|'RESEND_EVENT_UNAVAILABLE'|'CORE_UNAVAILABLE'|'USAGE_UNAVAILABLE'|'UPLOAD_STATE_PERSIST_FAILED'|'RESEND_FAILED';
  events:{eventId:string;delivery:'pending'|'confirmed'|'rejected'|'unconfirmed';code:string|null}[];
  health:HealthSnapshot|null;
}
export interface CollectionObservation {
  state:'processed'|'failed';code:null|'COLLECTION_FAILED'|'USAGE_UNAVAILABLE';through:number|null;
  events:{eventId:string;delivery:'pending'|'confirmed'|'rejected'|'unconfirmed'|'withdrawn';code:string|null}[];
  health:HealthSnapshot|null;
}
declare module '@deepseek-ai/cordis' { interface Context { hanameshUsage: UsageService } }
