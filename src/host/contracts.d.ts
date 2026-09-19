import type { Filter, QueryResult, UploadState, UsageEvent } from '../core/index.js';
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
}
export interface RecordInput { hanaRef:string; action:'open'|'use'; occurredAt?:string; idempotencyKey:string; sourcePlugin:string }
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
export interface UsageService {
  query(filter?: Filter): QueryResult;
  export(filter?: Filter): QueryResult;
  events(filter?: {state?: UploadState; limit?: number; after?: string}): {total:number;events:UsageEvent[]};
  record(input: RecordInput): Promise<RecordResult>;
  health(): HealthSnapshot;
  drain(): Promise<void>;
  reconcile(): Promise<void>;
}
declare module '@deepseek-ai/cordis' { interface Context { hanameshUsage: UsageService } }
