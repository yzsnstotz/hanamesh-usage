import { UsageError } from './privacy.js';
import { safeMetadata } from './privacy.js';
import { validateEvent, type UsageEvent, type UploadState } from './events.js';

export interface WithdrawalState {
  requestedAt: string;
  deviceId: string;
  state: 'pending' | 'sent' | 'offline';
  attempts: number;
  deletedEvents: number | null;
  lastError: string | null;
}
export interface InventoryItem { hanaRef: string; version: string; entryId: string; disabled: boolean }
export interface EventSnapshot {
  schemaVersion: 1;
  events: UsageEvent[];
  withdrawal: WithdrawalState | null;
  inventory: { last: { scannedAt: string; items: InventoryItem[] } | null };
}
export interface EventGlobalPort { get(): EventSnapshot; set(value: EventSnapshot): Promise<void> }
export interface IngestBatchResult { accepted:number; duplicates:number; rejected:{eventId:string;code:string}[]; durability:'committed'|'pending-host-commit' }

const terminal = new Set<UploadState>(['sent','duplicate','rejected']);
const retentionMs = 90 * 24 * 60 * 60 * 1000;
function identity(event: UsageEvent): string {
  return JSON.stringify([event.deviceId,event.hanaRef,event.action,event.occurredAt,event.source,event.sourcePlugin,event.evidenceRef]);
}
function validIso(value: unknown): value is string { const time=typeof value==='string'?Date.parse(value):NaN;return Number.isFinite(time)&&new Date(time).toISOString()===value; }
function validateWithdrawal(value: unknown): asserts value is WithdrawalState {
  if(value===null||typeof value!=='object'||Array.isArray(value))throw new UsageError('INVALID_EVENT_SNAPSHOT');
  const item=value as Record<string,unknown>;
  if(Object.keys(item).sort().join('|')!==['requestedAt','deviceId','state','attempts','deletedEvents','lastError'].sort().join('|')||!validIso(item.requestedAt)||!safeMetadata(item.deviceId)||!['pending','sent','offline'].includes(String(item.state))||!Number.isSafeInteger(item.attempts)||Number(item.attempts)<0||(item.deletedEvents!==null&&(!Number.isSafeInteger(item.deletedEvents)||Number(item.deletedEvents)<0))||(item.lastError!==null&&!safeMetadata(item.lastError)))throw new UsageError('INVALID_EVENT_SNAPSHOT');
}
export function validateEventSnapshot(value: unknown): asserts value is EventSnapshot {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new UsageError('INVALID_EVENT_SNAPSHOT');
  const snapshot = value as Record<string, unknown>;
  if (Object.keys(snapshot).sort().join('|') !== ['schemaVersion','events','withdrawal','inventory'].sort().join('|') || snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.events)) throw new UsageError('INVALID_EVENT_SNAPSHOT');
  const ids = new Set<string>();
  for (const event of snapshot.events) { validateEvent(event); if (ids.has(event.eventId)) throw new UsageError('INVALID_EVENT_SNAPSHOT'); ids.add(event.eventId); }
  if (snapshot.withdrawal !== null) validateWithdrawal(snapshot.withdrawal);
  if (snapshot.inventory === null || typeof snapshot.inventory !== 'object' || Array.isArray(snapshot.inventory) || !Object.hasOwn(snapshot.inventory,'last')) throw new UsageError('INVALID_EVENT_SNAPSHOT');
}

export class EventStore {
  private snapshot: EventSnapshot;
  private tail: Promise<void> = Promise.resolve();
  constructor(private readonly global: EventGlobalPort, private readonly maxEvents = 5000, private readonly now: () => number = Date.now) {
    if (!Number.isSafeInteger(maxEvents) || maxEvents < 1 || maxEvents > 100000) throw new UsageError('INVALID_CAPACITY');
    validateEventSnapshot(global.get());
    this.snapshot = structuredClone(global.get());
  }
  private async commit(next: EventSnapshot): Promise<void> {
    validateEventSnapshot(next);
    await this.global.set(next);
    this.snapshot = next;
  }
  put(input: UsageEvent): Promise<'inserted'|'duplicate'> {
    validateEvent(input);
    let result: 'inserted'|'duplicate' = 'duplicate';
    const run = this.tail.then(async () => {
      const existing = this.snapshot.events.find(event => event.eventId === input.eventId);
      if (existing) {
        if (identity(existing) !== identity(input)) throw new UsageError('EVENT_IDENTITY_CONFLICT');
        result = 'duplicate'; return;
      }
      const cutoff = this.now() - retentionMs;
      const retained = this.snapshot.events.filter(event => !(terminal.has(event.upload.state) && event.upload.sentAt !== null && Date.parse(event.upload.sentAt) < cutoff));
      if (retained.length >= this.maxEvents) throw new UsageError('EVENTS_CAPACITY_REACHED');
      const next: EventSnapshot = { ...structuredClone(this.snapshot), events:[...retained, structuredClone(input)] };
      await this.commit(next);
      result = 'inserted';
    });
    this.tail = run.catch(() => {});
    return run.then(() => result);
  }
  signPending(signer: (event: UsageEvent) => UsageEvent): Promise<number> {
    let count=0;
    const run=this.tail.then(async()=>{
      const events=this.snapshot.events.map(event=>{
        if(event.upload.state!=='pending'||event.signature!==null)return structuredClone(event);
        const signed=signer(structuredClone(event));validateEvent(signed);
        if(identity(signed)!==identity(event)||signed.eventId!==event.eventId||signed.nonce!==event.nonce||signed.upload.state!==event.upload.state||signed.signature===null)throw new UsageError('CORE_SIGNATURE_INVALID');
        count++;return structuredClone(signed);
      });
      if(count>0)await this.commit({...structuredClone(this.snapshot),events});
    });
    this.tail=run.catch(()=>{});return run.then(()=>count);
  }
  updateInventory(scannedAt:string,items:InventoryItem[],inputs:UsageEvent[]):Promise<{inserted:string[];duplicates:number}>{
    const inserted:string[]=[];let duplicates=0;
    const run=this.tail.then(async()=>{
      if(!validIso(scannedAt))throw new UsageError('INVALID_INVENTORY');
      const seenItems=new Set<string>();
      for(const item of items){if(item===null||typeof item!=='object'||Object.keys(item).sort().join('|')!==['hanaRef','version','entryId','disabled'].sort().join('|')||typeof item.hanaRef!=='string'||!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(item.hanaRef)||typeof item.version!=='string'||!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(item.version)||!safeMetadata(item.entryId)||typeof item.disabled!=='boolean'||seenItems.has(item.entryId))throw new UsageError('INVALID_INVENTORY');seenItems.add(item.entryId);}
      const cutoff=this.now()-retentionMs;const events=this.snapshot.events.filter(event=>!(terminal.has(event.upload.state)&&event.upload.sentAt!==null&&Date.parse(event.upload.sentAt)<cutoff));
      for(const input of inputs){validateEvent(input);const existing=events.find(event=>event.eventId===input.eventId);if(existing){if(identity(existing)!==identity(input))throw new UsageError('EVENT_IDENTITY_CONFLICT');duplicates++;continue;}if(events.length>=this.maxEvents)throw new UsageError('EVENTS_CAPACITY_REACHED');events.push(structuredClone(input));inserted.push(input.eventId);}
      const next={...structuredClone(this.snapshot),events,inventory:{last:{scannedAt,items:structuredClone(items)}}};await this.commit(next);
    });
    this.tail=run.catch(()=>{});return run.then(()=>({inserted,duplicates}));
  }
  applyUpload(eventIds: string[], result: IngestBatchResult, sentAt: string): Promise<void> {
    const run=this.tail.then(async()=>{
      if(!validIso(sentAt)||!Number.isSafeInteger(result.accepted)||result.accepted<0||!Number.isSafeInteger(result.duplicates)||result.duplicates<0||!['committed','pending-host-commit'].includes(result.durability)||!Array.isArray(result.rejected)||new Set(eventIds).size!==eventIds.length)throw new UsageError('INVALID_UPLOAD_RESULT');
      const rejected=new Map<string,string>();
      for(const item of result.rejected){if(!item||typeof item!=='object'||!eventIds.includes(item.eventId)||rejected.has(item.eventId)||!safeMetadata(item.code))throw new UsageError('INVALID_UPLOAD_RESULT');rejected.set(item.eventId,item.code);}
      const remaining=eventIds.filter(id=>!rejected.has(id));
      if(result.accepted+result.duplicates!==remaining.length)throw new UsageError('INVALID_UPLOAD_RESULT');
      const sent=new Set(remaining.slice(0,result.accepted)),duplicates=new Set(remaining.slice(result.accepted));
      const found=new Set<string>();
      const events=this.snapshot.events.map(event=>{
        if(!eventIds.includes(event.eventId))return structuredClone(event);
        if(event.upload.state!=='pending')throw new UsageError('INVALID_UPLOAD_RESULT');found.add(event.eventId);
        const state:UploadState=rejected.has(event.eventId)?'rejected':sent.has(event.eventId)?'sent':duplicates.has(event.eventId)?'duplicate':'pending';
        return {...structuredClone(event),upload:{state,code:rejected.get(event.eventId)??null,attempts:event.upload.attempts+1,sentAt}};
      });
      if(found.size!==eventIds.length)throw new UsageError('INVALID_UPLOAD_RESULT');
      await this.commit({...structuredClone(this.snapshot),events});
    });
    this.tail=run.catch(()=>{});return run;
  }
  markAttempts(eventIds:string[]):Promise<void>{
    const run=this.tail.then(async()=>{
      const ids=new Set(eventIds);let found=0;const events=this.snapshot.events.map(event=>ids.has(event.eventId)?(found++,{...structuredClone(event),upload:{...event.upload,attempts:event.upload.attempts+1}}):structuredClone(event));
      if(found!==ids.size)throw new UsageError('INVALID_UPLOAD_RESULT');if(found>0)await this.commit({...structuredClone(this.snapshot),events});
    });this.tail=run.catch(()=>{});return run;
  }
  withdrawLocal(requestedAt:string,deviceId:string):Promise<void>{
    const run=this.tail.then(async()=>{if(!validIso(requestedAt)||!safeMetadata(deviceId))throw new UsageError('INVALID_WITHDRAWAL');await this.commit({...structuredClone(this.snapshot),events:[],withdrawal:{requestedAt,deviceId,state:'pending',attempts:0,deletedEvents:null,lastError:null}});});
    this.tail=run.catch(()=>{});return run;
  }
  markWithdrawal(input:{state:'pending'|'sent'|'offline';deletedEvents:number|null;lastError:string|null}):Promise<void>{
    const run=this.tail.then(async()=>{const current=this.snapshot.withdrawal;if(current===null)throw new UsageError('INVALID_WITHDRAWAL');const next={...structuredClone(current),...input,attempts:current.attempts+1};await this.commit({...structuredClone(this.snapshot),withdrawal:next});});
    this.tail=run.catch(()=>{});return run;
  }
  clearWithdrawal():Promise<void>{
    const run=this.tail.then(async()=>{if(this.snapshot.withdrawal!==null)await this.commit({...structuredClone(this.snapshot),withdrawal:null});});this.tail=run.catch(()=>{});return run;
  }
  query(filter: {state?: UploadState; limit?: number; after?: string} = {}): {total:number; events:UsageEvent[]} {
    if (filter.state !== undefined && !terminal.has(filter.state) && filter.state !== 'pending') throw new UsageError('INVALID_FILTER');
    const limit = filter.limit ?? 100;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new UsageError('INVALID_FILTER');
    let events = this.snapshot.events;
    if (filter.state !== undefined) events = events.filter(event => event.upload.state === filter.state);
    if (filter.after !== undefined) { const index = events.findIndex(event => event.eventId === filter.after); if (index < 0) throw new UsageError('INVALID_FILTER'); events = events.slice(index + 1); }
    return { total:events.length, events:structuredClone(events.slice(0,limit)) };
  }
  getSnapshot(): EventSnapshot { return structuredClone(this.snapshot); }
  async drain(): Promise<void> { await this.tail; }
}
