// Final integration assembly only: public official CLI installs unchanged bundles in a new DSH_HOME.
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
const run=path.resolve(process.argv[2]??'');
if(path.dirname(run)!=='/Users/yzliu/.cache/hanamesh-runs/P04-USAGE-INT-01'||!path.basename(run).startsWith('real-'))throw Error('RUN_NOT_THIS_CARD');
if(process.env.DSH_HOME!==path.join(run,'dsh-home'))throw Error('DSH_HOME_NOT_ISOLATED');
const inputs=JSON.parse(readFileSync(path.join(run,'state/INPUTS.json'),'utf8'));
const cli=inputs.dshRuntimeRoot
 ? path.join(inputs.dshRuntimeRoot,'apps/cli/lib/bin.js')
 : path.join(run,'runtime/node_modules/@deepseek-ai/dsh/lib/bin.js');
const receipts=[];
for(const [name,file] of [['core','hanamesh-core-0.2.0-rc.56.tgz'],['usage','hanamesh-usage-0.2.0-rc.17.tgz'],['sample','dsh-update-notifier-0.2.1.tgz']]){
 const tgz=path.join(run,'supply',file);
 const argv=[cli,'plugin','--profile','web','add',tgz,'--registry=https://registry.npmjs.org/'];
 const result=spawnSync(process.execPath,argv,{cwd:run,env:process.env,encoding:'utf8'});
 const output=`${result.stdout}${result.stderr}`.replace(/([?&]token=)[^\s&]+/g,'$1[REDACTED]');
 writeFileSync(path.join(run,'evidence',`plugin-${name}-install.log`),output);
 receipts.push({name,argv,exitCode:result.status,sha256:createHash('sha256').update(readFileSync(tgz)).digest('hex')});
 writeFileSync(path.join(run,'evidence/plugin-install.json'),JSON.stringify(receipts,null,2)+'\n');
 console.log(JSON.stringify({name,exitCode:result.status}));
 if(result.status!==0)process.exit(1);
}
