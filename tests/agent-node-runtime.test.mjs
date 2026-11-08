import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const platform=(process.platform==='win32'?'win':process.platform)+'-'+process.arch;
const digests={'darwin-arm64':'8c039d59f2fec6195e4281ad5b0d02b9a940897b4df7b849c6fb48be6787bba6','darwin-x64':'527f0578d9812e7dfa225121bda0b1546a6a0e4b5f556295fc8299c272de5fbf','linux-arm64':'4873459d7c9b28feaa1f0fade9bb9c81cb702670991ff80a51d805325c5e3456','linux-x64':'7ad28fb172a9ab0593f86c1a39e5c268d0d8fc3d6cb0167f455b5655a7a6e2fd','win-arm64':'0cd29eeb64f3c649db2c4c868779ca277f5a4c49e26c69e5928d01fe0ae06da8','win-x64':'fba577c4bb87df04d54dd87bbdaa5a2272f1f99a2acbf9152e1a91b8b5f0b279'};
async function fixture(t){
 assert.equal(process.version,'v24.13.1','runtime tests use the target Node, never masquerade another version as pinned');
 const root=await mkdtemp(join(tmpdir(),'hm-agent-no-path-node-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const plugin=join(root,'plugin with spaces'),shared=join(root,'shared'),cache=join(shared,'runtime/node-v24.13.1-'+platform),relative=process.platform==='win32'?'node.exe':'bin/node';
 await mkdir(join(plugin,'lib/agent'),{recursive:true});await mkdir(join(cache,'bin'),{recursive:true});await cp('agent/bin',join(plugin,'bin'),{recursive:true});
 await cp(process.execPath,join(cache,relative));await writeFile(join(cache,'node.sha256'),sha(await readFile(process.execPath))+'  '+relative+'\n');await writeFile(join(cache,'archive.sha256'),digests[platform]+'\n');
 await writeFile(join(plugin,'lib/agent/hook.mjs'),"console.log('HOOK_OK:'+process.version)");await writeFile(join(plugin,'lib/agent/cli.mjs'),"console.log('MCP_OK:'+process.argv[2])");
 const env={...process.env,HOME:root,USERPROFILE:root,HANAMESH_SHARED_HOME:shared,CLAUDE_PLUGIN_ROOT:plugin,PLUGIN_ROOT:plugin};
 if(process.platform!=='win32')env.PATH='/usr/bin:/bin';
 return{root,plugin,cache,relative,env};
}
const launcher=(f,action)=>process.platform==='win32'?spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(f.plugin,'bin/hm-agent.ps1'),action],{env:f.env,encoding:'utf8'}):spawnSync('/bin/sh',[join(f.plugin,'bin/hm-agent'),action],{env:f.env,encoding:'utf8'});
for(const channel of ['claude','codex'])test('installed '+channel+' hooks use fixed runtime: '+platform,async t=>{
 const f=await fixture(t),hooks=JSON.parse(await readFile('agent/hooks/'+(channel==='claude'?'hooks.json':'codex.json')));
 for(const[event,rows]of Object.entries(hooks.hooks)){
  const hook=rows[0].hooks[0];const r=process.platform==='win32'&&channel==='codex'?spawnSync('cmd.exe',['/d','/s','/c',hook.commandWindows],{env:f.env,input:'{}',encoding:'utf8'}):spawnSync(process.platform==='win32'?'bash':'/bin/sh',['-c',hook.command],{env:f.env,input:'{}',encoding:'utf8'});
  assert.equal(r.status,0,event+': '+r.stderr);assert.match(r.stdout,/HOOK_OK:v24\.13\.1/);
 }
});
for(const channel of ['claude','codex'])test(channel+' MCP launch uses the verified runtime',async t=>{
 const f=await fixture(t),m=JSON.parse(await readFile('agent/'+(channel==='claude'?'.mcp.json':'codex.mcp.json'))).mcpServers.hanamesh;
 const r=spawnSync(m.command,m.args.map(x=>x.replaceAll('${CLAUDE_PLUGIN_ROOT}',f.plugin)),{env:f.env,cwd:f.plugin,encoding:'utf8'});assert.equal(r.status,0,r.stderr||r.error?.message);assert.match(r.stdout,/MCP_OK:mcp/);
});
test('missing/corrupt runtime never falls back to PATH',async t=>{
 const f=await fixture(t);await rm(join(f.cache,f.relative));let r=launcher(f,'hook');assert.notEqual(r.status,0);assert.match(r.stderr,/HANAMESH_NODE_RUNTIME_REQUIRED/);
 await cp(process.execPath,join(f.cache,f.relative));await writeFile(join(f.cache,'node.sha256'),'0'.repeat(64)+'  '+f.relative+'\n');r=launcher(f,'hook');assert.notEqual(r.status,0);assert.match(r.stderr,/HANAMESH_NODE_RUNTIME_CHECKSUM_MISMATCH/);assert.doesNotMatch(r.stdout,/HOOK_OK/);
});
test('manifest channels declare only documented events and Windows override',async()=>{
 const c=JSON.parse(await readFile('agent/.codex-plugin/plugin.json'));assert.equal(c.hooks,'./hooks/codex.json');assert.equal(c.extensions,undefined);
 const h=JSON.parse(await readFile('agent/hooks/codex.json'));assert.deepEqual(Object.keys(h.hooks),['SessionStart','PostToolUse','PreToolUse']);
 for(const rows of Object.values(h.hooks))assert.match(rows[0].hooks[0].commandWindows,/powershell.exe/);
});
