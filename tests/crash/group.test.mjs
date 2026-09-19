import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {killAt,inspect} from './harness.mjs';
for(const [point,count] of [['before-rename',0],['after-rename',1]])test(`X02 FIXTURE POSIX: declaration unit SIGKILL ${point} sees whole image or none`,async t=>{
  const dir=await mkdtemp(join(tmpdir(),'usage-x02-'));try{
    const killed=await killAt('group',dir,point);assert.equal(killed.signal,'SIGKILL');assert.equal(killed.code,null);
    const state=inspect(dir);assert.equal(state.summaryCount,count);assert.equal(state.hasIdentity,true);if(count)assert.equal(state.records[0].result.value,'completed');
    t.diagnostic(JSON.stringify({evidence:'FIXTURE_POSIX_NOT_DSH',point,...killed,summaryCount:state.summaryCount,identityComplete:state.hasIdentity}));
  }finally{await rm(dir,{recursive:true,force:true});}
});
for(const [point,count] of [['before-rename',0],['after-rename',1]])test(`X02 FIXTURE POSIX: event unit SIGKILL ${point} sees event and identity together or not at all`,async t=>{
  const dir=await mkdtemp(join(tmpdir(),'usage-events-x02-'));try{
    const killed=await killAt('event-group',dir,point);assert.equal(killed.signal,'SIGKILL');
    const state=inspect(dir);assert.equal(state.eventCount,count);assert.equal(state.eventIdentityComplete,true);
    t.diagnostic(JSON.stringify({evidence:'FIXTURE_POSIX_NOT_DSH',point,...killed,eventCount:state.eventCount,eventIdentityComplete:state.eventIdentityComplete}));
  }finally{await rm(dir,{recursive:true,force:true});}
});
