import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=resolve(new URL('../',import.meta.url).pathname);
const parent=mkdtempSync(join(tmpdir(),'usage-card-runs-'));
const runs=join(parent,'.cache/hanamesh-runs');mkdirSync(runs,{recursive:true});
const card='J2S2-USAGE-08',run=join(runs,card,'isolated');mkdirSync(run,{recursive:true});

test('Q61 assembly accepts an explicit current card run with original isolated profile checks',()=>{
  const desktop=join(run,'desktop');mkdirSync(join(desktop,'apps/cli/lib'),{recursive:true});
  writeFileSync(join(desktop,'apps/cli/lib/bin.js'),"process.exit(0);\n");
  const sample=join(run,'sample.tgz'),usage=join(run,'usage.tgz');writeFileSync(sample,'fixture');writeFileSync(usage,'fixture');
  const child=()=>spawnSync(process.execPath,['tools/int/setup.mjs',desktop,sample,usage,'--card',card,'--run',run],{cwd:root,encoding:'utf8',env:{...process.env,HANAMESH_RUNS_ROOT:runs,DSH_HOME:join(run,'dsh-home')}});
  const result=child();assert.equal(result.status,0,result.stderr);
  mkdirSync(join(run,'dsh-home/profiles'),{recursive:true});
  const reused=child();assert.notEqual(reused.status,0);assert.match(reused.stderr,/DSH_HOME_NOT_FRESH/);
});
test('Q61 missing, mismatched, traversal, symlink and personal paths are rejected before any install',async()=>{
  const {cardRun}=await import('../tools/card-run.mjs');
  const env={HANAMESH_RUNS_ROOT:runs};
  assert.throws(()=>cardRun(['--card',card,'--run',run],{HANAMESH_RUNS_ROOT:join(parent,'.dsh')}),/RUNS_ROOT_NOT_ISOLATED/);
  assert.equal(cardRun(['--card',card,'--run',run],env).run,run);
  for(const args of [[],['--card',card,'--run',runs],['--card',card,'--run',join(runs,'OTHER')],['--card','../OTHER','--run',run]])assert.throws(()=>cardRun(args,env));
  const outside=mkdtempSync(join(tmpdir(),'usage-outside-'));symlinkSync(outside,join(runs,card,'escape'));
  assert.throws(()=>cardRun(['--card',card,'--run',join(runs,card,'escape')],env),/RUN_NOT_THIS_CARD/);
});
