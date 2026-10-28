import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readFile,symlink,chmod,cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,generateKeyPairSync,sign,verify} from 'node:crypto';
import {installedPlugins} from '../src/agent/inventory.mjs';
import {validateCatalog} from '../src/agent/catalog.mjs';
import {projectHook} from '../src/agent/project.mjs';
import {AgentStore} from '../src/agent/store.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const blob=b=>createHash('sha1').update(`blob ${Buffer.byteLength(b)}\0`).update(b).digest('hex');
const remoteId='Plugin_00000000-0000-4000-8000-000000000001';
const id='demo@openai-curated-remote',version='1.1.0-exp-homepage';
const manifest=JSON.stringify({name:'demo',version,description:'Public fixture'});
const content={'.codex-plugin/plugin.json':manifest,'skills/hello/SKILL.md':'# Public fixture\n'};
const files=Object.entries(content).sort(([a],[b])=>a<b?-1:1).map(([path,data])=>({path,mode:'100644',sha256:sha(data),blobSha:blob(data)}));
const contentSha256=sha(JSON.stringify(files.map(f=>[f.path,f.mode,f.sha256])));
const entry={hanaRef:'11111111-1111-4111-8111-111111111111',githubRepo:'fixture/repo',channel:'codex',pluginName:'demo',marketplace:'openai-curated-remote',pluginId:id,mcpServers:[],skills:['hello'],remote:{remotePluginId:remoteId,version,bundleSha256:'b'.repeat(64),contentSha256}};
const settings={uploadIntervalMs:60000,catalogRefreshMs:300000,backfillWindowDays:30,countUnconfirmedCalls:true};
const catalog={schemaVersion:1,eventProtocol:'hm-agent-v1',generatedAt:'2026-10-29T00:00:00.000Z',settings,plugins:[entry]};
const payload={hook_event_name:'PostToolUse',tool_name:'Skill',tool_input:{skill:'demo:hello'},tool_response:{isError:false},session_id:'isolated',tool_use_id:'call'};
async function fixture(t){
 const home=await mkdtemp(join(tmpdir(),'hm-codex-remote-'));t.after(()=>rm(home,{recursive:true,force:true}));
 const base=join(home,'plugins/cache/openai-curated-remote/demo'),root=join(base,version);
 for(const [path,data] of Object.entries(content)){await mkdir(join(root,path,'..'),{recursive:true});await writeFile(join(root,path),data);}
 await writeFile(join(base,'.codex-remote-plugin-install.json'),JSON.stringify({schema_version:1,remote_plugin_id:remoteId}));
 const state={cliVersion:'0.165.0',installed:[{pluginId:id,name:'demo',marketplaceName:'openai-curated-remote',version,installed:true,enabled:true,source:{source:'remote',id:remoteId}}]};
 const proof={...entry.remote,pluginId:id,files,manifest};
 const options={remote:{catalog,proofs:{[id]:proof},observe:async()=>state}};
 return {home,base,root,state,proof,options};
}
test('remote marker plus official enabled version and fixed content identifies a plugin without config.toml',async t=>{
 const f=await fixture(t);const rows=await installedPlugins('codex',f.home,f.options);
 assert.equal(rows.length,1,'enabled remote installation must not depend on a config.toml table');
 assert.equal(rows[0].pluginId,id);assert.equal(rows[0].remote.verified,true);assert.equal(rows[0].remote.contentSha256,contentSha256);
 const row=projectHook({hook_event_name:'PostToolUse',tool_name:'Skill',tool_input:{skill:'demo:hello'},tool_response:{isError:false},session_id:'isolated',tool_use_id:'call'},'codex',rows);
 assert.equal(row.pluginId,id);assert.equal(row.success,true);assert.equal(row.remote.verified,true);
});
test('catalog rejects invalid remote identity while retaining local schema compatibility',()=>{
 for(const remote of [{...entry.remote,version:'../bad'},{...entry.remote,contentSha256:null},{...entry.remote,remotePluginId:''}])assert.throws(()=>validateCatalog({...catalog,plugins:[{...entry,remote}]}),/AGENT_CATALOG_INVALID/);
 assert.equal(validateCatalog(catalog),catalog);
});

test('disabled, unknown schema, wrong id/version and ambiguous native rows never become installations',async t=>{
 for(const variant of ['disabled','schema','id','version','duplicate','unknown-cli','unreadable','source-shape']){
  const f=await fixture(t),diagnostics=[];
  if(variant==='disabled')f.state.installed[0].enabled=false;
  if(variant==='schema')await writeFile(join(f.base,'.codex-remote-plugin-install.json'),JSON.stringify({schema_version:2,remote_plugin_id:remoteId}));
  if(variant==='id')f.state.installed[0].source.id='different';
  if(variant==='version'){f.state.installed[0].version='0.2.8';await cp(f.root,join(f.base,'0.2.8'),{recursive:true});}
  if(variant==='duplicate')f.state.installed.push({...f.state.installed[0]});
  if(variant==='unknown-cli')f.state.cliVersion='0.166.0';
  if(variant==='unreadable')await rm(join(f.base,'.codex-remote-plugin-install.json'));
  if(variant==='source-shape')f.state.installed[0].source={source:'remote',remote:{id:remoteId}};
  assert.deepEqual(await installedPlugins('codex',f.home,{...f.options,diagnostics}),[],variant);
  assert.equal(diagnostics.length,1,variant);assert.match(diagnostics[0].code,/^AGENT_CODEX_REMOTE_/);
 }
});
test('config entry never bypasses remote state; CLI failure leaves ordinary local inventory working',async t=>{
 const f=await fixture(t),local=join(f.home,'plugins/cache/local/demo/1.0.0');await mkdir(join(local,'skills/hello'),{recursive:true});
 await writeFile(join(f.home,'config.toml'),'[plugins."demo@local"]\nenabled = true\n[plugins."demo@openai-curated-remote"]\nenabled = true\n');
 const diagnostics=[];const rows=await installedPlugins('codex',f.home,{diagnostics,remote:{...f.options.remote,observe:async()=>{throw Error('credential text must not escape');}}});
 assert.deepEqual(rows.map(p=>p.pluginId),['demo@local']);assert.equal(diagnostics[0].code,'AGENT_CODEX_REMOTE_STATE_UNAVAILABLE');assert.doesNotMatch(JSON.stringify(diagnostics),/credential text/);
});
test('native version selection is authoritative even with older/newer cache directories',async t=>{
 const f=await fixture(t);await mkdir(join(f.base,'9.9.9'));await mkdir(join(f.base,'0.2.8'));
 assert.equal((await installedPlugins('codex',f.home,f.options))[0].root,f.root);
});
test('unknown content remains local and is never uploaded even when unknown outcomes are allowed',async t=>{
 const f=await fixture(t);await writeFile(join(f.root,'skills/hello/SKILL.md'),'changed');const diagnostics=[];
 const rows=await installedPlugins('codex',f.home,{...f.options,diagnostics});assert.equal(rows[0].remote.verified,false);
 const row=projectHook(payload,'codex',rows);assert.equal(row.success,null);assert.equal(row.disposition,'unverified');
 const store=new AgentStore(join(f.home,'agent'));await store.record(row,true);
 assert.deepEqual(await store.eligible(catalog),[]);assert.equal((await store.rows()).length,1);
 assert.equal(diagnostics[0].code,'AGENT_CODEX_REMOTE_CONTENT_MISMATCH');
});
test('static whitelist rejects symlinks, extra user files and JSON value changes without reading their content',async t=>{
 for(const variant of ['link','extra','json']){
  const f=await fixture(t),diagnostics=[];
  if(variant==='link'){await rm(join(f.root,'skills/hello/SKILL.md'));await symlink('/not-readable/owner-auth.json',join(f.root,'skills/hello/SKILL.md'));}
  if(variant==='extra')await writeFile(join(f.root,'.env'),'MUST_NOT_BE_READ');
  if(variant==='json')await writeFile(join(f.root,'.codex-plugin/plugin.json'),JSON.stringify({...JSON.parse(manifest),description:'changed'}));
  const rows=await installedPlugins('codex',f.home,{...f.options,diagnostics});assert.equal(rows.every(r=>r.remote.verified===false),true,variant);assert.equal(diagnostics.length,1,variant);
  assert.doesNotMatch(JSON.stringify(diagnostics),/owner-auth|MUST_NOT_BE_READ/);
 }
});
function publicSource(){
 const source={source:'codex-remote',repo:entry.githubRepo,ref:'a'.repeat(40),tree:'c'.repeat(40),path:'plugins/demo',remotePluginId:remoteId,bundleSha256:entry.remote.bundleSha256,contentSha256};
 const registration={...entry,installation:{version,source}};delete registration.remote;
 const requests=[];
 const request=async(origin,path)=>{
  requests.push([origin,path]);
  if(path.startsWith('/v1/registry/agent-catalog'))return catalog;
  if(path.startsWith('/v1/registry/agent-plugins?'))return {schemaVersion:1,plugins:[registration]};
  assert.equal(origin,'https://api.github.com');
  if(path.includes('/trees/'))return {sha:'d'.repeat(40),truncated:false,tree:[{path:'plugins/demo',type:'tree',sha:source.tree},...files.map(f=>({path:'plugins/demo/'+f.path,sha:f.blobSha,mode:f.mode,type:'blob',size:Buffer.byteLength(content[f.path])}))]};
  const file=files.find(f=>path.endsWith('/'+f.blobSha));assert.ok(file,path);return {sha:file.blobSha,encoding:'base64',content:Buffer.from(content[file.path]).toString('base64')};
 };return {registration,request,requests};
}
test('public fixed Git proof validates complete bytes/modes and only permits exact known manifest formatting',async t=>{
 const {createRemoteProof,formattedManifest}=await import('../src/agent/remote-proof.mjs');
 const f=await fixture(t),s=publicSource(),proof=await createRemoteProof(entry,s.registration,{request:s.request});
 assert.equal(proof.contentSha256,contentSha256);assert.deepEqual(proof.files.map(f=>f.path),files.map(f=>f.path));
 await writeFile(join(f.root,'.codex-plugin/plugin.json'),formattedManifest(JSON.parse(manifest)));
 f.options.remote.proofs[id]=proof;assert.equal((await installedPlugins('codex',f.home,f.options))[0].remote.verified,true);
 await assert.rejects(createRemoteProof({...entry,remote:{...entry.remote,contentSha256:'e'.repeat(64)}},s.registration,{request:s.request}),/PROOF_INVALID/);
 await assert.rejects(createRemoteProof(entry,s.registration,{request:async(o,p)=>p.includes('/trees/')?{truncated:true}:s.request(o,p)}),/PROOF_INVALID/);
 await assert.rejects(createRemoteProof(entry,s.registration,{request:async(o,p)=>{const v=await s.request(o,p);if(p.includes('/trees/'))v.tree.find(f=>f.type==='blob').mode='100755';return v;}}),/PROOF_INVALID/);
});
test('public preparation works before upload consent and caches proof, no registration or usage request',async t=>{
 const {refreshAgentCatalog}=await import('../src/agent/remote-catalog.mjs');const f=await fixture(t),s=publicSource();
 const r={agentHome:join(f.home,'agent'),config:{serverOrigin:'http://127.0.0.1:1'},call:()=>assert.fail('Core operation during public reads')};
 await refreshAgentCatalog(r,{request:s.request});const proofs=JSON.parse(await readFile(join(r.agentHome,'remote-proofs.json')));assert.equal(proofs[id].contentSha256,contentSha256);
 const n=s.requests.length;await refreshAgentCatalog(r,{request:s.request});assert.equal(s.requests.length,n);
 assert.ok(s.requests.every(([,path])=>!path.includes('/usage/')&&!path.includes('/consents/')));
});
test('verified remote facts use the existing minimal signed wire; id/digests never leave the local store',async t=>{
 const {uploadOnce}=await import('../lib/agent/upload.mjs');const f=await fixture(t),rows=await installedPlugins('codex',f.home,f.options);
 const {agentSigningJSON}=await import('../lib/core/agent-event.js');const {publicKey,privateKey}=generateKeyPairSync('ed25519');
 const store=new AgentStore(join(f.home,'agent')),row=projectHook(payload,'codex',rows);await store.record(row,true);const posted=[];
 const consentId='11111111-1111-4111-8111-111111111111';
 const r={agentHome:store.root,store,config:{serverOrigin:'http://127.0.0.1:1'},cachedCatalog:{value:catalog,fetchedAt:Date.now()},call:async input=>input.operation==='state'?{deviceId:'A'.repeat(43),consent:{state:'granted',authorization:'website',consentId}}:input.operation==='sign'?{signature:sign(null,Buffer.from(input.bytes,'base64'),privateKey).toString('base64url')}:{}};
 await uploadOnce(r,{request:async(o,p,i)=>{assert.equal(p,'/v2/usage/events');posted.push(...JSON.parse(i.body));return {durability:'committed',accepted:1,duplicates:0,rejected:[]};}});
 assert.deepEqual(posted.map(p=>p.action).sort(),['install','use']);assert.ok(posted.every(p=>p.hanaRef===entry.hanaRef&&p.channel==='codex'));
 assert.deepEqual(Object.keys(posted[0]),['deviceId','hanaRef','action','occurredAt','eventId','nonce','channel','feature','success','signature']);
 assert.ok(posted.every(p=>verify(null,Buffer.from(agentSigningJSON(p)),publicKey,Buffer.from(p.signature,'base64url'))));
 assert.doesNotMatch(JSON.stringify(posted),/remotePluginId|bundleSha|contentSha|openai-curated-remote|plugins\/cache/);
 assert.equal((await store.eligible({...catalog,plugins:[{...entry,remote:{...entry.remote,version:'2.0.0'}}]})).length,0);
});
test('verified observations backfill only unchanged listed identity inside the existing retention window',async t=>{
 const f=await fixture(t),rows=await installedPlugins('codex',f.home,f.options),store=new AgentStore(join(f.home,'agent'));
 const now=Date.now(),row=projectHook(payload,'codex',rows,now-86400000);await store.record(row,true);
 assert.equal((await store.pending({...catalog,plugins:[]},now)).length,0);
 assert.equal((await store.pending(catalog,now)).length,1);
 assert.equal((await store.pending({...catalog,settings:{...settings,backfillWindowDays:0}},now)).length,0);
 assert.equal((await store.pending({...catalog,plugins:[{...entry,remote:{...entry.remote,remotePluginId:'changed'}}]},now)).length,0);
});
test('native CLI observer uses only version and read-only installed list in the explicit isolated CODEX_HOME',async t=>{
 const {observeCodex}=await import('../src/agent/codex-remote.mjs');const f=await fixture(t),bin=join(f.home,'bin');await mkdir(bin);
 const code=`#!${process.execPath}\nimport fs from 'node:fs';\nif(process.env.CODEX_HOME!==${JSON.stringify(f.home)})process.exit(9);\nfs.appendFileSync(${JSON.stringify(join(f.home,'argv.jsonl'))},JSON.stringify(process.argv.slice(2))+'\\n');\nif(process.argv[2]==='--version')process.stdout.write('codex-cli 0.165.0\\n');else process.stdout.write(${JSON.stringify(JSON.stringify({installed:f.state.installed,available:[]}))});\n`;
 await writeFile(join(bin,'codex'),code);await chmod(join(bin,'codex'),0o755);
 const state=await observeCodex(f.home,{env:{PATH:bin,HOME:f.home}});assert.equal(state.cliVersion,'0.165.0');assert.equal(state.installed[0].source.id,remoteId);
 assert.deepEqual((await readFile(join(f.home,'argv.jsonl'),'utf8')).trim().split('\n').map(JSON.parse),[['--version'],['plugin','list','--json','-m','openai-curated-remote']]);
});
