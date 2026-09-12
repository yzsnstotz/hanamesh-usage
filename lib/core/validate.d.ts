import type { Declaration, Snapshot } from './types.js';
export declare function validateDeclaration(v: unknown): asserts v is Declaration;
export declare function validateSnapshot(value: unknown): asserts value is Snapshot;
export declare function isSnapshot(value: unknown): value is Snapshot;
