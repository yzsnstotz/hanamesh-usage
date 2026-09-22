import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('U04 package is the standalone hanamesh-usage DSH bundle', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.name, 'hanamesh-usage');
  assert.equal(pkg.version, '0.2.0-rc.7');
  assert.deepEqual(pkg.dsh, { bundle: { patch: './profile/cordis.patch.yml' } });
  assert.equal(pkg.files.includes('profile'), true);
  assert.equal(pkg.dsh.client, undefined);
  assert.deepEqual(pkg.dependencies ?? {}, {});
  assert.deepEqual(
    Object.keys(pkg.peerDependencies).filter(name => name.startsWith('@hanamesh/') || name.startsWith('hanamesh-')),
    [],
  );
});

test('U04 bundle patch inserts exactly one hanamesh-usage loader row', () => {
  const patch = read('profile/cordis.patch.yml');
  assert.equal((patch.match(/^\s*- id:/gm) ?? []).length, 1);
  assert.match(patch, /^\s*- id: hanamesh-usage$/m);
  assert.match(patch, /^\s*name: hanamesh-usage$/m);
});

test('U02 runtime-registry is absent from package, source, vendor and contract inventory', () => {
  const pkg = JSON.parse(read('package.json'));
  const legacyPackage = ['@hanamesh/dsh-agent', 'registry'].join('-');
  const legacyPattern = new RegExp([
    ['dsh-agent', 'registry'].join('-'),
    ['HanaMeshAgent', 'Registry'].join(''),
    ['PINNED_REGISTRY', 'REQUIRED'].join('_'),
  ].join('|'));
  assert.equal(pkg.peerDependencies[legacyPackage], undefined);
  assert.equal(pkg.devDependencies[legacyPackage], undefined);
  assert.doesNotMatch(read('src/host/index.js'), legacyPattern);
  assert.equal(existsSync(new URL('../docs/contracts/runtime-registry', import.meta.url)), false);
  assert.equal(existsSync(new URL(`../vendor/${['hanamesh-dsh-agent','registry-0.1.0-rc.3.tgz'].join('-')}`, import.meta.url)), false);
});
