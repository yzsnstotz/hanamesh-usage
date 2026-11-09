import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
// Windows has no stat uid; these native cases prove the owner SID rule. POSIX keeps the uid rule (card-run.test.mjs);
// a different-uid POSIX directory needs a second account, which the runner does not provide.
if(process.platform==='win32'){
  const {ownByCurrentUser,ownerSid,currentUserSid,icacls,SYSTEM_SID,ADMINISTRATORS_SID,OWNER_RIGHTS_SID}=await import('./fixtures/windows-owner.mjs');
  const {cardRun}=await import('../tools/card-run.mjs');
  const parent=mkdtempSync(join(realpathSync(tmpdir()),'usage-card-owner-'));
  after(()=>rmSync(parent,{recursive:true,force:true}));
  const runs=join(parent,'.cache','hanamesh-runs'),card='J2S2-USAGE-08',env={HANAMESH_RUNS_ROOT:runs};
  const runDir=name=>{const run=join(runs,card,name);mkdirSync(run,{recursive:true});ownByCurrentUser(run);return run;};
  test('Q61 Windows accepts only a run directory owned by the current user SID',()=>{
    const run=runDir('own');assert.equal(ownerSid(run),currentUserSid());assert.equal(cardRun(['--card',card,'--run',run],env).run,run);
  });
  test('Q61 Windows refuses a run directory owned by another account',()=>{
    const run=runDir('other');icacls(run,'/setowner','*'+SYSTEM_SID);assert.equal(ownerSid(run),SYSTEM_SID);
    assert.throws(()=>cardRun(['--card',card,'--run',run],env),/RUN_NOT_OWNED/);
  });
  test('Q61 Windows refuses a run directory owned by a shared group the user belongs to',()=>{
    const run=runDir('group');icacls(run,'/setowner','*'+ADMINISTRATORS_SID);assert.equal(ownerSid(run),ADMINISTRATORS_SID);
    assert.throws(()=>cardRun(['--card',card,'--run',run],env),/RUN_NOT_OWNED/);
  });
  test('Q61 Windows refuses when the run directory owner cannot be read',()=>{
    const run=runDir('unreadable');assert.equal(cardRun(['--card',card,'--run',run],env).run,run);
    // OWNER RIGHTS removes the owner's implicit READ_CONTROL, so the security descriptor read itself fails.
    icacls(run,'/deny','*'+OWNER_RIGHTS_SID+':(RC)');icacls(run,'/deny','*S-1-1-0:(RC)');
    assert.throws(()=>ownerSid(run));
    assert.throws(()=>cardRun(['--card',card,'--run',run],env),/RUN_NOT_OWNED/);
  });
}
