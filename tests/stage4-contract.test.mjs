import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCoreProviderFixture,coreCanonicalRequest,verifyCoreSignature} from '@hanamesh/core/contract/fixtures';

test('Core public provider identity and request signature are consumable without a local stand-in',async()=>{
 const {service}=createCoreProviderFixture({initialConsent:'granted'});
 const publicKey=service.getPublicKey();
 assert.equal(service.getDeviceId(),createHash('sha256').update(Buffer.from(publicKey,'base64url')).digest('base64url'));
 const input={method:'post',path:'/v1/usage/events?ignored=1#ignored',body:new TextEncoder().encode('[]')};
 const headers=await service.signRequest(input);
 assert.equal(headers['x-hm-device-id'],service.getDeviceId());
 assert(Number.isSafeInteger(Number(headers['x-hm-timestamp'])));
 assert.equal(verifyCoreSignature(publicKey,coreCanonicalRequest(input,headers['x-hm-timestamp'],headers['x-hm-nonce']),Buffer.from(headers['x-hm-signature'],'base64url')),true);
 assert.equal(verifyCoreSignature(publicKey,coreCanonicalRequest({...input,body:new TextEncoder().encode('[1]')},headers['x-hm-timestamp'],headers['x-hm-nonce']),Buffer.from(headers['x-hm-signature'],'base64url')),false);
});
