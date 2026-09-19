// @ts-check
import { UsageError, wireEvent } from '../core/index.js';

const EVENT_PATH='/v1/usage/events';
const maxBodyBytes=64*1024;

/**
 * @param {{
 *  store: import('../core/index.js').EventStore,
 *  link: {get(): import('../../docs/contracts/hanamesh-core/contract.js').HanaMeshCoreContract|null},
 *  uploadIntervalMs:number,
 *  uploadBatchSize:number,
 *  fetchImpl?: typeof fetch,
 *  now?: ()=>number,
 * }} options
 */
export function createUsageReporter({store,link,uploadIntervalMs,uploadBatchSize,fetchImpl=fetch,now=Date.now}){
  let state=/** @type {'idle'|'uploading'|'backoff'|'offline'|'stopped'} */('stopped');
  let lastUploadAt=/** @type {string|null} */(null),nextAttemptAt=/** @type {string|null} */(null),lastError=/** @type {string|null} */(null),failures=0,active=false;
  let tail=Promise.resolve();
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
    active=true;const core=link.get();
    if(core===null){state='stopped';return;}
    if(core.getConsent()!=='granted'){state='stopped';return;}
    if(core.getServerOrigin()===null){state='offline';return;}
    state='idle';schedule(5000);
  }
  function stop(){active=false;clearTimer();state='stopped';nextAttemptAt=null;}
  /** @param {string} code @param {string[]} ids */
  async function fail(code,ids){await store.markAttempts(ids);lastError=code;backoff();return /** @type {const} */('backoff');}
  async function runOnceRaw(){
    const core=link.get();if(core===null){state='stopped';return /** @type {const} */('stopped');}
    if(core.getConsent()!=='granted'){state='stopped';return /** @type {const} */('withheld');}
    const origin=core.getServerOrigin();if(origin===null){state='offline';return /** @type {const} */('offline');}
    let batch=store.query({state:'pending',limit:uploadBatchSize}).events.filter(event=>event.signature!==null);
    if(batch.length===0){state='idle';lastError=null;nextAttemptAt=null;return /** @type {const} */('idle');}
    let json='';
    // O1 `POST /v1/usage/events` body is a bare 1–200 item array (hanamesh-server-usage docs/API.md), not an {events:[…]} envelope.
    while(batch.length>0){json=JSON.stringify(batch.map(wireEvent));if(Buffer.byteLength(json)<=maxBodyBytes)break;batch=batch.slice(0,Math.max(1,Math.floor(batch.length/2)));if(batch.length===1&&Buffer.byteLength(JSON.stringify(batch.map(wireEvent)))>maxBodyBytes)throw new UsageError('UPLOAD_BATCH_TOO_LARGE');}
    const ids=batch.map(event=>event.eventId),body=new TextEncoder().encode(json),url=new URL(EVENT_PATH,origin);state='uploading';
    let response;
    try{
      const signed=await core.signRequest({method:'POST',path:EVENT_PATH,body});
      response=await fetchImpl(url,{method:'POST',headers:{...signed,'content-type':'application/json',origin},body:json});
    }catch{return await fail('UPLOAD_UNAVAILABLE',ids);}
    if(response.status===401||response.status===403)return await fail('UPLOAD_UNAUTHORIZED',ids);
    if(response.status<200||response.status>=300)return await fail('UPLOAD_UNAVAILABLE',ids);
    try{
      const result=/** @type {import('../core/index.js').IngestBatchResult} */(await response.json());
      await store.applyUpload(ids,result,iso());
    }catch{return await fail('UPLOAD_RESPONSE_INVALID',ids);}
    failures=0;state='idle';lastError=null;nextAttemptAt=null;lastUploadAt=iso();return /** @type {const} */('uploaded');
  }
  function runOnce(){const run=tail.then(runOnceRaw);tail=run.then(()=>{},()=>{});return run;}
  /** @param {string} deviceId */
  async function requestWithdrawal(deviceId){
    const core=link.get();if(core===null)return {state:/** @type {const} */('offline'),deletedEvents:null,lastError:'CORE_UNAVAILABLE'};
    const origin=core.getServerOrigin();if(origin===null)return {state:/** @type {const} */('offline'),deletedEvents:null,lastError:null};
    const path=`/v1/usage/me/devices/${encodeURIComponent(deviceId)}/events`,url=new URL(path,origin);
    try{
      const signed=await core.signRequest({method:'DELETE',path,body:null});const response=await fetchImpl(url,{method:'DELETE',headers:{...signed,origin}});
      if(response.status<200||response.status>=300)throw new UsageError('WITHDRAW_UNAVAILABLE');
      const body=/** @type {{deletedEvents?:unknown}} */(await response.json());if(!Number.isSafeInteger(body.deletedEvents)||Number(body.deletedEvents)<0)throw new UsageError('WITHDRAW_RESPONSE_INVALID');
      return {state:/** @type {const} */('sent'),deletedEvents:Number(body.deletedEvents),lastError:null};
    }catch{return {state:/** @type {const} */('pending'),deletedEvents:null,lastError:'WITHDRAW_UNAVAILABLE'};}
  }
  async function retryWithdrawal(){
    const withdrawal=store.getSnapshot().withdrawal;if(withdrawal===null)return /** @type {const} */('idle');
    if(withdrawal.state==='sent')return /** @type {const} */('sent');
    if(withdrawal.state==='offline')return /** @type {const} */('offline');
    const result=await requestWithdrawal(withdrawal.deviceId);await store.markWithdrawal(result);
    if(result.state==='sent'){clearTimer();state='stopped';lastError=null;return /** @type {const} */('sent');}
    if(result.state==='offline'){clearTimer();state='offline';lastError=result.lastError;return /** @type {const} */('offline');}
    lastError='WITHDRAW_UNAVAILABLE';backoff(true);return /** @type {const} */('backoff');
  }
  /** @param {string} [changedAt] @param {string|null} [deviceIdOverride] */
  async function withdraw(changedAt=iso(),deviceIdOverride=null){
    stop();await tail;const current=store.getSnapshot().withdrawal;if(current?.state==='sent')return /** @type {const} */('sent');if(current?.state==='offline')return /** @type {const} */('offline');
    const core=link.get();const deviceId=deviceIdOverride??core?.getDeviceId();if(!deviceId){state='offline';return /** @type {const} */('offline');}
    if(current===null)await store.withdrawLocal(changedAt,deviceId);
    return await retryWithdrawal();
  }
  async function grant(){await store.clearWithdrawal();start();}
  return {start,stop,runOnce,withdraw,retryWithdrawal,grant,drain:()=>tail,health:()=>({state,...counts(),lastUploadAt,nextAttemptAt,lastError})};
}
