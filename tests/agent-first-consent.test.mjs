import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {root as implementationRoot} from './fixtures/helpers.mjs';

async function fixture(t,consent={state:'withheld',changedAt:null,consentId:null}) {
 const root=await mkdtemp(join(tmpdir(),'hm-first-consent-中文 '));t.after(()=>rm(root,{recursive:true,force:true}));
 const core=join(root,'core.mjs');
 const cid='11111111-1111-4111-8111-111111111111';
 await writeFile(core,`let text='';for await(const c of process.stdin)text+=c;const q=JSON.parse(text);console.log(JSON.stringify({result:q.input.operation==='state'?{agentProtocolVersion:2,agentOriginProtocolVersion:1,deviceId:null,consent:${JSON.stringify(consent)}}:q.input.operation==='prepareOnboarding'?{url:'https://market.hanamesh.com/me/bind?flow=agent',expiresAt:'2026-10-28T20:00:00.000Z',consentId:'${cid}',deviceId:'A'.repeat(43)}:{consent:{state:q.input.state}}}));`);
 const env={PATH:process.env.PATH,HOME:root,TMPDIR:root,HANAMESH_CORE_AGENT_CLI:core,HANAMESH_SHARED_HOME:join(root,'shared'),HANAMESH_AGENT_HOME:join(root,'agent'),HANAMESH_AGENT_CHANNEL:'claude',CLAUDE_CONFIG_DIR:join(root,'claude')};
 const run=(event,extra={})=>spawnSync(process.execPath,[join(implementationRoot,'lib/agent/hook.mjs'),'--event',event],{env:{...env,...extra},input:JSON.stringify({hook_event_name:event,session_id:'fixture-new-session',source:'startup'}),encoding:'utf8'});
 return {root,env,run};
}
test('explicitly closed tool hooks are silent and do not create collection state',async t=>{
 const f=await fixture(t,{state:'withheld',changedAt:'2026-10-17T00:00:00.000Z',consentId:null});
 for(const event of ['PreToolUse','PostToolUse','PostToolUseFailure']) {const r=f.run(event);assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,'');assert.equal(r.stderr,'');}
 assert.deepEqual((await readdir(f.root)).sort(),['core.mjs']);
});
test('SessionStart explains automatic local recording and website action without terminal grant',async t=>{
 const f=await fixture(t);const r=f.run('SessionStart');assert.equal(r.status,0,r.stderr);
 assert.match(r.stdout,/^\{"systemMessage":/);const message=JSON.parse(r.stdout).systemMessage;assert.match(message,/已开启本机/);assert.match(message,/贡献积分.*作者收入/);assert.match(message,/插件、功能、时间、成败与渠道/);assert.match(message,/不保存对话.*工具输入输出正文.*文件.*凭据/);assert.match(message,/随时禁用/);assert.match(message,/同意并绑定/);assert.match(message,/https:\/\/market.hanamesh.com\/me\/bind/);assert.doesNotMatch(message,/agree|终端执行|默认关闭|RAW TOOL/);
});
test('prior explicit refusal or withdrawal and prior grant never prompt',async t=>{
 for(const state of ['withheld','granted']) {const f=await fixture(t,{state,changedAt:'2026-10-17T00:00:00.000Z',consentId:'11111111-1111-4111-8111-111111111111',authorization:state==='granted'?'website':null});const r=f.run('SessionStart');assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,'');}
});
test('all registered hooks carry a fixed control event independent from stdin',async()=>{
 const h=JSON.parse(await readFile('agent/hooks/hooks.json'));
 for(const [event,groups] of Object.entries(h.hooks))assert.match(groups[0].hooks[0].command,new RegExp('--event '+event));
});
test('legacy agree alias retains the real withdrawal barrier and is not the new onboarding path',async t=>{
 const f=await fixture(t,{state:'granted',authorization:'legacy-terminal',changedAt:'2026-10-17T00:00:00.000Z',consentId:'11111111-1111-4111-8111-111111111111'});const r=spawnSync(process.execPath,[join(implementationRoot,'lib/agent/cli.mjs'),'agree'],{env:f.env,encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).consent.state,'granted');
 await writeFile(join(f.env.HANAMESH_AGENT_HOME,'withdrawal.json'),JSON.stringify({state:'pending'}));
 const blocked=spawnSync(process.execPath,[join(implementationRoot,'lib/agent/cli.mjs'),'agree'],{env:f.env,encoding:'utf8'});assert.equal(blocked.status,1);assert.match(blocked.stderr,/WITHDRAWAL_PENDING/);
});
test('first notice persists emitted metadata daily per shared root/channel; no usage queue or identity',async t=>{
 const f=await fixture(t);const first=f.run('SessionStart');assert.equal(first.status,0,first.stderr);assert.ok(first.stdout);
 assert.equal(f.run('SessionStart').stdout,'');
 const codex=f.run('SessionStart',{HANAMESH_AGENT_CHANNEL:'codex',CODEX_HOME:join(f.root,'codex')});assert.equal(codex.status,0,codex.stderr);assert.ok(codex.stdout);
 const other=f.run('SessionStart',{CLAUDE_CONFIG_DIR:join(f.root,'other-claude')});assert.equal(other.status,0,other.stderr);assert.equal(other.stdout,'');
 const {symlink}=await import('node:fs/promises');await mkdir(f.env.CLAUDE_CONFIG_DIR);await symlink(f.env.CLAUDE_CONFIG_DIR,join(f.root,'claude-alias'));
 assert.equal(f.run('SessionStart',{CLAUDE_CONFIG_DIR:join(f.root,'claude-alias')}).stdout,'');
 const names=await readdir(join(f.env.HANAMESH_AGENT_HOME,'notices'));const markers=names.filter(n=>n.endsWith('.json'));assert.equal(markers.length,2);
 for(const name of markers){const value=JSON.parse(await readFile(join(f.env.HANAMESH_AGENT_HOME,'notices',name)));assert.equal(value.state,'emitted');assert.equal(value.shown,undefined);assert.equal(value.consent,undefined);}
 assert.ok(!(await readdir(f.env.HANAMESH_AGENT_HOME)).includes('events'));
});
test('output failure leaves no emitted marker and never changes consent',async t=>{
 const f=await fixture(t);const {runtime}=await import(new URL('file://'+join(implementationRoot,'lib/agent/runtime.mjs')));const {firstConsentNotice}=await import(new URL('file://'+join(implementationRoot,'lib/agent/notice.mjs')));
 const r=await runtime(f.env);await assert.rejects(firstConsentNotice(r,async()=>{throw new Error('AGENT_NOTICE_OUTPUT_FAILED');},{payload:{session_id:'fixture-new-session',source:'startup'}}),/AGENT_NOTICE_OUTPUT_FAILED/);
 assert.equal((await readdir(join(f.env.HANAMESH_AGENT_HOME,'notices'))).filter(n=>n.endsWith('.json')).length,0);
 let count=0;assert.equal(await firstConsentNotice(r,async()=>{count++;},{payload:{session_id:'fixture-new-session',source:'startup'}}),true);assert.equal(count,1);
});
test('concurrent SessionStart processes emit only once',async t=>{
 const f=await fixture(t);const {spawn}=await import('node:child_process');
 const run=()=>new Promise((ok,bad)=>{const child=spawn(process.execPath,[join(implementationRoot,'lib/agent/hook.mjs'),'--event','SessionStart'],{env:f.env,stdio:['pipe','pipe','pipe']});child.stdin.end(JSON.stringify({hook_event_name:'SessionStart',session_id:'fixture-new-session',source:'startup'}));let stdout='',stderr='';child.stdout.on('data',c=>stdout+=c);child.stderr.on('data',c=>stderr+=c);child.on('error',bad);child.on('close',status=>ok({stdout,stderr,status}));});
 const results=await Promise.all([run(),run(),run()]);for(const r of results)assert.equal(r.status,0,r.stderr);assert.equal(results.filter(r=>r.stdout).length,1);
});
test('stdout callback failure still consumes the following stream error',async()=>{
 const {EventEmitter}=await import('node:events');const {writeNotice}=await import(new URL('file://'+join(implementationRoot,'lib/agent/notice.mjs')));
 const stream=new EventEmitter();stream.write=(_data,callback)=>callback(new Error('fixture-output'));
 await assert.rejects(writeNotice('notice',stream),/AGENT_NOTICE_OUTPUT_FAILED/);
 assert.equal(stream.listenerCount('error'),1);stream.emit('error',new Error('fixture-output'));assert.equal(stream.listenerCount('error'),0);
});
test('a default Codex installation uses its actual Codex channel and profile without an exported CODEX_HOME',async()=>{
 const {hostContext}=await import(new URL('file://'+join(implementationRoot,'lib/agent/runtime.mjs')));const {homedir}=await import('node:os');
 const context=hostContext({},'/fixture/.codex/plugins/cache/market/hanamesh/0.1.1');assert.equal(context.channel,'codex');assert.equal(context.home,join(homedir(),'.codex'));
});
