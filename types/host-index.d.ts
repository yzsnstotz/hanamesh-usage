import type { Context } from '@deepseek-ai/cordis';
import type { DomainSpec } from '@deepseek-ai/dsh-storage-domain';
import type { Config } from './contracts.js';
export type { Config, ActivityService } from './contracts.js';
export declare const name: 'hanamesh-activity';
export declare const inject: string[];
export declare const activityDomainSpec: DomainSpec;
export declare function apply(ctx: Context, config?: Config): Promise<void>;
