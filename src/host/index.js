// @ts-check
import { defineDomain } from '@deepseek-ai/dsh-storage-domain';
import { z } from 'zod';
import { UsageError, isSnapshot, validateEventSnapshot, DEFAULT_EVENT_RETENTION_DAYS, DEFAULT_QUERY_LIMIT, validateRetentionDays, validateQueryLimit } from '../core/index.js';
import { createCoreLink } from './core-link.js';
import { mountUsage } from './mount.js';
import { mountCommandFacts } from './command-facts.js';

export const name = 'hanamesh-usage';
// The exact storage-domain service key is supplied by the pinned domain plugin.
export const inject = ['agents','sessions','sessionPersistence','storage','storageDomain','loader'];
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
    eventRetentionDays: config.eventRetentionDays ?? DEFAULT_EVENT_RETENTION_DAYS,
    queryLimit: config.queryLimit ?? DEFAULT_QUERY_LIMIT,
    panelTestSupply: config.panelTestSupply === undefined ? {identity:false,receiver:false} : config.panelTestSupply,
    verification:config.verification??false,
  };
  /** @param {unknown} value @param {number} min @param {number} max */
  const integer = (value, min, max) => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
  const supply=resolved.panelTestSupply;
  try { validateRetentionDays(resolved.eventRetentionDays);validateQueryLimit(resolved.queryLimit); } catch { throw new UsageError('INVALID_CONFIG'); }
  if (Object.keys(config).some(k => !['maxRecords','maxPending','allowExport','maxEvents','uploadIntervalMs','uploadBatchSize','inventoryIntervalMs','eventRetentionDays','queryLimit','panelTestSupply','verification'].includes(k))
    || typeof resolved.verification!=='boolean' || (resolved.verification&&!['test','development'].includes(process.env.NODE_ENV??''))
    || supply===null || typeof supply!=='object' || Array.isArray(supply)
    || Object.keys(supply).sort().join('|')!=='identity|receiver' || typeof supply.identity!=='boolean' || typeof supply.receiver!=='boolean'
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
    // Register before the first storage await so concurrent contributors are observed.
    /** @type {(fact:unknown)=>void} */ let consumeCommand=()=>{};
    const commandFacts=mountCommandFacts(ctx,fact=>consumeCommand(fact),resolved.maxPending);
    let domain,eventDomain,coreLink;
    try {
      domain = await ctx.storage.domain.open(usageDomainSpec);
      coreLink=createCoreLink(ctx);
      eventDomain = await ctx.storage.domain.open(usageEventsDomainSpec);
      const mounted = mountUsage(ctx, registry, domain, eventDomain, resolved, coreLink, accept=>{consumeCommand=accept;return commandFacts;});
      await mounted.ready;
      return () => mounted.close();
    } catch (error) { commandFacts.close();coreLink?.close();if(eventDomain)await eventDomain.close();if(domain)await domain.close();throw error; }
  });
}
