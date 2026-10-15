import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AgentStore} from '../src/agent/store.mjs';
import {beginWithdrawal,finishWithdrawal,grantConsent} from '../src/agent/withdraw.mjs';
const consentId='11111111-1111-4111-8111-111111111111';
async function fixture(t,result){
 const root=await mkdtemp(join(tmpdir(),'hm-g-barrier-'));t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(join(root,'inflight'));await writeFile(join(root,'inflight','a'.repeat(64)+'.json'),'{}');
 let consent='granted';const r={agentHome:root,store:new AgentStore(root),call:async x=>{if(x.operation==='withdraw')return result;if(x.operation==='consent')consent=x.state;return {deviceId:'fixture-device',consent:{state:consent,consentId}};}};return r;
}
test('G committed matching withdrawal barrier clears independent inflight and allows a fresh grant',async t=>{
 const r=await fixture(t,{deletedEvents:1,consentId,state:'withdrawn',barrier:'committed'});const result=await beginWithdrawal(r);assert.equal(result.state,'sent');assert.equal(result.barrier,'committed');assert.deepEqual(await readdir(join(r.agentHome,'inflight')).catch(e=>e.code==='ENOENT'?[]:Promise.reject(e)),[]);assert.equal((await grantConsent(r)).consent.state,'granted');
});
test('G missing or mismatched deletion barrier retains evidence and prevents regrant',async t=>{
 for(const result of [{deletedEvents:1},{deletedEvents:1,consentId:'22222222-2222-4222-8222-222222222222',state:'withdrawn',barrier:'committed'},{deletedEvents:1,consentId,state:'withdrawn',barrier:'unknown'}]){
  const r=await fixture(t,result);const answer=await beginWithdrawal(r);assert.equal(answer.state,'pending');assert.equal(answer.code,'AGENT_WITHDRAWAL_UNCONFIRMED');assert.equal((await readdir(join(r.agentHome,'inflight'))).length,1);await assert.rejects(grantConsent(r),/WITHDRAWAL_PENDING/);
 }
});
