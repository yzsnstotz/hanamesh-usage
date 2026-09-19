import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign as edSign,verify as edVerify} from 'node:crypto';
import * as core from '../lib/core/index.js';

let host=null;try{host=await import('../lib/host/core-link.js');}catch{}

function standin(){
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');let consent='granted';
  return {publicKey,service:{protocolVersion:'1',getDeviceId:()=> 'device_FIXTURE',getPublicKey:()=>'',sign:bytes=>edSign(null,bytes,privateKey),signRequest:async()=>({'x-hm-device-id':'device_FIXTURE','x-hm-timestamp':'1','x-hm-nonce':'nonce','x-hm-signature':'signature'}),getConsent:()=>consent,onConsentChange:()=>()=>{},getSession:()=>({}),getServerOrigin:()=>null,getHealth:()=>({})}};
}

test('U11 core link module is present',()=>assert.equal(typeof host?.createCoreLink,'function'));

test('U11 absent and incompatible core stay optional, while late compatible service attaches',()=>{
  const handlers=new Map();const ctx={get:()=>undefined,on(name,fn){handlers.set(name,fn);return()=>handlers.delete(name);}};
  const link=host.createCoreLink(ctx);assert.equal(link.status(),'absent');assert.equal(link.get(),null);
  handlers.get('internal/service')('hanameshCore',{protocolVersion:'2'});assert.equal(link.status(),'incompatible');
  const updates=[];const stop=link.onChange(status=>updates.push(status));const {service}=standin();handlers.get('internal/service')('hanameshCore',service);
  assert.equal(link.status(),'present');assert.equal(link.get().getDeviceId(),'device_FIXTURE');assert.deepEqual(updates,['present']);
  stop();link.close();assert.equal(handlers.size,0);
});

test('U12 signed event uses canonical six-key bytes and a 64-byte Ed25519 signature',()=>{
  const {service,publicKey}=standin();const event=core.createUsageEvent({deviceId:'device_FIXTURE',hanaRef:'pkg',action:'use',occurredAt:'2026-09-19T00:00:00.000Z',eventId:core.eventIdForSeat('device_FIXTURE','app-host','use-1'),nonce:'AQIDBAUGBwgJCgsMDQ4PEA',signature:null,source:'seat',sourcePlugin:'app-host',evidenceRef:'use-1'});
  const signed=host.signUsageEvent(service,event);assert.match(signed.signature,/^[A-Za-z0-9_-]+$/);assert.equal(Buffer.from(signed.signature,'base64url').length,64);
  const wire=core.wireEvent(signed);const {signature,...six}=wire;const bytes=new TextEncoder().encode(core.signingJSON(six));assert.equal(edVerify(null,bytes,publicKey,Buffer.from(signature,'base64url')),true);
  const changed={...six,action:'open'};assert.equal(edVerify(null,new TextEncoder().encode(core.signingJSON(changed)),publicKey,Buffer.from(signature,'base64url')),false);
});
