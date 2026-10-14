import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const json=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
const plain=value=>JSON.parse(JSON.stringify(value));
// Materialize the normal shipped client bundle with a React/carrier boundary
// fixture, not an alternative product page or implementation of the component.
function client(fetch){
  let registration,active,root,props={};const instances=new Map(),effects=[];
  const react={
    createElement:(type,props,...children)=>({type,props:props??{},children}),
    useState(initial){const owner=active,i=owner.index++;if(!(i in owner.hooks))owner.hooks[i]=typeof initial==='function'?initial():initial;return [owner.hooks[i],value=>{owner.hooks[i]=typeof value==='function'?value(owner.hooks[i]):value;}];},
    useRef(initial){const owner=active,i=owner.index++;return owner.hooks[i]??={current:initial};},
    useEffect(fn,deps){const owner=active,i=owner.index++,old=owner.hooks[i];if(old&&deps&&old.deps&&deps.every((v,n)=>Object.is(v,old.deps[n])))return;effects.push(()=>{old?.cleanup?.();owner.hooks[i]={deps,cleanup:fn()};});},
  };
  const carrier={fetch};
  runInNewContext(readFileSync(new URL('../lib/client.js',import.meta.url),'utf8'),{window:{__DSH_TRANSPORT__:carrier,__ModuleLoader__:{load:r=>{registration=r;}}},globalThis:{fetch:()=>assert.fail('must use normal carrier')},AbortController,Response,Headers,URL,setTimeout,clearTimeout});
  assert.equal(registration.id,'hanamesh-usage');const api=registration.factory(name=>{assert.equal(name,'react');return react;});
  function expand(node,path='root'){
    if(Array.isArray(node))return node.map((n,i)=>expand(n,`${path}.${i}`));
    if(!node||typeof node!=='object')return node;
    if(typeof node.type==='function'){
      const owner=instances.get(path)??{hooks:[],index:0};instances.set(path,owner);owner.index=0;const prev=active;active=owner;
      try{return expand(node.type(node.props),path+'.body');}finally{active=prev;}
    }
    return {...node,children:node.children.map((n,i)=>expand(n,`${path}.${i}`))};
  }
  const h={api,tree:null,render(component=root,input=props){root=component;props=input;assert.equal(typeof root,'function');h.tree=expand(react.createElement(root,props));for(const fn of effects.splice(0))fn();return h.tree;},async settle(){for(let i=0;i<8;i++){await new Promise(resolve=>setImmediate(resolve));h.render();}},dispose(){for(const owner of instances.values())for(const hook of owner.hooks)hook?.cleanup?.();}};
  return h;
}
function nodes(tree){return Array.isArray(tree)?tree.flatMap(nodes):!tree||typeof tree!=='object'?[]:[tree,...tree.children.flatMap(nodes)];}
function text(tree){return Array.isArray(tree)?tree.map(text).join(' '):!tree?'':typeof tree!=='object'?String(tree):tree.children.map(text).join(' ');}

test('S06-R07 normal client resend bridge carries only selected ids through authenticated POST',async()=>{
  const calls=[],result={state:'processed',code:null,events:[{eventId:id,delivery:'unconfirmed',code:'USAGE_STORAGE_UNAVAILABLE'}],health:null};
  function fetch(path,init){assert.equal(this.fetch,fetch);calls.push({path,init});return Promise.resolve(json(result));}
  const h=client(fetch);assert.equal(typeof h.api.fetchUsageResend,'function','normal public client user-resend bridge is missing');
  const signal=new AbortController().signal;
  assert.deepEqual(plain(await h.api.fetchUsageResend({eventIds:[id]},signal)),result);
  assert.equal(calls.length,1);assert.equal(calls[0].path,'api/hanamesh/usage/events/resend');
  assert.equal(calls[0].init.method,'POST');assert.equal(calls[0].init.credentials,'same-origin');assert.equal(calls[0].init.cache,'no-store');assert.equal(calls[0].init.signal,signal);
  assert.deepEqual(JSON.parse(calls[0].init.body),{eventIds:[id]});
});

test('S06-R08 normal Settings selection and user button send once; mounting never resends unknown',async()=>{
  const calls=[],panel={policy:{eventRetentionDays:90,queryLimit:100,maxQueryLimit:1000},subject:{deviceId:'If4x36FUomFia_hUBG_SJxt77UtqvkWqWId-9H-XIbk',principalId:null,reason:'PRINCIPAL_UNAVAILABLE'},testSupply:{identity:false,receiver:false},consent:'granted',core:'present',total:1,outbox:{state:'unconfirmed',pending:1,sent:0,duplicate:0,rejected:0,lastUploadAt:null,nextAttemptAt:null,lastError:'USAGE_STORAGE_UNAVAILABLE'},failures:{},withdrawal:null,events:[{eventId:id,deviceId:'If4x36FUomFia_hUBG_SJxt77UtqvkWqWId-9H-XIbk',hanaRef:'fixture.app',action:'use',occurredAt:'2026-10-15T00:00:00.007Z',source:'seat',sourcePlugin:'fixture.app',evidenceRef:'source:a',signature:{state:'success',code:null},upload:{state:'pending',attempts:1,code:'USAGE_STORAGE_UNAVAILABLE',sentAt:null}}]};
  const result={state:'processed',code:null,events:[{eventId:id,delivery:'unconfirmed',code:'USAGE_STORAGE_UNAVAILABLE'}],health:null};
  function fetch(path,init){calls.push({path,init});if(path==='api/hanamesh/usage/panel')return Promise.resolve(json(panel));if(path==='api/hanamesh/usage/events/resend')return Promise.resolve(json(result));if(path.endsWith('/verification'))return Promise.resolve(new Response('disabled',{status:404}));return Promise.resolve(new Response('<html>read-only fixture</html>',{headers:{'content-type':'text/html'}}));}
  const h=client(fetch);
  try{
    h.render(h.api.UsagePanel);await h.settle();assert.equal(calls.filter(r=>r.init.method==='POST').length,0,'mount/read is no user authorization');
    const boxes=nodes(h.tree).filter(n=>n.type==='input'&&n.props.type==='checkbox');assert.equal(boxes.length,1,'normal Settings lacks selectable original event');
    const target={checked:true,value:id};boxes[0].props.onChange({target,currentTarget:target});h.render();
    const button=nodes(h.tree).find(n=>n.type==='button'&&text(n)==='重发所选记录');assert(button,'normal Settings must have explicit user resend action');assert.notEqual(button.props.disabled,true);
    button.props.onClick();h.render();await h.settle();
    const posts=calls.filter(r=>r.init.method==='POST');assert.equal(posts.length,1);assert.equal(posts[0].path,'api/hanamesh/usage/events/resend');assert.deepEqual(JSON.parse(posts[0].init.body),{eventIds:[id]});
    assert.match(text(h.tree),/unconfirmed|未确认/);assert.doesNotMatch(text(h.tree),/PASS/);
  }finally{h.dispose();}
});
