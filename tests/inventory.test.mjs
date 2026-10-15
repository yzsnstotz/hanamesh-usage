import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {root} from './fixtures/helpers.mjs';
const core=await import(pathToFileURL(resolve(root,'lib/core/index.js')).href);let host=null;try{host=await import(pathToFileURL(resolve(root,'lib/host/inventory.js')).href);}catch{}

const DEVICE='If4x36FUomFia_hUBG_SJxt77UtqvkWqWId-9H-XIbk';
class Global{constructor(){this.snapshot={schemaVersion:1,events:[],withdrawal:null,inventory:{last:null}};this.writes=0;}get(){return this.snapshot;}async set(next){this.writes++;this.snapshot=structuredClone(next);}}
/** Shape of @deepseek-ai/dsh-plugin-manager BundleInfo (0.2.1-alpha.2) — only the fields Usage reads. */
function bundle(name,version,{installed=true,availability='profile',enabled=true,error}={}){return {name,version,installed,availability,enabled,official:false,optional:false,removable:true,rows:[],overrides:[],...(error?{error}:{})};}
/** Inventory under a fake Cordis context: `services` mimics ctx.get + the internal/service event. */
function harness({consent='granted',bundles=[bundle('a','1.0.0'),bundle('b','2.0.0')],manager=true,global=new Global(),now}={}){
  let list=bundles,currentConsent=consent;const notes=[];const listeners=new Map();
  const pluginManager={listBundles:async()=>structuredClone(list)};
  const services=new Map(manager?[['pluginManager',pluginManager]]:[]);
  const ctx={get:name=>services.get(name),on:(name,fn)=>{listeners.set(name,fn);return()=>listeners.delete(name);}};
  const service={getConsent:()=>currentConsent,getDeviceId:()=>DEVICE,sign:()=>Buffer.alloc(64)};
  const store=new core.EventStore(global,5000,now??Date.now);
  const inventory=host?.createInventory({ctx,store,link:{get:()=>service},inventoryIntervalMs:300000,now:now??(()=>{let t=0;return()=>Date.parse('2026-09-19T00:00:00.000Z')+t++*1000;})(),note:code=>notes.push(code)});
  return {global,store,inventory,notes,listeners,setBundles:value=>{list=value;},setConsent:value=>{currentConsent=value;},
    provide(){services.set('pluginManager',pluginManager);listeners.get('internal/service')?.('pluginManager',pluginManager);}};
}
const actions=result=>result.events.map(event=>[event.action,event.hanaRef,event.version]);

test('inventory module is present',()=>assert.equal(typeof host?.createInventory,'function'));
test('first scan installs profile bundles, stable/disabled scans add none, upgrade and removal are distinct',async()=>{
  const f=harness();let result=await f.inventory.scan();assert.deepEqual(actions(result),[['install','a','1.0.0'],['install','b','2.0.0']]);assert.equal(f.global.writes,1);
  result=await f.inventory.scan();assert.deepEqual(result.events,[]);assert.equal(result.duplicates,2);
  f.setBundles([bundle('b','2.1.0')]);result=await f.inventory.scan();assert.deepEqual(actions(result),[['install','b','2.1.0'],['uninstall','a','1.0.0']]);
  f.setBundles([bundle('b','2.1.0',{enabled:false})]);result=await f.inventory.scan();assert.deepEqual(result.events,[]);assert.equal(f.store.getSnapshot().inventory.last.items[0].disabled,true);await f.inventory.close();
});
test('installation-supplied and undeclared bundles are not user installs',async()=>{
  const f=harness({bundles:[bundle('@deepseek-ai/dsh-web-app','0.2.1-alpha.2',{installed:false,availability:'installation'}),
    bundle('@deepseek-ai/dsh-base','0.2.1-alpha.2',{installed:true,availability:'installation'}),
    bundle('catalog-entry-not-installed','1.0.0',{installed:false,availability:'missing'}),
    bundle('dsh-no-long-sit','1.2.3')]});
  const result=await f.inventory.scan();assert.deepEqual(actions(result),[['install','dsh-no-long-sit','1.2.3']]);
  assert.deepEqual(f.store.getSnapshot().inventory.last.items.map(item=>item.hanaRef),['dsh-no-long-sit']);await f.inventory.close();
});
test('an unreadable profile bundle is isolated, counted and named; withheld consent updates the snapshot without events',async()=>{
  const f=harness({consent:'withheld',bundles:[bundle('a','1.0.0'),bundle('bad','not-a-version'),bundle('broken','1.0.0',{error:{code:'x'}})]});
  const result=await f.inventory.scan();assert.deepEqual(result.events,[]);assert.equal(result.unreadable,2);
  assert.deepEqual(f.notes,['INVENTORY_ENTRY_UNREADABLE','INVENTORY_ENTRY_UNREADABLE']);
  assert.deepEqual(f.store.getSnapshot().inventory.last.items.map(item=>item.hanaRef),['a']);await f.inventory.close();
});
test('granting consent after a withheld first scan emits the current installs once',async()=>{const f=harness({consent:'withheld'});assert.deepEqual((await f.inventory.scan()).events,[]);f.setConsent('granted');assert.equal((await f.inventory.scan()).events.length,2);assert.deepEqual((await f.inventory.scan()).events,[]);await f.inventory.close();});
test('a snapshot written by the old loader inventory is not a baseline: upgrading emits no uninstalls for built-ins',async()=>{
  const global=new Global();
  global.snapshot.inventory.last={scannedAt:'2026-09-19T00:00:00.000Z',items:[{hanaRef:'@deepseek-ai/dsh-agent',version:'0.2.1-alpha.2',entryId:'agent',disabled:false},{hanaRef:'a',version:'1.0.0',entryId:'a-entry',disabled:false}]};
  const f=harness({global,bundles:[bundle('a','1.0.0')]});
  const result=await f.inventory.scan();assert.deepEqual(actions(result),[['install','a','1.0.0']]);
  assert.deepEqual(f.store.getSnapshot().inventory.last.items,[{hanaRef:'a',version:'1.0.0',entryId:'bundle:a',disabled:false}]);await f.inventory.close();
});
test('upgrading from the loader inventory retracts never-sent install events for packages that were not user installs',async()=>{
  const global=new Global();
  const legacyEvent=(hanaRef,version,state)=>({...core.createUsageEvent({deviceId:DEVICE,hanaRef,action:'install',occurredAt:'2026-10-01T00:00:00.000Z',eventId:core.eventIdForLoader(DEVICE,'install',hanaRef,version),nonce:Buffer.alloc(16).toString('base64url'),signature:Buffer.alloc(64).toString('base64url'),source:'loader',sourcePlugin:null,evidenceRef:`${hanaRef}@${version}`}),upload:{state,code:null,attempts:state==='pending'?0:1,sentAt:state==='pending'?null:'2026-10-01T00:00:01.000Z'}});
  global.snapshot.events=[legacyEvent('@deepseek-ai/dsh-agent','0.2.1-alpha.2','pending'),legacyEvent('a','1.0.0','pending'),legacyEvent('@deepseek-ai/dsh-base','0.2.1-alpha.2','sent')];
  global.snapshot.inventory.last={scannedAt:'2026-10-01T00:00:00.000Z',items:[{hanaRef:'@deepseek-ai/dsh-agent',version:'0.2.1-alpha.2',entryId:'agent',disabled:false},{hanaRef:'a',version:'1.0.0',entryId:'a-entry',disabled:false}]};
  const f=harness({global,bundles:[bundle('a','1.0.0')],now:()=>Date.parse('2026-10-15T00:00:00.000Z')});
  const result=await f.inventory.scan();
  assert.equal(result.retracted,1);assert.deepEqual(result.events,[]);assert.equal(result.duplicates,1);
  assert.deepEqual(f.store.getSnapshot().events.map(event=>[event.hanaRef,event.upload.state]),[['a','pending'],['@deepseek-ai/dsh-base','sent']],'sent history is not rewritten');
  assert.equal((await f.inventory.scan()).retracted,0,'once migrated, nothing more is retracted');await f.inventory.close();
});
test('without the plugin manager the scan fails visibly, and runs when the service appears',async()=>{
  const f=harness({manager:false});
  await assert.rejects(f.inventory.scan(),error=>error.code==='INVENTORY_FAILED');
  assert.equal(f.inventory.health().lastError,'INVENTORY_SOURCE_UNAVAILABLE');assert.equal(f.inventory.health().available,false);
  assert.equal(f.store.getSnapshot().inventory.last,null);
  f.provide();await f.inventory.drain();
  assert.equal(f.inventory.health().lastError,null);assert.deepEqual(f.store.getSnapshot().events.map(event=>event.hanaRef),['a','b']);
  assert.deepEqual(f.inventory.health().detail,{package:'@deepseek-ai/dsh-plugin-manager',serviceKey:'pluginManager',methods:['listBundles']});
  assert.equal(f.inventory.health().source,'plugin-manager');await f.inventory.close();
});
test('a plugin-manager change triggers a rescan',async()=>{
  const f=harness();await f.inventory.scan();f.setBundles([bundle('a','1.0.0'),bundle('b','2.0.0'),bundle('c','3.0.0')]);
  f.listeners.get('plugin-manager/changed')?.({});await f.inventory.drain();
  assert.deepEqual(f.store.getSnapshot().events.map(event=>event.hanaRef).sort(),['a','b','c']);await f.inventory.close();
});
test('stable inventory rescan does not resurrect a terminal install past retention',async()=>{
  const eventId=core.eventIdForLoader(DEVICE,'install','a','1.0.0');
  const expired={...core.createUsageEvent({deviceId:DEVICE,hanaRef:'a',action:'install',occurredAt:'2026-01-01T00:00:00.000Z',eventId,nonce:Buffer.alloc(16).toString('base64url'),signature:Buffer.alloc(64).toString('base64url'),source:'loader',sourcePlugin:null,evidenceRef:'a@1.0.0'}),upload:{state:'sent',code:null,attempts:1,sentAt:'2026-01-01T00:00:01.000Z'}};
  const global=new Global();global.snapshot.events=[expired];global.snapshot.inventory.last={scannedAt:'2026-01-01T00:00:00.000Z',items:[{hanaRef:'a',version:'1.0.0',entryId:'bundle:a',disabled:false}]};
  const now=()=>Date.parse('2026-09-19T00:00:00.000Z');
  const f=harness({global,now,bundles:[bundle('a','1.0.0')]});
  const result=await f.inventory.scan();assert.equal(result.duplicates,1);assert.equal(f.store.getSnapshot().events.length,0);await f.inventory.close();
});
test('uninstall uses the uninstall identity key',async()=>{
  const global=new Global();global.snapshot.inventory.last={scannedAt:'2026-09-18T00:00:00.000Z',items:[{hanaRef:'a',version:'1.0.0',entryId:'bundle:a',disabled:false}]};
  const f=harness({global,bundles:[]});
  await f.inventory.scan();const [event]=f.store.getSnapshot().events;assert.equal(event.eventId,core.eventIdForLoader(DEVICE,'uninstall','a','1.0.0'));await f.inventory.close();
});
