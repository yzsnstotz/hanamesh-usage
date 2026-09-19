// @ts-check
import { canonicalJSON, UsageError, validateEvent, wireEvent } from '../core/index.js';

const required = ['getDeviceId','sign','signRequest','getConsent','onConsentChange','getSession','getServerOrigin'];

/** @param {unknown} value @returns {{status:'absent'|'incompatible'|'present',core:import('../../docs/contracts/hanamesh-core/contract.js').HanaMeshCoreContract|null}} */
export function duckCore(value) {
  if (value === undefined || value === null) return {status:'absent',core:null};
  if (typeof value !== 'object' || value === null || /** @type {{protocolVersion?:unknown}} */ (value).protocolVersion !== '1'
    || required.some(name=>typeof /** @type {Record<string,unknown>} */ (value)[name] !== 'function')) return {status:'incompatible',core:null};
  const candidate=/** @type {import('../../docs/contracts/hanamesh-core/contract.js').HanaMeshCoreContract} */ (value);
  return {status:'present',core:{
    protocolVersion:'1',
    getDeviceId:candidate.getDeviceId.bind(candidate),
    getPublicKey:typeof candidate.getPublicKey==='function'?candidate.getPublicKey.bind(candidate):()=>'',
    sign:candidate.sign.bind(candidate),
    signRequest:candidate.signRequest.bind(candidate),
    getConsent:candidate.getConsent.bind(candidate),
    onConsentChange:candidate.onConsentChange.bind(candidate),
    getSession:candidate.getSession.bind(candidate),
    getServerOrigin:candidate.getServerOrigin.bind(candidate),
    getHealth:typeof candidate.getHealth==='function'?candidate.getHealth.bind(candidate):()=>({revision:0,mode:'restricted',components:[],fault:'CORE_HEALTH_UNAVAILABLE'}),
  }};
}

/** @param {import('@deepseek-ai/cordis').Context} ctx */
export function createCoreLink(ctx) {
  // Optional Cordis services must be read through get(). Accessing an undeclared
  // ctx property is a runtime error even when the service is intentionally absent.
  const current=typeof ctx.get==='function'?ctx.get('hanameshCore'):undefined;
  let linked=duckCore(current);
  /** @type {Set<(status:'absent'|'incompatible'|'present',core:import('../../docs/contracts/hanamesh-core/contract.js').HanaMeshCoreContract|null)=>void>} */
  const listeners=new Set();
  const stopService=ctx.on('internal/service',(name,value)=>{
    if(name!=='hanameshCore')return;
    linked=duckCore(value);
    for(const listener of listeners)listener(linked.status,linked.core);
  });
  return {
    status:()=>linked.status,
    get:()=>linked.core,
    /** @param {(status:'absent'|'incompatible'|'present',core:import('../../docs/contracts/hanamesh-core/contract.js').HanaMeshCoreContract|null)=>void} listener */
    onChange(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    close(){listeners.clear();stopService();},
  };
}

/** @param {import('../../docs/contracts/hanamesh-core/contract.js').HanaMeshCoreContract} core @param {import('../core/index.js').UsageEvent} input */
export function signUsageEvent(core,input) {
  validateEvent(input);
  const wire=wireEvent(input);const {signature: _signature,...six}=wire;
  const signature=core.sign(new TextEncoder().encode(canonicalJSON(six)));
  if(!(signature instanceof Uint8Array)||signature.byteLength!==64)throw new UsageError('CORE_SIGNATURE_INVALID');
  const event={...structuredClone(input),signature:Buffer.from(signature).toString('base64url')};
  validateEvent(event);
  return event;
}
