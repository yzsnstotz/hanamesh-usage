// @ts-check
import { ActivityError, ActivityStore, commitAfterSource, projectTerminal } from '../core/index.js';
import { mountTransport } from './transport.js';

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {import('@hanamesh/dsh-agent-registry').HanaMeshAgentRegistry} registry
 * @param {{global: import('../core/index.js').GlobalPort, close(): Promise<void>}} domain
 * @param {Required<import('./contracts.js').Config>} config
 */
export function mountActivity(ctx, registry, domain, config) {
  const store = new ActivityStore(domain.global, config.maxRecords);
  /** @type {Map<string, {dirty: boolean, session: import('@deepseek-ai/dsh-session').Session}>} */
  const pending = new Map();
  /** @type {Record<string, number>} */
  const failures = {};
  let closing = false;
  let recoveryComplete = false;
  let jobs = Promise.resolve();
  /** Bounded code-only diagnostics: never print raw errors, sessions or payloads. @param {unknown} error */
  const note = (error) => {
    const allowed = ['CAPACITY_REACHED','SOURCE_IDENTITY_CONFLICT','NO_DURABILITY_LISTENER','SOURCE_NOT_DURABLE','QUEUE_FULL','BINDING_ID_MISMATCH','INVALID_SOURCE_ID','INVALID_DECLARATION'];
    const code = error instanceof ActivityError && allowed.includes(error.code) ? error.code : 'OBSERVATION_FAILED';
    failures[code] = (failures[code] ?? 0) + 1;
  };
  /** @param {import('@deepseek-ai/dsh-session').SessionId} id */
  async function bindingFor(id) {
    // Read-only public contract. Never call create/resume, or register another registry.
    return await registry.readBinding(id);
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
      if (!actual || actual.type !== 'turn/end' || actual.seq !== expected.seq || actual.time !== expected.time || actual.data.turn !== expected.data.turn || actual.data.reason.kind !== expected.data.reason.kind) throw new ActivityError('SOURCE_NOT_DURABLE');
    } finally { await handle.close(); }
  }
  /** @param {import('@deepseek-ai/dsh-session').Session} session */
  async function observeLive(session) {
    const events = session.snapshotEvents();
    const binding = await bindingFor(session.id);
    if (!binding) return; // Do not claim an unowned DSH session is a Registry observation.
    /** @type {import('../core/index.js').SessionObservation} */
    const input = {
      sessionId: session.id, events, inheritedEventCount: session.inheritedEventCount,
      ...(session.header.parentSession ? { parentSession: session.header.parentSession } : {}),
      ...(binding ? { binding } : {}), sampleKind: 'runtime_observation',
    };
    /** @type {Promise<void> | undefined} */
    let flush;
    for (const end of events) {
      if (end.type !== 'turn/end' || !session.ownsEvent(end.seq)) continue;
      const record = projectTerminal(input, end);
      await commitAfterSource(async () => {
        flush ??= ctx.sessions.flush(session).then(participated => {
          if (!participated) throw new ActivityError('NO_DURABILITY_LISTENER');
        });
        await flush;
        await verifyTerminal(session.id, end);
      }, () => store.put(record));
    }
  }
  /** @param {import('@deepseek-ai/dsh-session').SessionId} id */
  async function observeCold(id) {
    const live = ctx.sessions.get(id);
    if (live) return await observeLive(live);
    const binding = await bindingFor(id);
    if (!binding) return;
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
        }, () => store.put(record));
      }
    } finally { await handle.close(); }
  }
  /** @param {import('@deepseek-ai/dsh-session').Session} session */
  function schedule(session) {
    if (closing) return;
    const existing = pending.get(session.id);
    if (existing) { existing.dirty = true; existing.session = session; return; }
    if (pending.size >= config.maxPending) { note(new ActivityError('QUEUE_FULL')); recoveryComplete = false; return; }
    const item = { dirty: true, session };
    pending.set(session.id, item);
    jobs = jobs.then(async () => {
      while (item.dirty && !closing) { item.dirty = false; await observeLive(item.session); }
    }).catch(error => { note(error); recoveryComplete = false; }).finally(() => { pending.delete(session.id); });
  }
  // Callbacks are synchronous notifications; all async failures are observed by jobs.
  const stopEvent = ctx.on('session/event', (session, event) => { if (event.type === 'turn/end') schedule(session); });
  const stopCreated = ctx.on('agent/created', ({ agent }) => schedule(agent.session));
  const api = {
    /** @param {import('../core/index.js').Filter} [filter] */
    query: (filter = {}) => store.query(filter),
    /** @param {import('../core/index.js').Filter} [filter] */
    export: (filter = {}) => {
      if (!config.allowExport) throw new ActivityError('EXPORT_DISABLED');
      return store.export(filter);
    },
    health: () => ({ pending: pending.size, recoveryComplete, failures: { ...failures } }),
    async drain() { await jobs; await store.drain(); },
    async reconcile() {
      if (closing) throw new ActivityError('STORE_CLOSED');
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
  ctx.provide('hanameshActivity', api);
  // CLI-only hosts still record locally. This child mounts only when Connection exists.
  ctx.inject(['connection'], child => { mountTransport(child, api); });
  const ready = api.reconcile().catch(error => { note(error); recoveryComplete = false; });
  return {
    api, ready,
    async close() {
      if (closing) return;
      closing = true;
      stopEvent(); stopCreated();
      try { await jobs; await store.close(); }
      finally { await domain.close(); }
    },
  };
}
