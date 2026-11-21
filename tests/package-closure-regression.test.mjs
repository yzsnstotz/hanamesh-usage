import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readdir, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {nodeToolSync} from '../tools/node-tool.mjs';
import {checkTarball} from '../scripts/verify-pack-closure.mjs';

test('PKG1 actual Usage tarball contains the functioning native helper and its product assets', async t => {
  const root = await mkdtemp(join(tmpdir(), 'usage-packed-helper-'));
  t.after(() => rm(root, {recursive:true, force:true}));
  // Build is the normal prerequisite of this package test, just as for agent-suite.
  const packed = nodeToolSync('npm', ['pack','--ignore-scripts','--pack-destination',root], {encoding:'utf8'});
  assert.equal(packed.status,0,packed.stderr);
  const files = (await readdir(root)).filter(name => name.endsWith('.tgz'));
  assert.equal(files.length,1);
  const archive = join(root,files[0]);
  const closure = await checkTarball(archive);
  assert.deepEqual(closure.failures,[]);
  assert.ok(closure.files > 2, 'the production build, not just tools, must be packed');
  const tar = process.platform === 'win32' ? join(process.env.SystemRoot,'System32/tar.exe') : 'tar';
  const unpacked = spawnSync(tar,['-xzf',archive,'-C',root],{encoding:'utf8'});
  assert.equal(unpacked.status,0,unpacked.stderr);
  const {verifyNativeHelper} = await import(pathToFileURL(join(root,'package/tools/native-helper.mjs')));
  const record = verifyNativeHelper();
  assert.equal(record.schemaVersion,1);
  assert.equal(record.architecture,'AnyCPU');
});
