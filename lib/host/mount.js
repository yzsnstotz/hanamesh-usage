// @ts-check
import { UsageError, UsageStore, EventStore, commitAfterSource, projectTerminal, DEFAULT_EVENT_RETENTION_DAYS, DEFAULT_QUERY_LIMIT, MAX_QUERY_LIMIT } from '../core/index.js';
import { signUsageEvent } from './core-link.js';
import { mountTransport } from './transport.js';
import { createRecordSeat } from './record.js';
import { createUsageReporter } from './upload.js';
import { resendEventIds } from './resend-input.js';
import { createInventory } from './inventory.js';
import { commandPackage } from './command-source.js';
import { mountCommandFacts } from './command-facts.js';
import { createPageFacts } from './page-facts.js';
import { ownedByProfileBundle } from './page-source.js';
import { HOST_VERSIONS } from './pins.js';
import { projectUsagePanel } from './panel.js';

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{global: import('../core/index.js').GlobalPort, close(): Promise<void>}} domain
 * @param {{global: import('../core/index.js').EventGlobalPort, close(): Promise<void>}} eventDomain
 * @param {Required<import('./contracts.js').Config>} config
 * @param {{status(): 'absent'|'incompatible'|'present',get(): import('./core-link.js').CoreService|null,onChange(listener:(status:'absent'|'incompatible'|'present',core:import('./core-link.js').CoreService|null)=>void):()=>void,close():void}} coreLink
 * @param {(accept:(fact:unknown)=>void)=>ReturnType<typeof mountCommandFacts>} [commandSource]
 */
export function mountUsage(ctx, domain, eventDomain, config, coreLink, commandSource = accept=>mountCommandFacts(ctx,accept,config.maxPending)) {
  const eventRetentionDays=config.eventRetentionDays??DEFAULT_EVENT_RETENTION_DAYS,queryLimit=config.queryLimit??DEFAULT_QUERY_LIMIT;
  const store = new UsageStore(domain.global, config.maxRecords, queryLimit);
  const eventStore = new EventStore(eventDomain.global, config.maxEvents, Date.now, eventRetentionDays, queryLimit);
  /** @type {Map<string, {jobs: number}>} */
  const pending = new Map();
  /** @type {Record<string, number>} */
  const failures = {};
  let closing = false;
  let recoveryComplete = false;
  let jobs = Promise.resolve();
  let accepted=0,collectionFailed=false;
  const coreState=()=>{
    const core=coreLink.get();if(core===null)return {core:null,deviceId:null,consent:/** @type {const} */('unknown')};
    try{return {core,deviceId:core.getDeviceId(),consent:core.getConsent()};}catch{return {core:null,deviceId:null,consent:/** @type {const} */('unknown')};}
  };
  /** Bounded code-only diagnostics: never print raw errors, sessions or payloads. @param {unknown} error */
  const note = (error) => {
    collectionFailed=true;
    const allowed = ['CAPACITY_REACHED','SOURCE_IDENTITY_CONFLICT','NO_DURABILITY_LISTENER','SOURCE_NOT_DURABLE','QUEUE_FULL','BINDING_ID_MISMATCH','INVALID_SOURCE_ID','INVALID_DECLARATION','EVENTS_CAPACITY_REACHED','EVENT_IDENTITY_CONFLICT','DERIVE_FAILED','INVENTORY_ENTRY_UNREADABLE','INVENTORY_FAILED','INVENTORY_PACKAGE_UNRESOLVED','INVENTORY_PACKAGE_INVALID','INVENTORY_PACKAGE_READ_FAILED','COMMAND_SOURCE_INVALID','COMMAND_SOURCE_UNAVAILABLE','COMMAND_SOURCE_UNREADABLE','COMMAND_SOURCE_OWNER_NOT_FOUND','COMMAND_SOURCE_OWNER_INVALID','PAGE_SOURCE_UNREADABLE'];
    const code = error instanceof UsageError && allowed.includes(error.code) ? error.code : 'OBSERVATION_FAILED';
    failures[code] = (failures[code] ?? 0) + 1;
  };
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
  // Chat turns stay local summaries (query/export) and never become usage events: DSH exposes no public fact saying which
  // plugin a turn belongs to, so turns are not counted (owner decision D, 2026-10-15).
  /** @param {import('@deepseek-ai/dsh-session').Session} session @param {number} [through] */
  async function observeLive(session,through=Infinity) {
    const events = session.snapshotEvents().filter(event=>event.seq<=through);
    /** @type {import('../core/index.js').SessionObservation} */
    const input = {
      sessionId: session.id, events, inheritedEventCount: session.inheritedEventCount,
      ...(session.header.parentSession ? { parentSession: session.header.parentSession } : {}),
      sampleKind: 'runtime_observation', hostVersions: HOST_VERSIONS,
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
      }, async () => await store.put(record));
    }
  }
  /** @param {import('@deepseek-ai/dsh-session').SessionId} id */
  async function observeCold(id) {
    const live = ctx.sessions.get(id);
    if (live) return await observeLive(live);
    const handle = await ctx.sessionPersistence.open(id, 'read');
    try {
      const { events } = await handle.read();
      /** @type {import('../core/index.js').SessionObservation} */
      const input = { sessionId: id, events, inheritedEventCount: handle.inheritedEventCount,
        ...(handle.header.parentSession ? { parentSession: handle.header.parentSession } : {}),
        sampleKind: 'runtime_observation', hostVersions: HOST_VERSIONS };
      for (const end of events) {
        if (end.type !== 'turn/end' || end.seq < handle.inheritedEventCount) continue;
        const record = projectTerminal(input, end);
        await commitAfterSource(async () => {
          // flush() is the published persistence barrier; read() alone is not one.
          await ctx.sessionPersistence.flush();
          await verifyTerminal(id, end);
        }, async () => await store.put(record));
      }
    } finally { await handle.close(); }
  }
  /** @param {import('@deepseek-ai/dsh-session').Session} session */
  function schedule(session) {
    if (closing) return;
    const existing = pending.get(session.id);
    if (!existing&&pending.size >= config.maxPending) { note(new UsageError('QUEUE_FULL')); recoveryComplete = false; return; }
    // Every accepted notification has an immutable queue edge and original
    // session-sequence boundary. Later notifications cannot extend its work.
    let through;
    try{through=session.snapshotEvents().reduce((last,event)=>Math.max(last,event.seq),-1);}catch(error){note(error);recoveryComplete=false;return;}
    const item = existing??{jobs:0};item.jobs++;
    pending.set(session.id, item);
    accepted++;
    jobs = jobs.then(async () => {
      if(!closing)await observeLive(session,through);
    }).catch(error => { note(error); recoveryComplete = false; }).finally(() => { item.jobs--;if(item.jobs===0)pending.delete(session.id); });
  }
  // Callbacks are synchronous notifications; all async failures are observed by jobs.
  const stopCreated = ctx.on('agent/created', ({ agent }) => { schedule(agent.session); return undefined; });
  const recordSeat=createRecordSeat({store:eventStore,getConsent:()=>{const value=coreState().consent;if(value==='unknown')throw new UsageError('CORE_UNAVAILABLE');return value;},getDeviceId:()=>coreState().deviceId,signEvent:event=>{const core=coreLink.get();if(core===null)throw new UsageError('CORE_UNAVAILABLE');return signUsageEvent(core,event);}});
  /** @param {import('./contracts.js').RecordInput} input */
  function record(input){
    if(closing)return Promise.resolve({disposition:/** @type {const} */('rejected'),code:'RECORD_FAILED'});
    accepted++;
    const run=jobs.then(async()=>{const result=await recordSeat(input);if(result.disposition==='rejected')collectionFailed=true;return result;});
    jobs=run.then(()=>{},error=>{note(error);});return run;
  }
  // A command success is a Host-observed operation, never a browser claim or a GUI-open assertion.
  const commandFacts=commandSource(fact=>{
    if(closing||coreState().consent!=='granted'||fact===null||typeof fact!=='object'||Array.isArray(fact))return;
    const item=/** @type {{phase?:unknown,commandId?:unknown,source?:unknown,occurredAt?:unknown}} */(fact);
    if(item.phase!=='succeeded'||typeof item.commandId!=='string'||typeof item.occurredAt!=='number'||!Number.isSafeInteger(item.occurredAt))return;
    const hanaRef=commandPackage(ctx,item.source,code=>note(new UsageError(code)));if(hanaRef===null)return;
    const observedAt=new Date(item.occurredAt);if(!Number.isFinite(observedAt.getTime()))return;
    const occurredAt=observedAt.toISOString();
    const idempotencyKey=`command:${item.commandId}:succeeded`;
    const source=/** @type {{entryId:string,moduleName:string}} */(item.source);
    accepted++;
    jobs=jobs.then(async()=>{
      // Same rule as page opens: only a command owned by a bundle the person installed counts as plugin use.
      let owned=false;try{owned=await ownedByProfileBundle(/** @type {any} */(ctx.get('pluginManager')),source);}catch{note(new UsageError('COMMAND_SOURCE_UNREADABLE'));return;}
      if(!owned)return;
      const result=await recordSeat({hanaRef,action:'use',occurredAt,idempotencyKey,sourcePlugin:hanaRef});if(result.disposition==='rejected')note(new UsageError(result.code??'RECORD_FAILED'));}).catch(note);
  });
  const stopEvent = ctx.on('session/event', (session, event) => { commandFacts.observe(session,event); if (event.type === 'turn/end') schedule(session); });
  const pages=createPageFacts(ctx,()=>!closing&&coreState().consent==='granted',(input,allowed)=>{
    accepted++;
    const run=jobs.then(async()=>{const result=allowed()?await recordSeat(/** @type {import('./contracts.js').RecordInput} */(input)):{disposition:/** @type {const} */('rejected')};if(result.disposition==='rejected')collectionFailed=true;return result;});jobs=run.then(()=>{}).catch(note);return run;
  },config.maxPending,code=>note(new UsageError(code)));
  const stopPages=ctx.inject(['typertGateway'],async child=>{
    const {mountPagesRemote}=await import('./pages-remote.js');
    return mountPagesRemote(child,pages);
  });
  const reporter=createUsageReporter({store:eventStore,link:coreLink,uploadIntervalMs:config.uploadIntervalMs,uploadBatchSize:config.uploadBatchSize});
  const inventory=createInventory({ctx,store:eventStore,link:coreLink,inventoryIntervalMs:config.inventoryIntervalMs,note:code=>note(new UsageError(code))});
  /** @type {(()=>void)|null} */let stopConsent=null;
  /** @param {'absent'|'incompatible'|'present'} status @param {import('./core-link.js').CoreService|null} core */
  const attachCore=(status,core)=>{
    pages.revoke();stopConsent?.();stopConsent=null;
    if(status!=='present'||core===null){reporter.stop();return;}
    stopConsent=core.onConsentChange((state,changedAt)=>{pages.revoke();if(state==='withheld')reporter.stop();accepted++;let deviceId=null;try{deviceId=core.getDeviceId();}catch{}jobs=jobs.then(async()=>{if(state==='withheld')await reporter.withdraw(changedAt,deviceId);else {await eventStore.signPending(event=>signUsageEvent(core,event));try{await inventory.scan();}catch{note(new UsageError('INVENTORY_FAILED'));}await reporter.grant();}}).catch(error=>note(error));});
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
    /** Explicit current user intent. Captured ids join the ordinary work queue;
     * waiting never grants consent or permission to future automatic work.
     * @param {import('./contracts.js').ResendEventsInput} input
     * @returns {Promise<import('./contracts.js').ResendEventsResult>}
     */
    resendEvents(input){
      const ids=resendEventIds(input,config.maxEvents);
      if(closing)return Promise.resolve({state:'rejected',code:'USAGE_UNAVAILABLE',events:[],health:null});
      if(ids===null)return Promise.resolve({state:'rejected',code:'RESEND_INPUT_INVALID',events:[],health:api.health()});
      accepted++;
      const run=jobs.then(async()=>{
        if(closing)return /** @type {import('./contracts.js').ResendEventsResult} */({state:'rejected',code:'USAGE_UNAVAILABLE',events:[],health:null});
        try{const result=await reporter.resend(ids);return {...result,health:closing?null:api.health()};}
        catch{return /** @type {import('./contracts.js').ResendEventsResult} */({state:'rejected',code:closing?'USAGE_UNAVAILABLE':'RESEND_FAILED',events:[],health:closing?null:api.health()});}
      });
      jobs=run.then(()=>{},error=>note(error));return run;
    },
    async observeCollection(){
      if(closing)return {state:/** @type {const} */('failed'),code:/** @type {const} */('USAGE_UNAVAILABLE'),through:null,events:[],health:null};
      const through=accepted,work=jobs,send=reporter.drain(),scan=inventory.drain().then(()=>inventory.health().lastError!==null);
      await work;
      // Capture membership before waiting on the already-started sender. Later
      // records may complete in the meantime but do not belong to this boundary.
      const ids=eventStore.getSnapshot().events.map(event=>event.eventId),failed=collectionFailed;
      const scanFailed=await scan;await send;
      if(closing)return {state:/** @type {const} */('failed'),code:/** @type {const} */('USAGE_UNAVAILABLE'),through:null,events:[],health:null};
      const events=eventStore.getSnapshot().events.filter(event=>ids.includes(event.eventId)).map(event=>reporter.delivery(event));
      const health=api.health(),localFailure=health.outbox.lastError==='UPLOAD_STATE_PERSIST_FAILED';
      return {state:/** @type {'processed'|'failed'} */(failed||scanFailed||localFailure?'failed':'processed'),code:/** @type {'COLLECTION_FAILED'|null} */(failed||scanFailed||localFailure?'COLLECTION_FAILED':null),through,events,health};
    },
    remote: () => reporter.readRemote(),
    panel: () => projectUsagePanel(api.health(),eventStore.getSnapshot().events,coreLink.get(),config.panelTestSupply,{eventRetentionDays,queryLimit,maxQueryLimit:MAX_QUERY_LIMIT}),
    health: () => {
      if(closing)throw new UsageError('USAGE_UNAVAILABLE');
      const current=coreState(),outbox=reporter.health(),{available,source,lastScanAt,detail}=inventory.health();
      return { pending: pending.size, recoveryComplete, failures: { ...failures }, consent:current.consent, core:coreLink.status(), deviceId:current.deviceId, outbox, withdrawal:eventStore.getSnapshot().withdrawal, inventory:{available,source,lastScanAt,detail} };
    },
    async drain() { await jobs; await inventory.drain(); await reporter.drain(); await store.drain(); await eventStore.drain(); },
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
  ctx.inject(['connection'], child => { mountTransport(child, api,{verification:config.verification??false}); });
  const ready = Promise.all([
    api.reconcile().catch(error => { note(error); recoveryComplete = false; }),
    inventory.start().catch(() => { note(new UsageError('INVENTORY_FAILED')); }),
  ]).then(()=>{});
  return {
    api, ready, pages,
    async close() {
      if (closing) return;
      closing = true;
      stopEvent(); stopCreated();commandFacts.close();pages.close();await stopPages.dispose();stopCore();stopConsent?.();reporter.stop();coreLink.close();
      try { await jobs; await inventory.close(); await reporter.drain(); await store.close(); await eventStore.drain(); }
      finally { await Promise.all([domain.close(),eventDomain.close()]); }
    },
  };
}
