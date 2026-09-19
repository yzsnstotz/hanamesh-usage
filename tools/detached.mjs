/** Copy only this repo (no host or sibling sources), frozen offline lock, semantic core build. */
import {mkdtempSync,cpSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,basename} from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url)),parent=mkdtempSync(join(tmpdir(),'usage-detached-')),copy=join(parent,'hanamesh-plugin-activity');
try{
 cpSync(root,copy,{recursive:true,filter:src=>!['.git','node_modules','artifacts','.tmp','lib'].includes(basename(src))});
 for(const [program,args] of [['npm',['ci','--offline','--ignore-scripts','--legacy-peer-deps']],[process.execPath,['tools/build.mjs','--offline']],[process.execPath,['tools/check.mjs']]]){
  console.log('$ '+program+' '+args.join(' '));const r=spawnSync(program,args,{cwd:copy,encoding:'utf8'});console.log((r.stdout??'').replaceAll(copy,'<isolated-repo>'));console.log((r.stderr??'').replaceAll(copy,'<isolated-repo>'));assert.equal(r.status,0);
 }
 console.log('DETACHED_CORE_BUILD_COMPLETE: no sibling source, no installed host peers; NOT full target host build.');
}finally{rmSync(parent,{recursive:true,force:true});}
