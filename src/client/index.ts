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

interface WithdrawalSnapshot {
  requestedAt:string;deviceId:string;state:'pending'|'sent'|'offline'|'unconfirmed';
  attempts:number;deletedEvents:number|null;lastError:string|null;
}
/** Client-side copy of the existing public health contract; contains no signing material. */
interface HealthSnapshot {
  pending:number;recoveryComplete:boolean;failures:Record<string,number>;
  consent:'granted'|'withheld'|'unknown';core:'present'|'absent'|'incompatible';deviceId:string|null;
  outbox:{state:'idle'|'uploading'|'backoff'|'offline'|'stopped'|'unconfirmed';pending:number;sent:number;duplicate:number;rejected:number;lastUploadAt:string|null;nextAttemptAt:string|null;lastError:string|null};
  withdrawal:WithdrawalSnapshot|null;
  inventory:{available:boolean;source:'plugin-manager'|'none';lastScanAt:string|null;lastError:string|null;failureKind:string|null;unreadable:number;detail:{package:string;serviceKey:string;methods:string[]}|null};
  filtered:{commands:number;pages:number};
}
export interface ResendEventsResult {
  readonly state:'processed'|'withheld'|'rejected';
  readonly code:null|'RESEND_INPUT_INVALID'|'RESEND_EVENT_UNAVAILABLE'|'CORE_UNAVAILABLE'|'USAGE_UNAVAILABLE'|'UPLOAD_STATE_PERSIST_FAILED'|'RESEND_FAILED';
  readonly events:readonly {eventId:string;delivery:'pending'|'confirmed'|'rejected'|'unconfirmed';code:string|null}[];
  readonly health:HealthSnapshot|null;
}
interface ResendPanelSnapshot {
  deviceId:string|null;consent:HealthSnapshot['consent'];withdrawal:WithdrawalSnapshot|null;
  events:{eventId:string;deviceId:string;signature:'success'|'failure'|'unknown';upload:'pending'|'sent'|'duplicate'|'rejected';code:string|null}[];
}
const resendCodes=['RESEND_INPUT_INVALID','RESEND_EVENT_UNAVAILABLE','CORE_UNAVAILABLE','USAGE_UNAVAILABLE','UPLOAD_STATE_PERSIST_FAILED','RESEND_FAILED'] as const;
// Existing local diagnostics and the formal C-USAGE public error codes only.
const deliveryCodes=new Set<string>([...resendCodes,'LEGACY_NONCE_UNSUPPORTED','UPLOAD_ATTEMPT_UNCONFIRMED','UPLOAD_EVENT_INVALID','UPLOAD_UNAVAILABLE','UPLOAD_UNAUTHORIZED','UPLOAD_RESPONSE_INVALID','UPLOAD_BATCH_TOO_LARGE','WITHDRAW_UNAVAILABLE','WITHDRAW_RESPONSE_INVALID',
  'USAGE_INPUT_INVALID','USAGE_CONFIG_INVALID','USAGE_IDENTITY_REQUIRED','USAGE_AUTH_REQUIRED','USAGE_FORBIDDEN','USAGE_IDENTITY_UNAVAILABLE','USAGE_NOT_FOUND','USAGE_EVENT_CONFLICT','USAGE_STORAGE_UNAVAILABLE','USAGE_SCHEMA_MISSING','USAGE_ROLE_UNSAFE','USAGE_ORIGIN_REJECTED','USAGE_MEDIA_TYPE_REJECTED','USAGE_RATE_LIMITED','USAGE_NONCE_REUSED','USAGE_SIGNATURE_INVALID','USAGE_DEVICE_MISMATCH','USAGE_CLOCK_SKEW','USAGE_DEVICE_REVOKED','USAGE_EVENT_HOOK_FAILED']);
const eventIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
class ResendError extends Error {
  constructor(readonly code:string){super(code);}
}
// Server codes and per-item host reasons are open-ended tokens (C-USAGE: "expect new values"); shape, not membership.
const codeToken=/^[A-Z][A-Z0-9_]{0,79}(?::[A-Z][A-Z0-9_]{0,79})?$/;
const hostRejection=(code:string|null)=>code==='USAGE_EVENT_HOST_REJECTED'||(code?.startsWith('USAGE_EVENT_HOST_REJECTED:')??false);
const deliveryCode=(value:unknown):value is string|null=>value===null||(typeof value==='string'&&(deliveryCodes.has(value)||codeToken.test(value)));
function withdrawalSnapshot(value:unknown):value is WithdrawalSnapshot|null {
  return value===null||(object(value)&&typeof value.requestedAt==='string'&&typeof value.deviceId==='string'
    &&['pending','sent','offline','unconfirmed'].includes(value.state as string)
    &&Number.isSafeInteger(value.attempts)&&Number(value.attempts)>=0
    &&(value.deletedEvents===null||(Number.isSafeInteger(value.deletedEvents)&&Number(value.deletedEvents)>=0))&&deliveryCode(value.lastError));
}
async function resendJson(response:Response):Promise<unknown> {
  if(response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw new ResendError('USAGE_RESEND_INVALID_RESPONSE');
  try{return await response.json();}catch{throw new ResendError('USAGE_RESEND_INVALID_RESPONSE');}
}

/** One explicit user intent, through the normal authenticated carrier. */
export async function fetchUsageResend(input:{eventIds:string[]},signal:AbortSignal):Promise<ResendEventsResult> {
  try {
    if(!object(input)||Object.keys(input).join('|')!=='eventIds'||!Array.isArray(input.eventIds)||input.eventIds.length===0
      ||!input.eventIds.every(id=>typeof id==='string'&&eventIdPattern.test(id))||new Set(input.eventIds).size!==input.eventIds.length)throw new ResendError('RESEND_INPUT_INVALID');
    const response=await verificationFetch('api/hanamesh/usage/events/resend',{
      method:'POST',credentials:'same-origin',cache:'no-store',signal,
      headers:{'content-type':'application/json'},body:JSON.stringify({eventIds:input.eventIds}),
    });
    const reply=await resendJson(response);
    if(!response.ok){
      if(object(reply)&&object(reply.error)&&['RESEND_INPUT_INVALID','USAGE_UNAVAILABLE'].includes(reply.error.code as string))throw new ResendError(reply.error.code as string);
      throw new ResendError('USAGE_RESEND_UNAVAILABLE');
    }
    if(!object(reply)||Object.keys(reply).sort().join('|')!=='code|events|health|state'||!['processed','withheld','rejected'].includes(reply.state as string)
      ||!(reply.code===null||resendCodes.includes(reply.code as typeof resendCodes[number]))||!Array.isArray(reply.events)
      ||!reply.events.every(event=>object(event)&&Object.keys(event).sort().join('|')==='code|delivery|eventId'
        &&typeof event.eventId==='string'&&input.eventIds.includes(event.eventId)&&['pending','confirmed','rejected','unconfirmed'].includes(event.delivery as string)&&deliveryCode(event.code))
      ||new Set(reply.events.map(event=>event.eventId)).size!==reply.events.length
      ||!(reply.health===null||(object(reply.health)&&['granted','withheld','unknown'].includes(reply.health.consent as string)
        &&(reply.health.deviceId===null||typeof reply.health.deviceId==='string')&&withdrawalSnapshot(reply.health.withdrawal)
        &&object(reply.health.outbox)&&['idle','uploading','backoff','offline','stopped','unconfirmed'].includes(reply.health.outbox.state as string)
        &&deliveryCode(reply.health.outbox.lastError))))throw new ResendError('USAGE_RESEND_INVALID_RESPONSE');
    return reply as unknown as ResendEventsResult;
  } catch(error){
    if(error instanceof ResendError)throw error;
    throw new ResendError('USAGE_RESEND_UNAVAILABLE');
  }
}

/** Read only the normal panel projection; never request raw events or signatures. */
async function fetchResendPanel(signal:AbortSignal):Promise<ResendPanelSnapshot> {
  try {
    const response=await verificationFetch('api/hanamesh/usage/panel',{method:'GET',credentials:'same-origin',cache:'no-store',signal});
    if(!response.ok)throw new ResendError('USAGE_PANEL_UNAVAILABLE');
    const value=await resendJson(response);
    if(!object(value)||!object(value.subject)||(value.subject.deviceId!==null&&typeof value.subject.deviceId!=='string')
      ||!['granted','withheld','unknown'].includes(value.consent as string)||!withdrawalSnapshot(value.withdrawal)||!Array.isArray(value.events)
      ||!value.events.every(event=>object(event)&&typeof event.eventId==='string'&&eventIdPattern.test(event.eventId)&&typeof event.deviceId==='string'
        &&object(event.signature)&&['success','failure','unknown'].includes(event.signature.state as string)
        &&object(event.upload)&&['pending','sent','duplicate','rejected'].includes(event.upload.state as string)&&deliveryCode(event.upload.code)))throw new ResendError('USAGE_PANEL_UNAVAILABLE');
    return {deviceId:value.subject.deviceId as string|null,consent:value.consent as HealthSnapshot['consent'],withdrawal:value.withdrawal,
      events:value.events.map(event=>({eventId:event.eventId,deviceId:event.deviceId,signature:event.signature.state,upload:event.upload.state,code:event.upload.code}))};
  }catch{throw new ResendError('USAGE_PANEL_UNAVAILABLE');}
}

/** Normal Settings controls. Reading this component grants no resend intent. */
export function UsageResendPanel({revision=0}:{revision?:number}) {
  const [panel,setPanel]=useState<ResendPanelSnapshot|null>(null);
  const [selected,setSelected]=useState<string[]>([]);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [result,setResult]=useState<ResendEventsResult|null>(null);
  const [error,setError]=useState<string|null>(null);
  const mounted=useRef(false);
  const request=useRef<AbortController|null>(null);
  useEffect(()=>{
    mounted.current=true;
    return ()=>{mounted.current=false;request.current?.abort();};
  },[]);
  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true);setSelected([]);setError(null);
    void fetchResendPanel(controller.signal).then(value=>{
      if(!controller.signal.aborted){setPanel(value);setResult(null);}
    },()=>{
      if(!controller.signal.aborted){setPanel(null);setError('USAGE_PANEL_UNAVAILABLE');}
    }).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[revision]);
  const health=result?.health;
  const consent=result===null?panel?.consent:health?.consent;
  const withdrawal=result===null?panel?.withdrawal:health?.withdrawal;
  const deviceId=result===null?panel?.deviceId:health?.deviceId;
  const candidates=(panel?.events??[]).filter(event=>event.deviceId===deviceId&&(event.upload==='pending'||(event.upload==='rejected'&&hostRejection(event.code)))
    &&!result?.events.some(item=>item.eventId===event.eventId&&['confirmed','rejected'].includes(item.delivery)));
  const blocked=loading||busy||panel===null||consent!=='granted'||withdrawal!==null;
  function execute(){
    if(request.current!==null||!mounted.current||blocked)return;
    const eventIds=selected.filter(id=>candidates.some(event=>event.eventId===id));
    if(eventIds.length===0)return;
    const controller=new AbortController();request.current=controller;setBusy(true);setError(null);
    void fetchUsageResend({eventIds},controller.signal).then(reply=>{
      if(mounted.current&&!controller.signal.aborted){setResult(reply);setSelected([]);}
    },reason=>{
      if(mounted.current&&!controller.signal.aborted)setError(reason instanceof ResendError?reason.code:'USAGE_RESEND_UNAVAILABLE');
    }).finally(()=>{
      if(request.current===controller)request.current=null;
      if(mounted.current&&!controller.signal.aborted)setBusy(false);
    });
  }
  return h('section',{'aria-label':'Usage 重发原记录'},
    h('h3',null,'重发本设备原记录'),
    h('p',null,'仅在明确选择后尝试一次。未确认记录不会自动重发。'),
    loading?h('p',{role:'status'},'读取中…'):null,
    ...candidates.map(event=>h('label',{key:event.eventId,style:{display:'block'}},
      h('input',{type:'checkbox',value:event.eventId,checked:selected.includes(event.eventId),disabled:blocked,onChange:(change:import('react').ChangeEvent<HTMLInputElement>)=>{
        if(request.current!==null||blocked)return;
        const checked=change.currentTarget.checked;
        setSelected(ids=>checked?Array.from(new Set([...ids,event.eventId])):ids.filter(id=>id!==event.eventId));
      }}),event.eventId,' · ',result?.events.find(item=>item.eventId===event.eventId)?.delivery??event.upload,' · ',event.code??'null')),
    h('button',{type:'button',disabled:blocked||selected.length===0,onClick:execute},'重发所选记录'),
    busy?h('p',{role:'status'},'重发处理中…'):null,
    h('p',null,'同意：',consent??'unknown','；撤回：',withdrawal===undefined?'unknown':withdrawal===null?'null':JSON.stringify(withdrawal)),
    error===null?null:h('p',{role:'alert'},error),
    result===null?null:h('pre',{'aria-label':'实际重发结果'},JSON.stringify({state:result.state,code:result.code,events:result.events,health:result.health===null?null:{outbox:{state:result.health.outbox.state,lastError:result.health.outbox.lastError},withdrawal:result.health.withdrawal}},null,2)),
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

/** One record as the person sees it: what, when, and whether the server has it (with the server's reason). */
export interface UsageRecordRow {eventId:string;hanaRef:string;action:'install'|'open'|'use'|'uninstall';occurredAt:string;upload:'pending'|'sent'|'duplicate'|'rejected';code:string|null}
export interface UsageRecordsSnapshot {
  deviceId:string|null;consent:HealthSnapshot['consent'];core:HealthSnapshot['core'];total:number;
  outbox:{state:HealthSnapshot['outbox']['state'];pending:number;sent:number;duplicate:number;rejected:number;lastUploadAt:string|null;lastError:string|null};
  withdrawal:WithdrawalSnapshot|null;rows:UsageRecordRow[];
  inventory:{lastError:string|null;failureKind:string|null;unreadable:number}|null;filtered:{commands:number;pages:number}|null;
}
const actionText:Record<UsageRecordRow['action'],string>={install:'安装',open:'打开',use:'使用',uninstall:'卸载'};
/** Plain-language reasons. Unknown tokens are shown as-is rather than hidden. */
const reasonText:Record<string,string>={
  USAGE_POINTS_HANA_REF_UNRESOLVED:'该插件不在 HanaMesh 目录里，服务端没有接收（不计积分）',
  USAGE_POINTS_HANA_ID_VERSION_UNSUPPORTED:'服务端无法识别该插件的目录编号，没有接收',
  LEGACY_NONCE_UNSUPPORTED:'旧版记录无法按当前上传格式重传；已保留本机，请再次使用插件产生新记录',
  USAGE_EVENT_HOST_REJECTED:'服务端没有接收这条记录',
  USAGE_CLOCK_SKEW:'本机时间与服务端相差太大，服务端没有接收',
  USAGE_EVENT_CONFLICT:'与服务端已有的同一条记录内容不一致',
  USAGE_NONCE_REUSED:'与服务端已有记录冲突',
  USAGE_INPUT_INVALID:'记录格式没有通过服务端校验',
  UPLOAD_UNAVAILABLE:'服务端暂时连不上，稍后会自动再传',
  USAGE_EVENT_HOOK_FAILED:'服务端收到了，但处理这批记录时出错，整批没有写入；稍后会自动再传',
  USAGE_RATE_LIMITED:'服务端限流，稍后会自动再传',
  USAGE_IDENTITY_UNAVAILABLE:'服务端身份服务暂时不可用，稍后会自动再传',
  UPLOAD_UNAUTHORIZED:'服务端不认这台设备的签名（设备可能还没注册）',
  UPLOAD_RESPONSE_INVALID:'服务端的回复格式不对，记录先留在本机',
  USAGE_STORAGE_UNAVAILABLE:'服务端存储结果未知，暂停自动重传；可在下方「诊断」里手动重发',
  UPLOAD_STATE_PERSIST_FAILED:'本机保存上报状态失败',
  WITHDRAW_UNAVAILABLE:'删除服务端记录的请求暂时没有送达，会再试',
  REASON_UNREADABLE:'服务端给了原因，但格式无法识别',
  DEVICE_NOT_REGISTERED:'设备正在向服务端注册（打开数据授权后才注册），注册后自动上报',
  CORE_SESSION_UNAVAILABLE:'暂时读不到 HanaMesh Core 的设备状态，稍后自动重试',
  INVENTORY_SOURCE_UNAVAILABLE:'DSH 的插件管理服务不在，暂时读不到你装了哪些插件',
  INVENTORY_SOURCE_UNREADABLE:'读取 DSH 插件管理服务出错',
  INVENTORY_FAILED:'读取插件清单出错',
};
export const usageReason=(code:string|null):string=>{if(code===null)return '';const http=/^UPLOAD_HTTP_(\d{3})$/.exec(code);if(http)return `服务端回了 HTTP ${http[1]}，没有可读的错误码；稍后会自动再传`;const own=code.includes(':')?code.slice(code.indexOf(':')+1):code;return reasonText[own]??reasonText[code]??own;};
const hostNoteText:Record<string,string>={USAGE_POINTS_SCORING_DISABLED:'官方插件 · 不计积分',HOST_NOTE_UNREADABLE:'服务端附了说明，但格式无法识别'};
function uploadText(row:UsageRecordRow,note?:string):string {
  if(row.upload==='sent'||row.upload==='duplicate')return note?`服务端已收到 · ${hostNoteText[note]??note}`:'服务端已收到';
  if(row.upload==='rejected')return `未被接收：${usageReason(row.code)}${hostRejection(row.code)?'（条件满足后可在「诊断」里重发）':''}`;
  return row.code?`等待上报（${usageReason(row.code)}）`:'等待上报';
}
function outboxText(snapshot:UsageRecordsSnapshot):string {
  const o=snapshot.outbox;
  if(o.state==='offline')return '没有配置服务端：记录只保存在本机，不会上报。';
  if(o.state==='unconfirmed')return '上一次上报结果未知，已暂停自动重传。';
  const counts=`服务端已收到 ${o.sent+o.duplicate} 条，等待上报 ${o.pending} 条，未被接收 ${o.rejected} 条。`;
  return o.lastError?`${counts}最近一次：${usageReason(o.lastError)}`:counts;
}
function withdrawalText(w:WithdrawalSnapshot):string {
  if(w.state==='sent')return `已撤回同意，服务端已删除本设备的原始记录 ${w.deletedEvents??0} 条。`;
  if(w.state==='offline')return '已撤回同意，本机记录已删除；没有配置服务端，无需删除服务端记录。';
  if(w.state==='unconfirmed')return '已撤回同意；服务端删除结果未知，会再确认。';
  return `已撤回同意，本机记录已删除；正在请求服务端删除原始记录（已尝试 ${w.attempts} 次）${w.lastError?`：${usageReason(w.lastError)}`:''}。`;
}
async function fetchUsageRecords(signal:AbortSignal):Promise<UsageRecordsSnapshot> {
  const response=await verificationFetch('api/hanamesh/usage/panel',{method:'GET',credentials:'same-origin',cache:'no-store',signal});
  if(!response.ok)throw new Error('USAGE_PANEL_UNAVAILABLE');
  const value=await resendJson(response).catch(()=>{throw new Error('USAGE_PANEL_UNAVAILABLE');});
  const actions=['install','open','use','uninstall'];
  if(!object(value)||!object(value.subject)||!object(value.outbox)||!['granted','withheld','unknown'].includes(value.consent as string)||!withdrawalSnapshot(value.withdrawal)
    ||!Array.isArray(value.events)||!value.events.every(event=>object(event)&&typeof event.eventId==='string'&&typeof event.hanaRef==='string'
      &&actions.includes(event.action as string)&&typeof event.occurredAt==='string'&&object(event.upload)
      &&['pending','sent','duplicate','rejected'].includes(event.upload.state as string)&&deliveryCode(event.upload.code)))throw new Error('USAGE_PANEL_UNAVAILABLE');
  const o=value.outbox;
  return {deviceId:(value.subject.deviceId as string|null)??null,consent:value.consent as HealthSnapshot['consent'],core:value.core as HealthSnapshot['core'],total:Number(value.total)||0,
    outbox:{state:o.state as HealthSnapshot['outbox']['state'],pending:Number(o.pending)||0,sent:Number(o.sent)||0,duplicate:Number(o.duplicate)||0,rejected:Number(o.rejected)||0,
      lastUploadAt:typeof o.lastUploadAt==='string'?o.lastUploadAt:null,lastError:typeof o.lastError==='string'?o.lastError:null},
    withdrawal:value.withdrawal,
    inventory:object(value.inventory)?{lastError:typeof value.inventory.lastError==='string'?value.inventory.lastError:null,failureKind:typeof value.inventory.failureKind==='string'?value.inventory.failureKind:null,unreadable:Number(value.inventory.unreadable)||0}:null,
    filtered:object(value.filtered)?{commands:Number(value.filtered.commands)||0,pages:Number(value.filtered.pages)||0}:null,
    rows:value.events.map(event=>({eventId:event.eventId as string,hanaRef:event.hanaRef as string,action:event.action as UsageRecordRow['action'],occurredAt:event.occurredAt as string,
      upload:(event.upload as {state:UsageRecordRow['upload']}).state,code:(event.upload as {code:string|null}).code}))
      .sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt))};
}
interface RemoteView {state:'available'|'unknown'|'offline';total:number|null;code:string|null;notes:Record<string,string>}
async function fetchRemoteRecords(signal:AbortSignal):Promise<RemoteView> {
  const response=await verificationFetch('api/hanamesh/usage/panel/remote',{method:'GET',credentials:'same-origin',cache:'no-store',signal});
  if(!response.ok)throw new Error('REMOTE_UNAVAILABLE');
  const value=await resendJson(response).catch(()=>{throw new Error('REMOTE_UNAVAILABLE');});
  if(!object(value)||!['available','unknown','offline'].includes(value.state as string))throw new Error('REMOTE_UNAVAILABLE');
  const notes:Record<string,string>={};
  if(Array.isArray(value.events))for(const event of value.events)if(object(event)&&typeof event.eventId==='string'&&object(event.hostNote)&&typeof event.hostNote.code==='string')notes[event.eventId]=event.hostNote.code;
  return {state:value.state as RemoteView['state'],total:Number.isSafeInteger(value.total)?value.total as number:null,code:typeof value.code==='string'?value.code:null,notes};
}
const localTime=(iso:string)=>{const date=new Date(iso);return Number.isNaN(date.getTime())?iso:date.toLocaleString();};

/** The person's view of their usage records. Reading never collects, uploads or resends anything. */
export function UsageRecords({revision=0}:{revision?:number}) {
  const [snapshot,setSnapshot]=useState<UsageRecordsSnapshot|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [remote,setRemote]=useState<RemoteView|null>(null);
  const [remoteBusy,setRemoteBusy]=useState(false);
  const remoteRequest=useRef<AbortController|null>(null);
  useEffect(()=>()=>remoteRequest.current?.abort(),[]);
  useEffect(()=>{
    const controller=new AbortController();setError(null);setRemote(null);
    // With consent, also read the server's listing once so stored rows can carry its notes (e.g. official plugin, no points).
    void fetchUsageRecords(controller.signal).then(value=>{if(!controller.signal.aborted){setSnapshot(value);if(value.consent==='granted'&&value.outbox.state!=='offline')checkRemote();}},()=>{if(!controller.signal.aborted){setSnapshot(null);setError('USAGE_PANEL_UNAVAILABLE');}});
    return ()=>controller.abort();
  },[revision]);
  function checkRemote(){
    if(remoteRequest.current!==null)return;
    const controller=new AbortController();remoteRequest.current=controller;setRemoteBusy(true);
    void fetchRemoteRecords(controller.signal).then(value=>{if(!controller.signal.aborted)setRemote(value);},()=>{if(!controller.signal.aborted)setRemote({state:'unknown',total:null,code:'REMOTE_UNAVAILABLE',notes:{}});})
      .finally(()=>{if(remoteRequest.current===controller)remoteRequest.current=null;if(!controller.signal.aborted)setRemoteBusy(false);});
  }
  if(error!==null)return h('p',{role:'alert','data-hanamesh-usage-records':'unavailable'},'使用记录读取失败（USAGE_PANEL_UNAVAILABLE）。可以点「刷新」再试；刷新不会采集或上报任何东西。');
  if(snapshot===null)return h('p',{role:'status','data-hanamesh-usage-records':'loading'},'读取中…');
  const consentLine=snapshot.core!=='present'
    ?'没有找到 HanaMesh Core：不记录。请确认 HanaMesh Core 插件已安装并启用。'
    :snapshot.consent==='granted'
      ?'已同意：记录你安装、打开和使用的插件（只有时间、插件名和动作，不含对话内容）。'
      :'未同意：不记录任何使用。要开始记录，到「设置 → HanaMesh」打开「数据授权」。';
  return h('div',{'data-hanamesh-usage-records':'ready'},
    h('p',{'data-hanamesh-usage-consent':snapshot.consent},consentLine),
    h('p',{'data-hanamesh-usage-outbox':snapshot.outbox.state},outboxText(snapshot)),
    snapshot.withdrawal?h('p',{role:'status','data-hanamesh-usage-withdrawal':snapshot.withdrawal.state},withdrawalText(snapshot.withdrawal)):null,
    snapshot.inventory?.lastError?h('p',{role:'alert','data-hanamesh-usage-inventory':snapshot.inventory.lastError},`插件清单：${usageReason(snapshot.inventory.lastError)}${snapshot.inventory.failureKind?`（${snapshot.inventory.failureKind}）`:''}；安装/卸载记录暂停，恢复后自动补上。`):null,
    snapshot.inventory&&snapshot.inventory.unreadable>0?h('p',{'data-hanamesh-usage-unreadable':String(snapshot.inventory.unreadable)},`有 ${snapshot.inventory.unreadable} 个已装插件这次读不到版本信息，暂未记录。`):null,
    snapshot.filtered&&(snapshot.filtered.commands>0||snapshot.filtered.pages>0)?h('p',{'data-hanamesh-usage-filtered':'true'},`已忽略 ${snapshot.filtered.commands} 次命令、${snapshot.filtered.pages} 次页面打开：它们属于 DSH 自带或不是你装的插件，不记录。`):null,
    h('p',null,'撤回：到「设置 → HanaMesh」关闭「数据授权」。关闭后不再记录，本机记录立即删除，并请求服务端删除本设备的原始记录。'),
    h('div',null,
      h('button',{type:'button',disabled:remoteBusy,onClick:checkRemote},remoteBusy?'查询中…':'查看服务端记录数'),
      remote===null?null:h('span',{role:'status','data-hanamesh-usage-remote':remote.state},
        remote.state==='available'?` 服务端有本设备的原始记录 ${remote.total??0} 条。`
          :remote.state==='offline'?' 没有配置服务端。':` 服务端暂时查不到（${usageReason(remote.code)}），不代表 0 条。`)),
    snapshot.rows.length===0
      ?h('p',null,snapshot.consent==='granted'?'还没有记录。打开一个插件页面或执行一个插件命令后会出现在这里。':'没有记录。')
      :h('table',{'aria-label':'本设备使用记录'},
        h('thead',null,h('tr',null,h('th',null,'时间'),h('th',null,'插件'),h('th',null,'动作'),h('th',null,'状态'))),
        h('tbody',null,...snapshot.rows.map(row=>h('tr',{key:row.eventId,'data-hanamesh-usage-row':row.upload},
          h('td',null,localTime(row.occurredAt)),h('td',null,row.hanaRef),h('td',null,actionText[row.action]),h('td',null,uploadText(row,remote?.notes[row.eventId])))))),
  );
}

/** Settings section: the records first; resend and test-build verification stay under 诊断. */
export function UsagePanel() {
  const [revision,setRevision]=useState(0);
  return h('section',{'aria-label':'HanaMesh 使用记录'},
    h('h2',null,'HanaMesh 使用记录'),
    h('button',{type:'button',onClick:()=>setRevision(value=>value+1)},'刷新'),
    h(UsageRecords,{revision}),
    h('details',null,h('summary',null,'诊断'),
      h(UsageResendPanel,{revision}),
      h(UsageVerificationPanel)),
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
    scoped.slots.inject('settings.section',()=>scoped.slots.register({name:'settings.section',id:'hanamesh-usage',order:80,label:'HanaMesh 使用记录'},UsagePanel));
  });
}
