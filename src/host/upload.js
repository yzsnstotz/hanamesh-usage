// @ts-check
import { UsageError, wireEvent } from '../core/index.js';

const EVENT_PATH='/v1/usage/events';
const maxBodyBytes=64*1024;

/**
 * @param {{
 *  store: import('../core/index.js').EventStore,
 *  link: {get(): import('@hanamesh/api-contracts/core').HanaMeshCoreContract|null},
 *  uploadIntervalMs:number,
 *  uploadBatchSize:number,
 *  fetchImpl?: typeof fetch,
 *  now?: ()=>number,
 * }} options
 */
export function createUsageReporter({store,link,uploadIntervalMs,uploadBatchSize,fetchImpl=fetch,now=Date.now}){
  let state=/** @type {'idle'|'uploading'|'backoff'|'offline'|'stopped'|'unconfirmed'} */('stopped');
  const confirmed=new Set(),unconfirmed=new Map();
  let persistenceFailed=false;
  let lastUploadAt=/** @type {string|null} */(null),nextAttemptAt=/** @type {string|null} */(null),lastError=/** @type {string|null} */(null),failures=0,active=false;
  let tail=Promise.resolve();
  // The existing bounded local diagnostic field persists the formal unknown
  // marker; it is absent from wireEvent and therefore changes no event digest.
  for(const event of store.getSnapshot().events)if(event.upload.state==='pending'&&['USAGE_STORAGE_UNAVAILABLE','UPLOAD_ATTEMPT_UNCONFIRMED'].includes(event.upload.code??''))unconfirmed.set(event.eventId,event.upload.code);
  if(unconfirmed.size>0){state='unconfirmed';lastError=unconfirmed.values().next().value??null;}
  function pruneObservations(){
    const events=new Map(store.getSnapshot().events.map(event=>[event.eventId,event]));
    for(const id of confirmed)if(!events.has(id)||events.get(id)?.upload.state==='pending')confirmed.delete(id);
    // A failed final write leaves the conservative intent in storage. Reads
    // cannot erase the stronger response this instance actually observed.
    for(const id of unconfirmed.keys())if(!events.has(id)||events.get(id)?.upload.state!=='pending')unconfirmed.delete(id);
  }
  /** @type {ReturnType<typeof setTimeout>|null} */let timer=null;
  const iso=()=>new Date(now()).toISOString();
  const clearTimer=()=>{if(timer!==null){clearTimeout(timer);timer=null;}};
  /** @param {number} delay */
  const schedule=delay=>{clearTimer();if(!active)return;timer=setTimeout(()=>{void runOnce().finally(()=>{if(active&&state!=='backoff')schedule(uploadIntervalMs);});},delay);timer.unref?.();};
  /** @param {number} delay */
  const scheduleWithdrawal=delay=>{clearTimer();timer=setTimeout(()=>{void retryWithdrawal();},delay);timer.unref?.();};
  /** @param {boolean} [withdrawal] */
  const backoff=(withdrawal=false)=>{failures++;const delay=Math.min(15,2**Math.max(0,failures-1))*60000;state='backoff';nextAttemptAt=new Date(now()+delay).toISOString();if(withdrawal)scheduleWithdrawal(delay);else schedule(delay);};
  const counts=()=>{
    const events=store.getSnapshot().events;
    /** @param {import('../core/index.js').UploadState} type */
    const count=type=>events.filter(event=>event.upload.state===type).length;
    return {pending:count('pending'),sent:count('sent'),duplicate:count('duplicate'),rejected:count('rejected')};
  };
  function start(){
    pruneObservations();
    if(persistenceFailed){state=unconfirmed.size>0?'unconfirmed':'stopped';return;}
    if(unconfirmed.size>0){state='unconfirmed';return;}
    active=true;const core=link.get();
    if(core===null){state='stopped';return;}
    if(core.getConsent()!=='granted'){state='stopped';return;}
    if(core.getServerOrigin()===null){state='offline';return;}
    state='idle';schedule(5000);
  }
  function stop(){active=false;clearTimer();state='stopped';nextAttemptAt=null;}
  /** @param {string} code @param {string[]} ids */
  async function fail(code,ids){
    try{await store.markAttempts(ids,null,true);}catch{return persistenceFailure(ids);}
    lastError=code;backoff();return /** @type {const} */('backoff');
  }
  /** @param {string[]} ids @param {string} code */
  function holdUnknown(ids,code){ids.forEach(id=>unconfirmed.set(id,code));clearTimer();active=false;state='unconfirmed';nextAttemptAt=null;lastError=code;}
  /** A local write error cannot trigger another HTTP attempt. @param {string[]} ids */
  function persistenceFailure(ids){
    if(ids.length>0)holdUnknown(ids,'UPLOAD_ATTEMPT_UNCONFIRMED');else stop();
    persistenceFailed=true;lastError='UPLOAD_STATE_PERSIST_FAILED';
    return ids.length>0?/** @type {const} */('unconfirmed'):/** @type {const} */('stopped');
  }
  async function runOnceRaw(){
    pruneObservations();
    if(persistenceFailed)return unconfirmed.size>0?/** @type {const} */('unconfirmed'):/** @type {const} */('stopped');
    if(unconfirmed.size>0){state='unconfirmed';return /** @type {const} */('unconfirmed');}
    const core=link.get();if(core===null){state='stopped';return /** @type {const} */('stopped');}
    if(core.getConsent()!=='granted'){state='stopped';return /** @type {const} */('withheld');}
    const origin=core.getServerOrigin();if(origin===null){state='offline';return /** @type {const} */('offline');}
    let batch=store.query({state:'pending',limit:uploadBatchSize}).events.filter(event=>event.signature!==null);
    if(batch.length===0){state='idle';lastError=null;nextAttemptAt=null;return /** @type {const} */('idle');}
    let wire;
    // Admit the entire candidate batch before signing a request or sending any
    // row. A local-only stub must remain pending with a visible local error.
    try{wire=batch.map(wireEvent);}catch{stop();lastError='UPLOAD_EVENT_INVALID';return /** @type {const} */('stopped');}
    let json='';
    // O1 `POST /v1/usage/events` body is a bare 1–200 item array (hanamesh-server-usage docs/API.md), not an {events:[…]} envelope.
    while(batch.length>0){json=JSON.stringify(wire);if(Buffer.byteLength(json)<=maxBodyBytes)break;batch=batch.slice(0,Math.max(1,Math.floor(batch.length/2)));wire=wire.slice(0,batch.length);if(batch.length===1&&Buffer.byteLength(JSON.stringify(wire))>maxBodyBytes)throw new UsageError('UPLOAD_BATCH_TOO_LARGE');}
    const ids=batch.map(event=>event.eventId),body=new TextEncoder().encode(json),url=new URL(EVENT_PATH,origin);state='uploading';
    try{await store.markUploadIntent(ids);}catch{return persistenceFailure([]);}
    // An await may cross consent withdrawal or identity changes. The original
    // wire payload remains unchanged and is checked again before HTTP signing.
    const readyCore=link.get();
    const granted=readyCore?.getConsent()==='granted',sameDevice=readyCore!==null&&(typeof readyCore.getDeviceId!=='function'||batch.every(event=>event.deviceId===readyCore.getDeviceId()));
    const sameOrigin=readyCore?.getServerOrigin()===origin;
    if(!granted||!sameDevice||!sameOrigin){
      try{await store.markUploadIntent(ids,false);}catch{return persistenceFailure(ids);}
      stop();lastError=readyCore===null?'CORE_UNAVAILABLE':!sameDevice?'UPLOAD_EVENT_INVALID':!sameOrigin?'UPLOAD_UNAVAILABLE':null;
      return readyCore!==null&&!granted?/** @type {const} */('withheld'):/** @type {const} */('stopped');
    }
    let response;
    try{
      const signed=await readyCore.signRequest({method:'POST',path:EVENT_PATH,body});
      response=await fetchImpl(url,{method:'POST',headers:{...signed,'content-type':'application/json',origin},body:json});
    }catch{return await fail('UPLOAD_UNAVAILABLE',ids);}
    if(response.status===401||response.status===403)return await fail('UPLOAD_UNAUTHORIZED',ids);
    if(response.status<200||response.status>=300){
      if(await unknownCommit(response)){
        holdUnknown(ids,'USAGE_STORAGE_UNAVAILABLE');
        try{await store.markAttempts(ids,'USAGE_STORAGE_UNAVAILABLE');}catch{persistenceFailed=true;lastError='UPLOAD_STATE_PERSIST_FAILED';}
        return /** @type {const} */('unconfirmed');
      }
      return await fail('UPLOAD_UNAVAILABLE',ids);
    }
    let result;
    try{
      result=/** @type {import('../core/index.js').IngestBatchResult} */(await response.json());
      if(Object.keys(result).sort().join('|')!=='accepted|duplicates|durability|rejected'||result.durability!=='committed')throw new UsageError('UPLOAD_RESPONSE_INVALID');
    }catch{return await fail('UPLOAD_RESPONSE_INVALID',ids);}
    try{
      await store.applyUpload(ids,result,iso());
      pruneObservations();const rejected=new Set(result.rejected.map(item=>item.eventId));ids.filter(id=>!rejected.has(id)).forEach(id=>confirmed.add(id));
    }catch(error){return error instanceof UsageError&&error.code==='INVALID_UPLOAD_RESULT'?await fail('UPLOAD_RESPONSE_INVALID',ids):persistenceFailure(ids);}
    failures=0;state='idle';lastError=null;nextAttemptAt=null;lastUploadAt=iso();return /** @type {const} */('uploaded');
  }
  function runOnce(){const run=tail.then(runOnceRaw);tail=run.then(()=>{},()=>{});return run;}
  /** Only the formally supplied safe error marks an unknown COMMIT. @param {Response} response */
  async function unknownCommit(response){
    if(response.status!==503)return false;
    try{const body=await response.json();return body?.error?.code==='USAGE_STORAGE_UNAVAILABLE'&&body.error.durability==='unconfirmed';}catch{return false;}
  }
  /** @param {string} deviceId */
  async function requestWithdrawal(deviceId){
    const core=link.get();if(core===null)return {state:/** @type {const} */('offline'),deletedEvents:null,lastError:'CORE_UNAVAILABLE'};
    const origin=core.getServerOrigin();if(origin===null)return {state:/** @type {const} */('offline'),deletedEvents:null,lastError:null};
    const path=`/v1/usage/me/devices/${encodeURIComponent(deviceId)}/events`,url=new URL(path,origin);
    try{
      const signed=await core.signRequest({method:'DELETE',path,body:null});const response=await fetchImpl(url,{method:'DELETE',headers:{...signed,origin}});
      if(response.status<200||response.status>=300){
        if(await unknownCommit(response))return {state:/** @type {const} */('unconfirmed'),deletedEvents:null,lastError:'USAGE_STORAGE_UNAVAILABLE'};
        throw new UsageError('WITHDRAW_UNAVAILABLE');
      }
      const body=/** @type {{deletedEvents?:unknown}} */(await response.json());if(!Number.isSafeInteger(body.deletedEvents)||Number(body.deletedEvents)<0)throw new UsageError('WITHDRAW_RESPONSE_INVALID');
      return {state:/** @type {const} */('sent'),deletedEvents:Number(body.deletedEvents),lastError:null};
    }catch{return {state:/** @type {const} */('pending'),deletedEvents:null,lastError:'WITHDRAW_UNAVAILABLE'};}
  }
  async function retryWithdrawalRaw(){
    const withdrawal=store.getSnapshot().withdrawal;if(withdrawal===null)return /** @type {const} */('idle');
    if(withdrawal.state==='sent')return /** @type {const} */('sent');
    if(withdrawal.state==='offline')return /** @type {const} */('offline');
    if(withdrawal.state==='unconfirmed'){state='unconfirmed';return /** @type {const} */('unconfirmed');}
    const result=await requestWithdrawal(withdrawal.deviceId);await store.markWithdrawal(result);
    if(result.state==='sent'){clearTimer();state='stopped';lastError=null;return /** @type {const} */('sent');}
    if(result.state==='offline'){clearTimer();state='offline';lastError=result.lastError;return /** @type {const} */('offline');}
    if(result.state==='unconfirmed'){clearTimer();active=false;state='unconfirmed';nextAttemptAt=null;lastError=result.lastError;return /** @type {const} */('unconfirmed');}
    lastError='WITHDRAW_UNAVAILABLE';backoff(true);return /** @type {const} */('backoff');
  }
  function retryWithdrawal(){const run=tail.then(retryWithdrawalRaw);tail=run.then(()=>{},()=>{});return run;}
  /** @param {string} [changedAt] @param {string|null} [deviceIdOverride] */
  async function withdraw(changedAt=iso(),deviceIdOverride=null){
    stop();await tail;const current=store.getSnapshot().withdrawal;if(current?.state==='sent')return /** @type {const} */('sent');if(current?.state==='offline')return /** @type {const} */('offline');
    const core=link.get();const deviceId=deviceIdOverride??core?.getDeviceId();if(!deviceId){state='offline';return /** @type {const} */('offline');}
    if(current===null)await store.withdrawLocal(changedAt,deviceId);
    confirmed.clear();unconfirmed.clear();persistenceFailed=false;
    return await retryWithdrawal();
  }
  async function grant(){await store.clearWithdrawal();start();}
  /** Read-only: this device's own server records through the public device-signed route. Never mutates local state.
   * @returns {Promise<import('./contracts.js').RemoteSnapshot>} */
  async function readRemote(){
    const checkedAt=iso();
    /** @param {'unknown'|'offline'} kind @param {NonNullable<import('./contracts.js').RemoteSnapshot['code']>} code @param {string|null} deviceId @param {number|null} [httpStatus] @returns {import('./contracts.js').RemoteSnapshot} */
    const unavailable=(kind,code,deviceId,httpStatus=null)=>({state:kind,deviceId,total:null,events:[],code,httpStatus,checkedAt});
    const core=link.get();if(core===null)return unavailable('unknown','CORE_UNAVAILABLE',null);
    let deviceId=null;try{deviceId=core.getDeviceId();}catch{}
    if(typeof deviceId!=='string'||deviceId==='')return unavailable('unknown','DEVICE_UNAVAILABLE',null);
    const origin=core.getServerOrigin();if(origin===null)return unavailable('offline','SERVER_ORIGIN_UNAVAILABLE',deviceId);
    // Server raw-event window: at most 90 days, accepted occurredAt is at most 5 minutes ahead of server time.
    const to=new Date(now()+5*60000),from=new Date(to.getTime()-90*86400000);
    const path=`/v1/usage/me/devices/${encodeURIComponent(deviceId)}/events`;
    /** @type {import('./contracts.js').RemoteEvent[]} */const events=[];let after=/** @type {string|null} */(null),status=/** @type {number|null} */(null);
    do{
      const url=new URL(path,origin);url.searchParams.set('from',from.toISOString());url.searchParams.set('to',to.toISOString());url.searchParams.set('limit','200');if(after!==null)url.searchParams.set('after',after);
      let response;
      // Identity signs METHOD|PATH|…; the query string is not part of the signed path.
      try{const signed=await core.signRequest({method:'GET',path,body:null});response=await fetchImpl(url,{method:'GET',headers:{...signed,origin}});}
      catch{return unavailable('unknown','REMOTE_UNAVAILABLE',deviceId);}
      status=response.status;
      if(status===401||status===403)return unavailable('unknown','REMOTE_UNAUTHORIZED',deviceId,status);
      if(status<200||status>=300)return unavailable('unknown','REMOTE_UNAVAILABLE',deviceId,status);
      let body;try{body=/** @type {{items?:unknown,nextAfter?:unknown}} */(await response.json());}catch{return unavailable('unknown','REMOTE_RESPONSE_INVALID',deviceId,status);}
      if(!Array.isArray(body.items)||(body.nextAfter!==null&&typeof body.nextAfter!=='string'))return unavailable('unknown','REMOTE_RESPONSE_INVALID',deviceId,status);
      for(const item of body.items){
        const value=/** @type {Record<string,unknown>} */(item);
        if(value===null||typeof value!=='object'||value.deviceId!==deviceId||!['eventId','hanaRef','action','occurredAt','receivedAt'].every(key=>typeof value[key]==='string'))return unavailable('unknown','REMOTE_RESPONSE_INVALID',deviceId,status);
        events.push({eventId:String(value.eventId),hanaRef:String(value.hanaRef),action:/** @type {import('./contracts.js').RemoteEvent['action']} */(value.action),occurredAt:String(value.occurredAt),receivedAt:String(value.receivedAt)});
      }
      after=body.nextAfter;
    }while(after!==null);
    return {state:'available',deviceId,total:events.length,events,code:null,httpStatus:status,checkedAt};
  }
  /** @param {import('../core/index.js').UsageEvent} event @returns {import('./contracts.js').CollectionObservation['events'][number]} */
  function delivery(event){return {eventId:event.eventId,delivery:unconfirmed.has(event.eventId)?'unconfirmed':event.upload.state==='rejected'?'rejected':confirmed.has(event.eventId)?'confirmed':['sent','duplicate'].includes(event.upload.state)?'unconfirmed':'pending',code:unconfirmed.get(event.eventId)??event.upload.code};}
  return {start,stop,runOnce,withdraw,retryWithdrawal,grant,readRemote,delivery,drain:()=>tail,health:()=>{pruneObservations();return {state,...counts(),lastUploadAt,nextAttemptAt,lastError};}};
}
