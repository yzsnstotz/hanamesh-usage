// PX1: runner commands use JavaScript entrypoints, never a Windows .cmd shell.
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,copyFile,readdir,stat,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve,dirname,delimiter} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createInterface} from 'node:readline';
const repo=resolve(import.meta.dirname,'../..'),root=resolve(process.env.RUNNER_TEMP??join(repo,'.px1'),'px1-'+process.env.PX1_ROLE),evidence=join(root,'evidence');
await mkdir(evidence,{recursive:true});
const env={};
for(const key of ['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','COMSPEC','PATHEXT','PROCESSOR_ARCHITECTURE','OS','NUMBER_OF_PROCESSORS','LANG','LC_ALL','SHELL'])if(process.env[key])env[key]=process.env[key];
for(const [key,leaf]of Object.entries({HOME:'home',USERPROFILE:'home',CFFIXED_USER_HOME:'home',DSH_HOME:'dsh',XDG_CONFIG_HOME:'config',XDG_DATA_HOME:'data',XDG_CACHE_HOME:'cache',XDG_STATE_HOME:'state',TMPDIR:'tmp',TMP:'tmp',TEMP:'tmp',npm_config_cache:'npm',CLAUDE_CONFIG_DIR:'claude',CODEX_HOME:'codex'})){env[key]=join(root,leaf);await mkdir(env[key],{recursive:true});}
Object.assign(env,{CI:'true',npm_config_update_notifier:'false',npm_config_manage_package_manager_versions:'false',pnpm_config_manage_package_manager_versions:'false',COREPACK_ENABLE_AUTO_PIN:'0',GIT_CONFIG_NOSYSTEM:'1',GIT_TERMINAL_PROMPT:'0',GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'credential.helper',GIT_CONFIG_VALUE_0:''});
const bin=dirname(process.execPath);
async function tool(name,entry){
 for(const dir of [bin,...(process.env.PATH??process.env.Path??'').split(delimiter)]){
  if(!dir)continue;
  const candidates=process.platform==='win32'?[join(dir,'node_modules',name,entry)]:[join(dir,name)];
  for(const file of candidates)try{const resolved=await realpath(file);await stat(resolved);return resolved;}catch{}
 }
 throw Error('PINNED_TOOL_ENTRYPOINT_MISSING '+name);
}
const npm=await tool('npm','bin/npm-cli.js'),pnpm=await tool('pnpm','bin/pnpm.cjs');
const redact=line=>String(line).replace(/([?&]token=)[^\s&]+/g,'$1[REDACTED]');
async function command(file,args,cwd=repo,overrides={}){
 console.log(JSON.stringify({command:[file,...args],cwd}));
 const child=spawn(file,args,{cwd,env:{...env,...overrides},stdio:['ignore','pipe','pipe']});
 for(const stream of [child.stdout,child.stderr])createInterface({input:stream}).on('line',line=>console.log(redact(line)));
 const code=await new Promise((res,rej)=>{child.once('error',rej);child.once('close',res);});
 if(code!==0)throw Error('COMMAND_EXIT_'+code+': '+file+' '+args.join(' '));
}
const pm=(args,cwd=repo)=>command(process.execPath,[pnpm,...args],cwd);
const nm=(args,cwd=repo)=>command(process.execPath,[npm,...args],cwd);
const role=process.env.PX1_ROLE,phase=process.argv[2];
const names={core:'hanamesh-core-0.3.33.tgz',usage:'hanamesh-usage-0.3.0-rc.18.tgz',apphost:'hanamesh-dsh-app-host-0.6.24.tgz'};
const artifacts=join(root,'artifacts'),host=join(root,'native');
const receipt={phase,role,platform:process.platform,arch:process.arch,node:process.version,startedAt:new Date().toISOString()};
try{
 if(phase==='install'){
  if(process.version!=='v24.13.1')throw Error('NODE_VERSION_MISMATCH');
  await pm(['install','--frozen-lockfile','--strict-peer-dependencies']);
 }else if(phase==='build')await pm(['run','build']);
 else if(phase==='unit')await pm(['test']);
 else if(phase==='cli'){
  const files=(await readdir(join(repo,'tests'))).filter(f=>/^installation-.*\.test\.mjs$/.test(f)).sort();
  await command(process.execPath,['--test','--test-reporter=tap','--test-concurrency=1',...files.map(f=>'tests/'+f)]);
 }else if(phase==='pack'){
  await mkdir(artifacts,{recursive:true});
  await pm(['pack','--pack-destination',artifacts]);
  await stat(join(artifacts,names[role]));
 }else if(phase==='native'){
  const fixture=join(import.meta.dirname,'fixtures'),provenance=JSON.parse(await readFile(join(fixture,'provenance.json'),'utf8'));
  await mkdir(artifacts,{recursive:true});
  for(const row of provenance.archives){
   const bytes=await readFile(join(fixture,row.file));
   if(createHash('sha256').update(bytes).digest('hex')!==row.sha256)throw Error('FIXTURE_HASH_MISMATCH '+row.file);
   if(row.file!==names[role])await copyFile(join(fixture,row.file),join(artifacts,row.file));
  }
  // A failed local pack remains a failed candidate. Run the locked baseline only
  // as a separate diagnostic so a build failure cannot hide native OS failures.
  let candidate=true;
  try{await stat(join(artifacts,names[role]));}catch{candidate=false;await copyFile(join(fixture,names[role]),join(artifacts,names[role]));}
  receipt.localCandidate=candidate;
  await mkdir(host,{recursive:true});
  await copyFile(join(import.meta.dirname,'host-package.json'),join(host,'package.json'));
  await copyFile(join(import.meta.dirname,'host-package-lock.json'),join(host,'package-lock.json'));
  await copyFile(join(import.meta.dirname,'native-case.mjs'),join(host,'native-case.mjs'));
  await nm(['ci','--ignore-scripts','--strict-peer-deps'],host);
  await nm(['rebuild','--foreground-scripts','node-pty','koffi','@deepseek-ai/dsh-subprocess-local'],host);
  const core=join(host,'node_modules/@hanamesh/core');await mkdir(core,{recursive:true});
  await command('tar',['-xzf',join(fixture,names.core),'-C',core,'--strip-components=1']);
  const {createSuitePackageSource}=await import(pathToFileURL(join(core,'lib/suite/source.js')));
  // Repack the unchanged suite tuple/patch with the actual local archive hashes.
  // Tuple and patch come from PK2's normal builder; no dependency ranges change.
  const suite=join(root,'suite');await mkdir(suite,{recursive:true});
  await command('tar',['-xzf',join(fixture,'hanamesh-hanamesh-0.1.4.tgz'),'-C',suite]);
  const releasePath=join(suite,'package/release.json'),release=JSON.parse(await readFile(releasePath,'utf8'));
  const files=Object.values(names),archives=[];
  for(const file of files){const path=join(artifacts,file),bytes=await readFile(path);archives.push({path,integrity:'sha512-'+createHash('sha512').update(bytes).digest('base64')});}
  for(const [i,row]of release.sources.entries())row.sha256=createHash('sha256').update(await readFile(archives[i].path)).digest('hex');
  await writeFile(releasePath,JSON.stringify(release,null,2)+'\n');
  await nm(['pack','--ignore-scripts','--offline','--pack-destination',artifacts],join(suite,'package'));
  const suiteFile=join(artifacts,'hanamesh-hanamesh-0.1.4.tgz');archives.push({path:suiteFile,integrity:'sha512-'+createHash('sha512').update(await readFile(suiteFile)).digest('base64')});
  const source=await createSuitePackageSource({archives,port:0,peerRegistry:'https://registry.npmjs.org/',maxArchiveBytes:32*1024*1024,maxExpandedBytes:128*1024*1024,maxEntries:10000,maxManifestBytes:2*1024*1024,maxResponseBytes:32*1024*1024,timeoutMs:10000});
  const results=[];
  try{for(const kind of ['core','usage','apphost','suite']){
   const home=join(root,'cases',kind,'home'),dsh=join(root,'cases',kind,'dsh');await mkdir(home,{recursive:true});await mkdir(dsh,{recursive:true});
   try{await command(process.execPath,[join(host,'native-case.mjs'),kind,source.registry],host,{HOME:home,USERPROFILE:home,CFFIXED_USER_HOME:home,DSH_HOME:dsh});results.push({kind,status:'PASS'});}catch(error){results.push({kind,status:'FAIL',error:error.message});}
   try{await copyFile(join(dsh,'evidence/native-load.json'),join(evidence,'native-'+kind+'.json'));}catch{}
  }}finally{await source.close();receipt.profiles=results;receipt.archives=archives;}
  if(results.some(r=>r.status!=='PASS'))throw Error('NATIVE_PROFILES_FAILED');
  if(!candidate)throw Error('BASELINE_ONLY_LOCAL_PACK_FAILED');
 }else throw Error('UNKNOWN_PHASE');
 receipt.status='PASS';
}catch(error){receipt.status='FAIL';receipt.firstError=redact(error.message);console.error(receipt.firstError);process.exitCode=1;}
finally{receipt.completedAt=new Date().toISOString();await writeFile(join(evidence,phase+'.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));}
