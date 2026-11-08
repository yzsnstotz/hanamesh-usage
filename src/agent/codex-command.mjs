/** Resolve the selected official CLI without sending Windows npm shims to a shell. */
import {access,readFile} from 'node:fs/promises';
import {join,delimiter,isAbsolute} from 'node:path';
const exists=async path=>{try{await access(path);return true}catch(e){if(e.code==='ENOENT'||e.code==='ENOTDIR')return false;throw e}};
export async function codexCommand(env=process.env,platform=process.platform){
 if(platform!=='win32')return{file:'codex',args:[]};
 for(const dir of (env.PATH??env.Path??'').split(delimiter)){
  if(!isAbsolute(dir))continue;
  const executable=join(dir,'codex.exe');if(await exists(executable))return{file:executable,args:[]};
  if(await exists(join(dir,'codex.cmd'))){
   for(const base of [join(dir,'node_modules/@openai/codex'),join(dir,'../@openai/codex')]){
    const manifest=join(base,'package.json'),entry=join(base,'bin/codex.js');
    if(await exists(manifest)&&await exists(entry)){
     const pkg=JSON.parse(await readFile(manifest,'utf8'));if(pkg.name!=='@openai/codex')throw Error('AGENT_CODEX_OFFICIAL_ENTRY_REQUIRED');
     return{file:process.execPath,args:[entry]};
    }
   }
   // Once selected, a broken official npm layout cannot switch to another installation.
   throw Error('AGENT_CODEX_OFFICIAL_ENTRY_REQUIRED');
  }
 }
 throw Error('AGENT_CODEX_CLI_UNAVAILABLE');
}
