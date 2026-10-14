import { createElement as h, useEffect, useState, useRef } from 'react';

/** Public Settings Slot subset used here; mirrors the frozen platform contract. */
interface SettingsSlots {
  inject(name:'settings.section', mount:()=>()=>void):unknown;
  register(options:{name:'settings.section';id:string;order:number;label:string}, component:typeof UsagePanel):()=>void;
}
interface PageSource {entryId:string;moduleName:string;surface:string}
type IssueResult={disposition:string;credential?:string};
interface PagesRemote {
  issue(request:PageSource):Promise<{ok:true;value:IssueResult}|{ok:false;error:unknown}>;
  presented(request:{credential:string}):Promise<unknown>;
}
interface ClientContext {
  slots:SettingsSlots;
  remote:{$mount(contribution:import('@deepseek-ai/dsh-typert-protocol').TypertRemoteContribution):Promise<()=>void>;hanameshUsagePages:PagesRemote};
  on(name:'internal/get',listener:(caller:unknown,name:string,error:unknown,next:()=>unknown)=>unknown):()=>void;
  effect(fn:()=>unknown):unknown;
  inject(names:string[],mount:(ctx:ClientContext)=>void):PromiseLike<unknown>;
}
interface Carrier { fetch?(input:string|URL, init:RequestInit):Promise<Response> }
declare global { interface Window { __DSH_TRANSPORT__?:Carrier } }

export const inject=['slots','remote'];

const verificationPath='api/hanamesh/usage/verification';
const verificationCalls=['record','health','observeCollection'] as const;
type VerificationCall=typeof verificationCalls[number];
interface VerificationCapability {enabled:true;calls:VerificationCall[];deviceId:string|null}
interface VerificationReply {call:VerificationCall;input:unknown;result:unknown;health:unknown}
class VerificationError extends Error {
  constructor(message:string,readonly code?:string){super(message);}
}
function object(value:unknown):value is Record<string,unknown> {
  return value!==null&&typeof value==='object'&&!Array.isArray(value);
}
function verificationFetch(path:string,init:RequestInit):Promise<Response> {
  const carrier=window.__DSH_TRANSPORT__;
  return carrier?.fetch?carrier.fetch(path,init):globalThis.fetch(path,init);
}
async function verificationJson(response:Response):Promise<unknown> {
  if(response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')
    throw new VerificationError('USAGE_VERIFICATION_MEDIA_TYPE');
  try {return await response.json();}
  catch {throw new VerificationError('USAGE_VERIFICATION_INVALID_RESPONSE');}
}

/** Test-profile bridge; forwards the edited input without generating source facts. */
export async function fetchUsageVerification(call:VerificationCall,input:unknown,signal:AbortSignal):Promise<VerificationReply> {
  try {
    if(!verificationCalls.includes(call)||(call!=='record'&&input!==null))
      throw new VerificationError('USAGE_VERIFICATION_INVALID_INPUT');
    const response=await verificationFetch(`${verificationPath}/call`,{
      method:'POST',credentials:'same-origin',cache:'no-store',signal,
      headers:{'content-type':'application/json'},body:JSON.stringify({call,input}),
    });
    if(!response.ok){
      // Only named public service codes are diagnostics; never surface raw text.
      if(response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()==='application/json'){
        const failure=await verificationJson(response);
        if(object(failure)&&object(failure.error)&&['USAGE_UNAVAILABLE','USAGE_VERIFICATION_INVALID'].includes(failure.error.code as string))
          throw new VerificationError('USAGE_VERIFICATION_SERVICE_ERROR',failure.error.code as string);
      }
      throw new VerificationError('USAGE_VERIFICATION_UNAVAILABLE');
    }
    const reply=await verificationJson(response);
    if(!object(reply)||reply.call!==call||!['input','result','health'].every(key=>Object.hasOwn(reply,key)))
      throw new VerificationError('USAGE_VERIFICATION_INVALID_RESPONSE');
    return reply as unknown as VerificationReply;
  } catch(error){
    if(error instanceof VerificationError)throw error;
    throw new VerificationError('USAGE_VERIFICATION_UNAVAILABLE');
  }
}

function editedInput(call:VerificationCall,draft:string):unknown {
  let value:unknown;
  try {value=JSON.parse(draft);}
  catch {throw new VerificationError('USAGE_VERIFICATION_INVALID_JSON');}
  if(call==='record'?!object(value):value!==null)throw new VerificationError('USAGE_VERIFICATION_INVALID_INPUT');
  return value;
}

/** Native controls are outside the script-free view and hidden until enabled. */
export function UsageVerificationPanel() {
  const [capability,setCapability]=useState<VerificationCapability|null>(null);
  const [call,setCall]=useState<VerificationCall>('record');
  const [draft,setDraft]=useState('{}');
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState<VerificationReply|null>(null);
  const [error,setError]=useState<string|null>(null);
  const mounted=useRef(false);
  const request=useRef<AbortController|null>(null);
  useEffect(()=>{
    mounted.current=true;
    const controller=new AbortController();
    void (async()=>{
      try {
        const response=await verificationFetch(verificationPath,{method:'GET',credentials:'same-origin',cache:'no-store',signal:controller.signal});
        if(!response.ok)return;
        const value=await verificationJson(response);
        const calls=object(value)?value.calls:undefined;
        if(!object(value)||value.enabled!==true||!Array.isArray(value.calls)
          ||value.calls.length!==verificationCalls.length||!verificationCalls.every(method=>Array.isArray(calls)&&calls.includes(method))
          ||!(value.deviceId===null||typeof value.deviceId==='string'))return;
        if(!controller.signal.aborted)setCapability(value as unknown as VerificationCapability);
      } catch {
        if(!controller.signal.aborted)setError('USAGE_VERIFICATION_UNAVAILABLE');
      }
    })();
    return ()=>{mounted.current=false;controller.abort();request.current?.abort();};
  },[]);
  if(capability===null)return null;

  function showError(reason:unknown){
    setError(reason instanceof VerificationError?reason.code??reason.message:'USAGE_VERIFICATION_UNAVAILABLE');
  }
  function execute(){
    if(request.current!==null||!mounted.current)return;
    let input:unknown;
    try {input=editedInput(call,draft);}
    catch(reason){setResult(null);showError(reason);return;}
    const controller=new AbortController();
    request.current=controller;setBusy(true);setResult(null);setError(null);
    void fetchUsageVerification(call,input,controller.signal).then(reply=>{
      if(mounted.current&&!controller.signal.aborted)setResult(reply);
    },reason=>{
      if(mounted.current&&!controller.signal.aborted)showError(reason);
    }).finally(()=>{
      if(request.current===controller)request.current=null;
      if(mounted.current&&!controller.signal.aborted)setBusy(false);
    });
  }
  function replay(){
    if(request.current!==null)return;
    try {
      const input=editedInput('record',draft) as Record<string,unknown>;
      const keys=['hanaRef','action','idempotencyKey','sourcePlugin'];
      if(!keys.every(key=>Object.hasOwn(input,key)))throw new VerificationError('USAGE_VERIFICATION_INVALID_INPUT');
      setDraft(JSON.stringify(Object.fromEntries(keys.map(key=>[key,input[key]])),null,2));
      setResult(null);setError(null);
    } catch(reason){showError(reason);}
  }
  return h('section',{'aria-label':'Usage 测试版三调用'},
    h('h3',null,'Usage 测试版三调用'),
    h('p',null,'当前设备：',capability.deviceId===null?'null':capability.deviceId),
    h('label',null,'调用 ',h('select',{value:call,disabled:busy,onChange:(event:import('react').ChangeEvent<HTMLSelectElement>)=>{
      const next=event.currentTarget.value as VerificationCall;
      if(request.current!==null||!verificationCalls.includes(next))return;
      setCall(next);setDraft(next==='record'?'{}':'null');setError(null);setResult(null);
    }},...verificationCalls.map(method=>h('option',{key:method,value:method},method)))),
    h('label',null,'输入 JSON ',h('textarea',{value:draft,disabled:busy,rows:12,style:{display:'block',width:'100%'},onChange:(event:import('react').ChangeEvent<HTMLTextAreaElement>)=>{
      if(request.current===null){setDraft(event.currentTarget.value);setError(null);}
    }})),
    call==='record'?h('button',{type:'button',disabled:busy,onClick:replay},'四字段重放'):null,
    h('button',{type:'button',disabled:busy,onClick:execute},busy?'执行中…':'执行'),
    error===null?null:h('p',{role:'alert'},error),
    result===null?null:h('pre',{'aria-label':'实际调用结果'},JSON.stringify(result,null,2)),
  );
}

/** Same authenticated Fetch registry for Web and the Desktop carrier. No write API. */
export async function fetchUsagePanel(signal:AbortSignal):Promise<string> {
  const carrier=window.__DSH_TRANSPORT__;
  const init:RequestInit={method:'GET',credentials:'same-origin',cache:'no-store',signal};
  const response=carrier?.fetch
    ? await carrier.fetch('api/hanamesh/usage/panel/view',init)
    : await globalThis.fetch('api/hanamesh/usage/panel/view',init);
  if(!response.ok||!response.headers.get('content-type')?.startsWith('text/html'))throw new Error('USAGE_PANEL_UNAVAILABLE');
  return await response.text();
}

/** A sandboxed, script-free Usage-owned view with explicit refresh/error states. */
export function UsagePanel() {
  const [revision,setRevision]=useState(0);
  const [state,setState]=useState<{loading:boolean;html:string|null;error:boolean}>({loading:true,html:null,error:false});
  useEffect(()=>{
    const controller=new AbortController();
    setState({loading:true,html:null,error:false});
    void fetchUsagePanel(controller.signal).then(html=>{
      if(!controller.signal.aborted)setState({loading:false,html,error:false});
    },()=>{
      if(!controller.signal.aborted)setState({loading:false,html:null,error:true});
    });
    return ()=>controller.abort();
  },[revision]);
  return h('section',{'aria-label':'Usage 开发小面板'},
    h('h2',null,'Usage 开发小面板'),
    h('button',{type:'button',disabled:state.loading,onClick:()=>setRevision(value=>value+1)},state.loading?'读取中…':'刷新本机记录'),
    state.error?h('p',{role:'alert'},'本机记录读取失败 · USAGE_PANEL_UNAVAILABLE；刷新只读，不触发新的采集或上报。'):null,
    state.html===null?null:h('iframe',{title:'本机 Usage 事件、签名与上报状态',srcDoc:state.html,sandbox:'',style:{width:'100%',height:650,border:0}}),
    h(UsageVerificationPanel),
  );
}

/** Usage-owned strict wire codecs implement Typert's documented schema parse seat. */
function requestCodec(method:string):import('@deepseek-ai/dsh-typert-protocol').TypertCodec {
  return {mode:'strict',typeSymbol:`hanamesh-usage/${method}Request`,create:()=>({parse(value:unknown){
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('USAGE_PAGE_INVALID_REQUEST');
    const item=value as Record<string,unknown>;
    if(method==='issue'){
      if(Object.keys(item).sort().join('|')!=='entryId|moduleName|surface'||typeof item.entryId!=='string'||typeof item.moduleName!=='string'
        ||!['main','settings.section','plugins.bundle.config','plugins.row.config'].includes(item.surface as string))throw new Error('USAGE_PAGE_INVALID_REQUEST');
      return {entryId:item.entryId,moduleName:item.moduleName,surface:item.surface};
    }
    if(Object.keys(item).join('|')!=='credential'||typeof item.credential!=='string')throw new Error('USAGE_PAGE_INVALID_REQUEST');
    return {credential:item.credential};
  }})};
}
export const pagesContribution:import('@deepseek-ai/dsh-typert-protocol').TypertRemoteContribution={
  package:'hanamesh-usage',descriptors:['issue','presented'].map(method=>({
    id:`hanamesh-usage#hanameshUsagePages/${method}`,service:'hanameshUsagePages',namespace:'hanameshUsagePages',method,
    invocation:{kind:'direct'},parameters:[{name:'request',wire:'request',source:'json',codec:requestCodec(method)}],result:{mode:'src-json'},
  })),
};
function slotOwner(caller:unknown):{entryId:string;moduleName:string}|null {
  const seen=new Set();
  for(let fiber=(caller as {fiber?:any})?.fiber;fiber&&!seen.has(fiber);fiber=fiber.parent?.fiber){
    seen.add(fiber);const entry=fiber.entry;if(!entry)continue;
    if(typeof entry.id!=='string'||typeof entry.options?.name!=='string'||entry.options.group)return null;
    return {entryId:entry.id,moduleName:entry.options.name};
  }
  return null;
}
/** Observe committed DOM, preserving component props and framework-owned registration. */
function presentedPage(component:import('react').ComponentType<any>,source:PageSource,remote:()=>PagesRemote,enabled:()=>boolean){
  return function UsagePresentedPage(props:object){
    const element=useRef<HTMLDivElement|null>(null);
    const claim=useRef<Promise<IssueResult|null>|null>(null);
    const sent=useRef(false);
    useEffect(()=>{
      let mounted=true;
      const observer=new MutationObserver(check);
      function check(){
        if(!mounted||!enabled()||sent.current||!element.current?.childNodes.length)return;
        claim.current??=remote().issue(source).then(result=>result.ok?result.value:null,()=>null);
        void claim.current.then(result=>{
          if(!mounted||!enabled()||sent.current||result?.disposition!=='issued'||typeof result.credential!=='string')return;
          sent.current=true;observer.disconnect();
          void remote().presented({credential:result.credential}).catch(()=>{});
        });
      }
      if(element.current)observer.observe(element.current,{childList:true,subtree:true});
      check();
      return ()=>{mounted=false;observer.disconnect();};
    });
    return h('div',{ref:element,style:{display:'contents'}},h(component,props));
  };
}
/** Install before awaiting Remote mounting, so concurrent slot registrations are captured. */
export async function apply(ctx:ClientContext):Promise<void> {
  let closed=false;
  let pagesContext:ClientContext|null=null;
  const stop=ctx.on('internal/get',(caller,name,_error,next)=>{
    const service=next();
    if(closed||name!=='slots'||!service||typeof (service as {register?:unknown}).register!=='function')return service;
    return new Proxy(service as object,{get(target,key){
      const member=Reflect.get(target,key,target);
      if(key!=='register'||typeof member!=='function')return typeof member==='function'?member.bind(target):member;
      return (options:{name?:string},component:import('react').ComponentType<any>)=>{
        const owner=slotOwner(caller);
        const body=!closed&&owner&&['main','settings.section','plugins.bundle.config','plugins.row.config'].includes(options?.name??'')
          ?presentedPage(component,{...owner,surface:options.name!},()=>pagesContext!.remote.hanameshUsagePages,()=>!closed&&pagesContext!==null):component;
        return Reflect.apply(member,target,[options,body]);
      };
    }});
  });
  ctx.effect(()=>()=>{closed=true;stop();});
  try {await ctx.effect(async()=>await ctx.remote.$mount(pagesContribution));}
  catch(error){closed=true;stop();throw error;}
  if(closed)return;
  // $mount creates the namespace. Declare its dependency in a child fiber only
  // afterwards; accessing it through the outer remote inject is prohibited.
  await ctx.inject(['remote.hanameshUsagePages','slots'],scoped=>{
    pagesContext=scoped;
    scoped.effect(()=>()=>{if(pagesContext===scoped)pagesContext=null;});
    scoped.slots.inject('settings.section',()=>scoped.slots.register({name:'settings.section',id:'hanamesh-usage',order:80,label:'Usage 开发小面板'},UsagePanel));
  });
}
