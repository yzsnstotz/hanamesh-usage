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
    // A new consent grant cannot overtake an earlier device-wide deletion.
    if(store.getSnapshot().withdrawal?.state==='pending'){state='backoff';return /** @type {const} */('backoff');}
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
  async function retryWithdrawalRaw(){
    const withdrawal=store.getSnapshot().withdrawal;if(withdrawal===null)return /** @type {const} */('idle');
    if(withdrawal.state==='sent')return /** @type {const} */('sent');
    if(withdrawal.state==='offline')return /** @type {const} */('offline');
    const response=await requestWithdrawal(withdrawal.deviceId);
    // A previously queued remote delete stays pending when its core/origin is
    // temporarily unavailable. Only an initially local-only withdrawal is offline.
    const result=response.state==='offline'?{state:/** @type {const} */('pending'),deletedEvents:null,lastError:'WITHDRAW_UNAVAILABLE'}:response;
    await store.markWithdrawal(result);
    if(result.state==='sent'){
      clearTimer();state='stopped';nextAttemptAt=null;lastError=null;
      // Consent may have been granted during the outage. Only the successful
      // old DELETE releases that barrier, then the newly buffered events upload.
      if(link.get()?.getConsent()==='granted'){await store.clearWithdrawal();start();}
      return /** @type {const} */('sent');
    }
    lastError='WITHDRAW_UNAVAILABLE';backoff(true);return /** @type {const} */('backoff');
  }
  function retryWithdrawal(){const run=tail.then(retryWithdrawalRaw);tail=run.then(()=>{},()=>{});return run;}
  /** @param {string} [changedAt] @param {string|null} [deviceIdOverride] */
  async function withdraw(changedAt=iso(),deviceIdOverride=null){
    stop();await tail;const current=store.getSnapshot().withdrawal;if(current?.state==='sent')return /** @type {const} */('sent');if(current?.state==='offline')return /** @type {const} */('offline');
    const core=link.get();const deviceId=deviceIdOverride??core?.getDeviceId();if(!deviceId){state='offline';return /** @type {const} */('offline');}
    if(current===null){
      await store.withdrawLocal(changedAt,deviceId);
      if(core===null||core.getServerOrigin()===null){await store.markWithdrawal({state:'offline',deletedEvents:null,lastError:core===null?'CORE_UNAVAILABLE':null});state='offline';return /** @type {const} */('offline');}
    }
    return await retryWithdrawal();
  }
  async function grant(){
    if(store.getSnapshot().withdrawal?.state==='pending'&&await retryWithdrawal()!=='sent')return;
    await store.clearWithdrawal();start();
  }
  return {start,stop,runOnce,withdraw,retryWithdrawal,grant,drain:()=>tail,health:()=>({state,...counts(),lastUploadAt,nextAttemptAt,lastError})};
}
