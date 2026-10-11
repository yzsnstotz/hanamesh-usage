import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureHost} from './fixtures/host.mjs';

const source={entryId:'include:update-notifier',moduleName:'dsh-update-notifier/commands'};
const baseUrl='file:///isolated-profile/cordis.yml';
const entry={id:source.entryId,options:{name:source.moduleName},parent:{tree:{ctx:{baseUrl}}}};
const canonical={name:'dsh-update-notifier',version:'0.2.1',manifest:{name:'dsh-update-notifier',version:'0.2.1'}};
async function host(options={}) {
  return fixtureHost({bound:false,consent:'granted',loaderEntries:[entry],packageOf:()=>canonical,...options});
}
function register(h,{owner=entry,handler=()=>({kind:'success'}),name='check-updates'}={}) {
  let registered;
  const disposer=()=>{};
  const service={register(definition){registered=definition;return disposer;},other(){return this===service;}};
  const caller={fiber:{entry:owner}};
  const hook=h.handlers.get('internal/get');
  assert.equal(typeof hook,'function','Usage must wrap the native commands service');
  const wrapped=hook(caller,'commands',new Error('unused diagnostic'),()=>service);
  assert.equal(wrapped.other(),true,'non-register members retain their native receiver');
  assert.equal(wrapped.register({name,handler}),disposer,'native disposer is returned unchanged');
  return registered;
}
function run(h,definition,{id='cmd-test-1',session=h.s,time=Date.now(),kind='success',invoke=true,seq=20}={}) {
  const emit=h.handlers.get('session/event');
  const start={type:'command/run',seq,time,data:{commandId:id,name:definition.name}};
  Object.defineProperty(start.data,'args',{get(){throw Error('RAW_INPUT_READ');}});
  emit(session,start);
  let output;
  if(invoke)output=definition.handler({commandId:id,agent:{session}});
  const done={type:'command/done',seq:seq+1,time,data:{commandId:id,kind}};
  Object.defineProperty(done.data,'text',{get(){throw Error('RAW_RESULT_READ');}});
  emit(session,done);
  return output;
}

test('Usage native registration and session success record one signed use without fork notifications',async()=>{
  const h=await host();
  try {
    assert.equal(h.handlers.has('commands/operation'),false);
    const definition=register(h),time=Date.now();
    assert.deepEqual(run(h,definition,{time}),{kind:'success'});
    run(h,definition,{time});await h.api.drain();
    assert.equal(h.api.events().total,1);
    const [event]=h.api.events().events;
    assert.equal(event.hanaRef,canonical.name);assert.equal(event.action,'use');
    assert.equal(event.sourcePlugin,canonical.name);assert.equal(event.occurredAt,new Date(time).toISOString());
    assert.equal(Buffer.from(event.signature,'base64url').length,64);
  } finally {await h.close();}
});

test('command errors, missing invocation, orphan done and cross-session pairs write nothing',async()=>{
  const h=await host();
  try {
    const definition=register(h);
    run(h,definition,{id:'error',kind:'error'});
    run(h,definition,{id:'unknown',kind:'interrupted'});
    run(h,definition,{id:'no-invocation',invoke:false});
    const emit=h.handlers.get('session/event'),time=Date.now();
    emit(h.s,{type:'command/done',seq:22,time,data:{commandId:'orphan',kind:'success'}});
    emit(h.s,{type:'command/run',seq:20,time,data:{commandId:'cross',name:definition.name}});
    definition.handler({commandId:'cross',agent:{session:h.s}});
    emit({...h.s,id:'other'},{type:'command/done',seq:21,time,data:{commandId:'cross',kind:'success'}});
    await h.api.drain();assert.equal(h.api.events().total,0);
  } finally {await h.close();}
});

test('registration ownership follows the selected handler rather than the command name',async()=>{
  const other={...entry,id:'include:shadow',options:{name:'shadow/commands'}};
  const h=await host({loaderEntries:[entry,other],packageOf:name=>name===source.moduleName?canonical:{name:'shadow',version:'1.0.0',manifest:{name:'shadow',version:'1.0.0'}}});
  try {
    register(h);const shadow=register(h,{owner:other});
    run(h,shadow);await h.api.drain();assert.equal(h.api.events().events[0].hanaRef,'shadow');
  } finally {await h.close();}
});

test('withheld consent, unknown owner, mismatched manifest and failed event writes remain gated',async()=>{
  for(const options of [{consent:'withheld'},{packageOf:()=>({...canonical,manifest:{name:'other',version:'0.2.1'}})},{}]) {
    const h=await host(options);
    try {
      if(Object.keys(options).length===0)h.eg.fail=true;
      run(h,register(h));await h.api.drain();assert.equal(h.api.events().total,0);
    } finally {await h.close();}
  }
  const h=await host();
  try {
    run(h,register(h,{owner:undefined})); // default owner is proven
    await h.api.drain();assert.equal(h.api.events().total,1);
    h.setConsent('withheld');await h.api.drain();assert.equal(h.api.events().total,0);
    run(h,register(h),{id:'after-withdraw'});await h.api.drain();assert.equal(h.api.events().total,0);
  } finally {await h.close();}
  const unknown=await host();
  try {run(unknown,register(unknown,{owner:null}));await unknown.api.drain();assert.equal(unknown.api.events().total,0);}finally{await unknown.close();}
});

test('inherited edges, reverse sequence and non-finite success time cannot manufacture use',async()=>{
  const h=await host({inheritedEventCount:10});
  try {
    const definition=register(h);
    run(h,definition,{id:'inherited',seq:1});
    run(h,definition,{id:'bad-time',time:NaN});
    const emit=h.handlers.get('session/event'),time=Date.now();
    emit(h.s,{type:'command/run',seq:20,time,data:{commandId:'reverse',name:definition.name}});
    definition.handler({commandId:'reverse',agent:{session:h.s}});
    emit(h.s,{type:'command/done',seq:19,time,data:{commandId:'reverse',kind:'success'}});
    await h.api.drain();assert.equal(h.api.events().total,0);
  }finally{await h.close();}
});

test('native registration and handler exceptions propagate unchanged; teardown removes the wrapper',async()=>{
  const h=await host();
  const error=new Error('synthetic-private-detail');
  const definition=register(h,{handler:()=>{throw error;}});
  assert.throws(()=>run(h,definition),value=>value===error);
  const hook=h.handlers.get('internal/get');
  const service={register(){throw error;}};
  const wrapped=hook({fiber:{entry}},'commands',error,()=>service);
  assert.throws(()=>wrapped.register({name:'x',handler:()=>{}}),value=>value===error);
  assert.equal(hook({},'unrelated',error,()=>service),service);
  await h.close();
  assert.equal(h.handlers.has('internal/get'),false);
  assert.equal(hook({fiber:{entry}},'commands',error,()=>service),service);
});

test('the resolved Cordis waterfall supplies the actual registering fiber and preserves its effect lifetime',async()=>{
  const {Context,Service}=await import('@deepseek-ai/cordis');
  const {mountCommandFacts}=await import('../lib/host/command-facts.js');
  const ctx=new Context(),facts=[],definitions=[],receivers=[];
  class Commands extends Service {
    constructor(ctx){super(ctx,'commands');}
    register(definition){
      receivers.push(this.ctx.fiber);
      return this.ctx.effect(()=>{definitions.push(definition);return()=>definitions.splice(definitions.indexOf(definition),1);});
    }
  }
  new Commands(ctx);
  const bridge=mountCommandFacts(ctx,fact=>facts.push(fact),2);
  let registrar,childFiber;
  const fiber=ctx.plugin({inject:['commands'],apply(child){
    child.fiber.entry=entry;
    childFiber=child.inject(['commands'],grandchild=>{
      registrar=grandchild.fiber;
      grandchild.commands.register({name:'check-updates',handler:()=>({kind:'success'})});
    });
  }});
  try {
    await fiber.await();await childFiber.await();
    assert.equal(definitions.length,1);assert.equal(receivers[0],registrar);
    const session={isOwnSeq:seq=>seq>=0},definition=definitions[0],time=Date.now();
    bridge.observe(session,{type:'command/run',seq:0,time,data:{commandId:'native',name:definition.name}});
    definition.handler({commandId:'native',agent:{session}});
    bridge.observe(session,{type:'command/done',seq:1,time,data:{commandId:'native',kind:'success'}});
    assert.deepEqual(facts,[{commandId:'native',phase:'succeeded',commandName:'check-updates',source,occurredAt:time}]);
    await fiber.dispose();assert.equal(definitions.length,0);
  }finally{bridge.close();await fiber.dispose();}
});

test('unsettled commands are bounded and a failed settlement releases the slot',async()=>{
  const {mountCommandFacts}=await import('../lib/host/command-facts.js');
  const handlers=new Map(),facts=[],definitions=[];
  const ctx={on(name,fn){handlers.set(name,fn);return()=>handlers.delete(name);}};
  const bridge=mountCommandFacts(ctx,fact=>facts.push(fact),1),session={isOwnSeq:()=>true},time=Date.now();
  try {
    const service={register(def){definitions.push(def);return()=>{};}};
    handlers.get('internal/get')({fiber:{entry}},'commands',new Error('unused'),()=>service).register({name:'check-updates',handler:()=>({kind:'success'})});
    const definition=definitions[0];
    const start=(id,seq)=>bridge.observe(session,{type:'command/run',seq,time,data:{commandId:id,name:definition.name}});
    const invoke=id=>definition.handler({commandId:id,agent:{session}});
    const done=(id,seq,kind)=>bridge.observe(session,{type:'command/done',seq,time,data:{commandId:id,kind}});
    start('first',0);invoke('first');
    start('over-capacity',1);invoke('over-capacity');done('over-capacity',2,'success');
    done('first',3,'error');assert.equal(facts.length,0);
    start('next',4);invoke('next');done('next',5,'success');assert.equal(facts.length,1);
    start('abandoned',6);invoke('abandoned');
    assert.equal(typeof handlers.get('session/disposed'),'function');
    handlers.get('session/disposed')(session);
    start('after-dispose',7);invoke('after-dispose');done('after-dispose',8,'success');assert.equal(facts.length,2);
    bridge.close();start('closed',9);invoke('closed');done('closed',10,'success');assert.equal(facts.length,2);
  }finally{bridge.close();}
});

test('Usage installs registration interception before awaiting storage and removes it on startup failure',async()=>{
  const {apply}=await import('../lib/host/index.js');
  const handlers=new Map(),error=new Error('synthetic-domain-failure');let fail;
  const ctx={agents:{},on(name,fn){handlers.set(name,fn);return()=>handlers.delete(name);},effect:fn=>fn(),storage:{domain:{open:()=>new Promise((_,reject)=>{fail=reject;})}}};
  const applying=apply(ctx);
  try {assert.equal(typeof handlers.get('internal/get'),'function');}
  finally {fail(error);await assert.rejects(applying,value=>value===error);}
  assert.equal(handlers.size,0);
});
