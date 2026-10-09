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
 remote:()=>usage.remote(),
 async batch(){await usage.drain();const events=usage.events({state:'pending',limit:200}).events; if(!events.length)throw Error('NO_NEW_PENDING_EVENT');const wire=events.map(wireEvent);await writeFile(path.join(run,'evidence/new-pending-events.json'),JSON.stringify(wire,null,2)+'\n');return {events:wire,count:wire.length};},
 async rejectBatch(){await usage.drain();const events=usage.events({state:'pending',limit:200}).events.map(wireEvent);if(!events.length)throw Error('NO_NEW_PENDING_EVENT');const bad={...events.at(-1),signature:(events.at(-1).signature[0]==='A'?'B':'A')+events.at(-1).signature.slice(1)};return {count:events.length+1,eventIds:events.map(e=>e.eventId),server:await signedPost([...events,bad])};},
 async sendPending(){await usage.drain();const events=usage.events({state:'pending',limit:200}).events.map(wireEvent);if(!events.length)throw Error('NO_NEW_PENDING_EVENT');return {count:events.length,eventIds:events.map(e=>e.eventId),server:await signedPost(events)};},
 async replay(){await usage.drain();const events=usage.events({limit:200}).events.map(wireEvent);return {count:events.length,server:await signedPost(events)};},
};
const observer=createServer(async(req,res)=>{
 const method=req.method;const name=new URL(req.url,'http://127.0.0.1').pathname.slice(1);
 if(req.headers.origin||!['GET','POST'].includes(method)||!Object.hasOwn(operations,name)||(['replay','rejectBatch','sendPending'].includes(name)&&method!=='POST')){res.writeHead(403);res.end();return;}
 try{const value=await operations[name]();res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));}
 catch(error){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:error.message}));}
});
await new Promise(resolve=>observer.listen(0,'127.0.0.1',resolve));
const descriptor={run,dshPort:ctx.webServer.port,origin:`http://127.0.0.1:${ctx.webServer.port}`,observerPort:observer.address().port,hostOrigin,Core:'NORMAL_INSTALLED_REAL_PROVIDER',Usage:'NORMAL_INSTALLED',FakeChain:'TEST_FAKE',Semantic:'TEST_STUB',firstStepUI:'NOT_RUN'};
await writeFile(path.join(run,'state/LAUNCH.json'),JSON.stringify(descriptor,null,2)+'\n');
console.log(JSON.stringify({event:'final_real_runtime_ready',...descriptor}));
