// Invoke JavaScript CLIs with the verified Node, including on Windows where
// spawn(shell:false) cannot execute the npm-generated .cmd launchers.
import {createRequire} from 'node:module';
import {realpathSync,existsSync} from 'node:fs';
import {dirname,join,delimiter,basename} from 'node:path';
import {spawnSync} from 'node:child_process';
const require=createRequire(import.meta.url);
export function nodeToolCommand(name,args){
 let entry;
 if(name==='tsc')entry=require.resolve('typescript/lib/tsc.js');
 else{
  const script=name==='npm'?'npm-cli.js':'pnpm.cjs';
  if(process.env.npm_execpath&&basename(process.env.npm_execpath)===script)entry=process.env.npm_execpath;
  for(const dir of [dirname(process.execPath),...(process.env.PATH??process.env.Path??'').split(delimiter)]){
   if(entry)break;if(!dir)continue;
   const candidates=process.platform==='win32'?[join(dir,'node_modules',name,'bin',script)]:[join(dir,name)];
   for(const file of candidates)if(existsSync(file)){entry=realpathSync(file);break;}
  }
 }
 if(!entry)throw Error('NODE_TOOL_ENTRYPOINT_MISSING: '+name);
 return {file:process.execPath,args:[entry,...args]};
}
export function nodeToolSync(name,args,options){const command=nodeToolCommand(name,args);return spawnSync(command.file,command.args,options);}
