import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureHost} from './fixtures/host.mjs';
import {root} from './fixtures/helpers.mjs';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
const core=await import(pathToFileURL(join(root,'lib/core/index.js')).href);
const {commandPackage}=await import(pathToFileURL(join(root,'lib/host/command-source.js')).href);
const {createInventory}=await import(pathToFileURL(join(root,'lib/host/inventory.js')).href);

class Global {
  constructor(){this.snapshot={schemaVersion:1,events:[],withdrawal:null,inventory:{last:null}};this.writes=0;}
  get(){return this.snapshot;}
  async set(next){this.writes++;this.snapshot=structuredClone(next);}
}
const event=n=>core.createUsageEvent({deviceId:'fixture_device',hanaRef:'example',action:'use',occurredAt:'2026-09-19T00:00:00.000Z',eventId:core.eventIdForSeat('fixture_device','example',String(n)),nonce:'nAQIDBAUGBwgJCgsMDQ4PEA',signature:null,source:'seat',sourcePlugin:'example',evidenceRef:String(n)});

test('Q61 defaults are named and visible through the Usage-owned panel',async()=>{
  assert.equal(core.DEFAULT_EVENT_RETENTION_DAYS,90);assert.equal(core.DEFAULT_QUERY_LIMIT,100);
  const h=await fixtureHost();
  try{assert.deepEqual(h.api.panel().policy,{eventRetentionDays:90,queryLimit:100,maxQueryLimit:1000});}finally{await h.close();}
});
test('Q61 retention configuration preserves pending and prunes only expired terminal events',async()=>{
  const g=new Global();let now=Date.parse('2026-09-22T00:00:00.000Z');
  const store=new core.EventStore(g,5000,()=>now,2,1);
  await store.put(event(1));await store.put(event(2));
  await store.applyUpload([event(1).eventId],{accepted:1,duplicates:0,rejected:[],durability:'committed'},'2026-09-19T00:00:00.000Z');
  await store.updateInventory(new Date(now).toISOString(),[],[]);
  assert.deepEqual(store.getSnapshot().events.map(e=>e.eventId),[event(2).eventId]);
  await store.put(event(3));assert.equal(store.query().events.length,1);assert.equal(store.query({limit:2}).events.length,2);
  assert.throws(()=>new core.EventStore(new Global(),5000,Date.now,0),{code:'INVALID_RETENTION'});
  assert.throws(()=>new core.EventStore(new Global(),5000,Date.now,90,1001),{code:'INVALID_FILTER'});
});
test('Q61 declarations use configured default while caller limit remains authoritative',()=>{
  const records=Array.from({length:3},(_,i)=>core.projectTerminal({sessionId:'fixture-'+i,events:[{type:'turn/end',seq:0,time:1000,data:{turn:0,reason:{kind:'completed'}}}],inheritedEventCount:0,sampleKind:'synthetic'},{type:'turn/end',seq:0,time:1000,data:{turn:0,reason:{kind:'completed'}}}));
  assert.equal(core.queryRecords(records,{},1).records.length,1);
  assert.equal(core.queryRecords(records,{limit:2},1).records.length,2);
});
test('Q61 command-source service or Loader read failure is a bounded visible reason',()=>{
  const source={entryId:'fixture',moduleName:'example'};
  for(const ctx of [{get(){throw Error('PRIVATE_SOURCE_SHOULD_NOT_APPEAR');}}, {get:()=>({packageOf(){throw Error('PRIVATE_SOURCE_SHOULD_NOT_APPEAR');}}),loader:{entries(){throw Error('PRIVATE_SOURCE_SHOULD_NOT_APPEAR');}}}]){
    const notes=[];assert.equal(commandPackage(ctx,source,code=>notes.push(code)),null);
    assert.deepEqual(notes,['COMMAND_SOURCE_UNREADABLE']);assert(!JSON.stringify(notes).includes('PRIVATE'));
  }
});
test('Q61 missing owner stays gated and explains rejection',()=>{
  const notes=[];
  assert.equal(commandPackage({get:()=>({packageOf:()=>null}),loader:{entries:()=>[].values()}},{entryId:'fixture',moduleName:'example'},code=>notes.push(code)),null);
  assert.deepEqual(notes,['COMMAND_SOURCE_OWNER_NOT_FOUND']);
});
test('Q61 inventory scan failure is visible, preserves snapshot, and still releases listeners',async()=>{
  const g=new Global(),notes=[];let stopped=0;
  const manager={listBundles:async()=>{throw Error('PRIVATE_SOURCE_SHOULD_NOT_APPEAR');}};
  const inventory=createInventory({ctx:{get:name=>name==='pluginManager'?manager:undefined,on:()=>()=>stopped++},store:new core.EventStore(g),link:{get:()=>null},inventoryIntervalMs:300000,note:code=>notes.push(code)});
  await assert.rejects(inventory.scan());
  assert.equal(inventory.health().lastError,'INVENTORY_FAILED');assert.equal(inventory.health().available,false);
  assert.deepEqual(notes,['INVENTORY_FAILED']);assert.equal(g.writes,0);
  await inventory.close();assert.equal(stopped,3);
});

test('Q61 configured policy is visible without changing the formal health shape',async()=>{
 const h=await fixtureHost({eventRetentionDays:30,queryLimit:12});
 try {assert.deepEqual(h.api.panel().policy,{eventRetentionDays:30,queryLimit:12,maxQueryLimit:1000});assert(!Object.hasOwn(h.api.health(),'policy'));}
 finally{await h.close();}
});
test('Q61 plugin-manager background rejection is handled, visible in public health, and does not write an empty snapshot',async()=>{
 const h=await fixtureHost();
 try {
  const previous=h.eg.get(),writes=h.eg.writes;
  h.ctx.get=name=>name==='pluginManager'?{listBundles:async()=>{throw Error('PRIVATE_MUST_NOT_SERIALIZE');}}:undefined;
  h.handlers.get('plugin-manager/changed')();await h.api.drain();
  assert.equal(h.api.health().inventory.available,false);assert.equal(h.api.health().failures.INVENTORY_FAILED,1);
  assert.deepEqual(h.eg.get(),previous);assert.equal(h.eg.writes,writes);assert(!JSON.stringify(h.api.health()).includes('PRIVATE'));
 }finally{await h.close();assert.equal(h.handlers.has('plugin-manager/changed'),false);}
});
test('Q61 invalid policy is rejected before any Context/storage effect',async()=>{
 const {apply}=await import(pathToFileURL(join(root,'lib/host/index.js')).href);
 for(const config of [{eventRetentionDays:0},{eventRetentionDays:0.5},{eventRetentionDays:NaN},{queryLimit:0},{queryLimit:1001}])await assert.rejects(apply({},config),{code:'INVALID_CONFIG'});
});

test('Q61 an unreadable bundle cannot prove removal of a previously accepted install',async()=>{
 for(const broken of [{version:'not-a-version'},{error:{code:'BUNDLE_LOAD_FAILED'}},{version:undefined}]){
  const g=new Global();g.snapshot.inventory.last={scannedAt:'2026-09-19T00:00:00.000Z',items:[{hanaRef:'example',version:'1.0.0',entryId:'bundle:example',disabled:false}]};
  const before=structuredClone(g.get()),notes=[];let signatures=0;
  const manager={listBundles:async()=>[{name:'example',version:'1.0.0',installed:true,availability:'profile',enabled:true,...broken}]};
  const ctx={get:name=>name==='pluginManager'?manager:undefined,on:()=>()=>{}};
  const inventory=createInventory({ctx,store:new core.EventStore(g),link:{get:()=>({getConsent:()=> 'granted',getDeviceId:()=> 'If4x36FUomFia_hUBG_SJxt77UtqvkWqWId-9H-XIbk',sign:()=>{signatures++;return Buffer.alloc(64);}})},inventoryIntervalMs:300000,note:code=>notes.push(code)});
  try{await assert.rejects(inventory.scan(),{code:'INVENTORY_FAILED'});assert.equal(g.writes,0);assert.deepEqual(g.get(),before);assert.equal(signatures,0);assert.equal(inventory.health().available,false);assert(notes.includes('INVENTORY_FAILED'));}
  finally{await inventory.close();}
 }
});
