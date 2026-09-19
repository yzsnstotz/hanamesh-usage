import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {killAt,inspect,recover} from './harness.mjs';
test('X03 FIXTURE POSIX: SIGKILL between writes leaves source, never source-less summary',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'usage-x03-'));try{
    const killed=await killAt('boundary',dir,'between');assert.equal(killed.signal,'SIGKILL');
    const state=inspect(dir);t.diagnostic(JSON.stringify({evidence:'FIXTURE_POSIX_NOT_DSH',...killed,sourcePresent:state.sourcePresent,summaryCount:state.summaryCount}));
    assert.equal(state.sourcePresent,true,'X03 safe side must contain original source');
    assert.equal(state.summaryCount,0,'summary must not be durable before its source');
    assert.equal(recover(dir).total,1);assert.equal(recover(dir).total,1);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('X03 FIXTURE POSIX: SIGKILL between Declaration and event leaves the Declaration safe side',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'usage-event-x03-'));try{
    const killed=await killAt('event-boundary',dir,'between');assert.equal(killed.signal,'SIGKILL');
    const state=inspect(dir);assert.equal(state.summaryCount,1);assert.equal(state.eventCount,0);
    t.diagnostic(JSON.stringify({evidence:'FIXTURE_POSIX_NOT_DSH',...killed,summaryCount:state.summaryCount,eventCount:state.eventCount}));
  }finally{await rm(dir,{recursive:true,force:true});}
});
