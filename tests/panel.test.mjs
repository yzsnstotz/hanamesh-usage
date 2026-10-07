import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { fixtureHost } from './fixtures/host.mjs';
import { core } from './fixtures/helpers.mjs';
import {mountTransport} from '../lib/host/transport.js';
import {apply as applyUsage} from '../lib/host/index.js';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const key = publicKey.export({format:'der', type:'spki'}).subarray(-32).toString('base64url');
function event(deviceId='device_A', signature='valid') {
  const value=core.createUsageEvent({deviceId,hanaRef:'ordinary-plugin',action:'use',occurredAt:'2026-10-07T00:00:00.000Z',eventId:core.eventIdForSeat(deviceId,'ordinary-plugin','command:one:succeeded'),nonce:'AQIDBAUGBwgJCgsMDQ4PEA',signature:null,source:'seat',sourcePlugin:'ordinary-plugin',evidenceRef:'command:one:succeeded'});
  value.signature=signature==='missing'?null:signature==='valid'?sign(null,Buffer.from(core.signingJSON(value)),privateKey).toString('base64url'):Buffer.alloc(64).toString('base64url');
  return value;
}
test('panel reads only the current device and distinguishes cryptographic validity from delivery',async()=>{
  const first=event(),other=event('device_B');first.upload={state:'sent',code:null,attempts:1,sentAt:'2026-10-07T00:01:00.000Z'};
  const h=await fixtureHost({publicKey:key,eventSnapshot:{schemaVersion:1,events:[first,other],withdrawal:null,inventory:{last:null}},panelTestSupply:{identity:true,receiver:true}});
  try {
    assert.equal(typeof h.api.panel,'function','read-only development panel is missing');
    const writes=h.eg.writes,p=h.api.panel();
    assert.equal(p.total,1);assert.equal(p.events.length,1);assert.equal(p.subject.deviceId,'device_A');assert.equal(p.subject.principalId,null);
    assert.deepEqual(p.testSupply,{identity:true,receiver:true});
    assert.equal(p.events[0].signature.state,'success');assert.equal(p.events[0].upload.state,'sent');
    assert.equal(p.outbox.pending,0);assert.equal(p.outbox.sent,1);
    assert.equal(p.events[0].evidenceRef,'command:one:succeeded');assert.equal(p.events[0].sourcePlugin,'ordinary-plugin');
    assert.equal(h.eg.writes,writes,'reading panel must not write or collect');
    assert.doesNotMatch(JSON.stringify(p),new RegExp(first.signature));assert(!Object.hasOwn(p.events[0],'nonce'));
  } finally {await h.close();}
});
test('panel reports invalid signatures and missing identity as failure and unknown',async()=>{
  const bad=event('device_A','invalid');bad.upload={state:'rejected',code:'EVENT_REJECTED',attempts:1,sentAt:'2026-10-07T00:01:00.000Z'};
  const h=await fixtureHost({publicKey:key,eventSnapshot:{schemaVersion:1,events:[bad],withdrawal:null,inventory:{last:null}}});
  try {assert.equal(typeof h.api.panel,'function');const p=h.api.panel();assert.equal(p.events[0].signature.state,'failure');assert.equal(p.events[0].upload.state,'rejected');assert.deepEqual(p.testSupply,{identity:false,receiver:false});} finally {await h.close();}
  const absent=await fixtureHost({coreStatus:'absent',eventSnapshot:{schemaVersion:1,events:[event()],withdrawal:null,inventory:{last:null}}});
  try {assert.equal(typeof absent.api.panel,'function');const p=absent.api.panel();assert.equal(p.subject.deviceId,null);assert.equal(p.total,0);assert.deepEqual(p.events,[]);assert.equal(p.subject.reason,'DEVICE_UNAVAILABLE');}finally{await absent.close();}
});
test('panel with unavailable signer key never labels a stored signature verified',async()=>{
  const h=await fixtureHost({eventSnapshot:{schemaVersion:1,events:[event()],withdrawal:null,inventory:{last:null}}});
  try {assert.equal(typeof h.api.panel,'function');assert.equal(h.api.panel().events[0].signature.state,'unknown');}finally{await h.close();}
});
test('read-only authenticated panel routes expose independent statuses and reject write/filter misuse',async()=>{
  const h=await fixtureHost({publicKey:key,eventSnapshot:{schemaVersion:1,events:[event()],withdrawal:null,inventory:{last:null}},panelTestSupply:{identity:true,receiver:true}});
  const routes=new Map(),disposers=[];
  mountTransport({connection:{fetch:{register:route=>{routes.set(route.path,route);return async()=>routes.delete(route.path);}}},effect:fn=>disposers.push(fn())},h.api);
  async function request(suffix='',method='GET'){return routes.get('/api/hanamesh/usage/panel'+suffix.split('?')[0]).fetch(new Request('http://127.0.0.1/api/hanamesh/usage/panel'+suffix,{method}));}
  try{
    assert.equal((await request('', 'POST')).status,405);assert.equal((await request('?prompt=forbidden')).status,400);
    const response=await request('/view'),html=await response.text();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
    assert.match(html,/测试身份/);assert.match(html,/测试接收端/);assert.match(html,/成功 · Ed25519 校验通过/);assert.match(html,/未知 · 等待接收端确认/);assert.match(html,/command:one:succeeded/);
    assert.doesNotMatch(html,/<script|<form|nonce|SYNTHETIC_CONTENT_NOT_TO_EXPORT/);assert(!html.includes(event().signature));
    assert.deepEqual(await (await request()).json(),h.api.panel());
  }finally{for(const dispose of disposers)await dispose();assert.equal(routes.size,0);await h.close();}
});
test('test-supply display declaration is explicit, closed and boolean-only',async()=>{
  for(const panelTestSupply of [null,true,{identity:true},{identity:'fixture',receiver:true},{identity:true,receiver:true,extra:true}]){
    await assert.rejects(applyUsage({}, {panelTestSupply}),{code:'INVALID_CONFIG'});
  }
});
