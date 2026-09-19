// @ts-check
import { defineDomain } from '@deepseek-ai/dsh-storage-domain';
import { z } from 'zod';
import { UsageError, isSnapshot, validateEventSnapshot } from '../core/index.js';
import { createCoreLink } from './core-link.js';
import { mountUsage } from './mount.js';

export const name = 'hanamesh-usage';
// The exact storage-domain service key is supplied by the pinned domain plugin.
export const inject = ['agents','sessions','sessionPersistence','storage','storageDomain'];
/** @type {(check: (input: unknown) => boolean) => import('zod').ZodType<import('../core/index.js').Snapshot>} */
const snapshotSchema = z.custom;
/** @type {(check: (input: unknown) => boolean) => import('zod').ZodType<import('../core/index.js').EventSnapshot>} */
const eventSnapshotSchema = z.custom;
/** @type {import('../core/index.js').Snapshot} */
const initialSnapshot = { schemaVersion: 1, records: [] };
export const usageDomainSpec = defineDomain({
  name: 'hanamesh_usage', version: 1, layout: 'single', tables: {},
  global: { schema: snapshotSchema(isSnapshot), initial: initialSnapshot },
});
/** @type {import('../core/index.js').EventSnapshot} */
const initialEvents = { schemaVersion:1,events:[],withdrawal:null,inventory:{last:null} };
export const usageEventsDomainSpec = defineDomain({
  name:'hanamesh_usage_events',version:1,layout:'single',tables:{},
  global:{schema:eventSnapshotSchema(value => { try { validateEventSnapshot(value); return true; } catch { return false; } }),initial:initialEvents},
});

/** @param {import('@deepseek-ai/cordis').Context} ctx @param {import('./contracts.js').Config} [config] */
export async function apply(ctx, config = {}) {
  const resolved = {
    maxRecords: config.maxRecords ?? 5000,
    maxPending: config.maxPending ?? 128,
    allowExport: config.allowExport ?? false,
    maxEvents: config.maxEvents ?? 5000,
    uploadIntervalMs: config.uploadIntervalMs ?? 60000,
    uploadBatchSize: config.uploadBatchSize ?? 200,
    inventoryIntervalMs: config.inventoryIntervalMs ?? 300000,
  };
  /** @param {unknown} value @param {number} min @param {number} max */
  const integer = (value, min, max) => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
  if (Object.keys(config).some(k => !['maxRecords','maxPending','allowExport','maxEvents','uploadIntervalMs','uploadBatchSize','inventoryIntervalMs'].includes(k))
    || typeof resolved.allowExport !== 'boolean'
    || !integer(resolved.maxRecords, 1, 100000)
    || !integer(resolved.maxPending, 1, 10000)
    || !integer(resolved.maxEvents, 1, 100000)
    || !integer(resolved.uploadIntervalMs, 5000, 3600000)
    || !integer(resolved.uploadBatchSize, 1, 200)
    || !integer(resolved.inventoryIntervalMs, 60000, 3600000)) throw new UsageError('INVALID_CONFIG');
  const candidate = /** @type {{agents?: {readBinding?(id: import('@deepseek-ai/dsh-session').SessionId): Promise<import('../core/index.js').BindingObservation | undefined>}}} */ (/** @type {unknown} */ (ctx)).agents;
  const registry = candidate && typeof candidate.readBinding === 'function'
    ? { readBinding: candidate.readBinding.bind(candidate) }
    : null;
  await ctx.effect(async () => {
    const domain = await ctx.storage.domain.open(usageDomainSpec);
    let eventDomain;
    const coreLink=createCoreLink(ctx);
    try {
      eventDomain = await ctx.storage.domain.open(usageEventsDomainSpec);
      const mounted = mountUsage(ctx, registry, domain, eventDomain, resolved, coreLink);
      await mounted.ready;
      return () => mounted.close();
    } catch (error) { coreLink.close();if(eventDomain)await eventDomain.close();await domain.close();throw error; }
  });
}
