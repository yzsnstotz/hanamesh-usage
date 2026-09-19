import type { Filter, QueryResult } from '../core/index.js';
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
  health(): { pending: number; recoveryComplete: boolean; failures: Record<string,number> };
  drain(): Promise<void>;
  reconcile(): Promise<void>;
}
declare module '@deepseek-ai/cordis' { interface Context { hanameshUsage: UsageService } }
