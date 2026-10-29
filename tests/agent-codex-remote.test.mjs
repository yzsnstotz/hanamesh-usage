import {agentHome} from './fixtures/agent.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readdir,chmod,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const agentRoot=process.env.USAGE_TEST_ROOT?pathToFileURL(join(process.env.USAGE_TEST_ROOT,'lib/agent')+'/'):new URL('../src/agent/',import.meta.url),load=name=>import(new URL(name,agentRoot));
const {remotePlugins,observeCodex}=await load('codex-remote.mjs');const {projectHook}=await load('project.mjs');const {AgentStore}=await load('store.mjs');
const id='plugin_connector_1p_95d3fixture',name='gmail';
const installed={remote_plugin_id:id,name,installed:true,enabled:true};
const payload=(call='one')=>({hook_event_name:'PostToolUse',session_id:'fixture-session',tool_call_id:call,tool_name:'mcp__gmail__search',tool_response:{content:[]}});
const fixture=t=>agentHome(t,'hm-remote-id-');
const catalog={plugins:[{channel:'codex',pluginId:'renamed@openai-curated-remote',remotePluginId:id,hanaRef:'gmail-hana'}],settings:{backfillWindowDays:30,countUnconfirmedCalls:false}};
test('remote ID and native name survive any CLI/plugin version, without a cache or connector exclusion',async t=>{
 const home=await fixture(t);for(const version of ['0.1','9.9.9-new','not-a-semver']){const {plugins}=await remotePlugins(home,{observe:async()=>({cliVersion:'future-cli',installed:[{...installed,version}]})});assert.equal(plugins.length,1);assert.deepEqual(plugins[0].remote,{remotePluginId:id,name});const row=projectHook(payload(version),'codex',plugins);assert.equal(row.success,true);assert.equal(row.remote.remotePluginId,id);}
});
test('all cached versions and changed contents keep the same remote identity',async t=>{
 const home=await fixture(t);for(const v of ['1.0','2.0']){const root=join(home,'plugins/cache/openai-curated-remote/gmail',v);await mkdir(join(root,'skills/mail'),{recursive:true});await writeFile(join(root,'skills/mail/SKILL.md'),'arbitrary different bytes '+v);}
 const {plugins}=await remotePlugins(home,{observe:async()=>({installed:[{...installed,version:'unrelated-directory-version'}]})});assert.equal(plugins.length,2);
 for(const p of plugins){const row=projectHook({...payload(p.root),tool_name:'exec_command',tool_input:{cmd:`cat ${p.root}/skills/mail/SKILL.md`},tool_response:{exit_code:0}},'codex',plugins);assert.equal(row.remote.remotePluginId,id);assert.equal(row.success,true);}
});
test('backfill maps stable ID across catalog names and versions; unlisted connector stays local',async t=>{
 const home=await fixture(t),{plugins}=await remotePlugins(home,{observe:async()=>({installed:[installed]})}),store=new AgentStore(join(home,'agent'));const row=projectHook(payload(),'codex',plugins);row.occurredAt=new Date(Date.now()-29*86400000).toISOString();await store.record(row,true);
 assert.equal((await store.eligible(catalog))[0].hanaRef,'gmail-hana');assert.equal((await store.eligible({...catalog,plugins:[...catalog.plugins,{...catalog.plugins[0],version:'another-version'}]})).length,1);assert.deepEqual(await store.eligible({...catalog,plugins:[]}),[]);assert.deepEqual((await store.rows())[0].remote,{remotePluginId:id,name});assert.equal((await readdir(store.root)).includes('call-origins'),false);await writeFile(join(store.root,'catalog.json'),JSON.stringify(catalog));const {status}=await load('status.mjs');const view=await status({agentHome:store.root,store,config:{serverOrigin:null},env:{},call:async()=>({agentProtocolVersion:2,deviceId:null,consent:{state:'withheld',changedAt:null,authorization:null}})});assert.equal(view.records[0].listed,true);assert.equal(view.records[0].remotePluginId,id);assert.equal(view.records[0].remotePluginName,name);
});
test('Google Drive connector is treated exactly like Gmail; only native disabled state excludes it',async t=>{
 const home=await fixture(t);for(const enabled of [true,false]){const {plugins}=await remotePlugins(home,{observe:async()=>({installed:[{...installed,name:'google-drive',remote_plugin_id:'plugin_connector_drive',enabled}]})});assert.equal(plugins.length,enabled?1:0);}
});
test('unrelated tools produce no plugin activity and no origin record',async t=>{
 const home=await fixture(t),s=new AgentStore(home);assert.equal(projectHook({...payload(),tool_name:'Read',tool_input:{file_path:'PRIVATE'}},'codex',[]),null);assert.equal(await s.observe({factId:'a'.repeat(64)},null,true),'unattributed');assert.deepEqual(await readdir(home),[]);
});
test('native observation issues only plugin list; no CLI version command or output version pin',async t=>{
 const home=await fixture(t),bin=join(home,'bin');await mkdir(bin);const log=join(home,'argv.json');await writeFile(join(bin,'codex'),`#!${process.execPath}\nimport{writeFileSync}from'node:fs';writeFileSync(${JSON.stringify(log)},JSON.stringify(process.argv.slice(2)));console.log(${JSON.stringify(JSON.stringify({installed:[installed]}))});\n`);await chmod(join(bin,'codex'),0o755);assert.equal((await observeCodex(home,{env:{HOME:home,PATH:bin}})).installed[0].remote_plugin_id,id);assert.deepEqual(JSON.parse(await readFile(log)),['plugin','list','--json','-m','openai-curated-remote']);
});

test('catalog refresh reads only public mapping metadata and never downloads proof or bundles',async t=>{const home=await fixture(t);const {refreshAgentCatalog}=await load('remote-catalog.mjs');const calls=[];const value={schemaVersion:1,eventProtocol:'hm-agent-v1',generatedAt:new Date().toISOString(),plugins:[{channel:'codex',hanaRef:'gmail-hana',remotePluginId:id,name:'Gmail connector'}],settings:{...catalog.settings,uploadIntervalMs:60000,catalogRefreshMs:300000}};await refreshAgentCatalog({agentHome:home,config:{serverOrigin:'http://127.0.0.1:1'}},{request:async(o,p)=>{calls.push(p);return value;}});assert.deepEqual(calls,['/v1/registry/agent-catalog']);assert.equal((await readdir(home)).includes('remote-proofs.json'),false);});
