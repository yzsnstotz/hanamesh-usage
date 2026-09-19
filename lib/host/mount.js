// @ts-check
import { randomBytes } from 'node:crypto';
import { UsageError, UsageStore, EventStore, commitAfterSource, deriveUsageEvent, projectTerminal } from '../core/index.js';
import { signUsageEvent } from './core-link.js';
import { mountTransport } from './transport.js';
import { createRecordSeat } from './record.js';
import { createUsageReporter } from './upload.js';

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{readBinding(id: import('@deepseek-ai/dsh-session').SessionId): Promise<import('../core/index.js').BindingObservation | undefined>} | null} registry
 * @param {{global: import('../core/index.js').GlobalPort, close(): Promise<void>}} domain
 * @param {{global: import('../core/index.js').EventGlobalPort, close(): Promise<void>}} eventDomain
 * @param {Required<import('./contracts.js').Config>} config
 * @param {{status(): 'absent'|'incompatible'|'present',get(): import('../../docs/contracts/hanamesh-core/contract.js').HanaMeshCoreContract|null,onChange(listener:(status:'absent'|'incompatible'|'present',core:import('../../docs/contracts/hanamesh-core/contract.js').HanaMeshCoreContract|null)=>void):()=>void,close():void}} coreLink
 */
export function mountUsage(ctx, registry, domain, eventDomain, config, coreLink) {
  const store = new UsageStore(domain.global, config.maxRecords);
  const eventStore = new EventStore(eventDomain.global, config.maxEvents);
  /** @type {Map<string, {dirty: boolean, session: import('@deepseek-ai/dsh-session').Session}>} */
  const pending = new Map();
  /** @type {Record<string, number>} */
  const failures = {};
  const skipped = { consentWithheld:0, executorUnavailable:0, timeUnavailable:0, noDevice:0 };
  let closing = false;
  let recoveryComplete = false;
  let jobs = Promise.resolve();
  const nonce=()=>randomBytes(16).toString('base64url');
  const coreState=()=>{
    const core=coreLink.get();if(core===null)return {core:null,deviceId:null,consent:/** @type {const} */('unknown')};
    try{return {core,deviceId:core.getDeviceId(),consent:core.getConsent()};}catch{return {core:null,deviceId:null,consent:/** @type {const} */('unknown')};}
  };
  /** Bounded code-only diagnostics: never print raw errors, sessions or payloads. @param {unknown} error */
  const note = (error) => {
    const allowed = ['CAPACITY_REACHED','SOURCE_IDENTITY_CONFLICT','NO_DURABILITY_LISTENER','SOURCE_NOT_DURABLE','QUEUE_FULL','BINDING_ID_MISMATCH','INVALID_SOURCE_ID','INVALID_DECLARATION','EVENTS_CAPACITY_REACHED','EVENT_IDENTITY_CONFLICT','DERIVE_FAILED'];
    const code = error instanceof UsageError && allowed.includes(error.code) ? error.code : 'OBSERVATION_FAILED';
    failures[code] = (failures[code] ?? 0) + 1;
  };
  /** @param {import('../core/index.js').Declaration} record */
  async function derive(record) {
    let result;
    const current=coreState();
    try { result=deriveUsageEvent(record,{deviceId:current.deviceId,consent:current.consent,nonce}); }
    catch { note(new UsageError('DERIVE_FAILED')); return; }
    if(result.skipped!==null){skipped[result.skipped]++;return;}
    try{if(current.core===null)throw new UsageError('DERIVE_FAILED');await eventStore.put(signUsageEvent(current.core,result.event));}catch(error){note(error instanceof UsageError&&error.code==='EVENTS_CAPACITY_REACHED'?error:new UsageError('DERIVE_FAILED'));}
  }
  /** @param {import('@deepseek-ai/dsh-session').SessionId} id */
  async function bindingFor(id) {
    // Read-only public contract. Never call create/resume, or register another registry.
    return registry ? await registry.readBinding(id) : undefined;
  }
  /**
   * @param {import('@deepseek-ai/dsh-session').SessionId} id
   * @param {import('@deepseek-ai/dsh-session').SessionEvent<'turn/end'>} expected
   */
  async function verifyTerminal(id, expected) {
    const handle = await ctx.sessionPersistence.open(id, 'read');
    try {
      const read = await handle.read(expected.seq, 1);
      const actual = read.events[0];
      if (!actual || actual.type !== 'turn/end' || actual.seq !== expected.seq || actual.time !== expected.time || actual.data.turn !== expected.data.turn || actual.data.reason.kind !== expected.data.reason.kind) throw new UsageError('SOURCE_NOT_DURABLE');
    } finally { await handle.close(); }
  }
  /** @param {import('@deepseek-ai/dsh-session').Session} session */
  async function observeLive(session) {
    const events = session.snapshotEvents();
    const binding = await bindingFor(session.id);
    /** @type {import('../core/index.js').SessionObservation} */
    const input = {
      sessionId: session.id, events, inheritedEventCount: session.inheritedEventCount,
      ...(session.header.parentSession ? { parentSession: session.header.parentSession } : {}),
      ...(binding ? { binding } : {}), sampleKind: 'runtime_observation',
    };
    /** @type {Promise<void> | undefined} */
    let flush;
    for (const end of events) {
      if (end.type !== 'turn/end' || !session.isOwnSeq(end.seq)) continue;
      const record = projectTerminal(input, end);
      await commitAfterSource(async () => {
        flush ??= ctx.sessions.flush(session).then(participated => {
          if (!participated) throw new UsageError('NO_DURABILITY_LISTENER');
        });
        await flush;
        await verifyTerminal(session.id, end);
      }, async () => { const disposition=await store.put(record);if(disposition==='inserted')await derive(record);return disposition; });
    }
  }
  /** @param {import('@deepseek-ai/dsh-session').SessionId} id */
  async function observeCold(id) {
    const live = ctx.sessions.get(id);
    if (live) return await observeLive(live);
    const binding = await bindingFor(id);
    const handle = await ctx.sessionPersistence.open(id, 'read');
    try {
      const { events } = await handle.read();
      /** @type {import('../core/index.js').SessionObservation} */
      const input = { sessionId: id, events, inheritedEventCount: handle.inheritedEventCount,
        ...(handle.header.parentSession ? { parentSession: handle.header.parentSession } : {}),
        ...(binding ? { binding } : {}), sampleKind: 'runtime_observation' };
      for (const end of events) {
        if (end.type !== 'turn/end' || end.seq < handle.inheritedEventCount) continue;
        const record = projectTerminal(input, end);
        await commitAfterSource(async () => {
          // flush() is the published persistence barrier; read() alone is not one.
          await ctx.sessionPersistence.flush();
          await verifyTerminal(id, end);
        }, async () => { const disposition=await store.put(record);if(disposition==='inserted')await derive(record);return disposition; });
      }
    } finally { await handle.close(); }
  }
  /** @param {import('@deepseek-ai/dsh-session').Session} session */
  function schedule(session) {
    if (closing) return;
    const existing = pending.get(session.id);
    if (existing) { existing.dirty = true; existing.session = session; return; }
    if (pending.size >= config.maxPending) { note(new UsageError('QUEUE_FULL')); recoveryComplete = false; return; }
    const item = { dirty: true, session };
    pending.set(session.id, item);
    jobs = jobs.then(async () => {
      while (item.dirty && !closing) { item.dirty = false; await observeLive(item.session); }
    }).catch(error => { note(error); recoveryComplete = false; }).finally(() => { pending.delete(session.id); });
  }
  // Callbacks are synchronous notifications; all async failures are observed by jobs.
  const stopEvent = ctx.on('session/event', (session, event) => { if (event.type === 'turn/end') schedule(session); });
  const stopCreated = ctx.on('agent/created', ({ agent }) => schedule(agent.session));
  const record=createRecordSeat({store:eventStore,getConsent:()=>{const value=coreState().consent;return value==='granted'?'granted':'withheld';},getDeviceId:()=>coreState().deviceId,nonce,signEvent:event=>{const core=coreLink.get();if(core===null)throw new UsageError('CORE_UNAVAILABLE');return signUsageEvent(core,event);}});
  const reporter=createUsageReporter({store:eventStore,link:coreLink,uploadIntervalMs:config.uploadIntervalMs,uploadBatchSize:config.uploadBatchSize});
  /** @type {(()=>void)|null} */let stopConsent=null;
  /** @param {'absent'|'incompatible'|'present'} status @param {import('../../docs/contracts/hanamesh-core/contract.js').HanaMeshCoreContract|null} core */
  const attachCore=(status,core)=>{
    stopConsent?.();stopConsent=null;
    if(status!=='present'||core===null){reporter.stop();return;}
    stopConsent=core.onConsentChange((state,changedAt)=>{let deviceId=null;try{deviceId=core.getDeviceId();}catch{}jobs=jobs.then(async()=>{if(state==='withheld')await reporter.withdraw(changedAt,deviceId);else {await eventStore.signPending(event=>signUsageEvent(core,event));await reporter.grant();}}).catch(error=>note(error));});
    jobs=jobs.then(async()=>{await eventStore.signPending(event=>signUsageEvent(core,event));reporter.start();}).catch(error=>note(error));
  };
  const stopCore=coreLink.onChange(attachCore);attachCore(coreLink.status(),coreLink.get());
  const api = {
    /** @param {import('../core/index.js').Filter} [filter] */
    query: (filter = {}) => store.query(filter),
    /** @param {import('../core/index.js').Filter} [filter] */
    export: (filter = {}) => {
      if (!config.allowExport) throw new UsageError('EXPORT_DISABLED');
      return store.export(filter);
    },
    /** @param {{state?: import('../core/index.js').UploadState, limit?: number, after?: string}} [filter] */
    events: (filter = {}) => eventStore.query(filter),
    record,
    health: () => {
      const current=coreState(),outbox=reporter.health();
      return { pending: pending.size, recoveryComplete, failures: { ...failures }, consent:current.consent, core:coreLink.status(), deviceId:current.deviceId, outbox, derive:{skipped:{...skipped}}, withdrawal:eventStore.getSnapshot().withdrawal, inventory:{available:false,source:/** @type {const} */('none'),lastScanAt:null} };
    },
    async drain() { await jobs; await reporter.drain(); await store.drain(); await eventStore.drain(); },
    async reconcile() {
      if (closing) throw new UsageError('STORE_CLOSED');
      const run = jobs.then(async () => {
        let complete = true;
        for (const snapshot of await ctx.sessionPersistence.list()) {
          if (closing) { complete = false; break; }
          try { await observeCold(snapshot.header.id); }
          catch (error) { note(error); complete = false; }
        }
        // Include just-created live sessions not yet materialized in list().
        for (const session of ctx.sessions.list()) {
          if (closing) { complete = false; break; }
          try { await observeLive(session); }
          catch (error) { note(error); complete = false; }
        }
        recoveryComplete = complete;
      });
      jobs = run.catch(error => { note(error); recoveryComplete = false; });
      await run;
    },
  };
  ctx.provide('hanameshUsage', api);
  // CLI-only hosts still record locally. This child mounts only when Connection exists.
  ctx.inject(['connection'], child => { mountTransport(child, api); });
  const ready = api.reconcile().catch(error => { note(error); recoveryComplete = false; });
  return {
    api, ready,
    async close() {
      if (closing) return;
      closing = true;
      stopEvent(); stopCreated();stopCore();stopConsent?.();reporter.stop();coreLink.close();
      try { await jobs; await reporter.drain(); await store.close(); await eventStore.drain(); }
      finally { await Promise.all([domain.close(),eventDomain.close()]); }
    },
  };
}
