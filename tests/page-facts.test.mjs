import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureHost} from './fixtures/host.mjs';
const source={entryId:'include:ordinary-page',moduleName:'ordinary-plugin/client'};
const entry={id:source.entryId,options:{name:source.moduleName},parent:{tree:{ctx:{baseUrl:'file:///isolated-profile/cordis.yml'}}}};
const canonical={name:'ordinary-plugin',version:'1.0.0',manifest:{name:'ordinary-plugin',version:'1.0.0'}};
const row={entryId:source.entryId,moduleName:source.moduleName,enabled:true,fiberPhase:'active'};
const bundle={name:'ordinary-plugin',installed:true,availability:'profile',enabled:true,removable:true,rows:[row]};
const setup=(options={})=>fixtureHost({bound:false,consent:'granted',loaderEntries:[entry],packageOf:()=>canonical,pluginInventory:{list:async()=>({entries:[row]})},pluginManager:{listBundles:async()=>[bundle]},...options});
const peer={id:'fixture-peer'};
const request=(surface='settings.section')=>({...source,surface});
test('Usage pages replaces fork notification with host-issued single-use facts for all four surfaces',async()=>{
 const h=await setup();try{
  assert.equal(h.handlers.has('client-page/opened'),false);
  assert(h.pages,'Usage must own a pages remote seat');
  for(const surface of ['main','settings.section','plugins.bundle.config','plugins.row.config']){
   const issued=await h.pages.issue(peer,request(surface));assert.equal(issued.disposition,'issued');
   assert.equal((await h.pages.presented(peer,{credential:issued.credential})).disposition,'recorded');
   assert.equal((await h.pages.presented(peer,{credential:issued.credential})).disposition,'rejected');
  }
  const events=h.api.events().events;assert.equal(events.length,4);
  assert(events.every(e=>e.action==='open'&&e.hanaRef===canonical.name&&e.sourcePlugin===canonical.name&&Buffer.from(e.signature,'base64url').length===64));
 }finally{await h.close();}
});
test('pages rejects forged source, payload changes, cross-peer and unknown credentials',async()=>{
 const h=await setup();try{
  for(const patch of [{moduleName:'other'},{moduleName:'@deepseek-ai/dsh-client-ui-settings-general'},{surface:'market.details'},{packageName:'claimed-other'}])assert.equal((await h.pages.issue(peer,{...request(),...patch})).disposition,'rejected');
  const issued=await h.pages.issue(peer,request());
  assert.equal((await h.pages.presented({id:'other-peer'},{credential:issued.credential})).disposition,'rejected');
  assert.equal((await h.pages.presented(peer,{credential:issued.credential,packageName:'forged'})).disposition,'rejected');
  assert.equal((await h.pages.presented(peer,{credential:'made-up'})).disposition,'rejected');
  assert.equal((await h.pages.presented(peer,{credential:issued.credential})).disposition,'recorded');
 }finally{await h.close();}
});
test('real DSH: the client reports its own client-tree entry id, which never equals a Host id; ownership is by package',async()=>{
 const h=await setup({loaderEntries:[],pluginInventory:undefined});try{
  const issued=await h.pages.issue(peer,{entryId:'b4d529ed',moduleName:'ordinary-plugin',surface:'settings.section'});
  assert.equal(issued.disposition,'issued');
  assert.equal((await h.pages.presented(peer,{credential:issued.credential})).disposition,'recorded');
  assert.deepEqual(h.api.events().events.map(e=>[e.action,e.hanaRef]),[['open','ordinary-plugin']]);
  for(const moduleName of ['@deepseek-ai/dsh-client-ui-conversation','@deepseek-ai/dsh-client-ui-settings-general'])
   assert.equal((await h.pages.issue(peer,{entryId:'de443f0e',moduleName,surface:'main'})).disposition,'rejected','built-in platform pages are not plugin opens');
  assert.equal(h.api.health().filtered.pages,2,'counted, not silently dropped');
 }finally{await h.close();}
});
test('pages rechecks installed ownership and consent, including revoke then grant',async()=>{
 let active=true;
 const h=await setup({pluginManager:{listBundles:async()=>[{...bundle,enabled:active}]}});try{
  let issued=await h.pages.issue(peer,request());active=false;
  assert.equal((await h.pages.presented(peer,{credential:issued.credential})).disposition,'rejected');
  active=true;issued=await h.pages.issue(peer,request());h.setConsent('withheld');await h.api.drain();h.setConsent('granted');await h.api.drain();
  assert.equal((await h.pages.presented(peer,{credential:issued.credential})).disposition,'rejected');assert.equal(h.api.events().total,0);
  h.setConsent('withheld');assert.equal((await h.pages.issue(peer,request())).disposition,'withheld');
 }finally{await h.close();}
 for(const patch of [{pluginManager:{listBundles:async()=>[]}},{pluginManager:{listBundles:async()=>[{...bundle,removable:false}]}},{pluginManager:{listBundles:async()=>[{...bundle,availability:'installation'}]}},{pluginManager:{listBundles:async()=>[{...bundle,installed:false}]}}]){
  const f=await setup(patch);try{assert.equal((await f.pages.issue(peer,request())).disposition,'rejected');}finally{await f.close();}
 }
});
test('failed page writes consume credential without partial event; new presentation can succeed',async()=>{
 const h=await setup();try{
  const issued=await h.pages.issue(peer,request());const before=h.api.events();h.eg.fail=true;
  assert.equal((await h.pages.presented(peer,{credential:issued.credential})).disposition,'rejected');assert.deepEqual(h.api.events(),before);
  h.eg.fail=false;assert.equal((await h.pages.presented(peer,{credential:issued.credential})).disposition,'rejected');
  const next=await h.pages.issue(peer,request());assert.equal((await h.pages.presented(peer,{credential:next.credential})).disposition,'recorded');
 }finally{await h.close();}
});
test('pages bounds outstanding credentials, expires claims and closes without accepting late facts',async()=>{
 const h=await setup();const now=Date.now;try{
  for(let i=0;i<128;i++)assert.equal((await h.pages.issue(peer,request())).disposition,'issued');
  assert.equal((await h.pages.issue(peer,request())).disposition,'rejected');
  Date.now=()=>now()+60001;
  const issued=await h.pages.issue(peer,request());assert.equal(issued.disposition,'issued');
  Date.now=()=>now()+120002;
  assert.equal((await h.pages.presented(peer,{credential:issued.credential})).disposition,'rejected');
  Date.now=now;h.pages.revoke();const next=await h.pages.issue(peer,request());await h.close();
  assert.equal((await h.pages.presented(peer,{credential:next.credential})).disposition,'rejected');
 }finally{Date.now=now;await h.close();}
});
