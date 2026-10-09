import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureHost} from './fixtures/host.mjs';

const source={entryId:'include:ordinary-page',moduleName:'ordinary-plugin/client',packageName:'ordinary-plugin'};
const loaderEntries=[{id:source.entryId,options:{name:source.moduleName},parent:{tree:{ctx:{baseUrl:'file:///isolated-profile/cordis.yml'}}}}];
const canonical={name:source.packageName,version:'1.0.0',manifest:{name:source.packageName,version:'1.0.0'}};
const entry={entryId:source.entryId,moduleName:source.moduleName,enabled:true,fiberPhase:'active'};
const bundle={name:'ordinary-plugin',installed:true,enabled:true,removable:true,rows:[entry]};
const setup=(options={})=>fixtureHost({bound:false,loaderEntries,packageOf:()=>canonical,pluginInventory:{list:async()=>({entries:[entry]})},pluginManager:{listBundles:async()=>[bundle]},...options});
const fact=(operationId='open-1')=>({operationId,surface:'settings.section',source,occurredAt:Date.now()});

test('page opened records only after consent, deduplicates operation and records a new open',async()=>{
  const h=await setup();try{
    const emit=h.handlers.get('client-page/opened');assert.equal(typeof emit,'function');
    emit(fact('before'));await h.api.drain();assert.equal(h.api.events().total,0);
    h.setConsent('granted');await h.api.drain();const opened=fact();emit(opened);emit(opened);emit(fact('open-2'));await h.api.drain();
    const events=h.api.events().events;assert.equal(events.length,2);
    assert(events.every(e=>e.action==='open'&&e.hanaRef===source.packageName&&e.sourcePlugin===source.packageName&&Buffer.from(e.signature,'base64url').length===64));
    assert.deepEqual(new Set(events.map(e=>e.evidenceRef)),new Set(['page:open-1','page:open-2']));
    h.setConsent('withheld');await h.api.drain();emit(fact('after'));await h.api.drain();assert.equal(h.api.events().total,0);
  }finally{await h.close();}
});

test('page source must match canonical identity, active Inventory and an ordinary installed bundle row',async()=>{
  const h=await setup({consent:'granted'});try{
    const emit=h.handlers.get('client-page/opened');assert.equal(typeof emit,'function');
    for(const sourcePatch of [{packageName:'claimed-other'},{entryId:'other'},{moduleName:'other'}])emit({...fact(),source:{...source,...sourcePatch}});
    emit({...fact(),surface:'market.details'});await h.api.drain();assert.equal(h.api.events().total,0);
  }finally{await h.close();}
  for(const patch of [
    {pluginInventory:undefined},
    {pluginInventory:{list:async()=>({entries:[{...entry,enabled:false}]})}},
    {pluginInventory:{list:async()=>({entries:[{...entry,fiberPhase:'loading'}]})}},
    {pluginManager:{listBundles:async()=>[{...bundle,installed:false,removable:false}]}},
    {pluginManager:{listBundles:async()=>[{...bundle,removable:false}]}},
    {pluginManager:{listBundles:async()=>[{...bundle,rows:[{...entry,entryId:'other'}]}]}},
  ]){const f=await setup({consent:'granted',...patch});try{f.handlers.get('client-page/opened')(fact());await f.api.drain();assert.equal(f.api.events().total,0);}finally{await f.close();}}
});

test('failed page write commits neither event nor dedupe; same fact succeeds after storage returns',async()=>{
  const h=await setup({consent:'granted'});try{
    const emit=h.handlers.get('client-page/opened');assert.equal(typeof emit,'function');const opened=fact();
    const before=h.api.events();h.eg.fail=true;emit(opened);await h.api.drain();assert.deepEqual(h.api.events(),before);
    h.eg.fail=false;emit(opened);await h.api.drain();assert.equal(h.api.events().total,1);
  }finally{await h.close();}
});
