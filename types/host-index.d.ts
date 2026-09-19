import type { Context } from '@deepseek-ai/cordis';
import type { DomainSpec } from '@deepseek-ai/dsh-storage-domain';
import type { Config } from './contracts.js';
export type { Config, UsageService } from './contracts.js';
export declare const name: 'hanamesh-usage';
export declare const inject: string[];
export declare const usageDomainSpec: DomainSpec;
export declare function apply(ctx: Context, config?: Config): Promise<void>;
