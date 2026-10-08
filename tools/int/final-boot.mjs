// Final integration launcher: unchanged official runProfile; genuine installed Core/Usage.
// This development observer only reads services and replays an already observed ordinary fact.
// It does not supply identity, consent, device keys, actions or event records.
import {readFile,writeFile,chmod} from 'node:fs/promises';
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const run=path.resolve(process.argv[2]??'');
if(path.dirname(run)!=='/Users/yzliu/.cache/hanamesh-runs/P04-USAGE-INT-01'||!path.basename(run).startsWith('real-'))throw Error('RUN_NOT_THIS_CARD');
if(process.env.DSH_HOME!==path.join(run,'dsh-home'))throw Error('DSH_HOME_NOT_ISOLATED');
const inputs=JSON.parse(await readFile(path.join(run,'state/INPUTS.json'),'utf8'));
const runtimeRoot=inputs.dshRuntimeRoot;
const profileBoot=runtimeRoot ? path.join(runtimeRoot,'apps/cli/lib/profile-boot.js') : path.join(run,'runtime/node_modules/@deepseek-ai/dsh/lib/profile-boot.js');
const launchEnvironment=runtimeRoot ? path.join(runtimeRoot,'packages/util/launch-environment/lib/index.js') : path.join(run,'runtime/node_modules/@deepseek-ai/dsh-launch-environment/lib/index.js');
const {runProfile}=await import(pathToFileURL(profileBoot).href);
const {createLaunchEnvironmentSnapshot}=await import(pathToFileURL(launchEnvironment).href);
const app=await runProfile({profile:'web',patchFiles:[path.join(run,'state/final.patch.json')],args:['--host','127.0.0.1','--port',String(inputs.dshPort??0)],environment:createLaunchEnvironmentSnapshot([{source:'process',values:process.env}])});
const ctx=app.ctx;
const core=ctx.get('hanameshCore');const usage=ctx.get('hanameshUsage');
if(!core||!usage)throw Error('REAL_INSTALLED_SERVICE_MISSING');
const {wireEvent}=await import(pathToFileURL(path.join(run,'dsh-home/profiles/web/node_modules/hanamesh-usage/lib/core/index.js')).href);
let modelRequests=0;let lastFact=null;const facts=[];
ctx.on('agent/request',()=>{modelRequests++;});
ctx.on('commands/operation',fact=>{if(fact?.phase==='succeeded'){lastFact=fact;facts.push({commandId:fact.commandId,phase:fact.phase,source:fact.source,occurredAt:fact.occurredAt});void writeFile(path.join(run,'evidence/ordinary-facts.json'),JSON.stringify(facts,null,2)+'\n');}});
const hostPort=JSON.parse(await readFile(path.join(run,'state/INPUTS.json'),'utf8')).hostPort;const hostOrigin=`http://127.0.0.1:${hostPort}`;
async function signedPost(events){const body=JSON.stringify(events);const headers=await core.signRequest({method:'POST',path:'/v1/usage/events',body:new TextEncoder().encode(body)});const response=await fetch(hostOrigin+'/v1/usage/events',{method:'POST',headers:{...headers,'content-type':'application/json',origin:hostOrigin},body});return {httpStatus:response.status,body:await response.json()};}
const operations={
 async state(){await usage.drain();return {coreSession:core.getSession(),consent:core.getConsent(),usageHealth:usage.health(),panel:usage.panel(),modelRequests,facts};},
 async sourceTrace(){
  // Read the already captured native fact for diagnosis only; never emit it or record an event.
  const prior=JSON.parse(await readFile(path.join(run,'evidence/local-action-state.json'),'utf8'));
  const fact=lastFact??prior.facts.at(-1);if(!fact)throw Error('NO_OBSERVED_FACT_FOR_DIAGNOSIS');
  const {commandPackage}=await import(pathToFileURL(path.join(run,'dsh-home/profiles/web/node_modules/hanamesh-usage/lib/host/command-source.js')).href);
  const selected=[...ctx.loader.entries()].filter(entry=>entry.id===fact.source.entryId).map(entry=>({id:entry.id,name:entry.options.name,group:entry.options.group??null,parentBaseUrl:entry.parent?.tree?.ctx?.baseUrl??null}));
  const service=ctx.get('pluginPackages');
  const lookups=selected.map(entry=>{try{const pkg=service.packageOf(entry.name,entry.parentBaseUrl);return {entryId:entry.id,name:pkg?.name??null,version:pkg?.version??null,dir:pkg?.dir??null};}catch(error){return {entryId:entry.id,error:error.message};}});
  const sameModuleEntries=[...ctx.loader.entries()].filter(entry=>entry.options.name===fact.source.moduleName).map(entry=>({id:entry.id,name:entry.options.name,group:entry.options.group??null,parentBaseUrl:entry.parent?.tree?.ctx?.baseUrl??null}));
  return {diagnosticOnly:true,observedFact:fact,rootBaseUrl:ctx.baseUrl??null,selected,sameModuleEntries,lookups,resolvedOwningPackage:commandPackage(ctx,fact.source)};
 },
 remote:()=>usage.remote(),
 async replay(){if(!lastFact)throw Error('NO_REAL_UI_COMMAND_FACT');await usage.drain();const before=usage.panel().total;ctx.emit('commands/operation',lastFact);await usage.drain();const event=usage.events({limit:1000}).events.find(e=>e.evidenceRef===`command:${lastFact.commandId}:succeeded`);if(!event)throw Error('ORDINARY_EVENT_MISSING');return {commandId:lastFact.commandId,localBefore:before,localAfter:usage.panel().total,server:await signedPost([wireEvent(event)])};},
 async rejectBatch(){await usage.drain();const event=usage.events({limit:1000}).events.find(e=>e.evidenceRef===`command:${lastFact?.commandId}:succeeded`);if(!event)throw Error('ORDINARY_EVENT_MISSING');return {supply:'NEGATIVE_REQUEST_ONLY_NOT_ORDINARY_ACTION',server:await signedPost([wireEvent(event),{...wireEvent(event),deviceId:'device_INVALID_STUB'}])};}
};
const observer=createServer(async(req,res)=>{
 const method=req.method;const name=new URL(req.url,'http://127.0.0.1').pathname.slice(1);
 if(req.headers.origin||!['GET','POST'].includes(method)||!Object.hasOwn(operations,name)||((name==='replay'||name==='rejectBatch')&&method!=='POST')){res.writeHead(403);res.end();return;}
 try{const value=await operations[name]();res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));}
 catch(error){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:error.message}));}
});
await new Promise(resolve=>observer.listen(0,'127.0.0.1',resolve));
const descriptor={run,dshPort:ctx.webServer.port,origin:`http://127.0.0.1:${ctx.webServer.port}`,observerPort:observer.address().port,hostOrigin,Core:'NORMAL_INSTALLED_REAL_PROVIDER',Usage:'NORMAL_INSTALLED',FakeChain:'TEST_FAKE',Semantic:'TEST_STUB',firstStepUI:'NOT_RUN'};
await writeFile(path.join(run,'state/LAUNCH.json'),JSON.stringify(descriptor,null,2)+'\n');
console.log(JSON.stringify({event:'final_real_runtime_ready',...descriptor}));
