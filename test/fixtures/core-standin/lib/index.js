import {createHash,generateKeyPairSync,randomBytes,sign as edSign} from 'node:crypto';

export const name='hanamesh-core-standin';
export const inject=['connection'];
const DEVICE_ID='device_P2_STANDIN';
const CONSENT_PATH='/api/hanamesh/core-standin/consent';
const iso=()=>new Date().toISOString();
const b64=value=>Buffer.from(value).toString('base64url');

export function apply(ctx,config={}){
  const origin=config.serverOrigin===null||config.serverOrigin===undefined?null:new URL(config.serverOrigin).origin;
  let consent=config.initialConsent==='granted'?'granted':'withheld';
  const listeners=new Set(),{privateKey,publicKey}=generateKeyPairSync('ed25519');
  const rawPublic=publicKey.export({format:'der',type:'spki'}).subarray(-32);
  const service={
    protocolVersion:'1',
    getDeviceId:()=>DEVICE_ID,
    getPublicKey:()=>b64(rawPublic),
    sign:bytes=>new Uint8Array(edSign(null,Buffer.from(bytes),privateKey)),
    async signRequest({method,path,body}){
      const timestamp=String(Math.floor(Date.now()/1000)),nonce=b64(randomBytes(16)),digest=createHash('sha256').update(body===null?Buffer.alloc(0):Buffer.from(body)).digest('hex');
      const signature=b64(edSign(null,Buffer.from(`${String(method).toUpperCase()}\n${path}\n${timestamp}\n${nonce}\n${digest}`),privateKey));
      return {'x-hm-device-id':DEVICE_ID,'x-hm-timestamp':timestamp,'x-hm-nonce':nonce,'x-hm-signature':signature};
    },
    getConsent:()=>consent,
    onConsentChange(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    getSession:()=>({protocolVersion:'1',deviceId:DEVICE_ID,registration:'unregistered',principalId:null,bound:null,serverReachable:origin===null?null:true,checkedAt:iso(),reason:'STANDIN'}),
    getServerOrigin:()=>origin,
    getHealth:()=>({revision:0,mode:'restricted',components:[],fault:'STANDIN'}),
  };
  const disposeService=ctx.provide('hanameshCore',service);
  const disposeRoute=ctx.connection.fetch.register({path:CONSENT_PATH,methods:['POST'],requestBody:'buffered',fetch:async request=>{
    try{
      const input=await request.json();if(input===null||typeof input!=='object'||!['granted','withheld'].includes(input.state))return new Response('{"error":"INVALID_CONSENT"}',{status:400,headers:{'content-type':'application/json'}});
      if(input.state!==consent){consent=input.state;const changedAt=iso();for(const listener of listeners)listener(consent,changedAt);}
      return new Response(JSON.stringify({state:consent}),{headers:{'content-type':'application/json','cache-control':'no-store'}});
    }catch{return new Response('{"error":"INVALID_CONSENT"}',{status:400,headers:{'content-type':'application/json'}});}
  }});
  ctx.effect(()=>async()=>{listeners.clear();await disposeRoute();await disposeService();});
}
