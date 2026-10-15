/** Copy only this repo; frozen offline peer closure and semantic core build, never a host gate. */
import {mkdtempSync, cpSync, rmSync, mkdirSync, existsSync, writeFileSync} from 'node:fs';
import {tmpdir, homedir} from 'node:os';
import {join, basename, resolve, delimiter} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const root=fileURLToPath(new URL('../',import.meta.url));
const parent=mkdtempSync(join(tmpdir(),'usage-detached-'));
const copy=join(parent,'hanamesh-usage'), home=join(parent,'home'), cache=join(parent,'npm-cache');
const receipt={scope:'OFFLINE_CORE_SEMANTIC_NOT_TARGET_HOST_OR_UI',commands:[]};
const save=()=>writeFileSync(join(parent,'commands.json'),JSON.stringify(receipt,null,2)+'\n');
console.log('DETACHED_EVIDENCE: '+parent);
save();
try {
  mkdirSync(home);mkdirSync(cache);
  mkdirSync(join(parent,'tmp'));mkdirSync(join(home,'dsh-home'));mkdirSync(join(home,'profile'));
  // Read only cached locked artifacts, never caller credentials/configuration or sibling sources.
  const seed=join(resolve(process.env.npm_config_cache??join(homedir(),'.npm')),'_cacache');
  if(existsSync(seed))cpSync(seed,join(cache,'_cacache'),{recursive:true});
  const userconfig=join(home,'.npmrc'),globalconfig=join(home,'global.npmrc');
  writeFileSync(userconfig,'');writeFileSync(globalconfig,'');
  const env={...process.env,HOME:home,DSH_HOME:join(home,'dsh-home'),TMPDIR:join(parent,'tmp'),
    XDG_CACHE_HOME:join(home,'.cache'),XDG_CONFIG_HOME:join(home,'.config'),
    npm_config_cache:cache,npm_config_userconfig:userconfig,npm_config_globalconfig:globalconfig,
    npm_config_legacy_peer_deps:'false',npm_config_omit:'',npm_config_include:'dev',
    npm_config_offline:'true',npm_config_audit:'false',npm_config_fund:'false',npm_config_update_notifier:'false',
    PATH:join(copy,'node_modules','.bin')+delimiter+process.env.PATH};
  cpSync(root,copy,{recursive:true,filter:src=>!['.git','node_modules','artifacts','.tmp','.npm-cache','lib'].includes(basename(src))});
  const commands=[['npm',['ci','--offline','--ignore-scripts','--legacy-peer-deps=false','--include=dev','--include=peer','--include=optional']],
    [process.execPath,['tools/build.mjs','--offline']],[process.execPath,['tools/check.mjs']]];
  for(const [program,args] of commands) {
    console.log('$ '+program+' '+args.join(' '));
    const result=spawnSync(program,args,{cwd:copy,env,encoding:'utf8',maxBuffer:8*1024*1024});
    const number=receipt.commands.length+1,stdout=`${number}.stdout.log`,stderr=`${number}.stderr.log`;
    writeFileSync(join(parent,stdout),result.stdout??'');writeFileSync(join(parent,stderr),result.stderr??'');
    receipt.commands.push({program,args,cwd:copy,status:result.status,signal:result.signal,errorCode:result.error?.code??null,stdout,stderr});
    save();
    console.log((result.stdout??'').replaceAll(copy,'<isolated-repo>'));
    console.error((result.stderr??'').replaceAll(copy,'<isolated-repo>'));
    assert.equal(result.status,0,`detached command failed; evidence: ${parent}`);
  }
  console.log('DETACHED_CORE_BUILD_COMPLETE: locked package closure, no sibling source; NOT full target host build.');
} finally {
  // Evidence is small: commands.json, the per-command logs and npm's own _logs. The repository copy, the seeded npm
  // cache copy (hundreds of MB), the isolated home and tmp are deleted every run, success or failure.
  const logs=join(cache,'_logs');
  if(existsSync(logs))cpSync(logs,join(parent,'npm-logs'),{recursive:true});
  for(const path of [copy,cache,home,join(parent,'tmp')])rmSync(path,{recursive:true,force:true});
}
