import {cp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),usage=resolve(root,'artifacts/hanamesh-usage-0.2.0-rc.4.tgz');
const pack=directory=>{const result=spawnSync('npm',['pack','--silent'],{cwd:directory,encoding:'utf8'});if(result.status!==0)throw Error(result.stderr||'PACK_FAILED');return result.stdout.trim().split(/\s+/).at(-1);};
const run=(program,args,options={})=>{const result=spawnSync(program,args,{encoding:'utf8',...options});if(result.status!==0)throw Error(result.stderr||`${program} failed`);};
await mkdir(resolve(root,'test/fixtures/core-standin-suite/.pack'),{recursive:true});
for(const directory of ['core-standin','core-standin-suite'])for(const file of ['hanamesh-core-standin-0.0.0-standin.tgz','hanamesh-core-standin-suite-0.0.0-standin.tgz','hanamesh-core-standin-suite-0.0.1-standin.tgz'])await rm(resolve(root,'test/fixtures',directory,file),{force:true});
const first=pack(resolve(root,'test/fixtures/core-standin'));
const stage=resolve(root,'test/fixtures/core-standin-suite/.pack');await rm(stage,{recursive:true,force:true});await mkdir(stage,{recursive:true});
for(const name of ['lib','profile','README.md'])await cp(resolve(root,'test/fixtures/core-standin-suite',name),resolve(stage,name),{recursive:true});
await cp(resolve(root,'test/fixtures/core-standin/lib/index.js'),resolve(stage,'lib/index.js'));
const template=JSON.parse(await readFile(resolve(root,'test/fixtures/core-standin-suite/package.template.json'),'utf8'));await writeFile(resolve(stage,'package.json'),JSON.stringify(template,null,2)+'\n');
const bundled=resolve(stage,'node_modules/hanamesh-usage');await mkdir(bundled,{recursive:true});run('tar',['-xzf',usage,'-C',bundled,'--strip-components=1']);
const second=pack(stage);await cp(resolve(stage,second),resolve(root,'test/fixtures/core-standin-suite',second));await rm(stage,{recursive:true,force:true});
process.stdout.write(`${JSON.stringify({standin:first,suite:second})}\n`);
