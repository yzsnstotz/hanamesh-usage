// @ts-check
import {randomBytes} from 'node:crypto';
import {createUsageEvent,eventIdForLoader,eventNonceFromBytes,validLoaderReference,UsageError} from '../core/index.js';
import {signUsageEvent} from './core-link.js';

/** Profile-installed bundles, as the Host's plugin manager reports them (@deepseek-ai/dsh-plugin-manager BundleInfo).
 * A bundle the installation supplies (dsh-base, dsh-web-app, …) or a catalog entry that is not installed is not a user
 * install: only `installed && availability==='profile'` bundles are Hana installs. The loader's full entry list is the
 * composed platform, not what the person installed, so it is never scanned.
 * @typedef {{name?:unknown,version?:unknown,installed?:unknown,availability?:unknown,enabled?:unknown,error?:unknown}} BundleInfo
 */
const versionPattern=/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SOURCE_DETAIL=Object.freeze({package:'@deepseek-ai/dsh-plugin-manager',serviceKey:'pluginManager',methods:['listBundles']});
/** Entry ids this inventory writes; older snapshots (loader entry ids) are not a baseline for uninstalls. */
const BUNDLE_ENTRY='bundle:';

/**
 * @param {{
 *  ctx: import('@deepseek-ai/cordis').Context,
 *  store: import('../core/index.js').EventStore,
 *  link: {get(): import('./core-link.js').CoreService|null},
 *  inventoryIntervalMs:number,
 *  now?: ()=>number,
 *  note?: (code:string)=>void,
 * }} options
 */
export function createInventory({ctx,store,link,inventoryIntervalMs,now=Date.now,note=()=>{}}){
  const host=/** @type {{get?(name:string):unknown}} */(/** @type {unknown} */(ctx));
  let tail=Promise.resolve(),lastScanAt=/** @type {string|null} */(null),lastError=/** @type {string|null} */(null),unreadableCount=0,closed=false;
  /** @type {ReturnType<typeof setInterval>|null} */let timer=null;
  const on=/** @type {(name:string,listener:(...args:any[])=>void)=>()=>void} */(ctx.on.bind(ctx));
  const stops=[on('loader/config-update',()=>{backgroundScan();}),on('plugin-manager/changed',()=>{backgroundScan();}),
    on('internal/service',name=>{if(name==='pluginManager'&&lastError==='INVENTORY_SOURCE_UNAVAILABLE')backgroundScan();})];
  /** @returns {{listBundles():Promise<BundleInfo[]>}|null} */
  function manager(){
    try{const value=/** @type {{listBundles?:unknown}|undefined} */(host.get?.('pluginManager'));return value&&typeof value.listBundles==='function'?/** @type {any} */(value):null;}catch{return null;}
  }
  async function scanRaw(){
    if(closed)throw new UsageError('INVENTORY_CLOSED');
    const source=manager();
    if(source===null){lastError='INVENTORY_SOURCE_UNAVAILABLE';throw new UsageError('INVENTORY_SOURCE_UNAVAILABLE');}
    const bundles=await source.listBundles();
    if(!Array.isArray(bundles))throw new UsageError('INVENTORY_FAILED');
    const accepted=new Set((store.getSnapshot().inventory.last?.items??[]).filter(item=>item.entryId.startsWith(BUNDLE_ENTRY)).map(item=>item.hanaRef));
    const scannedAt=new Date(now()).toISOString(),items=[];let unreadable=0;
    for(const bundle of bundles){
      if(bundle===null||typeof bundle!=='object'||bundle.installed!==true||bundle.availability!=='profile')continue;
      if(bundle.error!==undefined||typeof bundle.version!=='string'||!versionPattern.test(bundle.version)||!validLoaderReference(bundle.name,bundle.version)){unreadable++;note('INVENTORY_ENTRY_UNREADABLE');
        // An unreadable bundle cannot prove that a previously accepted install was removed.
        if(typeof bundle.name==='string'&&accepted.has(bundle.name))throw new UsageError('INVENTORY_FAILED');
        continue;}
      const name=/** @type {string} */(bundle.name),version=/** @type {string} */(bundle.version);
      items.push({hanaRef:name,version,entryId:`${BUNDLE_ENTRY}${name}`,disabled:bundle.enabled===false});
    }
    items.sort((a,b)=>a.hanaRef.localeCompare(b.hanaRef)||a.version.localeCompare(b.version));
    const previous=(store.getSnapshot().inventory.last?.items??[]).filter(item=>item.entryId.startsWith(BUNDLE_ENTRY)&&validLoaderReference(item.hanaRef,item.version)),previousKeys=new Set(previous.map(item=>`${item.hanaRef}\0${item.version}`)),currentKeys=new Set(items.map(item=>`${item.hanaRef}\0${item.version}`)),currentNames=new Set(items.map(item=>item.hanaRef));
    const changes=[];
    for(const item of items)if(!previousKeys.has(`${item.hanaRef}\0${item.version}`))changes.push({action:/** @type {const} */('install'),hanaRef:item.hanaRef,version:item.version});
    for(const item of previous)if(!currentNames.has(item.hanaRef)&&!currentKeys.has(`${item.hanaRef}\0${item.version}`))changes.push({action:/** @type {const} */('uninstall'),hanaRef:item.hanaRef,version:item.version});
    const core=link.get(),inputs=[],byId=new Map();let observedDuplicates=0;
    if(core!==null&&core.getConsent()==='granted'){
      const deviceId=core.getDeviceId(),existingById=new Map(store.getSnapshot().events.map(event=>[event.eventId,event]));
      // A withheld/core-absent first scan still records inventory.last. On later consent,
      // current installs without a durable event must become reportable exactly once.
      // Count an existing install as an observed duplicate, but never replay the old
      // event into the store: updateInventory must remain free to prune terminal
      // events after the 90-day retention window.
      for(const item of items){const eventId=eventIdForLoader(deviceId,'install',item.hanaRef,item.version),existing=existingById.get(eventId);if(existing)observedDuplicates++;else if(!changes.some(change=>change.action==='install'&&change.hanaRef===item.hanaRef&&change.version===item.version))changes.push({action:/** @type {const} */('install'),hanaRef:item.hanaRef,version:item.version});}
      for(const change of changes){const eventId=eventIdForLoader(deviceId,change.action,change.hanaRef,change.version),event=signUsageEvent(core,createUsageEvent({deviceId,hanaRef:change.hanaRef,action:change.action,occurredAt:scannedAt,eventId,nonce:eventNonceFromBytes(randomBytes(16)),signature:null,source:'loader',sourcePlugin:null,evidenceRef:`${change.hanaRef}@${change.version}`}));inputs.push(event);byId.set(eventId,change);}
    }
    const committed=await store.updateInventory(scannedAt,items,inputs);lastScanAt=scannedAt;lastError=null;unreadableCount=unreadable;return {scannedAt,events:committed.inserted.map(id=>byId.get(id)),duplicates:observedDuplicates+committed.duplicates,unreadable};
  }
  function scan(){const run=tail.then(scanRaw).catch(error=>{if(!(error instanceof UsageError&&error.code==='INVENTORY_SOURCE_UNAVAILABLE'))lastError='INVENTORY_FAILED';note(lastError??'INVENTORY_FAILED');throw new UsageError('INVENTORY_FAILED');});tail=run.then(()=>{},()=>{});return run;}
  // scan() records failure before a background caller observes its rejection.
  function backgroundScan(){void scan().then(()=>undefined,()=>undefined);}
  async function start(){
    // A missing plugin manager is reported in health and rescanned when the service appears; the timer still runs.
    try{return await scan();}finally{if(!closed&&timer===null){timer=setInterval(()=>{backgroundScan();},inventoryIntervalMs);timer.unref?.();}}
  }
  async function close(){if(closed)return;closed=true;for(const stop of stops)stop();if(timer!==null)clearInterval(timer);await tail;}
  return {scan,start,close,drain:()=>tail,health:()=>({available:lastScanAt!==null&&lastError===null,source:/** @type {const} */('plugin-manager'),lastScanAt,lastError,unreadable:unreadableCount,detail:SOURCE_DETAIL})};
}
