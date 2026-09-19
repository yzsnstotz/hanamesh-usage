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
export interface UsageService {
  query(filter?: Filter): QueryResult;
  export(filter?: Filter): QueryResult;
  events(filter?: {state?: UploadState; limit?: number; after?: string}): {total:number;events:UsageEvent[]};
  record(input: {hanaRef:string;action:'open'|'use';occurredAt?:string;idempotencyKey:string;sourcePlugin:string}): Promise<{disposition:'recorded'|'duplicate'|'withheld'|'rejected';eventId?:string;code?:string}>;
  health(): Record<string,unknown>;
  drain(): Promise<void>;
  reconcile(): Promise<void>;
}
declare module '@deepseek-ai/cordis' { interface Context { hanameshUsage: UsageService } }
