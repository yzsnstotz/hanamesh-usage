/** Verify a prepared current Agent plugin, then drive its real hooks in isolated profiles. Actions only for this task. */
import {readFile,writeFile,mkdtemp,cp,rm} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
const plugin=resolve(process.argv[2]??'');
assert.ok(process.argv[2],'Usage: node tools/verify-agent-package.mjs <Agent029-plugin-directory>');
const receipt=JSON.parse(await readFile(join(plugin,'suite-receipt.json'))),sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(receipt.components.usage.workingTreeDirty,false);assert.equal(receipt.components.usage.version,'0.3.0-rc.18');
assert.equal(receipt.plugin.version,'0.2.9');assert.equal(receipt.components.core.version,'0.3.28');assert.equal(receipt.runtime.agentProtocolVersion,2);assert.equal(receipt.runtime.bootstrap.platforms.length,6);assert.equal(receipt.payloadSha256,sha(JSON.stringify(receipt.files)));
for(const file of receipt.files)assert.equal(sha(await readFile(join(plugin,file.path))),file.sha256,file.path);
const smoke=fileURLToPath(new URL('./agent-compat-smoke.mjs',import.meta.url));
const r=spawnSync(process.execPath,[smoke,plugin],{stdio:'inherit'});assert.equal(r.status,0,'candidate privacy smoke');
// Positive control: a consent-bypass mutation must reach the HTTP tripwire through real initialize/tick.
const root=await mkdtemp(join(tmpdir(),'hm-px4-privacy-mutant-'));
try{
 const mutant=join(root,'plugin');await cp(plugin,mutant,{recursive:true});
 const path=join(mutant,'lib/agent/upload.mjs'),source=await readFile(path,'utf8');
 const anchor="  let state=await r.call({operation:'state'});";
 assert.ok(source.includes(anchor),'mutation anchor');
 await writeFile(path,source.replace(anchor,"  await request(r.config.serverOrigin,'/v2/usage/events',{method:'POST',body:'[]'});\n"+anchor));
 const m=spawnSync(process.execPath,[smoke,mutant,dirname(plugin)],{encoding:'utf8',timeout:360000});
 assert.equal(m.status,1,'consent-bypass mutant must fail');
 assert.match(m.stderr,/usage POST before website consent/,'must fail on actual request counter, not startup');
 assert.match(m.stderr,/1 !== 0/,'loopback observed the forbidden sender POST');
 console.log('PX4_PRIVACY_MUTATION_KILLED: real MCP sender POST counted');
}finally{await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
