import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {connect} from 'node:net';
import {initProfile,resolveProfileDir,getDshRuntimeVersion} from '@deepseek-ai/dsh-app-boot';
import {PROFILE_TEMPLATES} from '@deepseek-ai/dsh-official-bundles';
import {runProfile} from '@deepseek-ai/dsh/profile-boot';
import {createLaunchEnvironmentSnapshot} from '@deepseek-ai/dsh-launch-environment';

// @deepseek-ai/cordis 4.1.0 public FiberState: ACTIVE=2, DISPOSED=4; UNLOADING=5 is transient.
const FIBER_ACTIVE=2,FIBER_DISPOSED=4;
const [kind,registry]=process.argv.slice(2),profile='px1-'+kind;
const definitions={core:['@hanamesh/core','0.3.34','hanamesh-core','hanameshCore'],usage:['@hanamesh/usage','0.3.0-rc.19','hanamesh-usage','hanameshUsage'],apphost:['@hanamesh/dsh-app-host','0.6.25','hanamesh-app-host','hanameshApps'],theme:['@hanamesh/theme','0.1.0','hanamesh-theme',null]};
const roles=kind==='suite'?Object.keys(definitions):[kind];
const redact=line=>String(line).replace(/([?&]token=)[^\s&]+/g,'$1[REDACTED]');
for(const stream of [process.stdout,process.stderr]){const write=stream.write.bind(stream);stream.write=(chunk,...args)=>write(redact(chunk),...args);}
async function command(args){
 const cli=new URL('node_modules/@deepseek-ai/dsh/lib/bin.js',import.meta.url);
 const child=spawn(process.execPath,[fileURLToPath(cli),...args],{env:process.env,stdio:['ignore','pipe','pipe']});
 for(const stream of [child.stdout,child.stderr]){const reader=createInterface({input:stream});reader.on('line',line=>console.log(redact(line)));}
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
 assert.equal(code,0,'PUBLIC_DSH_PLUGIN_ADD_FAILED');
}
assert.equal(getDshRuntimeVersion(),'0.2.2-rc.1');
const dir=resolveProfileDir(profile);initProfile(dir,PROFILE_TEMPLATES.web.bundles);
const target=kind==='suite'?'@hanamesh/hanamesh@0.1.5':definitions[kind].slice(0,2).join('@');
await command(['plugin','--profile',profile,'add','--save-exact','--registry='+registry,target]);
const patch=[{id:'update-notifier',disabled:true}];
if(roles.includes('core'))patch.push({id:'hanamesh-core',config:{serverOrigin:null,websiteOrigin:null,allowSystemBrowser:false,sharedIdentityDir:join(process.env.DSH_HOME,'shared-identity')}});
if(roles.includes('apphost'))patch.push({id:'hanamesh-app-host',config:{dataRoot:join(process.env.DSH_HOME,'apps'),nodeBinary:process.execPath,library:{sources:[],handoff:{enabled:false},registry}}});
await writeFile(join(dir,'cordis.patch.yml'),JSON.stringify(patch,null,2));
let app,primaryError,rootReleased=false;const pluginFibers=[];
const receipt={scope:'REAL_PUBLIC_DSH_WEB_PROFILE_NODE_HOST_NOT_GUI',kind,profile,runtimeVersion:getDshRuntimeVersion(),node:process.version,modelRequests:0,entries:[]};
try{
 app=await runProfile({profile,args:['--no-open','--port','0'],patchFiles:[],environment:createLaunchEnvironmentSnapshot([{source:'process',values:process.env}])});
 const ctx=app.ctx;ctx.effect(()=>()=>{rootReleased=true;});receipt.port=ctx.webServer.port;assert(receipt.port>0);assert.notEqual(receipt.port,3080);
 ctx.on('agent/request',()=>{receipt.modelRequests++;throw Error('MODEL_REQUEST_FORBIDDEN');});
 for(const role of roles){
  const [name,version,id,service]=definitions[role];
  const entry=[...ctx.loader.entries()].find(row=>row.options.name===name||role==='apphost'&&row.options.name===name+'/dsh');
  assert(entry?.fiber,'ENTRY_MISSING '+role);assert.equal(entry.fiber.state,FIBER_ACTIVE,'ENTRY_NOT_ACTIVE '+role);if(service)assert(ctx.get(service),'SERVICE_MISSING '+role);
  const metadata=ctx.pluginPackages.packageOf(entry.options.name,entry.parent.tree.ctx.baseUrl);
  assert.equal(metadata.name,name);assert.equal(metadata.version,version);
  pluginFibers.push({role,fiber:entry.fiber});
  receipt.entries.push({role,id:entry.id,name:metadata.name,version:metadata.version,fiberState:entry.fiber.state,service});
 }
 if(roles.includes('core'))assert.equal(ctx.get('hanameshCore').getConsent(),'withheld');
 const manifest=JSON.parse(await readFile(join(dir,'package.json'),'utf8'));receipt.bundles=manifest.dsh.profile.bundles;
 assert(manifest.dsh.profile.bundles.includes(target.slice(0,target.lastIndexOf('@'))));
 if(kind==='suite'){
  const bundle=JSON.parse(await readFile(join(dir,'node_modules/@hanamesh/hanamesh/package.json'),'utf8'));
  assert.deepEqual(bundle.dependencies,Object.fromEntries(Object.values(definitions).map(([name,version])=>[name,version])));
  receipt.bundle={name:bundle.name,version:bundle.version,dependencies:bundle.dependencies};
 }
 assert.equal(receipt.modelRequests,0);receipt.status='PASS';
}catch(error){primaryError=error;receipt.status='FAIL';receipt.failure=String(error.message);
}finally{
 if(app)try{
  await app.shutdown.shutdown(receipt.status==='PASS'?0:1);
  receipt.rootAfterDispose=app.ctx.fiber.state;receipt.rootReleaseObserved=rootReleased;assert(rootReleased,'ROOT_EFFECT_NOT_RELEASED');
  receipt.disposedEntries=pluginFibers.map(({role,fiber})=>({role,uid:fiber.uid,state:fiber.state}));
  for(const {role,fiber} of pluginFibers){assert.equal(fiber.uid,null,'PLUGIN_NOT_DISPOSED '+role);assert.equal(fiber.state,FIBER_DISPOSED,'PLUGIN_NOT_DISPOSED_STATE '+role);if(definitions[role][3])assert.equal(app.ctx.get(definitions[role][3]),undefined,'SERVICE_NOT_REVOKED '+role);}
  receipt.listenerClosed=await new Promise(resolve=>{const socket=connect({host:'127.0.0.1',port:receipt.port});socket.once('connect',()=>{socket.destroy();resolve(false);});socket.once('error',e=>{socket.destroy();resolve(e.code==='ECONNREFUSED');});});assert(receipt.listenerClosed,'PROFILE_LISTENER_NOT_CLOSED');
 }catch(error){receipt.cleanupFailure=String(error.message);if(!primaryError)primaryError=error;receipt.status='FAIL';}
 await mkdir(join(process.env.DSH_HOME,'evidence'),{recursive:true});
 await writeFile(join(process.env.DSH_HOME,'evidence/native-load.json'),JSON.stringify(receipt,null,2));
 console.log(JSON.stringify(receipt));
}

if(primaryError)throw primaryError;
