import test from 'node:test';import assert from 'node:assert/strict';
import {Context} from '@deepseek-ai/cordis';import {TypertRegistry} from '@deepseek-ai/dsh-typert-registry';
import {TypertGatewayService} from '@deepseek-ai/dsh-api-gateway';
import {readFileSync} from 'node:fs';import {runInThisContext} from 'node:vm';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);let gatewayRegistration;
runInThisContext('(function(window){'+readFileSync(require.resolve('@deepseek-ai/dsh-api-gateway/client'),'utf8')+'\n})')({__ModuleLoader__:{load:value=>gatewayRegistration=value}});
const {apply:installClientRemote}=gatewayRegistration.factory(require);
import {UsagePagesRemote} from '../lib/host/pages-remote.js';
import {fixtureHost} from './fixtures/host.mjs';
import {pagesContribution} from '../lib/client/index.js';
test('published Typert Gateway dispatches Usage pages to invocation Peer and rejects replay/peer disposal',async()=>{
 const source={entryId:'include:page',moduleName:'ordinary/client'},entry={id:source.entryId,options:{name:source.moduleName},parent:{tree:{ctx:{baseUrl:'file:///isolated/cordis.yml'}}}};
 const row={entryId:source.entryId,moduleName:source.moduleName,enabled:true,fiberPhase:'active'};
 const h=await fixtureHost({bound:false,consent:'granted',loaderEntries:[entry],packageOf:()=>({name:'ordinary',version:'1.0.0',manifest:{name:'ordinary',version:'1.0.0'}}),pluginInventory:{list:async()=>({entries:[row]})},pluginManager:{listBundles:async()=>[{name:'ordinary',installed:true,availability:'profile',enabled:true,removable:true,rows:[row]}]}});
 const host=new Context(),client=new Context();new TypertRegistry(host);new TypertRegistry(client);
 const gateway=new TypertGatewayService(host,{websocketHeartbeatIntervalMs:2000,streamInboxBytes:262144});
 const service=host.plugin({apply(ctx){new UsagePagesRemote(ctx,h.pages);}});await service.await();
 let peerCtx;const lifetime=host.plugin({apply(ctx){peerCtx=ctx;}});await lifetime.await();const peer={id:'native-peer',ctx:peerCtx};
 client.provide('connection',{rpc:{open(){throw Error('NO_STREAM_ALLOWED');},call:async(channel,endpoint,payload)=>{assert.equal(channel,'/api');const [namespace,method]=endpoint.split('/');return {ok:true,value:await gateway.invoke({namespace,method,args:payload.args,peer})};}},registerGenerationSource:()=>()=>{},start:()=>({stop(){}})});
 const remoteFiber=client.plugin({inject:['typert','connection'],apply:installClientRemote});await remoteFiber.await();
 const dispose=await client.remote.$mount(pagesContribution);
 try{
 const issued=await client.remote.hanameshUsagePages.issue({...source,surface:'main'});assert.equal(issued.ok,true);assert.equal(issued.value.disposition,'issued');
 const presented=await client.remote.hanameshUsagePages.presented({credential:issued.value.credential});assert.equal(presented.value.disposition,'recorded');
 assert.equal((await client.remote.hanameshUsagePages.presented({credential:issued.value.credential})).value.disposition,'rejected');
 const abandoned=await client.remote.hanameshUsagePages.issue({...source,surface:'main'});await lifetime.dispose();
 assert.equal((await h.pages.presented(peer,{credential:abandoned.value.credential})).disposition,'rejected');
 assert.equal(h.api.events().total,1);
 }finally{await dispose();await remoteFiber.dispose();await lifetime.dispose();await service.dispose();await h.close();}
});
