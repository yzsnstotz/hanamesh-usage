// @ts-check
import {createRequire} from 'node:module';
import {readFile,stat} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createUsageEvent,eventIdForLoader,UsageError} from '../core/index.js';
import {signUsageEvent} from './core-link.js';

const packageName=/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;
const versionPattern=/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/** Resolve metadata without importing or executing the observed plugin. @param {string} moduleName @param {string} baseUrl */
export async function inspectPackage(moduleName,baseUrl){
  try{
    if(!packageName.test(moduleName)||typeof baseUrl!=='string'||!baseUrl.startsWith('file:'))return {kind:/** @type {const} */('unreadable')};
    const require=createRequire(baseUrl);let packagePath;
    try{packagePath=require.resolve(`${moduleName}/package.json`);}catch{}
    if(!packagePath){let entryPath;try{entryPath=require.resolve(moduleName);}catch{}if(entryPath){let cursor=dirname(entryPath);for(let i=0;i<32;i++){const candidate=join(cursor,'package.json');try{const metadata=JSON.parse(await readFile(candidate,'utf8'));if(metadata.name===moduleName){packagePath=candidate;break;}}catch{}const parent=dirname(cursor);if(parent===cursor)break;cursor=parent;}}}
    if(!packagePath)return {kind:/** @type {const} */('unreadable')};const info=await stat(packagePath);if(!info.isFile()||info.size>256*1024)return {kind:/** @type {const} */('unreadable')};
    const metadata=JSON.parse(await readFile(packagePath,'utf8'));if(metadata.name!==moduleName||typeof metadata.version!=='string'||!versionPattern.test(metadata.version))return {kind:/** @type {const} */('unreadable')};
    return {kind:/** @type {const} */('present'),name:metadata.name,version:metadata.version};
  }catch{return {kind:/** @type {const} */('unreadable')};}
}

/**
 * @param {{
 *  ctx: import('@deepseek-ai/cordis').Context,
 *  store: import('../core/index.js').EventStore,
 *  link: {get(): import('../../docs/contracts/hanamesh-core/contract.js').HanaMeshCoreContract|null},
 *  inventoryIntervalMs:number,
 *  inspector?: typeof inspectPackage,
 *  now?: ()=>number,
 *  note?: (code:string)=>void,
 * }} options
 */
export function createInventory({ctx,store,link,inventoryIntervalMs,inspector=inspectPackage,now=Date.now,note=()=>{}}){
  const holder=/** @type {{loader?:{entries():Iterable<any>},baseUrl?:string}} */(/** @type {unknown} */(ctx));
  if(typeof holder.loader?.entries!=='function')throw new UsageError('LOADER_UNAVAILABLE');
  const loader=holder.loader;
  let tail=Promise.resolve(),lastScanAt=/** @type {string|null} */(null),closed=false;
  /** @type {ReturnType<typeof setInterval>|null} */let timer=null;
  const on=/** @type {(name:string,listener:()=>void)=>()=>void} */(ctx.on.bind(ctx));
  const stopUpdate=on('loader/config-update',()=>{void scan();});
  async function scanRaw(){
    if(closed)throw new UsageError('INVENTORY_CLOSED');const scannedAt=new Date(now()).toISOString(),items=[];let unreadable=0;
    for(const entry of loader.entries()){
      if(entry?.options?.group)continue;const moduleName=entry?.options?.name,entryId=entry?.id;
      if(typeof moduleName!=='string'||typeof entryId!=='string'){unreadable++;note('INVENTORY_ENTRY_UNREADABLE');continue;}
      const baseUrl=entry?.parent?.tree?.ctx?.baseUrl??holder.baseUrl??import.meta.url,result=await inspector(moduleName,baseUrl);
      if(result.kind!=='present'||result.name!==moduleName){unreadable++;note('INVENTORY_ENTRY_UNREADABLE');continue;}
      items.push({hanaRef:result.name,version:result.version,entryId,disabled:Boolean(entry.disabled)});
    }
    items.sort((a,b)=>a.hanaRef.localeCompare(b.hanaRef)||a.version.localeCompare(b.version)||a.entryId.localeCompare(b.entryId));
    const previous=store.getSnapshot().inventory.last?.items??[],previousKeys=new Set(previous.map(item=>`${item.hanaRef}\0${item.version}`)),currentKeys=new Set(items.map(item=>`${item.hanaRef}\0${item.version}`)),currentNames=new Set(items.map(item=>item.hanaRef));
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
      for(const change of changes){const eventId=eventIdForLoader(deviceId,change.action,change.hanaRef,change.version),event=signUsageEvent(core,createUsageEvent({deviceId,hanaRef:change.hanaRef,action:change.action,occurredAt:scannedAt,eventId,nonce:randomBytes(16).toString('base64url'),signature:null,source:'loader',sourcePlugin:null,evidenceRef:`${change.hanaRef}@${change.version}`}));inputs.push(event);byId.set(eventId,change);}
    }
    const committed=await store.updateInventory(scannedAt,items,inputs);lastScanAt=scannedAt;return {scannedAt,events:committed.inserted.map(id=>byId.get(id)),duplicates:observedDuplicates+committed.duplicates,unreadable};
  }
  function scan(){const run=tail.then(scanRaw);tail=run.then(()=>{},()=>{});return run;}
  async function start(){const result=await scan();if(!closed){timer=setInterval(()=>{void scan();},inventoryIntervalMs);timer.unref?.();}return result;}
  async function close(){if(closed)return;closed=true;stopUpdate();if(timer!==null)clearInterval(timer);await tail;}
  return {scan,start,close,drain:()=>tail,health:()=>({available:true,source:/** @type {const} */('loader'),lastScanAt,detail:{package:'@deepseek-ai/cordis',serviceKey:'loader',methods:['entries']}})};
}
