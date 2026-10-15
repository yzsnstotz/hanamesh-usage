import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,generateKeyPairSync,sign,verify} from 'node:crypto';
import {AgentStore} from '../src/agent/store.mjs';
import {uploadOnce} from '../lib/agent/upload.mjs';
import {agentSigningJSON} from '../lib/core/agent-event.js';

// Contract doubles only: no production backend or account. Real Ed25519 signatures over actual upload bytes.
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'hm-agent-upload-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const {publicKey,privateKey}=generateKeyPairSync('ed25519');
 const deviceId=createHash('sha256').update(publicKey.export({format:'der',type:'spki'}).subarray(-32)).digest('base64url');
 let consent='granted';const calls=[],posted=[];
 const r={agentHome:root,config:{serverOrigin:'http://127.0.0.1:34111',websiteOrigin:'http://127.0.0.1:34112'},store:new AgentStore(root),async call(input){calls.push(input.operation);if(input.operation==='state')return {consent:{state:consent},deviceId};if(input.operation==='sign')return {signature:sign(null,Buffer.from(input.bytes,'base64'),privateKey).toString('base64url')};if(input.operation==='signRequest')return {'x-fixture':'signed'};return {deviceId};}};
 const catalog={schemaVersion:1,eventProtocol:'hm-agent-v1',generatedAt:'2026-10-15T00:00:00.000Z',settings:{uploadIntervalMs:60000,catalogRefreshMs:300000,backfillWindowDays:30},plugins:[{hanaRef:'hana-target',githubRepo:'owner/repo',channel:'codex',pluginName:'target',marketplace:'market',pluginId:'target@market',mcpServers:['probe'],skills:['hello']}]};
 const request=async(origin,path,init)=>{calls.push(path);if(path==='/v1/registry/agent-catalog')return catalog;if(path.startsWith('/v1/usage/me/contributions'))return {bound:true};assert.equal(path,'/v2/usage/events');const rows=JSON.parse(init.body);posted.push(...rows);for(const row of rows){assert.ok(verify(null,Buffer.from(agentSigningJSON(row)),publicKey,Buffer.from(row.signature,'base64url')));assert.equal(verify(null,Buffer.from(agentSigningJSON({...row,channel:'claude'})),publicKey,Buffer.from(row.signature,'base64url')),false);}return {durability:'committed',accepted:rows.length,duplicates:0,rejected:[]};};
 const row={factId:'a'.repeat(64),channel:'codex',pluginId:'target@market',feature:'mcp:echo',success:true,occurredAt:'2026-10-15T10:00:00.000Z',disposition:'attributed'};
 return {r,row,request,calls,posted,catalog,setConsent(value){consent=value;}};
}
test('no network before consent, catalog unavailable does not downgrade, unlisted names do not upload',async t=>{
 const f=await fixture(t);f.setConsent('withheld');
 assert.equal((await uploadOnce(f.r,{request:()=>assert.fail('network before consent')})).state,'withheld');
 f.setConsent('granted');await f.r.store.record({...f.row,pluginId:'private-name@market'},true);
 await uploadOnce(f.r,{now:Date.parse('2026-10-16T00:00:00.000Z'),request:f.request});assert.equal(f.posted.length,0);assert.ok(!f.calls.includes('register'));
 f.r.cachedCatalog=null;await assert.rejects(uploadOnce(f.r,{request:async()=>({schemaVersion:1})}),/AGENT_CATALOG_INVALID/);
});
test('signed channel/feature/result, minimal fields, stable bytes on explicit retry and no automatic replay after unknown commit',async t=>{
 const f=await fixture(t);await f.r.store.record(f.row,true);
 let sentBody;
 await assert.rejects(uploadOnce(f.r,{now:Date.parse('2026-10-16T00:00:00.000Z'),request:async(o,p,i)=>{if(p==='/v2/usage/events'){sentBody=i.body;throw new Error('commit unknown');}return f.request(o,p,i);}}));
 assert.equal((await f.r.store.rows())[0].delivery.state,'unconfirmed');
 await uploadOnce(f.r,{now:Date.parse('2026-10-16T00:00:00.000Z'),request:f.request});assert.equal(f.posted.length,0);
 await f.r.store.mark(f.row.factId,null);
 await uploadOnce(f.r,{now:Date.parse('2026-10-16T00:00:00.000Z'),request:async(o,p,i)=>{if(p==='/v2/usage/events')assert.equal(i.body,sentBody);return f.request(o,p,i);}});
 assert.deepEqual(Object.keys(f.posted[0]),['deviceId','hanaRef','action','occurredAt','eventId','nonce','channel','feature','success','signature']);
 assert.equal((await f.r.store.rows())[0].delivery.state,'sent');
});
test('failed tool use is visible as success=false and a malformed receipt never becomes confirmed',async t=>{
 const f=await fixture(t);await f.r.store.record({...f.row,success:false},true);
 await assert.rejects(uploadOnce(f.r,{now:Date.parse('2026-10-16T00:00:00.000Z'),request:async(o,p,i)=>{if(p==='/v2/usage/events')return {accepted:1,duplicates:1,rejected:[],durability:'committed'};return f.request(o,p,i);}}),/RESPONSE_INVALID/);
 assert.equal((await f.r.store.rows())[0].delivery.state,'unconfirmed');
});
