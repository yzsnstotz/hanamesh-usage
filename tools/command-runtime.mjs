// Component gate: real DSH Host/Loader/storage/command; Core and HTTP server are explicit fixtures.
// Optional candidate is installed as an ordinary bundle; otherwise mount the generated Host entry.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash,generateKeyPairSync,randomBytes,randomUUID,sign,verify} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// The launcher prints a short-lived web credential. Never persist it in gate output.
for(const stream of [process.stdout,process.stderr]){
  const write=stream.write.bind(stream);
  stream.write=(chunk,...args)=>write(String(chunk).replace(/([?&]token=)[^\s&]+/g,'$1[REDACTED]'),...args);
}

const [desktop,run]=process.argv.slice(2).map(p=>resolve(p));
assert(desktop&&run&&process.env.DSH_HOME===join(run,'dsh-home'));
const evidence=join(run,'evidence');await mkdir(evidence,{recursive:true});
const {runProfile}=await import(pathToFileURL(join(desktop,'apps/cli/lib/profile-boot.js')));
const {createLaunchEnvironmentSnapshot}=await import(pathToFileURL(join(desktop,'packages/util/launch-environment/lib/index.js')));
const usage=await import('../lib/host/index.js');
const {signingJSON}=await import('../lib/core/index.js');
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const deviceId='device_COMPONENT_COMMANDS';
let consent='withheld',rejectSigning=false;const listeners=new Set(),rows=new Map(),requests=[],nonces=new Set();
const server=createServer(async(req,res)=>{
  try {
    const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
    const timestamp=req.headers['x-hm-timestamp'],nonce=req.headers['x-hm-nonce'];
    assert.equal(req.headers['x-hm-device-id'],deviceId);assert(!nonces.has(nonce));
    assert(Math.abs(Date.now()/1000-Number(timestamp))<60);
    const preimage=`${req.method}\n${req.url}\n${timestamp}\n${nonce}\n${createHash('sha256').update(body).digest('hex')}`;
    assert(verify(null,Buffer.from(preimage),publicKey,Buffer.from(req.headers['x-hm-signature'],'base64url')));
    assert.equal(req.headers.origin,origin);nonces.add(nonce);
    res.setHeader('content-type','application/json');
    if(req.method==='POST'&&req.url==='/v1/usage/events'){
      const events=JSON.parse(body);let accepted=0,duplicates=0;
      for(const event of events){assert(verify(null,Buffer.from(signingJSON(event)),publicKey,Buffer.from(event.signature,'base64url')));if(rows.has(event.eventId))duplicates++;else{rows.set(event.eventId,event);accepted++;}}
      requests.push({method:req.method,count:events.length,accepted,duplicates,requestSignatureVerified:true,eventSignaturesVerified:true});
      res.end(JSON.stringify({accepted,duplicates,rejected:[],durability:'committed'}));return;
    }
    assert.equal(req.method,'DELETE');assert.equal(req.url,`/v1/usage/me/devices/${deviceId}/events`);
    const deletedEvents=rows.size;rows.clear();requests.push({method:'DELETE',deletedEvents,requestSignatureVerified:true});res.end(JSON.stringify({deletedEvents}));
  }catch(error){requests.push({error:String(error)});res.statusCode=400;res.end('{}');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const core={protocolVersion:'1',getDeviceId:()=>deviceId,getPublicKey:()=>publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64url'),
  sign:bytes=>{if(rejectSigning)throw Error('FIXTURE_SIGN_FAILURE');return new Uint8Array(sign(null,bytes,privateKey));},getConsent:()=>consent,onConsentChange:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},
  getServerOrigin:()=>origin,getSession:()=>({protocolVersion:'1',deviceId,registration:'registered',principalId:null,bound:null,serverReachable:true,checkedAt:new Date().toISOString(),reason:'COMPONENT_FIXTURE'}),
  async signRequest({method,path,body}){const timestamp=String(Math.floor(Date.now()/1000)),nonce=randomBytes(16).toString('base64url');const data=`${method}\n${path}\n${timestamp}\n${nonce}\n${createHash('sha256').update(body??Buffer.alloc(0)).digest('hex')}`;return {'x-hm-device-id':deviceId,'x-hm-timestamp':timestamp,'x-hm-nonce':nonce,'x-hm-signature':sign(null,Buffer.from(data),privateKey).toString('base64url')};},
};
const patch=join(run,'command.patch.json');await writeFile(patch,JSON.stringify([{id:'update-notifier',config:{initialDelay:3600000,interval:3600000}}]));
let app,fork;
const result={scope:'REAL_USAGE_COMPONENT_HOST',fixtures:['Core consent/device signer','HTTP server with Ed25519 request/event verification and in-memory readback'],formalGUI:'NOT_RUN',productionServer:'NOT_RUN',modelRequests:0};
try{
  app=await runProfile({profile:'web',patchFiles:[patch],args:['--no-open','--port','0'],environment:createLaunchEnvironmentSnapshot([{source:'process',values:process.env}])});
  const ctx=app.ctx;assert.notEqual(ctx.webServer.port,3080);result.hostPort=ctx.webServer.port;
  ctx.on('agent/request',()=>{result.modelRequests++;throw Error('MODEL_REQUEST_FORBIDDEN');});
  ctx.provide('hanameshCore',core);
  if(process.env.USAGE_GATE_CANDIDATE){
    const loaded=[...ctx.loader.entries()].find(e=>e.options.name==='hanamesh-usage');assert(loaded?.fiber);
    const pkg=ctx.get('pluginPackages').packageOf('hanamesh-usage',loaded.parent.tree.ctx.baseUrl);
    assert.equal(pkg.version,'0.2.0-rc.13');
    result.candidate={version:pkg.version,sha256:createHash('sha256').update(await readFile(process.env.USAGE_GATE_CANDIDATE)).digest('hex'),installation:'PUBLIC_CLI_PLUGIN_ADD_BUNDLE'};
  }else{fork=ctx.plugin(usage,{uploadIntervalMs:5000});await fork;}
  const api=ctx.get('hanameshUsage');assert(api);await api.drain();
  const entry=[...ctx.loader.entries()].find(e=>e.options.name==='dsh-update-notifier');assert(entry?.fiber);
  const owner=ctx.get('pluginPackages').packageOf(entry.options.name,entry.parent.tree.ctx.baseUrl);
  result.owner={entryId:entry.id,moduleName:entry.options.name,packageName:owner.name,version:owner.version};
  let pageSource,builtinSource;
  const pageFacts=[];
  function pageFact(source=pageSource){return Object.freeze({operationId:randomUUID(),surface:'settings.section',source:Object.freeze({...source}),occurredAt:Date.now()});}
  async function present(fact){ctx.emit('client-page/opened',fact);await api.drain();}
  if(process.env.USAGE_GATE_PAGE_SAMPLE){
    const inventory=await ctx.get('pluginInventory').list();
    const bundles=await ctx.get('pluginManager').listBundles();
    const pageEntry=[...ctx.loader.entries()].find(e=>e.options.name==='dsh-ui-harmonizer');assert(pageEntry?.fiber);
    const pageOwner=ctx.get('pluginPackages').packageOf(pageEntry.options.name,pageEntry.parent.tree.ctx.baseUrl);
    pageSource={entryId:pageEntry.id,moduleName:pageEntry.options.name,packageName:pageOwner.name};
    const ordinary=inventory.entries.find(e=>e.entryId===pageSource.entryId);assert.equal(ordinary.fiberPhase,'active');assert(ordinary.enabled);
    const bundle=bundles.find(b=>b.installed&&b.removable&&b.rows.some(r=>r.entryId===pageSource.entryId));assert(bundle);
    const builtin=[...ctx.loader.entries()].find(e=>e.options.name==='@deepseek-ai/dsh-client-ui-settings-general');assert(builtin);
    const builtinOwner=ctx.get('pluginPackages').packageOf(builtin.options.name,builtin.parent.tree.ctx.baseUrl);
    builtinSource={entryId:builtin.id,moduleName:builtin.options.name,packageName:builtinOwner.name};
    result.pageInput={scope:'FIXTURE_HOST_PAGE_FACT_ON_REAL_INSTALLED_INVENTORY',source:pageSource,inventory:ordinary,bundle:{name:bundle.name,installed:bundle.installed,enabled:bundle.enabled,removable:bundle.removable}};
    ctx.on('client-page/opened',fact=>pageFacts.push(fact));
    await present(pageFact());assert.equal(api.events().total,0);
  }
  const session=await ctx.typertGateway.invoke({namespace:'session',method:'create',args:{request:{cwd:run,sessionId:'usage-component-command'}}});
  const facts=[];ctx.on('commands/operation',fact=>facts.push(fact));
  async function execute(){const value=await ctx.typertGateway.invoke({namespace:'commands',method:'execute',args:{agentId:session.sessionId,line:'/check-updates',submittedAttachments:[]}});assert.equal(value.result.kind,'success');await api.drain();return value;}
  await execute();assert.equal(api.events().total,0);result.beforeConsent=api.events().total;
  consent='granted';for(const fn of listeners)fn(consent,new Date().toISOString());await api.drain();
  const beforeFailure=api.events({limit:200});rejectSigning=true;
  await execute();assert.deepEqual(api.events({limit:200}),beforeFailure);rejectSigning=false;
  result.failedSigning={scope:'CORE_FIXTURE_FAULT_WITH_REAL_USAGE_STORAGE',eventsUnchanged:true};
  if(pageSource){
    rejectSigning=true;await present(pageFact());assert.deepEqual(api.events({limit:200}),beforeFailure);rejectSigning=false;
    result.failedSigning.openEventsUnchanged=true;
  }
  const action=await execute();const events=api.events({limit:200}).events;
  const use=events.filter(e=>e.action==='use');assert.equal(use.length,1);assert.equal(use[0].hanaRef,owner.name);assert.equal(use[0].sourcePlugin,owner.name);
  assert.equal(use[0].evidenceRef,`command:${action.commandId}:succeeded`);assert.equal(events.filter(e=>e.action==='open').length,0);
  assert(events.some(e=>e.action==='install'&&e.hanaRef===owner.name));result.installObserved=true;
  const success=facts.find(f=>f.commandId===action.commandId&&f.phase==='succeeded');assert(success);
  // Explicit fixture delivery replay: the production event already came from public dispatch above.
  ctx.emit('commands/operation',success);await api.drain();assert.equal(api.events({limit:200}).events.filter(e=>e.action==='use').length,1);
  result.deliveryReplay={scope:'FIXTURE_REDELIVERY_OF_REAL_FACT',useCount:1};
  if(pageSource){
    const first=pageFact();await present(first);await present(first);
    assert.equal(api.events({limit:200}).events.filter(e=>e.action==='open').length,1);
    await present(pageFact());
    const beforeBuiltin=api.events({limit:200});await present(pageFact(builtinSource));assert.deepEqual(api.events({limit:200}),beforeBuiltin);
    const opens=api.events({limit:200}).events.filter(e=>e.action==='open');assert.equal(opens.length,2);
    assert(opens.every(e=>e.hanaRef===pageSource.packageName&&e.sourcePlugin===pageSource.packageName));
    result.pageEvents={firstAndDuplicate:1,afterReopen:2,builtinExcluded:true,events:opens};
  }
  // Wait for the real reporter timer's first scheduled upload; bounded assertion, not a retry route.
  await new Promise(r=>setTimeout(r,5500));await api.drain();
  assert(rows.has(use[0].eventId));assert.equal(api.events({limit:200}).events.find(e=>e.eventId===use[0].eventId).upload.state,'sent');
  result.signedUse=rows.get(use[0].eventId);result.uploadReadback={serverRows:rows.size,localSent:api.health().outbox.sent};
  if(pageSource){for(const event of result.pageEvents.events){assert(rows.has(event.eventId));assert.equal(api.events({limit:200}).events.find(e=>e.eventId===event.eventId).upload.state,'sent');}result.openUploadReadback=2;}
  consent='withheld';for(const fn of listeners)fn(consent,new Date().toISOString());await api.drain();
  assert.equal(rows.size,0);assert.equal(api.events().total,0);assert.equal(api.health().withdrawal.state,'sent');
  await execute();assert.equal(api.events().total,0);assert.equal(rows.size,0);
  if(pageSource){await present(pageFact());assert.equal(api.events().total,0);assert.equal(rows.size,0);result.pageInput.facts=pageFacts;}
  result.withdrawal={serverRows:rows.size,localEvents:api.events().total,state:api.health().withdrawal.state,afterActionEvents:0};
  assert.equal(result.modelRequests,0);assert(!requests.some(r=>r.error));result.requests=requests;result.hostFacts=facts;result.result='PASS';
  await writeFile(join(evidence,'runtime.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{
  if(fork)await fork.dispose();
  await new Promise(r=>server.close(r));
  if(app)await app.shutdown.shutdown(result.result==='PASS'?0:1);
}
