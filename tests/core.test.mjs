import test from 'node:test';
import assert from 'node:assert/strict';
import { core, session, record, withUsage, MemoryGlobal } from './fixtures/helpers.mjs';
import { REGISTRY_VERSION, isSnapshot } from '../lib/core/index.js';

test('T03 FIXTURE: complete FR-10 schema, source tuple and pins',()=>{
  const r=record({parentSession:'fixture-parent'}); core.validateDeclaration(r);
  assert.equal(r.eventRef,JSON.stringify(['fixture-session-1','turn/end',0]));
  assert.equal(r.lineage.parentSession.value,'fixture-parent');
  assert.equal(r.lineage.parentExecution.state,'unavailable');
  assert.equal(r.lineage.rootExecution.state,'unavailable');
  assert.equal(r.provenance.registryVersion,REGISTRY_VERSION);
  assert.equal(r.provenance.sampleKind,'synthetic');
  for(const key of ['evidenceCommitment','signature','policyVersion'])assert.equal(r[key],null);
});
test('T04 FIXTURE: unknown is null with reason, NOT zero',()=>{
  const r=record({provider:null});
  assert.equal(r.provider.state,'unavailable');
  assert.deepEqual(r.usage.totalTokens,{state:'unavailable',value:null,reason:'usage_not_reported'});
  const q=core.queryRecords([r]);
  assert.equal(q.aggregate.totalTokens.reported.sum,null);
  assert.equal(q.aggregate.totalTokens.reported.count,0);
  assert.equal(q.aggregate.totalTokens.unavailable,1);
  assert.match(core.renderUsage(q),/— unavailable/);
});
test('T04 FIXTURE: actual normalized zero stays reported, empty bucket stays null',()=>{
  const zero=withUsage(record(),'reported',0);
  core.validateDeclaration(zero);
  assert.equal(core.metricTotal([zero.usage.totalTokens]).reported.sum,0);
  assert.match(core.formatObservation(zero.usage.totalTokens),/^0 reported$/);
  assert.notEqual(core.formatObservation(zero.usage.totalTokens),core.formatObservation(record().usage.totalTokens));
  assert.equal(core.metricTotal([]).reported.sum,null);
});
test('T06 FIXTURE: reported and estimated NEVER add together',()=>{
  const a=withUsage(record({id:'fixture-reported'}),'reported',7),b=withUsage(record({id:'fixture-estimated'}),'estimated',3),c=record({id:'fixture-missing'});
  const q=core.queryRecords([a,b,c]);
  assert.deepEqual(q.aggregate.totalTokens,{reported:{sum:7,count:1},estimated:{sum:3,count:1},unavailable:1});
  assert.equal(Object.hasOwn(q.aggregate.totalTokens,'sum'),false);
  assert.match(core.renderUsage(q),/reported（条数）/);assert.match(core.renderUsage(q),/estimated（条数）/);
});
test('T07 FIXTURE: terminal result vocabulary preserves failures and interruptions',()=>{
  for(const [kind,value] of [['completed','completed'],['error','failed'],['aborted','interrupted'],['interrupted','interrupted']]){
    const r=record({kind});assert.equal(r.result.value,value);core.validateDeclaration(r);
  }
  for(const kind of ['blocked','max-tokens','future-extension'])assert.equal(record({kind}).result.state,'unavailable');
  assert.equal(record({kind:'error'}).error.value,'runtime_error_details_withheld');
});
test('malformed TokenUsage is unavailable rather than guessed or zero',()=>{
  const r=record({usage:true});assert.equal(r.usage.inputTokens.reason,'invalid_value');assert.equal(r.usage.totalTokens.reason,'not_provided');
});
test('pinned DSH TokenUsage reports disjoint counters across two assistant messages',()=>{
  const s=session();const end=s.events.pop();
  s.events.push({type:'assistant/message',seq:2,time:1030,data:{turn:0,step:0,usage:{inputTokens:2,outputTokens:3,totalTokens:5},message:{content:'SYNTHETIC_SECRET'}}});
  s.events.push({type:'assistant/message',seq:3,time:1050,data:{turn:0,step:1,usage:{inputTokens:4,outputTokens:3,totalTokens:7},message:{content:'SYNTHETIC_SECRET'}}});
  end.seq=4;s.events.push(end);
  const r=core.projectTerminal(s,end);core.validateDeclaration(r);
  assert.deepEqual([r.usage.inputTokens.value,r.usage.outputTokens.value,r.usage.totalTokens.value],[6,6,12]);
  assert.equal(r.usage.inputTokens.source,'session.assistant/message');
  assert.doesNotMatch(JSON.stringify(r),/SYNTHETIC_SECRET/);
  s.events[3].data.usage.totalTokens=undefined;
  assert.equal(core.projectTerminal(s,end).usage.totalTokens.state,'unavailable');
});
test('attribution reads immutable binding, invalid binding ids fail closed',()=>{
  const s=session();s.binding.sessionId='different';assert.throws(()=>core.projectTerminal(s,s.events.at(-1)),{code:'BINDING_ID_MISMATCH'});
  delete s.binding;const r=core.projectTerminal(s,s.events.at(-1));assert.equal(r.executor.id.reason,'binding_unavailable');
});
test('fork prefix is not a new execution; source identities are not synthesized',()=>{
  const s=session({inheritedEventCount:3});assert.throws(()=>core.projectTerminal(s,s.events.at(-1)),{code:'NOT_OWN_TERMINAL'});
  assert.throws(()=>core.eventReference('/home/example',0),{code:'INVALID_SOURCE_ID'});
  assert.throws(()=>core.eventReference('fixture-valid',-1),{code:'INVALID_TURN'});
  assert.notEqual(core.eventReference('fixture-valid',1),core.eventReference('fixture-valid',2));
});
test('route change stays unavailable instead of attributing to last model',()=>{
  const s=session();const end=s.events.pop();s.events.push({type:'request/context',seq:2,time:1020,data:{provider:'fixture-other',model:'fixture-model-2'}});end.seq=3;s.events.push(end);
  assert.equal(core.projectTerminal(s,end).provider.reason,'multiple_routes');
});
test('no start time never infers wall clock or creates duration',()=>{
  const s=session();s.events=s.events.filter(e=>e.type!=='turn/start');const r=core.projectTerminal(s,s.events.at(-1));assert.equal(r.time.startedAt.state,'unavailable');
});
test('T08 FIXTURE: concurrent replay has one publication, restart still dedups',async()=>{
  const global=new MemoryGlobal(),store=new core.UsageStore(global),r=record();
  const results=await Promise.all(Array.from({length:40},()=>store.put(r)));
  assert.equal(results.filter(x=>x==='inserted').length,1);assert.equal(global.writes,1);assert.equal(store.query().total,1);
  const next=new core.UsageStore(global);assert.equal(await next.put(r),'duplicate');assert.equal(next.query().total,1);
});
test('concurrent different source turns retain both, no lost write',async()=>{
  const g=new MemoryGlobal(),store=new core.UsageStore(g);await Promise.all([store.put(record()),store.put(record({turn:1}))]);assert.equal(store.query().total,2);assert.equal(g.writes,2);
});
test('failed durable write leaves old snapshot and can be retried',async()=>{
  const g=new MemoryGlobal(),store=new core.UsageStore(g);g.fail=true;await assert.rejects(store.put(record()));assert.equal(store.query().total,0);g.fail=false;await store.put(record());assert.equal(store.query().total,1);
});
test('immutable input and query results cannot mutate authoritative snapshot',async()=>{
  const g=new MemoryGlobal(),store=new core.UsageStore(g),r=record();const put=store.put(r);r.execution.turn=9;await put;
  const q=store.query();q.records[0].execution.turn=8;assert.equal(store.query().records[0].execution.turn,0);
});
test('identity conflict refuses rewrite of terminal fact',async()=>{
  const store=new core.UsageStore(new MemoryGlobal());await store.put(record());await assert.rejects(store.put(record({kind:'error'})),{code:'SOURCE_IDENTITY_CONFLICT'});assert.equal(store.query().records[0].result.value,'completed');
});
test('capacity refusal does not evict dedup history',async()=>{
  const store=new core.UsageStore(new MemoryGlobal(),1);await store.put(record());await assert.rejects(store.put(record({turn:1})),{code:'CAPACITY_REACHED'});assert.equal(await store.put(record()),'duplicate');
});
test('closing denies new writes and new queries',async()=>{
  const store=new core.UsageStore(new MemoryGlobal());await store.put(record());await store.close();await assert.rejects(store.put(record()),{code:'STORE_CLOSED'});assert.throws(()=>store.query(),{code:'STORE_CLOSED'});
});
test('filters and stable pagination aggregate all matched rows',()=>{
  const rs=[withUsage(record({turn:0}),'reported',2),withUsage(record({turn:1,kind:'error'}),'reported',3)];
  const q=core.queryRecords(rs,{executor:'fixture-native',from:1100,to:1100,source:'registry-session-log',quality:'reported',limit:1});assert.equal(q.records.length,1);assert.equal(q.total,2);assert.equal(q.aggregate.totalTokens.reported.sum,5);
  assert.equal(core.queryRecords(rs,{result:'failed'}).total,1);assert.equal(core.queryRecords(rs,{from:1101}).total,0);
  for(const bad of [{limit:0},{offset:-1},{limit:Infinity},{from:5,to:4},{source:'cloud'},{result:'success'},{quality:'guessed'},{prompt:'content'}])assert.throws(()=>core.validateFilter(bad),{code:'INVALID_FILTER'});
});
test('invalid measurements are not treated as zero; overflow is explicit',()=>{
  for(const v of [null,undefined,NaN,Infinity,-1,1.5,'3'])assert.equal(core.numberValue(v,'reported','synthetic.fixture','test').state,'unavailable');
  assert.throws(()=>core.metricTotal([Number.MAX_SAFE_INTEGER,1].map(v=>core.numberValue(v,'reported','synthetic.fixture','test'))),{code:'AGGREGATE_OVERFLOW'});
});
test('corrupt/unknown fields and duplicate stored identities fail closed',()=>{
  const r=record();assert.throws(()=>core.validateDeclaration({...r,prompt:'content'}));
  const invalid=structuredClone(r);invalid.result.value='failed';assert.throws(()=>core.validateDeclaration(invalid));
  assert.throws(()=>core.validateSnapshot({schemaVersion:1,records:[r,r]}));assert.equal(core.isSnapshot(null),false);
});
test('remote four-state labels remain distinct and prototype keys are refused',()=>{
  assert.equal(new Set(['unknown','stale','revoked','unreachable'].map(core.remoteLabel)).size,4);
  assert.throws(()=>core.remoteLabel('__proto__'),{code:'INVALID_REMOTE_STATE'});
});

test('T12 durability: a stored snapshot recorded under an OLDER Registry version still validates (a re-pin must never make the host unbootable on its own data)', () => {
  const older = JSON.parse(JSON.stringify(record()));
  older.provenance.registryVersion = '0.1.0-rc.2';
  assert.equal(isSnapshot({ schemaVersion: 1, records: [older] }), true);
  const garbage = JSON.parse(JSON.stringify(record())); garbage.provenance.registryVersion = 'not a version';
  assert.equal(isSnapshot({ schemaVersion: 1, records: [garbage] }), false);
});

test('U03 durability: a stored snapshot recorded under another non-empty DSH version still validates', () => {
  const older = JSON.parse(JSON.stringify(record()));
  older.provenance.dshVersion = '0.1.4';
  assert.equal(isSnapshot({ schemaVersion: 1, records: [older] }), true);
  const empty = JSON.parse(JSON.stringify(record())); empty.provenance.dshVersion = '';
  assert.equal(isSnapshot({ schemaVersion: 1, records: [empty] }), false);
});
