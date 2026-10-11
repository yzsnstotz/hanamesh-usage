import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
function client(){let registration;const effects=[],refs=[],calls=[],observers=[];let index=0;
 const react={createElement:(type,props,...children)=>({type,props,children}),useRef:value=>refs[index++]??(refs[index-1]={current:value}),useEffect:fn=>effects.push(fn),useState:()=>{throw Error('unexpected panel render');}};
 runInNewContext(readFileSync(new URL('../lib/client.js',import.meta.url),'utf8'),{window:{__ModuleLoader__:{load:value=>registration=value}},AbortController,MutationObserver:class {constructor(callback){this.callback=callback;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}}});
 const api=registration.factory(name=>{assert.equal(name,'react');return react;});
 return {api,effects,refs,calls,observers,render:component=>{index=0;return component({privatePayload:'not inspected'});}};
}
function setup(c){let hook;let mounted;const registered=[],disposer=()=>{};const service={register(options,body){registered.push([options,body]);return disposer;},other(){return this===service;}};
 const ctx={on(name,fn){assert.equal(name,'internal/get');hook=fn;return()=>{hook=undefined;};},effect(fn){return fn();},inject(deps,fn){assert.deepEqual(Array.from(deps),['remote.hanameshUsagePages','slots']);fn(this);return Promise.resolve();},remote:{$mount:async contribution=>{mounted=contribution;return()=>{};},hanameshUsagePages:{issue:async request=>{c.calls.push(['issue',request]);return {ok:true,value:{disposition:'issued',credential:'fixture-credential'}};},presented:async request=>{c.calls.push(['presented',request]);return {ok:true,value:{disposition:'recorded'}};}}},slots:{inject(){},register(){}}};
 return {ctx,registered,disposer,get hook(){return hook;},get mounted(){return mounted;},service};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('client wraps only four functional slots, preserves native receivers and options, mounts Usage remote',async()=>{
 const c=client(),s=setup(c);await c.api.apply(s.ctx);assert(s.hook,'Usage must intercept slots');
 assert.equal(s.mounted.package,'hanamesh-usage');
 const owner={fiber:{entry:{id:'include:ordinary',options:{name:'ordinary/client'}}}};
 const wrapped=s.hook(owner,'slots',null,()=>s.service);assert.equal(wrapped.other(),true);
 for(const name of ['main','settings.section','plugins.bundle.config','plugins.row.config','sidebar']){
  const options={name,privateConfig:{secret:'not read'}},component=()=>null;
  assert.equal(wrapped.register(options,component),s.disposer);const entry=s.registered.at(-1);assert.equal(entry[0],options);
  assert.equal(entry[1]===component,name==='sidebar');
 }
 assert.equal(c.calls.length,0,'registration is not presentation');
});
test('presentation waits for DOM commit, emits once under effect replay and suppresses unmounted async replies',async()=>{
 const c=client(),s=setup(c);await c.api.apply(s.ctx);
 const owner={fiber:{parent:{fiber:{entry:{id:'include:ordinary',options:{name:'ordinary/client'}}}}}};
 s.hook(owner,'slots',null,()=>s.service).register({name:'main'},()=>null);
 const component=s.registered[0][1];const tree=c.render(component);assert.equal(tree.type,'div');
 c.refs[0].current={childNodes:[]};const empty=c.effects.shift()();await tick();assert.equal(c.calls.length,0);empty();
 c.render(component);c.refs[0].current={childNodes:[{}]};const effect=c.effects.shift();const first=effect();first();const second=effect();await tick();
 assert.deepEqual(c.calls.map(x=>x[0]),['issue','presented']);assert.deepEqual(JSON.parse(JSON.stringify(c.calls[0][1])),{entryId:'include:ordinary',moduleName:'ordinary/client',surface:'main'});
 second();
 const d=client(),t=setup(d);await d.api.apply(t.ctx);let resolveIssue;
 t.ctx.remote.hanameshUsagePages.issue=request=>new Promise(resolve=>{d.calls.push(['issue',request]);resolveIssue=resolve;});
 t.hook(owner,'slots',null,()=>t.service).register({name:'main'},()=>null);d.render(t.registered[0][1]);d.refs[0].current={childNodes:[{}]};const stop=d.effects.shift()();stop();resolveIssue({ok:true,value:{disposition:'issued',credential:'late'}});await tick();assert.deepEqual(d.calls.map(x=>x[0]),['issue']);
});
test('native Cordis trace captures registering child and preserves registration effect disposal',async()=>{
 const {Context,Service}=await import('@deepseek-ai/cordis');const ctx=new Context(),c=client(),definitions=[],receivers=[];
 class Slots extends Service{constructor(ctx){super(ctx,'slots');}inject(){}register(options,component){receivers.push(this.ctx.fiber);return this.ctx.effect(()=>{definitions.push([options,component]);return()=>definitions.splice(definitions.findIndex(x=>x[1]===component),1);});}}
 new Slots(ctx);ctx.provide('remote.hanameshUsagePages',{issue:async()=>({ok:true,value:{disposition:'withheld'}})});ctx.provide('remote',{$mount:async()=>()=>{},hanameshUsagePages:{issue:async()=>({ok:true,value:{disposition:'withheld'}})}});
 const usage=ctx.plugin({inject:c.api.inject,apply:c.api.apply});await usage.await();let registrar,nested;
 const owner=ctx.plugin({inject:['slots'],apply(child){child.fiber.entry={id:'include:native',options:{name:'native/client'}};nested=child.inject(['slots'],grandchild=>{registrar=grandchild.fiber;grandchild.slots.register({name:'main'},()=>null);});}});
 try{await owner.await();await nested.await();assert.equal(receivers[0],registrar);assert.equal(definitions.length,1);
 c.render(definitions[0][1]);c.refs[0].current={childNodes:[{}]};c.effects.shift()();await tick();
 await owner.dispose();assert.equal(definitions.length,0);await usage.dispose();
 const original=()=>null;ctx.slots.register({name:'main'},original);assert.equal(definitions[0][1],original);
 }finally{await owner.dispose();await usage.dispose();}
});
test('Usage client starts immediately after framework services without waiting on feature contributors',()=>{
 const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
 assert.equal(pkg.dsh.client.immediately,true);
 assert.deepEqual(pkg.dsh.client.inject,['@deepseek-ai/dsh-client-ui-renderer','@deepseek-ai/dsh-api-gateway']);
});

test('page content appearing after an initial empty child commit is reported without a parent rerender',async()=>{
 const c=client(),s=setup(c);await c.api.apply(s.ctx);
 s.hook({fiber:{entry:{id:'include:async',options:{name:'async/client'}}}},'slots',null,()=>s.service).register({name:'main'},()=>null);
 c.render(s.registered[0][1]);c.refs[0].current={childNodes:[]};const stop=c.effects.shift()();await tick();assert.equal(c.calls.length,0);
 assert.equal(c.observers.length,1,'empty DOM needs commit observation');
 c.refs[0].current.childNodes.push({});c.observers[0].callback();await tick();assert.deepEqual(c.calls.map(x=>x[0]),['issue','presented']);
 stop();assert.equal(c.observers[0].disconnected,true);
});

 test('native namespace access is declared before a committed page observer calls it',async()=>{
 const {Context,Service}=await import('@deepseek-ai/cordis');const ctx=new Context(),c=client(),definitions=[];let issued=0;
 class Slots extends Service{constructor(ctx){super(ctx,'slots');}inject(){}register(options,body){definitions.push(body);return()=>{};}}
 class Pages extends Service{constructor(ctx){super(ctx,'remote.hanameshUsagePages');}async issue(){issued++;return {ok:true,value:{disposition:'withheld'}};}}
 class Remote extends Service{constructor(ctx){super(ctx,'remote');}async $mount(){return()=>{};}get hanameshUsagePages(){return this.ctx['remote.hanameshUsagePages'];}}
 new Slots(ctx);new Remote(ctx);const pages=ctx.plugin({apply(child){new Pages(child);}});await pages.await();
 const usage=ctx.plugin({inject:c.api.inject,apply:c.api.apply});await usage.await();
 const owner=ctx.plugin({inject:['slots'],apply(child){child.fiber.entry={id:'include:native',options:{name:'native/client'}};child.slots.register({name:'settings.section'},()=>null);}});
 try{await owner.await();c.render(definitions[0]);c.refs[0].current={childNodes:[{}]};const stop=c.effects.shift()();await tick();assert.equal(issued,1);stop();}
 finally{await owner.dispose();await usage.dispose();await pages.dispose();}
 });
