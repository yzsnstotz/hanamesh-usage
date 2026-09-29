import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {root} from './fixtures/helpers.mjs';
const core=await import(pathToFileURL(resolve(root,'lib/core/index.js')).href);let host=null;try{host=await import(pathToFileURL(resolve(root,'lib/host/inventory.js')).href);}catch{}

class Global{constructor(){this.snapshot={schemaVersion:1,events:[],withdrawal:null,inventory:{last:null}};this.writes=0;}get(){return this.snapshot;}async set(next){this.writes++;this.snapshot=structuredClone(next);}}
function entry(id,name,{disabled=false,baseUrl='file:///fixture/'}={}){return {id,options:{name},disabled,fiber:{state:disabled?4:2},parent:{tree:{ctx:{baseUrl}}}};}
function fixture({consent='granted'}={}){
  const global=new Global(),store=new core.EventStore(global),rows=[],unreadable=[];let entries=[entry('a','a'),entry('b','b')],currentConsent=consent;const versions=new Map([['a','1.0.0'],['b','2.0.0']]);
  const ctx={loader:{entries:()=>entries.values()},on:()=>()=>{}};const service={getConsent:()=>currentConsent,getDeviceId:()=> 'device_FIXTURE',sign:()=>Buffer.alloc(64)};const link={get:()=>service};
  const inventory=host?.createInventory({ctx,store,link,inventoryIntervalMs:300000,inspector:async name=>versions.has(name)?{kind:'present',name,version:versions.get(name)}:{kind:'unreadable'},now:(()=>{let time=0;return()=>Date.parse('2026-09-19T00:00:00.000Z')+time++*1000;})(),note:code=>unreadable.push(code)});
  return {global,store,inventory,unreadable,setEntries:value=>{entries=value;},setConsent:value=>{currentConsent=value;},versions,rows};
}

test('U19 inventory module is present',()=>assert.equal(typeof host?.createInventory,'function'));
test('U19 first scan installs all, stable/disabled scans add none, upgrade and removal are distinct',async()=>{
  const f=fixture();let result=await f.inventory.scan();assert.deepEqual(result.events.map(event=>[event.action,event.hanaRef,event.version]),[['install','a','1.0.0'],['install','b','2.0.0']]);assert.equal(f.global.writes,1);
  result=await f.inventory.scan();assert.deepEqual(result.events,[]);assert.equal(result.duplicates,2);
  f.versions.set('b','2.1.0');f.setEntries([entry('b','b')]);result=await f.inventory.scan();assert.deepEqual(result.events.map(event=>[event.action,event.hanaRef,event.version]),[['install','b','2.1.0'],['uninstall','a','1.0.0']]);
  f.setEntries([entry('b','b',{disabled:true})]);result=await f.inventory.scan();assert.deepEqual(result.events,[]);assert.equal(f.store.getSnapshot().inventory.last.items[0].disabled,true);await f.inventory.close();
});
test('U19 unreadable entries are isolated and withheld consent updates snapshot without events',async()=>{
  const f=fixture({consent:'withheld'});f.setEntries([entry('a','a'),entry('bad','bad')]);const result=await f.inventory.scan();assert.deepEqual(result.events,[]);assert.equal(result.unreadable,1);assert.deepEqual(f.unreadable,['INVENTORY_ENTRY_UNREADABLE']);assert.deepEqual(f.store.getSnapshot().inventory.last.items.map(item=>item.hanaRef),['a']);await f.inventory.close();
});
test('U19 granting consent after a withheld first scan emits the current installs once',async()=>{const f=fixture({consent:'withheld'});assert.deepEqual((await f.inventory.scan()).events,[]);f.setConsent('granted');assert.equal((await f.inventory.scan()).events.length,2);assert.deepEqual((await f.inventory.scan()).events,[]);await f.inventory.close();});
test('U08 stable inventory rescan does not resurrect a terminal install past retention',async()=>{
  const eventId=core.eventIdForLoader('device_FIXTURE','install','a','1.0.0');
  const expired={...core.createUsageEvent({deviceId:'device_FIXTURE',hanaRef:'a',action:'install',occurredAt:'2026-01-01T00:00:00.000Z',eventId,nonce:Buffer.alloc(16).toString('base64url'),signature:Buffer.alloc(64).toString('base64url'),source:'loader',sourcePlugin:null,evidenceRef:'a@1.0.0'}),upload:{state:'sent',code:null,attempts:1,sentAt:'2026-01-01T00:00:01.000Z'}};
  const global=new Global();global.snapshot.events=[expired];global.snapshot.inventory.last={scannedAt:'2026-01-01T00:00:00.000Z',items:[{hanaRef:'a',version:'1.0.0',entryId:'a',disabled:false}]};
  const store=new core.EventStore(global,5000,()=>Date.parse('2026-09-19T00:00:00.000Z')),ctx={loader:{entries:()=>[entry('a','a')].values()},on:()=>()=>{}},service={getConsent:()=> 'granted',getDeviceId:()=> 'device_FIXTURE',sign:()=>Buffer.alloc(64)};
  const inventory=host.createInventory({ctx,store,link:{get:()=>service},inventoryIntervalMs:300000,inspector:async()=>({kind:'present',name:'a',version:'1.0.0'}),now:()=>Date.parse('2026-09-19T00:00:00.000Z')});
  const result=await inventory.scan();assert.equal(result.duplicates,1);assert.equal(store.getSnapshot().events.length,0);await inventory.close();
});
test('U19 uninstall uses the uninstall identity key',async()=>{
  const global=new Global();global.snapshot.inventory.last={scannedAt:'2026-09-18T00:00:00.000Z',items:[{hanaRef:'a',version:'1.0.0',entryId:'a',disabled:false}]};
  const store=new core.EventStore(global),ctx={loader:{entries:()=>[].values()},on:()=>()=>{}},service={getConsent:()=> 'granted',getDeviceId:()=> 'device_FIXTURE',sign:()=>Buffer.alloc(64)};
  const inventory=host.createInventory({ctx,store,link:{get:()=>service},inventoryIntervalMs:300000,now:()=>Date.parse('2026-09-19T00:00:00.000Z')});
  await inventory.scan();const [event]=store.getSnapshot().events;assert.equal(event.eventId,core.eventIdForLoader('device_FIXTURE','uninstall','a','1.0.0'));await inventory.close();
});

async function subpathFixture(run){
  const dir=await mkdtemp(join(tmpdir(),'usage-inventory-subpath-'));
  try{
    const packageDir=join(dir,'node_modules/@hanamesh/app-vibe-trading');await mkdir(packageDir,{recursive:true});
    await writeFile(join(packageDir,'package.json'),JSON.stringify({name:'@hanamesh/app-vibe-trading',version:'0.1.0-rc.27',type:'module',exports:{'./dsh':'./dsh.js','./package.json':'./package.json'}}));
    await writeFile(join(packageDir,'dsh.js'),"throw new Error('INSPECTOR_MUST_NOT_EXECUTE_PLUGIN');");
    await run(pathToFileURL(join(dir,'profile.js')).href);
  }finally{await rm(dir,{recursive:true,force:true});}
}
test('U19 exported module subpath resolves actual package metadata without executing plugin',async()=>subpathFixture(async baseUrl=>{
  assert.deepEqual(await host.inspectPackage('@hanamesh/app-vibe-trading/dsh',baseUrl),{kind:'present',name:'@hanamesh/app-vibe-trading',version:'0.1.0-rc.27'});
  assert.deepEqual(await host.inspectPackage('@hanamesh/app-vibe-trading/not-exported',baseUrl),{kind:'unreadable'});
  for(const bad of ['@hanamesh/app-vibe-trading/../dsh','@hanamesh/app-vibe-trading/./dsh','@hanamesh/app-vibe-trading//dsh','@hanamesh/app-vibe-trading/%2e%2e/dsh','@hanamesh/app-vibe-trading/dsh?x','@hanamesh/app-vibe-trading/dsh#x','https://example/dsh','file:///tmp/dsh','../dsh','/tmp/dsh','@hanamesh/app-vibe-trading/\\dsh'])assert.deepEqual(await host.inspectPackage(bad,baseUrl),{kind:'unreadable'},bad);
}));
test('U19 subpath inventory uses actual package identity and deduplicates across root and subpath entries',async()=>subpathFixture(async baseUrl=>{
  const global=new Global(),store=new core.EventStore(global);let entries=[entry('vibe','@hanamesh/app-vibe-trading/dsh',{baseUrl})];
  const ctx={loader:{entries:()=>entries.values()},on:()=>()=>{}},service={getConsent:()=> 'granted',getDeviceId:()=> 'device_FIXTURE',sign:()=>Buffer.alloc(64)};
  const inventory=host.createInventory({ctx,store,link:{get:()=>service},inventoryIntervalMs:300000,now:()=>Date.parse('2026-09-29T00:00:00.000Z')});
  try{
    const result=await inventory.scan();assert.equal(result.unreadable,0);assert.deepEqual(result.events,[{action:'install',hanaRef:'@hanamesh/app-vibe-trading',version:'0.1.0-rc.27'}]);
    assert.equal(store.getSnapshot().events[0].eventId,core.eventIdForLoader('device_FIXTURE','install','@hanamesh/app-vibe-trading','0.1.0-rc.27'));
    entries=[entry('metadata','@hanamesh/app-vibe-trading',{baseUrl})];assert.deepEqual((await inventory.scan()).events,[]);
    entries=[];assert.deepEqual((await inventory.scan()).events,[{action:'uninstall',hanaRef:'@hanamesh/app-vibe-trading',version:'0.1.0-rc.27'}]);
  }finally{await inventory.close();}
}));

test('U19 subpath fallback finds package metadata when package.json is not exported',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'usage-inventory-fallback-'));
  try{
    const packageDir=join(dir,'node_modules/plain-hana');await mkdir(join(packageDir,'lib'),{recursive:true});
    await writeFile(join(packageDir,'package.json'),JSON.stringify({name:'plain-hana',version:'1.2.3',exports:{'./lib/dsh':'./lib/dsh.js'}}));
    await writeFile(join(packageDir,'lib/dsh.js'),"throw new Error('INSPECTOR_MUST_NOT_EXECUTE_PLUGIN');");
    const baseUrl=pathToFileURL(join(dir,'profile.js')).href;
    assert.deepEqual(await host.inspectPackage('plain-hana/lib/dsh',baseUrl),{kind:'present',name:'plain-hana',version:'1.2.3'});
    await writeFile(join(packageDir,'package.json'),JSON.stringify({name:'other-package',version:'1.2.3',exports:{'./lib/dsh':'./lib/dsh.js'}}));
    assert.deepEqual(await host.inspectPackage('plain-hana/lib/dsh',baseUrl),{kind:'unreadable'});
  }finally{await rm(dir,{recursive:true,force:true});}
});
