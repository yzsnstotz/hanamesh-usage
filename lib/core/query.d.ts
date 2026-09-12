import type { Declaration, Filter, MetricTotal, Observation, QueryResult, RemoteState } from './types.js';
export declare function metricTotal(values: readonly Observation<number>[]): MetricTotal;
export declare function validateFilter(filter: Filter): void;
export declare function queryRecords(records: readonly Declaration[], filter?: Filter): QueryResult;
export declare function formatObservation(value: Observation<unknown>): string;
export declare function remoteLabel(state: RemoteState): string;
