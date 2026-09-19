// @ts-check
import { UsageError, UsageStore, EventStore, commitAfterSource, deriveUsageEvent, projectTerminal } from '../core/index.js';
import { mountTransport } from './transport.js';
import { createRecordSeat } from './record.js';

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{readBinding(id: import('@deepseek-ai/dsh-session').SessionId): Promise<import('../core/index.js').BindingObservation | undefined>} | null} registry
 * @param {{global: import('../core/index.js').GlobalPort, close(): Promise<void>}} domain
 * @param {{global: import('../core/index.js').EventGlobalPort, close(): Promise<void>}} eventDomain
 * @param {Required<import('./contracts.js').Config>} config
 * @param {{getConsent(): 'granted'|'withheld',getDeviceId(): string|null,nonce(): string}} eventContext
 */
export function mountUsage(ctx, registry, domain, eventDomain, config, eventContext) {
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
  /** Bounded code-only diagnostics: never print raw errors, sessions or payloads. @param {unknown} error */
  const note = (error) => {
    const allowed = ['CAPACITY_REACHED','SOURCE_IDENTITY_CONFLICT','NO_DURABILITY_LISTENER','SOURCE_NOT_DURABLE','QUEUE_FULL','BINDING_ID_MISMATCH','INVALID_SOURCE_ID','INVALID_DECLARATION','EVENTS_CAPACITY_REACHED','EVENT_IDENTITY_CONFLICT','DERIVE_FAILED'];
    const code = error instanceof UsageError && allowed.includes(error.code) ? error.code : 'OBSERVATION_FAILED';
    failures[code] = (failures[code] ?? 0) + 1;
  };
  /** @param {import('../core/index.js').Declaration} record */
  async function derive(record) {
    let result;
    try { result=deriveUsageEvent(record,{deviceId:eventContext.getDeviceId(),consent:eventContext.getConsent(),nonce:eventContext.nonce}); }
    catch { note(new UsageError('DERIVE_FAILED')); return; }
    if(result.skipped!==null){skipped[result.skipped]++;return;}
    try{await eventStore.put(result.event);}catch(error){note(error);}
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
  const record=createRecordSeat({store:eventStore,getConsent:eventContext.getConsent,getDeviceId:eventContext.getDeviceId,nonce:eventContext.nonce});
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
      const events=eventStore.getSnapshot().events;
      /** @param {import('../core/index.js').UploadState} state */
      const count=state=>events.filter(event=>event.upload.state===state).length;
      return { pending: pending.size, recoveryComplete, failures: { ...failures }, consent:eventContext.getConsent(), core:eventContext.getDeviceId()===null?'absent':'present', deviceId:eventContext.getDeviceId(), outbox:{state:'stopped',pending:count('pending'),sent:count('sent'),duplicate:count('duplicate'),rejected:count('rejected'),lastUploadAt:null,nextAttemptAt:null,lastError:null}, derive:{skipped:{...skipped}}, withdrawal:eventStore.getSnapshot().withdrawal, inventory:{available:false,source:'none',lastScanAt:null} };
    },
    async drain() { await jobs; await store.drain(); await eventStore.drain(); },
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
      stopEvent(); stopCreated();
      try { await jobs; await store.close(); await eventStore.drain(); }
      finally { await Promise.all([domain.close(),eventDomain.close()]); }
    },
  };
}
