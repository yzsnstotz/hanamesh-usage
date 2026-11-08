import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const platform=(process.platform==='win32'?'win':process.platform)+'-'+process.arch;
async function fixture(t){
 assert.equal(process.version,'v24.13.1','runtime tests use the target Node, never masquerade another version as pinned');
 const root=await mkdtemp(join(tmpdir(),'hm-agent-no-path-node-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const plugin=join(root,'plugin with spaces'),shared=join(root,'shared'),cache=join(shared,'runtime/node-v24.13.1-'+platform),relative=process.platform==='win32'?'node.exe':'bin/node';
 await mkdir(join(plugin,'lib/agent'),{recursive:true});await mkdir(join(cache,'bin'),{recursive:true});await cp('agent/bin',join(plugin,'bin'),{recursive:true});await cp('agent/.claude-plugin',join(plugin,'.claude-plugin'),{recursive:true});
 await cp(process.execPath,join(cache,relative));await writeFile(join(cache,'node.sha256'),sha(await readFile(process.execPath))+'  '+relative+'\n');await writeFile(join(cache,'archive.sha256'),JSON.parse(await readFile('agent/bin/node-runtime.json')).platforms[platform].sha256+'\n');
 await writeFile(join(plugin,'lib/agent/hook.mjs'),"console.log('HOOK_OK:'+process.version);console.log(JSON.stringify(process.argv.slice(2)))");await writeFile(join(plugin,'lib/agent/cli.mjs'),"console.log('MCP_OK:'+process.argv[2])");
 const env={...process.env,HOME:root,USERPROFILE:root,HANAMESH_SHARED_HOME:shared,CLAUDE_PLUGIN_ROOT:plugin,PLUGIN_ROOT:plugin};
 if(process.platform!=='win32')env.PATH='/usr/bin:/bin';
 return{root,plugin,cache,relative,env};
}
const launcher=(f,action)=>process.platform==='win32'?spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(f.plugin,'bin/hm-agent.ps1'),action],{env:f.env,encoding:'utf8'}):spawnSync('/bin/sh',[join(f.plugin,'bin/hm-agent'),action],{env:f.env,encoding:'utf8'});
for(const channel of ['claude','codex'])test('installed '+channel+' hooks use fixed runtime: '+platform,async t=>{
 const f=await fixture(t),hooks=JSON.parse(await readFile('agent/hooks/'+(channel==='claude'?'hooks.json':'codex.json')));
 for(const[event,rows]of Object.entries(hooks.hooks)){
  const hook=rows[0].hooks[0],started=performance.now();const r=process.platform==='win32'&&channel==='codex'?spawnSync(hook.commandWindows,{shell:true,env:f.env,input:'{}',encoding:'utf8'}):spawnSync(process.platform==='win32'?'bash':'/bin/sh',['-c',hook.command],{env:f.env,input:'{}',encoding:'utf8'});
  if(process.platform==='win32')assert.ok(performance.now()-started<10000,channel+': '+event+' actual manifest command must meet the existing Windows 10s shell budget (待追认)');
  assert.equal(r.status,0,event+': '+r.stderr);assert.match(r.stdout,/HOOK_OK:v24\.13\.1/);assert.deepEqual(JSON.parse(r.stdout.trim().split(/\r?\n/)[1]),['--event',event],channel+': '+event);
 }
});
for(const channel of ['claude','codex'])test(channel+' MCP launch uses the verified runtime',async t=>{
 const f=await fixture(t),m=JSON.parse(await readFile('agent/'+(channel==='claude'?'.mcp.json':'codex.mcp.json'))).mcpServers.hanamesh;
 const r=spawnSync(m.command,m.args.map(x=>x.replaceAll('${CLAUDE_PLUGIN_ROOT}',f.plugin)),{env:f.env,cwd:f.plugin,encoding:'utf8'});assert.equal(r.status,0,r.stderr||r.error?.message);assert.match(r.stdout,/MCP_OK:mcp/);
});
test('failed preparation never falls back to PATH; corrupt published cache is rejected',async t=>{
 const f=await fixture(t);await rm(join(f.cache,f.relative));await writeFile(join(f.cache,'prepare-state.json'),JSON.stringify({code:'RUNTIME_DOWNLOAD_FAILED',phase:'failed',attemptCount:1}));
 let r=launcher(f,'hook');assert.equal(r.status,0,r.stderr);assert.doesNotMatch(r.stdout,/HOOK_OK/);assert.equal(JSON.parse(await readFile(join(f.cache,'prepare-state.json'))).code,'RUNTIME_DOWNLOAD_FAILED');
 await cp(process.execPath,join(f.cache,f.relative));await writeFile(join(f.cache,'node.sha256'),'0'.repeat(64)+'  '+f.relative+'\n');r=launcher(f,'hook');assert.notEqual(r.status,0);assert.match(r.stderr,/HANAMESH_NODE_RUNTIME_CHECKSUM_MISMATCH/);assert.doesNotMatch(r.stdout,/HOOK_OK/);
});
test('manifest channels declare only documented events and Windows override',async()=>{
 const c=JSON.parse(await readFile('agent/.codex-plugin/plugin.json'));assert.equal(c.hooks,'./hooks/codex.json');assert.equal(c.extensions,undefined);
 const h=JSON.parse(await readFile('agent/hooks/codex.json'));assert.deepEqual(Object.keys(h.hooks),['SessionStart','PostToolUse','PreToolUse']);
 for(const rows of Object.values(h.hooks))assert.match(rows[0].hooks[0].commandWindows,/powershell.exe/);
});
