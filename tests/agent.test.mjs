import {agentHome} from './fixtures/agent.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {rm,readFile,readdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';

const installed=[{pluginId:'target@market',pluginName:'target',marketplace:'market',root:'/isolated/plugins/target',mcpServers:['probe'],skills:['hello']}];
test('agent projection entry exists',()=>assert.ok(existsSync(new URL('../src/agent/project.mjs',import.meta.url)),'agent projection must exist'));
test('non-JSON service errors keep their HTTP cause visible',async t=>{
 const {requestJSON}=await import('../src/agent/runtime.mjs');const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 globalThis.fetch=async()=>new Response('not JSON',{status:404});
 await assert.rejects(requestJSON('http://127.0.0.1:1','/fixture'),/AGENT_HTTP_404_UNREADABLE/);
});
test('both hosts attribute tools and skills; code mode; ambiguous servers stop attribution; only safe projection survives',async()=>{
 const {projectHook}=await import('../src/agent/project.mjs');
 const input={hook_event_name:'PostToolUse',session_id:'secret-session',tool_use_id:'call-1',tool_name:'mcp__plugin_target_probe__echo',tool_input:{secret:'sk-private',path:'/Users/private'},tool_response:{isError:false,text:'private output'},transcript_path:'/private/transcript'};
 const row=projectHook(input,'claude',installed);
 assert.equal(row.pluginId,'target@market'); assert.equal(row.feature,'mcp:echo'); assert.equal(row.success,true);
 assert.doesNotMatch(JSON.stringify(row),/sk-private|private output|Users|transcript|secret-session/);
 assert.equal(projectHook({...input,tool_name:'mcp__probe__echo'},'codex',installed).pluginId,'target@market');
 assert.equal(projectHook({...input,tool_name:'exec',tool_input:{code:'const r = await tools.mcp__probe__echo({text:"private"});text(r);'}},'codex',installed),null);
 assert.equal(projectHook({...input,tool_name:'exec',tool_input:{code:'text(`\n await tools.mcp__probe__echo({})\n`);'}},'codex',installed),null);
 assert.equal(projectHook({...input,tool_name:'mcp__probe__echo'},'codex',[...installed,{...installed[0],pluginId:'other@market'}]).disposition,'ambiguous');
 assert.equal(projectHook({...input,tool_name:'Skill',tool_input:{skill:'target:hello'}},'claude',installed).feature,'skill:hello');
 assert.equal(projectHook({...input,tool_name:'Bash',tool_input:{command:'cat /isolated/plugins/target/skills/hello/SKILL.md'}},'codex',installed).feature,'skill:hello');
 assert.equal(projectHook({...input,hook_event_name:'PostToolUseFailure'},'claude',installed).success,false);
 assert.equal(projectHook({...input,tool_name:'Read',tool_input:{file_path:'/private/transcript'}},'codex',installed),null);
});
test('parallel host environments choose the installed host, and sender ownership excludes a live process',async t=>{
 const {hostContext}=await import('../src/agent/runtime.mjs');
 const env={CODEX_HOME:'/isolated/cx',CLAUDE_CONFIG_DIR:'/isolated/cc'};
 assert.equal(hostContext(env,'/isolated/cc/plugins/cache/market/usage/1').channel,'claude');
 assert.equal(hostContext(env,'/isolated/cx/plugins/cache/market/usage/1').channel,'codex');
 const root=await agentHome(t,'hm-agent-lock-');
 const {senderLock}=await import('../src/agent/sender-lock.mjs');
 const release=await senderLock(root);assert.equal(typeof release,'function');assert.equal(await senderLock(root),null);await release();
 const recovered=await senderLock(root);assert.equal(typeof recovered,'function');await recovered();
 const child=spawn(process.execPath,['--input-type=module','-e',`import {senderLock} from ${JSON.stringify(new URL('../src/agent/sender-lock.mjs',import.meta.url).href)};await senderLock(${JSON.stringify(root)});console.log('LOCKED');setInterval(()=>{},1000);`],{stdio:['ignore','pipe','ignore']});
 t.after(()=>child.kill('SIGKILL'));
 await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);});
 assert.equal(await senderLock(root),null);const closed=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGKILL');await closed;
 const afterDeath=await senderLock(root);assert.equal(typeof afterDeath,'function');await afterDeath();
});
test('withdrawing clears local first and waits for the last sender before deleting remote',async t=>{
 const root=await agentHome(t,'hm-agent-withdraw-');
 const {AgentStore}=await import('../src/agent/store.mjs');const {senderLock}=await import('../src/agent/sender-lock.mjs');
 const {beginWithdrawal,finishWithdrawal}=await import('../src/agent/withdraw.mjs');
 const release=await senderLock(root);const calls=[];const store=new AgentStore(root);
 const r={agentHome:root,store,async call(input){calls.push(input.operation);return input.operation==='withdraw'?{deletedEvents:1,consentId:'11111111-1111-4111-8111-111111111111',state:'withdrawn',barrier:'committed'}:{consent:{state:'withheld',consentId:'11111111-1111-4111-8111-111111111111'}};}};
 assert.equal((await beginWithdrawal(r)).state,'pending');assert.deepEqual(calls,['consent']);assert.equal((await store.rows()).length,0);
 await release();assert.equal((await finishWithdrawal(r)).state,'sent');assert.deepEqual(calls,['consent','withdraw']);
});
test('DELETE acknowledgement cannot clear unknown-upload evidence or reopen consent',async t=>{
 const root=await agentHome(t,'hm-agent-withdraw-unknown-');
 const {mkdir}=await import('node:fs/promises');await mkdir(join(root,'inflight'));
 await writeFile(join(root,'inflight',`${'b'.repeat(64)}.json`),JSON.stringify({eventId:'fixture'}));
 const {AgentStore}=await import('../src/agent/store.mjs');const {beginWithdrawal}=await import('../src/agent/withdraw.mjs');
 const r={agentHome:root,store:new AgentStore(root),call:async x=>x.operation==='consent'?{consent:{state:'withheld',consentId:'11111111-1111-4111-8111-111111111111'}}:{deletedEvents:1}};
 const result=await beginWithdrawal(r);assert.equal(result.state,'pending');assert.equal(result.code,'AGENT_WITHDRAWAL_UNCONFIRMED');

 assert.equal((await readdir(join(root,'inflight'))).length,1);
});
test('outbox does not record before consent, unknown names stay local, later listing backfills inside configurable window',async t=>{
 const {AgentStore}=await import('../src/agent/store.mjs'); const root=await agentHome(t,'hm-agent-store-');
 const store=new AgentStore(root); const row={factId:'a'.repeat(64),pluginId:'target@market',feature:'mcp:echo',success:true,channel:'codex',occurredAt:'2026-10-15T10:00:00.000Z',disposition:'attributed'};
 assert.equal(await store.record(row,false),'withheld'); assert.deepEqual(await readdir(root),[]);
 await store.record(row,true);await store.record(row,true);
 assert.equal((await store.rows()).length,1);
 assert.deepEqual(await store.pending({plugins:[],settings:{backfillWindowDays:30}},Date.parse('2026-10-16T00:00:00.000Z')),[]);
 const catalog={plugins:[{hanaRef:'hana-target',channel:'codex',pluginId:'target@market'}],settings:{backfillWindowDays:30}};
 assert.equal((await store.pending(catalog,Date.parse('2026-10-16T00:00:00.000Z')))[0].hanaRef,'hana-target');
 assert.deepEqual(await store.pending(catalog,Date.parse('2026-11-16T00:00:00.000Z')),[]);
 catalog.settings.backfillWindowDays=60;assert.equal((await store.pending(catalog,Date.parse('2026-11-16T00:00:00.000Z'))).length,0,'rolling local retention caps even a wider catalog window');
 await store.withdraw();assert.equal((await store.rows()).length,0);
});
