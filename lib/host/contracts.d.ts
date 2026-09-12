import type { Filter, QueryResult } from '../core/index.js';
export interface Config { maxRecords?: number; maxPending?: number; allowExport?: boolean }
export interface ActivityService {
  query(filter?: Filter): QueryResult;
  export(filter?: Filter): QueryResult;
  health(): { pending: number; recoveryComplete: boolean; failures: Record<string,number> };
  drain(): Promise<void>;
  reconcile(): Promise<void>;
}
declare module '@deepseek-ai/cordis' { interface Context { hanameshActivity: ActivityService } }
