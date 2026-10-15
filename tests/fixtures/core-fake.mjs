// In-repo C-CORE test double (Cordis service `hanameshCore`, protocolVersion '1').
// Real Ed25519 keys from node:crypto; no sibling package, no server, no storage.
// It stands in for Core only: it never implements C-USAGE server behaviour.
import {createHash,createPrivateKey,createPublicKey,generateKeyPairSync,randomBytes,sign as edSign,verify as edVerify} from 'node:crypto';

const PKCS8_ED25519_PREFIX=Buffer.from('302e020100300506032b657004220420','hex');
const SPKI_ED25519_PREFIX=Buffer.from('302a300506032b6570032100','hex');
const b64=bytes=>Buffer.from(bytes).toString('base64url');

/** RFC 8032 §7.1 TEST 1 (public vector). */
export const RFC8032_TEST1={
  seed:'9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60',
  publicKey:'11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo',
  deviceId:'If4x36FUomFia_hUBG_SJxt77UtqvkWqWId-9H-XIbk',
};

/** One Ed25519 identity. `seed` is a 32-byte hex string; omitted means a fresh random key. */
export function createCoreKey(seed){
  const privateKey=seed===undefined?generateKeyPairSync('ed25519').privateKey
    :createPrivateKey({key:Buffer.concat([PKCS8_ED25519_PREFIX,Buffer.from(seed,'hex')]),format:'der',type:'pkcs8'});
  const raw=createPublicKey(privateKey).export({format:'der',type:'spki'}).subarray(-32);
  return Object.freeze({
    publicKey:b64(raw),
    deviceId:b64(createHash('sha256').update(raw).digest()),
    sign:bytes=>new Uint8Array(edSign(null,Buffer.from(bytes),privateKey)),
  });
}

/** `METHOD|pathname|timestamp|nonce|hex(sha256(body or empty))`, pathname without query or fragment. */
export function coreCanonicalRequest(input,timestamp,nonce){
  const pathname=input.path.replace(/[?#].*$/u,'');
  const bodyHash=createHash('sha256').update(input.body??new Uint8Array()).digest('hex');
  return new TextEncoder().encode(`${input.method.toUpperCase()}|${pathname}|${timestamp}|${nonce}|${bodyHash}`);
}

export function verifyCoreSignature(publicKey,bytes,signature){
  const raw=Buffer.from(publicKey,'base64url');
  if(raw.byteLength!==32||signature.byteLength!==64)return false;
  const key=createPublicKey({key:Buffer.concat([SPKI_ED25519_PREFIX,raw]),format:'der',type:'spki'});
  return edVerify(null,Buffer.from(bytes),key,Buffer.from(signature));
}

/** Usage event signature: Ed25519 over the six signed fields as JSON in this fixed order. */
export function verifyEventSignature(event,publicKey){
  try{
    const six=JSON.stringify({deviceId:event.deviceId,hanaRef:event.hanaRef,action:event.action,occurredAt:event.occurredAt,eventId:event.eventId,nonce:event.nonce});
    return verifyCoreSignature(publicKey,new TextEncoder().encode(six),Buffer.from(event.signature,'base64url'));
  }catch{return false;}
}

/**
 * @param {{key?:ReturnType<typeof createCoreKey>,seed?:string,deviceId?:string,initialConsent?:'granted'|'withheld',serverOrigin?:string|null,clock?:()=>number}} [options]
 * `deviceId` overrides the key-derived id only for tests that need a mismatched identity.
 */
export function createCoreFake(options={}){
  const key=options.key??createCoreKey(options.seed);
  const deviceId=options.deviceId??key.deviceId;
  const origin=options.serverOrigin==null?null:new URL(options.serverOrigin).origin;
  const clock=options.clock??Date.now;
  const listeners=new Set();
  let consent=options.initialConsent??'withheld';
  const service=Object.freeze({
    protocolVersion:'1',
    getDeviceId:()=>deviceId,
    getPublicKey:()=>key.publicKey,
    sign:bytes=>key.sign(bytes),
    async signRequest(input){
      if(!input||typeof input.method!=='string'||typeof input.path!=='string'||(input.body!==null&&!(input.body instanceof Uint8Array)))throw new TypeError('CORE_INPUT_INVALID');
      if(!input.path.replace(/[?#].*$/u,'').startsWith('/'))throw new TypeError('CORE_INPUT_INVALID');
      const timestamp=String(clock()),nonce=b64(randomBytes(16));
      return Object.freeze({'x-hm-device-id':deviceId,'x-hm-timestamp':timestamp,'x-hm-nonce':nonce,'x-hm-signature':b64(key.sign(coreCanonicalRequest(input,timestamp,nonce)))});
    },
    getConsent:()=>consent,
    onConsentChange(listener){listeners.add(listener);return ()=>{listeners.delete(listener);};},
    getSession:()=>Object.freeze({protocolVersion:'1',deviceId,registration:'unregistered',principalId:null,bound:null,serverReachable:null,checkedAt:null,reason:null}),
    getServerOrigin:()=>origin,
    getHealth:()=>Object.freeze({revision:0,mode:'restricted',components:Object.freeze([]),fault:'TEST_FAKE'}),
  });
  return {
    service,key,
    setConsent(state){
      if(state!=='granted'&&state!=='withheld')throw new TypeError('CORE_INPUT_INVALID');
      consent=state;const changedAt=new Date().toISOString();
      for(const listener of listeners){try{listener(state,changedAt);}catch{/* listener isolation */}}
      return {state,changedAt};
    },
  };
}

/** Several independent Core providers (separate service objects) over one device key. */
export function createSharedCoreIdentity(options={}){
  const key=options.key??createCoreKey(options.seed);
  return {key,createProvider:(providerOptions={})=>createCoreFake({...providerOptions,key})};
}

/** The C-CORE handshake matrix: match, absent, wrong shape, wrong/missing version, each missing required method. */
export const CORE_REQUIRED_METHODS=Object.freeze(['getDeviceId','sign','signRequest','getConsent','onConsentChange','getSession','getServerOrigin']);
export function coreHandshakeCases(makeService=()=>createCoreFake().service){
  const base=()=>({...makeService()});
  const without=name=>{const value=base();delete value[name];return value;};
  const cases=[
    {id:'handshake.match',value:base(),expected:{status:'present'}},
    {id:'handshake.absent-undefined',value:undefined,expected:{status:'absent'}},
    {id:'handshake.absent-null',value:null,expected:{status:'absent'}},
    {id:'handshake.not-object',value:'hanameshCore',expected:{status:'incompatible'}},
    {id:'handshake.protocol-2',value:{...base(),protocolVersion:'2'},expected:{status:'incompatible'}},
    {id:'handshake.protocol-missing',value:without('protocolVersion'),expected:{status:'incompatible'}},
  ];
  for(const name of CORE_REQUIRED_METHODS)cases.push({id:`handshake.missing-${name}`,value:without(name),expected:{status:'incompatible'}});
  return cases;
}

/** Captures what the client sends; answers with a canned C-USAGE-shaped 200. Implements no server logic. */
export function capturingFetch(calls,{respond=input=>({accepted:input.length,duplicates:0,rejected:[],durability:'committed'}),failFirst=false}={}){
  return async(url,options)=>{
    calls.push({url:String(url),method:options.method,headers:options.headers,body:options.body});
    if(failFirst&&calls.length===1)throw new Error('FIXTURE_ACK_LOST');
    return new Response(JSON.stringify(respond(JSON.parse(options.body))),{status:200});
  };
}
