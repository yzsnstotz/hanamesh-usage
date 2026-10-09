import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureHost} from './fixtures/host.mjs';

const source={entryId:'include:update-notifier',moduleName:'dsh-update-notifier/commands'};
const baseUrl='file:///isolated-profile/cordis.yml';
const loaderEntries=[{id:source.entryId,options:{name:source.moduleName},parent:{tree:{ctx:{baseUrl}}}}];
const canonical={name:'dsh-update-notifier',version:'0.2.1',manifest:{name:'dsh-update-notifier',version:'0.2.1'}};
const fact=(phase,commandId='cmd-test-1',occurredAt=Date.now())=>({commandId,phase,commandName:'check-updates',source,occurredAt});

test('Host command success records one signed use for the resolved owning package',async()=>{
  const resolutions=[];
  const h=await fixtureHost({bound:false,consent:'granted',loaderEntries,packageOf:(moduleName,base)=>{resolutions.push([moduleName,base]);return canonical;}});
  const emit=h.handlers.get('commands/operation');
  assert.equal(typeof emit,'function');
  const entered=fact('entered'),succeeded={...entered,phase:'succeeded'};
  emit(entered);await h.api.drain();assert.equal(h.api.events().total,0);
  emit(succeeded);emit(succeeded);await h.api.drain();
  assert.deepEqual(resolutions,[[source.moduleName,baseUrl],[source.moduleName,baseUrl]]);
  assert.equal(h.api.events().total,1);
  const [event]=h.api.events().events;
  assert.equal(event.hanaRef,'dsh-update-notifier');
  assert.equal(event.action,'use');
  assert.equal(event.sourcePlugin,'dsh-update-notifier');
  assert.equal(event.occurredAt,new Date(succeeded.occurredAt).toISOString());
  assert.equal(Buffer.from(event.signature,'base64url').length,64);
  await h.close();
});

test('Host command facts with withheld consent, mismatched entry or unproven manifest write nothing',async()=>{
  const h=await fixtureHost({bound:false,loaderEntries,packageOf:()=>canonical});
  const emit=h.handlers.get('commands/operation');assert.equal(typeof emit,'function');
  emit(fact('succeeded'));await h.api.drain();assert.equal(h.api.events().total,0);
  h.setConsent('granted');await h.api.drain();
  emit({...fact('succeeded'),source:{...source,entryId:'other'}});
  emit({...fact('succeeded'),source:{...source,moduleName:'other'}});
  await h.api.drain();assert.equal(h.api.events().total,0);
  h.setConsent('withheld');await h.api.drain();
  emit(fact('succeeded','cmd-after-withdraw'));await h.api.drain();assert.equal(h.api.events().total,0);
  await h.close();
  const bad=await fixtureHost({bound:false,consent:'granted',loaderEntries,packageOf:()=>({...canonical,manifest:{name:'claimed-other',version:'0.2.1'}})});
  bad.handlers.get('commands/operation')(fact('succeeded'));await bad.api.drain();assert.equal(bad.api.events().total,0);await bad.close();
});

test('command use fails without a durable event write, and consent withdrawal clears recorded use',async()=>{
  const failed=await fixtureHost({bound:false,consent:'granted',loaderEntries,packageOf:()=>canonical});
  failed.eg.fail=true;
  failed.handlers.get('commands/operation')(fact('succeeded','cmd-failed-write'));
  await failed.api.drain();assert.equal(failed.api.events().total,0);await failed.close();

  const h=await fixtureHost({bound:false,consent:'granted',loaderEntries,packageOf:()=>canonical});
  const emit=h.handlers.get('commands/operation');
  emit(fact('succeeded','cmd-before-withdraw'));await h.api.drain();assert.equal(h.api.events().total,1);
  h.setConsent('withheld');await h.api.drain();assert.equal(h.api.events().total,0);
  emit(fact('succeeded','cmd-after-withdraw'));await h.api.drain();assert.equal(h.api.events().total,0);
  await h.close();
});
