/** Consumer-owned FIXTURE of C-CORE v1 calls, not a product provider or SDK.
 * Contract: HanaMesh docs contracts/C-CORE.md (service and request-signing sections).
 * Ed25519 framing follows Core src/contract-fixtures.ts at 9f35bb1d48465b0fc676f9b468c1bb23bb14852b; no storage/identity business is implemented.
 */
import {createHash,createPublicKey,generateKeyPairSync,randomBytes,sign,verify} from 'node:crypto';
const PREFIX=Buffer.from('302a300506032b6570032100','hex');
export const CORE_DETERMINISTIC_FIXTURE_VECTORS=Object.freeze({deviceId:'If4x36FUomFia_hUBG_SJxt77UtqvkWqWId-9H-XIbk'});
export function coreCanonicalRequest(input,timestamp,nonce){return new TextEncoder().encode(`${input.method.toUpperCase()}|${input.path.replace(/[?#].*$/u,'')}|${timestamp}|${nonce}|${createHash('sha256').update(input.body??new Uint8Array()).digest('hex')}`);}
export function verifyCoreSignature(publicKey,bytes,signature){const raw=Buffer.from(publicKey,'base64url');if(raw.length!==32||signature.length!==64)return false;return verify(null,Buffer.from(bytes),createPublicKey({key:Buffer.concat([PREFIX,raw]),format:'der',type:'spki'}),Buffer.from(signature));}
export function createCoreProviderFixture(options={}){
 const serverOrigin=options.serverOrigin==null?null:new URL(options.serverOrigin).origin,{privateKey,publicKey}=generateKeyPairSync('ed25519'),listeners=new Set(),deviceId=options.deviceId??createHash('sha256').update(publicKey.export({format:'der',type:'spki'}).subarray(-32)).digest('base64url');let consent=options.initialConsent??'withheld';
 const rawSign=bytes=>new Uint8Array(sign(null,Buffer.from(bytes),privateKey));
 const service=Object.freeze({protocolVersion:'1',getDeviceId:()=>deviceId,getPublicKey:()=>publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64url'),sign:rawSign,
  async signRequest(input){if(!input||typeof input.method!=='string'||typeof input.path!=='string'||(input.body!==null&&!(input.body instanceof Uint8Array))||!input.path.replace(/[?#].*$/u,'').startsWith('/'))throw TypeError('CORE_INPUT_INVALID');const timestamp=String(Date.now()),nonce=randomBytes(16).toString('base64url');return {'x-hm-device-id':deviceId,'x-hm-timestamp':timestamp,'x-hm-nonce':nonce,'x-hm-signature':Buffer.from(rawSign(coreCanonicalRequest(input,timestamp,nonce))).toString('base64url')};},
  getConsent:()=>consent,onConsentChange(listener){listeners.add(listener);return ()=>listeners.delete(listener);},
  getSession:()=>({protocolVersion:'1',deviceId,registration:'unregistered',principalId:null,bound:null,serverReachable:null,checkedAt:null,reason:null}),getServerOrigin:()=>serverOrigin,
  getHealth:()=>({revision:0,mode:'restricted',components:[],fault:'CONTRACT_FIXTURE'})});
 return {label:'FIXTURE · consumer-owned C-CORE v1 calls; not product provider',service,async setConsent(state){if(!['withheld','granted'].includes(state))throw TypeError('CORE_INPUT_INVALID');consent=state;const changedAt=new Date().toISOString();for(const listener of listeners)try{listener(state,changedAt);}catch{}return {state,changedAt};}};
}
export function coreHandshakeCases(){const base=()=>({...createCoreProviderFixture().service}),without=name=>{const value=base();delete value[name];return value;};const cases=[
 {id:'match',value:base(),expected:{status:'present'}},{id:'undefined',value:undefined,expected:{status:'absent'}},{id:'null',value:null,expected:{status:'absent'}},{id:'string',value:'hanameshCore',expected:{status:'incompatible'}},{id:'version',value:{...base(),protocolVersion:'2'},expected:{status:'incompatible'}},{id:'no-version',value:without('protocolVersion'),expected:{status:'incompatible'}}];
 for(const name of ['getDeviceId','sign','signRequest','getConsent','onConsentChange','getSession','getServerOrigin'])cases.push({id:'missing-'+name,value:without(name),expected:{status:'incompatible'}});return cases;
}
