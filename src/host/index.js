// @ts-check
import { defineDomain } from '@deepseek-ai/dsh-storage-domain';
import { HanaMeshAgentRegistry } from '@hanamesh/dsh-agent-registry';
import { z } from 'zod';
import { ActivityError, isSnapshot } from '../core/index.js';
import { mountActivity } from './mount.js';

export const name = 'hanamesh-activity';
// The exact storage-domain service key is supplied by the pinned domain plugin.
export const inject = ['agents','sessions','sessionPersistence','storage','storageDomain'];
/** @type {(check: (input: unknown) => boolean) => import('zod').ZodType<import('../core/index.js').Snapshot>} */
const snapshotSchema = z.custom;
/** @type {import('../core/index.js').Snapshot} */
const initialSnapshot = { schemaVersion: 1, records: [] };
export const activityDomainSpec = defineDomain({
  name: 'hanamesh_activity', version: 1, layout: 'single', tables: {},
  global: { schema: snapshotSchema(isSnapshot), initial: initialSnapshot },
});

/** @param {import('@deepseek-ai/cordis').Context} ctx @param {import('./contracts.js').Config} [config] */
export async function apply(ctx, config = {}) {
  if (!(ctx.agents instanceof HanaMeshAgentRegistry)) throw new ActivityError('PINNED_REGISTRY_REQUIRED');
  const resolved = { maxRecords:config.maxRecords ?? 5000, maxPending:config.maxPending ?? 128, allowExport:config.allowExport ?? false };
  if (Object.keys(config).some(k => !['maxRecords','maxPending','allowExport'].includes(k)) || typeof resolved.allowExport !== 'boolean' || !Number.isSafeInteger(resolved.maxPending) || resolved.maxPending < 1 || resolved.maxPending > 10000) throw new ActivityError('INVALID_CONFIG');
  const registry = ctx.agents;
  await ctx.effect(async () => {
    const domain = await ctx.storage.domain.open(activityDomainSpec);
    try {
      const mounted = mountActivity(ctx, registry, domain, resolved);
      await mounted.ready;
      return () => mounted.close();
    } catch (error) { await domain.close(); throw error; }
  });
}
