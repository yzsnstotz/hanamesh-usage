/** Verify a prepared current Agent plugin, then drive its real hooks in isolated profiles. Actions only for this task. */
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const plugin=resolve(process.argv[2]??'');
assert.ok(process.argv[2],'Usage: node tools/verify-agent-package.mjs <Agent029-plugin-directory>');
const receipt=JSON.parse(await readFile(join(plugin,'suite-receipt.json'))),sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(receipt.plugin.version,'0.2.9');assert.equal(receipt.components.core.version,'0.3.28');assert.equal(receipt.runtime.agentProtocolVersion,2);assert.equal(receipt.runtime.bootstrap.platforms.length,6);assert.equal(receipt.payloadSha256,sha(JSON.stringify(receipt.files)));
for(const file of receipt.files)assert.equal(sha(await readFile(join(plugin,file.path))),file.sha256,file.path);
const r=spawnSync(process.execPath,[fileURLToPath(new URL('./agent-compat-smoke.mjs',import.meta.url)),plugin],{stdio:'inherit'});process.exitCode=r.status??1;
