import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, readdirSync, existsSync, rmSync, statSync} from 'node:fs';
import {tmpdir, homedir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
/** Every temporary directory this file creates is removed after its test; nothing accumulates in the system tmp. */
function run(t,cache) {
  const directory=mkdtempSync(join(tmpdir(),'usage-detached-test-'));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const home=join(directory,'caller-home');mkdirSync(home);
  const result=spawnSync('npm',['run','test:detached'],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024,
    env:{...process.env,HOME:home,TMPDIR:directory,DSH_HOME:join(directory,'caller-dsh-home'),
      npm_config_cache:cache,npm_config_legacy_peer_deps:'true',npm_config_omit:'dev',NODE_ENV:'production'}});
  const evidence=readdirSync(directory).find(name=>name.startsWith('usage-detached-'));
  return {directory,result,evidence:evidence&&join(directory,evidence)};
}
/** Total bytes under a directory. */
function size(path){const info=statSync(path);return info.isDirectory()?readdirSync(path).reduce((sum,name)=>sum+size(join(path,name)),0):info.size;}
test('detached keeps the full frozen peer closure despite inherited legacy and omit settings',t=>{
  const cache=process.env.npm_config_cache??join(homedir(),'.npm');
  const {result,evidence}=run(t,cache);
  assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
  assert.match(result.stdout,/DETACHED_CORE_BUILD_COMPLETE.*NOT full target host build/);
  assert(evidence,'command evidence must survive cleanup');
  const receipt=JSON.parse(readFileSync(join(evidence,'commands.json'),'utf8'));
  assert.equal(receipt.commands.length,3);
  assert(receipt.commands.every(command=>command.status===0));
  assert.equal(existsSync(join(evidence,'hanamesh-usage')),false);
  for(const name of ['npm-cache','home','tmp'])assert.equal(existsSync(join(evidence,name)),false,`${name} is deleted`);
  assert(size(evidence)<5*1024*1024,'evidence stays small');
});
test('detached preserves offline failure output and exit code while deleting only its copy',t=>{
  const cache=mkdtempSync(join(tmpdir(),'usage-detached-empty-cache-'));
  t.after(()=>rmSync(cache,{recursive:true,force:true}));
  const {result,evidence,directory}=run(t,cache);
  assert.notEqual(result.status,0);
  assert(evidence,'failure evidence must survive cleanup');
  const receipt=JSON.parse(readFileSync(join(evidence,'commands.json'),'utf8'));
  assert.equal(receipt.commands.length,1);
  assert.notEqual(receipt.commands[0].status,0);
  assert.match(readFileSync(join(evidence,receipt.commands[0].stderr),'utf8'),/ENOTCACHED/);
  assert.equal(existsSync(join(evidence,'hanamesh-usage')),false);
  assert.equal(existsSync(cache),true);
  assert.equal(existsSync(join(directory,'caller-home')),true);
});
