import {fixtureAgentStore,fixtureCoreCLI} from './fixtures/agent-core.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root as codeRoot} from './fixtures/helpers.mjs';
const load=name=>import(pathToFileURL(join(codeRoot,'lib',name)).href);
const now=Date.parse('2026-10-28T10:00:00.000Z'),cid='11111111-1111-4111-8111-111111111111';
const row={factId:'a'.repeat(64),channel:'claude',pluginId:'target@market',feature:'mcp:echo',success:true,occurredAt:new Date(now).toISOString(),disposition:'attributed'};
const catalog={plugins:[{hanaRef:'hana-target',channel:'claude',pluginId:'target@market'},{hanaRef:'hana-target',channel:'codex',pluginId:'target@market'}],settings:{backfillWindowDays:30,countUnconfirmedCalls:false}};
async function fixture(t){
 const home=await mkdtemp(join(tmpdir(),'hm-onboarding-v2-'));t.after(()=>rm(home,{recursive:true,force:true}));const {AgentStore:BaseAgentStore}=await load('agent/store.mjs');const AgentStore=fixtureAgentStore(BaseAgentStore);
 let state={agentProtocolVersion:2,deviceId:'A'.repeat(43),consent:{state:'withheld',changedAt:null,consentId:null,authorization:null}};const calls=[],messages=[];
 const r={agentHome:home,sharedHome:home,host:{channel:'claude',home:join(home,'claude')},config:{serverOrigin:'http://127.0.0.1:32101',websiteOrigin:'http://127.0.0.1:32102',requestTimeoutMs:10000},store:new AgentStore(home),async call(input){calls.push(input);if(input.operation==='state')return structuredClone(state);if(input.operation==='prepareOnboarding'){state.consent.consentId=cid;return{url:'http://127.0.0.1:32102/me/bind?flow=agent&consentId='+cid,expiresAt:'2026-10-28T20:00:00.000Z',consentId:cid,deviceId:state.deviceId};}if(input.operation==='syncOnboarding')return{consent:state.consent,onboarding:{state:'pending',binding:null}};throw Error('UNEXPECTED_OPERATION');}};
 return {home,r,calls,messages,emit:async m=>messages.push(m),setState:s=>{state=s;},state:()=>state};
}
const start=(id='session-a',source='startup')=>({hook_event_name:'SessionStart',session_id:id,source});
test('normal Agent embeds the production origin pair; an incomplete override cannot fall back to it',async t=>{
 const f=await fixture(t);const {runtime}=await load('agent/runtime.mjs');const env={HOME:f.home,HANAMESH_SHARED_HOME:f.home,HANAMESH_AGENT_HOME:join(f.home,'usage')};
 const r=await runtime(env);assert.equal(r.config.serverOrigin,'https://api.hanamesh.com');assert.equal(r.config.websiteOrigin,'https://market.hanamesh.com');
 await mkdir(env.HANAMESH_AGENT_HOME);await writeFile(join(env.HANAMESH_AGENT_HOME,'config.json'),JSON.stringify({serverOrigin:'http://127.0.0.1:1'}));await assert.rejects(runtime(env),/AGENT_(?:ORIGIN|SETTINGS|CONFIGURATION)/);
});
test('both channels remind at most daily on true new main sessions; no resume, compact, or subagent',async t=>{
 const f=await fixture(t);const {firstConsentNotice}=await load('agent/notice.mjs');
 assert.equal(await firstConsentNotice(f.r,f.emit,{payload:start(),now}),true);
 assert.equal(await firstConsentNotice(f.r,f.emit,{payload:start('session-b'),now}),false);
 assert.equal(await firstConsentNotice(f.r,f.emit,{payload:start('session-c','resume'),now:now+86400000}),false);
 assert.equal(await firstConsentNotice(f.r,f.emit,{payload:{...start('session-c'),agent_type:'worker'},now:now+86400000}),false);
 assert.equal(await firstConsentNotice(f.r,f.emit,{payload:start('session-d'),now:now+86400000}),true);
 f.r.host.channel='codex';assert.equal(await firstConsentNotice(f.r,f.emit,{payload:start('cx-a'),now}),true);assert.equal(await firstConsentNotice(f.r,f.emit,{payload:start('cx-b'),now}),false);assert.equal(await firstConsentNotice(f.r,f.emit,{payload:start('cx-c'),now:now+86400000}),true);
 assert.equal(f.messages.length,4);assert.doesNotMatch(f.messages.join('\n'),/agree|connect|终端执行|默认关闭/);
});
test('reminder reports local pending count, 7d/1d urgency, expiry and genuine binding link without granting',async t=>{
 const f=await fixture(t);const {firstConsentNotice}=await load('agent/notice.mjs');await f.r.store.record({...row,occurredAt:new Date(now-23*86400000).toISOString()},true);
 await firstConsentNotice(f.r,f.emit,{payload:start(),now});assert.match(f.messages[0],/待上传.*1/);assert.match(f.messages[0],/7.*天/);assert.match(f.messages[0],/过期.*不.*计分/);assert.match(f.messages[0],/http:\/\/127\.0\.0\.1:32102\/me\/bind/);assert.match(f.messages[0],/只.*本机|仅.*本机/);assert.equal(f.state().consent.state,'withheld');
 await firstConsentNotice(f.r,f.emit,{payload:start('last-day'),now:now+6*86400000});assert.match(f.messages[1],/1.*天/);assert.match(f.messages[1],/尽快|紧急/);
});
test('bound/granted or explicitly closed users stop reminders and no model can grant',async t=>{
 const f=await fixture(t);const {firstConsentNotice}=await load('agent/notice.mjs');f.state().consent={state:'granted',changedAt:new Date(now).toISOString(),consentId:cid,authorization:'website'};assert.equal(await firstConsentNotice(f.r,f.emit,{payload:start(),now}),false);
 f.state().consent={state:'withheld',changedAt:new Date(now).toISOString(),consentId:cid,authorization:null};assert.equal(await firstConsentNotice(f.r,f.emit,{payload:start('closed'),now}),false);assert.equal(f.calls.filter(x=>x.operation!=='state').length,0);
});
test('30-day retention purges expired facts and cannot be expanded by a 60-day catalog',async t=>{
 const f=await fixture(t);await f.r.store.record({...row,occurredAt:new Date(now-31*86400000).toISOString()},true);assert.equal((await f.r.store.pending({...catalog,settings:{...catalog.settings,backfillWindowDays:60}},now)).length,0);
 await f.r.store.prune(now);assert.deepEqual(await f.r.store.rows(),[]);
});
test('install identity is stable per device/Hana across channels, real failures remain failures',async()=>{
 const {agentInstallEventForFact,agentSigningJSON}=await load('core/agent-event.js');assert.equal(typeof agentInstallEventForFact,'function');
 const a=agentInstallEventForFact('A'.repeat(43),{...row,hanaRef:'hana-target',success:false},cid);const b=agentInstallEventForFact('A'.repeat(43),{...row,channel:'codex',hanaRef:'hana-target'},cid);
 assert.equal(a.eventId,b.eventId);assert.equal(a.action,'install');assert.ok(a.nonce.startsWith('g'+cid+'.'));assert.equal(JSON.parse(agentSigningJSON(a)).success,false);assert.equal(a.occurredAt,row.occurredAt);
});
test('local recording eligibility is independent of upload consent but stops on explicit close',async t=>{
 const f=await fixture(t);const {localRecordingEnabled}=await load('agent/onboarding.mjs');assert.equal(await localRecordingEnabled(f.r),true);
 f.state().consent.changedAt=new Date(now).toISOString();assert.equal(await localRecordingEnabled(f.r),false);
});
test('real hook process records only minimal local facts before website consent and does not prepare/upload',async t=>{
 const f=await fixture(t);const {spawnSync}=await import('node:child_process');const host=join(f.home,'claude'),plugin=join(f.home,'target'),core=join(f.home,'core.mjs');
 await mkdir(join(host,'plugins'),{recursive:true});await mkdir(plugin);await writeFile(join(plugin,'.mcp.json'),JSON.stringify({mcpServers:{probe:{command:'fixture'}}}));
 await writeFile(join(host,'plugins/installed_plugins.json'),JSON.stringify({plugins:{'target@market':[{installPath:plugin}]}}));
 const initial=()=>JSON.stringify(f.state());const writeCore=()=>writeFile(core,fixtureCoreCLI(f.home,JSON.parse(initial()),join(f.home,'shared/identity/core-origin-fixture.json')));await writeCore();
 const env={HOME:f.home,PATH:process.env.PATH,HANAMESH_SHARED_HOME:join(f.home,'shared'),HANAMESH_AGENT_HOME:f.home,HANAMESH_CORE_AGENT_CLI:core,HANAMESH_AGENT_CHANNEL:'claude',CLAUDE_CONFIG_DIR:host};
 const payload={hook_event_name:'PostToolUse',session_id:'private-session',tool_use_id:'one',tool_name:'mcp__plugin_target_probe__echo',tool_input:{secret:'NEVER_PERSIST_INPUT'},tool_response:{isError:false,content:[{type:'text',text:'NEVER_PERSIST_OUTPUT'}]},transcript_path:'/NEVER_OPEN_TRANSCRIPT'};
 const run=(event='PostToolUse')=>spawnSync(process.execPath,[join(codeRoot,'lib/agent/hook.mjs'),'--event',event],{env,input:JSON.stringify({...payload,hook_event_name:event}),encoding:'utf8'});
 // A real invocation starts with Pre. Orphan Posts are covered by the origin counterexamples.
 const pre=run('PreToolUse');assert.equal(pre.status,0,pre.stderr);assert.equal(pre.stdout,'');
 const a=run();assert.equal(a.status,0,a.stderr);assert.equal(a.stdout,'');let rows=await f.r.store.rows();assert.equal(rows.length,1);assert.equal(rows[0].pluginId,'target@market');assert.doesNotMatch(JSON.stringify(rows),/NEVER_|private-session|transcript/);
 f.state().consent.changedAt=new Date(now).toISOString();await writeCore();payload.tool_use_id='two';const b=run();assert.equal(b.status,0,b.stderr);assert.equal((await f.r.store.rows()).length,1);
});
async function sender(t){
 const f=await fixture(t);const {generateKeyPairSync,sign,verify}=await import('node:crypto');const {publicKey,privateKey}=generateKeyPairSync('ed25519');
 f.state().consent={state:'granted',consentId:cid,authorization:'website',changedAt:new Date(now).toISOString()};const before=f.r.call;f.r.call=async input=>{if(input.operation==='signAgentEvent')return{signature:sign(null,Buffer.from(agentSigningJSON(input.event)),privateKey).toString('base64url')};if(input.operation==='signRequest')return{'x-fixture':'signed'};if(input.operation==='register')return{};return before(input);};
 const full={schemaVersion:1,eventProtocol:'hm-agent-v1',generatedAt:new Date(now).toISOString(),plugins:catalog.plugins.map(p=>({...p,githubRepo:'owner/target',pluginName:'target',marketplace:'market',mcpServers:['probe'],skills:[]})),settings:{...catalog.settings,uploadIntervalMs:60000,catalogRefreshMs:300000}};
 const {agentSigningJSON}=await load('core/agent-event.js');const posted=[];const request=async(origin,path,init)=>{if(path==='/v1/registry/agent-catalog')return full;assert.equal(path,'/v2/usage/events','website grants must never call old activate or legacy contributions');const [wire]=JSON.parse(init.body);assert.ok(verify(null,Buffer.from(agentSigningJSON(wire)),publicKey,Buffer.from(wire.signature,'base64url')));posted.push(wire);return{accepted:1,duplicates:0,rejected:[],durability:'committed'};};return{...f,request,posted};
}
test('website upload skips legacy activation; two actual channels produce two use and one stable install',async t=>{
 const f=await sender(t);await f.r.store.record(row,true);await f.r.store.record({...row,factId:'b'.repeat(64),channel:'codex',success:false},true);const {uploadOnce}=await load('agent/upload.mjs');
 await uploadOnce(f.r,{now:now+1000,request:f.request});assert.equal(f.posted.filter(w=>w.action==='use').length,2);assert.equal(f.posted.filter(w=>w.action==='install').length,1);const install=f.posted.find(w=>w.action==='install');assert.equal(install.occurredAt,row.occurredAt);
 await f.r.store.record({...row,factId:'c'.repeat(64)},true);await uploadOnce(f.r,{now:now+2000,request:f.request});assert.equal(f.posted.filter(w=>w.action==='install').length,1);assert.equal(f.posted.filter(w=>w.action==='use').length,3);assert.ok(f.calls.some(c=>c.operation==='syncOnboarding'));
});
test('unbound data stays local; unlisted/ambiguous/outer-only never create an install',async t=>{
 const f=await fixture(t);await f.r.store.record(row,true);const {uploadOnce}=await load('agent/upload.mjs');assert.equal((await uploadOnce(f.r,{now,request:()=>assert.fail('usage request before consent')})).state,'withheld');
 const g=await sender(t);await g.r.store.record({...row,pluginId:'unknown@market'},true);await g.r.store.record({...row,factId:'b'.repeat(64),disposition:'ambiguous',pluginId:null,feature:null,success:null},true);await g.r.store.record({...row,factId:'c'.repeat(64),disposition:'outer-only',success:null},true);await uploadOnce(g.r,{now:now+1000,request:g.request});assert.deepEqual(g.posted,[]);
});
test('unknown install commit freezes bytes and never automatically replays or invents a later success',async t=>{
 const f=await sender(t);await f.r.store.record({...row,success:false},true);const {uploadOnce}=await load('agent/upload.mjs');let original;
 await assert.rejects(uploadOnce(f.r,{now:now+1000,request:async(o,p,i)=>{if(p==='/v2/usage/events'&&JSON.parse(i.body)[0].action==='install'){original=JSON.parse(i.body)[0];throw Error('UNKNOWN_INSTALL_COMMIT');}return f.request(o,p,i);}}),/UNKNOWN_INSTALL_COMMIT/);
 const stored=await f.r.store.installState(original.eventId);assert.equal(stored.delivery.state,'unconfirmed');assert.deepEqual(stored.wire,original);assert.equal(stored.wire.success,false);
 await uploadOnce(f.r,{now:now+2000,request:f.request});assert.equal(f.posted.length,1);await f.r.store.prune(now+31*86400000);const expired=await f.r.store.installState(original.eventId);assert.equal(expired.wire,undefined);assert.equal(expired.delivery.state,'expired');
});
test('only the exact SQLite experimental notice is filtered; genuine warnings and failures stay visible',async t=>{
 const f=await fixture(t);const {spawnSync}=await import('node:child_process');const url=pathToFileURL(join(codeRoot,'lib/agent/sender-lock.mjs')).href;
 const script=`import {agentLock} from ${JSON.stringify(url)};const done=await agentLock(${JSON.stringify(f.home)},'warning-test');await done();process.emitWarning('VISIBLE_OTHER_WARNING','ExperimentalWarning');process.stderr.write('VISIBLE_REAL_ERROR\\n');`;
 const child=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',env:{PATH:process.env.PATH,HOME:f.home}});assert.equal(child.status,0,child.stderr);assert.doesNotMatch(child.stderr,/SQLite is an experimental feature/);assert.match(child.stderr,/VISIBLE_OTHER_WARNING/);assert.match(child.stderr,/VISIBLE_REAL_ERROR/);
});
test('a historical completed withdrawal marker does not revoke an existing legacy re-grant; pending still blocks',async t=>{
 const f=await fixture(t);const {localRecordingEnabled}=await load('agent/onboarding.mjs');f.state().consent={state:'granted',authorization:'legacy-terminal',consentId:cid,changedAt:new Date(now).toISOString()};
 await writeFile(join(f.home,'withdrawal.json'),JSON.stringify({state:'sent',consentId:'22222222-2222-4222-8222-222222222222'}));assert.equal(await localRecordingEnabled(f.r),true);
 await writeFile(join(f.home,'withdrawal.json'),JSON.stringify({state:'pending',consentId:cid}));assert.equal(await localRecordingEnabled(f.r),false);
});
test('readonly status exposes preparation failure and unknown listing without claiming upload readiness',async t=>{
 const f=await fixture(t);await f.r.store.record({...row,occurredAt:new Date().toISOString()},true);f.r.senderError='CORE_UPSTREAM_UNAVAILABLE';const {status}=await load('agent/status.mjs');
 const value=await status(f.r);assert.equal(value.code,'CORE_UPSTREAM_UNAVAILABLE');assert.match(value.nextStep,/CORE_UPSTREAM_UNAVAILABLE/);assert.match(value.nextStep,/本机/);assert.equal(value.records[0].listed,null);assert.equal(value.counts.unlisted,0);assert.equal(value.counts.listingUnknown,1);
 assert.deepEqual(f.calls.map(c=>c.operation),['state']);
});
test('readonly status keeps preparation honest and reconciliation cannot reopen an explicit local close',async t=>{
 const f=await fixture(t),{status}=await load('agent/status.mjs');let preparation={code:'RUNTIME_PREPARING',phase:'publishing',startedAt:new Date().toISOString()};f.r.runtimePreparation=async()=>preparation;
 let value=await status(f.r);assert.equal(value.runtime.code,'RUNTIME_PREPARING');assert.equal(value.code,'RUNTIME_PREPARING');assert.equal(value.localCollection.enabled,false);assert.match(value.nextStep,/当前不记录/);
 f.state().consent.changedAt=new Date().toISOString();value=await status(f.r);assert.equal(value.code,'CONSENT_WITHHELD');assert.equal(value.localCollection.enabled,false);
 preparation={...preparation,code:'RUNTIME_READY',finishedAt:new Date().toISOString()};value=await status(f.r);assert.equal(value.runtime.code,'RUNTIME_READY');assert.equal(value.localCollection.enabled,false);assert.equal(value.onboarding.state,'closed');assert.equal(value.bindingLink,null);
});
test('a late Post from the preparation window is not reconstructed; a subsequent observed Pre/Post records normally',async t=>{
 const f=await fixture(t);const {spawnSync}=await import('node:child_process');const host=join(f.home,'claude'),plugin=join(f.home,'target'),core=join(f.home,'core.mjs'),shared=join(f.home,'shared');
 await mkdir(join(host,'plugins'),{recursive:true});await mkdir(plugin);await writeFile(join(plugin,'.mcp.json'),JSON.stringify({mcpServers:{probe:{command:'fixture'}}}));await writeFile(join(host,'plugins/installed_plugins.json'),JSON.stringify({plugins:{'target@market':[{installPath:plugin}]}}));await writeFile(core,`let s='';for await(const c of process.stdin)s+=c;console.log(JSON.stringify({result:${JSON.stringify(f.state())}}));`);
 const dir=join(shared,'runtime',`node-v24.13.1-darwin-${process.arch}`);await mkdir(dir,{recursive:true});await writeFile(join(dir,'prepare-state.json'),JSON.stringify({code:'RUNTIME_READY',finishedAt:new Date().toISOString()}));
 const env={HOME:f.home,PATH:process.env.PATH,HANAMESH_SHARED_HOME:shared,HANAMESH_AGENT_HOME:f.home,HANAMESH_CORE_AGENT_CLI:core,HANAMESH_AGENT_CHANNEL:'claude',CLAUDE_CONFIG_DIR:host};
 const run=(event,id)=>spawnSync(process.execPath,[join(codeRoot,'lib/agent/hook.mjs'),'--event',event],{env,input:JSON.stringify({hook_event_name:event,session_id:'fixture-window',tool_use_id:id,tool_name:'mcp__plugin_target_probe__echo',tool_response:{isError:false,content:[]}}),encoding:'utf8'});
 let p=run('PostToolUse','began-during-preparation');assert.equal(p.status,0,p.stderr);assert.equal((await f.r.store.rows()).length,0,'without a post-ready Pre, the preparation-window call is never backfilled');
 for(const event of ['PreToolUse','PostToolUse']){p=run(event,'began-after-ready');assert.equal(p.status,0,p.stderr);}const rows=await f.r.store.rows();assert.equal(rows.length,1);assert.equal(rows[0].success,true);
});
test('mcp-ready starts the original background state check without waiting for a second initialize',async t=>{
 const f=await fixture(t),{spawn}=await import('node:child_process'),core=join(f.home,'core-tick.mjs'),marker=join(f.home,'tick-observed');
 await writeFile(core,`import{writeFileSync}from'node:fs';let s='';for await(const c of process.stdin)s+=c;writeFileSync(${JSON.stringify(marker)},JSON.parse(s).input.operation);console.log(JSON.stringify({result:${JSON.stringify({...f.state(),consent:{state:'withheld',changedAt:new Date().toISOString(),consentId:null}})}}));`);
 const p=spawn(process.execPath,[join(codeRoot,'lib/agent/cli.mjs'),'mcp-ready'],{env:{HOME:f.home,PATH:process.env.PATH,HANAMESH_SHARED_HOME:f.home,HANAMESH_AGENT_HOME:f.home,HANAMESH_CORE_AGENT_CLI:core},stdio:['pipe','pipe','pipe']});p.stdout.resume();p.stderr.resume();t.after(()=>{if(p.exitCode===null)p.kill('SIGTERM');});
 const end=Date.now()+1000;let tick;while(Date.now()<end){try{tick=await readFile(marker,'utf8');break;}catch{await new Promise(r=>setTimeout(r,10));}}assert.equal(tick,'state','takeover must start the original tick without another initialize');p.stdin.end();await new Promise(resolve=>p.on('close',resolve));
});
