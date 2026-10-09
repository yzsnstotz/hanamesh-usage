import type { Filter, QueryResult, UploadState, UsageEvent, UsageReceipt } from '../core/index.js';
import type {} from '@deepseek-ai/dsh-agent';
import type {} from '@deepseek-ai/dsh-session-persistence';
import type {} from '@deepseek-ai/dsh-client-connection';
export interface Config {
  maxRecords?: number;
  maxPending?: number;
  allowExport?: boolean;
  maxEvents?: number;
  uploadIntervalMs?: number;
  uploadBatchSize?: number;
  inventoryIntervalMs?: number;
  /** Display provenance only; does not supply identities or produce facts. */
  panelTestSupply?: PanelTestSupply;
}
export interface PanelTestSupply { identity:boolean; receiver:boolean }
export interface PanelEvent {
  eventId:string; deviceId:string; hanaRef:string; action:UsageEvent['action']; occurredAt:string;
  source:UsageEvent['source']; sourcePlugin:string|null; evidenceRef:string|null;
  signature:{state:'success'|'failure'|'unknown';code:string|null}; upload:UsageEvent['upload'];
}
export interface PanelSnapshot {
  subject:{deviceId:string|null;principalId:string|null;reason:string|null};
  testSupply:PanelTestSupply;consent:HealthSnapshot['consent'];core:HealthSnapshot['core'];
  total:number;events:PanelEvent[];outbox:HealthSnapshot['outbox'];failures:Record<string,number>;
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
  outbox:{state:'idle'|'uploading'|'backoff'|'offline'|'stopped';pending:number;sent:number;duplicate:number;rejected:number;lastUploadAt:string|null;nextAttemptAt:string|null;lastError:string|null};
  derive:{skipped:{consentWithheld:number;executorUnavailable:number;timeUnavailable:number;noDevice:number}};
  withdrawal:{requestedAt:string;deviceId:string;state:'pending'|'sent'|'offline';attempts:number;deletedEvents:number|null;lastError:string|null}|null;
  inventory:{available:boolean;source:'loader'|'plugin-inventory'|'none';lastScanAt:string|null;detail:{package:string;serviceKey:string;methods:string[]}|null};
}
export interface RemoteEvent { eventId:string; hanaRef:string; action:UsageEvent['action']; occurredAt:string; receivedAt:string }
/** This device's server records, read through the public device-signed route. `total` is null unless `state` is available. */
export interface RemoteSnapshot {
  state:'available'|'unknown'|'offline'; deviceId:string|null; total:number|null; events:RemoteEvent[];
  code:'CORE_UNAVAILABLE'|'DEVICE_UNAVAILABLE'|'SERVER_ORIGIN_UNAVAILABLE'|'REMOTE_UNAUTHORIZED'|'REMOTE_UNAVAILABLE'|'REMOTE_RESPONSE_INVALID'|null;
  httpStatus:number|null; checkedAt:string;
}
export interface UsageService {
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
declare module '@deepseek-ai/cordis' { interface Context { hanameshUsage: UsageService } }
