import { createElement as h, useEffect, useState, useRef } from 'react';
interface Carrier {fetch?(input:string|URL,init:RequestInit):Promise<Response>}
declare global {interface Window {__DSH_TRANSPORT__?:Carrier}}

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
