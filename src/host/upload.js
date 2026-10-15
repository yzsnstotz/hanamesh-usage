// @ts-check
import { UsageError, wireEvent } from '../core/index.js';

const EVENT_PATH='/v1/usage/events';
const maxBodyBytes=64*1024;

/**
 * @param {{
 *  store: import('../core/index.js').EventStore,
 *  link: {get(): import('./core-link.js').CoreService|null},
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
      const answered=await serverError(response);
      if(answered.unknown){
        holdUnknown(ids,'USAGE_STORAGE_UNAVAILABLE');
        try{await store.markAttempts(ids,'USAGE_STORAGE_UNAVAILABLE');}catch{persistenceFailed=true;lastError='UPLOAD_STATE_PERSIST_FAILED';}
        return /** @type {const} */('unconfirmed');
      }
      return await fail(answered.code??'UPLOAD_UNAVAILABLE',ids);
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
  /** This is the only one-shot bypass for a current user selection. It never
   * clears the global unknown gate or arms the ordinary sender's timers.
   * @param {string[]} eventIds
   * @returns {Promise<Omit<import('./contracts.js').ResendEventsResult,'health'>>}
   */
  async function resendRaw(eventIds){
    pruneObservations();
    /** @param {'processed'|'withheld'|'rejected'} resultState
     * @param {import('./contracts.js').ResendEventsResult['code']} [code]
     * @param {boolean} [observed]
     * @returns {Omit<import('./contracts.js').ResendEventsResult,'health'>} */
    const answer=(resultState,code=null,observed=false)=>({state:resultState,code,events:observed?store.getSnapshot().events.filter(event=>eventIds.includes(event.eventId)).map(delivery):[]});
    if(persistenceFailed)return answer('rejected','UPLOAD_STATE_PERSIST_FAILED');
    const scope=()=>{
      try{const core=link.get();return core===null?null:{core,consent:core.getConsent(),deviceId:core.getDeviceId(),origin:core.getServerOrigin()};}catch{return null;}
    };
    const initial=scope();
    if(initial===null)return answer('rejected','CORE_UNAVAILABLE');
    if(initial.consent!=='granted')return answer('withheld');
    const snapshot=store.getSnapshot();
    /** @type {import('../core/index.js').UsageEvent[]} */const selected=[];
    for(const id of eventIds){
      const event=snapshot.events.find(row=>row.eventId===id);
      if(snapshot.withdrawal!==null||!event||event.deviceId!==initial.deviceId||event.upload.state!=='pending'||event.signature===null
        ||Buffer.from(event.signature,'base64url').length!==64||Buffer.from(event.signature,'base64url').toString('base64url')!==event.signature)return answer('rejected','RESEND_EVENT_UNAVAILABLE');
      try{wireEvent(event);}catch{return answer('rejected','RESEND_EVENT_UNAVAILABLE');}
      selected.push(event);
    }
    stop();
    if(initial.origin===null){state='offline';lastError='UPLOAD_UNAVAILABLE';return answer('rejected','RESEND_FAILED');}
    const origin=initial.origin;
    const ready=()=>{
      const current=scope();
      if(current===null)return /** @type {const} */('CORE_UNAVAILABLE');
      if(current.consent!=='granted')return /** @type {const} */('withheld');
      if(current.deviceId!==initial.deviceId||current.origin!==origin||store.getSnapshot().withdrawal!==null)return /** @type {const} */('RESEND_EVENT_UNAVAILABLE');
      return current;
    };
    /** @param {string[]} ids @param {Map<string,string>} previous @param {string} code */
    const failed=async(ids,previous,code)=>{
      try{await store.markResendFailure(ids,previous);}catch{persistenceFailed=true;lastError='UPLOAD_STATE_PERSIST_FAILED';state='unconfirmed';return false;}
      for(const id of ids)if(!previous.has(id))unconfirmed.delete(id);
      state=unconfirmed.size>0?'unconfirmed':'stopped';lastError=code;return true;
    };
    let offset=0;
    while(offset<selected.length){
      const check=ready();
      if(typeof check==='string')return check==='withheld'?answer('withheld'):answer('rejected',check);
      let batch=selected.slice(offset,offset+uploadBatchSize),wire=batch.map(wireEvent),json=JSON.stringify(wire);
      while(Buffer.byteLength(json)>maxBodyBytes&&batch.length>1){batch=batch.slice(0,Math.ceil(batch.length/2));wire=batch.map(wireEvent);json=JSON.stringify(wire);}
      if(Buffer.byteLength(json)>maxBodyBytes)return answer('rejected','RESEND_EVENT_UNAVAILABLE');
      const ids=batch.map(event=>event.eventId),previous=new Map();
      for(const id of ids)if(unconfirmed.has(id))previous.set(id,unconfirmed.get(id));
      // Whole selection was admitted above. Reread each remaining original
      // after earlier batches/awaits; never replay a now-deleted or changed row.
      const current=store.getSnapshot();
      if(batch.some(event=>{const row=current.events.find(item=>item.eventId===event.eventId);return !row||row.upload.state!=='pending'||JSON.stringify(wireEvent(row))!==JSON.stringify(wireEvent(event));}))return answer('rejected','RESEND_EVENT_UNAVAILABLE',true);
      try{await store.markResendIntent(ids);}catch{persistenceFailed=true;state=unconfirmed.size>0?'unconfirmed':'stopped';lastError='UPLOAD_STATE_PERSIST_FAILED';return answer('rejected','UPLOAD_STATE_PERSIST_FAILED',offset>0);}
      ids.forEach(id=>unconfirmed.set(id,previous.get(id)??'UPLOAD_ATTEMPT_UNCONFIRMED'));
      const afterWrite=ready();
      if(typeof afterWrite==='string')return afterWrite==='withheld'?answer('withheld'):answer('rejected',afterWrite);
      const body=new TextEncoder().encode(json);let response;
      try{
        const signed=await afterWrite.core.signRequest({method:'POST',path:EVENT_PATH,body});
        const afterSign=ready();
        if(typeof afterSign==='string')return afterSign==='withheld'?answer('withheld'):answer('rejected',afterSign);
        response=await fetchImpl(new URL(EVENT_PATH,origin),{method:'POST',headers:{...signed,'content-type':'application/json',origin},body:json});
      }catch{if(!await failed(ids,previous,'UPLOAD_UNAVAILABLE'))return answer('rejected','UPLOAD_STATE_PERSIST_FAILED',true);offset+=batch.length;continue;}
      if(response.status<200||response.status>=300){
        const answered=await serverError(response);
        if(answered.unknown){
          holdUnknown(ids,'USAGE_STORAGE_UNAVAILABLE');
          try{await store.markAttempts(ids,'USAGE_STORAGE_UNAVAILABLE');}catch{persistenceFailed=true;lastError='UPLOAD_STATE_PERSIST_FAILED';return answer('rejected','UPLOAD_STATE_PERSIST_FAILED',true);}
        }else if(!await failed(ids,previous,response.status===401||response.status===403?'UPLOAD_UNAUTHORIZED':answered.code??'UPLOAD_UNAVAILABLE'))return answer('rejected','UPLOAD_STATE_PERSIST_FAILED',true);
        offset+=batch.length;continue;
      }
      let result;
      try{result=/** @type {import('../core/index.js').IngestBatchResult} */(await response.json());if(Object.keys(result).sort().join('|')!=='accepted|duplicates|durability|rejected'||result.durability!=='committed')throw new UsageError('UPLOAD_RESPONSE_INVALID');}
      catch{if(!await failed(ids,previous,'UPLOAD_RESPONSE_INVALID'))return answer('rejected','UPLOAD_STATE_PERSIST_FAILED',true);offset+=batch.length;continue;}
      try{await store.applyUpload(ids,result,iso());}
      catch(error){
        if(error instanceof UsageError&&error.code==='INVALID_UPLOAD_RESULT'){if(!await failed(ids,previous,'UPLOAD_RESPONSE_INVALID'))return answer('rejected','UPLOAD_STATE_PERSIST_FAILED',true);offset+=batch.length;continue;}
        persistenceFailed=true;state='unconfirmed';lastError='UPLOAD_STATE_PERSIST_FAILED';return answer('rejected','UPLOAD_STATE_PERSIST_FAILED',true);
      }
      pruneObservations();const rejected=new Set(result.rejected.map(item=>item.eventId));ids.filter(id=>!rejected.has(id)).forEach(id=>confirmed.add(id));
      lastUploadAt=iso();lastError=unconfirmed.size>0?(unconfirmed.values().next().value??null):null;
      state=unconfirmed.size>0?'unconfirmed':'idle';offset+=batch.length;
    }
    return answer('processed',null,true);
  }
  /** @param {string[]} eventIds */
  function resend(eventIds){const run=tail.then(()=>resendRaw([...eventIds]));tail=run.then(()=>{},()=>{});return run;}
  /** Only the formally supplied safe error marks an unknown COMMIT. @param {Response} response */
  async function unknownCommit(response){return (await serverError(response)).unknown;}
  /** Reads a non-2xx body once. `code` is the server's C-USAGE error code when it is a token, so health can say what the
   *  server answered (e.g. USAGE_EVENT_HOOK_FAILED) instead of reporting a reachable server as unreachable. */
  /** @param {Response} response @returns {Promise<{unknown:boolean,code:string|null}>} */
  async function serverError(response){
    try{const body=await response.json(),code=body?.error?.code;
      return {unknown:response.status===503&&code==='USAGE_STORAGE_UNAVAILABLE'&&body.error.durability==='unconfirmed',code:typeof code==='string'&&/^[A-Z][A-Z0-9_]{0,63}$/.test(code)?code:null};}
    catch{return {unknown:false,code:null};}
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
      let body;try{body=/** @type {{items?:unknown,nextAfter?:unknown,window?:{from?:unknown,to?:unknown}}} */(await response.json());}catch{return unavailable('unknown','REMOTE_RESPONSE_INVALID',deviceId,status);}
      if(!Array.isArray(body.items)||(body.nextAfter!==null&&typeof body.nextAfter!=='string')||body.window?.from!==from.toISOString()||body.window?.to!==to.toISOString())return unavailable('unknown','REMOTE_RESPONSE_INVALID',deviceId,status);
      for(const item of body.items){
        const value=/** @type {Record<string,unknown>} */(item);
        if(value===null||typeof value!=='object'||value.deviceId!==deviceId||!['eventId','hanaRef','action','occurredAt','receivedAt'].every(key=>typeof value[key]==='string'))return unavailable('unknown','REMOTE_RESPONSE_INVALID',deviceId,status);
        events.push({eventId:String(value.eventId),hanaRef:String(value.hanaRef),action:/** @type {import('./contracts.js').RemoteEvent['action']} */(value.action),occurredAt:String(value.occurredAt),receivedAt:String(value.receivedAt)});
      }
      after=body.nextAfter;
    }while(after!==null);
    return {state:'available',deviceId,total:events.length,events,code:null,httpStatus:status,checkedAt};
  }
  /** @param {import('../core/index.js').UsageEvent} event @returns {import('./contracts.js').ResendEventsResult['events'][number]} */
  function delivery(event){return {eventId:event.eventId,delivery:unconfirmed.has(event.eventId)?'unconfirmed':event.upload.state==='rejected'?'rejected':confirmed.has(event.eventId)?'confirmed':['sent','duplicate'].includes(event.upload.state)?'unconfirmed':'pending',code:unconfirmed.get(event.eventId)??event.upload.code};}
  return {start,stop,runOnce,resend,withdraw,retryWithdrawal,grant,readRemote,delivery,drain:()=>tail,health:()=>{pruneObservations();return {state,...counts(),lastUploadAt,nextAttemptAt,lastError};}};
}
