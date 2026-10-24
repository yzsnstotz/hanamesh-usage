import test from 'node:test';import assert from 'node:assert/strict';import {readFile,mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
test('agent manifests expose one suite and forward only the four nonsecret MCP isolation variables',async()=>{
 const a=JSON.parse(await readFile('agent/.claude-plugin/plugin.json')),b=JSON.parse(await readFile('agent/.codex-plugin/plugin.json')),m=JSON.parse(await readFile('agent/.mcp.json'));
 assert.equal(a.name,'hanamesh');assert.equal(b.name,a.name);assert.equal(a.version,b.version);assert.deepEqual(Object.keys(m.mcpServers),['hanamesh']);
 assert.deepEqual(m.mcpServers.hanamesh.env_vars,['HANAMESH_SHARED_HOME','HANAMESH_AGENT_HOME','HANAMESH_AGENT_CHANNEL','CODEX_HOME']);
});
test('packed suite includes Core CLI import closure and byte anchored component receipt',async t=>{
 const root=await mkdtemp(join(tmpdir(),'hm-suite-package-test-'));t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(join(root,'package/lib/suite'),{recursive:true});
 await writeFile(join(root,'package/package.json'),JSON.stringify({name:'hanamesh-core',version:'0.3.14',type:'module'}));await writeFile(join(root,'package/LICENSE'),'fixture-license');
 for(const name of ['agent-cli','agent','shared-device','device','errors','validation','contracts','transport','registration','bind-link','suite/facts'])await writeFile(join(root,'package/lib',name+'.js'),'// fixture-'+name);
 await writeFile(join(root,'package/lib/shared-device.js'),"export {bindingAvailable} from './bind-link.js';\n");
 await writeFile(join(root,'package/lib/bind-link.js'),"export const bindingAvailable = true;\n");
 const tar=join(root,'core.tgz'),out=join(root,'suite');assert.equal(spawnSync('/usr/bin/tar',['-czf',tar,'-C',root,'package']).status,0);
 const result=spawnSync(process.execPath,['tools/package-agent.mjs',tar,out],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 const loaded=spawnSync(process.execPath,['--input-type=module','-e',`const core=await import(${JSON.stringify(join(out,'runtime/core/lib/shared-device.js'))}); if(core.bindingAvailable!==true)process.exit(1);`],{encoding:'utf8'});
 assert.equal(loaded.status,0,loaded.stderr);
 const receipt=JSON.parse(await readFile(join(out,'suite-receipt.json')));assert.equal(receipt.identityKind,'composite-artifact');assert.equal(receipt.plugin.name,'hanamesh');assert.equal(receipt.components.core.tarballSha256,sha(await readFile(tar)));assert.match(receipt.components.usage.sourceRevision,/^[a-f0-9]{40}$/);assert.equal(receipt.payloadSha256,sha(JSON.stringify(receipt.files)));
 for(const file of receipt.files)assert.equal(sha(await readFile(join(out,file.path))),file.sha256);
 assert.equal(await readFile(join(out,'runtime/core/lib/suite/facts.js'),'utf8'),'// fixture-suite/facts');assert.ok(receipt.files.some(f=>f.path==='lib/agent/project.mjs'));
 assert.notEqual(spawnSync(process.execPath,['tools/package-agent.mjs',tar,out],{encoding:'utf8'}).status,0,'existing output must not be merged or deleted');
});
